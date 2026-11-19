create function public.admin_rider_locations()
returns table (id uuid, full_name text, phone text, latitude double precision, longitude double precision, tracking_active boolean, position_timestamp timestamptz)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.full_name, p.phone, l.latitude, l.longitude,
         coalesce(l.tracking_active, false), l.position_timestamp
  from public.rider_profiles p
  left join public.rider_live_locations l on l.rider_id = p.id
  where (select auth.uid()) is not null and (select public.is_admin())
    and p.verification_status in ('approved', 'verified')
  order by l.position_timestamp desc nulls last, p.full_name;
$$;
revoke all on function public.admin_rider_locations() from public, anon;
grant execute on function public.admin_rider_locations() to authenticated;
notify pgrst, 'reload schema';
