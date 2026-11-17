-- =============================================================
-- 0022 — Email notifications for task assignment and comments
-- • A person newly added to tasks.assignee_ids (on create or edit) gets
--   an email. Assigning yourself sends nothing.
-- • A new comment emails the task's assignees and creator, except the
--   commenter.
-- Triggers only queue an async HTTP call (pg_net) to the Edge Function
-- `email-notify`, which loads the data and sends via Resend. The call runs
-- after commit, so a mail failure never blocks saving a task or comment.
--
-- Setup (once, after deploying the function): store the function URL and
-- shared secret in Supabase Vault — see supabase/email-notify-setup.sql.
-- Until both secrets exist, the triggers do nothing.
-- Idempotent. Run manually in the Supabase SQL Editor.
-- =============================================================

create extension if not exists pg_net;

-- ---------------------------------------------------------------
-- Send log, written by the Edge Function (service role). Admin read-only.
-- ---------------------------------------------------------------
create table if not exists public.email_notification_log (
  id           bigint generated always as identity primary key,
  kind         text not null check (kind in ('assigned', 'comment')),
  task_id      uuid references public.tasks (id) on delete cascade,
  recipient_id uuid references public.profiles (id) on delete cascade,
  email        text,
  status       text not null check (status in ('sent', 'failed', 'skipped')),
  error        text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_email_notification_log_time
  on public.email_notification_log (created_at desc);

alter table public.email_notification_log enable row level security;

drop policy if exists "email_notification_log_admin" on public.email_notification_log;
create policy "email_notification_log_admin" on public.email_notification_log
  for select using (public.is_admin());

-- ---------------------------------------------------------------
-- Queue a call to the Edge Function. Never raises: notifications are
-- best effort and must not roll back the user's change.
-- ---------------------------------------------------------------
create or replace function public.queue_email_notification(payload jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  fn_url    text;
  fn_secret text;
begin
  select decrypted_secret into fn_url
  from vault.decrypted_secrets where name = 'email_notify_url';
  select decrypted_secret into fn_secret
  from vault.decrypted_secrets where name = 'email_notify_secret';

  if fn_url is null or fn_secret is null then
    return; -- not configured yet
  end if;

  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object(
      'Content-Type',      'application/json',
      'x-notify-secret',   fn_secret
    ),
    body    := payload,
    timeout_milliseconds := 30000
  );
exception when others then
  raise warning 'queue_email_notification failed: %', sqlerrm;
end;
$$;

revoke all on function public.queue_email_notification(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------
-- Assignment: email only the people newly added, excluding the actor.
-- Runs AFTER the 0015 sync trigger has normalised assignee_ids. Not
-- "update of assignee_ids": that skips changes made by the sync trigger
-- when an older client writes only assignee_id.
-- ---------------------------------------------------------------
create or replace function public.notify_task_assigned()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor uuid := auth.uid();
  added uuid[];
begin
  if tg_op = 'UPDATE' and new.assignee_ids is not distinct from old.assignee_ids then
    return null;
  end if;

  select coalesce(array_agg(distinct a), '{}') into added
  from unnest(new.assignee_ids) as a
  where a is distinct from actor
    and (tg_op = 'INSERT' or not (a = any (coalesce(old.assignee_ids, '{}'))));

  if cardinality(added) > 0 then
    perform public.queue_email_notification(jsonb_build_object(
      'type',          'assigned',
      'task_id',       new.id,
      'actor_id',      actor,
      'recipient_ids', to_jsonb(added)
    ));
  end if;
  return null;
end;
$$;

drop trigger if exists trg_task_notify_assigned on public.tasks;
create trigger trg_task_notify_assigned
  after insert or update on public.tasks
  for each row execute function public.notify_task_assigned();

-- ---------------------------------------------------------------
-- Comment: the Edge Function resolves recipients from the task.
-- ---------------------------------------------------------------
create or replace function public.notify_task_comment()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.queue_email_notification(jsonb_build_object(
    'type',       'comment',
    'comment_id', new.id
  ));
  return null;
end;
$$;

drop trigger if exists trg_task_comment_notify on public.task_comments;
create trigger trg_task_comment_notify
  after insert on public.task_comments
  for each row execute function public.notify_task_comment();

-- Optional housekeeping:
-- delete from public.email_notification_log where created_at < now() - interval '6 months';
