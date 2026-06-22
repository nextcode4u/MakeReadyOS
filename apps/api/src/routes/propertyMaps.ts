import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { basename, extname } from "node:path";
import { pipeline } from "node:stream/promises";
import { stringify } from "csv-stringify/sync";
import { UserRole } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { scopedAllowedPropertyIds } from "../lib/auth.js";
import { writeAuditLog } from "../lib/audit.js";
import { renderPdfFromHtml } from "../lib/pdf.js";
import { prisma } from "../lib/prisma.js";
import { ensureStoredUploadParent, removeStoredUpload, resolveStoredUploadPath, routedStoredName } from "../lib/uploadStorage.js";
import { queueWebhookEvent } from "../lib/webhookQueue.js";

const allowedMapExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);
const allowedMapTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const allowedPinAttachmentExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);
const allowedPinAttachmentTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export const propertyMapQuerySchema = z.object({
  propertyId: z.string().optional(),
  includeArchived: z.enum(["true", "false"]).optional().transform((value) => value === "true"),
});
export const propertyMapCreateSchema = z.object({
  propertyId: z.string(),
  name: z.string().trim().min(2).max(120),
  mapType: z.string().trim().min(2).max(40).optional(),
  description: z.string().trim().max(1200).nullable().optional(),
  notes: z.string().trim().max(1200).nullable().optional(),
  width: z.coerce.number().int().positive().max(50000).nullable().optional(),
  height: z.coerce.number().int().positive().max(50000).nullable().optional(),
  isDefault: z.boolean().optional(),
});
export const propertyMapPatchSchema = propertyMapCreateSchema.omit({ propertyId: true }).partial().extend({
  isActive: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: "Provide map fields to update" });
export const unitMapLocationInputSchema = z.object({
  propertyId: z.string(),
  unitId: z.string(),
  mapId: z.string(),
  xPercent: z.number().min(0).max(100),
  yPercent: z.number().min(0).max(100),
  labelXPercent: z.number().min(0).max(100).nullable().optional(),
  labelYPercent: z.number().min(0).max(100).nullable().optional(),
  building: z.string().trim().max(80).nullable().optional(),
  area: z.string().trim().max(80).nullable().optional(),
  floor: z.string().trim().max(40).nullable().optional(),
});
export const unitMapLocationPatchSchema = unitMapLocationInputSchema.partial().refine((value) => Object.keys(value).length > 0, { message: "Provide location fields to update" });
export const propertyMapAreaInputSchema = z.object({
  propertyId: z.string(),
  mapId: z.string(),
  name: z.string().trim().min(1).max(100),
  areaType: z.string().trim().min(1).max(40).default("BUILDING"),
  xPercent: z.number().min(0).max(100),
  yPercent: z.number().min(0).max(100),
  widthPercent: z.number().min(0).max(100).nullable().optional(),
  heightPercent: z.number().min(0).max(100).nullable().optional(),
  color: z.string().trim().max(40).nullable().optional(),
  expectedUnitCount: z.coerce.number().int().min(0).max(10000).nullable().optional(),
  notes: z.string().trim().max(1200).nullable().optional(),
});
export const propertyMapAreaPatchSchema = propertyMapAreaInputSchema.omit({ propertyId: true, mapId: true }).partial().extend({
  isActive: z.boolean().optional(),
  isArchived: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: "Provide area fields to update" });
export const propertyMapPinQuerySchema = propertyMapQuerySchema.extend({
  mapId: z.string().optional(),
  q: z.string().trim().optional(),
  emergencyOnly: z.enum(["true", "false"]).optional().transform((value) => value === "true"),
  pinTypes: z.string().optional(),
});
export const propertyMapPinInputSchema = z.object({
  propertyId: z.string(),
  mapId: z.string(),
  title: z.string().trim().min(1).max(160),
  pinType: z.string().trim().min(1).max(40),
  xPercent: z.number().min(0).max(100),
  yPercent: z.number().min(0).max(100),
  building: z.string().trim().max(120).nullable().optional(),
  unitLabel: z.string().trim().max(120).nullable().optional(),
  area: z.string().trim().max(160).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  linkedRecordType: z.string().trim().max(40).nullable().optional(),
  linkedRecordId: z.string().trim().max(120).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  isEmergency: z.boolean().optional(),
});
export const propertyMapPinPatchSchema = propertyMapPinInputSchema.omit({ propertyId: true, mapId: true }).partial().extend({
  isActive: z.boolean().optional(),
  isArchived: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: "Provide pin fields to update" });

function canAdmin(userRole: UserRole) {
  return userRole === UserRole.ADMIN || userRole === UserRole.MANAGER;
}

function canEdit(userRole: UserRole) {
  return userRole === UserRole.ADMIN || userRole === UserRole.MANAGER || userRole === UserRole.TECH;
}

