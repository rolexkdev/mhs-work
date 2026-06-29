-- =============================================================
-- 0009 — Cho phép mọi user đã đăng nhập CHỈNH SỬA công việc
-- Lý do: công cụ nội bộ, sẽ có trang lịch sử (task_logs) để trace.
-- Mở quyền tạo/sửa/xoá task + ghi checklist/comment/file cho mọi
-- user đã đăng nhập. (SELECT đã mở ở 0007.)
-- Chạy trong Supabase SQL Editor (hoặc supabase db push).
-- =============================================================

-- ---------- tasks: ai đăng nhập cũng tạo/sửa/xoá ----------
drop policy if exists "tasks_insert_leader_admin" on public.tasks;
drop policy if exists "tasks_update_scope"        on public.tasks;
drop policy if exists "tasks_delete_leader_admin" on public.tasks;

create policy "tasks_insert_all" on public.tasks
  for insert to authenticated with check (true);

create policy "tasks_update_all" on public.tasks
  for update to authenticated using (true) with check (true);

create policy "tasks_delete_all" on public.tasks
  for delete to authenticated using (true);

-- ---------- checklist: ai cũng ghi được ----------
drop policy if exists "checklists_write" on public.task_checklists;
create policy "checklists_write" on public.task_checklists
  for all to authenticated using (true) with check (true);

-- ---------- comment: ai cũng thêm (vẫn phải là của chính mình) ----------
drop policy if exists "comments_insert" on public.task_comments;
create policy "comments_insert" on public.task_comments
  for insert to authenticated with check (user_id = auth.uid());

-- ---------- attachment: ai cũng tải lên (vẫn ghi nhận người tải) ----------
drop policy if exists "attachments_insert" on public.task_attachments;
create policy "attachments_insert" on public.task_attachments
  for insert to authenticated with check (uploaded_by = auth.uid());
