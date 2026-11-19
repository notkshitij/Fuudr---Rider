alter table public.orders
  add column rider_response text not null default 'pending' check (rider_response in ('pending','accepted','rejected')),
  add column rider_assignment_token uuid not null default gen_random_uuid();

create function public.guard_rider_response() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon','authenticated') then
    if tg_op = 'INSERT' then
      if new.rider_response <> 'pending' then
        raise exception 'Rider response must be pending' using errcode = '42501';
      end if;
    elsif new.rider_response is distinct from old.rider_response
       or new.rider_assignment_token is distinct from old.rider_assignment_token then
      raise exception 'Use the rider response action' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    if new.assigned_rider_id is distinct from old.assigned_rider_id then
      new.rider_response := 'pending';
      new.rider_assignment_token := gen_random_uuid();
    end if;
  end if;
  return new;
end;
$$;
create trigger guard_rider_response before insert or update on public.orders
for each row execute function public.guard_rider_response();

create function public.respond_to_rider_assignment(p_order_id uuid, p_token uuid, p_response text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_response is null or p_response not in ('accepted','rejected') then
    raise exception 'Invalid rider response';
  end if;
  update public.orders set rider_response = p_response
    where id = p_order_id and assigned_rider_id = (select auth.uid())
      and rider_assignment_token = p_token and rider_response = 'pending'
      and status not in ('cancelled','delivered');
  if not found then raise exception 'This assignment is no longer awaiting your response'; end if;
end;
$$;
revoke all on function public.respond_to_rider_assignment(uuid,uuid,text) from public, anon;
grant execute on function public.respond_to_rider_assignment(uuid,uuid,text) to authenticated;
notify pgrst, 'reload schema';
