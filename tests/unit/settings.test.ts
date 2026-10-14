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

test("Google Identity Platform project ID accepts the documented environment aliases", () => {
  assert.equal(
    loadSettings({ GOOGLE_CLOUD_PROJECT: "beelka-staging" }).googleIdentityPlatformProjectId,
    "beelka-staging"
  );
  assert.equal(
    loadSettings({ FIREBASE_PROJECT_ID: "beelka-firebase" }).googleIdentityPlatformProjectId,
    "beelka-firebase"
  );
  assert.equal(
    loadSettings({ GOOGLE_CLOUD_PROJECT: "  ", FIREBASE_PROJECT_ID: "beelka-fallback" }).googleIdentityPlatformProjectId,
    "beelka-fallback"
  );
});

test("CORS origin allowlist accepts exact HTTP(S) origins", () => {
  const settings = loadSettings({
    BEELKA_CORS_ORIGINS: "http://localhost:4173, https://staging.beelka.example"
  });
  assert.deepEqual(settings.corsAllowedOrigins, [
    "http://localhost:4173",
    "https://staging.beelka.example"
  ]);
});

test("CORS origin allowlist rejects wildcards, paths, and invalid URLs", () => {
  for (const value of [
    "*",
    "https://staging.beelka.example/path",
    "javascript:alert(1)",
    "http://localhost:4173, http://localhost:4173"
  ]) {
    assert.throws(() => loadSettings({ BEELKA_CORS_ORIGINS: value }), /BEELKA_CORS_ORIGINS/);
  }
});
