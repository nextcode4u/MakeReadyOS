import { prisma } from "./prisma.js";

const dayMs = 24 * 60 * 60 * 1000;

export function startOfDay(input = new Date()) {
  const date = new Date(input);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(input: Date, days: number) {
  const date = new Date(input);
  date.setDate(date.getDate() + days);
  return date;
}

function daysBetween(start?: Date | null, end?: Date | null) {
  if (!start || !end) return null;
  return Math.max(0, Math.ceil((end.getTime() - start.getTime()) / dayMs));
}

function isCompleteStatus(value?: string | null) {
  return Boolean(value && ["YES", "DONE", "GOOD", "MADE", "COMPLETE", "COMPLETED"].includes(value.toUpperCase()));
}

export function completionDateForItem(item: {
  archivedAt?: Date | null;
  moveInDate?: Date | null;
  updatedAt: Date;
  completionStatus?: string | null;
  makeReadyStatus?: string | null;
  cleaningStatus?: string | null;
}) {
  if (item.archivedAt) return item.archivedAt;
  if (isCompleteStatus(item.completionStatus) || isCompleteStatus(item.makeReadyStatus) || isCompleteStatus(item.cleaningStatus)) {
    return item.moveInDate ?? item.updatedAt;
  }
  return null;
}

function boardSectionTypeMap(sections: Array<{ propertyId: string; key: string; sectionType: string }>) {
  return new Map(sections.map((section) => [`${section.propertyId}:${section.key}`, section.sectionType]));
}

function isVacantStatus(value?: string | null) {
  return Boolean(value && ["VACANT", "VACANT_NOT_LEASED", "VACANT_READY", "VACANT NOT LEASED READY", "VACANT NOT LEASED NOT READY", "VACANT LEASED", "VACANT_LEASED", "VACANT LEASED READY", "VACANT LEASED NOT READY"].includes(value));
}

export async function computePropertySnapshot(propertyId: string, date = startOfDay()) {
  const nextDay = addDays(date, 1);
  const next7 = addDays(date, 7);
  const [items, sections] = await Promise.all([
    prisma.makeReadyItem.findMany({
      where: { propertyId, property: { isActive: true } },
      include: { property: true },
    }),
    prisma.boardSection.findMany({ where: { propertyId, isActive: true } }),
  ]);

  const sectionTypes = boardSectionTypeMap(sections);
  const activeItems = items.filter((item) => !item.isArchived);
  const completedToday = items.filter((item) => {
    const completedAt = completionDateForItem(item);
    return Boolean(completedAt && completedAt >= date && completedAt < nextDay);
  });

  return {
    propertyId,
    date,
    activeTurns: activeItems.length,
    vacant: activeItems.filter((item) => isVacantStatus(item.vacancyStatus)).length,
    ntv: activeItems.filter((item) => item.vacancyStatus?.startsWith("NTV")).length,
    ready: activeItems.filter((item) => sectionTypes.get(`${item.propertyId}:${item.boardGroup}`) === "READY").length,
    down: activeItems.filter((item) => sectionTypes.get(`${item.propertyId}:${item.boardGroup}`) === "DOWN").length,
    overdue: activeItems.filter((item) => item.overdue).length,
    highRisk: activeItems.filter((item) => item.riskLevel === "HIGH" || item.riskLevel === "CRITICAL").length,
    averageDaysVacant: activeItems.length ? activeItems.reduce((sum, item) => sum + item.daysVacant, 0) / activeItems.length : 0,
    moveInsNext7Days: activeItems.filter((item) => item.moveInDate && item.moveInDate >= date && item.moveInDate <= next7).length,
    completedTurnsCount: completedToday.length,
  };
}

export async function runAnalyticsSnapshot(propertyIds?: string[]) {
  const date = startOfDay();
  const properties = await prisma.property.findMany({
    where: { isActive: true, id: propertyIds?.length ? { in: propertyIds } : undefined },
    orderBy: { code: "asc" },
  });

  const snapshots = [];
  for (const property of properties) {
    const snapshot = await computePropertySnapshot(property.id, date);
    const saved = await prisma.propertyDailyMetricSnapshot.upsert({
      where: { propertyId_date: { propertyId: property.id, date } },
      create: snapshot,
      update: snapshot,
    });
    snapshots.push({ ...saved, property });
  }

  return { date, count: snapshots.length, snapshots };
}

export async function analyticsSummary(wherePropertyId: { in: string[] } | string | undefined) {
  const now = new Date();
  const today = startOfDay(now);
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const snapshotsFrom = addDays(today, -30);

  const [items, snapshots] = await Promise.all([
    prisma.makeReadyItem.findMany({
      where: { propertyId: wherePropertyId, property: { isActive: true } },
      include: {
        property: true,
        vendorAssignments: true,
        checklistInstances: { include: { items: true } },
      },
      orderBy: [{ propertyId: "asc" }, { unitNumber: "asc" }, { createdAt: "desc" }],
    }),
    prisma.propertyDailyMetricSnapshot.findMany({
      where: { propertyId: wherePropertyId, date: { gte: snapshotsFrom } },
      include: { property: true },
      orderBy: [{ date: "asc" }, { propertyId: "asc" }],
    }),
  ]);

  const completed = items.map((item) => ({ item, completedAt: completionDateForItem(item) })).filter((entry) => entry.completedAt);
  const completedThisWeek = completed.filter((entry) => entry.completedAt! >= weekStart).length;
  const completedThisMonth = completed.filter((entry) => entry.completedAt! >= monthStart).length;
  const durations = completed.map((entry) => daysBetween(entry.item.vacatedDate ?? entry.item.createdAt, entry.completedAt)).filter((value): value is number => value !== null);
  const activeItems = items.filter((item) => !item.isArchived);
  const riskReasons = activeItems.flatMap((item) => Array.isArray(item.riskReasons) ? item.riskReasons as Array<{ category?: string }> : []);
  const riskByCategory = riskReasons.reduce<Record<string, number>>((acc, reason) => {
    if (reason.category) acc[reason.category] = (acc[reason.category] ?? 0) + 1;
    return acc;
  }, {});
  const riskByLevel = activeItems.reduce<Record<string, number>>((acc, item) => {
    acc[item.riskLevel] = (acc[item.riskLevel] ?? 0) + 1;
    return acc;
  }, {});
  const completedWithMissedReadyDate = completed.filter((entry) => entry.item.makeReadyDate && entry.completedAt! > entry.item.makeReadyDate).length;
  const unitGroups = new Map<string, typeof items>();
  for (const item of items) {
    const key = item.unitId ?? `${item.propertyId}:${item.unitNumber}`;
    unitGroups.set(key, [...(unitGroups.get(key) ?? []), item]);
  }
  const recurringProblemUnits = Array.from(unitGroups.values()).map((turns) => {
    const pestTurns = turns.filter((item) => item.pestStatus && !["NONE", "TREATED"].includes(item.pestStatus)).length;
    const flooringTurns = turns.filter((item) => item.floorsStatus && item.floorsStatus !== "GOOD").length;
    const paintTurns = turns.filter((item) => item.paintStatus && item.paintStatus !== "GOOD").length;
    const vendorTurns = turns.filter((item) => item.vendorAssignments.length > 0).length;
    const highRiskTurns = turns.filter((item) => ["HIGH", "CRITICAL"].includes(item.riskLevel)).length;
    const score = pestTurns + flooringTurns + paintTurns + vendorTurns + highRiskTurns;
    const latest = turns[0];
    return {
      unitId: latest.unitId,
      unitNumber: latest.unitNumber,
      property: latest.property,
      turnCount: turns.length,
      score,
      signals: { pestTurns, flooringTurns, paintTurns, vendorTurns, highRiskTurns },
    };
  }).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score).slice(0, 10);

  return {
    generatedAt: now,
    metrics: {
      activeTurns: activeItems.length,
      averageDaysVacant: activeItems.length ? Math.round(activeItems.reduce((sum, item) => sum + item.daysVacant, 0) / activeItems.length) : 0,
      averageTurnDuration: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0,
      completedThisWeek,
      completedThisMonth,
      overdue: activeItems.filter((item) => item.overdue).length,
      highRisk: activeItems.filter((item) => ["HIGH", "CRITICAL"].includes(item.riskLevel)).length,
      criticalRisk: activeItems.filter((item) => item.riskLevel === "CRITICAL").length,
      slaMisses: completedWithMissedReadyDate,
      staleRiskItems: activeItems.filter((item) => riskReasonsForItem(item).some((reason) => reason.category === "STALE_ACTIVITY")).length,
    },
    riskByLevel,
    riskByCategory,
    propertyComparison: activeItems.reduce<Record<string, { active: number; overdue: number; highRisk: number; averageDaysVacant: number }>>((acc, item) => {
      const key = item.property.code;
      const current = acc[key] ?? { active: 0, overdue: 0, highRisk: 0, averageDaysVacant: 0 };
      current.active += 1;
      current.overdue += item.overdue ? 1 : 0;
      current.highRisk += ["HIGH", "CRITICAL"].includes(item.riskLevel) ? 1 : 0;
      current.averageDaysVacant += item.daysVacant;
      acc[key] = current;
      return acc;
    }, {}),
    trends: snapshots.map((snapshot) => ({
      date: snapshot.date,
      property: snapshot.property,
      activeTurns: snapshot.activeTurns,
      overdue: snapshot.overdue,
      highRisk: snapshot.highRisk,
      averageDaysVacant: snapshot.averageDaysVacant,
      completedTurnsCount: snapshot.completedTurnsCount,
    })),
    recurringProblemUnits,
    recentCompletedTurns: completed
      .sort((a, b) => b.completedAt!.getTime() - a.completedAt!.getTime())
      .slice(0, 10)
      .map(({ item, completedAt }) => ({
        itemId: item.id,
        unitNumber: item.unitNumber,
        property: item.property,
        completedAt,
        turnDuration: daysBetween(item.vacatedDate ?? item.createdAt, completedAt),
        daysVacant: item.daysVacant,
        riskLevel: item.riskLevel,
        assignedTech: item.assignedTech,
        vendorWorkCount: item.vendorAssignments.length,
        checklistCompletionPercent: item.checklistInstances.length
          ? Math.round(item.checklistInstances.flatMap((instance) => instance.items).filter((task) => task.completed).length / Math.max(1, item.checklistInstances.flatMap((instance) => instance.items).length) * 100)
          : 0,
      })),
  };
}

function riskReasonsForItem(item: { riskReasons: unknown }) {
  return Array.isArray(item.riskReasons) ? item.riskReasons as Array<{ category?: string }> : [];
}
