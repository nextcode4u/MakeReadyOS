import { UserRole } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireManagerOrAdmin, scopedAllowedPropertyIds } from "../lib/auth.js";
import { writeAuditLog } from "../lib/audit.js";
import { createNotification } from "../lib/notifications.js";
import { activePlanningStatuses, defaultPlanningWindow, planningStaffRoles, planningSummary, startOfDay } from "../lib/planning.js";
import { prisma } from "../lib/prisma.js";
import { evaluateAndPersistItemRisk } from "../lib/risk.js";

export const planningQuerySchema = z.object({
  propertyId: z.string().optional(),
  assignedUserId: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const planningBlockSchema = z.object({
  assignedUserId: z.string(),
  itemId: z.string(),
  category: z.string().trim().min(1).max(80),
  plannedDate: z.coerce.date(),
  estimatedHours: z.coerce.number().positive().max(24),
  actualHours: z.coerce.number().min(0).max(24).nullable().optional(),
  status: z.enum(["PLANNED", "IN_PROGRESS", "DONE", "CANCELED"]).optional().default("PLANNED"),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const planningPatchBlockSchema = planningBlockSchema.partial();
export const planningCapacitySchema = z.object({
  defaultDailyHours: z.coerce.number().positive().max(24),
  tradeCategories: z.array(z.string().trim().min(1).max(80)).max(20).optional().default([]),
  unavailableDays: z.array(z.string()).max(200).optional().default([]),
});

function canManagePlanning(role: UserRole) {
  return role === UserRole.ADMIN || role === UserRole.MANAGER;
}

async function staffFor(id: string) {
  return prisma.user.findFirst({
    where: { id, isActive: true, role: { in: [...planningStaffRoles] } },
    include: { propertyAccess: true, capacity: true },
  });
}

async function ensureScopedItem(itemId: string, propertyIds: string[] | null) {
  const item = await prisma.makeReadyItem.findUnique({ where: { id: itemId }, include: { property: true } });
  if (!item) return { item: null, error: "Make-ready item not found", status: 404 };
  if (propertyIds !== null && !propertyIds.includes(item.propertyId)) return { item: null, error: "Property access denied", status: 403 };
  return { item, error: null, status: 200 };
}

export async function planningRoutes(app: FastifyInstance) {
  app.get("/planning", async (request, reply) => {
    const query = planningQuerySchema.parse(request.query);
    const scoped = scopedAllowedPropertyIds(request);
    if (query.propertyId && scoped !== null && !scoped.includes(query.propertyId)) return reply.code(403).send({ message: "Property access denied" });
    const window = { ...defaultPlanningWindow(), from: query.from ?? defaultPlanningWindow().from, to: query.to ?? defaultPlanningWindow().to };
    const propertyId = query.propertyId ?? (scoped === null ? undefined : { in: scoped });
    const blockWhere = {
      propertyId,
      assignedUserId: query.assignedUserId,
      plannedDate: { gte: startOfDay(window.from), lt: window.to },
      status: { in: [...activePlanningStatuses, "DONE"] },
    };
    const itemWhere = {
      propertyId,
      isArchived: false,
      property: { isActive: true },
    };
    const [summary, staff, capacities] = await Promise.all([
      planningSummary(blockWhere, itemWhere, query.propertyId ?? (scoped === null ? undefined : { in: scoped })),
      prisma.user.findMany({
        where: { isActive: true, role: { in: [...planningStaffRoles] } },
        select: { id: true, fullName: true, role: true, propertyAccess: true, capacity: true },
        orderBy: { fullName: "asc" },
      }),
      prisma.userCapacity.findMany({ include: { user: { select: { id: true, fullName: true, role: true } } } }),
    ]);
    const visibleStaff = scoped === null ? staff : staff.filter((user) => user.role === UserRole.ADMIN || user.propertyAccess.some((access) => scoped.includes(access.propertyId)));
    return {
      window: { from: window.from.toISOString(), to: window.to.toISOString() },
      staff: visibleStaff.map((user) => ({ id: user.id, fullName: user.fullName, role: user.role, capacity: user.capacity })),
      capacities,
      ...summary,
    };
  });

  app.post("/planning/blocks", { preHandler: requireManagerOrAdmin }, async (request, reply) => {
    const input = planningBlockSchema.parse(request.body);
    const scoped = scopedAllowedPropertyIds(request);
    const { item, error, status } = await ensureScopedItem(input.itemId, scoped);
    if (!item) return reply.code(status).send({ message: error });
    const staff = await staffFor(input.assignedUserId);
    if (!staff) return reply.code(400).send({ message: "Select an active planning staff user" });
    if (scoped !== null && staff.role !== UserRole.ADMIN && !staff.propertyAccess.some((access) => access.propertyId === item.propertyId)) {
      return reply.code(403).send({ message: "Assigned user does not have access to this property" });
    }
    const block = await prisma.workAssignmentBlock.create({
      data: {
        assignedUserId: input.assignedUserId,
        propertyId: item.propertyId,
        itemId: item.id,
        category: input.category,
        plannedDate: input.plannedDate,
        estimatedHours: input.estimatedHours,
        actualHours: input.actualHours ?? null,
        status: input.status,
        notes: input.notes ?? null,
      },
      include: { assignedUser: { select: { id: true, fullName: true, role: true } }, property: true, item: true },
    });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, propertyId: item.propertyId, entityType: "WORK_ASSIGNMENT_BLOCK", entityId: block.id, action: "WORK_BLOCK_CREATED", message: `Planned ${input.estimatedHours}h of ${input.category} work for ${item.unitNumber}` });
    await createNotification({
      userId: input.assignedUserId,
      propertyId: item.propertyId,
      itemId: item.id,
      category: "PLANNING",
      title: "Planned work assigned",
      message: `${item.unitNumber}: ${input.category} planned for ${input.plannedDate.toISOString().slice(0, 10)}.`,
      dedupeKey: `planning:${block.id}:assigned`,
    });
    await evaluateAndPersistItemRisk(item.id, { notify: true });
    reply.code(201);
    return { block };
  });

  app.patch("/planning/blocks/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.workAssignmentBlock.findUnique({ where: { id }, include: { item: true } });
    if (!existing) return reply.code(404).send({ message: "Planning block not found" });
    const user = request.currentUser!;
    const scoped = scopedAllowedPropertyIds(request);
    if (scoped !== null && !scoped.includes(existing.propertyId)) return reply.code(403).send({ message: "Property access denied" });
    if (!canManagePlanning(user.role) && existing.assignedUserId !== user.id) return reply.code(403).send({ message: "Only managers or the assigned user can update this work block" });
    const input = planningPatchBlockSchema.parse(request.body);
    if ((input.assignedUserId || input.itemId || input.estimatedHours || input.plannedDate || input.category) && !canManagePlanning(user.role)) {
      return reply.code(403).send({ message: "Only managers can replan work blocks" });
    }
    const targetItem = input.itemId ? (await ensureScopedItem(input.itemId, scoped)).item : existing.item;
    if (!targetItem) return reply.code(404).send({ message: "Make-ready item not found" });
    const targetUser = input.assignedUserId ? await staffFor(input.assignedUserId) : null;
    if (input.assignedUserId && !targetUser) return reply.code(400).send({ message: "Select an active planning staff user" });
    if (input.assignedUserId && targetUser && scoped !== null && targetUser.role !== UserRole.ADMIN && !targetUser.propertyAccess.some((access) => access.propertyId === targetItem.propertyId)) {
      return reply.code(403).send({ message: "Assigned user does not have access to this property" });
    }
    const block = await prisma.workAssignmentBlock.update({
      where: { id },
      data: {
        assignedUserId: input.assignedUserId,
        itemId: input.itemId,
        propertyId: targetItem.propertyId,
        category: input.category,
        plannedDate: input.plannedDate,
        estimatedHours: input.estimatedHours,
        actualHours: input.actualHours,
        status: input.status,
        notes: input.notes,
      },
      include: { assignedUser: { select: { id: true, fullName: true, role: true } }, property: true, item: true },
    });
    await writeAuditLog({ request, actorUserId: user.id, propertyId: block.propertyId, entityType: "WORK_ASSIGNMENT_BLOCK", entityId: block.id, action: "WORK_BLOCK_UPDATED", message: `Updated planned work for ${block.item.unitNumber}` });
    if (input.plannedDate || input.assignedUserId) {
      await createNotification({
        userId: block.assignedUserId,
        propertyId: block.propertyId,
        itemId: block.itemId,
        category: "PLANNING",
        title: "Planned work changed",
        message: `${block.item.unitNumber}: ${block.category} is now planned for ${block.plannedDate.toISOString().slice(0, 10)}.`,
      });
    }
    await evaluateAndPersistItemRisk(block.itemId, { notify: true });
    return { block };
  });

  app.get("/planning/capacities", async () => {
    const users = await prisma.user.findMany({
      where: { isActive: true, role: { in: [...planningStaffRoles] } },
      include: { capacity: true },
      orderBy: { fullName: "asc" },
    });
    return { users };
  });

  app.put("/planning/capacities/:userId", { preHandler: requireManagerOrAdmin }, async (request) => {
    const { userId } = z.object({ userId: z.string() }).parse(request.params);
    const input = planningCapacitySchema.parse(request.body);
    const capacity = await prisma.userCapacity.upsert({
      where: { userId },
      create: { userId, defaultDailyHours: input.defaultDailyHours, tradeCategories: input.tradeCategories, unavailableDays: input.unavailableDays },
      update: { defaultDailyHours: input.defaultDailyHours, tradeCategories: input.tradeCategories, unavailableDays: input.unavailableDays },
    });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, entityType: "USER_CAPACITY", entityId: capacity.id, action: "USER_CAPACITY_UPDATED", message: "Updated planning capacity" });
    return { capacity };
  });
}
