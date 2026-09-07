import assert from "node:assert/strict";
import { test } from "node:test";

process.env.ADMIN_USERNAME = "assignment-test";
process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";

test("percentage assignment persists a fair sequence independent of active workload", async () => {
  const { nextTurnAssignee, turnSharesSchema } = await import("./turnAssignments.js");
  const shares = [{ userId: "manager", percent: 25 }, { userId: "tech", percent: 75 }];
  let credits = {};
  const counts: Record<string, number> = { manager: 0, tech: 0 };
  for (let i = 0; i < 100; i++) {
    const result = nextTurnAssignee(shares, JSON.parse(JSON.stringify(credits)));
    credits = result.credits;
    counts[result.userId]++;
    if ((i + 1) % 4 === 0) assert.equal(counts.tech, counts.manager * 3);
  }
  assert.deepEqual(counts, { manager: 25, tech: 75 });
  assert.equal(nextTurnAssignee([{ userId: "manager", percent: 100 }], {}).userId, "manager");
  assert.equal(turnSharesSchema.safeParse([{ userId: "a", percent: 25 }]).success, false);
  assert.equal(turnSharesSchema.safeParse([{ userId: "a", percent: 50 }, { userId: "a", percent: 50 }]).success, false);
  assert.equal(turnSharesSchema.safeParse([{ userId: "a", percent: 0 }, { userId: "b", percent: 100 }]).success, false);
});

test("assignment eligibility preserves existing work and rejects unsafe staff choices", async () => {
  const { isAssignableTurn, validateTurnStaff } = await import("./turnAssignments.js");
  const item = { isArchived: false, completionStatus: "NO", assignedTech: null, vacancyStatus: "VACANT NOT LEASED NOT READY", vacatedDate: new Date("2020-01-01") };
  assert.equal(isAssignableTurn(item), true);
  for (const vacancyStatus of ["VACANT LEASED READY", "VACANT NOT LEASED READY", "NTV LEASED", "NTV NOT LEASED", "OCCUPIED", "UNKNOWN", null]) assert.equal(isAssignableTurn({ ...item, vacancyStatus }), false);
  assert.equal(isAssignableTurn({ ...item, assignedTech: "Someone" }), false);
  assert.equal(isAssignableTurn({ ...item, isArchived: true }), false);
  assert.equal(isAssignableTurn({ ...item, completionStatus: " completed " }), false);
  assert.equal(isAssignableTurn({ ...item, vacatedDate: null }), false);
  assert.equal(isAssignableTurn({ ...item, vacatedDate: new Date("2099-01-01") }), false);
  const shares = [{ userId: "a", percent: 100 }];
  assert.ok(validateTurnStaff(shares, []));
  assert.ok(validateTurnStaff(shares, [{ id: "a", fullName: "Same" }, { id: "b", fullName: "Same" }]));
  assert.equal(validateTurnStaff(shares, [{ id: "a", fullName: "Distinct" }]), null);
});

test("percentage routes reject non-managers and out-of-scope managers before database access", async t => {
  const { prisma } = await import("./prisma.js");
  const { turnAssignmentRoutes } = await import("../routes/turnAssignments.js");
  const { default: Fastify } = await import("fastify");
  let role = "TECH";
  const original = prisma.property.findFirst;
  prisma.property.findFirst = (async () => { throw new Error("Must not read inaccessible property"); }) as any;
  t.after(() => { prisma.property.findFirst = original; });
  const app = Fastify();
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => { request.currentUser = { id: "test", role, propertyAccess: [{ propertyId: "allowed" }] } as any; });
  await app.register(turnAssignmentRoutes);
  t.after(() => app.close());
  for (const nextRole of ["TECH", "CLEANER", "LEASING", "VIEWER", "MANAGER"]) {
    role = nextRole;
    for (const method of ["GET", "PUT", "POST"] as const) {
      const response = await app.inject({ method, url: `/automations/turn-assignment/outside${method === "POST" ? "/run" : ""}` });
      assert.equal(response.statusCode, 403, response.body);
    }
  }
});

test("assignment notifications use the supplied transaction and honor opt-out", async () => {
  const { createNotification } = await import("./notifications.js");
  let enabled = false;
  let writes = 0;
  const tx = {
    userNotificationSettings: { findUnique: async () => null },
    notificationPreference: { findMany: async () => [{ scopeKey: "GLOBAL", enabled }] },
    notification: { upsert: async (input: any) => { writes++; assert.equal(input.create.userId, "selected"); return input.create; } },
  };
  const input = { userId: "selected", propertyId: "p", itemId: "i", category: "ASSIGNMENT" as const, title: "Assigned", message: "Assigned", dedupeKey: "turn-split:i:selected" };
  assert.equal(await createNotification(input, tx as any), null);
  assert.equal(writes, 0);
  enabled = true;
  await createNotification(input, tx as any);
  assert.equal(writes, 1);
});
