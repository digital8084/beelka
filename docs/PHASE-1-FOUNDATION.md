# Phase 1 — Canonical Foundation

Status: the mock API foundation, reproducible dependency installation, dependency audit and CodeQL workflow are merged on main. Dedicated PostgreSQL runtime-role enforcement is proposed in the current hardening PR and must pass PostgreSQL integration CI before Phase 1 can be declared complete.

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
- POST /api/v1/orders — local-only simulated order, guarded by demo configuration and required Idempotency-Key.
- GET /api/v1/orders/:id — reads simulated demo order by UUID.
- Every returned item is marked mock and not bookable/purchasable.
- Demo order, quote/terms snapshot, order item, audit/event entries and completed idempotency response are committed in one PostgreSQL transaction.
- The audit administration endpoint is not exposed until authentication/authorization is implemented.
- No MMBC call, payment gateway request, booking, issue, token purchase or real debit occurs.

## Remaining Phase 1 gates

1. **Migration/runtime role separation:** run migrations with a dedicated owner role; run application queries as a non-superuser runtime role that cannot modify append-only events or migration history.
2. Complete runtime privilege integration tests and keep schema/table ownership separate from the API role.
3. Define an owner and remediation runbook for dependency, CodeQL, and secret-scan findings; scanning is automated, but no scan can prove credentials were never exposed. Rotate any credential that is found.
4. Complete final database constraints/repository integration tests and evidence retention.
5. Do not declare Phase 1 fully green until all gates pass or a risk record explicitly accepts any exception.

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
