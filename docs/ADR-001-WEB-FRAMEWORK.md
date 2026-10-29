# ADR-001: Public web framework and application boundary

- Status: accepted for Phase 2 implementation
- Date: 2026-10-29
- Decision owners: project maintainers; final production approval remains subject to review

## Context

Beelka needs a responsive Indonesian customer website for flight, hotel, rail/KAI and PPOB journeys. The existing API is a Node.js/TypeScript modular monolith with PostgreSQL. The current `apps/web-prototype/index.html` is a static simulation-only prototype, not a production frontend. The project needs a framework that supports reusable accessible components, routing, form states, automated browser tests and a clear separation between browser code and server-only credentials.

## Decision

Adopt **React with Next.js App Router and TypeScript** for the public customer web application, implemented in a new `apps/web/` directory. Keep the existing Node.js API in `apps/api/` as the authoritative business API and PostgreSQL boundary.

For the first implementation increment:

1. Build a public service-selection and search shell for flights, hotels, trains and PPOB.
2. Use server/client boundaries deliberately; provider credentials, database access and trusted identity verification must remain server-side.
3. Introduce a typed API client that targets Beelka's API and can use explicit mock fixtures in development and tests.
4. Keep simulation status visible and represent search results as non-bookable fixtures until the relevant provider contract gate passes.
5. Add browser end-to-end tests for navigation, keyboard interaction, form validation, loading, empty, error and pending states.
6. Keep the current static prototype as a visual reference until the new shell reaches feature parity; do not silently claim the prototype is production-ready.

## Why

- React component composition supports shared service forms and consistent UI states.
- Next.js App Router provides a standard routing and server-rendering model without moving business logic into the browser.
- TypeScript aligns with the existing API codebase and enables typed client contracts.
- A separate `apps/web/` boundary preserves the modular monolith API and avoids coupling UI releases to supplier adapters.

## Alternatives considered

- **Continue with a single static HTML file:** useful for visual exploration, but insufficient as the long-term implementation for routing, shared components, session lifecycle and E2E coverage.
- **Vite + React:** viable and lighter for a client-only application, but would require separately defining routing and any server-rendering/BFF needs. Revisit if measured product requirements show Next.js server features are unnecessary.
- **SvelteKit or another framework:** viable, but would introduce a less aligned UI ecosystem without a demonstrated benefit for this project.

## Consequences and constraints

- Next.js dependencies and scripts must be added in a dedicated implementation change with a lockfile update and reproducible CI.
- Do not add API routes in Next.js that duplicate order, pricing, authentication or provider business logic. The Node API remains authoritative.
- No production secrets or provider tokens may be exposed to client bundles.
- No real payment, booking, issuance or PPOB purchase is in scope for the UI shell.
- Authentication/session lifecycle, CSP/security headers, privacy/retention and deployment topology still require explicit implementation and review.
- The choice does not satisfy staging UAT or release gates by itself.

## Acceptance evidence

- A minimal Next.js app builds under the repository's supported Node.js version.
- CI runs typecheck/build and browser E2E against deterministic simulation fixtures.
- Browser tests cover the four service entry points and accessible validation/status states.
- No live provider/payment mutations are enabled by the web application.
