-- =============================================================
-- Tiến độ thủ công của "task lớn" — do chủ task tự báo cáo (dial tròn).
-- Tách biệt với cột `progress` (tự tính từ checklist/việc con).
-- =============================================================
alter table public.tasks
  add column if not exists manual_progress int not null default 0
    check (manual_progress between 0 and 100);
