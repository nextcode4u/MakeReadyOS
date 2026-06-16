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
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [items, archivedCount, sections, vendorAssignments, unitsCount, mapLocations, workBlocks, directoryUnits, propertyMaps, propertyMapPins, recentAudit] = await Promise.all([
      prisma.makeReadyItem.findMany({
        where: { propertyId, property: { isActive: true } },
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
      prisma.propertyMap.findMany({
        where: { propertyId, isArchived: false },
        select: { id: true, name: true, mapType: true, isActive: true, isDefault: true, updatedAt: true },
        orderBy: [{ isDefault: "desc" }, { isActive: "desc" }, { updatedAt: "desc" }],
      }),
      prisma.propertyMapPin.findMany({
        where: { propertyId, isArchived: false },
        include: { map: { select: { id: true, name: true } } },
        orderBy: [{ isEmergency: "desc" }, { updatedAt: "desc" }],
      }),
      prisma.auditLog.findMany({
        where: {
          propertyId,
          createdAt: { gte: last24Hours },
          entityType: { in: ["MAKE_READY_ITEM", "AVAILABILITY_IMPORT"] },
          action: { in: ["BOARD_ITEM_MARKED_READY", "BOARD_ITEM_ARCHIVED", "AVAILABILITY_SYNCED", "AVAILABILITY_IMPORTED"] },
        },
        include: { property: true },
        orderBy: { createdAt: "desc" },
        take: 80,
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
    const hasAnyStatus = (value: string | null, statuses: string[]) => Boolean(value && statuses.includes(value));
    const vacantStatuses = ["VACANT", "VACANT_NOT_LEASED", "VACANT_READY", "VACANT NOT LEASED READY", "VACANT NOT LEASED NOT READY"];
    const vacantLeasedStatuses = ["VACANT LEASED", "VACANT_LEASED", "VACANT LEASED READY", "VACANT LEASED NOT READY"];
    const readyStockStatuses = ["VACANT_READY", "VACANT NOT LEASED READY", "VACANT LEASED READY"];
    const ntvStatuses = ["NTV", "NTV NOT LEASED", "NTV_LEASED", "NTV LEASED"];
    const activeItems = items.filter((item) => !item.isArchived);
    const evaluated = activeItems.map((item) => ({
      item,
      risk: evaluateItemRisk({
        ...item,
        boardSectionType: sectionType.get(`${item.propertyId}:${item.boardGroup}`) ?? null,
      }),
    }));
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
    const directoryVacantReady = directoryUnits.filter((unit) => hasAnyStatus(unit.occupancyStatus, readyStockStatuses)).length;
    const directoryVacantLeased = directoryUnits.filter((unit) => hasAnyStatus(unit.occupancyStatus, vacantLeasedStatuses)).length;
    const directoryNtv = directoryUnits.filter((unit) => unit.occupancyStatus === "NTV" || unit.occupancyStatus === "NTV NOT LEASED").length;
    const directoryNtvLeased = directoryUnits.filter((unit) => unit.occupancyStatus === "NTV_LEASED" || unit.occupancyStatus === "NTV LEASED").length;
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
    const defaultMap = propertyMaps.find((map) => map.isDefault) ?? propertyMaps.find((map) => map.isActive) ?? propertyMaps[0] ?? null;
    const utilityPinLabels = new Set(["Utility", "Pool", "Gate", "Fire System", "Access Control"]);

    return {
      kpis: {
        active: activeItems.length,
        vacant: activeItems.filter((item) => hasAnyStatus(item.vacancyStatus, vacantStatuses)).length,
        vacantLeased: activeItems.filter((item) => hasAnyStatus(item.vacancyStatus, vacantLeasedStatuses)).length,
        ntv: activeItems.filter((item) => item.vacancyStatus?.startsWith("NTV")).length,
        downUnits: activeItems.filter((item) => sectionType.get(`${item.propertyId}:${item.boardGroup}`) === "DOWN").length,
        readyUnits: activeItems.filter((item) => sectionType.get(`${item.propertyId}:${item.boardGroup}`) === "READY").length,
        archived: archivedCount,
        moveInsThisWeek: activeItems.filter((item) => inCurrentWeek(item.moveInDate)).length,
        moveInsNext7Days: activeItems.filter((item) => inDays(item.moveInDate, 7)).length,
        moveInsNext14Days: activeItems.filter((item) => inDays(item.moveInDate, 14)).length,
        overdue: activeItems.filter((item) => item.overdue).length,
        averageDaysVacant: activeItems.length ? Math.round(activeItems.reduce((total, item) => total + item.daysVacant, 0) / activeItems.length) : 0,
        missingTech: activeItems.filter((item) => !item.assignedTech).length,
        missingCriticalDates: activeItems.filter((item) => !item.makeReadyDate || !item.vacatedDate).length,
        pestIssues: activeItems.filter((item) => item.pestStatus && !["NONE", "TREATED"].includes(item.pestStatus)).length,
        flooringNeeds: activeItems.filter((item) => item.floorsStatus === "REPLACE CARPET").length,
        paintNeeds: activeItems.filter((item) => item.paintStatus && item.paintStatus !== "GOOD").length,
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
      vacancyBreakdown: breakdown(activeItems.map((item) => item.vacancyStatus ?? "Unset")),
      scopeBreakdown: breakdown(activeItems.map((item) => item.scopeLevel ?? "Unset")),
      techWorkload: breakdown(activeItems.map((item) => item.assignedTech ?? "Unassigned")),
      propertyComparison: breakdown(activeItems.map((item) => item.property.code)),
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
      longestVacant: [...activeItems].sort((a, b) => b.daysVacant - a.daysVacant).slice(0, 5).map((item) => ({
        itemId: item.id, unitNumber: item.unitNumber, property: item.property, daysVacant: item.daysVacant,
      })),
      needsAttention,
      recentStatusChanges: [
        ...activeItems
          .filter((item) => item.vacatedDate && item.vacatedDate >= last24Hours)
          .map((item) => ({
            key: `vacated:${item.id}:${item.vacatedDate?.toISOString()}`,
            itemId: item.id,
            unitNumber: item.unitNumber,
            property: item.property,
            changeType: "VACATED",
            title: "Came vacant",
            detail: item.vacatedDate ? `Vacated ${item.vacatedDate.toISOString().slice(0, 10)}` : "Vacated",
            changedAt: item.vacatedDate!.toISOString(),
            source: "board",
          })),
        ...activeItems
          .filter((item) => item.moveOutDate && item.moveOutDate >= last24Hours)
          .map((item) => ({
            key: `notice:${item.id}:${item.moveOutDate?.toISOString()}`,
            itemId: item.id,
            unitNumber: item.unitNumber,
            property: item.property,
            changeType: "NOTICE",
            title: "Notice logged",
            detail: item.moveOutDate ? `NTV ${item.moveOutDate.toISOString().slice(0, 10)}` : "Notice to vacate updated",
            changedAt: item.moveOutDate!.toISOString(),
            source: "board",
          })),
        ...recentAudit.flatMap((entry) => {
          const item = entry.entityId ? items.find((candidate) => candidate.id === entry.entityId) : null;
          if (!item || !entry.property) return [];
          if (entry.action === "BOARD_ITEM_MARKED_READY") {
            return [{
              key: `ready:${entry.id}`,
              itemId: item.id,
              unitNumber: item.unitNumber,
              property: item.property,
              changeType: "READY",
              title: "Marked ready",
              detail: "Passed final walk and moved to Ready Units.",
              changedAt: entry.createdAt.toISOString(),
              source: "board",
            }];
          }
          if (entry.action === "BOARD_ITEM_ARCHIVED") {
            return [{
              key: `archive:${entry.id}`,
              itemId: item.id,
              unitNumber: item.unitNumber,
              property: item.property,
              changeType: "MOVED_IN",
              title: "Moved in / archived",
              detail: "Turn archived after move-in or completion.",
              changedAt: entry.createdAt.toISOString(),
              source: "board",
            }];
          }
          if (entry.action === "AVAILABILITY_SYNCED") {
            const metadata = (entry.metadata ?? {}) as Record<string, unknown>;
            const vacancyStatus = typeof metadata.vacancyStatus === "string" ? metadata.vacancyStatus : item.vacancyStatus;
            const title = vacancyStatus?.includes("READY")
              ? "Availability marked ready"
              : vacancyStatus?.startsWith("NTV")
                ? "Availability updated notice"
                : vacancyStatus?.includes("VACANT")
                  ? "Availability updated vacancy"
                  : "Availability synced";
            const reportDate = typeof metadata.reportDate === "string" ? metadata.reportDate : null;
            return [{
              key: `availability:${entry.id}`,
              itemId: item.id,
              unitNumber: item.unitNumber,
              property: item.property,
              changeType: "AVAILABILITY",
              title,
              detail: reportDate ? `Report ${reportDate}` : "Imported from latest availability file.",
              changedAt: entry.createdAt.toISOString(),
              source: "availability",
            }];
          }
          return [];
        }),
      ]
        .sort((left, right) => new Date(right.changedAt).getTime() - new Date(left.changedAt).getTime())
        .slice(0, 20),
      propertyMaps: {
        totalMaps: propertyMaps.length,
        activeMaps: propertyMaps.filter((map) => map.isActive).length,
        defaultMapName: defaultMap?.name ?? null,
        totalPins: propertyMapPins.length,
        emergencyPins: propertyMapPins.filter((pin) => pin.isEmergency).length,
        utilityPins: propertyMapPins.filter((pin) => utilityPinLabels.has(pin.pinType)).length,
        unmappedUnits: Math.max(0, unitsCount - mappedUnitIds.size),
        recentPins: propertyMapPins.slice(0, 6).map((pin) => ({
          id: pin.id,
          title: pin.title,
          pinType: pin.pinType,
          mapName: pin.map.name,
          isEmergency: pin.isEmergency,
          building: pin.building,
          unitLabel: pin.unitLabel,
          area: pin.area,
        })),
      },
    };
  });
}
