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

The current repository does not include Cloudflare credentials or a configured Cloudflare account binding in this change, so it cannot be deployed from GitHub alone yet.

## Runtime compatibility review

The existing API uses:
- `node:http` request/response APIs;
- `node:crypto`;
- `pg` for PostgreSQL;
- Firebase Admin SDK with Application Default Credentials for Google Identity Platform.

Cloudflare documents a Node HTTP server bridge via `cloudflare:node`, and PostgreSQL access via TCP sockets/Hyperdrive. The Worker entrypoint therefore reuses the existing HTTP router and `pg` package, but uses a bounded pool per isolate. Compatibility must be verified in Wrangler and staging, especially TLS, query behavior, database connection pressure, and request body handling.

Firebase Admin's Application Default Credentials flow is not wired into this Worker entrypoint yet. Authentication is deliberately absent/fail-closed; order creation remains disabled. Do not enable quote/order writes until a verified identity implementation is available and tested against a non-production Google Identity Platform project.

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

This repository's Worker configuration lives at the repository root. Configure the Cloudflare Git-connected build with:
- Production branch: `phase-1/cloudflare-workers-foundation` while validating this pull request;
- Root directory: repository root (shown as `/` in the dashboard);
- Build command: `npm run build`;
- Deploy command: `npm run worker:deploy` (or `npx wrangler deploy --config ./wrangler.jsonc`).

Before retrying a failed deployment, inspect the commit SHA in the build metadata/log. The expected Worker branch head must contain both `wrangler.jsonc` and the `worker:deploy` npm script. If the build runs the base/main commit instead, do not keep retrying Wrangler or changing the config path: fix the Git-connected deployment's selected commit/branch or repository integration first. The error `ENOENT ... wrangler.jsonc` means Wrangler cannot see the config file in the checked-out workspace; changing from relative to absolute paths does not fix a missing file.

The Cloudflare service is named `beelka`, so the Wrangler `name` is kept as `beelka` to avoid dashboard/config drift. Keep provider/payment simulation flags enabled while testing. Do not attach a database binding or enable write routes until the dedicated Beelka Supabase project and identity adapter are ready.

## Automated production deployment through GitHub Actions

The repository now includes `.github/workflows/deploy-cloudflare.yml`. It deploys only on pushes to `main` (or a manual dispatch targeting `main`), after a clean install, TypeScript build, and Wrangler dry-run. It does not deploy feature branches or pull requests to production.

Before this workflow can deploy, configure these repository/environment secrets in GitHub under the `production` environment:
- `CLOUDFLARE_API_TOKEN`: scoped to the intended account with Workers Scripts edit/deploy permissions (and any permissions required by the chosen deployment configuration).
- `CLOUDFLARE_ACCOUNT_ID`: the intended Cloudflare account ID.

Never put tokens in source code, Wrangler vars, or logs. The workflow intentionally fails early with a clear error if either secret is missing. It uses the exact commit SHA from the triggering push. Keep Cloudflare's separate Git-connected build/deploy command disabled or clearly designated as the single deployment path to avoid duplicate/conflicting deployments. Do not merge this PR until CI passes and the production environment secrets have been reviewed. Since the dedicated Beelka database and Worker identity adapter are not ready, the simulation flags and disabled quote/order writes must remain unchanged.
