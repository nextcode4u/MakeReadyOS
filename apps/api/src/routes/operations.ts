import { Prisma, UserRole } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { allowedPropertyIds } from "../lib/auth.js";
import { writeAuditLog } from "../lib/audit.js";
import { prisma } from "../lib/prisma.js";

const querySchema = z.object({
  includeArchived: z.enum(["true", "false"]).optional().transform((value) => value === "true"),
  propertyId: z.string().optional(),
});

const propertyCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(2).max(20).regex(/^[A-Za-z0-9_-]+$/).transform((value) => value.toUpperCase()),
});

const propertyPatchSchema = propertyCreateSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: "Provide a property name or code to update",
});

const unitCreateSchema = z.object({
  propertyId: z.string(),
  number: z.string().trim().min(1).max(30),
  floorPlanId: z.string().optional().nullable(),
  floorPlan: z.string().trim().max(80).optional().nullable(),
  squareFeet: z.number().int().positive().max(10000).optional().nullable(),
});

const unitPatchSchema = unitCreateSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: "Provide unit fields to update",
});

const managedOptionFields = new Set([
  "vacancyStatus", "scopeLevel", "paintStatus", "doorsStatus", "completionStatus",
  "sheetrockStatus", "pestStatus", "pestTreated", "trashOutStatus", "floorsStatus",
  "makeReadyStatus", "cleaningStatus", "keysMadeStatus", "cabinetsStatus",
  "countertopsStatus", "appliancesStatus", "moveInFlag",
]);

const builtInColumnKeys = new Set([
  "unitNumber", "floorPlan", "applicant", "moveOutDate", "vacancyStatus", "vacatedDate", "daysVacant",
  "assignedTech", "scopeLevel", "makeReadyDate", "moveInDate", "paintStatus", "doorsStatus",
  "completionStatus", "sheetrockStatus", "pestStatus", "pestTreated", "trashOutStatus", "floorsStatus",
  "flooringDate", "makeReadyStatus", "cleaningStatus", "keysMadeStatus", "cabinetsStatus",
  "countertopsStatus", "appliancesStatus", "notes",
]);
const defaultColumnLabels: Record<string, string> = {
  unitNumber: "Item", floorPlan: "Floor Plan", applicant: "Applicant", moveOutDate: "NTV / Expected Vacate",
  vacancyStatus: "Vacancy", vacatedDate: "Vacated", daysVacant: "Days Vacant", assignedTech: "Assigned",
  scopeLevel: "Scope", makeReadyDate: "Make Ready", moveInDate: "Move-In", paintStatus: "Paint",
  doorsStatus: "Doors", completionStatus: "Completed", sheetrockStatus: "Sheetrock", pestStatus: "Pest",
  pestTreated: "Pest Treated", trashOutStatus: "Trash Out", floorsStatus: "Floors", flooringDate: "Flooring Date",
  makeReadyStatus: "Make Ready Scope", cleaningStatus: "Cleaning", keysMadeStatus: "Keys Made",
  cabinetsStatus: "Cabinets", countertopsStatus: "Countertops", appliancesStatus: "Appliances", notes: "Notes",
};
const columnLabelSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  reset: z.boolean().optional(),
}).refine((value) => Boolean(value.label || value.reset), {
  message: "Provide a label or request reset",
});
const scheduleTrackSchema = z.object({
  sourceField: z.string().trim().min(1).max(120),
  displayName: z.string().trim().min(1).max(80),
  colorBasis: z.enum(["STATUS", "SCOPE", "FIELD", "FIXED", "NEUTRAL"]),
  colorSourceField: z.string().trim().min(1).max(120).optional().nullable(),
  fixedColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  groupingMode: z.enum(["NONE", "PROPERTY", "BOARD_GROUP"]).default("NONE"),
  visibilityFilter: z.object({
    boardGroups: z.array(z.string()).optional(),
    statusValues: z.array(z.string()).optional(),
  }).optional().nullable(),
  overdueEnabled: z.boolean().default(true),
  moveInSoonEnabled: z.boolean().default(true),
  isEnabled: z.boolean().default(true),
});
const scheduleTrackPatchSchema = scheduleTrackSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: "Provide schedule track fields to update",
});
const reorderScheduleTracksSchema = z.object({ ids: z.array(z.string()).min(1) });

