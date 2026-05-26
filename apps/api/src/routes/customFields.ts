import { CustomFieldType, Prisma } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { allowedPropertyIds, requireManagerOrAdmin } from "../lib/auth.js";
import { writeAuditLog } from "../lib/audit.js";
import { prisma } from "../lib/prisma.js";

const moduleName = "make-ready";
const fieldTypeSchema = z.nativeEnum(CustomFieldType);
const optionSchema = z.object({
  id: z.string().optional(),
  label: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#58a6de"),
  sortOrder: z.number().int().min(0).optional(),
  isArchived: z.boolean().default(false),
});
const createFieldSchema = z.object({
  label: z.string().trim().min(2).max(120),
  fieldKey: z.string().regex(/^[a-z][a-zA-Z0-9]*$/).optional(),
  fieldType: fieldTypeSchema,
  description: z.string().trim().max(280).nullable().optional(),
  options: z.array(optionSchema).optional(),
});
const updateFieldSchema = createFieldSchema.partial();
const reorderSchema = z.object({
  fieldIds: z.array(z.string()).min(1),
});
const valueSchema = z.object({
  value: z.unknown().nullable(),
});

function serializeField(field: {
  id: string;
  module: string;
  fieldKey: string;
  label: string;
  fieldType: CustomFieldType;
  description: string | null;
  sortOrder: number;
  isArchived: boolean;
  options: Array<{
    id: string;
    label: string;
    color: string;
    sortOrder: number;
    isArchived: boolean;
  }>;
}) {
  return field;
}

