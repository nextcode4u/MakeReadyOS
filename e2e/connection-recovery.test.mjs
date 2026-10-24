import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "../apps/api/node_modules/typescript/lib/typescript.js";

function load(file, extras = {}) {
  const exports = {};
  const source = readFileSync(file, "utf8").replaceAll("import.meta.env.VITE_API_BASE_URL", '"/api"');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: name => name === "./verifiedSession" ? load("apps/web/src/lib/verifiedSession.ts") : {}, Error, FormData, Headers, AbortController, setTimeout, clearTimeout, ...extras });
  return exports;
}

const flush = () => new Promise(resolve => setImmediate(resolve));
function recovery(probe, extras = {}) {
  const events = [];
  const { createConnectionRecovery } = load("apps/web/src/lib/connectionRecovery.ts");
  const controller = createConnectionRecovery(probe, {
    visible: () => true,
    reachable: refresh => events.push(["reachable", refresh]),
    unreachable: () => events.push(["unreachable"]),
    unauthenticated: () => events.push(["unauthenticated"]),
    ...extras,
  });
  return { controller, events };
}

test("focus checks stay quiet; only two confirmed failures announce an outage", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let result = "reachable";
  const { controller, events } = recovery(async () => result);
  controller.check();
  t.mock.timers.tick(1000); await flush();
  assert.deepEqual(events, [["reachable", false]]);
  result = "unreachable";
  controller.check(true);
  t.mock.timers.tick(1000); await flush();
  assert.equal(events.length, 1);
  t.mock.timers.tick(2000); await flush();
  assert.deepEqual(events.at(-1), ["unreachable"]);
  result = "reachable";
  t.mock.timers.tick(15000); await flush();
  assert.deepEqual(events.at(-1), ["reachable", true]);
  controller.stop();
});

test("duplicate resume events do not overlap or abort an in-flight check", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0; let resolve; let signal;
  const { controller, events } = recovery(s => { calls++; signal = s; return new Promise(r => { resolve = r; }); });
  controller.check();
  t.mock.timers.tick(1000); await flush();
  controller.check(); controller.check(true);
  t.mock.timers.tick(5000); await flush();
  assert.equal(calls, 1); assert.equal(signal.aborted, false);
  resolve("reachable"); await flush();
  assert.deepEqual(events, [["reachable", true]]);
  controller.stop();
});

test("a burst of failed requests cannot postpone the initial probe indefinitely", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  const { controller } = recovery(async () => { calls++; return "reachable"; });
  controller.check(true);
  t.mock.timers.tick(500);
  controller.check(true);
  t.mock.timers.tick(500); await flush();
  assert.equal(calls, 1);
  controller.stop();
});

test("cleanup aborts pending probes and discards late results", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let signal; let resolve;
  const { controller, events } = recovery(s => { signal = s; return new Promise(r => { resolve = r; }); });
  controller.check();
  t.mock.timers.tick(1000);
  controller.stop(); assert.equal(signal.aborted, true);
  resolve("reachable"); await flush();
  t.mock.timers.tick(60000); await flush();
  assert.equal(events.length, 0);
});

test("session expiry stops recovery retries without reporting offline", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  const { controller, events } = recovery(async () => { calls++; return "unauthenticated"; });
  controller.check(true);
  t.mock.timers.tick(1000); await flush();
  t.mock.timers.tick(60000); await flush();
  assert.equal(calls, 1);
  assert.deepEqual(events, [["unauthenticated"]]);
  controller.stop();
});

test("hidden tabs do not probe or count suspension as a failure", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let visible = false; let calls = 0; let resolve;
  const { controller, events } = recovery(() => { calls++; return new Promise(r => { resolve = r; }); }, { visible: () => visible });
  controller.check(true);
  t.mock.timers.tick(1000); await flush();
  assert.equal(calls, 0);
  visible = true; controller.check();
  t.mock.timers.tick(1000); await flush();
  visible = false; resolve("unreachable"); await flush();
  assert.equal(events.length, 0);
  visible = true; controller.check();
  t.mock.timers.tick(1000); await flush();
  resolve("reachable"); await flush();
  assert.deepEqual(events, [["reachable", true]]);
  controller.stop();
});

test("timeouts abort probes and stale account results retry without warnings", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let first = true;
  const { controller, events } = recovery(signal => {
    if (first) { first = false; return Promise.resolve("stale"); }
    return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("timeout"))));
  });
  controller.check();
  t.mock.timers.tick(1000); await flush();
  t.mock.timers.tick(1000); await flush();
  t.mock.timers.tick(10000); await flush();
  assert.equal(events.length, 0);
  t.mock.timers.tick(2000); await flush();
  t.mock.timers.tick(10000); await flush();
  assert.deepEqual(events, [["unreachable"]]);
  controller.stop();
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
  assert.equal(await api.probeApiConnection(new AbortController().signal), "unreachable");
  response = Response.json({ user: { id: "u" } });
  assert.equal(await api.probeApiConnection(new AbortController().signal), "reachable");
});

test("probe distinguishes expired sessions, proxy errors and account switches", async () => {
  let response = Response.json({ message: "Sign in required" }, { status: 401 });
  const api = load("apps/web/src/lib/api.ts", { fetch: async () => response });
  assert.equal(await api.probeApiConnection(new AbortController().signal), "unauthenticated");
  response = new Response("<html>gateway failure</html>", { status: 401, headers: { "content-type": "text/html" } });
  assert.equal(await api.probeApiConnection(new AbortController().signal), "unreachable");
  response = Response.json({ user: { id: "original" } });
  await api.getCurrentUser();
  response = Response.json({ user: { id: "different" } });
  assert.equal(await api.probeApiConnection(new AbortController().signal), "unauthenticated");
});
