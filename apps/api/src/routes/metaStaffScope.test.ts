import assert from "node:assert/strict";
import { test } from "node:test";

test("metadata staff choices only include shared property staff or admins", async (t) => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "meta-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  process.env.APP_URL = "http://localhost:8080";
  process.env.APP_UPDATE_RELEASES_ENABLED = "false";
  const { prisma } = await import("../lib/prisma.js");
  const { metaRoutes } = await import("./meta.js");
  const { default: Fastify } = await import("fastify");
  let staffQuery: any;
  let automationQuery: any;
  for (const name of ["property", "labelDefinition", "savedView", "automationRule", "unit", "customField", "user", "boardColumnDefinition", "scheduleTrack", "boardSection"]) {
    const delegate = (prisma as any)[name];
    const original = delegate.findMany;
    delegate.findMany = async (query: any) => {
      if (name === "user") staffQuery = query;
      if (name === "automationRule") automationQuery = query;
      return [];
    };
    t.after(() => { delegate.findMany = original; });
  }
  const app = Fastify();
  let role = "TECH";
  let propertyAccess = [{ propertyId: "allowed", role: "TECH" }];
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => { request.currentUser = { id: "user", role, propertyAccess } as any; });
  await app.register(metaRoutes);
  t.after(() => app.close());
  for (const currentRole of ["TECH", "MANAGER", "ADMIN"]) {
    role = currentRole;
    for (const access of [[{ propertyId: "allowed", role: "TECH" }], []]) {
      propertyAccess = access;
      automationQuery = undefined;
      const response = await app.inject({ method: "GET", url: "/meta" });
      assert.equal(response.statusCode, 200, response.body);
      assert.deepEqual(staffQuery.select, { id: true, fullName: true, role: true });
      assert.equal(staffQuery.where.isActive, true);
      if (role === "TECH") {
        assert.equal(automationQuery, undefined, "non-managers must not load automation definitions");
      } else {
        assert.deepEqual(automationQuery.select, { id: true, name: true, enabled: true, description: true });
        assert.deepEqual(automationQuery.where, role === "ADMIN" ? {} : { OR: [{ propertyId: null }, { propertyId: { in: access.map(entry => entry.propertyId) } }] });
      }
      assert.deepEqual(staffQuery.where.OR, role === "ADMIN" ? undefined : [{ role: "ADMIN" }, { propertyAccess: { some: { propertyId: { in: access.map(entry => entry.propertyId) } } } }]);
    }
  }
});
