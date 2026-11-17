-- =============================================================
-- 0022 — Undo no longer keeps history
-- doc_undo used to log an 'undo' event and keep the reverted event
-- (marked through undo_of). Now it restores the document and deletes
-- the reverted event, so an undone action leaves no trace and the
-- next undo simply picks the latest remaining event.
--
-- Existing undo events and the events they reverted are deleted, and
-- 'undo' is removed from the allowed actions. The undo_of column stays
-- (doc_log_event still has the parameter) but is always null.
--
-- Idempotent. Run manually in the Supabase SQL Editor after 0021.
-- Back up document_events first: the cleanup is a hard delete.
-- =============================================================

-- ---------- Clean up existing undo history ----------
delete from public.document_events
where action = 'undo'
   or id in (
     select u.undo_of
     from public.document_events u
     where u.undo_of is not null
   );

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
      'receive_back',
      'hand_over',
      'sender_confirm',
      'report_missing'
    )
  );

-- ---------- Undo ----------
-- Same as 0020, but the reverted event is deleted instead of being
-- marked by a new 'undo' event.
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

revoke all on function public.doc_undo(uuid, uuid) from public, anon, authenticated;
grant execute on function public.doc_undo(uuid, uuid) to authenticated;
