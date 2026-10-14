# Beelka — Travel & Digital Services Platform

Beelka is a public-facing customer platform for flight, hotel, train, and PPOB services using MMBC provider APIs, Node.js, and PostgreSQL. Online payment gateway integration and cloud deployment are planned.

> **Current mode: simulation only.** MMBC production calls and real payments must remain disabled until credentials, endpoint contracts, provider account permissions, price/status semantics, and payment gateway webhook verification are tested and approved.

## Documentation

- [Product Requirements](docs/PRODUCT-REQUIREMENTS.md)
- [Architecture Blueprint](docs/ARCHITECTURE.md)
- [API Integration Contracts](docs/API-INTEGRATION.md)
- [Data Model](docs/DATA-MODEL.md)
- [Security and Transaction Integrity](docs/SECURITY-TRANSACTIONS.md)
- [UI/UX Blueprint](docs/UI-UX.md)
- [Roadmap and Release Gates](docs/ROADMAP.md)
- [Acceptance Criteria](docs/ACCEPTANCE-CRITERIA.md)
- [Decision Log](docs/DECISIONS.md)
- [Project Status](docs/PROJECT-STATUS.md)
- [Phase 1 Foundation](docs/PHASE-1-FOUNDATION.md)

## Suggested stack

- Node.js 22+ with TypeScript
- Public web UI: React/Next.js (planned; not yet implemented)
- PostgreSQL as source of truth
- Independent provider adapters: flight, hotel, rail, PPOB
- Provider-neutral payment gateway interface; vendor selection is pending
- Cloud deployment with managed PostgreSQL, HTTPS, managed secrets, backups, alerts and release gates

## Phase 1 API shell

Install dependencies, configure local PostgreSQL using .env.example, then run: npm install; npm run db:migrate; npm run dev.

Useful endpoints: GET /healthz, GET /readyz, GET /api/v1/meta/services. POST /api/v1/orders remains disabled.

## Initial scope and non-goals

The first release targets public customers, not a multi-agent marketplace. Each provider integration is server-side and isolated. Do not expose MMBC credentials to the browser, claim simulated data is live, treat a supplier result of ok alone as final fulfillment, or automatically retry potentially chargeable mutations after ambiguous timeouts. The platform is not production-ready until all roadmap gates pass with evidence.
