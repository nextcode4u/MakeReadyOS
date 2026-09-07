import { Prisma } from "@prisma/client";
import { z } from "zod";
import { assignableStaffRoles } from "./auth.js";
import { prisma } from "./prisma.js";
import { createNotification } from "./notifications.js";

export const turnSharesSchema = z.array(z.object({ userId: z.string().min(1), percent: z.number().int().min(1).max(100) })).min(1).max(100)
  .refine(shares => shares.reduce((sum, share) => sum + share.percent, 0) === 100, "Percentages must total 100%")
  .refine(shares => new Set(shares.map(share => share.userId)).size === shares.length, "Each person may appear only once");
export type TurnShare = z.infer<typeof turnSharesSchema>[number];

// Smooth weighted round-robin: persisted credits measure share owed, not current workload.
export function nextTurnAssignee(shares: TurnShare[], previous: Record<string, number>) {
  const credits: Record<string, number> = {};
  const ordered = [...shares].sort((a, b) => a.userId.localeCompare(b.userId));
  for (const share of ordered) credits[share.userId] = (previous[share.userId] ?? 0) + share.percent;
  const selected = ordered.reduce((best, share) => credits[share.userId] > credits[best.userId] ? share : best);
  credits[selected.userId] -= 100;
  return { userId: selected.userId, credits };
}

export async function turnAssignmentStaff(tx: Prisma.TransactionClient, propertyId: string) {
  return tx.user.findMany({ where: { isActive: true, role: { in: assignableStaffRoles }, OR: [{ role: "ADMIN" }, { propertyAccess: { some: { propertyId } } }] }, select: { id: true, fullName: true }, orderBy: [{ fullName: "asc" }, { id: "asc" }] });
}

export function validateTurnStaff(shares: TurnShare[], staff: Array<{ id: string; fullName: string }>) {
  for (const share of shares) {
    const user = staff.find(user => user.id === share.userId);
    if (!user) return "A selected person is inactive or no longer has assignment access to this property. Update the split to resume.";
    if (!user.fullName.trim() || staff.filter(other => other.fullName === user.fullName).length > 1) return "Selected staff need distinct, nonempty display names because the board stores assignments by name.";
  }
  return null;
}

export function isAssignableTurn(item: { isArchived: boolean; completionStatus: string | null; assignedTech: string | null; vacancyStatus: string | null; vacatedDate: Date | null }, now = new Date()) {
  if (item.isArchived || item.assignedTech?.trim() || !item.vacatedDate || item.vacatedDate > now) return false;
  if (["DONE", "YES", "GOOD", "COMPLETE", "COMPLETED"].includes((item.completionStatus ?? "").trim().toUpperCase())) return false;
  const vacancy = (item.vacancyStatus ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  return ["VACANT", "VACANT_NOT_LEASED", "VACANT_LEASED", "VACANT_NOT_LEASED_NOT_READY", "VACANT_LEASED_NOT_READY"].includes(vacancy);
}

export async function runTurnAssignments(propertyId: string) {
  let assigned = 0;
  // Commit one assignment at a time; a retry cannot consume a share twice.
  for (let index = 0; index < 200; index++) {
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${propertyId}), 824017)::text`;
      const policy = await tx.turnAssignmentPolicy.findUnique({ where: { propertyId }, include: { property: { select: { isActive: true } } } });
      if (!policy?.enabled || !policy.property.isActive) return { done: true };
      const shares = turnSharesSchema.parse(policy.shares);
      const staff = await turnAssignmentStaff(tx, propertyId);
      const warning = validateTurnStaff(shares, staff);
      if (warning) return { done: true, warning };
      const items = await tx.makeReadyItem.findMany({ where: { propertyId, isArchived: false, vacatedDate: { lte: new Date() } }, orderBy: [{ vacatedDate: "asc" }, { id: "asc" }] });
      const candidate = items.find(item => isAssignableTurn(item));
      if (!candidate) return { done: true };
      await tx.$queryRaw`SELECT id FROM "MakeReadyItem" WHERE id = ${candidate.id} FOR UPDATE`;
      const item = await tx.makeReadyItem.findUnique({ where: { id: candidate.id } });
      if (!item || item.propertyId !== propertyId || !isAssignableTurn(item)) return { done: false };
      const next = nextTurnAssignee(shares, policy.credits as Record<string, number>);
      const user = staff.find(user => user.id === next.userId)!;
      await tx.makeReadyItem.update({ where: { id: item.id }, data: { assignedTech: user.fullName } });
      await tx.turnAssignmentPolicy.update({ where: { propertyId }, data: { credits: next.credits } });
      await tx.auditLog.create({ data: { propertyId, entityType: "MAKE_READY_ITEM", entityId: item.id, action: "TURN_AUTO_ASSIGNED", message: `Assigned unit ${item.unitNumber} to ${user.fullName} using the property's percentage split`, metadata: { userId: user.id, shares } } });
      await createNotification({ userId: user.id, propertyId, itemId: item.id, category: "ASSIGNMENT", title: "Make-ready assignment updated", message: `${item.unitNumber} has been assigned to you by the property's turn split.`, dedupeKey: `turn-split:${item.id}:${user.id}` }, tx);
      return { done: false, assigned: true };
    });
    if (result.assigned) assigned++;
    if (result.done) return { assigned, warning: result.warning ?? null };
  }
  return { assigned, warning: "Batch limit reached; remaining turns will be checked on the next run." };
}

export async function runEnabledTurnAssignments() {
  const policies = await prisma.turnAssignmentPolicy.findMany({ where: { enabled: true, property: { isActive: true } }, select: { propertyId: true } });
  for (const policy of policies) {
    try {
      const result = await runTurnAssignments(policy.propertyId);
      if (result.warning) console.error("Turn assignment needs review", policy.propertyId, result.warning);
    } catch (error) { console.error("Turn assignment failed", policy.propertyId, error); }
  }
}
