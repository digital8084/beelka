# Beelka release checklist

This checklist is a release gate, not a declaration that the release is ready. The Worker must remain in simulation until every required item has evidence attached to the release PR.

## 1. Required evidence before any production approval

- [ ] **Repository state:** review the exact commit SHA that will be deployed; verify CI and security workflows passed for that SHA.
- [ ] **Database isolation:** provision a dedicated Beelka PostgreSQL/Supabase project. Never run Beelka migrations against another business's database.
- [ ] **Database roles:** use separate migration and runtime roles. Confirm the runtime role cannot create roles, databases, schemas, or perform migrations.
- [ ] **Migration proof:** run migrations against staging, re-run to prove idempotency, and document the recovery/rollback strategy.
- [ ] **Backup and restore:** capture evidence of a backup and a successful restore rehearsal in an isolated staging target.
- [ ] **Worker binding:** confirm Cloudflare Hyperdrive targets the dedicated Beelka database, TLS verification is enabled, and `GET /readyz` succeeds in staging.
- [ ] **Authentication:** implement and review a Worker-compatible identity verifier. Test valid, missing, malformed, expired, wrong-issuer, wrong-audience, revoked/disabled-user tokens, and identity-provider outage behavior.
- [ ] **Authorization:** test customer ownership boundaries for quotes and orders, including cross-customer reads and writes.
- [ ] **Idempotency:** run concurrent duplicate-request, same-key/different-payload, retry, and persistence-failure tests against staging PostgreSQL.
- [ ] **CORS:** test every approved browser origin and reject unknown origins, wildcard origins, disallowed methods, and disallowed headers.
- [ ] **Runtime UAT:** exercise health, readiness, request body limits, database outage behavior, logs, and error responses on the actual Worker staging deployment.
- [ ] **Providers and payments:** verify current MMBC contracts and credentials; select a payment provider; complete sandbox flows, webhook signature validation, idempotency, reconciliation, and failure/timeout tests.
- [ ] **Operations:** define alert ownership, log retention, incident/rollback procedure, rate limiting, privacy/retention policy, and customer support escalation.
- [ ] **Independent review:** obtain human code/security review and record explicit approval of the exact release commit.

## 2. Safe validation commands

Run these in the repository root with Node.js 22 and the committed lockfile:

```sh
npm ci --no-audit --no-fund
npm run typecheck
npm test
npm run build
npm run worker:check
npm run db:migrate
```

The database migration command must only be pointed at the dedicated staging database when running outside CI. Do not copy production credentials into local shells or logs.

## 3. Deployment control

- Keep GitHub Environment `production` protected by required reviewers where available.
- Keep `BEELKA_PRODUCTION_RELEASE_APPROVED` unset or not equal to `true` until all required evidence above is approved.
- Verify Cloudflare API credentials are scoped to the intended account and Worker.
- Select one authoritative production deployment path. If Git-connected Cloudflare deployment is retained for previews, ensure it cannot independently deploy production.
- Record the deployed commit SHA, deployment timestamp, operator/approver, smoke-test result, and rollback target.
- Pin deployment tooling to a reviewed version before enabling production deploys; do not rely on an unbounded `latest` tag for release-critical tooling.

## 4. Current known blockers

At the time this checklist was added, the dedicated Beelka database, Worker-compatible verified identity adapter, real staging UAT, backup/restore evidence, provider/payment sandbox validation, and final independent release review have not been demonstrated. These are blockers, not optional follow-up tasks.

**Safe posture:** keep `BEELKA_MODE=simulation`, `PAYMENT_GATEWAY_MODE=simulation`, `MMBC_LIVE_ENABLED=false`, and `BEELKA_DEMO_ORDERS_ENABLED=false`. Do not approve production deployment or enable real customer transactions based only on a green CI run or a successful bundle dry run.
