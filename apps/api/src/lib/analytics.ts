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
        vendorAssignments: { include: { vendor: true } },
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
  const slaMissByScope = Array.from(
    completed.reduce((acc, entry) => {
      if (!entry.item.makeReadyDate || !entry.completedAt || entry.completedAt <= entry.item.makeReadyDate) return acc;
      const key = entry.item.scopeLevel?.trim() || "Unscoped";
      const current = acc.get(key) ?? { scopeLevel: key, missCount: 0, totalLateDays: 0, worstLateDays: 0 };
      const lateDays = Math.max(1, Math.ceil((entry.completedAt.getTime() - entry.item.makeReadyDate.getTime()) / dayMs));
      current.missCount += 1;
      current.totalLateDays += lateDays;
      current.worstLateDays = Math.max(current.worstLateDays, lateDays);
      acc.set(key, current);
      return acc;
    }, new Map<string, { scopeLevel: string; missCount: number; totalLateDays: number; worstLateDays: number }>())
  ).map(([, entry]) => ({
    scopeLevel: entry.scopeLevel,
    missCount: entry.missCount,
    averageLateDays: Math.round(entry.totalLateDays / Math.max(1, entry.missCount)),
    worstLateDays: entry.worstLateDays,
  }))
    .sort((a, b) => b.missCount - a.missCount || b.averageLateDays - a.averageLateDays || a.scopeLevel.localeCompare(b.scopeLevel))
    .slice(0, 8);
  const technicianThroughput = Array.from(
    items.reduce((acc, item) => {
      const key = item.assignedTech?.trim() || "Unassigned";
      const current = acc.get(key) ?? {
        name: key,
        activeCount: 0,
        overdueCount: 0,
        highRiskCount: 0,
        completedTurns: 0,
        totalTurnDuration: 0,
        durationSamples: 0,
        totalChecklistCompletionPercent: 0,
        checklistSamples: 0,
      };
      if (!item.isArchived) {
        current.activeCount += 1;
        current.overdueCount += item.overdue ? 1 : 0;
        current.highRiskCount += ["HIGH", "CRITICAL"].includes(item.riskLevel) ? 1 : 0;
      }
      const completedAt = completionDateForItem(item);
      if (completedAt) {
        current.completedTurns += 1;
        const duration = daysBetween(item.vacatedDate ?? item.createdAt, completedAt);
        if (duration !== null) {
          current.totalTurnDuration += duration;
          current.durationSamples += 1;
        }
      }
      const checklistTasks = item.checklistInstances.flatMap((instance) => instance.items);
      if (checklistTasks.length) {
        current.totalChecklistCompletionPercent += Math.round(checklistTasks.filter((task) => task.completed).length / checklistTasks.length * 100);
        current.checklistSamples += 1;
      }
      acc.set(key, current);
      return acc;
    }, new Map<string, {
      name: string;
      activeCount: number;
      overdueCount: number;
      highRiskCount: number;
      completedTurns: number;
      totalTurnDuration: number;
      durationSamples: number;
      totalChecklistCompletionPercent: number;
      checklistSamples: number;
    }>())
  ).map(([, entry]) => ({
    name: entry.name,
    activeCount: entry.activeCount,
    overdueCount: entry.overdueCount,
    highRiskCount: entry.highRiskCount,
    completedTurns: entry.completedTurns,
    averageTurnDuration: entry.durationSamples ? Math.round(entry.totalTurnDuration / entry.durationSamples) : null,
    averageChecklistCompletionPercent: entry.checklistSamples ? Math.round(entry.totalChecklistCompletionPercent / entry.checklistSamples) : 0,
  }))
    .filter((entry) => entry.name !== "Unassigned" || entry.activeCount > 0)
    .sort((a, b) => b.completedTurns - a.completedTurns || b.activeCount - a.activeCount || a.name.localeCompare(b.name))
    .slice(0, 10);
  const vendorThroughput = Array.from(
    items.flatMap((item) => item.vendorAssignments).reduce((acc, assignment) => {
      const key = assignment.vendorId;
      const current = acc.get(key) ?? {
        vendorId: assignment.vendorId,
        vendorName: assignment.vendor.name,
        trade: assignment.trade,
        activeAssignments: 0,
        overdueAssignments: 0,
        completedAssignments: 0,
        totalCompletionDays: 0,
        completionSamples: 0,
      };
      const isOpen = !["COMPLETED", "CANCELED"].includes(assignment.status);
      if (isOpen) {
        current.activeAssignments += 1;
        current.overdueAssignments += assignment.dueDate && assignment.dueDate < now ? 1 : 0;
      }
      if (assignment.completedAt) {
        current.completedAssignments += 1;
        const completionDays = daysBetween(assignment.createdAt, assignment.completedAt);
        if (completionDays !== null) {
          current.totalCompletionDays += completionDays;
          current.completionSamples += 1;
        }
      }
      acc.set(key, current);
      return acc;
    }, new Map<string, {
      vendorId: string;
      vendorName: string;
      trade: string;
      activeAssignments: number;
      overdueAssignments: number;
      completedAssignments: number;
      totalCompletionDays: number;
      completionSamples: number;
    }>())
  ).map(([, entry]) => ({
    vendorId: entry.vendorId,
    vendorName: entry.vendorName,
    trade: entry.trade,
    activeAssignments: entry.activeAssignments,
    overdueAssignments: entry.overdueAssignments,
    completedAssignments: entry.completedAssignments,
    averageCompletionDays: entry.completionSamples ? Math.round(entry.totalCompletionDays / entry.completionSamples) : null,
  }))
    .sort((a, b) => b.completedAssignments - a.completedAssignments || b.activeAssignments - a.activeAssignments || a.vendorName.localeCompare(b.vendorName))
    .slice(0, 10);
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
    const activeTurns = turns.filter((item) => !item.isArchived);
    const completedTurns = turns
      .map((item) => ({ item, completedAt: completionDateForItem(item) }))
      .filter((entry) => entry.completedAt);
    const turnDurations = completedTurns
      .map((entry) => daysBetween(entry.item.vacatedDate ?? entry.item.createdAt, entry.completedAt))
      .filter((value): value is number => value !== null);
    const checklistCompletionPercentages = turns
      .map((item) => {
        if (!item.checklistInstances.length) return null;
        const tasks = item.checklistInstances.flatMap((instance) => instance.items);
        if (!tasks.length) return 0;
        return Math.round(tasks.filter((task) => task.completed).length / tasks.length * 100);
      })
      .filter((value): value is number => value !== null);
    const pestTurns = turns.filter((item) => item.pestStatus && !["NONE", "TREATED"].includes(item.pestStatus)).length;
    const flooringTurns = turns.filter((item) => item.floorsStatus && item.floorsStatus !== "GOOD").length;
    const paintTurns = turns.filter((item) => item.paintStatus && item.paintStatus !== "GOOD").length;
    const vendorTurns = turns.filter((item) => item.vendorAssignments.length > 0).length;
    const highRiskTurns = turns.filter((item) => ["HIGH", "CRITICAL"].includes(item.riskLevel)).length;
    const score = pestTurns + flooringTurns + paintTurns + vendorTurns + highRiskTurns;
    const latest = turns[0];
    const currentTurn = activeTurns[0] ?? null;
    const latestCompletedAt = completedTurns.length
      ? completedTurns.reduce((latestValue, entry) => !latestValue || entry.completedAt! > latestValue ? entry.completedAt! : latestValue, null as Date | null)
      : null;
    return {
      unitId: latest.unitId,
      unitNumber: latest.unitNumber,
      property: latest.property,
      turnCount: turns.length,
      activeTurnCount: activeTurns.length,
      completedTurnCount: completedTurns.length,
      currentItemId: currentTurn?.id ?? null,
      lastActivityAt: latest.updatedAt,
      latestCompletedAt,
      averageTurnDuration: turnDurations.length ? Math.round(turnDurations.reduce((sum, value) => sum + value, 0) / turnDurations.length) : null,
      averageChecklistCompletionPercent: checklistCompletionPercentages.length
        ? Math.round(checklistCompletionPercentages.reduce((sum, value) => sum + value, 0) / checklistCompletionPercentages.length)
        : 0,
      score,
      signals: { pestTurns, flooringTurns, paintTurns, vendorTurns, highRiskTurns },
    };
  }).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score).slice(0, 10);
  const propertyComparisonTotals = activeItems.reduce<Record<string, { active: number; overdue: number; highRisk: number; averageDaysVacant: number }>>((acc, item) => {
    const key = item.property.code;
    const current = acc[key] ?? { active: 0, overdue: 0, highRisk: 0, averageDaysVacant: 0 };
    current.active += 1;
    current.overdue += item.overdue ? 1 : 0;
    current.highRisk += ["HIGH", "CRITICAL"].includes(item.riskLevel) ? 1 : 0;
    current.averageDaysVacant += item.daysVacant;
    acc[key] = current;
    return acc;
  }, {});
  const propertyComparison = Object.fromEntries(Object.entries(propertyComparisonTotals).map(([key, value]) => [
    key,
    {
      ...value,
      averageDaysVacant: value.active ? Math.round((value.averageDaysVacant / value.active) * 10) / 10 : 0,
    },
  ]));

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
    propertyComparison,
    trends: snapshots.map((snapshot) => ({
      date: snapshot.date,
      property: snapshot.property,
      activeTurns: snapshot.activeTurns,
      overdue: snapshot.overdue,
      highRisk: snapshot.highRisk,
      averageDaysVacant: snapshot.averageDaysVacant,
      completedTurnsCount: snapshot.completedTurnsCount,
    })),
    slaMissByScope,
    technicianThroughput,
    vendorThroughput,
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
