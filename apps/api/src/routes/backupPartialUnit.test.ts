import assert from "node:assert/strict";
import { test } from "node:test";

test("partial unit restore preserves existing parents and reports actual outcomes", async t => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "backup-unit-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  process.env.APP_URL = "http://localhost:8080";
  const { prisma } = await import("../lib/prisma.js");
  const { backupTransferRoutes } = await import("./backupTransfer.js");
  const { default: Fastify } = await import("fastify");
  const stub = (delegate: any, name: string, fn: (...args: any[]) => unknown) => {
    const original = delegate[name];
    delegate[name] = fn;
    t.after(() => { delegate[name] = original; });
  };
  let inTransaction = false;
  let mode = "valid";
  let commits = 0;
  let units: any[] = [];
  let codes: any[] = [];
  stub(prisma, "$queryRaw", async () => []);
  stub(prisma, "$transaction", async callback => {
    inTransaction = true;
    const before = { units: [...units], codes: [...codes] };
    try { const result = await callback(prisma); commits++; return result; }
    catch (error) { units = before.units; codes = before.codes; throw error; }
    finally { inTransaction = false; }
  });
  stub(prisma.property, "findMany", async () => []);
  stub(prisma.customField, "findMany", async () => []);
  stub(prisma.property, "findUnique", async ({ where }) => {
    assert.equal(where.code, "A");
    return mode === "absent property" || (inTransaction && mode === "removed property") ? null : { id: "property-a", code: "A" };
  });
  stub(prisma.floorPlan, "findFirst", async ({ where }) => {
    assert.equal(where.propertyId, "property-a");
    assert.deepEqual(where.OR, [{ code: "one-bed" }, { name: "one-bed" }]);
    return inTransaction && mode === "removed floor plan" ? null : { id: "plan-a" };
  });
  stub(prisma.unit, "findUnique", async ({ where }) => {
    assert.equal(where.propertyId_number.propertyId, "property-a");
    return units.find(unit => unit.number === where.propertyId_number.number) ?? null;
  });
  stub(prisma.unit, "create", async ({ data }) => {
    const unit = { id: "unit-a", ...data };
    units.push(unit);
    return unit;
  });
  stub(prisma.unitAccessCode, "create", async ({ data }) => { codes.push(data); return data; });
  stub(prisma.auditLog, "create", async () => ({}));
  const app = Fastify();
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => { request.currentUser = { id: "admin", role: "ADMIN", propertyAccess: [] } as any; });
  await app.register(backupTransferRoutes);
  t.after(() => app.close());
  const backup = { format: "makereadyos.backup", version: 1, exportedAt: "2026-09-23T12:00:00.000Z", source: { app: "MakeReadyOS" }, data: {
    ...Object.fromEntries(["properties", "makeReadyItems", "customFields", "customFieldOptions", "customFieldValues", "savedViews", "automationRules", "checklistTemplates", "notes"].map(key => [key, []])),
    units: [{ propertyCode: "A", number: "101", floorPlanCode: "one-bed", floorPlan: "1BR", squareFeet: 600, bedrooms: 1, bathrooms: 1, isActive: true, mailboxNumber: "12", accessCodes: { doorCode: "test-door", accessCode: "test-access", keyCode: "test-key" } }],
  } };
  const send = (dryRun: boolean) => app.inject({ method: "POST", url: "/admin/import", payload: { backup, dryRun } });

  await t.test("preview and apply agree; repeat apply skips without duplicating codes", async () => {
    const preview = await send(true);
    assert.equal(preview.statusCode, 200, preview.body);
    assert.equal(preview.json().summary.units.created, 1);
    assert.equal(preview.json().applied, false);
    assert.equal(units.length, 0);
    assert.equal(codes.length, 0);
    const applied = await send(false);
    assert.equal(applied.statusCode, 200, applied.body);
    assert.equal(applied.json().applied, true);
    assert.deepEqual(applied.json().summary.units, preview.json().summary.units);
    assert.equal(units.length, 1);
    assert.equal(units[0].propertyId, "property-a");
    assert.equal(units[0].floorPlanId, "plan-a");
    assert.equal(units[0].mailboxNumber, "12");
    assert.deepEqual(codes, [{ unitId: "unit-a", ...backup.data.units[0].accessCodes }]);
    const repeated = await send(false);
    assert.equal(repeated.statusCode, 200, repeated.body);
    assert.equal(repeated.json().summary.units.skipped, 1);
    assert.equal(repeated.json().summary.units.created, 0);
    assert.equal(units.length, 1);
    assert.equal(codes.length, 1);
  });
  for (const scenario of ["removed property", "removed floor plan"]) {
    await t.test(scenario, async () => {
      mode = scenario; units = []; codes = []; commits = 0;
      const response = await send(false);
      assert.equal(response.statusCode, 409, response.body);
      assert.match(response.json().message, /no import changes were committed/);
      assert.equal(commits, 0);
      assert.equal(units.length, 0);
      assert.equal(codes.length, 0);
    });
  }
  await t.test("legacy floor-plan names and units without floor plans are supported", async () => {
    mode = "valid"; units = []; codes = [];
    const unit = backup.data.units[0];
    for (const floorPlanName of ["one-bed", null]) {
      units = []; codes = [];
      const response = await app.inject({ method: "POST", url: "/admin/import", payload: {
        dryRun: false,
        backup: { ...backup, data: { ...backup.data, units: [{ ...unit, floorPlanCode: null, floorPlanName, accessCodes: null }] } },
      } });
      assert.equal(response.statusCode, 200, response.body);
      assert.equal(response.json().applied, true);
      assert.equal(units.length, 1);
      assert.equal(units[0].floorPlanId, floorPlanName ? "plan-a" : null);
      assert.equal(codes.length, 0);
    }
  });
  await t.test("missing property fails validation rather than claiming an applied restore", async () => {
    mode = "absent property"; commits = 0;
    const response = await send(false);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().applied, false);
    assert.match(response.json().summary.units.errors.join(" "), /Property A is missing/);
    assert.equal(commits, 0);
  });
});
