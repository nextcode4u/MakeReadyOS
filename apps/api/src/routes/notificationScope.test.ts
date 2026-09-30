import assert from "node:assert/strict";
import { test } from "node:test";

test("notification lists and bulk clearing respect user, property, read status, and snapshot scope", async (t) => {
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
  stub(prisma.notification, "deleteMany", { count: 75 });
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
      assert.ok(Number.isFinite(Date.parse(response.json().snapshotAt)));
      for (const query of queries.slice(0, 4)) {
        assert.equal(query.where.userId, "user");
        assert.deepEqual(query.where.OR, role === "ADMIN" ? undefined : [{ propertyId: null }, { propertyId: { in: access.map(entry => entry.propertyId) } }]);
      }
      assert.equal(queries[2].where.isRead, false);
      for (const mode of ["read", "all"]) {
        queries.length = 0;
        const before = "2026-01-01T00:00:00.000Z";
        const cleared = await app.inject({ method: "POST", url: "/notifications/clear", payload: { mode, before } });
        assert.equal(cleared.statusCode, 200, cleared.body);
        assert.deepEqual(cleared.json(), { ok: true, count: 75 });
        assert.equal(queries.length, 1);
        assert.deepEqual(queries[0], { where: {
          userId: "user",
          ...(role === "ADMIN" ? {} : { OR: [{ propertyId: null }, { propertyId: { in: access.map(entry => entry.propertyId) } }] }),
          ...(mode === "read" ? { isRead: true } : {}),
          createdAt: { lte: new Date(before) },
        } });
      }
    }
  }
  queries.length = 0;
  const startedAt = Date.now();
  await app.inject({ method: "POST", url: "/notifications/clear", payload: { mode: "all", before: "2999-01-01T00:00:00.000Z" } });
  assert.ok(queries[0].where.createdAt.lte.getTime() >= startedAt);
  assert.ok(queries[0].where.createdAt.lte.getTime() <= Date.now());
  for (const payload of [{}, { mode: "invalid", before: new Date().toISOString() }, { mode: "all", before: "invalid" }, { mode: "all", before: new Date().toISOString(), userId: "someone-else" }]) {
    queries.length = 0;
    const response = await app.inject({ method: "POST", url: "/notifications/clear", payload });
    assert.ok(response.statusCode >= 400);
    assert.equal(queries.length, 0, "invalid requests must never delete alerts");
  }
});
