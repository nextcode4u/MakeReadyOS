import assert from "node:assert/strict";
import { test } from "node:test";

test("weekday turn pack fills five dates, preserving existing dates and excluding completed work", async () => {
  process.env.ADMIN_USERNAME = "turn-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  const { turnDefinitions, turnSetupSchema, turnStages } = await import("./turnSetup.js");
  const { applyRules } = await import("./board.js");
  const ids = new Map(turnStages.filter((stage) => stage.custom).map((stage) => [stage.field, stage.field]));
  const definitions = turnDefinitions("p", [1, 1, 1, 1, 1], ids);
  const rules = definitions.map((rule, index) => ({ ...rule, id: String(index) }));
  const item = { vacatedDate: new Date(2026, 8, 4), completionStatus: "NO", makeReadyDate: null, flooringDate: null };
  const calendar = { noWeekendScheduling: true, avoidMondayScheduling: false, avoidFridayScheduling: false };
  const result = applyRules(item as any, rules, {}, { operatingCalendar: calendar });
  assert.equal(result.next.makeReadyDate?.getDate(), 11);
  assert.equal(result.next.flooringDate?.getDate(), 10);
  assert.deepEqual(result.customFieldUpdates.map((entry) => entry.value), ["2026-09-07", "2026-09-08", "2026-09-09"]);
  const existing = new Date(2026, 8, 20);
  const again = applyRules({ ...item, makeReadyDate: existing } as any, rules, { turnPaintingDate: "2026-09-21" }, { operatingCalendar: calendar });
  assert.equal(again.next.makeReadyDate, existing);
  assert.equal(again.customFieldUpdates.some((entry) => entry.fieldId === "turnPaintingDate"), false);
  for (const completionStatus of ["DONE", "YES", "GOOD", "COMPLETE", "COMPLETED"]) assert.equal(applyRules({ ...item, completionStatus } as any, rules, {}, { operatingCalendar: calendar }).logs.length, 0);
  assert.equal(applyRules({ ...item, vacatedDate: null } as any, rules).logs.length, 0);
  assert.equal(turnSetupSchema.safeParse({ propertyId: "p", days: [0, 1, 1, 1, 1] }).success, false);
  assert.equal(turnSetupSchema.safeParse({ propertyId: "p", days: [1, 1] }).success, false);
});

test("turn setup rejects non-managers and inaccessible properties before writes", async (t) => {
  const { prisma } = await import("./prisma.js");
  const { turnSetupRoutes } = await import("../routes/turnSetup.js");
  const { default: Fastify } = await import("fastify");
  let role = "TECH";
  let reads = 0;
  const original = prisma.property.findFirst;
  prisma.property.findFirst = (async () => { reads++; return null; }) as any;
  t.after(() => { prisma.property.findFirst = original; });
  const app = Fastify();
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => { request.currentUser = { id: "test", role, propertyAccess: [{ propertyId: "allowed" }] } as any; });
  await app.register(turnSetupRoutes);
  t.after(() => app.close());
  for (const action of ["preview", "enable", "pause"]) {
    for (const userRole of ["TECH", "LEASING", "CLEANER", "VIEWER", "MANAGER"]) {
      role = userRole;
      const response = await app.inject({ method: "POST", url: `/automations/turn-setup/${action}`, payload: { propertyId: "outside", days: [1, 1, 1, 1, 1] } });
      assert.equal(response.statusCode, 403, response.body);
    }
  }
  assert.equal(reads, 0);
});

test("guided scheduler checks enabled guided rules every five minutes and stops cleanly", async (t) => {
  const { prisma } = await import("./prisma.js");
  const { startTurnScheduler } = await import("./turnScheduler.js");
  const original = prisma.automationRule.findMany;
  let calls = 0;
  prisma.automationRule.findMany = (async (query: any) => {
    calls++;
    assert.deepEqual(query.where, { templateId: { startsWith: "guided-turn:" }, enabled: true, isArchived: false, property: { isActive: true } });
    return [];
  }) as any;
  t.after(() => { prisma.automationRule.findMany = original; });
  t.mock.timers.enable({ apis: ["setInterval"] });
  const stop = startTurnScheduler();
  t.mock.timers.tick(299999);
  assert.equal(calls, 0);
  t.mock.timers.tick(1);
  assert.equal(calls, 1);
  await stop();
  t.mock.timers.tick(300000);
  assert.equal(calls, 1);
});
