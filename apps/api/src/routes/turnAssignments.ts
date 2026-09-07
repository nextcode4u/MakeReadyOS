import { z } from "zod";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { allowedPropertyIds, requireManagerOrAdmin } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { isAssignableTurn, runTurnAssignments, turnAssignmentStaff, turnSharesSchema, validateTurnStaff } from "../lib/turnAssignments.js";

async function context(request: FastifyRequest, reply: FastifyReply) {
  if (await requireManagerOrAdmin(request, reply)) return null;
  const { propertyId } = z.object({ propertyId: z.string().min(1) }).parse(request.params);
  const ids = allowedPropertyIds(request.currentUser!);
  if (ids !== null && !ids.includes(propertyId)) { reply.code(403).send({ message: "Property access denied" }); return null; }
  if (!await prisma.property.findFirst({ where: { id: propertyId, isActive: true } })) { reply.code(404).send({ message: "Active property not found" }); return null; }
  return propertyId;
}

export async function turnAssignmentRoutes(app: FastifyInstance) {
  app.get("/automations/turn-assignment/:propertyId", async (request, reply) => {
    const propertyId = await context(request, reply);
    if (!propertyId) return;
    const staff = await turnAssignmentStaff(prisma, propertyId);
    const policy = await prisma.turnAssignmentPolicy.findUnique({ where: { propertyId } });
    const shares = policy ? turnSharesSchema.parse(policy.shares) : [];
    const items = await prisma.makeReadyItem.findMany({ where: { propertyId, isArchived: false } });
    return { staff, shares, enabled: policy?.enabled ?? false, warning: shares.length ? validateTurnStaff(shares, staff) : null, eligible: items.filter(item => isAssignableTurn(item)).length };
  });
  app.put("/automations/turn-assignment/:propertyId", async (request, reply) => {
    const propertyId = await context(request, reply);
    if (!propertyId) return;
    const input = z.object({ enabled: z.boolean(), shares: turnSharesSchema }).parse(request.body);
    const shares = [...input.shares].sort((a, b) => a.userId.localeCompare(b.userId));
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${propertyId}), 824017)::text`;
      const warning = validateTurnStaff(shares, await turnAssignmentStaff(tx, propertyId));
      if (input.enabled && warning) throw Object.assign(new Error(warning), { statusCode: 409 });
      const existing = await tx.turnAssignmentPolicy.findUnique({ where: { propertyId } });
      const unchanged = existing && JSON.stringify(existing.shares) === JSON.stringify(shares);
      await tx.turnAssignmentPolicy.upsert({ where: { propertyId }, create: { propertyId, enabled: input.enabled, shares, credits: {} }, update: { enabled: input.enabled, shares, ...(unchanged ? {} : { credits: {} }) } });
      await tx.auditLog.create({ data: { actorUserId: request.currentUser!.id, propertyId, entityType: "PROPERTY", entityId: propertyId, action: "TURN_ASSIGNMENT_CONFIGURED", message: input.enabled ? "Enabled property percentage turn assignment" : "Paused property percentage turn assignment", metadata: { shares, enabled: input.enabled } } });
    });
    return { saved: true };
  });
  app.post("/automations/turn-assignment/:propertyId/run", async (request, reply) => {
    const propertyId = await context(request, reply);
    if (!propertyId) return;
    return runTurnAssignments(propertyId);
  });
}
