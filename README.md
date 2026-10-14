# Beelka — Travel & Digital Services Platform

Beelka is a public-facing customer platform for flights, hotels, trains and PPOB, designed around Node.js, PostgreSQL and separate MMBC provider adapters.

> **Current integration mode: mock.** Fixture data is not live inventory, and every result uses `bookable: false` or `purchasable: false`. Payment gateway calls and MMBC mutations are disabled.

## Documentation

- [Product Requirements](docs/PRODUCT-REQUIREMENTS.md)
- [Architecture Blueprint](docs/ARCHITECTURE.md)
- [API Integration Contracts](docs/API-INTEGRATION.md)
- [Mock API Contract](docs/MOCK-API-CONTRACT.md)
- [Blueprint Development Ideas](docs/BLUEPRINT-IDEAS.md)
- [PostgreSQL Data Model](docs/DATA-MODEL.md)
- [Security and Transaction Integrity](docs/SECURITY-TRANSACTIONS.md)
- [UI/UX Blueprint](docs/UI-UX.md)
- [Roadmap and Release Gates](docs/ROADMAP.md)
- [Acceptance Criteria](docs/ACCEPTANCE-CRITERIA.md)
- [Decision Log](docs/DECISIONS.md)
- [Project Status](docs/PROJECT-STATUS.md)
- [Phase 1 Foundation](docs/PHASE-1-FOUNDATION.md)

## Stack

- Node.js 22+ with TypeScript, ESM and built-in HTTP server
- PostgreSQL as internal source of truth
- Separate provider adapters for flight, hotel, rail/KAI and PPOB
- Mock catalog/search and demo orders while provider contracts are being verified
- Payment gateway abstraction planned; vendor not selected
- Cloud deployment planned; provider/region not selected

## Local development

1. Install Node.js 22+ and PostgreSQL 16.
2. Copy `.env.example` to `.env`, set `DATABASE_URL` to a local test database, and set `BEELKA_DEMO_ORDERS_ENABLED=true` for local-only demo order testing.
3. Run `npm ci` to install the exact dependency graph from `package-lock.json`.
4. Run `npm run db:migrate`.
5. Run `npm run dev`.
6. Run `npm run typecheck`, `npm test`, and `npm run build`.

Do not enable unauthenticated demo order writes in production. Current configuration refuses to start when `NODE_ENV=production` and demo orders are enabled.

## API scaffold

- `GET /healthz` — process liveness.
- `GET /readyz` — PostgreSQL readiness.
- `GET /api/v1` — modules, mode and live-operation flags.
- `POST /api/v1/flights/search` — mock-only flight search.
- `POST /api/v1/hotels/search` — mock-only hotel search.
- `POST /api/v1/trains/search` — mock-only train search.
- `GET /api/v1/ppob/products` — mock-only catalog.
- `POST /api/v1/orders` — database-backed demo order; requires `Idempotency-Key` and local demo-order enablement.
- `GET /api/v1/orders/:id` — UUID-based lookup for simulated demo orders only.
- `GET /api/v1/admin/audit-events` — deliberately not exposed before authentication and authorization exist.

## Safety and scope

No customer authentication, public website UI, real payment gateway, MMBC live adapter or cloud deployment is claimed complete. Never expose provider credentials to the browser, represent fixtures as live data, infer payment success from a redirect, or automatically retry an ambiguous chargeable provider mutation. Production requires the roadmap gates and evidence.
