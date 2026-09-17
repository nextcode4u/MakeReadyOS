import type { MakeReadyItem, Prisma } from "@prisma/client";
import { isTurnReady } from "./turnStatus.js";

// Called inside the property lifecycle lock, before saving the status change.
export async function archiveOccupiedTurn(db: Prisma.TransactionClient, current: MakeReadyItem, patch: Record<string, unknown>) {
  if (String(patch.vacancyStatus ?? "").trim().toUpperCase() !== "OCCUPIED" || current.isArchived || !isTurnReady(current)) return;
  const archive = await db.boardSection.findFirst({ where: { propertyId: current.propertyId, sectionType: "ARCHIVE", isActive: true } });
  if (!archive) throw Object.assign(new Error("Configure an Archive section for this property before marking a ready unit Occupied."), { statusCode: 409 });
  Object.assign(patch, { vacancyStatus: "OCCUPIED", boardGroup: archive.key, isArchived: true, archivedAt: new Date() });
  if (current.unitId) await db.unit.updateMany({ where: { id: current.unitId, propertyId: current.propertyId }, data: { occupancyStatus: "OCCUPIED" } });
  await db.auditLog.create({ data: { propertyId: current.propertyId, entityType: "MAKE_READY_ITEM", entityId: current.id,
    action: "READY_TURN_OCCUPIED_ARCHIVED", message: `${current.unitNumber} marked Occupied and moved to the property's Archive.` } });
}
