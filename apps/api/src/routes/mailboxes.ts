import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { allowedPropertyIds } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { mailboxImportSchema, mailboxPlan } from "../lib/mailboxes.js";
import { z } from "zod";

async function propertyAccess(request: FastifyRequest, reply: FastifyReply) {
  const user = request.currentUser;
  if (!user || !["ADMIN", "MANAGER"].includes(user.role) || request.authType === "apiToken") { reply.code(403).send({ message: "An admin or manager session is required" }); return null; }
  const { propertyId } = z.object({ propertyId: z.string().min(1) }).parse(request.params);
  const ids = allowedPropertyIds(user);
  if (ids && !ids.includes(propertyId)) { reply.code(403).send({ message: "Property access denied" }); return null; }
  const property = await prisma.property.findFirst({ where: { id: propertyId, isActive: true }, select: { id: true, name: true, code: true } });
  if (!property) { reply.code(404).send({ message: "Active property not found" }); return null; }
  reply.header("Cache-Control", "no-store"); return property;
}
const select = { id: true, number: true, mailboxNumber: true };
export async function mailboxRoutes(app: FastifyInstance) {
  app.patch("/mailboxes/:propertyId/:unitId", async (request, reply) => {
    const property = await propertyAccess(request, reply); if (!property) return;
    const { unitId } = z.object({ unitId: z.string().min(1) }).parse(request.params);
    const input = z.object({ mailboxNumber: z.string().trim().max(40).regex(/^[^\r\n\x00-\x1f]*$/).nullable(), expected: z.string().nullable() }).strict().parse(request.body);
    return prisma.$transaction(async db => {
      await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${property.id}), 824021)::text`;
      const result = await db.unit.updateMany({ where: { id: unitId, propertyId: property.id, isActive: true, mailboxNumber: input.expected }, data: { mailboxNumber: input.mailboxNumber || null } });
      if (result.count !== 1) throw Object.assign(new Error("Unit is unavailable or its mailbox changed. Reload before saving."), { statusCode: 409 });
      await db.auditLog.create({ data: { actorUserId: request.currentUser!.id, propertyId: property.id, entityType: "UNIT", entityId: unitId, action: "UNIT_MAILBOX_UPDATED", message: "Updated unit mailbox assignment" } });
      return { mailboxNumber: input.mailboxNumber || null };
    });
  });
  app.get("/mailboxes/:propertyId", async (request, reply) => {
    const property = await propertyAccess(request, reply); if (!property) return;
    return { property, units: await prisma.unit.findMany({ where: { propertyId: property.id, isActive: true }, select, orderBy: { number: "asc" } }) };
  });
  app.post("/mailboxes/:propertyId/import", async (request, reply) => {
    const property = await propertyAccess(request, reply); if (!property) return;
    const input = mailboxImportSchema.parse(request.body);
    return prisma.$transaction(async db => {
      await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${property.id}), 824021)::text`;
      const units = await db.unit.findMany({ where: { propertyId: property.id, isActive: true }, select, orderBy: { number: "asc" } });
      let plan;
      try { plan = mailboxPlan(property.id, units, input); }
      catch (error) { throw Object.assign(error as Error, { statusCode: 400 }); }
      if (!input.token) return { ...plan, applied: false };
      if (input.token !== plan.token) throw Object.assign(new Error("The directory changed after preview. Preview again before applying."), { statusCode: 409 });
      if (plan.errors.length && !input.skipInvalid) throw Object.assign(new Error("Resolve the flagged rows or explicitly choose to skip them and import valid rows."), { statusCode: 400 });
      if (!plan.changes.some(change => change.action === "UPDATE")) throw Object.assign(new Error("No valid mailbox changes to import."), { statusCode: 400 });
      for (const change of plan.changes.filter(change => change.action === "UPDATE")) {
        const updated = await db.unit.updateMany({ where: { id: change.id, propertyId: property.id, isActive: true, mailboxNumber: change.before }, data: { mailboxNumber: change.after } });
        if (updated.count !== 1) throw Object.assign(new Error("A mailbox changed while importing. Preview again."), { statusCode: 409 });
      }
      await db.auditLog.create({ data: { actorUserId: request.currentUser!.id, propertyId: property.id, entityType: "PROPERTY", entityId: property.id, action: "MAILBOX_DIRECTORY_IMPORTED", message: `Updated ${plan.changes.filter(change => change.action === "UPDATE").length} unit mailbox assignments; skipped ${plan.errors.length} invalid rows` } });
      return { ...plan, applied: true };
    });
  });
}
