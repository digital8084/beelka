# Phase 1 — Canonical Foundation

Status: in progress. The Phase 1 API shell, durable idempotency service and transactional order/audit repository have merged to main. The follow-up under review adds append-only event guards. This is not production-ready.

## Implemented on main

- Node.js 22+/TypeScript project setup.
- HTTP service shell with liveness and database readiness.
- Four service modules explicitly return SIMULATED metadata.
- Order creation API route fails closed while live transactions are disabled.
- Settings reject live MMBC mutations and live payment mode.
- PostgreSQL schema for customers, quotes, orders, order items, payments, provider attempts, idempotency keys, order events, audit events and outbox.
- Migration runner records SHA-256 checksums and rejects edits to applied migrations.
- Order/payment transition guards and stable request hashing.
- PostgreSQL idempotency claim, conflict detection, safe response replay and concurrent claim tests.
- Quote-backed order creation snapshots price/terms and writes initial order event plus audit record in one transaction.
- Order transition updates status/version, order event and audit record atomically under row lock.
- Integration tests cover quote ownership/expiry paths, invalid transition rollback, competing status transitions and total formula.

## Current audit-immutability increment

Adds database triggers to reject UPDATE/DELETE of audit and order event history. Integration tests run against disposable schemas so event immutability is tested without leaving test records behind.

## Local setup

1. Install Node.js 22+ and PostgreSQL 16.
2. Copy .env.example to .env and use local-only credentials.
3. Install dependencies with npm install.
4. Apply migrations with npm run db:migrate.
5. Start the API shell with npm run dev.
6. Run npm run typecheck, npm test, and npm run build.

Endpoints:
- GET /healthz: process liveness.
- GET /readyz: database readiness.
- GET /api/v1/meta/services: all services marked SIMULATED.
- POST /api/v1/orders: deliberately disabled.

## Still incomplete within Phase 1

- Wire repositories/idempotency to authenticated order routes; no customer mutation route is enabled.
- Separate migration-owner role from restricted runtime DB role and enforce least privilege.
- Commit a dependency lockfile and use reproducible clean installs.
- Add secret/dependency scanning and CI evidence retention.
- Authentication, public web UI, MMBC live adapters, payment gateway and cloud deployment remain later gates.
