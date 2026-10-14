CREATE TABLE customers (
  id UUID PRIMARY KEY,
  auth_subject TEXT NOT NULL UNIQUE,
  email_normalized TEXT,
  phone_e164 TEXT,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE quotes (
  id UUID PRIMARY KEY,
  customer_id UUID REFERENCES customers(id) ON DELETE RESTRICT,
  service_type TEXT NOT NULL CHECK (service_type IN ('flight', 'hotel', 'rail', 'ppob')),
  provider TEXT NOT NULL,
  source_reference TEXT,
  request_hash CHAR(64) NOT NULL,
  quoted_amount_minor BIGINT NOT NULL CHECK (quoted_amount_minor >= 0),
  currency CHAR(3) NOT NULL,
  price_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  terms_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_simulated BOOLEAN NOT NULL DEFAULT TRUE,
  quoted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  CHECK (expires_at > quoted_at)
);

CREATE INDEX quotes_customer_expiry_idx ON quotes(customer_id, expires_at DESC);
CREATE INDEX quotes_service_time_idx ON quotes(service_type, quoted_at DESC);

CREATE TABLE orders (
  id UUID PRIMARY KEY,
  public_order_number TEXT NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  quote_id UUID REFERENCES quotes(id) ON DELETE RESTRICT,
  service_type TEXT NOT NULL CHECK (service_type IN ('flight', 'hotel', 'rail', 'ppob')),
  status TEXT NOT NULL CHECK (status IN (
    'DRAFT', 'QUOTED', 'AWAITING_PAYMENT', 'PROCESSING',
    'COMPLETED', 'FAILED', 'CANCELLED', 'RECONCILIATION_REQUIRED'
  )),
  currency CHAR(3) NOT NULL,
  subtotal_minor BIGINT NOT NULL CHECK (subtotal_minor >= 0),
  fees_minor BIGINT NOT NULL DEFAULT 0 CHECK (fees_minor >= 0),
  discount_minor BIGINT NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  total_minor BIGINT NOT NULL CHECK (total_minor >= 0),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX orders_customer_created_idx ON orders(customer_id, created_at DESC);
CREATE INDEX orders_status_created_idx ON orders(status, created_at ASC);

CREATE TABLE payments (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  gateway TEXT NOT NULL,
  gateway_payment_id TEXT,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'CREATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED',
    'REFUND_PENDING', 'REFUNDED', 'UNKNOWN'
  )),
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
  currency CHAR(3) NOT NULL,
  expires_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (gateway, idempotency_key),
  CHECK (gateway_payment_id IS NULL OR length(gateway_payment_id) > 0)
);

CREATE UNIQUE INDEX payments_gateway_id_unique
  ON payments(gateway, gateway_payment_id)
  WHERE gateway_payment_id IS NOT NULL;
CREATE INDEX payments_order_created_idx ON payments(order_id, created_at DESC);

CREATE TABLE provider_attempts (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL,
  operation TEXT NOT NULL,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  idempotency_key TEXT NOT NULL,
  request_hash CHAR(64) NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'CREATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'UNKNOWN', 'RECONCILIATION_REQUIRED'
  )),
  provider_reference TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  error_code TEXT,
  safe_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (provider, operation, idempotency_key),
  UNIQUE (order_id, provider, operation, attempt_number)
);

CREATE INDEX provider_attempts_status_idx ON provider_attempts(status, started_at ASC);
CREATE INDEX provider_attempts_order_idx ON provider_attempts(order_id, started_at DESC);

CREATE TABLE idempotency_keys (
  id UUID PRIMARY KEY,
  scope TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash CHAR(64) NOT NULL,
  resource_type TEXT,
  resource_id UUID,
  response_status INTEGER,
  safe_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE (scope, idempotency_key),
  CHECK (expires_at > created_at)
);

CREATE INDEX idempotency_expiry_idx ON idempotency_keys(expires_at);

CREATE TABLE order_events (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  sequence_number BIGINT NOT NULL CHECK (sequence_number > 0),
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('customer', 'system', 'support', 'admin', 'provider')),
  actor_id TEXT,
  reason_code TEXT,
  correlation_id TEXT NOT NULL,
  metadata_redacted JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id, sequence_number)
);

CREATE INDEX order_events_timeline_idx ON order_events(order_id, sequence_number);

CREATE TABLE audit_events (
  id UUID PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  metadata_redacted JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX audit_events_entity_idx ON audit_events(entity_type, entity_id, occurred_at DESC);
CREATE INDEX audit_events_time_idx ON audit_events(occurred_at DESC);

CREATE TABLE outbox_messages (
  id UUID PRIMARY KEY,
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  locked_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  last_error_code TEXT
);

CREATE INDEX outbox_pending_idx ON outbox_messages(available_at, created_at)
  WHERE processed_at IS NULL;
