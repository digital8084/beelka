# Beelka — Mock API Contract

Status: initial server/API scaffold. All search and order examples below are fixtures, not provider offers.

## Global response conventions

- Search/catalog responses include `mode: "mock"`.
- Flight/hotel/train results have `bookable: false`.
- PPOB products have `purchasable: false`.
- Demo orders are `QUOTED`, with `paymentState: "NOT_STARTED"` and `fulfillmentState: "NOT_STARTED"`.
- No endpoint calls MMBC or a payment gateway.
- A correlation identifier is returned in `requestId` and the `X-Request-ID` response header. A caller-provided `X-Request-ID` is accepted only when it matches a bounded safe character set.
- Mutating request body must use `Content-Type: application/json`; body limit is 16 KiB.
- Error shape: `{ "error": { "code": "...", "message": "..." }, "requestId": "..." }`.

## Endpoint matrix

| Method | Endpoint | Contract |
|---|---|---|
| GET | `/healthz` | Process liveness only |
| GET | `/readyz` | PostgreSQL readiness; 503 if not configured/unavailable |
| GET | `/api/v1` | Active module catalog and mode/live flags |
| GET | `/api/v1/meta/services` | Compatibility metadata route |
| POST | `/api/v1/flights/search` | Mock flight result; no booking |
| POST | `/api/v1/hotels/search` | Mock hotel result; no booking |
| POST | `/api/v1/trains/search` | Mock train result; no booking |
| GET | `/api/v1/ppob/products` | Mock PPOB catalog; no purchase |
| POST | `/api/v1/orders` | Idempotent demo order in PostgreSQL; no payment/fulfillment |
| GET | `/api/v1/orders/:id` | Read a simulated order by UUID when demo orders are enabled |
| GET | `/api/v1/admin/audit-events` | Not exposed; returns 404 until authentication/authorization is implemented |

## Search inputs

### Flights

`POST /api/v1/flights/search`

```json
{
  "origin": "CGK",
  "destination": "DPS",
  "departureDate": "2026-12-01",
  "adults": 1,
  "children": 0,
  "infants": 0
}
```

Airport-like codes must be 3–8 safe alphanumeric/hyphen characters; departure date must be a real ISO date, `YYYY-MM-DD`. Adults 1–9, children 0–8, infants 0–8; the mock fixture disallows infants exceeding adults. Response product ID: `flight-demo-001`.

### Hotels

`POST /api/v1/hotels/search`

```json
{
  "city": "Bandung",
  "checkIn": "2026-12-01",
  "checkOut": "2026-12-03",
  "rooms": 1,
  "guests": 2
}
```

Check-out must be later than check-in; mock stay is 1–365 nights, rooms 1–8, guests 1–16. Price is computed from fixture rate multiplied by nights and rooms. Response product ID: `hotel-demo-001`. Cancellation text is explicitly example content, not actual hotel terms.

### Trains

`POST /api/v1/trains/search`

```json
{
  "origin": "GMR",
  "destination": "BDG",
  "travelDate": "2026-12-01",
  "adults": 1,
  "infants": 0
}
```

Station-like codes use 3–8 safe alphanumeric/hyphen characters; origin and destination must differ. Response product ID: `rail-demo-001`.

### PPOB

`GET /api/v1/ppob/products`

Returns fixture products only: `ppob-electricity-demo` and `ppob-mobile-data-demo`. The mock order endpoint accepts the fixture's fixed denomination, but never performs bill inquiry, payment, token issuance or a real purchase. Customer account/customer-number input is deliberately absent to avoid collecting real identifiers in the demo scaffold.

## Create a demo order

`POST /api/v1/orders`

Required header: `Idempotency-Key`, 8–128 safe ASCII characters. The endpoint also requires PostgreSQL and local demo-order enablement.

Example flight body:

```json
{
  "serviceType": "flight",
  "productId": "flight-demo-001",
  "selection": {
    "origin": "CGK",
    "destination": "DPS",
    "departureDate": "2026-12-01",
    "adults": 1,
    "children": 0,
    "infants": 0
  }
}
```

The server validates the selection and derives the amount from a known fixture; client-submitted price fields are not accepted as authoritative. The server writes the synthetic customer reference, quote/terms snapshot, order, order item, order event, audit event and completed idempotency response in one PostgreSQL transaction. No payment or supplier attempt is started.

Key reuse behavior:
- Same key + same normalized request: returns the original order response.
- Same key + different normalized request: `409 IDEMPOTENCY_KEY_CONFLICT`.
- Same key with a live in-progress claim: `409 IDEMPOTENCY_IN_PROGRESS`.
- Expired key: `409 IDEMPOTENCY_KEY_EXPIRED`; use a new key.
- Missing key: `400 IDEMPOTENCY_KEY_REQUIRED`.

The idempotency namespace is global to unauthenticated demo orders. It must be changed to include the authenticated customer/tenant identity before implementing customer-owned production order routes.

## Environment guard

- `BEELKA_MODE` must be `simulation`.
- `MMBC_LIVE_ENABLED` must remain false.
- `PAYMENT_GATEWAY_MODE` must remain `simulation`.
- `BEELKA_DEMO_ORDERS_ENABLED` defaults off when `NODE_ENV=production`.
- Runtime startup rejects production with demo-order endpoints explicitly enabled until the unauthenticated demo mutation surface is removed/replaced with authenticated customer routes.

## Known limitations

- This scaffold does not yet create persistent quote IDs on search; an order revalidates and stores a server-computed fixture snapshot from the submitted selection.
- No authentication, authorization middleware, rate limiter, customer UI, payment adapter, provider adapter or cloud deployment is implemented.
- Search fixtures use invented demo labels and fixed sample rates; they must never be presented as real availability or price.
- Production order APIs should use quote ownership/expiry, customer-scoped idempotency, authorization and a proper quote-to-order workflow.
