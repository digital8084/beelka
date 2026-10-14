# Beelka — Decision Log

Date: 2026-10-14

## Accepted baseline

### D-001: Public customer web first

Decision: first product is a public-facing customer website. A multi-agent marketplace is out of initial scope; internal support/admin surfaces are restricted operational tools.

Reason: matches the defined product model and keeps initial authorization and accounting simpler.

### D-002: Node.js + PostgreSQL

Decision: use Node.js with TypeScript as the backend runtime and PostgreSQL as the transactional system of record.

Reason: strong ecosystem for web and provider integration, and relational constraints/transactions for orders, payments and audit.

### D-003: Modular monolith, isolated adapters

Decision: begin with modular monolith and independent service adapters for MMBC Flight, Hotel, Rail/KAI, PPOB and payment gateway.

Reason: simpler operations for the first release without coupling vendor-specific schemas to the domain model. Microservices are not justified yet.

### D-004: Simulation is the only default mode

Decision: simulations must be explicitly labeled; production mutations remain disabled until live provider contracts and authorized test evidence are approved.

Reason: historic PDFs are not proof of current endpoint behavior or provider authorization.

### D-005: Payment and fulfillment states are separate

Decision: payment success does not itself mean ticket, room, train or PPOB fulfillment succeeded.

Reason: cross-provider systems do not share one ACID transaction and may return pending/unknown outcomes.

### D-006: Durable idempotency, audit and reconciliation

Decision: use PostgreSQL uniqueness constraints for idempotency, append-only order/audit events and explicit reconciliation state for ambiguous remote outcomes.

Reason: booking, issue and bill-payment mutations have financial/customer impact; blind retries can duplicate charges or bookings.

## Pending decisions

- ADR-001: exact workspace structure and web framework.
- ADR-002: payment gateway, methods, onboarding and refund support.
- ADR-003: cloud provider/region, runtime topology and operational cost.
- ADR-004: managed identity provider or application-owned auth/session.
- ADR-005: legal, privacy, retention and deletion requirements.
- ADR-006: exact current MMBC contracts, endpoints and live enablement procedure.
- ADR-007: final money arithmetic/currency representation and display rounding policy.
- ADR-008: fulfillment order relative to payment for each product family.
