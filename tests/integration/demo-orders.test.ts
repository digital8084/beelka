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
const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL?.trim() || databaseUrl;
const adminDatabaseUrl = process.env.CI_ADMIN_DATABASE_URL?.trim() || migrationDatabaseUrl;
const options = { skip: !databaseUrl ? "DATABASE_URL is not set; PostgreSQL integration test skipped" : false };
const runtimeRoleOptions = {
  skip: !databaseUrl || !process.env.CI_ADMIN_DATABASE_URL
    ? "Dedicated runtime-role privilege test is exercised in CI"
    : false
};

async function withIsolatedSchema<T>(run: (pool: Pool) => Promise<T>): Promise<T> {
  if (!databaseUrl || !migrationDatabaseUrl || !adminDatabaseUrl) {
    throw new Error("DATABASE_URL and migration/admin URLs are required for this test");
  }

  const adminPool = new Pool({ connectionString: adminDatabaseUrl });
  const schema = "beelka_mock_test_" + randomUUID().replace(/-/g, "");
  const migrationPool = new Pool({
    connectionString: migrationDatabaseUrl,
    options: "-c application_name=beelka_migration_test -c search_path=" + schema
  });
  const pool = new Pool({
    connectionString: databaseUrl,
    options: "-c application_name=beelka_runtime_test -c search_path=" + schema
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

test("runtime DB role cannot rewrite append-only events or the migration ledger", runtimeRoleOptions, async () => {
  await withIsolatedSchema(async (pool) => {
    const result = await pool.query<{
      current_user: string;
      is_superuser: boolean;
      table_owner: string;
      can_read_audit: boolean;
      can_insert_audit: boolean;
      can_update_audit: boolean;
      can_delete_audit: boolean;
      can_update_order_events: boolean;
      can_delete_order_events: boolean;
      can_read_migration_ledger: boolean;
    }>(
      `SELECT current_user,
              role.rolsuper AS is_superuser,
              pg_get_userbyid(event_table.relowner) AS table_owner,
              has_table_privilege(current_user, 'audit_events', 'SELECT') AS can_read_audit,
              has_table_privilege(current_user, 'audit_events', 'INSERT') AS can_insert_audit,
              has_table_privilege(current_user, 'audit_events', 'UPDATE') AS can_update_audit,
              has_table_privilege(current_user, 'audit_events', 'DELETE') AS can_delete_audit,
              has_table_privilege(current_user, 'order_events', 'UPDATE') AS can_update_order_events,
              has_table_privilege(current_user, 'order_events', 'DELETE') AS can_delete_order_events,
              has_table_privilege(current_user, 'schema_migrations', 'SELECT') AS can_read_migration_ledger
         FROM pg_roles AS role
         JOIN pg_class AS event_table ON event_table.oid = 'audit_events'::regclass
        WHERE role.rolname = current_user`
    );
    const privilege = result.rows[0];
    assert.ok(privilege);
    assert.equal(privilege.current_user, "beelka_runtime");
    assert.equal(privilege.is_superuser, false);
    assert.equal(privilege.table_owner, "beelka_migrator");
    assert.equal(privilege.can_read_audit, true);
    assert.equal(privilege.can_insert_audit, true);
    assert.equal(privilege.can_update_audit, false);
    assert.equal(privilege.can_delete_audit, false);
    assert.equal(privilege.can_update_order_events, false);
    assert.equal(privilege.can_delete_order_events, false);
    assert.equal(privilege.can_read_migration_ledger, false);

    await assert.rejects(
      pool.query("UPDATE audit_events SET action = 'MUTATED'"),
      (error: unknown) => error instanceof Error && (error as Error & { code?: string }).code === "42501"
    );
    await assert.rejects(
      pool.query("DELETE FROM order_events"),
      (error: unknown) => error instanceof Error && (error as Error & { code?: string }).code === "42501"
    );
    await assert.rejects(
      pool.query("SELECT * FROM schema_migrations"),
      (error: unknown) => error instanceof Error && (error as Error & { code?: string }).code === "42501"
    );
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
