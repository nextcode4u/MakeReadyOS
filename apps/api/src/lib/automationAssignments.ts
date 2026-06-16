import { UserRole, type MakeReadyItem } from "@prisma/client";
import { assignableStaffRoles } from "./auth.js";
import type { AutomationActionInput } from "./automationDefinition.js";
import { applyRules, evaluateRuleConditions, type AutomationDefinition, startOfDay } from "./board.js";
import { prisma } from "./prisma.js";
import type { OperatingCalendarPolicy } from "./operatingCalendar.js";

type AssignLeastLoadedStaffAction = Extract<AutomationActionInput, { type: "assignLeastLoadedStaff" }>;

export type ActionPreviewSummary = {
  type: AutomationActionInput["type"];
  summary: string;
  proposedValue?: string | number | boolean | string[] | null;
  field?: string;
  fieldId?: string;
  sourceField?: string;
  targetField?: string;
  offsetDays?: number;
};

type AutomationItem = Partial<MakeReadyItem> & {
  id: string;
  propertyId: string;
  unitNumber: string;
  assignedTech?: string | null;
  makeReadyDate?: Date | null;
  moveInDate?: Date | null;
  vacatedDate?: Date | null;
};

function roleOrder(roles: UserRole[], role: UserRole) {
  const index = roles.indexOf(role);
  return index === -1 ? roles.length : index;
}

function activeItemCountStatusFilter() {
  return {
    OR: [
      { completionStatus: null },
      { completionStatus: "" },
      { completionStatus: { notIn: ["DONE", "YES"] } },
    ],
  };
}

function targetDateForAction(item: AutomationItem, action: AssignLeastLoadedStaffAction) {
  const raw = item[action.targetDateField];
  return raw instanceof Date && !Number.isNaN(raw.getTime()) ? startOfDay(raw) : startOfDay(new Date());
}

async function resolveLeastLoadedAssignee(item: AutomationItem, action: AssignLeastLoadedStaffAction) {
  if (action.onlyWhenUnassigned && item.assignedTech?.trim()) {
    return {
      assignedTech: item.assignedTech,
      summary: `Skipped auto-assignment because ${item.unitNumber} is already assigned to ${item.assignedTech}.`,
      changed: false,
    };
  }

  const candidateRoles = action.eligibleRoles.filter((role) => assignableStaffRoles.includes(role as UserRole)) as UserRole[];
  if (!candidateRoles.length) {
    return {
      assignedTech: null,
      summary: "No eligible assignment roles were configured.",
      changed: false,
    };
  }

  const targetDate = targetDateForAction(item, action);
  const horizonEnd = new Date(startOfDay(new Date()).getTime() + action.lookAheadDays * 24 * 60 * 60 * 1000);
  const eligibleUserIds = action.eligibleUserIds?.length ? Array.from(new Set(action.eligibleUserIds)) : undefined;
  const excludedUserIds = action.excludedUserIds?.length ? Array.from(new Set(action.excludedUserIds)) : [];
  const nonAdminRoles = candidateRoles.filter((role) => role !== UserRole.ADMIN);
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: candidateRoles },
      id: {
        ...(eligibleUserIds ? { in: eligibleUserIds } : {}),
        ...(excludedUserIds.length ? { notIn: excludedUserIds } : {}),
      },
      OR: [
        ...(candidateRoles.includes(UserRole.ADMIN) ? [{ role: UserRole.ADMIN }] : []),
        ...(nonAdminRoles.length ? [{
          role: { in: nonAdminRoles },
          propertyAccess: { some: { propertyId: item.propertyId } },
        }] : []),
      ],
    },
    select: { id: true, fullName: true, role: true },
    orderBy: [{ fullName: "asc" }, { id: "asc" }],
  });

  if (!users.length) {
    return {
      assignedTech: null,
      summary: "No active eligible staff were available for this property.",
      changed: false,
    };
  }

  const candidateNames = users.map((user) => user.fullName);
  const [activeAssignments, plannedBlocks] = await Promise.all([
    prisma.makeReadyItem.findMany({
      where: {
        propertyId: item.propertyId,
        isArchived: false,
        assignedTech: { in: candidateNames },
        id: { not: item.id },
        ...activeItemCountStatusFilter(),
      },
      select: { assignedTech: true },
    }),
    prisma.workAssignmentBlock.findMany({
      where: {
        propertyId: item.propertyId,
        assignedUserId: { in: users.map((user) => user.id) },
        status: { in: ["PLANNED", "IN_PROGRESS"] },
        plannedDate: { gte: startOfDay(new Date()), lte: horizonEnd },
      },
      select: { assignedUserId: true, plannedDate: true },
    }),
  ]);

  const activeCounts = new Map<string, number>();
  for (const assignment of activeAssignments) {
    if (!assignment.assignedTech) continue;
    activeCounts.set(assignment.assignedTech, (activeCounts.get(assignment.assignedTech) ?? 0) + 1);
  }

  const plannedWindowCounts = new Map<string, number>();
  const plannedDayCounts = new Map<string, number>();
  for (const block of plannedBlocks) {
    plannedWindowCounts.set(block.assignedUserId, (plannedWindowCounts.get(block.assignedUserId) ?? 0) + 1);
    if (startOfDay(block.plannedDate).getTime() === targetDate.getTime()) {
      plannedDayCounts.set(block.assignedUserId, (plannedDayCounts.get(block.assignedUserId) ?? 0) + 1);
    }
  }

  const candidates = users
    .map((user) => {
      const activeCount = activeCounts.get(user.fullName) ?? 0;
      const plannedCount = plannedWindowCounts.get(user.id) ?? 0;
      const plannedDayCount = plannedDayCounts.get(user.id) ?? 0;
      return {
        user,
        activeCount,
        plannedCount,
        plannedDayCount,
        workloadScore: activeCount + (action.includePlannedWork ? plannedCount : 0),
      };
    })
    .filter((entry) => action.dailyAssignmentCap == null || entry.plannedDayCount < action.dailyAssignmentCap)
    .sort((left, right) => {
      if (left.workloadScore !== right.workloadScore) return left.workloadScore - right.workloadScore;
      if (left.plannedDayCount !== right.plannedDayCount) return left.plannedDayCount - right.plannedDayCount;
      const roleDelta = roleOrder(candidateRoles, left.user.role) - roleOrder(candidateRoles, right.user.role);
      if (roleDelta !== 0) return roleDelta;
      return left.user.fullName.localeCompare(right.user.fullName) || left.user.id.localeCompare(right.user.id);
    });

  const selected = candidates[0];
  if (!selected) {
    return {
      assignedTech: null,
      summary: "All eligible staff are already at the configured planned-work cap for the target date.",
      changed: false,
    };
  }

  const changed = selected.user.fullName !== (item.assignedTech ?? null);
  return {
    assignedTech: selected.user.fullName,
    summary: `Assign to ${selected.user.fullName} (${selected.activeCount} active turns${action.includePlannedWork ? `, ${selected.plannedCount} planned blocks in next ${action.lookAheadDays} day${action.lookAheadDays === 1 ? "" : "s"}` : ""}).`,
    changed,
  };
}

