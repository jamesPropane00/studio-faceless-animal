-- Fanvue listings are promotional links only. Faceless Supply never stores
-- explicit media or processes Fanvue payments through Stripe.
alter table public.products
  add column if not exists content_rating text not null default 'general';

alter table public.products drop constraint if exists products_content_rating;
alter table public.products add constraint products_content_rating
  check (content_rating in ('general', 'mature_external'));

alter table public.products drop constraint if exists products_fulfillment_provider;
alter table public.products add constraint products_fulfillment_provider
  check (fulfillment_provider in ('internal', 'spring', 'fanvue'));

alter table public.products drop constraint if exists products_external_purchase_url;
alter table public.products add constraint products_external_purchase_url check (
  (fulfillment_provider = 'internal' and external_purchase_url is null)
  or (
    fulfillment_provider = 'spring'
    and external_purchase_url ~ '^https://[a-zA-Z0-9-]+\.creator-spring\.com/listing/[a-zA-Z0-9-]+(?:[/?#].*)?$'
  )
  or (
    fulfillment_provider = 'fanvue'
    and external_purchase_url ~ '^https://(www\.)?fanvue\.com/[^[:space:]]+$'
  )
);

create index if not exists products_content_rating_idx
  on public.products(content_rating, published, updated_at desc);
