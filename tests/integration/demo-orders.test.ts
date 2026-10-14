import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { Pool } from "pg";
import type { MockOrderRequest, MockOrderSpec } from "../../packages/domain/src/mock-orders.js";
import { createMockOrder, getMockOrder } from "../../packages/db/src/demo-orders.js";
import { hashRequest } from "../../packages/domain/src/idempotency.js";

const databaseUrl = process.env.DATABASE_URL;
const options = { skip: !databaseUrl ? "DATABASE_URL is not set; PostgreSQL integration test skipped" : false };

async function withIsolatedSchema<T>(run: (pool: Pool) => Promise<T>): Promise<T> {
  if (!databaseUrl) throw new Error("DATABASE_URL is required for this test");

  const adminPool = new Pool({ connectionString: databaseUrl });
  const schema = "beelka_mock_test_" + randomUUID().replace(/-/g, "");
  await adminPool.query('CREATE SCHEMA "' + schema + '"');
  const pool = new Pool({
    connectionString: databaseUrl,
    options: "-c search_path=" + schema
  });

  try {
    const client = await pool.connect();
    try {
      await client.query(`CREATE TABLE schema_migrations (
        version TEXT PRIMARY KEY,
        checksum CHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);

      const migrationDirectory = path.resolve(process.cwd(), "migrations");
      const migrations = (await readdir(migrationDirectory))
        .filter((name) => /^\d{4,}_[a-z0-9_]+\.sql$/.test(name))
        .sort();

      for (const name of migrations) {
        const sql = await readFile(path.join(migrationDirectory, name), "utf8");
        const checksum = createHash("sha256").update(sql, "utf8").digest("hex");
        await client.query("BEGIN");
        try {
          await client.query(sql);
          await client.query(
            "INSERT INTO schema_migrations(version, checksum) VALUES ($1, $2)",
            [name, checksum]
          );
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      }
    } finally {
      client.release();
    }

    return await run(pool);
  } finally {
    await pool.end();
    await adminPool.query('DROP SCHEMA "' + schema + '" CASCADE');
    await adminPool.end();
  }
}

function flightSpec(adults = 1): MockOrderSpec {
  return {
    serviceType: "flight",
    productId: "flight-demo-001",
    productName: "Penerbangan Contoh Beelka (FIKTIF)",
    amountMinor: adults * 750000,
    currency: "IDR",
    selection: { origin: "CGK", destination: "DPS", departureDate: "2026-12-01", adults, children: 0, infants: 0 },
    terms: { mode: "mock", bookable: false }
  };
}

function orderRequest(key: string, spec: MockOrderSpec, correlationId = randomUUID()): MockOrderRequest {
  return {
    idempotencyKey: key,
    requestHash: hashRequest({
      serviceType: spec.serviceType,
      productId: spec.productId,
      selection: spec.selection
    }),
    correlationId,
    spec
  };
}

test("mock order, snapshot, and audit trail persist without creating a payment", options, async () => {
  await withIsolatedSchema(async (pool) => {
    const input = orderRequest("mock-order-key-0001", flightSpec());
    const created = await createMockOrder(pool, input);
    assert.equal(created.kind, "created");
    if (created.kind !== "created") return;

    assert.equal(created.order.mode, "mock");
    assert.equal(created.order.bookable, false);
    assert.equal(created.order.purchasable, false);
    assert.equal(created.order.paymentState, "NOT_STARTED");
    assert.equal(created.order.fulfillmentState, "NOT_STARTED");
    assert.equal(created.order.totalMinor, "750000");

    const stored = await getMockOrder(pool, created.order.id);
    assert.deepEqual(stored, created.order);

    const paymentCount = await pool.query(
      "SELECT count(*)::int AS count FROM payments WHERE order_id = $1",
      [created.order.id]
    );
    const eventCount = await pool.query(
      "SELECT count(*)::int AS count FROM order_events WHERE order_id = $1",
      [created.order.id]
    );
    const auditCount = await pool.query(
      "SELECT count(*)::int AS count FROM audit_events WHERE entity_id = $1",
      [created.order.id]
    );
    assert.equal(paymentCount.rows[0]?.count, 0);
    assert.equal(eventCount.rows[0]?.count, 1);
    assert.equal(auditCount.rows[0]?.count, 1);
  });
});

test("same idempotency key and same request replays the same mock order", options, async () => {
  await withIsolatedSchema(async (pool) => {
    const input = orderRequest("mock-order-key-0002", flightSpec());
    const first = await createMockOrder(pool, input);
    const second = await createMockOrder(pool, input);
    assert.equal(first.kind, "created");
    assert.equal(second.kind, "replay");
    if (first.kind === "created" && second.kind === "replay") {
      assert.equal(second.order.id, first.order.id);
      assert.equal(second.order.publicOrderNumber, first.order.publicOrderNumber);
    }
    const count = await pool.query("SELECT count(*)::int AS count FROM orders");
    assert.equal(count.rows[0]?.count, 1);
  });
});

test("same idempotency key with a changed request returns conflict", options, async () => {
  await withIsolatedSchema(async (pool) => {
    const first = await createMockOrder(pool, orderRequest("mock-order-key-0003", flightSpec(1)));
    const second = await createMockOrder(pool, orderRequest("mock-order-key-0003", flightSpec(2)));
    assert.equal(first.kind, "created");
    assert.equal(second.kind, "conflict");
    const count = await pool.query("SELECT count(*)::int AS count FROM orders");
    assert.equal(count.rows[0]?.count, 1);
  });
});

test("concurrent requests using one idempotency key create one order only", options, async () => {
  await withIsolatedSchema(async (pool) => {
    const input = orderRequest("mock-order-key-0004", flightSpec());
    const results = await Promise.all([
      createMockOrder(pool, input),
      createMockOrder(pool, input)
    ]);
    assert.equal(results.filter((item) => item.kind === "created").length, 1);
    assert.equal(results.filter((item) => item.kind === "replay").length, 1);
    const count = await pool.query("SELECT count(*)::int AS count FROM orders");
    assert.equal(count.rows[0]?.count, 1);
    const keys = await pool.query(
      "SELECT count(*)::int AS count FROM idempotency_keys WHERE scope = 'mock-order:create:v1'"
    );
    assert.equal(keys.rows[0]?.count, 1);
  });
});
