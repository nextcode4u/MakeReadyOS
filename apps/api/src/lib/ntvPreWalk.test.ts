import assert from "node:assert/strict";
import { test } from "node:test";

test("NTV pre-walk rechecks eligibility and records its transition under the lifecycle lock", async t => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "scheduler-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  process.env.APP_URL = "http://localhost:8080";
  const { prisma } = await import("./prisma.js");
  const { executeScheduledAutomationRules } = await import("./scheduledAutomations.js");
  const stamp = new Date("2026-01-01T12:00:00Z");
  const snapshot = { id: "turn", propertyId: "property", unitNumber: "101", vacancyStatus: "NTV LEASED", isArchived: false, updatedAt: stamp, moveOutDate: stamp, property: { isActive: true } };
  let current: any = snapshot;
  let prior: any = null;
  let locked = false;
  let writes = 0;
  let audits = 0;
  const tx = {
    $queryRaw: async () => { locked = true; return []; },
    makeReadyItem: {
      findUnique: async () => { assert.equal(locked, true); return current; },
      update: async ({ data }: any) => { assert.equal(locked, true); writes++; current = { ...current, ...data }; return current; },
    },
    auditLog: {
      findFirst: async () => { assert.equal(locked, true); return prior; },
      create: async ({ data }: any) => { assert.equal(locked, true); audits++; prior = data; return data; },
    },
  };
  const stub = (target: any, key: string, value: any) => {
    const original = target[key]; target[key] = value; t.after(() => { target[key] = original; });
  };
  stub(prisma, "$transaction", async (work: any) => work(tx));
  stub(prisma.automationRule, "findMany", async () => []);
  stub(prisma.makeReadyItem, "findMany", async ({ where }: any) => {
    assert.deepEqual(where.property, { isActive: true });
    assert.deepEqual(where.propertyId, { in: ["property"] });
    return [snapshot];
  });
  stub(prisma.makeReadyItem, "update", async () => { throw new Error("Unprotected lifecycle write"); });
  stub(prisma.auditLog, "findMany", async () => []);
  stub(prisma.user, "findMany", async () => []);
  const run = () => executeScheduledAutomationRules({ mode: "SCHEDULED", allowedPropertyIds: ["property"] });
  for (const value of [
    null, { ...snapshot, isArchived: true }, { ...snapshot, vacancyStatus: "VACANT LEASED READY" },
    { ...snapshot, moveOutDate: null }, { ...snapshot, moveOutDate: new Date(Date.now() + 7 * 86400000) },
    { ...snapshot, property: { isActive: false } }, { ...snapshot, updatedAt: new Date(stamp.getTime() + 1) },
  ]) {
    current = value; locked = false;
    const result = await run();
    assert.equal(locked, true);
    assert.equal(result.actionCount, 0);
    assert.deepEqual(result.lifecycle?.errors, []);
  }
  assert.equal(writes, 0);
  assert.equal(audits, 0);
  current = snapshot; prior = { id: "previous-trigger" };
  assert.equal((await run()).actionCount, 0);
  current = snapshot; prior = null;
  assert.equal((await run()).actionCount, 1);
  assert.equal(current.vacancyStatus, "TO PRE-WALK");
  assert.equal(prior.action, "NTV_PREWALK_TRIGGERED");
  assert.equal(prior.metadata.previousVacancyStatus, "NTV LEASED");
  assert.equal(writes, 1);
  assert.equal(audits, 1);
  assert.equal((await run()).actionCount, 0);
  assert.equal(writes, 1);
  current = snapshot; prior = null;
  stub(prisma.user, "findMany", async () => { throw new Error("Notification lookup unavailable"); });
  const partial = await run();
  assert.equal(partial.actionCount, 1);
  assert.match(partial.lifecycle!.errors.join(";"), /transition saved, but notification delivery failed/);
});
