-- Run once in the shared project's Supabase SQL Editor.
-- Intentionally fails and rolls back if a Rider table already exists.
begin;

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
revoke all on public.rider_profiles from anon, authenticated;
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

create table public.rider_orders (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.rider_profiles(id),
  order_reference text not null,
  pickup_address text not null,
  delivery_address text not null,
  payout numeric(12,2) not null default 0 check (payout >= 0),
  status text not null default 'assigned'
    check (status in ('assigned', 'accepted', 'picked_up', 'delivered', 'declined')),
  created_at timestamptz not null default now()
);
create index rider_orders_rider_created_idx on public.rider_orders(rider_id, created_at desc);
alter table public.rider_orders enable row level security;
revoke all on public.rider_orders from anon, authenticated;
grant select on public.rider_orders to authenticated;
grant update (status) on public.rider_orders to authenticated;
create policy rider_order_read on public.rider_orders for select to authenticated
  using (rider_id = (select auth.uid()));
create policy rider_order_update on public.rider_orders for update to authenticated
  using (rider_id = (select auth.uid())) with check (rider_id = (select auth.uid()));

-- Prevent riders from skipping delivery stages or changing a completed order.
create function public.rider_validate_order_transition() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and new.status is distinct from old.status then
    if not ((old.status = 'assigned' and new.status in ('accepted', 'declined'))
      or (old.status = 'accepted' and new.status = 'picked_up')
      or (old.status = 'picked_up' and new.status = 'delivered')) then
      raise exception 'Invalid delivery status transition';
    end if;
  end if;
  return new;
end;
$$;
create trigger rider_order_transition before update on public.rider_orders
  for each row execute function public.rider_validate_order_transition();

-- Current rider positions, separated from KYC/profile data.
-- Private by default: a rider can read/write only their own row.
-- The separate admin map should read this with an authenticated admin policy
-- or a server-side service-role client. Never put the service-role key in a browser.

create table public.rider_live_locations (
  rider_id uuid primary key references public.rider_profiles (id) on delete cascade,
  latitude double precision,
  longitude double precision,
  tracking_active boolean not null default false,
  position_timestamp timestamptz,
  updated_at timestamptz not null default now(),
  constraint rider_live_locations_latitude_check
    check (latitude is null or latitude between -90 and 90),
  constraint rider_live_locations_longitude_check
    check (longitude is null or longitude between -180 and 180),
  constraint rider_live_locations_coordinates_pair_check
    check ((latitude is null) = (longitude is null))
);

create index if not exists rider_live_locations_active_updated_idx
  on public.rider_live_locations (tracking_active, updated_at desc);

alter table public.rider_live_locations enable row level security;
revoke all on public.rider_live_locations from anon, public;
grant select, insert, update on public.rider_live_locations to authenticated;

drop policy if exists "Riders can read their live location" on public.rider_live_locations;
create policy "Riders can read their live location"
  on public.rider_live_locations for select to authenticated
  using ((select auth.uid()) = rider_id);

drop policy if exists "Riders can create their live location" on public.rider_live_locations;
create policy "Riders can create their live location"
  on public.rider_live_locations for insert to authenticated
  with check ((select auth.uid()) = rider_id);

drop policy if exists "Riders can update their live location" on public.rider_live_locations;
create policy "Riders can update their live location"
  on public.rider_live_locations for update to authenticated
  using ((select auth.uid()) = rider_id)
  with check ((select auth.uid()) = rider_id);

create or replace function public.set_rider_live_location_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists rider_live_locations_updated_at on public.rider_live_locations;
create trigger rider_live_locations_updated_at
  before update on public.rider_live_locations
  for each row execute function public.set_rider_live_location_updated_at();

notify pgrst, 'reload schema';

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

grant all on public.rider_profiles, public.rider_orders, public.rider_live_locations to service_role;
commit;
