import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { healthRoutes, isHealthRequest } from "./health.js";
import { checkUploadStorage, createReadinessCheck } from "../lib/readiness.js";

test("public health checks isolate dependencies and redact failures", async () => {
  const app = Fastify();
  let dbFails = false;
  let storageFails = false;
  await healthRoutes(app, {
    database: async () => { if (dbFails) throw new Error("secret database address"); },
    uploads: async () => { if (storageFails) throw new Error("private storage path"); },
  }, { cacheMs: 0 });
  try {
    for (const url of ["/health", "/api/health", "/api/health/ready", "/api/health/database", "/api/health/uploads"]) {
      const result = await app.inject({ url });
      assert.equal(result.statusCode, 200);
      assert.equal(result.headers["cache-control"], "no-store");
    }
    dbFails = true;
    assert.equal((await app.inject({ url: "/api/health" })).statusCode, 200);
    assert.equal((await app.inject({ url: "/api/health/uploads" })).statusCode, 200);
    assert.equal((await app.inject({ url: "/api/health/database" })).statusCode, 503);
    let result = await app.inject({ url: "/api/health/ready" });
    assert.equal(result.statusCode, 503);
    assert.deepEqual(result.json(), { ok: false, checks: { api: true, database: false, uploads: true } });
    dbFails = false;
    storageFails = true;
    result = await app.inject({ url: "/api/health/ready" });
    assert.deepEqual(result.json(), { ok: false, checks: { api: true, database: true, uploads: false } });
    assert.equal((await app.inject({ url: "/api/health/uploads" })).statusCode, 503);
    assert.equal((await app.inject({ method: "HEAD", url: "/api/health" })).body, "");
  } finally { await app.close(); }
});

test("only exact health GET/HEAD paths bypass session loading", () => {
  assert.equal(isHealthRequest("GET", "/api/health/ready?check=1"), true);
  assert.equal(isHealthRequest("HEAD", "/health"), true);
  for (const url of ["/api/health/admin", "/api/admin", "/api/health/../admin"]) assert.equal(isHealthRequest("GET", url), false);
  assert.equal(isHealthRequest("POST", "/api/health"), false);
});

test("probes share concurrent calls and cache successful and failed results", async () => {
  for (const fails of [false, true]) {
    let calls = 0;
    const check = createReadinessCheck(async () => { calls++; if (fails) throw new Error("private"); });
    assert.deepEqual(await Promise.all([check(), check(), check()]), [!fails, !fails, !fails]);
    assert.equal(await check(), !fails);
    assert.equal(calls, 1);
  }
});

test("timeouts do not pile up stalled probes and recover after settlement", async () => {
  let calls = 0;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const check = createReadinessCheck(async () => { calls++; await pending; }, { timeoutMs: 10, cacheMs: 0 });
  assert.equal(await check(), false);
  assert.equal(await check(), false);
  assert.equal(calls, 1);
  release();
  assert.equal(await check(), true);
  assert.equal(await check(), true);
});

test("storage check requires an accessible directory and never creates a missing one", async () => {
  const root = await mkdtemp(join(tmpdir(), "readiness-"));
  try {
    await checkUploadStorage(root);
    const file = join(root, "not-a-directory");
    await writeFile(file, "test");
    await assert.rejects(checkUploadStorage(file));
    await assert.rejects(checkUploadStorage(join(root, "missing")));
  } finally { await rm(root, { recursive: true, force: true }); }
});
