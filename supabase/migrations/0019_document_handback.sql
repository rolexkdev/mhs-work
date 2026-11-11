-- =============================================================
-- 0019 — Document hand-back to sender
-- After the route is done the paper document comes back to KCN and is
-- handed to the sender, who confirms receipt:
--   Chờ nhận lại       -> route done, received_back_at null
--   Đã nhận lại        -> received_back_at set, handed_over_at null
--   Chờ người gửi nhận -> handed_over_at set, finished_at null
--   Hoàn thành         -> finished_at set (by doc_sender_confirm)
--
-- Progress RPCs set the transaction-local flag app.doc_rpc = 'on' so the
-- guard trigger lets them write progress columns even when the caller is
-- the sender rather than a document manager.
--
-- Idempotent. Run manually in the Supabase SQL Editor after 0018.
-- =============================================================

-- ---------- Columns ----------
alter table public.documents
  add column if not exists received_back_at timestamptz,
  add column if not exists handed_over_at timestamptz,
  add column if not exists sender_confirmed_at timestamptz,
  add column if not exists sender_confirmed_by uuid
    references public.profiles (id) on delete set null;

-- ---------- Event actions ----------
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
      'undo',
      'receive_back',
      'hand_over',
      'sender_confirm'
    )
  );

-- ---------- Guard ----------
-- True inside a progress RPC (flag set with set_config(..., true)).
create or replace function public.doc_in_rpc()
returns boolean
language sql stable as $$
  select coalesce(current_setting('app.doc_rpc', true), '') = 'on';
$$;

-- Same rules as 0017, extended to the hand-back columns. Progress
-- columns may change only through the RPCs, or by a document manager.
create or replace function public.guard_document_protected_columns()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_allowed boolean :=
    auth.uid() is null
    or public.doc_in_rpc()
    or public.can_manage_documents();
begin
  if tg_op = 'INSERT' then
    if (
         new.finished_at is not null
         or new.received_back_at is not null
         or new.handed_over_at is not null
         or new.sender_confirmed_at is not null
         or new.sender_confirmed_by is not null
       )
       and not v_allowed then
      raise exception 'Only document managers may change document progress.'
        using errcode = '42501';
    end if;

    return new;
  end if;

  if new.id is distinct from old.id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Document id, creator and creation time cannot be changed.'
      using errcode = '42501';
  end if;

  if (
       new.finished_at is distinct from old.finished_at
       or new.received_back_at is distinct from old.received_back_at
       or new.handed_over_at is distinct from old.handed_over_at
       or new.sender_confirmed_at is distinct from old.sender_confirmed_at
       or new.sender_confirmed_by is distinct from old.sender_confirmed_by
     )
     and not v_allowed then
    raise exception 'Only document managers may change document progress.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_documents_guard on public.documents;
create trigger trg_documents_guard
  before insert or update on public.documents
  for each row execute function public.guard_document_protected_columns();

-- ---------- Helpers ----------
-- True once every step of a non-empty route is done.
create or replace function public.doc_route_done(p_document_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
           select 1 from public.document_steps s
           where s.document_id = p_document_id
         )
     and not exists (
           select 1 from public.document_steps s
           where s.document_id = p_document_id
             and s.done_at is null
         );
$$;

revoke all on function public.doc_route_done(uuid) from public, anon, authenticated;
revoke all on function public.doc_in_rpc() from public, anon, authenticated;

-- ---------- End of route ----------
-- Same as 0018, but the route can no longer change once it is done.
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
  if not public.can_manage_documents() then
    raise exception 'Chỉ quản lý hồ sơ mới được sửa lộ trình.'
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

-- Same as 0018, but the last step no longer finishes the document: it
-- moves to Chờ nhận lại instead.
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
  if not public.can_manage_documents() then
    raise exception 'Chỉ quản lý hồ sơ mới được thực hiện thao tác này.'
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

-- Same as 0018, but the document moves to Chờ nhận lại instead of
-- finishing.
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
  if not public.can_manage_documents() then
    raise exception 'Chỉ quản lý hồ sơ mới được thực hiện thao tác này.'
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

-- ---------- Hand-back ----------
-- Undo snapshot of the document-level progress columns.
create or replace function public.doc_handback_snapshot(p_doc public.documents)
returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'finished_at', p_doc.finished_at,
    'received_back_at', p_doc.received_back_at,
    'handed_over_at', p_doc.handed_over_at,
    'sender_confirmed_at', p_doc.sender_confirmed_at,
    'sender_confirmed_by', p_doc.sender_confirmed_by,
    'steps', '[]'::jsonb,
    'deleted_steps', '[]'::jsonb
  );
$$;

revoke all on function public.doc_handback_snapshot(public.documents) from public, anon, authenticated;

-- Manager confirms the document is back at KCN.
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
  if not public.can_manage_documents() then
    raise exception 'Chỉ quản lý hồ sơ mới được thực hiện thao tác này.'
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

-- Manager hands the document over to the sender.
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
  if not public.can_manage_documents() then
    raise exception 'Chỉ quản lý hồ sơ mới được thực hiện thao tác này.'
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

-- The sender (or a manager on their behalf) confirms receipt; this is
-- what marks the document Hoàn thành.
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

  if auth.uid() is null
     or (
       v_doc.sender_id is distinct from auth.uid()
       and not public.can_manage_documents()
     ) then
    raise exception 'Chỉ người gửi hoặc quản lý hồ sơ mới được xác nhận đã nhận.'
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

revoke all on function public.doc_receive_back(uuid, text) from public, anon, authenticated;
grant execute on function public.doc_receive_back(uuid, text) to authenticated;

revoke all on function public.doc_hand_over(uuid, text) from public, anon, authenticated;
grant execute on function public.doc_hand_over(uuid, text) to authenticated;

revoke all on function public.doc_sender_confirm(uuid, text) from public, anon, authenticated;
grant execute on function public.doc_sender_confirm(uuid, text) to authenticated;

-- ---------- Undo ----------
-- Same as 0018, plus the hand-back actions. Document-level columns are
-- restored from undo_data; events written before 0019 have no hand-back
-- keys, which correctly restores them to null.
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
  if not public.can_manage_documents() then
    raise exception 'Chỉ quản lý hồ sơ mới được thực hiện thao tác này.'
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
      'sender_confirm'
    )
    and not exists (
      select 1
      from public.document_events u
      where u.document_id = e.document_id
        and u.action = 'undo'
        and u.undo_of = e.id
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

  perform public.doc_log_event(
    p_document_id,
    'undo',
    v_event.step_order,
    v_event.department,
    v_event.handler_name,
    null,
    jsonb_build_object('action', v_event.action, 'event_id', v_event.id),
    null,
    v_event.id
  );
end;
$$;
