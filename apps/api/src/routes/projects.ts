import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { pipeline } from "node:stream/promises";
import { stringify } from "csv-stringify/sync";
import { Prisma, UserRole } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { scopedAllowedPropertyIds } from "../lib/auth.js";
import { writeAuditLog } from "../lib/audit.js";
import { createNotification } from "../lib/notifications.js";
import { renderPdfFromHtml } from "../lib/pdf.js";
import { prisma } from "../lib/prisma.js";
import { ensureStoredUploadParent, resolveStoredUploadPath, routedStoredName } from "../lib/uploadStorage.js";
import { queueWebhookEvent } from "../lib/webhookQueue.js";

const projectRecordTypes = ["Recommendation", "Project"] as const;
const projectExecutionTypes = ["In-House", "Vendor", "Hybrid", "Undecided"] as const;
const projectPriorities = ["Low", "Normal", "High", "Critical"] as const;
const projectTaskStatuses = ["Open", "In Progress", "Completed", "Skipped"] as const;
const projectAttachmentTypes = ["GENERAL", "BEFORE", "PROGRESS", "AFTER", "BID", "LOCATION"] as const;
const projectRecommendationStatuses = ["Open", "Needs Bid", "Got Bid", "Approved", "Denied", "Converted To Project", "Archived"] as const;
const projectStatuses = ["Planning", "Approved", "Scheduled", "In Progress", "Waiting", "Completed", "Cancelled", "Archived"] as const;
const bidStatuses = ["Needed", "Requested", "Received", "Approved", "Denied", "Warranty", "Not Applicable"] as const;
const projectSources = ["Quick Capture", "Inspection", "Preventive Maintenance", "Pool Log", "Manager Walk", "Property Walk", "Resident Feedback", "Vendor Recommendation", "Regional Request", "Ownership Request", "Property Wiki", "Map Finding", "Other"] as const;
const defaultCategories = [
  "Roofing",
  "Curb / Concrete",
  "Lighting",
  "Landscape",
  "Irrigation",
  "Pool",
  "Gate",
  "Access Control",
  "Camera / Security",
  "HVAC",
  "Plumbing",
  "Electrical",
  "Fire / Life Safety",
  "Clubhouse",
  "Exterior",
  "Interior",
  "Grounds",
  "Signage",
  "Other",
] as const;
const defaultCategoryColors = ["#58a6de", "#7ed957", "#f7b955", "#ea7ccc", "#f28b54", "#49c5b6", "#8a93a6", "#d96cff"];
const allowedAttachmentExtensions = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".heic", ".heif", ".bmp", ".tif", ".tiff", ".pdf", ".doc", ".docx", ".xls", ".xlsx"]);
const allowedAttachmentTypes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif", "image/heic", "image/heif", "image/bmp", "image/tiff", "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]);

export const projectCategorySchema = z.object({
  propertyId: z.string().nullable().optional(),
  name: z.string().trim().min(1).max(80),
  color: z.string().trim().max(32).nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
});

export const projectRecordSchema = z.object({
  propertyId: z.string().min(1),
  recordType: z.enum(projectRecordTypes),
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(5000).nullable().optional(),
  source: z.enum(projectSources).nullable().optional(),
  sourceRecordType: z.string().trim().max(80).nullable().optional(),
  sourceRecordId: z.string().trim().max(120).nullable().optional(),
  sourceRecordLabel: z.string().trim().max(180).nullable().optional(),
  status: z.string().trim().min(1).max(60),
  priority: z.enum(projectPriorities).optional(),
  executionType: z.enum(projectExecutionTypes).optional(),
  categoryId: z.string().trim().min(1).nullable().optional(),
  building: z.string().trim().max(120).nullable().optional(),
  area: z.string().trim().max(120).nullable().optional(),
  locationNotes: z.string().trim().max(1000).nullable().optional(),
  propertyMapId: z.string().trim().min(1).nullable().optional(),
  pinX: z.coerce.number().min(0).max(100).nullable().optional(),
  pinY: z.coerce.number().min(0).max(100).nullable().optional(),
  estimatedQuantity: z.coerce.number().min(0).nullable().optional(),
  quantityUnit: z.string().trim().max(80).nullable().optional(),
  estimatedCost: z.coerce.number().min(0).nullable().optional(),
  actualCost: z.coerce.number().min(0).nullable().optional(),
  totalAmount: z.coerce.number().min(0).nullable().optional(),
  deferredMaintenance: z.coerce.boolean().optional(),
  deferredReason: z.string().trim().max(240).nullable().optional(),
  targetYear: z.coerce.number().int().min(2000).max(3000).nullable().optional(),
  deferredNotes: z.string().trim().max(2000).nullable().optional(),
  budgetYear: z.string().trim().max(40).nullable().optional(),
  companyName: z.string().trim().max(180).nullable().optional(),
  contactName: z.string().trim().max(180).nullable().optional(),
  contactPhone: z.string().trim().max(60).nullable().optional(),
  contactEmail: z.string().trim().email().max(180).nullable().optional(),
  bidStatus: z.enum(bidStatuses).nullable().optional(),
  bidNotes: z.string().trim().max(2000).nullable().optional(),
  assignedUserId: z.string().trim().min(1).nullable().optional(),
  assignedRole: z.enum(["ADMIN", "MANAGER", "TECH", "LEASING", "CLEANER", "VIEWER"]).nullable().optional(),
  assignedTeam: z.string().trim().max(120).nullable().optional(),
  scheduledDate: z.coerce.date().nullable().optional(),
  startDate: z.coerce.date().nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  completedDate: z.coerce.date().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  isArchived: z.boolean().optional(),
});

export const projectRecordQuerySchema = z.object({
  propertyId: z.string().optional(),
  recordType: z.enum(projectRecordTypes).optional(),
  source: z.enum(projectSources).optional(),
  status: z.string().optional(),
  priority: z.enum(projectPriorities).optional(),
  categoryId: z.string().optional(),
  executionType: z.enum(projectExecutionTypes).optional(),
  assignedUserId: z.string().optional(),
  budgetYear: z.string().optional(),
  deferredMaintenance: z.coerce.boolean().optional(),
  attachmentType: z.enum(projectAttachmentTypes).optional(),
  agingBucket: z.enum(["0-30", "31-90", "91-180", "180+"]).optional(),
  includeArchived: z.coerce.boolean().optional(),
  q: z.string().trim().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});

export const projectCommentSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});

export const projectTaskSchema = z.object({
  title: z.string().trim().min(1).max(180),
  status: z.enum(projectTaskStatuses).optional(),
  assignedUserId: z.string().trim().min(1).nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
});

export const projectTaskPatchSchema = projectTaskSchema.partial().extend({
  completedDate: z.coerce.date().nullable().optional(),
});

export const projectWikiReferenceSchema = z.object({
  targetType: z.enum(["ENTRY", "VENDOR", "ASSET"]),
  targetId: z.string().min(1),
});

