import test from "node:test";
import assert from "node:assert/strict";
import { BeelkaApiError, createBeelkaApiClient } from "../apps/web-client/src/api-client.js";

const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" },
});

test("flight search calls the documented mock endpoint and rejects bookable results", async () => {
  let requestedUrl = "";
  let requestedBody = "";
  const client = createBeelkaApiClient({
    baseUrl: "https://api.example.test/",
    fetcher: async (input, init) => {
      requestedUrl = String(input);
      requestedBody = String(init?.body);
      return ok({
        mode: "mock",
        requestId: "request-12345678",
        results: [{ productId: "flight-demo-001", bookable: false }],
      });
    },
  });

  const result = await client.searchFlights({
    origin: "CGK", destination: "DPS", departureDate: "2026-12-01", adults: 1,
  });
  assert.equal(requestedUrl, "https://api.example.test/api/v1/flights/search");
  assert.deepEqual(JSON.parse(requestedBody), {
    origin: "CGK", destination: "DPS", departureDate: "2026-12-01", adults: 1,
  });
  assert.equal(result.results[0]?.bookable, false);
});

test("train client uses the API's travelDate field", async () => {
  let body = "";
  const client = createBeelkaApiClient({
    baseUrl: "https://api.example.test",
    fetcher: async (_input, init) => {
      body = String(init?.body);
      return ok({ mode: "mock", requestId: "request-12345678", results: [{ bookable: false }] });
    },
  });
  await client.searchTrains({
    origin: "GMR", destination: "YK", travelDate: "2026-12-01", adults: 1,
  });
  assert.deepEqual(JSON.parse(body), {
    origin: "GMR", destination: "YK", travelDate: "2026-12-01", adults: 1,
  });
});

test("API error preserves safe code and correlation identifier", async () => {
  const client = createBeelkaApiClient({
    baseUrl: "https://api.example.test",
    fetcher: async () => ok({
      error: { code: "INVALID_FIELD", message: "Field tidak valid." },
      requestId: "request-12345678",
    }, 400),
  });
  await assert.rejects(
    () => client.searchFlights({
      origin: "CGK", destination: "DPS", departureDate: "2026-12-01", adults: 1,
    }),
    (error: unknown) => error instanceof BeelkaApiError
      && error.status === 400
      && error.code === "INVALID_FIELD"
      && error.requestId === "request-12345678",
  );
});

test("client rejects non-mock or bookable results", async () => {
  const liveModeClient = createBeelkaApiClient({
    baseUrl: "https://api.example.test",
    fetcher: async () => ok({ mode: "live", requestId: "request-12345678", results: [] }),
  });
  await assert.rejects(
    () => liveModeClient.searchFlights({
      origin: "CGK", destination: "DPS", departureDate: "2026-12-01", adults: 1,
    }),
    (error: unknown) => error instanceof BeelkaApiError && error.code === "INVALID_SIMULATION_CONTRACT",
  );

  const bookableClient = createBeelkaApiClient({
    baseUrl: "https://api.example.test",
    fetcher: async () => ok({
      mode: "mock", requestId: "request-12345678", results: [{ bookable: true }],
    }),
  });
  await assert.rejects(
    () => bookableClient.searchFlights({
      origin: "CGK", destination: "DPS", departureDate: "2026-12-01", adults: 1,
    }),
    (error: unknown) => error instanceof BeelkaApiError && error.code === "UNSAFE_RESULT_CONTRACT",
  );
});

test("PPOB catalog rejects purchasable products", async () => {
  const client = createBeelkaApiClient({
    baseUrl: "https://api.example.test",
    fetcher: async () => ok({
      mode: "mock", requestId: "request-12345678",
      products: [{ productId: "demo", purchasable: true }],
    }),
  });
  await assert.rejects(
    () => client.getPpobProducts(),
    (error: unknown) => error instanceof BeelkaApiError && error.code === "UNSAFE_CATALOG_CONTRACT",
  );
});


test("client rejects malformed result entries without throwing a raw TypeError", async () => {
  for (const malformed of [null, "not-an-object", 42]) {
    const client = createBeelkaApiClient({
      baseUrl: "https://api.example.test",
      fetcher: async () => ok({
        mode: "mock", requestId: "request-12345678", results: [malformed],
      }),
    });
    await assert.rejects(
      () => client.searchFlights({
        origin: "CGK", destination: "DPS", departureDate: "2026-12-01", adults: 1,
      }),
      (error: unknown) => error instanceof BeelkaApiError
        && error.status === 502
        && error.code === "UNSAFE_RESULT_CONTRACT",
    );
  }
});

test("client rejects malformed PPOB entries and empty request identifiers", async () => {
  const malformedCatalog = createBeelkaApiClient({
    baseUrl: "https://api.example.test",
    fetcher: async () => ok({
      mode: "mock", requestId: "request-12345678", products: [null],
    }),
  });
  await assert.rejects(
    () => malformedCatalog.getPpobProducts(),
    (error: unknown) => error instanceof BeelkaApiError
      && error.code === "UNSAFE_CATALOG_CONTRACT",
  );

  const missingCorrelation = createBeelkaApiClient({
    baseUrl: "https://api.example.test",
    fetcher: async () => ok({ mode: "mock", requestId: "  ", results: [] }),
  });
  await assert.rejects(
    () => missingCorrelation.searchFlights({
      origin: "CGK", destination: "DPS", departureDate: "2026-12-01", adults: 1,
    }),
    (error: unknown) => error instanceof BeelkaApiError
      && error.code === "INVALID_SIMULATION_CONTRACT",
  );
});
