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
import { createNotification, notifyPropertyRoles } from "../lib/notifications.js";
import { renderPdfFromHtml } from "../lib/pdf.js";
import { prisma } from "../lib/prisma.js";
import { queueWebhookEvent } from "../lib/webhookQueue.js";
import { ensureStoredUploadParent, removeStoredUpload, resolveStoredUploadPath, routedStoredName } from "../lib/uploadStorage.js";

const pmCategories = ["Pool", "Gate", "HVAC", "Electrical", "Fire Safety", "Irrigation", "Roof", "Grounds", "Building", "Clubhouse", "General", "Other"] as const;
const pmFrequencies = ["Daily", "Weekly", "Biweekly", "Monthly", "Quarterly", "Semi-Annual", "Annual", "Custom"] as const;
const pmAssignedRoles = ["ADMIN", "MANAGER", "TECH", "LEASING", "CLEANER", "VIEWER"] as const;
const pmStatuses = ["UPCOMING", "DUE", "COMPLETED", "OVERDUE", "SKIPPED"] as const;
const pmPriorities = ["Low", "Normal", "High", "Critical"] as const;
const completionOutcomes = ["PASS", "FAIL", "COMPLETE", "SKIPPED"] as const;
const allowedAttachmentExtensions = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".heic", ".heif", ".bmp", ".tif", ".tiff", ".pdf"]);
const allowedAttachmentTypes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif", "image/heic", "image/heif", "image/bmp", "image/tiff", "application/pdf"]);

export const preventiveMaintenanceTemplateSchema = z.object({
  propertyId: z.string().min(1),
  name: z.string().trim().min(1).max(140),
  category: z.enum(pmCategories),
  description: z.string().trim().max(2000).nullable().optional(),
  instructions: z.string().trim().max(5000).nullable().optional(),
  frequency: z.enum(pmFrequencies),
  customEveryDays: z.coerce.number().int().min(1).max(365).nullable().optional(),
  annualMonth: z.coerce.number().int().min(1).max(12).nullable().optional(),
  annualDay: z.coerce.number().int().min(1).max(31).nullable().optional(),
  assignedRole: z.enum(pmAssignedRoles),
  assignedUserId: z.string().trim().min(1).nullable().optional(),
  photosRequired: z.boolean().optional(),
  notesRequired: z.boolean().optional(),
  passFailRequired: z.boolean().optional(),
  priority: z.enum(pmPriorities).optional(),
  isActive: z.boolean().optional(),
  isArchived: z.boolean().optional(),
});

export const preventiveMaintenanceTaskQuerySchema = z.object({
  propertyId: z.string().optional(),
  category: z.enum(pmCategories).optional(),
  status: z.enum(pmStatuses).optional(),
  priority: z.enum(pmPriorities).optional(),
  assignedRole: z.enum(pmAssignedRoles).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  q: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(150),
  offset: z.coerce.number().int().min(0).default(0),
});

export const preventiveMaintenanceHistoryQuerySchema = preventiveMaintenanceTaskQuerySchema.extend({
  completedById: z.string().optional(),
});

export const preventiveMaintenanceTaskCompleteSchema = z.object({
  outcome: z.enum(["PASS", "FAIL", "COMPLETE"]),
  notes: z.string().trim().max(4000).nullable().optional(),
});

export const preventiveMaintenanceTaskSkipSchema = z.object({
  notes: z.string().trim().max(4000).nullable().optional(),
});

function roleAccess(role: string) {
  if (role === "ADMIN") return { view: true, edit: true, admin: true };
  if (role === "MANAGER" || role === "TECH" || role === "CLEANER") return { view: true, edit: true, admin: false };
  return { view: true, edit: false, admin: false };
}

function requirePmAccess(request: FastifyRequest, reply: FastifyReply, level: "view" | "edit" | "admin") {
  const access = roleAccess(request.currentUser!.role);
  if (!access[level]) {
    reply.code(403).send({ message: "Preventive Maintenance access required" });
    return false;
  }
  return true;
}

function propertyScopeWhere(request: FastifyRequest, propertyId?: string) {
  const scoped = scopedAllowedPropertyIds(request);
  if (propertyId && scoped !== null && !scoped.includes(propertyId)) return { denied: true as const, where: undefined };
  return { denied: false as const, where: propertyId ?? (scoped === null ? undefined : { in: scoped }) };
}

function hasPropertyAccess(user: {
  role: UserRole;
  propertyAccess: Array<{ propertyId: string }>;
}, propertyId: string) {
  return user.role === UserRole.ADMIN || user.propertyAccess.some((access) => access.propertyId === propertyId);
}

async function findAssignablePmUser(input: {
  propertyId: string;
  assignedRole: string;
  assignedUserId?: string | null;
}) {
  if (!input.assignedUserId) return null;
  const user = await prisma.user.findUnique({
    where: { id: input.assignedUserId },
    include: { propertyAccess: true },
  });
  if (!user || !user.isActive) {
    throw Object.assign(new Error("Select an active PM staff user"), { statusCode: 400 });
  }
  if (user.role !== input.assignedRole) {
    throw Object.assign(new Error("Selected PM user must match the assigned role"), { statusCode: 400 });
  }
  if (!hasPropertyAccess(user, input.propertyId)) {
    throw Object.assign(new Error("Selected PM user does not have access to this property"), { statusCode: 400 });
  }
  return user;
}

