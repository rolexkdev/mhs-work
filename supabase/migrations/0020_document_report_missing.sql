-- =============================================================
-- 0020 — Report a missing document during hand-back
-- While a document is Chờ nhận lại or Đã nhận lại (before the
-- hand-over), a manager can report that it is incomplete. The last
-- step reopens as returned (Cần bổ sung, at KCN), so the existing
-- Gửi lại -> Đã xử lý flow sends it back to that department and the
-- document returns to Chờ nhận lại afterwards.
--
-- Idempotent. Run manually in the Supabase SQL Editor after 0019.
-- =============================================================

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
      'sender_confirm',
      'report_missing'
    )
  );

-- ---------- Report missing ----------
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
  if not public.can_manage_documents() then
    raise exception 'Chỉ quản lý hồ sơ mới được thực hiện thao tác này.'
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

revoke all on function public.doc_report_missing(uuid, text) from public, anon, authenticated;
grant execute on function public.doc_report_missing(uuid, text) to authenticated;

-- ---------- Undo ----------
-- Same as 0019, plus report_missing. Document-level columns are
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
      'sender_confirm',
      'report_missing'
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
