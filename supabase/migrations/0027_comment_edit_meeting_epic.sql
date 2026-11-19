-- 0027: comment edit marker + meetings as epics.
-- Idempotent; run in the Supabase SQL Editor (applied manually).
--
-- Section 1: task_comments.edited_at, set by a trigger when content changes.
-- Section 2: every authenticated user can create/update meetings, only admin
--            deletes; meeting_id changes on tasks are logged in task_logs.

-- ============================================================
-- Section 1: comment edit marker
-- ============================================================

alter table public.task_comments
  add column if not exists edited_at timestamptz;

create or replace function public.touch_task_comment()
returns trigger
language plpgsql
as $$
begin
  if new.task_id is distinct from old.task_id
     or new.user_id is distinct from old.user_id then
    raise exception 'task_id and user_id of a comment cannot change';
  end if;
  if new.content is distinct from old.content then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_touch_task_comment on public.task_comments;
create trigger trg_touch_task_comment
  before update on public.task_comments
  for each row execute function public.touch_task_comment();

-- Verification script (run on dev; rolls back). Replace the ids first.
-- begin;
--   do $$
--   declare
--     v_task uuid := (select id from public.tasks limit 1);
--     v_user uuid := (select id from public.profiles limit 1);
--     v_comment uuid;
--     v_edited timestamptz;
--   begin
--     insert into public.task_comments (task_id, user_id, content)
--       values (v_task, v_user, 'a') returning id into v_comment;
--     update public.task_comments set content = 'b' where id = v_comment;
--     select edited_at into v_edited from public.task_comments where id = v_comment;
--     if v_edited is null then raise exception 'edited_at not set'; end if;
--     begin
--       update public.task_comments
--         set task_id = (select id from public.tasks where id <> v_task limit 1)
--         where id = v_comment;
--       raise exception 'task_id change was allowed';
--     exception when raise_exception then
--       if sqlerrm like '%was allowed' then raise; end if;
--     end;
--     raise notice 'ok';
--   end $$;
-- rollback;

-- ============================================================
-- Section 2: open meeting writes + log meeting changes
-- ============================================================

drop policy if exists "meetings_write_leader_admin" on public.meetings;
drop policy if exists "meetings_insert_authenticated" on public.meetings;
drop policy if exists "meetings_update_authenticated" on public.meetings;
drop policy if exists "meetings_delete_admin" on public.meetings;

create policy "meetings_insert_authenticated" on public.meetings
  for insert to authenticated
  with check (created_by = auth.uid());

create policy "meetings_update_authenticated" on public.meetings
  for update to authenticated
  using (true) with check (true);

create policy "meetings_delete_admin" on public.meetings
  for delete to authenticated
  using (public.is_admin());

-- Same body as 0015 plus a meeting_id branch (action 'meeting', values are
-- meeting ids; the UI maps them to titles).
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

  if new.meeting_id is distinct from old.meeting_id then
    insert into public.task_logs (task_id, action, old_value, new_value, created_by)
    values (new.id, 'meeting', to_jsonb(old.meeting_id), to_jsonb(new.meeting_id), uid);
  end if;

  return new;
end;
$$;

-- Verification script for section 2 (run on dev; rolls back). Uses a plain
-- member (not admin); needs two tasks and one profile with role 'member'.
-- begin;
--   do $$
--   declare
--     v_user uuid := (select id from public.profiles where role = 'member' limit 1);
--     v_m1 uuid; v_m2 uuid; v_task uuid; v_logs int; v_del int;
--   begin
--     perform set_config('request.jwt.claims',
--       json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
--     set local role authenticated;
--     insert into public.meetings (title, created_by) values ('t1', v_user) returning id into v_m1;
--     insert into public.meetings (title, created_by) values ('t2', v_user) returning id into v_m2;
--     update public.meetings set title = 't1b' where id = v_m1;
--     delete from public.meetings where id = v_m1;
--     get diagnostics v_del = row_count;
--     if v_del <> 0 then raise exception 'member deleted a meeting'; end if;
--     v_task := (select id from public.tasks where deleted_at is null limit 1);
--     update public.tasks set meeting_id = v_m1 where id = v_task;
--     update public.tasks set meeting_id = v_m2 where id = v_task;
--     select count(*) into v_logs from public.task_logs
--       where task_id = v_task and action = 'meeting';
--     if v_logs <> 2 then raise exception 'expected 2 meeting logs, got %', v_logs; end if;
--     raise notice 'ok';
--   end $$;
-- rollback;
