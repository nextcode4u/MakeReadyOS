import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { scopedAllowedPropertyIds } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { evaluateItemRisk } from "../lib/risk.js";

export const dashboardQuerySchema = z.object({ propertyId: z.string().optional() });

function daysBetween(left: Date, right: Date) {
  return Math.ceil((right.getTime() - left.getTime()) / (24 * 60 * 60 * 1000));
}

function nowStart() {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  return value;
}

function daysFromNow(days: number) {
  const value = nowStart();
  value.setDate(value.getDate() + days);
  return value;
}

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/dashboard", async (request, reply) => {
    const query = dashboardQuerySchema.parse(request.query);
    const accessible = scopedAllowedPropertyIds(request);
    if (query.propertyId && accessible !== null && !accessible.includes(query.propertyId)) {
      reply.code(403);
      return { message: "Property access denied" };
    }
    const propertyId = query.propertyId ?? (accessible === null ? undefined : { in: accessible });
    const [items, archivedCount, sections, vendorAssignments, unitsCount, mapLocations, workBlocks, directoryUnits] = await Promise.all([
      prisma.makeReadyItem.findMany({
        where: { propertyId, isArchived: false, property: { isActive: true } },
        include: {
          property: true,
          comments: { where: { isDeleted: false }, orderBy: { createdAt: "desc" }, take: 1 },
          checklistInstances: { include: { items: true } },
          vendorAssignments: true,
          workAssignmentBlocks: { where: { status: { in: ["PLANNED", "IN_PROGRESS"] } } },
        },
      }),
      prisma.makeReadyItem.count({ where: { propertyId, isArchived: true } }),
      prisma.boardSection.findMany({ where: { propertyId, isActive: true } }),
      prisma.vendorAssignment.findMany({
        where: { propertyId, status: { notIn: ["COMPLETED", "CANCELED"] } },
        include: { vendor: true },
      }),
      prisma.unit.count({ where: { propertyId, isActive: true, property: { isActive: true } } }),
      prisma.unitMapLocation.findMany({
        where: { propertyId, isArchived: false, unit: { isActive: true } },
        select: { unitId: true, area: true },
      }),
      prisma.workAssignmentBlock.findMany({
        where: { propertyId, status: { in: ["PLANNED", "IN_PROGRESS"] }, plannedDate: { gte: nowStart(), lt: daysFromNow(7) } },
        include: { assignedUser: { select: { id: true, fullName: true, role: true, capacity: true } } },
      }),
      prisma.unit.findMany({
        where: { propertyId, isActive: true, isBudgeted: true, property: { isActive: true } },
        select: { occupancyStatus: true, property: { select: { id: true, occupancyGoalPercent: true } } },
      }),
    ]);
    const now = new Date();
    const inDays = (date: Date | null, days: number) => date && daysBetween(now, date) >= 0 && daysBetween(now, date) <= days;
    const weekStart = new Date(now);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const inCurrentWeek = (date: Date | null) => Boolean(date && date >= weekStart && date < weekEnd);
    const vendorScheduledThisWeek = vendorAssignments.filter((assignment) => inCurrentWeek(assignment.scheduledDate)).length;
    const vendorOverdue = vendorAssignments.filter((assignment) => assignment.dueDate && assignment.dueDate < weekStart).length;
    const vendorFollowUpNeeded = vendorAssignments.filter((assignment) => assignment.status === "FOLLOW_UP_NEEDED").length;
    const sectionType = new Map(sections.map((section) => [`${section.propertyId}:${section.key}`, section.sectionType]));
    const mappedUnitIds = new Set(mapLocations.map((location) => location.unitId));
    const downUnitIds = new Set(items
      .filter((item) => item.unitId && sectionType.get(`${item.propertyId}:${item.boardGroup}`) === "DOWN")
      .map((item) => item.unitId as string));
    const countStatus = (status: string) => items.filter((item) => item.vacancyStatus === status).length;
    const evaluated = items.map((item) => ({ item, risk: evaluateItemRisk(item) }));
    const breakdown = <K extends string>(values: K[]) => values.reduce<Record<string, number>>((result, value) => {
      result[value || "Unset"] = (result[value || "Unset"] ?? 0) + 1;
      return result;
    }, {});
    const needsAttention = evaluated
      .filter((entry) => entry.risk.riskReasons.length > 0)
      .sort((left, right) => right.risk.riskScore - left.risk.riskScore)
      .map((entry) => ({
        itemId: entry.item.id,
        unitNumber: entry.item.unitNumber,
        property: entry.item.property,
        reasons: entry.risk.riskReasons.map((reason) => reason.message),
        riskLevel: entry.risk.riskLevel,
        riskScore: entry.risk.riskScore,
      }))
      .slice(0, 20);
    const riskByLevel = evaluated.reduce<Record<string, number>>((acc, entry) => {
      acc[entry.risk.riskLevel] = (acc[entry.risk.riskLevel] ?? 0) + 1;
      return acc;
    }, {});
    const riskByCategory = evaluated.reduce<Record<string, number>>((acc, entry) => {
      for (const reason of entry.risk.riskReasons) acc[reason.category] = (acc[reason.category] ?? 0) + 1;
      return acc;
    }, {});
    const occupiedUnits = directoryUnits.filter((unit) => unit.occupancyStatus === "OCCUPIED").length;
    const directoryVacantReady = directoryUnits.filter((unit) => unit.occupancyStatus === "VACANT_READY").length;
    const directoryVacantLeased = directoryUnits.filter((unit) => unit.occupancyStatus === "VACANT_LEASED").length;
    const directoryNtv = directoryUnits.filter((unit) => unit.occupancyStatus === "NTV").length;
    const directoryNtvLeased = directoryUnits.filter((unit) => unit.occupancyStatus === "NTV_LEASED").length;
    const occupancyPercent = directoryUnits.length ? Math.round((occupiedUnits / directoryUnits.length) * 1000) / 10 : 0;
    const goalContributors = new Map<string, { goal: number; count: number }>();
    for (const unit of directoryUnits) {
      const goal = unit.property.occupancyGoalPercent;
      if (goal === null) continue;
      const current = goalContributors.get(unit.property.id) ?? { goal, count: 0 };
      current.count += 1;
      goalContributors.set(unit.property.id, current);
    }
    const goalUnits = [...goalContributors.values()];
    const occupancyGoalPercent = goalUnits.length
      ? Math.round((goalUnits.reduce((sum, entry) => sum + entry.goal * entry.count, 0) / goalUnits.reduce((sum, entry) => sum + entry.count, 0)) * 10) / 10
      : 0;

    return {
      kpis: {
        active: items.length,
        vacant: countStatus("VACANT"),
        vacantLeased: countStatus("VACANT LEASED"),
        ntv: items.filter((item) => item.vacancyStatus?.startsWith("NTV")).length,
        downUnits: items.filter((item) => sectionType.get(`${item.propertyId}:${item.boardGroup}`) === "DOWN").length,
        readyUnits: items.filter((item) => sectionType.get(`${item.propertyId}:${item.boardGroup}`) === "READY").length,
        archived: archivedCount,
        moveInsThisWeek: items.filter((item) => inCurrentWeek(item.moveInDate)).length,
        moveInsNext7Days: items.filter((item) => inDays(item.moveInDate, 7)).length,
        moveInsNext14Days: items.filter((item) => inDays(item.moveInDate, 14)).length,
        overdue: items.filter((item) => item.overdue).length,
        averageDaysVacant: items.length ? Math.round(items.reduce((total, item) => total + item.daysVacant, 0) / items.length) : 0,
        missingTech: items.filter((item) => !item.assignedTech).length,
        missingCriticalDates: items.filter((item) => !item.makeReadyDate || !item.vacatedDate).length,
        pestIssues: items.filter((item) => item.pestStatus && !["NONE", "TREATED"].includes(item.pestStatus)).length,
        flooringNeeds: items.filter((item) => item.floorsStatus === "REPLACE CARPET").length,
        paintNeeds: items.filter((item) => item.paintStatus && item.paintStatus !== "GOOD").length,
        moveInRisk: evaluated.filter((entry) => entry.risk.riskReasons.some((reason) => reason.category === "MOVE_IN_RISK" || reason.category === "DATE_CONFLICT")).length,
        riskCritical: riskByLevel.CRITICAL ?? 0,
        riskHigh: riskByLevel.HIGH ?? 0,
        agingTurns: evaluated.filter((entry) => entry.risk.riskReasons.some((reason) => reason.category === "PROPERTY_WORKLOAD")).length,
        vendorScheduledThisWeek,
        vendorOverdue,
        vendorFollowUpNeeded,
        blockedByVendor: new Set(vendorAssignments.map((assignment) => assignment.itemId)).size,
        mappedUnits: mappedUnitIds.size,
        unmappedUnits: Math.max(0, unitsCount - mappedUnitIds.size),
        highRiskMappedUnits: evaluated.filter((entry) => entry.item.unitId && mappedUnitIds.has(entry.item.unitId) && ["HIGH", "CRITICAL"].includes(entry.risk.riskLevel)).length,
        plannedWorkBlocks: workBlocks.length,
        unplannedMoveIns: evaluated.filter((entry) => entry.item.moveInDate && inDays(entry.item.moveInDate, 7) && entry.item.workAssignmentBlocks?.length === 0).length,
        totalUnits: directoryUnits.length,
        occupiedUnits,
        occupancyPercent,
        occupancyGoalPercent,
        vacantReadyUnits: directoryVacantReady,
        directoryVacantLeased,
        directoryNtv,
        directoryNtvLeased,
        readyStock: items.filter((item) => sectionType.get(`${item.propertyId}:${item.boardGroup}`) === "READY" && !item.isArchived).length,
      },
      vacancyBreakdown: breakdown(items.map((item) => item.vacancyStatus ?? "Unset")),
      scopeBreakdown: breakdown(items.map((item) => item.scopeLevel ?? "Unset")),
      techWorkload: breakdown(items.map((item) => item.assignedTech ?? "Unassigned")),
      propertyComparison: breakdown(items.map((item) => item.property.code)),
      riskByLevel,
      riskByCategory,
      riskByProperty: evaluated.reduce<Record<string, number>>((acc, entry) => {
        if (entry.risk.riskLevel === "HIGH" || entry.risk.riskLevel === "CRITICAL") acc[entry.item.property.code] = (acc[entry.item.property.code] ?? 0) + 1;
        return acc;
      }, {}),
      riskByAssignedTech: evaluated.reduce<Record<string, number>>((acc, entry) => {
        if (entry.risk.riskLevel === "HIGH" || entry.risk.riskLevel === "CRITICAL") acc[entry.item.assignedTech || "Unassigned"] = (acc[entry.item.assignedTech || "Unassigned"] ?? 0) + 1;
        return acc;
      }, {}),
      riskTrend: { available: false, message: "Risk history is not persisted yet." },
      downUnitsByArea: mapLocations.filter((location) => downUnitIds.has(location.unitId)).reduce<Record<string, number>>((acc, location) => {
        const area = location.area || "Unassigned Area";
        acc[area] = (acc[area] ?? 0) + 1;
        return acc;
      }, {}),
      longestVacant: [...items].sort((a, b) => b.daysVacant - a.daysVacant).slice(0, 5).map((item) => ({
        itemId: item.id, unitNumber: item.unitNumber, property: item.property, daysVacant: item.daysVacant,
      })),
      needsAttention,
    };
  });
}
