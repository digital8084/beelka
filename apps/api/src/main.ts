import { Pool } from "pg";
import { createMockOrder, getMockOrder } from "../../../packages/db/src/demo-orders.js";
import { createAppServer } from "./server.js";
import { loadSettings } from "./settings.js";

const settings = loadSettings();
const pool = settings.databaseUrl
  ? new Pool(
      settings.databaseSsl
        ? { connectionString: settings.databaseUrl, ssl: { rejectUnauthorized: true } }
        : { connectionString: settings.databaseUrl }
    )
  : undefined;

const dependencies = {
  ...(pool
    ? {
        database: pool,
        mockOrderStore: {
          create: (input: Parameters<typeof createMockOrder>[1]) => createMockOrder(pool, input),
          get: (id: string) => getMockOrder(pool, id)
        }
      }
    : {}),
  demoOrdersEnabled: settings.demoOrdersEnabled
};

const server = createAppServer(dependencies);
server.listen(settings.port, "0.0.0.0", () => {
  process.stdout.write(
    JSON.stringify({
      event: "server_started",
      service: "beelka-api",
      port: settings.port,
      mode: settings.mode,
      databaseConfigured: Boolean(pool),
      demoOrdersEnabled: settings.demoOrdersEnabled,
      liveTransactionsEnabled: false
    }) + "\n"
  );
});

async function shutdown(signal: string): Promise<void> {
  process.stdout.write(JSON.stringify({ event: "server_shutdown", signal }) + "\n");
  server.close(async (error) => {
    if (pool) {
      await pool.end();
    }
    if (error) {
      process.stderr.write("HTTP server shutdown failed\n");
      process.exitCode = 1;
    }
  });
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
