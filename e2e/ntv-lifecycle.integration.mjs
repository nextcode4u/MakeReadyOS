import assert from "node:assert/strict";

if (process.env.MROS_INTEGRATION_TEST !== "1") throw new Error("Run only through the isolated test.sh Docker stack.");
const { prisma } = await import("/app/dist/lib/prisma.js");
const { executeScheduledAutomationRules } = await import("/app/dist/lib/scheduledAutomations.js");
const properties = [];
const itemIds = [];
const originalFindMany = prisma.makeReadyItem.findMany;
try {
  const code = `NTV-QA-${Date.now()}`;
  const active = await prisma.property.create({ data: { code, name: "NTV lifecycle test" } });
  const archived = await prisma.property.create({ data: { code: `${code}-OLD`, name: "Archived NTV test", isActive: false } });
  properties.push(active.id, archived.id);
  const create = async (propertyId, unitNumber, extra = {}) => {
    const item = await prisma.makeReadyItem.create({ data: { propertyId, unitNumber, itemName: unitNumber, boardGroup: "QA", vacancyStatus: "NTV LEASED", moveOutDate: new Date(Date.now() - 86400000), ...extra } });
    itemIds.push(item.id);
    return item;
  };
  const due = await create(active.id, "DUE");
  const later = await create(active.id, "LATER", { moveOutDate: new Date(Date.now() + 7 * 86400000) });
  const archivedTurn = await create(active.id, "ARCHIVED", { isArchived: true });
  const inactive = await create(archived.id, "INACTIVE-PROPERTY");
  // Both workers receive the same due snapshot before either can write it.
  let reads = 0;
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  prisma.makeReadyItem.findMany = async args => {
    const rows = await originalFindMany.call(prisma.makeReadyItem, args);
    if (args.where?.vacancyStatus?.in) {
      reads++;
      if (reads === 2) release();
      await barrier;
    }
    return rows;
  };
  const runs = await Promise.all([1, 2].map(() => executeScheduledAutomationRules({ mode: "SCHEDULED", allowedPropertyIds: properties })));
  prisma.makeReadyItem.findMany = originalFindMany;
  assert.equal(reads, 2);
  assert.equal(runs.reduce((sum, run) => sum + run.actionCount, 0), 1);
  assert.deepEqual(runs.flatMap(run => run.lifecycle.errors), []);
  assert.equal(await prisma.auditLog.count({ where: { action: "NTV_PREWALK_TRIGGERED", entityId: due.id } }), 1);
  assert.equal((await prisma.makeReadyItem.findUniqueOrThrow({ where: { id: due.id } })).vacancyStatus, "TO PRE-WALK");
  for (const item of [later, archivedTurn, inactive]) {
    assert.equal((await prisma.makeReadyItem.findUniqueOrThrow({ where: { id: item.id } })).vacancyStatus, "NTV LEASED");
  }
  assert.equal((await executeScheduledAutomationRules({ mode: "SCHEDULED", allowedPropertyIds: properties })).actionCount, 0);
  console.log("NTV lifecycle concurrency, inactive-property exclusion and idempotency passed");
} finally {
  prisma.makeReadyItem.findMany = originalFindMany;
  await prisma.auditLog.deleteMany({ where: { entityId: { in: itemIds } } });
  await prisma.property.deleteMany({ where: { id: { in: properties } } });
  await prisma.$disconnect();
}
