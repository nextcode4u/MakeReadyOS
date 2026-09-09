import assert from "node:assert/strict";
import { test } from "node:test";

test("partial project restore rechecks property and map before committing", async t => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "backup-map-test";
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
  let inTransaction = false;
  let commits = 0;
  let created: any;
  let mode = "valid";
  stub(prisma, "$transaction", async callback => {
    inTransaction = true;
    try { const result = await callback(prisma); commits++; return result; }
    finally { inTransaction = false; }
  });
  stub(prisma.property, "findUnique", async ({ where }) => {
    assert.equal(where.code, "A");
    return inTransaction && mode === "missing property" ? null : { id: "property-a", code: "A" };
  });
  stub(prisma.propertyMap, "findMany", async query => {
    assert.deepEqual(query.where, { propertyId: "property-a", name: "Site plan" });
    assert.equal(query.take, 2);
    if (inTransaction && mode === "missing map") return [];
    if (inTransaction && mode === "duplicate map") return [{ id: "map-a" }, { id: "map-b" }];
    return [{ id: "map-a" }];
  });
  stub(prisma.projectRecord, "findFirst", async () => null);
  stub(prisma.projectRecord, "create", async ({ data }) => { created = data; return { id: "restored" }; });
  stub(prisma.auditLog, "create", async () => ({}));
  const app = Fastify();
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => { request.currentUser = { id: "admin", role: "ADMIN", propertyAccess: [] } as any; });
  await app.register(backupTransferRoutes);
  t.after(() => app.close());
  const date = "2026-09-01T12:00:00.000Z";
  const backup = { format: "makereadyos.backup", version: 1, exportedAt: date, source: { app: "MakeReadyOS" }, data: {
    ...Object.fromEntries(["properties", "units", "makeReadyItems", "customFields", "customFieldOptions", "customFieldValues", "savedViews", "automationRules", "checklistTemplates", "notes"].map(key => [key, []])),
    projectRecords: [{ portableKey: "project", propertyCode: "A", recordType: "Project", title: "Partial restore", status: "Planning", priority: "Normal", executionType: "In House", propertyMapName: "Site plan", pinX: 20, pinY: 30, createdAt: date, updatedAt: date }],
  } };
  for (const scenario of ["valid", "missing property", "missing map", "duplicate map"]) {
    await t.test(scenario, async () => {
      mode = scenario; commits = 0; created = undefined;
      const response = await app.inject({ method: "POST", url: "/admin/import", payload: { backup, dryRun: false } });
      assert.equal(response.statusCode, scenario === "valid" ? 200 : 409, response.body);
      assert.equal(commits, scenario === "valid" ? 1 : 0);
      if (scenario === "valid") {
        assert.equal(response.json().applied, true);
        assert.equal(created.propertyId, "property-a");
        assert.equal(created.propertyMapId, "map-a");
        assert.equal(created.pinX, 20);
      } else {
        assert.equal(created, undefined);
        assert.match(response.json().message, /no import changes were committed/);
      }
    });
  }
});
