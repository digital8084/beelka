# Security, Payments and Transaction Integrity

## Security baseline
- MMBC/payment credentials only in server-side secret storage; separate dev/staging/prod secrets/databases.
- Validate schemas, bounds, dates, passenger counts and product fields; rate-limit public endpoints.
- Use secure HttpOnly SameSite cookies or approved session strategy; CSRF protection for cookie-authenticated mutations.
- Least-privilege DB roles and private database networking.
- Redact credentials, payment tokens, identity numbers and unnecessary contact data in logs.
- HTTPS/TLS, security headers/CSP, dependency scanning and CI secret scanning.
- Restrict support/admin access, stronger auth and audit.
- Define privacy notice, retention and deletion before live passenger data.

## Payment gateway
Vendor remains undecided; do not assume vendor API specifics. Adapter capabilities: `createPaymentIntent`, `verifyWebhook` using raw bytes, `parseWebhookEvent`, `getPaymentStatus` where supported, `requestRefund` only if supported and approved.

Rules:
1. Server calculates amount; never trust client total.
2. Intent binds to immutable order price/currency.
3. Verify signature and replay controls according to gateway contract.
4. Deduplicate provider event ID using DB uniqueness.
5. Validate amount, currency, payment ID, environment and order before transition.
6. Redirect URL is not payment proof.
7. Persist webhook event before acknowledging.
8. Handle duplicates and out-of-order events with explicit state machine.
9. Payment creation timeout becomes UNKNOWN/RECONCILIATION_REQUIRED; query status before creating another intent.
10. Never expose secret keys or full payment tokens.

## Orchestration
External payment and supplier APIs do not share a single ACID transaction. Use explicit states and reconciliation rather than claiming distributed atomicity.
1. Validate quote; create order/payment record/event transactionally.
2. Create remote payment intent outside DB transaction; persist result.
3. Verify webhook/status and atomically mark payment succeeded once.
4. Enqueue fulfillment using transactional outbox after payment confirmation.
5. Worker persists supplier attempt then calls provider outside transaction.
6. Persist confirmed supplier result; on known failure follow documented refund/void policy or support exception.
7. On ambiguous timeout set RECONCILIATION_REQUIRED and check status where supported.
8. Show payment and fulfillment separately to customer.
9. Append transition event with correlation ID.

## Idempotency
Persist scoped key, normalized request hash, result resource ID and safe response snapshot. Same key/same hash returns prior result; same key/different hash yields HTTP 409; DB constraint handles concurrent requests. Retention duration requires ADR. Internal idempotency does not guarantee supplier exactly-once behavior without supplier support; ambiguous results use status/reconciliation, not blind retry.

## Audit/observability
Audit security actions, quote lifecycle, order transitions, payment intents/webhooks/refunds, supplier summaries, reconciliation and admin actions. Record actor, time, correlation ID, entity/action, before/after status and safe reason. Do not log secrets, raw payment payloads or identity documents.

Alert on webhook verification failures, paid orders lacking fulfillment, aged provider UNKNOWN/PENDING, price mismatch, idempotency conflicts, provider latency/errors, DB pool issues and failed backup/restore.

## Release blockers
No live payment without signed-webhook tests/runbooks. No live supplier mutations without verified contract and authorized tests. No production secrets before IAM/rotation. No launch without restore evidence, monitoring, operational owner and incident procedure.