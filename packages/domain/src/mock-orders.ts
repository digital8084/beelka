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

export interface MockOrderResponse {
  id: string;
  publicOrderNumber: string;
  serviceType: ServiceType;
  productId: string;
  productName: string;
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
  | { kind: "expired" };

export interface MockOrderStore {
  create(input: MockOrderRequest): Promise<MockOrderDecision>;
  get(orderId: string): Promise<MockOrderResponse | null>;
}
