# Secret Scanning and Incident Response

Beelka's GitHub Actions security workflow runs TruffleHog against commit changes on pull requests and pushes to `main`, and can scan the repository history via the scheduled/manual workflow. The action and scanner version are pinned in `.github/workflows/security.yml`.

## What the gate does

- Checks commit changes for credential-like content, with TruffleHog results set to `verified,unknown`.
- Fails the workflow if the scanner finds results within its configured result classes.
- Runs independently of CodeQL and npm dependency auditing.
- The scheduled/manual scan covers repository history; it is not a substitute for handling alerts from GitHub's native Secret Scanning features.

A green run means this scan found no blocking results within its current coverage and configuration. It does not prove that no credential has ever been exposed.

## If a finding appears

1. Do not copy the raw finding or credential into a public issue, PR comment, support ticket, or chat.
2. Identify the credential owner/provider without sharing the secret value.
3. Revoke or rotate the credential immediately; removing it from the current file is not sufficient.
4. Review provider audit logs and assess what the credential could access during the exposure window.
5. Remove the secret from source and replace it with environment configuration or a managed secret store.
6. Review Git history and forks/caches for exposure. History rewriting can be disruptive; coordinate it deliberately after rotating the credential.
7. Record the incident, affected systems, rotation time, impact assessment, and follow-up owner without storing the secret itself.
8. Re-run the scan and verify that the finding is handled according to the scanner's suppression policy. Do not broadly suppress rules to force CI green.

## False positives and exceptions

Use a narrowly scoped reviewed suppression only when a finding is demonstrably not a credential or is a documented test fixture. Prefer replacing realistic-looking strings with clearly synthetic values. Every suppression should identify the reviewer, reason, expiry/review date, and exact file/rule or fingerprint. Never use suppressions as a substitute for rotating a potentially exposed secret.

## Additional repository settings

The repository owner should review GitHub **Settings → Security and analysis** and confirm native Secret Scanning / Push Protection availability and status. Automated TruffleHog CI is a separate defense-in-depth control; this workflow does not change repository settings or enable native push protection.

## Scope and operational ownership

Before production launch, assign an owner and alert-response SLA for security workflow failures. Keep the GitHub Actions token read-only unless a specific workflow requires broader access. Do not place provider credentials, payment gateway keys, production database credentials, passenger data, or full webhook payloads in repository files or test fixtures.
