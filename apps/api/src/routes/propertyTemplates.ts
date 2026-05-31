import { CustomFieldType, Prisma, UserRole } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { allowedPropertyIds, requireManagerOrAdmin } from "../lib/auth.js";
import { writeAuditLog } from "../lib/audit.js";
import { prisma } from "../lib/prisma.js";

export const propertyTemplateIncludeSchema = z.object({
  boardSections: z.boolean().default(true),
  optionSets: z.boolean().default(true),
  customFields: z.boolean().default(true),
  floorPlans: z.boolean().default(false),
  scheduleTracks: z.boolean().default(true),
  savedViews: z.boolean().default(true),
  checklistTemplates: z.boolean().default(true),
  automationRules: z.boolean().default(true),
  dashboardPresets: z.boolean().default(true),
  notificationDefaults: z.boolean().default(false),
  planningDefaults: z.boolean().default(false),
});

export const propertyTemplateCreateFromPropertySchema = z.object({
  propertyId: z.string(),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).optional().nullable(),
  category: z.string().trim().max(80).optional().nullable(),
  version: z.number().int().min(1).max(999).default(1),
  notes: z.string().trim().max(2000).optional().nullable(),
  include: propertyTemplateIncludeSchema.default({}),
});

export const propertyTemplateApplySchema = z.object({
  dryRun: z.boolean().default(true),
  mode: z.literal("merge").default("merge"),
  targetPropertyId: z.string().optional().nullable(),
  newProperty: z.object({
    name: z.string().trim().min(2).max(120),
    code: z.string().trim().min(2).max(20).regex(/^[A-Za-z0-9_-]+$/).transform((value) => value.toUpperCase()),
  }).optional().nullable(),
  overwriteExisting: z.boolean().default(false),
  enableAutomations: z.boolean().default(false),
}).refine((input) => Boolean(input.targetPropertyId) !== Boolean(input.newProperty), {
  message: "Choose either an existing target property or a new property, not both",
});

export const propertyTemplateLibrarySchema = z.object({
  key: z.string().trim().min(1).max(120),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).optional().nullable(),
  category: z.string().trim().max(80).optional().nullable(),
  version: z.number().int().min(1).max(999).default(1),
  notes: z.string().trim().max(2000).optional().nullable(),
  manifest: z.unknown(),
});

export const propertyTemplatePackItemSchema = propertyTemplateLibrarySchema;

type IncludeConfig = z.infer<typeof propertyTemplateIncludeSchema>;
type TemplateManifest = {
  format: "makereadyos.propertyTemplate";
  version: 1;
  exportedAt: string;
  sourceProperty: { id: string; code: string; name: string } | null;
  include: IncludeConfig;
  data: {
    boardSections: Array<{ key: string; sectionType: string; displayName: string; sortOrder: number; isActive: boolean }>;
    optionSets: Array<{ fieldKey: string; value: string; color: string; textColor: string; sortOrder: number; isArchived: boolean }>;
    customFields: Array<{ fieldKey: string; module: string; label: string; fieldType: CustomFieldType; description: string | null; sortOrder: number; isArchived: boolean; options: Array<{ label: string; color: string; sortOrder: number; isArchived: boolean }> }>;
    floorPlans: Array<{ name: string; bedrooms: number | null; bathrooms: number | null; squareFeet: number | null; description: string | null; isActive: boolean }>;
    scheduleTracks: Array<{ sourceField: string; displayName: string; colorBasis: string; colorSourceField: string | null; fixedColor: string | null; groupingMode: string; visibilityFilter: unknown; overdueEnabled: boolean; moveInSoonEnabled: boolean; isEnabled: boolean; isArchived: boolean; sortOrder: number }>;
    savedViews: Array<{ name: string; module: string; viewType: string; filters: unknown; sorts: unknown; grouping: unknown; visibleColumns: unknown; isShared: boolean; isDefault: boolean }>;
    checklistTemplates: Array<{ name: string; scope: string | null; items: Array<{ label: string; notes: string | null; sortOrder: number; required: boolean; dueOffsetDays: number | null; tradeCategory: string | null }> }>;
    automationRules: Array<{ templateId: string | null; name: string; description: string | null; triggerType: string; enabled: boolean; isArchived: boolean; conditions: unknown; actions: unknown }>;
    notificationDefaults: unknown[];
    planningDefaults: unknown[];
  };
};

