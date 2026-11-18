-- =============================================================
-- 0026 — Document self-service progress
-- The document creator, the sender and admins update progress; the
-- "document manager" role is gone.
--   * can_update_document(uuid): admin, creator or sender of the document.
--   * can_manage_documents() is redefined as admin only. RLS policies
--     (0017) and the guard trigger (0019) keep calling it unchanged, so
--     creators still edit/delete their own rows via created_by = auth.uid().
--   * doc_send, doc_set_route, doc_forward, doc_return, doc_resend and
--     doc_finish_early check can_update_document(). Bodies are copied from
--     0018/0019/0023; only the permission check changed (and doc_set_route
--     no longer requires a draft for the creator).
-- profiles.is_doc_manager stays in place but is no longer used.
--
-- Idempotent. Run manually in the Supabase SQL Editor after 0025.
-- =============================================================

-- ---------- Permission helpers ----------
-- Admin only (was admin or is_doc_manager).
create or replace function public.can_manage_documents()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (
      select p.role = 'admin'
      from public.profiles p
      where p.id = auth.uid()
    ),
    false
  );
$$;

-- Admin, creator or sender of the document.
create or replace function public.can_update_document(p_document_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and (
       public.can_manage_documents()
       or exists (
         select 1
         from public.documents d
         where d.id = p_document_id
           and (
             d.created_by is not distinct from auth.uid()
             or d.sender_id is not distinct from auth.uid()
           )
       )
     );
$$;

revoke all on function public.can_update_document(uuid) from public, anon;
grant execute on function public.can_update_document(uuid) to authenticated;

-- ---------- Send ----------
create or replace function public.doc_send(
  p_document_id uuid,
  p_note text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_doc public.documents;
  v_step public.document_steps;
  v_now timestamptz := now();
  v_undo jsonb;
begin
  if not public.can_update_document(p_document_id) then
    raise exception 'Chỉ người tạo, người gửi hoặc quản trị viên mới được thực hiện thao tác này.'
      using errcode = '42501';
  end if;

  select * into v_doc
  from public.documents
  where id = p_document_id
  for update;

  if not found then
    raise exception 'Không tìm thấy hồ sơ.' using errcode = 'P0002';
  end if;

  if v_doc.finished_at is not null then
    raise exception 'Hồ sơ đã hoàn thành.' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.document_steps s
    where s.document_id = p_document_id
      and s.received_at is not null
  ) then
    raise exception 'Hồ sơ đã được gửi đi.' using errcode = 'P0001';
  end if;

  v_step := public.doc_current_step(p_document_id);

  if v_step.id is null then
    raise exception 'Hãy thêm ít nhất một bước vào lộ trình trước khi gửi.'
      using errcode = 'P0001';
  end if;

  v_undo := jsonb_build_object(
    'finished_at', v_doc.finished_at,
    'steps', public.doc_step_snapshot(array[v_step.id]),
    'deleted_steps', '[]'::jsonb
  );

  update public.document_steps
  set received_at = v_now
  where id = v_step.id;

  perform public.doc_log_event(
    p_document_id,
    'send',
    v_step.step_order,
    v_step.department,
    null,
    p_note,
    null,
    v_undo,
    null
  );
end;
$$;

-- ---------- Forward ----------
create or replace function public.doc_forward(
  p_document_id uuid,
  p_step_id uuid,
  p_handler_name text default null,
  p_note text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_doc public.documents;
  v_step public.document_steps;
  v_next public.document_steps;
  v_now timestamptz := now();
  v_undo jsonb;
  v_step_ids uuid[];
begin
  if not public.can_update_document(p_document_id) then
    raise exception 'Chỉ người tạo, người gửi hoặc quản trị viên mới được thực hiện thao tác này.'
      using errcode = '42501';
  end if;

  select * into v_doc
  from public.documents
  where id = p_document_id
  for update;

  if not found then
    raise exception 'Không tìm thấy hồ sơ.' using errcode = 'P0002';
  end if;

  if v_doc.finished_at is not null then
    raise exception 'Hồ sơ đã hoàn thành.' using errcode = 'P0001';
  end if;

  if public.doc_route_done(p_document_id) then
    raise exception 'Lộ trình đã xong, hồ sơ đang trả về người gửi.'
      using errcode = 'P0001';
  end if;

  v_step := public.doc_current_step(p_document_id);

  if v_step.id is null or v_step.received_at is null then
    raise exception 'Hồ sơ chưa được gửi đi.' using errcode = 'P0001';
  end if;

  perform public.doc_assert_current(v_step.id, p_step_id);

  if v_step.returned_at is not null then
    raise exception 'Hồ sơ đang chờ bổ sung, hãy gửi lại trước.'
      using errcode = 'P0001';
  end if;

  select * into v_next
  from public.document_steps
  where document_id = p_document_id
    and done_at is null
    and step_order > v_step.step_order
  order by step_order
  limit 1;

  v_step_ids := array[v_step.id];
  if v_next.id is not null then
    v_step_ids := v_step_ids || v_next.id;
  end if;

  v_undo := jsonb_build_object(
    'finished_at', v_doc.finished_at,
    'steps', public.doc_step_snapshot(v_step_ids),
    'deleted_steps', '[]'::jsonb
  );

  update public.document_steps
  set done_at = v_now,
      handler_name = p_handler_name,
      note = p_note
  where id = v_step.id;

  if v_next.id is not null then
    update public.document_steps
    set received_at = v_now
    where id = v_next.id;
  end if;

  perform public.doc_log_event(
    p_document_id,
    'forward',
    v_step.step_order,
    v_step.department,
    p_handler_name,
    p_note,
    jsonb_build_object('route_done', (v_next.id is null)),
    v_undo,
    null
  );
end;
$$;

-- ---------- Resend ----------
create or replace function public.doc_resend(
  p_document_id uuid,
  p_step_id uuid,
  p_note text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_doc public.documents;
  v_step public.document_steps;
  v_now timestamptz := now();
  v_undo jsonb;
begin
  if not public.can_update_document(p_document_id) then
    raise exception 'Chỉ người tạo, người gửi hoặc quản trị viên mới được thực hiện thao tác này.'
      using errcode = '42501';
  end if;

  select * into v_doc
  from public.documents
  where id = p_document_id
  for update;

  if not found then
    raise exception 'Không tìm thấy hồ sơ.' using errcode = 'P0002';
  end if;

  if v_doc.finished_at is not null then
    raise exception 'Hồ sơ đã hoàn thành.' using errcode = 'P0001';
  end if;

  v_step := public.doc_current_step(p_document_id);

  if v_step.id is null
     or v_step.received_at is null
     or v_step.returned_at is null then
    raise exception 'Hồ sơ không ở trạng thái chờ bổ sung.'
      using errcode = 'P0001';
  end if;

  perform public.doc_assert_current(v_step.id, p_step_id);

  v_undo := jsonb_build_object(
    'finished_at', v_doc.finished_at,
    'steps', public.doc_step_snapshot(array[v_step.id]),
    'deleted_steps', '[]'::jsonb
  );

  update public.document_steps
  set received_at = v_now,
      returned_at = null,
      note = p_note
  where id = v_step.id;

  perform public.doc_log_event(
    p_document_id,
    'resend',
    v_step.step_order,
    v_step.department,
    null,
    p_note,
    null,
    v_undo,
    null
  );
end;
$$;

-- ---------- Finish early ----------
create or replace function public.doc_finish_early(
  p_document_id uuid,
  p_step_id uuid,
  p_handler_name text default null,
  p_note text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_doc public.documents;
  v_step public.document_steps;
  v_now timestamptz := now();
  v_deleted jsonb;
  v_undo jsonb;
begin
  if not public.can_update_document(p_document_id) then
    raise exception 'Chỉ người tạo, người gửi hoặc quản trị viên mới được thực hiện thao tác này.'
      using errcode = '42501';
  end if;

  select * into v_doc
  from public.documents
  where id = p_document_id
  for update;

  if not found then
    raise exception 'Không tìm thấy hồ sơ.' using errcode = 'P0002';
  end if;

  if v_doc.finished_at is not null then
    raise exception 'Hồ sơ đã hoàn thành.' using errcode = 'P0001';
  end if;

  if public.doc_route_done(p_document_id) then
    raise exception 'Lộ trình đã xong, hồ sơ đang trả về người gửi.'
      using errcode = 'P0001';
  end if;

  v_step := public.doc_current_step(p_document_id);

  if v_step.id is null or v_step.received_at is null then
    raise exception 'Hồ sơ chưa được gửi đi.' using errcode = 'P0001';
  end if;

  perform public.doc_assert_current(v_step.id, p_step_id);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'step_order', s.step_order,
        'department', s.department,
        'received_at', s.received_at,
        'done_at', s.done_at,
        'returned_at', s.returned_at,
        'handler_name', s.handler_name,
        'note', s.note,
        'created_at', s.created_at
      )
      order by s.step_order
    ),
    '[]'::jsonb
  )
    into v_deleted
  from public.document_steps s
  where s.document_id = p_document_id
    and s.received_at is null;

  v_undo := jsonb_build_object(
    'finished_at', v_doc.finished_at,
    'steps', public.doc_step_snapshot(array[v_step.id]),
    'deleted_steps', v_deleted
  );

  update public.document_steps
  set done_at = v_now,
      returned_at = null,
      handler_name = p_handler_name,
      note = p_note
  where id = v_step.id;

  delete from public.document_steps
  where document_id = p_document_id
    and received_at is null;

  perform public.doc_log_event(
    p_document_id,
    'finish_early',
    v_step.step_order,
    v_step.department,
    p_handler_name,
    p_note,
    jsonb_build_object('dropped_steps', jsonb_array_length(v_deleted)),
    v_undo,
    null
  );
end;
$$;

-- ---------- Return ----------
create or replace function public.doc_return(
  p_document_id uuid,
  p_step_id uuid,
  p_reason text
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_doc public.documents;
  v_step public.document_steps;
  v_now timestamptz := now();
  v_undo jsonb;
begin
  if not public.can_update_document(p_document_id) then
    raise exception 'Chỉ người tạo, người gửi hoặc quản trị viên mới được thực hiện thao tác này.'
      using errcode = '42501';
  end if;

  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'Vui lòng nhập lý do trả lại.' using errcode = 'P0001';
  end if;

  select * into v_doc
  from public.documents
  where id = p_document_id
  for update;

  if not found then
    raise exception 'Không tìm thấy hồ sơ.' using errcode = 'P0002';
  end if;

  if v_doc.finished_at is not null then
    raise exception 'Hồ sơ đã hoàn thành.' using errcode = 'P0001';
  end if;

  if public.doc_route_done(p_document_id) then
    raise exception 'Lộ trình đã xong, hồ sơ đang trả về người gửi.'
      using errcode = 'P0001';
  end if;

  v_step := public.doc_current_step(p_document_id);

  if v_step.id is null or v_step.received_at is null then
    raise exception 'Hồ sơ chưa được gửi đi.' using errcode = 'P0001';
  end if;

  perform public.doc_assert_current(v_step.id, p_step_id);

  if v_step.returned_at is not null then
    raise exception 'Hồ sơ đã được trả lại, đang chờ bổ sung.'
      using errcode = 'P0001';
  end if;

  v_undo := jsonb_build_object(
    'finished_at', v_doc.finished_at,
    'steps', public.doc_step_snapshot(array[v_step.id]),
    'deleted_steps', '[]'::jsonb
  );

  update public.document_steps
  set returned_at = v_now,
      note = btrim(p_reason)
  where id = v_step.id;

  perform public.doc_log_event(
    p_document_id,
    'return',
    v_step.step_order,
    v_step.department,
    null,
    btrim(p_reason),
    null,
    v_undo,
    null
  );
end;
$$;

-- ---------- Route edit ----------
-- Any allowed actor may edit the route while it is open (0023 limited the
-- creator to drafts).
create or replace function public.doc_set_route(
  p_document_id uuid,
  p_departments text[]
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_doc public.documents;
  v_locked text[];
  v_locked_count int;
  v_total int;
  v_index int;
begin
  select * into v_doc
  from public.documents
  where id = p_document_id
  for update;

  if not found then
    raise exception 'Không tìm thấy hồ sơ.' using errcode = 'P0002';
  end if;

  if not public.can_update_document(p_document_id) then
    raise exception 'Chỉ người tạo, người gửi hoặc quản trị viên mới được thực hiện thao tác này.'
      using errcode = '42501';
  end if;

  if v_doc.finished_at is not null then
    raise exception 'Hồ sơ đã hoàn thành, không thể sửa lộ trình.'
      using errcode = 'P0001';
  end if;

  if public.doc_route_done(p_document_id) then
    raise exception 'Lộ trình đã xong, không thể sửa.' using errcode = 'P0001';
  end if;

  p_departments := coalesce(p_departments, '{}');

  select coalesce(array_agg(s.department order by s.step_order), '{}')
    into v_locked
  from public.document_steps s
  where s.document_id = p_document_id
    and s.received_at is not null;

  v_locked_count := coalesce(array_length(v_locked, 1), 0);
  v_total := coalesce(array_length(p_departments, 1), 0);

  if v_total < v_locked_count
     or p_departments[1:v_locked_count] is distinct from v_locked then
    raise exception 'Không thể xoá, đổi thứ tự hoặc đổi phòng ban của bước đã tới.'
      using errcode = 'P0001';
  end if;

  for v_index in 1..v_total loop
    if p_departments[v_index] is null
       or length(btrim(p_departments[v_index])) = 0 then
      raise exception 'Bước trong lộ trình phải có phòng ban.'
        using errcode = 'P0001';
    end if;
  end loop;

  delete from public.document_steps
  where document_id = p_document_id
    and received_at is null;

  for v_index in (v_locked_count + 1)..v_total loop
    insert into public.document_steps (document_id, step_order, department)
    values (p_document_id, v_index, btrim(p_departments[v_index]));
  end loop;

  perform public.doc_log_event(
    p_document_id,
    'route',
    null,
    null,
    null,
    null,
    jsonb_build_object('departments', to_jsonb(p_departments)),
    null,
    null
  );
end;
$$;

-- Grants from 0018 are kept by create or replace.

-- =============================================================
-- Verification (run on dev in the SQL Editor; everything is rolled back).
-- Replace the four uuids with: a plain member who created a draft document
-- with at least one route step (:creator), the document's sender
-- (:sender, a different member), an unrelated member (:other) and an admin
-- (:admin); :doc is the document id.
--
-- begin;
--   set local role authenticated;
--
--   -- creator: allowed
--   select set_config('request.jwt.claims', json_build_object('sub', ':creator')::text, true);
--   select public.can_update_document(':doc');   -- expect true
--   select public.doc_send(':doc', null);         -- expect ok
--
--   -- sender: allowed
--   select set_config('request.jwt.claims', json_build_object('sub', ':sender')::text, true);
--   select public.can_update_document(':doc');   -- expect true
--   select public.doc_forward(':doc', (select id from public.doc_current_step(':doc')), null, null); -- ok
--
--   -- unrelated member: rejected (42501)
--   select set_config('request.jwt.claims', json_build_object('sub', ':other')::text, true);
--   select public.can_update_document(':doc');   -- expect false
--   select public.doc_send(':doc', null);         -- expect error 42501
--
--   -- admin: allowed
--   select set_config('request.jwt.claims', json_build_object('sub', ':admin')::text, true);
--   select public.can_update_document(':doc');   -- expect true
--   select public.can_manage_documents();         -- expect true
-- rollback;
-- =============================================================
