-- Keep ten-minute inventory holds accurate and make late Stripe payments safe.

create or replace function public.release_expired_shop_reservations()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_count integer;
begin
  with expired as (
    update inventory_reservations
      set status='expired'
      where status='active' and expires_at<=now()
      returning product_id
  ),
  released as (
    update products p
      set state=case
        when p.quantity-(
          select coalesce(sum(r.quantity),0)
          from inventory_reservations r
          where r.product_id=p.id
            and r.status='active'
            and r.expires_at>now()
        )<=0 then 'reserved'::product_state
        else 'available'::product_state
      end
      where p.state not in ('sold','inactive')
        and p.id in (select product_id from expired)
      returning p.id
  )
  select count(*) into v_count from expired;
  return v_count;
end
$$;

revoke all on function public.release_expired_shop_reservations() from public;
grant execute on function public.release_expired_shop_reservations() to anon,authenticated,service_role;

create or replace function public.process_shop_payment(
  p_event_id text,
  p_event_type text,
  p_payload jsonb,
  p_order_id uuid,
  p_session_id text,
  p_payment_intent_id text
)
returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  v_status public.order_status;
  v_reservation record;
begin
  insert into payment_events(stripe_event_id,event_type,order_id,payload)
    values(p_event_id,p_event_type,p_order_id,p_payload)
    on conflict(stripe_event_id) do nothing;

  select status into v_status
    from orders
    where id=p_order_id
    for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if v_status in ('paid','shipped','completed','refunded') then
    return 'duplicate';
  end if;

  if v_status <> 'pending' then
    return 'not_pending';
  end if;

  perform 1
    from inventory_reservations
    where order_id=p_order_id
    for update;

  if exists (
    select 1
    from order_items i
    left join inventory_reservations r
      on r.order_id=i.order_id and r.product_id=i.product_id
    where i.order_id=p_order_id
      and (
        r.id is null
        or r.status<>'active'
        or r.expires_at<=now()
      )
  ) then
    update inventory_reservations
      set status='expired'
      where order_id=p_order_id and status='active';
    return 'expired';
  end if;

  update orders
    set status='paid',
        stripe_session_id=p_session_id,
        stripe_payment_intent_id=p_payment_intent_id,
        paid_at=now()
    where id=p_order_id;

  for v_reservation in
    select *
    from inventory_reservations
    where order_id=p_order_id and status='active'
    for update
  loop
    update products
      set quantity=greatest(0,quantity-v_reservation.quantity),
          state=case
            when quantity-v_reservation.quantity<=0
              then 'sold'::product_state
            else 'available'::product_state
          end
      where id=v_reservation.product_id;

    update inventory_reservations
      set status='converted'
      where id=v_reservation.id;
  end loop;

  return 'completed';
end
$$;

revoke all on function public.process_shop_payment(text,text,jsonb,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.process_shop_payment(text,text,jsonb,uuid,text,text)
  to service_role;
