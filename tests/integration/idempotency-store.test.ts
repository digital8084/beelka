import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { claimIdempotency, completeIdempotency } from "../../packages/db/src/idempotency-store.js";
import { hashRequest } from "../../packages/domain/src/idempotency.js";

const databaseUrl = process.env.DATABASE_URL;
const options = { skip: !databaseUrl ? "DATABASE_URL is not set; PostgreSQL integration test skipped" : false };

async function withPool<T>(run: (pool: Pool, scope: string) => Promise<T>): Promise<T> {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for this test");
  }
  const pool = new Pool({ connectionString: databaseUrl });
  const scope = "test:" + randomUUID();
  try {
    return await run(pool, scope);
  } finally {
    await pool.query("DELETE FROM idempotency_keys WHERE scope = $1", [scope]);
    await pool.end();
  }
}

test("same idempotency key replays the completed response", options, async () => {
  await withPool(async (pool, scope) => {
    const input = { scope, key: "order-create-0001", requestHash: hashRequest({ service: "flight", amount: 10000 }) };
    assert.deepEqual(await claimIdempotency(pool, input), { kind: "claimed" });

    await completeIdempotency(pool, {
      ...input,
      statusCode: 201,
      safeResponse: { orderNumber: "BLK-TEST-1", status: "QUOTED" },
      resourceType: "order",
      resourceId: randomUUID()
    });

    const replay = await claimIdempotency(pool, input);
    assert.equal(replay.kind, "replay");
    if (replay.kind === "replay") {
      assert.equal(replay.statusCode, 201);
      assert.deepEqual(replay.body, { orderNumber: "BLK-TEST-1", status: "QUOTED" });
      assert.equal(replay.resourceType, "order");
    }
  });
});

test("reusing a key with a changed request hash conflicts", options, async () => {
  await withPool(async (pool, scope) => {
    const first = { scope, key: "order-create-0002", requestHash: hashRequest({ amount: 10000 }) };
    assert.deepEqual(await claimIdempotency(pool, first), { kind: "claimed" });

    const differentPayload = { ...first, requestHash: hashRequest({ amount: 20000 }) };
    assert.deepEqual(await claimIdempotency(pool, differentPayload), { kind: "conflict" });
  });
});

test("concurrent claims for the same scope and key cannot both claim", options, async () => {
  await withPool(async (pool, scope) => {
    const input = { scope, key: "order-create-0003", requestHash: hashRequest({ amount: 15000 }) };
    const results = await Promise.all([
      claimIdempotency(pool, input),
      claimIdempotency(pool, input)
    ]);
    assert.equal(results.filter((result) => result.kind === "claimed").length, 1);
    assert.equal(results.filter((result) => result.kind === "in_progress").length, 1);
  });
});
