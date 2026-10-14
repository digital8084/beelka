import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { loadSettings } from "../apps/api/src/settings.js";

const settings = loadSettings();
if (!settings.databaseUrl) {
  throw new Error("DATABASE_URL is required to run migrations");
}

const pool = new Pool(
  settings.databaseSsl
    ? { connectionString: settings.databaseUrl, ssl: { rejectUnauthorized: true } }
    : { connectionString: settings.databaseUrl }
);

function checksum(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

async function migrate(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        checksum CHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const directory = path.resolve(process.cwd(), "migrations");
    const names = (await readdir(directory))
      .filter((name) => /^\d{4,}_[a-z0-9_]+\.sql$/.test(name))
      .sort();

    if (names.length === 0) {
      throw new Error("No migration files found in " + directory);
    }

    for (const name of names) {
      const sql = await readFile(path.join(directory, name), "utf8");
      const digest = checksum(sql);
      const existing = await client.query<{ checksum: string }>(
        "SELECT checksum FROM schema_migrations WHERE version = $1",
        [name]
      );

      if (existing.rowCount) {
        if (existing.rows[0]?.checksum !== digest) {
          throw new Error("Applied migration checksum changed: " + name);
        }
        process.stdout.write("migration already applied: " + name + "\n");
        continue;
      }

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations(version, checksum) VALUES ($1, $2)",
          [name, digest]
        );
        await client.query("COMMIT");
        process.stdout.write("migration applied: " + name + "\n");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    client.release();
  }
}

try {
  await migrate();
} finally {
  await pool.end();
}
