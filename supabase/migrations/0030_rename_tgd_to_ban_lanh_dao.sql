-- 0030_rename_tgd_to_ban_lanh_dao.sql
-- Rename the "Tổng giám đốc" department to "Ban lãnh đạo" in existing rows
-- so documents on the route board and history match the updated label.
-- Idempotent: safe to re-run.

update public.document_steps
set department = 'Ban lãnh đạo'
where department = 'Tổng giám đốc';

update public.document_events
set department = 'Ban lãnh đạo'
where department = 'Tổng giám đốc';

update public.tasks
set department = 'Ban lãnh đạo'
where department = 'Tổng giám đốc';
