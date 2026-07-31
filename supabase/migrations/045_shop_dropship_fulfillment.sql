-- Dropship products remain normal Faceless Supply/Stripe products, while
-- supplier purchasing details stay private and are snapshotted onto each order.

alter table public.products
  add column if not exists content_rating text not null default 'general',
  add column if not exists fulfillment_mode text not null default 'stocked',
  add column if not exists ships_from text,
  add column if not exists delivery_min_business_days smallint,
  add column if not exists delivery_max_business_days smallint,
  add column if not exists shipping_service text;

alter table public.products drop constraint if exists products_content_rating;
alter table public.products add constraint products_content_rating
  check (content_rating in ('general', 'mature_external'));

alter table public.products drop constraint if exists products_fulfillment_mode;
alter table public.products add constraint products_fulfillment_mode
  check (fulfillment_mode in ('stocked', 'dropship'));

alter table public.products drop constraint if exists products_delivery_window;
alter table public.products add constraint products_delivery_window check (
  (
    fulfillment_mode = 'stocked'
    and delivery_min_business_days is null
    and delivery_max_business_days is null
  )
  or (
    fulfillment_mode = 'dropship'
    and product_kind = 'physical'
    and delivery_min_business_days between 1 and 90
    and delivery_max_business_days between delivery_min_business_days and 120
    and length(trim(coalesce(ships_from, ''))) between 2 and 80
  )
);

create index if not exists products_fulfillment_mode_idx
  on public.products(fulfillment_mode, published, updated_at desc);

create table if not exists public.product_sources (
  product_id uuid primary key references public.products(id) on delete cascade,
  supplier_name text not null default 'AliExpress',
  supplier_product_url text not null,
  supplier_product_id text,
  supplier_variant text,
  supplier_cost_cents integer check (supplier_cost_cents is null or supplier_cost_cents >= 0),
  supplier_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(supplier_name)) between 2 and 80),
  check (supplier_product_url ~ '^https://[^[:space:]]+$')
);

create index if not exists product_sources_supplier_idx
  on public.product_sources(lower(supplier_name), updated_at desc);

drop trigger if exists product_sources_updated on public.product_sources;
create trigger product_sources_updated
  before update on public.product_sources
  for each row execute function public.set_updated_at();

alter table public.product_sources enable row level security;
revoke all on public.product_sources from public, anon, authenticated;

alter table public.order_items
  add column if not exists fulfillment_mode text not null default 'stocked',
  add column if not exists ships_from text,
  add column if not exists delivery_min_business_days smallint,
  add column if not exists delivery_max_business_days smallint,
  add column if not exists shipping_service text,
  add column if not exists supplier_name text,
  add column if not exists supplier_product_url text,
  add column if not exists supplier_product_id text,
  add column if not exists supplier_variant text,
  add column if not exists supplier_cost_cents integer,
  add column if not exists supplier_notes text,
  add column if not exists supplier_order_id text,
  add column if not exists supplier_tracking_number text,
  add column if not exists supplier_status text not null default 'not_required';

alter table public.order_items drop constraint if exists order_items_fulfillment_mode;
alter table public.order_items add constraint order_items_fulfillment_mode
  check (fulfillment_mode in ('stocked', 'dropship'));

alter table public.order_items drop constraint if exists order_items_supplier_status;
alter table public.order_items add constraint order_items_supplier_status
  check (supplier_status in ('not_required', 'awaiting_purchase', 'ordered', 'shipped', 'delivered', 'canceled'));

create index if not exists order_items_supplier_status_idx
  on public.order_items(supplier_status, created_at desc)
  where fulfillment_mode = 'dropship';

