-- =============================================================
-- TaskApp — Dọn data cũ (test/seed) để đưa công việc thật vào
-- =============================================================
-- Phạm vi: XÓA toàn bộ meetings + tasks và data con
--   (task_comments, task_checklists, task_attachments, task_logs).
-- GIỮ NGUYÊN: profiles (users) và auth.users (tài khoản đăng nhập),
--   toàn bộ schema, RLS, triggers, functions.
--
-- Cách chạy: dán file này vào Supabase SQL Editor rồi Run.
-- LƯU Ý: thao tác này KHÔNG hoàn tác được. Nên backup trước nếu cần.
-- =============================================================

begin;

-- Đếm trước khi xóa (xem trong tab Results để đối chiếu)
select
  (select count(*) from public.meetings)         as meetings,
  (select count(*) from public.tasks)            as tasks,
  (select count(*) from public.task_comments)    as comments,
  (select count(*) from public.task_checklists)  as checklists,
  (select count(*) from public.task_attachments) as attachments,
  (select count(*) from public.task_logs)        as logs;

-- Xóa sạch dữ liệu. TRUNCATE nhanh, không kích hoạt trigger,
-- CASCADE đảm bảo không lỗi ràng buộc khóa ngoại giữa các bảng này.
-- profiles KHÔNG bị đụng tới (nó là bảng cha, không phải bảng con).
truncate table
  public.meetings,
  public.tasks,
  public.task_comments,
  public.task_checklists,
  public.task_attachments,
  public.task_logs
restart identity cascade;

commit;

-- =============================================================
-- (TÙY CHỌN) Dọn file đính kèm mồ côi trong Storage
-- -------------------------------------------------------------
-- Xóa row task_attachments ở trên KHÔNG xóa file thật trong bucket.
-- Bỏ comment 2 dòng dưới nếu muốn xóa luôn mọi file trong bucket
-- 'task-attachments'. (Cũng không hoàn tác được.)
-- =============================================================
-- delete from storage.objects where bucket_id = 'task-attachments';
