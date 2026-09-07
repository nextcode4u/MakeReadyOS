import assert from "node:assert/strict";
import { test } from "node:test";

test("bulk archive and restore validate every destination before a single update transaction", async (t) => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "batch-test";
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
  const items = [{ id: "a", propertyId: "a", assignedTech: null }, { id: "b", propertyId: "b", assignedTech: null }];
  let missing = true;
  let failTransaction = false;
  let transactions = 0;
  let audits = 0;
  const operations: any[] = [];
  stub(prisma.makeReadyItem, "findMany", async () => items);
  stub(prisma.boardSection, "findFirst", async ({ where }: any) => missing && where.propertyId === "b" ? null : { key: `${where.sectionType}-${where.propertyId}` });
  stub(prisma.makeReadyItem, "update", (operation: any) => { operations.push(operation); return operation; });
  stub(prisma, "$transaction", async (batch: any[]) => {
    transactions++;
    assert.equal(batch.length, 2);
    if (failTransaction) throw new Error("Test transaction rejected");
    return batch;
  });
  stub(prisma.auditLog, "create", async () => { audits++; return {}; });
  const app = Fastify();
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => { request.currentUser = { id: "admin", role: "ADMIN", propertyAccess: [] } as any; });
  await app.register(makeReadyRoutes);
  t.after(() => app.close());
  const submit = (action: string) => app.inject({ method: "POST", url: "/make-ready-items/batch", payload: { action, ids: ["a", "b"] } });
  for (const action of ["ARCHIVE", "RESTORE"]) {
    missing = true;
    operations.length = 0;
    const before: number = transactions;
    assert.equal((await submit(action)).statusCode, 409);
    assert.equal(operations.length, 0, "a missing later destination must not modify the first item");
    assert.equal(transactions, before);
    missing = false;
    const response = await submit(action);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().count, 2);
    assert.equal(transactions, before + 1);
    assert.deepEqual(operations.map(operation => operation.data.boardGroup), action === "ARCHIVE" ? ["ARCHIVE-a", "ARCHIVE-b"] : ["MAKE_READY-a", "MAKE_READY-b"]);
    assert.ok(operations.every(operation => operation.data.isArchived === (action === "ARCHIVE")));
  }
  failTransaction = true;
  const beforeAudit = audits;
  assert.equal((await submit("ARCHIVE")).statusCode, 500);
  assert.equal(audits, beforeAudit, "a failed transaction must not be audited as a successful batch");
  let assignmentQuery: any;
  stub(prisma.user, "findFirst", async (query: any) => { assignmentQuery = query; return null; });
  const deniedAssignment = await app.inject({ method: "POST", url: "/make-ready-items/batch", payload: { action: "ASSIGN_TECH", ids: ["a", "b"], value: "Outside Staff" } });
  assert.equal(deniedAssignment.statusCode, 400, deniedAssignment.body);
  assert.deepEqual(assignmentQuery.where.OR, [
    { role: "ADMIN" },
    { AND: [{ propertyAccess: { some: { propertyId: "a" } } }, { propertyAccess: { some: { propertyId: "b" } } }] },
  ]);
  assert.equal(assignmentQuery.where.isActive, true);
  assert.equal(assignmentQuery.where.fullName, "Outside Staff");
  stub(prisma.makeReadyItem, "findUnique", async () => items[0]);
  const deniedEdit = await app.inject({ method: "PATCH", url: "/make-ready-items/a", payload: { assignedTech: "Outside Staff" } });
  assert.equal(deniedEdit.statusCode, 400, deniedEdit.body);
  assert.deepEqual(assignmentQuery.where.OR[1].AND, [{ propertyAccess: { some: { propertyId: "a" } } }]);
  stub(prisma.property, "findFirst", async () => ({ id: "a", isActive: true }));
  const deniedCreate = await app.inject({ method: "POST", url: "/make-ready-items", payload: {
    propertyId: "a", boardGroup: "MAKE_READY-a", itemName: "101", unitNumber: "101", assignedTech: "Outside Staff",
  } });
  assert.equal(deniedCreate.statusCode, 400, deniedCreate.body);
  assert.deepEqual(assignmentQuery.where.OR[1].AND, [{ propertyAccess: { some: { propertyId: "a" } } }]);
});
