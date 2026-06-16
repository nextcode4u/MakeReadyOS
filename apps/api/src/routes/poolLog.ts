import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { basename, extname } from "node:path";
import { pipeline } from "node:stream/promises";
import { UserRole } from "@prisma/client";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { writeAuditLog } from "../lib/audit.js";
import { notifyPropertyRoles } from "../lib/notifications.js";
import { renderPdfFromHtml } from "../lib/pdf.js";
import { queueWebhookEvent } from "../lib/webhookQueue.js";
import { ensureStoredUploadParent, removeStoredUpload, resolveStoredUploadPath, routedStoredName } from "../lib/uploadStorage.js";

const poolTypes = ["POOL", "SPA", "WADING_POOL", "SPLASH_PAD", "OTHER"] as const;
const chemicalCategories = ["CHLORINE", "PH_UP", "PH_DOWN", "ALKALINITY_UP", "STABILIZER", "CALCIUM_HARDNESS", "OTHER"] as const;
const chemicalUnits = ["POUNDS", "OUNCES", "GALLONS", "QUARTS", "TABLETS"] as const;
const safetyValues = ["PASS", "FAIL", "NA"] as const;
const allowedAttachmentExtensions = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".heic", ".heif", ".bmp", ".tif", ".tiff", ".pdf"]);
const allowedAttachmentTypes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif", "image/heic", "image/heif", "image/bmp", "image/tiff", "application/pdf"]);

const defaultSafetyItems = [
  "Gate/self-closing latch checked",
  "Rescue equipment present",
  "Deck clear of hazards",
  "Drain covers visible/intact",
  "Pool/spa signage visible",
  "Pump/filter area checked",
];

const defaultTargets = {
  POOL: {
    phMin: 7.2,
    phMax: 7.8,
    freeChlorineMin: 1,
    freeChlorineMax: 4,
    combinedChlorineMax: 0.2,
    totalAlkalinityMin: 80,
    totalAlkalinityMax: 120,
    cyaMin: 30,
    cyaMax: 50,
    calciumHardnessMin: 200,
    calciumHardnessMax: 400,
  },
  SPA: {
    phMin: 7.2,
    phMax: 7.8,
    freeChlorineMin: 3,
    freeChlorineMax: 5,
    combinedChlorineMax: 0.2,
    totalAlkalinityMin: 80,
    totalAlkalinityMax: 120,
    cyaMin: 30,
    cyaMax: 50,
    calciumHardnessMin: 150,
    calciumHardnessMax: 250,
  },
};

type PoolTargets = typeof defaultTargets.POOL;

function roleAccess(role: string) {
  if (role === "ADMIN") return { view: true, edit: true, manage: true };
  if (role === "MANAGER") return { view: true, edit: true, manage: true };
  if (role === "TECH") return { view: true, edit: true, manage: false };
  if (role === "CLEANER") return { view: true, edit: false, manage: false };
  return { view: true, edit: false, manage: false };
}

async function allowedPropertyIds(request: FastifyRequest) {
  if (!request.currentUser) return [];
  if (request.currentUser.role === "ADMIN") {
    const properties = await prisma.property.findMany({ select: { id: true } });
    return properties.map((property) => property.id);
  }
  if (request.apiToken?.propertyIds?.length) {
    return request.apiToken.propertyIds;
  }
  return request.currentUser.propertyAccess.map((access) => access.propertyId);
}

async function assertPropertyAccess(request: FastifyRequest, propertyId: string) {
  const allowed = await allowedPropertyIds(request);
  if (!allowed.includes(propertyId)) {
    throw Object.assign(new Error("Property access denied"), { statusCode: 403 });
  }
}

function dateOnly(value = new Date()) {
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
  return basename(filename).replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 180) || "pool-attachment";
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

function isSolidChemicalUnit(unit: string) {
  return unit === "POUNDS" || unit === "OUNCES";
}

function formatChemicalAdditionAmount(amount: number, unit: string) {
  if (!Number.isFinite(amount)) {
    return `0 ${unit.toLowerCase()}`;
  }
  if (isSolidChemicalUnit(unit)) {
    const totalOunces = Math.round(amount * 100) / 100;
    const wholePounds = Math.floor(totalOunces / 16);
    const remainingOunces = Math.round((totalOunces - wholePounds * 16) * 100) / 100;
    const ouncesText = remainingOunces % 1 === 0
      ? remainingOunces.toFixed(0)
      : remainingOunces.toFixed(2).replace(/\.?0+$/, "");
    if (wholePounds > 0 && remainingOunces > 0) {
      return `${wholePounds} lb ${ouncesText} oz`;
    }
    if (wholePounds > 0) {
      return `${wholePounds} lb`;
    }
    return `${ouncesText} oz`;
  }
  const amountText = amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2).replace(/\.?0+$/, "");
  return `${amountText} ${unit.toLowerCase()}`;
}

function normalizeChemicalAdditionStorage(addition: { amount: number; unit: string }) {
  if (addition.unit === "POUNDS") {
    return { amount: Math.round(addition.amount * 16 * 100) / 100, unit: "OUNCES" };
  }
  return { amount: addition.amount, unit: addition.unit };
}

function targetFor(type: string, override?: Partial<PoolTargets> | null): PoolTargets {
  const base = type === "SPA" ? defaultTargets.SPA : defaultTargets.POOL;
  return { ...base, ...(override ?? {}) };
}

