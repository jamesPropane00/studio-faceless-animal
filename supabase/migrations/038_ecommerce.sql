-- Faceless Animal Studios ecommerce
create extension if not exists pgcrypto;

create type public.product_state as enum ('available','reserved','sold','inactive');
create type public.order_status as enum ('pending','paid','shipped','completed','refunded','canceled');
create type public.fulfillment_method as enum ('shipping','pickup');
create type public.reservation_status as enum ('active','converted','expired','canceled');

create table public.shop_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_shop_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.shop_admins where user_id = auth.uid()) $$;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 160),
  description text not null default '',
  price_cents integer not null check (price_cents >= 0),
  quantity integer not null default 0 check (quantity >= 0),
  sku text not null unique,
  condition text not null default 'new',
  category text not null default 'Other',
  shipping_price_cents integer not null default 0 check (shipping_price_cents >= 0),
  local_pickup boolean not null default false,
  state public.product_state not null default 'inactive',
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_public_idx on public.products(published,state,category);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  storage_path text not null,
  public_url text not null,
  alt_text text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index product_images_product_idx on public.product_images(product_id,sort_order);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('FA-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  status public.order_status not null default 'pending',
  fulfillment_method public.fulfillment_method not null,
  customer_email text not null,
  customer_name text not null,
  customer_phone text,
  shipping_address jsonb,
  subtotal_cents integer not null check (subtotal_cents >= 0),
  shipping_cents integer not null check (shipping_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  currency text not null default 'usd',
  stripe_session_id text unique,
  stripe_payment_intent_id text,
  reservation_token uuid not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);
create index orders_status_created_idx on public.orders(status,created_at desc);
create index orders_email_idx on public.orders(lower(customer_email));

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  title text not null,
  sku text not null,
  unit_price_cents integer not null check(unit_price_cents >= 0),
  quantity integer not null check(quantity > 0),
  shipping_price_cents integer not null default 0,
  image_url text,
  created_at timestamptz not null default now()
);
create index order_items_order_idx on public.order_items(order_id);

create table public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity integer not null check(quantity > 0),
  status public.reservation_status not null default 'active',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(order_id,product_id)
);
create index reservations_active_idx on public.inventory_reservations(product_id,expires_at) where status='active';

create table public.payment_events (
  stripe_event_id text primary key,
  event_type text not null,
  order_id uuid references public.orders(id) on delete set null,
  payload jsonb not null,
  processed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger products_updated before update on public.products for each row execute function public.set_updated_at();
create trigger orders_updated before update on public.orders for each row execute function public.set_updated_at();
create or replace function public.protect_order_payment_state() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' and (
    new.paid_at is distinct from old.paid_at or
    new.stripe_session_id is distinct from old.stripe_session_id or
    new.stripe_payment_intent_id is distinct from old.stripe_payment_intent_id or
    (new.status='paid' and old.status<>'paid')
  ) then raise exception 'Payment state can only be changed by the verified webhook'; end if;
  return new;
end $$;
create trigger protect_order_payment before update on public.orders for each row execute function public.protect_order_payment_state();

