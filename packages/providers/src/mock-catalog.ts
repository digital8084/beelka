export type ServiceType = "flight" | "hotel" | "rail" | "ppob";

export class MockInputError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "MockInputError";
  }
}

export interface MockOrderSpec {
  serviceType: ServiceType;
  productId: string;
  productName: string;
  amountMinor: number;
  currency: "IDR";
  selection: Record<string, string | number>;
  terms: Record<string, unknown>;
}

const productIds: Record<Exclude<ServiceType, "ppob">, string> = {
  flight: "flight-demo-001",
  hotel: "hotel-demo-001",
  rail: "rail-demo-001"
};

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new MockInputError(400, "INVALID_BODY", "Body harus berupa objek JSON.");
  }
  return value as Record<string, unknown>;
}

function textField(
  input: Record<string, unknown>,
  key: string,
  options: { min?: number; max?: number; pattern?: RegExp } = {}
): string {
  const value = input[key];
  const min = options.min ?? 1;
  const max = options.max ?? 120;
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) {
    throw new MockInputError(400, "INVALID_FIELD", "Field " + key + " tidak valid.");
  }
  const normalized = value.trim();
  if (options.pattern && !options.pattern.test(normalized)) {
    throw new MockInputError(400, "INVALID_FIELD", "Format field " + key + " tidak valid.");
  }
  return normalized;
}

function integerField(
  input: Record<string, unknown>,
  key: string,
  defaultValue: number,
  min: number,
  max: number
): number {
  const value = input[key] === undefined ? defaultValue : input[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new MockInputError(400, "INVALID_FIELD", "Field " + key + " harus bilangan bulat " + min + "-" + max + ".");
  }
  return value;
}

function isoDate(input: Record<string, unknown>, key: string): string {
  const value = textField(input, key, { min: 10, max: 10, pattern: /^\d{4}-\d{2}-\d{2}$/ });
  const parsed = new Date(value + "T00:00:00.000Z");
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new MockInputError(400, "INVALID_DATE", "Field " + key + " harus tanggal ISO yang valid (YYYY-MM-DD).");
  }
  return value;
}

function routeCode(input: Record<string, unknown>, key: string): string {
  return textField(input, key, { min: 3, max: 8, pattern: /^[A-Za-z0-9-]+$/ }).toUpperCase();
}

function normalizeFlightSelection(value: unknown): Record<string, string | number> {
  const input = record(value);
  const origin = routeCode(input, "origin");
  const destination = routeCode(input, "destination");
  if (origin === destination) {
    throw new MockInputError(400, "INVALID_ROUTE", "Asal dan tujuan tidak boleh sama.");
  }
  const departureDate = isoDate(input, "departureDate");
  const adults = integerField(input, "adults", 1, 1, 9);
  const children = integerField(input, "children", 0, 0, 8);
  const infants = integerField(input, "infants", 0, 0, 8);
  if (infants > adults) {
    throw new MockInputError(400, "INVALID_PASSENGERS", "Jumlah bayi tidak boleh melebihi jumlah dewasa pada fixture ini.");
  }
  return { origin, destination, departureDate, adults, children, infants };
}

function normalizeHotelSelection(value: unknown): Record<string, string | number> {
  const input = record(value);
  const city = textField(input, "city", { min: 2, max: 80 });
  const checkIn = isoDate(input, "checkIn");
  const checkOut = isoDate(input, "checkOut");
  if (checkOut <= checkIn) {
    throw new MockInputError(400, "INVALID_STAY", "Tanggal check-out harus sesudah check-in.");
  }
  const rooms = integerField(input, "rooms", 1, 1, 8);
  const guests = integerField(input, "guests", 1, 1, 16);
  const nights = Math.round((Date.parse(checkOut + "T00:00:00Z") - Date.parse(checkIn + "T00:00:00Z")) / 86400000);
  if (nights < 1 || nights > 365) {
    throw new MockInputError(400, "INVALID_STAY", "Durasi menginap fixture harus 1-365 malam.");
  }
  return { city, checkIn, checkOut, rooms, guests, nights };
}

