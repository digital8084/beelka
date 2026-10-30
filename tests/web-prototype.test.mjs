import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const html = await readFile(
  new URL("../apps/web-prototype/index.html", import.meta.url),
  "utf8",
);

test("customer prototype declares Indonesian language and responsive viewport", () => {
  assert.match(html, /<html lang="id">/);
  assert.match(html, /name="viewport"[^>]*width=device-width/);
});

test("all four service categories have dedicated mock form definitions", () => {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, "inline prototype script exists");
  for (const service of ["flights", "hotels", "trains", "ppob"]) {
    assert.match(script, new RegExp("\\b" + service + "\\s*:"));
  }
  assert.match(html, /data-service="flights"/);
  assert.match(html, /data-service="hotels"/);
  assert.match(html, /data-service="trains"/);
  assert.match(html, /data-service="ppob"/);
});

test("prototype labels simulation and explicitly denies real transactions", () => {
  assert.match(html, /MODE SIMULASI|simulasi/i);
  assert.match(html, /tidak ada transaksi yang dibuat/i);
  assert.match(html, /Tidak untuk transaksi nyata/i);
  assert.doesNotMatch(html, /fetch\s*\(|XMLHttpRequest|WebSocket\s*\(/);
});

test("prototype inline JavaScript parses without syntax errors", () => {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, "inline prototype script exists");
  assert.doesNotThrow(() => new vm.Script(script, { filename: "beelka-prototype.js" }));
});

test("dynamic fields are labelled and submission stays local to the prototype", () => {
  assert.match(html, /lab\.htmlFor = id/);
  assert.match(html, /event\.preventDefault\(\)/);
  assert.match(html, /form\.reportValidity\(\)/);
  assert.match(html, /notice\.classList\.add\("show"\)/);
});


test("flight, hotel, and train form field names match the mock API contract", () => {
  const scriptStart = html.indexOf("<script>") + "<script>".length;
  const scriptEnd = html.indexOf("</script>", scriptStart);
  const script = scriptEnd >= 0 ? html.slice(scriptStart, scriptEnd) : "";
  assert.ok(script, "inline prototype script exists");
  assert.match(script, /departureDate/);
  assert.match(script, /checkIn/);
  assert.match(script, /checkOut/);
  assert.match(script, /city/);
  assert.match(script, /rooms/);
  assert.match(script, /travelDate/);
  assert.match(script, /adults/);
  assert.doesNotMatch(script, /"checkin"|"checkout"|"passengers"/);
});

test("hotel search requires a city or area before submission", () => {
  assert.match(html, /\["origin","destination","city","customer"\]\.includes\(id\)/);
});
