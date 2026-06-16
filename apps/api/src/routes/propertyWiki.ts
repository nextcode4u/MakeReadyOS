import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { basename, extname } from "node:path";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { scopedAllowedPropertyIds } from "../lib/auth.js";
import { writeAuditLog } from "../lib/audit.js";
import { ensureStoredUploadParent, removeStoredUpload, resolveStoredUploadPath, routedStoredName } from "../lib/uploadStorage.js";
import { queueWebhookEvent } from "../lib/webhookQueue.js";

const wikiSections = [
  "UTILITIES",
  "ACCESS_CONTROL",
  "POOLS",
  "EMERGENCY_PROCEDURES",
  "CUSTOM_PAGES",
  "EQUIPMENT_REGISTRY",
  "UNIT_STANDARDS",
  "PROPERTY_CONTACTS",
  "SOP_LIBRARY",
  "KNOWN_ISSUES",
] as const;
const wikiAssetKinds = ["DOCUMENT", "PHOTO"] as const;
const wikiTargetTypes = ["ENTRY", "VENDOR", "ASSET"] as const;
const allowedAssetExtensions = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".heic", ".heif", ".bmp", ".tif", ".tiff", ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".txt", ".md"]);
const allowedAssetTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif",
  "image/bmp",
  "image/tiff",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/markdown",
]);

const utilityCategories = [
  "Domestic Water Shutoffs",
  "Irrigation Shutoffs",
  "Gas Shutoffs",
  "Electrical Disconnects",
  "Fire System",
  "Backflow Locations",
  "Drain Cleanouts",
  "Other",
] as const;

const accessControlCategories = [
  "Gate Operators",
  "Door Access",
  "Call Boxes",
  "Cameras",
  "Network Equipment",
  "Controllers",
  "Other",
] as const;

const equipmentCategories = [
  "Pool",
  "Gate",
  "Access Control",
  "HVAC",
  "Electrical",
  "Plumbing",
  "Fire System",
  "Irrigation",
  "Appliance",
  "Laundry",
  "Other",
] as const;

const propertyContactTypes = [
  "Property Manager",
  "Assistant Manager",
  "Maintenance Supervisor",
  "Regional Manager",
  "Regional Facilities",
  "Courtesy Officer",
  "Security",
  "After Hours",
  "Corporate",
  "Other",
] as const;

const sopCategories = [
  "Emergency",
  "Make Ready",
  "Pool",
  "Gate",
  "Access Control",
  "HVAC",
  "Plumbing",
  "Electrical",
  "Fire System",
  "Irrigation",
  "General",
  "Other",
] as const;

const knownIssueStatuses = ["Active", "Resolved", "Archived"] as const;

const vendorTypes = [
  "Pool",
  "Landscaping",
  "Gate",
  "Electrical",
  "Plumbing",
  "Fire",
  "Backflow",
  "Irrigation",
  "HVAC",
  "General Contractor",
  "Other",
] as const;

const documentCategories = [
  "Site Maps",
  "As-Builts",
  "Floor Plans",
  "Manuals",
  "Fire Plans",
  "Vendor Proposals",
  "Inspection Reports",
  "Emergency Contacts",
  "Other",
] as const;

const photoCategories = [
  "Utility Locations",
  "Equipment",
  "Site Maps",
  "Pool Equipment",
  "Gate Equipment",
  "Electrical Rooms",
  "Maintenance Notes",
  "Other",
] as const;

const defaultEmergencyProcedures = [
  "Major Water Leak",
  "Gas Leak",
  "Fire Alarm",
  "Power Outage",
  "Gate Failure",
  "Pool Closure",
  "Freeze Event",
  "Storm Damage",
  "Sewage Backup",
] as const;

function wikiAccess(role: string) {
  if (role === "ADMIN") return { view: true, edit: true, admin: true };
  if (role === "MANAGER" || role === "TECH") return { view: true, edit: true, admin: false };
  return { view: true, edit: false, admin: false };
}

function normalizeTags(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => String(entry).split(/[,\n]/))
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(0, 25);
  }
  return String(value ?? "")
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 25);
}

function normalizeIds(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean).slice(0, 50);
  }
  return String(value ?? "")
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 50);
}

function normalizeNullableDate(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function sanitizeFilename(filename: string) {
  return basename(filename).replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 180) || "wiki-asset";
}

function searchTokens(...values: Array<unknown>) {
  return values
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");
}

function snippet(text: string, query: string) {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (!normalized) return "";
  const matchIndex = normalized.toLowerCase().indexOf(query.toLowerCase());
  if (matchIndex < 0) {
    return normalized.slice(0, 160);
  }
  const start = Math.max(0, matchIndex - 50);
  const end = Math.min(normalized.length, matchIndex + query.length + 90);
  return `${start > 0 ? "..." : ""}${normalized.slice(start, end)}${end < normalized.length ? "..." : ""}`;
}

function uniqueTokens(...values: Array<unknown>) {
  return Array.from(new Set(
    values
      .flatMap((value) => (Array.isArray(value) ? value : [value]))
      .flatMap((value) => String(value ?? "").toLowerCase().split(/[^a-z0-9]+/))
      .map((value) => value.trim())
      .filter((value) => value.length >= 2),
  ));
}

function tokenOverlapCount(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return left.reduce((count, token) => count + (rightSet.has(token) ? 1 : 0), 0);
}

function requireWikiView(request: FastifyRequest) {
  const access = wikiAccess(request.currentUser?.role ?? "VIEWER");
  if (!access.view) throw Object.assign(new Error("Property Wiki access denied"), { statusCode: 403 });
  return access;
}

function requireWikiEdit(request: FastifyRequest) {
  const access = requireWikiView(request);
  if (!access.edit) throw Object.assign(new Error("Property Wiki edit access denied"), { statusCode: 403 });
  return access;
}

function canManagePins(role: string) {
  return role === "ADMIN" || role === "MANAGER";
}

function canManageEmergency(role: string) {
  return role === "ADMIN" || role === "MANAGER";
}

function targetSectionForAsset(kind: string) {
  return kind === "DOCUMENT" ? "DOCUMENTS" : "PHOTOS";
}

function isFavoritableEntrySection(section: string) {
  return ["UTILITIES", "EQUIPMENT_REGISTRY", "SOP_LIBRARY", "KNOWN_ISSUES", "CUSTOM_PAGES"].includes(section);
}

async function assertPropertyAccess(request: FastifyRequest, propertyId: string) {
  const scoped = scopedAllowedPropertyIds(request);
  if (scoped !== null && !scoped.includes(propertyId)) {
    throw Object.assign(new Error("Property access denied"), { statusCode: 403 });
  }
}

function propertyScopeWhere(request: FastifyRequest) {
  const scoped = scopedAllowedPropertyIds(request);
  return scoped === null ? undefined : { in: scoped };
}

async function resolveWikiTarget(targetType: (typeof wikiTargetTypes)[number], targetId: string) {
  if (targetType === "ENTRY") {
    const entry = await prisma.propertyWikiEntry.findUnique({
      where: { id: targetId },
      include: { property: true, assets: { orderBy: { createdAt: "desc" } } },
    });
    if (!entry) return null;
    return { targetType, propertyId: entry.propertyId, entry };
  }
  if (targetType === "VENDOR") {
    const vendor = await prisma.propertyWikiVendor.findUnique({
      where: { id: targetId },
      include: { property: true, assets: { orderBy: { createdAt: "desc" } } },
    });
    if (!vendor) return null;
    return { targetType, propertyId: vendor.propertyId, vendor };
  }
  const asset = await prisma.propertyWikiAsset.findUnique({
    where: { id: targetId },
    include: { property: true, entry: true, vendor: true },
  });
  if (!asset) return null;
  return { targetType, propertyId: asset.propertyId, asset };
}

function summarizeWikiTarget(
  resolved: Awaited<ReturnType<typeof resolveWikiTarget>>,
  favoriteSet?: Set<string>,
) {
  if (!resolved) return null;
  const favoriteKey = `${resolved.targetType}:${resolved.targetType === "ENTRY" ? resolved.entry.id : resolved.targetType === "VENDOR" ? resolved.vendor.id : resolved.asset.id}`;
  if (resolved.targetType === "ENTRY") {
    return {
      targetType: "ENTRY",
      id: resolved.entry.id,
      propertyId: resolved.entry.propertyId,
      property: resolved.entry.property,
      section: resolved.entry.section,
      title: resolved.entry.title,
      snippet: snippet(searchTokens(
        resolved.entry.notes,
        resolved.entry.content,
        resolved.entry.locationDescription,
        resolved.entry.equipmentModel,
        resolved.entry.manufacturer,
        resolved.entry.serialNumber,
        resolved.entry.floorPlan,
        resolved.entry.filterSizes,
        resolved.entry.building,
        resolved.entry.tags,
      ), resolved.entry.title),
      tags: resolved.entry.tags,
      updatedAt: resolved.entry.updatedAt,
      building: resolved.entry.building,
      isFavorite: favoriteSet?.has(favoriteKey) ?? false,
      isEmergency: resolved.entry.isEmergency,
    };
  }
  if (resolved.targetType === "VENDOR") {
    return {
      targetType: "VENDOR",
      id: resolved.vendor.id,
      propertyId: resolved.vendor.propertyId,
      property: resolved.vendor.property,
      section: "VENDORS",
      title: resolved.vendor.companyName,
      snippet: snippet(searchTokens(
        resolved.vendor.vendorType,
        resolved.vendor.contactName,
        resolved.vendor.phone,
        resolved.vendor.email,
        resolved.vendor.notes,
      ), resolved.vendor.companyName),
      tags: [],
      updatedAt: resolved.vendor.updatedAt,
      building: null,
      isFavorite: favoriteSet?.has(favoriteKey) ?? false,
      isEmergency: false,
    };
  }
  return {
    targetType: "ASSET",
    id: resolved.asset.id,
    propertyId: resolved.asset.propertyId,
    property: resolved.asset.property,
    section: targetSectionForAsset(resolved.asset.kind),
    title: resolved.asset.title,
    snippet: snippet(searchTokens(
      resolved.asset.category,
      resolved.asset.description,
      resolved.asset.building,
      resolved.asset.tags,
      resolved.asset.originalName,
      resolved.asset.entry?.title,
      resolved.asset.vendor?.companyName,
    ), resolved.asset.title),
    tags: resolved.asset.tags,
    updatedAt: resolved.asset.createdAt,
    building: resolved.asset.building,
    isFavorite: favoriteSet?.has(favoriteKey) ?? false,
    isEmergency: resolved.asset.isEmergency,
  };
}

