import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { allowedPropertyIds } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { turnMaterialsSchema } from "../lib/turnMaterials.js";

async function context(request: FastifyRequest, reply: FastifyReply, write = false) {
  const user = request.currentUser;
  if (!user || request.authType === "apiToken" || write && !["ADMIN", "MANAGER", "TECH", "CLEANER"].includes(user.role)) { reply.code(403).send({ message: "Maintenance staff access required" }); return null; }
  const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
  const item = await prisma.makeReadyItem.findUnique({ where: { id }, select: { id: true, propertyId: true, isArchived: true, materials: true, materialsVersion: true, property: { select: { isActive: true } } } });
  if (!item) { reply.code(404).send({ message: "Turn not found" }); return null; }
  const ids = allowedPropertyIds(user);
  if (ids && !ids.includes(item.propertyId)) { reply.code(403).send({ message: "Property access denied" }); return null; }
  if (write && (item.isArchived || !item.property.isActive)) { reply.code(409).send({ message: "Archived turns and properties are read-only" }); return null; }
  reply.header("Cache-Control", "no-store");
  return item;
}

export async function turnMaterialRoutes(app: FastifyInstance) {
  app.get("/make-ready-items/:id/materials", async (request, reply) => {
    const item = await context(request, reply); if (!item) return;
    return { rows: turnMaterialsSchema.parse(item.materials), version: item.materialsVersion, readOnly: item.isArchived || !item.property.isActive };
  });
  app.put("/make-ready-items/:id/materials", async (request, reply) => {
    const item = await context(request, reply, true); if (!item) return;
    const input = z.object({ rows: turnMaterialsSchema, version: z.number().int().nonnegative() }).strict().parse(request.body);
    return prisma.$transaction(async tx => {
      const result = await tx.makeReadyItem.updateMany({ where: { id: item.id, materialsVersion: input.version, isArchived: false, property: { isActive: true } }, data: { materials: input.rows, materialsVersion: { increment: 1 } } });
      if (result.count !== 1) throw Object.assign(new Error("Parts list changed in another session. Cancel this edit, reload the list and try again."), { statusCode: 409 });
      await tx.auditLog.create({ data: { actorUserId: request.currentUser!.id, propertyId: item.propertyId, entityType: "MAKE_READY_ITEM", entityId: item.id, action: "TURN_MATERIALS_UPDATED", message: `Updated internal parts/materials list (${input.rows.length} rows).`, metadata: { version: input.version + 1 } } });
      return { rows: input.rows, version: input.version + 1, readOnly: false };
    });
  });
}
