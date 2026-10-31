-- =============================================================
-- 0015 — Một công việc có nhiều người phụ trách (tasks.assignee_ids)
-- assignee_ids là nguồn chính. assignee_id giữ lại, tự đồng bộ bằng
-- người đầu danh sách: chạy migration trước khi deploy code mới vẫn
-- an toàn, bản cũ đang chạy và zalo-daily-reminder cũ không gãy.
-- Chạy trong Supabase SQL Editor (hoặc supabase db push).
-- =============================================================

alter table public.tasks
  add column if not exists assignee_ids uuid[] not null default '{}';

-- Tắt trigger khi chuyển dữ liệu: không đổi updated_at, không sinh log.
alter table public.tasks disable trigger user;
update public.tasks
set assignee_ids = array[assignee_id]
where assignee_id is not null and assignee_ids = '{}';
alter table public.tasks enable trigger user;

create index if not exists idx_tasks_assignee_ids
  on public.tasks using gin (assignee_ids);

-- Đồng bộ 2 chiều: bản cũ chỉ ghi assignee_id, bản mới ghi assignee_ids.
create or replace function public.sync_task_assignees()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.assignee_ids = '{}' and new.assignee_id is not null then
      new.assignee_ids := array[new.assignee_id];
    end if;
  elsif new.assignee_ids is not distinct from old.assignee_ids
    and new.assignee_id is distinct from old.assignee_id then
    new.assignee_ids := case
      when new.assignee_id is null then '{}'::uuid[]
      else array[new.assignee_id]
    end;
  end if;
  new.assignee_id := new.assignee_ids[1];
  return new;
end;
$$;

drop trigger if exists trg_task_sync_assignees on public.tasks;
create trigger trg_task_sync_assignees
  before insert or update on public.tasks
  for each row execute function public.sync_task_assignees();

-- Xoá tài khoản: mảng không có khoá ngoại nên phải tự gỡ khỏi các công việc.
-- Chạy trước khi xoá để những người còn lại không bị mất theo assignee_id.
create or replace function public.remove_profile_from_tasks()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.tasks
  set assignee_ids = array_remove(assignee_ids, old.id)
  where old.id = any (assignee_ids);
  return old;
end;
$$;

drop trigger if exists trg_profile_remove_from_tasks on public.profiles;
create trigger trg_profile_remove_from_tasks
  before delete on public.profiles
  for each row execute function public.remove_profile_from_tasks();

-- Lịch sử: ghi theo danh sách người, thêm/bớt người phụ cũng có log.
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
