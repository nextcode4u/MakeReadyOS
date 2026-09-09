import assert from "node:assert/strict";
import { test } from "node:test";

test("Lease patches do not rewrite omitted fields and reject stale reads", async t => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "lease-patch-test";
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
  const existing = { id: "issue", propertyId: "allowed", unitId: null, issueTypeId: null, propertyMapId: null, area: "Courtyard", building: "A", description: "Original description", priority: "Normal", status: "Open", noticeStage: "None", assignedUserId: null, assignedUserName: null, updatedAt: new Date("2026-09-01T12:00:00.000Z") };
  let update: any;
  let conflict = false;
  stub(prisma.leaseComplianceIssue, "findUnique", async () => existing);
  stub(prisma.leaseComplianceIssue, "update", async query => {
    update = query;
    if (conflict) throw Object.assign(new Error("Record no longer matches"), { code: "P2025" });
    return { ...existing, ...query.data };
  });
  stub(prisma.auditLog, "create", async () => ({}));
  stub(prisma.webhookEndpoint, "findMany", async () => []);
  const app = Fastify();
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => { request.currentUser = { id: "tech", role: "TECH", propertyAccess: [{ propertyId: "allowed" }] } as any; });
  await app.register(leaseComplianceRoutes);
  t.after(() => app.close());
  const send = (payload: object) => app.inject({ method: "PATCH", url: "/lease-compliance/issues/issue", payload });
  await t.test("description-only changes preserve other fields and guard their validation snapshot", async () => {
    const result = await send({ description: "Updated description" });
    assert.equal(result.statusCode, 200, result.body);
    assert.deepEqual(Object.fromEntries(Object.entries(update.data).filter(([, value]) => value !== undefined)), { description: "Updated description", updatedById: "tech" });
    assert.deepEqual(update.where, { id: "issue", updatedAt: existing.updatedAt });
  });
  await t.test("explicit nulls remain real changes", async () => {
    const result = await send({ building: null });
    assert.equal(result.statusCode, 200, result.body);
    assert.equal(update.data.building, null);
    assert.equal(update.data.area, undefined);
  });
  await t.test("client stale version is rejected before writes", async () => {
    update = undefined;
    const result = await send({ description: "Old draft", expectedUpdatedAt: "2026-08-01T12:00:00.000Z" });
    assert.equal(result.statusCode, 409, result.body);
    assert.equal(update, undefined);
  });
  await t.test("concurrent server change is a conflict, not a generic failure", async () => {
    conflict = true;
    const result = await send({ description: "Concurrent edit", expectedUpdatedAt: existing.updatedAt.toISOString() });
    assert.equal(result.statusCode, 409, result.body);
    assert.match(result.json().message, /changed/i);
  });
});
