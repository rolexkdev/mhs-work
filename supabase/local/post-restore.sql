-- =============================================================
-- Runs on the LOCAL database after a production dump is restored
-- (scripts/db-restore-local.ps1). Never run this on production.
--
-- 1. Recreates objects that live outside `public` and are therefore not
--    part of `supabase db dump`: the auth.users trigger (0001) and the
--    storage buckets/policies (0002, 0006).
-- 2. Makes the copy safe to test with: no Zalo tokens, no cron jobs, so
--    nothing can message real employees or rotate the production
--    Zalo OA refresh token.
-- 3. Optionally resets every password to a shared test password
--    (psql variable `test_password`; empty = keep production passwords).
-- =============================================================

-- 1a. Auto-create profile for new auth users (0001_init.sql)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 1b. Storage buckets (rows normally come with the data dump)
insert into storage.buckets (id, name, public)
values ('task-attachments', 'task-attachments', false),
       ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- 1c. Storage policies (0002_storage.sql, 0006_profile_avatar.sql)
drop policy if exists "attachments_read" on storage.objects;
create policy "attachments_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'task-attachments');

drop policy if exists "attachments_upload" on storage.objects;
create policy "attachments_upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'task-attachments' and owner = auth.uid());

drop policy if exists "attachments_delete_own" on storage.objects;
create policy "attachments_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'task-attachments' and owner = auth.uid());

drop policy if exists "avatars_read" on storage.objects;
create policy "avatars_read" on storage.objects
  for select to public
  using (bucket_id = 'avatars');

drop policy if exists "avatars_upload" on storage.objects;
create policy "avatars_upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and owner = auth.uid());

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and owner = auth.uid());

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and owner = auth.uid());

-- 2a. Zalo OA token is excluded from the dump; make sure none is left.
--     Its refresh_token rotates: using it here would kill production's.
delete from public.zalo_oa_tokens;

-- 2b. Drop every pg_cron job (e.g. zalo-daily-reminder, which posts to the
--     production Edge Function URL).
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job;
  end if;
end
$$;

-- 3. Shared test password
select coalesce(:'test_password', '') <> '' as reset_passwords \gset
\if :reset_passwords
  update auth.users
     set encrypted_password = extensions.crypt(:'test_password', extensions.gen_salt('bf'))
   where encrypted_password is not null;
\endif
