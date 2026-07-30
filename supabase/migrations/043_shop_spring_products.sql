-- Spring/Teespring products are advertised and indexed on Faceless Supply,
-- but payment, inventory, production, shipping and support stay with Spring.
alter table public.products
  add column if not exists fulfillment_provider text not null default 'internal',
  add column if not exists external_purchase_url text,
  add column if not exists external_listing_id text;

alter table public.products drop constraint if exists products_fulfillment_provider;
alter table public.products add constraint products_fulfillment_provider
  check (fulfillment_provider in ('internal', 'spring'));

alter table public.products drop constraint if exists products_external_purchase_url;
alter table public.products add constraint products_external_purchase_url check (
  (fulfillment_provider = 'internal' and external_purchase_url is null)
  or (
    fulfillment_provider = 'spring'
    and external_purchase_url ~ '^https://[a-zA-Z0-9-]+\.creator-spring\.com/listing/[a-zA-Z0-9-]+(?:[/?#].*)?$'
  )
);

create index if not exists products_fulfillment_provider_idx
  on public.products(fulfillment_provider, published, updated_at desc);

-- First supplied Spring listing.
with saved_product as (
  insert into public.products (
    title, description, price_cents, quantity, sku, condition, category,
    shipping_price_cents, local_pickup, published, state, product_kind,
    slug, seo_title, meta_description, search_keywords, brand,
    fulfillment_provider, external_purchase_url, external_listing_id
  ) values (
    'Coke Boys Character Trio Vinyl Sticker',
    'Coke Boys Character Trio die-cut sticker made from laminated 6 mil vinyl with a UV gloss finish that protects the artwork indoors and outdoors.',
    699, 1, 'FA-SPRING-132164762', 'New', 'Stickers',
    0, false, true, 'available', 'physical',
    'coke-boys-character-trio-vinyl-sticker',
    'Coke Boys Character Trio Vinyl Sticker | Faceless Supply',
    'Shop the Coke Boys Character Trio die-cut vinyl sticker with a durable UV gloss laminate for indoor or outdoor use.',
    array['coke','boys','character','trio','vinyl','sticker','die-cut','laminated','outdoor','faceless','animal'],
    'Faceless Animal Studios',
    'spring',
    'https://my-store-10fbb0b.creator-spring.com/listing/coke-boys-character-trio',
    '132164762'
  )
  on conflict (sku) do update set
    title = excluded.title,
    description = excluded.description,
    price_cents = excluded.price_cents,
    category = excluded.category,
    slug = excluded.slug,
    seo_title = excluded.seo_title,
    meta_description = excluded.meta_description,
    search_keywords = excluded.search_keywords,
    fulfillment_provider = excluded.fulfillment_provider,
    external_purchase_url = excluded.external_purchase_url,
    external_listing_id = excluded.external_listing_id,
    updated_at = now()
  returning id
)
insert into public.product_images (
  product_id, storage_path, public_url, alt_text, sort_order
)
select
  id,
  'spring/132164762/front',
  'https://mockup-api.teespring.com/v3/image/jahxg-VKF_r9GNg2P4Kg_sAceR4/1200/1200.jpg',
  'Coke Boys Character Trio die-cut vinyl sticker',
  0
from saved_product
where not exists (
  select 1 from public.product_images image
  where image.product_id = saved_product.id
    and image.storage_path = 'spring/132164762/front'
);
