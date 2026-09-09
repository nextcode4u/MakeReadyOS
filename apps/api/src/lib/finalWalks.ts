import { type Prisma, UserRole } from "@prisma/client";
import { prisma } from "./prisma.js";
import { createNotification } from "./notifications.js";

export const finalWalkCategory = "FINAL_WALK_INSPECTION";
export const pendingWalkStatuses = ["PLANNED", "IN_PROGRESS"];
export function independentInspectors<T extends { id: string; fullName: string }>(staff: T[], assignedTech: string | null) {
  return staff.filter(person => !assignedTech?.trim() || person.fullName.trim().toLocaleLowerCase() !== assignedTech.trim().toLocaleLowerCase());
}
export async function inspectorStaff(db: Prisma.TransactionClient, propertyId: string) {
  return db.user.findMany({ where: { isActive: true, role: { in: [UserRole.ADMIN, UserRole.MANAGER, UserRole.LEASING, UserRole.TECH] }, OR: [{ role: UserRole.ADMIN }, { propertyAccess: { some: { propertyId } } }] }, select: { id: true, fullName: true, role: true }, orderBy: { fullName: "asc" } });
}
export function nextInspector(queue: string[], current: string | null, eligible: string[]) {
  const index = current === null ? -1 : queue.indexOf(current);
  if (current !== null && index < 0) return undefined;
  return queue.slice(index + 1).find(id => eligible.includes(id));
}

export async function syncFinalWalks(propertyId: string, itemId?: string) {
  return prisma.$transaction(async db => {
    await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${propertyId}), 824018)::text`;
    const policy = await db.finalWalkPolicy.findUnique({ where: { propertyId } });
    const items = await db.makeReadyItem.findMany({ where: { propertyId, ...(itemId ? { id: itemId } : {}) } });
    const staff = await inspectorStaff(db, propertyId);
    let assigned = 0;
    for (const item of items) {
      const ready = item.makeReadyStatus === "FINAL WALK";
      const closed = item.isArchived || item.makeReadyStatus === "DONE";
      const blocks = await db.workAssignmentBlock.findMany({ where: { itemId: item.id, category: finalWalkCategory, status: { in: pendingWalkStatuses } }, orderBy: { createdAt: "asc" } });
      if (closed || !ready) {
        await db.workAssignmentBlock.updateMany({ where: { id: { in: blocks.map(block => block.id) } }, data: { status: item.makeReadyStatus === "DONE" ? "DONE" : "CANCELED" } });
        continue;
      }
      let block = blocks[0];
      if (!block && policy?.enabled && ready) {
        const assignee = nextInspector(policy.inspectors, null, independentInspectors(staff, item.assignedTech).map(user => user.id));
        if (!assignee) continue;
        block = await db.workAssignmentBlock.create({ data: { propertyId, itemId: item.id, assignedUserId: assignee, category: finalWalkCategory, inspectorQueue: policy.inspectors, plannedDate: item.makeReadyDate ?? new Date(), estimatedHours: .5, notes: "Final walk inspection; separate from repair assignment." } });
        assigned++;
        await db.auditLog.create({ data: { propertyId, entityType: "MAKE_READY_ITEM", entityId: item.id, action: "FINAL_WALK_ASSIGNED", message: "Assigned final walk inspector", metadata: { blockId: block.id, assignedUserId: assignee } } });
      }
      if (block && item.makeReadyDate && block.plannedDate.getTime() !== item.makeReadyDate.getTime()) await db.workAssignmentBlock.update({ where: { id: block.id }, data: { plannedDate: item.makeReadyDate } });
      if (block && ready && !block.readyNotified) {
        await createNotification({ userId: block.assignedUserId, propertyId, itemId: item.id, category: "ASSIGNMENT", title: "Final walk ready for inspection", message: `${item.unitNumber} is ready for your final walk. Open My Work to inspect or hand off.`, dedupeKey: `final-walk-ready:${block.id}` }, db);
        await db.workAssignmentBlock.update({ where: { id: block.id }, data: { readyNotified: true } });
      }
    }
    return { assigned };
  }, { timeout: 30000 });
}

export async function syncEnabledFinalWalks() {
  const policies = await prisma.finalWalkPolicy.findMany({ where: { property: { isActive: true } } });
  for (const policy of policies) {
    try { await syncFinalWalks(policy.propertyId); }
    catch (error) { console.error("Final walk scheduling failed", policy.propertyId, error); }
  }
}
