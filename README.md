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

## Product scope

Public customer website (not a multi-agent marketplace for the first release), one server-side integration adapter per product family, durable order/payment/audit records, idempotent mutation endpoints, and manual-safe reconciliation for ambiguous provider outcomes.

## Suggested engineering baseline

- Node.js LTS with TypeScript
- React/Next.js customer UI and server-side API/BFF
- PostgreSQL as the source of truth
- Provider adapters: `flight`, `hotel`, `rail`, `ppob`
- Payment gateway abstraction; select a provider after commercial and technical review
- Cloud deployment with managed PostgreSQL, HTTPS, managed secrets, backups, alerts, and CI gates

## Non-goals for initial release

- Do not expose MMBC credentials to the browser.
- Do not claim live availability, price, booking, or payment until verified against providers.
- Do not treat any provider `result: ok` alone as proof of final fulfilment.
- Do not automatically retry potentially chargeable mutations after an ambiguous timeout.
- Do not mark this project production-ready until roadmap gates pass with evidence.
