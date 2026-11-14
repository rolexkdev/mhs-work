-- =============================================================
-- 0021 — User activity log (sign-ins and page views)
-- Lets admins see, per account, when someone signed in and which
-- pages they opened. Task changes are already traced in task_logs.
-- Rows are written by the app as the signed-in user; only admins
-- can read them. Run in the Supabase SQL Editor.
-- =============================================================

create table if not exists public.user_activity (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid()
             references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('login', 'page_view')),
  path       text,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_activity_user_time
  on public.user_activity (user_id, created_at desc);

alter table public.user_activity enable row level security;

drop policy if exists "user_activity_insert_own" on public.user_activity;
create policy "user_activity_insert_own" on public.user_activity
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "user_activity_select_admin" on public.user_activity;
create policy "user_activity_select_admin" on public.user_activity
  for select to authenticated
  using (public.is_admin());

-- Optional housekeeping: keep roughly one year of history.
-- delete from public.user_activity where created_at < now() - interval '1 year';
