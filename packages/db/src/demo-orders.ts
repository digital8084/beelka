import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type {
  MockOrderDecision,
  MockOrderFromQuoteRequest,
  MockOrderRequest,
  MockOrderResponse,
  MockQuoteRequest,
  MockQuoteResponse,
  MockQuoteStatus
} from "../../domain/src/mock-orders.js";

interface StoredIdempotencyRow {
  request_hash: string;
  state: "IN_PROGRESS" | "COMPLETED";
  response_status: number | null;
  safe_response: unknown;
  expires_at: Date | string;
}

interface CreatedOrderRow {
  created_at: Date | string;
}

interface OrderReadRow {
  id: string;
  public_order_number: string;
  quote_id: string;
  service_type: "flight" | "hotel" | "rail" | "ppob";
  status: "QUOTED";
  currency: string;
  subtotal_minor: string;
  fees_minor: string;
  discount_minor: string;
  total_minor: string;
  version: number;
  created_at: Date | string;
  product_code: string;
  description_snapshot: string;
  terms_snapshot: unknown;
}


function assertCustomerSubject(subject: string): void {
  if (
    typeof subject !== "string" ||
    subject.length < 1 ||
    subject.length > 255 ||
    subject.trim() !== subject ||
    /[\\u0000-\\u001f\\u007f]/.test(subject)
  ) {
    throw new TypeError("Authenticated customer subject must be 1-255 printable characters");
  }
}

async function resolveCustomerId(client: PoolClient, subject: string): Promise<string> {
  assertCustomerSubject(subject);
  const result = await client.query<{ id: string }>(
    "INSERT INTO customers (id, auth_subject) VALUES ($1, $2) " +
    "ON CONFLICT (auth_subject) DO UPDATE SET updated_at = now() RETURNING id",
    [randomUUID(), subject]
  );
  const row = result.rows[0];
  if (!row) throw new Error("Could not resolve authenticated customer");
  return row.id;
}

function customerOrderScope(subject: string): string {
  assertCustomerSubject(subject);
  const digest = createHash("sha256").update(subject, "utf8").digest("hex");
  return "mock-order-from-quote:create:v1:" + digest;
}

function makePublicOrderNumber(): string {
  return "BLK-DEMO-" + randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
}

async function inTransaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    try {
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Keep the original failure as the useful error.
      }
      throw error;
    }
  } finally {
    client.release();
  }
}

function asOrderResponse(value: unknown): MockOrderResponse {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Stored mock order response has an invalid shape");
  }
  return value as MockOrderResponse;
}

/**
 * Creates a no-payment, no-fulfillment demo order.
 * Idempotency claim, order snapshot, audit trail and response snapshot all commit
 * in one database transaction. Thus a process crash cannot leave an idempotency
 * claim separate from an already-created order.
 */
