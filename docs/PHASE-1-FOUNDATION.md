# Phase 1 — Canonical Foundation

Status: in progress; initial foundation merged, durable idempotency is under implementation; not production-ready.

## Implemented on main

- Node.js 22+/TypeScript project setup.
- HTTP service shell with liveness and database readiness endpoints.
- All four service modules explicitly return SIMULATED metadata.
- Order creation fails closed while live transactions are disabled.
- Settings reject live MMBC mutations and live payment mode.
- PostgreSQL migration for customers, quotes, orders, payments, provider attempts, idempotency keys, order events, audit events and outbox messages.
- Migration runner stores SHA-256 checksums and rejects edits to an already-applied migration.
- Domain-level order/payment transition guards and stable JSON request hashing.
- GitHub Actions CI using PostgreSQL 16; typecheck, unit/API tests, build, migration and second-run migration check passed for initial foundation PR.

## Current durable idempotency increment

The phase-1 durable idempotency follow-up adds:
- PostgreSQL states IN_PROGRESS and COMPLETED for idempotency entries.
- Atomic key claim under unique constraint and row-lock conflict inspection.
- Same-key/same-hash completed response replay.
- Same key with a different payload hash is a conflict.
- Concurrent claim integration test against PostgreSQL.
- Applied migration checksum is preserved by adding a new migration, not editing 0001.

## Local setup

1. Install Node.js 22 or newer and PostgreSQL 16.
2. Copy .env.example to .env and configure local credentials only.
3. Install dependencies with npm install.
4. Apply migrations with npm run db:migrate.
5. Run npm run dev.
6. Run npm run typecheck, npm test and npm run build.

Endpoints:
- GET /healthz: process liveness only.
- GET /readyz: database readiness; 503 when PostgreSQL is not configured or unavailable.
- GET /api/v1/meta/services: four service modules marked SIMULATED.
- POST /api/v1/orders: intentionally returns LIVE_TRANSACTIONS_DISABLED.

## Still incomplete within Phase 1

- Wire repositories to customer/order/quote routes.
- Use durable idempotency service in mutation endpoints after those endpoints are implemented.
- Persist order transitions with order_events and audit_events in one transaction.
- Add integration tests for DB constraints and concurrent order state transitions.
- Establish committed dependency lockfile and reproducible clean install.
- Review dependency/security scanning and secret scanning in CI.
- Authentication, customer UI, live MMBC adapters, payment gateway and cloud deployment are later phases and remain disabled.
