# Faceless Supply setup

The frontend uses the existing shared client in `assets/js/supabase-client.js`. Only the public Supabase URL/publishable key reach the browser. Stripe and service-role credentials belong only in Supabase Edge Function secrets.

## 1. Database and first admin

Apply `supabase/migrations/038_ecommerce.sql` through the Supabase CLI (`supabase db push`) or paste it into Dashboard → SQL Editor. It creates the product, image, reservation, order, item, event and admin tables; atomic reservation/payment functions; indexes; image bucket; triggers; and RLS policies.

In Dashboard → Authentication → Users, create the admin email/password account (or invite it). Copy its UUID and run this once in SQL Editor:

```sql
insert into public.shop_admins (user_id) values ('AUTH-USER-UUID-HERE');
```

Only listed Supabase Auth users can access `shop-admin.html`. Never put a service-role key in that page or any browser file.

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
   `https://PROJECT.supabase.co/functions/v1/stripe-webhook`
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
supabase functions deploy create-checkout-session
supabase functions deploy stripe-webhook
```

`SHOP_ORIGIN` must be the exact production origin with no trailing slash. Supabase automatically provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to deployed functions. Do not copy either secret into frontend JavaScript. The function configuration disables JWT verification because checkout is public and Stripe cannot send a Supabase JWT; authorization is instead limited by the RPC grants, server-side service role, webhook signature, RLS and strict input validation.

For local webhook testing:

```bash
stripe listen --forward-to http://127.0.0.1:54321/functions/v1/stripe-webhook
supabase functions serve --env-file supabase/.env.local
```

Put local secrets in `supabase/.env.local` and keep that file uncommitted.

## 5. How payment and inventory work

Checkout calls the database transaction with product IDs and quantities. PostgreSQL locks each requested product, expires old holds, recalculates prices/shipping from trusted rows, and creates a 10-minute reservation. The browser-supplied cart price is never sent or used.

Stripe’s minimum Checkout Session expiry is 30 minutes, while the authoritative inventory hold expires after 10 minutes. A payment completed after a hold expires will be accepted by Stripe; the webhook transaction will only convert an active reservation. Operationally, investigate such a rare late payment and refund if stock was subsequently sold. A scheduled cleanup is optional because every new checkout expires stale reservations before checking availability.

The success redirect queries `get_order_status` using the opaque order ID plus reservation token and polls briefly. It never treats a redirect as proof of payment. Only a valid signed Stripe event can create a payment event, mark the order paid, store Stripe identifiers, and decrement inventory. Duplicate Stripe event IDs are ignored.

## 6. Go-live checklist

- Create products and upload phone photos in `shop-admin.html`; publish only finished listings.
- Run a two-browser final-unit test: first checkout reserves it, second receives a sold-out response.
- Confirm successful test payment becomes `paid`, inventory decrements once, and resending the same event does not decrement again.
- Confirm canceled checkout remains `pending` and its reservation becomes reusable after 10 minutes.
- Confirm an unlisted Supabase user cannot access products/orders in the admin.
- Replace all test-mode Stripe secrets with live-mode values and create a separate live webhook endpoint.
