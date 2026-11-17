-- =============================================================
-- 0024 — Task trash (soft delete)
-- Deleting a task no longer removes the row. It sets deleted_at /
-- deleted_by, so the task disappears from lists and dashboards but
-- keeps its history, comments, checklist, attachments and progress.
-- Admins see the trash, can restore a task, or purge it for good.
--
--   • task_trash(p_ids)   — any signed-in user moves tasks to the trash.
--   • task_restore(p_id)  — admin only, brings a task back.
--   • DELETE on tasks     — admin only and only for trashed tasks (purge).
--
-- deleted_at / deleted_by can only change through these RPCs: they set
-- the transaction-local flag app.task_trash, which the guard trigger
-- checks. Both actions are written to task_logs ('deleted', 'restored').
--
-- Idempotent. Run manually in the Supabase SQL Editor BEFORE deploying
-- the app version that uses it.
-- =============================================================

alter table public.tasks
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid
    references public.profiles (id) on delete set null;

create index if not exists idx_tasks_deleted_at
  on public.tasks (deleted_at) where deleted_at is not null;

-- ---------- Guard: trash columns only change through the RPCs ----------
create or replace function public.guard_task_trash_columns()
returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('app.task_trash', true), '') <> 'on' and (
       new.deleted_at is distinct from old.deleted_at
    or new.deleted_by is distinct from old.deleted_by
  ) then
    raise exception 'Use task_trash / task_restore to delete or restore a task';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_task_trash_guard on public.tasks;
create trigger trg_task_trash_guard
  before update on public.tasks
  for each row execute function public.guard_task_trash_columns();

-- ---------- Move tasks to the trash ----------
create or replace function public.task_trash(p_ids uuid[])
returns integer
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  n integer;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;

  perform set_config('app.task_trash', 'on', true);

  with trashed as (
    update public.tasks
       set deleted_at = now(), deleted_by = uid
     where id = any (p_ids) and deleted_at is null
    returning id
  ), logged as (
    insert into public.task_logs (task_id, action, created_by)
    select id, 'deleted', uid from trashed
    returning 1
  )
  select count(*) into n from logged;

  perform set_config('app.task_trash', 'off', true);
  return n;
end;
$$;

-- ---------- Restore a task (admin only) ----------
create or replace function public.task_restore(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can restore tasks';
  end if;

  perform set_config('app.task_trash', 'on', true);

  update public.tasks
     set deleted_at = null, deleted_by = null
   where id = p_id and deleted_at is not null;

  if found then
    insert into public.task_logs (task_id, action, created_by)
    values (p_id, 'restored', auth.uid());
  end if;

  perform set_config('app.task_trash', 'off', true);
end;
$$;

revoke all on function public.task_trash(uuid[]) from public, anon;
revoke all on function public.task_restore(uuid) from public, anon;
grant execute on function public.task_trash(uuid[]) to authenticated;
grant execute on function public.task_restore(uuid) to authenticated;

-- ---------- Hard delete: admin only, trashed tasks only ----------
drop policy if exists "tasks_delete_all"   on public.tasks;
drop policy if exists "tasks_delete_admin" on public.tasks;
create policy "tasks_delete_admin" on public.tasks
  for delete to authenticated
  using (public.is_admin() and deleted_at is not null);