const projectAttachmentUploadSchema = z.object({
  attachmentType: z.enum(projectAttachmentTypes).optional(),
  caption: z.string().trim().max(240).optional(),
});

export const projectAttachmentPatchSchema = z.object({
  attachmentType: z.enum(projectAttachmentTypes).optional(),
  caption: z.string().trim().max(240).nullable().optional(),
});

function readMultipartFieldValue(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "value" in value && typeof (value as { value?: unknown }).value === "string") {
    return (value as { value: string }).value;
  }
  return undefined;
}

function projectRoleAccess(role: UserRole) {
  if (role === UserRole.ADMIN) return { view: true, edit: true, admin: true };
  if (role === UserRole.MANAGER) return { view: true, edit: true, admin: false };
  if (role === UserRole.TECH) return { view: true, edit: true, admin: false };
  if (role === UserRole.LEASING || role === UserRole.VIEWER) return { view: true, edit: false, admin: false };
  return { view: false, edit: false, admin: false };
}

function requireProjectsAccess(request: FastifyRequest, reply: FastifyReply, level: "view" | "edit" | "admin") {
  const access = projectRoleAccess(request.currentUser!.role);
  if (!access[level]) {
    reply.code(403).send({ message: "Projects access denied" });
    return false;
  }
  return true;
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

function daysOpen(record: { createdAt: Date }) {
  const diff = startOfDay().getTime() - startOfDay(record.createdAt).getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

function agingBucketFor(days: number) {
  if (days > 180) return "180+";
  if (days > 90) return "91-180";
  if (days > 30) return "31-90";
  return "0-30";
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

function sanitizeFilename(filename: string) {
  return basename(filename).replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 180) || "project-file";
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

async function ensureDefaultCategories() {
  const count = await prisma.projectCategory.count({ where: { propertyId: null } });
  if (count > 0) return;
  await prisma.projectCategory.createMany({
    data: defaultCategories.map((name, index) => ({
      propertyId: null,
      name,
      color: defaultCategoryColors[index % defaultCategoryColors.length],
      sortOrder: index,
    })),
    skipDuplicates: true,
  });
}

async function listAssignableUsers(propertyId: string) {
  return prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { role: UserRole.ADMIN },
        { propertyAccess: { some: { propertyId } } },
      ],
      role: { in: [UserRole.ADMIN, UserRole.MANAGER, UserRole.TECH, UserRole.LEASING, UserRole.CLEANER] },
    },
    select: { id: true, fullName: true, role: true },
    orderBy: [{ fullName: "asc" }],
  });
}

async function resolveAssignableUser(propertyId: string, assignedUserId?: string | null) {
  if (!assignedUserId) return null;
  const user = await prisma.user.findUnique({ where: { id: assignedUserId }, include: { propertyAccess: true } });
  if (!user || !user.isActive) throw Object.assign(new Error("Select an active project assignee"), { statusCode: 400 });
  if (user.role !== UserRole.ADMIN && !user.propertyAccess.some((access) => access.propertyId === propertyId)) {
    throw Object.assign(new Error("Selected user does not have access to this property"), { statusCode: 400 });
  }
  return user;
}

function techScopedProjectWhere(request: FastifyRequest) {
  const user = request.currentUser!;
  if (user.role !== UserRole.TECH) return undefined;
  return {
    OR: [
      { assignedUserId: user.id },
      { assignedRole: "TECH" },
      { executionType: { in: ["In-House", "Hybrid"] } },
    ],
  };
}

async function canEditProjectRecord(request: FastifyRequest, record: {
  propertyId: string;
  assignedUserId: string | null;
  assignedRole: string | null;
  executionType: string;
}) {
  const user = request.currentUser!;
  if (user.role === UserRole.ADMIN || user.role === UserRole.MANAGER) return true;
  if (user.role !== UserRole.TECH) return false;
  await assertPropertyAccess(request, record.propertyId);
  return record.assignedUserId === user.id || record.assignedRole === "TECH" || record.executionType === "In-House" || record.executionType === "Hybrid";
}

function projectMatchesQuery(record: {
  title: string;
  description: string | null;
  source: string | null;
  categoryName: string | null;
  companyName: string | null;
  building: string | null;
  area: string | null;
  locationNotes: string | null;
  deferredReason: string | null;
  deferredNotes: string | null;
  budgetYear: string | null;
  estimatedCost: number | null;
  actualCost: number | null;
  tags: string[];
  attachments?: Array<{ attachmentType: string }>;
  property: { code: string; name: string };
}, q?: string) {
  if (!q) return true;
  const haystack = [
    record.title,
    record.description,
    record.source,
    record.categoryName,
    record.companyName,
    record.building,
    record.area,
    record.locationNotes,
    record.deferredReason,
    record.deferredNotes,
    record.budgetYear,
    record.estimatedCost,
    record.actualCost,
    record.tags.join(" "),
    record.attachments?.map((entry) => entry.attachmentType).join(" "),
    record.property.code,
    record.property.name,
  ].join(" ").toLowerCase();
  return haystack.includes(q.toLowerCase());
}

