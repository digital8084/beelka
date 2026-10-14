# Beelka — Definition of Done and Acceptance Criteria

## Every pull request

- Focused diff and clear intent; no unrelated provider/financial changes.
- Typecheck, lint, unit tests and targeted integration tests pass.
- New external request/response mapping has schema tests and safe failure behavior.
- No secrets, PII fixtures or unredacted supplier payload in source/logs.
- Migrations are forward-only and tested from an empty database.
- State transitions and audit events are covered by tests.
- README/docs and environment sample updated.

## Idempotency gate

- Repeating same mutation with same key and same payload creates one logical resource.
- Concurrent requests with same key do not create duplicates.
- Same key with changed normalized payload returns conflict.
- Expired key policy is documented.
- Unknown remote outcome goes to reconciliation and does not auto-repeat the provider mutation.

## Payment gate

- Bad/missing signature is rejected.
- Duplicate webhook event is recorded once logically.
- Amount/currency/order mismatch does not transition payment to success.
- Redirect callback alone does not prove payment.
- Out-of-order events cannot regress success into failure.
- Payment unknown timeout can be reconciled by provider status query.
- Payment and fulfillment are independent states.

## Supplier contract gate (per flight, hotel, rail and PPOB adapter)

- API access and HTTPS endpoint verified with provider.
- Required/optional fields, date formats, encoding, returned state and monetary semantics documented.
- Current endpoint behavior contract-tested with authorized test data.
- Rate/quote expiry and price change behavior tested.
- Known failure and timeout-after-acceptance cases tested or explicitly documented as unresolved.
- Provider response is retained safely with sensitive fields redacted.
- Status lookup and recovery behavior documented.
- Live enablement has owner approval, feature flag and kill switch.

## Database gate

- All foreign keys, uniqueness constraints and indexes required for order/payment invariants exist.
- Migrations run once with controlled deploy step.
- Transaction tests cover competing status transitions.
- Audit role cannot update/delete append-only records under normal application permissions.
- Backup and restore are demonstrated in staging.

## Web/UI gate

- E2E covers the happy path and key failures for each enabled service.
- All simulated results visibly marked.
- Loading/empty/provider unavailable/quote expired/payment pending/provider pending/unknown/reconciliation states usable.
- Customer authorization prevents cross-account order access.
- Responsive and accessibility tests run at agreed widths and keyboard flows.
- No placeholder buttons claim success or create live transactions.

## Cloud production gate

- HTTPS, secrets manager, restrictive IAM and separate environments configured.
- Health/readiness checks behave correctly when PostgreSQL/provider dependencies fail.
- Rate limits, alerting, log redaction and error reporting reviewed.
- Incident runbook, support owner, customer communication templates and disable/rollback plan ready.
- Provider/payment reconciliation reviewed for pilot transactions.
- Explicit business owner sign-off obtained.

## Evidence bundle

Attach per release: commit SHA, CI run URL, test summary, migration result, contract verification summary, staging smoke report, backup restore evidence, security scan result, reconciliation report and approvals. Do not include API secrets or customer personal data in evidence.
