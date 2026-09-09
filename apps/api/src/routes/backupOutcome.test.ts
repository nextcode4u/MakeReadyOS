import assert from "node:assert/strict";
import { test } from "node:test";

test("native imports report application separately from preview and keep audit transactional", async t => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "backup-outcome-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  process.env.APP_URL = "http://localhost:8080";
  const { prisma } = await import("../lib/prisma.js");
  const { backupTransferRoutes } = await import("./backupTransfer.js");
  const { default: Fastify } = await import("fastify");
  const stub = (delegate: any, name: string, fn: (...args: any[]) => unknown) => {
    const original = delegate[name]; delegate[name] = fn;
    t.after(() => { delegate[name] = original; });
  };
  for (const delegate of [prisma.property, prisma.customField, prisma.vendor, prisma.propertyMap]) stub(delegate, "findMany", async () => []);
  let inTransaction = false;
  let commits = 0;
  let auditCalls = 0;
  let rejectAudit = false;
  stub(prisma, "$transaction", async callback => {
    inTransaction = true;
    try { const result = await callback(prisma); commits++; return result; }
    finally { inTransaction = false; }
  });
  stub(prisma.auditLog, "create", async ({ data }) => {
    auditCalls++;
    assert.equal(inTransaction, true, "import audit must be written before the transaction commits");
    assert.equal(data.action, "BACKUP_IMPORTED");
    if (rejectAudit) throw new Error("Audit storage unavailable");
    return {};
  });
  const app = Fastify();
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => { request.currentUser = { id: "admin", role: "ADMIN", propertyAccess: [] } as any; });
  await app.register(backupTransferRoutes);
  t.after(() => app.close());
  const backup = { format: "makereadyos.backup", version: 1, exportedAt: new Date().toISOString(), source: { app: "MakeReadyOS" }, data: Object.fromEntries(["properties", "units", "makeReadyItems", "customFields", "customFieldOptions", "customFieldValues", "savedViews", "automationRules", "checklistTemplates", "notes"].map(key => [key, []])) };
  const send = (dryRun: boolean, data: unknown = backup) => app.inject({ method: "POST", url: "/admin/import", payload: { dryRun, backup: data } });
  await t.test("preview never claims to be applied", async () => {
    const response = await send(true);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().applied, false);
    assert.equal(commits, 0);
    assert.equal(auditCalls, 0);
  });
  await t.test("preflight rejection does not start a write transaction", async () => {
    const response = await send(false, { ...backup, data: { ...backup.data, properties: [{ code: "A", name: "A" }, { code: "A", name: "A" }] } });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().applied, false);
    assert.equal(response.json().summary.properties.conflicts, 1);
    assert.equal(commits, 0);
  });
  await t.test("confirmed merge includes audit in the transaction", async () => {
    const response = await send(false);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().applied, true);
    assert.equal(commits, 1);
    assert.equal(auditCalls, 1);
  });
  await t.test("audit failure cannot follow a committed merge", async () => {
    rejectAudit = true; commits = 0; auditCalls = 0;
    const response = await send(false);
    assert.equal(response.statusCode, 500, response.body);
    assert.equal(commits, 0);
    assert.equal(auditCalls, 1);
  });
});
