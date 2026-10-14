# Beelka — Mock API Contract

Status: initial server/API scaffold. All search and order examples below are fixtures, not provider offers.

## Global response conventions

- Search/catalog responses include `mode: "mock"`.
- Flight/hotel/train results have `bookable: false`.
- PPOB products have `purchasable: false`.
- Quotes expire after 15 minutes and are marked `ACTIVE`, `EXPIRED`, or `CONSUMED`.
- Order confirmation consumes exactly one persisted quote; demo orders are `QUOTED`, with `paymentState: "NOT_STARTED"` and `fulfillmentState: "NOT_STARTED"`.
- Quote/order operations require a verified identity from the trusted server-side `Authenticator` adapter, and quote reads/confirmation additionally require `X-Quote-Token`. The `main.ts` entry point does not yet wire a provider adapter, so these routes fail closed with `503 AUTHENTICATION_NOT_CONFIGURED` until the approved identity provider is integrated.
- Customer ownership is enforced with the verified provider `subject`; caller-supplied `X-User-ID`/similar headers are never used. Idempotency scope is customer-specific and stores only a hash of the subject.
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
| POST | `/api/v1/quotes` | Persist a server-priced 15-minute mock quote; requires configured trusted authentication and returns a one-time access token |
| GET | `/api/v1/quotes/:id` | Read an owner-scoped quote using trusted authentication plus `X-Quote-Token` |
| POST | `/api/v1/orders` | Owner-scoped quote confirmation; requires trusted authentication, `X-Quote-Token`, and idempotency; no payment/fulfillment |
| GET | `/api/v1/orders/:id` | Read a simulated order by UUID only for the authenticated owner |
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

## Persisted quote and order confirmation

### Create a quote

POST /api/v1/quotes

The endpoint requires PostgreSQL and local demo-order enablement. The server validates the service/product/selection and derives price from the allow-listed mock fixture; any client-provided price fields are ignored.

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

The response includes a quote UUID, normalized selection, immutable price/terms snapshot, quotedAt, expiresAt (15 minutes later), mode=mock, and an accessToken. The route also requires the trusted identity provider adapter. Ownership is attached to the verified identity-provider subject. Keep the accessToken private in the client session: it is returned once and the database stores only its SHA-256 digest. Do not send it in URLs or log it.

### Read a quote

GET /api/v1/quotes/:id

Required header: X-Quote-Token.

The request requires both the verified identity-provider subject and `X-Quote-Token`. The response includes status ACTIVE, EXPIRED, or CONSUMED and the stored server-computed amount/terms. Invalid identity, token, owner, or quote returns the corresponding fail-closed response; a quote not owned by the authenticated subject returns 404 QUOTE_NOT_FOUND to avoid revealing whether another customer\u2019s quote exists.

### Confirm a quote into an order

POST /api/v1/orders

Required headers:
- Idempotency-Key, 8–128 safe ASCII characters.
- X-Quote-Token, the token returned when the quote was created.

Body:

    {
      "quoteId": "UUID-returned-by-POST-api-v1-quotes"
    }

The server derives ownership from the trusted authenticator\u2019s verified subject, locks the quote row, validates owner, token digest and expiry, and consumes it within the same PostgreSQL transaction that creates the order, order item, order/audit events and completed idempotency response. Price and terms come only from the persisted quote; product/selection/amount fields in the order request are ignored. Idempotency keys are scoped to a SHA-256 hash of the authenticated subject. One quote can create at most one order. No payment or supplier attempt is started.

Key reuse behavior:
- Same key + same quote ID returns the original order response, provided the caller still proves possession of the quote token.
- Same key + different quote ID returns 409 IDEMPOTENCY_KEY_CONFLICT.
- A live in-progress claim returns 409 IDEMPOTENCY_IN_PROGRESS.
- Expired idempotency key returns 409 IDEMPOTENCY_KEY_EXPIRED; use a new key.
- An expired quote returns 409 QUOTE_EXPIRED. Create and review a new quote.
- A consumed quote with a new idempotency key returns 409 QUOTE_ALREADY_USED.
- Missing Idempotency-Key returns 400 IDEMPOTENCY_KEY_REQUIRED.
- Missing X-Quote-Token returns 400 QUOTE_ACCESS_TOKEN_REQUIRED.

Idempotency is scoped to a hash of the verified customer's subject, and quote/order reads and mutations enforce owner scope in the PostgreSQL layer. These controls are tested in API and PostgreSQL integration tests.

## Environment guard

- `BEELKA_MODE` must be `simulation`.
- `MMBC_LIVE_ENABLED` must remain false.
- `PAYMENT_GATEWAY_MODE` must remain `simulation`.
- `BEELKA_DEMO_ORDERS_ENABLED` defaults off when `NODE_ENV=production`.
- Runtime startup rejects production with demo-order endpoints explicitly enabled. The identity adapter does not make mock order mutations production-ready; those endpoints remain demo-only.

## Known limitations

- Search remains read-only and does not automatically create quotes. The client must explicitly request a quote after reviewing a search result.
- The Google Identity Platform adapter is wired in `main.ts` when `GOOGLE_CLOUD_PROJECT` (or `FIREBASE_PROJECT_ID`) is set and Google Application Default Credentials are available. It uses Firebase Admin SDK `verifyIdToken(token, true)`; invalid, expired, revoked, or disabled-user tokens are unauthenticated, while provider/credential failures return 503. Without the project ID, quote/order routes remain closed with `AUTHENTICATION_NOT_CONFIGURED`. There is no API-side login/signup/token issuance, customer UI, live payment adapter, live supplier adapter or cloud deployment.
- Search fixtures use invented demo labels and fixed sample rates; they must never be presented as real availability or price.
- Quote tokens are additional capability credentials, not a replacement for customer authentication. Production still requires real-project staging evidence, provider-side price revalidation, login/logout and account-recovery UX, rate limiting/abuse controls, privacy/retention review, and service-specific contract confirmation.
