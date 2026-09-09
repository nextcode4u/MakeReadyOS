import assert from "node:assert/strict";
import { test } from "node:test";

test("lease issue references remain in the issue property without losing historical links", async t => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "lease-reference-test";
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
  const base = { id: "issue", propertyId: "allowed", unitId: null, issueTypeId: null, propertyMapId: null, building: null, area: "Courtyard", assignedUserName: null };
  let existing: any = { ...base };
  let reachedWrite = 0;
  let setupWrites = 0;
  let captured: any;
  const record = ({ where }: any) => where.id === "missing" ? null : ({ id: where.id, propertyId: where.id === "outside" ? "other" : "allowed", isActive: where.id !== "inactive", isArchived: where.id === "archived" });
  for (const delegate of [prisma.unit, prisma.leaseComplianceIssueType, prisma.propertyMap]) stub(delegate, "findUnique", async query => record(query));
  stub(prisma.leaseComplianceIssueType, "count", async () => 1);
  stub(prisma.leaseComplianceSettings, "upsert", async () => { setupWrites++; return {}; });
  stub(prisma.leaseComplianceIssue, "findUnique", async () => existing);
  for (const method of ["create", "update"]) stub(prisma.leaseComplianceIssue, method, async query => {
    reachedWrite++; captured = query.data;
    // Observe admission to persistence, then stop before any DB or downstream side effects.
    throw Object.assign(new Error("WRITE_CHECKPOINT"), { statusCode: 418 });
  });
  const app = Fastify();
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => { request.currentUser = { id: "manager", role: "MANAGER", propertyAccess: [{ propertyId: "allowed" }] } as any; });
  await app.register(leaseComplianceRoutes);
  t.after(() => app.close());
  const send = (method: "POST" | "PATCH", payload: Record<string, unknown>) => app.inject({ method, url: `/lease-compliance/issues${method === "PATCH" ? "/issue" : ""}`, payload: { propertyId: "allowed", issueTypeName: "Trash", area: "Courtyard", ...payload } });

  for (const method of ["POST", "PATCH"] as const) {
    for (const field of ["unitId", "issueTypeId", "propertyMapId"]) {
      for (const id of ["missing", "outside", "inactive", ...(field === "propertyMapId" ? ["archived"] : [])]) {
        await t.test(`${method} rejects ${field} ${id} before writes`, async () => {
          existing = { ...base }; reachedWrite = 0; setupWrites = 0;
          const response = await send(method, { [field]: id });
          assert.equal(response.statusCode, 400, response.body);
          assert.equal(reachedWrite, 0);
          assert.equal(setupWrites, 0);
        });
      }
    }
    await t.test(`${method} admits active same-property references`, async () => {
      existing = { ...base }; reachedWrite = 0;
      const response = await send(method, { unitId: "valid", issueTypeId: "valid", propertyMapId: "valid" });
      assert.equal(response.statusCode, 418, response.body);
      assert.equal(reachedWrite, 1);
      assert.equal(captured.unitId, "valid");
    });
  }
  await t.test("unchanged inactive links remain editable and explicit clearing repairs bad links", async () => {
    existing = { ...base, unitId: "inactive", issueTypeId: "inactive", propertyMapId: "archived" };
    assert.equal((await send("PATCH", { description: "Keep historical context" })).statusCode, 418);
    assert.equal((await send("PATCH", { unitId: "inactive", propertyMapId: "archived" })).statusCode, 418);
    existing = { ...base, unitId: "outside", issueTypeId: "outside", propertyMapId: "outside" };
    assert.equal((await send("PATCH", { unitId: null, issueTypeId: null, propertyMapId: null })).statusCode, 418);
    assert.equal(captured.unitId, null);
    assert.equal(captured.propertyMapId, null);
    assert.equal((await send("PATCH", { description: "Must not retain foreign links" })).statusCode, 400);
  });
  await t.test("partial edits cannot clear the last location or change property", async () => {
    existing = { ...base }; reachedWrite = 0;
    assert.equal((await send("PATCH", { unitId: null, building: null, area: " " })).statusCode, 400);
    assert.equal((await send("PATCH", { propertyId: "other" })).statusCode, 400);
    assert.equal(reachedWrite, 0);
    assert.equal((await send("PATCH", { area: null, building: "Building A" })).statusCode, 418);
  });
});
