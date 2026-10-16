import { Pool } from "pg";
import {
  createMockOrderFromQuote,
  createMockQuote,
  getMockOrder,
  getMockQuote
} from "../../../packages/db/src/demo-orders.js";
import { createAppServer } from "./server.js";
import { handleAsNodeRequest } from "cloudflare:node";

interface HyperdriveBinding {
  connectionString: string;
}

interface BeelkaWorkerEnv {
  /** Prefer a Cloudflare Hyperdrive binding; it pools database connections globally. */
  HYPERDRIVE?: HyperdriveBinding;
  /** Temporary fallback for a secret connection string while Hyperdrive is being provisioned. */
  DATABASE_URL?: string;
  BEELKA_CORS_ORIGINS?: string;
}

const NODE_HTTP_PORT = 8787;
let initialized = false;
let databasePool: Pool | undefined;

function exactOrigins(value: string | undefined): string[] {
  const origins = (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  for (const origin of origins) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error("BEELKA_CORS_ORIGINS must contain exact HTTP(S) origins");
    }
    if (
      !["https:", "http:"].includes(parsed.protocol) ||
      parsed.origin !== origin ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      origin.includes("*")
    ) {
      throw new Error("BEELKA_CORS_ORIGINS must contain exact origins without paths or wildcards");
    }
  }
  if (new Set(origins).size !== origins.length) {
    throw new Error("BEELKA_CORS_ORIGINS must not contain duplicates");
  }
  return origins;
}

function initialize(env: BeelkaWorkerEnv): void {
  if (initialized) return;

  const connectionString = env.HYPERDRIVE?.connectionString || env.DATABASE_URL;
  if (connectionString) {
    databasePool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: true },
      max: 2,
      idleTimeoutMillis: 5_000,
      connectionTimeoutMillis: 5_000
    });
  }

  const database = databasePool;
  const dependencies = {
    ...(database
      ? {
          database,
          mockOrderStore: {
            createQuote: (input: Parameters<typeof createMockQuote>[1]) => createMockQuote(database, input),
            getQuote: (id: string, accessTokenHash: string, customerSubject: string) =>
              getMockQuote(database, id, accessTokenHash, customerSubject),
            createFromQuote: (input: Parameters<typeof createMockOrderFromQuote>[1]) =>
              createMockOrderFromQuote(database, input),
            get: (id: string, customerSubject: string) => getMockOrder(database, id, customerSubject)
          }
        }
      : {}),
    // Orders remain disabled on the public Worker until a Workers-compatible,
    // verified customer identity adapter and staging UAT are implemented.
    demoOrdersEnabled: false,
    corsAllowedOrigins: exactOrigins(env.BEELKA_CORS_ORIGINS)
  };

  const server = createAppServer(dependencies);
  server.listen(NODE_HTTP_PORT);
  initialized = true;
}

export default {
  async fetch(request: Request, env: BeelkaWorkerEnv): Promise<Response> {
    try {
      initialize(env);
      return await handleAsNodeRequest(NODE_HTTP_PORT, request);
    } catch (error) {
      console.error(JSON.stringify({
        event: "worker_initialization_failed",
        errorType: error instanceof Error ? error.name : "UnknownError"
      }));
      return Response.json(
        { error: { code: "WORKER_NOT_READY", message: "Beelka Worker belum siap dikonfigurasi." } },
        { status: 503, headers: { "cache-control": "no-store" } }
      );
    }
  }
};
