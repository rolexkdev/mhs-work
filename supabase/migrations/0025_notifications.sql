-- =============================================================
-- 0025 — In-app notifications (bell icon)
-- A notification is written for a user when someone else:
--   • assigns them to a task          (kind 'assigned')
--   • comments on a task they own      (kind 'comment')
--   • sets or changes the due date of
--     a task they own                  (kind 'due_date')
-- "Own" means the user is in tasks.assignee_ids. The actor never
-- notifies themselves. Rows are written only by the triggers below
-- (security definer); users can read and mark their own as read.
--
-- Idempotent. Run manually in the Supabase SQL Editor (after 0024)
-- BEFORE deploying the app version that uses it.
-- =============================================================

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  actor_id   uuid references public.profiles (id) on delete set null,
  task_id    uuid references public.tasks (id) on delete cascade,
  kind       text not null check (kind in ('assigned', 'comment', 'due_date')),
  -- Snapshot for display: { "title": ..., "due_date": ..., "comment": ... }
  data       jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user_time
  on public.notifications (user_id, created_at desc);
create index if not exists idx_notifications_user_unread
  on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own" on public.notifications
  for delete to authenticated using (user_id = auth.uid());

-- ---------- Helper: notify a list of users, skipping the actor ----------
create or replace function public.notify_users(
  p_user_ids uuid[],
  p_actor    uuid,
  p_task_id  uuid,
  p_kind     text,
  p_data     jsonb
)
returns void
language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, actor_id, task_id, kind, data)
  select distinct u, p_actor, p_task_id, p_kind, p_data
    from unnest(coalesce(p_user_ids, '{}')) as u
   where u is distinct from p_actor
     and exists (select 1 from public.profiles p where p.id = u);
$$;

revoke all on function public.notify_users(uuid[], uuid, uuid, text, jsonb)
  from public, anon, authenticated;

-- ---------- Tasks: assigned / due date ----------
create or replace function public.notify_task_change()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor uuid := coalesce(auth.uid(), new.created_by);
  added uuid[];
begin
  if new.deleted_at is not null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    perform public.notify_users(
      new.assignee_ids, actor, new.id, 'assigned',
      jsonb_build_object('title', new.title, 'due_date', new.due_date));
    return new;
  end if;

  -- Restoring from the trash is not a new assignment.
  if old.deleted_at is not null then
    return new;
  end if;

  select coalesce(array_agg(u), '{}') into added
    from unnest(new.assignee_ids) as u
   where not (u = any (coalesce(old.assignee_ids, '{}')));

  if cardinality(added) > 0 then
    perform public.notify_users(
      added, actor, new.id, 'assigned',
      jsonb_build_object('title', new.title, 'due_date', new.due_date));
  end if;

  -- Due date changed: tell the people already on the task (new ones
  -- just got an 'assigned' notification that carries the due date).
  if new.due_date is distinct from old.due_date then
    perform public.notify_users(
      array(select u from unnest(new.assignee_ids) as u
             where not (u = any (added))),
      actor, new.id, 'due_date',
      jsonb_build_object('title', new.title, 'due_date', new.due_date,
                         'old_due_date', old.due_date));
  end if;

  return new;
end;
$$;

drop trigger if exists trg_task_notify on public.tasks;
create trigger trg_task_notify
  after insert or update of assignee_ids, due_date on public.tasks
  for each row execute function public.notify_task_change();

-- ---------- Comments ----------
create or replace function public.notify_task_comment()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  t public.tasks;
begin
  select * into t from public.tasks where id = new.task_id;
  if t.id is null or t.deleted_at is not null then
    return new;
  end if;

  perform public.notify_users(
    t.assignee_ids, new.user_id, t.id, 'comment',
    jsonb_build_object('title', t.title, 'comment', left(new.content, 200)));
  return new;
end;
$$;

drop trigger if exists trg_comment_notify on public.task_comments;
create trigger trg_comment_notify
  after insert on public.task_comments
  for each row execute function public.notify_task_comment();

-- ---------- Realtime ----------
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;

-- Optional housekeeping: drop read notifications older than 90 days.
-- delete from public.notifications
--  where read_at is not null and created_at < now() - interval '90 days';
