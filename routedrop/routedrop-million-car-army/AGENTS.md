# RouteDrop — AI Agent Master Instructions

This repository is the complete product blueprint and starter prototype for RouteDrop, a nationwide small-item route-sharing marketplace.

## Mission
Build a trusted network where people and businesses post small-item errands and independent local runners discover jobs that overlap trips they already plan to make.

## Non-negotiable launch boundary
The initial production release is LOCAL/INTRASTATE ONLY in approved launch markets. Do not enable interstate matching, commercial freight, pallets, household moves, regulated goods, or claims that RouteDrop itself transports property until legal/insurance approval is recorded in the `jurisdictions` table.

## Product principles
1. Drivers choose whether to participate, their availability, jobs, route, and vehicle.
2. Customers choose the runner.
3. Every handoff uses photos, timestamps, and PIN verification.
4. Safety and restricted-item controls outrank conversion.
5. Never describe unverified documents as verified.
6. Never hard-code legal conclusions. Use feature flags by jurisdiction.
7. Preserve an auditable event log for jobs, offers, payments, messages, and moderation.
8. Mobile-first PWA. It must remain usable on inexpensive Android phones.

## Read in this order
1. `README.md`
2. `docs/MASTER_PRODUCT_SPEC.md`
3. `docs/LEGAL_AND_RISK_BOUNDARIES.md`
4. `docs/GROWTH_TO_ONE_MILLION_DRIVERS.md`
5. `docs/ARCHITECTURE.md`
6. `supabase/schema.sql`
7. `docs/IMPLEMENTATION_BACKLOG.md`

## Current state
`app/` is a dependency-free visual prototype. It is not production-ready and uses mock data/localStorage. Replace mock services incrementally with Supabase Edge Functions and Stripe Connect only after environment variables and legal feature flags are configured.

## Definition of done for MVP
- Auth and role selection
- Customer request creation
- Runner planned-route creation
- Route/request matching
- Offers and customer selection
- Pickup/delivery PINs and proof photos
- Status timeline
- Reviews/reporting
- Admin moderation
- Jurisdiction and category feature gates
- No secrets in the browser
- RLS enabled for exposed Supabase tables
- Automated tests for authorization and job-state transitions
