-- =============================================================
-- 0016 — Guard protected profile columns
-- Policy "profiles_update_self_or_admin" (0001_init.sql) lets any user update
-- their own profile row, which would otherwise allow changing role. This
-- trigger blocks that for non-admin callers and keeps id and email immutable.
-- Service-role clients and the SQL Editor have no JWT, so auth.uid() is null
-- and role changes stay allowed for them.
-- Idempotent. Run manually in the Supabase SQL Editor.
-- =============================================================

create or replace function public.guard_profile_protected_columns()
returns trigger
language plpgsql as $$
begin
  if new.id is distinct from old.id
     or new.email is distinct from old.email then
    raise exception 'Profile id and email cannot be changed.';
  end if;

  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Only administrators may change profile role.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_guard_protected on public.profiles;
create trigger trg_profiles_guard_protected
  before update on public.profiles
  for each row execute function public.guard_profile_protected_columns();