function normalizeRailSelection(value: unknown): Record<string, string | number> {
  const input = record(value);
  const origin = routeCode(input, "origin");
  const destination = routeCode(input, "destination");
  if (origin === destination) {
    throw new MockInputError(400, "INVALID_ROUTE", "Stasiun asal dan tujuan tidak boleh sama.");
  }
  const travelDate = isoDate(input, "travelDate");
  const adults = integerField(input, "adults", 1, 1, 9);
  const infants = integerField(input, "infants", 0, 0, 8);
  return { origin, destination, travelDate, adults, infants };
}

export function searchMockFlights(value: unknown): Record<string, unknown> {
  const selection = normalizeFlightSelection(value);
  const passengerTotal = Number(selection.adults) + Number(selection.children) + Number(selection.infants);
  const priceMinor =
    Number(selection.adults) * 750000 +
    Number(selection.children) * 500000 +
    Number(selection.infants) * 150000;

  return {
    mode: "mock",
    provider: "beelka-fixture",
    bookable: false,
    query: selection,
    results: [{
      productId: productIds.flight,
      name: "Penerbangan Contoh Beelka (FIKTIF)",
      carrier: "BEELKA DEMO",
      flightNumber: "DEMO-001",
      origin: selection.origin,
      destination: selection.destination,
      departureDate: selection.departureDate,
      departureTime: "08:00",
      arrivalTime: "09:30",
      passengerCount: passengerTotal,
      priceMinor,
      currency: "IDR",
      bookable: false
    }]
  };
}

export function searchMockHotels(value: unknown): Record<string, unknown> {
  const selection = normalizeHotelSelection(value);
  const priceMinor = 450000 * Number(selection.nights) * Number(selection.rooms);

  return {
    mode: "mock",
    provider: "beelka-fixture",
    bookable: false,
    query: selection,
    results: [{
      productId: productIds.hotel,
      name: "Hotel Contoh Beelka (FIKTIF)",
      city: selection.city,
      checkIn: selection.checkIn,
      checkOut: selection.checkOut,
      nights: selection.nights,
      rooms: selection.rooms,
      guests: selection.guests,
      roomName: "Kamar simulasi",
      cancellationPolicy: "Ketentuan contoh saja; bukan penawaran hotel nyata.",
      priceMinor,
      currency: "IDR",
      bookable: false
    }]
  };
}

export function searchMockTrains(value: unknown): Record<string, unknown> {
  const selection = normalizeRailSelection(value);
  const priceMinor = Number(selection.adults) * 225000;

  return {
    mode: "mock",
    provider: "beelka-fixture",
    bookable: false,
    query: selection,
    results: [{
      productId: productIds.rail,
      name: "Kereta Contoh Beelka (FIKTIF)",
      trainCode: "DEMO-TRN-01",
      origin: selection.origin,
      destination: selection.destination,
      travelDate: selection.travelDate,
      departureTime: "09:00",
      arrivalTime: "12:00",
      passengerCount: Number(selection.adults) + Number(selection.infants),
      className: "Simulasi",
      priceMinor,
      currency: "IDR",
      bookable: false
    }]
  };
}

export function listMockPpobProducts(): Record<string, unknown> {
  return {
    mode: "mock",
    provider: "beelka-fixture",
    products: [{
      productId: "ppob-electricity-demo",
      category: "Listrik prabayar",
      name: "Token listrik contoh (FIKTIF)",
      nominalMinor: 100000,
      adminFeeMinor: 2500,
      totalAmountMinor: 102500,
      currency: "IDR",
      purchasable: false
    }, {
      productId: "ppob-mobile-data-demo",
      category: "Data seluler",
      name: "Paket data contoh (FIKTIF)",
      nominalMinor: 50000,
      adminFeeMinor: 2000,
      totalAmountMinor: 52000,
      currency: "IDR",
      purchasable: false
    }]
  };
}

