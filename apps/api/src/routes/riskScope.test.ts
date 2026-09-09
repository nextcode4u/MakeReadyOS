import assert from "node:assert/strict";
import { test } from "node:test";

test("a ready board section cannot suppress an explicitly pending final inspection", async () => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "risk-scope-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  process.env.APP_URL = "http://localhost:8080";
  const { evaluateItemRisk } = await import("../lib/risk.js");
  const now = new Date(2026, 8, 8, 12);
  const item = {
    boardSectionType: "READY", completionStatus: "YES", vacancyStatus: "VACANT LEASED READY",
    updatedAt: now, vacatedDate: new Date(2026, 8, 1), makeReadyDate: new Date(2026, 8, 7),
    moveInDate: new Date(2026, 8, 10), cleaningStatus: "DONE", assignedTech: "Tech",
  };
  for (const makeReadyStatus of ["FINAL WALK", "FINAL_WALK", "final-walk"]) {
    const result = evaluateItemRisk({ ...item, makeReadyStatus } as any, now);
    assert.ok(result.riskReasons.some(reason => reason.category === "OVERDUE_MAKE_READY"));
    assert.ok(result.riskReasons.some(reason => reason.category === "MOVE_IN_RISK"));
  }
  const ready = evaluateItemRisk({ ...item, makeReadyStatus: "DONE" } as any, now);
  assert.equal(ready.riskLevel, "NONE");
  assert.deepEqual(ready.riskReasons, []);
});

test("risk evaluation rejects item IDs outside its explicitly selected property", async (t) => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "risk-scope-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  process.env.APP_URL = "http://localhost:8080";
  const { prisma } = await import("../lib/prisma.js");
  const { riskRoutes } = await import("./risk.js");
  const { default: Fastify } = await import("fastify");
  const original = prisma.makeReadyItem.findMany;
  const originalFind = prisma.makeReadyItem.findUnique;
  const originalAudit = prisma.auditLog.create;
  let evaluations = 0;
  prisma.makeReadyItem.findUnique = (async () => { evaluations++; return null; }) as any;
  prisma.auditLog.create = (async () => ({})) as any;
  prisma.makeReadyItem.findMany = (async () => [{ id: "item-b", propertyId: "b" }]) as any;
  t.after(() => {
    prisma.makeReadyItem.findMany = original;
    prisma.makeReadyItem.findUnique = originalFind;
    prisma.auditLog.create = originalAudit;
  });
  const app = Fastify();
  app.decorateRequest("currentUser", null);
  let role = "MANAGER";
  app.addHook("onRequest", async request => {
    request.currentUser = { id: "manager", role, propertyAccess: [{ propertyId: "a" }, { propertyId: "b" }] } as any;
  });
  await app.register(riskRoutes);
  t.after(() => app.close());
  for (role of ["MANAGER", "ADMIN"]) {
    const response = await app.inject({
      method: "POST", url: "/risk/evaluate",
      payload: { propertyId: "a", itemIds: ["item-b"], notify: false },
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.match(response.json().message, /selected property/i);
  }
  assert.equal(evaluations, 0, "mismatched requests must be rejected before evaluation");
  const allowed = await app.inject({
    method: "POST", url: "/risk/evaluate",
    payload: { propertyId: "b", itemIds: ["item-b"], notify: false },
  });
  assert.equal(allowed.statusCode, 200, allowed.body);
  assert.equal(evaluations, 1, "matching requests still reach the evaluator");
  assert.deepEqual(allowed.json().coverage, { scope: "selected-items", limit: 200, selectedCount: 1, skippedCount: 1, truncated: false });
  let candidateCount = 501;
  prisma.makeReadyItem.findMany = (async ({ where, take, orderBy }: any) => {
    if (take) {
      assert.equal(take, 501, "fetch one extra row to detect the silent cap");
      assert.deepEqual(orderBy, { id: "asc" });
      assert.equal(where.propertyId, "b");
      assert.equal(where.isArchived, false);
      return Array.from({ length: candidateCount }, (_, index) => ({ id: `item-${index}` }));
    }
    return where.id.in.map((id: string) => ({ id, propertyId: "b" }));
  }) as any;
  for (candidateCount of [501, 500, 0]) {
    const before: number = evaluations;
    const response = await app.inject({ method: "POST", url: "/risk/evaluate", payload: { propertyId: "b", notify: false } });
    assert.equal(response.statusCode, 200, response.body);
    const selectedCount = Math.min(candidateCount, 500);
    assert.deepEqual(response.json().coverage, {
      scope: "active-items", limit: 500, selectedCount, skippedCount: selectedCount, truncated: candidateCount > 500,
    });
    assert.equal(evaluations - before, selectedCount);
  }
});
