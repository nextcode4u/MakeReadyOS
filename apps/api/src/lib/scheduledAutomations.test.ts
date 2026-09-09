import assert from "node:assert/strict";
import { test } from "node:test";

test("scheduled writes recheck paused rules and changed or archived items under the lifecycle lock", async t => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "scheduler-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  process.env.APP_URL = "http://localhost:8080";
  const { prisma } = await import("./prisma.js");
  const { executeScheduledAutomationRules } = await import("./scheduledAutomations.js");
  const stamp = new Date("2026-09-08T12:00:00Z");
  const rule = { id: "rule", name: "Set note", propertyId: "property", enabled: true, isArchived: false, updatedAt: stamp, triggerType: "SCHEDULED_CHECK", conditions: { all: [{ field: "unitNumber", operator: "equals", value: "101" }] }, actions: [{ type: "setField", field: "notes", value: "After" }] };
  const item = { id: "turn", unitNumber: "101", propertyId: "property", updatedAt: stamp, isArchived: false, notes: "Before", makeReadyStatus: "LITE", completionStatus: "NO", property: { code: "QA", isActive: true, operatingCalendar: null }, customFieldValues: [] };
  let liveRule: any = rule;
  let liveItem: any = item;
  let locked = false;
  let writes = 0;
  const tx = {
    $queryRaw: async () => { locked = true; return []; },
    automationRule: { findUnique: async () => liveRule },
    makeReadyItem: {
      findUnique: async () => liveItem,
      update: async ({ data }: any) => { assert.equal(locked, true); writes++; return { ...liveItem, ...data }; },
    },
  };
  const stub = (target: any, key: string, value: any) => {
    const original = target[key]; target[key] = value; t.after(() => { target[key] = original; });
  };
  stub(prisma, "$transaction", async (work: any) => work(tx));
  stub(prisma.automationRule, "findMany", async () => [rule]);
  stub(prisma.property, "findUnique", async () => ({ id: "property" }));
  stub(prisma.makeReadyItem, "findMany", async () => [item]);
  stub(prisma.automationRun, "create", async ({ data }: any) => data);
  for (const [nextRule, nextItem] of [
    [{ ...rule, enabled: false }, item], [{ ...rule, isArchived: true }, item],
    [{ ...rule, updatedAt: new Date(stamp.getTime() + 1) }, item], [null, item],
    [rule, null], [rule, { ...item, isArchived: true }],
    [rule, { ...item, property: { ...item.property, isActive: false } }],
    [rule, { ...item, updatedAt: new Date(stamp.getTime() + 1) }],
  ]) {
    liveRule = nextRule; liveItem = nextItem; locked = false;
    const result = await executeScheduledAutomationRules({ ruleId: "rule", mode: "SCHEDULED" });
    assert.equal(locked, true);
    assert.equal(result.actionCount, 0);
    assert.deepEqual(result.results[0].errors, []);
    assert.match(result.results[0].warnings.join(";"), /changed after simulation/);
  }
  assert.equal(writes, 0);
  liveRule = rule; liveItem = item; locked = false;
  const result = await executeScheduledAutomationRules({ ruleId: "rule", mode: "SCHEDULED" });
  assert.equal(writes, 1);
  assert.equal(result.actionCount, 1);
  assert.deepEqual(result.results[0].errors, []);
  stub(prisma.automationRule, "findMany", async () => [rule, { ...rule, id: "next-rule" }]);
  const recorded: string[] = [];
  stub(prisma.automationRun, "create", async ({ data }: any) => {
    if (data.ruleId === "rule") throw Object.assign(new Error("Deleted rule foreign key"), { code: "P2003" });
    recorded.push(data.ruleId);
    return data;
  });
  // The stubbed query supplies two rule snapshots to exercise per-rule isolation.
  const continued = await executeScheduledAutomationRules({ ruleId: "rule", mode: "SCHEDULED" });
  assert.equal(continued.rulesEvaluated, 2);
  assert.match(continued.results[0].errors.join(";"), /Run history could not be saved/);
  assert.match(continued.results[0].errors.join(";"), /may already have been applied/);
  assert.deepEqual(recorded, ["next-rule"]);
  assert.deepEqual(continued.results[1].errors, []);
});
