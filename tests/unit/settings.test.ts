import assert from "node:assert/strict";
import test from "node:test";
import { loadSettings } from "../../apps/api/src/settings.js";

test("settings default to simulation and live mutations disabled", () => {
  const settings = loadSettings({});
  assert.equal(settings.mode, "simulation");
  assert.equal(settings.paymentGatewayMode, "simulation");
  assert.equal(settings.mmbcLiveEnabled, false);
  assert.equal(settings.demoOrdersEnabled, true);
});

test("live MMBC mode cannot be enabled", () => {
  assert.throws(() => loadSettings({ MMBC_LIVE_ENABLED: "true" }), /MMBC live mutations are disabled/);
});

test("live payment gateway mode cannot be enabled", () => {
  assert.throws(() => loadSettings({ PAYMENT_GATEWAY_MODE: "live" }), /Live payment gateway mode is disabled/);
});

test("demo orders default off for production", () => {
  const settings = loadSettings({ NODE_ENV: "production" });
  assert.equal(settings.demoOrdersEnabled, false);
});

test("unauthenticated demo order endpoints cannot be enabled in production", () => {
  assert.throws(
    () => loadSettings({ NODE_ENV: "production", BEELKA_DEMO_ORDERS_ENABLED: "true" }),
    /cannot be enabled in production/
  );
});

test("invalid demo orders flag is rejected", () => {
  assert.throws(() => loadSettings({ BEELKA_DEMO_ORDERS_ENABLED: "yes" }), /must be true or false/);
});

test("invalid port is rejected", () => {
  assert.throws(() => loadSettings({ PORT: "70000" }), /PORT must be an integer/);
});
