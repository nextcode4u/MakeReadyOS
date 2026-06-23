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
import { notifyPropertyRoles } from "../lib/notifications.js";
import { renderPdfFromHtml } from "../lib/pdf.js";
import { prisma } from "../lib/prisma.js";
import { ensureStoredUploadParent, removeStoredUpload, resolveStoredUploadPath, routedStoredName } from "../lib/uploadStorage.js";
import { queueWebhookEvent } from "../lib/webhookQueue.js";

const leaseComplianceStatuses = ["Open", "Resident Notified", "Notice Sent", "Violation Needed", "Resolved", "Archived"] as const;
const leaseComplianceNoticeStages = ["None", "Resident Notified", "1st Notice", "2nd Notice", "3rd Notice", "Violation Needed"] as const;
const leaseCompliancePriorities = ["Low", "Normal", "High", "Critical"] as const;
const leaseComplianceSources = ["Property Walk", "Grounds Walk", "Inspection", "Leasing Follow Up", "Manager Review", "Resident Complaint", "Other"] as const;
const leaseCompliancePhotoCategories = ["INITIAL_ISSUE", "STILL_PERSISTS", "RESOLUTION", "GENERAL"] as const;
const allowedAttachmentExtensions = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".heic", ".heif", ".bmp", ".tif", ".tiff", ".pdf"]);
const allowedAttachmentTypes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif", "image/heic", "image/heif", "image/bmp", "image/tiff", "application/pdf"]);

const defaultIssueTypes = [
  { name: "Trash On Patio / Porch", color: "#f97316" },
  { name: "Grill On Patio / Balcony", color: "#dc2626" },
  { name: "Broken Blinds", color: "#eab308" },
  { name: "Unsightly Patio / Balcony", color: "#0ea5e9" },
  { name: "Unauthorized Storage", color: "#8b5cf6" },
  { name: "Pet Waste", color: "#16a34a" },
  { name: "Damaged Screen", color: "#14b8a6" },
  { name: "Unauthorized Decoration", color: "#f43f5e" },
  { name: "Furniture On Patio", color: "#64748b" },
  { name: "Satellite Dish / Cable Issue", color: "#a855f7" },
  { name: "Parking Concern", color: "#3b82f6" },
  { name: "Noise / Nuisance Concern", color: "#ef4444" },
  { name: "Door / Breezeway Item", color: "#06b6d4" },
  { name: "Window Covering Issue", color: "#f59e0b" },
  { name: "Other", color: "#94a3b8" },
] as const;

export const leaseComplianceIssueSchema = z.object({
  propertyId: z.string().min(1),
  unitId: z.string().trim().min(1).nullable().optional(),
  issueTypeId: z.string().trim().min(1).nullable().optional(),
  propertyMapId: z.string().trim().min(1).nullable().optional(),
  building: z.string().trim().max(120).nullable().optional(),
  area: z.string().trim().max(160).nullable().optional(),
  issueTypeName: z.string().trim().min(1).max(160),
  additionalIssueType: z.string().trim().max(160).nullable().optional(),
  status: z.enum(leaseComplianceStatuses).optional(),
  noticeStage: z.enum(leaseComplianceNoticeStages).optional(),
  priority: z.enum(leaseCompliancePriorities).optional(),
  source: z.enum(leaseComplianceSources).optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  locationNotes: z.string().trim().max(2000).nullable().optional(),
  tags: z.array(z.string().trim().max(80)).max(20).optional(),
  assignedUserId: z.string().trim().min(1).nullable().optional(),
});

export const leaseComplianceIssuePatchSchema = leaseComplianceIssueSchema.partial();

export const leaseComplianceIssueQuerySchema = z.object({
  propertyId: z.string().optional(),
  unitId: z.string().optional(),
  status: z.enum(leaseComplianceStatuses).optional(),
  noticeStage: z.enum(leaseComplianceNoticeStages).optional(),
  priority: z.enum(leaseCompliancePriorities).optional(),
  assignedUserId: z.string().optional(),
  includeArchived: z.coerce.boolean().optional(),
  recurringOnly: z.coerce.boolean().optional(),
  q: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});

export const leaseComplianceSettingsSchema = z.object({
  defaultPriority: z.enum(leaseCompliancePriorities).optional(),
  watchDays: z.coerce.number().int().min(0).max(365).optional(),
  warningDays: z.coerce.number().int().min(0).max(365).optional(),
  criticalDays: z.coerce.number().int().min(0).max(365).optional(),
  firstNoticeLabel: z.string().trim().min(1).max(80).optional(),
  secondNoticeLabel: z.string().trim().min(1).max(80).optional(),
  thirdNoticeLabel: z.string().trim().min(1).max(80).optional(),
  archiveResolvedAfterDays: z.coerce.number().int().min(0).max(3650).nullable().optional(),
});

export const leaseComplianceIssueTypeSchema = z.object({
  propertyId: z.string().min(1),
  name: z.string().trim().min(1).max(160),
  color: z.string().trim().max(40).nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
});

export const leaseComplianceNoteSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

