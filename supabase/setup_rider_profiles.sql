create table public.rider_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  document_type text check (document_type in ('aadhaar', 'pan', 'driving_license')),
  verification_method text check (verification_method in ('document', 'selfie')),
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'approved', 'rejected')),
  rejection_reason text,
  verification_image_path text,
  id_image_path text,
  selfie_image_path text,
  created_at timestamptz not null default now()
);
alter table public.rider_profiles enable row level security;
revoke all on public.rider_profiles from public, anon, authenticated;
grant select on public.rider_profiles to authenticated;
grant insert (id, email, full_name, phone, document_type, verification_method,
  verification_image_path, id_image_path, selfie_image_path)
  on public.rider_profiles to authenticated;
grant update (id, email, full_name, phone, document_type, verification_method,
  verification_image_path, id_image_path, selfie_image_path)
  on public.rider_profiles to authenticated;
create policy rider_profile_read on public.rider_profiles for select to authenticated
  using (id = (select auth.uid()));
create policy rider_profile_insert on public.rider_profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy rider_profile_update on public.rider_profiles for update to authenticated
  using (id = (select auth.uid()) and verification_status in ('pending', 'rejected'))
  with check (id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rider-verification', 'rider-verification', false, 8388608, array['image/*']);

-- Restrictive policies also protect this bucket from broad policies belonging to other apps.
create policy rider_verification_guard_read on storage.objects as restrictive
  for select to authenticated using (
    bucket_id <> 'rider-verification' or (storage.foldername(name))[1] = (select auth.uid())::text);
create policy rider_verification_guard_insert on storage.objects as restrictive
  for insert to authenticated with check (
    bucket_id <> 'rider-verification' or (storage.foldername(name))[1] = (select auth.uid())::text);
create policy rider_verification_guard_update on storage.objects as restrictive
  for update to authenticated using (
    bucket_id <> 'rider-verification' or (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (
    bucket_id <> 'rider-verification' or (storage.foldername(name))[1] = (select auth.uid())::text);
create policy rider_verification_guard_delete on storage.objects as restrictive
  for delete to authenticated using (
    bucket_id <> 'rider-verification' or (storage.foldername(name))[1] = (select auth.uid())::text);
create policy rider_verification_block_anon on storage.objects as restrictive
  for all to anon using (bucket_id <> 'rider-verification')
  with check (bucket_id <> 'rider-verification');
create policy rider_verification_read on storage.objects for select to authenticated
  using (bucket_id = 'rider-verification' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy rider_verification_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'rider-verification' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy rider_verification_update on storage.objects for update to authenticated
  using (bucket_id = 'rider-verification' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'rider-verification' and (storage.foldername(name))[1] = (select auth.uid())::text);

grant all on public.rider_profiles to service_role;
