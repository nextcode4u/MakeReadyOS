import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "../apps/api/node_modules/typescript/lib/typescript.js";

function load(file, extras = {}) {
  const exports = {};
  const source = readFileSync(file, "utf8").replaceAll("import.meta.env.VITE_API_BASE_URL", '"/api"');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: () => ({}), Error, FormData, AbortController, setTimeout, clearTimeout, ...extras });
  return exports;
}

test("recovery retries serially, clears only on success, and stops after cleanup", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { startConnectionRecovery } = load("apps/web/src/lib/connectionRecovery.ts");
  let calls = 0; let recovered = 0;
  const stop = startConnectionRecovery(async () => ++calls >= 2, () => recovered++);
  t.mock.timers.tick(1000);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1); assert.equal(recovered, 0);
  t.mock.timers.tick(15000);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2); assert.equal(recovered, 1);
  stop(); t.mock.timers.tick(60000);
  assert.equal(calls, 2);
});

test("cleanup aborts pending probes and late success cannot clear a warning", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { startConnectionRecovery } = load("apps/web/src/lib/connectionRecovery.ts");
  let signal; let resolve; let recovered = 0;
  const stop = startConnectionRecovery(s => { signal = s; return new Promise(r => { resolve = r; }); }, () => recovered++);
  t.mock.timers.tick(1000);
  stop(); assert.equal(signal.aborted, true);
  resolve(true); await new Promise(resolve => setImmediate(resolve));
  assert.equal(recovered, 0);
});

test("aborted requests are not outages; genuine fetch failures still report unreachable", async () => {
  const events = [];
  let abort = true;
  const api = load("apps/web/src/lib/api.ts", { window: { dispatchEvent: e => events.push(e) }, CustomEvent: class { constructor(type) { this.type = type; } }, fetch: async () => { throw Object.assign(new Error("failed"), { name: abort ? "AbortError" : "TypeError" }); } });
  await assert.rejects(api.getCurrentUser(), { name: "AbortError" });
  assert.equal(events.length, 0);
  abort = false;
  await assert.rejects(api.getCurrentUser(), { status: 0 });
  assert.equal(events[0].type, "makereadyos:api-unreachable");
});

test("recovery probe requires a real JSON identity response and bypasses caches", async () => {
  let response = new Response("<html>Proxy page</html>", { headers: { "content-type": "text/html" } });
  const api = load("apps/web/src/lib/api.ts", { fetch: async (url, init) => { assert.match(url, /\/auth\/me\?connection-check=/); assert.equal(init.cache, "no-store"); return response; } });
  assert.equal(await api.probeApiConnection(new AbortController().signal), false);
  response = Response.json({ user: { id: "u" } });
  assert.equal(await api.probeApiConnection(new AbortController().signal), true);
});
