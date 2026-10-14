# Phase 1 — Canonical Foundation

Status: initial foundation is implemented on main; remaining Phase 1 security/reproducibility items are not yet closed.

## Implemented on main

- Node.js 22+/TypeScript ESM project setup.
- HTTP server with liveness and database readiness endpoints.
- PostgreSQL schema for customers, quotes, orders, order items, payments, provider attempts, idempotency keys, order events, audit events and outbox.
- Migration runner records SHA-256 checksums and rejects changes to applied migrations.
- Order/payment transition guards and stable JSON request hashing.
- PostgreSQL idempotency claim, conflict detection, safe response replay and concurrent claim tests.
- Quote-backed order repository that snapshots price/terms and writes status events plus audit records atomically.
- Database triggers reject UPDATE/DELETE on audit and order event history.
- GitHub Actions CI with PostgreSQL 16; typecheck, unit/API/integration tests, build and repeat migration check pass on the merged foundation commits.

## Current API scaffold increment

The mock API extension adds:
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

- Commit a dependency lockfile and use reproducible clean installs.
- Separate migration-owner role from limited runtime DB role.
- Add CI secret scanning and dependency/security review.
- Complete final DB constraints/repository integration tests and evidence retention.
- Avoid declaring Phase 1 fully green until these items are closed or explicitly accepted with a risk record.

## Local setup

1. Install Node.js 22+ and PostgreSQL 16.
2. Copy .env.example to .env and configure local-only credentials.
3. Set BEELKA_DEMO_ORDERS_ENABLED=true only for local demo-order testing.
4. Run npm install, npm run db:migrate, npm run dev.
5. Validate npm run typecheck, npm test, and npm run build.

## Security boundaries

- Runtime configuration keeps MMBC mutations and live payment mode disabled.
- Demo order writes default to disabled in production; production startup rejects explicit enablement before authentication exists.
- Demo order data must contain no passenger/customer identifiers.
- Admin audit route stays absent until protected access is implemented.
- These controls do not make the current scaffold production-ready; cloud release still needs authentication, rate limits, secret management, monitoring and backup/restore proof.