async function projectOverview(propertyId: string | undefined, request: FastifyRequest) {
  await ensureDefaultCategories();
  const scoped = propertyScopeWhere(request, propertyId);
  const records = await prisma.projectRecord.findMany({
    where: {
      propertyId: scoped.where,
      ...(techScopedProjectWhere(request) ?? {}),
    },
    include: { property: true, attachments: true, comments: true },
    orderBy: [{ updatedAt: "desc" }],
    take: 300,
  });
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const active = records.filter((entry) => !entry.isArchived);
  const openRecommendations = active.filter((entry) => entry.recordType === "Recommendation" && !["Denied", "Archived", "Converted To Project"].includes(entry.status));
  const completedThisYear = active.filter((entry) => entry.completedDate && entry.completedDate.getFullYear() === new Date().getFullYear());
  const recommendationsByAge = [
    { label: "0-30 Days", value: openRecommendations.filter((entry) => daysOpen(entry) <= 30).length },
    { label: "31-90 Days", value: openRecommendations.filter((entry) => daysOpen(entry) > 30 && daysOpen(entry) <= 90).length },
    { label: "91-180 Days", value: openRecommendations.filter((entry) => daysOpen(entry) > 90 && daysOpen(entry) <= 180).length },
    { label: "180+ Days", value: openRecommendations.filter((entry) => daysOpen(entry) > 180).length },
  ];
  const projectsByBudgetYear = Array.from(active.reduce((map, entry) => {
    if (!entry.budgetYear) return map;
    map.set(entry.budgetYear, (map.get(entry.budgetYear) ?? 0) + 1);
    return map;
  }, new Map<string, number>()).entries()).map(([label, value]) => ({ label, value })).sort((left, right) => left.label.localeCompare(right.label));
  const projectsBySource = Array.from(active.reduce((map, entry) => {
    const key = entry.source ?? "Other";
    map.set(key, (map.get(key) ?? 0) + 1);
    return map;
  }, new Map<string, number>()).entries()).map(([label, value]) => ({ label, value })).sort((left, right) => right.value - left.value || left.label.localeCompare(right.label));
  return {
    permissions: projectRoleAccess(request.currentUser!.role),
    summary: {
      openRecommendations: active.filter((entry) => entry.recordType === "Recommendation" && entry.status === "Open").length,
      needsBid: active.filter((entry) => entry.status === "Needs Bid").length,
      approvedProjects: active.filter((entry) => entry.recordType === "Project" && entry.status === "Approved").length,
      inProgress: active.filter((entry) => entry.status === "In Progress").length,
      waiting: active.filter((entry) => entry.status === "Waiting").length,
      completedThisMonth: active.filter((entry) => entry.completedDate && entry.completedDate >= monthStart).length,
      overdue: active.filter((entry) => entry.dueDate && entry.dueDate < startOfDay() && !["Completed", "Cancelled", "Denied", "Archived"].includes(entry.status)).length,
      deferredMaintenance: active.filter((entry) => entry.deferredMaintenance).length,
      estimatedProjectValue: active.reduce((sum, entry) => sum + (entry.estimatedCost ?? entry.totalAmount ?? 0), 0),
      actualCompletedCostThisYear: completedThisYear.reduce((sum, entry) => sum + (entry.actualCost ?? 0), 0),
    },
    recommendationsByAge,
    projectsByBudgetYear,
    projectsBySource,
    recentActivity: records.slice(0, 10),
    recentPhotoActivity: active.filter((entry) => entry.attachments.length > 0).slice(0, 10).map((entry) => ({
      ...entry,
      attachments: [...entry.attachments].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    })),
    upcomingScheduledProjects: active.filter((entry) => entry.scheduledDate && entry.scheduledDate >= startOfDay()).sort((a, b) => (a.scheduledDate?.getTime() ?? 0) - (b.scheduledDate?.getTime() ?? 0)).slice(0, 10),
    highPriorityItems: active.filter((entry) => entry.priority === "High" || entry.priority === "Critical").slice(0, 10),
  };
}

function projectPhotoGroups(record: {
  attachments: Array<{
    id: string;
    originalName: string;
    mimeType: string;
    attachmentType: string;
    caption: string | null;
    uploaderName: string | null;
    createdAt: Date;
  }>;
}) {
  const groups = new Map<string, typeof record.attachments>();
  for (const attachment of record.attachments) {
    const key = attachment.attachmentType || "GENERAL";
    const current = groups.get(key) ?? [];
    current.push(attachment);
    groups.set(key, current);
  }
  return groups;
}

function isImageAttachment(mimeType: string) {
  return mimeType.startsWith("image/");
}

function projectAttachmentUrl(id: string) {
  return `/api/projects/attachments/${encodeURIComponent(id)}/download`;
}

