import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { plannedTurnStart } from "./turnStartProjection.js";
import { nextTurnAssignee, turnAssignmentStaff, turnSharesSchema, validateTurnStaff, type TurnShare } from "./turnAssignments.js";

export function forecastRotation(candidates: Array<{ id: string; vacancyDate: string }>, shares: TurnShare[], previous: Record<string, number>) {
  let credits = { ...previous };
  return [...candidates].sort((a, b) => a.vacancyDate.localeCompare(b.vacancyDate) || a.id.localeCompare(b.id)).map(candidate => {
    const next = nextTurnAssignee(shares, credits);
    credits = next.credits;
    return { id: candidate.id, userId: next.userId };
  });
}

// Read one consistent snapshot. Forecasting must never advance real rotation credits.
export async function myWorkForecast(targetId: string, scopedProperties: string[] | null) {
  return prisma.$transaction(async tx => {
    const properties = await tx.property.findMany({
      where: { isActive: true, ...(scopedProperties ? { id: { in: scopedProperties } } : {}) },
      select: { id: true, code: true, name: true, operatingCalendar: true, turnAssignmentPolicy: true },
    });
    const result: Array<{ id: string; title: string; propertyName: string; expectedStartDate: string; projectedStart: boolean; percent: number }> = [];
    const warnings: string[] = [];
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    for (const property of properties) {
      const policy = property.turnAssignmentPolicy;
      const parsed = turnSharesSchema.safeParse(policy?.shares);
      if (!parsed.success || !parsed.data.some(share => share.userId === targetId)) continue;
      if (!policy?.enabled) { warnings.push(`${property.code}: turn assignment is paused; no tentative assignments shown.`); continue; }
      const staff = await turnAssignmentStaff(tx, property.id);
      const warning = validateTurnStaff(parsed.data, staff);
      if (warning) { warnings.push(`${property.code}: ${warning}`); continue; }
      const items = await tx.makeReadyItem.findMany({
        where: { propertyId: property.id, isArchived: false },
        include: { customFieldValues: { where: { customField: { fieldKey: "turnMaintenanceDate", isArchived: false } } }, workAssignmentBlocks: { where: { status: { in: ["PLANNED", "IN_PROGRESS"] } }, select: { id: true } } },
      });
      const candidates = items.flatMap(item => {
        if (item.assignedTech?.trim() || item.workAssignmentBlocks.length) return [];
        const start = plannedTurnStart(item, item.customFieldValues[0]?.value, property.operatingCalendar);
        const notice = (item.vacancyStatus ?? "").trim().toUpperCase().startsWith("NTV");
        const vacancyDate = notice ? item.moveOutDate : item.vacatedDate ?? item.moveOutDate;
        if (!start || !vacancyDate) return [];
        return [{ id: item.id, vacancyDate: vacancyDate.toISOString(), start, unitNumber: item.unitNumber }];
      });
      // Include earlier unassigned vacancies in the simulation before filtering future dates.
      const assignments = forecastRotation(candidates, parsed.data, policy.credits as Record<string, number>);
      for (const assignment of assignments) {
        if (assignment.userId !== targetId) continue;
        const candidate = candidates.find(candidate => candidate.id === assignment.id)!;
        if (candidate.start.date.slice(0, 10) < today) continue;
        result.push({ id: candidate.id, title: `${property.code} ${candidate.unitNumber}`, propertyName: property.name, expectedStartDate: candidate.start.date, projectedStart: candidate.start.projected, percent: parsed.data.find(share => share.userId === targetId)!.percent });
      }
    }
    return { turns: result.sort((a, b) => a.expectedStartDate.slice(0, 10).localeCompare(b.expectedStartDate.slice(0, 10)) || a.title.localeCompare(b.title)), warnings };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 });
}
