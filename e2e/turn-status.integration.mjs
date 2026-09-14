import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "/app/dist/lib/prisma.js";
import { syncFinalWalks } from "/app/dist/lib/finalWalks.js";

const suffix = randomUUID();
let property;
let inspector;
try {
  property = await prisma.property.create({ data: { code: `STATUS-${suffix}`, name: "Status consistency fixture" } });
  inspector = await prisma.user.create({ data: { username: `status-${suffix}`, fullName: "Fixture Inspector", passwordHash: "disabled-test-login", role: "LEASING", propertyAccess: { create: { propertyId: property.id, role: "LEASING" } } } });
  await prisma.finalWalkPolicy.create({ data: { propertyId: property.id, inspectors: [inspector.id] } });
  const base = { propertyId: property.id, boardGroup: "WORK", itemName: "Fixture", makeReadyStatus: "DONE", completionStatus: "NO", paintStatus: "NOT_NEEDED", cleaningStatus: "not-needed" };
  const imported = await prisma.makeReadyItem.create({ data: { ...base, unitNumber: "READY", vacancyStatus: "VACANT_LEASED_READY" } });
  const pending = await prisma.makeReadyItem.create({ data: { ...base, unitNumber: "PENDING", vacancyStatus: "VACANT_NOT_LEASED_NOT_READY" } });
  assert.deepEqual(await syncFinalWalks(property.id), { assigned: 1 });
  assert.equal(await prisma.workAssignmentBlock.count({ where: { itemId: imported.id } }), 0);
  const block = await prisma.workAssignmentBlock.findFirstOrThrow({ where: { itemId: pending.id } });
  assert.equal(block.assignedUserId, inspector.id);
  assert.equal(block.status, "PLANNED");
  assert.equal(block.readyNotified, true);
  assert.deepEqual(await syncFinalWalks(property.id), { assigned: 0 });
  assert.equal(await prisma.workAssignmentBlock.count({ where: { itemId: pending.id } }), 1);
  await prisma.makeReadyItem.update({ where: { id: pending.id }, data: { vacancyStatus: "VACANT_NOT_LEASED_READY" } });
  assert.deepEqual(await syncFinalWalks(property.id), { assigned: 0 });
  assert.equal((await prisma.workAssignmentBlock.findUniqueOrThrow({ where: { id: block.id } })).status, "CANCELED");
  assert.equal(await prisma.finalWalkReportDraft.count({ where: { itemId: pending.id } }), 0);
  assert.equal((await prisma.makeReadyItem.findUniqueOrThrow({ where: { id: pending.id } })).completionStatus, "NO");
  console.log("Turn status database integration passed");
} finally {
  if (property) await prisma.property.delete({ where: { id: property.id } });
  if (inspector) await prisma.user.delete({ where: { id: inspector.id } });
  await prisma.$disconnect();
}
