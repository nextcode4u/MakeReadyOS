import { createHash } from "node:crypto";
import { Prisma, UserRole } from "@prisma/client";
import { automationRuleInputSchema, validateRuleReferences } from "./automationDefinition.js";
import { applyAutomationRules } from "./automationAssignments.js";
import { computeDerivedFields, editableFields, normalizeItemPatch } from "./board.js";
import { writeAuditLog } from "./audit.js";
import { prisma } from "./prisma.js";
import { createNotification, notifyAssignedStaff } from "./notifications.js";

export type ScheduledRunMode = "SCHEDULED" | "MANUAL";

function cooldownHours() {
  const configured = Number(process.env.AUTOMATION_NOTE_COOLDOWN_HOURS ?? "24");
  return Number.isInteger(configured) && configured >= 1 && configured <= 720 ? configured : 24;
}

function noteActionKey(value: string) {
  return `note:${createHash("sha256").update(value).digest("hex").slice(0, 20)}`;
}

const ntvPreWalkSourceStatuses = ["NTV NOT LEASED", "NTV LEASED"];
const ntvPreWalkTargetStatus = "TO PRE-WALK";
const ntvPreWalkAuditAction = "NTV_PREWALK_TRIGGERED";

function endOfToday(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
}

async function notifyPreWalkStakeholders(item: {
  id: string;
  propertyId: string;
  unitNumber: string;
  moveOutDate: Date | null;
}) {
  const recipients = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { role: UserRole.ADMIN },
        {
          role: { in: [UserRole.MANAGER, UserRole.LEASING] },
          propertyAccess: { some: { propertyId: item.propertyId } },
        },
      ],
    },
    select: { id: true },
  });
  await Promise.all(recipients.map((recipient) => createNotification({
    userId: recipient.id,
    propertyId: item.propertyId,
    itemId: item.id,
    category: "SCHEDULE",
    title: "Pre-walk needed",
    message: `${item.unitNumber} reached its NTV / expected vacate date and was moved to ${ntvPreWalkTargetStatus}. Pre-walk the unit.`,
    dedupeKey: `ntv-prewalk:${item.id}`,
  })));
}

async function executeNtvPreWalkLifecycle(options: {
  actorUserId?: string | null;
  allowedPropertyIds?: string[] | null;
}) {
  const propertyConstraint = options.allowedPropertyIds === null || options.allowedPropertyIds === undefined
    ? undefined
    : { in: options.allowedPropertyIds };
  const candidates = await prisma.makeReadyItem.findMany({
    where: {
      propertyId: propertyConstraint,
      isArchived: false,
      moveOutDate: { lte: endOfToday() },
      vacancyStatus: { in: ntvPreWalkSourceStatuses },
    },
  });
  const priorTriggers = candidates.length === 0
    ? []
    : await prisma.auditLog.findMany({
      where: {
        action: ntvPreWalkAuditAction,
        entityType: "MAKE_READY_ITEM",
        entityId: { in: candidates.map((item) => item.id) },
      },
      select: { entityId: true },
    });
  const alreadyTriggered = new Set(priorTriggers.map((entry) => entry.entityId).filter((id): id is string => Boolean(id)));

  let actionCount = 0;
  const eligibleItems = candidates.filter((item) => !alreadyTriggered.has(item.id));
  for (const item of eligibleItems) {
    const next = { ...item, vacancyStatus: ntvPreWalkTargetStatus };
    const updated = await prisma.makeReadyItem.update({
      where: { id: item.id },
      data: {
        vacancyStatus: ntvPreWalkTargetStatus,
        ...computeDerivedFields(next),
      },
    });
    await writeAuditLog({
      actorUserId: options.actorUserId ?? null,
      propertyId: updated.propertyId,
      entityType: "MAKE_READY_ITEM",
      entityId: updated.id,
      action: ntvPreWalkAuditAction,
      message: `${updated.unitNumber} reached NTV / expected vacate date and was moved to ${ntvPreWalkTargetStatus}.`,
      metadata: {
        previousVacancyStatus: item.vacancyStatus,
        vacancyStatus: ntvPreWalkTargetStatus,
        moveOutDate: item.moveOutDate?.toISOString() ?? null,
      },
    });
    await notifyPreWalkStakeholders(updated);
    actionCount += 1;
  }

  return {
    name: "NTV pre-walk lifecycle",
    checkedCount: candidates.length,
    matchedCount: eligibleItems.length,
    actionCount,
    warnings: [] as string[],
    errors: [] as string[],
  };
}

