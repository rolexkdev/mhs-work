-- =============================================================
-- SỬA LỖI: "Database error finding users" (Auth Admin API trả 500)
--
-- Nguyên nhân: một số cột token trong auth.users đang là NULL thay vì
-- chuỗi rỗng (thường do sửa tay bằng SQL trước đây). GoTrue đọc các cột
-- này bằng kiểu string không nhận NULL nên toàn bộ API Admin chết theo
-- một dòng hỏng — ở đây là phongdang@sikico.com.
--
-- Cách chạy: Supabase Dashboard → SQL Editor → New query → dán toàn bộ
-- file này → Run. An toàn, chạy lại nhiều lần cũng không sao.
-- =============================================================

-- 1) Xem trước dòng nào đang hỏng (tùy chọn, chỉ để kiểm tra)
select
  email,
  confirmation_token         is null as null_confirmation_token,
  recovery_token             is null as null_recovery_token,
  email_change               is null as null_email_change,
  email_change_token_new     is null as null_email_change_token_new,
  email_change_token_current is null as null_email_change_token_current,
  phone_change               is null as null_phone_change,
  phone_change_token         is null as null_phone_change_token,
  reauthentication_token     is null as null_reauthentication_token
from auth.users
order by created_at;

-- 2) Sửa: đổi mọi NULL thành chuỗi rỗng
update auth.users set
  confirmation_token         = coalesce(confirmation_token, ''),
  recovery_token             = coalesce(recovery_token, ''),
  email_change               = coalesce(email_change, ''),
  email_change_token_new     = coalesce(email_change_token_new, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  phone_change               = coalesce(phone_change, ''),
  phone_change_token         = coalesce(phone_change_token, ''),
  reauthentication_token     = coalesce(reauthentication_token, '');

-- 3) Kiểm tra RLS: xác nhận 0007/0009 đã áp (mọi user xem & sửa được task).
--    Kết quả mong đợi gồm các policy tên: tasks_select_all, tasks_insert_all,
--    tasks_update_all, tasks_delete_all. Nếu thấy tasks_select_scope hoặc
--    tasks_*_leader_admin thì project này chưa chạy 0007/0009.
select tablename, policyname, cmd, qual::text as using_expr
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
