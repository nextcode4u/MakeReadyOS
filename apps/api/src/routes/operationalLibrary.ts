import { CustomFieldType, Prisma, UserRole } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { allowedPropertyIds, canManageOperationalLibrary, requireManagerOrAdmin } from "../lib/auth.js";
import { writeAuditLog } from "../lib/audit.js";
import { automationRuleInputSchema, validateRuleReferences } from "../lib/automationDefinition.js";
import { bundledOperationalLibraryPacks } from "../lib/operationalLibrary.js";
import { prisma } from "../lib/prisma.js";

export const operationalLibraryPackSchema = z.object({
  format: z.literal("makereadyos.libraryPack"),
  version: z.literal(1),
  packKey: z.string().trim().min(3).max(120).regex(/^[a-z0-9][a-z0-9._-]*$/),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).optional(),
  category: z.string().trim().max(80).optional(),
  setupNotes: z.array(z.string().trim().max(500)).optional(),
  items: z.object({
    automationTemplates: z.array(z.intersection(automationRuleInputSchema, z.object({
      key: z.string().trim().min(1).max(120),
      category: z.string().trim().max(80).optional(),
      setupNotes: z.array(z.string().trim().max(500)).optional(),
    }))).optional(),
    checklistTemplates: z.array(z.object({
      key: z.string().trim().min(1).max(120),
      name: z.string().trim().min(2).max(120),
      scope: z.string().trim().max(80).nullable().optional(),
      items: z.array(z.object({
        title: z.string().trim().min(1).max(240),
        notes: z.string().trim().max(1000).nullable().optional(),
        required: z.boolean().optional(),
        dueOffsetDays: z.number().int().min(-365).max(365).nullable().optional(),
        tradeCategory: z.string().trim().max(80).nullable().optional(),
      })).min(1).max(100),
    })).optional(),
    customFields: z.array(z.object({
      key: z.string().trim().min(1).max(120),
      fieldKey: z.string().regex(/^[a-z][a-zA-Z0-9]*$/),
      label: z.string().trim().min(2).max(120),
      fieldType: z.nativeEnum(CustomFieldType),
      description: z.string().trim().max(280).nullable().optional(),
      options: z.array(z.object({
        label: z.string().trim().min(1).max(80),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        sortOrder: z.number().int().min(0).optional(),
        isArchived: z.boolean().optional(),
      })).optional(),
    })).optional(),
    optionSets: z.array(z.object({
      key: z.string().trim().min(1).max(120),
      fieldKey: z.string().trim().min(1).max(120),
      options: z.array(z.object({
        value: z.string().trim().min(1).max(80),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        sortOrder: z.number().int().min(0).optional(),
      })).min(1).max(100),
    })).optional(),
    scheduleTracks: z.array(z.object({
      key: z.string().trim().min(1).max(120),
      sourceField: z.string().trim().min(1).max(120),
      displayName: z.string().trim().min(2).max(120),
      colorBasis: z.string().trim().max(40).optional(),
      colorSourceField: z.string().trim().max(120).nullable().optional(),
      fixedColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
      groupingMode: z.string().trim().max(40).optional(),
      visibilityFilter: z.unknown().optional(),
      overdueEnabled: z.boolean().optional(),
      moveInSoonEnabled: z.boolean().optional(),
    })).optional(),
    savedViews: z.array(z.object({
      key: z.string().trim().min(1).max(120),
      name: z.string().trim().min(2).max(120),
      module: z.string().trim().min(1).max(80),
      viewType: z.string().trim().min(1).max(40),
      filters: z.record(z.unknown()),
      sorts: z.unknown().optional(),
      grouping: z.unknown().optional(),
      visibleColumns: z.unknown().optional(),
      isShared: z.boolean().optional(),
    })).optional(),
    propertyTemplates: z.array(z.object({
      key: z.string().trim().min(1).max(120),
      name: z.string().trim().min(2).max(160),
      description: z.string().trim().max(1000).nullable().optional(),
      category: z.string().trim().max(80).nullable().optional(),
      version: z.number().int().min(1).max(999).default(1),
      notes: z.string().trim().max(2000).nullable().optional(),
      manifest: z.unknown(),
    })).optional(),
  }).optional(),
}).strict();

