ALTER TABLE idempotency_keys
  ADD COLUMN state TEXT NOT NULL DEFAULT 'IN_PROGRESS'
  CHECK (state IN ('IN_PROGRESS', 'COMPLETED'));

ALTER TABLE idempotency_keys
  ADD CONSTRAINT idempotency_completed_response_check
  CHECK (
    state <> 'COMPLETED'
    OR (response_status IS NOT NULL AND safe_response IS NOT NULL)
  );
