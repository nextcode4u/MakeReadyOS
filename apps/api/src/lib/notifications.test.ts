import assert from "node:assert/strict";
import { test } from "node:test";
import { notificationEnabledByDefault, needToKnowMutedCategories } from "./notificationPolicy.js";

test("need-to-know defaults suppress routine updates without suppressing action requests", () => {
  assert.equal(notificationEnabledByDefault("POND_MILESTONE"), true);
  assert.ok(needToKnowMutedCategories.includes("POND_MILESTONE"));
  for (const category of ["STATUS_CHANGE", "BATCH_CHANGE", "CHECKLIST"]) assert.equal(notificationEnabledByDefault(category), false);
  for (const category of ["ASSIGNMENT", "SCHEDULE", "OVERDUE", "MOVE_IN_SOON", "RISK", "MATERIALS_REQUEST", "ITEM_LIFECYCLE", "COMMENT"]) assert.equal(notificationEnabledByDefault(category), true);
});

test("notification creation respects defaults and explicit property/global overrides", async () => {
  const { createNotification } = await import("./notifications.js");
  let preferences: any[] = [];
  let writes = 0;
  const db = {
    userNotificationSettings: { findUnique: async () => null },
    notificationPreference: { findMany: async () => preferences },
    notification: { create: async ({ data }: any) => { writes++; return data; } },
  } as any;
  const input = { userId: "user", propertyId: "property", category: "STATUS_CHANGE" as const, title: "Routine", message: "Routine" };
  assert.equal(await createNotification(input, db), null);
  assert.equal(writes, 0);
  preferences = [{ scopeKey: "GLOBAL", propertyId: null, enabled: true }];
  assert.ok(await createNotification(input, db));
  preferences.push({ scopeKey: "PROPERTY:property", propertyId: "property", enabled: false });
  assert.equal(await createNotification(input, db), null);
  preferences = [{ scopeKey: "GLOBAL", propertyId: null, enabled: false }, { scopeKey: "PROPERTY:property", propertyId: "property", enabled: true }];
  assert.ok(await createNotification(input, db));
  preferences = [];
  assert.ok(await createNotification({ ...input, category: "MATERIALS_REQUEST" }, db));
  assert.ok(await createNotification({ ...input, category: "ITEM_LIFECYCLE" }, db));
});

test("assignment notification recipients are property-scoped and unambiguous", async (t) => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  const { prisma } = await import("./prisma.js");
  const { assignedStaffUserId } = await import("./notifications.js");
  const original = prisma.user.findMany;
  let matches: any[] = [];
  let queries = 0;
  prisma.user.findMany = (async (query: any) => {
    queries++;
    assert.equal(query.where.fullName, "Same Name");
    assert.equal(query.where.isActive, true);
    assert.deepEqual(query.where.OR, [{ role: "ADMIN" }, { propertyAccess: { some: { propertyId: "property-a" } } }]);
    assert.deepEqual(query.select, { id: true });
    assert.equal(query.take, 2);
    return matches;
  }) as any;
  t.after(() => { prisma.user.findMany = original; });
  assert.equal(await assignedStaffUserId(null, "property-a"), null);
  assert.equal(queries, 0);
  assert.equal(await assignedStaffUserId("Same Name", "property-a"), null);
  matches = [{ id: "eligible" }];
  assert.equal(await assignedStaffUserId("Same Name", "property-a"), "eligible");
  matches.push({ id: "also-eligible" });
  assert.equal(await assignedStaffUserId("Same Name", "property-a"), null);
});
