export type OrderStatus =
  | "DRAFT"
  | "QUOTED"
  | "AWAITING_PAYMENT"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "RECONCILIATION_REQUIRED";

export type PaymentStatus =
  | "CREATED"
  | "PENDING"
  | "SUCCEEDED"
  | "FAILED"
  | "EXPIRED"
  | "REFUND_PENDING"
  | "REFUNDED"
  | "UNKNOWN";

const orderTransitions: Record<OrderStatus, readonly OrderStatus[]> = {
  DRAFT: ["QUOTED", "CANCELLED"],
  QUOTED: ["AWAITING_PAYMENT", "CANCELLED"],
  AWAITING_PAYMENT: ["PROCESSING", "CANCELLED", "RECONCILIATION_REQUIRED"],
  PROCESSING: ["COMPLETED", "FAILED", "RECONCILIATION_REQUIRED"],
  COMPLETED: [],
  FAILED: ["RECONCILIATION_REQUIRED"],
  CANCELLED: [],
  RECONCILIATION_REQUIRED: ["PROCESSING", "COMPLETED", "FAILED", "CANCELLED"]
};

const paymentTransitions: Record<PaymentStatus, readonly PaymentStatus[]> = {
  CREATED: ["PENDING", "SUCCEEDED", "FAILED", "EXPIRED", "UNKNOWN"],
  PENDING: ["SUCCEEDED", "FAILED", "EXPIRED", "UNKNOWN"],
  SUCCEEDED: ["REFUND_PENDING"],
  FAILED: [],
  EXPIRED: [],
  REFUND_PENDING: ["REFUNDED", "UNKNOWN"],
  REFUNDED: [],
  UNKNOWN: ["PENDING", "SUCCEEDED", "FAILED", "EXPIRED", "REFUND_PENDING", "REFUNDED"]
};

export class InvalidStateTransitionError extends Error {
  constructor(
    public readonly entity: "order" | "payment",
    public readonly from: string,
    public readonly to: string
  ) {
    super("Invalid " + entity + " state transition: " + from + " -> " + to);
    this.name = "InvalidStateTransitionError";
  }
}

export function transitionOrder(from: OrderStatus, to: OrderStatus): OrderStatus {
  if (!orderTransitions[from].includes(to)) {
    throw new InvalidStateTransitionError("order", from, to);
  }
  return to;
}

export function transitionPayment(from: PaymentStatus, to: PaymentStatus): PaymentStatus {
  if (!paymentTransitions[from].includes(to)) {
    throw new InvalidStateTransitionError("payment", from, to);
  }
  return to;
}
