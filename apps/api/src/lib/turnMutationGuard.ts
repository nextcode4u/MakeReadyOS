import type { MakeReadyItem, Prisma } from "@prisma/client";
import { getTurnReadiness } from "./turnReadiness.js";
import { isFinalWalkStatus } from "./turnStatus.js";

const normalized = (value: unknown) => String(value ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
const readyPhases = new Set(["DONE", "COMPLETE", "COMPLETED", "READY"]);
const readyVacancies = new Set(["VACANT_LEASED_READY", "VACANT_NOT_LEASED_READY", "VACANT_READY"]);

export function requestsInspection(current: Pick<MakeReadyItem, "makeReadyStatus" | "completionStatus">, patch: Record<string, unknown>) {
  return normalized(patch.completionStatus) === "YES"
    && normalized(current.completionStatus) !== "YES"
    && !["FINAL_WALK", "DONE", "COMPLETE", "COMPLETED", "READY"].includes(normalized(current.makeReadyStatus));
}

export function readyStatusIntent(current: Pick<MakeReadyItem, "makeReadyStatus" | "vacancyStatus">, patch: Record<string, unknown>) {
  return ("makeReadyStatus" in patch && !readyPhases.has(normalized(current.makeReadyStatus)) && readyPhases.has(normalized(patch.makeReadyStatus)))
    || ("vacancyStatus" in patch && !readyVacancies.has(normalized(current.vacancyStatus)) && readyVacancies.has(normalized(patch.vacancyStatus)));
}

export async function lockTurnProperty(db: Prisma.TransactionClient, propertyId: string) {
  await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${propertyId}), 824018)::text`;
}

// Call inside a transaction after locking the property's lifecycle operations.
export async function guardReadyMutation(db: Prisma.TransactionClient, current: MakeReadyItem, patch: Record<string, unknown>, reviewerName: string) {
  const groupChanged = typeof patch.boardGroup === "string" && patch.boardGroup !== current.boardGroup;
  const readyGroup = groupChanged && await db.boardSection.findFirst({ where: { propertyId: current.propertyId, key: patch.boardGroup as string, sectionType: "READY", isActive: true } });
  if (!readyGroup && !readyStatusIntent(current, patch)) return;
  const inspection = isFinalWalkStatus(current.makeReadyStatus)
    || await db.finalWalkReportDraft.findUnique({ where: { itemId: current.id }, select: { itemId: true } })
    || await db.workAssignmentBlock.findFirst({ where: { itemId: current.id, category: "FINAL_WALK_INSPECTION" }, select: { id: true } });
  if (inspection) throw Object.assign(new Error(`${current.unitNumber}: complete this inspection using Final walk / Mark ready, not a status or group edit.`), { statusCode: 409 });
  const blockers = await getTurnReadiness(db, current.id, reviewerName);
  if (blockers.length) throw Object.assign(new Error(`${current.unitNumber}: cannot move to Ready. ${blockers.slice(0, 5).join("; ")}`), { statusCode: 409 });
}