create or replace function public.create_shop_order(
  p_items jsonb, p_fulfillment public.fulfillment_method, p_customer jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order uuid := gen_random_uuid(); v_token uuid := gen_random_uuid();
  v_subtotal integer := 0; v_shipping integer := 0; v_item jsonb; v_product products%rowtype;
  v_source product_sources%rowtype;
  v_qty integer; v_reserved integer; v_seen uuid[] := '{}'; v_has_physical boolean := false;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then raise exception 'Cart is empty'; end if;
  if coalesce(p_customer->>'email','') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'A valid email is required'; end if;
  if length(trim(coalesce(p_customer->>'name',''))) < 2 then raise exception 'Customer name is required'; end if;
  with expired_products as (
    update inventory_reservations set status='expired'
      where status='active' and expires_at <= now()
      returning product_id
  )
  update products p set state='available'
    where p.state='reserved' and p.quantity>0
      and p.id in (select product_id from expired_products)
      and not exists (
        select 1 from inventory_reservations r
        where r.product_id=p.id and r.status='active' and r.expires_at>now()
      );
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := greatest(1,least(20,(v_item->>'quantity')::integer));
    select * into v_product from products where id=(v_item->>'product_id')::uuid for update;
    if not found or not v_product.published or v_product.state in ('inactive','sold') then raise exception 'A product is sold out or unavailable'; end if;
    if v_product.id = any(v_seen) then raise exception 'Duplicate product'; end if;
    v_seen := array_append(v_seen,v_product.id);
    select coalesce(sum(quantity),0) into v_reserved from inventory_reservations
      where product_id=v_product.id and status='active' and expires_at>now();
    if v_product.quantity-v_reserved < v_qty then raise exception '% is sold out or has insufficient stock', v_product.title; end if;
    if v_product.product_kind='physical' then
      v_has_physical := true;
      if p_fulfillment='digital' then raise exception 'Choose shipping or pickup for physical products'; end if;
      if v_product.fulfillment_mode='dropship' and not exists (
        select 1 from product_sources s where s.product_id=v_product.id
      ) then raise exception '% is missing its supplier source', v_product.title;
      end if;
      if v_product.fulfillment_mode='dropship' and p_fulfillment='pickup' then
        raise exception '% ships directly from a supplier and is not available for pickup', v_product.title;
      end if;
      if p_fulfillment='pickup' and not v_product.local_pickup then raise exception '% is not available for pickup',v_product.title; end if;
      if p_fulfillment='shipping' then v_shipping := v_shipping + v_product.shipping_price_cents*v_qty; end if;
    end if;
    v_subtotal := v_subtotal + v_product.price_cents*v_qty;
  end loop;
  if not v_has_physical and p_fulfillment <> 'digital' then p_fulfillment := 'digital'; end if;
  if v_has_physical and p_fulfillment='shipping' and (
    coalesce(p_customer->'shipping_address'->>'line1','')='' or
    coalesce(p_customer->'shipping_address'->>'city','')='' or
    coalesce(p_customer->'shipping_address'->>'state','')='' or
    coalesce(p_customer->'shipping_address'->>'postal_code','')=''
  ) then raise exception 'A complete shipping address is required'; end if;
  insert into orders(id,fulfillment_method,customer_email,customer_name,customer_phone,shipping_address,
    subtotal_cents,shipping_cents,total_cents,reservation_token)
  values(v_order,p_fulfillment,lower(p_customer->>'email'),trim(p_customer->>'name'),nullif(p_customer->>'phone',''),
    case when p_fulfillment='shipping' then p_customer->'shipping_address' else null end,
    v_subtotal,v_shipping,v_subtotal+v_shipping,v_token);
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := greatest(1,least(20,(v_item->>'quantity')::integer));
    select * into v_product from products where id=(v_item->>'product_id')::uuid;
    select * into v_source from product_sources where product_id=v_product.id;
    insert into order_items(
      order_id,product_id,title,sku,unit_price_cents,quantity,shipping_price_cents,image_url,
      product_kind,download_storage_path,download_filename,
      fulfillment_mode,ships_from,delivery_min_business_days,delivery_max_business_days,shipping_service,
      supplier_name,supplier_product_url,supplier_product_id,supplier_variant,supplier_cost_cents,supplier_notes,
      supplier_status
    )
    values (
      v_order,v_product.id,v_product.title,v_product.sku,v_product.price_cents,v_qty,
      case when p_fulfillment='shipping' and v_product.product_kind='physical' then v_product.shipping_price_cents else 0 end,
      (select public_url from product_images where product_id=v_product.id order by sort_order,id limit 1),
      v_product.product_kind,v_product.download_storage_path,v_product.download_filename,
      v_product.fulfillment_mode,v_product.ships_from,v_product.delivery_min_business_days,
      v_product.delivery_max_business_days,v_product.shipping_service,
      case when v_product.fulfillment_mode='dropship' then v_source.supplier_name else null end,
      case when v_product.fulfillment_mode='dropship' then v_source.supplier_product_url else null end,
      case when v_product.fulfillment_mode='dropship' then v_source.supplier_product_id else null end,
      case when v_product.fulfillment_mode='dropship' then v_source.supplier_variant else null end,
      case when v_product.fulfillment_mode='dropship' then v_source.supplier_cost_cents else null end,
      case when v_product.fulfillment_mode='dropship' then v_source.supplier_notes else null end,
      case when v_product.fulfillment_mode='dropship' then 'awaiting_purchase' else 'not_required' end
    );
    insert into inventory_reservations(order_id,product_id,quantity,expires_at)
      values(v_order,v_product.id,v_qty,now()+interval '10 minutes');
    update products set state=case when quantity-(select coalesce(sum(quantity),0) from inventory_reservations where product_id=v_product.id and status='active' and expires_at>now())<=0 then 'reserved' else 'available' end where id=v_product.id;
  end loop;
  return jsonb_build_object('order_id',v_order,'reservation_token',v_token,'total_cents',v_subtotal+v_shipping);
end $$;

revoke all on function public.create_shop_order(jsonb,public.fulfillment_method,jsonb) from public,anon,authenticated;
grant execute on function public.create_shop_order(jsonb,public.fulfillment_method,jsonb) to service_role;

create or replace function public.get_order_status(p_order uuid,p_token uuid)
returns table(order_number text,status order_status,fulfillment_method fulfillment_method,subtotal_cents integer,shipping_cents integer,total_cents integer,created_at timestamptz,items jsonb)
language sql stable security definer set search_path=public as $$
select o.order_number,o.status,o.fulfillment_method,o.subtotal_cents,o.shipping_cents,o.total_cents,o.created_at,
 coalesce(jsonb_agg(jsonb_build_object(
   'title',i.title,
   'quantity',i.quantity,
   'unit_price_cents',i.unit_price_cents,
   'image_url',i.image_url,
   'fulfillment_mode',i.fulfillment_mode,
   'ships_from',i.ships_from,
   'delivery_min_business_days',i.delivery_min_business_days,
   'delivery_max_business_days',i.delivery_max_business_days,
   'shipping_service',i.shipping_service,
   'supplier_status',i.supplier_status,
   'tracking_number',i.supplier_tracking_number
 ) order by i.created_at),'[]')
from orders o join order_items i on i.order_id=o.id where o.id=p_order and o.reservation_token=p_token
group by o.id $$;

grant execute on function public.get_order_status(uuid,uuid) to anon,authenticated;
