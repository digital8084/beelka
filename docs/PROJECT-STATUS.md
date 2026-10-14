# Beelka — Project Status

Status date: 2026-10-14.

## Confirmed product and architecture baseline

- Public-facing, Indonesia-first customer website for flights, hotels, trains/KAI and PPOB.
- Node.js + TypeScript API and PostgreSQL transactional source of truth.
- MMBC services and payment remain in explicit simulation until contracts, credentials and authorized test evidence pass.
- Modular monolith with isolated supplier/payment adapters, idempotent mutations, append-only audit evidence and reconciliation for ambiguous outcomes.

## Authentication progress

- Google Identity Platform is the selected customer identity provider (ADR-004 accepted).
- The server uses Firebase Admin SDK ID-token verification with revocation/disabled-user checks; it does not accept caller-supplied subject IDs or issue its own login token.
- Quote/order ownership is tied to the verified provider subject in PostgreSQL.
- `GET /api/v1/auth/me` provides a low-information authenticated identity probe.
- CORS only admits exact origins from `BEELKA_CORS_ORIGINS`; a temporary local browser smoke harness is available at `tools/identity-platform-smoke/`.
- PR #13 merged to `main` at commit `2cfc73fe2284b1552451e3a2fd659615e95e0063`. PR CI/security gates passed; CI and the post-merge security workflow also passed.

## Not yet verified / release blockers

- A real non-production Google Cloud / Identity Platform project has not been configured and verified from this repository workflow.
- Actual ADC/IAM access, Google provider/client configuration, authorized domains and valid ID-token acceptance still require staging UAT.
- The full public customer UI does not exist yet; architecture decision ADR-001 (web framework/workspace) remains open.
- Customer account recovery UX, production session policy, auth abuse/rate controls, privacy/retention approval and operational monitoring need review.
- Current MMBC API contracts, supplier mutations, payment gateway sandbox, cloud deployment, managed PostgreSQL and backup/restore evidence remain unverified.

## Safe release posture

- Keep Beelka in simulation mode.
- Do not enable demo-order writes in production.
- Do not treat the smoke harness as a production login page or a production release approval.
- Advance only after CI, real-project staging evidence, authorization regression tests and the remaining product/operations gates are recorded.
