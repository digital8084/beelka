import { createHash } from "node:crypto";

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalize);
  }

  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      output[key] = normalize(record[key]);
    }
    return output;
  }

  return value;
}

export function hashRequest(value: unknown): string {
  const serialized = JSON.stringify(normalize(value));
  if (serialized === undefined) {
    throw new TypeError("Request payload must be JSON-serializable");
  }
  return createHash("sha256").update(serialized, "utf8").digest("hex");
}

export function assertIdempotencyKey(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length < 8 ||
    value.length > 128 ||
    !/^[A-Za-z0-9._:-]+$/.test(value)
  ) {
    throw new TypeError("Idempotency-Key must be 8-128 safe ASCII characters");
  }
}
