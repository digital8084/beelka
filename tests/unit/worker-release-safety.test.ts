import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workerConfig = JSON.parse(
  readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8")
) as {
  vars: Record<string, string>;
  name: string;
  main: string;
};

const workerEntry = readFileSync(
  new URL("../../apps/api/src/worker.ts", import.meta.url),
  "utf8"
);
const deployWorkflow = readFileSync(
  new URL("../../.github/workflows/deploy-cloudflare.yml", import.meta.url),
  "utf8"
);

test("Worker deployment config keeps all supplier and payment activity in simulation", () => {
  assert.equal(workerConfig.vars.BEELKA_MODE, "simulation");
  assert.equal(workerConfig.vars.PAYMENT_GATEWAY_MODE, "simulation");
  assert.equal(workerConfig.vars.MMBC_LIVE_ENABLED, "false");
  assert.equal(workerConfig.vars.BEELKA_DEMO_ORDERS_ENABLED, "false");
});

test("Worker fails closed for customer order writes until trusted identity is wired", () => {
  assert.match(workerEntry, /demoOrdersEnabled:\s*false/);
  assert.match(workerEntry, /verified customer identity adapter and staging UAT/i);
  assert.doesNotMatch(workerEntry, /authenticate\s*:/);
});

test("production deployment requires explicit release approval and production environment", () => {
  assert.match(deployWorkflow, /environment:\s*production/);
  assert.match(
    deployWorkflow,
    /vars\.BEELKA_PRODUCTION_RELEASE_APPROVED\s*==\s*'true'/
  );
});

test("Worker validation is a dry run and does not itself deploy", () => {
  assert.match(deployWorkflow, /npm run worker:check/);
  assert.match(deployWorkflow, /name:\s*Validate Worker bundle/);
  assert.match(deployWorkflow, /name:\s*Deploy Cloudflare Worker \(explicit release gate\)/);
  assert.equal(workerConfig.name, "beelka");
  assert.equal(workerConfig.main, "apps/api/src/worker.ts");
});
