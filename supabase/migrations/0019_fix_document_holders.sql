-- =============================================================
-- 0019 — Fix document_holders
--
-- The app only creates 'assign' handoffs, but the document_holders view
-- (0016) only treated 'forward' / 'return' handoffs as "passed the document
-- on". Everyone who had ever accepted a handoff therefore stayed listed as a
-- holder, which:
--   * kept already-forwarded documents in the "Tôi đang giữ" tab, and
--   * let those users keep creating handoffs (create_handoff checks the view).
--
-- A user now stops being a holder as soon as a handoff FROM them, of any
-- kind, is accepted at or after the time they received the document.
-- Columns are unchanged, so dependants keep working.
-- Idempotent. Run manually in the Supabase SQL Editor.
-- =============================================================

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
    and h2.status      = 'accepted'
    and coalesce(h2.responded_at, h2.created_at) >= coalesce(latest.responded_at, latest.created_at)
    and h2.id <> latest.id
);

grant select on public.document_holders to authenticated;
