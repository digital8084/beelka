# Beelka — Product Requirements Document (PRD)

Status: Draft baseline, 2026-10-14. Product: public customer website. Brand: Beelka. Market: Indonesia-first. Provider: owner-provided MMBC APIs. Initial mode: simulation only; production disabled pending verification.

## Vision
Provide one mobile-first public website to search or transact for flights, hotels, train travel, and selected PPOB products. The experience is unified while each supplier integration remains isolated behind a server-side adapter.

## Goals
1. One customer account and consistent order history.
2. Four service families: flight, hotel, rail/KAI and PPOB.
3. Time-bounded quotation with price revalidation before supplier mutation.
4. Payment gateway abstraction, signed-webhook verification and durable payment state.
5. Auditability, idempotent writes and reconciliation for ambiguous provider results.
6. Clear separation between simulated content and verified live supplier data.
7. Cloud deployment with health observability, backups and release gates.

## Non-goals for first release
- Multi-agent marketplace or agent commission management.
- Proprietary airline/rail inventory.
- Storing card credentials or handling raw card data.
- Claiming real inventory while in simulation mode.
- Unreviewed retries for booking, payment, issue or PPOB mutations.
- Live launch before current provider API contracts and commercial permissions pass verification.

## Personas and journeys
Customer: browse services; search flights/hotels/trains/PPOB; inspect results and terms; enter passenger/customer data; review quote; create order; pay; see payment and supplier state; retrieve documents/token if available; view history.

Restricted support/admin: find orders; inspect redacted event timeline and provider references; refresh status/reconcile within policy; record actions. Cannot arbitrarily mark payment or fulfillment successful without evidence.

## Functional requirements
### Shared platform
- FR-001: responsive Indonesian UI for desktop/mobile.
- FR-002: opaque internal IDs; secrets never reach browser.
- FR-003: visibly label SIMULATED vs LIVE data.
- FR-004: persist orders, quotes, payments, provider attempts, state transitions and audit events.
- FR-005: idempotency keys required for order creation and mutations.
- FR-006: same key + same normalized payload returns same logical result; changed payload with same key yields conflict.
- FR-007: durable order timeline and safe status refresh.
- FR-008: explicit state machines reject invalid transitions.
- FR-009: use integer minor units or exact decimals, never binary floating point for money.
- FR-010: separate supplier price, fees, customer price and discounts in breakdown where applicable.

### Flights
- Search by route/date/passenger counts; display carrier, flight code, times, transit, baggage, facilities and price where returned.
- Revalidate fare/seats before booking; collect required traveler/contact fields.
- Show provider reference, time limit, status and e-ticket outcome only when verified.

### Hotels
- Browse country/city/hotel reference data; search dates, rooms and guests as current contract specifies.
- Display room, inclusions, cancellation terms, surcharge, total and conditions.
- Revalidate rate and terms before booking/hold. Hold response alone is not a confirmed booking.

### Rail/KAI
- Search current station codes, date and passenger counts; display train, route, schedule, class/subclass, fare and seat information where returned.
- Keep supplier session server-side; revalidate fare before booking.
- Booking, seat selection, status, issue and e-ticket supported only after current contract is verified.
- Minimize/mask identity details.

### PPOB
- Load product catalog and ready/closed status; support product-specific customer identifier fields.
- Query bills before payment where required; show returned customer identity, period, admin fee and total before confirmation.
- Show token/reference only when the supplier response proves the outcome. Pending never means success without reconciliation.

### Payment
- Payment provider-neutral interface; intent linked to one order and fixed amount/currency.
- Verify webhook signature, replay controls and expected amount/currency/order.
- Deduplicate webhook events.
- Redirect is not proof of payment; payment and fulfillment are separate states.
- Paid but ambiguous fulfillment moves to RECONCILIATION_REQUIRED; do not collect payment again.
- Refunds/reversals are separately recorded.

## Quality attributes
Security: least privilege, server-side secrets, rate limits, safe errors and redaction. Reliability: bounded timeouts and conservative mutation retries. Integrity: DB transactions, outbox when useful. Observability: structured logs, metrics, correlation IDs and alerts. Accessibility: semantic keyboard-friendly controls and sufficient contrast. Performance objectives must be measured in staging. Privacy: minimize data and define retention/deletion before launch.

## Customer-visible statuses
Searching; quote ready/expired; awaiting payment; payment confirmed/failed/unknown; supplier pending/confirmed/issued/failed/reconciliation required; cancelled/refund pending/refunded only where supported and evidenced. Map provider states to customer language while preserving original state for audit.

## Open launch constraints
Verify current MMBC credentials, endpoints, HTTPS, provider permissions and each flow. Verify supplier expiry/cancellation/document/refund rules. Select gateway after eligibility, fees, methods, webhook and refund review. Select cloud provider/region/secret storage. Confirm legal, tax, privacy, consumer and supplier obligations with appropriate professionals. Never place production secrets in source control or issue comments.