# Cloudflare Workers deployment foundation

## Scope

This branch adds a Cloudflare Workers entrypoint for the existing Node HTTP API using Cloudflare's `cloudflare:node` bridge. The runtime uses `nodejs_compat` and `enable_nodejs_http_server_modules`; this is an explicit compatibility path, not a claim that every Node.js package is supported.

The Worker intentionally keeps all provider integrations in simulation:
- `BEELKA_MODE=simulation`
- `PAYMENT_GATEWAY_MODE=simulation`
- `MMBC_LIVE_ENABLED=false`
- `BEELKA_DEMO_ORDERS_ENABLED=false`

Customer quote/order routes remain disabled in this Worker until a Workers-compatible verified identity adapter is implemented and staging tests prove the identity contract. Search fixtures are explicitly marked simulated and not bookable.

## Database connectivity

Preferred production topology:
1. Provision a dedicated Supabase project for Beelka.
2. Apply the repository's reviewed SQL migrations to that project only.
3. Create a Cloudflare Hyperdrive configuration pointing at the Beelka Supabase PostgreSQL connection pooler/endpoint.
4. Bind the configuration as `HYPERDRIVE` in the Cloudflare Worker.
5. Keep the database role least-privileged and use TLS. Do not use the Supabase service-role API key as a PostgreSQL password.
6. Verify `GET /readyz` after the binding is attached.

A `DATABASE_URL` Worker secret is supported as a temporary fallback. Prefer Hyperdrive for connection pooling and latency; do not configure both to point at different databases.

## Configure Cloudflare

The repository has a `wrangler.jsonc` scaffold. Before deployment:
- Install/execute Wrangler in the remote Cloudflare environment or via the CI workflow.
- Authenticate the Cloudflare account and confirm the intended account.
- Provision the Hyperdrive configuration and bind its ID in `wrangler.jsonc` or Cloudflare dashboard.
- Add `BEELKA_CORS_ORIGINS` as an exact comma-separated list of allowed browser origins; never use `*`.
- Set the database secret/binding in the correct environment.
- Add a preview/staging environment before production.
- Review logs and run the Worker compatibility tests before deploying a production route.

Commands (run in Cloudflare's connected build/deployment environment; no local PC is required):
```sh
npm ci
npm run typecheck
npm test
npm run worker:dev
npm run worker:deploy
```

## Runtime compatibility review

The existing API uses:
- `node:http` request/response APIs;
- `node:crypto`;
- `pg` for PostgreSQL;
- Firebase Admin SDK with Application Default Credentials for Google Identity Platform.

Cloudflare documents a Node HTTP server bridge via `cloudflare:node`, and PostgreSQL access via TCP sockets/Hyperdrive. The Worker entrypoint therefore reuses the existing HTTP router and `pg` package, but uses a bounded pool per isolate. Compatibility must be verified in Wrangler and staging, especially TLS, query behavior, database connection pressure, and request body handling.

Firebase Admin's Application Default Credentials flow is not wired into this Worker entrypoint. The Node runtime's Google Identity Platform authenticator relies on Firebase Admin and `applicationDefault()`, which is not a drop-in Worker-compatible identity adapter. The Worker therefore does not pass an `authenticate` dependency, and quote/order routes remain fail-closed. Do not enable those routes until a separately tested Worker-compatible identity implementation validates signature, issuer, audience, expiry, and revocation/disabled-user requirements.

## Supabase provisioning blocker

At the time of this change, the connected Supabase organization has reached its limit of two active free projects. Project creation for `beelka` was rejected by Supabase. No existing project was paused, deleted, upgraded, or modified.

To continue, the account owner must free a project slot or approve a paid-plan upgrade, then create a new project named `beelka` in `ap-southeast-1` (Singapore). Do not apply Beelka migrations to the existing MTA DETENI or `galleryabah` projects.

## Release gates

Do not declare production-ready until all of the following are recorded:
- Dedicated Supabase project and least-privilege database credentials;
- successful migration run and rollback/restore procedure;
- Wrangler typecheck/build/runtime smoke checks;
- valid and invalid customer-token tests, including wrong-project, expired/revoked/disabled-user cases;
- exact-origin CORS tests;
- database readiness and outage behavior;
- order ownership and idempotency regression tests on the Worker runtime;
- backup/restore evidence and operational monitoring;
- explicit approval to keep all supplier/payment mutations disabled until provider UAT is complete.

## Cloudflare Git-connected build troubleshooting

This repository's Worker configuration lives at the repository root. The Git-connected deployment should use the expected branch/commit only for preview validation, with root directory set to the repository root (shown as `/`). Build command: `npm run build`; deploy command: `npm run worker:deploy` (or `npx wrangler deploy --config ./wrangler.jsonc`).

Before retrying a failed deployment, inspect the commit SHA in build metadata/log. The expected Worker branch head must contain both `wrangler.jsonc` and the `worker:deploy` npm script. If the build checks out the base/main commit instead, fix the selected commit/branch or repository integration. The error `ENOENT ... wrangler.jsonc` means Wrangler cannot see the config file in the checked-out workspace; changing relative to absolute paths does not fix a missing file.

The Cloudflare service is named `beelka`. Keep simulation flags and disabled quote/order writes unchanged until the dedicated database and identity adapter are ready.

## Automated production deployment through GitHub Actions

The repository includes `.github/workflows/deploy-cloudflare.yml`. Its validation job runs on main after clean install, TypeScript build, and Wrangler dry-run. Its production deploy job is additionally gated by the GitHub Environment variable `BEELKA_PRODUCTION_RELEASE_APPROVED=true` in environment `production`. This deliberate guard prevents a merge from accidentally deploying the incomplete database/authentication scaffold to production.

Before enabling that variable, complete the release gates above and confirm these environment secrets exist in GitHub `production`:
- `CLOUDFLARE_API_TOKEN`: scoped to the intended account with Workers Scripts edit/deploy permissions.
- `CLOUDFLARE_ACCOUNT_ID`: the intended Cloudflare account ID.

Never put tokens in source code, Wrangler vars, or logs. Keep Cloudflare's separate Git-connected deploy clearly designated or disabled to avoid duplicate deployments. The deployment workflow checks the exact triggering SHA. Since the dedicated Beelka database and Worker identity adapter are not ready, keep the production approval variable unset, simulation flags enabled, and quote/order writes disabled.
