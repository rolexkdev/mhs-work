-- =============================================================
-- 0010 — Lịch sử công việc (task history) chi tiết
-- Mở rộng trigger: ghi log khi TẠO task và khi đổi các trường quan
-- trọng (không chỉ status/assignee). Mỗi log gồm: ai (created_by),
-- làm gì (action), giá trị cũ/mới, lúc nào (created_at).
-- Chạy trong Supabase SQL Editor (hoặc supabase db push).
-- =============================================================

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

  if new.assignee_id is distinct from old.assignee_id then
    insert into public.task_logs (task_id, action, old_value, new_value, created_by)
    values (new.id, 'assignee', to_jsonb(old.assignee_id), to_jsonb(new.assignee_id), uid);
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

  if new.category is distinct from old.category then
    insert into public.task_logs (task_id, action, old_value, new_value, created_by)
    values (new.id, 'category', to_jsonb(old.category), to_jsonb(new.category), uid);
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

  return new;
end;
$$;

-- Trigger cũ chỉ chạy on update → cho chạy cả khi tạo mới.
drop trigger if exists trg_task_log on public.tasks;
create trigger trg_task_log
  after insert or update on public.tasks
  for each row execute function public.log_task_change();
