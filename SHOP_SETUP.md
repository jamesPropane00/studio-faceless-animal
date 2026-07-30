# Faceless Supply setup

The frontend uses the existing shared client in `assets/js/supabase-client.js`. Only the public Supabase URL/publishable key reach the browser. Stripe and service-role credentials belong only in Supabase Edge Function secrets.

## 1. Database and first admin

Apply `supabase/migrations/038_ecommerce.sql` through the Supabase CLI (`supabase db push`) or paste it into Dashboard → SQL Editor. It creates the product, image, reservation, order, item, event and admin tables; atomic reservation/payment functions; indexes; image bucket; triggers; and RLS policies.

Apply migrations `039_shop_digital_products_and_admin_lockdown.sql`, `040_shop_platform_sessions.sql`, `041_shop_reservation_and_payment_hardening.sql`, and `042_shop_seo_and_marketplace_foundation.sql` after migration 038. Shop administration uses the existing Faceless Animal website login, not a second Supabase Auth account. After a valid normal login, `smooth-endpoint` issues an opaque seven-day admin token only for `jdot00` or `jamespropane00`. `dynamic-function` verifies that token on every request. Migration 040 also removes browser read access to password, recovery and email columns. Migration 041 releases expired holds when the store loads and automatically refunds a verified Stripe payment if its ten-minute inventory reservation already expired. Migration 042 adds permanent product slugs, search metadata, GTIN/MPN/category fields, search indexes and connector-neutral eBay/Facebook listing records.

## 2. Supabase browser configuration

Keep the existing deployment variables:

```text
SUPABASE_URL=https://PROJECT.supabase.co
SUPABASE_ANON_KEY=your_publishable_or_anon_key
```

The existing build script writes those public values to `assets/js/env.js`. RLS, not key secrecy, protects the data.

## 3. Stripe settings

In Stripe Dashboard:

1. Activate the account and finish business verification.
2. Developers → API keys: copy the **Secret key** for the intended mode. Test keys begin `sk_test_`; live keys begin `sk_live_`. Do not use the publishable key for the Edge Function.
3. Developers → Webhooks → Add endpoint. Use:
   `https://PROJECT.supabase.co/functions/v1/stripe-hook`
4. Select only `checkout.session.completed`. After creating the endpoint, reveal and copy its signing secret (`whsec_…`).
5. Settings → Payment methods: enable the payment methods you want Checkout to show. Stripe dynamically presents compatible methods.
6. Settings → Checkout and Payment Links → Checkout: enable customer-facing options you want (receipts, saved methods, branding). Shipping addresses are collected by the site and snapshotted in Supabase; Stripe Checkout handles payment.

Use test mode and Stripe test card `4242 4242 4242 4242`, any future expiry/CVC, before switching all keys and the webhook endpoint to live mode.

## 4. Edge Function secrets and deployment

From a terminal authenticated with the Supabase CLI:

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_REPLACE
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_REPLACE
supabase secrets set SHOP_ORIGIN=https://your-exact-site-domain.example
supabase functions deploy clever-function
supabase functions deploy stripe-hook
supabase functions deploy hyper-handler
supabase functions deploy dynamic-function
supabase functions deploy smooth-endpoint
```

When deploying through the Dashboard editor, use those exact function names. The current storefront calls the deployed `clever-function` checkout function.

`SHOP_ORIGIN` must be the exact production origin with no trailing slash. Supabase automatically provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to deployed functions. Do not copy either secret into frontend JavaScript. JWT verification is disabled because checkout is public, Stripe cannot send a Supabase JWT, and the website uses its existing platform session. `dynamic-function` independently re-verifies that platform credential for every privileged action.

For local webhook testing:

```bash
stripe listen --forward-to http://127.0.0.1:54321/functions/v1/stripe-hook
supabase functions serve --env-file supabase/.env.local
```

Put local secrets in `supabase/.env.local` and keep that file uncommitted.

## 5. How payment and inventory work

Checkout calls the database transaction with product IDs and quantities. PostgreSQL locks each requested product, expires old holds, recalculates prices/shipping from trusted rows, and creates a 10-minute reservation. The browser-supplied cart price is never sent or used.

Stripe’s minimum Checkout Session expiry is 30 minutes, while the authoritative inventory hold expires after 10 minutes. A payment completed after a hold expires will be accepted by Stripe; the webhook transaction will only convert an active reservation. Operationally, investigate such a rare late payment and refund if stock was subsequently sold. A scheduled cleanup is optional because every new checkout expires stale reservations before checking availability.

The success redirect queries `get_order_status` using the opaque order ID plus reservation token and polls briefly. It never treats a redirect as proof of payment. Only a valid signed Stripe event can create a payment event, mark the order paid, store Stripe identifiers, and decrement inventory. Duplicate Stripe event IDs are ignored.

## 6. Product types and protected files

The mobile admin supports:

- `physical`: clothing, one-of-one objects and other shipped/pickup inventory.
- `music_download`: tracks, albums, DJ mixes and downloadable audio packages.
- `file_download`: ZIP, PDF, video, project files and other digital products.

Product photos and cover art remain public. Customer download files go into the private `product-downloads` bucket. After the verified webhook marks an order paid, `hyper-handler` validates the order ID plus its opaque reservation token and creates one-hour signed links. Never place paid files in the public `product-images` bucket.

## 7. Go-live checklist

- Create products and upload phone photos in `shop-admin.html`; publish only finished listings.
- Run a two-browser final-unit test: first checkout reserves it, second receives a sold-out response.
- Confirm successful test payment becomes `paid`, inventory decrements once, and resending the same event does not decrement again.
- Confirm canceled checkout remains `pending` and its reservation becomes reusable after 10 minutes.
- Confirm `jdot00` and `jamespropane00` can open `shop-admin.html` immediately after the normal website login.
- Confirm another website member is rejected and changing only `fas_user.username` without a matching credential is rejected.
- Buy one music/file product in test mode and confirm its signed download appears only after webhook-verified payment.
- Replace all test-mode Stripe secrets with live-mode values and create a separate live webhook endpoint.

## 8. Automatic search visibility

Every published product receives a permanent `/product/{slug}` page rendered by the Cloudflare Pages Function in `functions/product/[slug].js`. Those pages include canonical URLs, Open Graph metadata, Product and Breadcrumb structured data, server-rendered descriptions, prices, availability, images, SKU, brand, GTIN and MPN where supplied. The dynamic sitemap includes `/store` and every published available product.

The admin does not ask for SEO or marketplace fields. It automatically creates the permanent URL, search title, search description, search keywords, brand, SKU (when left blank), availability and structured search data from the product title, category, condition, type and description. The form shows a live Google-style preview before saving.

For the strongest listing, write a specific title, choose an accurate category, explain the item clearly in the description and upload several sharp original photos. Include useful details a buyer would search for, such as color, material, size, style, format, genre or intended use. Do not stuff repeated keywords into the title or description.

Migration 042 keeps the database foundation for future eBay and Facebook Marketplace connectors, but those controls stay hidden until the connectors are actually built. API credentials and automated marketplace publishing are intentionally not implemented yet. Future connector functions should use the service role, write the returned external listing ID and URL to this table, and treat Supabase product price and inventory as the source of truth.