type SummaryBucket = { created: number; skipped: number; conflicts: number; errors: string[] };
type TemplateApplySummary = Record<keyof TemplateManifest["data"] | "properties", SummaryBucket>;

const bucket = (): SummaryBucket => ({ created: 0, skipped: 0, conflicts: 0, errors: [] });

function emptySummary(): TemplateApplySummary {
  return {
    properties: bucket(),
    boardSections: bucket(),
    optionSets: bucket(),
    customFields: bucket(),
    floorPlans: bucket(),
    scheduleTracks: bucket(),
    savedViews: bucket(),
    checklistTemplates: bucket(),
    automationRules: bucket(),
    notificationDefaults: bucket(),
    planningDefaults: bucket(),
  };
}

function defaultSections(propertyCode: string) {
  const code = propertyCode.toUpperCase();
  if (code === "TA") return [
    ["READY_UNITS_TA", "READY", "Ready Units"],
    ["MAKE_READY_BOARD_TA", "MAKE_READY", "Make Ready"],
    ["DOWN_AND_MODELS", "DOWN", "Down Units"],
    ["ARCHIVE_TA", "ARCHIVE", "Archive"],
  ] as const;
  if (code === "VAB") return [
    ["READY_UNITS_VAB", "READY", "Ready Units"],
    ["MAKE_READY_BOARD_VAB", "MAKE_READY", "Make Ready"],
    ["VAB_DOWN_UNITS", "DOWN", "Down Units"],
    ["ARCHIVE_VAB", "ARCHIVE", "Archive"],
  ] as const;
  return [
    [`${code}_READY_UNITS`, "READY", "Ready Units"],
    [`${code}_MAKE_READY`, "MAKE_READY", "Make Ready"],
    [`${code}_DOWN_UNITS`, "DOWN", "Down Units"],
    [`${code}_ARCHIVE`, "ARCHIVE", "Archive"],
  ] as const;
}

async function ensureTemplateManager(request: FastifyRequest, reply: FastifyReply) {
  if (await requireManagerOrAdmin(request, reply)) return false;
  return true;
}

function canAccessProperty(request: FastifyRequest, propertyId: string) {
  const propertyIds = allowedPropertyIds(request.currentUser!);
  return propertyIds === null || propertyIds.includes(propertyId);
}

async function requireAccessibleProperty(request: FastifyRequest, reply: FastifyReply, propertyId: string) {
  if (!canAccessProperty(request, propertyId)) {
    reply.code(403);
    return null;
  }
  const property = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!property) {
    reply.code(404);
    return null;
  }
  return property;
}

