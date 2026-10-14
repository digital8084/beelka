# MMBC API Integration Blueprint

## Source and caution
Based on owner-provided PDFs: Flight v7.0 (2018-05-05), Hotel v1.0 (2020-02-07), Rail/KAI v3.0 (2019-12-05), PPOB v2.0 (2021-04-19). These historic documents do not prove endpoints, contracts, permission or transaction behavior are current. Production remains disabled until supplier-approved credentials and current contracts are verified.

## Adapter interface
Capabilities, as confirmed per service: `search(input)`, `getQuote(input)`, `createFulfillment(input, context)`, `getStatus(reference)`, `issue(reference)`, `retrieveDocument(reference)`. Methods not supported by a provider must return `UNSUPPORTED`, not simulate a live result. Normalized outcomes: `SUCCESS`, `PENDING`, `FAILED`, `UNKNOWN`, `UNSUPPORTED`, with supplier status/reference, safe metadata and an explicit simulation flag.

## Flight endpoints from PDF
Old base shown: `http://klikmbc.co.id/json/` — verify current HTTPS support/domain.

| Capability | Path | Method |
|---|---|---|
| Balance | `ceksaldo` | POST |
| Reset password | `resetpassword` | POST |
| City codes | `getcodearea-json` | GET |
| Carrier codes | `getcodeflights-json` | GET |
| Search | `getflights-json` | POST |
| Price/seats | `getprice-json` | POST |
| Booking | `postbooking-json` | POST |
| Issued | `getissued-json` | POST |
| Booking status | `getstatusbooking-json` | POST |
| E-ticket | `getetiket-json` | POST |

Search takes route/date (`dd-mm-yyyy`) and credentials. Results may include flight code, route, date, transit/times, fare, seats, baggage and facilities. Price result includes publish/tax/totalfare and other provider price fields; confirm current monetary semantics and markup rules.

## Hotel endpoints from PDF
Base: `https://klikmbc.co.id/json/hotel/`.

| Capability | Path | Method |
|---|---|---|
| Country list | `hotel_listofcountries` | POST |
| Hotels by country | `hotel_listsbycountry` | POST |
| Search by city | `hotel_searchbycity` | POST |
| Search by hotel ID | `hotel_searchbyid` | POST |
| Book/hold room | `hotel_bookinghold` | POST |
| Issue/pay booking | `hotel_issued` | POST |
| Payment code status | `hotel_statuspaymentcode` | POST |

Examples include hotel/rate identifiers, location/rating, room price, cancellation terms, inclusions and surcharge. Revalidate rate and cancellation policy before mutation. Treat keys as expiring supplier data. Sanitize provider HTML before rendering.

## Rail/KAI endpoints from PDF
Base `https://klikmbc.co.id/json/kereta/`; balance is documented at `https://klikmbc.co.id/json/ceksaldo`.

| Capability | Path | Method |
|---|---|---|
| Station list | `getlist-code` | GET |
| Station lookup | `getrequest-code` | GET |
| Route list | `getlistroute` | GET |
| Schedule | `getschedule` | POST |
| Reprice | `getprice` | POST |
| Booking | `getbook` | POST |
| Issued | `getissued` | POST |
| Booking status | `getstatus-kodebooking` | POST |

PDF also describes seat-update and e-ticket functions later; exact current paths/schema must be verified from complete current provider contract before implementation. Schedule response includes a session used downstream; keep server-side and scoped to quote/order. PDF's Dec 2019 note says seat selection changed to after booking; verify present flow.

## PPOB endpoints from PDF
Old base shown: `http://klikmbc.co.id/json/ppob/`; verify HTTPS/current domain.

| Capability | Path | Method |
|---|---|---|
| Product catalog/prices | `daftarharga` | POST |
| Bill inquiry | `cektagihan` | POST |
| Pay bill/product | `bayartagihan` | POST |

Products and response fields vary: examples cover electricity, BPJS, Telkom, PDAM, subscription TV, PGN, financing and postpaid mobile. Use product-specific schemas. PDF describes statuses `confirm`, `pending`, `gagal`; pending is not success until reconciled. Available excerpts do not establish one universal status lookup endpoint for all PPOB products.

## Orchestration rules
1. Search runs in simulation until credentials/contracts are verified.
2. Persist quote snapshot, request hash, provider/product, currency/price breakdown, source reference, quote time and expiry.
3. Verify ownership and expiry and refresh price/terms before mutation.
4. Persist order and provider attempt before remote mutation.
5. Make remote calls outside a DB transaction.
6. Persist response and audit; ambiguous timeout becomes `UNKNOWN`/`RECONCILIATION_REQUIRED`.
7. Query provider status where supported; do not blindly repeat booking/issue/payment.
8. Reconcile customer payment and supplier fulfillment independently.
9. Never log credentials, payment secrets or full identity numbers.
10. Fixtures must carry `SIMULATED` and cannot be presented as live prices.

## Per-provider live gate
Verify secret-store credentials, domain/TLS, method/fields/date format, current schema, price/debit calculations, timeout/duplicate behavior, status/expiry/cancel/refund rules, privacy/retention, kill switch and authorized test evidence. Enable live mutation only with explicit approval.