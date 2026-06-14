import type { MakeReadyItem, Prisma, PropertyRiskPolicy } from "@prisma/client";
import { createNotification } from "./notifications.js";
import { prisma } from "./prisma.js";
import { queueWebhookEvent } from "./webhookQueue.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export const riskLevels = ["NONE", "LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type RiskLevel = (typeof riskLevels)[number];

export const riskCategories = [
  "MOVE_IN_RISK",
  "OVERDUE_MAKE_READY",
  "MISSING_CRITICAL_DATES",
  "UNASSIGNED_WORK",
  "PEST_RISK",
  "FLOORING_RISK",
  "PAINT_RISK",
  "CHECKLIST_RISK",
  "STALE_ACTIVITY",
  "DATE_CONFLICT",
  "PROPERTY_WORKLOAD",
  "VENDOR_RISK",
  "PLANNING_RISK",
] as const;
export type RiskCategory = (typeof riskCategories)[number];

export type RiskReason = {
  category: RiskCategory;
  level: RiskLevel;
  score: number;
  message: string;
};

type RiskItem = MakeReadyItem & {
  boardSectionType?: string | null;
  comments?: Array<{ createdAt: Date }>;
  checklistInstances?: Array<{
    items: Array<{ required: boolean; completed: boolean }>;
  }>;
  vendorAssignments?: Array<{
    trade: string;
    status: string;
    scheduledDate: Date | null;
    dueDate: Date | null;
  }>;
  workAssignmentBlocks?: Array<{
    status: string;
    plannedDate: Date;
    estimatedHours: number;
  }>;
};

export type RiskPolicyInput = Pick<PropertyRiskPolicy,
  "moveInCriticalDays" |
  "moveInHighDays" |
  "moveInMediumDays" |
  "unassignedHighDays" |
  "staleActivityDays" |
  "agingMediumDays" |
  "agingHighDays" |
  "vendorNearMoveInDays" |
  "checklistNearMoveInDays" |
  "planningNearMoveInDays"
>;

export const defaultRiskPolicy: RiskPolicyInput = {
  moveInCriticalDays: 1,
  moveInHighDays: 3,
  moveInMediumDays: 7,
  unassignedHighDays: 7,
  staleActivityDays: 5,
  agingMediumDays: 14,
  agingHighDays: 21,
  vendorNearMoveInDays: 3,
  checklistNearMoveInDays: 7,
  planningNearMoveInDays: 7,
};