export function resolveMockOrder(value: unknown): MockOrderSpec {
  const input = record(value);
  const serviceType = input.serviceType;
  if (serviceType !== "flight" && serviceType !== "hotel" && serviceType !== "rail" && serviceType !== "ppob") {
    throw new MockInputError(400, "INVALID_SERVICE_TYPE", "serviceType harus flight, hotel, rail, atau ppob.");
  }

  const productId = textField(input, "productId", { min: 3, max: 80 });
  const selectionInput = input.selection;

  if (serviceType === "flight") {
    if (productId !== productIds.flight) {
      throw new MockInputError(404, "MOCK_PRODUCT_NOT_FOUND", "Produk fixture tidak ditemukan untuk layanan tersebut.");
    }
    const selection = normalizeFlightSelection(selectionInput);
    const amountMinor =
      Number(selection.adults) * 750000 +
      Number(selection.children) * 500000 +
      Number(selection.infants) * 150000;
    return {
      serviceType,
      productId,
      productName: "Penerbangan Contoh Beelka (FIKTIF)",
      amountMinor,
      currency: "IDR",
      selection,
      terms: { mode: "mock", bookable: false, fareRules: "Contoh saja; bukan tiket atau penawaran nyata." }
    };
  }

  if (serviceType === "hotel") {
    if (productId !== productIds.hotel) {
      throw new MockInputError(404, "MOCK_PRODUCT_NOT_FOUND", "Produk fixture tidak ditemukan untuk layanan tersebut.");
    }
    const selection = normalizeHotelSelection(selectionInput);
    return {
      serviceType,
      productId,
      productName: "Hotel Contoh Beelka (FIKTIF)",
      amountMinor: 450000 * Number(selection.nights) * Number(selection.rooms),
      currency: "IDR",
      selection,
      terms: { mode: "mock", bookable: false, cancellationPolicy: "Ketentuan contoh saja; bukan penawaran nyata." }
    };
  }

  if (serviceType === "rail") {
    if (productId !== productIds.rail) {
      throw new MockInputError(404, "MOCK_PRODUCT_NOT_FOUND", "Produk fixture tidak ditemukan untuk layanan tersebut.");
    }
    const selection = normalizeRailSelection(selectionInput);
    return {
      serviceType,
      productId,
      productName: "Kereta Contoh Beelka (FIKTIF)",
      amountMinor: Number(selection.adults) * 225000,
      currency: "IDR",
      selection,
      terms: { mode: "mock", bookable: false, ticketRules: "Contoh saja; bukan tiket atau jadwal nyata." }
    };
  }

  const nominal = productId === "ppob-electricity-demo" ? 100000 : productId === "ppob-mobile-data-demo" ? 50000 : null;
  const adminFeeMinor = productId === "ppob-electricity-demo" ? 2500 : productId === "ppob-mobile-data-demo" ? 2000 : null;
  if (nominal === null || adminFeeMinor === null) {
    throw new MockInputError(404, "MOCK_PRODUCT_NOT_FOUND", "Produk PPOB fixture tidak ditemukan.");
  }
  const ppobInput = record(selectionInput);
  const selectedNominal = integerField(ppobInput, "nominal", nominal, nominal, nominal);
  const selection = { nominal: selectedNominal };
  return {
    serviceType,
    productId,
    productName: productId === "ppob-electricity-demo" ? "Token listrik contoh (FIKTIF)" : "Paket data contoh (FIKTIF)",
    amountMinor: nominal + adminFeeMinor,
    currency: "IDR",
    selection,
    terms: { mode: "mock", purchasable: false, adminFeeMinor }
  };
}

export const mockServiceModules = [
  { id: "flights", label: "Pesawat", adapter: "mmbc-flight", mode: "mock", liveEnabled: false },
  { id: "hotels", label: "Hotel", adapter: "mmbc-hotel", mode: "mock", liveEnabled: false },
  { id: "trains", label: "Kereta Api", adapter: "mmbc-rail", mode: "mock", liveEnabled: false },
  { id: "ppob", label: "PPOB", adapter: "mmbc-ppob", mode: "mock", liveEnabled: false },
  { id: "orders", label: "Pesanan demo", adapter: "postgres-mock-orders", mode: "mock", liveEnabled: false },
  { id: "payments", label: "Pembayaran", adapter: "disabled", mode: "disabled", liveEnabled: false },
  { id: "audit", label: "Audit", adapter: "postgres-audit", mode: "internal", liveEnabled: false }
] as const;
