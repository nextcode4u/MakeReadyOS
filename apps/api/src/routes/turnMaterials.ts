import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { allowedPropertyIds } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { newlyRequestedMaterials, turnMaterialsSchema } from "../lib/turnMaterials.js";
import { createNotification } from "../lib/notifications.js";

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
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${item.propertyId}), 824018)::text`;
      const current = await tx.makeReadyItem.findUniqueOrThrow({ where: { id: item.id }, select: { materials: true, materialsVersion: true, unitNumber: true, property: { select: { code: true } } } });
      if (current.materialsVersion !== input.version) throw Object.assign(new Error("Parts list changed in another session. Cancel this edit, reload the list and try again."), { statusCode: 409 });
      const requests = newlyRequestedMaterials(turnMaterialsSchema.parse(current.materials), input.rows);
      const result = await tx.makeReadyItem.updateMany({ where: { id: item.id, materialsVersion: input.version, isArchived: false, property: { isActive: true } }, data: { materials: input.rows, materialsVersion: { increment: 1 } } });
      if (result.count !== 1) throw Object.assign(new Error("Parts list changed in another session. Cancel this edit, reload the list and try again."), { statusCode: 409 });
      await tx.auditLog.create({ data: { actorUserId: request.currentUser!.id, propertyId: item.propertyId, entityType: "MAKE_READY_ITEM", entityId: item.id, action: "TURN_MATERIALS_UPDATED", message: `Updated internal parts/materials list (${input.rows.length} rows).`, metadata: { version: input.version + 1 } } });
      if (requests.length) {
        const recipients = await tx.user.findMany({ where: { isActive: true, OR: [
          { role: "ADMIN" },
          { role: "MANAGER", propertyAccess: { some: { propertyId: item.propertyId } } },
          { propertyAccess: { some: { propertyId: item.propertyId, role: "MANAGER" } } },
        ] }, select: { id: true } });
        const summary = requests.slice(0, 5).map(row => `${row.name} (${row.quantity} ${row.unit})`).join(", ");
        for (const recipient of recipients) await createNotification({
          userId: recipient.id, propertyId: item.propertyId, itemId: item.id, category: "STATUS_CHANGE",
          title: `Parts need ordering: ${current.property.code} ${current.unitNumber}`,
          message: `${request.currentUser!.fullName} requested: ${summary}${requests.length > 5 ? `, plus ${requests.length - 5} more` : ""}. Open the unit's Parts & materials list to review and mark On order after purchasing.`,
          dedupeKey: `parts-order-request:${item.id}:${input.version + 1}`,
        }, tx);
      }
      return { rows: input.rows, version: input.version + 1, readOnly: false };
    });
  });
}
