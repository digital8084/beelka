import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { Pool } from "pg";
import {
  createOrderFromQuote,
  InvalidStateTransitionError,
  OrderVersionConflictError,
  transitionOrderWithAudit
} from "../../packages/db/src/orders.js";

const databaseUrl = process.env.DATABASE_URL;
const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL?.trim() || databaseUrl;
const adminDatabaseUrl = process.env.CI_ADMIN_DATABASE_URL?.trim() || migrationDatabaseUrl;
const options = { skip: !databaseUrl ? "DATABASE_URL is not set; PostgreSQL integration test skipped" : false };

async function withIsolatedPool<T>(run: (pool: Pool) => Promise<T>): Promise<T> {
  if (!databaseUrl || !migrationDatabaseUrl || !adminDatabaseUrl) {
    throw new Error("DATABASE_URL and migration/admin URLs are required for this test");
  }

  const adminPool = new Pool({ connectionString: adminDatabaseUrl });
  const migrationPool = new Pool({ connectionString: migrationDatabaseUrl });
  const schema = "beelka_test_" + randomUUID().replace(/-/g, "");
  const pool = new Pool({
    connectionString: databaseUrl,
    options: "-c search_path=" + schema
  });
  let schemaCreated = false;

  try {
    const roles = await adminPool.query<{ migrator: string | null; runtime: string | null }>(
      "SELECT to_regrole('beelka_migrator') AS migrator, to_regrole('beelka_runtime') AS runtime"
    );
    const hasSeparatedRoles = Boolean(roles.rows[0]?.migrator && roles.rows[0]?.runtime);

    if (hasSeparatedRoles) {
      await adminPool.query('CREATE SCHEMA "' + schema + '" AUTHORIZATION beelka_migrator');
      await adminPool.query('GRANT USAGE ON SCHEMA "' + schema + '" TO beelka_runtime');
      await adminPool.query(
        'ALTER DEFAULT PRIVILEGES FOR ROLE beelka_migrator IN SCHEMA "' + schema +
        '" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO beelka_runtime'
      );
    } else {
      await adminPool.query('CREATE SCHEMA "' + schema + '"');
    }
    schemaCreated = true;

    const client = await migrationPool.connect();
    try {
      await client.query("SET search_path TO " + schema);
      await client.query(`CREATE TABLE schema_migrations (
        version TEXT PRIMARY KEY,
        checksum CHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);

      const migrationDirectory = path.resolve(process.cwd(), "migrations");
      const migrations = (await readdir(migrationDirectory))
        .filter((name) => /^\\d{4,}_[a-z0-9_]+\\.sql$/.test(name))
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
      const migrationProbe = await client.query<{ current_schema: string; has_customers: boolean }>(
        "SELECT current_schema() AS current_schema, to_regclass('customers') IS NOT NULL AS has_customers"
      );
      if (migrationProbe.rows[0]?.current_schema !== schema || migrationProbe.rows[0]?.has_customers !== true) {
        throw new Error("Migration role did not create the canonical schema tables: " + JSON.stringify(migrationProbe.rows[0]));
      }
    } finally {
      client.release();
    }

    const runtimeProbe = await pool.query<{ current_user: string; current_schema: string; search_path: string; has_customers: boolean }>(
      "SELECT current_user, current_schema() AS current_schema, current_setting('search_path') AS search_path, to_regclass('customers') IS NOT NULL AS has_customers"
    );
    if (runtimeProbe.rows[0]?.current_schema !== schema || runtimeProbe.rows[0]?.has_customers !== true) {
      throw new Error("Runtime role cannot resolve its isolated schema: " + JSON.stringify(runtimeProbe.rows[0]));
    }

    return await run(pool);
  } finally {
    await pool.end();
    await migrationPool.end();
    if (schemaCreated) {
      await adminPool.query('DROP SCHEMA "' + schema + '" CASCADE');
    }
    await adminPool.end();
  }
}

async function withOrderFixture<T>(
  run: (pool: Pool, values: { customerId: string; quoteId: string; orderId: string; correlationId: string }) => Promise<T>
): Promise<T> {
  return withIsolatedPool(async (pool) => {
    const values = {
      customerId: randomUUID(),
      quoteId: randomUUID(),
      orderId: randomUUID(),
      correlationId: randomUUID()
    };

    await pool.query(
      "INSERT INTO customers (id, auth_subject, email_normalized) VALUES ($1, $2, $3)",
      [values.customerId, "test:" + values.customerId, values.customerId + "@example.test"]
    );
    await pool.query(
      `INSERT INTO quotes
        (id, customer_id, service_type, provider, source_reference, request_hash,
         quoted_amount_minor, currency, price_breakdown, terms_snapshot, is_simulated,
         quoted_at, expires_at)
       VALUES ($1, $2, 'flight', 'mmbc-simulation', 'fixture-flight', $3,
               10000, 'IDR', '{"base":10000}'::jsonb, '{"cancellation":"sample"}'::jsonb,
               TRUE, now(), now() + interval '1 hour')`,
      [values.quoteId, values.customerId, "a".repeat(64)]
    );
    return run(pool, values);
  });
}

async function createFixtureOrder(
  pool: Pool,
  values: { customerId: string; quoteId: string; orderId: string; correlationId: string }
) {
  return createOrderFromQuote(pool, {
    id: values.orderId,
    publicOrderNumber: "BLK-TEST-" + values.orderId,
    customerId: values.customerId,
    quoteId: values.quoteId,
    feesMinor: 500,
    discountMinor: 200,
    correlationId: values.correlationId
  });
}

test("order creation snapshots quote pricing and writes order/audit events atomically", options, async () => {
  await withOrderFixture(async (pool, values) => {
    const order = await createFixtureOrder(pool, values);
    assert.equal(order.status, "QUOTED");
    assert.equal(order.subtotalMinor, "10000");
    assert.equal(order.feesMinor, "500");
    assert.equal(order.discountMinor, "200");
    assert.equal(order.totalMinor, "10300");
    assert.equal(order.simulated, true);

    const items = await pool.query("SELECT count(*)::int AS count FROM order_items WHERE order_id = $1", [values.orderId]);
    const events = await pool.query("SELECT count(*)::int AS count FROM order_events WHERE order_id = $1", [values.orderId]);
    const audits = await pool.query("SELECT count(*)::int AS count FROM audit_events WHERE entity_id = $1", [values.orderId]);
    assert.equal(items.rows[0]?.count, 1);
    assert.equal(events.rows[0]?.count, 1);
    assert.equal(audits.rows[0]?.count, 1);
  });
});

test("order transition writes status, ordered event and audit atomically", options, async () => {
  await withOrderFixture(async (pool, values) => {
    await createFixtureOrder(pool, values);
    const transitioned = await transitionOrderWithAudit(pool, {
      orderId: values.orderId,
      toStatus: "AWAITING_PAYMENT",
      expectedVersion: 1,
      actorType: "system",
      actorId: "test-worker",
      reasonCode: "PAYMENT_INTENT_READY",
      correlationId: values.correlationId
    });

    assert.equal(transitioned.fromStatus, "QUOTED");
    assert.equal(transitioned.status, "AWAITING_PAYMENT");
    assert.equal(transitioned.version, 2);

    const stored = await pool.query("SELECT status, version FROM orders WHERE id = $1", [values.orderId]);
    const events = await pool.query(
      "SELECT sequence_number, from_status, to_status FROM order_events WHERE order_id = $1 ORDER BY sequence_number",
      [values.orderId]
    );
    const audits = await pool.query("SELECT action FROM audit_events WHERE entity_id = $1 ORDER BY occurred_at", [values.orderId]);

    assert.equal(stored.rows[0]?.status, "AWAITING_PAYMENT");
    assert.equal(stored.rows[0]?.version, 2);
    assert.deepEqual(events.rows.map((row) => Number(row.sequence_number)), [1, 2]);
    assert.equal(events.rows[1]?.from_status, "QUOTED");
    assert.equal(events.rows[1]?.to_status, "AWAITING_PAYMENT");
    assert.equal(audits.rows.length, 2);
  });
});

test("invalid transition rolls back without adding audit history", options, async () => {
  await withOrderFixture(async (pool, values) => {
    await createFixtureOrder(pool, values);

    await assert.rejects(
      transitionOrderWithAudit(pool, {
        orderId: values.orderId,
        toStatus: "COMPLETED",
        expectedVersion: 1,
        actorType: "system",
        reasonCode: "INVALID_TEST_TRANSITION",
        correlationId: values.correlationId
      }),
      InvalidStateTransitionError
    );

    const stored = await pool.query("SELECT status, version FROM orders WHERE id = $1", [values.orderId]);
    const events = await pool.query("SELECT count(*)::int AS count FROM order_events WHERE order_id = $1", [values.orderId]);
    const audits = await pool.query("SELECT count(*)::int AS count FROM audit_events WHERE entity_id = $1", [values.orderId]);
    assert.equal(stored.rows[0]?.status, "QUOTED");
    assert.equal(stored.rows[0]?.version, 1);
    assert.equal(events.rows[0]?.count, 1);
    assert.equal(audits.rows[0]?.count, 1);
  });
});

test("concurrent transitions with the same expected version cannot both succeed", options, async () => {
  await withOrderFixture(async (pool, values) => {
    await createFixtureOrder(pool, values);

    const transition = () => transitionOrderWithAudit(pool, {
      orderId: values.orderId,
      toStatus: "AWAITING_PAYMENT",
      expectedVersion: 1,
      actorType: "system",
      reasonCode: "CONCURRENCY_TEST",
      correlationId: values.correlationId
    });

    const outcomes = await Promise.allSettled([transition(), transition()]);
    assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
    const rejected = outcomes.find((outcome) => outcome.status === "rejected");
    assert.ok(rejected && rejected.status === "rejected");
    assert.ok(rejected.reason instanceof OrderVersionConflictError);

    const stored = await pool.query("SELECT status, version FROM orders WHERE id = $1", [values.orderId]);
    const events = await pool.query("SELECT count(*)::int AS count FROM order_events WHERE order_id = $1", [values.orderId]);
    const audits = await pool.query("SELECT count(*)::int AS count FROM audit_events WHERE entity_id = $1", [values.orderId]);
    assert.equal(stored.rows[0]?.status, "AWAITING_PAYMENT");
    assert.equal(stored.rows[0]?.version, 2);
    assert.equal(events.rows[0]?.count, 2);
    assert.equal(audits.rows[0]?.count, 2);
  });
});

test("database constraint rejects a mismatched order total", options, async () => {
  await withOrderFixture(async (pool, values) => {
    await createFixtureOrder(pool, values);
    await assert.rejects(
      pool.query("UPDATE orders SET total_minor = total_minor + 1 WHERE id = $1", [values.orderId])
    );
  });
});

test("audit and order events reject updates and deletes", options, async () => {
  await withOrderFixture(async (pool, values) => {
    await createFixtureOrder(pool, values);
    await assert.rejects(
      pool.query("UPDATE audit_events SET action = 'TAMPERED' WHERE entity_id = $1", [values.orderId])
    );
    await assert.rejects(
      pool.query("DELETE FROM order_events WHERE order_id = $1", [values.orderId])
    );
  });
});
