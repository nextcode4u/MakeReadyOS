import assert from "node:assert/strict";
import { test } from "node:test";

test("common-area lookup preserves property scope and excludes unit issues", async (t) => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "lookup-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  process.env.APP_URL = "http://localhost:8080";
  const { prisma } = await import("../lib/prisma.js");
  const { leaseComplianceRoutes } = await import("./leaseCompliance.js");
  const { default: Fastify } = await import("fastify");
  const originalFind = prisma.leaseComplianceIssue.findMany;
  const originalCount = prisma.leaseComplianceIssue.count;
  let captured: any;
  prisma.leaseComplianceIssue.findMany = (async (args: any) => { captured = args; return [{ id: "area-issue" }]; }) as any;
  prisma.leaseComplianceIssue.count = (async () => 502) as any;
  t.after(() => {
    prisma.leaseComplianceIssue.findMany = originalFind;
    prisma.leaseComplianceIssue.count = originalCount;
  });
  const app = Fastify();
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => {
    request.currentUser = { id: "tech", role: "TECH", propertyAccess: [{ propertyId: "a" }] } as any;
  });
  await app.register(leaseComplianceRoutes);
  t.after(() => app.close());
  const response = await app.inject("/lease-compliance/issues?propertyId=a&commonAreasOnly=true&offset=500&limit=1&q=pool");
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(captured.where.propertyId, "a");
  assert.deepEqual(captured.where.AND[0], { unitId: null });
  assert.equal(captured.where.AND.length, 2);
  assert.equal(captured.skip, 500);
  assert.equal(response.json().pagination.hasMore, true);
  await app.inject("/lease-compliance/issues?propertyId=a&commonAreasOnly=false");
  assert.equal(captured.where.AND, undefined);
  const denied = await app.inject("/lease-compliance/issues?propertyId=b&commonAreasOnly=true");
  assert.equal(denied.statusCode, 403);
});
