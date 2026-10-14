import assert from "node:assert/strict";
import test from "node:test";
import {
  InvalidStateTransitionError,
  transitionOrder,
  transitionPayment
} from "../../packages/domain/src/state-machines.js";

test("order allows a valid quoted-to-payment transition", () => {
  assert.equal(transitionOrder("QUOTED", "AWAITING_PAYMENT"), "AWAITING_PAYMENT");
});

test("order rejects regression from completed to processing", () => {
  assert.throws(
    () => transitionOrder("COMPLETED", "PROCESSING"),
    InvalidStateTransitionError
  );
});

test("payment success cannot regress to failed", () => {
  assert.throws(
    () => transitionPayment("SUCCEEDED", "FAILED"),
    InvalidStateTransitionError
  );
});

test("unknown payment can be reconciled to success", () => {
  assert.equal(transitionPayment("UNKNOWN", "SUCCEEDED"), "SUCCEEDED");
});
