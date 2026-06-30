-- =============================================================
-- 0012 — Hoàn thành thì tiến độ = 100%, hủy thì khôi phục
-- Khi status → 'done': lưu lại manual_progress cũ và set 100%.
-- Khi bỏ 'done': khôi phục về giá trị trước đó (0 nếu chưa từng có).
-- Gộp vào trigger set_task_completed_at sẵn có (0011).
-- Chạy trong Supabase SQL Editor (hoặc supabase db push).
-- =============================================================

alter table public.tasks
  add column if not exists manual_progress_prev int;

create or replace function public.set_task_completed_at()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT') then
    if new.status = 'done' then
      new.completed_at := coalesce(new.completed_at, now());
      new.manual_progress := 100;
    end if;
    return new;
  end if;

  if new.status = 'done' and old.status is distinct from 'done' then
    new.completed_at := now();
    new.manual_progress_prev := old.manual_progress;  -- nhớ giá trị cũ
    new.manual_progress := 100;
  elsif new.status <> 'done' and old.status = 'done' then
    new.completed_at := null;
    new.manual_progress := coalesce(old.manual_progress_prev, 0); -- khôi phục
    new.manual_progress_prev := null;
  end if;
  return new;
end;
$$;
