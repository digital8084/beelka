# Beelka — Product Requirements Document (PRD)

- Status: Draft baseline, 2026-10-14
- Product: public customer website
- Brand: Beelka
- Market: Indonesia-first
- Provider: MMBC APIs documented by the project owner
- Initial modes: explicit simulation; production disabled pending verification

## 1. Product vision

Provide one clear, mobile-first public website where customers can search or transact for flights, hotels, train travel, and selected PPOB products. The user-facing experience is unified while each supplier integration remains isolated behind its own server-side adapter.

## 2. Goals

1. One customer account and a consistent order-history experience.
2. Four service families: flight, hotel, rail/KAI, and PPOB.
3. Accurate, time-bounded quotation with price revalidation before supplier mutation.
4. Payment gateway abstraction, signed-webhook verification, and durable payment state.
5. Transaction auditability, idempotent writes, and reconciliation of ambiguous provider results.
6. Clear separation between test/simulated content and live supplier data.
7. Cloud deployment with observable health, backups, and release gates.

## 3. Non-goals for the first release

- Multi-agent marketplace or agent commission management.
- Building a proprietary airline/rail inventory system.
- Storing card credentials or handling raw card data.
- Claiming real supplier availability while in simulation mode.
- Unreviewed automated retries for booking, payment, issuance, or PPOB mutations.
- Live launch before provider/API contract and commercial permission checks pass.

## 4. Customer personas and journeys

### Guest/customer
- Browse home and service modules.
- Search flights, hotels, train schedules or PPOB products using required inputs.
- Inspect results, terms, price breakdown and cancellation conditions where provided.
- Enter traveler/customer details.
- Review final quotation and create an order.
- Pay using configured payment methods.
- See order and provider state, refresh status, retrieve issued document/token when applicable, and view booking history.

### Support/admin (restricted operational surface)
- Find an order by internal order number or provider reference.
- Inspect redacted event timeline and provider response metadata.
- Perform permitted status refresh/reconciliation.
- Record support actions and reasons.
- Cannot expose secrets or arbitrarily set a paid/issued status without evidence.

## 5. Functional requirements

### Shared platform
- FR-001: Serve Indonesian-language responsive customer UI, accessible on mobile and desktop.
- FR-002: Use internal opaque identifiers; never expose credentials or internal secrets to browser.
- FR-003: Display whether results are SIMULATED or LIVE.
- FR-004: Persist customer orders, quotes, payments, provider attempts, status transitions and audit events.
- FR-005: Require idempotency keys for order creation and other mutating customer endpoints.
- FR-006: Same idempotency key + same normalized request returns the same logical result; changed payload with same key returns conflict.
- FR-007: Provide a durable order timeline and safe status refresh.
- FR-008: Use explicit, documented state machines; reject invalid transitions.
- FR-009: Price values use integer minor units or exact decimal/numeric values, never binary floating-point arithmetic.
- FR-010: Order total breakdown identifies supplier price, service fee, customer price, discounts and payment fee as separate values where relevant.

### Flights
- FR-FLT-001: Search by origin, destination, date and passenger counts.
- FR-FLT-002: Display carrier, flight code, time, transit, baggage, facilities and price where supplied by provider.
- FR-FLT-003: Revalidate selected flight price and availability immediately before booking.
- FR-FLT-004: Collect passenger and contact details required by verified provider contract.
- FR-FLT-005: Show booking reference, time limit, provider state and issued ticket/e-ticket outcome when available.

### Hotels
- FR-HOT-001: Browse country/city/hotel reference data available from verified supplier endpoint.
- FR-HOT-002: Search by city or hotel, check-in/out, room count and guests according to validated contract.
- FR-HOT-003: Display room name, inclusions, cancellation policy, surcharge, total price, and rate expiry/conditions where supplied.
- FR-HOT-004: Revalidate rate and cancellation terms before booking/hold.
- FR-HOT-005: Support hold/payment-code/issue/status flow according to the live validated contract.
- FR-HOT-006: Do not imply a room is confirmed from a hold response alone.

### Rail/KAI
- FR-RAIL-001: Search by station, date and passenger counts using current station code list.
- FR-RAIL-002: Display train, route, times, class/subclass, fare and available-seat details where returned.
- FR-RAIL-003: Preserve provider session required for subsequent price/booking calls server-side.
- FR-RAIL-004: Revalidate price before booking.
- FR-RAIL-005: Support booking, seat selection, status and issued flow only after verifying exact live contract.
- FR-RAIL-006: Validate passenger identity information with careful data minimization and masking.

### PPOB
- FR-PPOB-001: Load product catalog and ready/closed status from verified product-list endpoint.
- FR-PPOB-002: Support product-specific customer identifier fields.
- FR-PPOB-003: Query bill inquiry before bill payment if required by product contract.
- FR-PPOB-004: Show customer name and exact total/admin fee before confirmation when returned.
- FR-PPOB-005: Display token/reference/result only when supplier response confirms the relevant result.
- FR-PPOB-006: Treat pending as pending; never automatically report success before reconciliation.

### Payment
- FR-PAY-001: Integrate through a provider-neutral payment interface.
- FR-PAY-002: A payment intent is linked to one internal order and a fixed amount/currency.
- FR-PAY-003: Verify webhook signature, timestamp/replay rules and expected amount/currency/order.
- FR-PAY-004: Idempotently process duplicate webhook events.
- FR-PAY-005: Browser redirect is not authoritative proof of payment.
- FR-PAY-006: Supplier fulfillment is a separate state from payment success.
- FR-PAY-007: If paid but supplier outcome is ambiguous, move to RECONCILIATION_REQUIRED; do not collect payment again.
- FR-PAY-008: Refunds and payment reversals are separately recorded, not implemented as destructive edits.

## 6. Quality attributes

- Security: least privilege, server-side secrets, rate limits, safe errors, redaction, dependency scanning.
- Reliability: timeouts, circuit breakers for reads, conservative mutation retries, provider correlation IDs.
- Integrity: database transactions for internal state; durable outbox for asynchronous actions where appropriate.
- Observability: structured logs, metrics, trace/correlation identifiers, alerts on pending/unknown states.
- Accessibility: semantic controls, keyboard use, visible focus, sufficient contrast and readable forms.
- Performance: baseline targets must be measured in staging; establish p95 latency objectives after hosting and traffic assumptions are known.
- Privacy: collect only data needed for booking/payment; define retention and deletion rules before launch.

## 7. Product states shown to customer

- Searching / quote ready / quote expired
- Awaiting payment / payment confirmed / payment failed / payment unknown
- Supplier booking pending / supplier confirmed / issued / failed / reconciliation required
- Cancelled / refund pending / refunded (only if supported and evidenced)

Translate internal/provider-specific states into customer-safe language while retaining original provider state in the audit trail.

## 8. Launch constraints and open decisions

- Obtain and verify current MMBC account credentials and API access permissions.
- Confirm each endpoint is active, HTTPS-supported, and consistent with current documentation.
- Verify supplier mutation, booking expiry, ticket delivery, cancellation and refund rules.
- Select a payment gateway based on business eligibility, fees, supported methods, webhook guarantees and refund API.
- Choose cloud provider/region, managed PostgreSQL and secret management.
- Confirm legal, tax, privacy, consumer-protection, and supplier commercial terms with appropriate professionals.
- Never place production secrets in source control or issue comments.