function serializeTemplate(template: {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  version: number;
  notes: string | null;
  sourcePropertyId: string | null;
  sourcePropertyCode: string | null;
  includeConfig: Prisma.JsonValue;
  manifest: Prisma.JsonValue;
  isArchived: boolean;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const manifest = template.manifest as unknown as TemplateManifest;
  const counts = Object.fromEntries(Object.entries(manifest.data ?? {}).map(([key, value]) => [key, Array.isArray(value) ? value.length : 0]));
  return { ...template, manifest, counts };
}

async function buildManifest(propertyId: string, include: IncludeConfig): Promise<TemplateManifest> {
  const property = await prisma.property.findUniqueOrThrow({ where: { id: propertyId } });
  const [boardSections, optionSets, customFields, floorPlans, scheduleTracks, savedViews, checklistTemplates, automationRules] = await Promise.all([
    include.boardSections ? prisma.boardSection.findMany({ where: { propertyId, isActive: true }, orderBy: { sortOrder: "asc" } }) : [],
    include.optionSets ? prisma.labelDefinition.findMany({ orderBy: [{ fieldKey: "asc" }, { sortOrder: "asc" }] }) : [],
    include.customFields ? prisma.customField.findMany({ include: { options: { orderBy: { sortOrder: "asc" } } }, where: { module: "make-ready", deletedAt: null }, orderBy: { sortOrder: "asc" } }) : [],
    include.floorPlans ? prisma.floorPlan.findMany({ where: { propertyId }, orderBy: { name: "asc" } }) : [],
    include.scheduleTracks ? prisma.scheduleTrack.findMany({ where: { isArchived: false }, orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }] }) : [],
    include.savedViews || include.dashboardPresets ? prisma.savedView.findMany({
      where: {
        isShared: true,
        OR: [
          ...(include.savedViews ? [{ module: { not: "dashboard" } }] : []),
          ...(include.dashboardPresets ? [{ module: "dashboard" }] : []),
        ],
      },
      orderBy: { name: "asc" },
    }) : [],
    include.checklistTemplates ? prisma.checklistTemplate.findMany({ where: { OR: [{ propertyId }, { propertyId: null }] }, include: { items: { orderBy: { sortOrder: "asc" } } }, orderBy: { name: "asc" } }) : [],
    include.automationRules ? prisma.automationRule.findMany({ where: { propertyId, isArchived: false }, orderBy: { name: "asc" } }) : [],
  ]);

  return {
    format: "makereadyos.propertyTemplate",
    version: 1,
    exportedAt: new Date().toISOString(),
    sourceProperty: { id: property.id, code: property.code, name: property.name },
    include,
    data: {
      boardSections: boardSections.map((section) => ({ key: section.key, sectionType: section.sectionType, displayName: section.displayName, sortOrder: section.sortOrder, isActive: section.isActive })),
      optionSets: optionSets.map((option) => ({ fieldKey: option.fieldKey, value: option.value, color: option.color, textColor: option.textColor, sortOrder: option.sortOrder, isArchived: option.isArchived })),
      customFields: customFields.map((field) => ({
        fieldKey: field.fieldKey,
        module: field.module,
        label: field.label,
        fieldType: field.fieldType,
        description: field.description,
        sortOrder: field.sortOrder,
        isArchived: field.isArchived,
        options: field.options.map((option) => ({ label: option.label, color: option.color, sortOrder: option.sortOrder, isArchived: option.isArchived })),
      })),
      floorPlans: floorPlans.map((plan) => ({ name: plan.name, bedrooms: plan.bedrooms, bathrooms: plan.bathrooms, squareFeet: plan.squareFeet, description: plan.description, isActive: plan.isActive })),
      scheduleTracks: scheduleTracks.map((track) => ({
        sourceField: track.sourceField,
        displayName: track.displayName,
        colorBasis: track.colorBasis,
        colorSourceField: track.colorSourceField,
        fixedColor: track.fixedColor,
        groupingMode: track.groupingMode,
        visibilityFilter: track.visibilityFilter,
        overdueEnabled: track.overdueEnabled,
        moveInSoonEnabled: track.moveInSoonEnabled,
        isEnabled: track.isEnabled,
        isArchived: track.isArchived,
        sortOrder: track.sortOrder,
      })),
      savedViews: savedViews.map((view) => ({ name: view.name, module: view.module, viewType: view.viewType, filters: view.filters, sorts: view.sorts, grouping: view.grouping, visibleColumns: view.visibleColumns, isShared: view.isShared, isDefault: view.isDefault })),
      checklistTemplates: checklistTemplates.map((template) => ({ name: template.name, scope: template.scope, items: template.items.map((item) => ({ label: item.label, notes: item.notes, sortOrder: item.sortOrder, required: item.required, dueOffsetDays: item.dueOffsetDays, tradeCategory: item.tradeCategory })) })),
      automationRules: automationRules.map((rule) => ({ templateId: rule.templateId, name: rule.name, description: rule.description, triggerType: rule.triggerType, enabled: false, isArchived: rule.isArchived, conditions: rule.conditions, actions: rule.actions })),
      notificationDefaults: [],
      planningDefaults: [],
    },
  };
}

