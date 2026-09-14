import assert from "node:assert/strict";
import { test } from "node:test";
process.env.ADMIN_USERNAME = "receipt-test";
process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";

test("availability freshness is read-only, property-scoped and does not expose audit details", async t => {
  const { prisma } = await import("../lib/prisma.js");
  const { availabilityFreshnessRoutes } = await import("./availabilityFreshness.js");
  const { default: Fastify } = await import("fastify");
  const originalProperty = prisma.property.findMany;
  const originalAudit = prisma.auditLog.findFirst;
  t.after(() => { prisma.property.findMany = originalProperty; prisma.auditLog.findFirst = originalAudit; });
  const reads: any[] = [];
  prisma.property.findMany = (async (query: any) => {
    reads.push(query);
    return query.where.id === "missing" ? [] : [{ id: "allowed", code: "TA", name: "Allowed" }];
  }) as unknown as typeof prisma.property.findMany;
  prisma.auditLog.findFirst = (async (query: any) => {
    assert.equal(query.where.propertyId, "allowed");
    assert.deepEqual(query.select, { createdAt: true, metadata: true });
    return { createdAt: new Date("2026-09-13T12:00:00Z"), metadata: { receiptVersion: 1, fullReport: false, sourceReportDates: ["2026-09-01"], actorSecret: "must not leak" } };
  }) as unknown as typeof prisma.auditLog.findFirst;
  const app = Fastify();
  let authType = "session";
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => {
    request.currentUser = { id: "staff", role: "TECH", propertyAccess: [{ propertyId: "allowed" }, { propertyId: "missing" }] } as any;
    request.authType = authType as any;
  });
  await app.register(availabilityFreshnessRoutes);
  t.after(() => app.close());
  const response = await app.inject("/operations/availability/status");
  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(reads[0].where, { isActive: true, id: { in: ["allowed", "missing"] } });
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(response.json().properties[0].latestImport.reportDate, "2026-09-01");
  assert.equal(response.json().properties[0].latestImport.coverage, "PARTIAL");
  assert.ok(!response.body.includes("must not leak"));
  const count = reads.length;
  assert.equal((await app.inject("/operations/availability/status?propertyId=outside")).statusCode, 403);
  assert.equal(reads.length, count);
  assert.equal((await app.inject("/operations/availability/status?propertyId=missing")).statusCode, 404);
  authType = "apiToken";
  assert.equal((await app.inject("/operations/availability/status")).statusCode, 403);
});
