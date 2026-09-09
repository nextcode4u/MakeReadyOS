import { z } from "zod";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { allowedPropertyIds, requireManagerOrAdmin } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { finalWalkCategory, independentInspectors, inspectorStaff, nextInspector, pendingWalkStatuses, syncFinalWalks } from "../lib/finalWalks.js";
import { createNotification } from "../lib/notifications.js";
import { getTurnReadiness } from "../lib/turnReadiness.js";
import { isFinalWalkStatus } from "../lib/turnStatus.js";

async function propertyContext(request: FastifyRequest, reply: FastifyReply) {
  if (await requireManagerOrAdmin(request, reply)) return null;
  const { propertyId } = z.object({ propertyId: z.string().min(1) }).parse(request.params);
  const ids = allowedPropertyIds(request.currentUser!);
  if (ids !== null && !ids.includes(propertyId)) { reply.code(403).send({ message: "Property access denied" }); return null; }
  if (!await prisma.property.findFirst({ where: { id: propertyId, isActive: true } })) { reply.code(404).send({ message: "Active property not found" }); return null; }
  return propertyId;
}
export async function finalWalkRoutes(app: FastifyInstance) {
  app.get("/automations/final-walk/:propertyId", async (request, reply) => {
    const propertyId = await propertyContext(request, reply);
    if (!propertyId) return;
    const policy = await prisma.finalWalkPolicy.findUnique({ where: { propertyId } });
    return { inspectors: policy?.inspectors ?? [], enabled: policy?.enabled ?? false, staff: await inspectorStaff(prisma, propertyId) };
  });
  app.put("/automations/final-walk/:propertyId", async (request, reply) => {
    const propertyId = await propertyContext(request, reply);
    if (!propertyId) return;
    const input = z.object({ inspectors: z.array(z.string().min(1)).max(20).refine(ids => new Set(ids).size === ids.length, "Inspectors must be unique"), enabled: z.boolean() }).parse(request.body);
    const staff = await inspectorStaff(prisma, propertyId);
    if (input.enabled && (!input.inspectors.length || input.inspectors.some(id => !staff.some(user => user.id === id)))) return reply.code(409).send({ message: "Choose active inspectors with access to this property" });
    await prisma.$transaction(async db => {
      await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${propertyId}), 824018)::text`;
      await db.finalWalkPolicy.upsert({ where: { propertyId }, create: { propertyId, ...input }, update: input });
      await db.auditLog.create({ data: { actorUserId: request.currentUser!.id, propertyId, entityType: "PROPERTY", entityId: propertyId, action: "FINAL_WALK_POLICY_UPDATED", message: "Updated final walk inspector order; existing inspection chains preserved", metadata: input } });
    });
    return { saved: true, ...await syncFinalWalks(propertyId) };
  });
  app.get("/make-ready-items/:id/final-walk", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const item = await prisma.makeReadyItem.findUnique({ where: { id } });
    if (!item) return reply.code(404).send({ message: "Item not found" });
    const ids = allowedPropertyIds(request.currentUser!);
    if (ids !== null && !ids.includes(item.propertyId)) return reply.code(403).send({ message: "Property access denied" });
    const block = await prisma.workAssignmentBlock.findFirst({ where: { itemId: id, category: finalWalkCategory, status: { in: pendingWalkStatuses } }, include: { assignedUser: { select: { id: true, fullName: true } } }, orderBy: { createdAt: "asc" } });
    const staff = await inspectorStaff(prisma, item.propertyId);
    const completedBlock = !block && item.makeReadyStatus === "DONE" ? await prisma.workAssignmentBlock.findFirst({ where: { itemId: id, category: finalWalkCategory, status: "DONE" }, orderBy: { createdAt: "desc" } }) : null;
    const reportAvailable = !item.isArchived && (block ?? completedBlock)?.assignedUserId === request.currentUser!.id && item.assignedTech?.trim().toLowerCase() !== request.currentUser!.fullName.trim().toLowerCase();
    const nextId = block && nextInspector(block.inspectorQueue, block.assignedUserId, independentInspectors(staff, item.assignedTech).map(user => user.id));
    return { block, reportAvailable, ready: isFinalWalkStatus(item.makeReadyStatus), blockers: await getTurnReadiness(prisma, id, request.currentUser!.fullName), next: staff.find(user => user.id === nextId) ?? null };
  });
  app.post("/make-ready-items/:id/final-walk/handoff", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = z.object({ blockId: z.string(), expectedAssigneeId: z.string(), reason: z.string().trim().min(3).max(1000) }).parse(request.body);
    const user = request.currentUser!;
    const item = await prisma.makeReadyItem.findUnique({ where: { id } });
    if (!item) return reply.code(404).send({ message: "Item not found" });
    const ids = allowedPropertyIds(user);
    if (ids !== null && !ids.includes(item.propertyId)) return reply.code(403).send({ message: "Property access denied" });
    return prisma.$transaction(async db => {
      await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${item.propertyId}), 824018)::text`;
      const currentItem = await db.makeReadyItem.findUniqueOrThrow({ where: { id } });
      if (currentItem.isArchived || currentItem.makeReadyStatus === "DONE") throw Object.assign(new Error("This inspection is no longer pending"), { statusCode: 409 });
      const block = await db.workAssignmentBlock.findFirst({ where: { id: input.blockId, itemId: id, category: finalWalkCategory, status: { in: pendingWalkStatuses } } });
      if (!block || block.assignedUserId !== input.expectedAssigneeId) throw Object.assign(new Error("Assignment changed. Refresh before handing off."), { statusCode: 409 });
      if (user.id !== block.assignedUserId && user.role !== "ADMIN" && user.role !== "MANAGER") throw Object.assign(new Error("Only the assigned inspector or a manager can hand off"), { statusCode: 403 });
      const staff = await inspectorStaff(db, item.propertyId);
      const next = nextInspector(block.inspectorQueue, block.assignedUserId, independentInspectors(staff, currentItem.assignedTech).map(entry => entry.id));
      if (!next) throw Object.assign(new Error("No eligible next inspector. This walk remains assigned; contact your manager."), { statusCode: 409 });
      await db.workAssignmentBlock.update({ where: { id: block.id }, data: { assignedUserId: next } });
      await createNotification({ userId: next, propertyId: item.propertyId, itemId: id, category: "ASSIGNMENT", title: "Final walk handed off to you", message: `${item.unitNumber}: ${input.reason}`, dedupeKey: `final-walk-handoff:${block.id}:${next}` }, db);
      await db.auditLog.create({ data: { actorUserId: user.id, propertyId: item.propertyId, entityType: "MAKE_READY_ITEM", entityId: id, action: "FINAL_WALK_HANDED_OFF", message: input.reason, metadata: { blockId: block.id, fromUserId: block.assignedUserId, toUserId: next } } });
      return { assignedUserId: next };
    });
  });
}
