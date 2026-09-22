-- =============================================================
-- 0013 — Zalo Mini App: liên kết tài khoản + nhắc việc qua OA
-- • zalo_links: Zalo của nhân viên ↔ profile (1-1). Ghi bởi Edge Function
--   `zalo-auth` (service role); nhân viên chỉ được bật/tắt nhắc việc.
-- • zalo_oa_tokens: token OA công ty (chỉ service role đọc/ghi).
-- • zalo_reminder_log: chống gửi trùng trong ngày + tra lỗi gửi.
-- Chạy trong Supabase SQL Editor (hoặc supabase db push).
-- =============================================================

create table if not exists public.zalo_links (
  profile_id      uuid primary key references public.profiles(id) on delete cascade,
  -- ID người dùng theo Zalo App (getUserInfo().id / Graph API /me)
  zalo_user_id    text not null unique,
  -- ID người dùng theo OA (getUserInfo().idByOA) — dùng để gửi tin nhắc
  zalo_oa_user_id text,
  zalo_name       text,
  remind_enabled  boolean not null default true,
  linked_at       timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_zalo_links_oa on public.zalo_links (zalo_oa_user_id);

alter table public.zalo_links enable row level security;

drop policy if exists "zalo_links_select_own" on public.zalo_links;
create policy "zalo_links_select_own" on public.zalo_links
  for select using (profile_id = auth.uid());

drop policy if exists "zalo_links_update_own" on public.zalo_links;
create policy "zalo_links_update_own" on public.zalo_links
  for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());

drop policy if exists "zalo_links_delete_own" on public.zalo_links;
create policy "zalo_links_delete_own" on public.zalo_links
  for delete using (profile_id = auth.uid());

-- Nhân viên chỉ được đổi cột bật/tắt nhắc việc, không sửa được ID Zalo.
revoke update on public.zalo_links from authenticated;
grant update (remind_enabled) on public.zalo_links to authenticated;

create or replace function public.touch_zalo_links()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_zalo_links_updated on public.zalo_links;
create trigger trg_zalo_links_updated
  before update on public.zalo_links
  for each row execute function public.touch_zalo_links();

-- ---------------------------------------------------------------
-- Token OA: 1 dòng duy nhất. refresh_token XOAY VÒNG — mỗi lần làm mới
-- Zalo trả refresh_token mới và cái cũ chết ngay, nên phải ghi lại ngay.
-- Không có policy → chỉ service role (Edge Function) truy cập được.
-- ---------------------------------------------------------------
create table if not exists public.zalo_oa_tokens (
  id            int primary key default 1 check (id = 1),
  access_token  text not null,
  refresh_token text not null,
  expires_at    timestamptz not null,
  updated_at    timestamptz not null default now()
);
alter table public.zalo_oa_tokens enable row level security;

-- ---------------------------------------------------------------
-- Nhật ký gửi nhắc việc
-- ---------------------------------------------------------------
create table if not exists public.zalo_reminder_log (
  id          bigint generated always as identity primary key,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  sent_on     date not null,
  status      text not null check (status in ('sent', 'failed', 'skipped')),
  error       text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_zalo_reminder_log_day
  on public.zalo_reminder_log (sent_on, profile_id);
alter table public.zalo_reminder_log enable row level security;

drop policy if exists "zalo_reminder_log_admin" on public.zalo_reminder_log;
create policy "zalo_reminder_log_admin" on public.zalo_reminder_log
  for select using (public.is_admin());