const optionSchema = z.object({
  fieldKey: z.string(),
  value: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#f4f6fa"),
});

const optionPatchSchema = optionSchema.omit({ fieldKey: true }).partial().refine((value) => Object.keys(value).length > 0, {
  message: "Provide an option value or color to update",
});

const reorderOptionsSchema = z.object({ ids: z.array(z.string()).min(1) });

const floorPlanCreateSchema = z.object({
  propertyId: z.string(),
  name: z.string().trim().min(1).max(100),
  bedrooms: z.number().int().min(0).max(20).optional().nullable(),
  bathrooms: z.number().min(0).max(20).optional().nullable(),
  squareFeet: z.number().int().positive().max(10000).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
});

const floorPlanPatchSchema = floorPlanCreateSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: "Provide floor plan fields to update",
});
const sectionPatchSchema = z.object({ displayName: z.string().trim().min(1).max(80) });

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

function mayManage(userRole: UserRole) {
  return userRole === UserRole.ADMIN || userRole === UserRole.MANAGER;
}

async function ensureManagerOrAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (!mayManage(request.currentUser!.role)) {
    reply.code(403).send({ message: "Manager or admin access required" });
    return false;
  }
  return true;
}

function canAccessProperty(request: FastifyRequest, propertyId: string) {
  const propertyIds = allowedPropertyIds(request.currentUser!);
  return propertyIds === null || propertyIds.includes(propertyId);
}

async function requireAccessibleProperty(request: FastifyRequest, reply: FastifyReply, propertyId: string, allowArchived = false) {
  if (!canAccessProperty(request, propertyId)) {
    reply.code(403).send({ message: "Property access denied" });
    return null;
  }
  const property = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!property || (!allowArchived && !property.isActive)) {
    reply.code(404).send({ message: "Active property not found" });
    return null;
  }
  return property;
}

async function normalizeUnitFloorPlan(request: FastifyRequest, reply: FastifyReply, data: z.infer<typeof unitCreateSchema>, propertyId: string) {
  if (!data.floorPlanId) return data;
  const plan = await prisma.floorPlan.findFirst({ where: { id: data.floorPlanId, propertyId, isActive: true } });
  if (!plan) {
    reply.code(400).send({ message: "Select an active floor plan at the chosen property" });
    return null;
  }
  return {
    ...data,
    floorPlan: plan.name,
    squareFeet: plan.squareFeet,
    bedrooms: plan.bedrooms,
    bathrooms: plan.bathrooms,
  };
}