function buildProjectsOverviewHtml(filtered: Array<Prisma.ProjectRecordGetPayload<{ include: { property: true; attachments: true } }>>) {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><title>Projects Report</title>
<style>
body{font-family:Arial,sans-serif;padding:24px;background:#f8fafc;color:#0f172a}
.report{display:grid;gap:20px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
.kpi,.card{background:#fff;border:1px solid #cbd5e1;border-radius:16px;padding:16px}
.kpi strong{display:block;font-size:28px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}
.project{background:#fff;border:1px solid #cbd5e1;border-radius:16px;padding:16px;display:grid;gap:12px}
.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px}
.meta strong{display:block;font-size:11px;text-transform:uppercase;color:#64748b}
.photo-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}
.photo-grid img{width:100%;height:140px;object-fit:cover;border-radius:12px;border:1px solid #cbd5e1}
.muted{color:#475569}
</style>
</head>
<body>
<div class="report">
  <h1>Projects Overview Report</h1>
  <div class="kpis">
    <div class="kpi"><strong>${filtered.length}</strong><span>Total records</span></div>
    <div class="kpi"><strong>${filtered.filter((record) => record.status === "In Progress").length}</strong><span>In progress</span></div>
    <div class="kpi"><strong>${filtered.filter((record) => record.deferredMaintenance).length}</strong><span>Deferred</span></div>
    <div class="kpi"><strong>${htmlEscape(filtered.reduce((sum, record) => sum + (record.estimatedCost ?? record.totalAmount ?? 0), 0))}</strong><span>Estimated value</span></div>
  </div>
  <div class="grid">
    ${filtered.map((record) => `
      <article class="project">
        <div>
          <div class="muted">${htmlEscape(record.property.code)} / ${htmlEscape(record.recordType)}</div>
          <h2>${htmlEscape(record.title)}</h2>
          <p class="muted">${htmlEscape(record.description ?? record.locationNotes ?? "No description provided.")}</p>
        </div>
        <div class="meta">
          <div><strong>Status</strong>${htmlEscape(record.status)}</div>
          <div><strong>Priority</strong>${htmlEscape(record.priority)}</div>
          <div><strong>Category</strong>${htmlEscape(record.categoryName ?? "")}</div>
          <div><strong>Location</strong>${htmlEscape([record.building, record.area].filter(Boolean).join(" / ") || "-")}</div>
          <div><strong>Assigned</strong>${htmlEscape(record.assignedUserName ?? record.companyName ?? "-")}</div>
          <div><strong>Budget Year</strong>${htmlEscape(record.budgetYear ?? "-")}</div>
        </div>
        ${record.attachments.filter((attachment) => isImageAttachment(attachment.mimeType)).length ? `<div class="photo-grid">${record.attachments.filter((attachment) => isImageAttachment(attachment.mimeType)).slice(0, 4).map((attachment) => `<figure><img src="${projectAttachmentUrl(attachment.id)}" alt="${htmlEscape(attachment.caption ?? attachment.originalName)}" /><figcaption class="muted">${htmlEscape(attachment.attachmentType)} / ${htmlEscape(attachment.caption ?? attachment.originalName)}</figcaption></figure>`).join("")}</div>` : `<p class="muted">No photos</p>`}
      </article>
    `).join("")}
  </div>
</div>
</body></html>`;
}

async function projectAttachmentImageSrc(
  attachment: ProjectReportRecord["attachments"][number],
  inlineImages: boolean,
) {
  if (!isImageAttachment(attachment.mimeType)) {
    return projectAttachmentUrl(attachment.id);
  }
  if (!inlineImages) {
    return projectAttachmentUrl(attachment.id);
  }
  const bytes = await readFile(resolveStoredUploadPath(attachment.storedName));
  return `data:${attachment.mimeType};base64,${bytes.toString("base64")}`;
}

type ProjectReportRecord = Prisma.ProjectRecordGetPayload<{
  include: {
    property: true;
    category: true;
    propertyMap: true;
    attachments: true;
    comments: true;
    tasks: true;
    wikiReferences: true;
  };
}>;

async function projectReportHtml(record: ProjectReportRecord, options?: { inlineImages?: boolean }) {
  const inlineImages = options?.inlineImages ?? false;
  const photos = record.attachments.filter((attachment) => isImageAttachment(attachment.mimeType));
  const photoGroups = projectPhotoGroups(record);
  const primaryPhoto = photos[0] ?? null;
  const supportingPhotos = photos.slice(1, 7);
  const comments = [...record.comments].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const primaryPhotoSrc = primaryPhoto ? await projectAttachmentImageSrc(primaryPhoto, inlineImages) : null;
  const supportingPhotoSrc = new Map<string, string>();
  await Promise.all(
    supportingPhotos.map(async (attachment) => {
      supportingPhotoSrc.set(attachment.id, await projectAttachmentImageSrc(attachment, inlineImages));
    }),
  );
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${htmlEscape(record.title)} Project Report</title>
  <style>
    body{font-family:Arial,sans-serif;padding:28px;background:#f8fafc;color:#0f172a}
    .report{max-width:1100px;margin:0 auto;display:grid;gap:20px}
    .hero,.section{background:#fff;border:1px solid #cbd5e1;border-radius:18px;padding:20px}
    .hero-grid,.meta-grid,.support-grid,.summary-grid{display:grid;gap:16px}
    .hero-grid{grid-template-columns:2fr 1fr}
    .meta-grid{grid-template-columns:repeat(auto-fit,minmax(160px,1fr))}
    .summary-grid{grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
    .support-grid{grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}
    h1,h2,h3,p{margin:0}
    .eyebrow{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#475569}
    .pill{display:inline-block;padding:4px 10px;border:1px solid #cbd5e1;border-radius:999px;background:#f8fafc;margin-right:8px;margin-bottom:8px}
    .muted{color:#475569}
    dt{font-size:12px;font-weight:700;text-transform:uppercase;color:#64748b}
    dd{margin:4px 0 0;font-size:15px}
    img{max-width:100%;display:block;border-radius:14px;border:1px solid #cbd5e1}
    figure{margin:0;display:grid;gap:8px}
    figcaption{font-size:12px;color:#475569}
    .comment,.history{border-top:1px solid #e2e8f0;padding-top:12px;margin-top:12px}
  </style>
</head>
<body>
  <div class="report">
    <section class="hero">
      <div class="hero-grid">
        <div>
          <div class="eyebrow">${htmlEscape(record.property.code)} / ${htmlEscape(record.recordType)}</div>
          <h1>${htmlEscape(record.title)}</h1>
          <p class="muted">${htmlEscape(record.description ?? record.locationNotes ?? "No description provided.")}</p>
          <div style="margin-top:12px">
            <span class="pill">${htmlEscape(record.status)}</span>
            <span class="pill">${htmlEscape(record.priority)}</span>
            <span class="pill">${htmlEscape(record.categoryName ?? "Uncategorized")}</span>
            <span class="pill">${htmlEscape(record.building ?? record.area ?? "No location")}</span>
          </div>
        </div>
        <div>
          ${primaryPhoto && primaryPhotoSrc ? `<figure><img src="${primaryPhotoSrc}" alt="${htmlEscape(primaryPhoto.caption ?? primaryPhoto.originalName)}" /><figcaption><strong>${htmlEscape(primaryPhoto.attachmentType)}</strong> ${htmlEscape(primaryPhoto.caption ?? primaryPhoto.originalName)}<br/>${htmlEscape(primaryPhoto.uploaderName ?? "Unknown")} / ${htmlEscape(primaryPhoto.createdAt.toLocaleDateString())}</figcaption></figure>` : `<div class="section" style="padding:16px;background:#f8fafc"><p class="muted">No project photo yet.</p></div>`}
        </div>
      </div>
    </section>

    <section class="section">
      <h2>Summary</h2>
      <div class="meta-grid" style="margin-top:12px">
        <div><dt>Property</dt><dd>${htmlEscape(record.property.name)}</dd></div>
        <div><dt>Location</dt><dd>${htmlEscape([record.building, record.area].filter(Boolean).join(" / ") || record.locationNotes || "Not specified")}</dd></div>
        <div><dt>Assigned</dt><dd>${htmlEscape(record.assignedUserName ?? record.companyName ?? record.assignedRole ?? "Unassigned")}</dd></div>
        <div><dt>Scheduled</dt><dd>${htmlEscape(record.scheduledDate?.toLocaleDateString() ?? "-")}</dd></div>
        <div><dt>Due</dt><dd>${htmlEscape(record.dueDate?.toLocaleDateString() ?? "-")}</dd></div>
        <div><dt>Cost / Amount</dt><dd>${htmlEscape(record.estimatedCost ?? record.totalAmount ?? "-")}</dd></div>
        <div><dt>Created</dt><dd>${htmlEscape(record.createdAt.toLocaleDateString())}</dd></div>
        <div><dt>Updated</dt><dd>${htmlEscape(record.updatedAt.toLocaleDateString())}</dd></div>
      </div>
    </section>

    <section class="section">
      <h2>Photos</h2>
      ${supportingPhotos.length ? `<div class="support-grid" style="margin-top:12px">${supportingPhotos.map((attachment) => `<figure><img src="${supportingPhotoSrc.get(attachment.id) ?? projectAttachmentUrl(attachment.id)}" alt="${htmlEscape(attachment.caption ?? attachment.originalName)}" /><figcaption><strong>${htmlEscape(attachment.attachmentType)}</strong> ${htmlEscape(attachment.caption ?? attachment.originalName)}<br/>${htmlEscape(attachment.uploaderName ?? "Unknown")} / ${htmlEscape(attachment.createdAt.toLocaleDateString())}</figcaption></figure>`).join("")}</div>` : `<p class="muted" style="margin-top:12px">No supporting photos.</p>`}
      <div class="summary-grid" style="margin-top:16px">
        ${Array.from(photoGroups.entries()).map(([group, items]) => `<div><h3>${htmlEscape(group)} Photos</h3><p class="muted">${items.length} file(s)</p></div>`).join("")}
      </div>
    </section>

    <section class="section">
      <h2>Comments</h2>
      ${comments.length ? comments.map((comment) => `<div class="comment"><strong>${htmlEscape(comment.authorName ?? "Unknown")}</strong><p>${htmlEscape(comment.body)}</p><p class="muted">${htmlEscape(comment.createdAt.toLocaleString())}</p></div>`).join("") : `<p class="muted">No comments yet.</p>`}
    </section>
  </div>
</body>
</html>`;
}

export async function projectRoutes(app: FastifyInstance) {
  app.get("/projects/overview", async (request, reply) => {
    if (!requireProjectsAccess(request, reply, "view")) return;
    const query = z.object({ propertyId: z.string().optional() }).parse(request.query);
    const scoped = propertyScopeWhere(request, query.propertyId);
    if (scoped.denied) return reply.code(403).send({ message: "Property access denied" });
    return projectOverview(query.propertyId, request);
  });

  app.get("/projects/categories", async (request, reply) => {
    if (!requireProjectsAccess(request, reply, "view")) return;
    await ensureDefaultCategories();
    const query = z.object({ propertyId: z.string().optional() }).parse(request.query);
    const scoped = propertyScopeWhere(request, query.propertyId);
    if (scoped.denied) return reply.code(403).send({ message: "Property access denied" });
    const categories = await prisma.projectCategory.findMany({
      where: {
        OR: [{ propertyId: null }, { propertyId: scoped.where }],
        isActive: true,
      },
      orderBy: [{ propertyId: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    });
    return { categories };
  });

  app.post("/projects/categories", async (request, reply) => {
    if (!requireProjectsAccess(request, reply, "admin")) return;
    const input = projectCategorySchema.parse(request.body);
    const category = await prisma.projectCategory.create({ data: input });
    reply.code(201);
    return { category };
  });

  app.patch("/projects/categories/:id", async (request, reply) => {
    if (!requireProjectsAccess(request, reply, "admin")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = projectCategorySchema.partial().parse(request.body);
    const category = await prisma.projectCategory.update({ where: { id }, data: input });
    return { category };
  });

  app.get("/projects/records", async (request, reply) => {
    if (!requireProjectsAccess(request, reply, "view")) return;
    await ensureDefaultCategories();
    const query = projectRecordQuerySchema.parse(request.query);
    const scoped = propertyScopeWhere(request, query.propertyId);
    if (scoped.denied) return reply.code(403).send({ message: "Property access denied" });
    const records = await prisma.projectRecord.findMany({
      where: {
        propertyId: scoped.where,
        recordType: query.recordType,
        source: query.source,
        status: query.status,
        priority: query.priority,
        categoryId: query.categoryId,
        executionType: query.executionType,
        assignedUserId: query.assignedUserId,
        budgetYear: query.budgetYear,
        deferredMaintenance: query.deferredMaintenance,
        isArchived: query.includeArchived ? undefined : false,
        dueDate: query.from || query.to ? {
          ...(query.from ? { gte: startOfDay(query.from) } : {}),
          ...(query.to ? { lte: endOfDay(query.to) } : {}),
        } : undefined,
        ...(techScopedProjectWhere(request) ?? {}),
      },
      include: {
        property: true,
        category: true,
        attachments: true,
        comments: true,
        tasks: true,
        wikiReferences: true,
      },
      orderBy: [{ updatedAt: "desc" }],
    });
    const filtered = records.filter((record) => {
      if (query.attachmentType && !record.attachments.some((attachment) => attachment.attachmentType === query.attachmentType)) return false;
      if (query.agingBucket && agingBucketFor(daysOpen(record)) !== query.agingBucket) return false;
      return projectMatchesQuery(record, query.q);
    }).map((record) => ({
      ...record,
      daysOpen: daysOpen(record),
      agingBucket: agingBucketFor(daysOpen(record)),
    }));
    const slice = filtered.slice(query.offset, query.offset + query.limit);
    return {
      records: slice,
      pagination: {
        total: filtered.length,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + slice.length < filtered.length,
      },
    };
  });

  app.get("/projects/map", async (request, reply) => {
    if (!requireProjectsAccess(request, reply, "view")) return;
    const query = projectRecordQuerySchema.parse(request.query);
    const scoped = propertyScopeWhere(request, query.propertyId);
    if (scoped.denied) return reply.code(403).send({ message: "Property access denied" });
    const records = await prisma.projectRecord.findMany({
      where: {
        propertyId: scoped.where,
        recordType: query.recordType,
        source: query.source,
        status: query.status,
        priority: query.priority,
        categoryId: query.categoryId,
        executionType: query.executionType,
        assignedUserId: query.assignedUserId,
        budgetYear: query.budgetYear,
        deferredMaintenance: query.deferredMaintenance,
        isArchived: query.includeArchived ? undefined : false,
        propertyMapId: { not: null },
        pinX: { not: null },
        pinY: { not: null },
        ...(techScopedProjectWhere(request) ?? {}),
      },
      include: { property: true, propertyMap: true, attachments: true },
      orderBy: [{ updatedAt: "desc" }],
    });
    return { records: records.map((record) => ({ ...record, daysOpen: daysOpen(record), agingBucket: agingBucketFor(daysOpen(record)) })) };
  });

  app.post("/projects/records", async (request, reply) => {
    if (!requireProjectsAccess(request, reply, "edit")) return;
    const input = projectRecordSchema.parse(request.body);
    await assertPropertyAccess(request, input.propertyId);
    const assignedUser = await resolveAssignableUser(input.propertyId, input.assignedUserId ?? null);
    const category = input.categoryId ? await prisma.projectCategory.findUnique({ where: { id: input.categoryId } }) : null;
    const record = await prisma.projectRecord.create({
      data: {
        ...input,
        assignedUserId: assignedUser?.id ?? null,
        assignedUserName: assignedUser?.fullName ?? null,
        categoryName: category?.name ?? null,
        createdById: request.currentUser!.id,
        updatedById: request.currentUser!.id,
      },
      include: { property: true, category: true, attachments: true, comments: true, tasks: true, wikiReferences: true },
    });
    if (assignedUser?.id) {
      await createNotification({
        userId: assignedUser.id,
        propertyId: record.propertyId,
        category: "ASSIGNMENT",
        title: "Project assigned",
        message: `${record.title} has been assigned to you.`,
        dedupeKey: `project-assignment:${record.id}:${assignedUser.id}`,
      });
    }
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: record.propertyId,
      entityType: "PROJECT_RECORD",
      entityId: record.id,
      action: "PROJECT_RECORD_CREATED",
      message: `Created ${record.recordType.toLowerCase()} ${record.title}`,
    });
    await queueWebhookEvent({
      eventType: "project.record.created",
      propertyId: record.propertyId,
      actorUserId: request.currentUser!.id,
      data: {
        id: record.id,
        propertyId: record.propertyId,
        recordType: record.recordType,
        title: record.title,
        status: record.status,
        priority: record.priority,
        assignedUserId: record.assignedUserId,
      },
    });
    reply.code(201);
    return { record };
  });

  app.get("/projects/records/:id", async (request, reply) => {
    if (!requireProjectsAccess(request, reply, "view")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const record = await prisma.projectRecord.findUnique({
      where: { id },
      include: {
        property: true,
        category: true,
        propertyMap: true,
        attachments: true,
        comments: true,
        tasks: true,
        wikiReferences: true,
      },
    });
    if (!record) return reply.code(404).send({ message: "Project record not found" });
    await assertPropertyAccess(request, record.propertyId);
    if (request.currentUser!.role === UserRole.TECH && !(await canEditProjectRecord(request, record)) && !techScopedProjectWhere(request)) {
      return reply.code(403).send({ message: "Projects access denied" });
    }
    const history = await prisma.auditLog.findMany({
      where: {
        propertyId: record.propertyId,
        OR: [
          { entityType: "PROJECT_RECORD", entityId: record.id },
          { entityType: "PROJECT_ATTACHMENT", entityId: { in: record.attachments.map((entry) => entry.id) } },
        ],
      },
      include: { actorUser: true },
      orderBy: { createdAt: "desc" },
      take: 25,
    });
    return {
      record: { ...record, daysOpen: daysOpen(record), agingBucket: agingBucketFor(daysOpen(record)) },
      history: history.map((item) => ({
        id: item.id,
        user: item.actorUser?.fullName ?? "Unknown user",
        date: item.createdAt,
        action: item.message,
      })),
    };
  });

  app.get("/projects/records/:id/report.html", async (request, reply) => {
    if (!requireProjectsAccess(request, reply, "view")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const record = await prisma.projectRecord.findUnique({
      where: { id },
      include: {
        property: true,
        category: true,
        propertyMap: true,
        attachments: { orderBy: [{ createdAt: "desc" }] },
        comments: { orderBy: [{ createdAt: "desc" }] },
        tasks: true,
        wikiReferences: true,
      },
    });
    if (!record) return reply.code(404).send({ message: "Project record not found" });
    await assertPropertyAccess(request, record.propertyId);
    reply.header("content-type", "text/html; charset=utf-8");
    return projectReportHtml(record);
  });

  app.get("/projects/records/:id/report.pdf", async (request, reply) => {
    if (!requireProjectsAccess(request, reply, "view")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const record = await prisma.projectRecord.findUnique({
      where: { id },
      include: {
        property: true,
        category: true,
        propertyMap: true,
        attachments: { orderBy: [{ createdAt: "desc" }] },
        comments: { orderBy: [{ createdAt: "desc" }] },
        tasks: true,
        wikiReferences: true,
      },
    });
    if (!record) return reply.code(404).send({ message: "Project record not found" });
    await assertPropertyAccess(request, record.propertyId);
    const html = await projectReportHtml(record, { inlineImages: true });
    const pdf = await renderPdfFromHtml(html);
    reply.header("content-type", "application/pdf");
    reply.header("content-disposition", `inline; filename="${sanitizeFilename(record.title)}-project-report.pdf"`);
    return reply.send(pdf);
  });

  app.patch("/projects/records/:id", async (request, reply) => {
    if (!requireProjectsAccess(request, reply, "edit")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = projectRecordSchema.partial().parse(request.body);
    const existing = await prisma.projectRecord.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ message: "Project record not found" });
    if (!(await canEditProjectRecord(request, existing))) return reply.code(403).send({ message: "Projects edit access denied" });
    const assignedUser = "assignedUserId" in input ? await resolveAssignableUser(existing.propertyId, input.assignedUserId ?? null) : null;
    const category = input.categoryId ? await prisma.projectCategory.findUnique({ where: { id: input.categoryId } }) : undefined;
    const nextStatus = input.status ?? existing.status;
    const completedDate = nextStatus === "Completed" ? (input.completedDate ?? existing.completedDate ?? new Date()) : input.completedDate;
    const record = await prisma.projectRecord.update({
      where: { id },
      data: {
        ...input,
        assignedUserId: "assignedUserId" in input ? assignedUser?.id ?? null : undefined,
        assignedUserName: "assignedUserId" in input ? assignedUser?.fullName ?? null : undefined,
        categoryName: input.categoryId ? category?.name ?? null : undefined,
        completedDate: completedDate ?? undefined,
        completedById: nextStatus === "Completed" ? request.currentUser!.id : undefined,
        updatedById: request.currentUser!.id,
      },
      include: { property: true, category: true, attachments: true, comments: true, tasks: true, wikiReferences: true },
    });
    if (assignedUser?.id && assignedUser.id !== existing.assignedUserId) {
      await createNotification({
        userId: assignedUser.id,
        propertyId: record.propertyId,
        category: "ASSIGNMENT",
        title: "Project assigned",
        message: `${record.title} has been assigned to you.`,
        dedupeKey: `project-assignment:${record.id}:${assignedUser.id}`,
      });
    }
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: record.propertyId,
      entityType: "PROJECT_RECORD",
      entityId: record.id,
      action: "PROJECT_RECORD_UPDATED",
      message: `Updated ${record.recordType.toLowerCase()} ${record.title}`,
    });
    const projectEventType = record.isArchived || record.status === "Archived" ? "project.record.archived" : "project.record.updated";
    await queueWebhookEvent({
      eventType: projectEventType,
      propertyId: record.propertyId,
      actorUserId: request.currentUser!.id,
      data: {
        id: record.id,
        propertyId: record.propertyId,
        recordType: record.recordType,
        title: record.title,
        status: record.status,
        priority: record.priority,
        assignedUserId: record.assignedUserId,
      },
    });
    return { record };
  });

  app.post("/projects/records/:id/convert", async (request, reply) => {
    if (!requireProjectsAccess(request, reply, "edit")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.projectRecord.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ message: "Project record not found" });
    if (!(await canEditProjectRecord(request, existing))) return reply.code(403).send({ message: "Projects edit access denied" });
    const record = await prisma.projectRecord.update({
      where: { id },
      data: {
        recordType: "Project",
        status: "Planning",
        updatedById: request.currentUser!.id,
      },
      include: { property: true, category: true, attachments: true, comments: true, tasks: true, wikiReferences: true },
    });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: record.propertyId,
      entityType: "PROJECT_RECORD",
      entityId: record.id,
      action: "PROJECT_RECORD_CONVERTED",
      message: `Converted recommendation ${record.title} to project`,
    });
    await queueWebhookEvent({
      eventType: "project.record.updated",
      propertyId: record.propertyId,
      actorUserId: request.currentUser!.id,
      data: {
        id: record.id,
        propertyId: record.propertyId,
        recordType: record.recordType,
        title: record.title,
        status: record.status,
        priority: record.priority,
      },
    });
    return { record };
  });

  app.post("/projects/records/:id/comments", async (request, reply) => {
    if (!requireProjectsAccess(request, reply, "edit")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = projectCommentSchema.parse(request.body);
    const record = await prisma.projectRecord.findUnique({ where: { id } });
    if (!record) return reply.code(404).send({ message: "Project record not found" });
    if (!(await canEditProjectRecord(request, record))) return reply.code(403).send({ message: "Projects edit access denied" });
    const comment = await prisma.projectComment.create({
      data: {
        recordId: id,
        propertyId: record.propertyId,
        authorId: request.currentUser!.id,
        authorName: request.currentUser!.fullName,
        body: input.body,
      },
    });
    reply.code(201);
    return { comment };
  });

  app.post("/projects/records/:id/tasks", async (request, reply) => {
    if (!requireProjectsAccess(request, reply, "edit")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = projectTaskSchema.parse(request.body);
    const record = await prisma.projectRecord.findUnique({ where: { id } });
    if (!record) return reply.code(404).send({ message: "Project record not found" });
    if (!(await canEditProjectRecord(request, record))) return reply.code(403).send({ message: "Projects edit access denied" });
    const assignedUser = await resolveAssignableUser(record.propertyId, input.assignedUserId ?? null);
    const task = await prisma.projectTask.create({
      data: {
        recordId: id,
        propertyId: record.propertyId,
        title: input.title,
        status: input.status ?? "Open",
        assignedUserId: assignedUser?.id ?? null,
        assignedUserName: assignedUser?.fullName ?? null,
        dueDate: input.dueDate ?? null,
      },
    });
    reply.code(201);
    return { task };
  });

  app.patch("/projects/tasks/:id", async (request, reply) => {
    if (!requireProjectsAccess(request, reply, "edit")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = projectTaskPatchSchema.parse(request.body);
    const existing = await prisma.projectTask.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ message: "Project task not found" });
    const record = await prisma.projectRecord.findUnique({ where: { id: existing.recordId } });
    if (!record || !(await canEditProjectRecord(request, record))) return reply.code(403).send({ message: "Projects edit access denied" });
    const assignedUser = "assignedUserId" in input ? await resolveAssignableUser(existing.propertyId, input.assignedUserId ?? null) : null;
    const nextStatus = input.status ?? existing.status;
    const task = await prisma.projectTask.update({
      where: { id },
      data: {
        ...input,
        assignedUserId: "assignedUserId" in input ? assignedUser?.id ?? null : undefined,
        assignedUserName: "assignedUserId" in input ? assignedUser?.fullName ?? null : undefined,
        completedDate: nextStatus === "Completed" ? (input.completedDate ?? existing.completedDate ?? new Date()) : input.completedDate,
        completedById: nextStatus === "Completed" ? request.currentUser!.id : undefined,
      },
    });
    return { task };
  });

  app.post("/projects/records/:id/attachments", async (request, reply) => {
    if (!requireProjectsAccess(request, reply, "edit")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const record = await prisma.projectRecord.findUnique({ where: { id }, include: { property: true } });
    if (!record) return reply.code(404).send({ message: "Project record not found" });
    if (!(await canEditProjectRecord(request, record))) return reply.code(403).send({ message: "Projects edit access denied" });
    const upload = await request.file();
    if (!upload) return reply.code(400).send({ message: "Attachment file is required" });
    const fields = projectAttachmentUploadSchema.parse({
      attachmentType: readMultipartFieldValue(upload.fields?.attachmentType),
      caption: readMultipartFieldValue(upload.fields?.caption),
    });
    const extension = extname(upload.filename).toLowerCase();
    if (!allowedAttachmentExtensions.has(extension) || !allowedAttachmentTypes.has(upload.mimetype)) {
      return reply.code(415).send({ message: "Unsupported project file type." });
    }
    const storedName = routedStoredName(record.property, `projects/${randomUUID()}-${sanitizeFilename(upload.filename)}`);
    await ensureStoredUploadParent(storedName);
    await pipeline(upload.file, createWriteStream(resolveStoredUploadPath(storedName)));
    const attachment = await prisma.projectAttachment.create({
      data: {
        recordId: record.id,
        propertyId: record.propertyId,
        uploadedById: request.currentUser!.id,
        uploaderName: request.currentUser!.fullName,
        originalName: upload.filename,
        storedName,
        mimeType: upload.mimetype,
        sizeBytes: upload.file.bytesRead,
        attachmentType: fields.attachmentType ?? "GENERAL",
        caption: fields.caption ?? null,
      },
    });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: attachment.propertyId,
      entityType: "PROJECT_ATTACHMENT",
      entityId: attachment.id,
      action: "PROJECT_ATTACHMENT_UPLOADED",
      message: `Uploaded ${attachment.originalName} to ${record.title}`,
      metadata: { attachmentType: attachment.attachmentType, caption: attachment.caption },
    });
    reply.code(201);
    return { attachment };
  });

  app.get("/projects/attachments/:id/download", async (request, reply) => {
    if (!requireProjectsAccess(request, reply, "view")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const attachment = await prisma.projectAttachment.findUnique({ where: { id } });
    if (!attachment) return reply.code(404).send({ message: "Project attachment not found" });
    await assertPropertyAccess(request, attachment.propertyId);
    reply.header("content-type", attachment.mimeType);
    reply.header("content-disposition", `attachment; filename="${sanitizeFilename(attachment.originalName)}"`);
    return reply.send(createReadStream(resolveStoredUploadPath(attachment.storedName)));
  });

  app.patch("/projects/attachments/:id", async (request, reply) => {
    if (!requireProjectsAccess(request, reply, "edit")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = projectAttachmentPatchSchema.parse(request.body);
    const existing = await prisma.projectAttachment.findUnique({
      where: { id },
      include: { record: true },
    });
    if (!existing) return reply.code(404).send({ message: "Project attachment not found" });
    if (!(await canEditProjectRecord(request, existing.record))) return reply.code(403).send({ message: "Projects edit access denied" });
    const attachment = await prisma.projectAttachment.update({
      where: { id },
      data: {
        attachmentType: input.attachmentType,
        caption: input.caption === undefined ? undefined : input.caption || null,
      },
    });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: attachment.propertyId,
      entityType: "PROJECT_ATTACHMENT",
      entityId: attachment.id,
      action: "PROJECT_ATTACHMENT_UPDATED",
      message: `Updated ${attachment.originalName} metadata on ${existing.record.title}`,
      metadata: { attachmentType: attachment.attachmentType, caption: attachment.caption },
    });
    return { attachment };
  });

  app.post("/projects/records/:id/wiki-references", async (request, reply) => {
    if (!requireProjectsAccess(request, reply, "edit")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = projectWikiReferenceSchema.parse(request.body);
    const record = await prisma.projectRecord.findUnique({ where: { id } });
    if (!record) return reply.code(404).send({ message: "Project record not found" });
    if (!(await canEditProjectRecord(request, record))) return reply.code(403).send({ message: "Projects edit access denied" });
    const reference = await prisma.projectWikiReference.create({
      data: {
        recordId: id,
        propertyId: record.propertyId,
        targetType: input.targetType,
        targetId: input.targetId,
        createdById: request.currentUser!.id,
      },
    });
    reply.code(201);
    return { reference };
  });

  app.delete("/projects/wiki-references/:id", async (request, reply) => {
    if (!requireProjectsAccess(request, reply, "edit")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.projectWikiReference.findUnique({ where: { id }, include: { record: true } });
    if (!existing) return reply.code(404).send({ message: "Project Wiki reference not found" });
    if (!(await canEditProjectRecord(request, existing.record))) return reply.code(403).send({ message: "Projects edit access denied" });
    await prisma.projectWikiReference.delete({ where: { id } });
    return { ok: true };
  });

  app.get("/projects/export.csv", async (request, reply) => {
    if (!requireProjectsAccess(request, reply, "view")) return;
    const query = projectRecordQuerySchema.parse(request.query);
    const scoped = propertyScopeWhere(request, query.propertyId);
    if (scoped.denied) return reply.code(403).send({ message: "Property access denied" });
    const records = await prisma.projectRecord.findMany({
      where: {
        propertyId: scoped.where,
        source: query.source,
        budgetYear: query.budgetYear,
        deferredMaintenance: query.deferredMaintenance,
        isArchived: query.includeArchived ? undefined : false,
        ...(techScopedProjectWhere(request) ?? {}),
      },
      include: { property: true, attachments: true },
      orderBy: [{ updatedAt: "desc" }],
    });
    const filtered = records.filter((record) => {
      if (query.attachmentType && !record.attachments.some((attachment) => attachment.attachmentType === query.attachmentType)) return false;
      if (query.agingBucket && agingBucketFor(daysOpen(record)) !== query.agingBucket) return false;
      return projectMatchesQuery(record, query.q);
    });
    const rows = filtered.map((record) => ({
      Property: record.property.code,
      RecordType: record.recordType,
      Title: record.title,
      Source: record.source ?? "",
      Status: record.status,
      Priority: record.priority,
      DaysOpen: daysOpen(record),
      BudgetYear: record.budgetYear ?? "",
      DeferredMaintenance: record.deferredMaintenance ? "Yes" : "No",
      DeferredReason: record.deferredReason ?? "",
      TargetYear: record.targetYear ?? "",
      Category: record.categoryName ?? "",
      ExecutionType: record.executionType,
      EstimatedCost: record.estimatedCost ?? "",
      ActualCost: record.actualCost ?? "",
      CompanyName: record.companyName ?? "",
      TotalAmount: record.totalAmount ?? "",
      Building: record.building ?? "",
      Area: record.area ?? "",
      ScheduledDate: record.scheduledDate?.toISOString().slice(0, 10) ?? "",
      DueDate: record.dueDate?.toISOString().slice(0, 10) ?? "",
      AssignedUser: record.assignedUserName ?? "",
    }));
    reply.header("content-type", "text/csv; charset=utf-8");
    reply.header("content-disposition", 'attachment; filename="projects-export.csv"');
    return stringify(rows, { header: true });
  });

  app.get("/projects/export.xls", async (request, reply) => {
    if (!requireProjectsAccess(request, reply, "view")) return;
    const query = projectRecordQuerySchema.parse(request.query);
    const scoped = propertyScopeWhere(request, query.propertyId);
    if (scoped.denied) return reply.code(403).send({ message: "Property access denied" });
    const records = await prisma.projectRecord.findMany({
      where: {
        propertyId: scoped.where,
        source: query.source,
        budgetYear: query.budgetYear,
        deferredMaintenance: query.deferredMaintenance,
        isArchived: query.includeArchived ? undefined : false,
        ...(techScopedProjectWhere(request) ?? {}),
      },
      include: { property: true, attachments: true },
      orderBy: [{ updatedAt: "desc" }],
    });
    const filtered = records.filter((record) => {
      if (query.attachmentType && !record.attachments.some((attachment) => attachment.attachmentType === query.attachmentType)) return false;
      if (query.agingBucket && agingBucketFor(daysOpen(record)) !== query.agingBucket) return false;
      return projectMatchesQuery(record, query.q);
    });
    const header = ["Property", "Record Type", "Title", "Source", "Status", "Priority", "Days Open", "Budget Year", "Deferred", "Deferred Reason", "Target Year", "Category", "Execution Type", "Estimated Cost", "Actual Cost", "Company Name", "Total Amount", "Scheduled Date", "Due Date", "Assigned User"];
    const lines = [header.join("\t"), ...filtered.map((record) => [
      record.property.code,
      record.recordType,
      record.title,
      record.source ?? "",
      record.status,
      record.priority,
      daysOpen(record),
      record.budgetYear ?? "",
      record.deferredMaintenance ? "Yes" : "No",
      record.deferredReason ?? "",
      record.targetYear ?? "",
      record.categoryName ?? "",
      record.executionType,
      record.estimatedCost ?? "",
      record.actualCost ?? "",
      record.companyName ?? "",
      record.totalAmount ?? "",
      record.scheduledDate?.toISOString().slice(0, 10) ?? "",
      record.dueDate?.toISOString().slice(0, 10) ?? "",
      record.assignedUserName ?? "",
    ].map(csvCell).join("\t"))];
    reply.header("content-type", "application/vnd.ms-excel; charset=utf-8");
    reply.header("content-disposition", 'attachment; filename="projects-export.xls"');
    return lines.join("\n");
  });

  app.get("/projects/report.html", async (request, reply) => {
    if (!requireProjectsAccess(request, reply, "view")) return;
    const query = projectRecordQuerySchema.parse(request.query);
    const scoped = propertyScopeWhere(request, query.propertyId);
    if (scoped.denied) return reply.code(403).send({ message: "Property access denied" });
    const records = await prisma.projectRecord.findMany({
      where: {
        propertyId: scoped.where,
        source: query.source,
        budgetYear: query.budgetYear,
        deferredMaintenance: query.deferredMaintenance,
        isArchived: query.includeArchived ? undefined : false,
        ...(techScopedProjectWhere(request) ?? {}),
      },
      include: { property: true, attachments: true },
      orderBy: [{ updatedAt: "desc" }],
    });
    const filtered = records.filter((record) => {
      if (query.attachmentType && !record.attachments.some((attachment) => attachment.attachmentType === query.attachmentType)) return false;
      if (query.agingBucket && agingBucketFor(daysOpen(record)) !== query.agingBucket) return false;
      return projectMatchesQuery(record, query.q);
    });
    reply.header("content-type", "text/html; charset=utf-8");
    return buildProjectsOverviewHtml(filtered);
  });

  app.get("/projects/report.pdf", async (request, reply) => {
    if (!requireProjectsAccess(request, reply, "view")) return;
    const query = projectRecordQuerySchema.parse(request.query);
    const scoped = propertyScopeWhere(request, query.propertyId);
    if (scoped.denied) return reply.code(403).send({ message: "Property access denied" });
    const records = await prisma.projectRecord.findMany({
      where: {
        propertyId: scoped.where,
        source: query.source,
        budgetYear: query.budgetYear,
        deferredMaintenance: query.deferredMaintenance,
        isArchived: query.includeArchived ? undefined : false,
        ...(techScopedProjectWhere(request) ?? {}),
      },
      include: { property: true, attachments: true },
      orderBy: [{ updatedAt: "desc" }],
    });
    const filtered = records.filter((record) => {
      if (query.attachmentType && !record.attachments.some((attachment) => attachment.attachmentType === query.attachmentType)) return false;
      if (query.agingBucket && agingBucketFor(daysOpen(record)) !== query.agingBucket) return false;
      return projectMatchesQuery(record, query.q);
    });
    const pdf = await renderPdfFromHtml(buildProjectsOverviewHtml(filtered));
    reply.header("content-type", "application/pdf");
    reply.header("content-disposition", 'inline; filename="projects-overview-report.pdf"');
    return reply.send(pdf);
  });
}
