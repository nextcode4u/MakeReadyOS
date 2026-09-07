import assert from "node:assert/strict";
import { test } from "node:test";

test("unit history reports source truncation and preserves property authorization", async (t) => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "history-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  const { prisma } = await import("../lib/prisma.js");
  const { analyticsRoutes } = await import("./analytics.js");
  const { default: Fastify } = await import("fastify");
  const stub = (delegate: any, name: string, fn: (...args: any[]) => unknown) => {
    const original = delegate[name]; delegate[name] = fn;
    t.after(() => { delegate[name] = original; });
  };
  const now = new Date();
  let auditCount = 201;
  let comments = 0;
  let automationRuns = 0;
  let role = "ADMIN";
  stub(prisma.unit, "findUnique", async () => ({ id: "unit", propertyId: "property", property: { code: "TA" }, number: "101", createdAt: now }));
  stub(prisma.makeReadyItem, "findMany", async ({ where, include }: any) => {
    assert.equal(where.propertyId, "property");
    assert.equal(include.automationRuns.take, 21);
    return [{ id: "item", property: { code: "TA" }, unitNumber: "101", createdAt: now, updatedAt: now, riskLevel: "NONE",
      comments: Array.from({ length: comments }, (_, id) => ({ id: `c${id}`, createdAt: now, body: "note" })),
      attachments: [], vendorAssignments: [], checklistInstances: [],
      automationRuns: Array.from({ length: automationRuns }, (_, id) => ({ id: `r${id}`, ranAt: now, rule: { name: "Rule" }, message: "Applied" })),
    }];
  });
  stub(prisma.auditLog, "findMany", async ({ take }: any) => {
    assert.equal(take, 201);
    return Array.from({ length: auditCount }, (_, id) => ({ id: `a${id}`, createdAt: now, action: "UPDATED", message: "Updated" }));
  });
  stub(prisma.leaseComplianceIssue, "findMany", async () => []);
  const app = Fastify();
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => { request.currentUser = { id: "actor", role, propertyAccess: [] } as any; });
  await app.register(analyticsRoutes);
  t.after(() => app.close());
  const get = () => app.inject("/units/unit/history");
  let response = await get();
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().coverage.truncated, true);
  assert.equal(response.json().events.filter((event: any) => event.source === "audit").length, 200);
  auditCount = 0;
  automationRuns = 21;
  response = await get();
  assert.equal(response.json().coverage.truncated, true);
  assert.equal(response.json().events.filter((event: any) => event.source === "automation").length, 20);
  automationRuns = 0;
  comments = 251;
  response = await get();
  assert.equal(response.json().coverage.truncated, true);
  assert.equal(response.json().events.length, 250);
  comments = 0;
  response = await get();
  assert.equal(response.json().coverage.truncated, false);
  role = "TECH";
  assert.equal((await get()).statusCode, 403);
});