async function applyTemplateManifest(options: {
  request: FastifyRequest;
  manifest: TemplateManifest;
  dryRun: boolean;
  targetPropertyId?: string | null;
  newProperty?: { name: string; code: string } | null;
  overwriteExisting: boolean;
  enableAutomations: boolean;
  templateId?: string;
}) {
  const summary = emptySummary();
  const user = options.request.currentUser!;

  return prisma.$transaction(async (tx) => {
    let property = options.targetPropertyId
      ? await tx.property.findUnique({ where: { id: options.targetPropertyId } })
      : null;

    if (options.targetPropertyId && (!property || !canAccessProperty(options.request, options.targetPropertyId))) {
      summary.properties.errors.push("Target property is missing or not accessible");
      summary.properties.conflicts += 1;
      return { property: null, summary };
    }

    if (options.newProperty) {
      if (user.role !== UserRole.ADMIN) {
        summary.properties.errors.push("Only administrators can create a new property from a template");
        summary.properties.conflicts += 1;
        return { property: null, summary };
      }
      const existing = await tx.property.findUnique({ where: { code: options.newProperty.code } });
      if (existing) {
        summary.properties.errors.push(`Property ${options.newProperty.code} already exists`);
        summary.properties.conflicts += 1;
        return { property: null, summary };
      }
      summary.properties.created += 1;
      if (!options.dryRun) {
        property = await tx.property.create({ data: options.newProperty });
      } else {
        property = { id: "__dry_run__", occupancyGoalPercent: null, uploadStorageMode: "DEFAULT", uploadSubdir: null, ...options.newProperty, isActive: true, createdAt: new Date(), updatedAt: new Date() };
      }
    }

    if (!property) {
      summary.properties.errors.push("No target property selected");
      summary.properties.conflicts += 1;
      return { property: null, summary };
    }

    const propertyId = property.id;
    const sectionRecords = options.manifest.data.boardSections.length
      ? options.manifest.data.boardSections
      : defaultSections(property.code).map(([key, sectionType, displayName], sortOrder) => ({ key, sectionType, displayName, sortOrder, isActive: true }));

    const canCheckPropertyScopedDuplicates = propertyId !== "__dry_run__";

    for (const section of sectionRecords) {
      const existing = canCheckPropertyScopedDuplicates ? await tx.boardSection.findFirst({ where: { propertyId, OR: [{ key: section.key }, { sectionType: section.sectionType }] } }) : null;
      if (existing) {
        summary.boardSections.skipped += 1;
        continue;
      }
      summary.boardSections.created += 1;
      if (!options.dryRun) {
        await tx.boardSection.create({ data: { propertyId, key: section.key, sectionType: section.sectionType, displayName: section.displayName, sortOrder: section.sortOrder, isActive: section.isActive } });
      }
    }

    for (const option of options.manifest.data.optionSets) {
      const existing = await tx.labelDefinition.findUnique({ where: { fieldKey_value: { fieldKey: option.fieldKey, value: option.value } } });
      if (existing) {
        summary.optionSets.skipped += 1;
        continue;
      }
      summary.optionSets.created += 1;
      if (!options.dryRun) {
        await tx.labelDefinition.create({ data: option });
      }
    }

    for (const field of options.manifest.data.customFields) {
      const existing = await tx.customField.findUnique({ where: { fieldKey: field.fieldKey }, include: { options: true } });
      if (!existing) {
        summary.customFields.created += 1;
        if (!options.dryRun) {
          await tx.customField.create({
            data: {
              module: field.module,
              fieldKey: field.fieldKey,
              label: field.label,
              fieldType: field.fieldType,
              description: field.description,
              sortOrder: field.sortOrder,
              isArchived: field.isArchived,
              options: { create: field.options },
            },
          });
        }
        continue;
      }
      summary.customFields.skipped += 1;
      const existingOptions = new Set(existing.options.map((option) => option.label));
      for (const option of field.options) {
        if (existingOptions.has(option.label)) {
          summary.customFields.skipped += 1;
          continue;
        }
        summary.customFields.created += 1;
        if (!options.dryRun) {
          await tx.customFieldOption.create({ data: { customFieldId: existing.id, ...option } });
        }
      }
    }

    for (const plan of options.manifest.data.floorPlans) {
      const existing = canCheckPropertyScopedDuplicates ? await tx.floorPlan.findUnique({ where: { propertyId_name: { propertyId, name: plan.name } } }) : null;
      if (existing) {
        summary.floorPlans.skipped += 1;
        continue;
      }
      summary.floorPlans.created += 1;
      if (!options.dryRun) {
        await tx.floorPlan.create({ data: { propertyId, ...plan } });
      }
    }

    for (const track of options.manifest.data.scheduleTracks) {
      const existing = await tx.scheduleTrack.findUnique({ where: { sourceField: track.sourceField } });
      if (existing) {
        summary.scheduleTracks.skipped += 1;
        continue;
      }
      summary.scheduleTracks.created += 1;
      if (!options.dryRun) {
        await tx.scheduleTrack.create({ data: { ...track, visibilityFilter: track.visibilityFilter as Prisma.InputJsonValue | undefined } });
      }
    }

    for (const view of options.manifest.data.savedViews) {
      const existing = await tx.savedView.findFirst({ where: { module: view.module, name: view.name, isShared: true } });
      if (existing) {
        summary.savedViews.skipped += 1;
        continue;
      }
      summary.savedViews.created += 1;
      if (!options.dryRun) {
        await tx.savedView.create({
          data: {
            ownerUserId: user.id,
            name: view.name,
            module: view.module,
            viewType: view.viewType,
            filters: view.filters as Prisma.InputJsonValue,
            sorts: view.sorts as Prisma.InputJsonValue | undefined,
            grouping: view.grouping as Prisma.InputJsonValue | undefined,
            visibleColumns: view.visibleColumns as Prisma.InputJsonValue | undefined,
            isShared: view.isShared,
            isDefault: view.isDefault,
          },
        });
      }
    }

    for (const template of options.manifest.data.checklistTemplates) {
      const existing = await tx.checklistTemplate.findFirst({ where: { propertyId, name: template.name, scope: template.scope } });
      if (existing) {
        summary.checklistTemplates.skipped += 1;
        continue;
      }
      summary.checklistTemplates.created += 1;
      if (!options.dryRun) {
        await tx.checklistTemplate.create({ data: { propertyId, name: template.name, scope: template.scope, items: { create: template.items } } });
      }
    }

    for (const rule of options.manifest.data.automationRules) {
      const templateId = options.templateId ? `property-template:${options.templateId}:${rule.name}` : rule.templateId;
      const existing = await tx.automationRule.findFirst({ where: { propertyId, name: rule.name, isArchived: false } });
      if (existing) {
        summary.automationRules.skipped += 1;
        continue;
      }
      summary.automationRules.created += 1;
      if (!options.dryRun) {
        await tx.automationRule.create({
          data: {
            templateId,
            propertyId,
            name: rule.name,
            description: rule.description,
            triggerType: rule.triggerType,
            enabled: options.enableAutomations,
            isArchived: rule.isArchived,
            conditions: rule.conditions as Prisma.InputJsonValue,
            actions: rule.actions as Prisma.InputJsonValue,
          },
        });
      }
    }

    return { property, summary };
  });
}