export async function operationsRoutes(app: FastifyInstance) {
  app.get("/operations/board-sections", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const query = querySchema.parse(request.query);
    const propertyIds = allowedPropertyIds(request.currentUser!);
    if (query.propertyId && !canAccessProperty(request, query.propertyId)) {
      reply.code(403);
      return { message: "Property access denied" };
    }
    const sections = await prisma.boardSection.findMany({
      where: {
        propertyId: query.propertyId ?? (propertyIds === null ? undefined : { in: propertyIds }),
        isActive: query.includeArchived ? undefined : true,
      },
      include: { property: true },
      orderBy: [{ propertyId: "asc" }, { sortOrder: "asc" }],
    });
    return { sections };
  });

  app.patch("/operations/board-sections/:id", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const payload = sectionPatchSchema.parse(request.body);
    const existing = await prisma.boardSection.findUnique({ where: { id }, include: { property: true } });
    if (!existing) {
      reply.code(404);
      return { message: "Board section not found" };
    }
    if (!canAccessProperty(request, existing.propertyId)) {
      reply.code(403);
      return { message: "Property access denied" };
    }
    const section = await prisma.boardSection.update({ where: { id }, data: payload, include: { property: true } });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: section.propertyId,
      entityType: "BOARD_SECTION",
      entityId: section.id,
      action: "BOARD_SECTION_RENAMED",
      message: `Renamed ${section.property.code} section ${existing.displayName} to ${section.displayName}`,
      metadata: { key: section.key, sectionType: section.sectionType, previousName: existing.displayName },
    });
    return { section };
  });

  app.get("/operations/columns", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const columns = await prisma.boardColumnDefinition.findMany({ orderBy: { fieldKey: "asc" } });
    return { columns };
  });

  app.patch("/operations/columns/:fieldKey", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const { fieldKey } = z.object({ fieldKey: z.string() }).parse(request.params);
    if (!builtInColumnKeys.has(fieldKey)) {
      reply.code(400);
      return { message: "Only built-in board column labels are configured here" };
    }
    const payload = columnLabelSchema.parse(request.body);
    const label = payload.reset ? defaultColumnLabels[fieldKey] : payload.label!;
    const column = await prisma.boardColumnDefinition.upsert({
      where: { fieldKey },
      create: { fieldKey, label },
      update: { label },
    });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      entityType: "BOARD_COLUMN",
      entityId: fieldKey,
      action: payload.reset ? "BOARD_COLUMN_LABEL_RESET" : "BOARD_COLUMN_LABEL_UPDATED",
      message: payload.reset ? `Reset board column ${fieldKey} to ${column.label}` : `Renamed board column ${fieldKey} to ${column.label}`,
    });
    return { column };
  });

  app.get("/operations/schedule-tracks", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const tracks = await prisma.scheduleTrack.findMany({ orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }] });
    return { tracks };
  });

  async function validScheduleSource(sourceField: string) {
    if (["moveOutDate", "vacatedDate", "makeReadyDate", "moveInDate", "flooringDate"].includes(sourceField)) return true;
    if (!sourceField.startsWith("custom:")) return false;
    return Boolean(await prisma.customField.findFirst({
      where: { id: sourceField.slice(7), module: "make-ready", fieldType: "DATE", isArchived: false },
    }));
  }

  async function validScheduleColorSource(sourceField: string | null | undefined) {
    if (!sourceField) return false;
    if (managedOptionFields.has(sourceField)) return true;
    if (!sourceField.startsWith("custom:")) return false;
    return Boolean(await prisma.customField.findFirst({
      where: {
        id: sourceField.slice(7),
        module: "make-ready",
        fieldType: { in: ["SINGLE_SELECT", "MULTI_SELECT"] },
        isArchived: false,
      },
    }));
  }

  async function validateTrackConfig(
    payload: Pick<z.infer<typeof scheduleTrackSchema>, "sourceField" | "colorBasis" | "colorSourceField" | "fixedColor">,
    reply: FastifyReply,
  ) {
    if (!(await validScheduleSource(payload.sourceField))) {
      reply.code(400).send({ message: "Schedule tracks require an active built-in or custom date field" });
      return false;
    }
    if (payload.colorBasis === "FIXED" && !payload.fixedColor) {
      reply.code(400).send({ message: "Fixed-color tracks require a color" });
      return false;
    }
    if (payload.colorBasis === "FIELD" && !(await validScheduleColorSource(payload.colorSourceField))) {
      reply.code(400).send({ message: "Field-color tracks require an active status/select field" });
      return false;
    }
    return true;
  }

  app.post("/operations/schedule-tracks", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const payload = scheduleTrackSchema.parse(request.body);
    if (!(await validateTrackConfig(payload, reply))) return;
    const duplicate = await prisma.scheduleTrack.findUnique({ where: { sourceField: payload.sourceField } });
    if (duplicate) {
      reply.code(409);
      return { message: "That schedule source already has a configured track" };
    }
    const sortOrder = await prisma.scheduleTrack.count();
    const track = await prisma.scheduleTrack.create({
      data: {
        ...payload,
        visibilityFilter: payload.visibilityFilter ? payload.visibilityFilter as Prisma.InputJsonValue : Prisma.DbNull,
        sortOrder,
      },
    });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      entityType: "SCHEDULE_TRACK",
      entityId: track.id,
      action: "SCHEDULE_TRACK_CREATED",
      message: `Created schedule track ${track.displayName}`,
    });
    reply.code(201);
    return { track };
  });

  app.patch("/operations/schedule-tracks/:id", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const payload = scheduleTrackPatchSchema.parse(request.body);
    const existing = await prisma.scheduleTrack.findUnique({ where: { id } });
    if (!existing) {
      reply.code(404);
      return { message: "Schedule track not found" };
    }
    if (payload.sourceField && payload.sourceField !== existing.sourceField) {
      const duplicate = await prisma.scheduleTrack.findUnique({ where: { sourceField: payload.sourceField } });
      if (duplicate) {
        reply.code(409);
        return { message: "That schedule source already has a configured track" };
      }
    }
    const merged = {
      sourceField: payload.sourceField ?? existing.sourceField,
      colorBasis: (payload.colorBasis ?? existing.colorBasis) as z.infer<typeof scheduleTrackSchema>["colorBasis"],
      colorSourceField: payload.colorSourceField === undefined ? existing.colorSourceField : payload.colorSourceField,
      fixedColor: payload.fixedColor === undefined ? existing.fixedColor : payload.fixedColor,
    };
    if (!(await validateTrackConfig(merged, reply))) return;
    const track = await prisma.scheduleTrack.update({
      where: { id },
      data: {
        ...payload,
        visibilityFilter: payload.visibilityFilter === undefined
          ? undefined
          : payload.visibilityFilter
            ? payload.visibilityFilter as Prisma.InputJsonValue
            : Prisma.DbNull,
      },
    });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      entityType: "SCHEDULE_TRACK",
      entityId: track.id,
      action: "SCHEDULE_TRACK_UPDATED",
      message: `Updated schedule track ${track.displayName}`,
      metadata: { enabled: track.isEnabled },
    });
    return { track };
  });

  app.post("/operations/schedule-tracks/:id/archive", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.scheduleTrack.findUnique({ where: { id } });
    if (!existing) {
      reply.code(404);
      return { message: "Schedule track not found" };
    }
    const track = await prisma.scheduleTrack.update({ where: { id }, data: { isArchived: true, isEnabled: false } });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      entityType: "SCHEDULE_TRACK",
      entityId: track.id,
      action: "SCHEDULE_TRACK_ARCHIVED",
      message: `Archived schedule track ${track.displayName}`,
    });
    return { track };
  });

  app.post("/operations/schedule-tracks/:id/restore", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.scheduleTrack.findUnique({ where: { id } });
    if (!existing) {
      reply.code(404);
      return { message: "Schedule track not found" };
    }
    const track = await prisma.scheduleTrack.update({ where: { id }, data: { isArchived: false } });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      entityType: "SCHEDULE_TRACK",
      entityId: track.id,
      action: "SCHEDULE_TRACK_RESTORED",
      message: `Restored schedule track ${track.displayName}`,
    });
    return { track };
  });

  app.put("/operations/schedule-tracks/reorder", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const payload = reorderScheduleTracksSchema.parse(request.body);
    const tracks = await prisma.scheduleTrack.findMany({ where: { id: { in: payload.ids } } });
    if (tracks.length !== payload.ids.length) {
      reply.code(400);
      return { message: "All schedule tracks must exist before reordering" };
    }
    await prisma.$transaction(payload.ids.map((id, index) => prisma.scheduleTrack.update({ where: { id }, data: { sortOrder: index } })));
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      entityType: "SCHEDULE_TRACK_SET",
      action: "SCHEDULE_TRACKS_REORDERED",
      message: "Reordered schedule tracks",
    });
    return { ok: true };
  });

  app.get("/operations/properties", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const query = querySchema.parse(request.query);
    const propertyIds = allowedPropertyIds(request.currentUser!);
    const properties = await prisma.property.findMany({
      where: {
        id: propertyIds === null ? undefined : { in: propertyIds },
        isActive: query.includeArchived ? undefined : true,
      },
      include: {
        _count: {
          select: {
            units: true,
            makeReadyItems: true,
          },
        },
      },
      orderBy: [{ isActive: "desc" }, { code: "asc" }],
    });
    return { properties };
  });

  app.post("/operations/properties", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    if (request.currentUser!.role !== UserRole.ADMIN) {
      reply.code(403);
      return { message: "Only administrators can create properties" };
    }
    const payload = propertyCreateSchema.parse(request.body);
    const existing = await prisma.property.findUnique({ where: { code: payload.code } });
    if (existing) {
      reply.code(409);
      return { message: "A property with that code already exists" };
    }
    const property = await prisma.property.create({ data: payload });
    await prisma.boardSection.createMany({
      data: defaultSections(property.code).map(([key, sectionType, displayName], sortOrder) => ({
        propertyId: property.id, key, sectionType, displayName, sortOrder,
      })),
    });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: property.id,
      entityType: "PROPERTY",
      entityId: property.id,
      action: "PROPERTY_CREATED",
      message: `Created property ${property.code}`,
    });
    reply.code(201);
    return { property };
  });

  app.patch("/operations/properties/:id", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const payload = propertyPatchSchema.parse(request.body);
    const existing = await requireAccessibleProperty(request, reply, id, true);
    if (!existing) return;
    if (payload.code && payload.code !== existing.code) {
      const duplicate = await prisma.property.findUnique({ where: { code: payload.code } });
      if (duplicate) {
        reply.code(409);
        return { message: "A property with that code already exists" };
      }
    }
    const property = await prisma.property.update({ where: { id }, data: payload });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: property.id,
      entityType: "PROPERTY",
      entityId: property.id,
      action: "PROPERTY_UPDATED",
      message: `Updated property ${property.code}`,
      metadata: { previousCode: existing.code, previousName: existing.name },
    });
    return { property };
  });

  app.post("/operations/properties/:id/archive", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    if (request.currentUser!.role !== UserRole.ADMIN) {
      reply.code(403);
      return { message: "Only administrators can archive properties" };
    }
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await requireAccessibleProperty(request, reply, id, true);
    if (!existing) return;
    const property = await prisma.property.update({ where: { id }, data: { isActive: false } });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: property.id,
      entityType: "PROPERTY",
      entityId: property.id,
      action: "PROPERTY_ARCHIVED",
      message: `Archived property ${property.code}`,
    });
    return { property };
  });

  app.post("/operations/properties/:id/restore", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    if (request.currentUser!.role !== UserRole.ADMIN) {
      reply.code(403);
      return { message: "Only administrators can restore properties" };
    }
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await requireAccessibleProperty(request, reply, id, true);
    if (!existing) return;
    const property = await prisma.property.update({ where: { id }, data: { isActive: true } });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: property.id,
      entityType: "PROPERTY",
      entityId: property.id,
      action: "PROPERTY_RESTORED",
      message: `Restored property ${property.code}`,
    });
    return { property };
  });

  app.delete("/operations/properties/:id", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    if (request.currentUser!.role !== UserRole.ADMIN) {
      reply.code(403);
      return { message: "Only administrators can delete properties" };
    }
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await requireAccessibleProperty(request, reply, id, true);
    if (!existing) return;
    if (existing.isActive) {
      reply.code(409);
      return { message: "Archive the property before deletion" };
    }
    const linkedCount = await prisma.$transaction([
      prisma.unit.count({ where: { propertyId: id } }),
      prisma.makeReadyItem.count({ where: { propertyId: id } }),
    ]);
    if (linkedCount.some((count) => count > 0)) {
      reply.code(409);
      return { message: "Property retains linked units or make-ready history and cannot be deleted safely" };
    }
    await prisma.property.delete({ where: { id } });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      entityType: "PROPERTY",
      entityId: id,
      action: "PROPERTY_DELETED",
      message: `Deleted archived property ${existing.code}`,
    });
    return { ok: true };
  });

  app.get("/operations/units", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const query = querySchema.parse(request.query);
    const propertyIds = allowedPropertyIds(request.currentUser!);
    if (query.propertyId && !canAccessProperty(request, query.propertyId)) {
      reply.code(403);
      return { message: "Property access denied" };
    }
    const units = await prisma.unit.findMany({
      where: {
        propertyId: query.propertyId ?? (propertyIds === null ? undefined : { in: propertyIds }),
        isActive: query.includeArchived ? undefined : true,
      },
      include: {
        property: true,
        floorPlanRecord: true,
        _count: { select: { makeReadyItems: true } },
      },
      orderBy: [{ propertyId: "asc" }, { isActive: "desc" }, { number: "asc" }],
    });
    return { units };
  });

  app.post("/operations/units", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const payload = unitCreateSchema.parse(request.body);
    const property = await requireAccessibleProperty(request, reply, payload.propertyId);
    if (!property) return;
    const normalizedPayload = await normalizeUnitFloorPlan(request, reply, payload, payload.propertyId);
    if (!normalizedPayload) return;
    const duplicate = await prisma.unit.findUnique({
      where: { propertyId_number: { propertyId: payload.propertyId, number: payload.number } },
    });
    if (duplicate) {
      reply.code(409);
      return { message: "That unit already exists at the selected property" };
    }
    const unit = await prisma.unit.create({
      data: normalizedPayload,
      include: { property: true, floorPlanRecord: true },
    });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: unit.propertyId,
      entityType: "UNIT",
      entityId: unit.id,
      action: "UNIT_CREATED",
      message: `Created unit ${unit.number} at ${property.code}`,
    });
    reply.code(201);
    return { unit };
  });

  app.patch("/operations/units/:id", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const payload = unitPatchSchema.parse(request.body);
    const existing = await prisma.unit.findUnique({ where: { id }, include: { property: true } });
    if (!existing) {
      reply.code(404);
      return { message: "Unit not found" };
    }
    if (!canAccessProperty(request, existing.propertyId)) {
      reply.code(403);
      return { message: "Property access denied" };
    }
    const propertyId = payload.propertyId ?? existing.propertyId;
    const property = await requireAccessibleProperty(request, reply, propertyId);
    if (!property) return;
    const normalizedPayload = await normalizeUnitFloorPlan(
      request,
      reply,
      { ...payload, propertyId, number: payload.number ?? existing.number },
      propertyId,
    );
    if (!normalizedPayload) return;
    if (payload.number || payload.propertyId) {
      const duplicate = await prisma.unit.findUnique({
        where: { propertyId_number: { propertyId, number: payload.number ?? existing.number } },
      });
      if (duplicate && duplicate.id !== existing.id) {
        reply.code(409);
        return { message: "That unit already exists at the selected property" };
      }
    }
    const unit = await prisma.$transaction(async (tx) => {
      const updated = await tx.unit.update({
        where: { id },
        data: {
          ...payload,
          floorPlanId: normalizedPayload.floorPlanId,
          floorPlan: normalizedPayload.floorPlan,
          squareFeet: normalizedPayload.squareFeet,
          bedrooms: "bedrooms" in normalizedPayload ? normalizedPayload.bedrooms : undefined,
          bathrooms: "bathrooms" in normalizedPayload ? normalizedPayload.bathrooms : undefined,
        },
        include: { property: true, floorPlanRecord: true },
      });
      if (payload.floorPlanId) {
        await tx.makeReadyItem.updateMany({
          where: { unitId: id },
          data: { floorPlan: updated.floorPlan },
        });
      }
      return updated;
    });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: unit.propertyId,
      entityType: "UNIT",
      entityId: unit.id,
      action: "UNIT_UPDATED",
      message: `Updated unit ${unit.number}`,
      metadata: { previousPropertyId: existing.propertyId, previousNumber: existing.number },
    });
    return { unit };
  });

  app.post("/operations/units/:id/archive", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.unit.findUnique({ where: { id }, include: { property: true } });
    if (!existing) {
      reply.code(404);
      return { message: "Unit not found" };
    }
    if (!canAccessProperty(request, existing.propertyId)) {
      reply.code(403);
      return { message: "Property access denied" };
    }
    const unit = await prisma.unit.update({ where: { id }, data: { isActive: false }, include: { property: true } });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: unit.propertyId,
      entityType: "UNIT",
      entityId: unit.id,
      action: "UNIT_ARCHIVED",
      message: `Archived unit ${unit.number}`,
    });
    return { unit };
  });

  app.post("/operations/units/:id/restore", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.unit.findUnique({ where: { id }, include: { property: true } });
    if (!existing || !(await requireAccessibleProperty(request, reply, existing.propertyId))) return;
    const unit = await prisma.unit.update({ where: { id }, data: { isActive: true }, include: { property: true } });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: unit.propertyId,
      entityType: "UNIT",
      entityId: unit.id,
      action: "UNIT_RESTORED",
      message: `Restored unit ${unit.number}`,
    });
    return { unit };
  });

  app.delete("/operations/units/:id", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.unit.findUnique({ where: { id } });
    if (!existing) {
      reply.code(404);
      return { message: "Unit not found" };
    }
    if (!canAccessProperty(request, existing.propertyId)) {
      reply.code(403);
      return { message: "Property access denied" };
    }
    if (existing.isActive) {
      reply.code(409);
      return { message: "Archive the unit before deletion" };
    }
    const linkedItems = await prisma.makeReadyItem.count({ where: { unitId: id } });
    if (linkedItems > 0) {
      reply.code(409);
      return { message: "Unit retains make-ready history and cannot be deleted safely" };
    }
    await prisma.unit.delete({ where: { id } });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: existing.propertyId,
      entityType: "UNIT",
      entityId: id,
      action: "UNIT_DELETED",
      message: `Deleted archived unit ${existing.number}`,
    });
    return { ok: true };
  });

  app.get("/operations/options", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const options = await prisma.labelDefinition.findMany({
      orderBy: [{ fieldKey: "asc" }, { sortOrder: "asc" }, { value: "asc" }],
    });
    return { options: options.filter((option) => managedOptionFields.has(option.fieldKey)) };
  });

  app.post("/operations/options", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const payload = optionSchema.parse(request.body);
    if (!managedOptionFields.has(payload.fieldKey)) {
      reply.code(400);
      return { message: "Unsupported built-in option set" };
    }
    const duplicate = await prisma.labelDefinition.findUnique({ where: { fieldKey_value: { fieldKey: payload.fieldKey, value: payload.value } } });
    if (duplicate) {
      reply.code(409);
      return { message: "That option already exists in the selected set" };
    }
    const sortOrder = await prisma.labelDefinition.count({ where: { fieldKey: payload.fieldKey } });
    const option = await prisma.labelDefinition.create({ data: { ...payload, sortOrder } });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      entityType: "BOARD_OPTION",
      entityId: option.id,
      action: "BOARD_OPTION_CREATED",
      message: `Created ${option.fieldKey} option ${option.value}`,
    });
    reply.code(201);
    return { option };
  });

  app.patch("/operations/options/:id", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const payload = optionPatchSchema.parse(request.body);
    const existing = await prisma.labelDefinition.findUnique({ where: { id } });
    if (!existing || !managedOptionFields.has(existing.fieldKey)) {
      reply.code(404);
      return { message: "Board option not found" };
    }
    const dataField = existing.fieldKey as keyof Prisma.MakeReadyItemUpdateManyMutationInput;
    const option = await prisma.$transaction(async (tx) => {
      const updated = await tx.labelDefinition.update({ where: { id }, data: payload });
      if (payload.value && payload.value !== existing.value && builtInColumnKeys.has(existing.fieldKey)) {
        await tx.makeReadyItem.updateMany({
          where: { [existing.fieldKey]: existing.value },
          data: { [dataField]: payload.value },
        });
      }
      return updated;
    });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      entityType: "BOARD_OPTION",
      entityId: option.id,
      action: "BOARD_OPTION_UPDATED",
      message: `Updated ${option.fieldKey} option ${option.value}`,
      metadata: { previousValue: existing.value },
    });
    return { option };
  });

  app.put("/operations/options/reorder", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const payload = reorderOptionsSchema.parse(request.body);
    const options = await prisma.labelDefinition.findMany({ where: { id: { in: payload.ids } } });
    if (options.length !== payload.ids.length || new Set(options.map((option) => option.fieldKey)).size !== 1) {
      reply.code(400);
      return { message: "Options must belong to one built-in option set" };
    }
    await prisma.$transaction(payload.ids.map((id, index) => prisma.labelDefinition.update({ where: { id }, data: { sortOrder: index } })));
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      entityType: "BOARD_OPTION_SET",
      entityId: options[0]?.fieldKey,
      action: "BOARD_OPTIONS_REORDERED",
      message: `Reordered ${options[0]?.fieldKey} options`,
    });
    return { ok: true };
  });

  app.post("/operations/options/:id/archive", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.labelDefinition.findUnique({ where: { id } });
    if (!existing || !managedOptionFields.has(existing.fieldKey)) {
      reply.code(404);
      return { message: "Board option not found" };
    }
    const option = await prisma.labelDefinition.update({ where: { id }, data: { isArchived: true } });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      entityType: "BOARD_OPTION",
      entityId: option.id,
      action: "BOARD_OPTION_ARCHIVED",
      message: `Archived ${option.fieldKey} option ${option.value}`,
    });
    return { option };
  });

  app.post("/operations/options/:id/restore", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const option = await prisma.labelDefinition.update({ where: { id }, data: { isArchived: false } });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      entityType: "BOARD_OPTION",
      entityId: option.id,
      action: "BOARD_OPTION_RESTORED",
      message: `Restored ${option.fieldKey} option ${option.value}`,
    });
    return { option };
  });

  app.delete("/operations/options/:id", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    reply.code(409);
    return { message: "Board options are retained for history; archive the option instead of deleting it" };
  });

  app.get("/operations/floor-plans", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const query = querySchema.parse(request.query);
    if (query.propertyId && !canAccessProperty(request, query.propertyId)) {
      reply.code(403);
      return { message: "Property access denied" };
    }
    const propertyIds = allowedPropertyIds(request.currentUser!);
    const floorPlans = await prisma.floorPlan.findMany({
      where: {
        propertyId: query.propertyId ?? (propertyIds === null ? undefined : { in: propertyIds }),
        isActive: query.includeArchived ? undefined : true,
      },
      include: { property: true, _count: { select: { units: true } } },
      orderBy: [{ propertyId: "asc" }, { isActive: "desc" }, { name: "asc" }],
    });
    return { floorPlans };
  });

  app.post("/operations/floor-plans", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const payload = floorPlanCreateSchema.parse(request.body);
    const property = await requireAccessibleProperty(request, reply, payload.propertyId);
    if (!property) return;
    const existing = await prisma.floorPlan.findUnique({ where: { propertyId_name: { propertyId: payload.propertyId, name: payload.name } } });
    if (existing) {
      reply.code(409);
      return { message: "That floor plan already exists at the selected property" };
    }
    const floorPlan = await prisma.floorPlan.create({ data: payload, include: { property: true } });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: floorPlan.propertyId,
      entityType: "FLOOR_PLAN",
      entityId: floorPlan.id,
      action: "FLOOR_PLAN_CREATED",
      message: `Created floor plan ${floorPlan.name} at ${property.code}`,
    });
    reply.code(201);
    return { floorPlan };
  });

  app.patch("/operations/floor-plans/:id", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const payload = floorPlanPatchSchema.parse(request.body);
    const existing = await prisma.floorPlan.findUnique({ where: { id } });
    if (!existing || !canAccessProperty(request, existing.propertyId)) {
      reply.code(existing ? 403 : 404);
      return { message: existing ? "Property access denied" : "Floor plan not found" };
    }
    const propertyId = payload.propertyId ?? existing.propertyId;
    if (!(await requireAccessibleProperty(request, reply, propertyId))) return;
    if (payload.name || payload.propertyId) {
      const duplicate = await prisma.floorPlan.findUnique({ where: { propertyId_name: { propertyId, name: payload.name ?? existing.name } } });
      if (duplicate && duplicate.id !== existing.id) {
        reply.code(409);
        return { message: "That floor plan already exists at the selected property" };
      }
    }
    const floorPlan = await prisma.$transaction(async (tx) => {
      const updated = await tx.floorPlan.update({ where: { id }, data: payload, include: { property: true } });
      await tx.unit.updateMany({
        where: { floorPlanId: id },
        data: {
          floorPlan: updated.name,
          bedrooms: updated.bedrooms,
          bathrooms: updated.bathrooms,
          squareFeet: updated.squareFeet,
        },
      });
      await tx.makeReadyItem.updateMany({
        where: { unit: { floorPlanId: id } },
        data: { floorPlan: updated.name },
      });
      return updated;
    });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: floorPlan.propertyId,
      entityType: "FLOOR_PLAN",
      entityId: floorPlan.id,
      action: "FLOOR_PLAN_UPDATED",
      message: `Updated floor plan ${floorPlan.name}`,
    });
    return { floorPlan };
  });

  for (const operation of ["archive", "restore"] as const) {
    app.post(`/operations/floor-plans/:id/${operation}`, async (request, reply) => {
      if (!(await ensureManagerOrAdmin(request, reply))) return;
      const { id } = z.object({ id: z.string() }).parse(request.params);
      const existing = await prisma.floorPlan.findUnique({ where: { id } });
      if (!existing || !canAccessProperty(request, existing.propertyId)) {
        reply.code(existing ? 403 : 404);
        return { message: existing ? "Property access denied" : "Floor plan not found" };
      }
      const floorPlan = await prisma.floorPlan.update({ where: { id }, data: { isActive: operation === "restore" } });
      await writeAuditLog({
        request,
        actorUserId: request.currentUser!.id,
        propertyId: existing.propertyId,
        entityType: "FLOOR_PLAN",
        entityId: id,
        action: `FLOOR_PLAN_${operation.toUpperCase()}D`,
        message: `${operation === "restore" ? "Restored" : "Archived"} floor plan ${existing.name}`,
      });
      return { floorPlan };
    });
  }

  app.delete("/operations/floor-plans/:id", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    reply.code(409);
    return { message: "Floor plans are retained for history; archive the floor plan instead of deleting it" };
  });
}