async function listAssignablePmUsers(propertyId: string) {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { role: UserRole.ADMIN },
        { propertyAccess: { some: { propertyId } } },
      ],
      role: { in: pmAssignedRoles as unknown as UserRole[] },
    },
    select: { id: true, fullName: true, role: true },
    orderBy: [{ fullName: "asc" }, { role: "asc" }],
  });
  return users;
}

async function assertPropertyAccess(request: FastifyRequest, propertyId: string) {
  const scoped = scopedAllowedPropertyIds(request);
  if (scoped !== null && !scoped.includes(propertyId)) {
    throw Object.assign(new Error("Property access denied"), { statusCode: 403 });
  }
}

function startOfDay(value = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value = new Date()) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function addDays(value: Date, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function addMonths(value: Date, months: number) {
  const date = new Date(value);
  const day = date.getDate();
  date.setMonth(date.getMonth() + months, 1);
  const maxDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, maxDay));
  return date;
}

function sanitizeFilename(filename: string) {
  return basename(filename).replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 180) || "pm-attachment";
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function htmlEscape(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function templateNextDueDate(template: {
  frequency: string;
  customEveryDays: number | null;
  annualMonth: number | null;
  annualDay: number | null;
}, baseDate: Date) {
  const base = startOfDay(baseDate);
  switch (template.frequency) {
    case "Daily":
      return addDays(base, 1);
    case "Weekly":
      return addDays(base, 7);
    case "Biweekly":
      return addDays(base, 14);
    case "Monthly":
      return addMonths(base, 1);
    case "Quarterly":
      return addMonths(base, 3);
    case "Semi-Annual":
      return addMonths(base, 6);
    case "Annual": {
      if (template.annualMonth && template.annualDay) {
        const next = new Date(base.getFullYear(), template.annualMonth - 1, template.annualDay);
        if (next <= base) {
          return new Date(base.getFullYear() + 1, template.annualMonth - 1, template.annualDay);
        }
        return next;
      }
      return addMonths(base, 12);
    }
    case "Custom":
      return addDays(base, Math.max(1, template.customEveryDays ?? 30));
    default:
      return addDays(base, 30);
  }
}

function initialDueDate(template: {
  frequency: string;
  annualMonth: number | null;
  annualDay: number | null;
}) {
  const today = startOfDay();
  if (template.frequency === "Annual" && template.annualMonth && template.annualDay) {
    const next = new Date(today.getFullYear(), template.annualMonth - 1, template.annualDay);
    return next < today ? new Date(today.getFullYear() + 1, template.annualMonth - 1, template.annualDay) : next;
  }
  return today;
}

function derivedTaskStatus(task: { status: string; dueDate: Date }) {
  if (task.status === "COMPLETED" || task.status === "SKIPPED") return task.status;
  const today = startOfDay();
  if (task.dueDate < today) return "OVERDUE";
  if (task.dueDate <= endOfDay(today)) return "DUE";
  return "UPCOMING";
}

async function syncTaskStatuses(tasks: Array<{ id: string; status: string; dueDate: Date }>) {
  const updates = tasks
    .map((task) => ({ id: task.id, nextStatus: derivedTaskStatus(task) }))
    .filter((task) => task.nextStatus !== tasks.find((entry) => entry.id === task.id)?.status);
  if (!updates.length) return;
  await Promise.all(updates.map((update) => prisma.preventiveMaintenanceTask.update({
    where: { id: update.id },
    data: { status: update.nextStatus },
  })));
}

async function createTaskFromTemplate(template: {
  id: string;
  propertyId: string;
  name: string;
  category: string;
  description: string | null;
  instructions: string | null;
  assignedRole: string;
  assignedUserId: string | null;
  assignedUserName: string | null;
  priority: string;
  photosRequired: boolean;
  notesRequired: boolean;
  passFailRequired: boolean;
}, dueDate: Date) {
  const task = await prisma.preventiveMaintenanceTask.create({
    data: {
      propertyId: template.propertyId,
      templateId: template.id,
      taskName: template.name,
      category: template.category,
      description: template.description,
      instructions: template.instructions,
      assignedRole: template.assignedRole,
      assignedUserId: template.assignedUserId,
      assignedUserName: template.assignedUserName,
      dueDate,
      status: dueDate < startOfDay() ? "OVERDUE" : dueDate <= endOfDay() ? "DUE" : "UPCOMING",
      priority: template.priority,
      photosRequired: template.photosRequired,
      notesRequired: template.notesRequired,
      passFailRequired: template.passFailRequired,
    },
  });
  if (task.dueDate <= endOfDay(addDays(new Date(), 7))) {
    if (template.assignedUserId) {
      await createNotification({
        userId: template.assignedUserId,
        propertyId: task.propertyId,
        category: "PM",
        title: task.dueDate < startOfDay() ? "PM task overdue" : task.dueDate <= endOfDay() ? "PM task due today" : "PM task upcoming",
        message: `${task.taskName} is due ${task.dueDate.toLocaleDateString()}.`,
        dedupeKey: `pm-task:${task.id}:user:${template.assignedUserId}`,
      });
    }
    await notifyPropertyRoles({
      propertyId: task.propertyId,
      roles: [UserRole.MANAGER, UserRole.TECH, UserRole.CLEANER],
      category: "PM",
      title: task.dueDate < startOfDay() ? "PM task overdue" : task.dueDate <= endOfDay() ? "PM task due today" : "PM task upcoming",
      message: `${task.taskName} is due ${task.dueDate.toLocaleDateString()}.`,
      dedupeKey: `pm-task:${task.id}:${task.status}`,
    });
  }
  return task;
}

async function ensureOpenTaskForTemplate(template: {
  id: string;
  propertyId: string;
  name: string;
  category: string;
  description: string | null;
  instructions: string | null;
  frequency: string;
  customEveryDays: number | null;
  annualMonth: number | null;
  annualDay: number | null;
  assignedRole: string;
  assignedUserId: string | null;
  assignedUserName: string | null;
  priority: string;
  photosRequired: boolean;
  notesRequired: boolean;
  passFailRequired: boolean;
  isActive: boolean;
  isArchived: boolean;
}) {
  if (!template.isActive || template.isArchived) return null;
  const existing = await prisma.preventiveMaintenanceTask.findFirst({
    where: {
      templateId: template.id,
      status: { in: ["UPCOMING", "DUE", "OVERDUE"] },
    },
    orderBy: { dueDate: "asc" },
  });
  if (existing) return existing;
  return createTaskFromTemplate(template, initialDueDate(template));
}

async function ensureGeneratedTasks(request: FastifyRequest, propertyId?: string) {
  const scoped = propertyScopeWhere(request, propertyId);
  if (scoped.denied) return [];
  const templates = await prisma.preventiveMaintenanceTemplate.findMany({
    where: {
      propertyId: scoped.where,
      isArchived: false,
      isActive: true,
    },
  });
  return Promise.all(templates.map((template) => ensureOpenTaskForTemplate(template)));
}

function taskMatchesQuery(task: {
  taskName: string;
  category: string;
  description: string | null;
  instructions: string | null;
  completionNotes: string | null;
  completedByName: string | null;
  template: { name: string };
  property: { code: string; name: string };
}, q?: string) {
  if (!q) return true;
  const haystack = [
    task.taskName,
    task.category,
    task.description,
    task.instructions,
    task.completionNotes,
    task.completedByName,
    task.template.name,
    task.property.code,
    task.property.name,
  ].join(" ").toLowerCase();
  return haystack.includes(q.toLowerCase());
}

export async function preventiveMaintenanceRoutes(app: FastifyInstance) {
  app.get("/pm/overview", async (request, reply) => {
    if (!requirePmAccess(request, reply, "view")) return;
    const query = z.object({ propertyId: z.string().optional() }).parse(request.query);
    const scoped = propertyScopeWhere(request, query.propertyId);
    if (scoped.denied) return reply.code(403).send({ message: "Property access denied" });
    const propertyId = query.propertyId
      ?? (typeof scoped.where === "string" ? scoped.where : Array.isArray((scoped.where as { in?: string[] } | undefined)?.in) ? (scoped.where as { in: string[] }).in[0] : undefined);
    await ensureGeneratedTasks(request, query.propertyId);
    const tasks = await prisma.preventiveMaintenanceTask.findMany({
      where: { propertyId: scoped.where },
      include: { property: true, template: true, attachments: true },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 200,
    });
    await syncTaskStatuses(tasks);
    const normalized = tasks.map((task) => ({ ...task, status: derivedTaskStatus(task) }));
    const today = startOfDay();
    const weekEnd = endOfDay(addDays(today, 7));
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    return {
      permissions: roleAccess(request.currentUser!.role),
      categories: pmCategories,
      frequencies: pmFrequencies,
      priorities: pmPriorities,
      assignedRoles: pmAssignedRoles,
      assignableUsers: propertyId ? await listAssignablePmUsers(propertyId) : [],
      summary: {
        dueToday: normalized.filter((task) => task.status === "DUE").length,
        dueThisWeek: normalized.filter((task) => task.status !== "COMPLETED" && task.status !== "SKIPPED" && task.dueDate >= today && task.dueDate <= weekEnd).length,
        overdue: normalized.filter((task) => task.status === "OVERDUE").length,
        completedThisMonth: normalized.filter((task) => task.completedAt && task.completedAt >= monthStart).length,
        completionRate: normalized.length
          ? Math.round((normalized.filter((task) => task.status === "COMPLETED").length / normalized.filter((task) => task.status !== "SKIPPED").length) * 100) || 0
          : 0,
      },
      upcomingTasks: normalized.filter((task) => task.status === "UPCOMING" || task.status === "DUE").slice(0, 10),
      overdueTasks: normalized.filter((task) => task.status === "OVERDUE").slice(0, 10),
      recentCompletions: normalized.filter((task) => task.status === "COMPLETED" || task.status === "SKIPPED").sort((left, right) => (right.completedAt?.getTime() ?? 0) - (left.completedAt?.getTime() ?? 0)).slice(0, 10),
      compliance: {
        green: normalized.filter((task) => task.status === "COMPLETED").length,
        yellow: normalized.filter((task) => task.status === "DUE" || task.status === "UPCOMING").length,
        red: normalized.filter((task) => task.status === "OVERDUE" || task.status === "SKIPPED").length,
      },
    };
  });

  app.get("/pm/templates", async (request, reply) => {
    if (!requirePmAccess(request, reply, "view")) return;
    const query = z.object({ propertyId: z.string().optional(), includeArchived: z.coerce.boolean().optional() }).parse(request.query);
    const scoped = propertyScopeWhere(request, query.propertyId);
    if (scoped.denied) return reply.code(403).send({ message: "Property access denied" });
    const templates = await prisma.preventiveMaintenanceTemplate.findMany({
      where: {
        propertyId: scoped.where,
        isArchived: query.includeArchived ? undefined : false,
      },
      include: { property: true, tasks: { orderBy: { dueDate: "desc" }, take: 1 } },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });
    return { templates, permissions: roleAccess(request.currentUser!.role) };
  });

  app.post("/pm/templates", async (request, reply) => {
    if (!requirePmAccess(request, reply, "edit")) return;
    const input = preventiveMaintenanceTemplateSchema.parse(request.body);
    await assertPropertyAccess(request, input.propertyId);
    const assignedUser = await findAssignablePmUser({
      propertyId: input.propertyId,
      assignedRole: input.assignedRole,
      assignedUserId: input.assignedUserId ?? null,
    });
    const template = await prisma.preventiveMaintenanceTemplate.create({
      data: {
        ...input,
        assignedUserId: assignedUser?.id ?? null,
        assignedUserName: assignedUser?.fullName ?? null,
        createdById: request.currentUser!.id,
        updatedById: request.currentUser!.id,
      },
      include: { property: true },
    });
    await ensureOpenTaskForTemplate(template);
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: template.propertyId,
      entityType: "PM_TEMPLATE",
      entityId: template.id,
      action: "PM_TEMPLATE_CREATED",
      message: `Created PM template ${template.name}`,
    });
    await queueWebhookEvent({
      eventType: "pm.template.created",
      propertyId: template.propertyId,
      actorUserId: request.currentUser!.id,
      data: {
        templateId: template.id,
        propertyId: template.propertyId,
        propertyCode: template.property.code,
        name: template.name,
        category: template.category,
        frequency: template.frequency,
        assignedRole: template.assignedRole,
        assignedUserId: template.assignedUserId,
        assignedUserName: template.assignedUserName,
        priority: template.priority,
        isActive: template.isActive,
        isArchived: template.isArchived,
      },
    });
    reply.code(201);
    return { template };
  });

  app.patch("/pm/templates/:id", async (request, reply) => {
    if (!requirePmAccess(request, reply, "edit")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = preventiveMaintenanceTemplateSchema.partial().parse(request.body);
    const existing = await prisma.preventiveMaintenanceTemplate.findUnique({ where: { id } });
    if (!existing) throw Object.assign(new Error("PM template not found"), { statusCode: 404 });
    await assertPropertyAccess(request, existing.propertyId);
    const nextAssignedRole = input.assignedRole ?? existing.assignedRole;
    const assignedUser = "assignedUserId" in input
      ? await findAssignablePmUser({
        propertyId: existing.propertyId,
        assignedRole: nextAssignedRole,
        assignedUserId: input.assignedUserId ?? null,
      })
      : null;
    const template = await prisma.preventiveMaintenanceTemplate.update({
      where: { id },
      data: {
        ...input,
        assignedUserId: "assignedUserId" in input ? assignedUser?.id ?? null : undefined,
        assignedUserName: "assignedUserId" in input ? assignedUser?.fullName ?? null : undefined,
        updatedById: request.currentUser!.id,
      },
    });
    await prisma.preventiveMaintenanceTask.updateMany({
      where: {
        templateId: template.id,
        status: { in: ["UPCOMING", "DUE", "OVERDUE"] },
      },
      data: {
        taskName: template.name,
        category: template.category,
        description: template.description,
        instructions: template.instructions,
        assignedRole: template.assignedRole,
        assignedUserId: template.assignedUserId,
        assignedUserName: template.assignedUserName,
        priority: template.priority,
        photosRequired: template.photosRequired,
        notesRequired: template.notesRequired,
        passFailRequired: template.passFailRequired,
      },
    });
    await ensureOpenTaskForTemplate(template);
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: template.propertyId,
      entityType: "PM_TEMPLATE",
      entityId: template.id,
      action: "PM_TEMPLATE_UPDATED",
      message: `Updated PM template ${template.name}`,
    });
    await queueWebhookEvent({
      eventType: "pm.template.updated",
      propertyId: template.propertyId,
      actorUserId: request.currentUser!.id,
      data: {
        templateId: template.id,
        propertyId: template.propertyId,
        name: template.name,
        category: template.category,
        frequency: template.frequency,
        assignedRole: template.assignedRole,
        assignedUserId: template.assignedUserId,
        assignedUserName: template.assignedUserName,
        priority: template.priority,
        isActive: template.isActive,
        isArchived: template.isArchived,
      },
    });
    return { template };
  });

  app.delete("/pm/templates/:id", async (request, reply) => {
    if (!requirePmAccess(request, reply, "edit")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.preventiveMaintenanceTemplate.findUnique({
      where: { id },
      include: { tasks: { select: { id: true }, take: 1 } },
    });
    if (!existing) throw Object.assign(new Error("PM template not found"), { statusCode: 404 });
    await assertPropertyAccess(request, existing.propertyId);
    if (!existing.isArchived) {
      return reply.code(409).send({ message: "Archive the PM template before permanently deleting it" });
    }
    if (existing.tasks.length) {
      return reply.code(409).send({ message: "Cannot permanently delete a PM template that already has task history" });
    }
    await prisma.preventiveMaintenanceTemplate.delete({ where: { id } });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: existing.propertyId,
      entityType: "PM_TEMPLATE",
      entityId: existing.id,
      action: "PM_TEMPLATE_DELETED",
      message: `Deleted PM template ${existing.name}`,
    });
    return { ok: true };
  });

  app.get("/pm/tasks", async (request, reply) => {
    if (!requirePmAccess(request, reply, "view")) return;
    const query = preventiveMaintenanceTaskQuerySchema.parse(request.query);
    const scoped = propertyScopeWhere(request, query.propertyId);
    if (scoped.denied) return reply.code(403).send({ message: "Property access denied" });
    await ensureGeneratedTasks(request, query.propertyId);
    const tasks = await prisma.preventiveMaintenanceTask.findMany({
      where: {
        propertyId: scoped.where,
        category: query.category,
        priority: query.priority,
        assignedRole: query.assignedRole,
        dueDate: query.from || query.to ? {
          ...(query.from ? { gte: startOfDay(query.from) } : {}),
          ...(query.to ? { lte: endOfDay(query.to) } : {}),
        } : undefined,
      },
      include: {
        property: true,
        template: true,
        attachments: true,
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    });
    await syncTaskStatuses(tasks);
    const normalized = tasks
      .map((task) => ({ ...task, status: derivedTaskStatus(task) }))
      .filter((task) => !query.status || task.status === query.status)
      .filter((task) => taskMatchesQuery(task, query.q));
    const slice = normalized.slice(query.offset, query.offset + query.limit);
    return {
      tasks: slice,
      pagination: {
        total: normalized.length,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + slice.length < normalized.length,
      },
    };
  });

  app.get("/pm/calendar", async (request, reply) => {
    if (!requirePmAccess(request, reply, "view")) return;
    const query = z.object({
      propertyId: z.string().optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
    }).parse(request.query);
    const scoped = propertyScopeWhere(request, query.propertyId);
    if (scoped.denied) return reply.code(403).send({ message: "Property access denied" });
    const from = query.from ? startOfDay(query.from) : startOfDay(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const to = query.to ? endOfDay(query.to) : endOfDay(new Date(from.getFullYear(), from.getMonth() + 1, 0));
    await ensureGeneratedTasks(request, query.propertyId);
    const tasks = await prisma.preventiveMaintenanceTask.findMany({
      where: {
        propertyId: scoped.where,
        dueDate: { gte: from, lte: to },
      },
      include: { property: true, template: true, attachments: true },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    });
    await syncTaskStatuses(tasks);
    return { tasks: tasks.map((task) => ({ ...task, status: derivedTaskStatus(task) })), from, to };
  });

  app.get("/pm/history", async (request, reply) => {
    if (!requirePmAccess(request, reply, "view")) return;
    const query = preventiveMaintenanceHistoryQuerySchema.parse(request.query);
    const scoped = propertyScopeWhere(request, query.propertyId);
    if (scoped.denied) return reply.code(403).send({ message: "Property access denied" });
    const tasks = await prisma.preventiveMaintenanceTask.findMany({
      where: {
        propertyId: scoped.where,
        category: query.category,
        priority: query.priority,
        assignedRole: query.assignedRole,
        completedById: query.completedById,
        completedAt: query.from || query.to ? {
          ...(query.from ? { gte: startOfDay(query.from) } : {}),
          ...(query.to ? { lte: endOfDay(query.to) } : {}),
        } : undefined,
        status: { in: ["COMPLETED", "SKIPPED"] },
      },
      include: {
        property: true,
        template: true,
        attachments: true,
      },
      orderBy: [{ completedAt: "desc" }, { dueDate: "desc" }],
    });
    const filtered = tasks.filter((task) => !query.status || task.status === query.status).filter((task) => taskMatchesQuery(task, query.q));
    const slice = filtered.slice(query.offset, query.offset + query.limit);
    return {
      tasks: slice,
      pagination: {
        total: filtered.length,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + slice.length < filtered.length,
      },
    };
  });

  app.post("/pm/tasks/:id/complete", async (request, reply) => {
    if (!requirePmAccess(request, reply, "edit")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = preventiveMaintenanceTaskCompleteSchema.parse(request.body);
    const task = await prisma.preventiveMaintenanceTask.findUnique({
      where: { id },
      include: { template: true, attachments: true },
    });
    if (!task) throw Object.assign(new Error("PM task not found"), { statusCode: 404 });
    await assertPropertyAccess(request, task.propertyId);
    if (task.photosRequired && task.attachments.length === 0) {
      throw Object.assign(new Error("Photo is required before completing this PM task"), { statusCode: 400 });
    }
    if (task.notesRequired && !input.notes?.trim()) {
      throw Object.assign(new Error("Notes are required before completing this PM task"), { statusCode: 400 });
    }
    if (task.passFailRequired && !["PASS", "FAIL"].includes(input.outcome)) {
      throw Object.assign(new Error("This PM task requires Pass or Fail"), { statusCode: 400 });
    }
    const completedAt = new Date();
    const updated = await prisma.preventiveMaintenanceTask.update({
      where: { id },
      data: {
        status: "COMPLETED",
        completionOutcome: input.outcome,
        completionNotes: input.notes ?? null,
        completedById: request.currentUser!.id,
        completedByName: request.currentUser!.fullName,
        completedAt,
      },
      include: { property: true, template: true, attachments: true },
    });
    await createTaskFromTemplate(updated.template, templateNextDueDate(updated.template, completedAt));
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: updated.propertyId,
      entityType: "PM_TASK",
      entityId: updated.id,
      action: "PM_TASK_COMPLETED",
      message: `Completed PM task ${updated.taskName} (${input.outcome})`,
    });
    await queueWebhookEvent({
      eventType: "pm.task.completed",
      propertyId: updated.propertyId,
      actorUserId: request.currentUser!.id,
      data: {
        taskId: updated.id,
        templateId: updated.templateId,
        propertyId: updated.propertyId,
        propertyCode: updated.property.code,
        taskName: updated.taskName,
        category: updated.category,
        assignedRole: updated.assignedRole,
        assignedUserId: updated.assignedUserId,
        assignedUserName: updated.assignedUserName,
        priority: updated.priority,
        dueDate: updated.dueDate,
        completionOutcome: updated.completionOutcome,
        completionNotes: updated.completionNotes,
        completedAt: updated.completedAt,
      },
    });
    return { task: updated };
  });

  app.post("/pm/tasks/:id/skip", async (request, reply) => {
    if (!requirePmAccess(request, reply, "edit")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = preventiveMaintenanceTaskSkipSchema.parse(request.body);
    const task = await prisma.preventiveMaintenanceTask.findUnique({
      where: { id },
      include: { template: true },
    });
    if (!task) throw Object.assign(new Error("PM task not found"), { statusCode: 404 });
    await assertPropertyAccess(request, task.propertyId);
    const completedAt = new Date();
    const updated = await prisma.preventiveMaintenanceTask.update({
      where: { id },
      data: {
        status: "SKIPPED",
        completionOutcome: "SKIPPED",
        completionNotes: input.notes ?? null,
        completedById: request.currentUser!.id,
        completedByName: request.currentUser!.fullName,
        completedAt,
      },
      include: { property: true, template: true, attachments: true },
    });
    await createTaskFromTemplate(updated.template, templateNextDueDate(updated.template, completedAt));
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: updated.propertyId,
      entityType: "PM_TASK",
      entityId: updated.id,
      action: "PM_TASK_SKIPPED",
      message: `Skipped PM task ${updated.taskName}`,
    });
    await queueWebhookEvent({
      eventType: "pm.task.skipped",
      propertyId: updated.propertyId,
      actorUserId: request.currentUser!.id,
      data: {
        taskId: updated.id,
        templateId: updated.templateId,
        propertyId: updated.propertyId,
        propertyCode: updated.property.code,
        taskName: updated.taskName,
        category: updated.category,
        assignedRole: updated.assignedRole,
        assignedUserId: updated.assignedUserId,
        assignedUserName: updated.assignedUserName,
        priority: updated.priority,
        dueDate: updated.dueDate,
        completionOutcome: updated.completionOutcome,
        completionNotes: updated.completionNotes,
        completedAt: updated.completedAt,
      },
    });
    return { task: updated };
  });

  app.post("/pm/tasks/:id/attachments", async (request, reply) => {
    if (!requirePmAccess(request, reply, "edit")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const task = await prisma.preventiveMaintenanceTask.findUnique({ where: { id }, include: { property: true } });
    if (!task) throw Object.assign(new Error("PM task not found"), { statusCode: 404 });
    await assertPropertyAccess(request, task.propertyId);
    const upload = await request.file();
    if (!upload) return reply.code(400).send({ message: "Attachment file is required" });
    const extension = extname(upload.filename).toLowerCase();
    if (!allowedAttachmentExtensions.has(extension) || !allowedAttachmentTypes.has(upload.mimetype)) {
      return reply.code(415).send({ message: "Unsupported PM file type. Upload images or PDFs." });
    }
    const storedName = routedStoredName(task.property, `pm/${randomUUID()}${extension}`);
    await ensureStoredUploadParent(storedName);
    await pipeline(upload.file, createWriteStream(resolveStoredUploadPath(storedName)));
    const attachment = await prisma.preventiveMaintenanceTaskAttachment.create({
      data: {
        taskId: task.id,
        propertyId: task.propertyId,
        uploadedById: request.currentUser!.id,
        uploaderName: request.currentUser!.fullName,
        originalName: upload.filename,
        storedName,
        mimeType: upload.mimetype,
        sizeBytes: upload.file.bytesRead,
      },
    });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: task.propertyId,
      entityType: "PM_TASK_ATTACHMENT",
      entityId: attachment.id,
      action: "PM_TASK_ATTACHMENT_CREATED",
      message: `Uploaded PM attachment ${attachment.originalName}`,
    });
    reply.code(201);
    return { attachment };
  });

  app.get("/pm/attachments/:id/download", async (request, reply) => {
    if (!requirePmAccess(request, reply, "view")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const attachment = await prisma.preventiveMaintenanceTaskAttachment.findUnique({ where: { id } });
    if (!attachment) throw Object.assign(new Error("PM attachment not found"), { statusCode: 404 });
    await assertPropertyAccess(request, attachment.propertyId);
    reply.header("Content-Type", attachment.mimeType);
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Content-Disposition", `inline; filename="${sanitizeFilename(attachment.originalName)}"`);
    return reply.send(createReadStream(resolveStoredUploadPath(attachment.storedName)));
  });

  app.get("/pm/export.csv", async (request, reply) => {
    if (!requirePmAccess(request, reply, "view")) return;
    const query = preventiveMaintenanceHistoryQuerySchema.parse(request.query);
    const scoped = propertyScopeWhere(request, query.propertyId);
    if (scoped.denied) return reply.code(403).send({ message: "Property access denied" });
    const tasks = await prisma.preventiveMaintenanceTask.findMany({
      where: {
        propertyId: scoped.where,
        category: query.category,
        priority: query.priority,
        assignedRole: query.assignedRole,
      },
      include: { property: true, template: true, attachments: true },
      orderBy: [{ dueDate: "asc" }, { completedAt: "desc" }],
    });
    const normalized = tasks.map((task) => ({ ...task, status: derivedTaskStatus(task) })).filter((task) => !query.status || task.status === query.status).filter((task) => taskMatchesQuery(task, query.q));
    const csv = stringify(normalized.map((task) => ({
      Property: task.property.code,
      Task: task.taskName,
      Category: task.category,
      DueDate: task.dueDate.toISOString().slice(0, 10),
      AssignedRole: task.assignedRole,
      AssignedUser: task.assignedUserName ?? "",
      Status: task.status,
      Priority: task.priority,
      Template: task.template.name,
      CompletedBy: task.completedByName ?? "",
      CompletedDate: task.completedAt?.toISOString() ?? "",
      Outcome: task.completionOutcome ?? "",
      Notes: task.completionNotes ?? "",
      Photos: task.attachments.length,
    })), { header: true });
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", "attachment; filename=\"pm-report.csv\"");
    return reply.send(csv);
  });

  app.get("/pm/export.xls", async (request, reply) => {
    if (!requirePmAccess(request, reply, "view")) return;
    const query = preventiveMaintenanceHistoryQuerySchema.parse(request.query);
    const scoped = propertyScopeWhere(request, query.propertyId);
    if (scoped.denied) return reply.code(403).send({ message: "Property access denied" });
    const tasks = await prisma.preventiveMaintenanceTask.findMany({
      where: { propertyId: scoped.where },
      include: { property: true, template: true, attachments: true },
      orderBy: [{ dueDate: "asc" }, { completedAt: "desc" }],
    });
    const normalized = tasks.map((task) => ({ ...task, status: derivedTaskStatus(task) })).filter((task) => !query.status || task.status === query.status).filter((task) => taskMatchesQuery(task, query.q));
    const header = ["Property", "Task", "Category", "Due Date", "Assigned Role", "Assigned User", "Status", "Priority", "Template", "Completed By", "Completed Date", "Outcome", "Notes", "Photos"];
    const rows = normalized.map((task) => [
      task.property.code,
      task.taskName,
      task.category,
      task.dueDate.toISOString().slice(0, 10),
      task.assignedRole,
      task.assignedUserName ?? "",
      task.status,
      task.priority,
      task.template.name,
      task.completedByName ?? "",
      task.completedAt?.toISOString() ?? "",
      task.completionOutcome ?? "",
      task.completionNotes ?? "",
      String(task.attachments.length),
    ].join("\t")).join("\n");
    reply.header("Content-Type", "application/vnd.ms-excel; charset=utf-8");
    reply.header("Content-Disposition", "attachment; filename=\"pm-report.xls\"");
    return reply.send(`${header.join("\t")}\n${rows}`);
  });

  app.get("/pm/report.html", async (request, reply) => {
    if (!requirePmAccess(request, reply, "view")) return;
    const query = preventiveMaintenanceHistoryQuerySchema.parse(request.query);
    const scoped = propertyScopeWhere(request, query.propertyId);
    if (scoped.denied) return reply.code(403).send({ message: "Property access denied" });
    const tasks = await prisma.preventiveMaintenanceTask.findMany({
      where: { propertyId: scoped.where },
      include: { property: true, template: true, attachments: true },
      orderBy: [{ dueDate: "asc" }, { completedAt: "desc" }],
    });
    const normalized = tasks.map((task) => ({ ...task, status: derivedTaskStatus(task) })).filter((task) => !query.status || task.status === query.status).filter((task) => taskMatchesQuery(task, query.q));
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Preventive Maintenance Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
    h1 { margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; }
  </style>
</head>
<body>
  <h1>Preventive Maintenance Report</h1>
  <p>Generated ${htmlEscape(new Date().toLocaleString())}</p>
  <table>
    <thead>
      <tr>
        <th>Property</th><th>Task</th><th>Category</th><th>Due Date</th><th>Assigned Role</th><th>Assigned User</th><th>Status</th><th>Priority</th><th>Completed By</th><th>Outcome</th><th>Notes</th>
      </tr>
    </thead>
    <tbody>
      ${normalized.map((task) => `<tr><td>${htmlEscape(task.property.code)}</td><td>${htmlEscape(task.taskName)}</td><td>${htmlEscape(task.category)}</td><td>${htmlEscape(task.dueDate.toLocaleDateString())}</td><td>${htmlEscape(task.assignedRole)}</td><td>${htmlEscape(task.assignedUserName ?? "")}</td><td>${htmlEscape(task.status)}</td><td>${htmlEscape(task.priority)}</td><td>${htmlEscape(task.completedByName ?? "")}</td><td>${htmlEscape(task.completionOutcome ?? "")}</td><td>${htmlEscape(task.completionNotes ?? "")}</td></tr>`).join("")}
    </tbody>
  </table>
</body>
</html>`;
    reply.header("Content-Type", "text/html; charset=utf-8");
    return reply.send(html);
  });

  app.get("/pm/report.pdf", async (request, reply) => {
    if (!requirePmAccess(request, reply, "view")) return;
    const query = preventiveMaintenanceHistoryQuerySchema.parse(request.query);
    const scoped = propertyScopeWhere(request, query.propertyId);
    if (scoped.denied) return reply.code(403).send({ message: "Property access denied" });
    const tasks = await prisma.preventiveMaintenanceTask.findMany({
      where: { propertyId: scoped.where },
      include: { property: true, template: true, attachments: true },
      orderBy: [{ dueDate: "asc" }, { completedAt: "desc" }],
    });
    const normalized = tasks.map((task) => ({ ...task, status: derivedTaskStatus(task) })).filter((task) => !query.status || task.status === query.status).filter((task) => taskMatchesQuery(task, query.q));
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Preventive Maintenance Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
    h1 { margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; }
  </style>
</head>
<body>
  <h1>Preventive Maintenance Report</h1>
  <p>Generated ${htmlEscape(new Date().toLocaleString())}</p>
  <table>
    <thead>
      <tr>
        <th>Property</th><th>Task</th><th>Category</th><th>Due Date</th><th>Assigned Role</th><th>Assigned User</th><th>Status</th><th>Priority</th><th>Completed By</th><th>Outcome</th><th>Notes</th>
      </tr>
    </thead>
    <tbody>
      ${normalized.map((task) => `<tr><td>${htmlEscape(task.property.code)}</td><td>${htmlEscape(task.taskName)}</td><td>${htmlEscape(task.category)}</td><td>${htmlEscape(task.dueDate.toLocaleDateString())}</td><td>${htmlEscape(task.assignedRole)}</td><td>${htmlEscape(task.assignedUserName ?? "")}</td><td>${htmlEscape(task.status)}</td><td>${htmlEscape(task.priority)}</td><td>${htmlEscape(task.completedByName ?? "")}</td><td>${htmlEscape(task.completionOutcome ?? "")}</td><td>${htmlEscape(task.completionNotes ?? "")}</td></tr>`).join("")}
    </tbody>
  </table>
</body>
</html>`;
    const pdf = await renderPdfFromHtml(html);
    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", 'inline; filename="pm-report.pdf"');
    return reply.send(pdf);
  });
}
