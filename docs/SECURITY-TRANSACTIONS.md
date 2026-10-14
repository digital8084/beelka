# Security, Payments and Transaction Integrity

## Security baseline

- MMBC and payment credentials exist only in server-side secret storage.
- Separate development/staging/production credentials and databases.
- Public endpoints validate schemas, bounds, dates, passenger counts and service-specific fields.
- Rate-limit search, order, login and payment endpoints; add anti-abuse controls.
- Use secure HttpOnly SameSite cookies or an approved session strategy; add CSRF protection for cookie-authenticated mutations.
- Use least-privilege PostgreSQL roles and private database networking.
- Redact credentials, payment tokens, identity numbers and unnecessary contact data in logs/traces.
- Enforce HTTPS/TLS, secure headers and CSP.
- Pin/scan dependencies and use secret scanning in CI.
- Restrict support/admin access; require stronger authentication and audit.
- Define privacy notice, retention and deletion before collecting live passenger data.

## Payment gateway requirements

Provider not yet selected. Do not implement assumptions about a particular vendor's API.

Gateway adapter should define `createPaymentIntent`, `verifyWebhook`, `parseWebhookEvent`, `getPaymentStatus` where supported, and `requestRefund` only if supported/policy-approved.

Rules:
1. Server calculates amount; never trust browser-submitted totals.
2. Payment intent amount/currency binds to one immutable order-price snapshot.
3. Verify signature against raw request bytes per provider instructions before accepting events.
4. Deduplicate using provider event ID and a unique database constraint.
5. Validate amount, currency, payment ID, environment and expected order before state transition.
6. Browser redirect is not proof of payment.
7. Persist webhook receipt before acknowledging it.
8. Handle out-of-order/duplicate events with explicit transition rules.
9. Timeout during payment creation creates UNKNOWN/RECONCILIATION_REQUIRED; query status before creating another intent.
10. Never reveal secret keys or full payment tokens to customers.

## Canonical order/fulfillment workflow

A provider booking and a payment provider generally cannot share one ACID transaction. Model the orchestration as a state machine with compensating/reconciliation paths, not distributed atomicity.

1. Validate unexpired quote; create order, payment record and order event transactionally.
2. Create external payment intent outside DB transaction; persist provider result.
3. Verify webhook/status and atomically mark payment SUCCEEDED once.
4. After payment confirmation, enqueue fulfillment command in a transactional outbox.
5. Worker creates provider attempt record, calls provider outside the DB transaction.
6. On confirmed provider success, persist reference and fulfillment state.
7. On known failure, follow documented refund/void policy or raise support exception; never silently lose paid value.
8. On timeout/ambiguous result, set RECONCILIATION_REQUIRED, query supplier status where supported, and alert operations.
9. Customer status reflects payment and supplier fulfillment separately.
10. Each transition writes an append-only event and correlation ID.

## Idempotency

Scope a key by customer/action and store key, normalized request hash, result resource ID, safe response snapshot, created and expiry timestamps.

- Same key + same hash returns prior logical result.
- Same key + different hash returns HTTP 409.
- Unique database constraint handles concurrency.
- Retain keys through the relevant payment/booking risk window; exact duration is an ADR.

Internal idempotency cannot guarantee an external supplier mutation executes exactly once unless supplier supports it. Use supplier status and reconciliation for uncertain outcomes.

## Audit and observability

Audit security-sensitive actions, quote creation/expiry/refresh, order transitions, payment intent/webhook/refund, supplier request/response summaries, status refresh/reconciliation and administrative interventions.

Events contain actor, timestamp, correlation ID, resource, action, before/after state and safe reason. Do not put secrets, raw payment payloads or complete identity documents in audit logs.

Metrics/alerts include webhook verification failures, paid orders without fulfillment progress, supplier UNKNOWN/PENDING over threshold, price mismatches, idempotency conflicts, provider errors/latency, database pool exhaustion and backup/restore failures.

## Release blockers

- No live payment without signed-webhook tests and exception/refund runbooks.
- No live supplier mutation without verified API contract and authorized test.
- No production secrets until IAM/secret store and rotation are ready.
- No launch without backup restoration evidence, monitoring, operational owner and incident procedure.
