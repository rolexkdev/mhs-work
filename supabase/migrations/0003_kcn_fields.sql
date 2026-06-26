-- =============================================================
-- Bổ sung các trường theo database "Công việc KCN" (Notion)
--   Phòng/Nhóm, Hạng mục, Cập nhật mới nhất, Lý do / Ghi chú
-- Dùng text (không enum) để linh hoạt thêm/bớt lựa chọn sau này.
-- =============================================================
alter table public.tasks
  add column if not exists department    text,  -- Phòng/Nhóm
  add column if not exists category       text,  -- Hạng mục (HC/IT/Bảo trì)
  add column if not exists latest_update  text,  -- Cập nhật mới nhất
  add column if not exists note           text;  -- Lý do / Ghi chú

create index if not exists idx_tasks_department on public.tasks (department);
create index if not exists idx_tasks_category   on public.tasks (category);
