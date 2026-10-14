import assert from "node:assert/strict";
import test from "node:test";
import { assertIdempotencyKey, hashRequest } from "../../packages/domain/src/idempotency.js";

test("request hash is stable when object key order differs", () => {
  assert.equal(hashRequest({ b: 2, a: 1 }), hashRequest({ a: 1, b: 2 }));
});

test("request hash preserves array order and meaningful value changes", () => {
  assert.notEqual(hashRequest({ items: ["flight", "hotel"] }), hashRequest({ items: ["hotel", "flight"] }));
  assert.notEqual(hashRequest({ amount: 100 }), hashRequest({ amount: 101 }));
});

test("idempotency key accepts a bounded safe key", () => {
  assert.doesNotThrow(() => assertIdempotencyKey("checkout-2026:0001"));
});

test("idempotency key rejects short, oversized or unsafe values", () => {
  assert.throws(() => assertIdempotencyKey("short"));
  assert.throws(() => assertIdempotencyKey("x".repeat(129)));
  assert.throws(() => assertIdempotencyKey("checkout key with spaces"));
});
