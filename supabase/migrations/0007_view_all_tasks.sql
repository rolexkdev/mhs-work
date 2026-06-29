-- =============================================================
-- 0007 — Cho phép XEM toàn bộ task & chi tiết task
-- Quy tắc mới:
--   • Mọi user đã đăng nhập: XEM hết task, meeting và chi tiết task.
--   • SỬA task: chỉ người phụ trách (assignee) hoặc admin/leader.
--   • TẠO / XÓA task: chỉ admin/leader (giữ nguyên).
-- Chạy trong Supabase SQL Editor (hoặc supabase db push).
-- =============================================================

-- ---------- tasks: ai cũng xem được ----------
drop policy if exists "tasks_select_scope" on public.tasks;

create policy "tasks_select_all" on public.tasks
  for select to authenticated using (true);

-- (Giữ nguyên) tasks_update_scope, tasks_insert_leader_admin,
-- tasks_delete_leader_admin — không đổi quyền sửa/tạo/xóa.

-- ---------- chi tiết task: cho xem hết, quyền ghi giữ nguyên ----------
drop policy if exists "comments_select" on public.task_comments;
create policy "comments_select" on public.task_comments
  for select to authenticated using (true);

drop policy if exists "checklists_select" on public.task_checklists;
create policy "checklists_select" on public.task_checklists
  for select to authenticated using (true);

drop policy if exists "attachments_select" on public.task_attachments;
create policy "attachments_select" on public.task_attachments
  for select to authenticated using (true);

drop policy if exists "logs_select" on public.task_logs;
create policy "logs_select" on public.task_logs
  for select to authenticated using (true);
