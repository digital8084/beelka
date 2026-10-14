# Beelka — Blueprint Review and Development Ideas

Status: engineering recommendations based on the current project blueprint and mock API scaffold. This is a proposal, not evidence that the described future capabilities already exist.

## Assessment

The core blueprint has the right control points: provider adapters per product family, PostgreSQL as the internal record, idempotency, correlation IDs, append-only audit, separate payment/fulfillment state, and a strict simulation boundary. The biggest next improvements should close contract and state-integrity gaps before adding more customer-facing features.

## Priority P0 — Strengthen the canonical transaction boundary

### 1. Make quote a first-class persisted resource
Current mock search returns fixture results, and order creation validates/recalculates a fixture snapshot. Before live integration, change the canonical flow to:

```text
Search -> Quote snapshot -> Quote revalidation -> Customer confirmation
       -> Order + idempotency record + audit/outbox (one DB transaction)
```

The quote should contain provider/product identity, normalized request hash, supplier reference or server-side session token, price breakdown/currency, terms/cancellation snapshot, simulation/live provenance, `quoted_at`, `expires_at`, and customer/tenant ownership. Expired quotes must not create orders. Never trust client-supplied totals. Each real provider must define when/how repricing is required.

### 2. Unify idempotency implementations
The project now has general PostgreSQL idempotency helpers and a transactionally integrated mock-order path. Keep the stronger invariant: the idempotency claim, order write and response snapshot should commit in one transaction whenever an operation is fully internal. For provider/gateway operations, persist a durable attempt/outbox intent first, call the remote API outside the DB transaction, then persist the outcome. Treat timeouts after possible acceptance as UNKNOWN and reconcile; internal idempotency alone cannot guarantee supplier-side exactly-once behavior.

Before opening authenticated order APIs:
- scope idempotency by customer/tenant + route/action;
- persist normalized request hash and safe response;
- use DB uniqueness to serialize concurrent requests;
- define retention across payment/booking risk windows;
- never put PII or secrets in replay snapshots;
- test changed-payload conflicts and concurrent retry scenarios.

### 3. Separate the three state machines
Keep order, payment and provider fulfillment as separate state machines. Do not compress them into one `success/failed` field.

- Order lifecycle: quote/order/payment-wait/process/completed/cancelled/reconciliation.
- Payment lifecycle: intent/pending/succeeded/failed/expired/refund/unknown.
- Fulfillment lifecycle: not-started/requested/pending/confirmed/issued/failed/unknown/reconciliation.

The allowed transitions should be code and database tested. A payment success must not imply an issued airline ticket, confirmed hotel, issued train ticket or completed PPOB transaction.

### 4. Persist webhook inbox and dedupe before state change
When a payment gateway is selected, implement provider-specific signature verification against raw request bytes, timestamp/replay rules, event ID uniqueness, amount/currency/order/environment matching, durable event receipt, and idempotent processing. A browser redirect is presentation only—not proof of payment. Store redacted payload or safe event fields rather than full secrets or payment details.

### 5. Treat provider timeout recovery as a first-class workflow
Add a reconciliation queue for payment UNKNOWN, supplier PENDING/UNKNOWN and paid-but-not-fulfilled orders. Each adapter should declare which status inquiry/cancel/refund methods are truly supported. Never auto-repeat an operation that might have created a booking or debit unless supplier semantics explicitly make it safe.

## Priority P1 — Complete the service contracts

### Flights
Use the uploaded Pesawat API specification to complete the request/response mapping, then verify current domain/TLS, passenger/date fields, price/seat recheck, booking time limits, issued state and e-ticket retrieval with provider-authorized tests.

### Hotels
Keep hotel/rate identifiers server-side and time-bounded. Snapshot cancellation rules/inclusions/surcharges. Revalidate the room rate before hold/booking. Model hold, payment code, issue and status as separate provider-specific steps because hold alone does not establish final confirmation.

### Rail/KAI
Normalize external date formats only inside the rail adapter. Preserve the schedule session server-side and bind it to a quote/order with expiry. Verify current station codes, seat-selection timing, booking, status and e-ticket flow against current provider behavior.

### PPOB
Use product-specific schemas and workflows. Catalog availability is not proof of a payable product. Where required, the flow should be catalog -> bill inquiry -> show masked customer/amount/fee -> explicit confirmation -> pay -> reconcile outcome. Map `confirm`, `pending`, and `gagal` only after checking the current API contract. Pending is not success.

### Provider contract tests
For every capability, keep request/response fixtures that are redacted and tagged with document version/date/source. Tests should cover required/optional fields, date formats, amount math, timeout/error payloads and normalized status mapping. Distinguish current provider-confirmed fixtures from old uploaded documentation.

## Priority P1 — Security and operations

1. Add customer identity/session authorization before the public website can read or mutate real orders.
2. Keep the admin audit API absent until role-based access, actor attribution, pagination, filtering and PII redaction are implemented.
3. Create separate PostgreSQL migration-owner and runtime roles. Append-only triggers are defense in depth; the runtime role must not own event tables or be able to disable the triggers.
4. Add rate limiting/abuse controls to search and mutation routes before cloud exposure.
5. Add structured request completion logs with latency/status and correlation ID, while never logging body fields, passwords, session keys, passenger identifiers or payment tokens.
6. Add secret scanning, dependency audit, reproducible lockfile/install, container scanning, backup/restore evidence and alerts.
7. Define PII retention, deletion/anonymization and customer-data access policy before collecting live identity data.

## Priority P2 — Customer product and UX

- Mobile-first public website with service tabs for Pesawat, Hotel, Kereta and PPOB.
- A common quote/checkout experience but product-specific forms and terms.
- Explicit expiry countdown/refresh and customer reconfirmation for price changes.
- Clear statuses for payment pending, supplier pending, provider unavailable and reconciliation required.
- Order access via authenticated ownership, not predictable order number alone.
- Receipts/tickets/tokens displayed only after authoritative verified response.
- SEO/content and destination discovery after core transaction flows are stable.
- Accessibility, keyboard support and mobile E2E tests across loading/empty/error/pending states.

## Suggested execution order

1. Merge and protect the mock API scaffold with green CI.
2. Complete Phase 1 hygiene: reproducible lockfile, migration/runtime role split, security scanning and repository-layer tests.
3. Implement quote persistence + quote expiry/revalidation contract.
4. Add an authenticated customer identity boundary and customer-scoped order access.
5. Verify read-only MMBC capabilities, one product family at a time.
6. Select a gateway; implement sandbox/webhook/reconciliation flow.
7. Implement supplier mutations for one approved service at a time.
8. Deploy staging, run UAT/restore drill, then limited canary with daily money/order reconciliation.

Do not choose service sequencing purely by code size. The right first live vertical is the one with verified provider permissions, reliable status inquiry, understandable reversal/refund semantics and operational support.