function evaluateChemistry(entry: {
  ph?: number | null;
  freeChlorine?: number | null;
  combinedChlorine?: number | null;
  totalAlkalinity?: number | null;
  cyanuricAcid?: number | null;
  calciumHardness?: number | null;
  waterCloudy?: boolean;
  algaePresent?: boolean;
}, targets: PoolTargets, facility: { capacityGallons?: number | null }, chemicals: Array<{ name: string; category: string; concentrationPercent?: number | null; unit: string; isActive?: boolean }>) {
  const issues: Array<{ code: string; severity: "LOW" | "MEDIUM" | "HIGH"; message: string }> = [];
  const recommendations: string[] = [];
  const dosage: Array<{ chemicalCategory: string; chemicalName?: string; amount?: number; unit?: string; message: string; missing?: string[] }> = [];

  const checkRange = (label: string, code: string, value: number | null | undefined, min: number, max: number, lowMessage: string, highMessage: string) => {
    if (value === null || value === undefined || Number.isNaN(value)) return;
    if (value < min) {
      issues.push({ code: `${code}_LOW`, severity: "MEDIUM", message: `${label} is low (${value}; target ${min}-${max}).` });
      recommendations.push(lowMessage);
    } else if (value > max) {
      issues.push({ code: `${code}_HIGH`, severity: "MEDIUM", message: `${label} is high (${value}; target ${min}-${max}).` });
      recommendations.push(highMessage);
    }
  };

  checkRange("Free chlorine", "FREE_CHLORINE", entry.freeChlorine, targets.freeChlorineMin, targets.freeChlorineMax, "Raise sanitizer before opening/continuing use.", "Let chlorine drift down or dilute per local procedure.");
  checkRange("pH", "PH", entry.ph, targets.phMin, targets.phMax, "Add pH increaser if local procedure allows.", "Add pH reducer if local procedure allows.");
  checkRange("Total alkalinity", "TOTAL_ALKALINITY", entry.totalAlkalinity, targets.totalAlkalinityMin, targets.totalAlkalinityMax, "Raise alkalinity before balancing pH.", "Lower alkalinity per local procedure.");
  checkRange("CYA/stabilizer", "CYA", entry.cyanuricAcid, targets.cyaMin, targets.cyaMax, "Add stabilizer if outdoor pool procedure requires it.", "CYA is high; review dilution or water replacement.");
  checkRange("Calcium hardness", "CALCIUM_HARDNESS", entry.calciumHardness, targets.calciumHardnessMin, targets.calciumHardnessMax, "Raise calcium hardness if surface protection requires it.", "Calcium hardness is high; monitor scaling risk.");

  if (entry.combinedChlorine !== null && entry.combinedChlorine !== undefined && entry.combinedChlorine > targets.combinedChlorineMax) {
    issues.push({ code: "COMBINED_CHLORINE_HIGH", severity: "HIGH", message: `Combined chlorine is high (${entry.combinedChlorine}; max ${targets.combinedChlorineMax}).` });
    recommendations.push("Review breakpoint chlorination/shock procedure and bather-load causes.");
  }
  if (entry.waterCloudy) {
    issues.push({ code: "WATER_CLOUDY", severity: "MEDIUM", message: "Water was marked cloudy." });
    recommendations.push("Check filtration, sanitizer, and circulation before opening.");
  }
  if (entry.algaePresent) {
    issues.push({ code: "ALGAE_PRESENT", severity: "HIGH", message: "Algae was marked present." });
    recommendations.push("Treat algae and document follow-up before opening.");
  }

  if (entry.freeChlorine !== null && entry.freeChlorine !== undefined && entry.freeChlorine < targets.freeChlorineMin) {
    const target = Math.max(targets.freeChlorineMin, Math.min(targets.freeChlorineMax, targets.freeChlorineMin + 1));
    const delta = Math.max(0, target - entry.freeChlorine);
    const chlorine = chemicals.find((chemical) => chemical.category === "CHLORINE" && chemical.isActive !== false);
    const missing = [];
    if (!facility.capacityGallons) missing.push("pool/spa capacity");
    if (!chlorine) missing.push("chlorine chemical");
    if (chlorine && !chlorine.concentrationPercent) missing.push("chemical concentration");
    if (missing.length) {
      dosage.push({ chemicalCategory: "CHLORINE", chemicalName: chlorine?.name, message: `Free chlorine needs correction, but dosage needs ${missing.join(", ")}.`, missing });
    } else if (chlorine) {
      const poundsAvailableChlorine = (facility.capacityGallons! * delta * 8.34) / 1_000_000;
      const amount = poundsAvailableChlorine / ((chlorine.concentrationPercent ?? 100) / 100);
      dosage.push({ chemicalCategory: "CHLORINE", chemicalName: chlorine.name, amount: Number(amount.toFixed(2)), unit: "POUNDS", message: `Approx. ${amount.toFixed(2)} lb of ${chlorine.name} to raise FC by ${delta.toFixed(1)} ppm.` });
    }
  }

  return {
    status: issues.length ? "REVIEW" : "OK",
    issueCount: issues.length,
    issues,
    recommendations: [...new Set(recommendations)],
    dosage,
  };
}

