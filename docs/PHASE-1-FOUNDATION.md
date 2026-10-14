# Phase 1 — Canonical Foundation

Status: the mock API foundation, reproducible installation, PostgreSQL runtime-role enforcement, dependency audit, CodeQL, and TruffleHog secret-scan workflow are merged on main. Authenticated owner-scoped repository logic and a fail-closed API authenticator boundary are in the current PR. A concrete identity provider is intentionally not wired yet; production authentication is not complete.

## Implemented on main

- Node.js 22+/TypeScript ESM project setup.
- HTTP server with liveness and database readiness endpoints.
- PostgreSQL schema for customers, quotes, orders, order items, payments, provider attempts, idempotency keys, order events, audit events and outbox.
- Migration runner records SHA-256 checksums and rejects changes to applied migrations.
- Order/payment transition guards and stable JSON request hashing.
- PostgreSQL idempotency claim, conflict detection, safe response replay and concurrent claim tests.
- Quote-backed order repository that snapshots price/terms and writes status events plus audit records atomically.
- Database triggers reject UPDATE/DELETE on audit and order event history.
- Committed npm lockfile with CI/security installs using `npm ci`.
- GitHub Actions dependency audit (`npm audit --audit-level=high`), CodeQL JavaScript/TypeScript analysis, and a TruffleHog secret-scan workflow (verified/unknown findings; pull request/push plus scheduled/manual history scan).
- Mock API stays non-bookable and non-purchasable; MMBC and real payment mutations remain disabled.

## Current API scaffold

- GET /api/v1 — module discovery and explicit mode flags.
- POST /api/v1/flights/search, /hotels/search and /trains/search — validated fixture search responses.
- GET /api/v1/ppob/products — fixed mock catalog.
- POST /api/v1/quotes — persist a 15-minute mock quote with server-computed price/terms; raw bearer token is returned once and only its digest is stored.
- GET /api/v1/quotes/:id — quote lookup requires X-Quote-Token and returns ACTIVE/EXPIRED/CONSUMED state.
- POST /api/v1/orders — confirms an unexpired, unused quote with required Idempotency-Key and X-Quote-Token; consumes quote/order/audit/idempotency atomically.
- GET /api/v1/orders/:id — reads simulated demo order by UUID.
- Every returned item is marked mock and not bookable/purchasable.
- Quote creation commits the quote, verified customer subject mapping, hashed quote-token digest, and audit event in one PostgreSQL transaction.
- Quote confirmation commits quote consumption, order item, order/audit events and completed idempotency response atomically.
- The `Authenticator` injection boundary is fail-closed and does not trust caller-supplied identity headers; `main.ts` has no concrete provider adapter, so quote/order routes currently return `AUTHENTICATION_NOT_CONFIGURED`.
- The audit administration endpoint remains unexposed until admin authorization is implemented.
- No MMBC call, payment gateway request, booking, issue, token purchase or real debit occurs.

## Remaining Phase 1 gates

1. **Production database cutover:** document ownership of an existing database, prove backup/restore, provision separate `beelka_migrator` and `beelka_runtime` identities, and verify grants on the actual target environment. CI proves a fresh-database role contract, not an existing-database ownership transfer.
2. Select a customer identity provider and wire its maintained server-side adapter; verify signature/session, issuer/audience, expiry/revocation behavior and logout without implementing a custom JWT verifier.
3. Assign operational owners and remediation SLAs for dependency, CodeQL and secret-scan alerts; automated scans do not prove credentials were never exposed.
4. Complete final database constraints/repository integration tests, rate limiting, backup/restore evidence and operational alerting.
5. Do not declare production readiness until identity, authorization, deployment, privacy, reconciliation and UAT gates have evidence or a formally accepted risk record.

## Local setup

1. Install Node.js 22+ and PostgreSQL 16.
2. Copy .env.example to .env and configure local-only credentials.
3. Run `npm ci` to install from the committed lockfile.
4. Run `npm run db:migrate`, then `npm run dev`.
5. Validate `npm run typecheck`, `npm test`, and `npm run build`.
6. For staging/production, provision separate `beelka_migrator` and `beelka_runtime` roles and configure `MIGRATION_DATABASE_URL`; do not reuse a superuser account for application traffic.

## Security boundaries

- Runtime configuration keeps MMBC mutations and live payment mode disabled.
- Demo order writes default to disabled in production; production startup rejects explicit enablement before authentication exists.
- Demo order data must contain no passenger/customer identifiers.
- Admin audit route stays absent until protected access is implemented.
- CI's role/password fixtures are for disposable test databases only, never deployment credentials.
- These controls do not make the current scaffold production-ready; cloud release still needs authentication, rate limits, secret management, monitoring and backup/restore proof.
