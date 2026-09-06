import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "../apps/api/node_modules/typescript/lib/typescript.js";

function queue(options = {}) {
  const exports = {};
  let online = false;
  let checks = 0;
  const context = {
    exports,
    require: () => ({ ApiError: class ApiError extends Error {} }),
    Error,
    navigator: { get onLine() { checks++; return online; } },
  };
  const source = ts.transpileModule(readFileSync("apps/web/src/lib/offlineSync.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, context);
  if (options.jobs) {
    context.testJobs = options.jobs;
    context.testDeliver = options.deliver;
    // Test delivery orchestration separately from IndexedDB transaction mechanics.
    vm.runInNewContext(`
      withStore = async (_mode, work) => work({});
      readAll = async () => testJobs.slice();
      writeJob = async (_store, job) => {
        const index = testJobs.findIndex(entry => entry.id === job.id);
        if (index >= 0) testJobs[index] = job;
      };
      deleteJob = async (_store, id) => {
        const index = testJobs.findIndex(entry => entry.id === id);
        if (index >= 0) testJobs.splice(index, 1);
      };
      syncJob = testDeliver;
    `, context);
  }
  return { exports, context, connect: () => { online = true; }, checks: () => checks };
}

test("offline sync releases its lock before the next online attempt", async () => {
  const fixture = queue();
  await fixture.exports.syncOfflineJobs();
  fixture.connect();
  await fixture.exports.syncOfflineJobs();
  assert.equal(fixture.checks(), 2);
});

for (const order of ["manual/manual", "automatic/manual", "manual/automatic"]) {
  test(`offline ${order} attempts share one delivery`, async () => {
    let release;
    const held = new Promise(resolve => { release = resolve; });
    let calls = 0;
    const jobs = [{ id: "job", createdAt: "2026-09-06", attemptCount: 0, lastError: null, lastAttemptAt: null }];
    const fixture = queue({ jobs, deliver: async () => { calls++; await held; } });
    fixture.connect();
    const invoke = kind => kind === "automatic" ? fixture.exports.syncOfflineJobs() : fixture.exports.retryOfflineSyncJob("job");
    const [firstKind, secondKind] = order.split("/");
    const first = invoke(firstKind);
    await new Promise(resolve => setImmediate(resolve));
    const second = invoke(secondKind);
    await new Promise(resolve => setImmediate(resolve));
    try {
      assert.equal(calls, 1, "a pending delivery must not be submitted again");
    } finally {
      release();
      await Promise.all([first, second]);
    }
    assert.equal(jobs.length, 0);
  });
}

test("a rejected offline delivery releases its per-job lock for retry", async () => {
  let calls = 0;
  const jobs = [{ id: "job", createdAt: "2026-09-06", attemptCount: 0, lastError: null, lastAttemptAt: null }];
  const fixture = queue({ jobs, deliver: async () => {
    if (++calls === 1) throw new Error("Rejected save");
  } });
  fixture.connect();
  await assert.rejects(fixture.exports.retryOfflineSyncJob("job"), /Rejected save/);
  assert.equal(jobs[0].attemptCount, 1);
  assert.equal((await fixture.exports.retryOfflineSyncJob("job")).synced, true);
  assert.equal(calls, 2);
  assert.equal(jobs.length, 0);
});

test("queue storage failures do not permanently lock automatic sync", async () => {
  const fixture = queue();
  fixture.connect();
  fixture.context.indexedDB = { open() { throw new Error("Storage unavailable"); } };
  await assert.rejects(fixture.exports.syncOfflineJobs(), /Storage unavailable/);
  fixture.context.indexedDB = undefined;
  const result = await fixture.exports.syncOfflineJobs();
  assert.equal(result.remaining, 0);
  assert.equal(fixture.checks(), 2);
});