async function notifyPoolReviewIfNeeded(input: {
  propertyId: string;
  facilityName: string;
  entryId: string;
  evaluation: ReturnType<typeof evaluateChemistry>;
  safetyFailures: number;
}) {
  if (!input.evaluation.issues.length && input.safetyFailures === 0) return;
  const issueText = [
    input.safetyFailures ? `${input.safetyFailures} failed safety check(s)` : null,
    ...input.evaluation.issues.slice(0, 3).map((issue) => issue.message),
  ].filter(Boolean).join(" / ");
  await notifyPropertyRoles({
    propertyId: input.propertyId,
    roles: [UserRole.ADMIN, UserRole.MANAGER],
    category: "RISK",
    title: `Pool review needed: ${input.facilityName}`,
    message: issueText || "Pool/spa log needs manager review.",
    dedupeKey: `pool-review:${input.entryId}`,
  });
}

async function notifyMissingPoolLogs(input: { propertyId: string; facilities: Array<{ id: string; name: string }> }) {
  const dateKey = dateOnly().toISOString().slice(0, 10);
  await Promise.all(input.facilities.map((facility) => notifyPropertyRoles({
    propertyId: input.propertyId,
    roles: [UserRole.ADMIN, UserRole.MANAGER],
    category: "SCHEDULE",
    title: `Pool log missing: ${facility.name}`,
    message: `${facility.name} has no daily pool/spa log for ${dateKey}.`,
    dedupeKey: `pool-missing-log:${facility.id}:${dateKey}`,
  })));
}