-- Server-only atomic reservation. Edge Functions call this with the service role.
create or replace function public.create_shop_order(
  p_items jsonb, p_fulfillment public.fulfillment_method, p_customer jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order uuid := gen_random_uuid(); v_token uuid := gen_random_uuid();
  v_subtotal integer := 0; v_shipping integer := 0; v_item jsonb; v_product products%rowtype;
  v_qty integer; v_reserved integer; v_seen uuid[] := '{}';
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then raise exception 'Cart is empty'; end if;
  if coalesce(p_customer->>'email','') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'A valid email is required'; end if;
  -- Release expired holds before locking requested products.
  update inventory_reservations set status='expired' where status='active' and expires_at <= now();
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := greatest(1,least(20,(v_item->>'quantity')::integer));
    select * into v_product from products where id=(v_item->>'product_id')::uuid for update;
    if not found or not v_product.published or v_product.state in ('inactive','sold') then raise exception 'A product is sold out or unavailable'; end if;
    if v_product.id = any(v_seen) then raise exception 'Duplicate product'; end if;
    v_seen := array_append(v_seen,v_product.id);
    select coalesce(sum(quantity),0) into v_reserved from inventory_reservations
      where product_id=v_product.id and status='active' and expires_at>now();
    if v_product.quantity-v_reserved < v_qty then raise exception '% is sold out or has insufficient stock', v_product.title; end if;
    if p_fulfillment='pickup' and not v_product.local_pickup then raise exception '% is not available for pickup',v_product.title; end if;
    v_subtotal := v_subtotal + v_product.price_cents*v_qty;
    if p_fulfillment='shipping' then v_shipping := v_shipping + v_product.shipping_price_cents*v_qty; end if;
  end loop;
  insert into orders(id,fulfillment_method,customer_email,customer_name,customer_phone,shipping_address,
    subtotal_cents,shipping_cents,total_cents,reservation_token)
  values(v_order,p_fulfillment,lower(p_customer->>'email'),p_customer->>'name',nullif(p_customer->>'phone',''),
    case when p_fulfillment='shipping' then p_customer->'shipping_address' else null end,
    v_subtotal,v_shipping,v_subtotal+v_shipping,v_token);
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := greatest(1,least(20,(v_item->>'quantity')::integer));
    select * into v_product from products where id=(v_item->>'product_id')::uuid;
    insert into order_items(order_id,product_id,title,sku,unit_price_cents,quantity,shipping_price_cents,image_url)
      select v_order,v_product.id,v_product.title,v_product.sku,v_product.price_cents,v_qty,
        case when p_fulfillment='shipping' then v_product.shipping_price_cents else 0 end,
        (select public_url from product_images where product_id=v_product.id order by sort_order,id limit 1);
    insert into inventory_reservations(order_id,product_id,quantity,expires_at)
      values(v_order,v_product.id,v_qty,now()+interval '10 minutes');
    update products set state=case when quantity-(select coalesce(sum(quantity),0) from inventory_reservations where product_id=v_product.id and status='active' and expires_at>now())<=0 then 'reserved' else state end where id=v_product.id;
  end loop;
  return jsonb_build_object('order_id',v_order,'reservation_token',v_token,'total_cents',v_subtotal+v_shipping);
end $$;
revoke all on function public.create_shop_order(jsonb,public.fulfillment_method,jsonb) from public,anon,authenticated;
grant execute on function public.create_shop_order(jsonb,public.fulfillment_method,jsonb) to service_role;

create or replace function public.complete_shop_payment(p_event_id text,p_event_type text,p_payload jsonb,p_order_id uuid,p_session_id text,p_payment_intent_id text)
returns boolean language plpgsql security definer set search_path=public as $$
declare r record;
begin
  insert into payment_events(stripe_event_id,event_type,order_id,payload) values(p_event_id,p_event_type,p_order_id,p_payload)
  on conflict(stripe_event_id) do nothing;
  if not found then return false; end if;
  update orders set status='paid',stripe_session_id=p_session_id,stripe_payment_intent_id=p_payment_intent_id,paid_at=now()
    where id=p_order_id and status='pending';
  if not found then return false; end if;
  for r in select * from inventory_reservations where order_id=p_order_id and status='active' for update loop
    update products set quantity=greatest(0,quantity-r.quantity),
      state=case when quantity-r.quantity<=0 then 'sold'::product_state else 'available'::product_state end where id=r.product_id;
    update inventory_reservations set status='converted' where id=r.id;
  end loop;
  return true;
end $$;
revoke all on function public.complete_shop_payment(text,text,jsonb,uuid,text,text) from public,anon,authenticated;
grant execute on function public.complete_shop_payment(text,text,jsonb,uuid,text,text) to service_role;

create or replace function public.get_order_status(p_order uuid,p_token uuid)
returns table(order_number text,status order_status,fulfillment_method fulfillment_method,subtotal_cents integer,shipping_cents integer,total_cents integer,created_at timestamptz,items jsonb)
language sql stable security definer set search_path=public as $$
select o.order_number,o.status,o.fulfillment_method,o.subtotal_cents,o.shipping_cents,o.total_cents,o.created_at,
 coalesce(jsonb_agg(jsonb_build_object('title',i.title,'quantity',i.quantity,'unit_price_cents',i.unit_price_cents,'image_url',i.image_url) order by i.created_at),'[]')
from orders o join order_items i on i.order_id=o.id where o.id=p_order and o.reservation_token=p_token
group by o.id $$;
grant execute on function public.get_order_status(uuid,uuid) to anon,authenticated;

alter table products enable row level security; alter table product_images enable row level security;
alter table orders enable row level security; alter table order_items enable row level security;
alter table inventory_reservations enable row level security; alter table payment_events enable row level security;
alter table shop_admins enable row level security;
create policy "public products" on products for select using(published and state in ('available','reserved') and quantity>0);
create policy "public product images" on product_images for select using(exists(select 1 from products p where p.id=product_id and p.published and p.state in ('available','reserved')));
create policy "admins products" on products for all to authenticated using(is_shop_admin()) with check(is_shop_admin());
create policy "admins images" on product_images for all to authenticated using(is_shop_admin()) with check(is_shop_admin());
create policy "admins orders" on orders for select to authenticated using(is_shop_admin());
create policy "admins update fulfillment" on orders for update to authenticated using(is_shop_admin())
  with check(is_shop_admin() and status in ('paid','shipped','completed','refunded','canceled'));
create policy "admins order items" on order_items for select to authenticated using(is_shop_admin());
create policy "admins reservations" on inventory_reservations for select to authenticated using(is_shop_admin());
create policy "admins events" on payment_events for select to authenticated using(is_shop_admin());
create policy "admins list" on shop_admins for select to authenticated using(is_shop_admin());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('product-images','product-images',true,10485760,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict(id) do update set public=true;
create policy "public product image files" on storage.objects for select using(bucket_id='product-images');
create policy "admins upload product files" on storage.objects for insert to authenticated with check(bucket_id='product-images' and public.is_shop_admin());
create policy "admins update product files" on storage.objects for update to authenticated using(bucket_id='product-images' and public.is_shop_admin());
create policy "admins delete product files" on storage.objects for delete to authenticated using(bucket_id='product-images' and public.is_shop_admin());