function slugFieldKey(label: string) {
  const parts = label.replace(/[^a-zA-Z0-9]+/g, " ").trim().split(/\s+/);
  const first = (parts.shift() ?? "field").toLowerCase();
  return `${first}${parts.map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`).join("")}`;
}

async function availableFieldKey(requested: string | undefined, label: string) {
  const base = requested ?? slugFieldKey(label);
  let candidate = base;
  let suffix = 2;
  while (await prisma.customField.findUnique({ where: { fieldKey: candidate } })) {
    candidate = `${base}${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function usesOptions(fieldType: CustomFieldType) {
  return fieldType === CustomFieldType.SINGLE_SELECT || fieldType === CustomFieldType.MULTI_SELECT;
}

async function requireFieldManager(request: FastifyRequest, reply: FastifyReply) {
  if (await requireManagerOrAdmin(request, reply)) {
    return false;
  }
  return true;
}

async function syncOptions(
  tx: Prisma.TransactionClient,
  fieldId: string,
  options: Array<z.infer<typeof optionSchema>>,
) {
  const existing = await tx.customFieldOption.findMany({ where: { customFieldId: fieldId } });
  const knownIds = new Set(existing.map((option) => option.id));
  const previousById = new Map(existing.map((option) => [option.id, option.label]));
  const includedIds: string[] = [];
  const renamedOptions = new Map<string, string>();

  for (const [index, option] of options.entries()) {
    if (option.id && knownIds.has(option.id)) {
      includedIds.push(option.id);
      const previousLabel = previousById.get(option.id);
      if (previousLabel && previousLabel !== option.label) renamedOptions.set(previousLabel, option.label);
      await tx.customFieldOption.update({
        where: { id: option.id },
        data: {
          label: option.label,
          color: option.color,
          sortOrder: option.sortOrder ?? index,
          isArchived: option.isArchived,
        },
      });
    } else {
      const created = await tx.customFieldOption.create({
        data: {
          customFieldId: fieldId,
          label: option.label,
          color: option.color,
          sortOrder: option.sortOrder ?? index,
          isArchived: option.isArchived,
        },
      });
      includedIds.push(created.id);
    }
  }

  await tx.customFieldOption.updateMany({
    where: {
      customFieldId: fieldId,
      id: { notIn: includedIds },
    },
    data: { isArchived: true },
  });

  if (renamedOptions.size > 0) {
    const storedValues = await tx.customFieldValue.findMany({ where: { customFieldId: fieldId } });
    for (const stored of storedValues) {
      const current = stored.value as unknown;
      const next = typeof current === "string"
        ? renamedOptions.get(current) ?? current
        : Array.isArray(current)
          ? current.map((value) => typeof value === "string" ? renamedOptions.get(value) ?? value : value)
          : current;
      if (JSON.stringify(current) !== JSON.stringify(next)) {
        await tx.customFieldValue.update({ where: { id: stored.id }, data: { value: next as Prisma.InputJsonValue } });
      }
    }
  }
}

async function validatedValue(field: {
  fieldType: CustomFieldType;
  options: Array<{ label: string; isArchived: boolean }>;
}, raw: unknown) {
  if (raw === null || raw === "" || (Array.isArray(raw) && raw.length === 0)) {
    return null;
  }

  switch (field.fieldType) {
    case CustomFieldType.TEXT:
    case CustomFieldType.LONG_TEXT:
      return z.string().max(field.fieldType === CustomFieldType.TEXT ? 500 : 5000).parse(raw);
    case CustomFieldType.NUMBER:
      return z.number().finite().parse(raw);
    case CustomFieldType.DATE:
      return z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(raw);
    case CustomFieldType.BOOLEAN:
      return z.boolean().parse(raw);
    case CustomFieldType.USER: {
      const userId = z.string().parse(raw);
      const user = await prisma.user.findFirst({ where: { id: userId, isActive: true } });
      if (!user) throw new Error("Selected user is not active");
      return userId;
    }
    case CustomFieldType.SINGLE_SELECT: {
      const value = z.string().parse(raw);
      if (!field.options.some((option) => !option.isArchived && option.label === value)) {
        throw new Error("Selected option is not available");
      }
      return value;
    }
    case CustomFieldType.MULTI_SELECT: {
      const values = z.array(z.string()).parse(raw);
      if (values.some((value) => !field.options.some((option) => !option.isArchived && option.label === value))) {
        throw new Error("One or more selected options are not available");
      }
      return values;
    }
  }
}

export async function customFieldRoutes(app: FastifyInstance) {
  app.get("/custom-fields", async (request, reply) => {
    if (!(await requireFieldManager(request, reply))) return;
    const query = z.object({ includeArchived: z.coerce.boolean().default(false) }).parse(request.query);
    const fields = await prisma.customField.findMany({
      where: {
        module: moduleName,
        isArchived: query.includeArchived ? undefined : false,
      },
      include: { options: { orderBy: { sortOrder: "asc" } } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return { fields: fields.map(serializeField) };
  });

  app.post("/custom-fields", async (request, reply) => {
    if (!(await requireFieldManager(request, reply))) return;
    const user = request.currentUser!;
    const payload = createFieldSchema.parse(request.body);
    if (usesOptions(payload.fieldType) && (!payload.options || payload.options.length === 0)) {
      reply.code(400);
      return { message: "Select fields require at least one option" };
    }
    const fieldKey = await availableFieldKey(payload.fieldKey, payload.label);
    const sortOrder = await prisma.customField.count({ where: { module: moduleName, isArchived: false } });
    const created = await prisma.$transaction(async (tx) => {
      const field = await tx.customField.create({
        data: {
          module: moduleName,
          fieldKey,
          label: payload.label,
          fieldType: payload.fieldType,
          description: payload.description ?? null,
          sortOrder,
        },
      });
      if (payload.options) await syncOptions(tx, field.id, payload.options);
      return tx.customField.findUniqueOrThrow({
        where: { id: field.id },
        include: { options: { orderBy: { sortOrder: "asc" } } },
      });
    });
    await writeAuditLog({
      request,
      actorUserId: user.id,
      entityType: "CUSTOM_FIELD",
      entityId: created.id,
      action: "CUSTOM_FIELD_CREATED",
      message: `Created custom field ${created.label}`,
      metadata: { fieldKey: created.fieldKey, fieldType: created.fieldType },
    });
    reply.code(201);
    return { field: serializeField(created) };
  });

  app.patch("/custom-fields/:id", async (request, reply) => {
    if (!(await requireFieldManager(request, reply))) return;
    const user = request.currentUser!;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const payload = updateFieldSchema.parse(request.body);
    const existing = await prisma.customField.findUnique({
      where: { id },
      include: { options: true, _count: { select: { values: true } } },
    });
    if (!existing || existing.module !== moduleName) {
      reply.code(404);
      return { message: "Custom field not found" };
    }
    if (payload.fieldType && payload.fieldType !== existing.fieldType && existing._count.values > 0) {
      reply.code(400);
      return { message: "Field type cannot change after values have been recorded" };
    }
    const nextType = payload.fieldType ?? existing.fieldType;
    if (usesOptions(nextType) && payload.options && payload.options.filter((option) => !option.isArchived).length === 0) {
      reply.code(400);
      return { message: "Select fields require at least one active option" };
    }
    const updated = await prisma.$transaction(async (tx) => {
      await tx.customField.update({
        where: { id },
        data: {
          label: payload.label,
          fieldType: payload.fieldType,
          description: payload.description,
        },
      });
      if (payload.options) await syncOptions(tx, id, payload.options);
      return tx.customField.findUniqueOrThrow({
        where: { id },
        include: { options: { orderBy: { sortOrder: "asc" } } },
      });
    });
    await writeAuditLog({
      request,
      actorUserId: user.id,
      entityType: "CUSTOM_FIELD",
      entityId: updated.id,
      action: "CUSTOM_FIELD_UPDATED",
      message: `Updated custom field ${updated.label}`,
      metadata: { fieldType: updated.fieldType },
    });
    return { field: serializeField(updated) };
  });

  app.delete("/custom-fields/:id", async (request, reply) => {
    if (!(await requireFieldManager(request, reply))) return;
    const user = request.currentUser!;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.customField.findFirst({ where: { id, module: moduleName } });
    if (!existing) {
      reply.code(404);
      return { message: "Custom field not found" };
    }
    const archived = await prisma.customField.update({ where: { id }, data: { isArchived: true } });
    await writeAuditLog({
      request,
      actorUserId: user.id,
      entityType: "CUSTOM_FIELD",
      entityId: archived.id,
      action: "CUSTOM_FIELD_ARCHIVED",
      message: `Archived custom field ${archived.label}`,
    });
    return { ok: true };
  });

  app.put("/custom-fields/reorder", async (request, reply) => {
    if (!(await requireFieldManager(request, reply))) return;
    const user = request.currentUser!;
    const { fieldIds } = reorderSchema.parse(request.body);
    const count = await prisma.customField.count({ where: { id: { in: fieldIds }, module: moduleName, isArchived: false } });
    if (count !== fieldIds.length) {
      reply.code(400);
      return { message: "One or more fields cannot be reordered" };
    }
    await prisma.$transaction(fieldIds.map((id, index) => prisma.customField.update({ where: { id }, data: { sortOrder: index } })));
    await writeAuditLog({
      request,
      actorUserId: user.id,
      entityType: "CUSTOM_FIELD",
      action: "CUSTOM_FIELDS_REORDERED",
      message: "Reordered make-ready custom fields",
      metadata: { fieldIds },
    });
    return { ok: true };
  });

  app.put("/make-ready-items/:itemId/custom-fields/:fieldId", async (request, reply) => {
    if (!(await requireFieldManager(request, reply))) return;
    const user = request.currentUser!;
    const { itemId, fieldId } = z.object({ itemId: z.string(), fieldId: z.string() }).parse(request.params);
    const payload = valueSchema.parse(request.body);
    const propertyIds = allowedPropertyIds(user);
    const [item, field] = await Promise.all([
      prisma.makeReadyItem.findUnique({ where: { id: itemId } }),
      prisma.customField.findFirst({
        where: { id: fieldId, module: moduleName, isArchived: false },
        include: { options: true },
      }),
    ]);
    if (!item || !field) {
      reply.code(404);
      return { message: "Item or custom field not found" };
    }
    if (propertyIds !== null && !propertyIds.includes(item.propertyId)) {
      reply.code(403);
      return { message: "Property access denied" };
    }
    let value: unknown;
    try {
      value = await validatedValue(field, payload.value);
    } catch (error) {
      reply.code(400);
      return { message: error instanceof Error ? error.message : "Invalid custom field value" };
    }
    if (value === null) {
      await prisma.customFieldValue.deleteMany({ where: { itemId, customFieldId: fieldId } });
    } else {
      await prisma.customFieldValue.upsert({
        where: { customFieldId_itemId: { customFieldId: fieldId, itemId } },
        create: { customFieldId: fieldId, itemId, value: value as Prisma.InputJsonValue },
        update: { value: value as Prisma.InputJsonValue },
      });
    }
    await writeAuditLog({
      request,
      actorUserId: user.id,
      propertyId: item.propertyId,
      entityType: "CUSTOM_FIELD_VALUE",
      entityId: item.id,
      action: "CUSTOM_FIELD_VALUE_UPDATED",
      message: `Updated ${field.label} for ${item.unitNumber}`,
      metadata: { customFieldId: field.id, fieldKey: field.fieldKey, cleared: value === null },
    });
    return { fieldId, itemId, value };
  });
}
