# Phase 1 — Canonical Foundation

Status: in progress; initial API shell and durable idempotency service have merged. Order/audit transaction layer is being added. Not production-ready.

## Implemented on main

- Node.js 22+/TypeScript project setup.
- HTTP service shell with liveness and database readiness endpoints.
- Four service modules explicitly return SIMULATED metadata.
- Order creation endpoint fails closed while live transactions are disabled.
- Settings reject live MMBC mutations and live payment mode.
- PostgreSQL core schema for customers, quotes, orders, payments, provider attempts, idempotency keys, order events, audit events and outbox.
- Migration runner stores SHA-256 checksums and rejects edits to applied migrations.
- Order/payment transition guards and stable JSON request hashing.
- PostgreSQL idempotency claim, conflict detection, response replay and concurrent claim tests.
- GitHub Actions CI uses PostgreSQL 16 for migration and integration verification.

## Current order/audit increment

The pending order repository increment adds:
- Create order only from customer-owned, unexpired quote.
- Compute totals from quote snapshot and server-provided integer minor-unit fees/discount.
- Persist an order item snapshot.
- Persist initial order event and audit event in the same transaction.
- Transition order under row lock and optional expected-version check.
- Persist status change, ordered event and audit event atomically.
- Integration tests for invalid transition rollback, competing status transitions and total formula constraints.

## Local setup

1. Install Node.js 22 or newer and PostgreSQL 16.
2. Copy .env.example to .env and use local-only credentials.
3. Install dependencies with npm install.
4. Apply migrations with npm run db:migrate.
5. Start the API shell using npm run dev.
6. Run npm run typecheck, npm test and npm run build.

Endpoints:
- GET /healthz: process liveness only.
- GET /readyz: database readiness.
- GET /api/v1/meta/services: all service modules marked SIMULATED.
- POST /api/v1/orders: intentionally returns LIVE_TRANSACTIONS_DISABLED.

## Still incomplete within Phase 1

- Wire repositories to authenticated customer/order routes.
- Use durable idempotency at every mutating route; live order creation remains disabled.
- Enforce append-only permissions/triggers for audit records based on production DB roles.
- Commit a dependency lockfile and use reproducible clean installs.
- Complete security scanning and dependency review.
- Add CI evidence retention and code review.
- Customer UI, live MMBC adapters, payment gateway and cloud deployment are later phases and remain disabled.
