import assert from "node:assert/strict";
import { test } from "node:test";

test("planning checks the assignee's property access even for unrestricted admins", async (t) => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "planning-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  process.env.APP_URL = "http://localhost:8080";
  const { prisma } = await import("../lib/prisma.js");
  const { planningRoutes } = await import("./planning.js");
  const { default: Fastify } = await import("fastify");
  const stub = (delegate: any, method: string, implementation: (...args: any[]) => unknown) => {
    const original = delegate[method];
    delegate[method] = implementation;
    t.after(() => { delegate[method] = original; });
  };
  const itemA = { id: "item-a", propertyId: "a", unitNumber: "101" };
  const itemB = { id: "item-b", propertyId: "b", unitNumber: "201" };
  stub(prisma.makeReadyItem, "findUnique", async ({ where }: any) => [itemA, itemB].find(item => item.id === where.id));
  stub(prisma.user, "findFirst", async ({ where }: any) => where.id === "inactive" ? null : ({
    id: where.id, role: "TECH", propertyAccess: [{ propertyId: where.id === "tech-a" ? "a" : "b" }],
  }));
  stub(prisma.workAssignmentBlock, "findUnique", async () => ({ id: "block", assignedUserId: "tech-a", propertyId: "a", item: itemA }));
  let writes = 0;
  stub(prisma.workAssignmentBlock, "create", async () => { writes++; throw new Error("Unexpected write"); });
  stub(prisma.workAssignmentBlock, "update", async () => { writes++; throw new Error("Unexpected write"); });
  let currentUser: any = { id: "admin", role: "ADMIN", propertyAccess: [] };
  const app = Fastify();
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => { request.currentUser = currentUser; });
  await app.register(planningRoutes);
  t.after(() => app.close());
  const created = await app.inject({ method: "POST", url: "/planning/blocks", payload: {
    assignedUserId: "tech-a", itemId: "item-b", category: "Maintenance", plannedDate: "2026-09-06", estimatedHours: 1,
  } });
  assert.equal(created.statusCode, 403, created.body);
  for (const [payload, status] of [
    [{ itemId: "item-b" }, 403],
    [{ assignedUserId: "tech-b" }, 403],
    [{ assignedUserId: "inactive" }, 400],
    [{ itemId: "missing" }, 404],
  ] as const) {
    const response = await app.inject({ method: "PATCH", url: "/planning/blocks/block", payload });
    assert.equal(response.statusCode, status, response.body);
  }
  currentUser = { id: "manager", role: "MANAGER", propertyAccess: [{ propertyId: "a" }] };
  const moved = await app.inject({ method: "PATCH", url: "/planning/blocks/block", payload: { itemId: "item-b" } });
  assert.equal(moved.statusCode, 403, moved.body);
  assert.equal(writes, 0);
});
