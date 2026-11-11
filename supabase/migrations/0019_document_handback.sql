-- =============================================================
-- 0019 — Document hand-back to sender
-- After the route is done the paper document comes back to KCN and is
-- handed to the sender, who confirms receipt:
--   Chờ nhận lại       -> route done, received_back_at null
--   Đã nhận lại        -> received_back_at set, handed_over_at null
--   Chờ người gửi nhận -> handed_over_at set, finished_at null
--   Hoàn thành         -> finished_at set (by doc_sender_confirm)
--
-- Progress RPCs set the transaction-local flag app.doc_rpc = 'on' so the
-- guard trigger lets them write progress columns even when the caller is
-- the sender rather than a document manager.
--
-- Idempotent. Run manually in the Supabase SQL Editor after 0018.
-- =============================================================

-- ---------- Columns ----------
alter table public.documents
  add column if not exists received_back_at timestamptz,
  add column if not exists handed_over_at timestamptz,
  add column if not exists sender_confirmed_at timestamptz,
  add column if not exists sender_confirmed_by uuid
    references public.profiles (id) on delete set null;

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
      'sender_confirm'
    )
  );

-- ---------- Guard ----------
-- True inside a progress RPC (flag set with set_config(..., true)).
create or replace function public.doc_in_rpc()
returns boolean
language sql stable as $$
  select coalesce(current_setting('app.doc_rpc', true), '') = 'on';
$$;

-- Same rules as 0017, extended to the hand-back columns. Progress
-- columns may change only through the RPCs, or by a document manager.
create or replace function public.guard_document_protected_columns()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_allowed boolean :=
    auth.uid() is null
    or public.doc_in_rpc()
    or public.can_manage_documents();
begin
  if tg_op = 'INSERT' then
    if (
         new.finished_at is not null
         or new.received_back_at is not null
         or new.handed_over_at is not null
         or new.sender_confirmed_at is not null
         or new.sender_confirmed_by is not null
       )
       and not v_allowed then
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

  if (
       new.finished_at is distinct from old.finished_at
       or new.received_back_at is distinct from old.received_back_at
       or new.handed_over_at is distinct from old.handed_over_at
       or new.sender_confirmed_at is distinct from old.sender_confirmed_at
       or new.sender_confirmed_by is distinct from old.sender_confirmed_by
     )
     and not v_allowed then
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
