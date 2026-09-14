import assert from "node:assert/strict";
import { test } from "node:test";
import { uploadBatch } from "../apps/web/src/lib/uploadBatch.ts";

const files = ["first.png", "second.png", "third.png"].map(name => ({ name }));
const errorStatus = (error: unknown) => (error as { status?: number })?.status;
test("upload batch continues after validation failure and reports actual confirmations", async () => {
  const attempted: string[] = [];
  const outcomes = await uploadBatch(files, {
    current: () => true, progress: () => {}, errorStatus,
    upload: async file => { attempted.push(file.name); if (file === files[1]) throw Object.assign(new Error("Unsupported image"), { status: 400 }); },
    queue: async () => { assert.fail("validation errors must not enter automatic retries"); },
  });
  assert.deepEqual(attempted, files.map(file => file.name));
  assert.deepEqual(outcomes.map(row => row.status), ["UPLOADED", "FAILED", "UPLOADED"]);
});
test("upload batch distinguishes queue success from storage failure", async () => {
  const outcomes = await uploadBatch(files.slice(0, 2), {
    current: () => true, progress: () => {}, errorStatus,
    upload: async () => { throw { status: 0 }; },
    queue: async file => { if (file === files[1]) throw new Error("Device storage full"); },
  });
  assert.deepEqual(outcomes.map(row => row.status), ["QUEUED", "UNCONFIRMED"]);
  assert.match(outcomes[1].message!, /storage full/);
});
test("server failures do not falsely claim an attachment was not stored", async () => {
  const outcomes = await uploadBatch(files.slice(0, 1), {
    current: () => true, progress: () => {}, errorStatus,
    upload: async () => { throw { status: 503 }; }, queue: async () => assert.fail("server failure automatically queued"),
  });
  assert.equal(outcomes[0].status, "UNCONFIRMED");
  assert.match(outcomes[0].message!, /may already have stored/);
});
test("upload batch stops after access failures and never delivers across an account change", async () => {
  for (const status of [401, 403, 404]) {
    let attempts = 0;
    const outcomes = await uploadBatch(files, { current: () => true, progress: () => {}, errorStatus,
      upload: async () => { attempts++; throw { status }; }, queue: async () => assert.fail("access failure queued") });
    assert.equal(attempts, 1);
    assert.deepEqual(outcomes.map(row => row.status), ["FAILED", "NOT_ATTEMPTED", "NOT_ATTEMPTED"]);
  }
  let current = true;
  let attempts = 0;
  await uploadBatch(files, { current: () => current, progress: () => assert.fail("old account progress exposed"), errorStatus,
    upload: async () => { attempts++; current = false; throw { status: 0 }; }, queue: async () => assert.fail("queued for changed account") });
  assert.equal(attempts, 1);
});