export async function createMockOrder(
  pool: Pool,
  input: MockOrderRequest
): Promise<MockOrderDecision> {
  if (!/^[a-f0-9]{64}$/.test(input.requestHash)) {
    throw new TypeError("requestHash must be a lowercase SHA-256 hex digest");
  }
  if (
    typeof input.idempotencyKey !== "string" ||
    input.idempotencyKey.length < 8 ||
    input.idempotencyKey.length > 128 ||
    !/^[A-Za-z0-9._:-]+$/.test(input.idempotencyKey)
  ) {
    throw new TypeError("Idempotency-Key must be 8-128 safe ASCII characters");
  }
  if (!input.correlationId || input.correlationId.length > 200) {
    throw new TypeError("correlationId must be 1-200 characters");
  }
  if (!Number.isSafeInteger(input.spec.amountMinor) || input.spec.amountMinor < 0) {
    throw new TypeError("Mock amount must be a non-negative safe integer in minor units");
  }

  return inTransaction(pool, async (client) => {
    const claim = await client.query<{ id: string }>(
      `INSERT INTO idempotency_keys
        (id, scope, idempotency_key, request_hash, expires_at, state)
       VALUES ($1, 'mock-order:create:v1', $2, $3, now() + interval '24 hours', 'IN_PROGRESS')
       ON CONFLICT (scope, idempotency_key) DO NOTHING
       RETURNING id`,
      [randomUUID(), input.idempotencyKey, input.requestHash]
    );

    if (claim.rowCount !== 1) {
      const existingResult = await client.query<StoredIdempotencyRow>(
        `SELECT request_hash, state, response_status, safe_response, expires_at
           FROM idempotency_keys
          WHERE scope = 'mock-order:create:v1' AND idempotency_key = $1
          FOR UPDATE`,
        [input.idempotencyKey]
      );
      const existing = existingResult.rows[0];
      if (!existing) {
        throw new Error("Idempotency claim disappeared during conflict handling");
      }
      if (new Date(existing.expires_at).getTime() <= Date.now()) {
        return { kind: "expired" };
      }
      if (existing.request_hash !== input.requestHash) {
        return { kind: "conflict" };
      }
      if (existing.state === "COMPLETED" && existing.response_status === 201 && existing.safe_response !== null) {
        return {
          kind: "replay",
          statusCode: 201,
          order: asOrderResponse(existing.safe_response)
        };
      }
      return { kind: "in_progress" };
    }

    const orderId = randomUUID();
    const quoteId = randomUUID();
    const customerId = randomUUID();
    const publicOrderNumber = makePublicOrderNumber();
    const amount = BigInt(input.spec.amountMinor);

    // Synthetic customer has no email, phone, passenger data or user-facing account.
    await client.query(
      "INSERT INTO customers (id, auth_subject) VALUES ($1, $2)",
      [customerId, "beelka-mock-order:" + orderId]
    );

    await client.query(
      `INSERT INTO quotes
        (id, customer_id, service_type, provider, source_reference, request_hash,
         quoted_amount_minor, currency, price_breakdown, terms_snapshot, is_simulated,
         quoted_at, expires_at)
       VALUES ($1, $2, $3, 'beelka-fixture', $4, $5, $6, $7, $8::jsonb, $9::jsonb,
               TRUE, now(), now() + interval '15 minutes')`,
      [
        quoteId,
        customerId,
        input.spec.serviceType,
        input.spec.productId,
        input.requestHash,
        amount.toString(),
        input.spec.currency,
        JSON.stringify({
          subtotalMinor: amount.toString(),
          feesMinor: "0",
          discountMinor: "0",
          totalMinor: amount.toString()
        }),
        JSON.stringify({ selection: input.spec.selection, terms: input.spec.terms })
      ]
    );

    const orderInsert = await client.query<CreatedOrderRow>(
      `INSERT INTO orders
        (id, public_order_number, customer_id, quote_id, service_type, status,
         currency, subtotal_minor, fees_minor, discount_minor, total_minor, version)
       VALUES ($1, $2, $3, $4, $5, 'QUOTED', $6, $7, 0, 0, $7, 1)
       RETURNING created_at`,
      [
        orderId,
        publicOrderNumber,
        customerId,
        quoteId,
        input.spec.serviceType,
        input.spec.currency,
        amount.toString()
      ]
    );

    await client.query(
      `INSERT INTO order_items
        (id, order_id, quote_id, provider, product_code, description_snapshot,
         quantity, unit_amount_minor, total_amount_minor, terms_snapshot)
       VALUES ($1, $2, $3, 'beelka-fixture', $4, $5, 1, $6, $6, $7::jsonb)`,
      [
        randomUUID(),
        orderId,
        quoteId,
        input.spec.productId,
        input.spec.productName,
        amount.toString(),
        JSON.stringify(input.spec.terms)
      ]
    );

    await client.query(
      `INSERT INTO order_events
        (id, order_id, sequence_number, from_status, to_status, actor_type,
         actor_id, reason_code, correlation_id, metadata_redacted)
       VALUES ($1, $2, 1, NULL, 'QUOTED', 'system', 'mock-api',
               'MOCK_ORDER_CREATED', $3, $4::jsonb)`,
      [
        randomUUID(),
        orderId,
        input.correlationId,
        JSON.stringify({
          mode: "mock",
          service_type: input.spec.serviceType,
          product_id: input.spec.productId,
          live_fulfillment: false
        })
      ]
    );

    await client.query(
      `INSERT INTO audit_events
        (id, actor_type, actor_id, action, entity_type, entity_id,
         correlation_id, metadata_redacted)
       VALUES ($1, 'system', 'mock-api', 'MOCK_ORDER_CREATED', 'order', $2, $3, $4::jsonb)`,
      [
        randomUUID(),
        orderId,
        input.correlationId,
        JSON.stringify({
          mode: "mock",
          service_type: input.spec.serviceType,
          currency: input.spec.currency,
          total_minor: amount.toString(),
          bookable: false,
          purchasable: false,
          payment_started: false
        })
      ]
    );

    const order: MockOrderResponse = {
      id: orderId,
      publicOrderNumber,
      serviceType: input.spec.serviceType,
      productId: input.spec.productId,
      quoteId,
      productName: input.spec.productName,
      status: "QUOTED",
      currency: "IDR",
      subtotalMinor: amount.toString(),
      feesMinor: "0",
      discountMinor: "0",
      totalMinor: amount.toString(),
      version: 1,
      mode: "mock",
      bookable: false,
      purchasable: false,
      paymentState: "NOT_STARTED",
      fulfillmentState: "NOT_STARTED",
      selection: input.spec.selection,
      terms: input.spec.terms,
      createdAt: new Date(orderInsert.rows[0]?.created_at ?? new Date()).toISOString()
    };

    const completed = await client.query(
      `UPDATE idempotency_keys
          SET state = 'COMPLETED',
              response_status = 201,
              safe_response = $3::jsonb,
              resource_type = 'mock_order',
              resource_id = $4
        WHERE scope = 'mock-order:create:v1'
          AND idempotency_key = $1
          AND request_hash = $2
          AND state = 'IN_PROGRESS'`,
      [
        input.idempotencyKey,
        input.requestHash,
        JSON.stringify(order),
        orderId
      ]
    );
    if (completed.rowCount !== 1) {
      throw new Error("Could not atomically complete idempotency record");
    }

    return { kind: "created", statusCode: 201, order };
  });
}


