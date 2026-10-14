# Beelka — Product and Engineering Roadmap

Planning baseline dated 2026-10-14. No calendar commitments until team capacity, gateway, cloud and live API access are known. A phase is complete only when its gate evidence is reviewed.

## Phase 0 — Discovery and access
- Confirm fees/pricing, supported products, cancellation/refund terms and public customer policies.
- Verify MMBC access, current endpoints/TLS, commercial permissions and supplier workflows.
- Select gateway after reviewing eligibility, methods, fees, webhook, refund and settlement.
- Choose cloud/region and privacy/retention constraints.
Gate: ADRs and provider checklists recorded; no secrets in source; simulation remains default.

## Phase 1 — Canonical foundation and CI
- TypeScript conventions, lint/typecheck/unit tests.
- PostgreSQL schema and immutable migrations.
- Quote/order/items/payment/provider attempts/events/audit/outbox.
- State machine tests, correlation IDs, secret/dependency scanning.
Gate: CI green; migrations work on empty PostgreSQL; concurrency/idempotency tests pass; no live mutations.

## Phase 2 — Public customer UI shell
- Responsive Beelka service navigation/forms.
- Search, quote, checkout, order status; error/pending/unknown states; accessibility.
Gate: browser E2E with simulation fixtures; simulation banner visible; no PII in URLs.

## Phase 3 — Read-only provider integration
- Verify endpoint TLS, methods, payload/date formats and authentication.
- Validate schemas, timeouts, safe error mapping, rate limits and redacted logs.
- Contract tests with authorized test account or provider-confirmed fixtures.
Gate: each provider has evidence; write/issue/payment operations remain disabled.

## Phase 4 — Quote and price revalidation
- Persist quote snapshot, request hash, amount/currency, source ref, terms, timestamp/expiry.
- Implement flight price/seats, hotel rate/terms, rail reprice, PPOB catalog/inquiry as supported.
Gate: expired/changed quotes cannot proceed silently; price/total reconciled; customer reconfirms change.

## Phase 5 — Payment gateway sandbox
- Payment intent, signed webhook, event dedupe, status query and refund interface where supported.
- Separate payment and fulfillment; handle duplicate/out-of-order events/timeouts.
Gate: sandbox success/failure/timeout/duplicate/bad signature/mismatch/expiry tests pass; redirects are not payment proof; no live funds.

## Phase 6 — Supplier mutations, one service at a time
- Sequence based on verified provider authorization, business value and failure/reversal behavior.
- Confirm payment-vs-booking order, time limits, expiry/cancel/refund/reversal.
- Persist provider attempt before mutation; status query/reconciliation for ambiguous result.
- Test known failure, timeout after possible acceptance, duplicate request and balance/limit issue.
Gate: authorized evidence; no blind mutation retry; paid-but-unfulfilled runbook; feature kill switch works.

## Phase 7 — Operations and reconciliation
- Protected order lookup, redacted timeline, allowed status actions, queue for UNKNOWN/PENDING.
- Alerts for aged states, paid/no fulfillment and webhook errors; documented support ownership.
Gate: access audit passes; reconciliation cannot blindly resubmit uncertain supplier mutation.

## Phase 8 — Cloud staging and hardening
- Managed database, secret/IAM, TLS, logs/metrics/alerts, backup/restore, environment separation.
- CI/CD migration gate, staging smoke, regression/load/security tests against stated objectives.
Gate: restore evidence; no secret leak; readiness/liveness correct; alerts and runbooks tested.

## Phase 9 — Controlled production pilot
- Enable one verified service and limited customer cohort after business/security approval.
- Reconcile orders, gateway transactions and supplier references/debits daily.
- Track conversion, provider failures, fulfillment latency, refunds/exceptions and support demand.
Gate: financial/order mismatches resolved or contained; rollback tested; pilot metrics reviewed.

## Phase 10 — Expand and optimize
Only after core workflows are stable: remaining verticals, improved search/filters, SEO/content and lifecycle messages. Promotions/loyalty require accounting and fraud controls.

## Cross-phase P0 blockers
- Simulation misrepresented as live.
- Missing idempotency constraints or audit.
- Payment success without verified evidence.
- Paid order lost without compensation/reconciliation record.
- Unknown supplier mutation blindly retried.
- Sensitive secrets/identity data leaked.
- Backup/restore, monitoring or operational owner absent before launch.

## Weekly status format
Current phase; PR/commit; CI and tests; blockers; provider access; reconciliation exceptions; next release gate. Never mark green without evidence.