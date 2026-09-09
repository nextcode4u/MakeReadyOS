import assert from "node:assert/strict";
import { test } from "node:test";

test("Pest detail patches preserve intent, links and concurrent edits", async t => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "pest-patch-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  process.env.APP_URL = "http://localhost:8080";
  const { prisma } = await import("../lib/prisma.js");
  const { pestControlRoutes } = await import("./pestControl.js");
  const { default: Fastify } = await import("fastify");
  const stub = (delegate: any, name: string, fn: (...args: any[]) => unknown) => {
    const original = delegate[name]; delegate[name] = fn;
    t.after(() => { delegate[name] = original; });
  };
  let existing: any;
  let mainUpdate: any;
  let discoveries = 0;
  let concurrent = false;
  const turn = { id: "turn", propertyId: "allowed", unitId: "unit", isArchived: false };
  const reset = () => {
    existing = { id: "issue", propertyId: "allowed", unitId: null, makeReadyItemId: null, vendorId: null, assignedUserId: null, pestType: "Ants", area: "Courtyard", status: "Treated", followUpRequired: true, closedAt: null, updatedAt: new Date("2026-09-01T12:00:00.000Z") };
    mainUpdate = undefined; discoveries = 0; concurrent = false;
  };
  stub(prisma.pestIssue, "findUnique", async () => existing);
  stub(prisma.pestIssue, "update", async query => {
    if (query.include) {
      mainUpdate = query;
      if (concurrent) throw Object.assign(new Error("Changed record"), { code: "P2025" });
    }
    existing = { ...existing, ...Object.fromEntries(Object.entries(query.data).filter(([, value]) => value !== undefined)) };
    return existing;
  });
  stub(prisma.pestIssue, "count", async () => 0);
  stub(prisma.pestIssue, "findMany", async () => []);
  stub(prisma.pestIssue, "findFirst", async () => null);
  stub(prisma.unit, "findUnique", async () => ({ id: "unit", propertyId: "allowed", isActive: true }));
  stub(prisma.makeReadyItem, "findUnique", async () => turn);
  stub(prisma.makeReadyItem, "findFirst", async () => { discoveries++; return turn; });
  stub(prisma.makeReadyItem, "update", async () => ({}));
  stub(prisma.auditLog, "create", async () => ({}));
  stub(prisma.webhookEndpoint, "findMany", async () => []);
  const app = Fastify();
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => { request.currentUser = { id: "tech", role: "TECH", propertyAccess: [{ propertyId: "allowed" }] } as any; });
  await app.register(pestControlRoutes);
  t.after(() => app.close());
  const send = (payload: object) => app.inject({ method: "PATCH", url: "/pest/issues/issue", payload });
  await t.test("description edits do not change status, follow-up or omitted fields", async () => {
    reset();
    const result = await send({ description: "Checked treatment" });
    assert.equal(result.statusCode, 200, result.body);
    assert.deepEqual(Object.fromEntries(Object.entries(mainUpdate.data).filter(([, value]) => value !== undefined)), { description: "Checked treatment", updatedById: "tech" });
    assert.deepEqual(mainUpdate.where, { id: "issue", updatedAt: existing.updatedAt });
  });
  await t.test("unrelated edits never discover a new linked turn", async () => {
    reset(); existing.unitId = "unit";
    const result = await send({ description: "Keep it unlinked" });
    assert.equal(result.statusCode, 200, result.body);
    assert.equal(discoveries, 0);
    assert.equal(result.json().issue.makeReadyItemId, null);
  });
  await t.test("explicit unlink is not undone by unit auto-discovery", async () => {
    reset(); existing.unitId = "unit"; existing.makeReadyItemId = "turn";
    const result = await send({ makeReadyItemId: null });
    assert.equal(result.statusCode, 200, result.body);
    assert.equal(discoveries, 0);
    assert.equal(mainUpdate.data.makeReadyItemId, null);
    assert.equal(result.json().issue.unitId, "unit");
  });
  await t.test("explicit unit selection still discovers the matching turn", async () => {
    reset();
    const result = await send({ unitId: "unit" });
    assert.equal(result.statusCode, 200, result.body);
    assert.equal(discoveries, 1);
    assert.equal(mainUpdate.data.makeReadyItemId, "turn");
  });
  await t.test("explicit follow-up changes derive status only without an explicit status", async () => {
    reset(); existing.followUpRequired = false;
    assert.equal((await send({ followUpRequired: true })).statusCode, 200);
    assert.equal(mainUpdate.data.status, "Needs Follow Up");
    assert.equal((await send({ followUpRequired: true, status: "Treated" })).statusCode, 200);
    assert.equal(mainUpdate.data.status, "Treated");
  });
  await t.test("historical closed records do not receive an invented close date on description edits", async () => {
    reset(); existing.status = "Closed"; existing.followUpRequired = false;
    assert.equal((await send({ description: "Historical note" })).statusCode, 200);
    assert.equal(mainUpdate.data.closedAt, undefined);
  });
  await t.test("stale client versions and conditional update conflicts return 409", async () => {
    reset();
    assert.equal((await send({ description: "Stale", expectedUpdatedAt: "2026-08-01T00:00:00.000Z" })).statusCode, 409);
    assert.equal(mainUpdate, undefined);
    concurrent = true;
    assert.equal((await send({ description: "Concurrent" })).statusCode, 409);
  });
  await t.test("clearing the last location is rejected before writing", async () => {
    reset();
    assert.equal((await send({ area: null })).statusCode, 400);
    assert.equal(mainUpdate, undefined);
  });
});
