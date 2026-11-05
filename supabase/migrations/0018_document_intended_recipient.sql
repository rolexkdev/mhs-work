-- =============================================================
-- 0018 — Document intended recipient + extended change logging
-- Adds intended_recipient_id to documents (informational only;
-- creating a document no longer creates a handoff) and extends
-- log_document_change() to record inline edits to
-- intended_recipient_id, category, priority, quantity, and received_at.
-- Idempotent. Run manually in the Supabase SQL Editor.
-- =============================================================

alter table public.documents
  add column if not exists intended_recipient_id uuid
  references public.profiles (id) on delete set null;

create index if not exists idx_documents_intended_recipient
  on public.documents (intended_recipient_id);

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

  if new.intended_recipient_id is distinct from old.intended_recipient_id then
    insert into public.document_logs (document_id, action, old_value, new_value, created_by)
    values (new.id, 'intended_recipient_id', to_jsonb(old.intended_recipient_id), to_jsonb(new.intended_recipient_id), uid);
  end if;

  if new.category is distinct from old.category then
    insert into public.document_logs (document_id, action, old_value, new_value, created_by)
    values (new.id, 'category', to_jsonb(old.category), to_jsonb(new.category), uid);
  end if;

  if new.priority is distinct from old.priority then
    insert into public.document_logs (document_id, action, old_value, new_value, created_by)
    values (new.id, 'priority', to_jsonb(old.priority), to_jsonb(new.priority), uid);
  end if;

  if new.quantity is distinct from old.quantity then
    insert into public.document_logs (document_id, action, old_value, new_value, created_by)
    values (new.id, 'quantity', to_jsonb(old.quantity), to_jsonb(new.quantity), uid);
  end if;

  if new.received_at is distinct from old.received_at then
    insert into public.document_logs (document_id, action, old_value, new_value, created_by)
    values (new.id, 'received_at', to_jsonb(old.received_at), to_jsonb(new.received_at), uid);
  end if;

  return new;
end;
$$;
