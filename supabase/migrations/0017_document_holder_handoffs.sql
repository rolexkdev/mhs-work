-- =============================================================
-- 0017 — Allow document copy holders to create handoffs
-- Recreates public.create_handoff so that a user listed in
-- public.document_holders for the given document (e.g. a department
-- head who accepted a copy from a multi-recipient distribution) may
-- also pass the document on via a handoff, in addition to the
-- primary current_holder_id, a leader, or an admin.
-- Run in the Supabase SQL Editor (or supabase db push).
-- =============================================================

create or replace function public.create_handoff(
  p_document_id uuid,
  p_to_users    uuid[],
  p_kind        public.handoff_kind,
  p_note        text default null
)
returns setof public.document_handoffs
language plpgsql security definer set search_path = public as $$
declare
  v_uid        uuid := auth.uid();
  v_doc        public.documents%rowtype;
  v_recipients uuid[];
begin
  if v_uid is null then
    raise exception 'Authentication required to create a handoff.';
  end if;

  select array_agg(distinct u)
    into v_recipients
    from unnest(p_to_users) as u
   where u is not null;

  if v_recipients is null or coalesce(array_length(v_recipients, 1), 0) = 0 then
    raise exception 'At least one recipient (p_to_users) is required.';
  end if;

  if v_uid = any(v_recipients) then
    raise exception 'Cannot create a handoff to yourself.';
  end if;

  select *
    into v_doc
    from public.documents
   where id = p_document_id
     for update;

  if not found then
    raise exception 'Document % not found.', p_document_id;
  end if;

  if v_doc.current_holder_id is distinct from v_uid
     and not exists (
       select 1
         from public.document_holders dh
        where dh.document_id = p_document_id
          and dh.user_id = v_uid
     )
     and not public.is_leader_or_admin() then
    raise exception 'Only the current document holder, a copy holder, a leader, or an admin may create a handoff.';
  end if;

  if exists (
    select 1
      from public.document_handoffs
     where document_id = p_document_id
       and to_user = any(v_recipients)
       and status = 'pending'
  ) then
    raise exception 'One or more recipients already have a pending handoff for this document.';
  end if;

  perform set_config('app.documents_rpc', 'on', true);

  -- Multi-recipient distribution: set document status to 'distributing' while
  -- keeping current_holder_id as the sender (coordinator stays accountable).
  -- The transition to 'distributing' is logged by trg_document_log so the prior
  -- status can be restored if all distribution handoffs are rejected/cancelled.
  if array_length(v_recipients, 1) > 1 then
    update public.documents
       set status = 'distributing'
     where id = p_document_id
       and status is distinct from 'distributing';
  end if;

  return query
  insert into public.document_handoffs (
    document_id,
    from_user,
    to_user,
    kind,
    status,
    note
  )
  select
    p_document_id,
    v_uid,
    u,
    p_kind,
    'pending'::public.handoff_status,
    p_note
  from unnest(v_recipients) as u
  returning *;
end;
$$;

grant execute on function public.create_handoff(uuid, uuid[], public.handoff_kind, text) to authenticated;
