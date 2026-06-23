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
import { renderPdfFromHtml } from "../lib/pdf.js";
import { prisma } from "../lib/prisma.js";
import { ensureStoredUploadParent, removeStoredUpload, resolveStoredUploadPath, routedStoredName } from "../lib/uploadStorage.js";
import { queueWebhookEvent } from "../lib/webhookQueue.js";

const pestTypes = [
  "Pest Not Stated",
  "Roaches",
  "Ants",
  "Spiders",
  "Rats",
  "Mice",
  "Rodents",
  "Fleas",
  "Bed Bugs",
  "Wasps",
  "Bees",
  "Gnats",
  "Flies",
  "Termites",
  "Other",
] as const;
const pestStatuses = ["Open", "Scheduled", "Treated", "Needs Follow Up", "Closed", "Cancelled", "Archived"] as const;
const pestPriorities = ["Low", "Normal", "High", "Critical"] as const;
const pestSources = ["Third Party Work Order", "Leasing", "Resident Request", "Maintenance", "Manager", "Inspection", "Preventive Maintenance", "Make Ready", "Property Walk", "Other"] as const;
const pestPhotoTypes = ["ISSUE", "TREATMENT", "ACCESS_ISSUE", "GENERAL"] as const;
const allowedAttachmentExtensions = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".heic", ".heif", ".bmp", ".tif", ".tiff", ".pdf"]);
const allowedAttachmentTypes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif", "image/heic", "image/heif", "image/bmp", "image/tiff", "application/pdf"]);

export const pestIssueSchema = z.object({
  propertyId: z.string().min(1),
  unitId: z.string().trim().min(1).nullable().optional(),
  makeReadyItemId: z.string().trim().min(1).nullable().optional(),
  building: z.string().trim().max(120).nullable().optional(),
  area: z.string().trim().max(160).nullable().optional(),
  requestDate: z.coerce.date().optional(),
  pestType: z.enum(pestTypes),
  additionalPestType: z.string().trim().max(80).nullable().optional(),
  status: z.enum(pestStatuses).optional(),
  priority: z.enum(pestPriorities).optional(),
  source: z.enum(pestSources).optional(),
  vendorId: z.string().trim().min(1).nullable().optional(),
  thirdPartyWorkOrderNumber: z.string().trim().max(120).nullable().optional(),
  reportedBy: z.string().trim().max(120).nullable().optional(),
  assignedUserId: z.string().trim().min(1).nullable().optional(),
  treatmentDate: z.coerce.date().nullable().optional(),
  followUpRequired: z.boolean().optional(),
  followUpDate: z.coerce.date().nullable().optional(),
  followUpNotes: z.string().trim().max(2000).nullable().optional(),
  description: z.string().trim().max(4000).nullable().optional(),
});

export const pestIssuePatchSchema = pestIssueSchema.partial();

export const pestIssueQuerySchema = z.object({
  propertyId: z.string().optional(),
  unitId: z.string().optional(),
  makeReadyItemId: z.string().optional(),
  status: z.enum(pestStatuses).optional(),
  pestType: z.enum(pestTypes).optional(),
  vendorId: z.string().optional(),
  assignedUserId: z.string().optional(),
  source: z.enum(pestSources).optional(),
  includeArchived: z.coerce.boolean().optional(),
  makeReadyOnly: z.coerce.boolean().optional(),
  recurringOnly: z.coerce.boolean().optional(),
  q: z.string().trim().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});

