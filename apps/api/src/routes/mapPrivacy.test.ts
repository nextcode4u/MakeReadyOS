import assert from "node:assert/strict";
import { test } from "node:test";

test("map pins only include public creator and editor fields", async (t) => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "map-privacy-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  process.env.APP_URL = "http://localhost:8080";
  const { prisma } = await import("../lib/prisma.js");
  const { propertyMapRoutes } = await import("./propertyMaps.js");
  const { default: Fastify } = await import("fastify");
  const original = prisma.propertyMapPin.findMany;
  const user: Record<string, unknown> = { id: "admin", fullName: "Admin", role: "ADMIN", passwordHash: "SECRET-HASH", passwordResetHash: "SECRET-RESET" };
  prisma.propertyMapPin.findMany = (async ({ include }: any) => {
    const select = (relation: any) => relation === true ? user : Object.fromEntries(Object.keys(relation.select).map(key => [key, user[key]]));
    return [{ id: "pin", propertyId: "a", linkedRecordType: null, createdBy: select(include.createdBy), updatedBy: select(include.updatedBy) }];
  }) as any;
  t.after(() => { prisma.propertyMapPin.findMany = original; });
  const app = Fastify();
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => {
    request.currentUser = { id: "tech", role: "TECH", propertyAccess: [{ propertyId: "a" }] } as any;
  });
  await app.register(propertyMapRoutes);
  t.after(() => app.close());
  const response = await app.inject("/property-map-pins");
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.body.includes("SECRET"), false);
  assert.deepEqual(response.json().pins[0].createdBy, { id: "admin", fullName: "Admin", role: "ADMIN" });
  assert.deepEqual(response.json().pins[0].updatedBy, { id: "admin", fullName: "Admin", role: "ADMIN" });
});
