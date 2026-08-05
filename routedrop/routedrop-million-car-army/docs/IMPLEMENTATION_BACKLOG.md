# Implementation Backlog

## Phase A — Convert prototype to production shell

- [ ] Create TypeScript React PWA
- [ ] Install Supabase client
- [ ] Environment configuration
- [ ] Auth and role onboarding
- [ ] Route guards
- [ ] Shared design system
- [ ] Error/empty/loading states

## Phase B — Core marketplace

- [ ] Request creation and editing
- [ ] Planned and recurring runner routes
- [ ] Geocoding and route preview
- [ ] Matching Edge Function
- [ ] Runner request feed
- [ ] Offers
- [ ] Sender selection
- [ ] In-app messaging with abuse controls

## Phase C — Delivery proof

- [ ] Server-generated pickup PIN
- [ ] Server-generated delivery PIN
- [ ] Image compression/upload
- [ ] Timestamp and coarse GPS evidence
- [ ] State transition authorization
- [ ] Completion and reviews

## Phase D — Trust/admin

- [ ] Credential upload/status model
- [ ] Admin review queue
- [ ] User reports
- [ ] Account hold/ban
- [ ] Audit timeline
- [ ] Fraud rate limits

## Phase E — Payments only after approval

- [ ] Stripe Connect onboarding
- [ ] PaymentIntent design
- [ ] Platform fee configuration
- [ ] Refund/reversal logic
- [ ] Dispute and negative-balance handling
- [ ] Payout holds
- [ ] Tax reporting workflow

## Phase F — Business growth

- [ ] Business teams
- [ ] CSV bulk upload
- [ ] Saved locations
- [ ] Recurring requests
- [ ] Invoice/report exports
- [ ] API keys and webhooks
- [ ] Referral system with anti-fraud

## Test requirements

- Authorization/RLS tests
- State-machine transition tests
- Restricted-item tests
- Jurisdiction feature-gate tests
- PIN brute-force protection
- Storage access tests
- Payment idempotency tests
- Notification retry tests
