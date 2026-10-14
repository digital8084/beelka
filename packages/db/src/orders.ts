import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
  InvalidStateTransitionError,
  transitionOrder,
  type OrderStatus
} from "../../domain/src/state-machines.js";

export class QuoteNotFoundError extends Error {
  constructor() {
    super("Quote not found");
    this.name = "QuoteNotFoundError";
  }
}

export class QuoteOwnershipError extends Error {
  constructor() {
    super("Quote does not belong to the customer");
    this.name = "QuoteOwnershipError";
  }
}

export class QuoteExpiredError extends Error {
  constructor() {
    super("Quote has expired");
    this.name = "QuoteExpiredError";
  }
}

export class OrderNotFoundError extends Error {
  constructor() {
    super("Order not found");
    this.name = "OrderNotFoundError";
  }
}

export class OrderVersionConflictError extends Error {
  constructor() {
    super("Order version changed; reload before retrying the operation");
    this.name = "OrderVersionConflictError";
  }
}

export interface CreateOrderFromQuoteInput {
  id: string;
  publicOrderNumber: string;
  customerId: string;
  quoteId: string;
  feesMinor: number;
  discountMinor: number;
  correlationId: string;
}

export interface CreatedOrder {
  id: string;
  publicOrderNumber: string;
  status: "QUOTED";
  serviceType: "flight" | "hotel" | "rail" | "ppob";
  currency: string;
  subtotalMinor: string;
  feesMinor: string;
  discountMinor: string;
  totalMinor: string;
  version: number;
  simulated: boolean;
}

export interface TransitionOrderInput {
  orderId: string;
  toStatus: OrderStatus;
  expectedVersion?: number;
  actorType: "customer" | "system" | "support" | "admin" | "provider";
  actorId?: string;
  reasonCode: string;
  correlationId: string;
}

export interface TransitionedOrder {
  id: string;
  fromStatus: OrderStatus;
  status: OrderStatus;
  version: number;
}

interface QuoteRow {
  customer_id: string | null;
  service_type: "flight" | "hotel" | "rail" | "ppob";
  provider: string;
  source_reference: string | null;
  request_hash: string;
  quoted_amount_minor: string;
  currency: string;
  terms_snapshot: unknown;
  expires_at: Date | string;
  is_simulated: boolean;
}

interface LockedOrderRow {
  id: string;
  public_order_number: string;
  status: OrderStatus;
  version: number;
}

async function withTransaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    try {
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original transaction error.
      }
      throw error;
    }
  } finally {
    client.release();
  }
}

function assertMoneyAmount(value: number, field: string): bigint {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(field + " must be a non-negative safe integer in minor units");
  }
  return BigInt(value);
}

export async function createOrderFromQuote(
  pool: Pool,
  input: CreateOrderFromQuoteInput
): Promise<CreatedOrder> {
  if (!input.correlationId || input.correlationId.length > 200) {
    throw new TypeError("correlationId must be 1-200 characters");
  }
  if (!input.publicOrderNumber || input.publicOrderNumber.length > 80) {
    throw new TypeError("publicOrderNumber must be 1-80 characters");
  }

  const fees = assertMoneyAmount(input.feesMinor, "feesMinor");
  const discount = assertMoneyAmount(input.discountMinor, "discountMinor");

  return withTransaction(pool, async (client) => {
    const quoteResult = await client.query<QuoteRow>(
      `SELECT customer_id, service_type, provider, source_reference,
              request_hash, quoted_amount_minor, currency, terms_snapshot,
              expires_at, is_simulated
         FROM quotes
        WHERE id = $1
        FOR UPDATE`,
      [input.quoteId]
    );
    const quote = quoteResult.rows[0];

    if (!quote) {
      throw new QuoteNotFoundError();
    }
    if (quote.customer_id !== input.customerId) {
      throw new QuoteOwnershipError();
    }
    if (new Date(quote.expires_at).getTime() <= Date.now()) {
      throw new QuoteExpiredError();
    }

    const subtotal = BigInt(quote.quoted_amount_minor);
    const total = subtotal + fees - discount;
    if (total < 0n) {
      throw new TypeError("discountMinor cannot exceed subtotal plus fees");
    }

    const orderResult = await client.query<{ version: number }>(
      `INSERT INTO orders
        (id, public_order_number, customer_id, quote_id, service_type, status,
         currency, subtotal_minor, fees_minor, discount_minor, total_minor, version)
       VALUES ($1, $2, $3, $4, $5, 'QUOTED', $6, $7, $8, $9, $10, 1)
       RETURNING version`,
      [
        input.id,
        input.publicOrderNumber,
        input.customerId,
        input.quoteId,
        quote.service_type,
        quote.currency,
        subtotal.toString(),
        fees.toString(),
        discount.toString(),
        total.toString()
      ]
    );

    const description = quote.source_reference
      ? quote.service_type + ": " + quote.source_reference
      : quote.service_type + " quote";

    await client.query(
      `INSERT INTO order_items
        (id, order_id, quote_id, provider, product_code, description_snapshot,
         quantity, unit_amount_minor, total_amount_minor, terms_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $7, $8::jsonb)`,
      [
        randomUUID(),
        input.id,
        input.quoteId,
        quote.provider,
        quote.source_reference,
        description,
        subtotal.toString(),
        JSON.stringify(quote.terms_snapshot ?? {})
      ]
    );

    await client.query(
      `INSERT INTO order_events
        (id, order_id, sequence_number, from_status, to_status, actor_type,
         actor_id, reason_code, correlation_id, metadata_redacted)
       VALUES ($1, $2, 1, NULL, 'QUOTED', 'customer', $3,
               'ORDER_CREATED', $4, $5::jsonb)`,
      [
        randomUUID(),
        input.id,
        input.customerId,
        input.correlationId,
        JSON.stringify({
          service_type: quote.service_type,
          quote_id: input.quoteId,
          simulated: quote.is_simulated
        })
      ]
    );

    await client.query(
      `INSERT INTO audit_events
        (id, actor_type, actor_id, action, entity_type, entity_id,
         correlation_id, metadata_redacted)
       VALUES ($1, 'customer', $2, 'ORDER_CREATED', 'order', $3, $4, $5::jsonb)`,
      [
        randomUUID(),
        input.customerId,
        input.id,
        input.correlationId,
        JSON.stringify({
          service_type: quote.service_type,
          currency: quote.currency,
          subtotal_minor: subtotal.toString(),
          fees_minor: fees.toString(),
          discount_minor: discount.toString(),
          total_minor: total.toString(),
          simulated: quote.is_simulated
        })
      ]
    );

    return {
      id: input.id,
      publicOrderNumber: input.publicOrderNumber,
      status: "QUOTED",
      serviceType: quote.service_type,
      currency: quote.currency,
      subtotalMinor: subtotal.toString(),
      feesMinor: fees.toString(),
      discountMinor: discount.toString(),
      totalMinor: total.toString(),
      version: orderResult.rows[0]?.version ?? 1,
      simulated: quote.is_simulated
    };
  });
}

