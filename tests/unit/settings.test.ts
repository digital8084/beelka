import assert from "node:assert/strict";
import test from "node:test";
import { loadSettings } from "../../apps/api/src/settings.js";

test("settings default to simulation and live mutations disabled", () => {
  const settings = loadSettings({});
  assert.equal(settings.mode, "simulation");
  assert.equal(settings.paymentGatewayMode, "simulation");
  assert.equal(settings.mmbcLiveEnabled, false);
});

test("live MMBC mode cannot be enabled in Phase 1", () => {
  assert.throws(() => loadSettings({ MMBC_LIVE_ENABLED: "true" }), /disabled in Phase 1/);
});

test("live payment gateway mode cannot be enabled in Phase 1", () => {
  assert.throws(() => loadSettings({ PAYMENT_GATEWAY_MODE: "live" }), /disabled in Phase 1/);
});

test("invalid port is rejected", () => {
  assert.throws(() => loadSettings({ PORT: "70000" }), /PORT must be an integer/);
});