export const leaseCompliancePersistSchema = z.object({
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const leaseComplianceNoticeSchema = z.object({
  action: z.enum(["RESIDENT_NOTIFIED", "NOTICE_1_SENT", "NOTICE_2_SENT", "NOTICE_3_SENT", "VIOLATION_NEEDED"]),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const leaseComplianceResolveSchema = z.object({
  resolutionNotes: z.string().trim().min(1).max(2000),
});

export const leaseComplianceArchiveSchema = z.object({
  archiveNotes: z.string().trim().max(2000).nullable().optional(),
});

export const leaseComplianceRecurringDismissSchema = z.object({
  notes: z.string().trim().min(1).max(2000),
});

function leaseComplianceRoleAccess(role: UserRole) {
  if (role === UserRole.ADMIN) return { view: true, edit: true, notice: true, admin: true };
  if (role === UserRole.MANAGER) return { view: true, edit: true, notice: true, admin: false };
  if (role === UserRole.LEASING) return { view: true, edit: true, notice: true, admin: false };
  if (role === UserRole.TECH || role === UserRole.CLEANER) return { view: true, edit: true, notice: false, admin: false };
  if (role === UserRole.VIEWER) return { view: true, edit: false, notice: false, admin: false };
  return { view: false, edit: false, notice: false, admin: false };
}

function requireLeaseComplianceAccess(request: FastifyRequest, reply: FastifyReply, level: "view" | "edit" | "notice" | "admin") {
  const access = leaseComplianceRoleAccess(request.currentUser!.role);
  if (!access[level]) {
    reply.code(403).send({ message: "Lease Compliance access denied" });
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

function sanitizeFilename(filename: string) {
  return basename(filename).replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 180) || "lease-compliance";
}

function htmlEscape(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function startOfMonth(value = new Date()) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

async function ensureDefaultIssueTypes(propertyId: string, userId: string | null) {
  const count = await prisma.leaseComplianceIssueType.count({ where: { propertyId } });
  if (count > 0) return;
  await prisma.leaseComplianceIssueType.createMany({
    data: defaultIssueTypes.map((entry, index) => ({
      propertyId,
      name: entry.name,
      color: entry.color,
      sortOrder: index,
      createdById: userId,
      updatedById: userId,
    })),
  });
}

async function ensureSettings(propertyId: string, userId: string | null) {
  return prisma.leaseComplianceSettings.upsert({
    where: { propertyId },
    create: {
      propertyId,
      updatedById: userId,
    },
    update: userId ? { updatedById: userId } : {},
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
    prisma.leaseComplianceIssue.count({
      where: {
        unitId,
        isArchived: false,
        createdAt: { gte: ninetyDays },
      },
    }),
    prisma.leaseComplianceIssue.count({
      where: {
        unitId,
        createdAt: { gte: yearAgo },
      },
    }),
  ]);
  await prisma.leaseComplianceIssue.update({
    where: { id: issueId },
    data: {
      recurringConcern: count90 >= 2,
      managerReviewRequired: countYear >= 3,
    },
  });
}

function issueWhere(query: z.infer<typeof leaseComplianceIssueQuerySchema>, request: FastifyRequest) {
  const scoped = propertyScopeWhere(request, query.propertyId);
  if (scoped.denied) {
    throw Object.assign(new Error("Property access denied"), { statusCode: 403 });
  }
  const where: Record<string, unknown> = {
    propertyId: scoped.where,
    ...(query.includeArchived ? {} : { isArchived: false }),
  };
  if (query.unitId) where.unitId = query.unitId;
  if (query.status) where.status = query.status;
  if (query.noticeStage) where.noticeStage = query.noticeStage;
  if (query.priority) where.priority = query.priority;
  if (query.assignedUserId) where.assignedUserId = query.assignedUserId;
  if (query.recurringOnly) where.OR = [{ recurringConcern: true }, { managerReviewRequired: true }];
  if (query.q) {
    const q = query.q.trim();
    const searchClause = {
      OR: [
        { issueTypeName: { contains: q, mode: "insensitive" as const } },
        { additionalIssueType: { contains: q, mode: "insensitive" as const } },
        { description: { contains: q, mode: "insensitive" as const } },
        { locationNotes: { contains: q, mode: "insensitive" as const } },
        { building: { contains: q, mode: "insensitive" as const } },
        { area: { contains: q, mode: "insensitive" as const } },
        { assignedUserName: { contains: q, mode: "insensitive" as const } },
        { tags: { has: q } },
        { unit: { number: { contains: q, mode: "insensitive" as const } } },
      ],
    };
    if ("AND" in where && Array.isArray(where.AND)) (where.AND as unknown[]).push(searchClause);
    else where.AND = [searchClause];
  }
  return where;
}

function reportRows(issues: Array<Awaited<ReturnType<typeof prisma.leaseComplianceIssue.findMany>>[number] & {
  property: { code: string; name: string };
  unit: { number: string } | null;
  assignedUser: { fullName: string } | null;
}>) {
  return issues.map((issue) => ({
    property: issue.property.code,
    propertyName: issue.property.name,
    unitOrArea: issue.unit?.number ?? issue.area ?? issue.building ?? "Area",
    building: issue.building ?? "",
    area: issue.area ?? "",
    issueType: issue.issueTypeName,
    additionalIssueType: issue.additionalIssueType ?? "",
    status: issue.status,
    noticeStage: issue.noticeStage,
    priority: issue.priority,
    source: issue.source,
    assignedUser: issue.assignedUser?.fullName ?? issue.assignedUserName ?? "",
    createdDate: formatDate(issue.createdAt),
    lastPersistenceCheckDate: formatDate(issue.lastPersistenceCheckDate),
    persistenceCount: issue.persistenceCount,
    residentNotifiedDate: formatDate(issue.residentNotifiedDate),
    notice1Date: formatDate(issue.notice1Date),
    notice2Date: formatDate(issue.notice2Date),
    notice3Date: formatDate(issue.notice3Date),
    violationNeededDate: formatDate(issue.violationNeededDate),
    resolvedDate: formatDate(issue.resolvedDate),
    recurring: issue.recurringConcern ? "Yes" : "",
    managerReview: issue.managerReviewRequired ? "Yes" : "",
    tags: issue.tags.join(", "),
    description: issue.description ?? "",
  }));
}

async function notifyLeaseComplianceRoles(input: {
  propertyId: string;
  issueId: string;
  title: string;
  message: string;
  dedupeKey: string;
}) {
  await notifyPropertyRoles({
    propertyId: input.propertyId,
    itemId: null,
    roles: [UserRole.MANAGER, UserRole.LEASING],
    category: "LEASE_COMPLIANCE",
    title: input.title,
    message: input.message,
    dedupeKey: input.dedupeKey,
  });
}

async function includeIssue(id: string) {
  return prisma.leaseComplianceIssue.findUnique({
    where: { id },
    include: {
      property: true,
      unit: true,
      issueType: true,
      propertyMap: { select: { id: true, name: true } },
      assignedUser: { select: { id: true, fullName: true, role: true } },
      createdBy: { select: { id: true, fullName: true } },
      updatedBy: { select: { id: true, fullName: true } },
      resolvedBy: { select: { id: true, fullName: true } },
      archivedBy: { select: { id: true, fullName: true } },
      notes: { orderBy: { createdAt: "desc" } },
      photos: { orderBy: { createdAt: "desc" } },
      noticeActions: { orderBy: { createdAt: "desc" } },
      persistenceChecks: { orderBy: { createdAt: "desc" } },
    },
  });
}

export async function leaseComplianceRoutes(app: FastifyInstance) {
  app.get("/lease-compliance/overview", async (request, reply) => {
    if (!requireLeaseComplianceAccess(request, reply, "view")) return;
    const { propertyId } = z.object({ propertyId: z.string().optional() }).parse(request.query);
    const scoped = propertyScopeWhere(request, propertyId);
    if (scoped.denied) return reply.code(403).send({ message: "Property access denied" });
    if (propertyId) {
      await ensureDefaultIssueTypes(propertyId, request.currentUser!.id);
      await ensureSettings(propertyId, request.currentUser!.id);
    }
    const [issues, settings, issueTypes] = await Promise.all([
      prisma.leaseComplianceIssue.findMany({
        where: {
          propertyId: scoped.where,
          isArchived: false,
        },
        include: {
          property: true,
          unit: true,
          assignedUser: { select: { id: true, fullName: true, role: true } },
          photos: { orderBy: { createdAt: "desc" }, take: 1 },
        },
        orderBy: [{ updatedAt: "desc" }],
        take: 40,
      }),
      propertyId ? prisma.leaseComplianceSettings.findUnique({ where: { propertyId } }) : null,
      propertyId ? prisma.leaseComplianceIssueType.findMany({ where: { propertyId, isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }) : [],
    ]);
    const currentMonth = startOfMonth();
    const summary = {
      openIssues: issues.filter((issue) => issue.status === "Open").length,
      needsNotice: issues.filter((issue) => ["Resident Notified", "Notice Sent"].includes(issue.status)).length,
      violationNeeded: issues.filter((issue) => issue.status === "Violation Needed" || issue.noticeStage === "Violation Needed").length,
      resolvedThisMonth: issues.filter((issue) => issue.resolvedDate && issue.resolvedDate >= currentMonth).length,
      recurringConcerns: issues.filter((issue) => issue.recurringConcern).length,
      managerReviewRequired: issues.filter((issue) => issue.managerReviewRequired).length,
      overdueOpen: issues.filter((issue) => Math.floor((Date.now() - issue.createdAt.getTime()) / 86400000) >= (settings?.warningDays ?? 7) && !issue.resolvedDate).length,
    };
    return {
      permissions: leaseComplianceRoleAccess(request.currentUser!.role),
      summary,
      issueTypes,
      settings,
      recentIssues: issues.slice(0, 10),
      needsNotice: issues.filter((issue) => ["Resident Notified", "Notice Sent"].includes(issue.status)).slice(0, 10),
      violationNeeded: issues.filter((issue) => issue.status === "Violation Needed" || issue.noticeStage === "Violation Needed").slice(0, 10),
      recentResolved: issues.filter((issue) => issue.resolvedDate).slice(0, 10),
    };
  });

  app.get("/lease-compliance/settings", async (request, reply) => {
    if (!requireLeaseComplianceAccess(request, reply, "view")) return;
    const { propertyId } = z.object({ propertyId: z.string() }).parse(request.query);
    await assertPropertyAccess(request, propertyId);
    const settings = await ensureSettings(propertyId, request.currentUser!.id);
    return { settings };
  });

  app.patch("/lease-compliance/settings", async (request, reply) => {
    if (!requireLeaseComplianceAccess(request, reply, "admin")) return;
    const { propertyId, ...input } = z.object({ propertyId: z.string() }).merge(leaseComplianceSettingsSchema).parse(request.body);
    await assertPropertyAccess(request, propertyId);
    const settings = await prisma.leaseComplianceSettings.upsert({
      where: { propertyId },
      create: { propertyId, ...input, updatedById: request.currentUser!.id },
      update: { ...input, updatedById: request.currentUser!.id },
    });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId,
      entityType: "LEASE_COMPLIANCE_SETTINGS",
      entityId: settings.id,
      action: "LEASE_COMPLIANCE_SETTINGS_UPDATED",
      message: "Updated Lease Compliance settings",
    });
    return { settings };
  });

  app.get("/lease-compliance/issue-types", async (request, reply) => {
    if (!requireLeaseComplianceAccess(request, reply, "view")) return;
    const { propertyId } = z.object({ propertyId: z.string() }).parse(request.query);
    await assertPropertyAccess(request, propertyId);
    await ensureDefaultIssueTypes(propertyId, request.currentUser!.id);
    const issueTypes = await prisma.leaseComplianceIssueType.findMany({
      where: { propertyId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return { issueTypes };
  });

  app.post("/lease-compliance/issue-types", async (request, reply) => {
    if (!requireLeaseComplianceAccess(request, reply, "admin")) return;
    const input = leaseComplianceIssueTypeSchema.parse(request.body);
    await assertPropertyAccess(request, input.propertyId);
    const issueType = await prisma.leaseComplianceIssueType.create({
      data: {
        propertyId: input.propertyId,
        name: input.name,
        color: input.color ?? "#58a6de",
        isActive: input.isActive ?? true,
        sortOrder: input.sortOrder ?? 0,
        createdById: request.currentUser!.id,
        updatedById: request.currentUser!.id,
      },
    });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: input.propertyId,
      entityType: "LEASE_COMPLIANCE_ISSUE_TYPE",
      entityId: issueType.id,
      action: "LEASE_COMPLIANCE_ISSUE_TYPE_CREATED",
      message: `Created Lease Compliance issue type ${issueType.name}`,
    });
    reply.code(201);
    return { issueType };
  });

  app.patch("/lease-compliance/issue-types/:id", async (request, reply) => {
    if (!requireLeaseComplianceAccess(request, reply, "admin")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = leaseComplianceIssueTypeSchema.partial().parse(request.body);
    const existing = await prisma.leaseComplianceIssueType.findUnique({ where: { id } });
    if (!existing) throw Object.assign(new Error("Lease Compliance issue type not found"), { statusCode: 404 });
    await assertPropertyAccess(request, existing.propertyId);
    const issueType = await prisma.leaseComplianceIssueType.update({
      where: { id },
      data: {
        name: input.name ?? existing.name,
        color: input.color === undefined ? existing.color : input.color,
        isActive: input.isActive ?? existing.isActive,
        sortOrder: input.sortOrder ?? existing.sortOrder,
        updatedById: request.currentUser!.id,
      },
    });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: existing.propertyId,
      entityType: "LEASE_COMPLIANCE_ISSUE_TYPE",
      entityId: issueType.id,
      action: "LEASE_COMPLIANCE_ISSUE_TYPE_UPDATED",
      message: `Updated Lease Compliance issue type ${issueType.name}`,
    });
    return { issueType };
  });

  app.delete("/lease-compliance/issue-types/:id", async (request, reply) => {
    if (!requireLeaseComplianceAccess(request, reply, "admin")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.leaseComplianceIssueType.findUnique({ where: { id } });
    if (!existing) throw Object.assign(new Error("Lease Compliance issue type not found"), { statusCode: 404 });
    await assertPropertyAccess(request, existing.propertyId);
    if (existing.isActive) {
      return reply.code(400).send({ message: "Archive or deactivate the issue type before deleting it permanently" });
    }
    const linkedIssueCount = await prisma.leaseComplianceIssue.count({ where: { issueTypeId: id } });
    if (linkedIssueCount > 0) {
      return reply.code(409).send({ message: "Cannot permanently delete an issue type that is still linked to lease compliance issues" });
    }
    await prisma.leaseComplianceIssueType.delete({ where: { id } });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: existing.propertyId,
      entityType: "LEASE_COMPLIANCE_ISSUE_TYPE",
      entityId: existing.id,
      action: "LEASE_COMPLIANCE_ISSUE_TYPE_DELETED",
      message: `Deleted Lease Compliance issue type ${existing.name}`,
    });
    return { ok: true };
  });

  app.get("/lease-compliance/issues", async (request, reply) => {
    if (!requireLeaseComplianceAccess(request, reply, "view")) return;
    const query = leaseComplianceIssueQuerySchema.parse(request.query);
    const where = issueWhere(query, request);
    const [issues, total] = await Promise.all([
      prisma.leaseComplianceIssue.findMany({
        where,
        include: {
          property: true,
          unit: true,
          issueType: true,
          propertyMap: { select: { id: true, name: true } },
          assignedUser: { select: { id: true, fullName: true, role: true } },
          createdBy: { select: { id: true, fullName: true } },
          updatedBy: { select: { id: true, fullName: true } },
          resolvedBy: { select: { id: true, fullName: true } },
          archivedBy: { select: { id: true, fullName: true } },
          notes: { orderBy: { createdAt: "desc" }, take: 5 },
          photos: { orderBy: { createdAt: "desc" } },
          noticeActions: { orderBy: { createdAt: "desc" } },
          persistenceChecks: { orderBy: { createdAt: "desc" } },
        },
        orderBy: [{ isArchived: "asc" }, { resolvedDate: "asc" }, { updatedAt: "desc" }],
        take: query.limit,
        skip: query.offset,
      }),
      prisma.leaseComplianceIssue.count({ where }),
    ]);
    return { issues, pagination: { total, limit: query.limit, offset: query.offset, hasMore: query.offset + issues.length < total } };
  });

  app.post("/lease-compliance/issues", async (request, reply) => {
    if (!requireLeaseComplianceAccess(request, reply, "edit")) return;
    const input = leaseComplianceIssueSchema.parse(request.body);
    await assertPropertyAccess(request, input.propertyId);
    await ensureDefaultIssueTypes(input.propertyId, request.currentUser!.id);
    await ensureSettings(input.propertyId, request.currentUser!.id);
    if (!input.unitId && !input.area?.trim() && !input.building?.trim()) {
      throw Object.assign(new Error("Unit, building, or area is required"), { statusCode: 400 });
    }
    let assignedUserName: string | null = null;
    if (input.assignedUserId) {
      const user = await prisma.user.findUnique({ where: { id: input.assignedUserId } });
      assignedUserName = user?.fullName ?? null;
    }
    const issue = await prisma.leaseComplianceIssue.create({
      data: {
        propertyId: input.propertyId,
        unitId: input.unitId ?? null,
        issueTypeId: input.issueTypeId ?? null,
        propertyMapId: input.propertyMapId ?? null,
        building: input.building ?? null,
        area: input.area ?? null,
        issueTypeName: input.issueTypeName,
        additionalIssueType: input.additionalIssueType ?? null,
        status: input.status ?? "Open",
        noticeStage: input.noticeStage ?? "None",
        priority: input.priority ?? "Normal",
        source: input.source ?? "Property Walk",
        description: input.description ?? null,
        locationNotes: input.locationNotes ?? null,
        tags: input.tags ?? [],
        assignedUserId: input.assignedUserId ?? null,
        assignedUserName,
        createdById: request.currentUser!.id,
        updatedById: request.currentUser!.id,
      },
    });
    await applyRecurringFlags(issue.id, issue.unitId);
    await notifyLeaseComplianceRoles({
      propertyId: issue.propertyId,
      issueId: issue.id,
      title: "Lease Compliance issue created",
      message: `${issue.issueTypeName} was logged for follow-up.`,
      dedupeKey: `lease-compliance:create:${issue.id}`,
    });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: issue.propertyId,
      entityType: "LEASE_COMPLIANCE_ISSUE",
      entityId: issue.id,
      action: "LEASE_COMPLIANCE_ISSUE_CREATED",
      message: `Created Lease Compliance issue ${issue.issueTypeName}`,
    });
    await queueWebhookEvent({
      eventType: "lease.issue.created",
      propertyId: issue.propertyId,
      actorUserId: request.currentUser!.id,
      data: {
        id: issue.id,
        propertyId: issue.propertyId,
        unitId: issue.unitId,
        propertyMapId: issue.propertyMapId,
        building: issue.building,
        area: issue.area,
        issueTypeName: issue.issueTypeName,
        status: issue.status,
        noticeStage: issue.noticeStage,
        priority: issue.priority,
        assignedUserId: issue.assignedUserId,
      },
    });
    reply.code(201);
    return { issue: await includeIssue(issue.id) };
  });

  app.patch("/lease-compliance/issues/:id", async (request, reply) => {
    if (!requireLeaseComplianceAccess(request, reply, "edit")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = leaseComplianceIssuePatchSchema.parse(request.body);
    const existing = await prisma.leaseComplianceIssue.findUnique({ where: { id } });
    if (!existing) throw Object.assign(new Error("Lease Compliance issue not found"), { statusCode: 404 });
    await assertPropertyAccess(request, existing.propertyId);
    let assignedUserName = existing.assignedUserName;
    if (input.assignedUserId !== undefined) {
      if (input.assignedUserId) {
        const assignedUser = await prisma.user.findUnique({ where: { id: input.assignedUserId } });
        assignedUserName = assignedUser?.fullName ?? null;
      } else {
        assignedUserName = null;
      }
    }
    await prisma.leaseComplianceIssue.update({
      where: { id },
      data: {
        unitId: input.unitId === undefined ? existing.unitId : input.unitId,
        issueTypeId: input.issueTypeId === undefined ? existing.issueTypeId : input.issueTypeId,
        propertyMapId: input.propertyMapId === undefined ? existing.propertyMapId : input.propertyMapId,
        building: input.building === undefined ? existing.building : input.building,
        area: input.area === undefined ? existing.area : input.area,
        issueTypeName: input.issueTypeName ?? existing.issueTypeName,
        additionalIssueType: input.additionalIssueType === undefined ? existing.additionalIssueType : input.additionalIssueType,
        status: input.status ?? existing.status,
        noticeStage: input.noticeStage ?? existing.noticeStage,
        priority: input.priority ?? existing.priority,
        source: input.source ?? existing.source,
        description: input.description === undefined ? existing.description : input.description,
        locationNotes: input.locationNotes === undefined ? existing.locationNotes : input.locationNotes,
        tags: input.tags ?? existing.tags,
        assignedUserId: input.assignedUserId === undefined ? existing.assignedUserId : input.assignedUserId,
        assignedUserName,
        updatedById: request.currentUser!.id,
      },
    });
    await applyRecurringFlags(id, input.unitId === undefined ? existing.unitId : input.unitId);
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: existing.propertyId,
      entityType: "LEASE_COMPLIANCE_ISSUE",
      entityId: id,
      action: "LEASE_COMPLIANCE_ISSUE_UPDATED",
      message: `Updated Lease Compliance issue ${existing.issueTypeName}`,
    });
    const updatedIssue = await includeIssue(id);
    if (!updatedIssue) throw Object.assign(new Error("Lease Compliance issue not found after update"), { statusCode: 404 });
    await queueWebhookEvent({
      eventType: "lease.issue.updated",
      propertyId: updatedIssue.propertyId,
      actorUserId: request.currentUser!.id,
      data: {
        id: updatedIssue.id,
        propertyId: updatedIssue.propertyId,
        unitId: updatedIssue.unitId,
        propertyMapId: updatedIssue.propertyMapId,
        building: updatedIssue.building,
        area: updatedIssue.area,
        issueTypeName: updatedIssue.issueTypeName,
        status: updatedIssue.status,
        noticeStage: updatedIssue.noticeStage,
        priority: updatedIssue.priority,
        assignedUserId: updatedIssue.assignedUserId,
      },
    });
    return { issue: updatedIssue };
  });

  app.post("/lease-compliance/issues/:id/notes", async (request, reply) => {
    if (!requireLeaseComplianceAccess(request, reply, "edit")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = leaseComplianceNoteSchema.parse(request.body);
    const issue = await prisma.leaseComplianceIssue.findUnique({ where: { id }, include: { property: true } });
    if (!issue) throw Object.assign(new Error("Lease Compliance issue not found"), { statusCode: 404 });
    await assertPropertyAccess(request, issue.propertyId);
    const note = await prisma.leaseComplianceIssueNote.create({
      data: {
        issueId: issue.id,
        propertyId: issue.propertyId,
        authorUserId: request.currentUser!.id,
        authorName: request.currentUser!.fullName,
        body: input.body,
      },
    });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: issue.propertyId,
      entityType: "LEASE_COMPLIANCE_ISSUE_NOTE",
      entityId: note.id,
      action: "LEASE_COMPLIANCE_ISSUE_NOTE_CREATED",
      message: `Added note to Lease Compliance issue ${issue.issueTypeName}`,
    });
    reply.code(201);
    return { note };
  });

  app.post("/lease-compliance/issues/:id/persist", async (request, reply) => {
    if (!requireLeaseComplianceAccess(request, reply, "edit")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = leaseCompliancePersistSchema.parse(request.body);
    const issue = await prisma.leaseComplianceIssue.findUnique({ where: { id }, include: { property: true } });
    if (!issue) throw Object.assign(new Error("Lease Compliance issue not found"), { statusCode: 404 });
    await assertPropertyAccess(request, issue.propertyId);
    const check = await prisma.leaseCompliancePersistenceCheck.create({
      data: {
        issueId: issue.id,
        propertyId: issue.propertyId,
        checkedById: request.currentUser!.id,
        checkedByName: request.currentUser!.fullName,
        stillPersists: true,
        notes: input.notes ?? null,
      },
    });
    const nextStatus = issue.noticeStage === "3rd Notice" ? "Violation Needed" : issue.status;
    const nextNoticeStage = issue.noticeStage === "3rd Notice" ? "Violation Needed" : issue.noticeStage;
    await prisma.leaseComplianceIssue.update({
      where: { id },
      data: {
        persistenceCount: { increment: 1 },
        lastPersistenceCheckDate: new Date(),
        status: nextStatus,
        noticeStage: nextNoticeStage,
        violationNeededDate: issue.noticeStage === "3rd Notice" && !issue.violationNeededDate ? new Date() : issue.violationNeededDate,
        updatedById: request.currentUser!.id,
      },
    });
    await notifyLeaseComplianceRoles({
      propertyId: issue.propertyId,
      issueId: issue.id,
      title: issue.noticeStage === "3rd Notice" ? "Lease Compliance violation needed" : "Lease Compliance issue still persists",
      message: `${issue.issueTypeName} still persists${issue.noticeStage === "3rd Notice" ? " after the 3rd notice and now needs violation review." : "."}`,
      dedupeKey: `lease-compliance:persist:${issue.id}:${check.id}`,
    });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: issue.propertyId,
      entityType: "LEASE_COMPLIANCE_PERSISTENCE_CHECK",
      entityId: check.id,
      action: "LEASE_COMPLIANCE_STILL_PERSISTS",
      message: `Marked still persists for Lease Compliance issue ${issue.issueTypeName}`,
    });
    const updatedIssue = await includeIssue(issue.id);
    if (!updatedIssue) throw Object.assign(new Error("Lease Compliance issue not found after persistence update"), { statusCode: 404 });
    await queueWebhookEvent({
      eventType: "lease.issue.updated",
      propertyId: updatedIssue.propertyId,
      actorUserId: request.currentUser!.id,
      data: {
        id: updatedIssue.id,
        propertyId: updatedIssue.propertyId,
        unitId: updatedIssue.unitId,
        propertyMapId: updatedIssue.propertyMapId,
        building: updatedIssue.building,
        area: updatedIssue.area,
        issueTypeName: updatedIssue.issueTypeName,
        status: updatedIssue.status,
        noticeStage: updatedIssue.noticeStage,
        priority: updatedIssue.priority,
        assignedUserId: updatedIssue.assignedUserId,
        persistenceCount: updatedIssue.persistenceCount,
      },
    });
    return { issue: updatedIssue, check };
  });

  app.post("/lease-compliance/issues/:id/notice", async (request, reply) => {
    if (!requireLeaseComplianceAccess(request, reply, "notice")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = leaseComplianceNoticeSchema.parse(request.body);
    const issue = await prisma.leaseComplianceIssue.findUnique({ where: { id }, include: { property: true } });
    if (!issue) throw Object.assign(new Error("Lease Compliance issue not found"), { statusCode: 404 });
    await assertPropertyAccess(request, issue.propertyId);

    const mapping = {
      RESIDENT_NOTIFIED: { status: "Resident Notified", noticeStage: "Resident Notified", field: "residentNotifiedDate", actionLabel: "Marked resident notified" },
      NOTICE_1_SENT: { status: "Notice Sent", noticeStage: "1st Notice", field: "notice1Date", actionLabel: "Marked 1st notice sent" },
      NOTICE_2_SENT: { status: "Notice Sent", noticeStage: "2nd Notice", field: "notice2Date", actionLabel: "Marked 2nd notice sent" },
      NOTICE_3_SENT: { status: "Notice Sent", noticeStage: "3rd Notice", field: "notice3Date", actionLabel: "Marked 3rd notice sent" },
      VIOLATION_NEEDED: { status: "Violation Needed", noticeStage: "Violation Needed", field: "violationNeededDate", actionLabel: "Marked violation needed" },
    } as const;

    const next = mapping[input.action];
    const noticeAction = await prisma.leaseComplianceNoticeAction.create({
      data: {
        issueId: issue.id,
        propertyId: issue.propertyId,
        actedById: request.currentUser!.id,
        actedByName: request.currentUser!.fullName,
        action: input.action,
        noticeStage: next.noticeStage,
        notes: input.notes ?? null,
      },
    });
    await prisma.leaseComplianceIssue.update({
      where: { id },
      data: {
        status: next.status,
        noticeStage: next.noticeStage,
        residentNotifiedDate: next.field === "residentNotifiedDate" ? new Date() : issue.residentNotifiedDate,
        notice1Date: next.field === "notice1Date" ? new Date() : issue.notice1Date,
        notice2Date: next.field === "notice2Date" ? new Date() : issue.notice2Date,
        notice3Date: next.field === "notice3Date" ? new Date() : issue.notice3Date,
        violationNeededDate: next.field === "violationNeededDate" ? new Date() : issue.violationNeededDate,
        updatedById: request.currentUser!.id,
      },
    });
    await notifyLeaseComplianceRoles({
      propertyId: issue.propertyId,
      issueId: issue.id,
      title: "Lease Compliance notice updated",
      message: `${issue.issueTypeName}: ${next.actionLabel}.`,
      dedupeKey: `lease-compliance:notice:${issue.id}:${noticeAction.id}`,
    });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: issue.propertyId,
      entityType: "LEASE_COMPLIANCE_NOTICE_ACTION",
      entityId: noticeAction.id,
      action: "LEASE_COMPLIANCE_NOTICE_UPDATED",
      message: `${next.actionLabel} for Lease Compliance issue ${issue.issueTypeName}`,
    });
    const updatedIssue = await includeIssue(issue.id);
    if (!updatedIssue) throw Object.assign(new Error("Lease Compliance issue not found after notice update"), { statusCode: 404 });
    await queueWebhookEvent({
      eventType: "lease.issue.updated",
      propertyId: updatedIssue.propertyId,
      actorUserId: request.currentUser!.id,
      data: {
        id: updatedIssue.id,
        propertyId: updatedIssue.propertyId,
        unitId: updatedIssue.unitId,
        propertyMapId: updatedIssue.propertyMapId,
        building: updatedIssue.building,
        area: updatedIssue.area,
        issueTypeName: updatedIssue.issueTypeName,
        status: updatedIssue.status,
        noticeStage: updatedIssue.noticeStage,
        priority: updatedIssue.priority,
        assignedUserId: updatedIssue.assignedUserId,
      },
    });
    return { issue: updatedIssue, noticeAction };
  });

  app.post("/lease-compliance/issues/:id/resolve", async (request, reply) => {
    if (!requireLeaseComplianceAccess(request, reply, "edit")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = leaseComplianceResolveSchema.parse(request.body);
    const issue = await prisma.leaseComplianceIssue.findUnique({ where: { id } });
    if (!issue) throw Object.assign(new Error("Lease Compliance issue not found"), { statusCode: 404 });
    await assertPropertyAccess(request, issue.propertyId);
    await prisma.leaseComplianceIssue.update({
      where: { id },
      data: {
        status: "Resolved",
        resolvedDate: new Date(),
        resolvedById: request.currentUser!.id,
        resolutionNotes: input.resolutionNotes,
        updatedById: request.currentUser!.id,
      },
    });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: issue.propertyId,
      entityType: "LEASE_COMPLIANCE_ISSUE",
      entityId: issue.id,
      action: "LEASE_COMPLIANCE_ISSUE_RESOLVED",
      message: `Resolved Lease Compliance issue ${issue.issueTypeName}`,
    });
    const resolvedIssue = await includeIssue(issue.id);
    if (!resolvedIssue) throw Object.assign(new Error("Lease Compliance issue not found after resolve"), { statusCode: 404 });
    await queueWebhookEvent({
      eventType: "lease.issue.resolved",
      propertyId: resolvedIssue.propertyId,
      actorUserId: request.currentUser!.id,
      data: {
        id: resolvedIssue.id,
        propertyId: resolvedIssue.propertyId,
        unitId: resolvedIssue.unitId,
        propertyMapId: resolvedIssue.propertyMapId,
        building: resolvedIssue.building,
        area: resolvedIssue.area,
        issueTypeName: resolvedIssue.issueTypeName,
        status: resolvedIssue.status,
        noticeStage: resolvedIssue.noticeStage,
        priority: resolvedIssue.priority,
        assignedUserId: resolvedIssue.assignedUserId,
        resolvedDate: resolvedIssue.resolvedDate?.toISOString?.() ?? null,
      },
    });
    return { issue: resolvedIssue };
  });

  app.post("/lease-compliance/issues/:id/archive", async (request, reply) => {
    if (!requireLeaseComplianceAccess(request, reply, "edit")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = leaseComplianceArchiveSchema.parse(request.body);
    const issue = await prisma.leaseComplianceIssue.findUnique({ where: { id } });
    if (!issue) throw Object.assign(new Error("Lease Compliance issue not found"), { statusCode: 404 });
    await assertPropertyAccess(request, issue.propertyId);
    await prisma.leaseComplianceIssue.update({
      where: { id },
      data: {
        isArchived: true,
        status: "Archived",
        archiveDate: new Date(),
        archivedById: request.currentUser!.id,
        archiveNotes: input.archiveNotes ?? null,
        updatedById: request.currentUser!.id,
      },
    });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: issue.propertyId,
      entityType: "LEASE_COMPLIANCE_ISSUE",
      entityId: issue.id,
      action: "LEASE_COMPLIANCE_ISSUE_ARCHIVED",
      message: `Archived Lease Compliance issue ${issue.issueTypeName}`,
    });
    const archivedIssue = await includeIssue(issue.id);
    if (!archivedIssue) throw Object.assign(new Error("Lease Compliance issue not found after archive"), { statusCode: 404 });
    await queueWebhookEvent({
      eventType: "lease.issue.archived",
      propertyId: archivedIssue.propertyId,
      actorUserId: request.currentUser!.id,
      data: {
        id: archivedIssue.id,
        propertyId: archivedIssue.propertyId,
        unitId: archivedIssue.unitId,
        propertyMapId: archivedIssue.propertyMapId,
        building: archivedIssue.building,
        area: archivedIssue.area,
        issueTypeName: archivedIssue.issueTypeName,
        status: archivedIssue.status,
        noticeStage: archivedIssue.noticeStage,
        priority: archivedIssue.priority,
        assignedUserId: archivedIssue.assignedUserId,
        archiveDate: archivedIssue.archiveDate?.toISOString?.() ?? null,
      },
    });
    return { issue: archivedIssue };
  });

  app.post("/lease-compliance/issues/:id/dismiss-recurring", async (request, reply) => {
    if (!requireLeaseComplianceAccess(request, reply, "edit")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = leaseComplianceRecurringDismissSchema.parse(request.body);
    const issue = await prisma.leaseComplianceIssue.findUnique({ where: { id } });
    if (!issue) throw Object.assign(new Error("Lease Compliance issue not found"), { statusCode: 404 });
    await assertPropertyAccess(request, issue.propertyId);
    await prisma.leaseComplianceIssue.update({
      where: { id },
      data: {
        recurringConcern: false,
        managerReviewRequired: false,
        recurringDismissedAt: new Date(),
        recurringDismissalNotes: input.notes,
        updatedById: request.currentUser!.id,
      },
    });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: issue.propertyId,
      entityType: "LEASE_COMPLIANCE_ISSUE",
      entityId: issue.id,
      action: "LEASE_COMPLIANCE_RECURRING_DISMISSED",
      message: `Dismissed recurring flag for Lease Compliance issue ${issue.issueTypeName}`,
    });
    return { issue: await includeIssue(issue.id) };
  });

  app.post("/lease-compliance/issues/:id/photos", async (request, reply) => {
    if (!requireLeaseComplianceAccess(request, reply, "edit")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const issue = await prisma.leaseComplianceIssue.findUnique({ where: { id }, include: { property: true } });
    if (!issue) throw Object.assign(new Error("Lease Compliance issue not found"), { statusCode: 404 });
    await assertPropertyAccess(request, issue.propertyId);
    const upload = await request.file();
    if (!upload) throw Object.assign(new Error("Upload file is required"), { statusCode: 400 });
    const extension = extname(upload.filename ?? "").toLowerCase();
    if ((extension && !allowedAttachmentExtensions.has(extension)) || !allowedAttachmentTypes.has(upload.mimetype)) {
      throw Object.assign(new Error("Only image or PDF uploads are supported"), { statusCode: 400 });
    }
    const fields = upload.fields as Record<string, { value: string }[]>;
    const photoCategory = fields.photoCategory?.[0]?.value;
    const caption = fields.caption?.[0]?.value;
    const storedName = routedStoredName(issue.property, `lease-compliance/${randomUUID()}${extension || ".bin"}`);
    await ensureStoredUploadParent(storedName);
    await pipeline(upload.file, createWriteStream(resolveStoredUploadPath(storedName)));
    const photo = await prisma.leaseComplianceIssuePhoto.create({
      data: {
        issueId: issue.id,
        propertyId: issue.propertyId,
        uploadedById: request.currentUser!.id,
        uploaderName: request.currentUser!.fullName,
        photoCategory: leaseCompliancePhotoCategories.includes((photoCategory ?? "GENERAL") as typeof leaseCompliancePhotoCategories[number]) ? photoCategory! : "GENERAL",
        caption: caption?.trim() ? caption.trim() : null,
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
      entityType: "LEASE_COMPLIANCE_ISSUE_PHOTO",
      entityId: photo.id,
      action: "LEASE_COMPLIANCE_ISSUE_PHOTO_CREATED",
      message: `Uploaded Lease Compliance evidence ${photo.originalName}`,
    });
    reply.code(201);
    return { photo };
  });

  app.get("/lease-compliance/photos/:id/download", async (request, reply) => {
    if (!requireLeaseComplianceAccess(request, reply, "view")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const photo = await prisma.leaseComplianceIssuePhoto.findUnique({ where: { id } });
    if (!photo) throw Object.assign(new Error("Lease Compliance photo not found"), { statusCode: 404 });
    await assertPropertyAccess(request, photo.propertyId);
    reply.header("Content-Type", photo.mimeType);
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Content-Disposition", `inline; filename="${sanitizeFilename(photo.originalName)}"`);
    return reply.send(createReadStream(resolveStoredUploadPath(photo.storedName)));
  });

  app.delete("/lease-compliance/photos/:id", async (request, reply) => {
    if (!requireLeaseComplianceAccess(request, reply, "edit")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const photo = await prisma.leaseComplianceIssuePhoto.findUnique({ where: { id } });
    if (!photo) throw Object.assign(new Error("Lease Compliance photo not found"), { statusCode: 404 });
    await assertPropertyAccess(request, photo.propertyId);
    await prisma.leaseComplianceIssuePhoto.delete({ where: { id } });
    await removeStoredUpload(photo.storedName);
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: photo.propertyId,
      entityType: "LEASE_COMPLIANCE_ISSUE_PHOTO",
      entityId: photo.id,
      action: "LEASE_COMPLIANCE_ISSUE_PHOTO_DELETED",
      message: `Deleted Lease Compliance evidence ${photo.originalName}`,
    });
    return { ok: true };
  });

  app.get("/lease-compliance/export.csv", async (request, reply) => {
    if (!requireLeaseComplianceAccess(request, reply, "view")) return;
    const query = leaseComplianceIssueQuerySchema.parse(request.query);
    const where = issueWhere(query, request);
    const issues = await prisma.leaseComplianceIssue.findMany({
      where,
      include: {
        property: true,
        unit: true,
        assignedUser: { select: { fullName: true } },
      },
      orderBy: [{ createdAt: "desc" }],
    });
    const csv = stringify(reportRows(issues), { header: true });
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", "attachment; filename=\"lease-compliance-report.csv\"");
    return reply.send(csv);
  });

  app.get("/lease-compliance/report.html", async (request, reply) => {
    if (!requireLeaseComplianceAccess(request, reply, "view")) return;
    const query = leaseComplianceIssueQuerySchema.parse(request.query);
    const where = issueWhere(query, request);
    const issues = await prisma.leaseComplianceIssue.findMany({
      where,
      include: {
        property: true,
        unit: true,
        assignedUser: { select: { fullName: true } },
        photos: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: [{ createdAt: "desc" }],
      take: 150,
    });
    const rows = reportRows(issues);
    reply.header("Content-Type", "text/html; charset=utf-8");
    return reply.send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Lease Compliance Report</title>
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
    <h1>Lease Compliance Operational Report</h1>
    <p>${htmlEscape(query.propertyId ? "Property filter applied" : "All accessible properties")} | ${htmlEscape(new Date().toLocaleString())}</p>
    <div class="kpis">
      <div class="kpi"><strong>${issues.length}</strong><span>Total issues</span></div>
      <div class="kpi"><strong>${issues.filter((issue) => issue.status === "Open").length}</strong><span>Open</span></div>
      <div class="kpi"><strong>${issues.filter((issue) => issue.status === "Violation Needed" || issue.noticeStage === "Violation Needed").length}</strong><span>Violation Needed</span></div>
      <div class="kpi"><strong>${issues.filter((issue) => issue.recurringConcern || issue.managerReviewRequired).length}</strong><span>Recurring / Review</span></div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Property</th>
          <th>Unit / Area</th>
          <th>Issue</th>
          <th>Status / Notice</th>
          <th>Assigned</th>
          <th>Dates</th>
          <th>Notes / Tags</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row, index) => {
          const issue = issues[index];
          return `<tr>
            <td>${htmlEscape(row.property)}<div class="muted">${htmlEscape(row.propertyName)}</div></td>
            <td>${htmlEscape(row.unitOrArea)}<div class="muted">${htmlEscape([row.building, row.area].filter(Boolean).join(" / "))}</div></td>
            <td>${htmlEscape([row.issueType, row.additionalIssueType].filter(Boolean).join(" / "))}</td>
            <td>${htmlEscape(row.status)}<div class="muted">${htmlEscape(row.noticeStage)} / ${htmlEscape(row.priority)}</div></td>
            <td>${htmlEscape(row.assignedUser || "Unassigned")}<div class="muted">${htmlEscape(row.source)}</div></td>
            <td>Created: ${htmlEscape(row.createdDate)}<br/>Persist: ${htmlEscape(row.lastPersistenceCheckDate || "-")}<br/>Resolved: ${htmlEscape(row.resolvedDate || "-")}</td>
            <td>${htmlEscape(row.description)}<div class="muted">${htmlEscape([
              row.tags || "",
              row.recurring ? "Recurring" : "",
              row.managerReview ? "Manager Review" : "",
              issue.photos.length ? `${issue.photos.length} recent photo` : "",
            ].filter(Boolean).join(" / "))}</div></td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  </body>
</html>`);
  });

  app.get("/lease-compliance/report.pdf", async (request, reply) => {
    if (!requireLeaseComplianceAccess(request, reply, "view")) return;
    const query = leaseComplianceIssueQuerySchema.parse(request.query);
    const where = issueWhere(query, request);
    const issues = await prisma.leaseComplianceIssue.findMany({
      where,
      include: {
        property: true,
        unit: true,
        assignedUser: { select: { fullName: true } },
      },
      orderBy: [{ createdAt: "desc" }],
      take: 100,
    });
    const rows = reportRows(issues);
    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Lease Compliance Report</title>
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
    <h1>Lease Compliance Report</h1>
    <p>${htmlEscape(new Date().toLocaleString())}</p>
    <table>
      <thead>
        <tr>
          <th>Property</th>
          <th>Unit / Area</th>
          <th>Issue</th>
          <th>Status</th>
          <th>Notice</th>
          <th>Assigned</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `<tr>
          <td>${htmlEscape(row.property)}</td>
          <td>${htmlEscape(row.unitOrArea)}</td>
          <td>${htmlEscape([row.issueType, row.additionalIssueType].filter(Boolean).join(" / "))}</td>
          <td>${htmlEscape(row.status)}</td>
          <td>${htmlEscape(row.noticeStage)}</td>
          <td>${htmlEscape(row.assignedUser || "Unassigned")}</td>
          <td>${htmlEscape(row.description)}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  </body>
</html>`;
    const pdf = await renderPdfFromHtml(html);
    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", "inline; filename=\"lease-compliance-report.pdf\"");
    return reply.send(pdf);
  });
}
