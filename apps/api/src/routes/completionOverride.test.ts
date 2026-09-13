import assert from "node:assert/strict";
import { test } from "node:test";

test("completion override is scoped, managerial, explicit, audited, and preserves unfinished evidence", async t => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "override-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  process.env.APP_URL = "http://localhost:8080";
  const { prisma } = await import("../lib/prisma.js");
  const { makeReadyRoutes } = await import("./makeReady.js");
  const { default: Fastify } = await import("fastify");
  const stub = (delegate: any, name: string, fn: (...args: any[]) => unknown) => {
    const original = delegate[name]; delegate[name] = fn;
    t.after(() => { delegate[name] = original; });
  };
  const initial = { id: "turn", propertyId: "property", unitNumber: "101", assignedTech: "Manager",
    makeReadyStatus: "DONE", completionStatus: "NO", vacancyStatus: "VACANT NOT LEASED NOT READY",
    boardGroup: "MAKE_READY", isArchived: false, paintStatus: null, cleaningStatus: null, materials: [],
    property: { isActive: true }, checklistInstances: [], workAssignmentBlocks: [], finalWalkReportDraft: null };
  let item = { ...initial };
  let role = "ADMIN";
  let access = ["property"];
  let active = true;
  let failAudit = false;
  const audits: any[] = [];
  const blockUpdates: any[] = [];
  stub(prisma.makeReadyItem, "findUnique", async (query: any) => query.include?.comments ? null : item);
  stub(prisma.makeReadyItem, "findUniqueOrThrow", async () => item);
  stub(prisma.makeReadyItem, "update", async ({ data }: any) => { item = { ...item, ...data }; return item; });
  stub(prisma.property, "findUnique", async () => ({ isActive: active }));
  stub(prisma.boardSection, "findFirst", async () => ({ key: "READY" }));
  stub(prisma.user, "findMany", async () => []);
  stub(prisma.webhookEndpoint, "findMany", async () => []);
  stub(prisma.workAssignmentBlock, "updateMany", async (args: any) => { blockUpdates.push(args); return { count: 1 }; });
  stub(prisma.auditLog, "create", async ({ data }: any) => {
    if (failAudit) throw new Error("audit unavailable");
    audits.push(data); return data;
  });
  stub(prisma, "$queryRaw", async () => []);
  stub(prisma, "$transaction", async (fn: any) => {
    const before = { ...item };
    try { return await fn(prisma); } catch (error) { item = before; throw error; }
  });
  const app = Fastify();
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => { request.currentUser = { id: "actor", fullName: "Manager", role, propertyAccess: access.map(propertyId => ({ propertyId })) } as any; });
  await app.register(makeReadyRoutes);
  t.after(() => app.close());
  const submit = (payload: object = { overrideReason: "Correcting historical board data" }) => app.inject({ method: "POST", url: "/make-ready-items/turn/mark-ready", payload });
  for (role of ["TECH", "LEASING", "CLEANER", "VIEWER"]) assert.equal((await submit()).statusCode, 403);
  role = "MANAGER"; access = [];
  assert.equal((await submit()).statusCode, 403);
  access = ["property"];
  assert.equal((await submit({ overrideReason: " " })).statusCode, 400);
  assert.equal((await submit({ overrideReason: "short" })).statusCode, 400);
  assert.equal((await submit({ overrideReason: "x".repeat(1001) })).statusCode, 400);
  assert.equal((await submit({})).statusCode, 409, "normal sign-off must retain blockers");
  active = false;
  assert.equal((await submit()).statusCode, 409);
  active = true; item.isArchived = true;
  assert.equal((await submit()).statusCode, 409);
  item.isArchived = false;
  assert.equal(audits.length, 0);
  for (role of ["MANAGER", "ADMIN"]) {
    item = { ...initial };
    const response = await submit();
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(item.completionStatus, "YES");
    assert.equal(item.boardGroup, "READY");
    assert.equal(item.vacancyStatus, "VACANT NOT LEASED READY");
    assert.equal(item.paintStatus, null);
    assert.equal(item.cleaningStatus, null);
    assert.equal(item.finalWalkReportDraft, null);
    assert.equal(blockUpdates.at(-1).data.status, "CANCELED");
    const audit = [...audits].reverse().find(row => row.action === "BOARD_ITEM_COMPLETION_OVERRIDDEN");
    assert.equal(audit.actorUserId, "actor");
    assert.equal(audit.metadata.role, role);
    assert.equal(audit.metadata.previous.completionStatus, "NO");
    assert.ok(audit.metadata.bypassedBlockers.some((value: string) => value.includes("Painting")));
    assert.equal(audit.metadata.reason, "Correcting historical board data");
  }
  item = { ...initial }; failAudit = true;
  assert.equal((await submit()).statusCode, 500);
  assert.equal(item.completionStatus, "NO", "audit failure rolls back completion");
});
