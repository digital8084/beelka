# MMBC API Integration Blueprint

## Status and governing rules

Source of endpoint names and example fields: user-provided API-PESAWAT.pdf (v7.0, updated 2018-05-05), API-HOTEL.pdf (v1.0, updated 2020-02-07), API-KERETA.pdf (v3.0, updated 2019-12-05), and API-PPOB.pdf (v2.0, updated 2021-04-19).

These are historic documents, not proof that endpoints, payload schemas, commercial permissions, or booking/issuance behavior are still current. Production mode stays disabled until each flow is verified with provider-approved credentials and controlled tests.

## Shared adapter contract

Each provider module implements only capabilities verified for that service:

- `healthcheck()` — only if provider supports it; otherwise return not verified.
- `search(input)` — read-only discovery.
- `getQuote(input)` — current price/availability check.
- `createFulfillment(input, idempotencyContext)` — mutating supplier action, explicitly guarded.
- `getStatus(reference)` — where supported.
- `issue(reference)` — only where provider flow explicitly requires it.
- `retrieveDocument(reference)` — only if an endpoint exists and result is authorized.
- Return normalized outcome (`SUCCESS`, `PENDING`, `FAILED`, `UNKNOWN`, `UNSUPPORTED`), provider reference/status, safe metadata and simulation flag.
- Do not present generated fixtures as supplier results.
- Store raw supplier payload only where needed; redact credentials, personal identifiers and tokens.

## Flight endpoints described by PDF

Base shown in the older documentation: `http://klikmbc.co.id/json/`. Do not assume HTTP is acceptable for production; verify a supported HTTPS endpoint and provider requirements.

| Capability | Documented path | Method | Inputs/notes |
|---|---|---|---|
| Balance | `ceksaldo` | POST | username, password |
| Reset password | `resetpassword` | POST | username, email, phone, agencode, newpassword |
| City codes | `getcodearea-json` | GET | reference list |
| Carrier codes | `getcodeflights-json` | GET | reference list |
| Search flights | `getflights-json` | POST | credentials, from, to, date `dd-mm-yyyy` |
| Update price/seats | `getprice-json` | POST | route/date/flight, adult/child/infant |
| Book | `postbooking-json` | POST | flight, route/date, passenger/contact data |
| Issue | `getissued-json` | POST | kodebooking |
| Booking status | `getstatusbooking-json` | POST | kodebooking |
| Retrieve e-ticket | `getetiket-json` | POST | kodebooking |

Flight search examples include flight code, route, date, transit, times, fare, seats, baggage and facilities. Price response includes publish/tax/totalfare and other supplier pricing values. Verify exact price-field meaning and permitted customer markup with MMBC.

## Hotel endpoints described by PDF

Base shown: `https://klikmbc.co.id/json/hotel/`.

| Capability | Documented path | Method | Inputs/notes |
|---|---|---|---|
| Country list | `hotel_listofcountries` | POST | credentials |
| Hotels by country | `hotel_listsbycountry` | POST | credentials, hotel_country_code |
| Search by city | `hotel_searchbycity` | POST | country/city codes, check-in/out, rooms |
| Search by hotel ID | `hotel_searchbyid` | POST | country/city/hotel codes, dates, rooms |
| Book/hold room | `hotel_bookinghold` | POST | hotel_key, room_rate_key, dates, guest/contact |
| Issue/pay hotel booking | `hotel_issued` | POST | paymentcode |
| Payment-code status | `hotel_statuspaymentcode` | POST | paymentcode |

Rate result examples include `hotel_key`, hotel identity, location, rating, room rates, price, cancellation policy, inclusions, surcharge and supplier keys. Treat `hotel_key` and `room_rate_key` as supplier references with expiry; recheck exact rate and cancellation conditions before mutation. Sanitize supplier HTML fragments before rendering.

## Rail/KAI endpoints described by PDF

Base shown: `https://klikmbc.co.id/json/kereta/`; balance path: `https://klikmbc.co.id/json/ceksaldo`.

| Capability | Documented path | Method | Inputs/notes |
|---|---|---|---|
| Station list | `getlist-code` | GET | reference list |
| Lookup station code | `getrequest-code` | GET | code |
| Route list | `getlistroute` | GET | reference list |
| Schedule | `getschedule` | POST | credentials, from/to/date, adult/infant, seat-display option |
| Reprice | `getprice` | POST | schedule session, route/date, train code/class/subclass, passengers |
| Book | `getbook` | POST | session, trip and passenger/identity/contact data |
| Seat update | documented later in PDF | POST | exact path/schema must be verified from complete current contract |
| Issue | `getissued` | POST | kodebooking |
| Status | `getstatus-kodebooking` | POST | kodebooking |
| E-ticket | documented later in PDF | POST | exact path/schema must be verified from complete current contract |

Schedule response returns a `session` used in later calls. Keep it server-side, scoped to a quote/order and expire it safely. The PDF says seat selection changed to after booking in its December 2019 update; confirm the present workflow before implementing seat UI.

## PPOB endpoints described by PDF

Base shown in the older documentation: `http://klikmbc.co.id/json/ppob/`. Verify HTTPS and current contracts before production.

| Capability | Documented path | Method | Inputs/notes |
|---|---|---|---|
| Product price/list | `daftarharga` | POST | credentials |
| Bill inquiry | `cektagihan` | POST | credentials, product code, customer number |
| Bill payment | `bayartagihan` | POST | credentials, product code, customer number |

PPOB catalog examples include group, product, code, nominal, admin fee, debit and readiness status. Responses vary by product (examples include electricity, BPJS, Telkom, PDAM, subscription TV, PGN, financing and postpaid phone services). Use product-specific schemas; do not assume all fields are common. The documentation describes `confirm`, `pending` and `gagal`. Pending is never customer-facing success until verified. The available snippets do not establish a single universal status-lookup endpoint for every PPOB product.

## Cross-provider orchestration contract

1. Search in simulation until provider credentials/endpoints have been validated.
2. Save quote snapshot, request hash, provider, product, inputs, price/currency, source reference, quoted timestamp and expiry.
3. Before mutation, verify quote ownership, expiry and price/terms refresh.
4. Create internal order and durable provider-attempt record before supplier call.
5. Make remote request outside a database transaction.
6. Persist result plus audit event. On timeout/ambiguous outcome, mark `UNKNOWN` / `RECONCILIATION_REQUIRED`.
7. Check provider status where supported; do not blindly repeat booking, issue or payment.
8. Reconcile customer payment and supplier fulfillment independently.
9. Never log MMBC username/password or personal identity data.
10. Fixtures are labeled SIMULATED and cannot be mistaken for live prices.

## Live-activation checklist per provider

- Credentials delivered via secret manager and validated without printing them.
- Endpoint domain, TLS, methods, field casing, date formats and encoding confirmed.
- Full request/response contract tests run with authorized test data.
- Price calculations and supplier debit values reconciled.
- Mutation duplicate/timeout behavior documented.
- Status lookup, expiry, cancellation and refund flows documented.
- Privacy and retention reviewed.
- Feature flag can immediately disable supplier mutations.
- Evidence reviewed and release gate approved before live mode.