function defaultActionSummary(action: AutomationActionInput): ActionPreviewSummary {
  if (action.type === "setField") {
    return { type: action.type, field: action.field, proposedValue: action.value, summary: `Set ${action.field} to ${action.value ?? "empty"}` };
  }
  if (action.type === "setCustomField") {
    return { type: action.type, fieldId: action.fieldId, proposedValue: action.value, summary: `Set custom field ${action.fieldId}` };
  }
  if (action.type === "addAuditNote") {
    return { type: action.type, proposedValue: action.value, summary: "Add activity note" };
  }
  if (action.type === "setDateFromField") {
    const direction = action.offsetDays >= 0 ? "+" : "";
    return {
      type: action.type,
      sourceField: action.sourceField,
      targetField: action.targetField,
      offsetDays: action.offsetDays,
      proposedValue: `${action.sourceField} ${direction}${action.offsetDays} operating day${Math.abs(action.offsetDays) === 1 ? "" : "s"}`,
      summary: `Set ${action.targetField} from ${action.sourceField} ${direction}${action.offsetDays} operating day${Math.abs(action.offsetDays) === 1 ? "" : "s"}`,
    };
  }
  if (action.type === "setPriority") {
    return { type: action.type, proposedValue: action.value, summary: `Set priority to ${action.value}` };
  }
  if (action.type === "appendNote") {
    return { type: action.type, proposedValue: action.value, summary: "Append item note" };
  }
  return {
    type: action.type,
    proposedValue: null,
    summary: "Assign to the least-loaded eligible staff member",
  };
}

async function resolveRuleActions(item: AutomationItem, actions: AutomationActionInput[]) {
  const resolvedActions: AutomationActionInput[] = [];
  const summaries: ActionPreviewSummary[] = [];

  for (const action of actions) {
    if (action.type !== "assignLeastLoadedStaff") {
      resolvedActions.push(action);
      summaries.push(defaultActionSummary(action));
      continue;
    }

    const resolution = await resolveLeastLoadedAssignee(item, action);
    summaries.push({
      type: action.type,
      proposedValue: resolution.assignedTech ?? null,
      summary: resolution.summary,
    });
    if (!resolution.assignedTech || !resolution.changed) continue;
    resolvedActions.push({
      type: "setField",
      field: "assignedTech",
      value: resolution.assignedTech,
    });
    item = { ...item, assignedTech: resolution.assignedTech };
  }

  return { resolvedActions, summaries };
}

export async function applyAutomationRules(
  item: AutomationItem,
  rules: AutomationDefinition[],
  customValues: Record<string, unknown> = {},
  options: { operatingCalendar?: OperatingCalendarPolicy | null } = {},
) {
  let next = { ...item };
  const logs: Array<{ ruleId: string; message: string }> = [];
  const customFieldUpdates: Array<{ ruleId: string; fieldId: string; value: string | number | boolean | string[] | null }> = [];
  const auditNotes: Array<{ ruleId: string; message: string }> = [];
  const actionSummaries = new Map<string, ActionPreviewSummary[]>();

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (!evaluateRuleConditions(next, rule.conditions, customValues).matched) continue;
    const resolved = await resolveRuleActions(next as AutomationItem, rule.actions as AutomationActionInput[]);
    actionSummaries.set(rule.id, resolved.summaries);
    const result = applyRules(next, [{ ...rule, actions: resolved.resolvedActions }], customValues, options);
    next = { ...next, ...result.next } as AutomationItem;
    logs.push(...result.logs);
    customFieldUpdates.push(...result.customFieldUpdates);
    auditNotes.push(...result.auditNotes);
  }

  return { next, logs, customFieldUpdates, auditNotes, actionSummaries };
}
