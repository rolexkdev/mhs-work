-- 0030_rename_tgd_to_ban_lanh_dao.sql
-- Rename the "Tổng giám đốc" department to "Ban lãnh đạo" in existing rows
-- so documents, tasks, archived meeting items, and event JSON payloads match
-- the updated label (including undo_data for finish_early events).
-- Idempotent: safe to re-run.

update public.document_steps
set department = 'Ban lãnh đạo'
where department = 'Tổng giám đốc';

update public.document_events
set department = 'Ban lãnh đạo'
where department = 'Tổng giám đốc';

update public.document_events
set payload = replace(payload::text, '"Tổng giám đốc"', '"Ban lãnh đạo"')::jsonb
where payload is not null
  and payload::text like '%"Tổng giám đốc"%';

update public.document_events
set undo_data = replace(undo_data::text, '"Tổng giám đốc"', '"Ban lãnh đạo"')::jsonb
where undo_data is not null
  and undo_data::text like '%"Tổng giám đốc"%';

update public.tasks
set department = 'Ban lãnh đạo'
where department = 'Tổng giám đốc';

update public.meeting_items
set department = 'Ban lãnh đạo'
where department = 'Tổng giám đốc';
