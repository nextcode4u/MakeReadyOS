import { stringify } from "csv-stringify/sync";
import { Prisma, UserRole } from "@prisma/client";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { scopedAllowedPropertyIds, assignableStaffRoles, canUpdateMakeReadyField } from "../lib/auth.js";
import { writeAuditLog } from "../lib/audit.js";
import { automationRuleInputSchema, validateRuleReferences } from "../lib/automationDefinition.js";
import { prisma } from "../lib/prisma.js";
import { notifyAssignedStaff } from "../lib/notifications.js";
import { applyRules, computeDerivedFields, editableFields, normalizeItemPatch } from "../lib/board.js";
import { evaluateAndPersistItemRisk } from "../lib/risk.js";

const querySchema = z.object({
  propertyId: z.string().optional(),
  boardGroup: z.string().optional(),
  section: z.string().optional(),
  q: z.string().optional(),
  updatedSince: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(5000).optional(),
  offset: z.coerce.number().int().min(0).default(0),
  includeArchived: z.enum(["true", "false"]).optional().transform((value) => value === "true"),
});

const createSchema = z.object({
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

const patchSchema = z.record(z.unknown());
const batchSchema = z.discriminatedUnion("action", [
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

async function lifecycleSection(propertyId: string, type: "ARCHIVE" | "MAKE_READY") {
  return prisma.boardSection.findFirst({ where: { propertyId, sectionType: type, isActive: true } });
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
  const { next, logs, customFieldUpdates, auditNotes } = applyRules({ ...item, ...derived }, definitions, customValues);
  const automationPatch: Record<string, unknown> = {};
  for (const field of editableFields) {
    if (next[field] !== item[field]) {
      automationPatch[field] = next[field] ?? null;
    }
  }

  const updated = await prisma.makeReadyItem.update({
    where: { id: itemId },
    data: {
      ...derived,
      ...normalizeItemPatch(automationPatch),
      priority: typeof next.priority === "number" ? next.priority : item.priority,
    },
  });

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
    const query = querySchema.parse(request.query);
    const propertyIds = scopedAllowedPropertyIds(request);

    if (propertyIds !== null && propertyIds.length === 0) {
      reply.header("x-total-count", "0");
      reply.header("x-limit", String(query.limit ?? 0));
      reply.header("x-offset", String(query.offset));
      reply.header("x-has-more", "false");
      return [];
    }
    if (query.propertyId && propertyIds !== null && !propertyIds.includes(query.propertyId)) {
      reply.code(403);
      return { message: "Property access denied" };
    }

    const where: Prisma.MakeReadyItemWhereInput = {
      propertyId: query.propertyId ?? (propertyIds === null ? undefined : { in: propertyIds }),
      boardGroup: query.boardGroup ?? query.section,
      isArchived: query.includeArchived ? undefined : false,
      property: query.includeArchived ? undefined : { isActive: true },
      updatedAt: query.updatedSince ? { gte: query.updatedSince } : undefined,
      OR: query.q
        ? [
            { unitNumber: { contains: query.q, mode: "insensitive" } },
            { itemName: { contains: query.q, mode: "insensitive" } },
            { applicant: { contains: query.q, mode: "insensitive" } },
            { assignedTech: { contains: query.q, mode: "insensitive" } },
          ]
        : undefined,
    };
    const [items, total] = await Promise.all([
      prisma.makeReadyItem.findMany({
        where,
        include: {
          property: true,
          unit: { include: { floorPlanRecord: true } },
          customFieldValues: true,
        },
        orderBy: [{ boardGroup: "asc" }, { moveInDate: "asc" }, { unitNumber: "asc" }],
        skip: query.offset,
        take: query.limit,
      }),
      prisma.makeReadyItem.count({ where }),
    ]);

    reply.header("x-total-count", String(total));
    reply.header("x-limit", String(query.limit ?? total));
    reply.header("x-offset", String(query.offset));
    reply.header("x-has-more", String(query.limit ? query.offset + items.length < total : false));
    return items;
  });

  app.post("/make-ready-items", async (request, reply) => {
    const user = request.currentUser!;
    if (!(user.role === UserRole.ADMIN || user.role === UserRole.MANAGER)) {
      reply.code(403);
      return { message: "Insufficient permissions" };
    }

    const payload = createSchema.parse(request.body);
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
    const payload = batchSchema.parse(request.body);
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
    const payload = patchSchema.parse(request.body);
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
    const updated = await processItem(id, { triggerTypes, request });
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
    const user = request.currentUser!;
    const propertyIds = scopedAllowedPropertyIds(request);
    const items = await prisma.makeReadyItem.findMany({
      where: {
        propertyId: propertyIds === null ? undefined : { in: propertyIds },
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
}
