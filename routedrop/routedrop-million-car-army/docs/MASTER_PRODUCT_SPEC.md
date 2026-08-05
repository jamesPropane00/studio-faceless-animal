# Master Product Specification

## 1. Product identity

**Working name:** RouteDrop  
**Tagline:** Earn on the way. Send without the wait.  
**Category:** Route-sharing small-item errand marketplace  
**Users:** Senders, recipients, independent runners, local businesses, moderators

## 2. Problem

Small local item movement is fragmented. Traditional couriers are expensive, instant delivery requires dense fleets, and ordinary drivers travel millions of useful routes with empty vehicle capacity. RouteDrop creates liquidity from trips that already exist.

## 3. Differentiator

The primary product is not instant dispatch. It is **planned-route matching**:

- Runner posts a route or recurring commute.
- Sender posts an item request and time window.
- Matching scores route overlap, detour, vehicle fit, trust, timing, and price.
- Runner chooses whether to offer.
- Sender chooses the runner.

Two service modes:

1. **Along the Way:** flexible window, low price, matched to existing trips.
2. **RouteDrop Now:** optional later product for urgent jobs in approved markets.

## 4. Launch scope

Allowed MVP examples:

- Keys, documents, clothing, small electronics
- Ordinary retail pickups and returns
- A single marketplace purchase that fits safely in the runner’s vehicle
- Small-business supplies and sealed parcels

Excluded until separately approved:

- Interstate jobs
- Pallets and freight
- Full or partial household moves
- Passengers
- Alcohol, tobacco, cannabis, controlled substances
- Prescription medication or medical specimens
- Firearms, ammunition, weapons
- Hazardous materials
- Cash, precious metals, negotiable instruments
- Live animals
- Items above configured size/value limits
- Any illegal or age-restricted item

## 5. Core user flows

### Sender
1. Sign up and verify email/phone.
2. Enter pickup/drop-off, time window, item category, photos, dimensions, value, access notes.
3. Confirm restricted-item declaration.
4. See an estimated range, not a guaranteed transportation quote unless approved.
5. Receive offers from eligible runners.
6. Review runner profile, vehicle, ratings, and credential status.
7. Select runner and agree to transaction terms.
8. Complete payment flow when enabled.
9. Give pickup PIN to releasing party.
10. Recipient gives delivery PIN and confirms condition.
11. Review runner or open a time-limited issue.

### Runner
1. Sign up; select individual or business provider profile.
2. Complete identity, vehicle, tax/payment, and required insurance workflow.
3. Post one-time or recurring planned route.
4. View compatible requests and detour estimate.
5. Submit offer or accept customer-posted amount where enabled.
6. Confirm item matches listing at pickup; capture proof.
7. Complete delivery; collect PIN/signature/photo.
8. Receive payout after applicable hold.

### Business
- Bulk request upload
- Address book
- Recurring route templates
- Team roles
- Monthly reporting
- API/webhook integration later
- Branded recipient tracking page

## 6. Matching model

Initial score from 0–100:

- Route overlap: 30
- Added distance/time: 20
- Pickup/drop-off time compatibility: 15
- Vehicle/item fit: 10
- Runner trust and completion rate: 10
- Sender trust: 5
- Price compatibility: 5
- Local liquidity balancing: 5

Hard filters precede scoring: jurisdiction, prohibited category, value/weight, account status, credential requirements, and time feasibility.

## 7. Marketplace state machine

`draft -> posted -> offers_received -> runner_selected -> payment_authorized -> pickup_ready -> picked_up -> in_transit -> delivered -> completed`

Alternate states:

- `cancelled_by_sender`
- `cancelled_by_runner`
- `expired`
- `disputed`
- `refunded`
- `moderation_hold`

Every transition must be server-authorized and written to an immutable event log.

## 8. Trust system

Trust should combine:

- Identity status
- Phone/email status
- Account age
- Completed jobs
- Cancellation/no-show rate
- On-time rate
- Ratings with Bayesian weighting
- Confirmed vehicle/insurance documents where applicable
- Fraud and device-risk signals
- Support history

Never expose sensitive identity documents to other users.

## 9. Pricing

Initial concept:

- Along the Way: sender posts budget or receives broad suggested range.
- Platform fee: flat plus percentage only after legal review permits transaction marketplace operation.
- Business subscription: workflow tools and volume pricing.
- Optional membership: reduced fees, not priority over safety.

Avoid unsustainable driver subsidies. Referral rewards should be unlocked by completed, non-refunded activity.

## 10. Admin console

- User and device search
- Request/offer/job timeline
- Document status controls
- Jurisdiction configuration
- Category/value/weight limits
- Payment and payout inspection
- Dispute evidence viewer
- Fraud rules and account holds
- Restricted-item reports
- Audit logs
- Market liquidity dashboard

## 11. Success metrics

North star: **completed trusted deliveries with less than 20 minutes added to an existing trip**.

Supporting metrics:

- Requests receiving a qualified offer within window
- Match-to-completion rate
- Median detour
- Repeat senders and runners
- Business recurring volume
- Contribution margin per completed job
- Incident and claim rate
- Support minutes per delivery
- Referral K-factor

## 12. Brand voice

Practical, local, trustworthy, non-corporate. Never imply that unverified drivers are employees or that RouteDrop guarantees safety, insurance, or delivery unless those claims are factually supported.
