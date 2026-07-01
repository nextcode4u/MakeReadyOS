import { stringify } from "csv-stringify/sync";
import { UserRole } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { scopedAllowedPropertyIds } from "../lib/auth.js";
import { writeAuditLog } from "../lib/audit.js";
import { createNotification } from "../lib/notifications.js";
import { renderPdfFromHtml } from "../lib/pdf.js";
import { prisma } from "../lib/prisma.js";

const cylinderCategories = ["VIRGIN", "CLEAN_RECOVERY", "DIRTY_RECOVERY"] as const;
const cylinderStatuses = ["ACTIVE", "EMPTY_PENDING_RECOVERY", "ARCHIVED"] as const;
const transactionTypes = ["VIRGIN_CHARGE", "CLEAN_RECOVERY", "DIRTY_RECOVERY", "FINAL_RECOVERY"] as const;

export const refrigerantTypeSchema = z.object({
  name: z.string().trim().min(2).max(40),
  notes: z.string().trim().max(1000).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const refrigerantCylinderSchema = z.object({
  identifier: z.string().trim().min(1).max(120),
  refrigerantTypeId: z.string(),
  category: z.enum(cylinderCategories),
  tankSize: z.coerce.number().positive().max(10000),
  currentWeight: z.coerce.number().min(0).max(10000),
  status: z.enum(cylinderStatuses).optional().default("ACTIVE"),
  notes: z.string().trim().max(2000).nullable().optional(),
  dispositionNotes: z.string().trim().max(2000).nullable().optional(),
  overrideActiveVirgin: z.boolean().optional().default(false),
});

export const refrigerantCylinderPatchSchema = refrigerantCylinderSchema.partial().extend({
  finalRecoveryCompleted: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: "Provide cylinder fields to update" });

export const refrigerantTransactionSchema = z.object({
  propertyId: z.string().optional(),
  unitId: z.string().optional(),
  unitNumber: z.string().trim().max(80).optional(),
  refrigerantTypeId: z.string(),
  sourceCylinderId: z.string().optional(),
  recoveryCylinderId: z.string().optional(),
  startWeight: z.coerce.number().min(0).max(10000),
  endWeight: z.coerce.number().min(0).max(10000),
  occurredAt: z.coerce.date().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const refrigerantHistoryQuerySchema = z.object({
  propertyId: z.string().optional(),
  unitId: z.string().optional(),
  unitNumber: z.string().optional(),
  refrigerantTypeId: z.string().optional(),
  transactionType: z.enum(transactionTypes).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export const refrigerantLeakFlagDismissSchema = z.object({
  notes: z.string().trim().min(1).max(1000),
});

function accessFor(role: UserRole) {
  if (role === UserRole.ADMIN) return { view: true, edit: true, admin: true };
  if (role === UserRole.MANAGER || role === UserRole.TECH) return { view: true, edit: true, admin: false };
  if (role === UserRole.VIEWER) return { view: true, edit: false, admin: false };
  return { view: false, edit: false, admin: false };
}

function requireRefrigerantAccess(request: FastifyRequest, reply: FastifyReply, level: "view" | "edit" | "admin") {
  const access = accessFor(request.currentUser!.role);
  if (!access[level]) {
    reply.code(level === "view" ? 403 : 403).send({ message: "Refrigerant access required" });
    return false;
  }
  return true;
}

function scopedPropertyWhere(request: FastifyRequest, propertyId?: string) {
  const allowed = scopedAllowedPropertyIds(request);
  if (propertyId && allowed !== null && !allowed.includes(propertyId)) return { denied: true as const, where: undefined };
  return { denied: false as const, where: propertyId ?? (allowed === null ? undefined : { in: allowed }) };
}

async function assertPropertyScope(request: FastifyRequest, reply: FastifyReply, propertyId?: string | null) {
  if (!propertyId) return true;
  const allowed = scopedAllowedPropertyIds(request);
  if (allowed !== null && !allowed.includes(propertyId)) {
    reply.code(403).send({ message: "Property access denied" });
    return false;
  }
  return true;
}

function fillPercent(tankSize: number, currentWeight: number) {
  if (!tankSize) return 0;
  return Math.max(0, Math.round((currentWeight / tankSize) * 100));
}

function weightAmount(type: (typeof transactionTypes)[number], startWeight: number, endWeight: number) {
  if (type === "CLEAN_RECOVERY" || type === "DIRTY_RECOVERY") return endWeight - startWeight;
  return startWeight - endWeight;
}

function leakLevel(count90: number, count365: number) {
  if (count365 >= 3) return "MANAGER_REVIEW_REQUIRED";
  if (count90 >= 2) return "POTENTIAL_REFRIGERANT_LEAK";
  return null;
}

function htmlEscape(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

async function refrigerantExportRows(report: "usage" | "recovery" | "cylinders" | "compliance" | "unitHistory" | "fullAudit", propertyIds: string[] | null) {
  let rows: Array<Record<string, unknown>> = [];
  if (report === "cylinders") {
    const tanks = await prisma.refrigerantCylinder.findMany({ include: { refrigerantType: true }, orderBy: { identifier: "asc" } });
    rows = tanks.map((tank) => ({
      identifier: tank.identifier,
      type: tank.refrigerantType.name,
      category: tank.category,
      status: tank.status,
      tankSize: tank.tankSize,
      currentWeight: tank.currentWeight,
      fillPercent: fillPercent(tank.tankSize, tank.currentWeight),
      finalRecoveryCompleted: tank.finalRecoveryCompleted,
      notes: tank.notes ?? "",
    }));
  } else if (report === "compliance") {
    const result = await complianceIssues(propertyIds);
    rows = result.issues.map((issue) => ({ severity: issue.severity, type: issue.type, message: issue.message }));
  } else {
    const txWhere = {
      propertyId: propertyIds === null ? undefined : { in: propertyIds },
      transactionType: report === "usage" ? "VIRGIN_CHARGE" : report === "recovery" ? { in: ["CLEAN_RECOVERY", "DIRTY_RECOVERY", "FINAL_RECOVERY"] } : undefined,
    };
    const transactions = await prisma.refrigerantTransaction.findMany({
      where: txWhere,
      include: { refrigerantType: true, sourceCylinder: true, recoveryCylinder: true },
      orderBy: { occurredAt: "desc" },
    });
    rows = transactions.map((entry) => ({
      date: entry.occurredAt.toISOString(),
      property: entry.propertyId ?? "",
      transactionType: entry.transactionType,
      unitNumber: entry.unitNumber ?? "",
      refrigerantType: entry.refrigerantType.name,
      sourceCylinder: entry.sourceCylinder?.identifier ?? "",
      recoveryCylinder: entry.recoveryCylinder?.identifier ?? "",
      startWeight: entry.startWeight,
      endWeight: entry.endWeight,
      amount: entry.amount,
      user: entry.createdByName ?? "",
      notes: entry.notes ?? "",
    }));
  }
  return rows;
}

async function evaluateLeakFlag(input: {
  propertyId?: string | null;
  unitId?: string | null;
  unitNumber?: string | null;
  refrigerantTypeId: string;
}) {
  if (!input.unitNumber && !input.unitId) return null;
  const now = new Date();
  const since90 = new Date(now);
  since90.setDate(since90.getDate() - 90);
  const since365 = new Date(now);
  since365.setDate(since365.getDate() - 365);
  const baseWhere = {
    transactionType: "VIRGIN_CHARGE",
    refrigerantTypeId: input.refrigerantTypeId,
    propertyId: input.propertyId ?? undefined,
    OR: [
      input.unitId ? { unitId: input.unitId } : undefined,
      input.unitNumber ? { unitNumber: input.unitNumber } : undefined,
    ].filter(Boolean) as Array<{ unitId?: string; unitNumber?: string }>,
  };
  const [count90, count365] = await Promise.all([
    prisma.refrigerantTransaction.count({ where: { ...baseWhere, occurredAt: { gte: since90 } } }),
    prisma.refrigerantTransaction.count({ where: { ...baseWhere, occurredAt: { gte: since365 } } }),
  ]);
  const level = leakLevel(count90, count365);
  if (!level) return null;
  const reason = level === "MANAGER_REVIEW_REQUIRED"
    ? `${count365} refrigerant additions in 12 months. Manager review required.`
    : `${count90} refrigerant additions in 90 days. Potential refrigerant leak.`;
  const existing = await prisma.refrigerantLeakFlag.findFirst({
    where: {
      propertyId: input.propertyId ?? null,
      unitId: input.unitId ?? null,
      unitNumber: input.unitNumber ?? "",
      refrigerantTypeId: input.refrigerantTypeId,
      status: "ACTIVE",
    },
  });
  const flag = existing
    ? await prisma.refrigerantLeakFlag.update({ where: { id: existing.id }, data: { level, reason, lastDetectedAt: now } })
    : await prisma.refrigerantLeakFlag.create({
        data: {
          propertyId: input.propertyId ?? null,
          unitId: input.unitId ?? null,
          unitNumber: input.unitNumber ?? "",
          refrigerantTypeId: input.refrigerantTypeId,
          level,
          reason,
        },
      });
  const managers = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { role: "ADMIN" },
        input.propertyId ? { propertyAccess: { some: { propertyId: input.propertyId, role: "MANAGER" } } } : { role: "MANAGER" },
      ],
    },
    select: { id: true },
  });
  await Promise.all(managers.map((manager) => createNotification({
    userId: manager.id,
    propertyId: input.propertyId ?? null,
    category: "AUTOMATION_WARNING",
    title: "Refrigerant leak review",
    message: `${input.unitNumber ?? "Unit"}: ${reason}`,
    dedupeKey: `refrigerant-leak:${flag.id}:${manager.id}:${level}`,
  })));
  return flag;
}

async function complianceIssues(propertyIds: string[] | null) {
  const [cylinders, transactions, leakFlags] = await Promise.all([
    prisma.refrigerantCylinder.findMany({ include: { refrigerantType: true } }),
    prisma.refrigerantTransaction.findMany({
      where: { propertyId: propertyIds === null ? undefined : { in: propertyIds } },
      include: { refrigerantType: true, sourceCylinder: true, recoveryCylinder: true },
      orderBy: { occurredAt: "desc" },
      take: 1000,
    }),
    prisma.refrigerantLeakFlag.findMany({
      where: { status: "ACTIVE", propertyId: propertyIds === null ? undefined : { in: propertyIds } },
      include: { refrigerantType: true },
      orderBy: { lastDetectedAt: "desc" },
    }),
  ]);
  const issues = [
    ...cylinders
      .filter((tank) => tank.category === "VIRGIN" && tank.status === "EMPTY_PENDING_RECOVERY" && !tank.finalRecoveryCompleted)
      .map((tank) => ({ severity: "HIGH", type: "VIRGIN_EMPTY_NOT_RECOVERED", message: `${tank.identifier} is empty pending final recovery.`, cylinderId: tank.id })),
    ...cylinders
      .filter((tank) => tank.category !== "VIRGIN" && tank.status !== "ARCHIVED" && fillPercent(tank.tankSize, tank.currentWeight) >= 80)
      .map((tank) => ({ severity: fillPercent(tank.tankSize, tank.currentWeight) >= 95 ? "CRITICAL" : fillPercent(tank.tankSize, tank.currentWeight) >= 90 ? "HIGH" : "MEDIUM", type: "RECOVERY_TANK_CAPACITY", message: `${tank.identifier} is ${fillPercent(tank.tankSize, tank.currentWeight)}% full.`, cylinderId: tank.id })),
    ...cylinders
      .filter((tank) => tank.category === "VIRGIN" && tank.status === "ARCHIVED" && !tank.finalRecoveryCompleted)
      .map((tank) => ({ severity: "CRITICAL", type: "ARCHIVED_WITHOUT_FINAL_RECOVERY", message: `${tank.identifier} is archived without final recovery.`, cylinderId: tank.id })),
    ...transactions
      .filter((entry) => !Number.isFinite(entry.startWeight) || !Number.isFinite(entry.endWeight) || entry.amount < 0)
      .map((entry) => ({ severity: "HIGH", type: "WEIGHT_ERROR", message: `${entry.transactionType} on ${entry.unitNumber ?? "unknown unit"} has invalid weights.`, transactionId: entry.id })),
    ...leakFlags.map((flag) => ({ severity: flag.level === "MANAGER_REVIEW_REQUIRED" ? "HIGH" : "MEDIUM", type: "REPEATED_ADDITIONS", message: `${flag.unitNumber}: ${flag.reason}`, leakFlagId: flag.id })),
  ];
  return { issues, cylinders, transactions, leakFlags };
}

export async function refrigerantRoutes(app: FastifyInstance) {
  app.get("/refrigerant/overview", async (request, reply) => {
    if (!requireRefrigerantAccess(request, reply, "view")) return;
    const propertyIds = scopedAllowedPropertyIds(request);
    const [{ issues, leakFlags }, types, cylinders, recent] = await Promise.all([
      complianceIssues(propertyIds),
      prisma.refrigerantType.findMany({ orderBy: { name: "asc" } }),
      prisma.refrigerantCylinder.findMany({ include: { refrigerantType: true }, orderBy: [{ category: "asc" }, { identifier: "asc" }] }),
      prisma.refrigerantTransaction.findMany({
        where: { propertyId: propertyIds === null ? undefined : { in: propertyIds } },
        include: { refrigerantType: true, sourceCylinder: true, recoveryCylinder: true },
        orderBy: { occurredAt: "desc" },
        take: 12,
      }),
    ]);
    const activeVirginByType = cylinders
      .filter((tank) => tank.category === "VIRGIN" && tank.status === "ACTIVE")
      .reduce<Record<string, number>>((acc, tank) => {
        acc[tank.refrigerantType.name] = (acc[tank.refrigerantType.name] ?? 0) + 1;
        return acc;
      }, {});
    const recoveryNearCapacity = cylinders
      .filter((tank) => tank.category !== "VIRGIN" && tank.status !== "ARCHIVED" && fillPercent(tank.tankSize, tank.currentWeight) >= 80)
      .map((tank) => ({ ...tank, fillPercent: fillPercent(tank.tankSize, tank.currentWeight) }));
    return {
      permissions: accessFor(request.currentUser!.role),
      types,
      summary: {
        activeVirginByType,
        recoveryNearCapacity: recoveryNearCapacity.length,
        repeatedAdditionFlags: leakFlags.length,
        complianceIssues: issues.length,
        recentActivity: recent.length,
      },
      recoveryNearCapacity,
      leakFlags,
      complianceIssues: issues.slice(0, 20),
      recent,
    };
  });

  app.get("/refrigerant/types", async (request, reply) => {
    if (!requireRefrigerantAccess(request, reply, "view")) return;
    return { types: await prisma.refrigerantType.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }] }) };
  });

  app.post("/refrigerant/types", async (request, reply) => {
    if (!requireRefrigerantAccess(request, reply, "admin")) return;
    const input = refrigerantTypeSchema.parse(request.body);
    const type = await prisma.refrigerantType.create({ data: { name: input.name, notes: input.notes ?? null, createdById: request.currentUser!.id, updatedById: request.currentUser!.id } });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, entityType: "REFRIGERANT_TYPE", entityId: type.id, action: "REFRIGERANT_TYPE_CREATED", message: `Created refrigerant type ${type.name}` });
    reply.code(201);
    return { type };
  });

  app.patch("/refrigerant/types/:id", async (request, reply) => {
    if (!requireRefrigerantAccess(request, reply, "admin")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = refrigerantTypeSchema.partial().parse(request.body);
    const type = await prisma.refrigerantType.update({ where: { id }, data: { name: input.name, notes: input.notes, isActive: input.isActive, updatedById: request.currentUser!.id } });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, entityType: "REFRIGERANT_TYPE", entityId: type.id, action: "REFRIGERANT_TYPE_UPDATED", message: `Updated refrigerant type ${type.name}` });
    return { type };
  });

  app.delete("/refrigerant/types/:id", async (request, reply) => {
    if (!requireRefrigerantAccess(request, reply, "admin")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.refrigerantType.findUnique({
      where: { id },
      include: {
        cylinders: { select: { id: true }, take: 1 },
        transactions: { select: { id: true }, take: 1 },
        leakFlags: { select: { id: true }, take: 1 },
      },
    });
    if (!existing) return reply.code(404).send({ message: "Refrigerant type not found" });
    if (existing.isActive) {
      return reply.code(409).send({ message: "Deactivate the refrigerant type before permanently deleting it" });
    }
    if (existing.cylinders.length || existing.transactions.length || existing.leakFlags.length) {
      return reply.code(409).send({ message: "Cannot permanently delete a refrigerant type that is already referenced by cylinders, history, or leak flags" });
    }
    await prisma.refrigerantType.delete({ where: { id } });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, entityType: "REFRIGERANT_TYPE", entityId: existing.id, action: "REFRIGERANT_TYPE_DELETED", message: `Deleted refrigerant type ${existing.name}` });
    return { ok: true };
  });

  app.get("/refrigerant/cylinders", async (request, reply) => {
    if (!requireRefrigerantAccess(request, reply, "view")) return;
    const query = z.object({
      category: z.enum(cylinderCategories).optional(),
      status: z.enum(cylinderStatuses).optional(),
      includeArchived: z.enum(["true", "false"]).optional().transform((value) => value === "true"),
    }).parse(request.query);
    const cylinders = await prisma.refrigerantCylinder.findMany({
      where: {
        category: query.category,
        status: query.status ?? (query.includeArchived ? undefined : { not: "ARCHIVED" }),
      },
      include: { refrigerantType: true },
      orderBy: [{ category: "asc" }, { status: "asc" }, { identifier: "asc" }],
    });
    return { cylinders: cylinders.map((tank) => ({ ...tank, fillPercent: fillPercent(tank.tankSize, tank.currentWeight) })) };
  });

  app.post("/refrigerant/cylinders", async (request, reply) => {
    if (!requireRefrigerantAccess(request, reply, "edit")) return;
    const input = refrigerantCylinderSchema.parse(request.body);
    if (input.category === "VIRGIN" && input.status === "ACTIVE" && input.overrideActiveVirgin && request.currentUser!.role !== "ADMIN" && request.currentUser!.role !== "MANAGER") {
      return reply.code(403).send({ message: "Only managers and admins can override the one-active-virgin-tank rule." });
    }
    if (input.category === "VIRGIN" && input.status === "ACTIVE" && !input.overrideActiveVirgin) {
      const existing = await prisma.refrigerantCylinder.findFirst({ where: { refrigerantTypeId: input.refrigerantTypeId, category: "VIRGIN", status: "ACTIVE" } });
      if (existing) return reply.code(409).send({ message: "An active virgin tank already exists for this refrigerant type. Manager/admin can override by confirming overrideActiveVirgin." });
    }
    const cylinder = await prisma.refrigerantCylinder.create({
      data: {
        identifier: input.identifier,
        refrigerantTypeId: input.refrigerantTypeId,
        category: input.category,
        tankSize: input.tankSize,
        currentWeight: input.currentWeight,
        status: input.status,
        notes: input.notes ?? null,
        dispositionNotes: input.dispositionNotes ?? null,
        createdById: request.currentUser!.id,
        updatedById: request.currentUser!.id,
      },
      include: { refrigerantType: true },
    });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, entityType: "REFRIGERANT_CYLINDER", entityId: cylinder.id, action: "REFRIGERANT_CYLINDER_CREATED", message: `Created ${cylinder.category.toLowerCase().replace("_", " ")} cylinder ${cylinder.identifier}` });
    reply.code(201);
    return { cylinder: { ...cylinder, fillPercent: fillPercent(cylinder.tankSize, cylinder.currentWeight) } };
  });

  app.patch("/refrigerant/cylinders/:id", async (request, reply) => {
    if (!requireRefrigerantAccess(request, reply, "edit")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = refrigerantCylinderPatchSchema.parse(request.body);
    const existing = await prisma.refrigerantCylinder.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ message: "Cylinder not found" });
    if (input.status === "ARCHIVED" && existing.category === "VIRGIN" && !existing.finalRecoveryCompleted && !input.finalRecoveryCompleted) {
      return reply.code(400).send({ message: "Virgin tank cannot be archived until final recovery is completed." });
    }
    const archivedAt = input.status === "ARCHIVED" && existing.status !== "ARCHIVED" ? new Date() : input.status && input.status !== "ARCHIVED" ? null : undefined;
    const cylinder = await prisma.refrigerantCylinder.update({
      where: { id },
      data: {
        identifier: input.identifier,
        refrigerantTypeId: input.refrigerantTypeId,
        category: input.category,
        tankSize: input.tankSize,
        currentWeight: input.currentWeight,
        status: input.status,
        notes: input.notes,
        dispositionNotes: input.dispositionNotes,
        finalRecoveryCompleted: input.finalRecoveryCompleted,
        archivedAt,
        updatedById: request.currentUser!.id,
      },
      include: { refrigerantType: true },
    });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, entityType: "REFRIGERANT_CYLINDER", entityId: cylinder.id, action: "REFRIGERANT_CYLINDER_UPDATED", message: `Updated cylinder ${cylinder.identifier}` });
    return { cylinder: { ...cylinder, fillPercent: fillPercent(cylinder.tankSize, cylinder.currentWeight) } };
  });

  app.delete("/refrigerant/cylinders/:id", async (request, reply) => {
    if (!requireRefrigerantAccess(request, reply, "edit")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.refrigerantCylinder.findUnique({
      where: { id },
      include: {
        sourceTransactions: { select: { id: true }, take: 1 },
        recoveryTransactions: { select: { id: true }, take: 1 },
      },
    });
    if (!existing) return reply.code(404).send({ message: "Cylinder not found" });
    if (existing.status !== "ARCHIVED") {
      return reply.code(409).send({ message: "Archive the cylinder before permanently deleting it" });
    }
    if (existing.sourceTransactions.length || existing.recoveryTransactions.length) {
      return reply.code(409).send({ message: "Cannot permanently delete a cylinder that is already referenced by refrigerant history" });
    }
    await prisma.refrigerantCylinder.delete({ where: { id } });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, entityType: "REFRIGERANT_CYLINDER", entityId: existing.id, action: "REFRIGERANT_CYLINDER_DELETED", message: `Deleted cylinder ${existing.identifier}` });
    return { ok: true };
  });

  async function createTransaction(request: FastifyRequest, reply: FastifyReply, transactionType: (typeof transactionTypes)[number]) {
    if (!requireRefrigerantAccess(request, reply, "edit")) return;
    const input = refrigerantTransactionSchema.parse(request.body);
    if (!(await assertPropertyScope(request, reply, input.propertyId))) return;
    const amount = weightAmount(transactionType, input.startWeight, input.endWeight);
    if (amount < 0) {
      return reply.code(400).send({ message: transactionType.includes("RECOVERY") ? "Recovery end weight must be greater than or equal to start weight." : "Charge/final recovery end weight must be less than or equal to start weight." });
    }
    if ((transactionType === "VIRGIN_CHARGE" || transactionType === "FINAL_RECOVERY") && !input.sourceCylinderId) {
      return reply.code(400).send({ message: "Select a source virgin tank." });
    }
    if ((transactionType === "CLEAN_RECOVERY" || transactionType === "DIRTY_RECOVERY" || transactionType === "FINAL_RECOVERY") && !input.recoveryCylinderId) {
      return reply.code(400).send({ message: "Select a recovery tank." });
    }
    const transaction = await prisma.$transaction(async (tx) => {
      if (input.sourceCylinderId) {
        await tx.refrigerantCylinder.update({
          where: { id: input.sourceCylinderId },
          data: transactionType === "FINAL_RECOVERY"
            ? { currentWeight: input.endWeight, status: "EMPTY_PENDING_RECOVERY", finalRecoveryCompleted: true }
            : { currentWeight: input.endWeight },
        });
      }
      if (input.recoveryCylinderId && (transactionType === "CLEAN_RECOVERY" || transactionType === "DIRTY_RECOVERY")) {
        await tx.refrigerantCylinder.update({ where: { id: input.recoveryCylinderId }, data: { currentWeight: input.endWeight } });
      }
      if (input.recoveryCylinderId && transactionType === "FINAL_RECOVERY") {
        const recovery = await tx.refrigerantCylinder.findUnique({ where: { id: input.recoveryCylinderId } });
        if (recovery) await tx.refrigerantCylinder.update({ where: { id: input.recoveryCylinderId }, data: { currentWeight: recovery.currentWeight + amount } });
      }
      return tx.refrigerantTransaction.create({
        data: {
          transactionType,
          propertyId: input.propertyId ?? null,
          unitId: input.unitId ?? null,
          unitNumber: input.unitNumber ?? null,
          refrigerantTypeId: input.refrigerantTypeId,
          sourceCylinderId: input.sourceCylinderId ?? null,
          recoveryCylinderId: input.recoveryCylinderId ?? null,
          occurredAt: input.occurredAt ?? new Date(),
          startWeight: input.startWeight,
          endWeight: input.endWeight,
          amount,
          notes: input.notes ?? null,
          createdById: request.currentUser!.id,
          createdByName: request.currentUser!.fullName,
        },
        include: { refrigerantType: true, sourceCylinder: true, recoveryCylinder: true },
      });
    });
    if (transactionType === "VIRGIN_CHARGE") {
      await evaluateLeakFlag({ propertyId: input.propertyId, unitId: input.unitId, unitNumber: input.unitNumber, refrigerantTypeId: input.refrigerantTypeId });
    }
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, propertyId: input.propertyId ?? null, entityType: "REFRIGERANT_TRANSACTION", entityId: transaction.id, action: `REFRIGERANT_${transactionType}`, message: `Logged ${amount.toFixed(2)} lb ${transaction.refrigerantType.name} ${transactionType.toLowerCase().replace(/_/g, " ")}` });
    reply.code(201);
    return { transaction };
  }

  app.post("/refrigerant/transactions/charge", async (request, reply) => createTransaction(request, reply, "VIRGIN_CHARGE"));
  app.post("/refrigerant/transactions/recovery", async (request, reply) => {
    const body = refrigerantTransactionSchema.extend({ recoveryType: z.enum(["CLEAN", "DIRTY"]).default("CLEAN") }).parse(request.body);
    request.body = body satisfies z.infer<typeof refrigerantTransactionSchema>;
    return createTransaction(request, reply, body.recoveryType === "DIRTY" ? "DIRTY_RECOVERY" : "CLEAN_RECOVERY");
  });
  app.post("/refrigerant/transactions/final-recovery", async (request, reply) => createTransaction(request, reply, "FINAL_RECOVERY"));

  app.get("/refrigerant/history", async (request, reply) => {
    if (!requireRefrigerantAccess(request, reply, "view")) return;
    const query = refrigerantHistoryQuerySchema.parse(request.query);
    const scope = scopedPropertyWhere(request, query.propertyId);
    if (scope.denied) return reply.code(403).send({ message: "Property access denied" });
    const where = {
      propertyId: scope.where,
      unitId: query.unitId,
      unitNumber: query.unitNumber ? { equals: query.unitNumber, mode: "insensitive" as const } : undefined,
      refrigerantTypeId: query.refrigerantTypeId,
      transactionType: query.transactionType,
      occurredAt: query.from || query.to ? { gte: query.from, lte: query.to } : undefined,
    };
    const [total, transactions] = await Promise.all([
      prisma.refrigerantTransaction.count({ where }),
      prisma.refrigerantTransaction.findMany({
        where,
        include: { refrigerantType: true, sourceCylinder: true, recoveryCylinder: true },
        orderBy: { occurredAt: "desc" },
        take: query.limit,
        skip: query.offset,
      }),
    ]);
    return { transactions, pagination: { total, limit: query.limit, offset: query.offset, hasMore: query.offset + transactions.length < total } };
  });

  app.get("/refrigerant/compliance", async (request, reply) => {
    if (!requireRefrigerantAccess(request, reply, "view")) return;
    const propertyIds = scopedAllowedPropertyIds(request);
    const result = await complianceIssues(propertyIds);
    return { issues: result.issues, leakFlags: result.leakFlags };
  });

  app.post("/refrigerant/leak-flags/:id/dismiss", async (request, reply) => {
    if (!requireRefrigerantAccess(request, reply, "edit")) return;
    if (request.currentUser!.role !== "ADMIN" && request.currentUser!.role !== "MANAGER") return reply.code(403).send({ message: "Manager or admin access required" });
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = refrigerantLeakFlagDismissSchema.parse(request.body);
    const flag = await prisma.refrigerantLeakFlag.findUnique({ where: { id } });
    if (!flag) return reply.code(404).send({ message: "Leak flag not found" });
    if (!(await assertPropertyScope(request, reply, flag.propertyId))) return;
    const updated = await prisma.refrigerantLeakFlag.update({ where: { id }, data: { status: "DISMISSED", dismissedAt: new Date(), dismissedById: request.currentUser!.id, dismissalNotes: body.notes } });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, propertyId: updated.propertyId, entityType: "REFRIGERANT_LEAK_FLAG", entityId: id, action: "REFRIGERANT_LEAK_FLAG_DISMISSED", message: `Dismissed refrigerant leak flag for ${updated.unitNumber}`, metadata: { notes: body.notes } });
    return { flag: updated };
  });

  app.get("/refrigerant/export.csv", async (request, reply) => {
    if (!requireRefrigerantAccess(request, reply, "view")) return;
    const query = z.object({ report: z.enum(["usage", "recovery", "cylinders", "compliance", "unitHistory", "fullAudit"]).default("usage") }).parse(request.query);
    const propertyIds = scopedAllowedPropertyIds(request);
    const rows = await refrigerantExportRows(query.report, propertyIds);
    const csv = stringify(rows, { header: true });
    reply.header("content-type", "text/csv; charset=utf-8");
    reply.header("content-disposition", `attachment; filename=\"makereadyos-refrigerant-${query.report}.csv\"`);
    return csv;
  });

  app.get("/refrigerant/export.xls", async (request, reply) => {
    if (!requireRefrigerantAccess(request, reply, "view")) return;
    const query = z.object({ report: z.enum(["usage", "recovery", "cylinders", "compliance", "unitHistory", "fullAudit"]).default("usage") }).parse(request.query);
    const propertyIds = scopedAllowedPropertyIds(request);
    const rows = await refrigerantExportRows(query.report, propertyIds);
    const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
    const lines = [
      headers.join("\t"),
      ...rows.map((row) => headers.map((header) => String(row[header] ?? "")).join("\t")),
    ].join("\n");
    reply.header("content-type", "application/vnd.ms-excel; charset=utf-8");
    reply.header("content-disposition", `attachment; filename=\"makereadyos-refrigerant-${query.report}.xls\"`);
    return lines;
  });

  app.get("/refrigerant/report.html", async (request, reply) => {
    if (!requireRefrigerantAccess(request, reply, "view")) return;
    const query = z.object({ report: z.enum(["usage", "recovery", "cylinders", "compliance", "unitHistory", "fullAudit"]).default("usage") }).parse(request.query);
    const propertyIds = scopedAllowedPropertyIds(request);
    const rows = await refrigerantExportRows(query.report, propertyIds);
    const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Refrigerant ${htmlEscape(query.report)} Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
    h1 { margin: 0 0 8px; }
    p { margin: 0 0 16px; color: #4b5563; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border: 1px solid #d1d5db; padding: 6px; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; }
  </style>
</head>
<body>
  <h1>Refrigerant ${htmlEscape(query.report)} Report</h1>
  <p>Generated ${htmlEscape(new Date().toLocaleString())} | ${htmlEscape(rows.length)} row(s)</p>
  <table>
    <thead>
      <tr>${headers.map((header) => `<th>${htmlEscape(header)}</th>`).join("")}</tr>
    </thead>
    <tbody>
      ${rows.map((row) => `<tr>${headers.map((header) => `<td>${htmlEscape(row[header])}</td>`).join("")}</tr>`).join("")}
    </tbody>
  </table>
</body>
</html>`;
    reply.header("content-type", "text/html; charset=utf-8");
    return reply.send(html);
  });

  app.get("/refrigerant/report.pdf", async (request, reply) => {
    if (!requireRefrigerantAccess(request, reply, "view")) return;
    const query = z.object({ report: z.enum(["usage", "recovery", "cylinders", "compliance", "unitHistory", "fullAudit"]).default("usage") }).parse(request.query);
    const propertyIds = scopedAllowedPropertyIds(request);
    const rows = await refrigerantExportRows(query.report, propertyIds);
    const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Refrigerant ${htmlEscape(query.report)} Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
    h1 { margin: 0 0 8px; }
    p { margin: 0 0 16px; color: #4b5563; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    th, td { border: 1px solid #d1d5db; padding: 6px; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; }
  </style>
</head>
<body>
  <h1>Refrigerant ${htmlEscape(query.report)} Report</h1>
  <p>Generated ${htmlEscape(new Date().toLocaleString())} | ${htmlEscape(rows.length)} row(s)</p>
  <table>
    <thead>
      <tr>${headers.map((header) => `<th>${htmlEscape(header)}</th>`).join("")}</tr>
    </thead>
    <tbody>
      ${rows.map((row) => `<tr>${headers.map((header) => `<td>${htmlEscape(row[header])}</td>`).join("")}</tr>`).join("")}
    </tbody>
  </table>
</body>
</html>`;
    const pdf = await renderPdfFromHtml(html);
    reply.header("content-type", "application/pdf");
    reply.header("content-disposition", `inline; filename="makereadyos-refrigerant-${query.report}.pdf"`);
    return reply.send(pdf);
  });
}
