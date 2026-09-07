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
  const item = { vacancyStatus: "VACANT NOT LEASED NOT READY", vacatedDate: new Date(2026, 8, 4), completionStatus: "NO", makeReadyDate: null, flooringDate: null };
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
  for (const vacancyStatus of ["VACANT LEASED READY", "VACANT NOT LEASED READY", "NTV LEASED", "NTV NOT LEASED", "OCCUPIED", null]) {
    assert.equal(applyRules({ ...item, vacancyStatus, completionStatus: null } as any, rules).logs.length, 0, `Must skip ${vacancyStatus}`);
  }
  assert.equal(turnSetupSchema.safeParse({ propertyId: "p", days: [0, 1, 1, 1, 1] }).success, false);
  assert.equal(turnSetupSchema.safeParse({ propertyId: "p", days: [1, 1] }).success, false);
  const longerRepairs = turnDefinitions("p", [3, 1, 1, 1, 1], ids).map((rule, index) => ({ ...rule, id: String(index) }));
  const longerResult = applyRules(item as any, longerRepairs, {}, { operatingCalendar: calendar });
  assert.equal(longerResult.customFieldUpdates.find(entry => entry.fieldId === "turnMaintenanceDate")?.value, "2026-09-07");
  assert.equal(longerResult.next.makeReadyDate?.getDate(), 15);
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
  const originalProperties = prisma.property.findMany;
  prisma.property.findMany = (async () => []) as any;
  let calls = 0;
  prisma.automationRule.findMany = (async (query: any) => {
    calls++;
    assert.deepEqual(query.where, { templateId: { startsWith: "guided-turn:" }, enabled: true, isArchived: false, property: { isActive: true } });
    return [];
  }) as any;
  t.after(() => { prisma.automationRule.findMany = original; prisma.property.findMany = originalProperties; });
  t.mock.timers.enable({ apis: ["setInterval"] });
  const stop = startTurnScheduler();
  t.mock.timers.tick(299999);
  assert.equal(calls, 0);
  t.mock.timers.tick(1);
  await stop();
  assert.equal(calls, 1);
  t.mock.timers.tick(300000);
  assert.equal(calls, 1);
});

test("baseline scheduling creates five enabled stages once and preserves paused/customized packs", async () => {
  const { ensureDefaultTurnScheduling } = await import("./defaultTurnScheduling.js");
  const rules: any[] = [];
  let fieldWrites = 0;
  const tx = {
    $queryRaw: async () => [],
    automationRule: { findFirst: async () => rules[0] ?? null, create: async ({ data }: any) => { rules.push(data); return data; } },
    customField: { upsert: async ({ create }: any) => { fieldWrites++; return { ...create, id: create.fieldKey, isArchived: false, deletedAt: null }; } },
    scheduleTrack: { upsert: async ({ update }: any) => { assert.deepEqual(update, {}); } },
    operatingCalendar: { upsert: async ({ update }: any) => { assert.deepEqual(update, { noWeekendScheduling: true }); } },
  };
  assert.equal(await ensureDefaultTurnScheduling(tx as any, "fresh"), true);
  assert.equal(rules.length, 5);
  assert.ok(rules.every(rule => rule.enabled && rule.propertyId === "fresh"));
  assert.deepEqual(rules.map(rule => rule.actions[0].offsetDays), [1, 2, 3, 4, 5]);
  assert.equal(await ensureDefaultTurnScheduling(tx as any, "fresh"), false);
  rules[0].enabled = false;
  rules[0].actions[0].offsetDays = 7;
  assert.equal(await ensureDefaultTurnScheduling(tx as any, "fresh"), false);
  rules[0].isArchived = true;
  assert.equal(await ensureDefaultTurnScheduling(tx as any, "fresh"), false);
  assert.equal(rules.length, 5);
  assert.equal(fieldWrites, 3);
  assert.equal(rules[0].actions[0].offsetDays, 7);
});
