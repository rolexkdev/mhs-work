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

-- ---------- Direct completion ----------
-- New event action: the existing list (0022) plus 'complete'.
alter table public.document_events
  drop constraint if exists document_events_action_check;
alter table public.document_events
  add constraint document_events_action_check check (
    action in (
      'created',
      'edit',
      'route',
      'send',
      'forward',
      'return',
      'resend',
      'finish_early',
      'receive_back',
      'hand_over',
      'sender_confirm',
      'report_missing',
      'complete'
    )
  );

-- Finishes a document whose route is done (Chờ nhận lại) without the
-- hand-back. Undo restores finished_at from the snapshot, so doc_undo
-- needs no separate branch: it only has to select 'complete' events.
create or replace function public.doc_complete(
  p_document_id uuid,
  p_note text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_doc public.documents;
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

  -- Only in Chờ nhận lại: route done, not received back yet.
  if not public.doc_route_done(p_document_id)
     or v_doc.received_back_at is not null then
    raise exception 'Hồ sơ vừa được cập nhật, vui lòng tải lại rồi thử lại.'
      using errcode = 'P0001';
  end if;

  v_undo := public.doc_handback_snapshot(v_doc);

  perform set_config('app.doc_rpc', 'on', true);

  update public.documents
  set finished_at = now()
  where id = p_document_id;

  perform public.doc_log_event(
    p_document_id, 'complete', null, null, null, p_note, null, v_undo, null
  );
end;
$$;

revoke all on function public.doc_complete(uuid, text) from public, anon, authenticated;
grant execute on function public.doc_complete(uuid, text) to authenticated;

-- ---------- Hand-back and undo ----------
-- Same bodies as 0019/0020/0022; only the permission check changed (and
-- doc_undo also selects 'complete' events).

create or replace function public.doc_receive_back(
  p_document_id uuid,
  p_note text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_doc public.documents;
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

  if not public.doc_route_done(p_document_id) then
    raise exception 'Hồ sơ chưa đi hết lộ trình.' using errcode = 'P0001';
  end if;

  if v_doc.received_back_at is not null then
    raise exception 'Hồ sơ vừa được cập nhật, vui lòng tải lại rồi thử lại.'
      using errcode = 'P0001';
  end if;

  v_undo := public.doc_handback_snapshot(v_doc);

  perform set_config('app.doc_rpc', 'on', true);

  update public.documents
  set received_back_at = now()
  where id = p_document_id;

  perform public.doc_log_event(
    p_document_id, 'receive_back', null, null, null, p_note, null, v_undo, null
  );
end;
$$;

create or replace function public.doc_hand_over(
  p_document_id uuid,
  p_note text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_doc public.documents;
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

  if v_doc.received_back_at is null or v_doc.handed_over_at is not null then
    raise exception 'Hồ sơ vừa được cập nhật, vui lòng tải lại rồi thử lại.'
      using errcode = 'P0001';
  end if;

  v_undo := public.doc_handback_snapshot(v_doc);

  perform set_config('app.doc_rpc', 'on', true);

  update public.documents
  set handed_over_at = now()
  where id = p_document_id;

  perform public.doc_log_event(
    p_document_id, 'hand_over', null, null, null, p_note, null, v_undo, null
  );
end;
$$;

create or replace function public.doc_report_missing(
  p_document_id uuid,
  p_reason text
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_doc public.documents;
  v_last public.document_steps;
  v_undo jsonb;
begin
  if not public.can_update_document(p_document_id) then
    raise exception 'Chỉ người tạo, người gửi hoặc quản trị viên mới được thực hiện thao tác này.'
      using errcode = '42501';
  end if;

  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'Vui lòng nhập nội dung còn thiếu.' using errcode = 'P0001';
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

  -- Only between the end of the route and the hand-over.
  if not public.doc_route_done(p_document_id)
     or v_doc.handed_over_at is not null then
    raise exception 'Hồ sơ vừa được cập nhật, vui lòng tải lại rồi thử lại.'
      using errcode = 'P0001';
  end if;

  select * into v_last
  from public.document_steps
  where document_id = p_document_id
  order by step_order desc
  limit 1;

  v_undo := public.doc_handback_snapshot(v_doc)
    || jsonb_build_object('steps', public.doc_step_snapshot(array[v_last.id]));

  perform set_config('app.doc_rpc', 'on', true);

  -- Reopen the last step as returned: status becomes Cần bổ sung.
  update public.document_steps
  set done_at = null,
      returned_at = now(),
      note = btrim(p_reason)
  where id = v_last.id;

  update public.documents
  set received_back_at = null
  where id = p_document_id;

  perform public.doc_log_event(
    p_document_id,
    'report_missing',
    v_last.step_order,
    v_last.department,
    null,
    btrim(p_reason),
    jsonb_build_object('received_back', v_doc.received_back_at is not null),
    v_undo,
    null
  );
end;
$$;

create or replace function public.doc_undo(
  p_document_id uuid,
  p_event_id uuid
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_doc public.documents;
  v_event public.document_events;
  v_step jsonb;
  v_deleted jsonb;
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

  select * into v_event
  from public.document_events e
  where e.document_id = p_document_id
    and e.action in (
      'send',
      'forward',
      'return',
      'resend',
      'finish_early',
      'receive_back',
      'hand_over',
      'sender_confirm',
      'report_missing',
      'complete'
    )
  order by e.created_at desc, e.id desc
  limit 1;

  if v_event.id is null then
    raise exception 'Không còn thao tác nào để hoàn tác.' using errcode = 'P0001';
  end if;

  perform public.doc_assert_current(v_event.id, p_event_id);

  if v_event.undo_data is null then
    raise exception 'Thao tác này không thể hoàn tác.' using errcode = 'P0001';
  end if;

  perform set_config('app.doc_rpc', 'on', true);

  update public.documents
  set finished_at = (v_event.undo_data ->> 'finished_at')::timestamptz,
      received_back_at = (v_event.undo_data ->> 'received_back_at')::timestamptz,
      handed_over_at = (v_event.undo_data ->> 'handed_over_at')::timestamptz,
      sender_confirmed_at = (v_event.undo_data ->> 'sender_confirmed_at')::timestamptz,
      sender_confirmed_by = (v_event.undo_data ->> 'sender_confirmed_by')::uuid
  where id = p_document_id;

  for v_step in
    select *
    from jsonb_array_elements(coalesce(v_event.undo_data -> 'steps', '[]'::jsonb))
  loop
    update public.document_steps
    set received_at = (v_step ->> 'received_at')::timestamptz,
        done_at = (v_step ->> 'done_at')::timestamptz,
        returned_at = (v_step ->> 'returned_at')::timestamptz,
        handler_name = v_step ->> 'handler_name',
        note = v_step ->> 'note'
    where id = (v_step ->> 'id')::uuid;
  end loop;

  for v_deleted in
    select *
    from jsonb_array_elements(coalesce(v_event.undo_data -> 'deleted_steps', '[]'::jsonb))
  loop
    insert into public.document_steps (
      id,
      document_id,
      step_order,
      department,
      received_at,
      done_at,
      returned_at,
      handler_name,
      note,
      created_at
    )
    values (
      (v_deleted ->> 'id')::uuid,
      p_document_id,
      (v_deleted ->> 'step_order')::int,
      v_deleted ->> 'department',
      (v_deleted ->> 'received_at')::timestamptz,
      (v_deleted ->> 'done_at')::timestamptz,
      (v_deleted ->> 'returned_at')::timestamptz,
      v_deleted ->> 'handler_name',
      v_deleted ->> 'note',
      coalesce((v_deleted ->> 'created_at')::timestamptz, now())
    )
    on conflict (id) do update
    set received_at = excluded.received_at,
        done_at = excluded.done_at,
        returned_at = excluded.returned_at,
        handler_name = excluded.handler_name,
        note = excluded.note;
  end loop;

  delete from public.document_events where id = v_event.id;
end;
$$;

-- Sender, creator or admin confirms receipt; on_behalf is set when the
-- actor is not the sender.
create or replace function public.doc_sender_confirm(
  p_document_id uuid,
  p_note text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_doc public.documents;
  v_undo jsonb;
  v_now timestamptz := now();
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
    raise exception 'Hồ sơ đã hoàn thành.' using errcode = 'P0001';
  end if;

  if v_doc.handed_over_at is null then
    raise exception 'Hồ sơ vừa được cập nhật, vui lòng tải lại rồi thử lại.'
      using errcode = 'P0001';
  end if;

  v_undo := public.doc_handback_snapshot(v_doc);

  perform set_config('app.doc_rpc', 'on', true);

  update public.documents
  set sender_confirmed_at = v_now,
      sender_confirmed_by = auth.uid(),
      finished_at = v_now
  where id = p_document_id;

  perform public.doc_log_event(
    p_document_id,
    'sender_confirm',
    null,
    null,
    null,
    p_note,
    jsonb_build_object('on_behalf', v_doc.sender_id is distinct from auth.uid()),
    v_undo,
    null
  );
end;
$$;

-- Grants from 0018/0019/0020/0022 are kept by create or replace.

-- =============================================================
-- Verification (run on dev in the SQL Editor; everything is rolled back).
-- Replace the placeholders ':creator', ':sender', ':other', ':admin' and
-- ':doc' (including the leading colon, keep the quotes) with real uuids:
-- a plain member who created a draft document with at least two route
-- steps (:creator), the document's sender (:sender, a different member),
-- an unrelated member (:other), an admin (:admin) and the document id (:doc).
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
--   select public.doc_forward(
--     ':doc',
--     (select s.id from public.document_steps s
--       where s.document_id = ':doc' and s.received_at is not null and s.done_at is null
--       order by s.step_order limit 1),
--     null, null);                                -- expect ok
--
--   -- unrelated member: rejected (42501), caught so the transaction goes on
--   select set_config('request.jwt.claims', json_build_object('sub', ':other')::text, true);
--   select public.can_update_document(':doc');   -- expect false
--   do $$ begin
--     perform public.doc_send(':doc', null);
--     raise exception 'expected 42501';
--   exception when insufficient_privilege then null;
--   end $$;
--
--   -- admin: allowed (real write path)
--   select set_config('request.jwt.claims', json_build_object('sub', ':admin')::text, true);
--   select public.can_update_document(':doc');   -- expect true
--   select public.can_manage_documents();         -- expect true
--   select public.doc_return(
--     ':doc',
--     (select s.id from public.document_steps s
--       where s.document_id = ':doc' and s.received_at is not null and s.done_at is null
--       order by s.step_order limit 1),
--     'verification');                            -- expect ok
-- rollback;
--
-- Step 2 scenario. Events written in one transaction share created_at, so
-- doc_undo's "latest event" is only well defined when each action is its
-- own transaction. Use a document created by a non-admin :creator who is
-- not the sender, with every step done (status Chờ nhận lại); :doc2 is its
-- id, :other is an unrelated member.
--
-- Transaction A. COMMITS: this writes dev data, run on dev only.
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims', json_build_object('sub', ':creator')::text, true);
--   select public.doc_receive_back(':doc2', null);      -- ok
-- commit;
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims', json_build_object('sub', ':creator')::text, true);
--   select public.doc_hand_over(':doc2', null);         -- ok
-- commit;
--
-- Transaction B. Rolled back.
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims', json_build_object('sub', ':creator')::text, true);
--   select public.doc_sender_confirm(':doc2', null);    -- ok
--   select finished_at is not null from public.documents where id = ':doc2';  -- expect true
--   select payload ->> 'on_behalf' from public.document_events
--     where document_id = ':doc2' and action = 'sender_confirm';              -- expect 'true'
--   select public.doc_undo(':doc2', (select id from public.document_events
--     where document_id = ':doc2' and action = 'sender_confirm'));            -- ok
--   select finished_at is null and handed_over_at is not null
--     from public.documents where id = ':doc2';         -- expect true (back at awaiting sender)
--
--   select set_config('request.jwt.claims', json_build_object('sub', ':other')::text, true);
--   do $$ begin
--     perform public.doc_sender_confirm(':doc2', null);
--     raise exception 'expected 42501';
--   exception when insufficient_privilege then null;
--   end $$;
--   do $$ begin
--     perform public.doc_undo(':doc2', (select id from public.document_events
--       where document_id = ':doc2' order by created_at desc, id desc limit 1));
--     raise exception 'expected 42501';
--   exception when insufficient_privilege then null;
--   end $$;
-- rollback;
--
-- Transaction C (optional). Rolled back: the real sender confirms.
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims', json_build_object('sub', ':sender')::text, true);
--   select public.doc_sender_confirm(':doc2', null);    -- ok
--   select payload ->> 'on_behalf' from public.document_events
--     where document_id = ':doc2' and action = 'sender_confirm';              -- expect 'false'
-- rollback;
--
-- Step 3 scenario (direct completion). Same rules as step 2: one event per
-- transaction. Use a non-admin :creator's document :doc3 with every step done
-- (status Chờ nhận lại), :other an unrelated member.
--
-- Transaction A. Rolled back: rejected for an unrelated member.
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims', json_build_object('sub', ':other')::text, true);
--   do $$ begin
--     perform public.doc_complete(':doc3', null);
--     raise exception 'expected 42501';
--   exception when insufficient_privilege then null;
--   end $$;
-- rollback;
--
-- Transaction B. Rolled back: complete, then undo.
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims', json_build_object('sub', ':creator')::text, true);
--   select public.doc_complete(':doc3', 'done');         -- ok
--   select finished_at is not null from public.documents where id = ':doc3';  -- expect true
--   select count(*) from public.document_events
--     where document_id = ':doc3' and action = 'complete';                    -- expect 1
--   select public.doc_undo(':doc3', (select id from public.document_events
--     where document_id = ':doc3' and action = 'complete'));                  -- ok
--   select finished_at is null and received_back_at is null
--     from public.documents where id = ':doc3';          -- expect true (Chờ nhận lại)
-- rollback;
--
-- Transaction C. COMMITS (dev only): move :doc3 to Đã nhận lại.
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims', json_build_object('sub', ':creator')::text, true);
--   select public.doc_receive_back(':doc3', null);       -- ok
-- commit;
--
-- Transaction D. Rolled back: rejected once received back.
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims', json_build_object('sub', ':creator')::text, true);
--   do $$ begin
--     perform public.doc_complete(':doc3', null);
--     raise exception 'expected P0001';
--   exception when raise_exception then null;
--   end $$;
-- rollback;
-- =============================================================
