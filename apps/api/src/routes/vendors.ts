import { UserRole } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { scopedAllowedPropertyIds } from "../lib/auth.js";
import { writeAuditLog } from "../lib/audit.js";
import { createNotification, notifyAssignedStaff } from "../lib/notifications.js";
import { prisma } from "../lib/prisma.js";
import { evaluateAndPersistItemRisk } from "../lib/risk.js";

const vendorStatuses = ["REQUESTED", "SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELED", "FOLLOW_UP_NEEDED"] as const;

const vendorQuerySchema = z.object({
  includeArchived: z.enum(["true", "false"]).optional().transform((value) => value === "true"),
  propertyId: z.string().optional(),
  trade: z.string().optional(),
  q: z.string().optional(),
});

const vendorSchema = z.object({
  name: z.string().trim().min(2).max(160),
  trade: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().email().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  isPreferred: z.boolean().optional().default(false),
  insuranceExpiresAt: z.string().nullable().optional(),
  licenseExpiresAt: z.string().nullable().optional(),
  propertyIds: z.array(z.string()).max(100).optional().default([]),
});

const vendorPatchSchema = vendorSchema.partial().extend({
  isActive: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: "Provide vendor fields to update" });

const assignmentQuerySchema = z.object({
  itemId: z.string().optional(),
  propertyId: z.string().optional(),
  vendorId: z.string().optional(),
  status: z.enum(vendorStatuses).optional(),
  includeCompleted: z.enum(["true", "false"]).optional().transform((value) => value === "true"),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const assignmentSchema = z.object({
  vendorId: z.string(),
  itemId: z.string(),
  trade: z.string().trim().min(2).max(80),
  status: z.enum(vendorStatuses).optional().default("REQUESTED"),
  scheduledDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  costEstimate: z.number().nonnegative().max(1000000).nullable().optional(),
  invoiceRef: z.string().trim().max(120).nullable().optional(),
});

const assignmentPatchSchema = assignmentSchema.omit({ vendorId: true, itemId: true }).partial().extend({
  vendorId: z.string().optional(),
  completedAt: z.string().nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: "Provide assignment fields to update" });

function dateValue(value: string | null | undefined) {
  return value ? new Date(value) : null;
}

function mayManage(userRole: UserRole) {
  return userRole === "ADMIN" || userRole === "MANAGER";
}

function mayUpdateAssignment(userRole: UserRole) {
  return userRole === "ADMIN" || userRole === "MANAGER" || userRole === "TECH";
}

function propertyScope(request: FastifyRequest, propertyId?: string) {
  const allowed = scopedAllowedPropertyIds(request);
  if (propertyId && allowed !== null && !allowed.includes(propertyId)) return { denied: true as const, where: undefined };
  return { denied: false as const, where: propertyId ?? (allowed === null ? undefined : { in: allowed }) };
}

async function assertVendorScope(request: FastifyRequest, reply: FastifyReply, propertyIds: string[]) {
  const allowed = scopedAllowedPropertyIds(request);
  if (allowed !== null && propertyIds.some((propertyId) => !allowed.includes(propertyId))) {
    reply.code(403).send({ message: "Property access denied" });
    return false;
  }
  return true;
}

async function assignmentById(id: string) {
  return prisma.vendorAssignment.findUnique({
    where: { id },
    include: { vendor: true, item: true, property: true },
  });
}

async function notifyVendorAssignment(input: {
  assignmentId: string;
  itemId: string;
  propertyId: string;
  unitNumber: string;
  assignedTech: string | null;
  status: string;
  message: string;
}) {
  await notifyAssignedStaff({
    assignedTech: input.assignedTech,
    propertyId: input.propertyId,
    itemId: input.itemId,
    category: "VENDOR",
    title: `Vendor work ${input.status.toLowerCase().replace(/_/g, " ")}`,
    message: `${input.unitNumber}: ${input.message}`,
    dedupeKey: `vendor:${input.assignmentId}:${input.status}`,
  });
  const managers = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [{ role: "ADMIN" }, { propertyAccess: { some: { propertyId: input.propertyId, role: "MANAGER" } } }],
    },
    select: { id: true },
  });
  await Promise.all(managers.map((manager) => createNotification({
    userId: manager.id,
    propertyId: input.propertyId,
    itemId: input.itemId,
    category: "VENDOR",
    title: `Vendor work ${input.status.toLowerCase().replace(/_/g, " ")}`,
    message: `${input.unitNumber}: ${input.message}`,
    dedupeKey: `vendor:${input.assignmentId}:${input.status}:${manager.id}`,
  })));
}

