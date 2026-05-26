import { Prisma, UserRole } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { allowedPropertyIds, requireManagerOrAdmin } from "../lib/auth.js";
import { writeAuditLog } from "../lib/audit.js";
import { actionSchema, automationRuleBaseSchema, automationRuleInputSchema as createSchema, validateRuleReferences } from "../lib/automationDefinition.js";
import { templateById, templateCatalog } from "../lib/automationTemplates.js";
import { applyRules, computeDerivedFields, evaluateRuleConditions } from "../lib/board.js";
import { prisma } from "../lib/prisma.js";
import { executeScheduledAutomationRules } from "../lib/scheduledAutomations.js";

const updateSchema = automationRuleBaseSchema.partial().omit({ enabled: true });
const toggleSchema = z.object({ enabled: z.boolean() });
const listSchema = z.object({ includeArchived: z.coerce.boolean().default(false) });
const installTemplateSchema = z.object({
  propertyId: z.string().nullable().optional(),
  enabled: z.boolean().default(false),
});
const runQuerySchema = z.object({
  ruleId: z.string().optional(),
  itemId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
const previewSchema = z.object({
  ruleId: z.string().min(1).optional(),
  draft: createSchema.optional(),
  propertyId: z.string().nullable().optional(),
  limit: z.number().int().min(1).max(100).default(25),
}).refine((payload) => Number(Boolean(payload.ruleId)) + Number(Boolean(payload.draft)) === 1, {
  message: "Provide either ruleId or draft, not both",
});

async function ensureManager(request: FastifyRequest, reply: FastifyReply) {
  if (await requireManagerOrAdmin(request, reply)) return false;
  return true;
}

function ruleScopeWhere(user: FastifyRequest["currentUser"]) {
  const propertyIds = allowedPropertyIds(user!);
  return propertyIds === null
    ? {}
    : { OR: [{ propertyId: null }, { propertyId: { in: propertyIds } }] };
}

async function canChangePropertyRule(request: FastifyRequest, reply: FastifyReply, propertyId: string | null | undefined) {
  const user = request.currentUser!;
  if (user.role === UserRole.ADMIN) return true;
  if (!propertyId) {
    reply.code(403).send({ message: "Only admins can manage global automation rules" });
    return false;
  }
  const propertyIds = allowedPropertyIds(user) ?? [];
  if (!propertyIds.includes(propertyId)) {
    reply.code(403).send({ message: "Property access denied" });
    return false;
  }
  return true;
}

async function canPreviewPropertyRule(request: FastifyRequest, reply: FastifyReply, propertyId: string | null | undefined) {
  const user = request.currentUser!;
  if (user.role === UserRole.ADMIN) return true;
  if (!propertyId) {
    reply.code(403).send({ message: "Managers can preview property-scoped automation rules only" });
    return false;
  }
  const propertyIds = allowedPropertyIds(user) ?? [];
  if (!propertyIds.includes(propertyId)) {
    reply.code(403).send({ message: "Property access denied" });
    return false;
  }
  return true;
}

function serializeRule(rule: {
  id: string;
  templateId?: string | null;
  name: string;
  description: string | null;
  propertyId: string | null;
  property: { id: string; name: string; code: string } | null;
  triggerType: string;
  enabled: boolean;
  isArchived: boolean;
  conditions: unknown;
  actions: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return rule;
}

const ruleInclude = {
  property: { select: { id: true, name: true, code: true } },
} satisfies Prisma.AutomationRuleInclude;

function ruleValidationError(error: z.ZodError) {
  return {
    message: "Invalid automation preview rule",
    errors: error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  };
}

function describeAction(action: z.infer<typeof actionSchema>, customFieldLabels: Map<string, string>) {
  if (action.type === "setField") {
    return { type: action.type, field: action.field, proposedValue: action.value, summary: `Set ${action.field} to ${action.value ?? "empty"}` };
  }
  if (action.type === "setCustomField") {
    const label = customFieldLabels.get(action.fieldId) ?? action.fieldId;
    return { type: action.type, fieldId: action.fieldId, proposedValue: action.value, summary: `Set custom field ${label}` };
  }
  if (action.type === "addAuditNote") {
    return { type: action.type, proposedValue: action.value, summary: "Add activity note" };
  }
  if (action.type === "setPriority") {
    return { type: action.type, proposedValue: action.value, summary: `Set priority to ${action.value}` };
  }
  return { type: action.type, proposedValue: action.value, summary: "Append item note" };
}

function customValuesByField(values: Array<{ customFieldId: string; value: Prisma.JsonValue }>) {
  return Object.fromEntries(values.map((value) => [value.customFieldId, value.value]));
}

export async function automationRoutes(app: FastifyInstance) {
  app.get("/automations", async (request, reply) => {
    if (!(await ensureManager(request, reply))) return;
    const query = listSchema.parse(request.query);
    const rules = await prisma.automationRule.findMany({
      where: {
        ...ruleScopeWhere(request.currentUser),
        isArchived: query.includeArchived ? undefined : false,
      },
      include: ruleInclude,
      orderBy: [{ isArchived: "asc" }, { enabled: "desc" }, { name: "asc" }],
    });
    return { rules: rules.map(serializeRule) };
  });

  app.get("/automations/templates", async (request, reply) => {
    if (!(await ensureManager(request, reply))) return;
    const catalog = await templateCatalog();
    const installedRules = await prisma.automationRule.findMany({
      where: {
        ...ruleScopeWhere(request.currentUser),
        templateId: { in: catalog.map((template) => template.id) },
        isArchived: false,
      },
      select: { id: true, templateId: true, name: true, propertyId: true, enabled: true },
    });
    return {
      templates: catalog.map((template) => ({
        ...template,
        installedRules: installedRules.filter((rule) => rule.templateId === template.id),
        installed: installedRules.some((rule) => rule.templateId === template.id),
      })),
    };
  });

  app.post("/automations/templates/:templateId/install", async (request, reply) => {
    if (!(await ensureManager(request, reply))) return;
    const user = request.currentUser!;
    const { templateId } = z.object({ templateId: z.string() }).parse(request.params);
    const payload = installTemplateSchema.parse(request.body);
    const propertyId = payload.propertyId ?? null;
    if (!(await canChangePropertyRule(request, reply, propertyId))) return;
    const template = await templateById(templateId);
    if (!template) {
      reply.code(404);
      return { message: "Automation template not found" };
    }
    if (!template.readyToInstall || !template.draft) {
      reply.code(409);
      return {
        message: "Template setup requirements must be completed before installation",
        setupRequirements: template.setupRequirements,
        requiredFields: template.requiredFields,
      };
    }
    const existing = await prisma.automationRule.findFirst({
      where: { templateId, propertyId, isArchived: false },
      select: { id: true, name: true },
    });
    if (existing) {
      reply.code(409);
      return { message: `Template is already installed as ${existing.name}`, ruleId: existing.id };
    }
    const definition = { ...template.draft, enabled: payload.enabled, propertyId };
    await validateRuleReferences(definition.conditions, definition.actions, propertyId);
    const created = await prisma.automationRule.create({
      data: {
        templateId,
        name: definition.name,
        description: definition.description ?? null,
        propertyId,
        triggerType: definition.triggerType,
        enabled: definition.enabled,
        conditions: definition.conditions as Prisma.InputJsonValue,
        actions: definition.actions as Prisma.InputJsonValue,
      },
      include: ruleInclude,
    });
    await writeAuditLog({
      request,
      actorUserId: user.id,
      propertyId,
      entityType: "AUTOMATION_RULE",
      entityId: created.id,
      action: "AUTOMATION_TEMPLATE_INSTALLED",
      message: `Installed automation template ${template.name}`,
      metadata: { templateId, enabled: created.enabled, triggerType: created.triggerType },
    });
    reply.code(201);
    return { rule: serializeRule(created), templateId, enabled: created.enabled };
  });

  app.post("/automations", async (request, reply) => {
    if (!(await ensureManager(request, reply))) return;
    const user = request.currentUser!;
    const payload = createSchema.parse(request.body);
    const propertyId = payload.propertyId ?? null;
    if (!(await canChangePropertyRule(request, reply, propertyId))) return;
    try {
      await validateRuleReferences(payload.conditions, payload.actions, propertyId);
    } catch (error) {
      reply.code(400);
      return { message: error instanceof Error ? error.message : "Invalid rule definition" };
    }
    const created = await prisma.automationRule.create({
      data: {
        name: payload.name,
        description: payload.description ?? null,
        propertyId,
        triggerType: payload.triggerType,
        enabled: payload.enabled,
        conditions: payload.conditions as Prisma.InputJsonValue,
        actions: payload.actions as Prisma.InputJsonValue,
      },
      include: ruleInclude,
    });
    await writeAuditLog({
      request,
      actorUserId: user.id,
      propertyId: created.propertyId,
      entityType: "AUTOMATION_RULE",
      entityId: created.id,
      action: "AUTOMATION_RULE_CREATED",
      message: `Created automation rule ${created.name}`,
      metadata: { triggerType: created.triggerType, enabled: created.enabled },
    });
    reply.code(201);
    return { rule: serializeRule(created) };
  });

  app.post("/automations/preview", async (request, reply) => {
    if (!(await ensureManager(request, reply))) return;
    const parsedRequest = previewSchema.safeParse(request.body);
    if (!parsedRequest.success) {
      reply.code(400);
      return { message: "Invalid automation preview request", errors: parsedRequest.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) };
    }
    const payload = parsedRequest.data;
    const user = request.currentUser!;
    let storedRule: Prisma.AutomationRuleGetPayload<{ include: typeof ruleInclude }> | null = null;
    let definition: z.infer<typeof createSchema>;

    if (payload.ruleId) {
      storedRule = await prisma.automationRule.findUnique({ where: { id: payload.ruleId }, include: ruleInclude });
      if (!storedRule || storedRule.isArchived) {
        reply.code(404);
        return { message: "Automation rule not found" };
      }
      const parsedRule = createSchema.safeParse({
        name: storedRule.name,
        description: storedRule.description,
        enabled: storedRule.enabled,
        triggerType: storedRule.triggerType,
        propertyId: storedRule.propertyId,
        conditions: storedRule.conditions,
        actions: storedRule.actions,
      });
      if (!parsedRule.success) {
        reply.code(400);
        return ruleValidationError(parsedRule.error);
      }
      definition = parsedRule.data;
    } else {
      definition = payload.draft!;
    }

    const rulePropertyId = definition.propertyId ?? null;
    if (!(await canPreviewPropertyRule(request, reply, rulePropertyId))) return;
    try {
      await validateRuleReferences(definition.conditions, definition.actions, rulePropertyId);
    } catch (error) {
      reply.code(400);
      return { message: error instanceof Error ? error.message : "Invalid rule definition" };
    }

    const requestedPropertyId = payload.propertyId ?? null;
    if (requestedPropertyId && !(await canPreviewPropertyRule(request, reply, requestedPropertyId))) return;
    if (requestedPropertyId) {
      const property = await prisma.property.findUnique({ where: { id: requestedPropertyId }, select: { id: true } });
      if (!property) {
        reply.code(400);
        return { message: "Selected preview property was not found" };
      }
    }

    const allowedIds = allowedPropertyIds(user);
    const propertyScope: Prisma.MakeReadyItemWhereInput[] = [];
    if (rulePropertyId) propertyScope.push({ propertyId: rulePropertyId });
    if (requestedPropertyId) propertyScope.push({ propertyId: requestedPropertyId });
    if (allowedIds !== null) propertyScope.push({ propertyId: { in: allowedIds } });
    const items = await prisma.makeReadyItem.findMany({
      where: propertyScope.length > 0 ? { AND: propertyScope } : undefined,
      include: {
        property: { select: { id: true, code: true, name: true } },
        customFieldValues: true,
      },
      orderBy: [{ property: { code: "asc" } }, { unitNumber: "asc" }],
    });
    const customFields = await prisma.customField.findMany({
      where: { id: { in: definition.actions.filter((action) => action.type === "setCustomField").map((action) => action.fieldId) } },
      select: { id: true, label: true },
    });
    const customFieldLabels = new Map(customFields.map((field) => [field.id, field.label]));
    const warnings = [
      "No changes will be made to make-ready items, custom values, or automation run history.",
      "Preview evaluates current item values; it does not simulate a future trigger event.",
    ];
    if (!definition.enabled) warnings.push("This rule is disabled. Preview evaluates it as if enabled.");

    const matches = items.flatMap((item) => {
      const current = { ...item, ...computeDerivedFields(item) };
      const customValues = customValuesByField(item.customFieldValues);
      const conditionSummary = evaluateRuleConditions(current, definition.conditions, customValues);
      if (!conditionSummary.matched) return [];
      const simulation = applyRules(current, [{
        id: storedRule?.id ?? "draft-preview",
        name: definition.name,
        enabled: true,
        conditions: definition.conditions,
        actions: definition.actions,
      }], customValues);
      return [{
        itemId: item.id,
        property: item.property,
        unitNumber: item.unitNumber,
        triggerSummary: `${definition.triggerType} evaluated against current values`,
        conditionSummary,
        proposedActions: definition.actions.map((action) => describeAction(action, customFieldLabels)),
        warnings: simulation.logs.length === 0 ? ["Conditions matched but no action simulation was produced."] : [],
      }];
    });
    const affectedItems = matches.slice(0, payload.limit);

    await writeAuditLog({
      request,
      actorUserId: user.id,
      propertyId: requestedPropertyId ?? rulePropertyId,
      entityType: "AUTOMATION_RULE",
      entityId: storedRule?.id ?? null,
      action: "AUTOMATION_PREVIEW_RUN",
      message: `Previewed automation rule ${definition.name}; no board changes made`,
      metadata: {
        source: storedRule ? "stored" : "draft",
        triggerType: definition.triggerType,
        matchingItems: matches.length,
        returnedItems: affectedItems.length,
      },
    });

    return {
      preview: true,
      notice: "No changes will be made.",
      rule: {
        id: storedRule?.id ?? null,
        name: definition.name,
        triggerType: definition.triggerType,
        propertyId: rulePropertyId,
        source: storedRule ? "stored" : "draft",
      },
      matchingItemCount: matches.length,
      affectedItems,
      warnings,
      limit: payload.limit,
    };
  });

  app.post("/automations/:id/run", async (request, reply) => {
    if (!(await ensureManager(request, reply))) return;
    const user = request.currentUser!;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const rule = await prisma.automationRule.findUnique({ where: { id } });
    if (!rule || rule.isArchived || rule.triggerType !== "SCHEDULED_CHECK") {
      reply.code(404);
      return { message: "Scheduled automation rule not found" };
    }
    if (!rule.enabled) {
      reply.code(400);
      return { message: "Enable a scheduled rule before running it; use preview for disabled drafts or rules." };
    }
    if (!(await canChangePropertyRule(request, reply, rule.propertyId))) return;
    const result = await executeScheduledAutomationRules({
      ruleId: id,
      mode: "MANUAL",
      actorUserId: user.id,
      allowedPropertyIds: allowedPropertyIds(user),
    });
    await writeAuditLog({
      request,
      actorUserId: user.id,
      propertyId: rule.propertyId,
      entityType: "AUTOMATION_RULE",
      entityId: rule.id,
      action: "AUTOMATION_MANUAL_RUN",
      message: `Ran scheduled automation rule ${rule.name} manually`,
      metadata: { checkedCount: result.checkedCount, matchedCount: result.matchedCount, actionCount: result.actionCount },
    });
    return { execution: result };
  });

  app.patch("/automations/:id", async (request, reply) => {
    if (!(await ensureManager(request, reply))) return;
    const user = request.currentUser!;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const payload = updateSchema.parse(request.body);
    const existing = await prisma.automationRule.findUnique({ where: { id }, include: ruleInclude });
    if (!existing || existing.isArchived || !(await canChangePropertyRule(request, reply, existing.propertyId))) {
      if (!reply.sent) reply.code(404).send({ message: "Automation rule not found" });
      return;
    }
    const propertyId = payload.propertyId === undefined ? existing.propertyId : payload.propertyId;
    if (!(await canChangePropertyRule(request, reply, propertyId))) return;
    const completeDefinition = createSchema.safeParse({
      name: payload.name ?? existing.name,
      description: payload.description === undefined ? existing.description : payload.description,
      enabled: existing.enabled,
      triggerType: payload.triggerType ?? existing.triggerType,
      propertyId,
      conditions: payload.conditions ?? existing.conditions,
      actions: payload.actions ?? existing.actions,
    });
    if (!completeDefinition.success) {
      reply.code(400);
      return { message: "Invalid automation rule definition", errors: completeDefinition.error.issues };
    }
    try {
      await validateRuleReferences(completeDefinition.data.conditions, completeDefinition.data.actions, propertyId);
    } catch (error) {
      reply.code(400);
      return { message: error instanceof Error ? error.message : "Invalid rule definition" };
    }
    const updated = await prisma.automationRule.update({
      where: { id },
      data: {
        name: payload.name,
        description: payload.description,
        propertyId,
        triggerType: payload.triggerType,
        conditions: payload.conditions as Prisma.InputJsonValue | undefined,
        actions: payload.actions as Prisma.InputJsonValue | undefined,
      },
      include: ruleInclude,
    });
    await writeAuditLog({
      request,
      actorUserId: user.id,
      propertyId: updated.propertyId,
      entityType: "AUTOMATION_RULE",
      entityId: updated.id,
      action: "AUTOMATION_RULE_UPDATED",
      message: `Updated automation rule ${updated.name}`,
    });
    return { rule: serializeRule(updated) };
  });

  app.patch("/automations/:id/enabled", async (request, reply) => {
    if (!(await ensureManager(request, reply))) return;
    const user = request.currentUser!;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const payload = toggleSchema.parse(request.body);
    const existing = await prisma.automationRule.findUnique({ where: { id } });
    if (!existing || existing.isArchived) {
      reply.code(404);
      return { message: "Automation rule not found" };
    }
    if (!(await canChangePropertyRule(request, reply, existing.propertyId))) return;
    const updated = await prisma.automationRule.update({ where: { id }, data: { enabled: payload.enabled }, include: ruleInclude });
    await writeAuditLog({
      request,
      actorUserId: user.id,
      propertyId: updated.propertyId,
      entityType: "AUTOMATION_RULE",
      entityId: updated.id,
      action: payload.enabled ? "AUTOMATION_RULE_ENABLED" : "AUTOMATION_RULE_DISABLED",
      message: `${payload.enabled ? "Enabled" : "Disabled"} automation rule ${updated.name}`,
    });
    return { rule: serializeRule(updated) };
  });

  app.delete("/automations/:id", async (request, reply) => {
    if (!(await ensureManager(request, reply))) return;
    const user = request.currentUser!;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.automationRule.findUnique({ where: { id } });
    if (!existing || existing.isArchived) {
      reply.code(404);
      return { message: "Automation rule not found" };
    }
    if (!(await canChangePropertyRule(request, reply, existing.propertyId))) return;
    const archived = await prisma.automationRule.update({ where: { id }, data: { enabled: false, isArchived: true } });
    await writeAuditLog({
      request,
      actorUserId: user.id,
      propertyId: archived.propertyId,
      entityType: "AUTOMATION_RULE",
      entityId: archived.id,
      action: "AUTOMATION_RULE_ARCHIVED",
      message: `Archived automation rule ${archived.name}`,
    });
    return { ok: true };
  });

  app.get("/automations/runs", async (request, reply) => {
    if (!(await ensureManager(request, reply))) return;
    const user = request.currentUser!;
    const query = runQuerySchema.parse(request.query);
    const propertyIds = allowedPropertyIds(user);
    const where: Prisma.AutomationRunWhereInput = {
      ruleId: query.ruleId,
      itemId: query.itemId,
      OR: propertyIds === null
        ? undefined
        : [
            { item: { propertyId: { in: propertyIds } } },
            { itemId: null, rule: { propertyId: { in: propertyIds } } },
          ],
    };
    const [total, runs] = await Promise.all([
      prisma.automationRun.count({ where }),
      prisma.automationRun.findMany({
        where,
        include: {
          rule: { select: { id: true, name: true, triggerType: true } },
          item: { select: { id: true, unitNumber: true, property: { select: { id: true, code: true, name: true } } } },
        },
        orderBy: { ranAt: "desc" },
        skip: query.offset,
        take: query.limit,
      }),
    ]);
    return {
      runs,
      pagination: { total, limit: query.limit, offset: query.offset, hasMore: query.offset + runs.length < total },
    };
  });
}
