-- 0028: keep the previous text of every edited comment.
-- Idempotent; run in the Supabase SQL Editor (applied manually) after 0027.
--
-- task_comment_edits holds one row per content change, written only by the
-- touch_task_comment trigger from 0027 (no insert/update/delete policy). Rows
-- are readable by any authenticated user and removed with their comment.
-- Edits made before this migration have no history rows.

create table if not exists public.task_comment_edits (
  id         uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.task_comments (id) on delete cascade,
  content    text not null,
  edited_by  uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_comment_edits_comment
  on public.task_comment_edits (comment_id, created_at);

alter table public.task_comment_edits enable row level security;

drop policy if exists "comment_edits_select" on public.task_comment_edits;
create policy "comment_edits_select" on public.task_comment_edits
  for select to authenticated using (true);

-- Same body as 0027 plus the history insert. security definer so the insert
-- works although members have no insert policy on the history table.
-- created_at = when the old text was replaced (the edit time).
create or replace function public.touch_task_comment()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.task_id is distinct from old.task_id
     or new.user_id is distinct from old.user_id then
    raise exception 'task_id and user_id of a comment cannot change';
  end if;
  if new.content is distinct from old.content then
    new.edited_at := now();
    insert into public.task_comment_edits (comment_id, content, edited_by)
    values (old.id, old.content, auth.uid());
  end if;
  return new;
end;
$$;

-- Verification script (run on dev; rolls back).
-- begin;
--   do $$
--   declare
--     v_task uuid := (select id from public.tasks limit 1);
--     v_user uuid := (select id from public.profiles limit 1);
--     v_comment uuid;
--   begin
--     insert into public.task_comments (task_id, user_id, content)
--       values (v_task, v_user, 'a') returning id into v_comment;
--     update public.task_comments set content = 'b' where id = v_comment;
--     update public.task_comments set content = 'c' where id = v_comment;
--     if (select count(*) from public.task_comment_edits where comment_id = v_comment) <> 2
--       then raise exception 'expected 2 history rows'; end if;
--     raise notice 'ok';
--   end $$;
-- rollback;
