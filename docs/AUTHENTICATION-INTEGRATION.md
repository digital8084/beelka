# Customer Authentication Integration Contract

## Current status

Beelka now wires Google Identity Platform/Firebase Authentication through the maintained Firebase Admin Node.js SDK. When `GOOGLE_CLOUD_PROJECT` or `FIREBASE_PROJECT_ID` is set, `apps/api/src/main.ts` injects the provider adapter. It uses `verifyIdToken(idToken, true)`, which validates the ID token and checks revocation/disabled-user state. Without a project ID, quote/order routes remain fail-closed with `503 AUTHENTICATION_NOT_CONFIGURED`.

The API accepts a client-issued Identity Platform ID token only in `Authorization: Bearer <ID_TOKEN>`. Beelka does not issue login tokens, accept identity from caller-supplied headers/body, or implement its own JWT verifier. Login/sign-up UX and Google provider enablement in the Identity Platform console remain client/project setup tasks.

## Adapter contract

The server accepts an `Authenticator` function injected by trusted application configuration:

- input: the incoming server request;
- output: either a principal with an opaque, verified `subject`, or `null` when there is no valid authenticated identity;
- exception: identity-provider/network/configuration errors must not be converted into a successful principal.

Only the adapter may produce a principal, after validating a real session or credential with the chosen provider. A request header such as `X-User-ID`, `X-Customer-ID`, email, phone, or body field is never an identity source. Reverse-proxy identity headers are also untrusted unless a deliberately isolated trusted-proxy contract is separately designed and enforced.

The subject must be a non-empty, bounded, printable string. It should be the provider's stable subject identifier (`sub`) rather than a display name or mutable email address. Beelka stores this subject in the internal `customers.auth_subject` mapping and does not need to copy provider profile attributes to create a quote.

## Provider verification requirements

Select an identity provider and use its maintained server-side SDK or documented middleware. Do not implement a custom JWT parser/signature verifier in this repository.

Before the adapter returns a principal, verify at minimum:

1. Signature using the provider's approved keys/algorithm, including key rotation and key identifier handling.
2. Exact issuer and the expected audience/client identifier.
3. Expiration and not-before claims, plus any provider-specific nonce/state/PKCE checks appropriate to the sign-in flow.
4. Session/token revocation and logout semantics to the level supported by the selected provider.
5. Allowed authentication method and assurance level for the route, if the product requires them.
6. Failure behavior: invalid/expired credentials resolve to unauthenticated; provider infrastructure failure remains an operational failure and never falls back to a caller-supplied subject.

If authentication is cookie-based, additionally define Secure, HttpOnly, SameSite, domain/path, expiry/rotation, CSRF protection for unsafe methods, and reverse-proxy TLS behavior. If bearer-token based, do not store tokens in local storage where a safer provider-supported session design is available; never log credentials.

## Configuration and client flow

1. Enable Identity Platform for the intended Google Cloud project and enable the Google sign-in provider in Identity Platform. Configure the client application's allowed domains and redirect settings in the provider console.
2. Set `GOOGLE_CLOUD_PROJECT` (or `FIREBASE_PROJECT_ID`) to that exact project ID in the API runtime. The project ID is not a secret.
3. Configure Google Application Default Credentials (ADC) for the API runtime with permission to verify/check Identity Platform users. On Google Cloud, prefer workload identity/service identity. For local development, use `gcloud auth application-default login` or an untracked service-account file referenced by `GOOGLE_APPLICATION_CREDENTIALS`; never commit a credential file or paste credentials into app config.
4. The client signs in using the Identity Platform/Firebase client SDK, obtains the ID token from its signed-in user, and sends it over HTTPS as `Authorization: Bearer <ID_TOKEN>` to protected API routes. ID tokens are short lived and should not be logged or persisted as ordinary application data.
5. Verify that `GET /api/v1` reports `customerAuthenticationConfigured: true` after configuration. This flag means the adapter is wired; it is not a health check for Google credentials or a proof of staging readiness.

There is no API-side endpoint for sign-in, sign-up, password reset, callback handling or token issuance in this iteration.

## How ownership is enforced

- `POST /api/v1/quotes` requires an authenticated principal and associates the quote with the internal customer row for that principal's subject.
- `GET /api/v1/quotes/:id` requires both the same owner subject and the quote's `X-Quote-Token` digest.
- `POST /api/v1/orders` requires both authenticated ownership and `X-Quote-Token`; quote locking, expiry, single-use consumption, order creation, audit trail and idempotency response occur in one DB transaction.
- `GET /api/v1/orders/:id` filters by the authenticated owner subject in PostgreSQL. UUID possession alone is not authorization.
- Idempotency scope contains a hash of the subject rather than the raw subject, so the same user key cannot collide with another user's order operation.
- Unauthorized quote/order reads return a non-disclosing not-found response when the requested resource is not owned by the principal.

Quote tokens are additional short-lived capability tokens, not a replacement for user authentication. They should stay in the client session, never in URLs or telemetry. The token digest is stored in PostgreSQL, not the raw token.

## Production release gate

Do not open customer routes or call this production authentication until all of these exist:

- Identity Platform project and Google sign-in provider enabled; authorized domains/redirect URLs restricted, and test + production projects/clients separated.
- Concrete Firebase Admin adapter wired in `main.ts`; API metadata reports authentication configured.
- Staging evidence using real project-issued tokens for valid sign-in, invalid signature, expired token, wrong project/audience, unknown principal, revoked token, disabled user and provider outage. Unit tests use a verifier double and do not substitute for this staging evidence.
- PostgreSQL integration evidence that another authenticated subject cannot read, confirm, or replay a quote/order.
- Logout/revocation and account recovery UX/security reviewed.
- Rate limit and abuse controls for sign-in and quote/order mutations.
- Secrets stored server-side; no client-provided subject overrides; structured logs redact tokens and session data.
- Customer privacy/retention policy, incident response, monitoring, and staging UAT approved.

Until the chosen provider is wired, a successful API/CI run proves the fail-closed boundary and repository ownership logic—not the existence of a working login service.
