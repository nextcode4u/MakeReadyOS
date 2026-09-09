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
    require: () => ({ ApiError: class ApiError extends Error {}, ...options.api }),
    Error,
    File,
    structuredClone,
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
      readAll = async () => testJobs.map(job => structuredClone(job));
      writeJob = async (_store, job) => {
        const index = testJobs.findIndex(entry => entry.id === job.id);
        if (index >= 0) testJobs[index] = structuredClone(job);
      };
      deleteJob = async (_store, id) => {
        const index = testJobs.findIndex(entry => entry.id === id);
        if (index >= 0) testJobs.splice(index, 1);
      };
      if (testDeliver) syncJob = testDeliver;
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

for (const [kind, create, upload, responseKey] of [
  ["projectCreate", "createProjectRecord", "uploadProjectAttachment", "record"],
  ["leaseCreate", "createLeaseComplianceIssue", "uploadLeaseComplianceIssuePhoto", "issue"],
  ["pestCreate", "createPestIssue", "uploadPestIssueAttachment", "issue"],
]) {
  for (const failureIndex of [0, 1]) {
    test(`${kind} resumes confirmed creation and uploads after photo ${failureIndex + 1} fails`, async () => {
      let creates = 0;
      let fail = true;
      const attempts = [];
      const files = ["first.jpg", "second.jpg"].map(name => ({ name, mimeType: "image/jpeg", lastModified: 1, blob: new Blob([name]), attachmentType: "PHOTO", caption: null }));
      const jobs = [{ id: "job", createdAt: "2026-09-06", attemptCount: 0, payload: { kind, input: {}, files } }];
      const api = {
        [create]: async () => { creates++; return { [responseKey]: { id: "confirmed" } }; },
        [upload]: async (id, file) => {
          assert.equal(id, "confirmed");
          attempts.push(file.name);
          if (fail && file.name === files[failureIndex].name) throw new Error("Upload interrupted");
        },
      };
      let fixture = queue({ jobs, api });
      fixture.connect();
      await assert.rejects(fixture.exports.retryOfflineSyncJob("job"), /Upload interrupted/);
      assert.equal(jobs[0].serverRecordId, "confirmed");
      assert.equal(jobs[0].payload.files.length, 2 - failureIndex);
      fail = false;
      // A fresh module instance models a reload, using only durable queue state.
      fixture = queue({ jobs, api });
      fixture.connect();
      await fixture.exports.retryOfflineSyncJob("job");
      assert.equal(creates, 1);
      assert.equal(attempts.filter(name => name === "first.jpg").length, failureIndex === 0 ? 2 : 1);
      assert.equal(jobs.length, 0);
    });
  }
}

test("queue deletion failure retries cleanup without repeating a confirmed action", async () => {
  let calls = 0;
  const jobs = [{ id: "job", createdAt: "2026-09-06", attemptCount: 0, payload: { kind: "poolCreate", input: {} } }];
  const api = { createPoolLogEntry: async () => { calls++; return { entry: { id: "saved" } }; } };
  let fixture = queue({ jobs, api });
  fixture.connect();
  vm.runInNewContext('deleteJob = async () => { throw new Error("Cleanup failed"); };', fixture.context);
  await assert.rejects(fixture.exports.retryOfflineSyncJob("job"), /Cleanup failed/);
  assert.equal(jobs[0].deliveryComplete, true);
  fixture = queue({ jobs, api });
  fixture.connect();
  await fixture.exports.retryOfflineSyncJob("job");
  assert.equal(calls, 1);
  assert.equal(jobs.length, 0);
});

test("initial walk uploads keep their stage across an interrupted delivery and reload", async () => {
  const files = ["inside.png", "outside.png"].map(name => ({ name, mimeType: "image/png", lastModified: 1, blob: new Blob([name]) }));
  const jobs = [{ id: "initial", createdAt: "2026-09-08", attemptCount: 0, payload: { kind: "makeReadyUpload", itemId: "turn", inspectionStage: "INITIAL_WALK", files } }];
  const calls = [];
  let fail = true;
  const api = { uploadItemAttachment: async (id, file, stage) => {
    assert.equal(id, "turn"); assert.equal(stage, "INITIAL_WALK");
    calls.push(file.name);
    if (fail && file.name === "outside.png") throw new Error("Interrupted upload");
  } };
  let fixture = queue({ jobs, api }); fixture.connect();
  await assert.rejects(fixture.exports.retryOfflineSyncJob("initial"), /Interrupted/);
  assert.equal(jobs[0].payload.inspectionStage, "INITIAL_WALK");
  fail = false;
  fixture = queue({ jobs, api }); fixture.connect();
  await fixture.exports.retryOfflineSyncJob("initial");
  assert.deepEqual(calls, ["inside.png", "outside.png", "outside.png"]);
  assert.equal(jobs.length, 0);
});
