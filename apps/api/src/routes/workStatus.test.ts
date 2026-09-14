import assert from "node:assert/strict";
import test from "node:test";

test("work views refresh stale turn warnings without writing records", async t => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "work-status-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  const { prisma } = await import("../lib/prisma.js");
  const { collaborationRoutes } = await import("./collaboration.js");
  const { default: Fastify } = await import("fastify");
  const stub = (delegate: any, name: string, fn: (...args: any[]) => unknown) => {
    const original = delegate[name]; delegate[name] = fn;
    t.after(() => { delegate[name] = original; });
  };
  const old = new Date(2020, 0, 1);
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const property = { id: "p", code: "P", name: "Property", operatingCalendar: null };
  const base = { propertyId: "p", property, assignedTech: "Tech", boardGroup: "WORK", isArchived: false,
    makeReadyStatus: "DONE", completionStatus: "NO", makeReadyDate: old, vacatedDate: old,
    moveInDate: tomorrow, updatedAt: old, lastAutomationAt: old, workAssignmentBlocks: [], customFieldValues: [], checklistInstances: [] };
  const stored = [
    { ...base, id: "ready", unitNumber: "101", vacancyStatus: "VACANT_LEASED_READY", overdue: true, moveInSoon: true },
    { ...base, id: "pending", unitNumber: "102", vacancyStatus: "VACANT_NOT_LEASED_NOT_READY", overdue: false, moveInSoon: false },
  ];
  stub(prisma.makeReadyItem, "findMany", async () => stored);
  for (const delegate of [prisma.projectRecord, prisma.preventiveMaintenanceTask, prisma.pestIssue, prisma.leaseComplianceIssue, prisma.workSession, prisma.property]) stub(delegate, "findMany", async () => []);
  stub(prisma.user, "findMany", async () => [{ id: "tech", fullName: "Tech", role: "TECH" }]);
  stub(prisma, "$transaction", async fn => fn(prisma));
  const app = Fastify();
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => { request.currentUser = { id: "tech", fullName: "Tech", role: "TECH", propertyAccess: [{ propertyId: "p" }] } as any; });
  await app.register(collaborationRoutes);
  t.after(() => app.close());
  const response = await app.inject("/my-work");
  assert.equal(response.statusCode, 200, response.body);
  const result = response.json();
  assert.equal(result.items.find((item: any) => item.id === "ready").overdue, false);
  assert.equal(result.items.find((item: any) => item.id === "pending").overdue, true);
  assert.equal(result.stats.overdue, 1);
  assert.equal(result.stats.dueSoon, 1);
  assert.equal(result.items[0].id, "pending", "Current overdue work comes before stale ready warnings");
  assert.equal(result.items[0].lastAutomationAt, old.toISOString());
  const assignedResponse = await app.inject("/assigned-work?propertyId=p");
  assert.equal(assignedResponse.statusCode, 200, assignedResponse.body);
  const assigned = assignedResponse.json();
  assert.equal(assigned.entries.find((item: any) => item.sourceId === "ready").overdue, false);
  assert.equal(assigned.entries.find((item: any) => item.sourceId === "pending").overdue, true);
  assert.equal(assigned.summary.overdueAssignments, 1);
  assert.equal(assigned.entries[0].sourceId, "pending");
  assert.equal(stored[0].overdue, true);
  assert.equal(stored[1].overdue, false);
});
