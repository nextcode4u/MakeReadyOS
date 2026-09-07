import assert from "node:assert/strict";
import { test } from "node:test";

test("lease assignment rejects unavailable staff before create or update", async (t) => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "lease-assignment-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  process.env.APP_URL = "http://localhost:8080";
  const { prisma } = await import("../lib/prisma.js");
  const { leaseComplianceRoutes } = await import("./leaseCompliance.js");
  const { default: Fastify } = await import("fastify");
  const stub = (delegate: any, name: string, fn: (...args: any[]) => unknown) => {
    const original = delegate[name]; delegate[name] = fn;
    t.after(() => { delegate[name] = original; });
  };
  let captured: any;
  let writes = 0;
  stub(prisma.user, "findFirst", async (query: any) => { captured = query; return null; });
  stub(prisma.leaseComplianceIssue, "findUnique", async () => ({ id: "issue", propertyId: "allowed", assignedUserName: "Previous" }));
  stub(prisma.leaseComplianceIssue, "create", async () => { writes++; return {}; });
  stub(prisma.leaseComplianceIssue, "update", async () => { writes++; return {}; });
  const app = Fastify();
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => { request.currentUser = { id: "tech", role: "TECH", propertyAccess: [{ propertyId: "allowed" }] } as any; });
  await app.register(leaseComplianceRoutes);
  t.after(() => app.close());
  for (const method of ["POST", "PATCH"] as const) {
    const response = await app.inject({ method, url: `/lease-compliance/issues${method === "PATCH" ? "/issue" : ""}`, payload: {
      propertyId: "allowed", area: "Porch", issueTypeName: "Trash", assignedUserId: "outside",
    } });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(captured.where.id, "outside");
    assert.equal(captured.where.isActive, true);
    assert.equal(captured.where.role.in.includes("VIEWER"), false);
    assert.deepEqual(captured.where.OR, [{ role: "ADMIN" }, { propertyAccess: { some: { propertyId: "allowed" } } }]);
    assert.deepEqual(captured.select, { fullName: true });
  }
  assert.equal(writes, 0);
});
