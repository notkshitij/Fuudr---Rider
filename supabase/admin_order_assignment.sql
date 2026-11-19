create function public.admin_assignable_riders()
returns table (id uuid, full_name text)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.full_name from public.rider_profiles p
  where (select auth.uid()) is not null and (select public.is_admin())
    and p.verification_status = 'approved'
  order by p.full_name, p.id;
$$;
revoke all on function public.admin_assignable_riders() from public, anon;
grant execute on function public.admin_assignable_riders() to authenticated;

create function public.admin_assign_order_rider(p_order_id uuid, p_rider_id uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then
    raise exception 'Only admins can assign riders' using errcode = '42501';
  end if;
  if p_rider_id is not null then
    perform 1 from public.rider_profiles
      where id = p_rider_id and verification_status = 'approved' for share;
    if not found then
      raise exception 'Select an approved rider' using errcode = '23514';
    end if;
  end if;
  update public.orders set assigned_rider_id = p_rider_id where id = p_order_id;
  if not found then raise exception 'Order not found'; end if;
  return p_rider_id;
end;
$$;
revoke all on function public.admin_assign_order_rider(uuid, uuid) from public, anon;
grant execute on function public.admin_assign_order_rider(uuid, uuid) to authenticated;
notify pgrst, 'reload schema';
