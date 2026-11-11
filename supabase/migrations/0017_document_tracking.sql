-- =============================================================
-- 0017 — Document tracking: schema, manager flag and RLS
-- Adds documents, document_steps and document_events, the
-- profiles.is_doc_manager flag, can_manage_documents(), and the
-- row level security described in docs/specs/document-tracking.md.
--
-- Status is derived from the rows, never stored as a free field:
--   Chờ gửi      -> no step received yet
--   Đang xử lý   -> current step received, not returned
--   Cần bổ sung  -> current step returned
--   Hoàn thành   -> documents.finished_at is set
--
-- Idempotent. Run manually in the Supabase SQL Editor.
-- =============================================================

-- ---------- Manager flag ----------
alter table public.profiles
  add column if not exists is_doc_manager boolean not null default false;

-- Admin or a user explicitly flagged as document manager.
create or replace function public.can_manage_documents()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (
      select p.role = 'admin' or p.is_doc_manager
      from public.profiles p
      where p.id = auth.uid()
    ),
    false
  );
$$;

-- Keep is_doc_manager admin-only, like role (0016). Service-role clients
-- and the SQL Editor have no JWT, so auth.uid() is null and changes stay
-- allowed for them.
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

  if new.is_doc_manager is distinct from old.is_doc_manager
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Only administrators may change the document manager flag.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_guard_protected on public.profiles;
create trigger trg_profiles_guard_protected
  before update on public.profiles
  for each row execute function public.guard_profile_protected_columns();

-- ---------- Tables ----------
create table if not exists public.documents (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) > 0),
  -- Defaults to the creator; kept null when the sender profile is deleted.
  sender_id   uuid default auth.uid() references public.profiles (id) on delete set null,
  note        text,
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  -- Set by the progress RPCs only; status is derived from it.
  finished_at timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists public.document_steps (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references public.documents (id) on delete cascade,
  step_order   int not null check (step_order > 0),
  department   text not null check (length(btrim(department)) > 0),
  received_at  timestamptz,
  done_at      timestamptz,
  -- Set when the step returns the document, cleared by doc_resend.
  returned_at  timestamptz,
  handler_name text,
  note         text,
  created_at   timestamptz not null default now(),
  unique (document_id, step_order)
);

create table if not exists public.document_events (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references public.documents (id) on delete cascade,
  action       text not null check (
    action in (
      'created',
      'edit',
      'route',
      'send',
      'forward',
      'return',
      'resend',
      'finish_early',
      'undo'
    )
  ),
  step_order   int,
  department   text,
  handler_name text,
  note         text,
  -- Descriptive data for the timeline (edit diff, route list, ...).
  payload      jsonb,
  -- Snapshot used by doc_undo to revert the action.
  undo_data    jsonb,
  -- Set on an undo event: the event it reverted.
  undo_of      uuid references public.document_events (id) on delete set null,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

-- Re-runs on a database created before the default existed.
alter table public.documents alter column created_by set default auth.uid();

create index if not exists idx_documents_created_at
  on public.documents (created_at desc);
create index if not exists idx_documents_sender
  on public.documents (sender_id);
create index if not exists idx_document_steps_document
  on public.document_steps (document_id, step_order);
create index if not exists idx_document_events_document
  on public.document_events (document_id, created_at desc);

-- ---------- Helpers ----------
-- True while the document is still a draft: nothing received yet.
create or replace function public.is_document_draft(p_document_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.documents d
    where d.id = p_document_id
      and d.finished_at is null
      and not exists (
        select 1
        from public.document_steps s
        where s.document_id = d.id
          and s.received_at is not null
      )
  );
$$;

-- ---------- Triggers ----------
-- Log creation and info edits. Progress changes are logged by the RPCs.
create or replace function public.log_document_change()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_payload jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.document_events (document_id, action, created_by)
    values (new.id, 'created', auth.uid());
    return new;
  end if;

  if new.name is distinct from old.name then
    v_payload := v_payload || jsonb_build_object(
      'name', jsonb_build_object('old', old.name, 'new', new.name)
    );
  end if;

  if new.sender_id is distinct from old.sender_id then
    v_payload := v_payload || jsonb_build_object(
      'sender_id', jsonb_build_object('old', old.sender_id, 'new', new.sender_id)
    );
  end if;

  if new.note is distinct from old.note then
    v_payload := v_payload || jsonb_build_object(
      'note', jsonb_build_object('old', old.note, 'new', new.note)
    );
  end if;

  if v_payload <> '{}'::jsonb then
    insert into public.document_events (document_id, action, payload, created_by)
    values (new.id, 'edit', v_payload, auth.uid());
  end if;

  return new;
end;
$$;

drop trigger if exists trg_documents_log on public.documents;
create trigger trg_documents_log
  after insert or update on public.documents
  for each row execute function public.log_document_change();

-- Id, creator and creation time are immutable. Progress flags are only
-- editable by document managers through the RPCs, including on insert so a
-- member cannot create an already-finished document.
create or replace function public.guard_document_protected_columns()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.finished_at is not null
       and auth.uid() is not null
       and not public.can_manage_documents() then
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

  if new.finished_at is distinct from old.finished_at
     and auth.uid() is not null
     and not public.can_manage_documents() then
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

-- ---------- Row Level Security ----------
alter table public.documents enable row level security;
alter table public.document_steps enable row level security;
alter table public.document_events enable row level security;

-- documents: everyone reads; the creator inserts their own document.
drop policy if exists "documents_select_all" on public.documents;
create policy "documents_select_all" on public.documents
  for select to authenticated using (true);

drop policy if exists "documents_insert_own" on public.documents;
create policy "documents_insert_own" on public.documents
  for insert to authenticated
  with check (created_by = auth.uid());

-- Name, sender and note: creator, document manager or admin.
drop policy if exists "documents_update_creator_or_manager" on public.documents;
create policy "documents_update_creator_or_manager" on public.documents
  for update to authenticated
  using (created_by = auth.uid() or public.can_manage_documents())
  with check (created_by = auth.uid() or public.can_manage_documents());

-- Delete: creator while still a draft; manager/admin in any status.
drop policy if exists "documents_delete_creator_draft_or_manager" on public.documents;
create policy "documents_delete_creator_draft_or_manager" on public.documents
  for delete to authenticated
  using (
    public.can_manage_documents()
    or (created_by = auth.uid() and public.is_document_draft(id))
  );

-- Steps and events are read-only for clients. Progress and route changes
-- go through the security definer functions in 0018_document_actions.sql.
drop policy if exists "document_steps_select_all" on public.document_steps;
create policy "document_steps_select_all" on public.document_steps
  for select to authenticated using (true);

drop policy if exists "document_events_select_all" on public.document_events;
create policy "document_events_select_all" on public.document_events
  for select to authenticated using (true);

-- ---------- Realtime ----------
-- Skip tables already in the publication (migration is idempotent).
do $$
begin
  begin
    alter publication supabase_realtime add table public.documents;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.document_steps;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.document_events;
  exception when duplicate_object then null;
  end;
end $$;

-- DELETE payloads need document_id so clients can invalidate the right cache.
alter table public.documents replica identity full;
alter table public.document_steps replica identity full;
alter table public.document_events replica identity full;
