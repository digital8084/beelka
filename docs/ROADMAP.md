# Beelka — Product & Engineering Roadmap

Status: planning baseline dated 2026-10-14. A phase is not complete until evidence listed in its gate is reviewed; calendar estimates are deliberately omitted until team capacity, payment provider, hosting and live API access are known.

## Phase 0 — Discovery, access and constraints

Scope:
- Confirm customer-facing business model, target market, fees/markup rules and supported services.
- Confirm MMBC account access, current endpoints/TLS, service permissions, supplier workflows and commercial terms.
- Select payment gateway after eligibility, methods, fee, webhook, refund and settlement review.
- Select cloud provider/region and privacy/retention requirements.

Exit gate:
- ADRs recorded for runtime, gateway, cloud, authentication, retention and live-mode conditions.
- Each MMBC family has a contract-verification checklist and a named owner.
- No secrets committed; simulation mode remains default.

## Phase 1 — Canonical foundation and local CI

Scope:
- Monorepo/package conventions, TypeScript strictness, formatting/lint/typecheck/test scripts.
- PostgreSQL schema/migrations and migration integration tests.
- Customers/auth boundary, quote, order, order item, payment, provider attempt, event/audit and outbox schemas.
- Order/payment/fulfillment state machines and transition tests.
- Request correlation, structured safe logs, secret scan and dependency audit.

Exit gate:
- Clean install and deterministic CI green.
- Migrations work on empty PostgreSQL and rollback/restore behavior is documented.
- Concurrency test proves idempotency key uniqueness and conflicting-payload rejection.
- No API provider is live-enabled.

## Phase 2 — Public customer UI shell

Scope:
- Beelka responsive web shell, service navigation, form components and session/auth approach.
- Search/quote/checkout/order status pages and all empty/loading/error/pending/unknown states.
- Accessibility, keyboard and narrow viewport tests.

Exit gate:
- Browser E2E for navigation/search/checkout with simulation fixtures.
- No dead controls; simulation banner visible.
- PII is not placed in URLs or client logs.

## Phase 3 — Read-only MMBC contract integration

Order: establish one adapter at a time, starting with reference/catalog and search endpoints.
- Verify HTTPS, request methods, field casing, encodings, date formats, auth and current payloads.
- Implement bounded timeouts, response schemas, safe error mapping, rate controls and sanitized logging.
- Build recorded/approved contract fixtures and provider contract tests.

Exit gate:
- Each adapter passes contract tests against authorized test account/environment or current provider-confirmed fixtures.
- Live responses are labeled LIVE only after this gate; stale catalogs and sample data are disclosed.
- Writes and issued/payment operations remain disabled.

## Phase 4 — Quotes and price revalidation

Scope:
- Persist quotes with request hash, currency, price breakdown, source/provider references, creation/expiry times and simulation flag.
- Flight price/seats, hotel rate/terms, rail reprice and PPOB bill inquiry/catalog mapping as supported.
- Quote ownership and expiry validation.

Exit gate:
- Expired/modified quote cannot proceed.
- Provider price and total calculation reconciled with fixtures and provider documentation.
- Price changes require explicit customer reconfirmation.

## Phase 5 — Payment gateway in sandbox

Scope:
- Choose provider, create payment intents, signed webhook validation, dedupe, status query and refund interface where supported.
- Isolate payment state from supplier fulfillment state.
- Record every event, handle duplicate/out-of-order webhook and payment timeout.

Exit gate:
- Sandbox tests pass for success, failure, timeout, duplicate event, out-of-order event, bad signature, amount/currency mismatch and expired intent.
- Redirect alone never confirms payment.
- No live funds accepted.

## Phase 6 — Supplier mutations, one service at a time

Preferred sequencing: PPOB low-complexity contract validation first if supported by provider, then one travel vertical at a time; final ordering depends on MMBC authorization, failure/reversal semantics and business value.

For each service:
- Confirm post-payment/pre-booking policy and provider time limits.
- Persist provider attempt before mutation.
- Add status lookup and manual reconciliation for ambiguous results.
- Test known failure, timeout after provider may have accepted request, duplicate request, balance/limit issues and cancellation/refund handling.

Exit gate:
- Provider-authorized test evidence for booking/fulfillment/status/receipt or e-ticket.
- No blind retry of chargeable operation.
- Paid-but-unfulfilled exception and support runbook proven.
- Feature flag supports immediate disable.

## Phase 7 — Operational console, audit and reconciliation

Scope:
- Restricted operational lookup, redacted event timeline, retry/status controls limited by policy and queue for UNKNOWN/PENDING items.
- Aging metrics and alerts for paid/no fulfillment, provider unknown and webhook errors.
- Support runbooks and incident ownership.

Exit gate:
- Admin/support access audit verified.
- Reconciliation never resubmits a supplier mutation automatically without status evidence/policy.

## Phase 8 — Cloud staging and release hardening

Scope:
- Cloud deployment, managed PostgreSQL, secrets/IAM, TLS, WAF/rate controls, logs/metrics/alerts, backups and restore test.
- CI/CD with migration gate and environment approvals.
- E2E/regression and load/security testing against agreed objectives.

Exit gate:
- Staging smoke and restore test pass.
- No secrets exposed in logs or artifacts.
- Readiness checks real dependencies; liveness checks process only.
- Operational alerts and incident runbooks tested.

## Phase 9 — Controlled production pilot

Scope:
- Enable one provider/service and limited customer cohort after commercial, legal, support and security approval.
- Daily reconciliation of internal orders, payment gateway, and supplier references/debits.
- Track conversion, provider errors, fulfillment time, refund/exception rate and support contacts.

Exit gate:
- Pilot metrics reviewed; unresolved financial/order mismatch blocks expansion.
- Provider and payment reconciliation evidence is complete for pilot cohort.
- Rollback/disable plan tested.

## Phase 10 — Broaden capabilities and optimize

Only after core flows are stable:
- Add remaining service verticals and advanced search/filtering.
- Improve performance, SEO, content and lifecycle messaging.
- Add loyalty/promotions only with explicit accounting and fraud controls.

Do not add scope while CI, payment reconciliation, or supplier fulfillment gates are red.

## Cross-phase blockers (P0)

- Any provider call falsely shown as live while in simulation.
- Missing uniqueness/idempotency constraints.
- Payment marked successful without verified evidence.
- Paid order can disappear or become failed without compensation/reconciliation record.
- Unknown supplier mutation automatically retried.
- Secrets or sensitive identity data appear in client assets/logs.
- Unverified backup/restore or missing operational alerting before production.

## Weekly status format

Report: current phase; PR/commit; tests and CI evidence; blockers; provider access status; reconciliation exceptions; exact next gate. Avoid reporting a phase green without attached evidence.
