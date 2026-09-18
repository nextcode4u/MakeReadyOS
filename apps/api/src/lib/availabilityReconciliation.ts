import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { isReadyAvailabilityStatus } from "./availabilityStatus.js";
import { isFinalWalkStatus } from "./turnStatus.js";
import { resolveReportDay } from "./reportDate.js";

const day = (date: Date) => date.toISOString().slice(0, 10);
const unitKey = (value: string) => value.trim().toUpperCase().replace(/\d+/g, digits => digits.replace(/^0+(?=\d)/, ""));
const excludedOccupancy = (value: string | null) => ["DOWN", "MODEL", "NTV", "NTV LEASED", "NTV NOT LEASED"].includes(String(value ?? "").trim().toUpperCase().replace(/[_-]+/g, " "));
export function reconciliationDate(value: string | undefined, now = new Date()) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Object.assign(new Error("A full report needs its report date (YYYY-MM-DD)."), { statusCode: 400 });
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || day(parsed) !== value || value > day(now)) throw Object.assign(new Error("Report date must be a real date, not in the future."), { statusCode: 400 });
  return value;
}

type Candidate = { id: string; unitId: string | null; unitNumber: string; vacancyStatus: string | null; boardGroup: string; moveInDate: Date | null; updatedAt: Date; isArchived: boolean; makeReadyStatus: string | null; completionStatus: string | null; unit: { isActive: boolean; occupancyStatus: string } | null };
export function missingReadyTurns(items: Candidate[], sections: Array<{ key: string; sectionType: string }>, numbers: string[], reportDate: string) {
  const present = new Set(numbers.map(unitKey));
  return items.filter(item => {
    const section = sections.find(section => section.key === item.boardGroup)?.sectionType;
    const ready = isReadyAvailabilityStatus(item.vacancyStatus ?? "") || section === "READY" || ["YES", "DONE", "COMPLETE", "COMPLETED"].includes(item.completionStatus ?? "");
    return !item.isArchived && item.unitId && item.unit?.isActive && ready
      && !excludedOccupancy(item.vacancyStatus) && !excludedOccupancy(item.unit.occupancyStatus)
      && section !== "DOWN" && !isFinalWalkStatus(item.makeReadyStatus)
      && !present.has(unitKey(item.unitNumber)) && item.moveInDate && day(item.moveInDate) < reportDate
      && day(item.updatedAt) <= reportDate
      && items.filter(other => !other.isArchived && (other.unitId === item.unitId || unitKey(other.unitNumber) === unitKey(item.unitNumber))).length === 1;
  });
}

export async function availabilityArchivePlan(db: Prisma.TransactionClient, input: { propertyId: string; rows: Array<{ number: string; reportDate?: string | null }>; reportDate?: string }) {
  const reportDate = reconciliationDate(resolveReportDay(input.rows, input.reportDate));
  const sections = await db.boardSection.findMany({ where: { propertyId: input.propertyId, isActive: true } });
  const items = await db.makeReadyItem.findMany({ where: { propertyId: input.propertyId, isArchived: false }, include: { unit: { select: { isActive: true, occupancyStatus: true } } } });
  const candidates = missingReadyTurns(items, sections, input.rows.map(row => row.number), reportDate);
  const archiveSection = sections.find(section => section.sectionType === "ARCHIVE");
  if (candidates.length && !archiveSection) throw Object.assign(new Error("Configure an Archive section before reconciling missing units."), { statusCode: 409 });
  const token = createHash("sha256").update(JSON.stringify({ propertyId: input.propertyId, rows: input.rows, reportDate, archiveSection: archiveSection?.key, candidates: candidates.map(item => [item.id, item.updatedAt, item.unit]).sort() })).digest("hex");
  return { candidates, archiveSection, token, reportDate };
}
