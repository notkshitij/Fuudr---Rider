-- Only this action can advance a dispatch-assigned rider's accepted delivery.
create schema if not exists rider_private;
revoke all on schema rider_private from public, anon;
grant usage on schema rider_private to authenticated;

create or replace function rider_private.advance_assigned_order(p_order_id uuid, p_token uuid, p_next text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_rider uuid := auth.uid();
  v_expected text;
  v_status text;
begin
  if v_rider is null then raise exception 'Sign in to update this delivery' using errcode = '42501'; end if;
  if p_next is null or p_next not in ('on_the_way', 'delivered') then
    raise exception 'Invalid delivery status' using errcode = '22023';
  end if;
  perform 1 from public.rider_profiles
    where id = v_rider and verification_status in ('approved', 'verified') for share;
  if not found then raise exception 'Your rider account is not approved' using errcode = '42501'; end if;
  v_expected := case p_next when 'on_the_way' then 'prepared' else 'on_the_way' end;
  update public.orders set status = p_next
    where id = p_order_id and assigned_rider_id = v_rider
      and rider_assignment_token = p_token and rider_response = 'accepted'
      and status = v_expected
    returning status into v_status;
  if not found then
    raise exception 'This order changed or is no longer your accepted assignment. Refresh and try again.' using errcode = 'P0001';
  end if;
  if v_status is distinct from p_next then raise exception 'Order status was not updated'; end if;
  return v_status;
end;
$$;
revoke all on function rider_private.advance_assigned_order(uuid,uuid,text) from public, anon;
grant execute on function rider_private.advance_assigned_order(uuid,uuid,text) to authenticated;

create or replace function public.advance_assigned_rider_order(p_order_id uuid, p_token uuid, p_next text)
returns text language sql security invoker set search_path = '' as $$
  select rider_private.advance_assigned_order(p_order_id, p_token, p_next);
$$;
revoke all on function public.advance_assigned_rider_order(uuid,uuid,text) from public, anon;
grant execute on function public.advance_assigned_rider_order(uuid,uuid,text) to authenticated;
notify pgrst, 'reload schema';