export function normalizeRiskPolicy(policy?: Partial<RiskPolicyInput> | null): RiskPolicyInput {
  return { ...defaultRiskPolicy, ...(policy ?? {}) };
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetween(from: Date, to: Date) {
  return Math.floor((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);
}

function isDone(value: string | null | undefined) {
  return ["DONE", "YES", "GOOD", "NONE", "TREATED", "MADE"].includes(String(value ?? "").toUpperCase());
}

function levelFromScore(score: number): RiskLevel {
  if (score >= 90) return "CRITICAL";
  if (score >= 65) return "HIGH";
  if (score >= 35) return "MEDIUM";
  if (score > 0) return "LOW";
  return "NONE";
}

function maxLevel(reasons: RiskReason[], score: number): RiskLevel {
  if (reasons.some((reason) => reason.level === "CRITICAL")) return "CRITICAL";
  if (reasons.some((reason) => reason.level === "HIGH")) return "HIGH";
  return levelFromScore(score);
}

export function evaluateItemRisk(item: RiskItem, now = new Date(), policyInput?: Partial<RiskPolicyInput> | null) {
  if (item.boardSectionType === "READY") {
    return { riskScore: 0, riskLevel: "NONE" as RiskLevel, riskReasons: [], lastRiskEvaluatedAt: now };
  }
  const policy = normalizeRiskPolicy(policyInput);
  const reasons: RiskReason[] = [];
  const daysUntilMoveIn = item.moveInDate ? daysBetween(now, item.moveInDate) : null;
  const daysVacant = item.daysVacant ?? (item.vacatedDate ? Math.max(0, daysBetween(item.vacatedDate, now)) : 0);
  const incomplete = !isDone(item.completionStatus) || !isDone(item.makeReadyStatus);

  const add = (reason: RiskReason) => reasons.push(reason);

  if (daysUntilMoveIn !== null && daysUntilMoveIn >= 0 && daysUntilMoveIn <= policy.moveInCriticalDays && !isDone(item.cleaningStatus)) {
    add({ category: "MOVE_IN_RISK", level: "CRITICAL", score: 95, message: `Move-in is within ${policy.moveInCriticalDays} day${policy.moveInCriticalDays === 1 ? "" : "s"} and cleaning is incomplete.` });
  } else if (daysUntilMoveIn !== null && daysUntilMoveIn >= 0 && daysUntilMoveIn <= policy.moveInHighDays && incomplete) {
    add({ category: "MOVE_IN_RISK", level: "HIGH", score: 75, message: `Move-in is within ${policy.moveInHighDays} days and make-ready is incomplete.` });
  } else if (daysUntilMoveIn !== null && daysUntilMoveIn >= 0 && daysUntilMoveIn <= policy.moveInMediumDays && incomplete) {
    add({ category: "MOVE_IN_RISK", level: "MEDIUM", score: 45, message: `Move-in is within ${policy.moveInMediumDays} days and still needs work.` });
  }

  if (item.overdue || (item.makeReadyDate && item.makeReadyDate < startOfDay(now) && incomplete)) {
    add({ category: "OVERDUE_MAKE_READY", level: "HIGH", score: 70, message: "Make-ready date is overdue and completion is not done." });
  }

  if (!item.makeReadyDate || !item.vacatedDate || !item.moveInDate) {
    add({ category: "MISSING_CRITICAL_DATES", level: daysUntilMoveIn !== null && daysUntilMoveIn <= policy.moveInMediumDays ? "HIGH" : "MEDIUM", score: daysUntilMoveIn !== null && daysUntilMoveIn <= policy.moveInMediumDays ? 70 : 40, message: "One or more critical schedule dates are missing." });
  }

  if (!item.assignedTech && daysUntilMoveIn !== null && daysUntilMoveIn >= 0 && daysUntilMoveIn <= policy.unassignedHighDays) {
    add({ category: "UNASSIGNED_WORK", level: "HIGH", score: 70, message: `No assigned tech with move-in within ${policy.unassignedHighDays} days.` });
  } else if (!item.assignedTech) {
    add({ category: "UNASSIGNED_WORK", level: "LOW", score: 20, message: "No assigned tech." });
  }

  if (item.pestStatus && !["NONE", "TREATED", "GOOD"].includes(item.pestStatus.toUpperCase())) {
    add({ category: "PEST_RISK", level: "HIGH", score: 70, message: `Active pest issue: ${item.pestStatus}.` });
  }

  if (item.floorsStatus === "REPLACE CARPET" && !item.flooringDate) {
    add({ category: "FLOORING_RISK", level: "HIGH", score: 65, message: "Flooring replacement is selected but flooring date is missing." });
  }

  if (item.paintStatus && !["GOOD", "DONE", "NONE"].includes(item.paintStatus.toUpperCase())) {
    add({ category: "PAINT_RISK", level: daysUntilMoveIn !== null && daysUntilMoveIn <= policy.moveInMediumDays ? "HIGH" : "MEDIUM", score: daysUntilMoveIn !== null && daysUntilMoveIn <= policy.moveInMediumDays ? 65 : 35, message: `Paint still needs attention: ${item.paintStatus}.` });
  }

  const requiredChecklistItems = item.checklistInstances?.flatMap((instance) => instance.items.filter((entry) => entry.required)) ?? [];
  if (requiredChecklistItems.some((entry) => !entry.completed) && daysUntilMoveIn !== null && daysUntilMoveIn <= policy.checklistNearMoveInDays) {
    add({ category: "CHECKLIST_RISK", level: "HIGH", score: 65, message: "Required checklist items are incomplete near move-in." });
  }

  const latestCommentAt = item.comments?.[0]?.createdAt;
  const latestActivityAt = latestCommentAt && latestCommentAt > item.updatedAt ? latestCommentAt : item.updatedAt;
  if (incomplete && daysBetween(latestActivityAt, now) >= policy.staleActivityDays) {
    add({ category: "STALE_ACTIVITY", level: "MEDIUM", score: 35, message: `No recent item update or comment in ${policy.staleActivityDays}+ days.` });
  }

  if (item.moveInDate && item.makeReadyDate && item.moveInDate < item.makeReadyDate) {
    add({ category: "DATE_CONFLICT", level: "CRITICAL", score: 95, message: "Move-in date is before make-ready date." });
  }

  if (daysVacant >= policy.agingHighDays && incomplete) {
    add({ category: "PROPERTY_WORKLOAD", level: "HIGH", score: 65, message: `Turn has been vacant for ${policy.agingHighDays}+ days and is not ready.` });
  } else if (daysVacant >= policy.agingMediumDays && incomplete) {
    add({ category: "PROPERTY_WORKLOAD", level: "MEDIUM", score: 40, message: `Turn has been vacant for ${policy.agingMediumDays}+ days and is not ready.` });
  }

  const openVendorAssignments = item.vendorAssignments?.filter((assignment) => !["COMPLETED", "CANCELED"].includes(assignment.status)) ?? [];
  if (openVendorAssignments.some((assignment) => assignment.status === "FOLLOW_UP_NEEDED")) {
    add({ category: "VENDOR_RISK", level: "HIGH", score: 70, message: "Vendor work needs follow-up." });
  }
  if (openVendorAssignments.some((assignment) => assignment.dueDate && assignment.dueDate < startOfDay(now))) {
    add({ category: "VENDOR_RISK", level: "HIGH", score: 70, message: "Vendor work is overdue." });
  }
  if (daysUntilMoveIn !== null && daysUntilMoveIn >= 0 && daysUntilMoveIn <= policy.vendorNearMoveInDays && openVendorAssignments.length > 0) {
    add({ category: "VENDOR_RISK", level: "HIGH", score: 65, message: "Open vendor work remains near move-in." });
  }

  const activeWorkBlocks = item.workAssignmentBlocks?.filter((block) => ["PLANNED", "IN_PROGRESS"].includes(block.status)) ?? [];
  if (daysUntilMoveIn !== null && daysUntilMoveIn >= 0 && daysUntilMoveIn <= policy.planningNearMoveInDays && incomplete && activeWorkBlocks.length === 0) {
    add({ category: "PLANNING_RISK", level: "HIGH", score: 70, message: `Move-in is within ${policy.planningNearMoveInDays} days and no in-house work is planned.` });
  }
  if (requiredChecklistItems.some((entry) => !entry.completed) && daysUntilMoveIn !== null && daysUntilMoveIn <= policy.moveInHighDays && activeWorkBlocks.length === 0) {
    add({ category: "PLANNING_RISK", level: "HIGH", score: 65, message: "Required checklist work is incomplete near move-in with no planned work block." });
  }

  const riskScore = Math.min(100, reasons.reduce((total, reason) => total + reason.score, 0));
  const riskLevel = maxLevel(reasons, riskScore);
  return { riskScore, riskLevel, riskReasons: reasons, lastRiskEvaluatedAt: now };
}

export async function loadItemForRisk(itemId: string) {
  return prisma.makeReadyItem.findUnique({
    where: { id: itemId },
    include: {
      comments: { where: { isDeleted: false }, orderBy: { createdAt: "desc" }, take: 1 },
      checklistInstances: { include: { items: true } },
      vendorAssignments: true,
      workAssignmentBlocks: true,
    },
  });
}

export async function evaluateAndPersistItemRisk(itemId: string, options: { notify?: boolean } = {}) {
  const item = await loadItemForRisk(itemId);
  if (!item) return null;
  const previousLevel = item.riskLevel as RiskLevel;
  const policy = await prisma.propertyRiskPolicy.findUnique({ where: { propertyId: item.propertyId } });
  const section = await prisma.boardSection.findFirst({
    where: { propertyId: item.propertyId, key: item.boardGroup, isActive: true },
    select: { sectionType: true },
  });
  const result = evaluateItemRisk({ ...item, boardSectionType: section?.sectionType ?? null }, new Date(), policy);
  const updated = await prisma.makeReadyItem.update({
    where: { id: item.id },
    data: {
      riskScore: result.riskScore,
      riskLevel: result.riskLevel,
      riskReasons: result.riskReasons as unknown as Prisma.InputJsonValue,
      lastRiskEvaluatedAt: result.lastRiskEvaluatedAt,
    },
  });

  if (options.notify && ["HIGH", "CRITICAL"].includes(result.riskLevel) && previousLevel !== result.riskLevel) {
    const recipientWhere: Prisma.UserWhereInput[] = [
      { role: "ADMIN" },
      { propertyAccess: { some: { propertyId: item.propertyId, role: "MANAGER" } } },
    ];
    if (item.assignedTech) {
      recipientWhere.push({ fullName: item.assignedTech });
    }
    const recipients = await prisma.user.findMany({
      where: {
        isActive: true,
        OR: recipientWhere,
      },
      select: { id: true },
    });
    await Promise.all(recipients.map((recipient) => createNotification({
      userId: recipient.id,
      propertyId: item.propertyId,
      itemId: item.id,
      category: "RISK",
      title: `${result.riskLevel} risk detected`,
      message: `${item.unitNumber}: ${result.riskReasons[0]?.message ?? "Risk level increased."}`,
      dedupeKey: `risk:${item.id}:${result.riskLevel}`,
    })));
  }

  if (previousLevel !== result.riskLevel) {
    await queueWebhookEvent({
      eventType: "item.risk.changed",
      propertyId: item.propertyId,
      itemId: item.id,
      data: {
        id: item.id,
        unitNumber: item.unitNumber,
        previousRiskLevel: previousLevel,
        riskLevel: result.riskLevel,
        riskScore: result.riskScore,
        riskReasons: result.riskReasons.slice(0, 5),
      },
    });
  }

  return { item: updated, ...result };
}

export async function evaluateManyItemsRisk(itemIds: string[], options: { notify?: boolean } = {}) {
  const results = [];
  for (const itemId of itemIds) {
    const result = await evaluateAndPersistItemRisk(itemId, options);
    if (result) results.push(result);
  }
  return results;
}
