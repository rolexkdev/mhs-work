-- =============================================================
-- 0016 — Document submission module: Phase 0 (Data foundation)
-- Creates offices, documents, document_handoffs, document_attachments,
-- document_logs, document_code_counters, and the document_holders view;
-- adds office_id, department, and a privilege-escalation guard trigger
-- to profiles; defines create_handoff, respond_handoff, and cancel_handoff
-- RPCs, triggers, RLS policies, storage bucket, and realtime.
-- Run in the Supabase SQL Editor (or supabase db push).
-- =============================================================

-- ---------- Enums ----------
do $$
begin
  create type public.document_status as enum (
    'draft',
    'in_transit',
    'at_office',
    'distributing',
    'assigned',
    'done',
    'archived',
    'delivered_external',
    'lost'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.handoff_kind as enum (
    'collect',
    'assign',
    'forward',
    'return'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.handoff_status as enum (
    'pending',
    'accepted',
    'rejected',
    'cancelled'
  );
exception when duplicate_object then null;
end $$;

alter type public.handoff_status add value if not exists 'cancelled';

-- ---------- Offices ----------
create table if not exists public.offices (
  id         uuid primary key default gen_random_uuid(),
  code       text unique not null,
  name       text not null,
  address    text,
  created_at timestamptz not null default now()
);

insert into public.offices (code, name)
values
  ('KCN', 'Văn phòng Ban quản lý KCN Minh Hưng Sikico'),
  ('TCT', 'Văn phòng Tổng công ty')
on conflict (code) do nothing;

-- ---------- Profiles extensions ----------
alter table public.profiles
  add column if not exists office_id uuid references public.offices (id) on delete set null,
  add column if not exists department text;

create index if not exists idx_profiles_office on public.profiles (office_id);

-- Guard trigger on profiles preventing privilege escalation via self-update.
-- Policy "profiles_update_self_or_admin" (0001_init.sql) lets any user update
-- their own profile row, which would otherwise allow changing role or office_id.
-- Note: the /accounts Server Actions use the service-role client (and manual
-- queries in the Supabase SQL Editor have no JWT), where auth.uid() is null and
-- public.is_admin() evaluates to false. Allowing changes when auth.uid() is null
-- keeps service-role admin actions working while blocking non-admin authenticated
-- callers. Users can still update their own full_name, avatar_url, and department.
create or replace function public.guard_profile_protected_columns()
returns trigger
language plpgsql as $$
begin
  if new.id is distinct from old.id
     or new.email is distinct from old.email then
    raise exception 'Profile id and email cannot be changed.';
  end if;

  if (new.role is distinct from old.role or new.office_id is distinct from old.office_id)
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Only administrators may change profile role or office_id.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_guard_protected on public.profiles;
create trigger trg_profiles_guard_protected
  before update on public.profiles
  for each row execute function public.guard_profile_protected_columns();

-- ---------- Concurrency-safe per-year counter for document codes ----------
create table if not exists public.document_code_counters (
  year int primary key,
  last int not null default 0
);

-- ---------- Documents ----------
create table if not exists public.documents (
  id                uuid primary key default gen_random_uuid(),
  code              text unique not null,
  title             text not null,
  description       text,
  category          text,
  origin_office_id  uuid references public.offices (id) on delete set null,
  current_office_id uuid references public.offices (id) on delete set null,
  current_holder_id uuid references public.profiles (id) on delete set null,
  status            public.document_status not null default 'draft',
  priority          public.task_priority not null default 'medium',
  due_date          date,
  task_id           uuid references public.tasks (id) on delete set null,
  created_by        uuid not null default auth.uid() references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_documents_status         on public.documents (status);
create index if not exists idx_documents_current_holder on public.documents (current_holder_id);
create index if not exists idx_documents_current_office on public.documents (current_office_id);
create index if not exists idx_documents_task           on public.documents (task_id);

drop trigger if exists trg_documents_updated_at on public.documents;
create trigger trg_documents_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

-- BEFORE INSERT trigger: generates HS-YYYY-NNNN (using the Vietnam calendar year)
-- when code is omitted, defaults origin_office_id to the creator's office when null,
-- and unless app.documents_rpc is 'on', forces created_by = auth.uid(),
-- status = 'draft', current_holder_id = auth.uid(), and
-- current_office_id = coalesce(origin_office_id, creator's office_id).
create or replace function public.before_insert_document()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_is_rpc            boolean := coalesce(current_setting('app.documents_rpc', true), '') = 'on';
  v_creator_office_id uuid;
  v_year              int;
  v_seq               int;
begin
  if not v_is_rpc then
    new.created_by        := auth.uid();
    new.status            := 'draft';
    new.current_holder_id := auth.uid();
  else
    if new.created_by is null then
      new.created_by := auth.uid();
    end if;
    if new.status is null then
      new.status := 'draft';
    end if;
    if new.current_holder_id is null then
      new.current_holder_id := new.created_by;
    end if;
  end if;

  select office_id
    into v_creator_office_id
    from public.profiles
   where id = new.created_by;

  if new.origin_office_id is null then
    new.origin_office_id := v_creator_office_id;
  end if;

  if not v_is_rpc or new.current_office_id is null then
    new.current_office_id := coalesce(new.origin_office_id, v_creator_office_id);
  end if;

  if new.code is null or btrim(new.code) = '' then
    v_year := extract(year from (coalesce(new.created_at, now()) at time zone 'Asia/Ho_Chi_Minh'))::int;

    insert into public.document_code_counters (year, last)
    values (v_year, 1)
    on conflict (year) do update
      set last = public.document_code_counters.last + 1
    returning last into v_seq;

    new.code := format('HS-%s-%s', v_year, lpad(v_seq::text, 4, '0'));
  end if;

  return new;
end;
$$;

drop trigger if exists trg_documents_before_insert on public.documents;
create trigger trg_documents_before_insert
  before insert on public.documents
  for each row execute function public.before_insert_document();

-- Guard trigger preventing any changes to immutable columns (created_by, code)
-- and preventing direct client updates to status, current_holder_id, and
-- current_office_id.
-- Why a BEFORE UPDATE trigger + transaction-local session variable
-- (`set_config('app.documents_rpc', 'on', true)`):
-- RLS WITH CHECK policies cannot compare OLD vs. NEW column values, and
-- column-level GRANT UPDATE breaks full-row updates sent by PostgREST/clients.
-- A transaction-local config setting set inside SECURITY DEFINER RPCs cannot be
-- forged by direct client table updates and cleanly allows updates when those
-- protected columns are unchanged (IS NOT DISTINCT FROM).
create or replace function public.guard_document_protected_columns()
returns trigger
language plpgsql as $$
begin
  if new.created_by is distinct from old.created_by
     or new.code is distinct from old.code then
    raise exception 'Immutable columns (created_by, code) cannot be changed.';
  end if;

  if coalesce(current_setting('app.documents_rpc', true), '') <> 'on' then
    if new.status is distinct from old.status
       or new.current_holder_id is distinct from old.current_holder_id
       or new.current_office_id is distinct from old.current_office_id then
      raise exception 'Protected columns (status, current_holder_id, current_office_id) may only be changed via handoff or shipment RPCs.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_documents_guard_protected on public.documents;
create trigger trg_documents_guard_protected
  before update on public.documents
  for each row execute function public.guard_document_protected_columns();

-- ---------- Document handoffs ----------
create table if not exists public.document_handoffs (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.documents (id) on delete cascade,
  from_user     uuid not null references public.profiles (id),
  to_user       uuid not null references public.profiles (id),
  kind          public.handoff_kind not null,
  status        public.handoff_status not null default 'pending',
  note          text,
  response_note text,
  created_at    timestamptz not null default now(),
  responded_at  timestamptz
);

create index if not exists idx_document_handoffs_to_user_status
  on public.document_handoffs (to_user, status);
create index if not exists idx_document_handoffs_document
  on public.document_handoffs (document_id);

-- ---------- Document holders view ----------
-- Derives who currently holds a copy of each document from accepted handoffs:
-- the latest accepted handoff per (document_id, to_user) that the same user has
-- not subsequently forwarded or returned via an accepted handoff.
create or replace view public.document_holders
with (security_invoker = true) as
select
  latest.document_id,
  latest.to_user      as user_id,
  p.office_id         as office_id,
  latest.responded_at as accepted_at,
  latest.id           as handoff_id
from (
  select distinct on (h.document_id, h.to_user)
    h.id,
    h.document_id,
    h.to_user,
    h.responded_at,
    h.created_at
  from public.document_handoffs h
  where h.status = 'accepted'
  order by h.document_id, h.to_user, h.responded_at desc nulls last, h.created_at desc, h.id desc
) latest
left join public.profiles p on p.id = latest.to_user
where not exists (
  select 1
  from public.document_handoffs h2
  where h2.document_id = latest.document_id
    and h2.from_user   = latest.to_user
    and h2.kind in ('forward', 'return')
    and h2.status      = 'accepted'
    and coalesce(h2.responded_at, h2.created_at) >= coalesce(latest.responded_at, latest.created_at)
    and h2.id <> latest.id
);

grant select on public.document_holders to authenticated;

-- ---------- Document attachments ----------
create table if not exists public.document_attachments (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  handoff_id  uuid references public.document_handoffs (id) on delete set null,
  -- No FK yet: the document_shipments table comes in Phase 2 (0017_document_shipments.sql).
  shipment_id uuid,
  file_name   text not null,
  file_url    text not null,
  uploaded_by uuid not null default auth.uid() references public.profiles (id),
  created_at  timestamptz not null default now()
);

create index if not exists idx_document_attachments_document
  on public.document_attachments (document_id);

-- ---------- Document logs ----------
create table if not exists public.document_logs (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  action      text not null,
  old_value   jsonb,
  new_value   jsonb,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_document_logs_document
  on public.document_logs (document_id);

-- ---------- Logging triggers ----------
create or replace function public.log_document_change()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := coalesce(auth.uid(), new.created_by);
begin
  if tg_op = 'INSERT' then
    insert into public.document_logs (document_id, action, new_value, created_by)
    values (new.id, 'created', to_jsonb(new.title), uid);
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.document_logs (document_id, action, old_value, new_value, created_by)
    values (new.id, 'status', to_jsonb(old.status), to_jsonb(new.status), uid);
  end if;

  if new.current_holder_id is distinct from old.current_holder_id then
    insert into public.document_logs (document_id, action, old_value, new_value, created_by)
    values (new.id, 'current_holder_id', to_jsonb(old.current_holder_id), to_jsonb(new.current_holder_id), uid);
  end if;

  if new.title is distinct from old.title then
    insert into public.document_logs (document_id, action, old_value, new_value, created_by)
    values (new.id, 'title', to_jsonb(old.title), to_jsonb(new.title), uid);
  end if;

  if new.due_date is distinct from old.due_date then
    insert into public.document_logs (document_id, action, old_value, new_value, created_by)
    values (new.id, 'due_date', to_jsonb(old.due_date), to_jsonb(new.due_date), uid);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_document_log on public.documents;
create trigger trg_document_log
  after insert or update on public.documents
  for each row execute function public.log_document_change();

create or replace function public.log_document_handoff_change()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into public.document_logs (document_id, action, new_value, created_by)
    values (
      new.document_id,
      'handoff_created',
      jsonb_build_object(
        'handoff_id', new.id,
        'from_user', new.from_user,
        'to_user', new.to_user,
        'kind', new.kind,
        'note', new.note
      ),
      coalesce(uid, new.from_user)
    );
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'accepted' then
      insert into public.document_logs (document_id, action, old_value, new_value, created_by)
      values (
        new.document_id,
        'handoff_accepted',
        to_jsonb(old.status),
        jsonb_build_object(
          'handoff_id', new.id,
          'from_user', new.from_user,
          'to_user', new.to_user,
          'kind', new.kind,
          'response_note', new.response_note
        ),
        coalesce(uid, new.to_user)
      );
    elsif new.status = 'rejected' then
      insert into public.document_logs (document_id, action, old_value, new_value, created_by)
      values (
        new.document_id,
        'handoff_rejected',
        to_jsonb(old.status),
        jsonb_build_object(
          'handoff_id', new.id,
          'from_user', new.from_user,
          'to_user', new.to_user,
          'kind', new.kind,
          'response_note', new.response_note
        ),
        coalesce(uid, new.to_user)
      );
    elsif new.status = 'cancelled' then
      insert into public.document_logs (document_id, action, old_value, new_value, created_by)
      values (
        new.document_id,
        'handoff_cancelled',
        to_jsonb(old.status),
        jsonb_build_object(
          'handoff_id', new.id,
          'from_user', new.from_user,
          'to_user', new.to_user,
          'kind', new.kind,
          'response_note', new.response_note
        ),
        coalesce(uid, new.from_user)
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_document_handoff_log on public.document_handoffs;
create trigger trg_document_handoff_log
  after insert or update on public.document_handoffs
  for each row execute function public.log_document_handoff_change();

-- ---------- RPCs ----------
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
     and not public.is_leader_or_admin() then
    raise exception 'Only the current document holder, a leader, or an admin may create a handoff.';
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

-- Responds to a pending handoff (accept or reject).
-- Kind semantics on accept for a single-recipient handoff:
--   - 'collect'           -> status = 'at_office'
--   - 'assign' / 'forward'-> status = 'assigned'
--   - 'return'            -> status = 'at_office' (back with the coordinator)
--   and current_holder_id = to_user, current_office_id = receiver's office.
-- For a multi-recipient distribution (document status is 'distributing'):
--   - The sender remains current_holder_id and status stays 'distributing'
--     while any handoff of the document is still 'pending'.
--   - When the last pending handoff is answered, status becomes 'assigned' if
--     at least one handoff in the distribution was accepted; otherwise it
--     reverts to the pre-distribution status derived from document_logs.
create or replace function public.respond_handoff(
  p_handoff_id uuid,
  p_accept     boolean,
  p_note       text default null
)
returns public.document_handoffs
language plpgsql security definer set search_path = public as $$
declare
  v_uid                uuid := auth.uid();
  v_handoff            public.document_handoffs%rowtype;
  v_doc                public.documents%rowtype;
  v_receiver_office_id uuid;
  v_new_status         public.document_status;
  v_prev_status        public.document_status;
  v_dist_started_at    timestamptz;
  v_any_accepted       boolean;
begin
  if v_uid is null then
    raise exception 'Authentication required to respond to a handoff.';
  end if;

  select *
    into v_handoff
    from public.document_handoffs
   where id = p_handoff_id
     for update;

  if not found then
    raise exception 'Handoff % not found.', p_handoff_id;
  end if;

  if v_handoff.to_user is distinct from v_uid then
    raise exception 'Only the designated recipient may respond to this handoff.';
  end if;

  if v_handoff.status <> 'pending' then
    raise exception 'This handoff has already been responded to (status: %).', v_handoff.status;
  end if;

  select *
    into v_doc
    from public.documents
   where id = v_handoff.document_id
     for update;

  perform set_config('app.documents_rpc', 'on', true);

  update public.document_handoffs
     set status        = case when p_accept then 'accepted'::public.handoff_status else 'rejected'::public.handoff_status end,
         response_note = p_note,
         responded_at  = now()
   where id = p_handoff_id
  returning * into v_handoff;

  if v_doc.status = 'distributing' then
    if not exists (
      select 1
        from public.document_handoffs
       where document_id = v_doc.id
         and status = 'pending'
    ) then
      -- Derive the pre-distribution status and timestamp from the latest
      -- document_logs entry where status transitioned into 'distributing'.
      select (old_value #>> '{}')::public.document_status,
             created_at
        into v_prev_status,
             v_dist_started_at
        from public.document_logs
       where document_id = v_doc.id
         and action = 'status'
         and new_value = to_jsonb('distributing'::text)
       order by created_at desc, id desc
       limit 1;

      select exists (
        select 1
          from public.document_handoffs
         where document_id = v_doc.id
           and status = 'accepted'
           and created_at >= coalesce(v_dist_started_at, v_handoff.created_at)
      ) into v_any_accepted;

      update public.documents
         set status = case
           when v_any_accepted then 'assigned'::public.document_status
           else coalesce(v_prev_status, 'draft'::public.document_status)
         end
       where id = v_doc.id;
    end if;
  elsif p_accept then
    select office_id
      into v_receiver_office_id
      from public.profiles
     where id = v_handoff.to_user;

    v_new_status := case v_handoff.kind
      when 'collect' then 'at_office'::public.document_status
      when 'return'  then 'at_office'::public.document_status
      when 'assign'  then 'assigned'::public.document_status
      when 'forward' then 'assigned'::public.document_status
    end;

    update public.documents
       set current_holder_id = v_handoff.to_user,
           current_office_id = coalesce(v_receiver_office_id, current_office_id),
           status            = v_new_status
     where id = v_handoff.document_id;
  end if;

  return v_handoff;
end;
$$;

-- Cancels a pending handoff. Allowed only for the sender (from_user) or a
-- leader/admin while status is 'pending'. Counts as "answered" for resolving a
-- multi-recipient distribution when the last pending handoff is cancelled.
create or replace function public.cancel_handoff(
  p_handoff_id uuid,
  p_note       text default null
)
returns public.document_handoffs
language plpgsql security definer set search_path = public as $$
declare
  v_uid             uuid := auth.uid();
  v_handoff         public.document_handoffs%rowtype;
  v_doc             public.documents%rowtype;
  v_prev_status     public.document_status;
  v_dist_started_at timestamptz;
  v_any_accepted    boolean;
begin
  if v_uid is null then
    raise exception 'Authentication required to cancel a handoff.';
  end if;

  select *
    into v_handoff
    from public.document_handoffs
   where id = p_handoff_id
     for update;

  if not found then
    raise exception 'Handoff % not found.', p_handoff_id;
  end if;

  if v_handoff.from_user is distinct from v_uid
     and not public.is_leader_or_admin() then
    raise exception 'Only the sender, a leader, or an admin may cancel this handoff.';
  end if;

  if v_handoff.status <> 'pending' then
    raise exception 'Only a pending handoff may be cancelled (status: %).', v_handoff.status;
  end if;

  select *
    into v_doc
    from public.documents
   where id = v_handoff.document_id
     for update;

  perform set_config('app.documents_rpc', 'on', true);

  update public.document_handoffs
     set status        = 'cancelled'::public.handoff_status,
         response_note = p_note,
         responded_at  = now()
   where id = p_handoff_id
  returning * into v_handoff;

  if v_doc.status = 'distributing' then
    if not exists (
      select 1
        from public.document_handoffs
       where document_id = v_doc.id
         and status = 'pending'
    ) then
      -- Derive the pre-distribution status and timestamp from the latest
      -- document_logs entry where status transitioned into 'distributing'.
      select (old_value #>> '{}')::public.document_status,
             created_at
        into v_prev_status,
             v_dist_started_at
        from public.document_logs
       where document_id = v_doc.id
         and action = 'status'
         and new_value = to_jsonb('distributing'::text)
       order by created_at desc, id desc
       limit 1;

      select exists (
        select 1
          from public.document_handoffs
         where document_id = v_doc.id
           and status = 'accepted'
           and created_at >= coalesce(v_dist_started_at, v_handoff.created_at)
      ) into v_any_accepted;

      update public.documents
         set status = case
           when v_any_accepted then 'assigned'::public.document_status
           else coalesce(v_prev_status, 'draft'::public.document_status)
         end
       where id = v_doc.id;
    end if;
  end if;

  return v_handoff;
end;
$$;

grant execute on function public.create_handoff(uuid, uuid[], public.handoff_kind, text) to authenticated;
grant execute on function public.respond_handoff(uuid, boolean, text) to authenticated;
grant execute on function public.cancel_handoff(uuid, text) to authenticated;

-- ---------- Row Level Security ----------
alter table public.offices                enable row level security;
alter table public.documents              enable row level security;
alter table public.document_handoffs      enable row level security;
alter table public.document_attachments   enable row level security;
alter table public.document_logs          enable row level security;
alter table public.document_code_counters enable row level security;

-- offices: select for authenticated; write admin only
drop policy if exists "offices_select_all" on public.offices;
create policy "offices_select_all" on public.offices
  for select to authenticated using (true);

drop policy if exists "offices_write_admin" on public.offices;
create policy "offices_write_admin" on public.offices
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- documents: select all authenticated; insert authenticated (created_by = auth.uid());
-- update authenticated (protected columns guarded by trigger); delete creator or admin.
drop policy if exists "documents_select_all" on public.documents;
create policy "documents_select_all" on public.documents
  for select to authenticated using (true);

drop policy if exists "documents_insert_authenticated" on public.documents;
create policy "documents_insert_authenticated" on public.documents
  for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists "documents_update_authenticated" on public.documents;
create policy "documents_update_authenticated" on public.documents
  for update to authenticated
  using (true)
  with check (true);

drop policy if exists "documents_delete_creator_or_admin" on public.documents;
create policy "documents_delete_creator_or_admin" on public.documents
  for delete to authenticated
  using (created_by = auth.uid() or public.is_admin());

-- document_handoffs: select all; no direct client writes (RPC only)
drop policy if exists "document_handoffs_select_all" on public.document_handoffs;
create policy "document_handoffs_select_all" on public.document_handoffs
  for select to authenticated using (true);

-- document_attachments: select all; insert own; delete own or leader/admin
drop policy if exists "document_attachments_select_all" on public.document_attachments;
create policy "document_attachments_select_all" on public.document_attachments
  for select to authenticated using (true);

drop policy if exists "document_attachments_insert_own" on public.document_attachments;
create policy "document_attachments_insert_own" on public.document_attachments
  for insert to authenticated
  with check (uploaded_by = auth.uid());

drop policy if exists "document_attachments_delete_own_or_leader" on public.document_attachments;
create policy "document_attachments_delete_own_or_leader" on public.document_attachments
  for delete to authenticated
  using (uploaded_by = auth.uid() or public.is_leader_or_admin());

-- document_logs: select all; no client writes
drop policy if exists "document_logs_select_all" on public.document_logs;
create policy "document_logs_select_all" on public.document_logs
  for select to authenticated using (true);

-- document_code_counters: no client policies (accessed only by security definer trigger)

-- ---------- Storage bucket: document-files (private) ----------
insert into storage.buckets (id, name, public)
values ('document-files', 'document-files', false)
on conflict (id) do nothing;

drop policy if exists "document_files_read" on storage.objects;
create policy "document_files_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'document-files');

drop policy if exists "document_files_upload" on storage.objects;
create policy "document_files_upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'document-files' and owner = auth.uid());

drop policy if exists "document_files_delete_own" on storage.objects;
create policy "document_files_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'document-files' and (owner = auth.uid() or public.is_leader_or_admin()));

-- ---------- Realtime ----------
do $$
begin
  begin
    alter publication supabase_realtime add table public.documents;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.document_handoffs;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.document_attachments;
  exception when duplicate_object then null;
  end;
end $$;

alter table public.document_handoffs    replica identity full;
alter table public.document_attachments replica identity full;
