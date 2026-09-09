import assert from "node:assert/strict";
import { test } from "node:test";

test("Lease dashboard counts all scoped records independently of recent activity", async t => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "lease-overview-test";
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
  const now = new Date();
  const old = new Date(now.getTime() - 20 * 86400000);
  const future = new Date(now.getTime() + 86400000);
  const row = { propertyId: "allowed", isArchived: false, status: "Open", noticeStage: "None", createdAt: old, resolvedDate: null, recurringConcern: false, managerReviewRequired: false };
  const rows = [
    ...Array.from({ length: 40 }, () => ({ ...row, status: "Resolved", resolvedDate: now })),
    ...Array.from({ length: 45 }, () => ({ ...row })),
    { ...row, status: "Notice Sent", recurringConcern: true, managerReviewRequired: true },
    { ...row, noticeStage: "Violation Needed" },
    { ...row, status: "Resolved", resolvedDate: future },
    { ...row, status: "Resolved" },
    { ...row, isArchived: true },
    { ...row, propertyId: "outside" },
  ];
  const matches = (record: any, where: any): boolean => Object.entries(where).every(([key, condition]: [string, any]) => {
    if (key === "OR") return condition.some((part: any) => matches(record, part));
    const value = record[key];
    if (condition === null || typeof condition !== "object" || condition instanceof Date) return value === condition;
    return (!condition.in || condition.in.includes(value)) && (!condition.notIn || !condition.notIn.includes(value)) &&
      (!condition.gte || value !== null && value >= condition.gte) && (!condition.lte || value !== null && value <= condition.lte);
  });
  const countQueries: any[] = [];
  stub(prisma.leaseComplianceIssue, "findMany", async query => rows.filter(record => matches(record, query.where)).slice(0, query.take));
  stub(prisma.leaseComplianceIssue, "count", async query => { countQueries.push(query); return rows.filter(record => matches(record, query.where)).length; });
  stub(prisma.leaseComplianceIssueType, "count", async () => 1);
  stub(prisma.leaseComplianceIssueType, "findMany", async () => []);
  stub(prisma.leaseComplianceSettings, "upsert", async () => ({}));
  stub(prisma.leaseComplianceSettings, "findUnique", async () => ({ warningDays: 7 }));
  stub(prisma.user, "findMany", async () => []);
  const app = Fastify();
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => { request.currentUser = { id: "tech", role: "TECH", propertyAccess: [{ propertyId: "allowed" }] } as any; });
  await app.register(leaseComplianceRoutes);
  t.after(() => app.close());
  const response = await app.inject("/lease-compliance/overview?propertyId=allowed");
  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(response.json().summary, { openIssues: 46, needsNotice: 1, violationNeeded: 1, resolvedThisMonth: 40, recurringConcerns: 1, managerReviewRequired: 1, overdueOpen: 47 });
  assert.equal(response.json().recentIssues.length, 10);
  assert.equal(response.json().needsNotice.length, 1);
  assert.equal(response.json().violationNeeded.length, 1);
  assert.equal(response.json().recentResolved.length, 10);
  assert.equal(countQueries.length, 7);
  for (const query of countQueries) {
    assert.equal(query.where.propertyId, "allowed");
    assert.equal(query.where.isArchived, false);
    assert.equal(query.take, undefined);
  }
  const before = countQueries.length;
  assert.equal((await app.inject("/lease-compliance/overview?propertyId=outside")).statusCode, 403);
  assert.equal(countQueries.length, before);
});
