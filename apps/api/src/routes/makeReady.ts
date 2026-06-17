import { stringify } from "csv-stringify/sync";
import { Prisma, UserRole } from "@prisma/client";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { scopedAllowedPropertyIds, assignableStaffRoles, canUpdateMakeReadyField } from "../lib/auth.js";
import { writeAuditLog } from "../lib/audit.js";
import { automationRuleInputSchema, validateRuleReferences } from "../lib/automationDefinition.js";
import { applyAutomationRules } from "../lib/automationAssignments.js";
import { renderPdfFromHtml } from "../lib/pdf.js";
import { prisma } from "../lib/prisma.js";
import { notifyAssignedStaff, notifyPropertyRoles } from "../lib/notifications.js";
import { computeDerivedFields, editableFields, normalizeItemPatch } from "../lib/board.js";
import { evaluateAndPersistItemRisk, riskCategories } from "../lib/risk.js";
import { queueWebhookEvent } from "../lib/webhookQueue.js";

const itemSortFields = [
  "boardGroup",
  "unitNumber",
  "moveInDate",
  "makeReadyDate",
  "vacatedDate",
  "flooringDate",
  "daysVacant",
  "riskScore",
  "riskLevel",
  "assignedTech",
  "updatedAt",
  "createdAt",
] as const;

export const makeReadyQuerySchema = z.object({
  propertyId: z.string().optional(),
  boardGroup: z.string().optional(),
  section: z.string().optional(),
  boardSection: z.string().optional(),
  q: z.string().optional(),
  vacancyStatus: z.string().optional(),
  assignedTech: z.string().optional(),
  scopeLevel: z.string().optional(),
  makeReadyStatus: z.string().optional(),
  riskLevel: z.string().optional(),
  riskCategory: z.enum(riskCategories).optional(),
  moveInWindow: z.enum(["week", "7", "14"]).optional(),
  overdueOnly: z.enum(["true", "false"]).optional().transform((value) => value === "true"),
  missingDatesOnly: z.enum(["true", "false"]).optional().transform((value) => value === "true"),
  pestIssuesOnly: z.enum(["true", "false"]).optional().transform((value) => value === "true"),
  flooringNeededOnly: z.enum(["true", "false"]).optional().transform((value) => value === "true"),
  paintNeededOnly: z.enum(["true", "false"]).optional().transform((value) => value === "true"),
  moveInRiskOnly: z.enum(["true", "false"]).optional().transform((value) => value === "true"),
  customFieldFilters: z.string().optional(),
  sortBy: z.enum(itemSortFields).optional(),
  sortDirection: z.enum(["asc", "desc"]).default("asc"),
  updatedSince: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(5000).optional(),
  offset: z.coerce.number().int().min(0).default(0),
  includeArchived: z.enum(["true", "false"]).optional().transform((value) => value === "true"),
});
const boardSectionTypes = new Set(["READY", "MAKE_READY", "DOWN", "ARCHIVE"]);
const customFieldOperatorsByType = {
  TEXT: ["contains", "equals", "empty", "notEmpty"],
  LONG_TEXT: ["contains", "empty", "notEmpty"],
  NUMBER: ["equals", "greaterThan", "lessThan", "empty", "notEmpty"],
  DATE: ["before", "after", "between", "empty", "notEmpty", "withinNextDays", "overdue"],
  SINGLE_SELECT: ["equals", "notEquals", "empty", "notEmpty"],
  MULTI_SELECT: ["contains", "notContains", "empty", "notEmpty"],
  BOOLEAN: ["isTrue", "isFalse", "empty", "notEmpty"],
  USER: ["equals", "empty", "notEmpty"],
} as const;
export const makeReadyCustomFieldFilterSchema = z.object({
  fieldId: z.string().min(1),
  operator: z.enum([
    "contains",
    "notContains",
    "equals",
    "notEquals",
    "empty",
    "notEmpty",
    "greaterThan",
    "lessThan",
    "before",
    "after",
    "between",
    "withinNextDays",
    "overdue",
    "isTrue",
    "isFalse",
  ]),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  valueTo: z.string().nullable().optional(),
});
type CustomFieldFilterInput = z.infer<typeof makeReadyCustomFieldFilterSchema>;
type ItemSortField = (typeof itemSortFields)[number];

export const makeReadyCreateSchema = z.object({
  propertyId: z.string(),
  unitId: z.string().optional().nullable(),
  boardGroup: z.string(),
  itemName: z.string(),
  unitNumber: z.string(),
  floorPlan: z.string().optional().nullable(),
  vacancyStatus: z.string().optional().nullable(),
  moveOutDate: z.string().optional().nullable(),
  vacatedDate: z.string().optional().nullable(),
  makeReadyDate: z.string().optional().nullable(),
  moveInDate: z.string().optional().nullable(),
  applicant: z.string().optional().nullable(),
  assignedTech: z.string().optional().nullable(),
  scopeLevel: z.string().optional().nullable(),
  makeReadyStatus: z.string().optional().nullable(),
  completionStatus: z.string().optional().nullable(),
  cleaningStatus: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const makeReadyPatchSchema = z.record(z.unknown());
const makeReadyExportQuerySchema = z.object({
  propertyId: z.string().optional(),
});
export const makeReadyBatchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ARCHIVE"), ids: z.array(z.string()).min(1).max(200) }),
  z.object({ action: z.literal("RESTORE"), ids: z.array(z.string()).min(1).max(200) }),
  z.object({ action: z.literal("ASSIGN_TECH"), ids: z.array(z.string()).min(1).max(200), value: z.string().trim().max(120).nullable() }),
  z.object({ action: z.literal("MOVE_GROUP"), ids: z.array(z.string()).min(1).max(200), boardGroup: z.string().trim().min(1).max(120) }),
  z.object({
    action: z.literal("SET_FIELD"),
    ids: z.array(z.string()).min(1).max(200),
    field: z.enum(["vacancyStatus", "scopeLevel", "makeReadyStatus", "completionStatus", "cleaningStatus"]),
    value: z.string().trim().max(80).nullable(),
  }),
]);

async function sectionFor(propertyId: string, key: string) {
  return prisma.boardSection.findFirst({ where: { propertyId, key, isActive: true } });
}

async function lifecycleSection(propertyId: string, type: "ARCHIVE" | "MAKE_READY" | "READY") {
  return prisma.boardSection.findFirst({ where: { propertyId, sectionType: type, isActive: true } });
}

function readyVacancyStatus(value: string | null | undefined) {
  const normalized = (value ?? "").toUpperCase();
  if (normalized.includes("LEASED")) return "VACANT LEASED READY";
  if (normalized === "DOWN") return "DOWN";
  return "VACANT NOT LEASED READY";
}

function startOfWeek(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() - next.getDay());
  return next;
}

