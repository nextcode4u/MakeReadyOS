import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { basename, extname } from "node:path";
import { pipeline } from "node:stream/promises";
import { UserRole } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { scopedAllowedPropertyIds } from "../lib/auth.js";
import { writeAuditLog } from "../lib/audit.js";
import { prisma } from "../lib/prisma.js";
import { ensureStoredUploadParent, removeStoredUpload, resolveStoredUploadPath, routedStoredName } from "../lib/uploadStorage.js";

const allowedMapExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);
const allowedMapTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export const propertyMapQuerySchema = z.object({
  propertyId: z.string().optional(),
  includeArchived: z.enum(["true", "false"]).optional().transform((value) => value === "true"),
});
export const propertyMapCreateSchema = z.object({
  propertyId: z.string(),
  name: z.string().trim().min(2).max(120),
  notes: z.string().trim().max(1200).nullable().optional(),
  width: z.coerce.number().int().positive().max(50000).nullable().optional(),
  height: z.coerce.number().int().positive().max(50000).nullable().optional(),
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

function canManage(userRole: UserRole) {
  return userRole === UserRole.ADMIN || userRole === UserRole.MANAGER;
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
    if (!canManage(request.currentUser!.role)) return reply.code(403).send({ message: "Manager or admin access required" });
    const input = propertyMapCreateSchema.parse(request.body);
    if (!(await requirePropertyAccess(request, reply, input.propertyId))) return;
    const map = await prisma.propertyMap.create({
      data: { propertyId: input.propertyId, name: input.name, notes: input.notes ?? null, width: input.width ?? null, height: input.height ?? null },
      include: { property: true, _count: { select: { locations: true } } },
    });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, propertyId: map.propertyId, entityType: "PROPERTY_MAP", entityId: map.id, action: "PROPERTY_MAP_CREATED", message: `Created property map ${map.name}` });
    reply.code(201);
    return { map };
  });

  app.patch("/property-maps/:id", async (request, reply) => {
    if (!canManage(request.currentUser!.role)) return reply.code(403).send({ message: "Manager or admin access required" });
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
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, propertyId: map.propertyId, entityType: "PROPERTY_MAP", entityId: map.id, action: "PROPERTY_MAP_UPDATED", message: `Updated property map ${map.name}` });
    return { map };
  });

  app.post("/property-maps/:id/archive", async (request, reply) => {
    if (!canManage(request.currentUser!.role)) return reply.code(403).send({ message: "Manager or admin access required" });
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.propertyMap.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ message: "Property map not found" });
    if (!(await requirePropertyAccess(request, reply, existing.propertyId))) return;
    const map = await prisma.propertyMap.update({ where: { id }, data: { isArchived: true, isActive: false }, include: { property: true, _count: { select: { locations: true } } } });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, propertyId: map.propertyId, entityType: "PROPERTY_MAP", entityId: map.id, action: "PROPERTY_MAP_ARCHIVED", message: `Archived property map ${map.name}` });
    return { map };
  });

  app.post("/property-maps/:id/restore", async (request, reply) => {
    if (!canManage(request.currentUser!.role)) return reply.code(403).send({ message: "Manager or admin access required" });
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.propertyMap.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ message: "Property map not found" });
    if (!(await requirePropertyAccess(request, reply, existing.propertyId))) return;
    const map = await prisma.propertyMap.update({ where: { id }, data: { isArchived: false, isActive: true }, include: { property: true, _count: { select: { locations: true } } } });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, propertyId: map.propertyId, entityType: "PROPERTY_MAP", entityId: map.id, action: "PROPERTY_MAP_RESTORED", message: `Restored property map ${map.name}` });
    return { map };
  });

  app.post("/property-maps/:id/upload", async (request, reply) => {
    if (!canManage(request.currentUser!.role)) return reply.code(403).send({ message: "Manager or admin access required" });
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
    if (!canManage(request.currentUser!.role)) return reply.code(403).send({ message: "Manager or admin access required" });
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
    if (!canManage(request.currentUser!.role)) return reply.code(403).send({ message: "Manager or admin access required" });
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
    if (!canManage(request.currentUser!.role)) return reply.code(403).send({ message: "Manager or admin access required" });
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.propertyMapArea.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ message: "Map area not found" });
    if (!(await requirePropertyAccess(request, reply, existing.propertyId))) return;
    const area = await prisma.propertyMapArea.update({ where: { id }, data: { isArchived: true, isActive: false }, include: { property: true, map: true } });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, propertyId: area.propertyId, entityType: "PROPERTY_MAP_AREA", entityId: area.id, action: "PROPERTY_MAP_AREA_ARCHIVED", message: `Archived map area ${area.name}` });
    return { area };
  });

  app.put("/unit-map-locations", async (request, reply) => {
    if (!canManage(request.currentUser!.role)) return reply.code(403).send({ message: "Manager or admin access required" });
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
    if (!canManage(request.currentUser!.role)) return reply.code(403).send({ message: "Manager or admin access required" });
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
    if (!canManage(request.currentUser!.role)) return reply.code(403).send({ message: "Manager or admin access required" });
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.unitMapLocation.findUnique({ where: { id }, include: { unit: true } });
    if (!existing) return reply.code(404).send({ message: "Unit map location not found" });
    if (!(await requirePropertyAccess(request, reply, existing.propertyId))) return;
    const location = await prisma.unitMapLocation.update({ where: { id }, data: { isArchived: true, isActive: false }, include: { unit: { include: { property: true, floorPlanRecord: true } }, property: true, map: true } });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, propertyId: location.propertyId, entityType: "UNIT_MAP_LOCATION", entityId: location.id, action: "UNIT_MAP_LOCATION_REMOVED", message: `Removed map location for ${existing.unit.number}` });
    return { location };
  });
}
