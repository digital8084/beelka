import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { assertIdempotencyKey } from "../../domain/src/idempotency.js";

export interface IdempotencyInput {
  scope: string;
  key: string;
  requestHash: string;
  ttlSeconds?: number;
}

export type IdempotencyClaim =
  | { kind: "claimed" }
  | { kind: "replay"; statusCode: number; body: unknown; resourceType: string | null; resourceId: string | null }
  | { kind: "in_progress" }
  | { kind: "conflict" }
  | { kind: "expired" };

interface StoredIdempotencyRow {
  request_hash: string;
  state: "IN_PROGRESS" | "COMPLETED";
  response_status: number | null;
  safe_response: unknown;
  resource_type: string | null;
  resource_id: string | null;
  expires_at: Date | string;
}

function validateInput(input: IdempotencyInput): number {
  assertIdempotencyKey(input.key);
  if (!input.scope || input.scope.length > 200) {
    throw new TypeError("Idempotency scope must be 1-200 characters");
  }
  if (!/^[a-f0-9]{64}$/.test(input.requestHash)) {
    throw new TypeError("requestHash must be a lowercase SHA-256 hex digest");
  }
  const ttlSeconds = input.ttlSeconds ?? 86400;
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 2592000) {
    throw new TypeError("Idempotency TTL must be 60-2592000 seconds");
  }
  return ttlSeconds;
}

/**
 * Claim an idempotency key in PostgreSQL.
 * Call this before any externally chargeable mutation. A claimed record starts
 * IN_PROGRESS; callers must persist a final safe response using completeIdempotency.
 */
export async function claimIdempotency(
  pool: Pool,
  input: IdempotencyInput
): Promise<IdempotencyClaim> {
  const ttlSeconds = validateInput(input);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO idempotency_keys
        (id, scope, idempotency_key, request_hash, expires_at, state)
       VALUES ($1, $2, $3, $4, now() + ($5::int * interval '1 second'), 'IN_PROGRESS')
       ON CONFLICT (scope, idempotency_key) DO NOTHING
       RETURNING id`,
      [randomUUID(), input.scope, input.key, input.requestHash, ttlSeconds]
    );

    if (inserted.rowCount === 1) {
      await client.query("COMMIT");
      return { kind: "claimed" };
    }

    const existing = await client.query<StoredIdempotencyRow>(
      `SELECT request_hash, state, response_status, safe_response,
              resource_type, resource_id, expires_at
         FROM idempotency_keys
        WHERE scope = $1 AND idempotency_key = $2
        FOR UPDATE`,
      [input.scope, input.key]
    );

    const row = existing.rows[0];
    if (!row) {
      throw new Error("Idempotency record disappeared during conflict handling");
    }

    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await client.query("COMMIT");
      return { kind: "expired" };
    }

    if (row.request_hash !== input.requestHash) {
      await client.query("COMMIT");
      return { kind: "conflict" };
    }

    if (
      row.state === "COMPLETED" &&
      row.response_status !== null &&
      row.safe_response !== null
    ) {
      await client.query("COMMIT");
      return {
        kind: "replay",
        statusCode: row.response_status,
        body: row.safe_response,
        resourceType: row.resource_type,
        resourceId: row.resource_id
      };
    }

    await client.query("COMMIT");
    return { kind: "in_progress" };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Complete a claimed key with a response snapshot safe for replay.
 * Do not store credentials, payment secrets or unredacted passenger data here.
 */
export async function completeIdempotency(
  pool: Pool,
  input: Pick<IdempotencyInput, "scope" | "key" | "requestHash"> & {
    statusCode: number;
    safeResponse: unknown;
    resourceType?: string;
    resourceId?: string;
  }
): Promise<void> {
  assertIdempotencyKey(input.key);
  if (!input.scope || input.scope.length > 200) {
    throw new TypeError("Idempotency scope must be 1-200 characters");
  }
  if (!/^[a-f0-9]{64}$/.test(input.requestHash)) {
    throw new TypeError("requestHash must be a lowercase SHA-256 hex digest");
  }
  if (!Number.isInteger(input.statusCode) || input.statusCode < 100 || input.statusCode > 599) {
    throw new TypeError("statusCode must be an integer HTTP status");
  }

  const safeJson = JSON.stringify(input.safeResponse);
  if (safeJson === undefined) {
    throw new TypeError("safeResponse must be JSON-serializable");
  }

  const result = await pool.query(
    `UPDATE idempotency_keys
        SET state = 'COMPLETED',
            response_status = $4,
            safe_response = $5::jsonb,
            resource_type = $6,
            resource_id = $7
      WHERE scope = $1
        AND idempotency_key = $2
        AND request_hash = $3
        AND state = 'IN_PROGRESS'
        AND expires_at > now()`,
    [
      input.scope,
      input.key,
      input.requestHash,
      input.statusCode,
      safeJson,
      input.resourceType ?? null,
      input.resourceId ?? null
    ]
  );

  if (result.rowCount !== 1) {
    throw new Error("Idempotency claim cannot be completed: missing, expired, completed or hash mismatch");
  }
}
