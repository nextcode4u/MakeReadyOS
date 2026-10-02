import assert from "node:assert/strict";
import { test } from "node:test";

test("pool review links retain property scope for both entries and counts", async t => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "pool-review-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  process.env.APP_URL = "http://localhost:8080";
  const { prisma } = await import("../lib/prisma.js");
  const { poolLogRoutes } = await import("./poolLog.js");
  const { default: Fastify } = await import("fastify");
  const queries: any[] = [];
  for (const name of ["findMany", "count"] as const) {
    const original = prisma.poolLogEntry[name];
    (prisma.poolLogEntry as any)[name] = async (query: any) => { queries.push(query); return name === "count" ? 0 : []; };
    t.after(() => { (prisma.poolLogEntry as any)[name] = original; });
  }
  const app = Fastify();
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => { request.currentUser = { id: "tech", role: "TECH", propertyAccess: [{ propertyId: "allowed" }] } as any; });
  await app.register(poolLogRoutes);
  t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: "/pool/entries?entryId=review-target" });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(queries.length, 2);
  for (const query of queries) assert.deepEqual(query.where, { propertyId: { in: ["allowed"] }, id: "review-target" });
  queries.length = 0;
  const denied = await app.inject({ method: "GET", url: "/pool/entries?entryId=review-target&propertyId=outside" });
  assert.equal(denied.statusCode, 403);
  assert.equal(queries.length, 0);
});
