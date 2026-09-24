import assert from "node:assert/strict";

if (process.env.MROS_INTEGRATION_TEST !== "1") throw new Error("Run only through the isolated test.sh Docker stack.");
const { prisma } = await import("/app/dist/lib/prisma.js");
const { backupTransferRoutes } = await import("/app/dist/routes/backupTransfer.js");
const { default: Fastify } = await import("fastify");
const app = Fastify();
let property;
let actor;
const originalTransaction = prisma.$transaction.bind(prisma);
let failAudit = false;
let observedWrite = false;
try {
  actor = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => { request.currentUser = { ...actor, propertyAccess: [] }; });
  await app.register(backupTransferRoutes);
  property = await prisma.property.create({ data: { code: `RESTORE-QA-${Date.now()}`, name: "Partial unit restore QA" } });
  const plan = await prisma.floorPlan.create({ data: { propertyId: property.id, code: "ONE", name: "One bedroom" } });
  const backup = {
    format: "makereadyos.backup", version: 1, exportedAt: new Date().toISOString(), source: { app: "MakeReadyOS" },
    data: {
      ...Object.fromEntries(["properties", "makeReadyItems", "customFields", "customFieldOptions", "customFieldValues", "savedViews", "automationRules", "checklistTemplates", "notes"].map(key => [key, []])),
      units: [{ propertyCode: property.code, number: "101", floorPlanCode: plan.code, floorPlan: "1BR", squareFeet: 600, bedrooms: 1, bathrooms: 1, isActive: true, mailboxNumber: "12", accessCodes: { doorCode: "test-door", accessCode: "test-access", keyCode: "test-key" } }],
    },
  };
  const send = (dryRun, payload = backup) => app.inject({ method: "POST", url: "/admin/import", payload: { backup: payload, dryRun } });
  const count = () => prisma.unit.count({ where: { propertyId: property.id } });
  const auditCount = () => prisma.auditLog.count({ where: { actorUserId: actor.id, action: "BACKUP_IMPORTED" } });
  const beforeAudit = await auditCount();
  const preview = await send(true);
  assert.equal(preview.statusCode, 200, preview.body);
  assert.equal(preview.json().applied, false);
  assert.equal(preview.json().summary.units.created, 1);
  assert.equal(await count(), 0);
  assert.equal(await auditCount(), beforeAudit);

  const applied = await send(false);
  assert.equal(applied.statusCode, 200, applied.body);
  assert.equal(applied.json().applied, true);
  assert.deepEqual(applied.json().summary.units, preview.json().summary.units);
  const restored = await prisma.unit.findUniqueOrThrow({ where: { propertyId_number: { propertyId: property.id, number: "101" } } });
  assert.equal(restored.floorPlanId, plan.id);
  assert.equal(restored.mailboxNumber, "12");
  const codes = await prisma.unitAccessCode.findUniqueOrThrow({ where: { unitId: restored.id } });
  for (const [key, value] of Object.entries(backup.data.units[0].accessCodes)) assert.equal(codes[key], value);
  assert.equal(await auditCount(), beforeAudit + 1);

  const repeated = await send(false);
  assert.equal(repeated.statusCode, 200, repeated.body);
  assert.equal(repeated.json().summary.units.skipped, 1);
  assert.equal(repeated.json().summary.units.created, 0);
  assert.equal(await count(), 1);
  assert.equal(await prisma.unitAccessCode.count({ where: { unitId: restored.id } }), 1);

  // Inject failure only after real writes are visible inside the transaction.
  prisma.$transaction = (callback, options) => originalTransaction(async tx => {
    if (failAudit) tx.auditLog.create = async () => {
      const unit = await tx.unit.findUniqueOrThrow({ where: { propertyId_number: { propertyId: property.id, number: "102" } } });
      await tx.unitAccessCode.findUniqueOrThrow({ where: { unitId: unit.id } });
      observedWrite = true;
      throw new Error("Injected audit failure after unit and code creation");
    };
    return callback(tx);
  }, options);
  failAudit = true;
  const auditBeforeFailure = await auditCount();
  const failed = await send(false, { ...backup, data: { ...backup.data, units: [{ ...backup.data.units[0], number: "102" }] } });
  assert.equal(failed.statusCode, 500, failed.body);
  assert.equal(observedWrite, true);
  assert.equal(await count(), 1, "PostgreSQL rolls back the second unit");
  assert.equal(await prisma.unitAccessCode.count({ where: { unit: { propertyId: property.id } } }), 1, "PostgreSQL rolls back its access codes");
  assert.equal(await auditCount(), auditBeforeFailure);
  console.log("Partial unit restore: real PostgreSQL preview/apply parity, parent links, mailbox/codes, replay safety and rollback passed");
} finally {
  prisma.$transaction = originalTransaction;
  await app.close();
  if (property) await prisma.property.delete({ where: { id: property.id } });
  await prisma.$disconnect();
}
