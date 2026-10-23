-- =============================================================
-- 0014 — Đầu mục cuộc họp giao ban (meeting_items)
-- Mỗi cuộc họp có nhiều đầu mục chỉ đạo (lấy từ bảng tổng hợp
-- trong biên bản). Từ 1 đầu mục, mọi người bấm "Giao việc" để tạo
-- task (tasks.meeting_item_id) và đánh dấu "Đã xử lý" kèm kết quả,
-- để lãnh đạo xem lại cuộc họp đã giao gì và xử lý tới đâu.
-- Chạy trong Supabase SQL Editor (hoặc supabase db push).
-- =============================================================

do $$
begin
  create type public.meeting_item_status as enum ('open', 'in_progress', 'done');
exception when duplicate_object then null;
end $$;

create table if not exists public.meeting_items (
  id          uuid primary key default gen_random_uuid(),
  meeting_id  uuid not null references public.meetings (id) on delete cascade,
  -- Mảng trong biên bản, VD "I. Mảng xử lý nước thải & quan trắc"
  section     text,
  -- Hạng mục công việc, VD "Ống hóa chất Javel"
  title       text,
  -- Nội dung chỉ đạo / hành động
  content     text not null,
  -- Đơn vị phụ trách ghi trong biên bản (chữ tự do)
  department  text,
  -- Thời hạn ghi trong biên bản (chữ tự do: "Tuần tới", "Sáng mai"...)
  deadline    text,
  due_date    date,
  sort_order  int not null default 0,
  status      public.meeting_item_status not null default 'open',
  -- Kết quả xử lý (ghi khi đánh dấu đã xử lý)
  result      text,
  handled_by  uuid references public.profiles (id) on delete set null,
  handled_at  timestamptz,
  created_by  uuid not null default auth.uid() references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_meeting_items_meeting
  on public.meeting_items (meeting_id, sort_order);

alter table public.tasks
  add column if not exists meeting_item_id uuid
  references public.meeting_items (id) on delete set null;

create index if not exists idx_tasks_meeting_item on public.tasks (meeting_item_id);

-- updated_at tự cập nhật
create or replace function public.touch_meeting_item()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_meeting_items_touch on public.meeting_items;
create trigger trg_meeting_items_touch
  before update on public.meeting_items
  for each row execute function public.touch_meeting_item();

-- ---------- RLS: giống 0009 — công cụ nội bộ, ai đăng nhập cũng làm được ----------
alter table public.meeting_items enable row level security;

drop policy if exists "meeting_items_select_all" on public.meeting_items;
create policy "meeting_items_select_all" on public.meeting_items
  for select to authenticated using (true);

drop policy if exists "meeting_items_write_all" on public.meeting_items;
create policy "meeting_items_write_all" on public.meeting_items
  for all to authenticated using (true) with check (true);

-- ---------- Realtime ----------
do $$
begin
  begin
    alter publication supabase_realtime add table public.meeting_items;
  exception when duplicate_object then null;
  end;
end $$;
