import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

function worker(extras = {}) {
  const listeners = new Map();
  const stores = new Map();
  let network = async () => Response.json({ value: "fresh" });
  let storageFails = false;
  let deleteFails = false;
  const caches = {
    open: async name => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        put: async (request, response) => {
          if (storageFails) throw new Error("Quota exceeded");
          store.set(request.url ?? request, response.clone());
        },
        match: async request => store.get(request.url ?? request)?.clone(),
      };
    },
    delete: async name => {
      if (deleteFails) throw new Error("Storage unavailable");
      return stores.delete(name);
    },
  };
  vm.runInNewContext(readFileSync("assets/sw.js", "utf8"), {
    self: { location: { origin: "http://localhost:8080" }, addEventListener: (name, callback) => listeners.set(name, callback), ...extras },
    caches, URL, Response, MessageChannel, setTimeout, clearTimeout, fetch: request => network(request),
  });
  return {
    dispatch: async (name, data) => {
      let pending;
      listeners.get(name)({ ...data, waitUntil: value => { pending = value; } });
      await pending;
    },
    network: callback => { network = callback; },
    failStorage: () => { storageFails = true; },
    failDelete: () => { deleteFails = true; },
    request: async (path, method = "GET") => {
      const request = new Request(`http://localhost:8080${path}`, { method, headers: { accept: "application/json" } });
      let response;
      listeners.get("fetch")({ request, respondWith: value => { response = value; } });
      return response ? await response : await network(request);
    },
  };
}

test("on-call schedules and protected guides never use offline API caching", async () => {
  const instance = worker();
  for (const path of ["/api/on-call", "/api/on-call/share"]) {
    instance.network(async () => Response.json({ privateGuide: "Secret" }));
    assert.equal((await instance.request(path)).status, 200);
    instance.network(async () => { throw new Error("Offline"); });
    await assert.rejects(instance.request(path), /Offline/);
  }
});

test("logout removes cached API data and late responses cannot repopulate it", async () => {
  const sw = worker();
  await sw.request("/api/meta");
  sw.network(async () => { throw new Error("Offline"); });
  assert.deepEqual(await (await sw.request("/api/meta")).json(), { value: "fresh" });
  let release;
  sw.network(() => new Promise(resolve => { release = resolve; }));
  const late = sw.request("/api/operations/units");
  await new Promise(resolve => setImmediate(resolve));
  sw.network(async () => Response.json({ ok: true }));
  await sw.request("/api/auth/logout", "POST");
  release(Response.json({ value: "previous user" }));
  assert.equal((await late).status, 0);
  sw.network(async () => { throw new Error("Offline"); });
  assert.equal((await sw.request("/api/meta")).status, 0);
  assert.equal((await sw.request("/api/operations/units")).status, 0);
});

test("session switches and authorization failures clear operational caches", async () => {
  const sw = worker();
  sw.network(async () => Response.json({ user: { id: "admin" } }));
  await sw.request("/api/auth/me");
  await sw.request("/api/meta");
  sw.network(async () => Response.json({ user: { id: "tech" } }));
  await sw.request("/api/auth/me");
  sw.network(async () => { throw new Error("Offline"); });
  assert.equal((await sw.request("/api/meta")).status, 0);
  sw.network(async () => Response.json({ value: "tech" }));
  await sw.request("/api/meta");
  sw.network(async () => Response.json({ message: "Denied" }, { status: 403 }));
  await sw.request("/api/operations/units");
  sw.network(async () => { throw new Error("Offline"); });
  assert.equal((await sw.request("/api/meta")).status, 0);
});

test("admin, export, auth, and no-store responses are not cached", async () => {
  const sw = worker();
  for (const path of ["/api/push", "/api/admin/export", "/api/admin/users", "/api/refrigerant/reports/full-audit", "/api/refrigerant/export.csv", "/api/auth/csrf"]) {
    sw.network(async () => Response.json({ sensitive: true }));
    await sw.request(path);
    sw.network(async () => { throw new Error("Offline"); });
    await assert.rejects(sw.request(path), /Offline/);
  }
  sw.network(async () => Response.json({ sensitive: true }, { headers: { "cache-control": "no-store" } }));
  await sw.request("/api/meta");
  sw.network(async () => { throw new Error("Offline"); });
  assert.equal((await sw.request("/api/meta")).status, 0);
});

