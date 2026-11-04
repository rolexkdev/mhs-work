-- 0019_document_intake_refactor.sql
--
-- Refactors the document flow around two intake staff:
--   * Removes shipments, external units and lost reporting (0018).
--   * Adds profiles.can_manage_documents; only flagged users (and only they)
--     may create / edit / delete documents or start / cancel handoffs.
--     Everyone else can view and search. Recipients may still answer their
--     own handoffs (respond_handoff) and attach proof photos to them.
--   * Adds documents.quantity, received_at / received_by (intake) and
--     delivered_at / delivered_to (set when a recipient accepts a handoff).
--
-- BACK UP document_shipments, document_shipment_items and external_units
-- before applying: the drops below are irreversible.
-- Idempotent: safe to run more than once.

-- ---------- 1. Remap documents out of the removed statuses ----------
-- Enum labels in_transit / delivered_external / lost stay in the type
-- (Postgres cannot drop enum values cheaply) but are no longer used.
do $$
begin
  perform set_config('app.documents_rpc', 'on', true);

  update public.documents set status = 'at_office' where status in ('in_transit', 'lost');
  update public.documents set status = 'done' where status = 'delivered_external';
end $$;

-- ---------- 2. Drop shipments / external units ----------
drop function if exists public.create_shipment(
  uuid[], public.shipment_method, uuid, uuid, text, text, text, text, uuid);
drop function if exists public.confirm_shipment_items(uuid, uuid[], text, text);
drop function if exists public.mark_document_lost(uuid, text);
drop function if exists public.cancel_shipment(uuid, text);
drop function if exists public.resolve_shipment(uuid);

drop table if exists public.document_shipment_items cascade;
drop table if exists public.document_shipments cascade;
drop table if exists public.shipment_code_counters cascade;
drop table if exists public.external_units cascade;

drop function if exists public.log_document_shipment_item_change();
drop function if exists public.before_insert_document_shipment();

drop type if exists public.shipment_item_status;
drop type if exists public.shipment_status;
drop type if exists public.shipment_method;

-- Attachments that belonged only to a shipment are removed (the storage
-- objects under shipments/ must be cleaned up from the Storage dashboard).
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'document_attachments'
       and column_name = 'shipment_id'
  ) then
    delete from public.document_attachments where document_id is null;
  end if;
end $$;

alter table public.document_attachments drop column if exists shipment_id;
alter table public.document_attachments
  drop constraint if exists chk_document_attachments_target;
alter table public.document_attachments
  alter column document_id set not null;

-- ---------- 3. Intake permission ----------
alter table public.profiles
  add column if not exists can_manage_documents boolean not null default false;

create or replace function public.can_manage_documents()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select can_manage_documents from public.profiles where id = auth.uid()),
    false
  );
$$;

grant execute on function public.can_manage_documents() to authenticated;

-- Only administrators may change role, office_id or can_manage_documents.
create or replace function public.guard_profile_protected_columns()
returns trigger
language plpgsql as $$
begin
  if new.id is distinct from old.id
     or new.email is distinct from old.email then
    raise exception 'Profile id and email cannot be changed.';
  end if;

  if (new.role is distinct from old.role
      or new.office_id is distinct from old.office_id
      or new.can_manage_documents is distinct from old.can_manage_documents)
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Only administrators may change profile role, office_id or can_manage_documents.';
  end if;

  return new;
end;
$$;

-- ---------- 4. Document columns ----------
do $$
begin
  perform set_config('app.documents_rpc', 'on', true);

  -- Backfill runs only the first time the columns are added, so a re-run
  -- never overwrites intake dates entered by staff.
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'documents'
       and column_name = 'received_at'
  ) then
    alter table public.documents
      add column quantity     int not null default 1,
      add column received_at  timestamptz not null default now(),
      add column received_by  uuid references public.profiles (id) on delete set null default auth.uid(),
      add column delivered_at timestamptz,
      add column delivered_to uuid references public.profiles (id) on delete set null;

    update public.documents
       set received_at = created_at,
           received_by = created_by;

    update public.documents d
       set delivered_at = h.responded_at,
           delivered_to = h.to_user
      from (
        select distinct on (document_id) document_id, to_user, responded_at
          from public.document_handoffs
         where status = 'accepted'
           and kind in ('assign', 'forward')
         order by document_id, responded_at desc
      ) h
     where h.document_id = d.id;
  end if;
