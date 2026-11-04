-- =============================================================
-- 0018 — Document submission module: Phase 2 (Inter-office & external shipments)
-- Creates shipment enums, external_units, shipment_code_counters,
-- document_shipments, and document_shipment_items; relaxes
-- document_attachments.document_id to nullable and links shipment_id;
-- defines create_shipment, confirm_shipment_items, mark_document_lost,
-- cancel_shipment, and resolve_shipment RPCs; updates create_handoff
-- to block non-handoffable statuses; adds shipment item logging trigger,
-- RLS policies, and realtime publication entries.
-- Run in the Supabase SQL Editor (or supabase db push).
-- =============================================================

-- ---------- Enums ----------
do $$
begin
  create type public.shipment_method as enum (
    'courier',
    'company_car',
    'hand',
    'post'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.shipment_status as enum (
    'in_transit',
    'delivered',
    'lost',
    'cancelled'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.shipment_item_status as enum (
    'in_transit',
    'received',
    'lost',
    'cancelled'
  );
exception when duplicate_object then null;
end $$;

-- ---------- External units (shared directory of external recipients) ----------
create table if not exists public.external_units (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  address      text,
  contact_name text,
  phone        text,
  note         text,
  is_active    boolean not null default true,
  created_by   uuid not null default auth.uid() references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists trg_external_units_updated_at on public.external_units;
create trigger trg_external_units_updated_at
  before update on public.external_units
  for each row execute function public.set_updated_at();

create unique index if not exists idx_external_units_active_name
  on public.external_units (lower(btrim(name)))
  where is_active;

-- ---------- Concurrency-safe per-year counter for shipment codes ----------
create table if not exists public.shipment_code_counters (
  year int primary key,
  last int not null default 0
);

-- ---------- Document shipments ----------
create table if not exists public.document_shipments (
  id                  uuid primary key default gen_random_uuid(),
  code                text unique not null,
  method              public.shipment_method not null,
  carrier             text,
  tracking_no         text,
  driver_note         text,
  from_office_id      uuid not null references public.offices (id),
  to_office_id        uuid references public.offices (id),
  to_external_unit_id uuid references public.external_units (id) on delete restrict,
  recipient_name      text,
  note                text,
  status              public.shipment_status not null default 'in_transit',
  sent_by             uuid not null references public.profiles (id),
  sent_at             timestamptz not null default now(),
  completed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.document_shipments
  drop constraint if exists chk_document_shipments_destination;
alter table public.document_shipments
  add constraint chk_document_shipments_destination
  check (num_nonnulls(to_office_id, to_external_unit_id) = 1);

alter table public.document_shipments
  drop constraint if exists chk_document_shipments_distinct_offices;
alter table public.document_shipments
  add constraint chk_document_shipments_distinct_offices
  check (to_office_id is distinct from from_office_id);

create index if not exists idx_document_shipments_status
  on public.document_shipments (status);
create index if not exists idx_document_shipments_to_office
  on public.document_shipments (to_office_id);
create index if not exists idx_document_shipments_sent_by
  on public.document_shipments (sent_by);

drop trigger if exists trg_document_shipments_updated_at on public.document_shipments;
create trigger trg_document_shipments_updated_at
  before update on public.document_shipments
  for each row execute function public.set_updated_at();

-- BEFORE INSERT trigger: generates VC-YYYY-NNNN (using the Vietnam calendar year)
-- when code is omitted.
create or replace function public.before_insert_document_shipment()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_year int;
  v_seq  int;
begin
  if new.code is null or btrim(new.code) = '' then
    v_year := extract(year from (coalesce(new.sent_at, new.created_at, now()) at time zone 'Asia/Ho_Chi_Minh'))::int;

    insert into public.shipment_code_counters (year, last)
    values (v_year, 1)
    on conflict (year) do update
      set last = public.shipment_code_counters.last + 1
    returning last into v_seq;

    new.code := format('VC-%s-%s', v_year, lpad(v_seq::text, 4, '0'));
  end if;

  return new;
end;
$$;

drop trigger if exists trg_document_shipments_before_insert on public.document_shipments;
create trigger trg_document_shipments_before_insert
  before insert on public.document_shipments
  for each row execute function public.before_insert_document_shipment();

-- ---------- Document shipment items ----------
create table if not exists public.document_shipment_items (
  shipment_id uuid not null references public.document_shipments (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete restrict,
  status      public.shipment_item_status not null default 'in_transit',
  prev_status public.document_status not null,
  received_by uuid references public.profiles (id),
  received_at timestamptz,
  lost_reason text,
  note        text,
  primary key (shipment_id, document_id)
);

create index if not exists idx_document_shipment_items_document
  on public.document_shipment_items (document_id);

-- Partial unique index: a document can be in at most one open ('in_transit') shipment.
create unique index if not exists idx_document_shipment_items_open_document
  on public.document_shipment_items (document_id)
  where status = 'in_transit';

-- ---------- Document attachments: support shipment-level attachments ----------
-- Note: 0016's RLS policies on document_attachments (document_attachments_select_all,
-- document_attachments_insert_own, document_attachments_delete_own_or_leader) only
-- inspect uploaded_by and is_leader_or_admin() — none of them reference document_id,
-- so they continue to work unchanged when document_id is null on shipment attachments.
alter table public.document_attachments
  alter column document_id drop not null;

alter table public.document_attachments
  drop constraint if exists document_attachments_shipment_id_fkey;
alter table public.document_attachments
  add constraint document_attachments_shipment_id_fkey
  foreign key (shipment_id) references public.document_shipments (id) on delete set null;

alter table public.document_attachments
  drop constraint if exists chk_document_attachments_target;
alter table public.document_attachments
  add constraint chk_document_attachments_target
  check (num_nonnulls(document_id, shipment_id) >= 1);

create index if not exists idx_document_attachments_shipment
  on public.document_attachments (shipment_id);

-- ---------- Logging trigger for shipment items ----------
create or replace function public.log_document_shipment_item_change()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_shipment public.document_shipments%rowtype;
  v_uid      uuid;
  v_action   text;
  v_payload  jsonb;
begin
  select *
    into v_shipment
    from public.document_shipments
   where id = new.shipment_id;

  v_uid := coalesce(auth.uid(), v_shipment.sent_by);

  v_payload := jsonb_build_object(
    'shipment_id', new.shipment_id,
    'code', v_shipment.code,
    'method', v_shipment.method,
    'from_office_id', v_shipment.from_office_id,
    'to_office_id', v_shipment.to_office_id,
    'to_external_unit_id', v_shipment.to_external_unit_id
  );

  if tg_op = 'INSERT' then
    insert into public.document_logs (document_id, action, new_value, created_by)
    values (new.document_id, 'shipment_sent', v_payload, v_uid);
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'received' then
      v_action := 'shipment_received';
      v_payload := v_payload || jsonb_build_object(
        'received_by', new.received_by,
        'recipient_name', v_shipment.recipient_name,
        'note', new.note
      );
    elsif new.status = 'lost' then
      v_action := 'shipment_lost';
      v_payload := v_payload || jsonb_build_object(
        'lost_reason', new.lost_reason
      );
    elsif new.status = 'cancelled' then
      v_action := 'shipment_cancelled';
      v_payload := v_payload || jsonb_build_object(
        'note', new.note
      );
    end if;

    if v_action is not null then
      insert into public.document_logs (document_id, action, old_value, new_value, created_by)
      values (new.document_id, v_action, to_jsonb(old.status), v_payload, v_uid);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_document_shipment_item_log on public.document_shipment_items;
create trigger trg_document_shipment_item_log
  after insert or update on public.document_shipment_items
  for each row execute function public.log_document_shipment_item_change();

-- ---------- Internal helper: resolve_shipment ----------
create or replace function public.resolve_shipment(p_shipment_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_any_received boolean;
begin
  if exists (
    select 1
      from public.document_shipment_items
     where shipment_id = p_shipment_id
       and status = 'in_transit'
  ) then
    return;
  end if;

  select exists (
    select 1
      from public.document_shipment_items
     where shipment_id = p_shipment_id
       and status = 'received'
  ) into v_any_received;

  update public.document_shipments
     set status       = case
                          when v_any_received then 'delivered'::public.shipment_status
                          else 'lost'::public.shipment_status
                        end,
         completed_at = coalesce(completed_at, now())
   where id = p_shipment_id
     and status = 'in_transit';
end;
$$;

revoke all on function public.resolve_shipment(uuid) from public, anon, authenticated;

-- ---------- RPC 1: create_shipment ----------
create or replace function public.create_shipment(
  p_document_ids        uuid[],
  p_method              public.shipment_method,
  p_to_office_id        uuid default null,
  p_to_external_unit_id uuid default null,
  p_carrier             text default null,
  p_tracking_no         text default null,
  p_driver_note         text default null,
  p_note                text default null,
  p_from_office_id      uuid default null
)
returns public.document_shipments
language plpgsql security definer set search_path = public as $$
declare
  v_uid                uuid := auth.uid();
  v_doc_ids            uuid[];
  v_doc_id             uuid;
  v_doc                public.documents%rowtype;
  v_caller_office_id   uuid;
  v_from_office_id     uuid;
  v_is_leader_or_admin boolean;
  v_shipment           public.document_shipments%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required to create a shipment.'
      using detail = 'auth_required';
  end if;

  select array_agg(distinct d_id order by d_id)
    into v_doc_ids
    from unnest(p_document_ids) as d_id
   where d_id is not null;

  if v_doc_ids is null or coalesce(array_length(v_doc_ids, 1), 0) = 0 then
    raise exception 'At least one document is required to create a shipment.'
      using detail = 'shipment_no_documents';
  end if;

  select office_id
    into v_caller_office_id
    from public.profiles
   where id = v_uid;

  v_from_office_id := coalesce(p_from_office_id, v_caller_office_id);
  if v_from_office_id is null then
    raise exception 'Origin office is required to create a shipment.'
      using detail = 'shipment_no_from_office';
  end if;

  if num_nonnulls(p_to_office_id, p_to_external_unit_id) <> 1 then
    raise exception 'Exactly one destination (office or external unit) must be specified.'
      using detail = 'shipment_destination_invalid';
  end if;

  if p_to_office_id is not null and p_to_office_id = v_from_office_id then
    raise exception 'Destination office must be different from origin office.'
      using detail = 'shipment_same_office';
  end if;

  if p_to_external_unit_id is not null then
    if not exists (
      select 1
        from public.external_units
       where id = p_to_external_unit_id
         and is_active = true
    ) then
      raise exception 'Destination external unit does not exist or is inactive.'
        using detail = 'external_unit_inactive';
    end if;
  end if;

  v_is_leader_or_admin := public.is_leader_or_admin();

  -- Lock every document in id order to prevent deadlocks and validate eligibility.
  foreach v_doc_id in array v_doc_ids loop
    select *
      into v_doc
      from public.documents
     where id = v_doc_id
       for update;

    if not found then
      raise exception 'Document % not found.', v_doc_id
        using detail = 'shipment_document_unavailable';
    end if;

    if v_doc.current_holder_id is distinct from v_uid
       and not exists (
         select 1
           from public.document_holders dh
          where dh.document_id = v_doc.id
            and dh.user_id = v_uid
       )
       and not v_is_leader_or_admin then
      raise exception 'Only the current document holder, a copy holder, a leader, or an admin may ship document %.', v_doc.code
        using detail = 'shipment_not_holder';
    end if;

    if v_doc.status in ('in_transit', 'distributing', 'lost', 'archived', 'delivered_external')
       or exists (
         select 1
           from public.document_shipment_items dsi
          where dsi.document_id = v_doc.id
            and dsi.status = 'in_transit'
       ) then
      raise exception 'Document % is not available for shipping (status: %).', v_doc.code, v_doc.status
        using detail = 'shipment_document_unavailable';
    end if;

    if exists (
      select 1
        from public.document_handoffs dh
       where dh.document_id = v_doc.id
         and dh.status = 'pending'
    ) then
      raise exception 'Document % has a pending handoff and cannot be shipped.', v_doc.code
        using detail = 'shipment_document_has_pending_handoff';
    end if;
  end loop;

  perform set_config('app.documents_rpc', 'on', true);

  insert into public.document_shipments (
    code,
    method,
    carrier,
    tracking_no,
    driver_note,
    from_office_id,
    to_office_id,
    to_external_unit_id,
    note,
    status,
    sent_by
  )
  values (
    '',
    p_method,
    nullif(btrim(coalesce(p_carrier, '')), ''),
    nullif(btrim(coalesce(p_tracking_no, '')), ''),
    nullif(btrim(coalesce(p_driver_note, '')), ''),
    v_from_office_id,
    p_to_office_id,
    p_to_external_unit_id,
    nullif(btrim(coalesce(p_note, '')), ''),
    'in_transit'::public.shipment_status,
    v_uid
  )
  returning * into v_shipment;

  insert into public.document_shipment_items (
    shipment_id,
    document_id,
    status,
    prev_status
  )
  select
    v_shipment.id,
    d.id,
    'in_transit'::public.shipment_item_status,
    d.status
  from public.documents d
  where d.id = any(v_doc_ids)
  order by d.id;

  update public.documents
     set status = 'in_transit'::public.document_status
   where id = any(v_doc_ids);

  return v_shipment;
end;
$$;

-- ---------- RPC 2: confirm_shipment_items ----------
create or replace function public.confirm_shipment_items(
  p_shipment_id    uuid,
  p_document_ids   uuid[],
  p_recipient_name text default null,
  p_note           text default null
)
returns public.document_shipments
language plpgsql security definer set search_path = public as $$
declare
  v_uid              uuid := auth.uid();
  v_shipment         public.document_shipments%rowtype;
  v_doc_ids          uuid[];
  v_open_count       int;
  v_caller_office_id uuid;
  v_clean_note       text := nullif(btrim(coalesce(p_note, '')), '');
  v_clean_recipient  text := nullif(btrim(coalesce(p_recipient_name, '')), '');
begin
  if v_uid is null then
    raise exception 'Authentication required to confirm shipment items.'
      using detail = 'auth_required';
  end if;

  select *
    into v_shipment
    from public.document_shipments
   where id = p_shipment_id
     for update;

  if not found or v_shipment.status <> 'in_transit' then
    raise exception 'Shipment is not open for confirmation.'
      using detail = 'shipment_not_open';
  end if;

  select array_agg(distinct d_id order by d_id)
    into v_doc_ids
    from unnest(p_document_ids) as d_id
   where d_id is not null;

  if v_doc_ids is null or coalesce(array_length(v_doc_ids, 1), 0) = 0 then
    raise exception 'At least one document must be selected.'
      using detail = 'shipment_no_documents';
  end if;

  perform 1
    from public.document_shipment_items
   where shipment_id = p_shipment_id
     and document_id = any(v_doc_ids)
   order by document_id
     for update;

  select count(*)
    into v_open_count
    from public.document_shipment_items
   where shipment_id = p_shipment_id
     and document_id = any(v_doc_ids)
     and status = 'in_transit';

  if v_open_count <> array_length(v_doc_ids, 1) then
    raise exception 'One or more selected items do not belong to this shipment or are no longer in transit.'
      using detail = 'shipment_item_not_open';
  end if;

  perform 1
    from public.documents
   where id = any(v_doc_ids)
   order by id
     for update;

  perform set_config('app.documents_rpc', 'on', true);

  if v_shipment.to_office_id is not null then
    select office_id
      into v_caller_office_id
      from public.profiles
     where id = v_uid;

    if v_caller_office_id is distinct from v_shipment.to_office_id
       and not public.is_leader_or_admin() then
      raise exception 'Only destination office staff, a leader, or an admin may confirm receipt.'
        using detail = 'shipment_not_destination_staff';
    end if;

    update public.document_shipment_items
       set status      = 'received'::public.shipment_item_status,
           received_by = v_uid,
           received_at = now(),
           note        = coalesce(v_clean_note, note)
     where shipment_id = p_shipment_id
       and document_id = any(v_doc_ids);

    update public.documents
       set status            = 'at_office'::public.document_status,
           current_office_id = v_shipment.to_office_id,
           current_holder_id = v_uid
     where id = any(v_doc_ids);
  else
    if v_shipment.sent_by is distinct from v_uid
       and not public.is_leader_or_admin() then
      raise exception 'Only the sender, a leader, or an admin may confirm external delivery.'
        using detail = 'shipment_not_sender';
    end if;

    if v_clean_recipient is not null then
      update public.document_shipments
         set recipient_name = v_clean_recipient
       where id = p_shipment_id;
    end if;

    update public.document_shipment_items
       set status      = 'received'::public.shipment_item_status,
           received_by = v_uid,
           received_at = now(),
           note        = coalesce(v_clean_note, note)
     where shipment_id = p_shipment_id
       and document_id = any(v_doc_ids);

    update public.documents
       set status = 'delivered_external'::public.document_status
     where id = any(v_doc_ids);
  end if;

  perform public.resolve_shipment(p_shipment_id);

  select *
    into v_shipment
    from public.document_shipments
   where id = p_shipment_id;

  return v_shipment;
end;
$$;

-- ---------- RPC 3: mark_document_lost ----------
create or replace function public.mark_document_lost(
  p_document_id uuid,
  p_reason      text
)
returns public.documents
language plpgsql security definer set search_path = public as $$
declare
  v_uid              uuid := auth.uid();
  v_reason           text := btrim(coalesce(p_reason, ''));
  v_doc              public.documents%rowtype;
  v_open_shipment_id uuid;
  v_open_shipment    public.document_shipments%rowtype;
  v_item_status      public.shipment_item_status;
  v_caller_office_id uuid;
  v_allowed          boolean;
begin
  if v_uid is null then
    raise exception 'Authentication required to mark a document as lost.'
      using detail = 'auth_required';
  end if;

  if v_reason = '' then
    raise exception 'A reason is required when marking a document as lost.'
      using detail = 'lost_reason_required';
  end if;

  -- Find the open shipment id without locking first so locks can be acquired
  -- in canonical order: shipment -> item -> document (matching confirm/cancel).
  select dsi.shipment_id
    into v_open_shipment_id
    from public.document_shipment_items dsi
   where dsi.document_id = p_document_id
     and dsi.status = 'in_transit';

  if v_open_shipment_id is not null then
    select *
      into v_open_shipment
      from public.document_shipments
     where id = v_open_shipment_id
       for update;

    select dsi.status
      into v_item_status
      from public.document_shipment_items dsi
     where dsi.shipment_id = v_open_shipment_id
       and dsi.document_id = p_document_id
       for update;
  end if;

  select *
    into v_doc
    from public.documents
   where id = p_document_id
     for update;

  if not found then
    raise exception 'Document % not found.', p_document_id
      using detail = 'shipment_document_unavailable';
  end if;

  if v_doc.status = 'lost' then
    raise exception 'Document is already marked as lost.'
      using detail = 'document_already_lost';
  end if;

  -- Re-check after locking that the item is still in_transit; if not, treat as no open shipment.
  if v_open_shipment_id is not null and (
    v_item_status is distinct from 'in_transit'
    or v_open_shipment.status is distinct from 'in_transit'
  ) then
    v_open_shipment_id := null;
    v_open_shipment := null;
  end if;

  select office_id
    into v_caller_office_id
    from public.profiles
   where id = v_uid;

  v_allowed := (v_doc.current_holder_id = v_uid)
    or exists (
      select 1
        from public.document_holders dh
       where dh.document_id = p_document_id
         and dh.user_id = v_uid
    )
    or public.is_leader_or_admin()
    or (
      v_open_shipment_id is not null
      and (
        v_open_shipment.sent_by = v_uid
        or (
          v_open_shipment.to_office_id is not null
          and v_caller_office_id = v_open_shipment.to_office_id
        )
      )
    );

  if not v_allowed then
    raise exception 'You are not allowed to mark this document as lost.'
      using detail = 'lost_not_allowed';
  end if;

  perform set_config('app.documents_rpc', 'on', true);

  update public.document_handoffs
     set status        = 'cancelled'::public.handoff_status,
         response_note = v_reason,
         responded_at  = now()
   where document_id = p_document_id
     and status = 'pending';

  if v_open_shipment_id is not null then
    update public.document_shipment_items
       set status      = 'lost'::public.shipment_item_status,
           lost_reason = v_reason
     where shipment_id = v_open_shipment_id
       and document_id = p_document_id
       and status = 'in_transit';
  end if;

  update public.documents
     set status = 'lost'::public.document_status
   where id = p_document_id
  returning * into v_doc;

  insert into public.document_logs (document_id, action, new_value, created_by)
  values (
    p_document_id,
    'marked_lost',
    jsonb_build_object(
      'reason', v_reason,
      'shipment_id', v_open_shipment_id
    ),
    v_uid
  );

  if v_open_shipment_id is not null then
    perform public.resolve_shipment(v_open_shipment_id);
  end if;

  return v_doc;
end;
$$;

-- ---------- RPC 4: cancel_shipment ----------
create or replace function public.cancel_shipment(
  p_shipment_id uuid,
  p_note        text default null
)
returns public.document_shipments
language plpgsql security definer set search_path = public as $$
declare
  v_uid        uuid := auth.uid();
  v_shipment   public.document_shipments%rowtype;
  v_clean_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_merged_note text;
begin
  if v_uid is null then
    raise exception 'Authentication required to cancel a shipment.'
      using detail = 'auth_required';
  end if;

  select *
    into v_shipment
    from public.document_shipments
   where id = p_shipment_id
     for update;

  if not found then
    raise exception 'Shipment not found.'
      using detail = 'shipment_cannot_cancel';
  end if;

  if v_shipment.sent_by is distinct from v_uid
     and not public.is_leader_or_admin() then
    raise exception 'Only the sender, a leader, or an admin may cancel this shipment.'
      using detail = 'shipment_not_sender';
  end if;

  perform 1
    from public.document_shipment_items
   where shipment_id = p_shipment_id
   order by document_id
     for update;

  if v_shipment.status <> 'in_transit'
     or exists (
       select 1
         from public.document_shipment_items
        where shipment_id = p_shipment_id
          and status in ('received', 'lost')
     ) then
    raise exception 'Shipment can only be cancelled while in transit and before any item is received or lost.'
      using detail = 'shipment_cannot_cancel';
  end if;

  perform 1
    from public.documents d
   where exists (
     select 1
       from public.document_shipment_items dsi
      where dsi.shipment_id = p_shipment_id
        and dsi.document_id = d.id
   )
   order by d.id
     for update;

  perform set_config('app.documents_rpc', 'on', true);

  update public.document_shipment_items
     set status = 'cancelled'::public.shipment_item_status,
         note   = coalesce(v_clean_note, note)
   where shipment_id = p_shipment_id;

  update public.documents d
     set status = dsi.prev_status
    from public.document_shipment_items dsi
   where dsi.shipment_id = p_shipment_id
     and d.id = dsi.document_id;

  if v_clean_note is not null then
    if v_shipment.note is null or btrim(v_shipment.note) = '' then
      v_merged_note := v_clean_note;
    else
      v_merged_note := v_shipment.note || E'\n' || v_clean_note;
    end if;
  else
    v_merged_note := v_shipment.note;
  end if;

  update public.document_shipments
     set status       = 'cancelled'::public.shipment_status,
         completed_at = now(),
         note         = v_merged_note
   where id = p_shipment_id
  returning * into v_shipment;

  return v_shipment;
end;
$$;

grant execute on function public.create_shipment(
  uuid[],
  public.shipment_method,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  uuid
) to authenticated;

grant execute on function public.confirm_shipment_items(
  uuid,
  uuid[],
  text,
  text
) to authenticated;

grant execute on function public.mark_document_lost(uuid, text) to authenticated;
grant execute on function public.cancel_shipment(uuid, text) to authenticated;

-- ---------- Update create_handoff: block unavailable statuses ----------
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

  if v_doc.status in ('in_transit', 'lost', 'delivered_external', 'archived') then
    raise exception 'Document % cannot be handed off in status %.', v_doc.code, v_doc.status
      using detail = 'handoff_document_unavailable';
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

-- ---------- Row Level Security ----------
alter table public.external_units          enable row level security;
alter table public.shipment_code_counters  enable row level security;
alter table public.document_shipments      enable row level security;
alter table public.document_shipment_items enable row level security;

-- external_units: select all authenticated; insert own; update any authenticated;
-- delete creator or leader/admin (FK restrict protects units referenced by shipments).
drop policy if exists "external_units_select_all" on public.external_units;
create policy "external_units_select_all" on public.external_units
  for select to authenticated using (true);

drop policy if exists "external_units_insert_own" on public.external_units;
create policy "external_units_insert_own" on public.external_units
  for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists "external_units_update_authenticated" on public.external_units;
create policy "external_units_update_authenticated" on public.external_units
  for update to authenticated
  using (true)
  with check (true);

drop policy if exists "external_units_delete_creator_or_leader" on public.external_units;
create policy "external_units_delete_creator_or_leader" on public.external_units
  for delete to authenticated
  using (created_by = auth.uid() or public.is_leader_or_admin());

-- document_shipments & document_shipment_items: select all authenticated; no write policies (RPC only)
drop policy if exists "document_shipments_select_all" on public.document_shipments;
create policy "document_shipments_select_all" on public.document_shipments
  for select to authenticated using (true);

drop policy if exists "document_shipment_items_select_all" on public.document_shipment_items;
create policy "document_shipment_items_select_all" on public.document_shipment_items
  for select to authenticated using (true);

-- shipment_code_counters: no client policies (accessed only by security definer trigger)

-- ---------- Realtime ----------
do $$
begin
  begin
    alter publication supabase_realtime add table public.document_shipments;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.document_shipment_items;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.external_units;
  exception when duplicate_object then null;
  end;
end $$;

alter table public.document_shipment_items replica identity full;