export async function vendorRoutes(app: FastifyInstance) {
  app.get("/vendors", async (request, reply) => {
    const query = vendorQuerySchema.parse(request.query);
    const scope = propertyScope(request, query.propertyId);
    if (scope.denied) return reply.code(403).send({ message: "Property access denied" });
    const vendors = await prisma.vendor.findMany({
      where: {
        isActive: query.includeArchived ? undefined : true,
        trade: query.trade ? { equals: query.trade, mode: "insensitive" } : undefined,
        OR: query.q ? [
          { name: { contains: query.q, mode: "insensitive" } },
          { trade: { contains: query.q, mode: "insensitive" } },
          { email: { contains: query.q, mode: "insensitive" } },
        ] : undefined,
        serviceAreas: query.propertyId ? { some: { propertyId: query.propertyId } } : undefined,
      },
      include: { serviceAreas: { include: { property: true } }, contacts: true, _count: { select: { assignments: true } } },
      orderBy: [{ isPreferred: "desc" }, { trade: "asc" }, { name: "asc" }],
    });
    const allowed = scopedAllowedPropertyIds(request);
    return {
      vendors: allowed === null ? vendors : vendors.filter((vendor) => vendor.serviceAreas.length === 0 || vendor.serviceAreas.some((area) => allowed.includes(area.propertyId))),
    };
  });

  app.post("/vendors", async (request, reply) => {
    if (!mayManage(request.currentUser!.role)) return reply.code(403).send({ message: "Manager or admin access required" });
    const payload = vendorSchema.parse(request.body);
    if (!(await assertVendorScope(request, reply, payload.propertyIds))) return;
    const vendor = await prisma.vendor.create({
      data: {
        name: payload.name,
        trade: payload.trade,
        phone: payload.phone ?? null,
        email: payload.email ?? null,
        notes: payload.notes ?? null,
        isPreferred: payload.isPreferred,
        insuranceExpiresAt: dateValue(payload.insuranceExpiresAt),
        licenseExpiresAt: dateValue(payload.licenseExpiresAt),
        serviceAreas: { create: payload.propertyIds.map((propertyId) => ({ propertyId })) },
      },
      include: { serviceAreas: { include: { property: true } }, contacts: true, _count: { select: { assignments: true } } },
    });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, entityType: "VENDOR", entityId: vendor.id, action: "VENDOR_CREATED", message: `Created vendor ${vendor.name}`, metadata: { trade: vendor.trade } });
    reply.code(201);
    return { vendor };
  });

  app.patch("/vendors/:id", async (request, reply) => {
    if (!mayManage(request.currentUser!.role)) return reply.code(403).send({ message: "Manager or admin access required" });
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const payload = vendorPatchSchema.parse(request.body);
    const existing = await prisma.vendor.findUnique({ where: { id }, include: { serviceAreas: true } });
    if (!existing) return reply.code(404).send({ message: "Vendor not found" });
    if (payload.propertyIds && !(await assertVendorScope(request, reply, payload.propertyIds))) return;
    const vendor = await prisma.vendor.update({
      where: { id },
      data: {
        name: payload.name,
        trade: payload.trade,
        phone: payload.phone,
        email: payload.email,
        notes: payload.notes,
        isPreferred: payload.isPreferred,
        isActive: payload.isActive,
        insuranceExpiresAt: payload.insuranceExpiresAt === undefined ? undefined : dateValue(payload.insuranceExpiresAt),
        licenseExpiresAt: payload.licenseExpiresAt === undefined ? undefined : dateValue(payload.licenseExpiresAt),
        serviceAreas: payload.propertyIds ? {
          deleteMany: {},
          create: payload.propertyIds.map((propertyId) => ({ propertyId })),
        } : undefined,
      },
      include: { serviceAreas: { include: { property: true } }, contacts: true, _count: { select: { assignments: true } } },
    });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, entityType: "VENDOR", entityId: vendor.id, action: "VENDOR_UPDATED", message: `Updated vendor ${vendor.name}` });
    return { vendor };
  });

  app.post("/vendors/:id/archive", async (request, reply) => {
    if (!mayManage(request.currentUser!.role)) return reply.code(403).send({ message: "Manager or admin access required" });
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const vendor = await prisma.vendor.update({ where: { id }, data: { isActive: false }, include: { serviceAreas: { include: { property: true } }, contacts: true, _count: { select: { assignments: true } } } });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, entityType: "VENDOR", entityId: vendor.id, action: "VENDOR_ARCHIVED", message: `Archived vendor ${vendor.name}` });
    return { vendor };
  });

  app.post("/vendors/:id/restore", async (request, reply) => {
    if (!mayManage(request.currentUser!.role)) return reply.code(403).send({ message: "Manager or admin access required" });
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const vendor = await prisma.vendor.update({ where: { id }, data: { isActive: true }, include: { serviceAreas: { include: { property: true } }, contacts: true, _count: { select: { assignments: true } } } });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, entityType: "VENDOR", entityId: vendor.id, action: "VENDOR_RESTORED", message: `Restored vendor ${vendor.name}` });
    return { vendor };
  });

  app.get("/vendor-assignments", async (request, reply) => {
    const query = assignmentQuerySchema.parse(request.query);
    const scope = propertyScope(request, query.propertyId);
    if (scope.denied) return reply.code(403).send({ message: "Property access denied" });
    const where = {
      propertyId: scope.where,
      itemId: query.itemId,
      vendorId: query.vendorId,
      status: query.status ?? (query.includeCompleted ? undefined : { notIn: ["COMPLETED", "CANCELED"] }),
    };
    const [assignments, total] = await Promise.all([
      prisma.vendorAssignment.findMany({
        where,
        include: { vendor: true, property: true, item: { select: { id: true, unitNumber: true, assignedTech: true, moveInDate: true } } },
        orderBy: [{ dueDate: "asc" }, { scheduledDate: "asc" }, { createdAt: "desc" }],
        skip: query.offset,
        take: query.limit,
      }),
      prisma.vendorAssignment.count({ where }),
    ]);
    return { assignments, pagination: { total, limit: query.limit, offset: query.offset, hasMore: query.offset + assignments.length < total } };
  });

  app.post("/vendor-assignments", async (request, reply) => {
    if (!mayManage(request.currentUser!.role)) return reply.code(403).send({ message: "Manager or admin access required" });
    const payload = assignmentSchema.parse(request.body);
    const item = await prisma.makeReadyItem.findUnique({ where: { id: payload.itemId } });
    if (!item) return reply.code(404).send({ message: "Make-ready item not found" });
    if (!(await assertVendorScope(request, reply, [item.propertyId]))) return;
    const vendor = await prisma.vendor.findUnique({ where: { id: payload.vendorId }, include: { serviceAreas: true } });
    if (!vendor || !vendor.isActive) return reply.code(400).send({ message: "Select an active vendor" });
    if (vendor.serviceAreas.length > 0 && !vendor.serviceAreas.some((area) => area.propertyId === item.propertyId)) {
      return reply.code(400).send({ message: "Vendor is not configured for this property" });
    }
    const assignment = await prisma.vendorAssignment.create({
      data: {
        vendorId: vendor.id,
        propertyId: item.propertyId,
        itemId: item.id,
        trade: payload.trade,
        status: payload.status,
        scheduledDate: dateValue(payload.scheduledDate),
        dueDate: dateValue(payload.dueDate),
        completedAt: payload.status === "COMPLETED" ? new Date() : null,
        notes: payload.notes ?? null,
        costEstimate: payload.costEstimate ?? null,
        invoiceRef: payload.invoiceRef ?? null,
      },
      include: { vendor: true, property: true, item: { select: { id: true, unitNumber: true, assignedTech: true, moveInDate: true } } },
    });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, propertyId: item.propertyId, entityType: "VENDOR_ASSIGNMENT", entityId: assignment.id, action: "VENDOR_ASSIGNMENT_CREATED", message: `Assigned ${vendor.name} to ${item.unitNumber}` });
    await notifyVendorAssignment({ assignmentId: assignment.id, itemId: item.id, propertyId: item.propertyId, unitNumber: item.unitNumber, assignedTech: item.assignedTech, status: assignment.status, message: `${vendor.name} ${assignment.trade} work was added.` });
    await evaluateAndPersistItemRisk(item.id, { notify: true });
    reply.code(201);
    return { assignment };
  });

  app.patch("/vendor-assignments/:id", async (request, reply) => {
    if (!mayUpdateAssignment(request.currentUser!.role)) return reply.code(403).send({ message: "This role cannot update vendor work" });
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const payload = assignmentPatchSchema.parse(request.body);
    const existing = await assignmentById(id);
    if (!existing) return reply.code(404).send({ message: "Vendor assignment not found" });
    if (!(await assertVendorScope(request, reply, [existing.propertyId]))) return;
    const status = payload.status;
    const assignment = await prisma.vendorAssignment.update({
      where: { id },
      data: {
        vendorId: payload.vendorId,
        trade: payload.trade,
        status,
        scheduledDate: payload.scheduledDate === undefined ? undefined : dateValue(payload.scheduledDate),
        dueDate: payload.dueDate === undefined ? undefined : dateValue(payload.dueDate),
        completedAt: status === "COMPLETED" ? new Date() : payload.completedAt === undefined ? undefined : dateValue(payload.completedAt),
        notes: payload.notes,
        costEstimate: payload.costEstimate,
        invoiceRef: payload.invoiceRef,
      },
      include: { vendor: true, property: true, item: { select: { id: true, unitNumber: true, assignedTech: true, moveInDate: true } } },
    });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, propertyId: assignment.propertyId, entityType: "VENDOR_ASSIGNMENT", entityId: assignment.id, action: "VENDOR_ASSIGNMENT_UPDATED", message: `Updated vendor work for ${assignment.item.unitNumber}`, metadata: { status: assignment.status } });
    await notifyVendorAssignment({ assignmentId: assignment.id, itemId: assignment.itemId, propertyId: assignment.propertyId, unitNumber: assignment.item.unitNumber, assignedTech: assignment.item.assignedTech, status: assignment.status, message: `${assignment.vendor.name} ${assignment.trade} work is ${assignment.status.toLowerCase().replace(/_/g, " ")}.` });
    await evaluateAndPersistItemRisk(assignment.itemId, { notify: true });
    return { assignment };
  });

  app.post("/vendor-assignments/:id/complete", async (request, reply) => {
    if (!mayUpdateAssignment(request.currentUser!.role)) return reply.code(403).send({ message: "This role cannot update vendor work" });
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await assignmentById(id);
    if (!existing) return reply.code(404).send({ message: "Vendor assignment not found" });
    if (!(await assertVendorScope(request, reply, [existing.propertyId]))) return;
    const assignment = await prisma.vendorAssignment.update({
      where: { id },
      data: { status: "COMPLETED", completedAt: new Date() },
      include: { vendor: true, property: true, item: { select: { id: true, unitNumber: true, assignedTech: true, moveInDate: true } } },
    });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, propertyId: assignment.propertyId, entityType: "VENDOR_ASSIGNMENT", entityId: assignment.id, action: "VENDOR_ASSIGNMENT_COMPLETED", message: `Completed vendor work for ${assignment.item.unitNumber}` });
    await notifyVendorAssignment({ assignmentId: assignment.id, itemId: assignment.itemId, propertyId: assignment.propertyId, unitNumber: assignment.item.unitNumber, assignedTech: assignment.item.assignedTech, status: assignment.status, message: `${assignment.vendor.name} ${assignment.trade} work was completed.` });
    await evaluateAndPersistItemRisk(assignment.itemId, { notify: true });
    return { assignment };
  });

  app.post("/vendor-assignments/:id/cancel", async (request, reply) => {
    if (!mayManage(request.currentUser!.role)) return reply.code(403).send({ message: "Manager or admin access required" });
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await assignmentById(id);
    if (!existing) return reply.code(404).send({ message: "Vendor assignment not found" });
    if (!(await assertVendorScope(request, reply, [existing.propertyId]))) return;
    const assignment = await prisma.vendorAssignment.update({
      where: { id },
      data: { status: "CANCELED" },
      include: { vendor: true, property: true, item: { select: { id: true, unitNumber: true, assignedTech: true, moveInDate: true } } },
    });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, propertyId: assignment.propertyId, entityType: "VENDOR_ASSIGNMENT", entityId: assignment.id, action: "VENDOR_ASSIGNMENT_CANCELED", message: `Canceled vendor work for ${assignment.item.unitNumber}` });
    await evaluateAndPersistItemRisk(assignment.itemId, { notify: true });
    return { assignment };
  });
}
