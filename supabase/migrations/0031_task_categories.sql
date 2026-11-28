-- 0031: task categories (Hạng mục) per department.
-- Idempotent; run in the Supabase SQL Editor (applied manually).
--
-- Each department has its own list of categories. Every task can be put in
-- one category of its department (tasks.category_id); employees pick it
-- themselves. The tasks page shows the categories first, with status counts,
-- and only lists the tasks of a category once it is opened.
--
-- Rules:
--   • Everyone signed in can read categories.
--   • Leaders and admins (is_leader_or_admin) create, rename, reorder and
--     delete them. Deleting a category leaves its tasks uncategorised.
--   • A task's category must belong to the task's department. A trigger
--     clears category_id when it does not (e.g. the department changed).
--   • Each category has a color (a key of the app's tag palette, TagColor
--     in src/modules/tasks/constants.ts) that leaders pick; existing rows
--     get distinct colors per department in sort order.
--   • log_task_change records category changes as 'category' rows in
--     task_logs with the category names, the same shape the old text
--     column (dropped in 0029) used, so the history renders both.
--
-- The seed below adds the initial categories and links existing tasks whose
-- title matches an item of the list the team compiled.

-- ---------- table ----------
create table if not exists public.task_categories (
  id          uuid primary key default gen_random_uuid(),
  department  text not null,
  name        text not null check (length(btrim(name)) > 0),
  sort_order  integer not null default 0,
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Added after the first drafts of this migration; keeps re-runs working.
alter table public.task_categories add column if not exists color text;

create unique index if not exists uq_task_categories_department_name
on public.task_categories (department, lower(btrim(name)));

create index if not exists idx_task_categories_department
on public.task_categories (department, sort_order);

drop trigger if exists trg_task_categories_updated_at on public.task_categories;
create trigger trg_task_categories_updated_at
before update on public.task_categories
for each row execute function public.set_updated_at();

-- ---------- RLS ----------
alter table public.task_categories enable row level security;

drop policy if exists "task_categories_select_all" on public.task_categories;
create policy "task_categories_select_all" on public.task_categories
for select to authenticated using (true);

drop policy if exists "task_categories_insert_leader_admin" on public.task_categories;
create policy "task_categories_insert_leader_admin" on public.task_categories
for insert to authenticated with check (public.is_leader_or_admin());

drop policy if exists "task_categories_update_leader_admin" on public.task_categories;
create policy "task_categories_update_leader_admin" on public.task_categories
for update to authenticated
using (public.is_leader_or_admin()) with check (public.is_leader_or_admin());

drop policy if exists "task_categories_delete_leader_admin" on public.task_categories;
create policy "task_categories_delete_leader_admin" on public.task_categories
for delete to authenticated using (public.is_leader_or_admin());

-- ---------- tasks.category_id ----------
alter table public.tasks
add column if not exists category_id uuid
references public.task_categories (id) on delete set null;

create index if not exists idx_tasks_category_id on public.tasks (category_id);

-- Keep the category inside the task's department.
create or replace function public.task_category_guard()
returns trigger
language plpgsql set search_path = public as $$
begin
  if new.category_id is not null and not exists (
    select 1 from public.task_categories c
    where c.id = new.category_id
      and c.department is not distinct from new.department
  ) then
    new.category_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tasks_category_guard on public.tasks;
create trigger trg_tasks_category_guard
before insert or update of category_id, department on public.tasks
for each row execute function public.task_category_guard();

-- ---------- history ----------
-- Same body as 0029 plus the category branch.
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

  -- Names, not ids. A category deleted in the same statement (FK set null)
  -- is no longer visible, hence the fallback label.
  if new.category_id is distinct from old.category_id then
    insert into public.task_logs (task_id, action, old_value, new_value, created_by)
    values (
      new.id,
      'category',
      case when old.category_id is null then null else to_jsonb(coalesce(
        (select c.name from public.task_categories c where c.id = old.category_id),
        'Hạng mục đã xoá'
      )) end,
      case when new.category_id is null then null else to_jsonb(
        (select c.name from public.task_categories c where c.id = new.category_id)
      ) end,
      uid
    );
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

-- ---------- realtime ----------
do $$
begin
  begin
    alter publication supabase_realtime add table public.task_categories;
  exception when duplicate_object then null;
  end;
end $$;

-- ---------- seed (first run only) ----------
-- Guarded so rerunning this migration never restores renamed/deleted
-- categories, overwrites leaders' color choices, or relinks tasks.
do $$
begin
  if not exists (select 1 from public.task_categories) then
    -- Initial categories
    insert into public.task_categories (department, name, sort_order, created_by)
    select v.department, v.name, v.sort_order, null
    from (values
      ('Cây xanh', 'Bảo dưỡng cây xanh', 1),
      ('Cây xanh', 'Thi công, cải tạo cảnh quan', 2),
      ('Cây xanh', 'Hồ sơ, dữ liệu cây xanh', 3),
      ('Cây xanh', 'Hợp đồng, nhà thầu, nhà cung cấp', 4),
      ('Cây xanh', 'Thanh lý, xử lý cây xanh', 5),
      ('Cây xanh', 'Kiểm tra, xử lý phát sinh hiện trường', 6),
      ('Hạ tầng', 'Thi công, xây lắp mới', 1),
      ('Hạ tầng', 'Mua sắm, trang bị', 2),
      ('Hạ tầng', 'Cấp nước, đường ống', 3),
      ('Hạ tầng', 'Hồ sơ pháp lý, nghiệm thu', 4),
      ('Môi trường', 'Pháp lý môi trường và quy định quản lý', 1),
      ('Môi trường', 'Quản lý nước thải doanh nghiệp', 2),
      ('Môi trường', 'Quản lý hệ thống quan trắc tự động NMXLNT', 3),
      ('Môi trường', 'Vận hành nhà máy xử lý nước thải', 4),
      ('NM Cấp nước', 'Chất lượng nước, kiểm định', 1),
      ('NM Cấp nước', 'Vận hành, xử lý', 2),
      ('NM Cấp nước', 'Đầu tư, nguồn nước', 3),
      ('Hành chính', 'Quy chế, quy định nội bộ', 1),
      ('Hành chính', 'Mua sắm, trang bị', 2),
      ('PCCC', 'Mua sắm, trang bị', 1),
      ('PCCC', 'Nhân sự, đào tạo', 2),
      ('IT', 'Phát triển phần mềm nội bộ', 1),
      ('IT', 'Mua sắm, trang bị', 2),
      ('IT', 'Hạ tầng, dịch vụ', 3)
    ) as v (department, name, sort_order)
    on conflict (department, lower(btrim(name))) do nothing;

    -- Link existing tasks by title (only active, uncategorised, same department).
    update public.tasks t
    set category_id = c.id
    from (values
      ('Cây xanh', 'Bảo dưỡng cây xanh', 'Bảo dưỡng cây xanh KCN'),
      ('Cây xanh', 'Thi công, cải tạo cảnh quan', 'Hợp đồng mua cây, thi công trồng cây Sơn Liễu'),
      ('Cây xanh', 'Thi công, cải tạo cảnh quan', 'Hợp đồng mua cây, thi công trồng Hoa trang'),
      ('Cây xanh', 'Thi công, cải tạo cảnh quan', 'Hợp đồng thi công trồng cây sao KCN'),
      ('Cây xanh', 'Thi công, cải tạo cảnh quan', 'Đánh chuyển Cây Sao'),
      ('Cây xanh', 'Thi công, cải tạo cảnh quan', 'Đánh chuyển Cây Sao (đã hoàn thành)'),
      ('Cây xanh', 'Thi công, cải tạo cảnh quan', 'Khảo sát, mua vật tư, thi công hệ thống tưới tự động'),
      ('Cây xanh', 'Hợp đồng, nhà thầu, nhà cung cấp', 'Mua xe cắt cỏ KCN'),
      ('Cây xanh', 'Thanh lý, xử lý cây xanh', 'Thanh lý gỗ cây Sao'),
      ('Cây xanh', 'Kiểm tra, xử lý phát sinh hiện trường', 'Cày cỏ dại PCCC Nhà máy Nguyễn Vũ'),
      ('Hạ tầng', 'Thi công, xây lắp mới', 'Thi công trạm BTS (SL:06)'),
      ('Hạ tầng', 'Thi công, xây lắp mới', 'Bổ sung hệ thống biển báo và cảnh báo'),
      ('Hạ tầng', 'Mua sắm, trang bị', 'Mua vật tư nước (D400, D630, D710)'),
      ('Hạ tầng', 'Cấp nước, đường ống', 'Tuyến ống 630'),
      ('Hạ tầng', 'Hồ sơ pháp lý, nghiệm thu', 'GPXD Kho bùn/rác'),
      ('Hạ tầng', 'Hồ sơ pháp lý, nghiệm thu', 'Hồ sơ Nghiệm thu hệ thống PCCC KCN'),
      ('Môi trường', 'Pháp lý môi trường và quy định quản lý', 'GPMT KCN điều chỉnh với Thuận Phước'),
      ('Môi trường', 'Pháp lý môi trường và quy định quản lý', 'Quy định về thu hồi lưu lượng xả thải'),
      ('Môi trường', 'Quản lý nước thải doanh nghiệp', 'Rà soát, xử lý nước mưa xâm nhập'),
      ('Môi trường', 'Quản lý nước thải doanh nghiệp', 'Làm việc với All Seven về tăng lưu lượng tiếp nhận, giảm Clorua'),
      ('Môi trường', 'Quản lý nước thải doanh nghiệp', 'Phối hợp, giám sát hệ thống QTTD nước thải của doanh nghiệp: Chenkai, Tân Phong'),
      ('Môi trường', 'Quản lý nước thải doanh nghiệp', 'Hệ thống QTTD nước thải Youde'),
      ('Môi trường', 'Quản lý hệ thống quan trắc tự động NMXLNT', 'Kiểm định hiệu chuẩn trạm QTTD'),
      ('Môi trường', 'Quản lý hệ thống quan trắc tự động NMXLNT', 'Thay thế thiết bị quan trắc tự động (hệ kim loại)'),
      ('Môi trường', 'Quản lý hệ thống quan trắc tự động NMXLNT', 'Sửa chữa thiết bị đo Amoni'),
      ('Môi trường', 'Quản lý hệ thống quan trắc tự động NMXLNT', 'Truyền dữ liệu Scada và kích lấy mẫu từ xa'),
      ('Môi trường', 'Vận hành nhà máy xử lý nước thải', 'Máy phát điện trạm bơm nhà máy XLNT'),
      ('Môi trường', 'Vận hành nhà máy xử lý nước thải', 'Phân định bùn lần 2/2026'),
      ('Môi trường', 'Vận hành nhà máy xử lý nước thải', 'Hạ cao độ ống thoát hồ hoàn thiện'),
      ('NM Cấp nước', 'Chất lượng nước, kiểm định', 'Nội kiểm nước sinh hoạt, tờ trình, hợp đồng'),
      ('NM Cấp nước', 'Vận hành, xử lý', 'Xả cặn, xả khí'),
      ('NM Cấp nước', 'Đầu tư, nguồn nước', 'Hệ thống quan trắc tự động cho giếng nước NMNC'),
      ('NM Cấp nước', 'Đầu tư, nguồn nước', 'Tờ trình phương án khoan giếng'),
      ('Hành chính', 'Quy chế, quy định nội bộ', 'Checklist nội dung ủy quyền'),
      ('Hành chính', 'Quy chế, quy định nội bộ', 'Quy chế chế độ làm việc, trực (lễ, Tết), nghỉ bù và trực Hotline'),
      ('Hành chính', 'Quy chế, quy định nội bộ', 'Ban hành và công bố Nội quy quản lý nội khu (giao thông)'),
      ('Hành chính', 'Mua sắm, trang bị', 'Đồ bảo hộ cho nhân viên Ban QLKCN'),
      ('PCCC', 'Mua sắm, trang bị', 'Theo dõi 02 xe PCCC theo hợp đồng mua bán xe'),
      ('PCCC', 'Nhân sự, đào tạo', 'Lái xe PCCC & xe cẩu: rà soát nhân sự nội bộ có bằng B2, C'),
      ('IT', 'Phát triển phần mềm nội bộ', 'Tờ trình SikicoAtlas'),
      ('IT', 'Phát triển phần mềm nội bộ', 'Phát triển tính năng quản lý quy trình gửi hồ sơ trên website nội bộ'),
      ('IT', 'Phát triển phần mềm nội bộ', 'Tính năng thông báo trên trang báo cáo công việc'),
      ('IT', 'Phát triển phần mềm nội bộ', 'Tính năng theo dõi hoạt động của tài khoản'),
      ('IT', 'Phát triển phần mềm nội bộ', 'Nghiên cứu mở rộng bộ nhớ lưu trữ file'),
      ('IT', 'Mua sắm, trang bị', 'Mua 2 màn hình máy tính'),
      ('IT', 'Mua sắm, trang bị', 'Mua bộ PC cho nhân viên IT mới'),
      ('IT', 'Mua sắm, trang bị', 'Mua CPU để kết nối TV phòng họp'),
      ('IT', 'Mua sắm, trang bị', 'Tìm hiểu màn hình cảm ứng phòng họp'),
      ('IT', 'Hạ tầng, dịch vụ', 'Gia hạn gói internet cho ban quản lý'),
      ('IT', 'Hạ tầng, dịch vụ', 'Đề xuất gia hạn hợp đồng thuê máy photocopy')
    ) as v (department, category, title)
    join public.task_categories c
      on c.department = v.department
     and lower(btrim(c.name)) = lower(btrim(v.category))
    where t.department = v.department
      and lower(btrim(t.title)) = lower(btrim(v.title))
      and t.category_id is null
      and t.deleted_at is null;
  end if;
end $$;

-- ---------- colors ----------
-- Categories without a color get one of the palette in sort order, so the
-- categories of a department start out distinct. Same order as
-- CATEGORY_PALETTE in src/modules/tasks/constants.ts.
with ranked as (
  select id,
         row_number() over (partition by department order by sort_order, name) as rn
  from public.task_categories
  where color is null
)
update public.task_categories c
set color = (array['blue','orange','purple','green','pink','teal',
                   'yellow','sky','brown','red'])[((r.rn - 1) % 10) + 1]
from ranked r
where r.id = c.id;

alter table public.task_categories alter column color set default 'blue';
alter table public.task_categories alter column color set not null;
alter table public.task_categories drop constraint if exists task_categories_color_check;
alter table public.task_categories add constraint task_categories_color_check
check (color in ('gray','blue','green','orange','red','crimson','purple',
                 'brown','pink','sky','yellow','teal'));

-- Verification script (run on dev; rolls back). Run after the migration.
-- begin;
--   do $$
--   declare
--     v_task uuid := (select id from public.tasks
--                     where deleted_at is null and department = 'IT' limit 1);
--     v_it   uuid := (select id from public.task_categories
--                     where department = 'IT' order by sort_order limit 1);
--     v_cx   uuid := (select id from public.task_categories
--                     where department = 'Cây xanh' order by sort_order limit 1);
--   begin
--     update public.tasks set category_id = v_it where id = v_task;
--     if (select category_id from public.tasks where id = v_task) is distinct from v_it
--       then raise exception 'category not set'; end if;
--     update public.tasks set category_id = v_cx where id = v_task;
--     if (select category_id from public.tasks where id = v_task) is not null
--       then raise exception 'foreign category kept'; end if;
--     update public.tasks set category_id = v_it where id = v_task;
--     update public.tasks set department = 'Hạ tầng' where id = v_task;
--     if (select category_id from public.tasks where id = v_task) is not null
--       then raise exception 'category kept after department change'; end if;
--     if not exists (select 1 from public.task_logs
--                    where task_id = v_task and action = 'category'
--                      and created_at >= now() - interval '1 minute')
--       then raise exception 'no category log'; end if;
--     raise notice 'ok';
--   end $$;
-- rollback;
