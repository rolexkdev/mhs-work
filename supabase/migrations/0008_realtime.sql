-- =============================================================
-- 0008 — Mở rộng Realtime
-- Thêm meetings & task_attachments vào publication realtime,
-- và bật REPLICA IDENTITY FULL cho các bảng con để sự kiện DELETE
-- vẫn kèm task_id (client cần để làm mới đúng cache).
-- Chạy trong Supabase SQL Editor (hoặc supabase db push).
-- =============================================================

-- Thêm bảng vào publication (bỏ qua nếu đã có).
do $$
begin
  begin
    alter publication supabase_realtime add table public.meetings;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.task_attachments;
  exception when duplicate_object then null;
  end;
end $$;

-- DELETE payload kèm đủ cột cũ (mặc định chỉ có khóa chính).
alter table public.task_comments    replica identity full;
alter table public.task_checklists  replica identity full;
alter table public.task_attachments replica identity full;
