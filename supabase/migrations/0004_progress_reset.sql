-- =============================================================
-- Sửa recalc_task_progress: khi task không còn checklist nào
-- (xoá hết item con), reset progress về 0 thay vì giữ giá trị cũ.
-- =============================================================
create or replace function public.recalc_task_progress()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_task_id uuid := coalesce(new.task_id, old.task_id);
  v_total   int;
  v_done    int;
begin
  select count(*), count(*) filter (where is_done)
    into v_total, v_done
  from public.task_checklists
  where task_id = v_task_id;

  update public.tasks
    set progress = case
      when v_total > 0 then round((v_done::numeric / v_total) * 100)
      else 0
    end
  where id = v_task_id;

  return coalesce(new, old);
end;
$$;