interface PersistedMockQuoteRow {
  id: string;
  customer_id: string | null;
  service_type: "flight" | "hotel" | "rail" | "ppob";
  source_reference: string | null;
  request_hash: string;
  quoted_amount_minor: string;
  currency: string;
  terms_snapshot: unknown;
  quoted_at: Date | string;
  expires_at: Date | string;
  access_token_hash: string | null;
  consumed_at: Date | string | null;
  status: MockQuoteStatus;
}

interface MockQuoteSnapshot {
  productName?: unknown;
  selection?: unknown;
  terms?: unknown;
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isoTimestamp(value: Date | string): string {
  return new Date(value).toISOString();
}

function asMockQuote(row: PersistedMockQuoteRow): MockQuoteResponse {
  const snapshot = jsonRecord(row.terms_snapshot) as MockQuoteSnapshot;
  const amount = BigInt(row.quoted_amount_minor).toString();
  return {
    id: row.id,
    serviceType: row.service_type,
    productId: row.source_reference ?? "",
    productName: typeof snapshot.productName === "string" ? snapshot.productName : "Produk fixture Beelka",
    status: row.status,
    currency: "IDR",
    subtotalMinor: amount,
    feesMinor: "0",
    discountMinor: "0",
    totalMinor: amount,
    mode: "mock",
    bookable: false,
    purchasable: false,
    selection: jsonRecord(snapshot.selection) as Record<string, string | number>,
    terms: jsonRecord(snapshot.terms),
    quotedAt: isoTimestamp(row.quoted_at),
    expiresAt: isoTimestamp(row.expires_at)
  };
}

const quoteReadColumns =
  "id, customer_id, service_type, source_reference, request_hash, " +
  "quoted_amount_minor::text AS quoted_amount_minor, currency, terms_snapshot, " +
  "quoted_at, expires_at, access_token_hash, consumed_at, " +
  "CASE WHEN consumed_at IS NOT NULL THEN 'CONSUMED' " +
  "WHEN expires_at <= now() THEN 'EXPIRED' ELSE 'ACTIVE' END AS status";

function assertQuoteCreateInput(input: MockQuoteRequest): void {
  if (!/^[a-f0-9]{64}$/.test(input.requestHash)) {
    throw new TypeError("requestHash must be a lowercase SHA-256 hex digest");
  }
  if (!/^[a-f0-9]{64}$/.test(input.accessTokenHash)) {
    throw new TypeError("accessTokenHash must be a lowercase SHA-256 hex digest");
  }
  if (!input.correlationId || input.correlationId.length > 200) {
    throw new TypeError("correlationId must be 1-200 characters");
  }
  if (!Number.isSafeInteger(input.spec.amountMinor) || input.spec.amountMinor < 0) {
    throw new TypeError("Mock amount must be a non-negative safe integer in minor units");
  }
}

/** Stores only the SHA-256 digest of the random access token. */
export async function createMockQuote(
  pool: Pool,
  input: MockQuoteRequest
): Promise<MockQuoteResponse> {
  assertQuoteCreateInput(input);

  return inTransaction(pool, async (client) => {
    const quoteId = randomUUID();
    const customerId = await resolveCustomerId(client, input.customerSubject);
    const amount = BigInt(input.spec.amountMinor);

    await client.query(
      "INSERT INTO quotes " +
      "(id, customer_id, service_type, provider, source_reference, request_hash, " +
      "quoted_amount_minor, currency, price_breakdown, terms_snapshot, is_simulated, " +
      "quoted_at, expires_at, access_token_hash) " +
      "VALUES ($1, $2, $3, 'beelka-fixture', $4, $5, $6, $7, $8::jsonb, $9::jsonb, " +
      "TRUE, now(), now() + interval '15 minutes', $10)",
      [
        quoteId,
        customerId,
        input.spec.serviceType,
        input.spec.productId,
        input.requestHash,
        amount.toString(),
        input.spec.currency,
        JSON.stringify({
          subtotalMinor: amount.toString(),
          feesMinor: "0",
          discountMinor: "0",
          totalMinor: amount.toString()
        }),
        JSON.stringify({
          productName: input.spec.productName,
          selection: input.spec.selection,
          terms: input.spec.terms
        }),
        input.accessTokenHash
      ]
    );

    await client.query(
      "INSERT INTO audit_events " +
      "(id, actor_type, actor_id, action, entity_type, entity_id, correlation_id, metadata_redacted) " +
      "VALUES ($1, 'system', 'mock-api', 'MOCK_QUOTE_CREATED', 'quote', $2, $3, $4::jsonb)",
      [
        randomUUID(),
        quoteId,
        input.correlationId,
        JSON.stringify({
          mode: "mock",
          service_type: input.spec.serviceType,
          product_id: input.spec.productId,
          currency: input.spec.currency,
          amount_minor: amount.toString(),
          expires_in_minutes: 15,
          bookable: false,
          purchasable: false
        })
      ]
    );

    const result = await client.query<PersistedMockQuoteRow>(
      "SELECT " + quoteReadColumns + " FROM quotes WHERE id = $1",
      [quoteId]
    );
    const row = result.rows[0];
    if (!row) throw new Error("Persisted mock quote could not be read after creation");
    return asMockQuote(row);
  });
}

/** Reads a quote only when both the quote ID and access-token digest match. */
export async function getMockQuote(
  pool: Pool,
  quoteId: string,
  accessTokenHash: string,
  customerSubject: string
): Promise<MockQuoteResponse | null> {
  if (!/^[a-f0-9]{64}$/.test(accessTokenHash)) return null;
  try { assertCustomerSubject(customerSubject); } catch { return null; }
  const result = await pool.query<PersistedMockQuoteRow>(
    "SELECT " + quoteReadColumns +
    " FROM quotes WHERE id = $1 AND access_token_hash = $2 " +
    "AND customer_id = (SELECT id FROM customers WHERE auth_subject = $3) " +
    "AND is_simulated = TRUE LIMIT 1",
    [quoteId, accessTokenHash, customerSubject]
  );
  const row = result.rows[0];
  return row ? asMockQuote(row) : null;
}

/**
 * Confirms an unexpired quote and creates the order in one transaction.
 * Token ownership is checked before idempotent replay; the quote is row-locked
 * so concurrent requests cannot create multiple orders from one quote.
 */
export async function createMockOrderFromQuote(
  pool: Pool,
  input: MockOrderFromQuoteRequest
): Promise<MockOrderDecision> {
  assertCustomerSubject(input.customerSubject);
  if (!/^[a-f0-9]{64}$/.test(input.requestHash)) {
    throw new TypeError("requestHash must be a lowercase SHA-256 hex digest");
  }
  if (!/^[a-f0-9]{64}$/.test(input.accessTokenHash)) {
    throw new TypeError("accessTokenHash must be a lowercase SHA-256 hex digest");
  }
  if (
    typeof input.idempotencyKey !== "string" ||
    input.idempotencyKey.length < 8 ||
    input.idempotencyKey.length > 128 ||
    !/^[A-Za-z0-9._:-]+$/.test(input.idempotencyKey)
  ) {
    throw new TypeError("Idempotency-Key must be 8-128 safe ASCII characters");
  }
  if (!input.correlationId || input.correlationId.length > 200) {
    throw new TypeError("correlationId must be 1-200 characters");
  }

  return inTransaction(pool, async (client) => {
    const quoteResult = await client.query<PersistedMockQuoteRow>(
      "SELECT " + quoteReadColumns +
      " FROM quotes WHERE id = $1 AND access_token_hash = $2 " +
      "AND customer_id = (SELECT id FROM customers WHERE auth_subject = $3) " +
      "AND is_simulated = TRUE FOR UPDATE",
      [input.quoteId, input.accessTokenHash, input.customerSubject]
    );
    const quote = quoteResult.rows[0];
    if (!quote || !quote.customer_id || !quote.source_reference) return { kind: "quote_not_found" };

    // Ownership is derived from the verified identity-provider subject and does not store it in the idempotency scope.
    const scope = customerOrderScope(input.customerSubject);
    const claim = await client.query<{ id: string }>(
      "INSERT INTO idempotency_keys " +
      "(id, scope, idempotency_key, request_hash, expires_at, state) " +
      "VALUES ($1, $2, $3, $4, now() + interval '24 hours', 'IN_PROGRESS') " +
      "ON CONFLICT (scope, idempotency_key) DO NOTHING RETURNING id",
      [randomUUID(), scope, input.idempotencyKey, input.requestHash]
    );

    if (claim.rowCount !== 1) {
      const existingResult = await client.query<StoredIdempotencyRow>(
        "SELECT request_hash, state, response_status, safe_response, expires_at " +
        "FROM idempotency_keys WHERE scope = $1 AND idempotency_key = $2 FOR UPDATE",
        [scope, input.idempotencyKey]
      );
      const existing = existingResult.rows[0];
      if (!existing) throw new Error("Idempotency claim disappeared during conflict handling");
      if (new Date(existing.expires_at).getTime() <= Date.now()) return { kind: "expired" };
      if (existing.request_hash !== input.requestHash) return { kind: "conflict" };
      if (existing.state === "COMPLETED" && existing.response_status === 201 && existing.safe_response !== null) {
        return { kind: "replay", statusCode: 201, order: asOrderResponse(existing.safe_response) };
      }
      return { kind: "in_progress" };
    }

    const removePendingClaim = async (): Promise<void> => {
      await client.query(
        "DELETE FROM idempotency_keys WHERE scope = $1 " +
        "AND idempotency_key = $2 AND state = 'IN_PROGRESS'",
        [scope, input.idempotencyKey]
      );
    };
    if (quote.consumed_at !== null) {
      await removePendingClaim();
      return { kind: "quote_consumed" };
    }
    if (new Date(quote.expires_at).getTime() <= Date.now()) {
      await removePendingClaim();
      return { kind: "quote_expired" };
    }

    const consumed = await client.query(
      "UPDATE quotes SET consumed_at = now() " +
      "WHERE id = $1 AND access_token_hash = $2 AND consumed_at IS NULL AND expires_at > now() RETURNING id",
      [input.quoteId, input.accessTokenHash]
    );
    if (consumed.rowCount !== 1) {
      const latest = await client.query<{ consumed_at: Date | string | null }>(
        "SELECT consumed_at FROM quotes WHERE id = $1",
        [input.quoteId]
      );
      await removePendingClaim();
      return latest.rows[0]?.consumed_at ? { kind: "quote_consumed" } : { kind: "quote_expired" };
    }

    const snapshot = jsonRecord(quote.terms_snapshot);
    const selection = jsonRecord(snapshot.selection) as Record<string, string | number>;
    const terms = jsonRecord(snapshot.terms);
    const productName = typeof snapshot.productName === "string" ? snapshot.productName : "Produk fixture Beelka";
    const serviceType = quote.service_type;
    const productId = quote.source_reference;
    const customerId = quote.customer_id;
    const quoteId = quote.id;
    const amount = BigInt(quote.quoted_amount_minor);
    const currency = quote.currency.trim();
    if (currency !== "IDR") throw new Error("Mock quote currency is not IDR");

    const orderId = randomUUID();
    const publicOrderNumber = makePublicOrderNumber();
    const insertedOrder = await client.query<CreatedOrderRow>(
      "INSERT INTO orders " +
      "(id, public_order_number, customer_id, quote_id, service_type, status, currency, " +
      "subtotal_minor, fees_minor, discount_minor, total_minor, version) " +
      "VALUES ($1, $2, $3, $4, $5, 'QUOTED', $6, $7, 0, 0, $7, 1) RETURNING created_at",
      [orderId, publicOrderNumber, customerId, quoteId, serviceType, currency, amount.toString()]
    );

    await client.query(
      "INSERT INTO order_items " +
      "(id, order_id, quote_id, provider, product_code, description_snapshot, quantity, " +
      "unit_amount_minor, total_amount_minor, terms_snapshot) " +
      "VALUES ($1, $2, $3, 'beelka-fixture', $4, $5, 1, $6, $6, $7::jsonb)",
      [randomUUID(), orderId, quoteId, productId, productName, amount.toString(), JSON.stringify(terms)]
    );

    await client.query(
      "INSERT INTO order_events " +
      "(id, order_id, sequence_number, from_status, to_status, actor_type, actor_id, reason_code, correlation_id, metadata_redacted) " +
      "VALUES ($1, $2, 1, NULL, 'QUOTED', 'system', 'mock-api', 'MOCK_ORDER_CREATED_FROM_QUOTE', $3, $4::jsonb)",
      [
        randomUUID(), orderId, input.correlationId,
        JSON.stringify({ mode: "mock", quote_id: quoteId, service_type: serviceType, product_id: productId, live_fulfillment: false })
      ]
    );

    await client.query(
      "INSERT INTO audit_events " +
      "(id, actor_type, actor_id, action, entity_type, entity_id, correlation_id, metadata_redacted) " +
      "VALUES ($1, 'system', 'mock-api', 'MOCK_ORDER_CREATED_FROM_QUOTE', 'order', $2, $3, $4::jsonb)",
      [
        randomUUID(), orderId, input.correlationId,
        JSON.stringify({
          mode: "mock", quote_id: quoteId, service_type: serviceType,
          currency, total_minor: amount.toString(),
          bookable: false, purchasable: false, payment_started: false
        })
      ]
    );

    await client.query(
      "INSERT INTO audit_events " +
      "(id, actor_type, actor_id, action, entity_type, entity_id, correlation_id, metadata_redacted) " +
      "VALUES ($1, 'system', 'mock-api', 'MOCK_QUOTE_CONSUMED', 'quote', $2, $3, $4::jsonb)",
      [randomUUID(), quoteId, input.correlationId, JSON.stringify({ mode: "mock", order_id: orderId })]
    );

    const order: MockOrderResponse = {
      id: orderId,
      publicOrderNumber,
      serviceType,
      productId,
      productName,
      quoteId,
      status: "QUOTED",
      currency: "IDR",
      subtotalMinor: amount.toString(),
      feesMinor: "0",
      discountMinor: "0",
      totalMinor: amount.toString(),
      version: 1,
      mode: "mock",
      bookable: false,
      purchasable: false,
      paymentState: "NOT_STARTED",
      fulfillmentState: "NOT_STARTED",
      selection,
      terms,
      createdAt: isoTimestamp(insertedOrder.rows[0]?.created_at ?? new Date())
    };

    const completed = await client.query(
      "UPDATE idempotency_keys SET state = 'COMPLETED', response_status = 201, " +
      "safe_response = $4::jsonb, resource_type = 'mock_order', resource_id = $5 " +
      "WHERE scope = $1 AND idempotency_key = $2 " +
      "AND request_hash = $3 AND state = 'IN_PROGRESS'",
      [scope, input.idempotencyKey, input.requestHash, JSON.stringify(order), orderId]
    );
    if (completed.rowCount !== 1) throw new Error("Could not atomically complete idempotency record");
    return { kind: "created", statusCode: 201, order };
  });
}

export async function getMockOrder(
  pool: Pool,
  orderId: string,
  customerSubject: string
): Promise<MockOrderResponse | null> {
  try { assertCustomerSubject(customerSubject); } catch { return null; }
  const result = await pool.query<OrderReadRow>(
    `SELECT o.id, o.public_order_number, o.quote_id, o.service_type, o.status, o.currency,
            o.subtotal_minor, o.fees_minor, o.discount_minor, o.total_minor,
            o.version, o.created_at, i.product_code, i.description_snapshot,
            q.terms_snapshot
       FROM orders o
       JOIN quotes q ON q.id = o.quote_id AND q.is_simulated = TRUE
       JOIN order_items i ON i.order_id = o.id
      WHERE o.id = $1
        AND o.customer_id = (SELECT id FROM customers WHERE auth_subject = $2)
      LIMIT 1`,
    [orderId, customerSubject]
  );
  const row = result.rows[0];
  if (!row) return null;

  const snapshot = row.terms_snapshot as {
    selection?: Record<string, string | number>;
    terms?: Record<string, unknown>;
  } | null;

  return {
    id: row.id,
    publicOrderNumber: row.public_order_number,
    quoteId: row.quote_id,
    serviceType: row.service_type,
    productId: row.product_code,
    productName: row.description_snapshot,
    status: "QUOTED",
    currency: "IDR",
    subtotalMinor: row.subtotal_minor,
    feesMinor: "0",
    discountMinor: "0",
    totalMinor: row.total_minor,
    version: 1,
    mode: "mock",
    bookable: false,
    purchasable: false,
    paymentState: "NOT_STARTED",
    fulfillmentState: "NOT_STARTED",
    selection: snapshot?.selection ?? {},
    terms: snapshot?.terms ?? {},
    createdAt: new Date(row.created_at).toISOString()
  };
}
