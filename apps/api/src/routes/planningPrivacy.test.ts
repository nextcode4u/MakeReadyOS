import assert from "node:assert/strict";
import { test } from "node:test";

test("planning capacity responses exclude credentials and enforce property scope", async (t) => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "planning-privacy-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  process.env.APP_URL = "http://localhost:8080";
  const { prisma } = await import("../lib/prisma.js");
  const { planningRoutes } = await import("./planning.js");
  const { default: Fastify } = await import("fastify");
  const staff = [
    { id: "tech-a", propertyAccess: [{ propertyId: "a" }] },
    { id: "tech-b", propertyAccess: [{ propertyId: "b" }] },
    { id: "shared", propertyAccess: [{ propertyId: "a" }, { propertyId: "b" }] },
  ].map(user => ({ ...user, fullName: user.id, role: "TECH", passwordHash: "DO-NOT-EXPOSE", capacity: null }));
  const stub = (delegate: any, method: string, fn: (...args: any[]) => unknown) => {
    const original = delegate[method];
    delegate[method] = fn;
    t.after(() => { delegate[method] = original; });
  };
  let userQuery: any;
  stub(prisma.user, "findMany", async (args: any) => { userQuery = args; return staff; });
  stub(prisma.user, "findFirst", async ({ where }: any) => staff.find(user => user.id === where.id) ?? null);
  let writes = 0;
  stub(prisma.userCapacity, "upsert", async ({ create }: any) => { writes++; return { id: "capacity", ...create }; });
  stub(prisma.auditLog, "create", async () => ({}));
  stub(prisma.userCapacity, "findMany", async () => staff.map(user => ({ id: `capacity-${user.id}`, user: { id: user.id, fullName: user.fullName, role: user.role } })));
  stub(prisma.makeReadyItem, "findMany", async () => []);
  stub(prisma.workAssignmentBlock, "findMany", async () => []);
  stub(prisma.vendorAssignment, "findMany", async () => []);
  let currentUser: any = { id: "manager-a", role: "MANAGER", propertyAccess: [{ propertyId: "a" }] };
  const app = Fastify();
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => {
    request.currentUser = currentUser;
  });
  await app.register(planningRoutes);
  t.after(() => app.close());
  const response = await app.inject("/planning/capacities");
  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(response.json().users.map((user: any) => user.id), ["tech-a", "shared"]);
  assert.equal(response.body.includes("DO-NOT-EXPOSE"), false);
  assert.equal(response.body.includes("propertyAccess"), false);
  assert.equal(userQuery.include, undefined);
  assert.deepEqual(Object.keys(userQuery.select).sort(), ["capacity", "fullName", "id", "propertyAccess", "role"]);
  for (const [id, status] of [["tech-b", 403], ["shared", 403], ["missing", 404]] as const) {
    const denied = await app.inject({ method: "PUT", url: `/planning/capacities/${id}`, payload: { defaultDailyHours: 8 } });
    assert.equal(denied.statusCode, status, denied.body);
  }
  assert.equal(writes, 0);
  const allowed = await app.inject({ method: "PUT", url: "/planning/capacities/tech-a", payload: { defaultDailyHours: 7 } });
  assert.equal(allowed.statusCode, 200, allowed.body);
  assert.equal(allowed.json().capacity.defaultDailyHours, 7);
  const planning = await app.inject("/planning");
  assert.equal(planning.statusCode, 200, planning.body);
  assert.equal(planning.body.includes("DO-NOT-EXPOSE"), false);
  assert.deepEqual(planning.json().capacities.map((capacity: any) => capacity.user.id), ["tech-a", "shared"]);
  currentUser = { id: "admin", role: "ADMIN", propertyAccess: [] };
  const admin = await app.inject({ method: "PUT", url: "/planning/capacities/shared", payload: { defaultDailyHours: 8 } });
  assert.equal(admin.statusCode, 200, admin.body);
  assert.equal(writes, 2);
});
