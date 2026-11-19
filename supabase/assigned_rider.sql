alter table public.orders add column assigned_rider_id uuid references public.rider_profiles(id) on delete set null;
create index orders_assigned_rider_created_idx on public.orders (assigned_rider_id, created_at desc) where assigned_rider_id is not null;
create policy orders_assigned_rider_read on public.orders for select to authenticated using (assigned_rider_id = (select auth.uid()));
create function public.guard_order_rider_assignment() returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon','authenticated') and not coalesce(public.is_admin(),false) then
    if tg_op = 'INSERT' then
      if new.assigned_rider_id is not null then raise exception 'Only dispatch can assign riders' using errcode = '42501'; end if;
    elsif new.assigned_rider_id is distinct from old.assigned_rider_id then
      raise exception 'Only dispatch can assign riders' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger guard_order_rider_assignment before insert or update of assigned_rider_id on public.orders for each row execute function public.guard_order_rider_assignment();
notify pgrst, 'reload schema';
