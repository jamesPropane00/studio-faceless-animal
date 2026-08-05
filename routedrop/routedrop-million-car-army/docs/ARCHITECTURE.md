# Technical Architecture

## Frontend

Mobile-first PWA:

- Sender app
- Runner app
- Business dashboard
- Admin dashboard

Recommended: Next.js or Vite React with TypeScript. Use accessible components, offline-friendly drafts, and low-bandwidth image compression.

## Backend

Supabase:

- Auth
- Postgres
- Storage
- Realtime for status updates/messages
- Edge Functions for privileged logic

Never place payment secrets, admin operations, matching overrides, or PIN validation solely in client code.

## Services

- Maps/geocoding and routing
- Payments/payouts
- Email/SMS/push notifications
- Identity/background checks later
- Error monitoring
- Analytics

## Geospatial model

Use PostGIS in production:

- Pickup/drop-off points
- Runner route polyline
- Service-area polygons
- Distance from request points to route
- Estimated added time

The browser prototype uses simple mock distances only.

## Matching jobs

1. Request created.
2. Validate jurisdiction/category/size/value.
3. Find routes within geographic/time bounds.
4. Calculate added-distance estimate.
5. Apply trust and eligibility filters.
6. Rank matches.
7. Notify limited runner cohort.
8. Expand radius gradually if no offers.

## Security

- RLS on every exposed table
- Signed storage URLs
- Append-only audit events
- Rate limiting
- CAPTCHA/risk checks at abuse points
- Parameter validation in Edge Functions
- Secrets stored server-side
- Least-privilege admin roles

## Observability

Every important operation emits structured events:

- request.created
- offer.submitted
- runner.selected
- pickup.verified
- delivery.verified
- dispute.opened
- account.held
- document.expired

PII must not be included casually in analytics payloads.
