-- Persist a capability-token hash for local mock quotes and make quote consumption explicit.
-- The raw token is returned once to the caller; only its SHA-256 digest is stored.
ALTER TABLE quotes
  ADD COLUMN access_token_hash CHAR(64),
  ADD COLUMN consumed_at TIMESTAMPTZ;

ALTER TABLE quotes
  ADD CONSTRAINT quotes_access_token_hash_format_check
  CHECK (access_token_hash IS NULL OR access_token_hash ~ '^[a-f0-9]{64}$');

ALTER TABLE quotes
  ADD CONSTRAINT quotes_consumed_after_quoted_check
  CHECK (consumed_at IS NULL OR consumed_at >= quoted_at);

CREATE INDEX quotes_access_token_lookup_idx
  ON quotes(id, access_token_hash)
  WHERE access_token_hash IS NOT NULL;

CREATE INDEX quotes_expiry_unconsumed_idx
  ON quotes(expires_at)
  WHERE consumed_at IS NULL;
