-- =============================================================
-- 0020 — Remove the document submission feature (0016-0019)
--
-- BREAKING: permanently deletes all data in offices, documents,
-- document_handoffs, document_attachments, document_logs and
-- document_code_counters, plus profiles.office_id, profiles.department and
-- profiles.can_manage_documents. Back them up first if the data matters.
--
-- Also removes the document_holders view, the handoff RPCs, the document
-- trigger functions, can_manage_documents(), the document enums and the
-- document-files storage policies.
--
-- Kept on purpose: guard_profile_protected_columns and its trigger, narrowed
-- to id, email and role, because it stops users from promoting themselves.
-- tasks.department and meeting_items.department are unrelated and untouched.
--
-- Not removed here: the document-files bucket and its files. Supabase rejects
-- direct deletes on storage tables, so empty and delete the bucket from the
-- Storage dashboard.
--
-- Deploy the app version without the feature before running this.
-- No CASCADE: an unexpected dependent makes this fail and roll back instead
-- of being dropped silently.
-- Idempotent. Run manually in the Supabase SQL Editor.
-- =============================================================

begin;

-- ---------- Profile guard: stop reading the columns dropped below ----------
create or replace function public.guard_profile_protected_columns()
returns trigger
language plpgsql as $$
begin
  if new.id is distinct from old.id
     or new.email is distinct from old.email then
    raise exception 'Profile id and email cannot be changed.';
  end if;

  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Only administrators may change profile role.';
  end if;

  return new;
end;
$$;

-- ---------- Objects that depend on the table row types ----------
drop view if exists public.document_holders;

drop function if exists public.create_handoff(uuid, uuid[], public.handoff_kind, text);
drop function if exists public.respond_handoff(uuid, boolean, text);
drop function if exists public.cancel_handoff(uuid, text);

-- ---------- Tables ----------
-- Children first: document_attachments has a policy that reads document_handoffs.
drop table if exists public.document_attachments;
drop table if exists public.document_logs;
drop table if exists public.document_handoffs;
drop table if exists public.documents;
drop table if exists public.document_code_counters;

-- ---------- Profile columns (office_id must go before offices) ----------
alter table public.profiles
  drop column if exists office_id,
  drop column if exists department,
  drop column if exists can_manage_documents;

drop table if exists public.offices;

-- ---------- Functions used only by the dropped tables ----------
drop function if exists public.before_insert_document();
drop function if exists public.guard_document_protected_columns();
drop function if exists public.log_document_change();
drop function if exists public.log_document_handoff_change();
drop function if exists public.record_document_delivery();
drop function if exists public.guard_handoff_staff_only();
drop function if exists public.can_manage_documents();

-- ---------- Enums ----------
drop type if exists public.document_status;
drop type if exists public.handoff_kind;
drop type if exists public.handoff_status;

-- ---------- Storage policies ----------
drop policy if exists "document_files_read" on storage.objects;
drop policy if exists "document_files_upload" on storage.objects;
drop policy if exists "document_files_delete_own" on storage.objects;

commit;