export async function executeScheduledAutomationRules(options: {
  ruleId?: string;
  mode: ScheduledRunMode;
  actorUserId?: string | null;
  allowedPropertyIds?: string[] | null;
}) {
  const rules = await prisma.automationRule.findMany({
    where: {
      id: options.ruleId,
      triggerType: "SCHEDULED_CHECK",
      enabled: true,
      isArchived: false,
      propertyId: options.allowedPropertyIds === null || options.allowedPropertyIds === undefined
        ? undefined
        : { in: options.allowedPropertyIds },
    },
    orderBy: { name: "asc" },
  });
  const summaries: Array<{
    ruleId: string;
    name: string;
    checkedCount: number;
    matchedCount: number;
    actionCount: number;
    warnings: string[];
    errors: string[];
  }> = [];

  for (const rule of rules) {
    const startedAt = new Date();
    const warnings: string[] = [];
    const errors: string[] = [];
    let checkedCount = 0;
    let matchedCount = 0;
    let actionCount = 0;
    const parsed = automationRuleInputSchema.safeParse({
      name: rule.name,
      description: rule.description,
      enabled: rule.enabled,
      triggerType: rule.triggerType,
      propertyId: rule.propertyId,
      conditions: rule.conditions,
      actions: rule.actions,
    });

    if (!parsed.success) {
      errors.push(...parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`));
    } else {
      try {
        await validateRuleReferences(parsed.data.conditions, parsed.data.actions, parsed.data.propertyId);
        const constraints: Prisma.MakeReadyItemWhereInput[] = [];
        if (rule.propertyId) constraints.push({ propertyId: rule.propertyId });
        if (options.allowedPropertyIds !== null && options.allowedPropertyIds !== undefined) {
          constraints.push({ propertyId: { in: options.allowedPropertyIds } });
        }
        const items = await prisma.makeReadyItem.findMany({
          where: constraints.length > 0 ? { AND: constraints } : undefined,
          include: { customFieldValues: true, property: { include: { operatingCalendar: true } } },
        });
        checkedCount = items.length;

        for (const item of items) {
          const derived = computeDerivedFields(item);
          const customValues = Object.fromEntries(item.customFieldValues.map((value) => [value.customFieldId, value.value]));
          const simulation = await applyAutomationRules({ ...item, ...derived }, [{
            id: rule.id,
            name: rule.name,
            enabled: true,
            conditions: parsed.data.conditions,
            actions: parsed.data.actions,
          }], customValues, { operatingCalendar: item.property.operatingCalendar });
          if (simulation.logs.length === 0) continue;
          matchedCount += 1;

          const patch: Record<string, unknown> = {};
          for (const field of editableFields) {
            if (simulation.next[field] !== item[field]) patch[field] = simulation.next[field] ?? null;
          }
          const normalizedPatch = normalizeItemPatch(patch);
          if (Object.keys(normalizedPatch).length > 0) {
            await prisma.makeReadyItem.update({ where: { id: item.id }, data: normalizedPatch });
            actionCount += Object.keys(normalizedPatch).length;
            if (typeof normalizedPatch.assignedTech === "string" && normalizedPatch.assignedTech !== item.assignedTech) {
              await notifyAssignedStaff({
                assignedTech: normalizedPatch.assignedTech,
                propertyId: item.propertyId,
                itemId: item.id,
                category: "ASSIGNMENT",
                title: "Make-ready assignment updated",
                message: `${item.unitNumber} has been assigned to you by automation.`,
                dedupeKey: `assignment:${item.id}:${normalizedPatch.assignedTech}:scheduled-automation`,
              });
            }
          }

          for (const customValue of simulation.customFieldUpdates) {
            const existingValue = item.customFieldValues.find((value) => value.customFieldId === customValue.fieldId);
            if (JSON.stringify(existingValue?.value ?? null) === JSON.stringify(customValue.value)) continue;
            if (customValue.value === null) {
              await prisma.customFieldValue.deleteMany({ where: { customFieldId: customValue.fieldId, itemId: item.id } });
            } else {
              await prisma.customFieldValue.upsert({
                where: { customFieldId_itemId: { customFieldId: customValue.fieldId, itemId: item.id } },
                create: { customFieldId: customValue.fieldId, itemId: item.id, value: customValue.value as Prisma.InputJsonValue },
                update: { value: customValue.value as Prisma.InputJsonValue },
              });
            }
            actionCount += 1;
          }

          for (const note of simulation.auditNotes) {
            const actionKey = noteActionKey(note.message);
            const prior = await prisma.automationCooldown.findUnique({
              where: { ruleId_itemId_actionKey: { ruleId: rule.id, itemId: item.id, actionKey } },
            });
            const cutoff = Date.now() - cooldownHours() * 60 * 60 * 1000;
            if (prior && prior.lastAppliedAt.getTime() > cutoff) {
              warnings.push(`Suppressed duplicate activity note for ${item.unitNumber} during cooldown.`);
              continue;
            }
            await writeAuditLog({
              actorUserId: options.actorUserId ?? null,
              propertyId: item.propertyId,
              entityType: "MAKE_READY_ITEM",
              entityId: item.id,
              action: "AUTOMATION_SCHEDULED_ACTIVITY_NOTE",
              message: note.message,
              metadata: { ruleId: rule.id, unitNumber: item.unitNumber, runMode: options.mode },
            });
            await notifyAssignedStaff({
              assignedTech: item.assignedTech,
              propertyId: item.propertyId,
              itemId: item.id,
              category: "AUTOMATION_WARNING",
              title: `Automation warning: ${rule.name}`,
              message: note.message,
              dedupeKey: `scheduled:${rule.id}:${item.id}:${actionKey}`,
            });
            await prisma.automationCooldown.upsert({
              where: { ruleId_itemId_actionKey: { ruleId: rule.id, itemId: item.id, actionKey } },
              create: { ruleId: rule.id, itemId: item.id, actionKey, lastAppliedAt: new Date() },
              update: { lastAppliedAt: new Date() },
            });
            actionCount += 1;
          }
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "Scheduled execution failed");
      }
    }

    const completedAt = new Date();
    await prisma.automationRun.create({
      data: {
        ruleId: rule.id,
        success: errors.length === 0,
        message: `${options.mode === "MANUAL" ? "Manual" : "Scheduled"} check: ${checkedCount} checked, ${matchedCount} matched, ${actionCount} actions`,
        runType: options.mode,
        checkedCount,
        matchedCount,
        actionCount,
        warnings,
        errors,
        startedAt,
        completedAt,
        context: { triggerType: "SCHEDULED_CHECK", cooldownHours: cooldownHours() },
      },
    });
    summaries.push({ ruleId: rule.id, name: rule.name, checkedCount, matchedCount, actionCount, warnings, errors });
  }

  const lifecycleResult = options.ruleId
    ? null
    : await executeNtvPreWalkLifecycle({
      actorUserId: options.actorUserId,
      allowedPropertyIds: options.allowedPropertyIds,
    });

  return {
    mode: options.mode,
    rulesEvaluated: summaries.length,
    checkedCount: summaries.reduce((total, result) => total + result.checkedCount, lifecycleResult?.checkedCount ?? 0),
    matchedCount: summaries.reduce((total, result) => total + result.matchedCount, lifecycleResult?.matchedCount ?? 0),
    actionCount: summaries.reduce((total, result) => total + result.actionCount, lifecycleResult?.actionCount ?? 0),
    results: summaries,
    lifecycle: lifecycleResult,
  };
}
