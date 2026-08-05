# API Contract (Draft)

All write actions require authenticated users and server validation.

## Requests
- `POST /requests`
- `GET /requests/:id`
- `PATCH /requests/:id`
- `POST /requests/:id/publish`
- `POST /requests/:id/cancel`

## Routes
- `POST /runner-routes`
- `PATCH /runner-routes/:id`
- `GET /runner-routes/matches`

## Offers
- `POST /requests/:id/offers`
- `POST /offers/:id/withdraw`
- `POST /offers/:id/select`

## Job proof
- `POST /jobs/:id/pickup-proof`
- `POST /jobs/:id/verify-pickup-pin`
- `POST /jobs/:id/delivery-proof`
- `POST /jobs/:id/verify-delivery-pin`

## Trust/support
- `POST /users/:id/report`
- `POST /jobs/:id/disputes`
- `POST /jobs/:id/reviews`

## Admin
- `POST /admin/users/:id/hold`
- `POST /admin/documents/:id/review`
- `PATCH /admin/jurisdictions/:id`

All endpoints return `{ data, error, requestId }`. Use idempotency keys for payment and job-finalization operations.
