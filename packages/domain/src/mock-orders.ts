export type ServiceType = "flight" | "hotel" | "rail" | "ppob";

export interface MockOrderSpec {
  serviceType: ServiceType;
  productId: string;
  productName: string;
  amountMinor: number;
  currency: "IDR";
  selection: Record<string, string | number>;
  terms: Record<string, unknown>;
}

export interface MockOrderRequest {
  idempotencyKey: string;
  requestHash: string;
  correlationId: string;
  spec: MockOrderSpec;
}

export type MockQuoteStatus = "ACTIVE" | "EXPIRED" | "CONSUMED";

export interface MockQuoteResponse {
  id: string;
  serviceType: ServiceType;
  productId: string;
  productName: string;
  status: MockQuoteStatus;
  currency: "IDR";
  subtotalMinor: string;
  feesMinor: "0";
  discountMinor: "0";
  totalMinor: string;
  mode: "mock";
  bookable: false;
  purchasable: false;
  selection: Record<string, string | number>;
  terms: Record<string, unknown>;
  quotedAt: string;
  expiresAt: string;
}

export interface MockQuoteRequest {
  customerSubject: string;
  requestHash: string;
  accessTokenHash: string;
  correlationId: string;
  spec: MockOrderSpec;
}

export interface MockOrderFromQuoteRequest {
  customerSubject: string;
  quoteId: string;
  accessTokenHash: string;
  idempotencyKey: string;
  requestHash: string;
  correlationId: string;
}

export interface MockOrderResponse {
  id: string;
  publicOrderNumber: string;
  serviceType: ServiceType;
  productId: string;
  productName: string;
  quoteId: string;
  status: "QUOTED";
  currency: "IDR";
  subtotalMinor: string;
  feesMinor: "0";
  discountMinor: "0";
  totalMinor: string;
  version: 1;
  mode: "mock";
  bookable: false;
  purchasable: false;
  paymentState: "NOT_STARTED";
  fulfillmentState: "NOT_STARTED";
  selection: Record<string, string | number>;
  terms: Record<string, unknown>;
  createdAt: string;
}

export type MockOrderDecision =
  | { kind: "created"; statusCode: 201; order: MockOrderResponse }
  | { kind: "replay"; statusCode: 201; order: MockOrderResponse }
  | { kind: "conflict" }
  | { kind: "in_progress" }
  | { kind: "expired" }
  | { kind: "quote_not_found" }
  | { kind: "quote_expired" }
  | { kind: "quote_consumed" };

export interface MockOrderStore {
  createQuote(input: MockQuoteRequest): Promise<MockQuoteResponse>;
  getQuote(quoteId: string, accessTokenHash: string, customerSubject: string): Promise<MockQuoteResponse | null>;
  createFromQuote(input: MockOrderFromQuoteRequest): Promise<MockOrderDecision>;
  get(orderId: string, customerSubject: string): Promise<MockOrderResponse | null>;
}