end $$;

alter table public.documents drop constraint if exists chk_documents_quantity;
alter table public.documents
  add constraint chk_documents_quantity check (quantity > 0);

create index if not exists idx_documents_delivered_to on public.documents (delivered_to);

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
       or new.current_office_id is distinct from old.current_office_id
       or new.delivered_at is distinct from old.delivered_at
       or new.delivered_to is distinct from old.delivered_to then
      raise exception 'Protected columns (status, current_holder_id, current_office_id, delivered_at, delivered_to) may only be changed via handoff RPCs.';
    end if;
  end if;
  return new;
end;
$$;

-- ---------- 5. Record delivery when a recipient accepts a handoff ----------
create or replace function public.record_document_delivery()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'accepted'
     and old.status is distinct from 'accepted'
     and new.kind in ('assign', 'forward') then
    perform set_config('app.documents_rpc', 'on', true);
    update public.documents
       set delivered_at = coalesce(new.responded_at, now()),
           delivered_to = new.to_user
     where id = new.document_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_document_handoff_delivery on public.document_handoffs;
create trigger trg_document_handoff_delivery
  after update on public.document_handoffs
  for each row execute function public.record_document_delivery();

-- ---------- 6. Only intake staff may start / cancel handoffs ----------
-- create_handoff / cancel_handoff are security definer RPCs; auth.uid() still
-- reflects the caller, so the guard sits on the table. A null auth.uid()
-- (SQL Editor / service role) is allowed for maintenance.
create or replace function public.guard_handoff_staff_only()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' and not public.can_manage_documents() then
    raise exception 'Only document intake staff may create handoffs.';
  end if;

  if tg_op = 'UPDATE'
     and new.status = 'cancelled'
     and old.status is distinct from 'cancelled'
     and not public.can_manage_documents() then
    raise exception 'Only document intake staff may cancel handoffs.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_document_handoff_staff_only on public.document_handoffs;
create trigger trg_document_handoff_staff_only
  before insert or update on public.document_handoffs
  for each row execute function public.guard_handoff_staff_only();

-- ---------- 7. RLS: edit rights limited to intake staff ----------
drop policy if exists "documents_insert_authenticated" on public.documents;
drop policy if exists "documents_insert_staff" on public.documents;
create policy "documents_insert_staff" on public.documents
  for insert to authenticated
  with check (created_by = auth.uid() and public.can_manage_documents());

drop policy if exists "documents_update_authenticated" on public.documents;
drop policy if exists "documents_update_staff" on public.documents;
create policy "documents_update_staff" on public.documents
  for update to authenticated
  using (public.can_manage_documents())
  with check (public.can_manage_documents());

drop policy if exists "documents_delete_creator_or_admin" on public.documents;
drop policy if exists "documents_delete_staff" on public.documents;
create policy "documents_delete_staff" on public.documents
  for delete to authenticated
  using (public.can_manage_documents());

-- Attachments: staff upload freely; a handoff recipient may attach proof
-- photos to their own handoff.
drop policy if exists "document_attachments_insert_own" on public.document_attachments;
drop policy if exists "document_attachments_insert_staff_or_recipient" on public.document_attachments;
create policy "document_attachments_insert_staff_or_recipient"
  on public.document_attachments
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and (
      public.can_manage_documents()
      or exists (
        select 1
          from public.document_handoffs h
         where h.id = document_attachments.handoff_id
           and h.to_user = auth.uid()
      )
    )
  );

drop policy if exists "document_attachments_delete_own_or_leader" on public.document_attachments;
drop policy if exists "document_attachments_delete_staff_or_own" on public.document_attachments;
create policy "document_attachments_delete_staff_or_own"
  on public.document_attachments
  for delete to authenticated
  using (public.can_manage_documents() or uploaded_by = auth.uid());

-- Storage upload stays open to authenticated users (the bucket policy cannot
-- see handoffs); the document_attachments row policy above is the real gate.
