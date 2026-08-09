# Underground Market phase-one setup

This phase adds seller applications, administrator approval, approved-seller item intake, and buyer requests. It does **not** activate marketplace payouts or automatically publish third-party items.

## Authentication and authorization

- Buyers and seller applicants use the existing Faceless Animal website login (`fas_user`).
- A seller account is uniquely tied to one existing `member_accounts.username`.
- The backend verifies the current username and session hash against `member_accounts`; the browser cannot approve itself.
- Only `jdot00` and `jamespropane00`, with a valid current `shop_token`, can open the private Market queue or change approval states.
- Only an `approved` seller can submit an item. This is enforced again in the backend, not only hidden in the page.

## Install the database

Run the entire migration in the Supabase SQL Editor:

`supabase/migrations/049_underground_market_phase_one.sql`

It creates private seller, item-intake, image, and buyer-request tables; indexes; timestamps; constraints; RLS; and the private `market-intake` Storage bucket. No anonymous or authenticated-client policies are added. Access is through service-role backend functions only.

## Cloudflare Pages secrets

These existing/new Pages Functions use:

```text
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
SHOP_ORIGIN=https://facelessanimalstudios.com
MARKET_INTAKE_SALT=A_RANDOM_SECRET_AT_LEAST_32_CHARACTERS
```

Set them for Production in Cloudflare Pages, then redeploy. Never put the service-role key or intake salt in HTML, frontend JavaScript, Git, or Supabase public settings.

Endpoints deploy with the site automatically:

- `POST /api/market/intake` — application, approved item intake, and buyer requests
- `GET /api/market/account` — the signed-in member's seller state only
- `POST /api/market/admin` — private queue and moderation for the two authorized administrators

## Administrator workflow

1. Sign in normally as `jdot00` or `jamespropane00`.
2. Open `/shop-admin`.
3. Select **Market Sellers**.
4. Review the legal/contact/address information and change a seller from `pending` to `approved` or `rejected`.
5. Add a private review note when more information is needed.
6. Approved sellers can then open `/market.html#sell` and submit 1–5 private item photos.

## Security and launch boundary

- Do not collect SSNs, tax IDs, bank details, card details, or government-ID images in these forms.
- Seller photos remain private and admin previews use short-lived signed URLs.
- Personal data is not included in public listings or account-status responses.
- Before seller payments go live, add a dedicated marketplace payout/KYC provider, attorney-reviewed seller agreement and privacy policy, tax reporting, prohibited-items rules, returns/disputes, fulfillment obligations, and incident/retention procedures.
- The current website session design carries a password-derived session hash. It is supported here to reuse the current login as requested, but should eventually be replaced site-wide with short-lived opaque server-issued member sessions.