test("cache quota failure still returns the fresh server response", async () => {
  const sw = worker();
  await sw.request("/api/meta");
  sw.failStorage();
  sw.network(async () => Response.json({ value: "latest" }));
  assert.deepEqual(await (await sw.request("/api/meta")).json(), { value: "latest" });
});

test("a late identity response cannot restore the previous session after logout", async () => {
  const sw = worker();
  let release;
  sw.network(() => new Promise(resolve => { release = resolve; }));
  const identity = sw.request("/api/auth/me");
  await new Promise(resolve => setImmediate(resolve));
  sw.network(async () => Response.json({ ok: true }));
  await sw.request("/api/auth/logout", "POST");
  release(Response.json({ user: { id: "previous-user" } }));
  assert.equal((await identity).status, 0);
});

test("failed cache deletion does not block logout or expose old data offline", async () => {
  const sw = worker();
  await sw.request("/api/meta");
  sw.failDelete();
  assert.equal((await sw.request("/api/auth/logout", "POST")).status, 200);
  sw.network(async () => { throw new Error("Offline"); });
  assert.equal((await sw.request("/api/meta")).status, 0);
});

test("push displays event context and routes cold and warm clicks without discarding drafts", async () => {
  const displayed = [], opened = [], messages = [];
  let focused = 0, closed = 0, windows = [];
  const sw = worker({
    registration: { showNotification: async (title, options) => displayed.push({ title, ...options }) },
    clients: { matchAll: async () => windows, openWindow: async url => opened.push(url) },
  });
  await sw.dispatch("push", { data: { json: () => ({ title: "MakeReadyOS - DS 2907P", body: "Final walk ready for inspection", tag: "mros-event", itemId: "unit", notificationId: "notice", url: "https://evil.test" }) } });
  assert.equal(displayed[0].title, "MakeReadyOS - DS 2907P");
  assert.equal(displayed[0].body, "Final walk ready for inspection");
  assert.equal(displayed[0].data.itemId, "unit");
  assert.equal(displayed[0].tag, "mros-event");
  await sw.dispatch("push", { data: { json: () => { throw new Error("Malformed"); } } });
  assert.equal(displayed[1].tag, "mros-work");
  const notification = { close: () => { closed++; }, data: { url: "https://evil.test" } };
  await sw.dispatch("notificationclick", { notification });
  assert.deepEqual(opened, ["/?notifications=1"]);
  windows = [{ url: "http://localhost:8080/", postMessage: (value, ports) => { messages.push(value.type); ports[0].postMessage("NOTIFICATION_OPENED"); }, focus: async () => { focused++; }, navigate: () => { throw new Error("Must preserve open drafts"); } }];
  await sw.dispatch("notificationclick", { notification });
  assert.deepEqual(messages, ["OPEN_NOTIFICATIONS"]); assert.equal(focused, 1); assert.equal(closed, 2); assert.equal(opened.length, 1);
  windows = [];
  await sw.dispatch("notificationclick", { notification: { close() {}, data: displayed[0].data } });
  assert.equal(opened.at(-1), "/?notifications=1&notificationId=notice&itemId=unit");
  windows = [{ url: "http://localhost:8080/", postMessage() {}, focus: async () => {} }];
  await sw.dispatch("notificationclick", { notification: { close() {}, data: displayed[0].data } });
  assert.equal(opened.length, 3);
  windows = [{ url: "http://localhost:8080/on-call/", postMessage() { throw new Error("Shared module cannot handle app alerts"); } }];
  await sw.dispatch("notificationclick", { notification });
  assert.equal(opened.length, 4);
});
