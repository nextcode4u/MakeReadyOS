import type { MakeReadyItem, Prisma } from "@prisma/client";
import { isTurnReady } from "./turnStatus.js";

// Called inside the property lifecycle lock, before saving the status change.
export async function archiveOccupiedTurn(db: Prisma.TransactionClient, current: MakeReadyItem, patch: Record<string, unknown>, preserveResident = false) {
  if (!["vacancyStatus", "completionStatus", "makeReadyStatus"].some(key => Object.prototype.hasOwnProperty.call(patch, key))) return;
  const next = { ...current, ...patch } as MakeReadyItem;
  // Preserve imported ready status when occupancy is the only lifecycle change.
  const wasReady = !("completionStatus" in patch) && !("makeReadyStatus" in patch) && isTurnReady(current);
  const explicitlyOccupied = String(patch.vacancyStatus ?? "").trim().toUpperCase() === "OCCUPIED";
  if (String(next.vacancyStatus ?? "").trim().toUpperCase() !== "OCCUPIED" || current.isArchived || (!explicitlyOccupied && !isTurnReady(next) && !wasReady)) return;
  const ready = isTurnReady(next) || wasReady;
  const archive = await db.boardSection.findFirst({ where: { propertyId: current.propertyId, sectionType: "ARCHIVE", isActive: true } });
  if (!archive) throw Object.assign(new Error("Configure an Archive section for this property before marking a unit Occupied."), { statusCode: 409 });
  Object.assign(patch, { vacancyStatus: "OCCUPIED", boardGroup: archive.key, isArchived: true, archivedAt: new Date(), overdue: false, moveInSoon: false, riskScore: 0, riskLevel: "NONE", riskReasons: [] });
  const applicant = Object.prototype.hasOwnProperty.call(patch, "applicant") ? patch.applicant : current.applicant;
  const moveInDate = Object.prototype.hasOwnProperty.call(patch, "moveInDate") ? patch.moveInDate : current.moveInDate;
  // A canceled turn / renewal retains the resident established by the directory.
  if (current.unitId) await db.unit.updateMany({ where: { id: current.unitId, propertyId: current.propertyId }, data: { occupancyStatus: "OCCUPIED", ...(ready && !preserveResident ? { currentResidentName: typeof applicant === "string" ? applicant.trim() || null : null, currentResidentMoveInDate: moveInDate instanceof Date ? moveInDate : typeof moveInDate === "string" ? new Date(moveInDate) : null } : {}) } });
  await db.workAssignmentBlock.updateMany({ where: { itemId: current.id, status: { in: ["PLANNED", "IN_PROGRESS"] } }, data: { status: "CANCELED" } });
  await db.auditLog.create({ data: { propertyId: current.propertyId, entityType: "MAKE_READY_ITEM", entityId: current.id,
    action: ready ? "READY_TURN_OCCUPIED_ARCHIVED" : "OCCUPIED_TURN_CLOSED", message: `${current.unitNumber} marked Occupied and moved to the property's Archive. Unfinished work was not marked complete.` } });
}
