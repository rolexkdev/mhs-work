-- 0027: comment edit marker + meetings as epics.
-- Idempotent; run in the Supabase SQL Editor (applied manually).
--
-- Section 1: task_comments.edited_at, set by a trigger when content changes.
-- Section 2: (added later) open meeting writes + meeting_id change logging.

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
