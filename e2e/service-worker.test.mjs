import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

function worker() {
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
    self: { location: { origin: "http://localhost:8080" }, addEventListener: (name, callback) => listeners.set(name, callback) },
    caches, URL, Response, fetch: request => network(request),
  });
  return {
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
  for (const path of ["/api/admin/export", "/api/admin/users", "/api/refrigerant/reports/full-audit", "/api/refrigerant/export.csv", "/api/auth/csrf"]) {
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
