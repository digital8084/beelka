# Phase 1 — Canonical Foundation

Status: initial implementation baseline; not production-ready.

## Implemented in this phase-1 branch

- TypeScript project setup for Node.js 22+.
- HTTP service shell with liveness and database readiness endpoints.
- Service metadata explicitly identifies all four service modules as SIMULATED.
- Order creation endpoint fails closed while live transactions are disabled.
- Settings reject live MMBC mutations and live payment mode.
- PostgreSQL migration for customers, quotes, orders, payments, provider attempts, idempotency keys, order events, audit events and outbox messages.
- Migration runner records SHA-256 checksums and rejects edits to an already-applied migration.
- Domain-level order/payment transition guards and stable JSON request hashing.
- Unit/API tests and GitHub Actions CI with PostgreSQL 16 service.

## Local setup

1. Install Node.js 22 or newer and PostgreSQL 16.
2. Copy .env.example to .env and configure only local credentials.
3. Install dependencies using npm install.
4. Start the API with npm run dev.
5. Apply migrations with npm run db:migrate.
6. Execute npm run typecheck, npm test, and npm run build.

Health endpoints:
- GET /healthz: process liveness only.
- GET /readyz: verifies database readiness; returns 503 when no database is configured or the database cannot be queried.
- GET /api/v1/meta/services: returns the four service modules, clearly marked SIMULATED.
- POST /api/v1/orders: intentionally returns LIVE_TRANSACTIONS_DISABLED until order/payment/provider workflows are implemented and approved.

## Current limitations

- PostgreSQL runtime wiring currently supports readiness and migration only; repository/service persistence is still to be implemented.
- No customer authentication, search form UI, booking workflow, live MMBC adapter, or payment gateway has been enabled.
- Idempotency request hashing and constraints exist, but durable request replay middleware/service still needs implementation and concurrency integration tests.
- SQL migration integration is exercised in CI against an ephemeral PostgreSQL instance; restore testing remains a later staging gate.
- A real production gateway or supplier mutation must not be enabled via environment variable; explicit contract implementation, tests, review and release gate are required.

## Phase 1 exit gate still required

- CI passes on this branch with captured run evidence.
- Migration runs on an empty database and is a no-op on second run with checksum unchanged.
- Durable idempotency and conflicting-payload rejection implemented and concurrency-tested.
- State transition changes are persisted transactionally with append-only order/audit events.
- Database repository integration tests cover constraints and competing state transitions.
- Secret scanning/dependency review and a code review are completed.