export const poolFacilitySchema = z.object({
  propertyId: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(poolTypes).default("POOL"),
  capacityGallons: z.number().positive().nullable().optional(),
  surfaceType: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const poolChemicalSchema = z.object({
  propertyId: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(chemicalCategories),
  concentrationPercent: z.number().positive().max(100).nullable().optional(),
  unit: z.enum(chemicalUnits),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const poolLogEntrySchema = z.object({
  propertyId: z.string().min(1),
  facilityId: z.string().min(1),
  logDate: z.string().min(1),
  logTime: z.string().nullable().optional(),
  ph: z.number().nullable().optional(),
  freeChlorine: z.number().nullable().optional(),
  combinedChlorine: z.number().nullable().optional(),
  totalChlorine: z.number().nullable().optional(),
  totalAlkalinity: z.number().nullable().optional(),
  cyanuricAcid: z.number().nullable().optional(),
  calciumHardness: z.number().nullable().optional(),
  waterTemperature: z.number().nullable().optional(),
  vacuumed: z.boolean().optional(),
  backwashed: z.boolean().optional(),
  skimmerCleaned: z.boolean().optional(),
  pumpRunning: z.boolean().optional(),
  filterOperating: z.boolean().optional(),
  waterClear: z.boolean().optional(),
  waterCloudy: z.boolean().optional(),
  algaePresent: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  safetyChecks: z.array(z.object({
    label: z.string().min(1),
    value: z.enum(safetyValues),
    notes: z.string().nullable().optional(),
    sortOrder: z.number().int().optional(),
  })).optional(),
  chemicalAdditions: z.array(z.object({
    chemicalId: z.string().nullable().optional(),
    chemicalName: z.string().min(1),
    amount: z.number().positive(),
    unit: z.enum(chemicalUnits),
    notes: z.string().nullable().optional(),
  })).optional(),
});

export async function poolLogRoutes(app: FastifyInstance) {
  app.get("/pool/overview", async (request) => {
    const access = roleAccess(request.currentUser?.role ?? "VIEWER");
    if (!access.view) throw Object.assign(new Error("Pool Log access denied"), { statusCode: 403 });
    const allowed = await allowedPropertyIds(request);
    const query = z.object({ propertyId: z.string().optional() }).parse(request.query);
    const propertyIds = query.propertyId ? [query.propertyId] : allowed;
    if (query.propertyId) await assertPropertyAccess(request, query.propertyId);
    const todayStart = dateOnly();
    const todayEnd = endOfDay();

    const [facilities, chemicals, entriesToday, recentEntries] = await Promise.all([
      prisma.poolFacility.findMany({ where: { propertyId: { in: propertyIds }, isActive: true }, include: { property: true }, orderBy: [{ property: { code: "asc" } }, { name: "asc" }] }),
      prisma.poolChemical.findMany({ where: { propertyId: { in: propertyIds }, isActive: true }, include: { property: true }, orderBy: [{ property: { code: "asc" } }, { name: "asc" }] }),
      prisma.poolLogEntry.findMany({
        where: { propertyId: { in: propertyIds }, logDate: { gte: todayStart, lte: todayEnd } },
        include: { facility: true, property: true, safetyChecks: true, chemicalAdditions: true, attachments: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.poolLogEntry.findMany({
        where: { propertyId: { in: propertyIds } },
        include: { facility: true, property: true, safetyChecks: true, chemicalAdditions: true, attachments: true },
        orderBy: { logDate: "desc" },
        take: 20,
      }),
    ]);

    const loggedFacilityIds = new Set(entriesToday.map((entry) => entry.facilityId));
    const safetyFailures = entriesToday.flatMap((entry) => entry.safetyChecks.filter((check) => check.value === "FAIL").map((check) => ({ entryId: entry.id, facilityName: entry.facility.name, label: check.label, notes: check.notes })));
    const chemistryIssues = entriesToday.flatMap((entry) => {
      const evaluation = entry.evaluationJson as { issues?: unknown[] } | null;
      return (evaluation?.issues ?? []).map((issue) => ({ entryId: entry.id, facilityName: entry.facility.name, issue }));
    });
    const usageToday = entriesToday.flatMap((entry) => entry.chemicalAdditions);
    const missingFacilities = facilities.filter((facility) => !loggedFacilityIds.has(facility.id));
    const missingByProperty = new Map<string, Array<{ id: string; name: string }>>();
    missingFacilities.forEach((facility) => {
      const bucket = missingByProperty.get(facility.propertyId) ?? [];
      bucket.push({ id: facility.id, name: facility.name });
      missingByProperty.set(facility.propertyId, bucket);
    });
    await Promise.all([...missingByProperty.entries()].map(([propertyId, propertyFacilities]) => notifyMissingPoolLogs({ propertyId, facilities: propertyFacilities })));

    return {
      permissions: access,
      safetyItems: defaultSafetyItems,
      facilities,
      chemicals,
      summary: {
        activeFacilities: facilities.length,
        logsToday: entriesToday.length,
        missingLogs: missingFacilities.length,
        safetyFailures: safetyFailures.length,
        chemistryIssues: chemistryIssues.length,
        chemicalAdditions: usageToday.length,
      },
      missingFacilities,
      safetyFailures,
      chemistryIssues,
      usageToday,
      recentEntries,
    };
  });

  app.get("/pool/facilities", async (request) => {
    const access = roleAccess(request.currentUser?.role ?? "VIEWER");
    if (!access.view) throw Object.assign(new Error("Pool facility access denied"), { statusCode: 403 });
    const query = z.object({ propertyId: z.string().optional(), includeArchived: z.coerce.boolean().optional() }).parse(request.query);
    if (query.propertyId) await assertPropertyAccess(request, query.propertyId);
    const allowed = await allowedPropertyIds(request);
    const facilities = await prisma.poolFacility.findMany({
      where: {
        propertyId: query.propertyId ?? { in: allowed },
        ...(query.includeArchived ? {} : { isActive: true }),
      },
      include: { property: true },
      orderBy: [{ property: { code: "asc" } }, { name: "asc" }],
    });
    return { facilities };
  });

  app.post("/pool/facilities", async (request, reply) => {
    const access = roleAccess(request.currentUser?.role ?? "VIEWER");
    if (!access.manage) throw Object.assign(new Error("Only admins and managers can manage pool/spa setup"), { statusCode: 403 });
    const input = poolFacilitySchema.parse(request.body);
    await assertPropertyAccess(request, input.propertyId);
    const facility = await prisma.poolFacility.create({
      data: { ...input, createdById: request.currentUser?.id, updatedById: request.currentUser?.id },
      include: { property: true },
    });
    await writeAuditLog({ request, propertyId: facility.propertyId, entityType: "PoolFacility", entityId: facility.id, action: "Pool Facility Created", message: `Created pool/spa ${facility.name}` });
    reply.code(201);
    return { facility };
  });

  app.patch("/pool/facilities/:id", async (request) => {
    const access = roleAccess(request.currentUser?.role ?? "VIEWER");
    if (!access.manage) throw Object.assign(new Error("Only admins and managers can manage pool/spa setup"), { statusCode: 403 });
    const params = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.poolFacility.findUnique({ where: { id: params.id } });
    if (!existing) throw Object.assign(new Error("Pool/spa not found"), { statusCode: 404 });
    await assertPropertyAccess(request, existing.propertyId);
    const input = poolFacilitySchema.partial().parse(request.body);
    if (input.propertyId) await assertPropertyAccess(request, input.propertyId);
    const facility = await prisma.poolFacility.update({ where: { id: params.id }, data: { ...input, updatedById: request.currentUser?.id }, include: { property: true } });
    await writeAuditLog({ request, propertyId: facility.propertyId, entityType: "PoolFacility", entityId: facility.id, action: "Pool Facility Updated", message: `Updated pool/spa ${facility.name}` });
    return { facility };
  });

  app.get("/pool/chemicals", async (request) => {
    const access = roleAccess(request.currentUser?.role ?? "VIEWER");
    if (!access.view) throw Object.assign(new Error("Pool chemical access denied"), { statusCode: 403 });
    const query = z.object({ propertyId: z.string().optional(), includeArchived: z.coerce.boolean().optional() }).parse(request.query);
    if (query.propertyId) await assertPropertyAccess(request, query.propertyId);
    const allowed = await allowedPropertyIds(request);
    const chemicals = await prisma.poolChemical.findMany({
      where: {
        propertyId: query.propertyId ?? { in: allowed },
        ...(query.includeArchived ? {} : { isActive: true }),
      },
      include: { property: true },
      orderBy: [{ property: { code: "asc" } }, { category: "asc" }, { name: "asc" }],
    });
    return { chemicals };
  });

  app.post("/pool/chemicals", async (request, reply) => {
    const access = roleAccess(request.currentUser?.role ?? "VIEWER");
    if (!access.manage) throw Object.assign(new Error("Only admins and managers can manage pool chemical library"), { statusCode: 403 });
    const input = poolChemicalSchema.parse(request.body);
    await assertPropertyAccess(request, input.propertyId);
    const chemical = await prisma.poolChemical.create({ data: { ...input, createdById: request.currentUser?.id, updatedById: request.currentUser?.id }, include: { property: true } });
    await writeAuditLog({ request, propertyId: chemical.propertyId, entityType: "PoolChemical", entityId: chemical.id, action: "Pool Chemical Created", message: `Created pool chemical ${chemical.name}` });
    reply.code(201);
    return { chemical };
  });

  app.patch("/pool/chemicals/:id", async (request) => {
    const access = roleAccess(request.currentUser?.role ?? "VIEWER");
    if (!access.manage) throw Object.assign(new Error("Only admins and managers can manage pool chemical library"), { statusCode: 403 });
    const params = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.poolChemical.findUnique({ where: { id: params.id } });
    if (!existing) throw Object.assign(new Error("Pool chemical not found"), { statusCode: 404 });
    await assertPropertyAccess(request, existing.propertyId);
    const input = poolChemicalSchema.partial().parse(request.body);
    if (input.propertyId) await assertPropertyAccess(request, input.propertyId);
    const chemical = await prisma.poolChemical.update({ where: { id: params.id }, data: { ...input, updatedById: request.currentUser?.id }, include: { property: true } });
    await writeAuditLog({ request, propertyId: chemical.propertyId, entityType: "PoolChemical", entityId: chemical.id, action: "Pool Chemical Updated", message: `Updated pool chemical ${chemical.name}` });
    return { chemical };
  });

  app.get("/pool/entries", async (request) => {
    const access = roleAccess(request.currentUser?.role ?? "VIEWER");
    if (!access.view) throw Object.assign(new Error("Pool log access denied"), { statusCode: 403 });
    const query = z.object({
      propertyId: z.string().optional(),
      facilityId: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    }).parse(request.query);
    if (query.propertyId) await assertPropertyAccess(request, query.propertyId);
    const allowed = await allowedPropertyIds(request);
    const where = {
      propertyId: query.propertyId ?? { in: allowed },
      ...(query.facilityId ? { facilityId: query.facilityId } : {}),
      ...(query.from || query.to ? { logDate: { ...(query.from ? { gte: dateOnly(new Date(query.from)) } : {}), ...(query.to ? { lte: endOfDay(new Date(query.to)) } : {}) } } : {}),
    };
    const [entries, total] = await Promise.all([
      prisma.poolLogEntry.findMany({
        where,
        include: { property: true, facility: true, safetyChecks: true, chemicalAdditions: true, attachments: true },
        orderBy: [{ logDate: "desc" }, { createdAt: "desc" }],
        take: query.limit,
        skip: query.offset,
      }),
      prisma.poolLogEntry.count({ where }),
    ]);
    return { entries, pagination: { total, limit: query.limit, offset: query.offset, hasMore: query.offset + entries.length < total } };
  });

  app.post("/pool/entries", async (request, reply) => {
    const access = roleAccess(request.currentUser?.role ?? "VIEWER");
    if (!access.edit) throw Object.assign(new Error("Pool log editing access denied"), { statusCode: 403 });
    const input = poolLogEntrySchema.parse(request.body);
    await assertPropertyAccess(request, input.propertyId);
    const facility = await prisma.poolFacility.findUnique({ where: { id: input.facilityId } });
    if (!facility || facility.propertyId !== input.propertyId) throw Object.assign(new Error("Pool/spa does not belong to selected property"), { statusCode: 400 });
    const propertyChemicals = await prisma.poolChemical.findMany({ where: { propertyId: input.propertyId, isActive: true } });
    const targetOverride = await prisma.poolChemistryTarget.findUnique({ where: { propertyId_facilityType: { propertyId: input.propertyId, facilityType: facility.type } } });
    const targets = targetFor(facility.type, targetOverride);
    const evaluation = evaluateChemistry(input, targets, facility, propertyChemicals);
    const safetyChecks = input.safetyChecks?.length
      ? input.safetyChecks
      : defaultSafetyItems.map((label, index) => ({ label, value: "PASS" as const, notes: null, sortOrder: index }));
    const entry = await prisma.poolLogEntry.create({
      data: {
        propertyId: input.propertyId,
        facilityId: input.facilityId,
        technicianId: request.currentUser?.id,
        technicianName: request.currentUser?.fullName,
        logDate: dateOnly(new Date(input.logDate)),
        logTime: input.logTime ?? null,
        ph: input.ph ?? null,
        freeChlorine: input.freeChlorine ?? null,
        combinedChlorine: input.combinedChlorine ?? null,
        totalChlorine: input.totalChlorine ?? null,
        totalAlkalinity: input.totalAlkalinity ?? null,
        cyanuricAcid: input.cyanuricAcid ?? null,
        calciumHardness: input.calciumHardness ?? null,
        waterTemperature: input.waterTemperature ?? null,
        vacuumed: input.vacuumed ?? false,
        backwashed: input.backwashed ?? false,
        skimmerCleaned: input.skimmerCleaned ?? false,
        pumpRunning: input.pumpRunning ?? false,
        filterOperating: input.filterOperating ?? false,
        waterClear: input.waterClear ?? false,
        waterCloudy: input.waterCloudy ?? false,
        algaePresent: input.algaePresent ?? false,
        notes: input.notes ?? null,
        evaluationJson: evaluation as never,
        createdById: request.currentUser?.id,
        updatedById: request.currentUser?.id,
        safetyChecks: { create: safetyChecks.map((check, index) => ({ label: check.label, value: check.value, notes: check.notes ?? null, sortOrder: check.sortOrder ?? index })) },
        chemicalAdditions: {
          create: (input.chemicalAdditions ?? []).map((addition) => {
            const normalized = normalizeChemicalAdditionStorage(addition);
            return {
              chemicalId: addition.chemicalId ?? null,
              chemicalName: addition.chemicalName,
              amount: normalized.amount,
              unit: normalized.unit,
              notes: addition.notes ?? null,
            };
          }),
        },
      },
      include: { property: true, facility: true, safetyChecks: true, chemicalAdditions: true, attachments: true },
    });
    await writeAuditLog({ request, propertyId: entry.propertyId, entityType: "PoolLogEntry", entityId: entry.id, action: "Pool Log Created", message: `Logged pool/spa check for ${entry.facility.name}` });
    await queueWebhookEvent({
      eventType: "pool.entry.created",
      propertyId: entry.propertyId,
      actorUserId: request.currentUser?.id ?? null,
      data: {
        entryId: entry.id,
        propertyId: entry.propertyId,
        propertyCode: entry.property.code,
        facilityId: entry.facilityId,
        facilityName: entry.facility.name,
        facilityType: entry.facility.type,
        logDate: entry.logDate,
        logTime: entry.logTime,
        technicianId: entry.technicianId,
        technicianName: entry.technicianName,
        notes: entry.notes,
        safetyFailureCount: entry.safetyChecks.filter((check) => check.value === "FAIL").length,
        chemicalAdditionCount: entry.chemicalAdditions.length,
      },
    });
    await notifyPoolReviewIfNeeded({
      propertyId: entry.propertyId,
      facilityName: entry.facility.name,
      entryId: entry.id,
      evaluation,
      safetyFailures: entry.safetyChecks.filter((check) => check.value === "FAIL").length,
    });
    reply.code(201);
    return { entry };
  });

  app.get("/pool/report.html", async (request, reply) => {
    const access = roleAccess(request.currentUser?.role ?? "VIEWER");
    if (!access.view) throw Object.assign(new Error("Pool report access denied"), { statusCode: 403 });
    const query = z.object({ propertyId: z.string().optional(), from: z.string().optional(), to: z.string().optional() }).parse(request.query);
    if (query.propertyId) await assertPropertyAccess(request, query.propertyId);
    const allowed = await allowedPropertyIds(request);
    const entries = await prisma.poolLogEntry.findMany({
      where: {
        propertyId: query.propertyId ?? { in: allowed },
        ...(query.from || query.to ? { logDate: { ...(query.from ? { gte: dateOnly(new Date(query.from)) } : {}), ...(query.to ? { lte: endOfDay(new Date(query.to)) } : {}) } } : {}),
      },
      include: { property: true, facility: true, safetyChecks: true, chemicalAdditions: true, attachments: true },
      orderBy: [{ logDate: "desc" }, { createdAt: "desc" }],
      take: 250,
    });
    const reviewCount = entries.filter((entry) => (entry.evaluationJson as { status?: string } | null)?.status === "REVIEW" || entry.safetyChecks.some((check) => check.value === "FAIL")).length;
    const rows = entries.map((entry) => {
      const evaluation = entry.evaluationJson as { status?: string; issues?: Array<{ message?: string }> } | null;
      return `<tr>
        <td>${htmlEscape(entry.property.code)}</td>
        <td>${htmlEscape(entry.facility.name)}</td>
        <td>${htmlEscape(entry.logDate.toISOString().slice(0, 10))}</td>
        <td>${htmlEscape(entry.logTime ?? "")}</td>
        <td>${htmlEscape(entry.technicianName ?? "")}</td>
        <td>${htmlEscape(entry.ph ?? "")}</td>
        <td>${htmlEscape(entry.freeChlorine ?? "")}</td>
        <td>${htmlEscape(entry.combinedChlorine ?? "")}</td>
        <td>${htmlEscape(evaluation?.status ?? "Logged")}</td>
        <td>${htmlEscape((evaluation?.issues ?? []).map((issue) => issue.message ?? "").join("; "))}</td>
        <td>${htmlEscape(entry.safetyChecks.filter((check) => check.value === "FAIL").map((check) => check.label).join("; "))}</td>
        <td>${htmlEscape(entry.chemicalAdditions.map((addition) => `${addition.chemicalName} ${formatChemicalAdditionAmount(addition.amount, addition.unit)}`).join("; "))}</td>
        <td>${htmlEscape(entry.attachments.length)}</td>
      </tr>`;
    }).join("");
    const html = `<!doctype html>
      <html><head><meta charset="utf-8"><title>MakeReadyOS Pool Log Report</title>
      <style>
        body{font-family:Arial,sans-serif;color:#111827;margin:24px}
        h1{margin:0 0 4px} .muted{color:#4b5563}
        .summary{display:flex;gap:12px;margin:18px 0;flex-wrap:wrap}
        .card{border:1px solid #d1d5db;border-radius:8px;padding:10px 14px}
        .card strong{display:block;font-size:22px}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{border:1px solid #d1d5db;padding:6px;text-align:left;vertical-align:top}
        th{background:#f3f4f6}
        @media print{button{display:none}body{margin:12px}}
      </style></head><body>
      <button onclick="window.print()">Print / Save PDF</button>
      <h1>MakeReadyOS Pool Log Report</h1>
      <p class="muted">Generated ${htmlEscape(new Date().toLocaleString())}</p>
      <div class="summary">
        <div class="card"><strong>${entries.length}</strong><span>Log entries</span></div>
        <div class="card"><strong>${reviewCount}</strong><span>Review entries</span></div>
      </div>
      <table><thead><tr><th>Property</th><th>Pool/Spa</th><th>Date</th><th>Time</th><th>Tech</th><th>pH</th><th>FC</th><th>CC</th><th>Status</th><th>Chemistry issues</th><th>Safety failures</th><th>Chemicals</th><th>Files</th></tr></thead><tbody>${rows || "<tr><td colspan=\"13\">No pool logs found.</td></tr>"}</tbody></table>
      </body></html>`;
    reply.header("content-type", "text/html; charset=utf-8");
    return html;
  });

  app.get("/pool/report.pdf", async (request, reply) => {
    const access = roleAccess(request.currentUser?.role ?? "VIEWER");
    if (!access.view) throw Object.assign(new Error("Pool report access denied"), { statusCode: 403 });
    const query = z.object({ propertyId: z.string().optional(), from: z.string().optional(), to: z.string().optional() }).parse(request.query);
    if (query.propertyId) await assertPropertyAccess(request, query.propertyId);
    const allowed = await allowedPropertyIds(request);
    const entries = await prisma.poolLogEntry.findMany({
      where: {
        propertyId: query.propertyId ?? { in: allowed },
        ...(query.from || query.to ? { logDate: { ...(query.from ? { gte: dateOnly(new Date(query.from)) } : {}), ...(query.to ? { lte: endOfDay(new Date(query.to)) } : {}) } } : {}),
      },
      include: { property: true, facility: true, safetyChecks: true, chemicalAdditions: true, attachments: true },
      orderBy: [{ logDate: "desc" }, { createdAt: "desc" }],
      take: 250,
    });
    const reviewCount = entries.filter((entry) => (entry.evaluationJson as { status?: string } | null)?.status === "REVIEW" || entry.safetyChecks.some((check) => check.value === "FAIL")).length;
    const rows = entries.map((entry) => {
      const evaluation = entry.evaluationJson as { status?: string; issues?: Array<{ message?: string }> } | null;
      return `<tr>
        <td>${htmlEscape(entry.property.code)}</td>
        <td>${htmlEscape(entry.facility.name)}</td>
        <td>${htmlEscape(entry.logDate.toISOString().slice(0, 10))}</td>
        <td>${htmlEscape(entry.logTime ?? "")}</td>
        <td>${htmlEscape(entry.technicianName ?? "")}</td>
        <td>${htmlEscape(entry.ph ?? "")}</td>
        <td>${htmlEscape(entry.freeChlorine ?? "")}</td>
        <td>${htmlEscape(entry.combinedChlorine ?? "")}</td>
        <td>${htmlEscape(evaluation?.status ?? "Logged")}</td>
        <td>${htmlEscape((evaluation?.issues ?? []).map((issue) => issue.message ?? "").join("; "))}</td>
        <td>${htmlEscape(entry.safetyChecks.filter((check) => check.value === "FAIL").map((check) => check.label).join("; "))}</td>
        <td>${htmlEscape(entry.chemicalAdditions.map((addition) => `${addition.chemicalName} ${formatChemicalAdditionAmount(addition.amount, addition.unit)}`).join("; "))}</td>
        <td>${htmlEscape(entry.attachments.length)}</td>
      </tr>`;
    }).join("");
    const html = `<!doctype html>
      <html><head><meta charset="utf-8"><title>MakeReadyOS Pool Log Report</title>
      <style>
        body{font-family:Arial,sans-serif;color:#111827;margin:24px}
        h1{margin:0 0 4px} .muted{color:#4b5563}
        .summary{display:flex;gap:12px;margin:18px 0;flex-wrap:wrap}
        .card{border:1px solid #d1d5db;border-radius:8px;padding:10px 14px}
        .card strong{display:block;font-size:22px}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{border:1px solid #d1d5db;padding:6px;text-align:left;vertical-align:top}
        th{background:#f3f4f6}
      </style></head><body>
      <h1>MakeReadyOS Pool Log Report</h1>
      <p class="muted">Generated ${htmlEscape(new Date().toLocaleString())}</p>
      <div class="summary">
        <div class="card"><strong>${entries.length}</strong><span>Log entries</span></div>
        <div class="card"><strong>${reviewCount}</strong><span>Review entries</span></div>
      </div>
      <table><thead><tr><th>Property</th><th>Pool/Spa</th><th>Date</th><th>Time</th><th>Tech</th><th>pH</th><th>FC</th><th>CC</th><th>Status</th><th>Chemistry issues</th><th>Safety failures</th><th>Chemicals</th><th>Files</th></tr></thead><tbody>${rows || "<tr><td colspan=\"13\">No pool logs found.</td></tr>"}</tbody></table>
      </body></html>`;
    const pdf = await renderPdfFromHtml(html);
    reply.header("content-type", "application/pdf");
    reply.header("content-disposition", 'inline; filename="pool-log-report.pdf"');
    return reply.send(pdf);
  });

  app.post("/pool/entries/:id/attachments", async (request, reply) => {
    const access = roleAccess(request.currentUser?.role ?? "VIEWER");
    if (!access.edit) throw Object.assign(new Error("Pool attachment upload access denied"), { statusCode: 403 });
    const params = z.object({ id: z.string() }).parse(request.params);
    const entry = await prisma.poolLogEntry.findUnique({ where: { id: params.id }, include: { property: true, facility: true } });
    if (!entry) throw Object.assign(new Error("Pool log entry not found"), { statusCode: 404 });
    await assertPropertyAccess(request, entry.propertyId);
    const file = await request.file();
    if (!file) return reply.code(400).send({ message: "Select a pool photo or PDF to upload" });
    const safeName = sanitizeFilename(file.filename);
    const extension = extname(safeName).toLowerCase().slice(0, 12);
    if (!allowedAttachmentExtensions.has(extension) || !allowedAttachmentTypes.has(file.mimetype)) {
      file.file.resume();
      return reply.code(415).send({ message: "Unsupported pool attachment type. Upload image files or PDFs." });
    }
    const storedName = routedStoredName(entry.property, `pool-log/${randomUUID()}${extension}`);
    await ensureStoredUploadParent(storedName);
    const path = resolveStoredUploadPath(storedName);
    await pipeline(file.file, (await import("node:fs")).createWriteStream(path));
    if (file.file.truncated) {
      await unlink(path).catch(() => undefined);
      return reply.code(413).send({ message: "Pool attachment was truncated by an upload limit. Upload fewer files at once or increase the upload/proxy limit." });
    }
    const user = request.currentUser!;
    const attachment = await prisma.poolLogAttachment.create({
      data: {
        entryId: entry.id,
        propertyId: entry.propertyId,
        uploadedById: user.id,
        uploaderName: user.fullName,
        originalName: safeName,
        storedName,
        mimeType: file.mimetype || "application/octet-stream",
        sizeBytes: file.file.bytesRead,
        category: "Pool inspection",
      },
    });
    await writeAuditLog({ request, propertyId: entry.propertyId, entityType: "PoolLogAttachment", entityId: attachment.id, action: "Pool Attachment Uploaded", message: `Uploaded ${safeName} to ${entry.facility.name} pool log` });
    reply.code(201);
    return { attachment };
  });

  app.get("/pool/attachments/:id/download", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const attachment = await prisma.poolLogAttachment.findUnique({ where: { id: params.id } });
    if (!attachment) throw Object.assign(new Error("Pool attachment not found"), { statusCode: 404 });
    await assertPropertyAccess(request, attachment.propertyId);
    reply.header("Content-Type", attachment.mimeType);
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Content-Disposition", `inline; filename="${sanitizeFilename(attachment.originalName)}"`);
    return reply.send(createReadStream(resolveStoredUploadPath(attachment.storedName)));
  });

  app.delete("/pool/attachments/:id", async (request) => {
    const access = roleAccess(request.currentUser?.role ?? "VIEWER");
    if (!access.edit) throw Object.assign(new Error("Pool attachment delete access denied"), { statusCode: 403 });
    const params = z.object({ id: z.string() }).parse(request.params);
    const attachment = await prisma.poolLogAttachment.findUnique({ where: { id: params.id }, include: { entry: { include: { facility: true } } } });
    if (!attachment) throw Object.assign(new Error("Pool attachment not found"), { statusCode: 404 });
    await assertPropertyAccess(request, attachment.propertyId);
    await prisma.poolLogAttachment.delete({ where: { id: attachment.id } });
    await removeStoredUpload(attachment.storedName);
    await writeAuditLog({ request, propertyId: attachment.propertyId, entityType: "PoolLogAttachment", entityId: attachment.id, action: "Pool Attachment Deleted", message: `Deleted ${attachment.originalName} from ${attachment.entry.facility.name} pool log` });
    return { ok: true };
  });

  app.get("/pool/export.csv", async (request, reply) => {
    const access = roleAccess(request.currentUser?.role ?? "VIEWER");
    if (!access.view) throw Object.assign(new Error("Pool export access denied"), { statusCode: 403 });
    const query = z.object({ propertyId: z.string().optional(), from: z.string().optional(), to: z.string().optional() }).parse(request.query);
    if (query.propertyId) await assertPropertyAccess(request, query.propertyId);
    const allowed = await allowedPropertyIds(request);
    const entries = await prisma.poolLogEntry.findMany({
      where: {
        propertyId: query.propertyId ?? { in: allowed },
        ...(query.from || query.to ? { logDate: { ...(query.from ? { gte: dateOnly(new Date(query.from)) } : {}), ...(query.to ? { lte: endOfDay(new Date(query.to)) } : {}) } } : {}),
      },
      include: { property: true, facility: true, safetyChecks: true, chemicalAdditions: true },
      orderBy: [{ logDate: "desc" }, { createdAt: "desc" }],
    });
    const rows = [
      ["property", "pool_spa", "date", "time", "tech", "ph", "free_chlorine", "combined_chlorine", "total_chlorine", "alkalinity", "cya", "calcium_hardness", "temperature", "status", "issues", "chemical_additions", "notes"],
      ...entries.map((entry) => {
        const evaluation = entry.evaluationJson as { status?: string; issues?: Array<{ message?: string }> } | null;
        return [
          entry.property.code,
          entry.facility.name,
          entry.logDate.toISOString().slice(0, 10),
          entry.logTime ?? "",
          entry.technicianName ?? "",
          entry.ph ?? "",
          entry.freeChlorine ?? "",
          entry.combinedChlorine ?? "",
          entry.totalChlorine ?? "",
          entry.totalAlkalinity ?? "",
          entry.cyanuricAcid ?? "",
          entry.calciumHardness ?? "",
          entry.waterTemperature ?? "",
          evaluation?.status ?? "",
          (evaluation?.issues ?? []).map((issue) => issue.message ?? "").join("; "),
          entry.chemicalAdditions.map((addition) => `${addition.chemicalName} ${formatChemicalAdditionAmount(addition.amount, addition.unit)}`).join("; "),
          entry.notes ?? "",
        ];
      }),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    reply.header("content-type", "text/csv; charset=utf-8");
    reply.header("content-disposition", "attachment; filename=\"makereadyos-pool-log.csv\"");
    return csv;
  });
}
