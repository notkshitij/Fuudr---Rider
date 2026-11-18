-- Current rider positions, separated from KYC/profile data.
-- Private by default: a rider can read/write only their own row.
-- The separate admin map should read this with an authenticated admin policy
-- or a server-side service-role client. Never put the service-role key in a browser.

create table if not exists public.rider_live_locations (
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
