# Beelka — PostgreSQL Data Model

## Principles
- PostgreSQL is the internal source of truth for customer-visible order/payment state; supplier remains authority on external booking status.
- Use currency-aware integer minor units or exact numeric, never binary floating point.
- UUID/ULID internal IDs; external IDs separate.
- `timestamptz` UTC; minimize PII; tightly restrict passenger identity data.
- Append audit events; do not silently rewrite transaction history.

## Entities
`customers`, `quotes`, `orders`, `order_items`, `payments`, `payment_events`, `provider_attempts`, `provider_events`, `order_events`, `audit_events`, `outbox_messages`, optionally `provider_reference_snapshots`.

## Suggested fields
- `customers`: id, normalized email, optional phone, display name, auth subject, timestamps. Unique auth subject.
- `quotes`: id, service_type, provider, request_hash, source_reference, quoted amount/currency, price breakdown, terms snapshot, simulation flag, quoted_at, expires_at, customer id. Expired quote cannot create order. Supplier session/rate keys must be server-side, short-lived and never logged.
- `orders`: id, public order number, customer, service_type, status, currency, subtotal/fee/discount/total minor values, version, timestamps. Unique public order number; concurrency-safe transitions.
- `order_items`: id, order id, quote id, provider/product code, description snapshot, quantity/amounts, supplier reference, terms snapshot.
- `payments`: id, order id, gateway, gateway payment id, idempotency key, status, amount/currency, expiry, paid_at and timestamps. Unique gateway payment ID where non-null; amount/currency immutable after create. Never store PAN/CVV.
- `payment_events`: payment id, gateway event id, type, signature result, times, redacted payload. Unique gateway + event ID.
- `provider_attempts`: order id, provider, operation, attempt number, idempotency key, request hash, status, provider reference, start/end, error code, safe redacted response. Unique provider+operation+key.
- `order_events`: order id, sequence number, from/to status, actor/reason/correlation, safe metadata, timestamp. Unique order+sequence; append-only for application role.
- `audit_events`: actor, timestamp, action, entity, correlation ID and redacted metadata; append-only access.
- `outbox_messages`: aggregate, event type, payload, available time, attempts, lock/processed times, safe error code.

## Invariants
- Amounts nonnegative except explicit signed refund/ledger entries.
- One documented server-side total formula.
- Order and payment currencies match.
- Succeeded payment cannot silently regress to failed.
- Issued state requires supplier evidence appropriate to that product.
- Same idempotency key and payload returns same logical result; changed payload yields HTTP 409.
- Financial records have restrictive delete policies; use retention/anonymization rules rather than destructive history deletion.
- Sensitive data is not copied into audit JSON by default.

## Migrations
Sequential immutable migrations (e.g. `0001_core.sql`, `0002_payments.sql`). Never edit a shared-environment migration; add forward migration. CI runs migrations against ephemeral PostgreSQL. Test backup/restore before production. Run migrations as a controlled deployment job, not concurrently at app startup.