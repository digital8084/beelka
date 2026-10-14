# Beelka — Decision Log

Date: 2026-10-14.

## Accepted baseline

### D-001: Public customer website first
Initial product is public-facing. A multi-agent marketplace is out of first-release scope; support/admin functions are restricted operational surfaces.

### D-002: Node.js and PostgreSQL
Use Node.js with TypeScript as backend runtime and PostgreSQL as transactional system of record.

### D-003: Modular monolith and isolated adapters
Start with separate adapters for MMBC Flight, Hotel, Rail/KAI, PPOB and the selected payment gateway. Microservices are not justified yet.

### D-004: Simulation is default
Simulations must be labeled; supplier mutations and live integrations stay disabled until current contracts and authorized tests are approved.

### D-005: Payment and fulfillment separate
Payment success does not imply ticket, room, rail or PPOB fulfillment success.

### D-006: Idempotency, audit, reconciliation
Use PostgreSQL uniqueness constraints, append-only event history and reconciliation for uncertain remote outcomes.

## Pending decisions
- ADR-001: exact framework/workspace tooling.
- ADR-002: payment gateway, onboarding and refund support.
- ADR-003: cloud provider, region, topology and cost.
- ADR-004: customer authentication/session strategy.
- ADR-005: privacy, retention and deletion.
- ADR-006: current MMBC contracts and live enablement procedure.
- ADR-007: money representation and rounding.
- ADR-008: fulfillment ordering relative to payment per service.