-- =============================================================
-- TaskApp — Schema khởi tạo
-- Meeting → Task → Progress → Review → Done
-- Chạy trong Supabase SQL Editor (hoặc supabase db push).
-- =============================================================

-- ---------- Enums ----------
create type public.user_role     as enum ('admin', 'leader', 'member');
create type public.meeting_status as enum ('planned', 'ongoing', 'closed');
create type public.task_priority  as enum ('low', 'medium', 'high', 'urgent');
create type public.task_status    as enum ('todo', 'in_progress', 'review', 'done', 'blocked');

-- ---------- Tables ----------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  full_name  text,
  role       public.user_role not null default 'member',
  created_at timestamptz not null default now()
);

create table public.meetings (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text,
  meeting_date timestamptz not null default now(),
  status       public.meeting_status not null default 'planned',
  created_by   uuid not null references public.profiles (id),
  created_at   timestamptz not null default now()
);

create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  meeting_id  uuid references public.meetings (id) on delete set null,
  title       text not null,
  description text,
  assignee_id uuid references public.profiles (id) on delete set null,
  created_by  uuid not null references public.profiles (id),
  priority    public.task_priority not null default 'medium',
  status      public.task_status   not null default 'todo',
  progress    int not null default 0 check (progress between 0 and 100),
  start_date  timestamptz,
  due_date    timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  user_id    uuid not null references public.profiles (id),
  content    text not null,
  created_at timestamptz not null default now()
);

create table public.task_checklists (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  content    text not null,
  is_done    boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.task_attachments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks (id) on delete cascade,
  file_name   text not null,
  file_url    text not null,
  uploaded_by uuid not null references public.profiles (id),
  created_at  timestamptz not null default now()
);

create table public.task_logs (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  action     text not null,
  old_value  jsonb,
  new_value  jsonb,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- ---------- Indexes ----------
create index idx_tasks_assignee  on public.tasks (assignee_id);
create index idx_tasks_meeting   on public.tasks (meeting_id);
create index idx_tasks_status    on public.tasks (status);
create index idx_tasks_due_date  on public.tasks (due_date);
create index idx_comments_task   on public.task_comments (task_id);
create index idx_checklists_task on public.task_checklists (task_id);
create index idx_attachments_task on public.task_attachments (task_id);
create index idx_logs_task       on public.task_logs (task_id);

-- =============================================================
-- Helper functions (SECURITY DEFINER để tránh đệ quy RLS)
-- =============================================================
create or replace function public.current_role()
returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select public.current_role() = 'admin';
$$;

create or replace function public.is_leader_or_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select public.current_role() in ('admin', 'leader');
$$;

-- Member chỉ thấy task được assign; leader/admin thấy tất cả.
create or replace function public.can_access_task(p_task_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tasks t
    where t.id = p_task_id
      and (
        public.is_leader_or_admin()
        or t.assignee_id = auth.uid()
        or t.created_by  = auth.uid()
      )
  );
$$;

-- =============================================================
-- Triggers
-- =============================================================

-- 1) Tự tạo profile khi có user mới trong auth.users
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'member')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2) updated_at tự động trên tasks
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- 3) Tự tính progress từ checklist (nếu task có checklist)
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

  if v_total > 0 then
    update public.tasks
      set progress = round((v_done::numeric / v_total) * 100)
    where id = v_task_id;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger trg_checklist_progress
  after insert or update or delete on public.task_checklists
  for each row execute function public.recalc_task_progress();

-- 4) Ghi log khi status / assignee thay đổi
create or replace function public.log_task_change()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.status is distinct from old.status) then
    insert into public.task_logs (task_id, action, old_value, new_value, created_by)
    values (new.id, 'status_changed',
            to_jsonb(old.status), to_jsonb(new.status), auth.uid());
  end if;

  if (new.assignee_id is distinct from old.assignee_id) then
    insert into public.task_logs (task_id, action, old_value, new_value, created_by)
    values (new.id, 'assignee_changed',
            to_jsonb(old.assignee_id), to_jsonb(new.assignee_id), auth.uid());
  end if;

  return new;
end;
$$;

create trigger trg_task_log
  after update on public.tasks
  for each row execute function public.log_task_change();

-- =============================================================
-- Row Level Security
-- =============================================================
alter table public.profiles         enable row level security;
alter table public.meetings         enable row level security;
alter table public.tasks            enable row level security;
alter table public.task_comments    enable row level security;
alter table public.task_checklists  enable row level security;
alter table public.task_attachments enable row level security;
alter table public.task_logs        enable row level security;

-- ---------- profiles ----------
create policy "profiles_select_all" on public.profiles
  for select to authenticated using (true);

create policy "profiles_update_self_or_admin" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

create policy "profiles_admin_all" on public.profiles
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- meetings (internal read; leader/admin write) ----------
create policy "meetings_select_all" on public.meetings
  for select to authenticated using (true);

create policy "meetings_write_leader_admin" on public.meetings
  for all to authenticated
  using (public.is_leader_or_admin())
  with check (public.is_leader_or_admin());

-- ---------- tasks ----------
create policy "tasks_select_scope" on public.tasks
  for select to authenticated
  using (
    public.is_leader_or_admin()
    or assignee_id = auth.uid()
    or created_by  = auth.uid()
  );

create policy "tasks_insert_leader_admin" on public.tasks
  for insert to authenticated
  with check (public.is_leader_or_admin());

-- Assignee được update task của mình; leader/admin update tất cả.
create policy "tasks_update_scope" on public.tasks
  for update to authenticated
  using (public.is_leader_or_admin() or assignee_id = auth.uid())
  with check (public.is_leader_or_admin() or assignee_id = auth.uid());

create policy "tasks_delete_leader_admin" on public.tasks
  for delete to authenticated
  using (public.is_leader_or_admin());

-- ---------- task_comments (ai truy cập được task đều comment) ----------
create policy "comments_select" on public.task_comments
  for select to authenticated using (public.can_access_task(task_id));

create policy "comments_insert" on public.task_comments
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_access_task(task_id));

create policy "comments_update_own" on public.task_comments
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "comments_delete_own_or_admin" on public.task_comments
  for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ---------- task_checklists ----------
create policy "checklists_select" on public.task_checklists
  for select to authenticated using (public.can_access_task(task_id));

create policy "checklists_write" on public.task_checklists
  for all to authenticated
  using (public.can_access_task(task_id))
  with check (public.can_access_task(task_id));

-- ---------- task_attachments ----------
create policy "attachments_select" on public.task_attachments
  for select to authenticated using (public.can_access_task(task_id));

create policy "attachments_insert" on public.task_attachments
  for insert to authenticated
  with check (uploaded_by = auth.uid() and public.can_access_task(task_id));

create policy "attachments_delete_own_or_leader" on public.task_attachments
  for delete to authenticated
  using (uploaded_by = auth.uid() or public.is_leader_or_admin());

-- ---------- task_logs (chỉ đọc; ghi qua trigger SECURITY DEFINER) ----------
create policy "logs_select" on public.task_logs
  for select to authenticated using (public.can_access_task(task_id));

-- =============================================================
-- Realtime: bật cho các bảng cần đồng bộ live
-- =============================================================
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.task_comments;
alter publication supabase_realtime add table public.task_checklists;
