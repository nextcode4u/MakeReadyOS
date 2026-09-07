import assert from "node:assert/strict";
import { test } from "node:test";

test("notification lists, counts, and preferences follow current property access", async (t) => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  const { prisma } = await import("../lib/prisma.js");
  const { notificationRoutes } = await import("./notifications.js");
  const { default: Fastify } = await import("fastify");
  const queries: any[] = [];
  const stub = (delegate: any, name: string, result: unknown) => {
    const original = delegate[name];
    delegate[name] = async (query: any) => { queries.push(query); return result; };
    t.after(() => { delegate[name] = original; });
  };
  stub(prisma.notification, "findMany", []);
  stub(prisma.notification, "count", 0);
  stub(prisma.notificationPreference, "findMany", []);
  stub(prisma.userNotificationSettings, "findUnique", null);
  stub(prisma.property, "findMany", []);
  const app = Fastify();
  let role = "TECH";
  let propertyAccess = [{ propertyId: "allowed" }];
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async (request) => { request.currentUser = { id: "user", role, propertyAccess } as any; });
  await app.register(notificationRoutes);
  t.after(() => app.close());
  for (const currentRole of ["TECH", "ADMIN"]) {
    role = currentRole;
    for (const access of [[{ propertyId: "allowed" }], []]) {
      propertyAccess = access;
      queries.length = 0;
      const response = await app.inject({ method: "GET", url: "/notifications?unreadOnly=true" });
      assert.equal(response.statusCode, 200, response.body);
      for (const query of queries.slice(0, 4)) {
        assert.equal(query.where.userId, "user");
        assert.deepEqual(query.where.OR, role === "ADMIN" ? undefined : [{ propertyId: null }, { propertyId: { in: access.map(entry => entry.propertyId) } }]);
      }
      assert.equal(queries[2].where.isRead, false);
    }
  }
});
