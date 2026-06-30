-- =============================================================
-- 0011 — Hiển thị theo tuần lịch
-- Thêm:
--   • recurrence   : việc lặp lại (none/daily/weekly) → luôn hiện mọi tuần.
--   • completed_at : mốc hoàn thành, để task xong sớm không kéo sang tuần sau.
--   • hidden_weeks : danh sách tuần (yyyy-mm-dd của Thứ 2) admin ẩn task thủ công.
-- Chạy trong Supabase SQL Editor (hoặc supabase db push).
-- =============================================================

alter table public.tasks
  add column if not exists recurrence   text        not null default 'none'
    check (recurrence in ('none', 'daily', 'weekly')),
  add column if not exists completed_at timestamptz,
  add column if not exists hidden_weeks text[]      not null default '{}';

-- Tự đặt/huỷ completed_at theo trạng thái 'done'.
create or replace function public.set_task_completed_at()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT') then
    if new.status = 'done' then
      new.completed_at := coalesce(new.completed_at, now());
    end if;
    return new;
  end if;

  if new.status = 'done' and old.status is distinct from 'done' then
    new.completed_at := now();
  elsif new.status <> 'done' and old.status = 'done' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_task_completed_at on public.tasks;
create trigger trg_task_completed_at
  before insert or update on public.tasks
  for each row execute function public.set_task_completed_at();

-- Backfill: task đã 'done' từ trước → lấy updated_at làm mốc hoàn thành.
update public.tasks
  set completed_at = updated_at
  where status = 'done' and completed_at is null;
