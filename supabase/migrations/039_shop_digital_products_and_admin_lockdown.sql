-- Physical goods and protected music/file downloads.
-- dynamic-function verifies the existing member_accounts session for every
-- privileged request and accepts only jdot00 or jamespropane00.
do $$ begin
  create type public.product_kind as enum ('physical','music_download','file_download');
exception when duplicate_object then null; end $$;

alter type public.fulfillment_method add value if not exists 'digital';

-- Remove the earlier Supabase Auth admin path. All privileged ecommerce access
-- now goes through dynamic-function, which verifies the existing website login.
drop policy if exists "admins products" on public.products;
drop policy if exists "admins images" on public.product_images;
drop policy if exists "admins orders" on public.orders;
drop policy if exists "admins update fulfillment" on public.orders;
drop policy if exists "admins order items" on public.order_items;
drop policy if exists "admins reservations" on public.inventory_reservations;
drop policy if exists "admins events" on public.payment_events;
drop policy if exists "admins list" on public.shop_admins;
drop policy if exists "admins upload product files" on storage.objects;
drop policy if exists "admins update product files" on storage.objects;
drop policy if exists "admins delete product files" on storage.objects;

alter table public.products
  add column if not exists product_kind public.product_kind not null default 'physical',
  add column if not exists download_storage_path text,
  add column if not exists download_filename text,
  add column if not exists download_mime_type text,
  add column if not exists preview_url text;

alter table public.products drop constraint if exists products_download_file_required;
alter table public.products add constraint products_download_file_required check (
  product_kind = 'physical'
  or (download_storage_path is not null and download_filename is not null)
);

alter table public.order_items
  add column if not exists product_kind public.product_kind not null default 'physical',
  add column if not exists download_storage_path text,
  add column if not exists download_filename text;

create or replace function public.create_shop_order(
  p_items jsonb, p_fulfillment public.fulfillment_method, p_customer jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order uuid := gen_random_uuid(); v_token uuid := gen_random_uuid();
  v_subtotal integer := 0; v_shipping integer := 0; v_item jsonb; v_product products%rowtype;
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
    insert into order_items(order_id,product_id,title,sku,unit_price_cents,quantity,shipping_price_cents,image_url,
      product_kind,download_storage_path,download_filename)
      select v_order,v_product.id,v_product.title,v_product.sku,v_product.price_cents,v_qty,
        case when p_fulfillment='shipping' and v_product.product_kind='physical' then v_product.shipping_price_cents else 0 end,
        (select public_url from product_images where product_id=v_product.id order by sort_order,id limit 1),
        v_product.product_kind,v_product.download_storage_path,v_product.download_filename;
    insert into inventory_reservations(order_id,product_id,quantity,expires_at)
      values(v_order,v_product.id,v_qty,now()+interval '10 minutes');
    update products set state=case when quantity-(select coalesce(sum(quantity),0) from inventory_reservations where product_id=v_product.id and status='active' and expires_at>now())<=0 then 'reserved' else 'available' end where id=v_product.id;
  end loop;
  return jsonb_build_object('order_id',v_order,'reservation_token',v_token,'total_cents',v_subtotal+v_shipping);
end $$;
revoke all on function public.create_shop_order(jsonb,public.fulfillment_method,jsonb) from public,anon,authenticated;
grant execute on function public.create_shop_order(jsonb,public.fulfillment_method,jsonb) to service_role;

create or replace function public.get_paid_download_items(p_order uuid,p_token uuid)
returns table(order_id uuid,status public.order_status,storage_path text,filename text,title text)
language sql stable security definer set search_path=public as $$
  select o.id,o.status,i.download_storage_path,i.download_filename,i.title
  from orders o join order_items i on i.order_id=o.id
  where o.id=p_order and o.reservation_token=p_token
    and o.status in ('paid','shipped','completed')
    and i.product_kind in ('music_download','file_download')
    and i.download_storage_path is not null
$$;
grant execute on function public.get_paid_download_items(uuid,uuid) to anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit)
values('product-downloads','product-downloads',false,536870912)
on conflict(id) do update set public=false;

-- No direct object policies are added for product-downloads. dynamic-function
-- creates short-lived signed upload URLs after verifying the existing website
-- session, and hyper-handler creates customer links only after payment.
