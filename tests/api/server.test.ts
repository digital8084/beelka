import assert from "node:assert/strict";
import test from "node:test";
import type { Server } from "node:http";
import { createAppServer, type AppDependencies, type DatabaseProbe } from "../../apps/api/src/server.js";
import type { MockOrderResponse, MockOrderStore } from "../../packages/domain/src/mock-orders.js";

async function withServer<T>(
  callback: (baseUrl: string) => Promise<T>,
  dependencies: AppDependencies = {}
): Promise<T> {
  const server: Server = createAppServer(dependencies);
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

const orderFixture: MockOrderResponse = {
  id: "20d87366-5307-4d23-9fd4-4e2a8d1ca415",
  publicOrderNumber: "BLK-DEMO-TEST0001",
  serviceType: "flight",
  productId: "flight-demo-001",
  productName: "Penerbangan Contoh Beelka (FIKTIF)",
  status: "QUOTED",
  currency: "IDR",
  subtotalMinor: "750000",
  feesMinor: "0",
  discountMinor: "0",
  totalMinor: "750000",
  version: 1,
  mode: "mock",
  bookable: false,
  purchasable: false,
  paymentState: "NOT_STARTED",
  fulfillmentState: "NOT_STARTED",
  selection: { origin: "CGK", destination: "DPS", departureDate: "2026-12-01", adults: 1, children: 0, infants: 0 },
  terms: { mode: "mock" },
  createdAt: "2026-10-14T00:00:00.000Z"
};

function mockDatabase(): DatabaseProbe {
  return { query: async () => ({ rows: [{ "?column?": 1 }] }) };
}

function mockOrderStore(): MockOrderStore {
  return {
    create: async () => ({ kind: "created", statusCode: 201, order: orderFixture }),
    get: async (id) => id === orderFixture.id ? orderFixture : null
  };
}

test("health endpoint reports process liveness", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/healthz");
    const body = await response.json() as { status: string; service: string; mode: string };
    assert.equal(response.status, 200);
    assert.equal(body.status, "ok");
    assert.equal(body.service, "beelka-api");
    assert.equal(body.mode, "mock");
    assert.ok(response.headers.get("x-request-id"));
  });
});

test("readiness fails closed without a database", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/readyz");
    const body = await response.json() as { error: { code: string } };
    assert.equal(response.status, 503);
    assert.equal(body.error.code, "DATABASE_NOT_CONFIGURED");
  });
});

test("readiness probes the configured database", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/readyz");
    const body = await response.json() as { status: string };
    assert.equal(response.status, 200);
    assert.equal(body.status, "ready");
  }, { database: mockDatabase() });
});

test("API root exposes modules and marks all provider adapters mock-only", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/v1");
    const body = await response.json() as {
      mode: string;
      liveTransactionsEnabled: boolean;
      paymentGatewayMode: string;
      services: Array<{ id: string; mode: string; liveEnabled: boolean }>;
    };
    assert.equal(response.status, 200);
    assert.equal(body.mode, "mock");
    assert.equal(body.liveTransactionsEnabled, false);
    assert.equal(body.paymentGatewayMode, "disabled");
    assert.deepEqual(body.services.map((item) => item.id), [
      "flights", "hotels", "trains", "ppob", "orders", "payments", "audit"
    ]);
    assert.ok(body.services.filter((item) => ["flights", "hotels", "trains", "ppob"].includes(item.id))
      .every((item) => item.mode === "mock" && item.liveEnabled === false));
  });
});

test("flight search returns an explicitly non-bookable fixture", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/v1/flights/search", {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": "test-flight-0001" },
      body: JSON.stringify({
        origin: "cgk", destination: "dps", departureDate: "2026-12-01",
        adults: 2, children: 1, infants: 0
      })
    });
    const body = await response.json() as {
      mode: string;
      bookable: boolean;
      requestId: string;
      results: Array<{ productId: string; priceMinor: number; bookable: boolean }>;
    };
    assert.equal(response.status, 200);
    assert.equal(body.mode, "mock");
    assert.equal(body.bookable, false);
    assert.equal(body.requestId, "test-flight-0001");
    assert.equal(body.results[0]?.productId, "flight-demo-001");
    assert.equal(body.results[0]?.priceMinor, 2000000);
    assert.equal(body.results[0]?.bookable, false);
  });
});

