export type FlightSearchInput = {
  origin: string;
  destination: string;
  departureDate: string;
  adults: number;
  children?: number;
  infants?: number;
};

export type HotelSearchInput = {
  city: string;
  checkIn: string;
  checkOut: string;
  rooms: number;
  guests: number;
};

export type TrainSearchInput = {
  origin: string;
  destination: string;
  travelDate: string;
  adults: number;
  infants?: number;
};

export type MockSearchResponse = {
  mode: "mock";
  requestId: string;
  results: Array<Record<string, unknown> & { bookable: false }>;
};

export type MockPpobCatalogResponse = {
  mode: "mock";
  requestId: string;
  products: Array<Record<string, unknown> & { purchasable: false }>;
};

export class BeelkaApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "BeelkaApiError";
  }
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function requestJson<T>(
  baseUrl: string,
  path: string,
  init: RequestInit,
  fetcher: FetchLike,
): Promise<T> {
  const response = await fetcher(new URL(path, baseUrl), {
    ...init,
    headers: { accept: "application/json", ...init.headers },
    cache: "no-store",
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new BeelkaApiError("Respons server bukan JSON yang valid.", response.status, "INVALID_RESPONSE");
  }

  if (!response.ok) {
    const root = isRecord(payload) ? payload : {};
    const error = isRecord(root.error) ? root.error : {};
    throw new BeelkaApiError(
      typeof error.message === "string" ? error.message : "Permintaan ke Beelka API gagal.",
      response.status,
      typeof error.code === "string" ? error.code : "API_ERROR",
      typeof root.requestId === "string" ? root.requestId : undefined,
    );
  }

  if (!isRecord(payload) || payload.mode !== "mock" || typeof payload.requestId !== "string") {
    throw new BeelkaApiError("Kontrak respons Beelka tidak sesuai atau bukan mode simulasi.", response.status, "INVALID_SIMULATION_CONTRACT");
  }
  return payload as T;
}

export function createBeelkaApiClient(options: { baseUrl: string; fetcher?: FetchLike }) {
  const baseUrl = options.baseUrl.endsWith("/") ? options.baseUrl : options.baseUrl + "/";
  const fetcher = options.fetcher ?? fetch;

  async function search<T extends FlightSearchInput | HotelSearchInput | TrainSearchInput>(
    service: "flights" | "hotels" | "trains",
    input: T,
  ): Promise<MockSearchResponse> {
    const payload = await requestJson<MockSearchResponse>(
      baseUrl,
      `api/v1/${service}/search`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      },
      fetcher,
    );
    if (!Array.isArray(payload.results) || payload.results.some((item) => item.bookable !== false)) {
      throw new BeelkaApiError("Hasil pencarian tidak memenuhi kontrak simulasi non-bookable.", 502, "UNSAFE_RESULT_CONTRACT", payload.requestId);
    }
    return payload;
  }

  return {
    searchFlights: (input: FlightSearchInput) => search("flights", input),
    searchHotels: (input: HotelSearchInput) => search("hotels", input),
    searchTrains: (input: TrainSearchInput) => search("trains", input),
    async getPpobProducts(): Promise<MockPpobCatalogResponse> {
      const payload = await requestJson<MockPpobCatalogResponse>(
        baseUrl,
        "api/v1/ppob/products",
        { method: "GET" },
        fetcher,
      );
      if (!Array.isArray(payload.products) || payload.products.some((item) => item.purchasable !== false)) {
        throw new BeelkaApiError("Katalog PPOB tidak memenuhi kontrak simulasi non-purchasable.", 502, "UNSAFE_CATALOG_CONTRACT", payload.requestId);
      }
      return payload;
    },
  };
}
