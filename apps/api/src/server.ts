import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { MockOrderStore } from "../../../packages/domain/src/mock-orders.js";
import {
  listMockPpobProducts,
  MockInputError,
  mockServiceModules,
  resolveMockOrder,
  searchMockFlights,
  searchMockHotels,
  searchMockTrains
} from "../../../packages/providers/src/mock-catalog.js";
import { hashRequest, assertIdempotencyKey } from "../../../packages/domain/src/idempotency.js";

export class AuthenticationProviderUnavailableError extends Error {
  constructor() {
    super("Authentication provider is temporarily unavailable");
    this.name = "AuthenticationProviderUnavailableError";
  }
}

export interface DatabaseProbe {
  query(sql: string): Promise<unknown>;
}

export interface AuthenticatedPrincipal {
  /** Opaque, verified subject from a trusted identity provider; never a request-supplied ID. */
  subject: string;
}

export type Authenticator = (req: IncomingMessage) => Promise<AuthenticatedPrincipal | null>;

export interface AppDependencies {
  database?: DatabaseProbe;
  mockOrderStore?: MockOrderStore;
  demoOrdersEnabled?: boolean;
  /** Must validate a real session/JWT/cookie using an approved identity provider. No header fallback is implemented. */
  authenticate?: Authenticator;
  /** Exact browser origins allowed to call this API with CORS. Cookies are not enabled. */
  corsAllowedOrigins?: readonly string[];
}

class RequestInputError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "RequestInputError";
  }
}

function json(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer"
  });
  res.end(JSON.stringify(body));
}

function requestId(req: IncomingMessage): string {
  const header = req.headers["x-request-id"];
  const candidate = Array.isArray(header) ? header[0] : header;
  if (candidate && /^[A-Za-z0-9._:-]{8,128}$/.test(candidate)) return candidate;
  return randomUUID();
}

async function readJsonBody(req: IncomingMessage, maxBytes = 16 * 1024): Promise<Record<string, unknown>> {
  const contentType = req.headers["content-type"]?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new RequestInputError(415, "JSON_REQUIRED", "Content-Type harus application/json.");
  }

  const contentLength = req.headers["content-length"];
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new RequestInputError(413, "BODY_TOO_LARGE", "Ukuran body melebihi batas.");
  }

  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > maxBytes) {
      throw new RequestInputError(413, "BODY_TOO_LARGE", "Ukuran body melebihi batas.");
    }
    chunks.push(buffer);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RequestInputError(400, "INVALID_JSON", "Body bukan JSON yang valid.");
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new RequestInputError(400, "INVALID_BODY", "Body harus berupa objek JSON.");
  }
  return parsed as Record<string, unknown>;
}

function errorResponse(
  res: ServerResponse,
  statusCode: number,
  code: string,
  message: string,
  correlationId: string
): void {
  json(res, statusCode, { error: { code, message }, requestId: correlationId });
}

function quoteAccessToken(req: IncomingMessage): string | null {
  const header = req.headers["x-quote-token"];
  const candidate = Array.isArray(header) ? header[0] : header;
  return candidate && /^[A-Za-z0-9_-]{43}$/.test(candidate) ? candidate : null;
}

function hashQuoteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

async function requirePrincipal(
  req: IncomingMessage,
  dependencies: AppDependencies
): Promise<AuthenticatedPrincipal> {
  if (!dependencies.authenticate) {
    throw new RequestInputError(503, "AUTHENTICATION_NOT_CONFIGURED", "Penyedia autentikasi belum dikonfigurasi; akses pelanggan ditutup.");
  }

  const principal = await dependencies.authenticate(req);
  if (!principal) {
    throw new RequestInputError(401, "AUTHENTICATION_REQUIRED", "Autentikasi pelanggan wajib untuk mengakses quote atau pesanan.");
  }
  if (
    typeof principal.subject !== "string" ||
    principal.subject.length < 1 ||
    principal.subject.length > 255 ||
    principal.subject.trim() !== principal.subject ||
    /[\u0000-\u001f\u007f]/.test(principal.subject)
  ) {
    throw new RequestInputError(401, "INVALID_AUTHENTICATION_CONTEXT", "Identitas terverifikasi tidak valid.");
  }
  return principal;
}