test("hotel search returns a simulated stay total", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/v1/hotels/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ city: "Bandung", checkIn: "2026-12-01", checkOut: "2026-12-03", rooms: 2, guests: 3 })
    });
    const body = await response.json() as {
      mode: string;
      results: Array<{ priceMinor: number; bookable: boolean; nights: number }>;
    };
    assert.equal(response.status, 200);
    assert.equal(body.mode, "mock");
    assert.equal(body.results[0]?.nights, 2);
    assert.equal(body.results[0]?.priceMinor, 1800000);
    assert.equal(body.results[0]?.bookable, false);
  });
});

test("train search rejects identical routes", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/v1/trains/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ origin: "BDG", destination: "BDG", travelDate: "2026-12-01" })
    });
    const body = await response.json() as { error: { code: string } };
    assert.equal(response.status, 400);
    assert.equal(body.error.code, "INVALID_ROUTE");
  });
});

test("PPOB catalog items are never marked purchasable", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/v1/ppob/products");
    const body = await response.json() as {
      mode: string;
      products: Array<{ productId: string; purchasable: boolean }>;
    };
    assert.equal(response.status, 200);
    assert.equal(body.mode, "mock");
    assert.ok(body.products.length >= 2);
    assert.ok(body.products.every((item) => item.purchasable === false));
  });
});

test("order creation stays disabled by default", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/v1/orders", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "demo-order-test-1" },
      body: JSON.stringify({ serviceType: "flight", productId: "flight-demo-001", selection: {} })
    });
    const body = await response.json() as { error: { code: string } };
    assert.equal(response.status, 503);
    assert.equal(body.error.code, "DEMO_ORDERS_DISABLED");
  });
});

test("order creation requires idempotency even in mock mode", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/v1/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ serviceType: "flight", productId: "flight-demo-001", selection: {} })
    });
    const body = await response.json() as { error: { code: string } };
    assert.equal(response.status, 400);
    assert.equal(body.error.code, "IDEMPOTENCY_KEY_REQUIRED");
  }, {
    database: mockDatabase(),
    mockOrderStore: mockOrderStore(),
    demoOrdersEnabled: true
  });
});

test("order creation emits only a mock and non-bookable order", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/v1/orders", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "demo-order-test-2" },
      body: JSON.stringify({
        serviceType: "flight", productId: "flight-demo-001",
        selection: { origin: "CGK", destination: "DPS", departureDate: "2026-12-01" }
      })
    });
    const body = await response.json() as MockOrderResponse;
    assert.equal(response.status, 201);
    assert.equal(body.mode, "mock");
    assert.equal(body.bookable, false);
    assert.equal(body.purchasable, false);
    assert.equal(body.paymentState, "NOT_STARTED");
  }, {
    database: mockDatabase(),
    mockOrderStore: mockOrderStore(),
    demoOrdersEnabled: true
  });
});

test("demo order lookup returns only the requested mock order", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/v1/orders/" + orderFixture.id);
    const body = await response.json() as MockOrderResponse;
    assert.equal(response.status, 200);
    assert.equal(body.id, orderFixture.id);
    assert.equal(body.mode, "mock");
    assert.equal(body.bookable, false);
  }, {
    database: mockDatabase(),
    mockOrderStore: mockOrderStore(),
    demoOrdersEnabled: true
  });
});

test("admin audit route is hidden before authorization exists", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl + "/api/v1/admin/audit-events");
    const body = await response.json() as { error: { code: string } };
    assert.equal(response.status, 404);
    assert.equal(body.error.code, "NOT_FOUND");
  });
});
