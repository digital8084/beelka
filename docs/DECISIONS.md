# Beelka — Decision Log

Date: 2026-10-29

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

### ADR-001: React + Next.js public web

Status: accepted for Phase 2 implementation on 2026-10-29. See [ADR-001 web framework](ADR-001-WEB-FRAMEWORK.md).

Decision: implement the customer web app in `apps/web/` using React, Next.js App Router and TypeScript. Keep the Node.js API as the authoritative business API and PostgreSQL boundary. The existing static HTML prototype remains a simulation-only visual reference.

Constraints: no provider/payment secrets in client bundles; no duplicate business logic in the web app; no real transactions in the UI shell; deterministic simulation fixtures and browser E2E are required.

### ADR-004: Google Identity Platform for customer identity

Status: accepted on 2026-10-14.

Decision:
- Use Google Identity Platform with the maintained Firebase Admin Node.js SDK to verify client-issued ID tokens on the server.
- Use the project-scoped stable identity (Google Identity Platform project ID + UID) as the internal customer subject. Verify revocation/disabled-user state on protected requests.
- Client sends a bearer ID token over HTTPS. Beelka does not issue custom JWTs or trust identity supplied by a caller.
- When the provider project is not configured, protected routes fail closed. Provider/ADC/network failures do not become successful authentication.
- Separate non-production and production projects; staging smoke evidence is required before production eligibility.

Consequences and remaining work:
- The server adapter and a private staging smoke harness exist, but real Google project setup, ADC/IAM, web app configuration, customer UI, session lifecycle, account recovery, rate limiting and staging UAT remain release gates.
- `GOOGLE_CLOUD_PROJECT` or `FIREBASE_PROJECT_ID` identifies the runtime project; it is not a secret. Server credentials must use ADC/workload identity or an untracked local credential file.

## Pending decisions

- ADR-002: payment gateway, methods, onboarding and refund support.
- ADR-003: cloud provider/region, runtime topology and operational cost.
- ADR-004 follow-up: customer UI framework-independent session lifecycle, logout and account recovery policy.
- ADR-005: legal, privacy, retention and deletion requirements.
- ADR-006: exact current MMBC contracts, endpoints and live enablement procedure.
- ADR-007: final money arithmetic/currency representation and display rounding policy.
- ADR-008: fulfillment order relative to payment for each product family.
