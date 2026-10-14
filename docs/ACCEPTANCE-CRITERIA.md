# Beelka — Definition of Done and Acceptance Criteria

## Every pull request
- Focused diff; no unrelated provider/financial changes.
- Lint, typecheck, unit and relevant integration tests pass.
- API mappings have schema tests and safe failure paths.
- No secrets, PII fixtures or unredacted provider response in source/logs.
- Forward-only migrations tested from empty DB.
- State changes and audit events covered by tests.
- Docs and `.env.example` updated where necessary.

## Idempotency gate
- Same key/payload creates one logical resource.
- Concurrent same-key requests do not duplicate.
- Same key with changed normalized payload returns conflict.
- Key retention/expiry policy documented.
- Unknown remote outcome enters reconciliation without automatic mutation retry.

## Payment gate
- Missing/invalid signature rejected.
- Duplicate webhook is logically processed once.
- Amount/currency/order mismatch never marks success.
- Redirect alone is not proof.
- Out-of-order events cannot regress success to failure.
- Payment timeout is reconciled using status query where available.
- Payment and fulfillment are separate state machines.

## Provider gate per service
- Current API access and HTTPS endpoint verified.
- Fields, dates, encoding, status mapping and money semantics documented.
- Current behavior contract-tested with authorized data.
- Quote expiry/price changes tested.
- Known failure and timeout-after-acceptance tested or explicitly unresolved.
- Safe redaction applied to retained responses.
- Status/recovery documented.
- Explicit live approval, feature flag and kill switch.

## Database gate
- Required keys/constraints/indexes exist.
- Migration runner controlled and migrations tested.
- Competing status transitions tested.
- Normal application role cannot mutate append-only audit history.
- Backup restore demonstrated in staging.

## UI gate
- E2E covers happy path and important failures for each enabled service.
- Simulated content visibly labeled.
- Loading/empty/provider unavailable/quote expired/payment pending/provider unknown/reconciliation states usable.
- Cross-account order access blocked.
- Responsive and accessibility checks run.
- No placeholder control claims success or triggers a live transaction.

## Cloud production gate
- HTTPS, secret store, least-privilege IAM and environment separation.
- Readiness checks critical dependencies; liveness checks process.
- Rate limits, alerting, log redaction and error reporting reviewed.
- Incident runbook, support owner and rollback/disable plan ready.
- Payment/provider reconciliation reviewed and business owner signs off.

## Evidence bundle
Commit SHA, CI URL, test summary, migration result, contract verification, staging smoke, backup/restore proof, security scan, reconciliation report and approvals. Never attach secrets or customer PII.