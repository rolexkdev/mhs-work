-- 0029: drop tasks.category (Hạng mục).
-- Idempotent; run in the Supabase SQL Editor (applied manually).
--
-- BREAKING: the column and its data are removed. Deploy the app first, then
-- run this migration: an old client still sends `category` when creating a
-- task and would fail once the column is gone.
--
-- Old task_logs rows with action 'category' are kept as the audit trail.

-- The trigger function goes first so it never references a dropped column.
-- Same body as 0027 minus the category branch.
create or replace function public.log_task_change()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  -- Tạo mới
  if (tg_op = 'INSERT') then
    insert into public.task_logs (task_id, action, new_value, created_by)
    values (new.id, 'created', to_jsonb(new.title), uid);
    return new;
  end if;

  -- Cập nhật: ghi từng trường có thay đổi
  if new.status is distinct from old.status then
    insert into public.task_logs (task_id, action, old_value, new_value, created_by)
    values (new.id, 'status', to_jsonb(old.status), to_jsonb(new.status), uid);
  end if;

  if new.assignee_ids is distinct from old.assignee_ids then
    insert into public.task_logs (task_id, action, old_value, new_value, created_by)
    values (new.id, 'assignee', to_jsonb(old.assignee_ids), to_jsonb(new.assignee_ids), uid);
  end if;

  if new.title is distinct from old.title then
    insert into public.task_logs (task_id, action, old_value, new_value, created_by)
    values (new.id, 'title', to_jsonb(old.title), to_jsonb(new.title), uid);
  end if;

  if new.priority is distinct from old.priority then
    insert into public.task_logs (task_id, action, old_value, new_value, created_by)
    values (new.id, 'priority', to_jsonb(old.priority), to_jsonb(new.priority), uid);
  end if;

  if new.due_date is distinct from old.due_date then
    insert into public.task_logs (task_id, action, old_value, new_value, created_by)
    values (new.id, 'due_date', to_jsonb(old.due_date), to_jsonb(new.due_date), uid);
  end if;

  if new.start_date is distinct from old.start_date then
    insert into public.task_logs (task_id, action, old_value, new_value, created_by)
    values (new.id, 'start_date', to_jsonb(old.start_date), to_jsonb(new.start_date), uid);
  end if;

  if new.department is distinct from old.department then
    insert into public.task_logs (task_id, action, old_value, new_value, created_by)
    values (new.id, 'department', to_jsonb(old.department), to_jsonb(new.department), uid);
  end if;

  if new.manual_progress is distinct from old.manual_progress then
    insert into public.task_logs (task_id, action, old_value, new_value, created_by)
    values (new.id, 'manual_progress', to_jsonb(old.manual_progress), to_jsonb(new.manual_progress), uid);
  end if;

  if coalesce(new.latest_update, '') is distinct from coalesce(old.latest_update, '') then
    insert into public.task_logs (task_id, action, old_value, new_value, created_by)
    values (new.id, 'latest_update', to_jsonb(old.latest_update), to_jsonb(new.latest_update), uid);
  end if;

  if coalesce(new.description, '') is distinct from coalesce(old.description, '') then
    insert into public.task_logs (task_id, action, old_value, new_value, created_by)
    values (new.id, 'description', to_jsonb(old.description), to_jsonb(new.description), uid);
  end if;

  if new.meeting_id is distinct from old.meeting_id then
    insert into public.task_logs (task_id, action, old_value, new_value, created_by)
    values (new.id, 'meeting', to_jsonb(old.meeting_id), to_jsonb(new.meeting_id), uid);
  end if;

  return new;
end;
$$;

-- Also drops idx_tasks_category.
alter table public.tasks drop column if exists category;

-- Verification script (run on dev; rolls back). Run after the migration.
-- begin;
--   do $$
--   declare
--     v_task uuid := (select id from public.tasks where deleted_at is null limit 1);
--     v_logs int;
--   begin
--     if exists (
--       select 1 from information_schema.columns
--       where table_schema = 'public' and table_name = 'tasks' and column_name = 'category'
--     ) then raise exception 'category column still exists'; end if;
--     update public.tasks
--       set title = title || ' x', status = 'in_progress',
--           start_date = now(), due_date = now() + interval '1 day'
--       where id = v_task;
--     select count(*) into v_logs from public.task_logs
--       where task_id = v_task and action in ('title', 'status', 'start_date', 'due_date')
--         and created_at >= now() - interval '1 minute';
--     if v_logs < 3 then raise exception 'expected log rows, got %', v_logs; end if;
--     raise notice 'ok';
--   end $$;
-- rollback;
