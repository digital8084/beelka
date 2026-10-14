# Google Identity Platform — staging smoke test

This is a temporary, browser-based verification harness for the already-integrated server adapter. It is not the customer website and must not be published as a public sign-in page.

## What it verifies

1. The browser can sign in with Google through the Firebase/Identity Platform Web SDK.
2. The signed-in user can obtain an ID token from the provider SDK.
3. Beelka's API accepts that token at `GET /api/v1/auth/me` and returns `200 {"authenticated":true,...}`.
4. The browser origin is admitted by the API's exact CORS allowlist.

The page never prints the ID token, puts it in a URL, or writes it to local storage. Firebase Auth persistence is explicitly set to in-memory. The tool needs only the web app's public Firebase configuration; never enter service-account credentials or private keys.

## Prerequisites in Google Cloud / Identity Platform

1. Choose a **non-production** Google Cloud project for staging and enable Identity Platform.
2. Enable Google as a sign-in provider. Complete Google's OAuth consent configuration and client ID setup as required by Identity Platform.
3. Register a web app in that project and obtain its web configuration: API key, auth domain, project ID, and app ID.
4. Add `localhost` and the intended staging host to Identity Platform/Firebase Authentication's authorized domains. In real staging, use HTTPS and the exact deployed origin.
5. Set up Application Default Credentials for the API runtime. Prefer workload identity/service identity on Google Cloud; never commit a service-account key file.

Official references:
- [Identity Platform: Sign in with Google](https://cloud.google.com/identity-platform/docs/web/google)
- [Firebase web SDK setup](https://firebase.google.com/docs/web/setup)
- [Verify ID tokens with the Admin SDK](https://firebase.google.com/docs/auth/admin/verify-id-tokens)

## Local procedure

1. Configure the API environment, leaving payment/MMBC features in simulation:

   ```dotenv
   GOOGLE_CLOUD_PROJECT=your-staging-project-id
   BEELKA_CORS_ORIGINS=http://localhost:4173
   BEELKA_DEMO_ORDERS_ENABLED=false
   ```

   Configure ADC in the same shell/runtime that launches the API. If using `gcloud`, run `gcloud auth application-default login`. Restart the API after changing environment settings.

2. Start the API on `http://localhost:8080` using the repository's normal development workflow.

3. In another terminal, from the repository root, serve the static smoke harness:

   ```bash
   python -m http.server 4173 --directory tools/identity-platform-smoke
   ```

4. Open `http://localhost:4173`. Enter the web app config from the Google project, keep API origin as `http://localhost:8080`, and select **Validasi konfigurasi**.
5. Select **Masuk dengan Google**, complete the popup, then select **Verifikasi ke API**.
6. Expected result: the API verification status says `LULUS`, with HTTP 200 and `authenticated: true`. Only the request ID is displayed; token and provider UID are not displayed.
7. Select **Keluar** and stop both local processes.

If the browser reports a CORS/network error, verify the page origin exactly matches `BEELKA_CORS_ORIGINS`, including scheme and port. Do not use a wildcard. The API responds to bearer-token preflight only for configured origins, GET/POST methods, and the explicitly permitted request headers.

## Failure interpretation

| Result | Interpretation / next check |
|---|---|
| `200`, `authenticated: true` | Provider issued a token and the API verified it for the configured project. |
| `401 AUTHENTICATION_REQUIRED` | The token was absent, malformed, invalid, expired, revoked, or belongs to a disabled/deleted user; sign in again and inspect runtime project selection. |
| `503 AUTHENTICATION_NOT_CONFIGURED` | `GOOGLE_CLOUD_PROJECT` / `FIREBASE_PROJECT_ID` is missing from the API runtime. |
| `503 AUTHENTICATION_PROVIDER_UNAVAILABLE` | ADC/IAM, project mismatch, provider access, or network issue; inspect server-side operational diagnostics without logging credentials. |
| Browser CORS error / preflight 403 | Check the exact origin allowlist and allowed request headers. Browser CORS errors often hide the API response body. |
| Google popup rejects sign-in | Check the Google provider, OAuth client configuration, authorized domain, and web app project ID. |

## Release evidence still required

Keep the release gate closed until testing is done against the real staging project with:
- successful sign-in and valid API token verification;
- invalid/signature-altered, expired, revoked, disabled/deleted-user, wrong-project tokens;
- provider/ADC outage handling and CORS rejection from an unapproved origin;
- existing cross-customer quote/order ownership regression tests;
- review of account recovery, user-facing logout lifecycle, rate limiting, monitoring, privacy/retention and support procedures.

This harness only tests identity plumbing. It does not approve production use, implement the full customer UI, enable demo order creation in production, or turn on payments/MMBC mutations.
