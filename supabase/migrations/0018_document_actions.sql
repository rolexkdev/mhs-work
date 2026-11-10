-- =============================================================
-- 0018 — Document tracking: progress RPCs
-- Security definer functions that change document progress atomically.
-- Every function checks can_manage_documents() and the expected current
-- state (stale calls are rejected), then writes the steps and exactly one
-- document_events row in the same transaction.
--
-- Each progress event stores the snapshot doc_undo needs:
--   steps         -> mutable fields of the steps the action touched
--   deleted_steps -> full rows removed by doc_finish_early
--   finished_at   -> document flag before the action
-- Route edits are logged but not undoable (edit the route again instead).
--
-- Stale calls: the client passes the id of the step it saw as current
-- (or of the event it wants to undo); the call fails if that changed.
--
-- Idempotent. Run manually in the Supabase SQL Editor after 0017.
-- =============================================================

-- Earlier drafts of these functions had no expected-state argument.
drop function if exists public.doc_forward(uuid, text, text);
drop function if exists public.doc_return(uuid, text);
drop function if exists public.doc_resend(uuid, text);
drop function if exists public.doc_finish_early(uuid, text);
drop function if exists public.doc_undo(uuid);

-- ---------- Internal helpers ----------
-- First step not done yet (current or next pending).
create or replace function public.doc_current_step(p_document_id uuid)
returns public.document_steps
language sql stable security definer set search_path = public as $$
  select s.*
  from public.document_steps s
  where s.document_id = p_document_id
    and s.done_at is null
  order by s.step_order
  limit 1;
$$;

-- Previous mutable values of the given steps.
create or replace function public.doc_step_snapshot(p_step_ids uuid[])
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'received_at', s.received_at,
        'done_at', s.done_at,
        'returned_at', s.returned_at,
        'handler_name', s.handler_name,
        'note', s.note
      )
    ),
    '[]'::jsonb
  )
  from public.document_steps s
  where s.id = any (p_step_ids);
$$;

-- Rejects a call made from an outdated view of the document.
create or replace function public.doc_assert_current(
  p_actual uuid,
  p_expected uuid
)
returns void
language plpgsql as $$
begin
  if p_expected is null or p_actual is distinct from p_expected then
    raise exception 'Hồ sơ vừa được cập nhật, vui lòng tải lại rồi thử lại.'
      using errcode = 'P0001';
  end if;
end;
$$;

-- Single insert point so every action writes exactly one event.
create or replace function public.doc_log_event(
  p_document_id uuid,
  p_action text,
  p_step_order int default null,
  p_department text default null,
  p_handler_name text default null,
  p_note text default null,
  p_payload jsonb default null,
  p_undo_data jsonb default null,
  p_undo_of uuid default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_event_id uuid;
begin
  insert into public.document_events (
    document_id,
    action,
    step_order,
    department,
    handler_name,
    note,
    payload,
    undo_data,
    undo_of,
    created_by
  )
  values (
    p_document_id,
    p_action,
    p_step_order,
    p_department,
    p_handler_name,
    p_note,
    p_payload,
    p_undo_data,
    p_undo_of,
    auth.uid()
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

-- ---------- Route ----------
-- p_departments is the full ordered route. Steps already reached
-- (received at least once) are locked and must be an unchanged prefix;
-- only the remaining steps are replaced.
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

  -- Replace only the upcoming part.
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
  else
    update public.documents
    set finished_at = v_now
    where id = p_document_id;
  end if;

  perform public.doc_log_event(
    p_document_id,
    'forward',
    v_step.step_order,
    v_step.department,
    p_handler_name,
    p_note,
    jsonb_build_object('finished', (v_next.id is null)),
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
  if not public.can_manage_documents() then
    raise exception 'Chỉ quản lý hồ sơ mới được thực hiện thao tác này.'
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
-- The step holding the document is marked done (it is the last department
-- that handled it); only steps not reached yet are dropped.
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

  v_step := public.doc_current_step(p_document_id);

  if v_step.id is null or v_step.received_at is null then
    raise exception 'Hồ sơ chưa được gửi đi.' using errcode = 'P0001';
  end if;

  perform public.doc_assert_current(v_step.id, p_step_id);

  -- Snapshot every step that is about to be dropped so undo can restore it.
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

  update public.documents
  set finished_at = v_now
  where id = p_document_id;

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

-- ---------- Undo ----------
-- Reverts the latest progress action that has not been undone yet.
-- Route edits and info edits are not undoable.
-- p_event_id is the event the client shows as latest, so a double click or
-- a second manager cannot undo two actions at once.
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
    and e.action in ('send', 'forward', 'return', 'resend', 'finish_early')
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

  update public.documents
  set finished_at = (v_event.undo_data ->> 'finished_at')::timestamptz
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

-- ---------- Grants ----------
-- Supabase's default privileges grant execute on new functions in the
-- public schema to anon and authenticated explicitly, so revoking from
-- public alone is not enough: revoke from all three, then grant back.
-- Progress actions: authenticated users only. The RPC itself rejects
-- anyone without the manager flag, so members get a clear error.
revoke all on function public.doc_set_route(uuid, text[]) from public, anon, authenticated;
grant execute on function public.doc_set_route(uuid, text[]) to authenticated;

revoke all on function public.doc_send(uuid, text) from public, anon, authenticated;
grant execute on function public.doc_send(uuid, text) to authenticated;

revoke all on function public.doc_forward(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.doc_forward(uuid, uuid, text, text) to authenticated;

revoke all on function public.doc_return(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.doc_return(uuid, uuid, text) to authenticated;

revoke all on function public.doc_resend(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.doc_resend(uuid, uuid, text) to authenticated;

revoke all on function public.doc_finish_early(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.doc_finish_early(uuid, uuid, text, text) to authenticated;

revoke all on function public.doc_undo(uuid, uuid) from public, anon, authenticated;
grant execute on function public.doc_undo(uuid, uuid) to authenticated;

-- Internal helpers must not be callable from the API. doc_log_event is
-- security definer: exposing it would let anyone forge undo_data.
revoke all on function public.doc_current_step(uuid) from public, anon, authenticated;
revoke all on function public.doc_step_snapshot(uuid[]) from public, anon, authenticated;
revoke all on function public.doc_assert_current(uuid, uuid) from public, anon, authenticated;
revoke all on function public.doc_log_event(uuid, text, int, text, text, text, jsonb, jsonb, uuid) from public, anon, authenticated;
