import assert from "node:assert/strict";
import test from "node:test";
import {
  listMockPpobProducts,
  MockInputError,
  resolveMockOrder,
  searchMockFlights,
  searchMockHotels,
  searchMockTrains
} from "../../packages/providers/src/mock-catalog.js";

test("all mock search/catalog endpoints explicitly disable live booking or purchase", () => {
  const flight = searchMockFlights({ origin: "CGK", destination: "DPS", departureDate: "2026-12-01" });
  const hotel = searchMockHotels({ city: "Bandung", checkIn: "2026-12-01", checkOut: "2026-12-02" });
  const rail = searchMockTrains({ origin: "BDG", destination: "GMR", travelDate: "2026-12-01" });
  const ppob = listMockPpobProducts();

  assert.equal(flight.mode, "mock");
  assert.equal(hotel.mode, "mock");
  assert.equal(rail.mode, "mock");
  assert.equal(ppob.mode, "mock");
  assert.equal(flight.bookable, false);
  assert.equal(hotel.bookable, false);
  assert.equal(rail.bookable, false);
  const products = ppob.products as Array<{ purchasable: boolean }>;
  assert.ok(products.every((item) => item.purchasable === false));
});

test("flight mock total is server-computed from validated passengers", () => {
  const result = searchMockFlights({
    origin: "CGK", destination: "DPS", departureDate: "2026-12-01",
    adults: 2, children: 1, infants: 1
  });
  const results = result.results as Array<{ priceMinor: number; passengerCount: number }>;
  assert.equal(results[0]?.priceMinor, 2150000);
  assert.equal(results[0]?.passengerCount, 4);
});

test("hotel mock selection rejects checkout before check-in", () => {
  assert.throws(
    () => searchMockHotels({ city: "Bandung", checkIn: "2026-12-02", checkOut: "2026-12-01" }),
    (error: unknown) => error instanceof MockInputError && error.code === "INVALID_STAY"
  );
});

test("flight mock selection rejects malformed dates and identical routes", () => {
  assert.throws(
    () => searchMockFlights({ origin: "CGK", destination: "DPS", departureDate: "2026-02-30" }),
    (error: unknown) => error instanceof MockInputError && error.code === "INVALID_DATE"
  );
  assert.throws(
    () => searchMockFlights({ origin: "CGK", destination: "CGK", departureDate: "2026-12-01" }),
    (error: unknown) => error instanceof MockInputError && error.code === "INVALID_ROUTE"
  );
});

test("mock order pricing comes only from known fixture product IDs", () => {
  const order = resolveMockOrder({
    serviceType: "hotel",
    productId: "hotel-demo-001",
    selection: { city: "Bandung", checkIn: "2026-12-01", checkOut: "2026-12-04", rooms: 2, guests: 4 }
  });
  assert.equal(order.amountMinor, 2700000);
  assert.equal(order.terms.bookable, false);

  assert.throws(
    () => resolveMockOrder({ serviceType: "hotel", productId: "unknown-hotel", selection: {} }),
    (error: unknown) => error instanceof MockInputError && error.statusCode === 404
  );
});

test("PPOB mock order supports both known fixed denominations only", () => {
  const electricity = resolveMockOrder({
    serviceType: "ppob",
    productId: "ppob-electricity-demo",
    selection: { nominal: 100000 }
  });
  const data = resolveMockOrder({
    serviceType: "ppob",
    productId: "ppob-mobile-data-demo",
    selection: { nominal: 50000 }
  });
  assert.equal(electricity.amountMinor, 102500);
  assert.equal(data.amountMinor, 52000);
  assert.equal(electricity.terms.purchasable, false);
  assert.throws(
    () => resolveMockOrder({ serviceType: "ppob", productId: "ppob-electricity-demo", selection: { nominal: 50000 } }),
    (error: unknown) => error instanceof MockInputError && error.statusCode === 400
  );
});