async function favoriteSetForUser(userId: string, propertyId?: string) {
  const favorites = await prisma.propertyWikiFavorite.findMany({
    where: {
      userId,
      ...(propertyId ? { propertyId } : {}),
    },
  });
  return new Set(favorites.map((favorite) => `${favorite.targetType}:${favorite.targetId}`));
}

function multipartFieldValue(fields: Record<string, unknown>, key: string) {
  const field = fields[key] as { value?: unknown } | Array<{ value?: unknown }> | undefined;
  if (!field) return undefined;
  if (Array.isArray(field)) {
    return field[0]?.value === undefined ? undefined : String(field[0].value);
  }
  return field.value === undefined ? undefined : String(field.value);
}

export const profileSchema = z.object({
  propertyId: z.string().min(1),
  address: z.string().nullable().optional(),
  unitCount: z.number().int().nullable().optional(),
  buildingCount: z.number().int().nullable().optional(),
  officePhone: z.string().nullable().optional(),
  afterHoursPhone: z.string().nullable().optional(),
  propertyManager: z.string().nullable().optional(),
  maintenanceSupervisor: z.string().nullable().optional(),
  regionalManager: z.string().nullable().optional(),
  generalNotes: z.string().nullable().optional(),
});

export const entrySchema = z.object({
  propertyId: z.string().min(1),
  section: z.enum(wikiSections),
  title: z.string().trim().min(1).max(140),
  category: z.string().trim().nullable().optional(),
  building: z.string().trim().nullable().optional(),
  locationDescription: z.string().trim().nullable().optional(),
  equipmentModel: z.string().trim().nullable().optional(),
  manufacturer: z.string().trim().nullable().optional(),
  serialNumber: z.string().trim().nullable().optional(),
  installDate: z.coerce.date().nullable().optional(),
  warrantyExpiresAt: z.coerce.date().nullable().optional(),
  floorPlan: z.string().trim().nullable().optional(),
  unitType: z.string().trim().nullable().optional(),
  blindSizes: z.string().nullable().optional(),
  hvacNotes: z.string().nullable().optional(),
  waterHeaterNotes: z.string().nullable().optional(),
  applianceNotes: z.string().nullable().optional(),
  paintStandards: z.string().nullable().optional(),
  countertopNotes: z.string().nullable().optional(),
  cabinetNotes: z.string().nullable().optional(),
  flooringNotes: z.string().nullable().optional(),
  contactType: z.string().trim().nullable().optional(),
  contactTitle: z.string().trim().nullable().optional(),
  phone: z.string().trim().nullable().optional(),
  email: z.string().trim().nullable().optional(),
  isEmergencyContact: z.boolean().optional(),
  relatedEntryIds: z.union([z.array(z.string()), z.string()]).optional(),
  relatedVendorIds: z.union([z.array(z.string()), z.string()]).optional(),
  notes: z.string().nullable().optional(),
  content: z.string().nullable().optional(),
  issueStatus: z.enum(knownIssueStatuses).nullable().optional(),
  tags: z.union([z.array(z.string()), z.string()]).optional(),
  contacts: z.string().nullable().optional(),
  situation: z.string().nullable().optional(),
  poolCapacity: z.string().nullable().optional(),
  spaCapacity: z.string().nullable().optional(),
  pumpModels: z.string().nullable().optional(),
  filterModels: z.string().nullable().optional(),
  filterSizes: z.string().nullable().optional(),
  heaterModels: z.string().nullable().optional(),
  controllerNotes: z.string().nullable().optional(),
  chemicalTargetNotes: z.string().nullable().optional(),
  isPinned: z.boolean().optional(),
  isEmergency: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const vendorSchema = z.object({
  propertyId: z.string().min(1),
  vendorType: z.string().trim().min(1).max(80),
  companyName: z.string().trim().min(1).max(140),
  contactName: z.string().trim().nullable().optional(),
  phone: z.string().trim().nullable().optional(),
  email: z.string().trim().nullable().optional(),
  emergencyPhone: z.string().trim().nullable().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const assetMetadataSchema = z.object({
  propertyId: z.string().min(1),
  kind: z.enum(wikiAssetKinds),
  title: z.string().trim().min(1).max(140),
  category: z.string().trim().nullable().optional(),
  building: z.string().trim().nullable().optional(),
  description: z.string().nullable().optional(),
  tags: z.union([z.array(z.string()), z.string()]).optional(),
  isEmergency: z.boolean().optional(),
  entryId: z.string().nullable().optional(),
  vendorId: z.string().nullable().optional(),
});

export const favoriteSchema = z.object({
  targetType: z.enum(wikiTargetTypes),
  targetId: z.string().min(1),
});

const wikiReferenceRecordTypes = [
  "MAKE_READY_ITEM",
  "REFRIGERANT_TRANSACTION",
  "POOL_LOG_ENTRY",
  "PM_TEMPLATE",
  "PM_TASK",
  "PROJECT_RECORD",
  "LEASE_COMPLIANCE_ISSUE",
  "FUTURE_WORK_ORDER",
] as const;

const wikiWorkflowModules = [
  "MAKE_READY",
  "INSPECTION",
  "REFRIGERANT",
  "POOL_LOG",
  "PREVENTIVE_MAINTENANCE",
  "PROJECTS",
  "LEASE_COMPLIANCE",
  "FUTURE_WORK_ORDER",
] as const;

export const wikiReferenceSchema = z.object({
  recordType: z.enum(wikiReferenceRecordTypes),
  recordId: z.string().min(1),
  targetType: z.enum(wikiTargetTypes),
  targetId: z.string().min(1),
});

export const wikiContextQuerySchema = z.object({
  module: z.enum(wikiWorkflowModules),
  propertyId: z.string().optional(),
  recordType: z.enum(wikiReferenceRecordTypes).optional(),
  recordId: z.string().optional(),
  floorPlan: z.string().optional(),
  unitNumber: z.string().optional(),
  building: z.string().optional(),
  facilityName: z.string().optional(),
  equipmentQuery: z.string().optional(),
  query: z.string().optional(),
});

function uniqueById<T extends { id: string }>(rows: T[]) {
  return Array.from(new Map(rows.map((row) => [row.id, row])).values());
}

function tokenizeContext(values: Array<string | null | undefined>) {
  return values
    .flatMap((value) => String(value ?? "").split(/[^a-zA-Z0-9]+/))
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length >= 2);
}

async function resolveWikiReferenceRecord(recordType: (typeof wikiReferenceRecordTypes)[number], recordId: string) {
  if (recordType === "MAKE_READY_ITEM") {
    const item = await prisma.makeReadyItem.findUnique({
      where: { id: recordId },
      include: { property: true, unit: { include: { floorPlanRecord: true } } },
    });
    if (!item) return null;
    return {
      recordType,
      recordId: item.id,
      propertyId: item.propertyId,
      property: item.property,
      floorPlan: item.unit?.floorPlanRecord?.code ?? item.unit?.floorPlan ?? item.floorPlan ?? null,
      unitNumber: item.unit?.number ?? item.unitNumber ?? null,
      building: item.unit?.building ?? null,
      facilityName: null,
      equipmentQuery: item.itemName ?? null,
      query: searchTokens(item.itemName, item.notes, item.scopeLevel, item.boardGroup),
    };
  }
  if (recordType === "REFRIGERANT_TRANSACTION") {
    const transaction = await prisma.refrigerantTransaction.findUnique({
      where: { id: recordId },
    });
    if (!transaction) return null;
    return {
      recordType,
      recordId: transaction.id,
      propertyId: transaction.propertyId,
      property: transaction.propertyId ? await prisma.property.findUnique({ where: { id: transaction.propertyId } }) : null,
      floorPlan: null,
      unitNumber: transaction.unitNumber ?? null,
      building: null,
      facilityName: null,
      equipmentQuery: null,
      query: searchTokens(transaction.unitNumber, transaction.notes, transaction.transactionType),
    };
  }
  if (recordType === "POOL_LOG_ENTRY") {
    const entry = await prisma.poolLogEntry.findUnique({
      where: { id: recordId },
      include: { property: true, facility: true },
    });
    if (!entry) return null;
    return {
      recordType,
      recordId: entry.id,
      propertyId: entry.propertyId,
      property: entry.property,
      floorPlan: null,
      unitNumber: null,
      building: entry.facility.name,
      facilityName: entry.facility.name,
      equipmentQuery: entry.facility.name,
      query: searchTokens(entry.facility.name, entry.notes),
    };
  }
  if (recordType === "PM_TEMPLATE") {
    const template = await prisma.preventiveMaintenanceTemplate.findUnique({
      where: { id: recordId },
      include: { property: true },
    });
    if (!template) return null;
    return {
      recordType,
      recordId: template.id,
      propertyId: template.propertyId,
      property: template.property,
      floorPlan: null,
      unitNumber: null,
      building: null,
      facilityName: null,
      equipmentQuery: template.name,
      query: searchTokens(template.name, template.category, template.description, template.instructions),
    };
  }
  if (recordType === "PM_TASK") {
    const task = await prisma.preventiveMaintenanceTask.findUnique({
      where: { id: recordId },
      include: { property: true, template: true },
    });
    if (!task) return null;
    return {
      recordType,
      recordId: task.id,
      propertyId: task.propertyId,
      property: task.property,
      floorPlan: null,
      unitNumber: null,
      building: null,
      facilityName: null,
      equipmentQuery: task.taskName,
      query: searchTokens(task.taskName, task.category, task.description, task.instructions, task.template.name),
    };
  }
  if (recordType === "PROJECT_RECORD") {
    const record = await prisma.projectRecord.findUnique({
      where: { id: recordId },
      include: { property: true },
    });
    if (!record) return null;
    return {
      recordType,
      recordId: record.id,
      propertyId: record.propertyId,
      property: record.property,
      floorPlan: null,
      unitNumber: null,
      building: record.building,
      facilityName: null,
      equipmentQuery: record.title,
      query: searchTokens(record.title, record.description, record.categoryName, record.locationNotes, record.companyName, record.bidNotes, record.tags),
    };
  }
  if (recordType === "LEASE_COMPLIANCE_ISSUE") {
    const issue = await prisma.leaseComplianceIssue.findUnique({
      where: { id: recordId },
      include: { property: true, unit: true, issueType: true },
    });
    if (!issue) return null;
    return {
      recordType,
      recordId: issue.id,
      propertyId: issue.propertyId,
      property: issue.property,
      floorPlan: null,
      unitNumber: issue.unit?.number ?? null,
      building: issue.building ?? issue.unit?.building ?? null,
      facilityName: null,
      equipmentQuery: issue.issueType?.name ?? issue.issueTypeName ?? null,
      query: searchTokens(
        issue.issueType?.name,
        issue.issueTypeName,
        issue.additionalIssueType,
        issue.description,
        issue.locationNotes,
        issue.area,
        issue.tags,
      ),
    };
  }
  return null;
}

function scoreWikiSummary(
  summary: NonNullable<ReturnType<typeof summarizeWikiTarget>>,
  contextTokens: string[],
  options: {
    floorPlan?: string | null;
    building?: string | null;
    query?: string | null;
    facilityName?: string | null;
    equipmentQuery?: string | null;
    unitNumber?: string | null;
    module: (typeof wikiWorkflowModules)[number];
  },
) {
  let score = 0;
  const haystack = searchTokens(summary.title, summary.section, summary.snippet, summary.tags, summary.building);
  const titleTokens = uniqueTokens(summary.title);
  const queryTokens = uniqueTokens(options.query, options.equipmentQuery, options.unitNumber, options.floorPlan, options.building, options.facilityName);
  for (const token of contextTokens) {
    if (haystack.includes(token)) score += 3;
    if (summary.title.toLowerCase().includes(token)) score += 2;
    if (summary.building?.toLowerCase().includes(token)) score += 2;
    if (summary.tags.some((tag) => tag.toLowerCase().includes(token))) score += 2;
  }
  score += tokenOverlapCount(titleTokens, queryTokens) * 4;
  score += tokenOverlapCount(uniqueTokens(summary.tags), queryTokens) * 3;
  if (options.building && summary.building?.toLowerCase() === options.building.toLowerCase()) score += 5;
  if (options.floorPlan && haystack.includes(options.floorPlan.toLowerCase())) score += 6;
  if (options.unitNumber && haystack.includes(options.unitNumber.toLowerCase())) score += 2;
  if (options.facilityName && haystack.includes(options.facilityName.toLowerCase())) score += 5;
  if (options.equipmentQuery && haystack.includes(options.equipmentQuery.toLowerCase())) score += 3;
  if (summary.isFavorite) score += 1;
  if (summary.isEmergency) score += options.module === "POOL_LOG" ? 2 : 1;
  if (summary.section === "KNOWN_ISSUES") score += 2;
  if (options.module === "MAKE_READY" && summary.section === "UNIT_STANDARDS") score += 4;
  if (options.module === "INSPECTION" && ["EQUIPMENT_REGISTRY", "SOP_LIBRARY", "KNOWN_ISSUES", "UTILITIES"].includes(summary.section)) score += 3;
  if (options.module === "REFRIGERANT" && ["EQUIPMENT_REGISTRY", "KNOWN_ISSUES", "SOP_LIBRARY"].includes(summary.section)) score += 3;
  if (options.module === "POOL_LOG" && ["POOLS", "SOP_LIBRARY", "EMERGENCY_PROCEDURES"].includes(summary.section)) score += 3;
  if (options.module === "PREVENTIVE_MAINTENANCE" && ["EQUIPMENT_REGISTRY", "SOP_LIBRARY", "KNOWN_ISSUES", "VENDORS", "PHOTOS", "DOCUMENTS"].includes(summary.section)) score += 3;
  if (options.module === "LEASE_COMPLIANCE" && ["KNOWN_ISSUES", "SOP_LIBRARY", "DOCUMENTS", "PHOTOS", "VENDORS", "CUSTOM_PAGES"].includes(summary.section)) score += 3;
  return score;
}

function scoreRelatedEntry(
  source: {
    tags: string[];
    category: string | null;
    building: string | null;
    leadTokens: string[];
    relatedEntryIds: string[];
    relatedVendorIds: string[];
    sourceEntryId: string | null;
    sourceVendorId: string | null;
  },
  entry: {
    id: string;
    section: string;
    title: string;
    category: string | null;
    building: string | null;
    tags: string[];
  },
) {
  let score = 0;
  if (source.relatedEntryIds.includes(entry.id)) score += 20;
  if (source.sourceEntryId && entry.id === source.sourceEntryId) score -= 100;
  if (source.building && entry.building && source.building === entry.building) score += 8;
  if (source.category && entry.category && source.category === entry.category) score += 6;
  score += tokenOverlapCount(uniqueTokens(source.tags), uniqueTokens(entry.tags)) * 5;
  score += tokenOverlapCount(source.leadTokens, uniqueTokens(entry.title, entry.category, entry.tags)) * 3;
  if (entry.section === "KNOWN_ISSUES") score += 2;
  return score;
}

function scoreRelatedAsset(
  source: {
    tags: string[];
    category: string | null;
    building: string | null;
    leadTokens: string[];
    sourceEntryId: string | null;
    sourceVendorId: string | null;
  },
  asset: {
    id: string;
    title: string;
    category: string | null;
    building: string | null;
    tags: string[];
    entryId: string | null;
    vendorId: string | null;
  },
) {
  let score = 0;
  if (source.sourceEntryId && asset.entryId === source.sourceEntryId) score += 14;
  if (source.sourceVendorId && asset.vendorId === source.sourceVendorId) score += 14;
  if (source.building && asset.building && source.building === asset.building) score += 7;
  if (source.category && asset.category && source.category === asset.category) score += 5;
  score += tokenOverlapCount(uniqueTokens(source.tags), uniqueTokens(asset.tags)) * 5;
  score += tokenOverlapCount(source.leadTokens, uniqueTokens(asset.title, asset.category, asset.tags)) * 3;
  return score;
}

function scoreRelatedVendor(
  source: {
    category: string | null;
    leadTokens: string[];
    relatedVendorIds: string[];
    linkedVendorIds: string[];
    sourceVendorId: string | null;
  },
  vendor: {
    id: string;
    vendorType: string;
    companyName: string;
    notes: string | null;
  },
) {
  let score = 0;
  if (source.relatedVendorIds.includes(vendor.id)) score += 20;
  if (source.linkedVendorIds.includes(vendor.id)) score += 10;
  if (source.category && vendor.vendorType === source.category) score += 6;
  score += tokenOverlapCount(source.leadTokens, uniqueTokens(vendor.companyName, vendor.vendorType, vendor.notes)) * 3;
  if (source.sourceVendorId && vendor.id === source.sourceVendorId) score -= 100;
  return score;
}

type WikiSummary = NonNullable<ReturnType<typeof summarizeWikiTarget>>;

async function buildWikiWorkflowContext(
  request: FastifyRequest,
  input: z.infer<typeof wikiContextQuerySchema>,
) {
  const recordContext = input.recordType && input.recordId ? await resolveWikiReferenceRecord(input.recordType, input.recordId) : null;
  const propertyId = recordContext?.propertyId ?? input.propertyId;
  if (!propertyId) {
    throw Object.assign(new Error("Property Wiki context requires a property"), { statusCode: 400 });
  }
  await assertPropertyAccess(request, propertyId);

  const context = {
    module: input.module,
    propertyId,
    recordType: recordContext?.recordType ?? input.recordType ?? null,
    recordId: recordContext?.recordId ?? input.recordId ?? null,
    floorPlan: recordContext?.floorPlan ?? input.floorPlan ?? null,
    unitNumber: recordContext?.unitNumber ?? input.unitNumber ?? null,
    building: recordContext?.building ?? input.building ?? null,
    facilityName: recordContext?.facilityName ?? input.facilityName ?? null,
    equipmentQuery: recordContext?.equipmentQuery ?? input.equipmentQuery ?? null,
    query: input.query ?? recordContext?.query ?? null,
  };

  const [entries, vendors, assets, favoriteKeySet, references] = await Promise.all([
    prisma.propertyWikiEntry.findMany({
      where: { propertyId, isActive: true },
      include: { property: true, assets: { orderBy: { createdAt: "desc" } } },
      orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
    }),
    prisma.propertyWikiVendor.findMany({
      where: { propertyId, isActive: true },
      include: { property: true, assets: { orderBy: { createdAt: "desc" } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.propertyWikiAsset.findMany({
      where: { propertyId },
      include: { property: true, entry: true, vendor: true },
      orderBy: { createdAt: "desc" },
    }),
    request.currentUser ? favoriteSetForUser(request.currentUser.id, propertyId) : Promise.resolve(new Set<string>()),
    context.recordType && context.recordId
      ? prisma.propertyWikiReference.findMany({
        where: { propertyId, recordType: context.recordType, recordId: context.recordId },
        orderBy: { createdAt: "desc" },
      })
      : Promise.resolve([]),
  ]);

  const allSummaries = uniqueById([
    ...entries.map((entry) => ({ id: entry.id, summary: summarizeWikiTarget({ targetType: "ENTRY", propertyId: entry.propertyId, entry }, favoriteKeySet) })),
    ...vendors.map((vendor) => ({ id: vendor.id, summary: summarizeWikiTarget({ targetType: "VENDOR", propertyId: vendor.propertyId, vendor }, favoriteKeySet) })),
    ...assets.map((asset) => ({ id: asset.id, summary: summarizeWikiTarget({ targetType: "ASSET", propertyId: asset.propertyId, asset }, favoriteKeySet) })),
  ])
    .map((item) => item.summary)
    .filter((item): item is WikiSummary => Boolean(item));

  const tokens = tokenizeContext([
    context.floorPlan,
    context.unitNumber,
    context.building,
    context.facilityName,
    context.equipmentQuery,
    context.query,
  ]);
  const scored = allSummaries
    .map((summary) => ({
      summary,
      score: scoreWikiSummary(summary, tokens, context),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || new Date(right.summary.updatedAt).getTime() - new Date(left.summary.updatedAt).getTime());

  const attachedKeys = new Set(references.map((reference) => `${reference.targetType}:${reference.targetId}`));
  const attached = (await Promise.all(references.map(async (reference) => {
    const resolved = await resolveWikiTarget(reference.targetType as (typeof wikiTargetTypes)[number], reference.targetId);
    const summary = summarizeWikiTarget(resolved, favoriteKeySet);
    if (!summary) return null;
    return { ...summary, referenceId: reference.id, attachedAt: reference.createdAt };
  }))).filter((item): item is WikiSummary & { referenceId: string; attachedAt: Date } => Boolean(item));
  const suggestions = scored
    .map((item) => item.summary)
    .filter((summary) => !attachedKeys.has(`${summary.targetType}:${summary.id}`))
    .slice(0, 8);
  const makeReadyStandards = scored
    .map((item) => item.summary)
    .filter((summary) => summary.section === "UNIT_STANDARDS")
    .slice(0, 4);
  const knownIssues = scored
    .map((item) => item.summary)
    .filter((summary) => summary.section === "KNOWN_ISSUES")
    .slice(0, 6);
  const emergencyRecords = scored
    .map((item) => item.summary)
    .filter((summary) => summary.isEmergency || summary.section === "EMERGENCY_PROCEDURES")
    .slice(0, 6);
  const related = {
    sops: scored.map((item) => item.summary).filter((summary) => summary.section === "SOP_LIBRARY").slice(0, 4),
    vendors: scored.map((item) => item.summary).filter((summary) => summary.section === "VENDORS").slice(0, 4),
    equipment: scored.map((item) => item.summary).filter((summary) => summary.section === "EQUIPMENT_REGISTRY").slice(0, 4),
    photos: scored.map((item) => item.summary).filter((summary) => summary.section === "PHOTOS").slice(0, 4),
    documents: scored.map((item) => item.summary).filter((summary) => summary.section === "DOCUMENTS").slice(0, 4),
    knownIssues: scored.map((item) => item.summary).filter((summary) => summary.section === "KNOWN_ISSUES").slice(0, 4),
  };

  return {
    context,
    attached,
    suggestions,
    makeReadyStandards,
    knownIssues,
    emergencyRecords,
    related,
  };
}

export async function propertyWikiRoutes(app: FastifyInstance) {
  app.get("/property-wiki/overview", async (request) => {
    const access = requireWikiView(request);
    const query = z.object({ propertyId: z.string().optional() }).parse(request.query);
    if (query.propertyId) {
      await assertPropertyAccess(request, query.propertyId);
    }
    const propertyId = query.propertyId;

    const [profile, recentEntries, pinnedEntries, emergencyProcedures, emergencyContacts, emergencyEntries, emergencyVendors, emergencyAssets, vendors, documents, photos, favorites, recentViews, property] = await Promise.all([
      propertyId ? prisma.propertyWikiProfile.findUnique({ where: { propertyId } }) : null,
      prisma.propertyWikiEntry.findMany({
        where: {
          propertyId: propertyId ?? propertyScopeWhere(request),
          isActive: true,
        },
        include: { property: true },
        orderBy: { updatedAt: "desc" },
        take: 8,
      }),
      prisma.propertyWikiEntry.findMany({
        where: {
          propertyId: propertyId ?? propertyScopeWhere(request),
          isPinned: true,
          isActive: true,
        },
        include: { property: true },
        orderBy: { updatedAt: "desc" },
        take: 8,
      }),
      prisma.propertyWikiEntry.findMany({
        where: {
          propertyId: propertyId ?? propertyScopeWhere(request),
          section: "EMERGENCY_PROCEDURES",
          isActive: true,
        },
        include: { property: true },
        orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
        take: 8,
      }),
      prisma.propertyWikiEntry.findMany({
        where: {
          propertyId: propertyId ?? propertyScopeWhere(request),
          section: "PROPERTY_CONTACTS",
          isActive: true,
          isEmergencyContact: true,
        },
        include: { property: true, assets: { orderBy: { createdAt: "desc" } } },
        orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
        take: 8,
      }),
      prisma.propertyWikiEntry.findMany({
        where: {
          propertyId: propertyId ?? propertyScopeWhere(request),
          isEmergency: true,
          isActive: true,
        },
        include: { property: true, assets: { orderBy: { createdAt: "desc" } } },
        orderBy: [{ section: "asc" }, { updatedAt: "desc" }],
        take: 24,
      }),
      prisma.propertyWikiVendor.findMany({
        where: {
          propertyId: propertyId ?? propertyScopeWhere(request),
          emergencyPhone: { not: null },
          isActive: true,
        },
        include: { property: true, assets: { orderBy: { createdAt: "desc" } } },
        orderBy: { updatedAt: "desc" },
        take: 8,
      }),
      prisma.propertyWikiAsset.findMany({
        where: {
          propertyId: propertyId ?? propertyScopeWhere(request),
          isEmergency: true,
        },
        include: { property: true, entry: true, vendor: true },
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
      prisma.propertyWikiVendor.findMany({
        where: {
          propertyId: propertyId ?? propertyScopeWhere(request),
          isActive: true,
        },
        include: { property: true },
        orderBy: { updatedAt: "desc" },
        take: 6,
      }),
      prisma.propertyWikiAsset.findMany({
        where: {
          propertyId: propertyId ?? propertyScopeWhere(request),
          kind: "DOCUMENT",
        },
        include: { property: true },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      prisma.propertyWikiAsset.findMany({
        where: {
          propertyId: propertyId ?? propertyScopeWhere(request),
          kind: "PHOTO",
        },
        include: { property: true },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      request.currentUser
        ? prisma.propertyWikiFavorite.findMany({
          where: {
            userId: request.currentUser.id,
            ...(propertyId ? { propertyId } : { propertyId: propertyScopeWhere(request) }),
          },
          orderBy: { createdAt: "desc" },
          take: 12,
        })
        : [],
      request.currentUser
        ? prisma.propertyWikiRecentView.findMany({
          where: {
            userId: request.currentUser.id,
            ...(propertyId ? { propertyId } : { propertyId: propertyScopeWhere(request) }),
          },
          orderBy: { viewedAt: "desc" },
          take: 20,
        })
        : [],
      propertyId ? prisma.property.findUnique({ where: { id: propertyId } }) : null,
    ]);

    const commonCategoryCounts = new Map<string, number>();
    for (const entry of recentEntries) {
      if (entry.category) {
        commonCategoryCounts.set(entry.category, (commonCategoryCounts.get(entry.category) ?? 0) + 1);
      }
    }
    for (const vendor of vendors) {
      commonCategoryCounts.set(vendor.vendorType, (commonCategoryCounts.get(vendor.vendorType) ?? 0) + 1);
    }

    const favoriteKeySet = new Set(favorites.map((favorite) => `${favorite.targetType}:${favorite.targetId}`));
    const favoriteSummaries = (await Promise.all(favorites.map(async (favorite) => summarizeWikiTarget(await resolveWikiTarget(favorite.targetType as (typeof wikiTargetTypes)[number], favorite.targetId), favoriteKeySet))))
      .filter(Boolean);
    const recentViewSummaries = (await Promise.all(recentViews.map(async (view) => {
      const summary = summarizeWikiTarget(await resolveWikiTarget(view.targetType as (typeof wikiTargetTypes)[number], view.targetId), favoriteKeySet);
      if (!summary) return null;
      return { ...summary, viewedAt: view.viewedAt };
    }))).filter(Boolean);
    const emergencyMode = [
      ...emergencyEntries.map((entry) => ({
        targetType: "ENTRY" as const,
        id: entry.id,
        propertyId: entry.propertyId,
        property: entry.property,
        section: entry.section,
        title: entry.title,
        snippet: snippet(searchTokens(entry.notes, entry.content, entry.locationDescription, entry.building, entry.tags), entry.title),
        tags: entry.tags,
        updatedAt: entry.updatedAt,
        building: entry.building,
        isFavorite: favoriteKeySet.has(`ENTRY:${entry.id}`),
        isEmergency: true,
      })),
      ...emergencyVendors.map((vendor) => ({
        targetType: "VENDOR" as const,
        id: vendor.id,
        propertyId: vendor.propertyId,
        property: vendor.property,
        section: "VENDORS",
        title: vendor.companyName,
        snippet: snippet(searchTokens(vendor.vendorType, vendor.contactName, vendor.emergencyPhone, vendor.notes), vendor.companyName),
        tags: [],
        updatedAt: vendor.updatedAt,
        building: null,
        isFavorite: favoriteKeySet.has(`VENDOR:${vendor.id}`),
        isEmergency: true,
      })),
      ...emergencyAssets.map((asset) => ({
        targetType: "ASSET" as const,
        id: asset.id,
        propertyId: asset.propertyId,
        property: asset.property,
        section: targetSectionForAsset(asset.kind),
        title: asset.title,
        snippet: snippet(searchTokens(asset.category, asset.description, asset.building, asset.tags), asset.title),
        tags: asset.tags,
        updatedAt: asset.createdAt,
        building: asset.building,
        isFavorite: favoriteKeySet.has(`ASSET:${asset.id}`),
        isEmergency: true,
      })),
    ].slice(0, 24);

    return {
      permissions: access,
      categories: {
        utility: utilityCategories,
        accessControl: accessControlCategories,
        equipment: equipmentCategories,
        knownIssueStatuses,
        propertyContacts: propertyContactTypes,
        sop: sopCategories,
        vendorTypes,
        document: documentCategories,
        photo: photoCategories,
      },
      defaultEmergencyProcedures,
      property,
      profile,
      recentlyUpdated: recentEntries,
      pinnedCriticalInformation: pinnedEntries,
      favorites: favoriteSummaries,
      recentlyViewed: recentViewSummaries,
      emergencyMode,
      emergencyProcedures,
      emergencyContacts,
      vendorHighlights: vendors,
      recentDocuments: documents,
      recentPhotos: photos,
      commonCategories: Array.from(commonCategoryCounts.entries())
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, 8)
        .map(([label, count]) => ({ label, count })),
    };
  });

  app.get("/property-wiki/profile", async (request) => {
    requireWikiView(request);
    const query = z.object({ propertyId: z.string() }).parse(request.query);
    await assertPropertyAccess(request, query.propertyId);
    const [profile, property] = await Promise.all([
      prisma.propertyWikiProfile.findUnique({ where: { propertyId: query.propertyId } }),
      prisma.property.findUnique({ where: { id: query.propertyId } }),
    ]);
    return { profile, property };
  });

  app.patch("/property-wiki/profile", async (request) => {
    requireWikiEdit(request);
    const input = profileSchema.parse(request.body);
    await assertPropertyAccess(request, input.propertyId);
    const profile = await prisma.propertyWikiProfile.upsert({
      where: { propertyId: input.propertyId },
      create: {
        ...input,
        createdById: request.currentUser!.id,
        updatedById: request.currentUser!.id,
      },
      update: {
        ...input,
        updatedById: request.currentUser!.id,
      },
    });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, propertyId: input.propertyId, entityType: "PROPERTY_WIKI_PROFILE", entityId: profile.id, action: "PROPERTY_WIKI_PROFILE_SAVED", message: "Saved property wiki overview profile" });
    return { profile };
  });

  app.get("/property-wiki/entries", async (request) => {
    requireWikiView(request);
    const query = z.object({
      propertyId: z.string().optional(),
      section: z.enum(wikiSections).optional(),
      includeInactive: z.coerce.boolean().optional(),
      q: z.string().optional(),
    }).parse(request.query);
    if (query.propertyId) await assertPropertyAccess(request, query.propertyId);
    const normalizedQuery = query.q?.toLowerCase();
    const entries = await prisma.propertyWikiEntry.findMany({
      where: {
        propertyId: query.propertyId ?? propertyScopeWhere(request),
        section: query.section,
        isActive: query.includeInactive ? undefined : true,
      },
      include: {
        property: true,
        assets: {
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
    });
    const filtered = normalizedQuery
      ? entries.filter((entry) => searchTokens(
        entry.title,
        entry.category,
        entry.building,
        entry.locationDescription,
        entry.equipmentModel,
        entry.manufacturer,
        entry.serialNumber,
        entry.floorPlan,
        entry.unitType,
        entry.filterSizes,
        entry.blindSizes,
        entry.contactType,
        entry.contactTitle,
        entry.phone,
        entry.email,
        entry.notes,
        entry.content,
        entry.issueStatus,
        entry.tags,
        entry.contacts,
        entry.situation,
        entry.poolCapacity,
        entry.pumpModels,
        entry.filterModels,
        entry.heaterModels,
        entry.controllerNotes,
        entry.chemicalTargetNotes,
        entry.hvacNotes,
        entry.waterHeaterNotes,
        entry.applianceNotes,
        entry.paintStandards,
        entry.countertopNotes,
        entry.cabinetNotes,
        entry.flooringNotes,
      ).includes(normalizedQuery))
      : entries;
    return { entries: filtered };
  });

  app.post("/property-wiki/entries", async (request, reply) => {
    requireWikiEdit(request);
    const input = entrySchema.parse(request.body);
    await assertPropertyAccess(request, input.propertyId);
    const pinAllowed = input.isPinned === undefined || canManagePins(request.currentUser!.role);
    if (!pinAllowed) {
      throw Object.assign(new Error("Only managers and admins can pin wiki records"), { statusCode: 403 });
    }
    if (input.isEmergency !== undefined && !canManageEmergency(request.currentUser!.role)) {
      throw Object.assign(new Error("Only managers and admins can manage emergency wiki records"), { statusCode: 403 });
    }
    const entry = await prisma.propertyWikiEntry.create({
      data: {
        ...input,
        installDate: normalizeNullableDate(input.installDate),
        warrantyExpiresAt: normalizeNullableDate(input.warrantyExpiresAt),
        relatedEntryIds: normalizeIds(input.relatedEntryIds),
        relatedVendorIds: normalizeIds(input.relatedVendorIds),
        tags: normalizeTags(input.tags),
        createdById: request.currentUser!.id,
        updatedById: request.currentUser!.id,
      },
      include: { property: true, assets: true },
    });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, propertyId: input.propertyId, entityType: "PROPERTY_WIKI_ENTRY", entityId: entry.id, action: "PROPERTY_WIKI_ENTRY_CREATED", message: `Created property wiki ${input.section.toLowerCase().replace(/_/g, " ")} entry ${entry.title}` });
    await queueWebhookEvent({
      eventType: "wiki.entry.created",
      propertyId: entry.propertyId,
      actorUserId: request.currentUser!.id,
      data: {
        entryId: entry.id,
        section: entry.section,
        title: entry.title,
        category: entry.category,
        building: entry.building,
        issueStatus: entry.issueStatus,
        isEmergency: entry.isEmergency,
        isPinned: entry.isPinned,
        isActive: entry.isActive,
      },
    });
    reply.code(201);
    return { entry };
  });

  app.patch("/property-wiki/entries/:id", async (request) => {
    requireWikiEdit(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = entrySchema.partial().parse(request.body);
    const { tags, installDate, warrantyExpiresAt, relatedEntryIds, relatedVendorIds, ...rest } = input;
    const existing = await prisma.propertyWikiEntry.findUnique({ where: { id }, include: { property: true, assets: true } });
    if (!existing) throw Object.assign(new Error("Property wiki entry not found"), { statusCode: 404 });
    await assertPropertyAccess(request, existing.propertyId);
    if (input.isPinned !== undefined && !canManagePins(request.currentUser!.role)) {
      throw Object.assign(new Error("Only managers and admins can pin wiki records"), { statusCode: 403 });
    }
    if (input.isEmergency !== undefined && !canManageEmergency(request.currentUser!.role)) {
      throw Object.assign(new Error("Only managers and admins can manage emergency wiki records"), { statusCode: 403 });
    }
    const entry = await prisma.propertyWikiEntry.update({
      where: { id },
      data: {
        ...rest,
        ...(installDate !== undefined ? { installDate: normalizeNullableDate(installDate) } : {}),
        ...(warrantyExpiresAt !== undefined ? { warrantyExpiresAt: normalizeNullableDate(warrantyExpiresAt) } : {}),
        ...(relatedEntryIds !== undefined ? { relatedEntryIds: normalizeIds(relatedEntryIds) } : {}),
        ...(relatedVendorIds !== undefined ? { relatedVendorIds: normalizeIds(relatedVendorIds) } : {}),
        ...(tags !== undefined ? { tags: normalizeTags(tags) } : {}),
        updatedById: request.currentUser!.id,
      },
      include: { property: true, assets: true },
    });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, propertyId: existing.propertyId, entityType: "PROPERTY_WIKI_ENTRY", entityId: existing.id, action: "PROPERTY_WIKI_ENTRY_UPDATED", message: `Updated property wiki entry ${entry.title}` });
    await queueWebhookEvent({
      eventType: "wiki.entry.updated",
      propertyId: entry.propertyId,
      actorUserId: request.currentUser!.id,
      data: {
        entryId: entry.id,
        section: entry.section,
        title: entry.title,
        category: entry.category,
        building: entry.building,
        issueStatus: entry.issueStatus,
        isEmergency: entry.isEmergency,
        isPinned: entry.isPinned,
        isActive: entry.isActive,
      },
    });
    return { entry };
  });

  app.get("/property-wiki/vendors", async (request) => {
    requireWikiView(request);
    const query = z.object({
      propertyId: z.string().optional(),
      includeInactive: z.coerce.boolean().optional(),
      q: z.string().optional(),
    }).parse(request.query);
    if (query.propertyId) await assertPropertyAccess(request, query.propertyId);
    const normalizedQuery = query.q?.toLowerCase();
    const vendors = await prisma.propertyWikiVendor.findMany({
      where: {
        propertyId: query.propertyId ?? propertyScopeWhere(request),
        isActive: query.includeInactive ? undefined : true,
      },
      include: {
        property: true,
        assets: {
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: [{ isActive: "desc" }, { companyName: "asc" }],
    });
    const filtered = normalizedQuery
      ? vendors.filter((vendor) => searchTokens(vendor.vendorType, vendor.companyName, vendor.contactName, vendor.phone, vendor.email, vendor.emergencyPhone, vendor.notes).includes(normalizedQuery))
      : vendors;
    return { vendors: filtered };
  });

  app.post("/property-wiki/vendors", async (request, reply) => {
    requireWikiEdit(request);
    const input = vendorSchema.parse(request.body);
    await assertPropertyAccess(request, input.propertyId);
    const vendor = await prisma.propertyWikiVendor.create({
      data: {
        ...input,
        createdById: request.currentUser!.id,
        updatedById: request.currentUser!.id,
      },
      include: { property: true, assets: true },
    });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, propertyId: input.propertyId, entityType: "PROPERTY_WIKI_VENDOR", entityId: vendor.id, action: "PROPERTY_WIKI_VENDOR_CREATED", message: `Created property wiki vendor ${vendor.companyName}` });
    await queueWebhookEvent({
      eventType: "wiki.vendor.created",
      propertyId: vendor.propertyId,
      actorUserId: request.currentUser!.id,
      data: {
        vendorId: vendor.id,
        vendorType: vendor.vendorType,
        companyName: vendor.companyName,
        contactName: vendor.contactName,
        isActive: vendor.isActive,
      },
    });
    reply.code(201);
    return { vendor };
  });

  app.patch("/property-wiki/vendors/:id", async (request) => {
    requireWikiEdit(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = vendorSchema.partial().parse(request.body);
    const existing = await prisma.propertyWikiVendor.findUnique({ where: { id }, include: { property: true, assets: true } });
    if (!existing) throw Object.assign(new Error("Property wiki vendor not found"), { statusCode: 404 });
    await assertPropertyAccess(request, existing.propertyId);
    const vendor = await prisma.propertyWikiVendor.update({
      where: { id },
      data: {
        ...input,
        updatedById: request.currentUser!.id,
      },
      include: { property: true, assets: true },
    });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, propertyId: existing.propertyId, entityType: "PROPERTY_WIKI_VENDOR", entityId: existing.id, action: "PROPERTY_WIKI_VENDOR_UPDATED", message: `Updated property wiki vendor ${vendor.companyName}` });
    await queueWebhookEvent({
      eventType: "wiki.vendor.updated",
      propertyId: vendor.propertyId,
      actorUserId: request.currentUser!.id,
      data: {
        vendorId: vendor.id,
        vendorType: vendor.vendorType,
        companyName: vendor.companyName,
        contactName: vendor.contactName,
        isActive: vendor.isActive,
      },
    });
    return { vendor };
  });

  app.get("/property-wiki/assets", async (request) => {
    requireWikiView(request);
    const query = z.object({
      propertyId: z.string().optional(),
      kind: z.enum(wikiAssetKinds).optional(),
      entryId: z.string().optional(),
      vendorId: z.string().optional(),
      q: z.string().optional(),
    }).parse(request.query);
    if (query.propertyId) await assertPropertyAccess(request, query.propertyId);
    const normalizedQuery = query.q?.toLowerCase();
    const assets = await prisma.propertyWikiAsset.findMany({
      where: {
        propertyId: query.propertyId ?? propertyScopeWhere(request),
        kind: query.kind,
        entryId: query.entryId,
        vendorId: query.vendorId,
      },
      include: {
        property: true,
        entry: true,
        vendor: true,
      },
      orderBy: { createdAt: "desc" },
    });
    const filtered = normalizedQuery
      ? assets.filter((asset) => searchTokens(asset.title, asset.category, asset.building, asset.description, asset.tags, asset.originalName, asset.entry?.title, asset.vendor?.companyName).includes(normalizedQuery))
      : assets;
    return { assets: filtered };
  });

  app.post("/property-wiki/assets/upload", async (request, reply) => {
    requireWikiEdit(request);
    const file = await request.file();
    if (!file) return reply.code(400).send({ message: "Select a file to upload" });
    const fields = assetMetadataSchema.parse({
      propertyId: multipartFieldValue(file.fields as Record<string, unknown>, "propertyId"),
      kind: multipartFieldValue(file.fields as Record<string, unknown>, "kind"),
      title: multipartFieldValue(file.fields as Record<string, unknown>, "title"),
      category: multipartFieldValue(file.fields as Record<string, unknown>, "category") || null,
      building: multipartFieldValue(file.fields as Record<string, unknown>, "building") || null,
      description: multipartFieldValue(file.fields as Record<string, unknown>, "description") || null,
      tags: multipartFieldValue(file.fields as Record<string, unknown>, "tags") || "",
      isEmergency: multipartFieldValue(file.fields as Record<string, unknown>, "isEmergency") === "true",
      entryId: multipartFieldValue(file.fields as Record<string, unknown>, "entryId") || null,
      vendorId: multipartFieldValue(file.fields as Record<string, unknown>, "vendorId") || null,
    });
    if (fields.isEmergency !== undefined && fields.isEmergency && !canManageEmergency(request.currentUser!.role)) {
      return reply.code(403).send({ message: "Only managers and admins can manage emergency wiki records" });
    }
    await assertPropertyAccess(request, fields.propertyId);
    const property = await prisma.property.findUnique({ where: { id: fields.propertyId } });
    if (!property) return reply.code(404).send({ message: "Property not found" });
    if (fields.entryId) {
      const entry = await prisma.propertyWikiEntry.findFirst({ where: { id: fields.entryId, propertyId: fields.propertyId } });
      if (!entry) return reply.code(400).send({ message: "Selected wiki entry does not belong to this property" });
    }
    if (fields.vendorId) {
      const vendor = await prisma.propertyWikiVendor.findFirst({ where: { id: fields.vendorId, propertyId: fields.propertyId } });
      if (!vendor) return reply.code(400).send({ message: "Selected wiki vendor does not belong to this property" });
    }
    const safeName = sanitizeFilename(file.filename);
    const extension = extname(safeName).toLowerCase().slice(0, 12);
    if (!allowedAssetExtensions.has(extension) || !allowedAssetTypes.has(file.mimetype)) {
      file.file.resume();
      return reply.code(415).send({ message: "Unsupported wiki file type. Upload images, PDFs, office docs, or plain text files." });
    }
    const storedName = routedStoredName(property, `property-wiki/${randomUUID()}${extension}`);
    await ensureStoredUploadParent(storedName);
    const path = resolveStoredUploadPath(storedName);
    await pipeline(file.file, createWriteStream(path));
    if (file.file.truncated) {
      await unlink(path).catch(() => undefined);
      return reply.code(413).send({ message: "Wiki upload was truncated by an upload limit. Reduce file size or increase the proxy/upload limit." });
    }
    const asset = await prisma.propertyWikiAsset.create({
      data: {
        propertyId: fields.propertyId,
        entryId: fields.entryId,
        vendorId: fields.vendorId,
        kind: fields.kind,
        title: fields.title,
        category: fields.category,
        building: fields.building,
        description: fields.description,
        isEmergency: fields.isEmergency ?? false,
        tags: normalizeTags(fields.tags),
        storedName,
        originalName: safeName,
        mimeType: file.mimetype || "application/octet-stream",
        sizeBytes: file.file.bytesRead,
        createdById: request.currentUser!.id,
      },
      include: { property: true, entry: true, vendor: true },
    });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, propertyId: fields.propertyId, entityType: "PROPERTY_WIKI_ASSET", entityId: asset.id, action: "PROPERTY_WIKI_ASSET_CREATED", message: `Uploaded wiki ${fields.kind.toLowerCase()} ${asset.title}` });
    await queueWebhookEvent({
      eventType: "wiki.asset.created",
      propertyId: asset.propertyId,
      actorUserId: request.currentUser!.id,
      data: {
        assetId: asset.id,
        kind: asset.kind,
        title: asset.title,
        category: asset.category,
        building: asset.building,
        entryId: asset.entryId,
        vendorId: asset.vendorId,
        isEmergency: asset.isEmergency,
        originalName: asset.originalName,
      },
    });
    reply.code(201);
    return { asset };
  });

  app.patch("/property-wiki/assets/:id", async (request) => {
    requireWikiEdit(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = assetMetadataSchema.omit({ propertyId: true, kind: true }).partial().parse(request.body);
    const existing = await prisma.propertyWikiAsset.findUnique({ where: { id }, include: { property: true, entry: true, vendor: true } });
    if (!existing) throw Object.assign(new Error("Property wiki asset not found"), { statusCode: 404 });
    await assertPropertyAccess(request, existing.propertyId);
    if (input.isEmergency !== undefined && !canManageEmergency(request.currentUser!.role)) {
      throw Object.assign(new Error("Only managers and admins can manage emergency wiki records"), { statusCode: 403 });
    }
    const asset = await prisma.propertyWikiAsset.update({
      where: { id },
      data: {
        title: input.title,
        category: input.category,
        building: input.building,
        description: input.description,
        ...(input.isEmergency !== undefined ? { isEmergency: input.isEmergency } : {}),
        ...(input.tags !== undefined ? { tags: normalizeTags(input.tags) } : {}),
      },
      include: { property: true, entry: true, vendor: true },
    });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, propertyId: existing.propertyId, entityType: "PROPERTY_WIKI_ASSET", entityId: existing.id, action: "PROPERTY_WIKI_ASSET_UPDATED", message: `Updated wiki asset ${asset.title}` });
    await queueWebhookEvent({
      eventType: "wiki.asset.updated",
      propertyId: asset.propertyId,
      actorUserId: request.currentUser!.id,
      data: {
        assetId: asset.id,
        kind: asset.kind,
        title: asset.title,
        category: asset.category,
        building: asset.building,
        entryId: asset.entryId,
        vendorId: asset.vendorId,
        isEmergency: asset.isEmergency,
        originalName: asset.originalName,
      },
    });
    return { asset };
  });

  app.get("/property-wiki/assets/:id/download", async (request, reply) => {
    requireWikiView(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const asset = await prisma.propertyWikiAsset.findUnique({ where: { id } });
    if (!asset) throw Object.assign(new Error("Property wiki asset not found"), { statusCode: 404 });
    await assertPropertyAccess(request, asset.propertyId);
    reply.header("Content-Type", asset.mimeType);
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Content-Disposition", `inline; filename="${sanitizeFilename(asset.originalName)}"`);
    return reply.send(createReadStream(resolveStoredUploadPath(asset.storedName)));
  });

  app.delete("/property-wiki/assets/:id", async (request) => {
    requireWikiEdit(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const asset = await prisma.propertyWikiAsset.findUnique({ where: { id } });
    if (!asset) throw Object.assign(new Error("Property wiki asset not found"), { statusCode: 404 });
    await assertPropertyAccess(request, asset.propertyId);
    await prisma.propertyWikiAsset.delete({ where: { id } });
    await removeStoredUpload(asset.storedName);
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, propertyId: asset.propertyId, entityType: "PROPERTY_WIKI_ASSET", entityId: asset.id, action: "PROPERTY_WIKI_ASSET_DELETED", message: `Deleted wiki asset ${asset.title}` });
    await queueWebhookEvent({
      eventType: "wiki.asset.deleted",
      propertyId: asset.propertyId,
      actorUserId: request.currentUser!.id,
      data: {
        assetId: asset.id,
        kind: asset.kind,
        title: asset.title,
        category: asset.category,
        building: asset.building,
        entryId: asset.entryId,
        vendorId: asset.vendorId,
        isEmergency: asset.isEmergency,
        originalName: asset.originalName,
      },
    });
    return { ok: true };
  });

  app.post("/property-wiki/favorites/toggle", async (request) => {
    requireWikiView(request);
    const input = favoriteSchema.parse(request.body);
    const resolved = await resolveWikiTarget(input.targetType, input.targetId);
    if (!resolved) throw Object.assign(new Error("Property wiki record not found"), { statusCode: 404 });
    await assertPropertyAccess(request, resolved.propertyId);
    if (resolved.targetType === "ENTRY" && !isFavoritableEntrySection(resolved.entry.section)) {
      throw Object.assign(new Error("This wiki record type cannot be favorited"), { statusCode: 400 });
    }
    const existing = await prisma.propertyWikiFavorite.findUnique({
      where: {
        userId_targetType_targetId: {
          userId: request.currentUser!.id,
          targetType: input.targetType,
          targetId: input.targetId,
        },
      },
    });
    if (existing) {
      await prisma.propertyWikiFavorite.delete({ where: { id: existing.id } });
      return { favorited: false };
    }
    await prisma.propertyWikiFavorite.create({
      data: {
        userId: request.currentUser!.id,
        propertyId: resolved.propertyId,
        targetType: input.targetType,
        targetId: input.targetId,
      },
    });
    return { favorited: true };
  });

  app.get("/property-wiki/context", async (request) => {
    requireWikiView(request);
    const input = wikiContextQuerySchema.parse(request.query);
    return buildWikiWorkflowContext(request, input);
  });

  app.post("/property-wiki/references", async (request, reply) => {
    requireWikiEdit(request);
    const input = wikiReferenceSchema.parse(request.body);
    const [record, target] = await Promise.all([
      resolveWikiReferenceRecord(input.recordType, input.recordId),
      resolveWikiTarget(input.targetType, input.targetId),
    ]);
    if (!record) throw Object.assign(new Error("Workflow record not found"), { statusCode: 404 });
    if (!target) throw Object.assign(new Error("Property wiki record not found"), { statusCode: 404 });
    if (!record.propertyId || record.propertyId !== target.propertyId) {
      throw Object.assign(new Error("Wiki references must stay within the same property"), { statusCode: 400 });
    }
    await assertPropertyAccess(request, record.propertyId);
    const reference = await prisma.propertyWikiReference.upsert({
      where: {
        recordType_recordId_targetType_targetId: {
          recordType: input.recordType,
          recordId: input.recordId,
          targetType: input.targetType,
          targetId: input.targetId,
        },
      },
      create: {
        propertyId: record.propertyId,
        recordType: input.recordType,
        recordId: input.recordId,
        targetType: input.targetType,
        targetId: input.targetId,
        createdById: request.currentUser?.id ?? null,
      },
      update: {},
    });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: record.propertyId,
      entityType: "PROPERTY_WIKI_REFERENCE",
      entityId: reference.id,
      action: "PROPERTY_WIKI_REFERENCE_CREATED",
      message: `Attached wiki ${input.targetType.toLowerCase()} to ${input.recordType.toLowerCase().replace(/_/g, " ")}`,
    });
    reply.code(201);
    return { reference };
  });

  app.delete("/property-wiki/references/:id", async (request) => {
    requireWikiEdit(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const reference = await prisma.propertyWikiReference.findUnique({ where: { id } });
    if (!reference) throw Object.assign(new Error("Property wiki reference not found"), { statusCode: 404 });
    await assertPropertyAccess(request, reference.propertyId);
    await prisma.propertyWikiReference.delete({ where: { id } });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: reference.propertyId,
      entityType: "PROPERTY_WIKI_REFERENCE",
      entityId: reference.id,
      action: "PROPERTY_WIKI_REFERENCE_DELETED",
      message: `Removed wiki ${reference.targetType.toLowerCase()} from ${reference.recordType.toLowerCase().replace(/_/g, " ")}`,
    });
    return { ok: true };
  });

  app.get("/property-wiki/records/:targetType/:id", async (request) => {
    requireWikiView(request);
    const { targetType, id } = z.object({ targetType: z.enum(wikiTargetTypes), id: z.string() }).parse(request.params);
    const resolved = await resolveWikiTarget(targetType, id);
    if (!resolved) throw Object.assign(new Error("Property wiki record not found"), { statusCode: 404 });
    await assertPropertyAccess(request, resolved.propertyId);

    if (request.currentUser) {
      await prisma.propertyWikiRecentView.upsert({
        where: {
          userId_targetType_targetId: {
            userId: request.currentUser.id,
            targetType,
            targetId: id,
          },
        },
        create: {
          userId: request.currentUser.id,
          propertyId: resolved.propertyId,
          targetType,
          targetId: id,
        },
        update: {
          propertyId: resolved.propertyId,
          viewedAt: new Date(),
        },
      });
      const staleViews = await prisma.propertyWikiRecentView.findMany({
        where: { userId: request.currentUser.id },
        orderBy: { viewedAt: "desc" },
        skip: 20,
      });
      if (staleViews.length) {
        await prisma.propertyWikiRecentView.deleteMany({
          where: { id: { in: staleViews.map((view) => view.id) } },
        });
      }
    }

    const favoriteKeySet = request.currentUser ? await favoriteSetForUser(request.currentUser.id, resolved.propertyId) : new Set<string>();
    const record = summarizeWikiTarget(resolved, favoriteKeySet);

    const [entries, vendors, assets] = await Promise.all([
      prisma.propertyWikiEntry.findMany({
        where: { propertyId: resolved.propertyId, isActive: true },
        include: { property: true, assets: { orderBy: { createdAt: "desc" } } },
        orderBy: { updatedAt: "desc" },
        take: 80,
      }),
      prisma.propertyWikiVendor.findMany({
        where: { propertyId: resolved.propertyId, isActive: true },
        include: { property: true, assets: { orderBy: { createdAt: "desc" } } },
        orderBy: { updatedAt: "desc" },
        take: 40,
      }),
      prisma.propertyWikiAsset.findMany({
        where: { propertyId: resolved.propertyId },
        include: { property: true, entry: true, vendor: true },
        orderBy: { createdAt: "desc" },
        take: 60,
      }),
    ]);

    const sourceCategory =
      resolved.targetType === "ENTRY" ? resolved.entry.category
        : resolved.targetType === "VENDOR" ? resolved.vendor.vendorType
          : resolved.asset.category;
    const sourceBuilding =
      resolved.targetType === "ENTRY" ? resolved.entry.building
        : resolved.targetType === "ASSET" ? resolved.asset.building
          : null;
    const relatedSource = {
      tags: resolved.targetType === "ENTRY" ? resolved.entry.tags : resolved.targetType === "ASSET" ? resolved.asset.tags : [],
      category: sourceCategory,
      building: sourceBuilding,
      leadTokens:
        resolved.targetType === "ENTRY" ? uniqueTokens(resolved.entry.title, resolved.entry.category, resolved.entry.tags, resolved.entry.building, resolved.entry.equipmentModel, resolved.entry.manufacturer)
          : resolved.targetType === "VENDOR" ? uniqueTokens(resolved.vendor.companyName, resolved.vendor.vendorType, resolved.vendor.notes)
            : uniqueTokens(resolved.asset.title, resolved.asset.category, resolved.asset.tags, resolved.asset.building, resolved.asset.entry?.title, resolved.asset.vendor?.companyName),
      relatedEntryIds: resolved.targetType === "ENTRY" ? resolved.entry.relatedEntryIds : [],
      relatedVendorIds: resolved.targetType === "ENTRY" ? resolved.entry.relatedVendorIds : [],
      sourceEntryId: resolved.targetType === "ENTRY" ? resolved.entry.id : resolved.targetType === "ASSET" ? resolved.asset.entryId : null,
      sourceVendorId: resolved.targetType === "VENDOR" ? resolved.vendor.id : resolved.targetType === "ASSET" ? resolved.asset.vendorId : null,
    };

    const entryMatches = entries
      .filter((entry) => !(resolved.targetType === "ENTRY" && entry.id === resolved.entry.id))
      .map((entry) => ({ entry, score: scoreRelatedEntry(relatedSource, entry) }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || right.entry.updatedAt.getTime() - left.entry.updatedAt.getTime())
      .map((item) => item.entry)
      .slice(0, 18);
    const assetMatches = assets
      .filter((asset) => !(resolved.targetType === "ASSET" && asset.id === resolved.asset.id))
      .map((asset) => ({ asset, score: scoreRelatedAsset(relatedSource, asset) }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || right.asset.createdAt.getTime() - left.asset.createdAt.getTime())
      .map((item) => item.asset)
      .slice(0, 18);
    const linkedVendorIds = Array.from(new Set(assetMatches.flatMap((asset) => asset.vendorId ? [asset.vendorId] : [])));
    const vendorMatches = vendors
      .filter((vendor) => !(resolved.targetType === "VENDOR" && vendor.id === resolved.vendor.id))
      .map((vendor) => ({
        vendor,
        score: scoreRelatedVendor({
          category: sourceCategory,
          leadTokens: relatedSource.leadTokens,
          relatedVendorIds: relatedSource.relatedVendorIds,
          linkedVendorIds,
          sourceVendorId: relatedSource.sourceVendorId,
        }, vendor),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || right.vendor.updatedAt.getTime() - left.vendor.updatedAt.getTime())
      .map((item) => item.vendor)
      .slice(0, 12);

    const entryAssetIds = resolved.targetType === "ENTRY" ? resolved.entry.assets.map((asset) => asset.id) : [];
    const vendorAssetIds = resolved.targetType === "VENDOR" ? resolved.vendor.assets.map((asset) => asset.id) : [];
    const history = await prisma.auditLog.findMany({
      where: {
        propertyId: resolved.propertyId,
        OR: [
          { entityType: resolved.targetType === "ENTRY" ? "PROPERTY_WIKI_ENTRY" : resolved.targetType === "VENDOR" ? "PROPERTY_WIKI_VENDOR" : "PROPERTY_WIKI_ASSET", entityId: id },
          ...(entryAssetIds.length ? [{ entityType: "PROPERTY_WIKI_ASSET", entityId: { in: entryAssetIds } }] : []),
          ...(vendorAssetIds.length ? [{ entityType: "PROPERTY_WIKI_ASSET", entityId: { in: vendorAssetIds } }] : []),
        ],
      },
      include: { actorUser: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return {
      record,
      entry: resolved.targetType === "ENTRY" ? resolved.entry : null,
      vendor: resolved.targetType === "VENDOR" ? resolved.vendor : null,
      asset: resolved.targetType === "ASSET" ? resolved.asset : null,
      related: {
        sops: entryMatches.filter((entry) => entry.section === "SOP_LIBRARY").map((entry) => summarizeWikiTarget({ targetType: "ENTRY", propertyId: entry.propertyId, entry }, favoriteKeySet)).filter(Boolean),
        equipment: entryMatches.filter((entry) => entry.section === "EQUIPMENT_REGISTRY").map((entry) => summarizeWikiTarget({ targetType: "ENTRY", propertyId: entry.propertyId, entry }, favoriteKeySet)).filter(Boolean),
        knownIssues: entryMatches.filter((entry) => entry.section === "KNOWN_ISSUES").map((entry) => summarizeWikiTarget({ targetType: "ENTRY", propertyId: entry.propertyId, entry }, favoriteKeySet)).filter(Boolean),
        vendors: vendorMatches.map((vendor) => summarizeWikiTarget({ targetType: "VENDOR", propertyId: vendor.propertyId, vendor }, favoriteKeySet)).filter(Boolean),
        photos: assetMatches.filter((asset) => asset.kind === "PHOTO").map((asset) => summarizeWikiTarget({ targetType: "ASSET", propertyId: asset.propertyId, asset }, favoriteKeySet)).filter(Boolean),
        documents: assetMatches.filter((asset) => asset.kind === "DOCUMENT").map((asset) => summarizeWikiTarget({ targetType: "ASSET", propertyId: asset.propertyId, asset }, favoriteKeySet)).filter(Boolean),
      },
      history: history.map((item) => ({
        id: item.id,
        user: item.actorUser?.fullName ?? "Unknown user",
        date: item.createdAt,
        action: item.message,
      })),
    };
  });

  app.get("/property-wiki/search", async (request) => {
    requireWikiView(request);
    const query = z.object({
      propertyId: z.string().optional(),
      q: z.string().trim().min(1),
    }).parse(request.query);
    if (query.propertyId) await assertPropertyAccess(request, query.propertyId);
    const scopedProperty = query.propertyId ?? propertyScopeWhere(request);
    const favoriteKeySet = request.currentUser ? await favoriteSetForUser(request.currentUser.id, query.propertyId) : new Set<string>();
    const [entries, vendors, assets, profiles] = await Promise.all([
      prisma.propertyWikiEntry.findMany({
        where: { propertyId: scopedProperty },
        include: { property: true },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.propertyWikiVendor.findMany({
        where: { propertyId: scopedProperty, isActive: true },
        include: { property: true },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.propertyWikiAsset.findMany({
        where: { propertyId: scopedProperty },
        include: { property: true, entry: true, vendor: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.propertyWikiProfile.findMany({
        where: { propertyId: scopedProperty },
        include: { property: true },
      }),
    ]);
    const q = query.q.toLowerCase();
    const results = [
      ...entries
        .filter((entry) => (entry.isActive || entry.section === "PROPERTY_CONTACTS" || entry.section === "KNOWN_ISSUES") && searchTokens(
          entry.title,
          entry.category,
          entry.building,
          entry.notes,
          entry.content,
          entry.issueStatus,
          entry.tags,
          entry.equipmentModel,
          entry.manufacturer,
          entry.serialNumber,
          entry.locationDescription,
          entry.situation,
          entry.floorPlan,
          entry.unitType,
          entry.filterSizes,
          entry.blindSizes,
          entry.contactType,
          entry.contactTitle,
          entry.phone,
          entry.email,
          entry.hvacNotes,
          entry.waterHeaterNotes,
          entry.applianceNotes,
          entry.paintStandards,
          entry.countertopNotes,
          entry.cabinetNotes,
          entry.flooringNotes,
        ).includes(q))
        .map((entry) => ({
          id: entry.id,
          propertyId: entry.propertyId,
          property: entry.property,
          section: entry.section,
          title: entry.title,
          snippet: snippet(searchTokens(
            entry.building,
            entry.notes,
            entry.content,
            entry.locationDescription,
            entry.equipmentModel,
            entry.manufacturer,
            entry.serialNumber,
            entry.floorPlan,
            entry.unitType,
            entry.filterSizes,
            entry.blindSizes,
            entry.phone,
            entry.email,
            entry.tags,
          ), query.q),
          tags: entry.tags,
          building: entry.building,
          targetType: "ENTRY",
          isFavorite: favoriteKeySet.has(`ENTRY:${entry.id}`),
          isEmergency: entry.isEmergency,
          updatedAt: entry.updatedAt,
        })),
      ...vendors
        .filter((vendor) => searchTokens(vendor.vendorType, vendor.companyName, vendor.contactName, vendor.notes, vendor.phone, vendor.email, vendor.emergencyPhone).includes(q))
        .map((vendor) => ({
          id: vendor.id,
          propertyId: vendor.propertyId,
          property: vendor.property,
          section: "VENDORS",
          title: vendor.companyName,
          snippet: snippet(searchTokens(vendor.vendorType, vendor.contactName, vendor.phone, vendor.email, vendor.notes), query.q),
          tags: [],
          building: null,
          targetType: "VENDOR",
          isFavorite: favoriteKeySet.has(`VENDOR:${vendor.id}`),
          isEmergency: false,
          updatedAt: vendor.updatedAt,
        })),
      ...assets
        .filter((asset) => searchTokens(asset.title, asset.category, asset.building, asset.description, asset.tags, asset.entry?.title, asset.vendor?.companyName, asset.originalName).includes(q))
        .map((asset) => ({
          id: asset.id,
          propertyId: asset.propertyId,
          property: asset.property,
          section: asset.kind === "DOCUMENT" ? "DOCUMENTS" : "PHOTOS",
          title: asset.title,
          snippet: snippet(searchTokens(asset.category, asset.building, asset.description, asset.tags, asset.entry?.title, asset.vendor?.companyName), query.q),
          tags: asset.tags,
          building: asset.building,
          targetType: "ASSET",
          isFavorite: favoriteKeySet.has(`ASSET:${asset.id}`),
          isEmergency: asset.isEmergency,
          updatedAt: asset.createdAt,
        })),
      ...profiles
        .filter((profile) => searchTokens(profile.address, profile.officePhone, profile.afterHoursPhone, profile.propertyManager, profile.maintenanceSupervisor, profile.regionalManager, profile.generalNotes).includes(q))
        .map((profile) => ({
          id: profile.id,
          propertyId: profile.propertyId,
          property: profile.property,
          section: "OVERVIEW",
          title: `${profile.property.name} Overview`,
          snippet: snippet(searchTokens(profile.address, profile.generalNotes, profile.propertyManager, profile.maintenanceSupervisor, profile.regionalManager), query.q),
          tags: [],
          building: null,
          targetType: "ENTRY",
          isFavorite: false,
          isEmergency: false,
          updatedAt: profile.updatedAt,
        })),
    ]
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
      .slice(0, 100);
    return { results };
  });
}
