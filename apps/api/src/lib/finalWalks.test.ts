import assert from "node:assert/strict";
import { test } from "node:test";
process.env.ADMIN_USERNAME = "final-walk-test";
process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";

test("final walk handoff follows order, skips ineligible users and never wraps", async () => {
  const { nextInspector } = await import("./finalWalks.js");
  const queue = ["leasing", "backup", "manager"];
  assert.equal(nextInspector(queue, null, queue), "leasing");
  assert.equal(nextInspector(queue, "leasing", ["leasing", "manager"]), "manager");
  assert.equal(nextInspector(queue, "manager", queue), undefined);
  assert.equal(nextInspector(queue, "unknown", queue), undefined);
  assert.equal(nextInspector(queue, null, []), undefined);
});

test("initial inspection and handoff skip the repair assignee without reordering backups", async () => {
  const { independentInspectors, nextInspector } = await import("./finalWalks.js");
  const staff = [{ id: "tech", fullName: "Repair Tech" }, { id: "leasing", fullName: "Leasing" }, { id: "manager", fullName: "Manager" }];
  const eligible = independentInspectors(staff, " repair TECH ").map(user => user.id);
  assert.deepEqual(eligible, ["leasing", "manager"]);
  assert.equal(nextInspector(["tech", "leasing", "manager"], null, eligible), "leasing");
  assert.equal(nextInspector(["leasing", "tech", "manager"], "leasing", eligible), "manager");
  assert.deepEqual(independentInspectors(staff, null), staff);
  assert.deepEqual(independentInspectors(staff, " "), staff);
  assert.deepEqual(independentInspectors([staff[0]], "Repair Tech"), []);
});

test("final walk settings reject non-managers and out-of-scope managers", async t => {
  const { finalWalkRoutes } = await import("../routes/finalWalks.js");
  const { default: Fastify } = await import("fastify");
  const app = Fastify();
  let role = "TECH";
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => { request.currentUser = { id: "u", role, propertyAccess: [{ propertyId: "allowed" }] } as any; });
  await app.register(finalWalkRoutes);
  t.after(() => app.close());
  for (const value of ["TECH", "LEASING", "VIEWER", "MANAGER"]) {
    role = value;
    for (const method of ["GET", "PUT"] as const) assert.equal((await app.inject({ method, url: "/automations/final-walk/outside" })).statusCode, 403);
  }
});

test("availability-ready turns do not create inspections or turn pending inspections into performed history", async t => {
  const { prisma } = await import("./prisma.js");
  const { syncFinalWalks } = await import("./finalWalks.js");
  const original = prisma.$transaction;
  const updates: any[] = [];
  const db = {
    $queryRaw: async () => [],
    finalWalkPolicy: { findUnique: async () => ({ enabled: true, inspectors: ["inspector"] }) },
    user: { findMany: async () => [{ id: "inspector", fullName: "Inspector" }] },
    makeReadyItem: { findMany: async () => [
      { id: "new", makeReadyStatus: "DONE", completionStatus: "NO", vacancyStatus: "VACANT_LEASED_READY", paintStatus: "DONE", cleaningStatus: "DONE" },
      { id: "existing", makeReadyStatus: "DONE", completionStatus: "NO", vacancyStatus: "VACANT_NOT_LEASED_READY", paintStatus: "DONE", cleaningStatus: "DONE" },
    ] },
    workAssignmentBlock: {
      findMany: async ({ where }: any) => where.itemId === "existing" ? [{ id: "pending-inspection" }] : [],
      create: async () => { throw new Error("A ready import must not create a new inspection"); },
      updateMany: async (query: any) => { updates.push(query); return { count: 1 }; },
    },
  };
  prisma.$transaction = (async (fn: any) => fn(db)) as typeof prisma.$transaction;
  t.after(() => { prisma.$transaction = original; });
  assert.deepEqual(await syncFinalWalks("property"), { assigned: 0 });
  assert.deepEqual(updates.find(query => query.where.id.in.includes("pending-inspection"))?.data, { status: "CANCELED" });
  assert.ok(updates.every(query => query.data.status !== "DONE"));
});

test("ready-import inspection view reports readiness without inventing inspection evidence", async t => {
  const { prisma } = await import("./prisma.js");
  const { finalWalkRoutes } = await import("../routes/finalWalks.js");
  const { default: Fastify } = await import("fastify");
  const originalItem = prisma.makeReadyItem.findUnique;
  const originalBlock = prisma.workAssignmentBlock.findFirst;
  const originalStaff = prisma.user.findMany;
  t.after(() => {
    prisma.makeReadyItem.findUnique = originalItem;
    prisma.workAssignmentBlock.findFirst = originalBlock;
    prisma.user.findMany = originalStaff;
  });
  prisma.makeReadyItem.findUnique = (async () => ({
    id: "ready-import", propertyId: "allowed", vacancyStatus: "VACANT_LEASED_READY",
    makeReadyStatus: null, completionStatus: "NO", paintStatus: null, cleaningStatus: null,
    assignedTech: "Tech", isArchived: false,
  })) as unknown as typeof prisma.makeReadyItem.findUnique;
  let inspectionReads = 0;
  prisma.workAssignmentBlock.findFirst = (async () => { inspectionReads++; return null; }) as typeof prisma.workAssignmentBlock.findFirst;
  prisma.user.findMany = (async () => []) as typeof prisma.user.findMany;
  const app = Fastify();
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => {
    request.currentUser = { id: "inspector", fullName: "Inspector", role: "LEASING", propertyAccess: [{ propertyId: "allowed" }] } as any;
  });
  await app.register(finalWalkRoutes);
  t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: "/make-ready-items/ready-import/final-walk" });
  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(response.json(), { block: null, reportAvailable: true, unitReady: true, ready: false, blockers: [], next: null });
  assert.equal(inspectionReads, 1, "An import alone must not imply completed inspection history");
});
