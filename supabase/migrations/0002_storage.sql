-- =============================================================
-- Storage bucket cho file đính kèm task
-- =============================================================
insert into storage.buckets (id, name, public)
values ('task-attachments', 'task-attachments', false)
on conflict (id) do nothing;

-- User đã đăng nhập đọc được file trong bucket.
create policy "attachments_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'task-attachments');

-- User đã đăng nhập upload file (owner = chính họ).
create policy "attachments_upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'task-attachments' and owner = auth.uid());

-- Chỉ owner xoá được file của mình.
create policy "attachments_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'task-attachments' and owner = auth.uid());
