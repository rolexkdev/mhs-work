-- =============================================================
-- Ảnh đại diện (avatar) cho thành viên.
--   - Thêm cột avatar_url vào profiles.
--   - Bucket 'avatars' công khai để hiển thị ảnh trực tiếp qua URL.
-- =============================================================
alter table public.profiles
  add column if not exists avatar_url text;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Ai cũng xem được ảnh (bucket public).
create policy "avatars_read" on storage.objects
  for select to public
  using (bucket_id = 'avatars');

-- User đã đăng nhập tự tải ảnh của mình.
create policy "avatars_upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and owner = auth.uid());

create policy "avatars_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and owner = auth.uid());

create policy "avatars_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and owner = auth.uid());