function serviceMetadata(authenticationConfigured: boolean): Record<string, unknown> {
  return {
    mode: "mock",
    liveTransactionsEnabled: false,
    paymentGatewayMode: "disabled",
    customerAuthenticationConfigured: authenticationConfigured,
    services: mockServiceModules
  };
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: AppDependencies
): Promise<void> {
  const correlationId = requestId(req);
  res.setHeader("x-request-id", correlationId);
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  const method = req.method ?? "GET";

  if (method === "GET" && path === "/healthz") {
    json(res, 200, {
      status: "ok",
      service: "beelka-api",
      mode: "mock",
      checks: { process: "ok" },
      requestId: correlationId
    });
    return;
  }

  if (method === "GET" && path === "/readyz") {
    if (!dependencies.database) {
      errorResponse(res, 503, "DATABASE_NOT_CONFIGURED", "PostgreSQL belum dikonfigurasi.", correlationId);
      return;
    }

    try {
      await dependencies.database.query("SELECT 1");
      json(res, 200, {
        status: "ready",
        checks: { postgres: "ok" },
        requestId: correlationId
      });
    } catch {
      errorResponse(res, 503, "DATABASE_UNAVAILABLE", "PostgreSQL tidak tersedia.", correlationId);
    }
    return;
  }

  if (method === "GET" && path === "/api/v1/auth/me") {
    await requirePrincipal(req, dependencies);
    json(res, 200, { authenticated: true, requestId: correlationId });
    return;
  }

  if (method === "GET" && (path === "/api/v1" || path === "/api/v1/meta/services")) {
    json(res, 200, { ...serviceMetadata(Boolean(dependencies.authenticate)), requestId: correlationId });
    return;
  }

  if (method === "GET" && path === "/api/v1/ppob/products") {
    json(res, 200, { ...listMockPpobProducts(), requestId: correlationId });
    return;
  }

  if (method === "POST" && (
    path === "/api/v1/flights/search" ||
    path === "/api/v1/hotels/search" ||
    path === "/api/v1/trains/search"
  )) {
    const body = await readJsonBody(req);
    let result: Record<string, unknown>;
    if (path === "/api/v1/flights/search") result = searchMockFlights(body);
    else if (path === "/api/v1/hotels/search") result = searchMockHotels(body);
    else result = searchMockTrains(body);
    json(res, 200, { ...result, requestId: correlationId });
    return;
  }

  if (method === "POST" && path === "/api/v1/quotes") {
    if (!(dependencies.demoOrdersEnabled ?? false)) {
      errorResponse(res, 503, "DEMO_ORDERS_DISABLED", "Pembuatan quote demo sedang dinonaktifkan.", correlationId);
      return;
    }
    if (!dependencies.database || !dependencies.mockOrderStore) {
      errorResponse(res, 503, "DATABASE_NOT_CONFIGURED", "Penyimpanan PostgreSQL diperlukan untuk quote demo.", correlationId);
      return;
    }

    const principal = await requirePrincipal(req, dependencies);
    const body = await readJsonBody(req);
    const spec = resolveMockOrder(body);
    const accessToken = randomBytes(32).toString("base64url");
    const requestHash = hashRequest({
      serviceType: spec.serviceType,
      productId: spec.productId,
      selection: spec.selection
    });
    const quote = await dependencies.mockOrderStore.createQuote({
      customerSubject: principal.subject,
      requestHash,
      accessTokenHash: hashQuoteToken(accessToken),
      correlationId,
      spec
    });
    json(res, 201, { ...quote, accessToken, requestId: correlationId });
    return;
  }

  const quoteMatch = method === "GET"
    ? path.match(/^\/api\/v1\/quotes\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$/)
    : null;
  if (quoteMatch) {
    if (!(dependencies.demoOrdersEnabled ?? false)) {
      errorResponse(res, 404, "QUOTE_NOT_FOUND", "Quote tidak ditemukan.", correlationId);
      return;
    }
    if (!dependencies.database || !dependencies.mockOrderStore) {
      errorResponse(res, 503, "DATABASE_NOT_CONFIGURED", "Penyimpanan PostgreSQL diperlukan untuk membaca quote demo.", correlationId);
      return;
    }
    const principal = await requirePrincipal(req, dependencies);
    const token = quoteAccessToken(req);
    if (!token) {
      errorResponse(res, 404, "QUOTE_NOT_FOUND", "Quote tidak ditemukan.", correlationId);
      return;
    }
    const quote = await dependencies.mockOrderStore.getQuote(
      quoteMatch[1] ?? "",
      hashQuoteToken(token),
      principal.subject
    );
    if (!quote) {
      errorResponse(res, 404, "QUOTE_NOT_FOUND", "Quote tidak ditemukan.", correlationId);
      return;
    }
    json(res, 200, { ...quote, requestId: correlationId });
    return;
  }

  if (method === "POST" && path === "/api/v1/orders") {
    if (!(dependencies.demoOrdersEnabled ?? false)) {
      errorResponse(res, 503, "DEMO_ORDERS_DISABLED", "Pembuatan pesanan demo sedang dinonaktifkan.", correlationId);
      return;
    }
    if (!dependencies.database || !dependencies.mockOrderStore) {
      errorResponse(res, 503, "DATABASE_NOT_CONFIGURED", "Penyimpanan PostgreSQL diperlukan untuk pesanan demo.", correlationId);
      return;
    }

    const principal = await requirePrincipal(req, dependencies);
    const header = req.headers["idempotency-key"];
    const key = Array.isArray(header) ? header[0] : header;
    if (!key) {
      errorResponse(res, 400, "IDEMPOTENCY_KEY_REQUIRED", "Header Idempotency-Key wajib diisi.", correlationId);
      return;
    }
    const token = quoteAccessToken(req);
    if (!token) {
      errorResponse(res, 400, "QUOTE_ACCESS_TOKEN_REQUIRED", "Header X-Quote-Token wajib diisi untuk konfirmasi quote.", correlationId);
      return;
    }

    const body = await readJsonBody(req);
    const quoteId = body.quoteId;
    if (typeof quoteId !== "string" || !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(quoteId)) {
      throw new RequestInputError(400, "INVALID_QUOTE_ID", "quoteId harus UUID quote yang valid.");
    }

    assertIdempotencyKey(key);
    const requestHash = hashRequest({ quoteId });
    const decision = await dependencies.mockOrderStore.createFromQuote({
      customerSubject: principal.subject,
      quoteId,
      accessTokenHash: hashQuoteToken(token),
      idempotencyKey: key,
      requestHash,
      correlationId
    });

    if (decision.kind === "quote_not_found") {
      errorResponse(res, 404, "QUOTE_NOT_FOUND", "Quote tidak ditemukan.", correlationId);
      return;
    }
    if (decision.kind === "quote_expired") {
      errorResponse(res, 409, "QUOTE_EXPIRED", "Quote sudah kedaluwarsa; buat quote baru sebelum melanjutkan.", correlationId);
      return;
    }
    if (decision.kind === "quote_consumed") {
      errorResponse(res, 409, "QUOTE_ALREADY_USED", "Quote sudah digunakan untuk membuat pesanan.", correlationId);
      return;
    }
    if (decision.kind === "conflict") {
      errorResponse(res, 409, "IDEMPOTENCY_KEY_CONFLICT", "Idempotency-Key sudah dipakai dengan payload berbeda.", correlationId);
      return;
    }
    if (decision.kind === "in_progress") {
      res.setHeader("retry-after", "1");
      errorResponse(res, 409, "IDEMPOTENCY_IN_PROGRESS", "Permintaan dengan Idempotency-Key ini masih diproses.", correlationId);
      return;
    }
    if (decision.kind === "expired") {
      errorResponse(res, 409, "IDEMPOTENCY_KEY_EXPIRED", "Idempotency-Key sudah kedaluwarsa; gunakan kunci baru.", correlationId);
      return;
    }

    json(res, decision.statusCode, { ...decision.order, requestId: correlationId });
    return;
  }

  const orderMatch = method === "GET"
    ? path.match(/^\/api\/v1\/orders\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$/)
    : null;
  if (orderMatch) {
    if (!(dependencies.demoOrdersEnabled ?? false)) {
      errorResponse(res, 404, "NOT_FOUND", "Pesanan tidak ditemukan.", correlationId);
      return;
    }
    if (!dependencies.database || !dependencies.mockOrderStore) {
      errorResponse(res, 503, "DATABASE_NOT_CONFIGURED", "Penyimpanan PostgreSQL diperlukan untuk membaca pesanan demo.", correlationId);
      return;
    }
    const principal = await requirePrincipal(req, dependencies);
    const order = await dependencies.mockOrderStore.get(orderMatch[1] ?? "", principal.subject);
    if (!order) {
      errorResponse(res, 404, "NOT_FOUND", "Pesanan demo tidak ditemukan.", correlationId);
      return;
    }
    json(res, 200, { ...order, requestId: correlationId });
    return;
  }

  // Admin audit access is deliberately not published until authentication and authorization exist.
  if (path === "/api/v1/admin/audit-events" || path.startsWith("/api/v1/admin/")) {
    errorResponse(res, 404, "NOT_FOUND", "Route tidak ditemukan.", correlationId);
    return;
  }

  errorResponse(res, 404, "NOT_FOUND", "Route tidak ditemukan.", correlationId);
}

