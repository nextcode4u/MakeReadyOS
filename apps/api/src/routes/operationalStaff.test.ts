import assert from "node:assert/strict";
import { test } from "node:test";

test("operational overview staff is minimal, eligible and scoped before querying", async t => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "staff-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  process.env.APP_URL = "http://localhost:8080";
  const { prisma } = await import("../lib/prisma.js");
  const { pestControlRoutes } = await import("./pestControl.js");
  const { leaseComplianceRoutes } = await import("./leaseCompliance.js");
  const { default: Fastify } = await import("fastify");
  const stub = (delegate: any, name: string, fn: (...args: any[]) => unknown) => {
    const original = delegate[name]; delegate[name] = fn;
    t.after(() => { delegate[name] = original; });
  };
  for (const delegate of [prisma.pestIssue, prisma.pestVendor, prisma.leaseComplianceIssue, prisma.leaseComplianceIssueType]) stub(delegate, "findMany", async () => []);
  stub(prisma.pestVendor, "findFirst", async () => null);
  stub(prisma.leaseComplianceIssueType, "count", async () => 1);
  stub(prisma.leaseComplianceSettings, "upsert", async () => ({}));
  stub(prisma.leaseComplianceSettings, "findUnique", async () => ({}));
  const queries: any[] = [];
  const staff = [{ id: "staff", fullName: "Scoped staff", role: "TECH" }];
  stub(prisma.user, "findMany", async query => { queries.push(query); return staff; });
  let role = "TECH";
  const app = Fastify();
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => { request.currentUser = { id: "actor", role, propertyAccess: [{ propertyId: "allowed" }] } as any; });
  await app.register(pestControlRoutes);
  await app.register(leaseComplianceRoutes);
  t.after(() => app.close());
  for (const module of ["pest", "lease-compliance"]) {
    for (const actor of ["TECH", "LEASING", "MANAGER"]) await t.test(`${module} ${actor} gets scoped minimal choices`, async () => {
      role = actor; queries.length = 0;
      const result = await app.inject(`/` + module + `/overview?propertyId=allowed`);
      assert.equal(result.statusCode, 200, result.body);
      assert.deepEqual(result.json().assignableUsers, staff);
      assert.equal(queries.length, 1);
      assert.deepEqual(queries[0].select, { id: true, fullName: true, role: true });
      assert.equal(queries[0].where.isActive, true);
      assert.deepEqual(queries[0].where.OR, [{ role: "ADMIN" }, { propertyAccess: { some: { propertyId: "allowed" } } }]);
      assert.deepEqual([...queries[0].where.role.in].sort(), (module === "pest" ? ["ADMIN", "MANAGER", "TECH", "LEASING"] : ["ADMIN", "MANAGER", "TECH", "LEASING", "CLEANER"]).sort());
    });
    await t.test(`${module} denies foreign scope before staff query`, async () => {
      role = "TECH"; queries.length = 0;
      assert.equal((await app.inject(`/${module}/overview?propertyId=outside`)).statusCode, 403);
      assert.equal(queries.length, 0);
    });
    for (const url of [`/${module}/overview`, `/${module}/overview?propertyId=allowed`]) await t.test(`${module} read-only or unspecified property has no assignment list: ${url}`, async () => {
      role = url.includes("?") ? "VIEWER" : "ADMIN"; queries.length = 0;
      const result = await app.inject(url);
      assert.equal(result.statusCode, 200, result.body);
      assert.deepEqual(result.json().assignableUsers, []);
      assert.equal(queries.length, 0);
    });
  }
});
