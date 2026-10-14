import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

export interface DatabaseProbe {
  query(sql: string): Promise<unknown>;
}

function json(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  res.end(JSON.stringify(body));
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  database: DatabaseProbe | undefined
): Promise<void> {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;

  if (req.method === "GET" && path === "/healthz") {
    json(res, 200, {
      status: "ok",
      service: "beelka-api",
      checks: { process: "ok" }
    });
    return;
  }

  if (req.method === "GET" && path === "/readyz") {
    if (!database) {
      json(res, 503, {
        status: "not_ready",
        checks: { postgres: "not_configured" }
      });
      return;
    }

    try {
      await database.query("SELECT 1");
      json(res, 200, {
        status: "ready",
        checks: { postgres: "ok" }
      });
    } catch {
      json(res, 503, {
        status: "not_ready",
        checks: { postgres: "unavailable" }
      });
    }
    return;
  }

  if (req.method === "GET" && path === "/api/v1/meta/services") {
    json(res, 200, {
      mode: "SIMULATED",
      liveTransactionsEnabled: false,
      services: [
        { id: "flight", label: "Pesawat", provider: "MMBC", state: "SIMULATED" },
        { id: "hotel", label: "Hotel", provider: "MMBC", state: "SIMULATED" },
        { id: "rail", label: "Kereta Api", provider: "MMBC", state: "SIMULATED" },
        { id: "ppob", label: "PPOB", provider: "MMBC", state: "SIMULATED" }
      ]
    });
    return;
  }

  if (req.method === "POST" && path === "/api/v1/orders") {
    json(res, 503, {
      error: {
        code: "LIVE_TRANSACTIONS_DISABLED",
        message: "Pembuatan pesanan dinonaktifkan sampai fondasi dan integrasi penyedia diverifikasi."
      }
    });
    return;
  }

  json(res, 404, { error: { code: "NOT_FOUND", message: "Route tidak ditemukan." } });
}

export function createAppServer(database?: DatabaseProbe): Server {
  return createServer((req, res) => {
    void handleRequest(req, res, database).catch(() => {
      if (!res.headersSent) {
        json(res, 500, { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan internal." } });
      } else {
        res.destroy();
      }
    });
  });
}