export async function propertyTemplateRoutes(app: FastifyInstance) {
  app.get("/property-templates", async (request, reply) => {
    if (!(await ensureTemplateManager(request, reply))) return;
    const templates = await prisma.propertyTemplate.findMany({
      where: { isArchived: false },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
    return { templates: templates.map(serializeTemplate) };
  });

  app.post("/property-templates/from-property/preview", async (request, reply) => {
    if (!(await ensureTemplateManager(request, reply))) return;
    const input = propertyTemplateCreateFromPropertySchema.parse(request.body);
    const property = await requireAccessibleProperty(request, reply, input.propertyId);
    if (!property) return;
    const manifest = await buildManifest(property.id, input.include);
    return {
      dryRun: true,
      template: { name: input.name, description: input.description ?? null, category: input.category ?? null, version: input.version, notes: input.notes ?? null },
      sourceProperty: { id: property.id, code: property.code, name: property.name },
      counts: Object.fromEntries(Object.entries(manifest.data).map(([key, value]) => [key, Array.isArray(value) ? value.length : 0])),
      warnings: ["Preview only. No template was saved and no live make-ready data, comments, attachments, history, users, tokens, or sessions are included."],
    };
  });

  app.post("/property-templates/from-property", async (request, reply) => {
    if (!(await ensureTemplateManager(request, reply))) return;
    const input = propertyTemplateCreateFromPropertySchema.parse(request.body);
    const property = await requireAccessibleProperty(request, reply, input.propertyId);
    if (!property) return;
    const manifest = await buildManifest(property.id, input.include);
    const template = await prisma.propertyTemplate.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        category: input.category ?? null,
        version: input.version,
        notes: input.notes ?? null,
        sourcePropertyId: property.id,
        sourcePropertyCode: property.code,
        includeConfig: input.include as Prisma.InputJsonValue,
        manifest: manifest as Prisma.InputJsonValue,
        createdById: request.currentUser!.id,
      },
    });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: property.id,
      entityType: "PROPERTY_TEMPLATE",
      entityId: template.id,
      action: "PROPERTY_TEMPLATE_CREATED",
      message: `Created property template ${template.name} from ${property.code}`,
      metadata: { include: input.include },
    });
    reply.code(201);
    return { template: serializeTemplate(template) };
  });

  app.post("/property-templates/:id/apply", async (request, reply) => {
    if (!(await ensureTemplateManager(request, reply))) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = propertyTemplateApplySchema.parse(request.body);
    const template = await prisma.propertyTemplate.findUnique({ where: { id } });
    if (!template || template.isArchived) {
      reply.code(404);
      return { message: "Property template not found" };
    }
    const result = await applyTemplateManifest({
      request,
      manifest: template.manifest as unknown as TemplateManifest,
      dryRun: input.dryRun,
      targetPropertyId: input.targetPropertyId,
      newProperty: input.newProperty ?? null,
      overwriteExisting: input.overwriteExisting,
      enableAutomations: input.enableAutomations,
      templateId: template.id,
    });
    if (!input.dryRun && result.property) {
      await writeAuditLog({
        request,
        actorUserId: request.currentUser!.id,
        propertyId: result.property.id,
        entityType: "PROPERTY_TEMPLATE",
        entityId: template.id,
        action: "PROPERTY_TEMPLATE_APPLIED",
        message: `Applied property template ${template.name} to ${result.property.code}`,
        metadata: { summary: result.summary, enableAutomations: input.enableAutomations },
      });
    }
    return { dryRun: input.dryRun, property: result.property, summary: result.summary };
  });

  app.post("/property-templates/:id/archive", async (request, reply) => {
    if (!(await ensureTemplateManager(request, reply))) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const template = await prisma.propertyTemplate.update({ where: { id }, data: { isArchived: true } });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      entityType: "PROPERTY_TEMPLATE",
      entityId: template.id,
      action: "PROPERTY_TEMPLATE_ARCHIVED",
      message: `Archived property template ${template.name}`,
    });
    return { template: serializeTemplate(template) };
  });
}