export async function transitionOrderWithAudit(
  pool: Pool,
  input: TransitionOrderInput
): Promise<TransitionedOrder> {
  if (!input.correlationId || input.correlationId.length > 200) {
    throw new TypeError("correlationId must be 1-200 characters");
  }
  if (!input.reasonCode || input.reasonCode.length > 120) {
    throw new TypeError("reasonCode must be 1-120 characters");
  }

  return withTransaction(pool, async (client) => {
    const selected = await client.query<LockedOrderRow>(
      `SELECT id, public_order_number, status, version
         FROM orders
        WHERE id = $1
        FOR UPDATE`,
      [input.orderId]
    );
    const order = selected.rows[0];
    if (!order) {
      throw new OrderNotFoundError();
    }

    if (input.expectedVersion !== undefined && order.version !== input.expectedVersion) {
      throw new OrderVersionConflictError();
    }

    const fromStatus = order.status;
    const toStatus = transitionOrder(fromStatus, input.toStatus);
    const nextVersion = order.version + 1;
    const sequenceResult = await client.query<{ next_sequence: string }>(
      "SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next_sequence FROM order_events WHERE order_id = $1",
      [input.orderId]
    );
    const sequence = sequenceResult.rows[0]?.next_sequence;
    if (!sequence) {
      throw new Error("Could not allocate order event sequence");
    }

    await client.query(
      "UPDATE orders SET status = $2, version = $3, updated_at = now() WHERE id = $1",
      [input.orderId, toStatus, nextVersion]
    );

    await client.query(
      `INSERT INTO order_events
        (id, order_id, sequence_number, from_status, to_status, actor_type,
         actor_id, reason_code, correlation_id, metadata_redacted)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [
        randomUUID(),
        input.orderId,
        sequence,
        fromStatus,
        toStatus,
        input.actorType,
        input.actorId ?? null,
        input.reasonCode,
        input.correlationId,
        JSON.stringify({ previous_version: order.version, next_version: nextVersion })
      ]
    );

    await client.query(
      `INSERT INTO audit_events
        (id, actor_type, actor_id, action, entity_type, entity_id,
         correlation_id, metadata_redacted)
       VALUES ($1, $2, $3, 'ORDER_STATUS_CHANGED', 'order', $4, $5, $6::jsonb)`,
      [
        randomUUID(),
        input.actorType,
        input.actorId ?? null,
        input.orderId,
        input.correlationId,
        JSON.stringify({
          from_status: fromStatus,
          to_status: toStatus,
          reason_code: input.reasonCode,
          previous_version: order.version,
          next_version: nextVersion
        })
      ]
    );

    return {
      id: order.id,
      fromStatus,
      status: toStatus,
      version: nextVersion
    };
  });
}

export { InvalidStateTransitionError };
