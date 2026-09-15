import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { basename, extname } from "node:path";
import { pipeline } from "node:stream/promises";
import { stringify } from "csv-stringify/sync";
import { UserRole } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { booleanFlag } from "../lib/booleanFlag.js";
import { scopedAllowedPropertyIds } from "../lib/auth.js";
import { writeAuditLog } from "../lib/audit.js";
import { createNotification, notifyPropertyRoles } from "../lib/notifications.js";
import { renderPdfFromHtml } from "../lib/pdf.js";
import { prisma } from "../lib/prisma.js";
import { pmDate, pmFrequency, pmStarters, planUnitInspectionDates, nextPmStarterDate } from "../lib/pmStarters.js";
import { ALL_ACCESSIBLE_PROPERTIES_SCOPE_LABEL, propertyScopeLabel } from "../lib/reportScope.js";
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

async function reportScopeLabel(propertyId: string | undefined) {
  if (!propertyId) return ALL_ACCESSIBLE_PROPERTIES_SCOPE_LABEL;
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { code: true, name: true },
  });
  return propertyScopeLabel(property);
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
  firstDueDate?: Date | null;
}) {
  if (template.firstDueDate) return template.firstDueDate;
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
  await Promise.all(updates.map((update) => prisma.preventiveMaintenanceTask.updateMany({
    where: { id: update.id, status: { in: ["UPCOMING", "DUE", "OVERDUE"] } },
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
  isActive?: boolean;
  isArchived?: boolean;
  unitId?: string | null;
}, dueDate: Date) {
  if (template.isActive === false || template.isArchived) return null;
  if (template.unitId && !await prisma.unit.findFirst({ where: { id: template.unitId, propertyId: template.propertyId, isActive: true } })) return null;
  const task = await prisma.$transaction(async db => {
    await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${template.id}))::text`;
    const current = await db.preventiveMaintenanceTemplate.findUnique({ where: { id: template.id } });
    if (!current || !current.isActive || current.isArchived) return null;
    const open = await db.preventiveMaintenanceTask.findFirst({ where: { templateId: template.id, status: { in: ["UPCOMING", "DUE", "OVERDUE"] } } });
    if (open) return open;
    const last = await db.preventiveMaintenanceTask.findFirst({ where: { templateId: template.id, status: { in: ["COMPLETED", "SKIPPED"] } }, orderBy: { completedAt: "desc" } });
    if (last) dueDate = current.firstDueDate
      ? nextPmStarterDate({ ...current, firstDueDate: current.firstDueDate }, last.dueDate)
      : templateNextDueDate(current, last.completedAt ?? last.dueDate);
    return db.preventiveMaintenanceTask.create({
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
  });
  if (task && task.dueDate <= endOfDay(addDays(new Date(), 7))) {
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
  firstDueDate?: Date | null;
  unitId?: string | null;
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
  const tasks = [];
  // A directory can create hundreds of templates; avoid exhausting the DB pool.
  for (let offset = 0; offset < templates.length; offset += 5) {
    tasks.push(...await Promise.all(templates.slice(offset, offset + 5).map(template => ensureOpenTaskForTemplate(template))));
  }
  return tasks;
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

async function getPmReportTasks(request: FastifyRequest, query: z.infer<typeof preventiveMaintenanceHistoryQuerySchema>) {
  const scoped = propertyScopeWhere(request, query.propertyId);
  if (scoped.denied) {
    return { denied: true as const, tasks: [] as Array<ReturnType<typeof Object.assign>> };
  }
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
    include: { property: true, template: true, attachments: true },
    orderBy: [{ dueDate: "asc" }, { completedAt: "desc" }],
  });
  await syncTaskStatuses(tasks);
  return {
    denied: false as const,
    tasks: tasks
      .map((task) => ({ ...task, status: derivedTaskStatus(task) }))
      .filter((task) => !query.status || task.status === query.status)
      .filter((task) => taskMatchesQuery(task, query.q)),
  };
}

export async function preventiveMaintenanceRoutes(app: FastifyInstance) {
  app.get("/pm/starters", async (request, reply) => {
    if (!requirePmAccess(request, reply, "view")) return;
    const { propertyId } = z.object({ propertyId: z.string().min(1) }).parse(request.query);
    await assertPropertyAccess(request, propertyId);
    const units = await prisma.unit.findMany({ where: { propertyId, isActive: true }, select: { id: true, number: true, building: true }, orderBy: { number: "asc" } });
    const installed = await prisma.preventiveMaintenanceTemplate.findMany({ where: { propertyId, starterKey: { not: null } }, select: { id: true, starterKey: true, unitId: true, frequency: true, isActive: true, isArchived: true, firstDueDate: true } });
    return { starters: pmStarters, units, installed };
  });
  app.post("/pm/starters/preview", async (request, reply) => {
    if (!["ADMIN", "MANAGER"].includes(request.currentUser!.role)) return reply.code(403).send({ message: "Manager or admin access required to plan PM" });
    const input = z.object({ propertyId: z.string().min(1), from: pmDate, to: pmDate, weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7) }).strict().parse(request.body);
    await assertPropertyAccess(request, input.propertyId);
    const units = await prisma.unit.findMany({ where: { propertyId: input.propertyId, isActive: true }, select: { id: true, number: true, building: true } });
    if (units.length > 2000) return reply.code(400).send({ message: "This planner supports up to 2,000 active units per property" });
    return { plan: planUnitInspectionDates(units, input.from, input.to, input.weekdays) };
  });
  app.post("/pm/starters/apply", async (request, reply) => {
    if (!["ADMIN", "MANAGER"].includes(request.currentUser!.role)) return reply.code(403).send({ message: "Manager or admin access required to configure PM starters" });
    const input = z.object({ propertyId: z.string().min(1), key: z.string(), enabled: z.boolean(), frequency: pmFrequency, customEveryDays: z.number().int().min(1).max(365).optional(), firstDueDate: pmDate, unitDates: z.array(z.object({ unitId: z.string().min(1), dueDate: pmDate }).strict()).max(2000).optional() }).strict().parse(request.body);
    await assertPropertyAccess(request, input.propertyId);
    const starter = pmStarters.find(row => row.key === input.key);
    if (!starter) return reply.code(400).send({ message: "Choose an available PM starter" });
    if (input.frequency === "Custom" && !input.customEveryDays) return reply.code(400).send({ message: "Enter the custom interval in days" });
    const templates = await prisma.$transaction(async db => {
      await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`pm-starters:${input.propertyId}`}))::text`;
      const matching = { propertyId: input.propertyId, OR: [{ starterKey: input.key }, { starterKey: { startsWith: `${input.key}:` } }] };
      if (!input.enabled) {
        await db.preventiveMaintenanceTemplate.updateMany({ where: matching, data: { isActive: false, updatedById: request.currentUser!.id } });
        return [];
      }
      const rows: Array<{ unitId: string | null; dueDate: string; number?: string }> = [];
      if (input.key === "unit-inspection") {
        if (!input.unitDates?.length || new Set(input.unitDates.map(row => row.unitId)).size !== input.unitDates.length) throw Object.assign(new Error("Preview inspections and select unique units before applying"), { statusCode: 400 });
        const units = await db.unit.findMany({ where: { propertyId: input.propertyId, isActive: true, id: { in: input.unitDates.map(row => row.unitId) } } });
        if (units.length !== input.unitDates.length) throw Object.assign(new Error("The unit directory changed or a unit is outside this property. Preview again."), { statusCode: 409 });
        for (const row of input.unitDates) rows.push({ ...row, number: units.find(unit => unit.id === row.unitId)!.number });
      } else rows.push({ unitId: null, dueDate: input.firstDueDate });
      const result = [];
      for (const row of rows) {
        const starterKey = row.unitId ? `${input.key}:${row.unitId}` : input.key;
        const firstDueDate = new Date(`${row.dueDate}T00:00:00Z`);
        const existing = await db.preventiveMaintenanceTemplate.findUnique({ where: { propertyId_starterKey: { propertyId: input.propertyId, starterKey } } });
        const schedule = { frequency: input.frequency, customEveryDays: input.frequency === "Custom" ? input.customEveryDays : null, firstDueDate, isActive: true, isArchived: false, updatedById: request.currentUser!.id };
        const template = existing ? await db.preventiveMaintenanceTemplate.update({ where: { id: existing.id }, data: schedule }) : await db.preventiveMaintenanceTemplate.create({ data: { ...schedule, propertyId: input.propertyId, starterKey, unitId: row.unitId, name: `${starter.name}${row.number ? ` - Unit ${row.number}` : ""}`, category: starter.category, instructions: starter.instructions, assignedRole: input.key === "warranty" ? "MANAGER" : "TECH", notesRequired: true, passFailRequired: input.key !== "warranty", createdById: request.currentUser!.id } });
        await db.preventiveMaintenanceTask.updateMany({ where: { templateId: template.id, status: { in: ["DUE", "UPCOMING", "OVERDUE"] } }, data: { dueDate: firstDueDate, status: derivedTaskStatus({ status: "UPCOMING", dueDate: firstDueDate }) } });
        result.push(template);
      }
      return result;
    }, { timeout: 60000 });
    for (const template of templates) await ensureOpenTaskForTemplate(template);
    await writeAuditLog({ request, propertyId: input.propertyId, entityType: "PM_STARTER", entityId: input.key, action: "PM_STARTER_CONFIGURED", message: `${input.enabled ? "Enabled/updated" : "Paused"} ${starter.name}; ${templates.length} schedules` });
    return { updated: templates.length, enabled: input.enabled };
  });
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
      select: { id: true, status: true, dueDate: true, completedAt: true },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    });
    const normalized = tasks.map((task) => ({ ...task, status: derivedTaskStatus(task) }));
    const upcoming = normalized.filter((task) => task.status === "UPCOMING" || task.status === "DUE").slice(0, 10);
    const overdue = normalized.filter((task) => task.status === "OVERDUE").slice(0, 10);
    const completed = normalized.filter((task) => task.status === "COMPLETED" || task.status === "SKIPPED")
      .sort((left, right) => (right.completedAt?.getTime() ?? 0) - (left.completedAt?.getTime() ?? 0)).slice(0, 10);
    const visibleIds = [...upcoming, ...overdue, ...completed].map(task => task.id);
    const visibleTasks = visibleIds.length ? await prisma.preventiveMaintenanceTask.findMany({
      where: { propertyId: scoped.where, id: { in: visibleIds } },
      include: { property: true, template: true, attachments: true },
    }) : [];
    await syncTaskStatuses(visibleTasks);
    const details = new Map(visibleTasks.map(task => [task.id, { ...task, status: derivedTaskStatus(task) }]));
    const hydrate = (selected: typeof normalized) => selected.flatMap(task => {
      const detail = details.get(task.id);
      return detail ? [detail] : [];
    });
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
      upcomingTasks: hydrate(upcoming),
      overdueTasks: hydrate(overdue),
      recentCompletions: hydrate(completed),
      compliance: {
        green: normalized.filter((task) => task.status === "COMPLETED").length,
        yellow: normalized.filter((task) => task.status === "DUE" || task.status === "UPCOMING").length,
        red: normalized.filter((task) => task.status === "OVERDUE" || task.status === "SKIPPED").length,
      },
    };
  });

  app.get("/pm/templates", async (request, reply) => {
    if (!requirePmAccess(request, reply, "view")) return;
    const query = z.object({ propertyId: z.string().optional(), includeArchived: booleanFlag.optional() }).parse(request.query);
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
    if (input.propertyId !== undefined && input.propertyId !== existing.propertyId) {
      throw Object.assign(new Error("PM template property cannot be changed by editing. Create a template in the correct property instead."), { statusCode: 409 });
    }
    const nextAssignedRole = input.assignedRole ?? existing.assignedRole;
    const assignmentChanged = "assignedUserId" in input || nextAssignedRole !== existing.assignedRole;
    const assignedUser = assignmentChanged
      ? await findAssignablePmUser({
        propertyId: existing.propertyId,
        assignedRole: nextAssignedRole,
        assignedUserId: input.assignedUserId === undefined ? existing.assignedUserId : input.assignedUserId,
      })
      : null;
    const template = await prisma.preventiveMaintenanceTemplate.update({
      where: { id },
      data: {
        ...input,
        assignedUserId: assignmentChanged ? assignedUser?.id ?? null : undefined,
        assignedUserName: assignmentChanged ? assignedUser?.fullName ?? null : undefined,
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
    if (["COMPLETED", "SKIPPED"].includes(task.status)) return reply.code(409).send({ message: "This PM task is already closed" });
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
      where: { id, status: { in: ["DUE", "UPCOMING", "OVERDUE"] } },
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
    await createTaskFromTemplate(updated.template, templateNextDueDate(updated.template, updated.template.firstDueDate ? updated.dueDate : completedAt));
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
    if (["COMPLETED", "SKIPPED"].includes(task.status)) return reply.code(409).send({ message: "This PM task is already closed" });
    const completedAt = new Date();
    const updated = await prisma.preventiveMaintenanceTask.update({
      where: { id, status: { in: ["DUE", "UPCOMING", "OVERDUE"] } },
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
    await createTaskFromTemplate(updated.template, templateNextDueDate(updated.template, updated.template.firstDueDate ? updated.dueDate : completedAt));
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
    const result = await getPmReportTasks(request, query);
    if (result.denied) return reply.code(403).send({ message: "Property access denied" });
    const normalized = result.tasks;
    const scopeLabel = await reportScopeLabel(query.propertyId);
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
    })), { header: true, escape_formulas: true });
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="${sanitizeFilename(`makereadyos-${scopeLabel}-pm-report.csv`)}"`);
    return reply.send(csv);
  });

  app.get("/pm/export.xls", async (request, reply) => {
    if (!requirePmAccess(request, reply, "view")) return;
    const query = preventiveMaintenanceHistoryQuerySchema.parse(request.query);
    const result = await getPmReportTasks(request, query);
    if (result.denied) return reply.code(403).send({ message: "Property access denied" });
    const normalized = result.tasks;
    const scopeLabel = await reportScopeLabel(query.propertyId);
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
    ]);
    reply.header("Content-Type", "application/vnd.ms-excel; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="${sanitizeFilename(`makereadyos-${scopeLabel}-pm-report.xls`)}"`);
    return reply.send(stringify([header, ...rows], { delimiter: "\t", escape_formulas: true }));
  });

  app.get("/pm/report.html", async (request, reply) => {
    if (!requirePmAccess(request, reply, "view")) return;
    const query = preventiveMaintenanceHistoryQuerySchema.parse(request.query);
    const result = await getPmReportTasks(request, query);
    if (result.denied) return reply.code(403).send({ message: "Property access denied" });
    const normalized = result.tasks;
    const scopeLabel = await reportScopeLabel(query.propertyId);
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
  <p>${htmlEscape(scopeLabel)} | Generated ${htmlEscape(new Date().toLocaleString())}</p>
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
    const result = await getPmReportTasks(request, query);
    if (result.denied) return reply.code(403).send({ message: "Property access denied" });
    const normalized = result.tasks;
    const scopeLabel = await reportScopeLabel(query.propertyId);
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
  <p>${htmlEscape(scopeLabel)} | Generated ${htmlEscape(new Date().toLocaleString())}</p>
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
    reply.header("Content-Disposition", `inline; filename="${sanitizeFilename(`makereadyos-${scopeLabel}-pm-report.pdf`)}"`);
    return reply.send(pdf);
  });
}