export const operationalLibraryPackRequestSchema = z.object({
  packKey: z.string().optional(),
  pack: z.unknown().optional(),
}).refine((input) => Boolean(input.packKey) !== Boolean(input.pack), {
  message: "Provide either packKey or pack",
});

type ParsedPack = z.infer<typeof operationalLibraryPackSchema>;
type SummaryBucket = { created: number; skipped: number; conflicts: number; errors: string[] };
type LibrarySummary = Record<string, SummaryBucket>;

const itemBuckets = ["customFields", "optionSets", "checklistTemplates", "scheduleTracks", "savedViews", "automationTemplates", "propertyTemplates"] as const;

function emptySummary(): LibrarySummary {
  return Object.fromEntries(itemBuckets.map((bucket) => [bucket, { created: 0, skipped: 0, conflicts: 0, errors: [] }])) as LibrarySummary;
}

async function ensureLibraryManager(request: FastifyRequest, reply: FastifyReply) {
  if (await requireManagerOrAdmin(request, reply)) return false;
  if (!canManageOperationalLibrary(request.currentUser!)) {
    reply.code(403).send({ message: "Operational library management is not allowed for this role" });
    return false;
  }
  return true;
}

function rejectExecutablePack(input: unknown) {
  const raw = JSON.stringify(input);
  if (/"(?:script|code|javascript|handler)"\s*:/i.test(raw) || /function\s*\(|=>/.test(raw)) {
    throw new Error("Library packs are data-only. Executable scripts or JavaScript are not allowed.");
  }
}

function parsePack(input: unknown): ParsedPack {
  rejectExecutablePack(input);
  return operationalLibraryPackSchema.parse(input);
}

function bundledPack(packKey: string) {
  return bundledOperationalLibraryPacks.find((pack) => pack.packKey === packKey);
}

async function packFromRequest(body: unknown) {
  const request = operationalLibraryPackRequestSchema.parse(body);
  if (request.packKey) {
    const pack = bundledPack(request.packKey);
    if (!pack) throw new Error("Library pack not found");
    return parsePack(pack);
  }
  return parsePack(request.pack);
}

async function summarizePack(pack: ParsedPack) {
  const summary = emptySummary();
  const items = pack.items ?? {};

  for (const field of items.customFields ?? []) {
    const existing = await prisma.customField.findUnique({ where: { fieldKey: field.fieldKey } });
    summary.customFields[existing ? "skipped" : "created"] += 1;
  }
  for (const optionSet of items.optionSets ?? []) {
    for (const option of optionSet.options) {
      const existing = await prisma.labelDefinition.findUnique({
        where: { fieldKey_value: { fieldKey: optionSet.fieldKey, value: option.value } },
      });
      summary.optionSets[existing ? "skipped" : "created"] += 1;
    }
  }
  for (const template of items.checklistTemplates ?? []) {
    const existing = await prisma.checklistTemplate.findFirst({ where: { propertyId: null, name: template.name } });
    summary.checklistTemplates[existing ? "skipped" : "created"] += 1;
  }
  for (const track of items.scheduleTracks ?? []) {
    const existing = await prisma.scheduleTrack.findUnique({ where: { sourceField: track.sourceField } });
    summary.scheduleTracks[existing ? "skipped" : "created"] += 1;
  }
  for (const view of items.savedViews ?? []) {
    const existing = await prisma.savedView.findFirst({ where: { module: view.module, name: view.name, isShared: true } });
    summary.savedViews[existing ? "skipped" : "created"] += 1;
  }
  for (const rule of items.automationTemplates ?? []) {
    const templateId = `pack:${pack.packKey}:${rule.key}`;
    const existing = await prisma.automationRule.findFirst({ where: { templateId, isArchived: false } });
    summary.automationTemplates[existing ? "skipped" : "created"] += 1;
    try {
      await validateRuleReferences(rule.conditions, rule.actions, rule.propertyId ?? null);
    } catch (error) {
      summary.automationTemplates.conflicts += 1;
      summary.automationTemplates.errors.push(`${rule.name}: ${error instanceof Error ? error.message : "invalid rule references"}`);
    }
  }
  for (const template of items.propertyTemplates ?? []) {
    const existing = await prisma.propertyTemplate.findFirst({ where: { name: template.name, isArchived: false } });
    summary.propertyTemplates[existing ? "skipped" : "created"] += 1;
    const manifest = template.manifest as { format?: unknown; version?: unknown };
    if (manifest?.format !== "makereadyos.propertyTemplate" || manifest?.version !== 1) {
      summary.propertyTemplates.conflicts += 1;
      summary.propertyTemplates.errors.push(`${template.name}: unsupported property template manifest`);
    }
  }

  return summary;
}

function firstAccessiblePropertyId(user: FastifyRequest["currentUser"]) {
  const ids = allowedPropertyIds(user!);
  return ids === null ? null : ids[0] ?? null;
}

function rulePropertyIdForUser(user: FastifyRequest["currentUser"], requested: string | null | undefined) {
  if (user!.role === UserRole.ADMIN) return requested ?? null;
  const fallback = firstAccessiblePropertyId(user);
  return requested ?? fallback;
}

export async function operationalLibraryRoutes(app: FastifyInstance) {
  app.get("/operational-library/packs", async (request, reply) => {
    if (!(await ensureLibraryManager(request, reply))) return;
    const installed = await prisma.operationalLibraryPack.findMany({
      include: { items: true },
      orderBy: [{ createdAt: "desc" }],
    });
    return {
      packs: bundledOperationalLibraryPacks.map((pack) => {
        const install = installed.find((entry) => entry.packKey === pack.packKey);
        return {
          ...pack,
          installed: Boolean(install),
          installedAt: install?.createdAt ?? null,
          installedItems: install?.items ?? [],
          usageCount: install?.items.length ?? 0,
        };
      }),
      installed,
    };
  });

  app.post("/operational-library/preview", async (request, reply) => {
    if (!(await ensureLibraryManager(request, reply))) return;
    try {
      const pack = await packFromRequest(request.body);
      const summary = await summarizePack(pack);
      return {
        pack: {
          packKey: pack.packKey,
          name: pack.name,
          version: pack.version,
          category: pack.category ?? null,
          description: pack.description ?? null,
          setupNotes: pack.setupNotes ?? [],
        },
        dryRun: true,
        summary,
        warnings: ["Preview only. No fields, checklists, views, schedule tracks, options, or automation rules were changed."],
      };
    } catch (error) {
      reply.code(400);
      return { message: error instanceof Error ? error.message : "Invalid library pack" };
    }
  });

  app.post("/operational-library/install", async (request, reply) => {
    if (!(await ensureLibraryManager(request, reply))) return;
    const user = request.currentUser!;
    let pack: ParsedPack;
    try {
      pack = await packFromRequest(request.body);
    } catch (error) {
      reply.code(400);
      return { message: error instanceof Error ? error.message : "Invalid library pack" };
    }

    const summary = emptySummary();
    const items = pack.items ?? {};
    const installedPack = await prisma.operationalLibraryPack.upsert({
      where: { packKey: pack.packKey },
      create: {
        packKey: pack.packKey,
        name: pack.name,
        version: pack.version,
        category: pack.category ?? null,
        description: pack.description ?? null,
        source: bundledPack(pack.packKey) ? "BUNDLED" : "IMPORTED",
        manifest: pack as Prisma.InputJsonValue,
        installedById: user.id,
      },
      update: {
        name: pack.name,
        version: pack.version,
        category: pack.category ?? null,
        description: pack.description ?? null,
        manifest: pack as Prisma.InputJsonValue,
        installedById: user.id,
      },
    });

    for (const field of items.customFields ?? []) {
      const existing = await prisma.customField.findUnique({ where: { fieldKey: field.fieldKey } });
      if (existing) {
        summary.customFields.skipped += 1;
        continue;
      }
      const sortOrder = await prisma.customField.count({ where: { module: "make-ready", isArchived: false } });
      const created = await prisma.customField.create({
        data: {
          module: "make-ready",
          fieldKey: field.fieldKey,
          label: field.label,
          fieldType: field.fieldType,
          description: field.description ?? null,
          sortOrder,
          options: field.options ? {
            create: field.options.map((option, index) => ({
              label: option.label,
              color: option.color,
              sortOrder: option.sortOrder ?? index,
              isArchived: option.isArchived ?? false,
            })),
          } : undefined,
        },
      });
      await prisma.operationalLibraryPackItem.create({ data: { packId: installedPack.id, itemType: "CUSTOM_FIELD", itemKey: field.key, targetId: created.id } }).catch(() => undefined);
      summary.customFields.created += 1;
    }

    for (const optionSet of items.optionSets ?? []) {
      for (const [index, option] of optionSet.options.entries()) {
        const existing = await prisma.labelDefinition.findUnique({ where: { fieldKey_value: { fieldKey: optionSet.fieldKey, value: option.value } } });
        if (existing) {
          summary.optionSets.skipped += 1;
          continue;
        }
        const created = await prisma.labelDefinition.create({
          data: { fieldKey: optionSet.fieldKey, value: option.value, color: option.color, textColor: option.textColor ?? "#0b1020", sortOrder: option.sortOrder ?? index },
        });
        await prisma.operationalLibraryPackItem.create({ data: { packId: installedPack.id, itemType: "OPTION", itemKey: `${optionSet.key}:${option.value}`, targetId: created.id } }).catch(() => undefined);
        summary.optionSets.created += 1;
      }
    }

    for (const template of items.checklistTemplates ?? []) {
      const existing = await prisma.checklistTemplate.findFirst({ where: { propertyId: null, name: template.name } });
      if (existing) {
        summary.checklistTemplates.skipped += 1;
        continue;
      }
      const created = await prisma.checklistTemplate.create({
        data: {
          name: template.name,
          scope: template.scope ?? null,
          items: { create: template.items.map((entry, sortOrder) => ({ label: entry.title, notes: entry.notes ?? null, required: entry.required ?? true, dueOffsetDays: entry.dueOffsetDays ?? null, tradeCategory: entry.tradeCategory ?? null, sortOrder })) },
        },
      });
      await prisma.operationalLibraryPackItem.create({ data: { packId: installedPack.id, itemType: "CHECKLIST_TEMPLATE", itemKey: template.key, targetId: created.id } }).catch(() => undefined);
      summary.checklistTemplates.created += 1;
    }

    for (const track of items.scheduleTracks ?? []) {
      const existing = await prisma.scheduleTrack.findUnique({ where: { sourceField: track.sourceField } });
      if (existing) {
        summary.scheduleTracks.skipped += 1;
        continue;
      }
      const created = await prisma.scheduleTrack.create({
        data: {
          sourceField: track.sourceField,
          displayName: track.displayName,
          colorBasis: track.colorBasis ?? "NEUTRAL",
          colorSourceField: track.colorSourceField ?? null,
          fixedColor: track.fixedColor ?? null,
          groupingMode: track.groupingMode ?? "NONE",
          visibilityFilter: track.visibilityFilter as Prisma.InputJsonValue | undefined,
          overdueEnabled: track.overdueEnabled ?? true,
          moveInSoonEnabled: track.moveInSoonEnabled ?? true,
          sortOrder: await prisma.scheduleTrack.count({ where: { isArchived: false } }),
        },
      });
      await prisma.operationalLibraryPackItem.create({ data: { packId: installedPack.id, itemType: "SCHEDULE_TRACK", itemKey: track.key, targetId: created.id } }).catch(() => undefined);
      summary.scheduleTracks.created += 1;
    }

    for (const view of items.savedViews ?? []) {
      const existing = await prisma.savedView.findFirst({ where: { module: view.module, name: view.name, isShared: true } });
      if (existing) {
        summary.savedViews.skipped += 1;
        continue;
      }
      const created = await prisma.savedView.create({
        data: {
          ownerUserId: user.id,
          name: view.name,
          module: view.module,
          viewType: view.viewType,
          filters: view.filters as Prisma.InputJsonValue,
          sorts: view.sorts as Prisma.InputJsonValue | undefined,
          grouping: view.grouping as Prisma.InputJsonValue | undefined,
          visibleColumns: view.visibleColumns as Prisma.InputJsonValue | undefined,
          isShared: Boolean(view.isShared),
        },
      });
      await prisma.operationalLibraryPackItem.create({ data: { packId: installedPack.id, itemType: "SAVED_VIEW", itemKey: view.key, targetId: created.id } }).catch(() => undefined);
      summary.savedViews.created += 1;
    }

    for (const rule of items.automationTemplates ?? []) {
      const templateId = `pack:${pack.packKey}:${rule.key}`;
      const propertyId = rulePropertyIdForUser(user, rule.propertyId ?? null);
      if (user.role !== UserRole.ADMIN && !propertyId) {
        summary.automationTemplates.conflicts += 1;
        summary.automationTemplates.errors.push(`${rule.name}: manager has no accessible property scope`);
        continue;
      }
      const existing = await prisma.automationRule.findFirst({ where: { templateId, propertyId, isArchived: false } });
      if (existing) {
        summary.automationTemplates.skipped += 1;
        continue;
      }
      try {
        await validateRuleReferences(rule.conditions, rule.actions, propertyId);
      } catch (error) {
        summary.automationTemplates.conflicts += 1;
        summary.automationTemplates.errors.push(`${rule.name}: ${error instanceof Error ? error.message : "invalid rule references"}`);
        continue;
      }
      const created = await prisma.automationRule.create({
        data: {
          templateId,
          name: rule.name,
          description: rule.description ?? null,
          propertyId,
          triggerType: rule.triggerType,
          enabled: false,
          conditions: rule.conditions as Prisma.InputJsonValue,
          actions: rule.actions as Prisma.InputJsonValue,
        },
      });
      await prisma.operationalLibraryPackItem.create({ data: { packId: installedPack.id, itemType: "AUTOMATION_RULE", itemKey: rule.key, targetId: created.id } }).catch(() => undefined);
      summary.automationTemplates.created += 1;
    }

    for (const template of items.propertyTemplates ?? []) {
      const manifest = template.manifest as { format?: unknown; version?: unknown };
      if (manifest?.format !== "makereadyos.propertyTemplate" || manifest?.version !== 1) {
        summary.propertyTemplates.conflicts += 1;
        summary.propertyTemplates.errors.push(`${template.name}: unsupported property template manifest`);
        continue;
      }
      const existing = await prisma.propertyTemplate.findFirst({ where: { name: template.name, isArchived: false } });
      if (existing) {
        summary.propertyTemplates.skipped += 1;
        continue;
      }
      const created = await prisma.propertyTemplate.create({
        data: {
          name: template.name,
          description: template.description ?? null,
          category: template.category ?? pack.category ?? null,
          version: template.version,
          notes: template.notes ?? null,
          includeConfig: (manifest as { include?: unknown }).include as Prisma.InputJsonValue | undefined ?? {},
          manifest: template.manifest as Prisma.InputJsonValue,
          createdById: user.id,
        },
      });
      await prisma.operationalLibraryPackItem.create({ data: { packId: installedPack.id, itemType: "PROPERTY_TEMPLATE", itemKey: template.key, targetId: created.id } }).catch(() => undefined);
      summary.propertyTemplates.created += 1;
    }

    await writeAuditLog({
      request,
      actorUserId: user.id,
      entityType: "OPERATIONAL_LIBRARY_PACK",
      entityId: installedPack.id,
      action: "OPERATIONAL_LIBRARY_PACK_INSTALLED",
      message: `Installed operational library pack ${pack.name}`,
      metadata: { packKey: pack.packKey, version: pack.version, summary },
    });

    return { pack: installedPack, summary };
  });
}