export const pestVendorSchema = z.object({
  propertyId: z.string().min(1),
  vendorName: z.string().trim().min(1).max(180),
  primaryContact: z.string().trim().max(180).nullable().optional(),
  phone: z.string().trim().max(60).nullable().optional(),
  email: z.string().trim().email().max(180).nullable().optional(),
  emergencyPhone: z.string().trim().max(60).nullable().optional(),
  serviceDay: z.string().trim().max(80).nullable().optional(),
  serviceFrequency: z.string().trim().max(80).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

export const pestNoteSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

export const pestCloseSchema = z.object({
  closingNotes: z.string().trim().min(1).max(2000),
  treatmentDate: z.coerce.date().nullable().optional(),
  followUpDate: z.coerce.date().nullable().optional(),
});

export const pestArchiveSchema = z.object({
  archiveNotes: z.string().trim().max(2000).nullable().optional(),
});

export const pestRecurringDismissSchema = z.object({
  notes: z.string().trim().min(1).max(2000),
});

function pestRoleAccess(role: UserRole) {
  if (role === UserRole.ADMIN) return { view: true, edit: true, admin: true };
  if (role === UserRole.MANAGER || role === UserRole.TECH || role === UserRole.LEASING) return { view: true, edit: true, admin: false };
  if (role === UserRole.CLEANER || role === UserRole.VIEWER) return { view: true, edit: false, admin: false };
  return { view: false, edit: false, admin: false };
}

function requirePestAccess(request: FastifyRequest, reply: FastifyReply, level: "view" | "edit" | "admin") {
  const access = pestRoleAccess(request.currentUser!.role);
  if (!access[level]) {
    reply.code(403).send({ message: "Pest Control access denied" });
    return false;
  }
  return true;
}

function propertyScopeWhere(request: FastifyRequest, propertyId?: string) {
  const scoped = scopedAllowedPropertyIds(request);
  if (propertyId && scoped !== null && !scoped.includes(propertyId)) return { denied: true as const, where: undefined };
  return { denied: false as const, where: propertyId ?? (scoped === null ? undefined : { in: scoped }) };
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

function sanitizeFilename(filename: string) {
  return basename(filename).replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 180) || "pest-file";
}

function htmlEscape(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

async function resolveLinkedMakeReadyItem(input: {
  propertyId: string;
  unitId?: string | null;
  makeReadyItemId?: string | null;
}) {
  if (input.makeReadyItemId) {
    const item = await prisma.makeReadyItem.findUnique({ where: { id: input.makeReadyItemId } });
    if (!item || item.propertyId !== input.propertyId) {
      throw Object.assign(new Error("Linked make-ready item not found for this property"), { statusCode: 400 });
    }
    return item;
  }
  if (!input.unitId) return null;
  return prisma.makeReadyItem.findFirst({
    where: {
      propertyId: input.propertyId,
      unitId: input.unitId,
      isArchived: false,
    },
    orderBy: [{ updatedAt: "desc" }],
  });
}

async function syncMakeReadyPestState(makeReadyItemId: string | null | undefined) {
  if (!makeReadyItemId) return;
  const openIssues = await prisma.pestIssue.findMany({
    where: {
      makeReadyItemId,
      isArchived: false,
      status: { notIn: ["Closed", "Cancelled", "Archived"] },
    },
    orderBy: [{ requestDate: "desc" }, { updatedAt: "desc" }],
  });
  const recentTreated = await prisma.pestIssue.findFirst({
    where: { makeReadyItemId, isArchived: false, OR: [{ treatmentDate: { not: null } }, { status: { in: ["Closed", "Treated"] } }] },
    orderBy: [{ treatmentDate: "desc" }, { updatedAt: "desc" }],
  });
  let pestStatus = "NONE";
  let pestTreated: string | null = null;
  if (openIssues.length) {
    pestStatus = openIssues[0].pestType;
    if (openIssues[0].treatmentDate) pestTreated = "TREATED";
  } else if (recentTreated) {
    pestStatus = "TREATED";
    pestTreated = "TREATED";
  }
  await prisma.makeReadyItem.update({
    where: { id: makeReadyItemId },
    data: { pestStatus, pestTreated },
  });
}

async function applyRecurringFlags(issueId: string, unitId: string | null | undefined) {
  if (!unitId) return;
  const now = new Date();
  const ninetyDays = new Date(now);
  ninetyDays.setDate(ninetyDays.getDate() - 90);
  const yearAgo = new Date(now);
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const [count90, countYear] = await Promise.all([
    prisma.pestIssue.count({
      where: {
        unitId,
        isArchived: false,
        requestDate: { gte: ninetyDays },
      },
    }),
    prisma.pestIssue.count({
      where: {
        unitId,
        requestDate: { gte: yearAgo },
      },
    }),
  ]);
  await prisma.pestIssue.update({
    where: { id: issueId },
    data: {
      recurringConcern: count90 >= 2,
      managerReviewRequired: countYear >= 3,
    },
  });
}

function issueWhere(query: z.infer<typeof pestIssueQuerySchema>, request: FastifyRequest) {
  const scoped = propertyScopeWhere(request, query.propertyId);
  if (scoped.denied) {
    throw Object.assign(new Error("Property access denied"), { statusCode: 403 });
  }
  const where: Record<string, unknown> = {
    propertyId: scoped.where,
    ...(query.includeArchived ? {} : { isArchived: false }),
    ...(query.unitId ? { unitId: query.unitId } : {}),
    ...(query.makeReadyItemId ? { makeReadyItemId: query.makeReadyItemId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.pestType ? { pestType: query.pestType } : {}),
    ...(query.vendorId ? { vendorId: query.vendorId } : {}),
    ...(query.assignedUserId ? { assignedUserId: query.assignedUserId } : {}),
    ...(query.source ? { source: query.source } : {}),
    ...(query.makeReadyOnly ? { makeReadyItemId: { not: null } } : {}),
    ...(query.recurringOnly ? { OR: [{ recurringConcern: true }, { managerReviewRequired: true }] } : {}),
  };
  if (query.from || query.to) {
    where.requestDate = {
      ...(query.from ? { gte: startOfDay(query.from) } : {}),
      ...(query.to ? { lte: endOfDay(query.to) } : {}),
    };
  }
  if (query.q) {
    where.AND = [
      {
        OR: [
          { pestType: { contains: query.q, mode: "insensitive" } },
          { additionalPestType: { contains: query.q, mode: "insensitive" } },
          { area: { contains: query.q, mode: "insensitive" } },
          { building: { contains: query.q, mode: "insensitive" } },
          { description: { contains: query.q, mode: "insensitive" } },
          { thirdPartyWorkOrderNumber: { contains: query.q, mode: "insensitive" } },
          { reportedBy: { contains: query.q, mode: "insensitive" } },
          { unit: { is: { number: { contains: query.q, mode: "insensitive" } } } },
          { vendor: { is: { vendorName: { contains: query.q, mode: "insensitive" } } } },
          { notes: { some: { body: { contains: query.q, mode: "insensitive" } } } },
        ],
      },
    ];
  }
  return where;
}

function reportRows(issues: Array<{
  property: { name: string; code: string };
  unit: { number: string } | null;
  vendor: { vendorName: string | null } | null;
  assignedUser: { fullName: string } | null;
} & Record<string, unknown>>) {
  return issues.map((issue) => ({
    property: issue.property.code,
    unitOrArea: issue.unit ? issue.unit.number : String(issue.area ?? ""),
    building: String(issue.building ?? ""),
    pestType: String(issue.pestType ?? ""),
    additionalPestType: String(issue.additionalPestType ?? ""),
    status: String(issue.status ?? ""),
    priority: String(issue.priority ?? ""),
    source: String(issue.source ?? ""),
    vendor: issue.vendor?.vendorName ?? "",
    assignedUser: issue.assignedUser?.fullName ?? "",
    requestDate: issue.requestDate instanceof Date ? issue.requestDate.toISOString().slice(0, 10) : "",
    treatmentDate: issue.treatmentDate instanceof Date ? issue.treatmentDate.toISOString().slice(0, 10) : "",
    followUpDate: issue.followUpDate instanceof Date ? issue.followUpDate.toISOString().slice(0, 10) : "",
    recurring: issue.recurringConcern ? "Yes" : "",
    managerReview: issue.managerReviewRequired ? "Yes" : "",
    workOrder: String(issue.thirdPartyWorkOrderNumber ?? ""),
    notes: String(issue.description ?? ""),
  }));
}

export async function pestControlRoutes(app: FastifyInstance) {
  app.get("/pest/overview", async (request, reply) => {
    if (!requirePestAccess(request, reply, "view")) return;
    const { propertyId } = z.object({ propertyId: z.string().optional() }).parse(request.query);
    const scoped = propertyScopeWhere(request, propertyId);
    if (scoped.denied) return reply.code(403).send({ message: "Property access denied" });
    const where = { propertyId: scoped.where, isArchived: false };
    const today = startOfDay();
    const [issues, vendors, defaultVendor] = await Promise.all([
      prisma.pestIssue.findMany({
        where,
        include: {
          property: true,
          unit: true,
          vendor: true,
          assignedUser: { select: { id: true, fullName: true } },
          makeReadyItem: { select: { id: true, unitNumber: true, moveInDate: true } },
          notes: { orderBy: { createdAt: "desc" }, take: 3 },
          attachments: { orderBy: { createdAt: "desc" } },
        },
        orderBy: [{ requestDate: "desc" }, { updatedAt: "desc" }],
      }),
      prisma.pestVendor.findMany({
        where: {
          propertyId: scoped.where,
          isActive: true,
        },
        orderBy: [{ isDefault: "desc" }, { vendorName: "asc" }],
      }),
      prisma.pestVendor.findFirst({
        where: { propertyId: scoped.where, isActive: true, isDefault: true },
      }),
    ]);
    const openStatuses = ["Open", "Scheduled", "Needs Follow Up", "Treated"];
    const openRequests = issues.filter((issue) => openStatuses.includes(issue.status));
    const dueFollowUps = issues.filter((issue) => issue.followUpDate && issue.followUpDate >= today && issue.status === "Needs Follow Up");
    const overdueFollowUps = issues.filter((issue) => issue.followUpDate && issue.followUpDate < today && issue.status === "Needs Follow Up");
    const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const recurringMap = new Set(issues.filter((issue) => issue.unitId && (issue.recurringConcern || issue.managerReviewRequired)).map((issue) => issue.unitId!));
    return {
      summary: {
        openRequests: openRequests.length,
        scheduled: issues.filter((issue) => issue.status === "Scheduled").length,
        needsFollowUp: issues.filter((issue) => issue.status === "Needs Follow Up").length,
        overdueFollowUps: overdueFollowUps.length,
        dueFollowUps: dueFollowUps.length,
        makeReadyPending: issues.filter((issue) => issue.makeReadyItemId && !["Closed", "Cancelled", "Archived"].includes(issue.status)).length,
        closedThisMonth: issues.filter((issue) => issue.closedAt && issue.closedAt >= currentMonth).length,
        recurringUnits: recurringMap.size,
      },
      recentRequests: issues.slice(0, 10),
      recentTreatments: issues.filter((issue) => issue.treatmentDate).slice(0, 10),
      upcomingFollowUps: dueFollowUps.concat(overdueFollowUps).sort((a, b) => (a.followUpDate?.getTime() ?? 0) - (b.followUpDate?.getTime() ?? 0)).slice(0, 10),
      vendors,
      defaultVendor,
      pestTypes,
      statuses: pestStatuses,
      priorities: pestPriorities,
      sources: pestSources,
    };
  });

  app.get("/pest/issues", async (request, reply) => {
    if (!requirePestAccess(request, reply, "view")) return;
    const query = pestIssueQuerySchema.parse(request.query);
    const where = issueWhere(query, request);
    const [total, issues] = await Promise.all([
      prisma.pestIssue.count({ where }),
      prisma.pestIssue.findMany({
        where,
        include: {
          property: true,
          unit: true,
          vendor: true,
          assignedUser: { select: { id: true, fullName: true } },
          makeReadyItem: { select: { id: true, unitNumber: true, moveInDate: true, makeReadyDate: true } },
          notes: { orderBy: { createdAt: "desc" }, take: 5 },
          attachments: { orderBy: { createdAt: "desc" } },
        },
        orderBy: [{ requestDate: "desc" }, { updatedAt: "desc" }],
        skip: query.offset,
        take: query.limit,
      }),
    ]);
    return {
      issues,
      pagination: {
        total,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + issues.length < total,
      },
    };
  });

  app.post("/pest/issues", async (request, reply) => {
    if (!requirePestAccess(request, reply, "edit")) return;
    const input = pestIssueSchema.parse(request.body);
    if (!input.unitId && !input.area?.trim()) {
      return reply.code(400).send({ message: "Unit or area is required" });
    }
    await assertPropertyAccess(request, input.propertyId);
    const linkedItem = await resolveLinkedMakeReadyItem(input);
    const issue = await prisma.pestIssue.create({
      data: {
        propertyId: input.propertyId,
        unitId: input.unitId || linkedItem?.unitId || null,
        makeReadyItemId: linkedItem?.id ?? input.makeReadyItemId ?? null,
        building: input.building ?? null,
        area: input.area ?? null,
        requestDate: input.requestDate ?? new Date(),
        pestType: input.pestType,
        additionalPestType: input.additionalPestType ?? null,
        status: input.followUpRequired ? "Needs Follow Up" : input.status ?? "Open",
        priority: input.priority ?? "Normal",
        source: input.source ?? "Leasing",
        vendorId: input.vendorId ?? null,
        thirdPartyWorkOrderNumber: input.thirdPartyWorkOrderNumber ?? null,
        reportedBy: input.reportedBy ?? request.currentUser!.fullName,
        assignedUserId: input.assignedUserId ?? null,
        treatmentDate: input.treatmentDate ?? null,
        followUpRequired: input.followUpRequired ?? Boolean(input.followUpDate),
        followUpDate: input.followUpDate ?? null,
        followUpNotes: input.followUpNotes ?? null,
        description: input.description ?? null,
        createdById: request.currentUser!.id,
        updatedById: request.currentUser!.id,
      },
      include: {
        property: true,
        unit: true,
        vendor: true,
        assignedUser: { select: { id: true, fullName: true } },
        makeReadyItem: { select: { id: true, unitNumber: true, moveInDate: true } },
        notes: true,
        attachments: true,
      },
    });
    await applyRecurringFlags(issue.id, issue.unitId);
    await syncMakeReadyPestState(issue.makeReadyItemId);
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: issue.propertyId,
      entityType: "PEST_ISSUE",
      entityId: issue.id,
      action: "PEST_ISSUE_CREATED",
      message: `Created pest request ${issue.pestType}`,
    });
    await queueWebhookEvent({
      eventType: "pest.issue.created",
      propertyId: issue.propertyId,
      itemId: issue.makeReadyItemId,
      actorUserId: request.currentUser!.id,
      data: {
        id: issue.id,
        propertyId: issue.propertyId,
        unitId: issue.unitId,
        makeReadyItemId: issue.makeReadyItemId,
        pestType: issue.pestType,
        status: issue.status,
        priority: issue.priority,
      },
    });
    reply.code(201);
    return { issue };
  });

  app.patch("/pest/issues/:id", async (request, reply) => {
    if (!requirePestAccess(request, reply, "edit")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = pestIssuePatchSchema.parse(request.body);
    const existing = await prisma.pestIssue.findUnique({ where: { id } });
    if (!existing) throw Object.assign(new Error("Pest request not found"), { statusCode: 404 });
    await assertPropertyAccess(request, existing.propertyId);
    const linkedItem = await resolveLinkedMakeReadyItem({
      propertyId: existing.propertyId,
      unitId: input.unitId === undefined ? existing.unitId : input.unitId,
      makeReadyItemId: input.makeReadyItemId === undefined ? existing.makeReadyItemId : input.makeReadyItemId,
    });
    const followUpRequired = input.followUpRequired ?? existing.followUpRequired;
    const nextStatus = input.status ?? (followUpRequired ? "Needs Follow Up" : existing.status);
    const issue = await prisma.pestIssue.update({
      where: { id },
      data: {
        unitId: input.unitId === undefined ? existing.unitId : input.unitId,
        makeReadyItemId: linkedItem?.id ?? (input.makeReadyItemId === undefined ? existing.makeReadyItemId : input.makeReadyItemId),
        building: input.building === undefined ? existing.building : input.building,
        area: input.area === undefined ? existing.area : input.area,
        requestDate: input.requestDate ?? existing.requestDate,
        pestType: input.pestType ?? existing.pestType,
        additionalPestType: input.additionalPestType === undefined ? existing.additionalPestType : input.additionalPestType,
        status: nextStatus,
        priority: input.priority ?? existing.priority,
        source: input.source ?? existing.source,
        vendorId: input.vendorId === undefined ? existing.vendorId : input.vendorId,
        thirdPartyWorkOrderNumber: input.thirdPartyWorkOrderNumber === undefined ? existing.thirdPartyWorkOrderNumber : input.thirdPartyWorkOrderNumber,
        reportedBy: input.reportedBy === undefined ? existing.reportedBy : input.reportedBy,
        assignedUserId: input.assignedUserId === undefined ? existing.assignedUserId : input.assignedUserId,
        treatmentDate: input.treatmentDate === undefined ? existing.treatmentDate : input.treatmentDate,
        followUpRequired,
        followUpDate: input.followUpDate === undefined ? existing.followUpDate : input.followUpDate,
        followUpNotes: input.followUpNotes === undefined ? existing.followUpNotes : input.followUpNotes,
        description: input.description === undefined ? existing.description : input.description,
        updatedById: request.currentUser!.id,
        ...(nextStatus === "Closed" && !existing.closedAt ? { closedAt: new Date(), closedById: request.currentUser!.id } : {}),
      },
      include: {
        property: true,
        unit: true,
        vendor: true,
        assignedUser: { select: { id: true, fullName: true } },
        makeReadyItem: { select: { id: true, unitNumber: true, moveInDate: true } },
        notes: { orderBy: { createdAt: "desc" } },
        attachments: { orderBy: { createdAt: "desc" } },
      },
    });
    await applyRecurringFlags(issue.id, issue.unitId);
    await syncMakeReadyPestState(existing.makeReadyItemId);
    await syncMakeReadyPestState(issue.makeReadyItemId);
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: issue.propertyId,
      entityType: "PEST_ISSUE",
      entityId: issue.id,
      action: "PEST_ISSUE_UPDATED",
      message: `Updated pest request ${issue.pestType}`,
    });
    await queueWebhookEvent({
      eventType: "pest.issue.updated",
      propertyId: issue.propertyId,
      itemId: issue.makeReadyItemId,
      actorUserId: request.currentUser!.id,
      data: {
        id: issue.id,
        propertyId: issue.propertyId,
        unitId: issue.unitId,
        makeReadyItemId: issue.makeReadyItemId,
        pestType: issue.pestType,
        status: issue.status,
        priority: issue.priority,
      },
    });
    return { issue };
  });

  app.post("/pest/issues/:id/notes", async (request, reply) => {
    if (!requirePestAccess(request, reply, "edit")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = pestNoteSchema.parse(request.body);
    const issue = await prisma.pestIssue.findUnique({ where: { id } });
    if (!issue) throw Object.assign(new Error("Pest request not found"), { statusCode: 404 });
    await assertPropertyAccess(request, issue.propertyId);
    const note = await prisma.pestIssueNote.create({
      data: {
        issueId: issue.id,
        propertyId: issue.propertyId,
        authorUserId: request.currentUser!.id,
        authorName: request.currentUser!.fullName,
        body: input.body,
      },
    });
    await prisma.pestIssue.update({
      where: { id: issue.id },
      data: { updatedById: request.currentUser!.id },
    });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: issue.propertyId,
      entityType: "PEST_ISSUE_NOTE",
      entityId: note.id,
      action: "PEST_ISSUE_NOTE_CREATED",
      message: `Added pest note to ${issue.pestType}`,
    });
    reply.code(201);
    return { note };
  });

  app.post("/pest/issues/:id/close", async (request, reply) => {
    if (!requirePestAccess(request, reply, "edit")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = pestCloseSchema.parse(request.body);
    const existing = await prisma.pestIssue.findUnique({ where: { id } });
    if (!existing) throw Object.assign(new Error("Pest request not found"), { statusCode: 404 });
    await assertPropertyAccess(request, existing.propertyId);
    const issue = await prisma.pestIssue.update({
      where: { id },
      data: {
        status: input.followUpDate ? "Needs Follow Up" : "Closed",
        closedNotes: input.closingNotes,
        treatmentDate: input.treatmentDate ?? existing.treatmentDate,
        followUpRequired: Boolean(input.followUpDate),
        followUpDate: input.followUpDate ?? null,
        closedAt: input.followUpDate ? null : new Date(),
        closedById: input.followUpDate ? null : request.currentUser!.id,
        updatedById: request.currentUser!.id,
      },
      include: {
        property: true,
        unit: true,
        vendor: true,
        assignedUser: { select: { id: true, fullName: true } },
        makeReadyItem: { select: { id: true, unitNumber: true, moveInDate: true } },
        notes: { orderBy: { createdAt: "desc" } },
        attachments: { orderBy: { createdAt: "desc" } },
      },
    });
    await prisma.pestIssueNote.create({
      data: {
        issueId: issue.id,
        propertyId: issue.propertyId,
        authorUserId: request.currentUser!.id,
        authorName: request.currentUser!.fullName,
        body: input.closingNotes,
      },
    });
    await syncMakeReadyPestState(issue.makeReadyItemId);
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: issue.propertyId,
      entityType: "PEST_ISSUE",
      entityId: issue.id,
      action: input.followUpDate ? "PEST_ISSUE_FOLLOW_UP_SET" : "PEST_ISSUE_CLOSED",
      message: `${input.followUpDate ? "Set follow up for" : "Closed"} pest request ${issue.pestType}`,
    });
    return { issue };
  });

  app.post("/pest/issues/:id/archive", async (request, reply) => {
    if (!requirePestAccess(request, reply, "edit")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = pestArchiveSchema.parse(request.body);
    const existing = await prisma.pestIssue.findUnique({ where: { id } });
    if (!existing) throw Object.assign(new Error("Pest request not found"), { statusCode: 404 });
    await assertPropertyAccess(request, existing.propertyId);
    const issue = await prisma.pestIssue.update({
      where: { id },
      data: {
        isArchived: true,
        status: "Archived",
        archivedAt: new Date(),
        archivedById: request.currentUser!.id,
        archiveNotes: input.archiveNotes ?? null,
        updatedById: request.currentUser!.id,
      },
    });
    await syncMakeReadyPestState(issue.makeReadyItemId);
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: issue.propertyId,
      entityType: "PEST_ISSUE",
      entityId: issue.id,
      action: "PEST_ISSUE_ARCHIVED",
      message: `Archived pest request ${issue.pestType}`,
    });
    await queueWebhookEvent({
      eventType: "pest.issue.archived",
      propertyId: issue.propertyId,
      itemId: issue.makeReadyItemId,
      actorUserId: request.currentUser!.id,
      data: {
        id: issue.id,
        propertyId: issue.propertyId,
        unitId: issue.unitId,
        makeReadyItemId: issue.makeReadyItemId,
        pestType: issue.pestType,
        status: issue.status,
        archivedAt: issue.archivedAt?.toISOString?.() ?? null,
      },
    });
    return { issue };
  });

  app.post("/pest/issues/:id/dismiss-recurring", async (request, reply) => {
    if (!requirePestAccess(request, reply, "edit")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = pestRecurringDismissSchema.parse(request.body);
    const existing = await prisma.pestIssue.findUnique({ where: { id } });
    if (!existing) throw Object.assign(new Error("Pest request not found"), { statusCode: 404 });
    await assertPropertyAccess(request, existing.propertyId);
    const issue = await prisma.pestIssue.update({
      where: { id },
      data: {
        recurringConcern: false,
        managerReviewRequired: false,
        recurringDismissedAt: new Date(),
        recurringDismissalNotes: input.notes,
        updatedById: request.currentUser!.id,
      },
    });
    await prisma.pestIssueNote.create({
      data: {
        issueId: issue.id,
        propertyId: issue.propertyId,
        authorUserId: request.currentUser!.id,
        authorName: request.currentUser!.fullName,
        body: `Recurring concern dismissed: ${input.notes}`,
      },
    });
    return { issue };
  });

  app.post("/pest/issues/:id/attachments", async (request, reply) => {
    if (!requirePestAccess(request, reply, "edit")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const issue = await prisma.pestIssue.findUnique({
      where: { id },
      include: { property: true },
    });
    if (!issue) throw Object.assign(new Error("Pest request not found"), { statusCode: 404 });
    await assertPropertyAccess(request, issue.propertyId);
    const upload = await request.file();
    if (!upload) return reply.code(400).send({ message: "Photo or PDF is required" });
    const extension = extname(upload.filename).toLowerCase();
    if (!allowedAttachmentExtensions.has(extension) || !allowedAttachmentTypes.has(upload.mimetype)) {
      return reply.code(415).send({ message: "Unsupported pest attachment type. Upload images or PDFs." });
    }
    const photoTypeRaw = String((upload.fields.photoType as { value?: string } | undefined)?.value ?? "GENERAL").toUpperCase();
    const photoType = pestPhotoTypes.includes(photoTypeRaw as typeof pestPhotoTypes[number]) ? photoTypeRaw as typeof pestPhotoTypes[number] : "GENERAL";
    const caption = String((upload.fields.caption as { value?: string } | undefined)?.value ?? "").trim() || null;
    const storedName = routedStoredName(issue.property, `pest/${randomUUID()}${extension}`);
    await ensureStoredUploadParent(storedName);
    await pipeline(upload.file, createWriteStream(resolveStoredUploadPath(storedName)));
    const attachment = await prisma.pestIssueAttachment.create({
      data: {
        issueId: issue.id,
        propertyId: issue.propertyId,
        uploadedById: request.currentUser!.id,
        uploaderName: request.currentUser!.fullName,
        photoType,
        caption,
        originalName: upload.filename,
        storedName,
        mimeType: upload.mimetype,
        sizeBytes: upload.file.bytesRead,
      },
    });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: issue.propertyId,
      entityType: "PEST_ISSUE_ATTACHMENT",
      entityId: attachment.id,
      action: "PEST_ISSUE_ATTACHMENT_CREATED",
      message: `Uploaded pest attachment ${attachment.originalName}`,
    });
    reply.code(201);
    return { attachment };
  });

  app.get("/pest/attachments/:id/download", async (request, reply) => {
    if (!requirePestAccess(request, reply, "view")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const attachment = await prisma.pestIssueAttachment.findUnique({ where: { id } });
    if (!attachment) throw Object.assign(new Error("Pest attachment not found"), { statusCode: 404 });
    await assertPropertyAccess(request, attachment.propertyId);
    reply.header("Content-Type", attachment.mimeType);
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Content-Disposition", `inline; filename="${sanitizeFilename(attachment.originalName)}"`);
    return reply.send(createReadStream(resolveStoredUploadPath(attachment.storedName)));
  });

  app.delete("/pest/attachments/:id", async (request, reply) => {
    if (!requirePestAccess(request, reply, "edit")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const attachment = await prisma.pestIssueAttachment.findUnique({ where: { id } });
    if (!attachment) throw Object.assign(new Error("Pest attachment not found"), { statusCode: 404 });
    await assertPropertyAccess(request, attachment.propertyId);
    await prisma.pestIssueAttachment.delete({ where: { id } });
    await removeStoredUpload(attachment.storedName);
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: attachment.propertyId,
      entityType: "PEST_ISSUE_ATTACHMENT",
      entityId: attachment.id,
      action: "PEST_ISSUE_ATTACHMENT_DELETED",
      message: `Deleted pest attachment ${attachment.originalName}`,
    });
    return { ok: true };
  });

  app.get("/pest/vendors", async (request, reply) => {
    if (!requirePestAccess(request, reply, "view")) return;
    const { propertyId } = z.object({ propertyId: z.string().optional() }).parse(request.query);
    const scoped = propertyScopeWhere(request, propertyId);
    if (scoped.denied) return reply.code(403).send({ message: "Property access denied" });
    const vendors = await prisma.pestVendor.findMany({
      where: {
        propertyId: scoped.where,
      },
      orderBy: [{ isDefault: "desc" }, { isActive: "desc" }, { vendorName: "asc" }],
    });
    return { vendors };
  });

  app.post("/pest/vendors", async (request, reply) => {
    if (!requirePestAccess(request, reply, "edit")) return;
    const input = pestVendorSchema.parse(request.body);
    await assertPropertyAccess(request, input.propertyId);
    if (input.isDefault) {
      await prisma.pestVendor.updateMany({
        where: { propertyId: input.propertyId },
        data: { isDefault: false },
      });
    }
    const vendor = await prisma.pestVendor.create({
      data: {
        propertyId: input.propertyId,
        vendorName: input.vendorName,
        primaryContact: input.primaryContact ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        emergencyPhone: input.emergencyPhone ?? null,
        serviceDay: input.serviceDay ?? null,
        serviceFrequency: input.serviceFrequency ?? null,
        notes: input.notes ?? null,
        isActive: input.isActive ?? true,
        isDefault: input.isDefault ?? false,
        createdById: request.currentUser!.id,
        updatedById: request.currentUser!.id,
      },
    });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: vendor.propertyId,
      entityType: "PEST_VENDOR",
      entityId: vendor.id,
      action: "PEST_VENDOR_CREATED",
      message: `Created pest vendor ${vendor.vendorName}`,
    });
    reply.code(201);
    return { vendor };
  });

  app.patch("/pest/vendors/:id", async (request, reply) => {
    if (!requirePestAccess(request, reply, "edit")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = pestVendorSchema.partial().parse(request.body);
    const existing = await prisma.pestVendor.findUnique({ where: { id } });
    if (!existing) throw Object.assign(new Error("Pest vendor not found"), { statusCode: 404 });
    await assertPropertyAccess(request, existing.propertyId);
    if (input.isDefault) {
      await prisma.pestVendor.updateMany({
        where: { propertyId: existing.propertyId },
        data: { isDefault: false },
      });
    }
    const vendor = await prisma.pestVendor.update({
      where: { id },
      data: {
        vendorName: input.vendorName ?? existing.vendorName,
        primaryContact: input.primaryContact === undefined ? existing.primaryContact : input.primaryContact,
        phone: input.phone === undefined ? existing.phone : input.phone,
        email: input.email === undefined ? existing.email : input.email,
        emergencyPhone: input.emergencyPhone === undefined ? existing.emergencyPhone : input.emergencyPhone,
        serviceDay: input.serviceDay === undefined ? existing.serviceDay : input.serviceDay,
        serviceFrequency: input.serviceFrequency === undefined ? existing.serviceFrequency : input.serviceFrequency,
        notes: input.notes === undefined ? existing.notes : input.notes,
        isActive: input.isActive ?? existing.isActive,
        isDefault: input.isDefault ?? existing.isDefault,
        updatedById: request.currentUser!.id,
      },
    });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: vendor.propertyId,
      entityType: "PEST_VENDOR",
      entityId: vendor.id,
      action: "PEST_VENDOR_UPDATED",
      message: `Updated pest vendor ${vendor.vendorName}`,
    });
    return { vendor };
  });

  app.delete("/pest/vendors/:id", async (request, reply) => {
    if (!requirePestAccess(request, reply, "admin")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.pestVendor.findUnique({ where: { id } });
    if (!existing) throw Object.assign(new Error("Pest vendor not found"), { statusCode: 404 });
    await assertPropertyAccess(request, existing.propertyId);
    if (existing.isActive) {
      return reply.code(400).send({ message: "Archive or deactivate the vendor before deleting it permanently" });
    }
    const linkedIssueCount = await prisma.pestIssue.count({ where: { vendorId: id } });
    if (linkedIssueCount > 0) {
      return reply.code(409).send({ message: "Cannot permanently delete a vendor that is still linked to pest issues" });
    }
    await prisma.pestVendor.delete({ where: { id } });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: existing.propertyId,
      entityType: "PEST_VENDOR",
      entityId: existing.id,
      action: "PEST_VENDOR_DELETED",
      message: `Deleted pest vendor ${existing.vendorName}`,
    });
    return { ok: true };
  });

  app.get("/pest/export.csv", async (request, reply) => {
    if (!requirePestAccess(request, reply, "view")) return;
    const query = pestIssueQuerySchema.parse(request.query);
    const where = issueWhere(query, request);
    const issues = await prisma.pestIssue.findMany({
      where,
      include: {
        property: true,
        unit: true,
        vendor: true,
        assignedUser: { select: { fullName: true } },
      },
      orderBy: [{ requestDate: "desc" }],
    });
    const csv = stringify(reportRows(issues), { header: true });
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", "attachment; filename=\"pest-control-report.csv\"");
    return reply.send(csv);
  });

  app.get("/pest/export.xls", async (request, reply) => {
    if (!requirePestAccess(request, reply, "view")) return;
    const query = pestIssueQuerySchema.parse(request.query);
    const where = issueWhere(query, request);
    const issues = await prisma.pestIssue.findMany({
      where,
      include: {
        property: true,
        unit: true,
        vendor: true,
        assignedUser: { select: { fullName: true } },
      },
      orderBy: [{ requestDate: "desc" }],
    });
    const rows = reportRows(issues);
    const header = ["Property", "Unit / Area", "Building", "Pest", "Additional Pest", "Status", "Priority", "Source", "Vendor", "Assigned User", "Request Date", "Treatment Date", "Follow Up Date", "Recurring", "Manager Review", "Work Order", "Notes"];
    const body = rows.map((row) => [
      row.property,
      row.unitOrArea,
      row.building,
      row.pestType,
      row.additionalPestType,
      row.status,
      row.priority,
      row.source,
      row.vendor,
      row.assignedUser,
      row.requestDate,
      row.treatmentDate,
      row.followUpDate,
      row.recurring,
      row.managerReview,
      row.workOrder,
      row.notes,
    ].map((value) => {
      const text = value === null || value === undefined ? "" : String(value);
      return /[\t"\n\r]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
    }).join("\t"));
    reply.header("Content-Type", "application/vnd.ms-excel; charset=utf-8");
    reply.header("Content-Disposition", "attachment; filename=\"pest-control-report.xls\"");
    return reply.send([header.join("\t"), ...body].join("\n"));
  });

  app.get("/pest/report.html", async (request, reply) => {
    if (!requirePestAccess(request, reply, "view")) return;
    const query = pestIssueQuerySchema.parse(request.query);
    const where = issueWhere(query, request);
    const issues = await prisma.pestIssue.findMany({
      where,
      include: {
        property: true,
        unit: true,
        vendor: true,
        assignedUser: { select: { fullName: true } },
        notes: { orderBy: { createdAt: "desc" }, take: 2 },
        attachments: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: [{ requestDate: "desc" }, { updatedAt: "desc" }],
      take: 150,
    });
    const rows = reportRows(issues);
    const openCount = issues.filter((issue) => ["Open", "Scheduled", "Treated", "Needs Follow Up"].includes(issue.status)).length;
    const followUpCount = issues.filter((issue) => issue.status === "Needs Follow Up").length;
    const recurringCount = issues.filter((issue) => issue.recurringConcern || issue.managerReviewRequired).length;
    reply.header("Content-Type", "text/html; charset=utf-8");
    return reply.send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Pest Control Report</title>
    <style>
      body { font-family: Arial, sans-serif; color: #111827; margin: 24px; background: #f8fafc; }
      h1 { margin: 0 0 8px; font-size: 24px; }
      p { margin: 0 0 14px; color: #4b5563; }
      .kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; margin: 0 0 20px; }
      .kpi { background:#fff; border:1px solid #d1d5db; border-radius:14px; padding:14px; }
      .kpi strong { display:block; font-size:26px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; background:#fff; }
      th, td { border: 1px solid #d1d5db; padding: 6px; text-align: left; vertical-align: top; }
      th { background: #f3f4f6; }
      .muted { color:#6b7280; font-size:10px; }
    </style>
  </head>
  <body>
    <h1>Pest Control Operational Report</h1>
    <p>${htmlEscape(query.propertyId ? "Property filter applied" : "All accessible properties")} | ${htmlEscape(new Date().toLocaleString())}</p>
    <div class="kpis">
      <div class="kpi"><strong>${issues.length}</strong><span>Total issues</span></div>
      <div class="kpi"><strong>${openCount}</strong><span>Open / active</span></div>
      <div class="kpi"><strong>${followUpCount}</strong><span>Needs follow up</span></div>
      <div class="kpi"><strong>${recurringCount}</strong><span>Recurring / manager review</span></div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Property</th>
          <th>Unit / Area</th>
          <th>Pest</th>
          <th>Status / Priority</th>
          <th>Vendor / Assigned</th>
          <th>Dates</th>
          <th>Notes / Flags</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row, index) => {
          const issue = issues[index];
          return `<tr>
            <td>${htmlEscape(row.property)}<div class="muted">${htmlEscape(row.building)}</div></td>
            <td>${htmlEscape(row.unitOrArea)}</td>
            <td>${htmlEscape([row.pestType, row.additionalPestType].filter(Boolean).join(" / "))}</td>
            <td>${htmlEscape(row.status)}<div class="muted">${htmlEscape(row.priority)} / ${htmlEscape(row.source)}</div></td>
            <td>${htmlEscape(row.vendor || "No vendor")}<div class="muted">${htmlEscape(row.assignedUser || "Unassigned")}</div></td>
            <td>Req: ${htmlEscape(row.requestDate)}<br/>Treat: ${htmlEscape(row.treatmentDate || "-")}<br/>Follow Up: ${htmlEscape(row.followUpDate || "-")}</td>
            <td>${htmlEscape(row.notes || issue.notes[0]?.body || "")}<div class="muted">${htmlEscape([
              row.recurring ? "Recurring" : "",
              row.managerReview ? "Manager Review" : "",
              issue.attachments.length ? `${issue.attachments.length} recent attachment` : "",
            ].filter(Boolean).join(" / "))}</div></td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  </body>
</html>`);
  });

  app.get("/pest/report.pdf", async (request, reply) => {
    if (!requirePestAccess(request, reply, "view")) return;
    const query = pestIssueQuerySchema.parse(request.query);
    const where = issueWhere(query, request);
    const issues = await prisma.pestIssue.findMany({
      where,
      include: {
        property: true,
        unit: true,
        vendor: true,
        assignedUser: { select: { fullName: true } },
        attachments: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: [{ requestDate: "desc" }],
      take: 100,
    });
    const rows = reportRows(issues);
    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Pest Control Report</title>
    <style>
      body { font-family: Arial, sans-serif; color: #111827; margin: 24px; }
      h1 { margin: 0 0 12px; font-size: 24px; }
      p { margin: 0 0 12px; color: #4b5563; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th, td { border: 1px solid #d1d5db; padding: 6px; text-align: left; vertical-align: top; }
      th { background: #f3f4f6; }
    </style>
  </head>
  <body>
    <h1>Pest Control Report</h1>
    <p>${htmlEscape(query.propertyId ? `Property filter applied` : "All accessible properties")} | ${htmlEscape(new Date().toLocaleString())}</p>
    <table>
      <thead>
        <tr>
          <th>Property</th>
          <th>Unit / Area</th>
          <th>Pest</th>
          <th>Status</th>
          <th>Vendor</th>
          <th>Request</th>
          <th>Treatment</th>
          <th>Follow Up</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `<tr>
          <td>${htmlEscape(row.property)}</td>
          <td>${htmlEscape(row.unitOrArea)}</td>
          <td>${htmlEscape([row.pestType, row.additionalPestType].filter(Boolean).join(" / "))}</td>
          <td>${htmlEscape(row.status)}</td>
          <td>${htmlEscape(row.vendor)}</td>
          <td>${htmlEscape(row.requestDate)}</td>
          <td>${htmlEscape(row.treatmentDate)}</td>
          <td>${htmlEscape(row.followUpDate)}</td>
          <td>${htmlEscape(row.notes)}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  </body>
</html>`;
    const pdf = await renderPdfFromHtml(html);
    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", "inline; filename=\"pest-control-report.pdf\"");
    return reply.send(pdf);
  });
}
