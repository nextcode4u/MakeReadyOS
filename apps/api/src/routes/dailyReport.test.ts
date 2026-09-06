import assert from "node:assert/strict";
import { test } from "node:test";

test("daily reports include changes beyond 500 and preserve date/property scope", async (t) => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "daily-report-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  process.env.APP_URL = "http://localhost:8080";
  const { prisma } = await import("../lib/prisma.js");
  const { activityRoutes } = await import("./activity.js");
  const { default: Fastify } = await import("fastify");
  const property = { id: "a", code: "QA", name: "Test property" };
  const events = Array.from({ length: 501 }, (_, index) => ({
    id: `event-${index + 1}`, entityId: null, entityType: "UNIT", action: "UPDATED",
    message: index === 0 ? "=2+2" : `EVENT_${index + 1}`, property,
    actorUser: { id: "actor", fullName: "Staff", email: null }, createdAt: new Date("2026-09-06T12:00:00Z"),
  }));
  const originalFind = prisma.auditLog.findMany;
  const originalProperties = prisma.property.findMany;
  let query: any;
  prisma.auditLog.findMany = (async (args: any) => { query = args; return events.slice(0, args.take ?? events.length); }) as any;
  prisma.property.findMany = (async () => [property]) as any;
  t.after(() => { prisma.auditLog.findMany = originalFind; prisma.property.findMany = originalProperties; });
  const app = Fastify();
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => {
    request.currentUser = { id: "manager", role: "MANAGER", propertyAccess: [{ propertyId: "a" }] } as any;
  });
  await app.register(activityRoutes);
  t.after(() => app.close());
  const params = "propertyId=a&date=2026-09-06&timezoneOffsetMinutes=300";
  const response = await app.inject(`/activity/daily-report?${params}`);
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().summary.totalChanges, 501);
  assert.equal(response.json().records.at(-1).description, "EVENT_501");
  assert.deepEqual(query.where.AND[0], { propertyId: { in: ["a"] } });
  assert.equal(query.where.AND[1].propertyId, "a");
  assert.equal(query.where.AND[1].createdAt.gte.toISOString(), "2026-09-06T05:00:00.000Z");
  assert.equal(query.where.AND[1].createdAt.lt.toISOString(), "2026-09-07T05:00:00.000Z");
  const csv = await app.inject(`/activity/daily-report.csv?${params}`);
  assert.equal(csv.statusCode, 200, csv.body);
  assert.ok(csv.body.includes("EVENT_501"));
  assert.ok(csv.body.includes("'=2+2"));
  const denied = await app.inject("/activity/daily-report?propertyId=b");
  assert.equal(denied.statusCode, 403);
});
