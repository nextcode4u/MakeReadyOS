import type { Prisma } from "@prisma/client";
import { UserRole } from "@prisma/client";
import { prisma } from "./prisma.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export const planningStaffRoles = [UserRole.ADMIN, UserRole.MANAGER, UserRole.TECH, UserRole.CLEANER] as const;
export const activePlanningStatuses = ["PLANNED", "IN_PROGRESS"] as const;

export function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number) {
  const next = startOfDay(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function dateKey(date: Date) {
  return startOfDay(date).toISOString().slice(0, 10);
}

export function defaultPlanningWindow() {
  const from = startOfDay(new Date());
  return { from, to: addDays(from, 7) };
}

export async function planningSummary(where: Prisma.WorkAssignmentBlockWhereInput, itemWhere: Prisma.MakeReadyItemWhereInput, propertyId: Prisma.StringFilter<"VendorAssignment"> | string | undefined) {
  const [blocks, items, vendorAssignments] = await Promise.all([
    prisma.workAssignmentBlock.findMany({
      where,
      include: {
        assignedUser: { select: { id: true, fullName: true, role: true, capacity: true } },
        property: true,
        item: { select: { id: true, unitNumber: true, moveInDate: true, riskLevel: true, assignedTech: true } },
      },
      orderBy: [{ plannedDate: "asc" }, { assignedUser: { fullName: "asc" } }],
    }),
    prisma.makeReadyItem.findMany({
      where: itemWhere,
      include: { property: true, workAssignmentBlocks: { where: { status: { in: [...activePlanningStatuses] } } } },
      orderBy: [{ moveInDate: "asc" }, { unitNumber: "asc" }],
      take: 500,
    }),
    prisma.vendorAssignment.findMany({
      where: {
        propertyId,
        status: { notIn: ["COMPLETED", "CANCELED"] },
      },
    }),
  ]);

  const byUserDay = new Map<string, {
    user: { id: string; fullName: string; role: string };
    date: string;
    plannedHours: number;
    capacityHours: number;
    overloaded: boolean;
  }>();

  for (const block of blocks) {
    const key = `${block.assignedUserId}:${dateKey(block.plannedDate)}`;
    const capacityHours = block.assignedUser.capacity?.defaultDailyHours ?? 8;
    const current = byUserDay.get(key) ?? {
      user: { id: block.assignedUser.id, fullName: block.assignedUser.fullName, role: block.assignedUser.role },
      date: dateKey(block.plannedDate),
      plannedHours: 0,
      capacityHours,
      overloaded: false,
    };
    current.plannedHours += block.estimatedHours;
    current.overloaded = current.plannedHours > current.capacityHours;
    byUserDay.set(key, current);
  }

  const today = startOfDay(new Date());
  const nextSeven = addDays(today, 7);
  const incomplete = (item: { completionStatus: string | null; makeReadyStatus: string | null }) => {
    const completion = String(item.completionStatus ?? "").toUpperCase();
    const ready = String(item.makeReadyStatus ?? "").toUpperCase();
    return !["DONE", "YES", "GOOD"].includes(completion) || !["DONE", "YES", "GOOD"].includes(ready);
  };
  const unplanned = items.filter((item) => incomplete(item) && item.workAssignmentBlocks.length === 0);
  const moveInsNotCovered = unplanned.filter((item) => item.moveInDate && item.moveInDate >= today && item.moveInDate <= nextSeven);

  return {
    blocks,
    workloadByUserDay: Array.from(byUserDay.values()).sort((left, right) => left.date.localeCompare(right.date) || left.user.fullName.localeCompare(right.user.fullName)),
    overloaded: Array.from(byUserDay.values()).filter((entry) => entry.overloaded),
    unscheduledItems: unplanned.slice(0, 100),
    summary: {
      plannedBlocks: blocks.length,
      estimatedHours: Math.round(blocks.reduce((sum, block) => sum + block.estimatedHours, 0) * 10) / 10,
      overloadedDays: Array.from(byUserDay.values()).filter((entry) => entry.overloaded).length,
      unplannedWork: unplanned.length,
      moveInsNotCovered: moveInsNotCovered.length,
      vendorOpenAssignments: vendorAssignments.length,
      inHouseBlocks: blocks.length,
    },
  };
}