function canAccessProperty(request: FastifyRequest, propertyId: string) {
  const scoped = scopedAllowedPropertyIds(request);
  return scoped === null || scoped.includes(propertyId);
}

async function requirePropertyAccess(request: FastifyRequest, reply: FastifyReply, propertyId: string) {
  if (!canAccessProperty(request, propertyId)) {
    reply.code(403).send({ message: "Property access denied" });
    return false;
  }
  const property = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!property) {
    reply.code(404).send({ message: "Property not found" });
    return false;
  }
  return true;
}

function sanitizeFilename(filename: string) {
  return basename(filename).replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 180) || "property-map";
}

async function removeMapFile(storedName: string | null) {
  await removeStoredUpload(storedName);
}

function htmlEscape(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

async function enforceDefaultMap(propertyId: string, mapId: string) {
  await prisma.$transaction([
    prisma.propertyMap.updateMany({
      where: { propertyId, id: { not: mapId }, isDefault: true },
      data: { isDefault: false },
    }),
    prisma.propertyMap.update({
      where: { id: mapId },
      data: { isDefault: true },
    }),
  ]);
}

async function buildLinkedRecordSummary(pin: {
  linkedRecordType: string | null;
  linkedRecordId: string | null;
  propertyId: string;
}) {
  if (!pin.linkedRecordType || !pin.linkedRecordId) return null;
  if (pin.linkedRecordType === "PROJECT_RECORD") {
    const record = await prisma.projectRecord.findUnique({ where: { id: pin.linkedRecordId } });
    if (!record || record.propertyId !== pin.propertyId) return null;
    return { targetType: "PROJECT_RECORD", id: record.id, title: record.title, subtitle: record.recordType, status: record.status };
  }
  if (pin.linkedRecordType === "PEST_ISSUE") {
    const issue = await prisma.pestIssue.findUnique({ where: { id: pin.linkedRecordId }, include: { unit: true } });
    if (!issue || issue.propertyId !== pin.propertyId) return null;
    return { targetType: "PEST_ISSUE", id: issue.id, title: issue.unit?.number ?? issue.area ?? issue.building ?? issue.pestType, subtitle: issue.pestType, status: issue.status };
  }
  if (pin.linkedRecordType === "LEASE_COMPLIANCE_ISSUE") {
    const issue = await prisma.leaseComplianceIssue.findUnique({ where: { id: pin.linkedRecordId }, include: { unit: true } });
    if (!issue || issue.propertyId !== pin.propertyId) return null;
    return { targetType: "LEASE_COMPLIANCE_ISSUE", id: issue.id, title: issue.unit?.number ?? issue.area ?? issue.building ?? issue.issueTypeName, subtitle: issue.issueTypeName, status: issue.status };
  }
  if (pin.linkedRecordType === "PM_TASK") {
    const task = await prisma.preventiveMaintenanceTask.findUnique({ where: { id: pin.linkedRecordId } });
    if (!task || task.propertyId !== pin.propertyId) return null;
    return { targetType: "PM_TASK", id: task.id, title: task.taskName, subtitle: task.category, status: task.status };
  }
  if (pin.linkedRecordType === "WIKI_ENTRY") {
    const entry = await prisma.propertyWikiEntry.findUnique({ where: { id: pin.linkedRecordId } });
    if (!entry || entry.propertyId !== pin.propertyId) return null;
    return { targetType: "WIKI_ENTRY", id: entry.id, title: entry.title, subtitle: entry.section, status: entry.issueStatus ?? (entry.isEmergency ? "Emergency" : "Active") };
  }
  return null;
}

function propertyMapPinInclude() {
  return {
    property: true,
    map: true,
    createdBy: true,
    updatedBy: true,
    attachments: { orderBy: { createdAt: "desc" as const } },
  };
}

export async function propertyMapRoutes(app: FastifyInstance) {
  app.get("/property-maps", async (request, reply) => {
    const query = propertyMapQuerySchema.parse(request.query);
    if (query.propertyId && !(await requirePropertyAccess(request, reply, query.propertyId))) return;
    const scoped = scopedAllowedPropertyIds(request);
    const maps = await prisma.propertyMap.findMany({
      where: {
        propertyId: query.propertyId ?? (scoped === null ? undefined : { in: scoped }),
        isArchived: query.includeArchived ? undefined : false,
      },
      include: { property: true, _count: { select: { locations: true } } },
      orderBy: [{ propertyId: "asc" }, { isActive: "desc" }, { name: "asc" }],
    });
    return { maps };
  });

  app.post("/property-maps", async (request, reply) => {
    if (!canAdmin(request.currentUser!.role)) return reply.code(403).send({ message: "Manager or admin access required" });
    const input = propertyMapCreateSchema.parse(request.body);
    if (!(await requirePropertyAccess(request, reply, input.propertyId))) return;
    const map = await prisma.propertyMap.create({
      data: {
        propertyId: input.propertyId,
        name: input.name,
        mapType: input.mapType ?? "Custom",
        description: input.description ?? null,
        notes: input.notes ?? null,
        width: input.width ?? null,
        height: input.height ?? null,
        isDefault: input.isDefault ?? false,
      },
      include: { property: true, _count: { select: { locations: true } } },
    });
    if (input.isDefault) await enforceDefaultMap(map.propertyId, map.id);
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, propertyId: map.propertyId, entityType: "PROPERTY_MAP", entityId: map.id, action: "PROPERTY_MAP_CREATED", message: `Created property map ${map.name}` });
    reply.code(201);
    return { map };
  });

  app.patch("/property-maps/:id", async (request, reply) => {
    if (!canAdmin(request.currentUser!.role)) return reply.code(403).send({ message: "Manager or admin access required" });
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = propertyMapPatchSchema.parse(request.body);
    const existing = await prisma.propertyMap.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ message: "Property map not found" });
    if (!(await requirePropertyAccess(request, reply, existing.propertyId))) return;
    const map = await prisma.propertyMap.update({
      where: { id },
      data: input,
      include: { property: true, _count: { select: { locations: true } } },
    });
    if (input.isDefault) await enforceDefaultMap(map.propertyId, map.id);
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, propertyId: map.propertyId, entityType: "PROPERTY_MAP", entityId: map.id, action: "PROPERTY_MAP_UPDATED", message: `Updated property map ${map.name}` });
    return { map };
  });

  app.post("/property-maps/:id/archive", async (request, reply) => {
    if (!canAdmin(request.currentUser!.role)) return reply.code(403).send({ message: "Manager or admin access required" });
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.propertyMap.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ message: "Property map not found" });
    if (!(await requirePropertyAccess(request, reply, existing.propertyId))) return;
    const map = await prisma.propertyMap.update({ where: { id }, data: { isArchived: true, isActive: false }, include: { property: true, _count: { select: { locations: true } } } });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, propertyId: map.propertyId, entityType: "PROPERTY_MAP", entityId: map.id, action: "PROPERTY_MAP_ARCHIVED", message: `Archived property map ${map.name}` });
    return { map };
  });

  app.post("/property-maps/:id/restore", async (request, reply) => {
    if (!canAdmin(request.currentUser!.role)) return reply.code(403).send({ message: "Manager or admin access required" });
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.propertyMap.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ message: "Property map not found" });
    if (!(await requirePropertyAccess(request, reply, existing.propertyId))) return;
    const map = await prisma.propertyMap.update({ where: { id }, data: { isArchived: false, isActive: true }, include: { property: true, _count: { select: { locations: true } } } });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, propertyId: map.propertyId, entityType: "PROPERTY_MAP", entityId: map.id, action: "PROPERTY_MAP_RESTORED", message: `Restored property map ${map.name}` });
    return { map };
  });

  app.delete("/property-maps/:id", async (request, reply) => {
    if (!canAdmin(request.currentUser!.role)) return reply.code(403).send({ message: "Manager or admin access required" });
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.propertyMap.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ message: "Property map not found" });
    if (!(await requirePropertyAccess(request, reply, existing.propertyId))) return;
    if (!existing.isArchived) {
      return reply.code(400).send({ message: "Archive the property map before deleting it" });
    }

    await prisma.$transaction([
      prisma.projectRecord.updateMany({
        where: { propertyMapId: existing.id },
        data: { propertyMapId: null, pinX: null, pinY: null },
      }),
      prisma.leaseComplianceIssue.updateMany({
        where: { propertyMapId: existing.id },
        data: { propertyMapId: null },
      }),
      prisma.propertyMap.delete({ where: { id: existing.id } }),
    ]);
    await removeMapFile(existing.storedName);
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: existing.propertyId,
      entityType: "PROPERTY_MAP",
      entityId: existing.id,
      action: "PROPERTY_MAP_DELETED",
      message: `Deleted property map ${existing.name}`,
    });
    return { ok: true };
  });

  app.post("/property-maps/:id/upload", async (request, reply) => {
    if (!canAdmin(request.currentUser!.role)) return reply.code(403).send({ message: "Manager or admin access required" });
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const map = await prisma.propertyMap.findUnique({ where: { id }, include: { property: true } });
    if (!map) return reply.code(404).send({ message: "Property map not found" });
    if (!(await requirePropertyAccess(request, reply, map.propertyId))) return;
    const file = await request.file();
    if (!file) return reply.code(400).send({ message: "Select a map image or PDF" });
    const safeName = sanitizeFilename(file.filename);
    const extension = extname(safeName).toLowerCase();
    if (!allowedMapExtensions.has(extension) || !allowedMapTypes.has(file.mimetype)) {
      file.file.resume();
      return reply.code(415).send({ message: "Upload a PNG, JPG, WebP, or PDF property map" });
    }
    const storedName = routedStoredName(map.property, `${randomUUID()}${extension}`);
    await ensureStoredUploadParent(storedName);
    const path = resolveStoredUploadPath(storedName);
    await pipeline(file.file, (await import("node:fs")).createWriteStream(path));
    await removeMapFile(map.storedName);
    const updated = await prisma.propertyMap.update({
      where: { id },
      data: { originalName: safeName, storedName, mimeType: file.mimetype, sizeBytes: file.file.bytesRead },
      include: { property: true, _count: { select: { locations: true } } },
    });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, propertyId: map.propertyId, entityType: "PROPERTY_MAP", entityId: map.id, action: "PROPERTY_MAP_UPLOADED", message: `Uploaded map file ${safeName}` });
    return { map: updated };
  });

  app.get("/property-maps/:id/file", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const map = await prisma.propertyMap.findUnique({ where: { id } });
    if (!map || !map.storedName) return reply.code(404).send({ message: "Map file not found" });
    if (!(await requirePropertyAccess(request, reply, map.propertyId))) return;
    reply.header("Content-Type", map.mimeType ?? "application/octet-stream");
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Content-Disposition", `inline; filename="${(map.originalName ?? "property-map").replace(/"/g, "")}"`);
    return reply.send(createReadStream(resolveStoredUploadPath(map.storedName)));
  });

  app.get("/property-map-pins", async (request, reply) => {
    const query = propertyMapPinQuerySchema.parse(request.query);
    if (query.propertyId && !(await requirePropertyAccess(request, reply, query.propertyId))) return;
    const scoped = scopedAllowedPropertyIds(request);
    const pinTypes = query.pinTypes?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
    const pins = await prisma.propertyMapPin.findMany({
      where: {
        propertyId: query.propertyId ?? (scoped === null ? undefined : { in: scoped }),
        mapId: query.mapId,
        isArchived: query.includeArchived ? undefined : false,
        ...(query.emergencyOnly ? { isEmergency: true } : {}),
        ...(pinTypes.length ? { pinType: { in: pinTypes } } : {}),
        ...(query.q ? {
          OR: [
            { title: { contains: query.q, mode: "insensitive" } },
            { pinType: { contains: query.q, mode: "insensitive" } },
            { building: { contains: query.q, mode: "insensitive" } },
            { unitLabel: { contains: query.q, mode: "insensitive" } },
            { area: { contains: query.q, mode: "insensitive" } },
            { description: { contains: query.q, mode: "insensitive" } },
            { tags: { has: query.q } },
          ],
        } : {}),
      },
      include: propertyMapPinInclude(),
      orderBy: [{ isEmergency: "desc" }, { pinType: "asc" }, { title: "asc" }],
    });
    return { pins: await Promise.all(pins.map(async (pin) => ({ ...pin, linkedRecord: await buildLinkedRecordSummary(pin) }))) };
  });

  app.post("/property-map-pins", async (request, reply) => {
    if (!canEdit(request.currentUser!.role)) return reply.code(403).send({ message: "Property Maps edit access required" });
    const input = propertyMapPinInputSchema.parse(request.body);
    if (!(await requirePropertyAccess(request, reply, input.propertyId))) return;
    const map = await prisma.propertyMap.findFirst({ where: { id: input.mapId, propertyId: input.propertyId, isArchived: false } });
    if (!map) return reply.code(400).send({ message: "Map must belong to the selected property" });
    const pin = await prisma.propertyMapPin.create({
      data: {
        propertyId: input.propertyId,
        mapId: input.mapId,
        title: input.title,
        pinType: input.pinType,
        xPercent: input.xPercent,
        yPercent: input.yPercent,
        building: input.building ?? null,
        unitLabel: input.unitLabel ?? null,
        area: input.area ?? null,
        description: input.description ?? null,
        linkedRecordType: input.linkedRecordType ?? null,
        linkedRecordId: input.linkedRecordId ?? null,
        tags: input.tags ?? [],
        isEmergency: input.isEmergency ?? false,
        createdById: request.currentUser!.id,
        updatedById: request.currentUser!.id,
      },
      include: propertyMapPinInclude(),
    });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, propertyId: pin.propertyId, entityType: "PROPERTY_MAP_PIN", entityId: pin.id, action: "PROPERTY_MAP_PIN_CREATED", message: `Created map pin ${pin.title}` });
    await queueWebhookEvent({
      eventType: "property-map.pin.created",
      propertyId: pin.propertyId,
      actorUserId: request.currentUser!.id,
      data: {
        pinId: pin.id,
        mapId: pin.mapId,
        title: pin.title,
        pinType: pin.pinType,
        building: pin.building,
        unitLabel: pin.unitLabel,
        area: pin.area,
        linkedRecordType: pin.linkedRecordType,
        linkedRecordId: pin.linkedRecordId,
        isEmergency: pin.isEmergency,
        isArchived: pin.isArchived,
      },
    });
    reply.code(201);
    return { pin: { ...pin, linkedRecord: await buildLinkedRecordSummary(pin) } };
  });

  app.patch("/property-map-pins/:id", async (request, reply) => {
    if (!canEdit(request.currentUser!.role)) return reply.code(403).send({ message: "Property Maps edit access required" });
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = propertyMapPinPatchSchema.parse(request.body);
    const existing = await prisma.propertyMapPin.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ message: "Map pin not found" });
    if (!(await requirePropertyAccess(request, reply, existing.propertyId))) return;
    const pin = await prisma.propertyMapPin.update({
      where: { id },
      data: { ...input, updatedById: request.currentUser!.id },
      include: propertyMapPinInclude(),
    });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, propertyId: pin.propertyId, entityType: "PROPERTY_MAP_PIN", entityId: pin.id, action: "PROPERTY_MAP_PIN_UPDATED", message: `Updated map pin ${pin.title}` });
    await queueWebhookEvent({
      eventType: "property-map.pin.updated",
      propertyId: pin.propertyId,
      actorUserId: request.currentUser!.id,
      data: {
        pinId: pin.id,
        mapId: pin.mapId,
        title: pin.title,
        pinType: pin.pinType,
        building: pin.building,
        unitLabel: pin.unitLabel,
        area: pin.area,
        linkedRecordType: pin.linkedRecordType,
        linkedRecordId: pin.linkedRecordId,
        isEmergency: pin.isEmergency,
        isArchived: pin.isArchived,
      },
    });
    return { pin: { ...pin, linkedRecord: await buildLinkedRecordSummary(pin) } };
  });

  app.delete("/property-map-pins/:id", async (request, reply) => {
    if (!canEdit(request.currentUser!.role)) return reply.code(403).send({ message: "Property Maps edit access required" });
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.propertyMapPin.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ message: "Map pin not found" });
    if (!(await requirePropertyAccess(request, reply, existing.propertyId))) return;
    const pin = await prisma.propertyMapPin.update({
      where: { id },
      data: { isArchived: true, isActive: false, updatedById: request.currentUser!.id },
      include: propertyMapPinInclude(),
    });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, propertyId: pin.propertyId, entityType: "PROPERTY_MAP_PIN", entityId: pin.id, action: "PROPERTY_MAP_PIN_ARCHIVED", message: `Archived map pin ${pin.title}` });
    await queueWebhookEvent({
      eventType: "property-map.pin.archived",
      propertyId: pin.propertyId,
      actorUserId: request.currentUser!.id,
      data: {
        pinId: pin.id,
        mapId: pin.mapId,
        title: pin.title,
        pinType: pin.pinType,
        building: pin.building,
        unitLabel: pin.unitLabel,
        area: pin.area,
        linkedRecordType: pin.linkedRecordType,
        linkedRecordId: pin.linkedRecordId,
        isEmergency: pin.isEmergency,
        isArchived: pin.isArchived,
      },
    });
    return { pin: { ...pin, linkedRecord: await buildLinkedRecordSummary(pin) } };
  });

  app.post("/property-map-pins/:id/attachments", async (request, reply) => {
    if (!canEdit(request.currentUser!.role)) return reply.code(403).send({ message: "Property Maps edit access required" });
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const pin = await prisma.propertyMapPin.findUnique({
      where: { id },
      include: { property: true },
    });
    if (!pin) return reply.code(404).send({ message: "Map pin not found" });
    if (!(await requirePropertyAccess(request, reply, pin.propertyId))) return;
    const upload = await request.file();
    if (!upload) return reply.code(400).send({ message: "Photo or PDF is required" });
    const extension = extname(upload.filename).toLowerCase();
    if (!allowedPinAttachmentExtensions.has(extension) || !allowedPinAttachmentTypes.has(upload.mimetype)) {
      return reply.code(415).send({ message: "Unsupported map pin attachment type. Upload images or PDFs." });
    }
    const caption = String((upload.fields.caption as { value?: string } | undefined)?.value ?? "").trim() || null;
    const storedName = routedStoredName(pin.property, `property-maps/pins/${randomUUID()}${extension}`);
    await ensureStoredUploadParent(storedName);
    await pipeline(upload.file, createWriteStream(resolveStoredUploadPath(storedName)));
    const attachment = await prisma.propertyMapPinAttachment.create({
      data: {
        pinId: pin.id,
        propertyId: pin.propertyId,
        uploadedById: request.currentUser!.id,
        uploaderName: request.currentUser!.fullName,
        caption,
        originalName: upload.filename,
        storedName,
        mimeType: upload.mimetype,
        sizeBytes: upload.file.bytesRead,
      },
    });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: pin.propertyId,
      entityType: "PROPERTY_MAP_PIN_ATTACHMENT",
      entityId: attachment.id,
      action: "PROPERTY_MAP_PIN_ATTACHMENT_CREATED",
      message: `Uploaded map pin attachment ${attachment.originalName}`,
    });
    reply.code(201);
    return { attachment };
  });

  app.get("/property-map-pin-attachments/:id/download", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const attachment = await prisma.propertyMapPinAttachment.findUnique({ where: { id } });
    if (!attachment) return reply.code(404).send({ message: "Map pin attachment not found" });
    if (!(await requirePropertyAccess(request, reply, attachment.propertyId))) return;
    reply.header("Content-Type", attachment.mimeType);
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Content-Disposition", `inline; filename="${sanitizeFilename(attachment.originalName)}"`);
    return reply.send(createReadStream(resolveStoredUploadPath(attachment.storedName)));
  });

  app.delete("/property-map-pin-attachments/:id", async (request, reply) => {
    if (!canEdit(request.currentUser!.role)) return reply.code(403).send({ message: "Property Maps edit access required" });
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const attachment = await prisma.propertyMapPinAttachment.findUnique({ where: { id } });
    if (!attachment) return reply.code(404).send({ message: "Map pin attachment not found" });
    if (!(await requirePropertyAccess(request, reply, attachment.propertyId))) return;
    await prisma.propertyMapPinAttachment.delete({ where: { id } });
    await removeStoredUpload(attachment.storedName);
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: attachment.propertyId,
      entityType: "PROPERTY_MAP_PIN_ATTACHMENT",
      entityId: attachment.id,
      action: "PROPERTY_MAP_PIN_ATTACHMENT_DELETED",
      message: `Deleted map pin attachment ${attachment.originalName}`,
    });
    return { ok: true };
  });

  app.get("/property-maps/:id/export.csv", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const map = await prisma.propertyMap.findUnique({
      where: { id },
      include: { property: true, pins: { where: { isArchived: false }, orderBy: [{ isEmergency: "desc" }, { pinType: "asc" }, { title: "asc" }] } },
    });
    if (!map) return reply.code(404).send({ message: "Property map not found" });
    if (!(await requirePropertyAccess(request, reply, map.propertyId))) return;
    const csv = stringify(map.pins.map((pin) => ({
      Property: map.property.code,
      Map: map.name,
      Title: pin.title,
      PinType: pin.pinType,
      Building: pin.building ?? "",
      Unit: pin.unitLabel ?? "",
      Area: pin.area ?? "",
      XCoordinate: pin.xPercent,
      YCoordinate: pin.yPercent,
      LinkedRecord: [pin.linkedRecordType, pin.linkedRecordId].filter(Boolean).join(" / "),
      Tags: pin.tags.join(", "),
      Emergency: pin.isEmergency ? "Yes" : "No",
    })), { header: true });
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="${sanitizeFilename(`${map.property.code}-${map.name}-pins.csv`)}"`);
    return reply.send(csv);
  });

  app.get("/property-maps/:id/export.xls", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const map = await prisma.propertyMap.findUnique({
      where: { id },
      include: { property: true, pins: { where: { isArchived: false }, orderBy: [{ isEmergency: "desc" }, { pinType: "asc" }, { title: "asc" }] } },
    });
    if (!map) return reply.code(404).send({ message: "Property map not found" });
    if (!(await requirePropertyAccess(request, reply, map.propertyId))) return;
    const header = ["Property", "Map", "Title", "Pin Type", "Building", "Unit", "Area", "X Percent", "Y Percent", "Linked Record", "Tags", "Emergency", "Description"];
    const body = map.pins.map((pin) => [
      map.property.code,
      map.name,
      pin.title,
      pin.pinType,
      pin.building ?? "",
      pin.unitLabel ?? "",
      pin.area ?? "",
      pin.xPercent,
      pin.yPercent,
      [pin.linkedRecordType, pin.linkedRecordId].filter(Boolean).join(" / "),
      pin.tags.join(", "),
      pin.isEmergency ? "Yes" : "No",
      pin.description ?? "",
    ].map((value) => {
      const text = value === null || value === undefined ? "" : String(value);
      return /[\t"\n\r]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
    }).join("\t"));
    reply.header("Content-Type", "application/vnd.ms-excel; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="${sanitizeFilename(`${map.property.code}-${map.name}-pins.xls`)}"`);
    return reply.send([header.join("\t"), ...body].join("\n"));
  });

  app.get("/property-maps/:id/report.pdf", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const map = await prisma.propertyMap.findUnique({
      where: { id },
      include: { property: true, pins: { where: { isArchived: false }, orderBy: [{ isEmergency: "desc" }, { pinType: "asc" }, { title: "asc" }] } },
    });
    if (!map) return reply.code(404).send({ message: "Property map not found" });
    if (!(await requirePropertyAccess(request, reply, map.propertyId))) return;
    const html = `<!doctype html><html><body style="font-family: Arial, sans-serif; padding: 24px; color: #111827;">
      <h1 style="margin:0 0 8px;">${htmlEscape(map.name)}</h1>
      <p style="margin:0 0 20px;">${htmlEscape(map.property.code)} · ${htmlEscape(map.mapType)} · ${map.pins.length} active pin${map.pins.length === 1 ? "" : "s"}</p>
      <table style="width:100%; border-collapse:collapse; font-size:12px;">
        <thead><tr>
          <th style="text-align:left; border-bottom:1px solid #d1d5db; padding:8px;">Title</th>
          <th style="text-align:left; border-bottom:1px solid #d1d5db; padding:8px;">Type</th>
          <th style="text-align:left; border-bottom:1px solid #d1d5db; padding:8px;">Location</th>
          <th style="text-align:left; border-bottom:1px solid #d1d5db; padding:8px;">Coordinates</th>
          <th style="text-align:left; border-bottom:1px solid #d1d5db; padding:8px;">Linked Record</th>
        </tr></thead>
        <tbody>${map.pins.map((pin) => `<tr>
          <td style="border-bottom:1px solid #e5e7eb; padding:8px;">${htmlEscape(pin.title)}${pin.isEmergency ? " <strong>(Emergency)</strong>" : ""}</td>
          <td style="border-bottom:1px solid #e5e7eb; padding:8px;">${htmlEscape(pin.pinType)}</td>
          <td style="border-bottom:1px solid #e5e7eb; padding:8px;">${htmlEscape([pin.building, pin.unitLabel, pin.area].filter(Boolean).join(" / "))}</td>
          <td style="border-bottom:1px solid #e5e7eb; padding:8px;">${pin.xPercent.toFixed(1)}%, ${pin.yPercent.toFixed(1)}%</td>
          <td style="border-bottom:1px solid #e5e7eb; padding:8px;">${htmlEscape([pin.linkedRecordType, pin.linkedRecordId].filter(Boolean).join(" / "))}</td>
        </tr>`).join("")}</tbody>
      </table>
    </body></html>`;
    const pdf = await renderPdfFromHtml(html);
    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", `inline; filename="${sanitizeFilename(`${map.property.code}-${map.name}-pins.pdf`)}"`);
    return reply.send(pdf);
  });

  app.get("/unit-map-locations", async (request, reply) => {
    const query = propertyMapQuerySchema.extend({ mapId: z.string().optional() }).parse(request.query);
    if (query.propertyId && !(await requirePropertyAccess(request, reply, query.propertyId))) return;
    const scoped = scopedAllowedPropertyIds(request);
    const locations = await prisma.unitMapLocation.findMany({
      where: {
        propertyId: query.propertyId ?? (scoped === null ? undefined : { in: scoped }),
        mapId: query.mapId,
        isArchived: query.includeArchived ? undefined : false,
      },
      include: { unit: { include: { property: true, floorPlanRecord: true } }, property: true, map: true },
      orderBy: [{ propertyId: "asc" }, { area: "asc" }, { floor: "asc" }],
    });
    return { locations };
  });

  app.get("/property-map-areas", async (request, reply) => {
    const query = propertyMapQuerySchema.extend({ mapId: z.string().optional() }).parse(request.query);
    if (query.propertyId && !(await requirePropertyAccess(request, reply, query.propertyId))) return;
    const scoped = scopedAllowedPropertyIds(request);
    const areas = await prisma.propertyMapArea.findMany({
      where: {
        propertyId: query.propertyId ?? (scoped === null ? undefined : { in: scoped }),
        mapId: query.mapId,
        isArchived: query.includeArchived ? undefined : false,
      },
      include: { property: true, map: true },
      orderBy: [{ areaType: "asc" }, { name: "asc" }],
    });
    return { areas };
  });

  app.post("/property-map-areas", async (request, reply) => {
    if (!canEdit(request.currentUser!.role)) return reply.code(403).send({ message: "Property Maps edit access required" });
    const input = propertyMapAreaInputSchema.parse(request.body);
    if (!(await requirePropertyAccess(request, reply, input.propertyId))) return;
    const map = await prisma.propertyMap.findFirst({ where: { id: input.mapId, propertyId: input.propertyId, isArchived: false } });
    if (!map) return reply.code(400).send({ message: "Map must belong to the selected property" });
    const area = await prisma.propertyMapArea.create({
      data: {
        propertyId: input.propertyId,
        mapId: input.mapId,
        name: input.name,
        areaType: input.areaType,
        xPercent: input.xPercent,
        yPercent: input.yPercent,
        widthPercent: input.widthPercent ?? null,
        heightPercent: input.heightPercent ?? null,
        color: input.color ?? null,
        expectedUnitCount: input.expectedUnitCount ?? null,
        notes: input.notes ?? null,
      },
      include: { property: true, map: true },
    });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, propertyId: area.propertyId, entityType: "PROPERTY_MAP_AREA", entityId: area.id, action: "PROPERTY_MAP_AREA_CREATED", message: `Created map area ${area.name}` });
    reply.code(201);
    return { area };
  });

  app.patch("/property-map-areas/:id", async (request, reply) => {
    if (!canEdit(request.currentUser!.role)) return reply.code(403).send({ message: "Property Maps edit access required" });
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = propertyMapAreaPatchSchema.parse(request.body);
    const existing = await prisma.propertyMapArea.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ message: "Map area not found" });
    if (!(await requirePropertyAccess(request, reply, existing.propertyId))) return;
    const area = await prisma.propertyMapArea.update({ where: { id }, data: input, include: { property: true, map: true } });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, propertyId: area.propertyId, entityType: "PROPERTY_MAP_AREA", entityId: area.id, action: "PROPERTY_MAP_AREA_UPDATED", message: `Updated map area ${area.name}` });
    return { area };
  });

  app.delete("/property-map-areas/:id", async (request, reply) => {
    if (!canEdit(request.currentUser!.role)) return reply.code(403).send({ message: "Property Maps edit access required" });
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.propertyMapArea.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ message: "Map area not found" });
    if (!(await requirePropertyAccess(request, reply, existing.propertyId))) return;
    const area = await prisma.propertyMapArea.update({ where: { id }, data: { isArchived: true, isActive: false }, include: { property: true, map: true } });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, propertyId: area.propertyId, entityType: "PROPERTY_MAP_AREA", entityId: area.id, action: "PROPERTY_MAP_AREA_ARCHIVED", message: `Archived map area ${area.name}` });
    return { area };
  });

  app.put("/unit-map-locations", async (request, reply) => {
    if (!canEdit(request.currentUser!.role)) return reply.code(403).send({ message: "Property Maps edit access required" });
    const input = unitMapLocationInputSchema.parse(request.body);
    if (!(await requirePropertyAccess(request, reply, input.propertyId))) return;
    const [unit, map] = await Promise.all([
      prisma.unit.findFirst({ where: { id: input.unitId, propertyId: input.propertyId } }),
      prisma.propertyMap.findFirst({ where: { id: input.mapId, propertyId: input.propertyId, isArchived: false } }),
    ]);
    if (!unit) return reply.code(400).send({ message: "Unit must belong to the selected property" });
    if (!map) return reply.code(400).send({ message: "Map must belong to the selected property" });
    const location = await prisma.unitMapLocation.upsert({
      where: { mapId_unitId: { mapId: input.mapId, unitId: input.unitId } },
      create: { ...input, isActive: true, isArchived: false },
      update: { ...input, isActive: true, isArchived: false },
      include: { unit: { include: { property: true, floorPlanRecord: true } }, property: true, map: true },
    });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, propertyId: location.propertyId, entityType: "UNIT_MAP_LOCATION", entityId: location.id, action: "UNIT_MAP_LOCATION_SAVED", message: `Saved map location for ${unit.number}` });
    return { location };
  });

  app.patch("/unit-map-locations/:id", async (request, reply) => {
    if (!canEdit(request.currentUser!.role)) return reply.code(403).send({ message: "Property Maps edit access required" });
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = unitMapLocationPatchSchema.parse(request.body);
    const existing = await prisma.unitMapLocation.findUnique({ where: { id }, include: { unit: true } });
    if (!existing) return reply.code(404).send({ message: "Unit map location not found" });
    if (!(await requirePropertyAccess(request, reply, existing.propertyId))) return;
    const location = await prisma.unitMapLocation.update({ where: { id }, data: input, include: { unit: { include: { property: true, floorPlanRecord: true } }, property: true, map: true } });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, propertyId: location.propertyId, entityType: "UNIT_MAP_LOCATION", entityId: location.id, action: "UNIT_MAP_LOCATION_UPDATED", message: `Updated map location for ${existing.unit.number}` });
    return { location };
  });

  app.delete("/unit-map-locations/:id", async (request, reply) => {
    if (!canEdit(request.currentUser!.role)) return reply.code(403).send({ message: "Property Maps edit access required" });
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.unitMapLocation.findUnique({ where: { id }, include: { unit: true } });
    if (!existing) return reply.code(404).send({ message: "Unit map location not found" });
    if (!(await requirePropertyAccess(request, reply, existing.propertyId))) return;
    const location = await prisma.unitMapLocation.update({ where: { id }, data: { isArchived: true, isActive: false }, include: { unit: { include: { property: true, floorPlanRecord: true } }, property: true, map: true } });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, propertyId: location.propertyId, entityType: "UNIT_MAP_LOCATION", entityId: location.id, action: "UNIT_MAP_LOCATION_REMOVED", message: `Removed map location for ${existing.unit.number}` });
    return { location };
  });
}