export function createAppServer(dependencies: AppDependencies = {}): Server {
  return createServer((req, res) => {
    const requestOrigin = req.headers.origin;
    const originAllowed = typeof requestOrigin === "string" &&
      (dependencies.corsAllowedOrigins ?? []).includes(requestOrigin);

    if (originAllowed && requestOrigin) {
      res.setHeader("access-control-allow-origin", requestOrigin);
      res.setHeader("vary", "Origin");
      res.setHeader("access-control-expose-headers", "X-Request-ID");
    }

    if (req.method === "OPTIONS" && req.headers["access-control-request-method"]) {
      const requestedMethod = req.headers["access-control-request-method"]?.toUpperCase() ?? "";
      const requestedHeaders = (req.headers["access-control-request-headers"] ?? "")
        .split(",")
        .map((header) => header.trim().toLowerCase())
        .filter(Boolean);
      const permittedHeaders = new Set([
        "authorization", "content-type", "idempotency-key", "x-quote-token", "x-request-id"
      ]);
      const preflightAllowed = originAllowed &&
        ["GET", "POST"].includes(requestedMethod) &&
        requestedHeaders.every((header) => permittedHeaders.has(header));

      if (!preflightAllowed) {
        res.writeHead(403, { "cache-control": "no-store", "x-content-type-options": "nosniff" });
        res.end();
        return;
      }

      res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
      res.setHeader(
        "access-control-allow-headers",
        "Authorization, Content-Type, Idempotency-Key, X-Quote-Token, X-Request-ID"
      );
      res.setHeader("access-control-max-age", "600");
      res.writeHead(204);
      res.end();
      return;
    }

    void handleRequest(req, res, dependencies).catch((error: unknown) => {
      if (error instanceof AuthenticationProviderUnavailableError) {
        errorResponse(
          res,
          503,
          "AUTHENTICATION_PROVIDER_UNAVAILABLE",
          "Penyedia autentikasi sementara tidak tersedia.",
          res.getHeader("x-request-id")?.toString() ?? randomUUID()
        );
        return;
      }
      if (error instanceof RequestInputError || error instanceof MockInputError) {
        errorResponse(res, error.statusCode, error.code, error.message, res.getHeader("x-request-id")?.toString() ?? randomUUID());
        return;
      }
      if (error instanceof TypeError && error.message.startsWith("Idempotency-Key")) {
        errorResponse(res, 400, "INVALID_IDEMPOTENCY_KEY", "Format Idempotency-Key tidak valid.", res.getHeader("x-request-id")?.toString() ?? randomUUID());
        return;
      }
      process.stderr.write(JSON.stringify({
        event: "request_failed",
        requestId: res.getHeader("x-request-id")?.toString() ?? "unknown",
        errorType: error instanceof Error ? error.name : "UnknownError"
      }) + "\n");
      if (!res.headersSent) {
        errorResponse(res, 500, "INTERNAL_ERROR", "Terjadi kesalahan internal.", res.getHeader("x-request-id")?.toString() ?? randomUUID());
      } else {
        res.destroy();
      }
    });
  });
}