function moveInWindowFilter(value: "week" | "7" | "14" | undefined, now = new Date()): Prisma.DateTimeNullableFilter<"MakeReadyItem"> | undefined {
  if (!value) return undefined;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  if (value === "week") {
    const weekStart = startOfWeek(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    return { gte: weekStart, lt: weekEnd };
  }
  end.setDate(end.getDate() + Number(value));
  return { gte: start, lte: end };
}

function itemOrderBy(sortBy: ItemSortField | undefined, sortDirection: "asc" | "desc"): Prisma.MakeReadyItemOrderByWithRelationInput[] {
  if (!sortBy) return [{ boardGroup: "asc" }, { moveInDate: "asc" }, { unitNumber: "asc" }, { id: "asc" }];
  return [{ [sortBy]: sortDirection }, { id: "asc" }];
}

function parseCustomFieldFilters(raw: string | undefined): CustomFieldFilterInput[] {
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("Custom field filters must be an array");
  return parsed.map((filter) => makeReadyCustomFieldFilterSchema.parse(filter));
}

function isEmptyCustomValue(value: Prisma.JsonValue | undefined) {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

function customDateWithinNextDays(value: string, days: number, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  return date >= start && date <= end;
}

function htmlEscape(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

async function getMakeReadyExportBundle(request: FastifyRequest, propertyId?: string) {
  const scoped = scopedAllowedPropertyIds(request);
  if (propertyId && scoped !== null && !scoped.includes(propertyId)) {
    throw Object.assign(new Error("Property access denied"), { statusCode: 403 });
  }
  const items = await prisma.makeReadyItem.findMany({
    where: {
      propertyId: propertyId ?? (scoped === null ? undefined : { in: scoped }),
      isArchived: false,
      property: { isActive: true },
    },
    include: {
      property: true,
      customFieldValues: true,
    },
    orderBy: [{ propertyId: "asc" }, { boardGroup: "asc" }, { unitNumber: "asc" }],
  });

  const customFields = await prisma.customField.findMany({
    where: { module: "make-ready", isArchived: false },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return { items, customFields };
}

function buildMakeReadyReportHtml(items: Array<Prisma.MakeReadyItemGetPayload<{ include: { property: true; customFieldValues: true } }>>) {
  const total = items.length;
  const overdue = items.filter((item) => item.overdue).length;
  const moveInSoon = items.filter((item) => item.moveInSoon).length;
  const highRisk = items.filter((item) => ["HIGH", "CRITICAL"].includes(item.riskLevel ?? "")).length;
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><title>Make Ready Board Report</title>
<style>
body{font-family:Arial,sans-serif;padding:24px;background:#f8fafc;color:#0f172a}
.report{display:grid;gap:20px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
.kpi,.card{background:#fff;border:1px solid #cbd5e1;border-radius:16px;padding:16px}
.kpi strong{display:block;font-size:28px}
table{width:100%;border-collapse:collapse;font-size:12px;background:#fff;border:1px solid #cbd5e1;border-radius:16px;overflow:hidden}
th,td{padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:left;vertical-align:top}
th{background:#e2e8f0;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#334155}
.muted{color:#475569}
</style>
</head>
<body>
<div class="report">
  <h1>Make Ready Board Report</h1>
  <div class="kpis">
    <div class="kpi"><strong>${total}</strong><span>Active turns</span></div>
    <div class="kpi"><strong>${overdue}</strong><span>Overdue</span></div>
    <div class="kpi"><strong>${moveInSoon}</strong><span>Move-in soon</span></div>
    <div class="kpi"><strong>${highRisk}</strong><span>High / critical risk</span></div>
  </div>
  <div class="card">
    <table>
      <thead>
        <tr>
          <th>Property</th>
          <th>Section</th>
          <th>Unit</th>
          <th>Vacancy</th>
          <th>Make Ready</th>
          <th>Move-In</th>
          <th>Assigned</th>
          <th>Risk</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item) => `
          <tr>
            <td>${htmlEscape(item.property.code)}</td>
            <td>${htmlEscape(item.boardGroup)}</td>
            <td>${htmlEscape(item.unitNumber)}</td>
            <td>${htmlEscape(item.vacancyStatus ?? "-")}</td>
            <td>${htmlEscape(item.makeReadyStatus ?? "-")}</td>
            <td>${htmlEscape(item.moveInDate?.toISOString().slice(0, 10) ?? "-")}</td>
            <td>${htmlEscape(item.assignedTech ?? "-")}</td>
            <td>${htmlEscape(item.riskLevel ?? "NONE")} / ${htmlEscape(item.riskScore ?? 0)}</td>
            <td class="muted">${htmlEscape(item.notes ?? "")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  </div>
</div>
</body></html>`;
}

function customFieldValueMatches(value: Prisma.JsonValue | undefined, filter: CustomFieldFilterInput, fieldType: string) {
  if (filter.operator === "empty") return isEmptyCustomValue(value);
  if (filter.operator === "notEmpty") return !isEmptyCustomValue(value);
  if (filter.operator === "isTrue") return value === true;
  if (filter.operator === "isFalse") return value === false;
  if (isEmptyCustomValue(value)) return false;

  if (filter.operator === "contains" && fieldType === "MULTI_SELECT") return Array.isArray(value) && value.includes(filter.value as never);
  if (filter.operator === "notContains" && fieldType === "MULTI_SELECT") return Array.isArray(value) && !value.includes(filter.value as never);
  if (filter.operator === "contains") return String(value).toLowerCase().includes(String(filter.value ?? "").toLowerCase());
  if (filter.operator === "equals") {
    return fieldType === "NUMBER"
      ? Number(value) === Number(filter.value)
      : String(value).toLowerCase() === String(filter.value ?? "").toLowerCase();
  }
  if (filter.operator === "notEquals") return String(value).toLowerCase() !== String(filter.value ?? "").toLowerCase();
  if (filter.operator === "greaterThan") return Number(value) > Number(filter.value);
  if (filter.operator === "lessThan") return Number(value) < Number(filter.value);

  if (fieldType === "DATE") {
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return false;
    const operand = typeof filter.value === "string" ? new Date(filter.value) : null;
    if (filter.operator === "before") return Boolean(operand && !Number.isNaN(operand.getTime()) && date < operand);
    if (filter.operator === "after") return Boolean(operand && !Number.isNaN(operand.getTime()) && date > operand);
    if (filter.operator === "between") {
      const end = filter.valueTo ? new Date(filter.valueTo) : null;
      return Boolean(operand && end && !Number.isNaN(operand.getTime()) && !Number.isNaN(end.getTime()) && date >= operand && date <= end);
    }
    if (filter.operator === "withinNextDays") return customDateWithinNextDays(String(value), Number(filter.value));
    if (filter.operator === "overdue") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return date < today;
    }
  }

  return false;
}

async function itemIdsMatchingCustomFilters(baseWhere: Prisma.MakeReadyItemWhereInput, filters: CustomFieldFilterInput[]) {
  if (filters.length === 0) return [];
  const fields = await prisma.customField.findMany({
    where: {
      id: { in: [...new Set(filters.map((filter) => filter.fieldId))] },
      module: "make-ready",
      isArchived: false,
      deletedAt: null,
    },
    include: { options: true },
  });
  const fieldsById = new Map(fields.map((field) => [field.id, field]));
  for (const filter of filters) {
    const field = fieldsById.get(filter.fieldId);
    if (!field) throw new Error("One or more custom field filters are unavailable");
    if (!(customFieldOperatorsByType[field.fieldType] as readonly string[]).includes(filter.operator)) {
      throw new Error(`Operator ${filter.operator} is not compatible with ${field.label}`);
    }
    if ((field.fieldType === "SINGLE_SELECT" || field.fieldType === "MULTI_SELECT") && filter.value) {
      const optionExists = field.options.some((option) => !option.isArchived && option.label === filter.value);
      if (!optionExists) throw new Error(`Option ${String(filter.value)} is unavailable for ${field.label}`);
    }
  }

  let matchingIds: Set<string> | null = null;
  for (const filter of filters) {
    const field = fieldsById.get(filter.fieldId)!;
    const values = await prisma.customFieldValue.findMany({
      where: {
        customFieldId: field.id,
        item: baseWhere,
      },
      select: { itemId: true, value: true },
    });
    let filterIds: Set<string>;
    if (filter.operator === "empty") {
      const baseItemIds = await prisma.makeReadyItem.findMany({
        where: baseWhere,
        select: { id: true },
      });
      const nonEmptyIds = new Set(values.filter((entry) => !isEmptyCustomValue(entry.value)).map((entry) => entry.itemId));
      filterIds = new Set(baseItemIds.map((item) => item.id).filter((id) => !nonEmptyIds.has(id)));
    } else {
      filterIds = new Set(
        values
          .filter((entry) => customFieldValueMatches(entry.value, filter, field.fieldType))
          .map((entry) => entry.itemId),
      );
    }
    matchingIds = matchingIds === null ? filterIds : new Set(Array.from(matchingIds as Set<string>).filter((id) => filterIds.has(id)));
    if (matchingIds.size === 0) break;
  }

  return [...(matchingIds ?? new Set<string>())];
}

async function isActiveStaffName(value: unknown) {
  if (value === null) return true;
  if (typeof value !== "string" || !value.trim()) return false;
  return Boolean(await prisma.user.findFirst({
    where: {
      fullName: value,
      isActive: true,
      role: { in: assignableStaffRoles },
    },
  }));
}

const statusTriggerFields = new Set([
  "status",
  "vacancyStatus",
  "completionStatus",
  "sheetrockStatus",
  "pestStatus",
  "pestTreated",
  "trashOutStatus",
  "floorsStatus",
  "makeReadyStatus",
  "cleaningStatus",
  "keysMadeStatus",
  "cabinetsStatus",
  "countertopsStatus",
  "appliancesStatus",
  "paintStatus",
  "doorsStatus",
  "scopeLevel",
]);

async function processItem(itemId: string, options: {
  triggerTypes: string[];
  request?: FastifyRequest;
}) {
  const item = await prisma.makeReadyItem.findUniqueOrThrow({
    where: { id: itemId },
    include: { customFieldValues: true },
  });

  const rules = await prisma.automationRule.findMany({
    where: {
      enabled: true,
      isArchived: false,
      triggerType: { in: options.triggerTypes },
      OR: [{ propertyId: null }, { propertyId: item.propertyId }],
    },
  });

  const definitions = [];
  for (const rule of rules) {
    const parsed = automationRuleInputSchema.safeParse({
      name: rule.name,
      description: rule.description,
      enabled: rule.enabled,
      triggerType: rule.triggerType,
      propertyId: rule.propertyId,
      conditions: rule.conditions,
      actions: rule.actions,
    });
    if (!parsed.success) continue;
    try {
      await validateRuleReferences(parsed.data.conditions, parsed.data.actions, parsed.data.propertyId);
    } catch {
      continue;
    }
    definitions.push({
      id: rule.id,
      name: rule.name,
      enabled: rule.enabled,
      conditions: parsed.data.conditions,
      actions: parsed.data.actions,
    });
  }

  const derived = computeDerivedFields(item);
  const customValues = Object.fromEntries(item.customFieldValues.map((value) => [value.customFieldId, value.value]));
  const { next, logs, customFieldUpdates, auditNotes, actionSummaries } = await applyAutomationRules({ ...item, ...derived }, definitions, customValues);
  const automationPatch: Record<string, unknown> = {};
  for (const field of editableFields) {
    if (next[field] !== item[field]) {
      automationPatch[field] = next[field] ?? null;
    }
  }
  if (String((automationPatch.pestStatus ?? item.pestStatus) ?? "").trim().toUpperCase() === "NONE") {
    automationPatch.pestTreated = null;
  }

  const updated = await prisma.makeReadyItem.update({
    where: { id: itemId },
    data: {
      ...derived,
      ...normalizeItemPatch(automationPatch),
      priority: typeof next.priority === "number" ? next.priority : item.priority,
    },
  });

  if (updated.assignedTech && updated.assignedTech !== item.assignedTech) {
    await notifyAssignedStaff({
      assignedTech: updated.assignedTech,
      propertyId: updated.propertyId,
      itemId: updated.id,
      category: "ASSIGNMENT",
      title: "Make-ready assignment updated",
      message: `${updated.unitNumber} has been assigned to you by automation.`,
      dedupeKey: `assignment:${updated.id}:${updated.assignedTech}:automation`,
    });
    await queueWebhookEvent({
      eventType: "item.assigned",
      propertyId: updated.propertyId,
      itemId: updated.id,
      actorUserId: options.request?.currentUser?.id ?? null,
      data: {
        id: updated.id,
        unitNumber: updated.unitNumber,
        assignedTech: updated.assignedTech,
        source: "automation",
      },
    });
  }

  for (const update of customFieldUpdates) {
    const field = await prisma.customField.findFirst({
      where: { id: update.fieldId, module: "make-ready", isArchived: false },
    });
    if (!field) continue;
    if (update.value === null) {
      await prisma.customFieldValue.deleteMany({
        where: { customFieldId: field.id, itemId: updated.id },
      });
    } else {
      await prisma.customFieldValue.upsert({
        where: { customFieldId_itemId: { customFieldId: field.id, itemId: updated.id } },
        create: { customFieldId: field.id, itemId: updated.id, value: update.value as Prisma.InputJsonValue },
        update: { value: update.value as Prisma.InputJsonValue },
      });
    }
  }

  if (logs.length > 0) {
    await prisma.automationRun.createMany({
      data: logs.map((log) => ({
        ruleId: log.ruleId,
        itemId: updated.id,
        message: log.message,
        success: true,
        context: {
          itemName: updated.itemName,
          unitNumber: updated.unitNumber,
          triggerTypes: options.triggerTypes,
          actionSummaries: actionSummaries.get(log.ruleId) ?? [],
        },
      })),
    });
  }

  for (const note of auditNotes) {
    await writeAuditLog({
      request: options.request,
      propertyId: updated.propertyId,
      entityType: "MAKE_READY_ITEM",
      entityId: updated.id,
      action: "AUTOMATION_ACTIVITY_NOTE",
      message: note.message,
      metadata: { ruleId: note.ruleId, unitNumber: updated.unitNumber },
    });
  }

  return updated;
}

export async function makeReadyRoutes(app: FastifyInstance) {
  app.get("/make-ready-items", async (request, reply) => {
    const user = request.currentUser!;
    const parsedQuery = makeReadyQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      reply.code(400);
      return { message: "Invalid make-ready item query", issues: parsedQuery.error.issues };
    }
    const query = parsedQuery.data;
    const propertyIds = scopedAllowedPropertyIds(request);

    if (propertyIds !== null && propertyIds.length === 0) {
      reply.header("x-total-count", "0");
      reply.header("x-limit", String(query.limit ?? 0));
      reply.header("x-offset", String(query.offset));
      reply.header("x-has-more", "false");
      reply.header("x-next-offset", "");
      return [];
    }
    if (query.propertyId && propertyIds !== null && !propertyIds.includes(query.propertyId)) {
      reply.code(403);
      return { message: "Property access denied" };
    }

    let boardGroupFilter = query.boardGroup ?? query.section;
    if (!boardGroupFilter && query.boardSection) {
      if (query.boardSection.startsWith("type:")) {
        const sectionType = query.boardSection.slice(5);
        if (!boardSectionTypes.has(sectionType)) {
          reply.code(400);
          return { message: "Invalid board section type" };
        }
        const sections = await prisma.boardSection.findMany({
          where: {
            isActive: true,
            sectionType,
            propertyId: query.propertyId ?? (propertyIds === null ? undefined : { in: propertyIds }),
          },
          select: { key: true },
        });
        boardGroupFilter = sections.length === 1 ? sections[0].key : undefined;
        if (sections.length > 1) {
          // Multiple properties can share a section type with different keys. Use OR below instead.
        }
      } else {
        boardGroupFilter = query.boardSection;
      }
    }

    const andFilters: Prisma.MakeReadyItemWhereInput[] = [];
    if (query.boardSection?.startsWith("type:")) {
      const sectionType = query.boardSection.slice(5);
      if (!boardSectionTypes.has(sectionType)) {
        reply.code(400);
        return { message: "Invalid board section type" };
      }
      const sections = await prisma.boardSection.findMany({
        where: {
          isActive: true,
          sectionType,
          propertyId: query.propertyId ?? (propertyIds === null ? undefined : { in: propertyIds }),
        },
        select: { propertyId: true, key: true },
      });
      andFilters.push(sections.length
        ? { OR: sections.map((section) => ({ propertyId: section.propertyId, boardGroup: section.key })) }
        : { id: "__no_matching_section__" });
    }
    if (query.vacancyStatus === "__ntv__") {
      andFilters.push({ vacancyStatus: { startsWith: "NTV" } });
    } else if (query.vacancyStatus === "__vacant__") {
      andFilters.push({ vacancyStatus: { in: ["VACANT", "VACANT_NOT_LEASED", "VACANT_READY", "VACANT NOT LEASED READY", "VACANT NOT LEASED NOT READY"] } });
    } else if (query.vacancyStatus === "__vacant_leased__") {
      andFilters.push({ vacancyStatus: { in: ["VACANT LEASED", "VACANT_LEASED", "VACANT LEASED READY", "VACANT LEASED NOT READY"] } });
    } else if (query.vacancyStatus) {
      andFilters.push({ vacancyStatus: query.vacancyStatus });
    }
    if (query.assignedTech === "__unassigned__") {
      andFilters.push({ OR: [{ assignedTech: null }, { assignedTech: "" }] });
    } else if (query.assignedTech) {
      andFilters.push({ assignedTech: query.assignedTech });
    }
    if (query.scopeLevel) andFilters.push({ scopeLevel: query.scopeLevel });
    if (query.makeReadyStatus) andFilters.push({ makeReadyStatus: query.makeReadyStatus });
    if (query.riskLevel) andFilters.push({ riskLevel: query.riskLevel });
    if (query.riskCategory) andFilters.push({ riskReasons: { array_contains: [{ category: query.riskCategory }] } });
    if (query.moveInWindow) andFilters.push({ moveInDate: moveInWindowFilter(query.moveInWindow) });
    if (query.overdueOnly) andFilters.push({ overdue: true });
    if (query.missingDatesOnly) andFilters.push({ OR: [{ makeReadyDate: null }, { vacatedDate: null }] });
    if (query.pestIssuesOnly) andFilters.push({ pestStatus: { notIn: ["NONE", "TREATED"] } });
    if (query.flooringNeededOnly) andFilters.push({ floorsStatus: "REPLACE CARPET" });
    if (query.paintNeededOnly) andFilters.push({ paintStatus: { not: null }, NOT: { paintStatus: "GOOD" } });
    if (query.moveInRiskOnly) {
      const soon = moveInWindowFilter("7");
      andFilters.push({
        OR: [
          { moveInSoon: true },
          { AND: [{ moveInDate: soon }, { completionStatus: { not: "YES" } }] },
          { riskReasons: { array_contains: [{ category: "MOVE_IN_RISK" }] } },
        ],
      });
    }

    const searchFilter: Prisma.MakeReadyItemWhereInput | undefined = query.q
      ? {
          OR: [
            { unitNumber: { contains: query.q, mode: "insensitive" } },
            { itemName: { contains: query.q, mode: "insensitive" } },
            { applicant: { contains: query.q, mode: "insensitive" } },
            { assignedTech: { contains: query.q, mode: "insensitive" } },
          ],
        }
      : undefined;
    if (searchFilter) andFilters.push(searchFilter);

    let customFieldFilters: CustomFieldFilterInput[] = [];
    try {
      customFieldFilters = parseCustomFieldFilters(query.customFieldFilters);
    } catch (error) {
      reply.code(400);
      return { message: error instanceof Error ? error.message : "Invalid custom field filters" };
    }

    const where: Prisma.MakeReadyItemWhereInput = {
      propertyId: query.propertyId ?? (propertyIds === null ? undefined : { in: propertyIds }),
      boardGroup: query.boardSection?.startsWith("type:") ? undefined : boardGroupFilter,
      isArchived: query.includeArchived ? undefined : false,
      property: query.includeArchived ? undefined : { isActive: true },
      updatedAt: query.updatedSince ? { gte: query.updatedSince } : undefined,
      AND: andFilters.length ? andFilters : undefined,
    };
    let finalWhere = where;
    if (customFieldFilters.length) {
      let matchingIds: string[];
      try {
        matchingIds = await itemIdsMatchingCustomFilters(where, customFieldFilters);
      } catch (error) {
        reply.code(400);
        return { message: error instanceof Error ? error.message : "Invalid custom field filters" };
      }
      finalWhere = { ...where, id: { in: matchingIds.length ? matchingIds : ["__no_matching_custom_field_filter__"] } };
    }
    const [items, total] = await Promise.all([
      prisma.makeReadyItem.findMany({
        where: finalWhere,
        include: {
          property: true,
          unit: { include: { floorPlanRecord: true } },
          customFieldValues: true,
        },
        orderBy: itemOrderBy(query.sortBy, query.sortDirection),
        skip: query.offset,
        take: query.limit,
      }),
      prisma.makeReadyItem.count({ where: finalWhere }),
    ]);

    reply.header("x-total-count", String(total));
    reply.header("x-limit", String(query.limit ?? total));
    reply.header("x-offset", String(query.offset));
    reply.header("x-has-more", String(query.limit ? query.offset + items.length < total : false));
    reply.header("x-next-offset", query.limit && query.offset + items.length < total ? String(query.offset + items.length) : "");
    return items.map((item) => ({
      ...item,
      ...computeDerivedFields(item),
    }));
  });

  app.post("/make-ready-items", async (request, reply) => {
    const user = request.currentUser!;
    if (!(user.role === UserRole.ADMIN || user.role === UserRole.MANAGER)) {
      reply.code(403);
      return { message: "Insufficient permissions" };
    }

    const payload = makeReadyCreateSchema.parse(request.body);
    const propertyIds = scopedAllowedPropertyIds(request);

    if (propertyIds !== null && !propertyIds.includes(payload.propertyId)) {
      reply.code(403);
      return { message: "Property access denied" };
    }

    const property = await prisma.property.findFirst({
      where: { id: payload.propertyId, isActive: true },
    });
    if (!property) {
      reply.code(400);
      return { message: "Select an active property" };
    }

    if (payload.unitId) {
      const unit = await prisma.unit.findFirst({
        where: { id: payload.unitId, propertyId: payload.propertyId, isActive: true },
      });
      if (!unit) {
        reply.code(400);
        return { message: "Select an active unit at the chosen property" };
      }
    }
    if (payload.assignedTech !== undefined && !(await isActiveStaffName(payload.assignedTech))) {
      reply.code(400);
      return { message: "Select an active staff member for assignment" };
    }
    if (!(await sectionFor(payload.propertyId, payload.boardGroup))) {
      reply.code(400);
      return { message: "Select a configured section at the chosen property" };
    }

    const item = await prisma.makeReadyItem.create({
      data: {
        propertyId: payload.propertyId,
        unitId: payload.unitId ?? null,
        boardGroup: payload.boardGroup,
        itemName: payload.itemName,
        unitNumber: payload.unitNumber,
        floorPlan: payload.floorPlan ?? null,
        vacancyStatus: payload.vacancyStatus ?? null,
        moveOutDate: payload.moveOutDate ? new Date(payload.moveOutDate) : null,
        vacatedDate: payload.vacatedDate ? new Date(payload.vacatedDate) : null,
        makeReadyDate: payload.makeReadyDate ? new Date(payload.makeReadyDate) : null,
        moveInDate: payload.moveInDate ? new Date(payload.moveInDate) : null,
        applicant: payload.applicant ?? null,
        assignedTech: payload.assignedTech ?? null,
        scopeLevel: payload.scopeLevel ?? null,
        makeReadyStatus: payload.makeReadyStatus ?? null,
        completionStatus: payload.completionStatus ?? null,
        cleaningStatus: payload.cleaningStatus ?? null,
        notes: payload.notes ?? null,
      },
    });

    const processed = await processItem(item.id, {
      triggerTypes: ["ITEM_CREATED"],
      request,
    });
    await writeAuditLog({
      request,
      actorUserId: user.id,
      propertyId: processed.propertyId,
      entityType: "MAKE_READY_ITEM",
      entityId: processed.id,
      action: "BOARD_ITEM_CREATED",
      message: `Created make-ready item ${processed.unitNumber}`,
      metadata: {
        boardGroup: processed.boardGroup,
      },
    });
    if (processed.assignedTech) {
      await notifyAssignedStaff({
        assignedTech: processed.assignedTech, propertyId: processed.propertyId, itemId: processed.id,
        category: "ASSIGNMENT", title: "New make-ready assignment",
        message: `${processed.unitNumber} has been assigned to you.`,
        dedupeKey: `assignment:${processed.id}:${processed.assignedTech}`,
      });
    }
    await queueWebhookEvent({
      eventType: "item.created",
      propertyId: processed.propertyId,
      itemId: processed.id,
      actorUserId: user.id,
      data: {
        id: processed.id,
        unitNumber: processed.unitNumber,
        boardGroup: processed.boardGroup,
        vacancyStatus: processed.vacancyStatus,
        assignedTech: processed.assignedTech,
      },
    });
    if (processed.assignedTech) {
      await queueWebhookEvent({
        eventType: "item.assigned",
        propertyId: processed.propertyId,
        itemId: processed.id,
        actorUserId: user.id,
        data: {
          id: processed.id,
          unitNumber: processed.unitNumber,
          assignedTech: processed.assignedTech,
        },
      });
    }
    await evaluateAndPersistItemRisk(processed.id, { notify: true });
    reply.code(201);
    return processed;
  });

  app.post("/make-ready-items/batch", async (request, reply) => {
    const user = request.currentUser!;
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.MANAGER) {
      reply.code(403);
      return { message: "Manager or admin access required for batch changes" };
    }
    const payload = makeReadyBatchSchema.parse(request.body);
    const propertyIds = scopedAllowedPropertyIds(request);
    const items = await prisma.makeReadyItem.findMany({ where: { id: { in: payload.ids } } });
    if (items.length !== new Set(payload.ids).size) {
      reply.code(404);
      return { message: "One or more selected items were not found" };
    }
    if (propertyIds !== null && items.some((item) => !propertyIds.includes(item.propertyId))) {
      reply.code(403);
      return { message: "Property access denied for one or more selected items" };
    }
    if (payload.action === "SET_FIELD" && payload.value) {
      const option = await prisma.labelDefinition.findFirst({
        where: {
          fieldKey: payload.field,
          value: payload.value,
          isArchived: false,
        },
      });
      if (!option) {
        reply.code(400);
        return { message: "Select an active option for the batch status update" };
      }
    }
    if (payload.action === "ASSIGN_TECH" && !(await isActiveStaffName(payload.value))) {
      reply.code(400);
      return { message: "Select an active staff member for assignment" };
    }
    if (payload.action === "MOVE_GROUP") {
      const invalidTarget = await Promise.all(items.map((item) => sectionFor(item.propertyId, payload.boardGroup)));
      if (invalidTarget.some((section) => !section)) {
        reply.code(400);
        return { message: "Move target must be a configured section at every selected item's property" };
      }
    }

    let data: Prisma.MakeReadyItemUpdateManyMutationInput;
    if (payload.action === "ARCHIVE" || payload.action === "RESTORE") {
      for (const item of items) {
        const target = await lifecycleSection(item.propertyId, payload.action === "ARCHIVE" ? "ARCHIVE" : "MAKE_READY");
        if (!target) {
          reply.code(409);
          return { message: `Required ${payload.action.toLowerCase()} section is not configured for a selected property` };
        }
        await prisma.makeReadyItem.update({
          where: { id: item.id },
          data: { boardGroup: target.key, isArchived: payload.action === "ARCHIVE", archivedAt: payload.action === "ARCHIVE" ? new Date() : null },
        });
        await notifyAssignedStaff({
          assignedTech: item.assignedTech, propertyId: item.propertyId, itemId: item.id,
          category: "BATCH_CHANGE", title: `Item ${payload.action === "ARCHIVE" ? "archived" : "restored"}`,
          message: `${item.unitNumber} was ${payload.action.toLowerCase()}d in a batch update.`,
        });
      }
      data = {};
    }
    else if (payload.action === "ASSIGN_TECH") data = { assignedTech: payload.value };
    else if (payload.action === "MOVE_GROUP") {
      const target = await sectionFor(items[0].propertyId, payload.boardGroup);
      const archiving = target?.sectionType === "ARCHIVE";
      data = {
        boardGroup: payload.boardGroup,
        isArchived: archiving,
        archivedAt: archiving ? new Date() : null,
      };
    }
    else data = normalizeItemPatch({ [payload.field]: payload.value });

    const updated = (payload.action === "ARCHIVE" || payload.action === "RESTORE")
      ? { count: items.length }
      : await prisma.makeReadyItem.updateMany({ where: { id: { in: payload.ids } }, data });
    if (payload.action === "ASSIGN_TECH" && payload.value) {
      for (const item of items) {
        await notifyAssignedStaff({
          assignedTech: payload.value, propertyId: item.propertyId, itemId: item.id,
          category: "ASSIGNMENT", title: "Assignment updated",
          message: `${item.unitNumber} has been assigned to you.`,
          dedupeKey: `assignment:${item.id}:${payload.value}`,
        });
      }
    }
    if (payload.action === "MOVE_GROUP") {
      for (const item of items) {
        await notifyAssignedStaff({
          assignedTech: item.assignedTech, propertyId: item.propertyId, itemId: item.id,
          category: "BATCH_CHANGE", title: "Section changed",
          message: `${item.unitNumber} was moved to another board section.`,
        });
      }
    }
    if (payload.action !== "ARCHIVE" && payload.action !== "RESTORE") {
      for (const item of items) {
        await evaluateAndPersistItemRisk(item.id, { notify: true });
      }
    }
    await writeAuditLog({
      request,
      actorUserId: user.id,
      entityType: "MAKE_READY_ITEM_BATCH",
      action: `BOARD_ITEMS_BATCH_${payload.action}`,
      message: `${payload.action.replace("_", " ").toLowerCase()} applied to ${updated.count} make-ready items`,
      metadata: {
        itemIds: payload.ids,
        field: payload.action === "SET_FIELD" ? payload.field : undefined,
        value: "value" in payload ? payload.value : undefined,
        boardGroup: payload.action === "MOVE_GROUP" ? payload.boardGroup : undefined,
      },
    });
    return { ok: true, count: updated.count };
  });

  app.patch("/make-ready-items/:id", async (request, reply) => {
    const user = request.currentUser!;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const payload = makeReadyPatchSchema.parse(request.body);
    const propertyIds = scopedAllowedPropertyIds(request);
    const existing = await prisma.makeReadyItem.findUnique({
      where: { id },
    });
    const previousAssignedTech = existing?.assignedTech;

    if (!existing) {
      reply.code(404);
      return { message: "Item not found" };
    }

    if (propertyIds !== null && !propertyIds.includes(existing.propertyId)) {
      reply.code(403);
      return { message: "Property access denied" };
    }

    const changedKeys = Object.keys(payload);

    if (user.role === UserRole.VIEWER) {
      reply.code(403);
      return { message: "Insufficient permissions" };
    }

    const disallowed = changedKeys.filter((field) => !canUpdateMakeReadyField(user, field));
    if (disallowed.length > 0) {
      reply.code(403);
      return { message: `${user.role} role cannot edit fields: ${disallowed.join(", ")}` };
    }
    if ("assignedTech" in payload && !(await isActiveStaffName(payload.assignedTech))) {
      reply.code(400);
      return { message: "Select an active staff member for assignment" };
    }

    await prisma.makeReadyItem.update({
      where: { id },
      data: normalizeItemPatch(payload),
    });

    const triggerTypes = ["ITEM_UPDATED"];
    if (changedKeys.some((key) => key.endsWith("Date"))) triggerTypes.push("DATE_FIELD_CHANGED");
    if (changedKeys.some((key) => statusTriggerFields.has(key))) triggerTypes.push("STATUS_FIELD_CHANGED");
    let updated = await processItem(id, { triggerTypes, request });
    if (changedKeys.includes("completionStatus") && (updated.completionStatus ?? "").toUpperCase() === "YES" && updated.makeReadyStatus !== "FINAL WALK") {
      await prisma.makeReadyItem.update({
        where: { id },
        data: { makeReadyStatus: "FINAL WALK" },
      });
      updated = await processItem(id, { triggerTypes: ["STATUS_FIELD_CHANGED"], request });
      await notifyPropertyRoles({
        propertyId: updated.propertyId,
        itemId: updated.id,
        roles: [UserRole.ADMIN, UserRole.MANAGER],
        category: "ITEM_LIFECYCLE",
        title: "Final walk needed",
        message: `${updated.unitNumber} was marked complete and needs manager final walk.`,
        dedupeKey: `final-walk-needed:${updated.id}`,
      });
      await writeAuditLog({
        request,
        actorUserId: user.id,
        propertyId: updated.propertyId,
        entityType: "MAKE_READY_ITEM",
        entityId: updated.id,
        action: "BOARD_ITEM_FINAL_WALK_REQUESTED",
        message: `${updated.unitNumber} was marked complete and moved to Final Walk.`,
        metadata: { changedKeys, role: user.role },
      });
    }
    await writeAuditLog({
      request,
      actorUserId: user.id,
      propertyId: updated.propertyId,
      entityType: "MAKE_READY_ITEM",
      entityId: updated.id,
      action: "BOARD_ITEM_UPDATED",
      message: `Updated make-ready item ${updated.unitNumber}`,
      metadata: {
        changedKeys,
        role: user.role,
      },
    });
    if (changedKeys.includes("assignedTech") && updated.assignedTech && updated.assignedTech !== previousAssignedTech) {
      await notifyAssignedStaff({
        assignedTech: updated.assignedTech, propertyId: updated.propertyId, itemId: updated.id,
        category: "ASSIGNMENT", title: "Assignment updated", message: `${updated.unitNumber} has been assigned to you.`,
        dedupeKey: `assignment:${updated.id}:${updated.assignedTech}`,
      });
    }
    await queueWebhookEvent({
      eventType: "item.updated",
      propertyId: updated.propertyId,
      itemId: updated.id,
      actorUserId: user.id,
      data: {
        id: updated.id,
        unitNumber: updated.unitNumber,
        changedKeys,
        boardGroup: updated.boardGroup,
        vacancyStatus: updated.vacancyStatus,
        assignedTech: updated.assignedTech,
      },
    });
    if (changedKeys.includes("assignedTech") && updated.assignedTech && updated.assignedTech !== previousAssignedTech) {
      await queueWebhookEvent({
        eventType: "item.assigned",
        propertyId: updated.propertyId,
        itemId: updated.id,
        actorUserId: user.id,
        data: {
          id: updated.id,
          unitNumber: updated.unitNumber,
          previousAssignedTech,
          assignedTech: updated.assignedTech,
        },
      });
    }
    if (changedKeys.some((key) => ["makeReadyDate", "moveInDate", "vacatedDate"].includes(key)) && updated.assignedTech) {
      await notifyAssignedStaff({
        assignedTech: updated.assignedTech, propertyId: updated.propertyId, itemId: updated.id,
        category: "SCHEDULE", title: "Schedule changed", message: `A scheduling date changed for ${updated.unitNumber}.`,
      });
    }
    if (changedKeys.some((key) => statusTriggerFields.has(key)) && updated.assignedTech) {
      await notifyAssignedStaff({
        assignedTech: updated.assignedTech, propertyId: updated.propertyId, itemId: updated.id,
        category: "STATUS_CHANGE", title: "Work status changed", message: `A status was updated for ${updated.unitNumber}.`,
      });
    }
    await evaluateAndPersistItemRisk(updated.id, { notify: true });

    return updated;
  });

  app.post("/make-ready-items/:id/mark-ready", async (request, reply) => {
    const user = request.currentUser!;
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.MANAGER) {
      reply.code(403);
      return { message: "Manager or admin access required" };
    }
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.makeReadyItem.findUnique({ where: { id } });
    if (!existing) {
      reply.code(404);
      return { message: "Item not found" };
    }
    const propertyIds = scopedAllowedPropertyIds(request);
    if (propertyIds !== null && !propertyIds.includes(existing.propertyId)) {
      reply.code(403);
      return { message: "Property access denied" };
    }
    const readySection = await lifecycleSection(existing.propertyId, "READY");
    if (!readySection) {
      reply.code(409);
      return { message: "Ready Units section is not configured for this property" };
    }
    await prisma.makeReadyItem.update({
      where: { id },
      data: {
        boardGroup: readySection.key,
        isArchived: false,
        archivedAt: null,
        completionStatus: "YES",
        makeReadyStatus: "DONE",
        vacancyStatus: readyVacancyStatus(existing.vacancyStatus),
      },
    });
    const item = await processItem(id, { triggerTypes: ["STATUS_FIELD_CHANGED"], request });
    await evaluateAndPersistItemRisk(item.id, { notify: true });
    await writeAuditLog({
      request,
      actorUserId: user.id,
      propertyId: item.propertyId,
      entityType: "MAKE_READY_ITEM",
      entityId: item.id,
      action: "BOARD_ITEM_MARKED_READY",
      message: `${item.unitNumber} passed final walk and moved to Ready Units.`,
    });
    await notifyAssignedStaff({
      assignedTech: item.assignedTech,
      propertyId: item.propertyId,
      itemId: item.id,
      category: "ITEM_LIFECYCLE",
      title: "Unit marked ready",
      message: `${item.unitNumber} passed final walk and moved to Ready Units.`,
      dedupeKey: `marked-ready:${item.id}`,
    });
    await queueWebhookEvent({
      eventType: "item.updated",
      propertyId: item.propertyId,
      itemId: item.id,
      actorUserId: user.id,
      data: {
        id: item.id,
        unitNumber: item.unitNumber,
        boardGroup: item.boardGroup,
        vacancyStatus: item.vacancyStatus,
        makeReadyStatus: item.makeReadyStatus,
        completionStatus: item.completionStatus,
      },
    });
    return item;
  });

  app.post("/make-ready-items/:id/archive", async (request, reply) => {
    const user = request.currentUser!;
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.MANAGER) {
      reply.code(403);
      return { message: "Manager or admin access required" };
    }
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.makeReadyItem.findUnique({ where: { id } });
    if (!existing) {
      reply.code(404);
      return { message: "Item not found" };
    }
    const propertyIds = scopedAllowedPropertyIds(request);
    if (propertyIds !== null && !propertyIds.includes(existing.propertyId)) {
      reply.code(403);
      return { message: "Property access denied" };
    }
    const archiveSection = await lifecycleSection(existing.propertyId, "ARCHIVE");
    if (!archiveSection) {
      reply.code(409);
      return { message: "Archive section is not configured for this property" };
    }
    const item = await prisma.makeReadyItem.update({
      where: { id },
      data: { boardGroup: archiveSection.key, isArchived: true, archivedAt: new Date() },
      include: { property: true, unit: { include: { floorPlanRecord: true } }, customFieldValues: true },
    });
    await notifyAssignedStaff({
      assignedTech: item.assignedTech, propertyId: item.propertyId, itemId: item.id,
      category: "ITEM_LIFECYCLE", title: "Item archived", message: `${item.unitNumber} moved to Archive.`,
    });
    await writeAuditLog({
      request,
      actorUserId: user.id,
      propertyId: item.propertyId,
      entityType: "MAKE_READY_ITEM",
      entityId: item.id,
      action: "BOARD_ITEM_ARCHIVED",
      message: `Archived make-ready item ${item.unitNumber}`,
    });
    await queueWebhookEvent({
      eventType: "item.archived",
      propertyId: item.propertyId,
      itemId: item.id,
      actorUserId: user.id,
      data: {
        id: item.id,
        unitNumber: item.unitNumber,
        boardGroup: item.boardGroup,
        archivedAt: item.archivedAt?.toISOString() ?? null,
      },
    });
    return item;
  });

  app.post("/make-ready-items/:id/restore", async (request, reply) => {
    const user = request.currentUser!;
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.MANAGER) {
      reply.code(403);
      return { message: "Manager or admin access required" };
    }
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.makeReadyItem.findUnique({ where: { id } });
    if (!existing) {
      reply.code(404);
      return { message: "Item not found" };
    }
    const propertyIds = scopedAllowedPropertyIds(request);
    if (propertyIds !== null && !propertyIds.includes(existing.propertyId)) {
      reply.code(403);
      return { message: "Property access denied" };
    }
    const makeReadySection = await lifecycleSection(existing.propertyId, "MAKE_READY");
    if (!makeReadySection) {
      reply.code(409);
      return { message: "Make Ready section is not configured for this property" };
    }
    const item = await prisma.makeReadyItem.update({
      where: { id },
      data: { boardGroup: makeReadySection.key, isArchived: false, archivedAt: null },
      include: { property: true, unit: { include: { floorPlanRecord: true } }, customFieldValues: true },
    });
    await notifyAssignedStaff({
      assignedTech: item.assignedTech, propertyId: item.propertyId, itemId: item.id,
      category: "ITEM_LIFECYCLE", title: "Item restored", message: `${item.unitNumber} returned to Make Ready.`,
    });
    await writeAuditLog({
      request,
      actorUserId: user.id,
      propertyId: item.propertyId,
      entityType: "MAKE_READY_ITEM",
      entityId: item.id,
      action: "BOARD_ITEM_RESTORED",
      message: `Restored make-ready item ${item.unitNumber}`,
    });
    await queueWebhookEvent({
      eventType: "item.restored",
      propertyId: item.propertyId,
      itemId: item.id,
      actorUserId: user.id,
      data: {
        id: item.id,
        unitNumber: item.unitNumber,
        boardGroup: item.boardGroup,
      },
    });
    return item;
  });

  app.get("/calendar", async (request, reply) => {
    const user = request.currentUser!;
    const query = z
      .object({
        field: z.enum(["moveOutDate", "vacatedDate", "makeReadyDate", "moveInDate", "flooringDate"]).default("moveInDate"),
        propertyId: z.string().optional(),
      })
      .parse(request.query);
    const propertyIds = scopedAllowedPropertyIds(request);

    if (propertyIds !== null && propertyIds.length === 0) {
      return [];
    }
    if (query.propertyId && propertyIds !== null && !propertyIds.includes(query.propertyId)) {
      reply.code(403);
      return { message: "Property access denied" };
    }

    const items = await prisma.makeReadyItem.findMany({
      where: {
        propertyId: query.propertyId ?? (propertyIds === null ? undefined : { in: propertyIds }),
        isArchived: false,
        property: { isActive: true },
        [query.field]: {
          not: null,
        },
      } as never,
      include: {
        property: true,
        customFieldValues: true,
      },
      orderBy: {
        [query.field]: "asc",
      },
    });

    return items.map((item) => ({
      id: item.id,
      title: item.itemName,
      unitNumber: item.unitNumber,
      boardGroup: item.boardGroup,
      propertyCode: item.property.code,
      date: item[query.field],
      moveInSoon: item.moveInSoon,
      overdue: item.overdue,
      paintStatus: item.paintStatus,
      vacancyStatus: item.vacancyStatus,
    }));
  });

  app.get("/export/make-ready.csv", async (request, reply) => {
    const query = makeReadyExportQuerySchema.parse(request.query);
    const { items, customFields } = await getMakeReadyExportBundle(request, query.propertyId);

    const csv = stringify(
      items.map((item) => ({
        property: item.property.code,
        boardGroup: item.boardGroup,
        unitNumber: item.unitNumber,
        floorPlan: item.floorPlan ?? "",
        applicant: item.applicant ?? "",
        vacancyStatus: item.vacancyStatus ?? "",
        moveOutDate: item.moveOutDate?.toISOString().slice(0, 10) ?? "",
        vacatedDate: item.vacatedDate?.toISOString().slice(0, 10) ?? "",
        makeReadyDate: item.makeReadyDate?.toISOString().slice(0, 10) ?? "",
        moveInDate: item.moveInDate?.toISOString().slice(0, 10) ?? "",
        riskLevel: item.riskLevel,
        riskScore: item.riskScore,
        riskReasons: Array.isArray(item.riskReasons) ? item.riskReasons.map((reason) => typeof reason === "object" && reason && "message" in reason ? String((reason as { message?: unknown }).message) : String(reason)).join(" | ") : "",
        assignedTech: item.assignedTech ?? "",
        scopeLevel: item.scopeLevel ?? "",
        paintStatus: item.paintStatus ?? "",
        doorsStatus: item.doorsStatus ?? "",
        completionStatus: item.completionStatus ?? "",
        sheetrockStatus: item.sheetrockStatus ?? "",
        pestStatus: item.pestStatus ?? "",
        pestTreated: item.pestTreated ?? "",
        trashOutStatus: item.trashOutStatus ?? "",
        floorsStatus: item.floorsStatus ?? "",
        flooringDate: item.flooringDate?.toISOString().slice(0, 10) ?? "",
        makeReadyStatus: item.makeReadyStatus ?? "",
        cleaningStatus: item.cleaningStatus ?? "",
        keysMadeStatus: item.keysMadeStatus ?? "",
        cabinetsStatus: item.cabinetsStatus ?? "",
        countertopsStatus: item.countertopsStatus ?? "",
        appliancesStatus: item.appliancesStatus ?? "",
        notes: item.notes ?? "",
        ...Object.fromEntries(customFields.map((field) => {
          const customValue = item.customFieldValues.find((value) => value.customFieldId === field.id)?.value;
          return [field.label, Array.isArray(customValue) ? customValue.join(", ") : customValue ?? ""];
        })),
      })),
      { header: true },
    );

    reply.header("content-type", "text/csv; charset=utf-8");
    reply.header("content-disposition", "attachment; filename=make-ready-board.csv");
    return reply.send(csv);
  });

  app.get("/export/make-ready.html", async (request, reply) => {
    const query = makeReadyExportQuerySchema.parse(request.query);
    const { items } = await getMakeReadyExportBundle(request, query.propertyId);
    reply.header("content-type", "text/html; charset=utf-8");
    return reply.send(buildMakeReadyReportHtml(items));
  });

  app.get("/export/make-ready.pdf", async (request, reply) => {
    const query = makeReadyExportQuerySchema.parse(request.query);
    const { items } = await getMakeReadyExportBundle(request, query.propertyId);
    const pdf = await renderPdfFromHtml(buildMakeReadyReportHtml(items));
    reply.header("content-type", "application/pdf");
    reply.header("content-disposition", "inline; filename=make-ready-board.pdf");
    return reply.send(pdf);
  });
}
