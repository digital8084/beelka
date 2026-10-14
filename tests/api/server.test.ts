import assert from "node:assert/strict";
import test from "node:test";
import type { Server } from "node:http";
import { createAppServer, type DatabaseProbe } from "../../apps/api/src/server.js";

async function withServer<T>(
  callback: (baseUrl: string) => Promise<T>,
  database?: DatabaseProbe
): Promise<T> {
  const server: Server = createAppServer(database);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw new Error("Could not resolve test server address");
  }

  try {
    return await callback("http://127.0.0.1:" + address.port);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

test("health endpoint reports process liveness", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/healthz");
    const body = await response.json() as { status: string; service: string };
    assert.equal(response.status, 200);
    assert.equal(body.status, "ok");
    assert.equal(body.service, "beelka-api");
  });
});

test("service metadata explicitly identifies simulated services", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/v1/meta/services");
    const body = await response.json() as {
      mode: string;
      liveTransactionsEnabled: boolean;
      services: Array<{ id: string; state: string }>;
    };
    assert.equal(response.status, 200);
    assert.equal(body.mode, "SIMULATED");
    assert.equal(body.liveTransactionsEnabled, false);
    assert.deepEqual(body.services.map((service) => service.id), ["flight", "hotel", "rail", "ppob"]);
    assert.ok(body.services.every((service) => service.state === "SIMULATED"));
  });
});

test("order creation is blocked before live transaction gates pass", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/v1/orders", { method: "POST" });
    const body = await response.json() as { error: { code: string } };
    assert.equal(response.status, 503);
    assert.equal(body.error.code, "LIVE_TRANSACTIONS_DISABLED");
  });
});

test("readiness fails closed when database is not configured", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/readyz");
    assert.equal(response.status, 503);
  });
});

test("readiness checks configured database probe", async () => {
  const database: DatabaseProbe = { query: async () => ({ rows: [{ "?column?": 1 }] }) };
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/readyz");
    const body = await response.json() as { status: string };
    assert.equal(response.status, 200);
    assert.equal(body.status, "ready");
  }, database);
});

test("readiness returns not-ready when database probe fails", async () => {
  const database: DatabaseProbe = { query: async () => { throw new Error("db down"); } };
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/readyz");
    assert.equal(response.status, 503);
  }, database);
});
