import { Prisma, UserRole } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { allowedPropertyIds } from "../lib/auth.js";
import { writeAuditLog } from "../lib/audit.js";
import { computeDerivedFields } from "../lib/board.js";
import { prisma } from "../lib/prisma.js";
import { evaluateAndPersistItemRisk } from "../lib/risk.js";

export const operationsQuerySchema = z.object({
  includeArchived: z.enum(["true", "false"]).optional().transform((value) => value === "true"),
  propertyId: z.string().optional(),
});

export const propertyCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(2).max(20).regex(/^[A-Za-z0-9_-]+$/).transform((value) => value.toUpperCase()),
  occupancyGoalPercent: z.number().min(0).max(100).optional().nullable(),
});

export const propertyPatchSchema = propertyCreateSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: "Provide a property name or code to update",
});

const occupancyStatusValues = [
  "OCCUPIED",
  "VACANT_READY",
  "VACANT_LEASED",
  "VACANT_NOT_LEASED",
  "NTV",
  "NTV_LEASED",
  "VACANT NOT LEASED READY",
  "VACANT NOT LEASED NOT READY",
  "NTV NOT LEASED",
  "NTV LEASED",
  "VACANT LEASED READY",
  "VACANT LEASED NOT READY",
  "DOWN",
  "TO PRE-WALK",
  "TO SCOPE",
  "TO FINAL WALK",
  "MODEL",
  "UNKNOWN",
] as const;

const availabilityStatusValues = [
  "VACANT_READY",
  "VACANT_LEASED",
  "VACANT_NOT_LEASED",
  "NTV",
  "NTV_LEASED",
  "VACANT NOT LEASED READY",
  "VACANT NOT LEASED NOT READY",
  "NTV NOT LEASED",
  "NTV LEASED",
  "VACANT LEASED READY",
  "VACANT LEASED NOT READY",
  "DOWN",
  "TO PRE-WALK",
  "TO SCOPE",
  "TO FINAL WALK",
  "MODEL",
  "UNKNOWN",
] as const;

export const unitCreateSchema = z.object({
  propertyId: z.string(),
  number: z.string().trim().min(1).max(30),
  floorPlanId: z.string().optional().nullable(),
  floorPlan: z.string().trim().max(80).optional().nullable(),
  squareFeet: z.number().int().positive().max(10000).optional().nullable(),
  bedrooms: z.number().int().min(0).max(20).optional().nullable(),
  bathrooms: z.number().min(0).max(20).optional().nullable(),
  occupancyStatus: z.enum(occupancyStatusValues).optional(),
  building: z.string().trim().max(40).optional().nullable(),
  area: z.string().trim().max(80).optional().nullable(),
  floor: z.string().trim().max(20).optional().nullable(),
  isBudgeted: z.boolean().optional(),
});

export const unitPatchSchema = unitCreateSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: "Provide unit fields to update",
});

export const unitImportRowSchema = z.object({
  number: z.string().trim().min(1).max(30),
  floorPlan: z.string().trim().max(100).optional().nullable(),
  squareFeet: z.number().int().positive().max(10000).optional().nullable(),
  bedrooms: z.number().int().min(0).max(20).optional().nullable(),
  bathrooms: z.number().min(0).max(20).optional().nullable(),
  occupancyStatus: z.enum(occupancyStatusValues).optional(),
  building: z.string().trim().max(40).optional().nullable(),
  area: z.string().trim().max(80).optional().nullable(),
  floor: z.string().trim().max(20).optional().nullable(),
  isBudgeted: z.boolean().optional(),
});

export const unitImportSchema = z.object({
  propertyId: z.string(),
  units: z.array(unitImportRowSchema).min(1).max(1500),
  updateExisting: z.boolean().default(true),
});

export const availabilityImportRowSchema = unitImportRowSchema.extend({
  vacancyStatus: z.enum(availabilityStatusValues).optional(),
  availabilityStatus: z.string().trim().max(120).optional().nullable(),
  applicant: z.string().trim().max(120).optional().nullable(),
  moveOutDate: z.string().trim().max(30).optional().nullable(),
  vacatedDate: z.string().trim().max(30).optional().nullable(),
  daysVacant: z.preprocess((value) => {
    if (value === null || value === undefined || value === "") return undefined;
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const parsed = Number(value.replace(/,/g, "").replace(/[^\d.-]/g, ""));
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  }, z.number().int().min(0).max(10000).optional()),
  makeReadyDate: z.string().trim().max(30).optional().nullable(),
  moveInDate: z.string().trim().max(30).optional().nullable(),
  reportDate: z.string().trim().max(30).optional().nullable(),
  dateApplied: z.string().trim().max(30).optional().nullable(),
  makeReadyStatus: z.string().trim().max(80).optional().nullable(),
  scopeLevel: z.string().trim().max(80).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const availabilityImportSchema = z.object({
  propertyId: z.string(),
  rows: z.array(availabilityImportRowSchema).min(1).max(1500),
  updateExisting: z.boolean().default(true),
  createTurns: z.boolean().default(true),
  overrideConflicts: z.boolean().default(false),
});

export const unitImportRevertSchema = z.object({
  propertyId: z.string(),
  createdUnitIds: z.array(z.string()).min(1).max(1500),
});

const managedOptionFields = new Set([
  "vacancyStatus", "scopeLevel", "paintStatus", "doorsStatus", "completionStatus",
  "sheetrockStatus", "pestStatus", "pestTreated", "trashOutStatus", "floorsStatus",
  "makeReadyStatus", "cleaningStatus", "keysMadeStatus", "cabinetsStatus",
  "countertopsStatus", "appliancesStatus", "moveInFlag",
]);

const builtInColumnKeys = new Set([
  "unitNumber", "floorPlan", "applicant", "moveOutDate", "vacancyStatus", "vacatedDate", "daysVacant",
  "assignedTech", "scopeLevel", "makeReadyDate", "moveInDate", "paintStatus", "doorsStatus",
  "completionStatus", "sheetrockStatus", "pestStatus", "pestTreated", "trashOutStatus", "floorsStatus",
  "flooringDate", "makeReadyStatus", "cleaningStatus", "keysMadeStatus", "cabinetsStatus",
  "countertopsStatus", "appliancesStatus", "notes",
]);
const defaultColumnLabels: Record<string, string> = {
  unitNumber: "Item", floorPlan: "Floor Plan", applicant: "Applicant", moveOutDate: "NTV / Expected Vacate",
  vacancyStatus: "Vacancy", vacatedDate: "Vacated", daysVacant: "Days Vacant", assignedTech: "Assigned",
  scopeLevel: "Scope", makeReadyDate: "Make Ready", moveInDate: "Move-In", paintStatus: "Paint",
  doorsStatus: "Doors", completionStatus: "Completed", sheetrockStatus: "Sheetrock", pestStatus: "Pest",
  pestTreated: "Pest Treated", trashOutStatus: "Trash Out", floorsStatus: "Floors", flooringDate: "Flooring Date",
  makeReadyStatus: "Make Ready Status", cleaningStatus: "Cleaning", keysMadeStatus: "Keys Made",
  cabinetsStatus: "Cabinets", countertopsStatus: "Countertops", appliancesStatus: "Appliances", notes: "Notes",
};
export const columnLabelSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  reset: z.boolean().optional(),
}).refine((value) => Boolean(value.label || value.reset), {
  message: "Provide a label or request reset",
});
export const scheduleTrackSchema = z.object({
  sourceField: z.string().trim().min(1).max(120),
  displayName: z.string().trim().min(1).max(80),
  colorBasis: z.enum(["STATUS", "SCOPE", "FIELD", "FIXED", "NEUTRAL"]),
  colorSourceField: z.string().trim().min(1).max(120).optional().nullable(),
  fixedColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  groupingMode: z.enum(["NONE", "PROPERTY", "BOARD_GROUP"]).default("NONE"),
  visibilityFilter: z.object({
    boardGroups: z.array(z.string()).optional(),
    statusValues: z.array(z.string()).optional(),
  }).optional().nullable(),
  overdueEnabled: z.boolean().default(true),
  moveInSoonEnabled: z.boolean().default(true),
  isEnabled: z.boolean().default(true),
});
export const scheduleTrackPatchSchema = scheduleTrackSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: "Provide schedule track fields to update",
});
export const reorderScheduleTracksSchema = z.object({ ids: z.array(z.string()).min(1) });
export const operatingCalendarSchema = z.object({
  name: z.string().trim().min(1).max(80).default("Default Operating Calendar"),
  timezone: z.string().trim().min(1).max(80).default("America/Chicago"),
  noWeekendScheduling: z.boolean().default(true),
  avoidMondayScheduling: z.boolean().default(false),
  avoidFridayScheduling: z.boolean().default(false),
  maintenanceStartMinute: z.number().int().min(0).max(1439).default(480),
  maintenanceEndMinute: z.number().int().min(1).max(1440).default(1020),
  vendorLeadDays: z.number().int().min(0).max(60).default(3),
  dailyScheduledUnitLimit: z.number().int().min(1).max(50).nullable().optional(),
  scopeDay: z.number().int().min(0).max(6).nullable().optional(),
  workStartDay: z.number().int().min(0).max(6).nullable().optional(),
  autoPopulateEnabled: z.boolean().default(false),
  notes: z.string().trim().max(500).nullable().optional(),
}).superRefine((value, context) => {
  if (value.maintenanceEndMinute <= value.maintenanceStartMinute) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "End time must be after start time", path: ["maintenanceEndMinute"] });
  }
});

export const boardOptionInputSchema = z.object({
  fieldKey: z.string(),
  value: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#f4f6fa"),
});

export const boardOptionPatchSchema = boardOptionInputSchema.omit({ fieldKey: true }).partial().refine((value) => Object.keys(value).length > 0, {
  message: "Provide an option value or color to update",
});

export const reorderOptionsSchema = z.object({ ids: z.array(z.string()).min(1) });

export const floorPlanCreateSchema = z.object({
  propertyId: z.string(),
  code: z.string().trim().min(1).max(40).optional(),
  name: z.string().trim().min(1).max(100),
  bedrooms: z.number().int().min(0).max(20).optional().nullable(),
  bathrooms: z.number().min(0).max(20).optional().nullable(),
  squareFeet: z.number().int().positive().max(10000).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
});

export const floorPlanPatchSchema = floorPlanCreateSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: "Provide floor plan fields to update",
});
export const sectionPatchSchema = z.object({ displayName: z.string().trim().min(1).max(80) });

function defaultSections(propertyCode: string) {
  const code = propertyCode.toUpperCase();
  if (code === "TA") return [
    ["READY_UNITS_TA", "READY", "Ready Units"],
    ["MAKE_READY_BOARD_TA", "MAKE_READY", "Make Ready"],
    ["DOWN_AND_MODELS", "DOWN", "Down Units"],
    ["ARCHIVE_TA", "ARCHIVE", "Archive"],
  ] as const;
  if (code === "VAB") return [
    ["READY_UNITS_VAB", "READY", "Ready Units"],
    ["MAKE_READY_BOARD_VAB", "MAKE_READY", "Make Ready"],
    ["VAB_DOWN_UNITS", "DOWN", "Down Units"],
    ["ARCHIVE_VAB", "ARCHIVE", "Archive"],
  ] as const;
  return [
    [`${code}_READY_UNITS`, "READY", "Ready Units"],
    [`${code}_MAKE_READY`, "MAKE_READY", "Make Ready"],
    [`${code}_DOWN_UNITS`, "DOWN", "Down Units"],
    [`${code}_ARCHIVE`, "ARCHIVE", "Archive"],
  ] as const;
}

function parseOptionalDate(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "-" || trimmed === "—") return null;
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (match) {
    const [, mm, dd, yyyy] = match;
    const year = yyyy.length === 2 ? Number(`20${yyyy}`) : Number(yyyy);
    const date = new Date(year, Number(mm) - 1, Number(dd));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

function stripAvailabilityImportNotes(notes: string | null | undefined) {
  if (!notes) return null;
  const cleaned = notes
    .split(/\s+\/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .filter((part) => !/^Report date:/i.test(part))
    .filter((part) => !/^Source status:/i.test(part))
    .filter((part) => !/^Date applied:/i.test(part))
    .join(" / ")
    .trim();
  return cleaned || null;
}

function normalizeDateString(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = value instanceof Date ? value : parseOptionalDate(value);
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

function isDoneLikeStatus(value: string | null | undefined) {
  return ["DONE", "YES", "GOOD", "MADE", "COMPLETE", "COMPLETED"].includes(String(value ?? "").trim().toUpperCase());
}

function isReadyAvailabilityStatus(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return Boolean(normalized && normalized.includes("READY") && !normalized.includes("NOT READY"));
}

function buildAvailabilityConflict(existingTurn: {
  id: string;
  unitNumber: string;
  vacancyStatus: string | null;
  applicant: string | null;
  moveOutDate: Date | null;
  vacatedDate: Date | null;
  makeReadyDate: Date | null;
  moveInDate: Date | null;
  makeReadyStatus: string | null;
  boardGroup: string;
  daysVacant: number;
  updatedAt: Date;
  createdAt: Date;
}, row: z.infer<typeof availabilityImportRowSchema>, status: string, projectedBoardGroup: string) {
  const fieldChanges: string[] = [];
  const blockingFieldChanges: string[] = [];
  const nextVacancyStatus = status === "MODEL" ? "VACANT NOT LEASED NOT READY" : status;
  const noticeStatus = status === "NTV" || status === "NTV_LEASED" || status === "NTV NOT LEASED" || status === "NTV LEASED";
  const reportMoveOut = row.moveOutDate !== undefined ? (noticeStatus ? normalizeDateString(row.moveOutDate) : "") : normalizeDateString(existingTurn.moveOutDate);
  const reportVacated = row.vacatedDate !== undefined || row.moveOutDate !== undefined
    ? normalizeDateString(row.vacatedDate) || (!noticeStatus ? normalizeDateString(row.moveOutDate) : "")
    : normalizeDateString(existingTurn.vacatedDate);
  const reportMakeReady = row.makeReadyDate !== undefined ? normalizeDateString(row.makeReadyDate) : normalizeDateString(existingTurn.makeReadyDate);
  const reportMoveIn = row.moveInDate !== undefined ? normalizeDateString(row.moveInDate) : normalizeDateString(existingTurn.moveInDate);
  const reportApplicant = row.applicant !== undefined ? (row.applicant ?? "") : (existingTurn.applicant ?? "");
  const reportMakeReadyStatus = row.makeReadyStatus !== undefined
    ? (row.makeReadyStatus ?? "")
    : (existingTurn.makeReadyStatus ?? (isReadyAvailabilityStatus(status) ? "DONE" : ""));

  if (nextVacancyStatus !== (existingTurn.vacancyStatus ?? "")) {
    const change = `Vacancy: ${existingTurn.vacancyStatus ?? "blank"} -> ${nextVacancyStatus}`;
    fieldChanges.push(change);
    blockingFieldChanges.push(change);
  }
  if (reportApplicant !== (existingTurn.applicant ?? "")) {
    const change = `Applicant: ${existingTurn.applicant || "blank"} -> ${reportApplicant || "blank"}`;
    fieldChanges.push(change);
    blockingFieldChanges.push(change);
  }
  if (reportMoveOut !== normalizeDateString(existingTurn.moveOutDate)) {
    const change = `NTV date: ${normalizeDateString(existingTurn.moveOutDate) || "blank"} -> ${reportMoveOut || "blank"}`;
    fieldChanges.push(change);
    blockingFieldChanges.push(change);
  }
  if (reportVacated !== normalizeDateString(existingTurn.vacatedDate)) {
    const change = `Vacated: ${normalizeDateString(existingTurn.vacatedDate) || "blank"} -> ${reportVacated || "blank"}`;
    fieldChanges.push(change);
    blockingFieldChanges.push(change);
  }
  if (reportMakeReady !== normalizeDateString(existingTurn.makeReadyDate)) {
    const change = `Make ready: ${normalizeDateString(existingTurn.makeReadyDate) || "blank"} -> ${reportMakeReady || "blank"}`;
    fieldChanges.push(change);
    blockingFieldChanges.push(change);
  }
  if (reportMoveIn !== normalizeDateString(existingTurn.moveInDate)) {
    const change = `Move-in: ${normalizeDateString(existingTurn.moveInDate) || "blank"} -> ${reportMoveIn || "blank"}`;
    fieldChanges.push(change);
    blockingFieldChanges.push(change);
  }
  if (reportMakeReadyStatus !== (existingTurn.makeReadyStatus ?? "")) {
    const change = `Make ready status: ${existingTurn.makeReadyStatus || "blank"} -> ${reportMakeReadyStatus || "blank"}`;
    fieldChanges.push(change);
    blockingFieldChanges.push(change);
  }
  if (projectedBoardGroup !== existingTurn.boardGroup) {
    const change = `Board section will change from ${existingTurn.boardGroup} to ${projectedBoardGroup}`;
    fieldChanges.push(change);
    blockingFieldChanges.push(change);
  }
  if (row.daysVacant !== undefined && row.daysVacant !== null && Number(row.daysVacant) !== Number(existingTurn.daysVacant ?? 0)) {
    fieldChanges.push(`Days vacant: ${Number(existingTurn.daysVacant ?? 0)} -> ${Number(row.daysVacant)}`);
  }
  if (fieldChanges.length === 0) return null;

  const reportDate = parseOptionalDate(row.reportDate);
  const localReadyRegression = (isDoneLikeStatus(existingTurn.makeReadyStatus) || isReadyAvailabilityStatus(existingTurn.vacancyStatus) || projectedBoardGroup !== existingTurn.boardGroup && isReadyAvailabilityStatus(existingTurn.vacancyStatus))
    && !isReadyAvailabilityStatus(nextVacancyStatus)
    && !isDoneLikeStatus(reportMakeReadyStatus);
  const localChangeAfterReport = reportDate ? existingTurn.updatedAt.getTime() > reportDate.getTime() : existingTurn.updatedAt.getTime() > existingTurn.createdAt.getTime();

  if (blockingFieldChanges.length === 0 && !localReadyRegression) return null;
  if (!localReadyRegression && !localChangeAfterReport) return null;

  return {
    itemId: existingTurn.id,
    unitNumber: existingTurn.unitNumber,
    updatedAt: existingTurn.updatedAt.toISOString(),
    reportDate: reportDate?.toISOString() ?? null,
    conflictKind: localReadyRegression ? "LOCAL_AHEAD_READY" : "LOCAL_NEWER",
    reason: localReadyRegression
      ? "Local board is already ahead of the availability report. Review before allowing the report to move this turn backward."
      : "This availability report appears older than the latest local board edits for this turn.",
    recommendedAction: localReadyRegression
      ? "Confirm the source system has been updated to match MakeReadyOS before importing. Override only if the report is truly correct and the local board should move backward."
      : "Review the newer local board edits before importing. Override only if the report should replace the latest local changes.",
    fieldChanges,
  };
}

function normalizeAvailabilityStatus(row: z.infer<typeof availabilityImportRowSchema>) {
  if (row.vacancyStatus) return row.vacancyStatus;
  if (row.occupancyStatus && row.occupancyStatus !== "OCCUPIED") return row.occupancyStatus;
  const raw = `${row.availabilityStatus ?? ""}`.toLowerCase();
  if (raw.includes("down")) return "DOWN";
  if (raw.includes("model")) return "MODEL";
  const notice = raw.includes("ntv") || raw.includes("notice");
  const notLeased = raw.includes("not leased") || raw.includes("not-leased") || raw.includes("unleased");
  const leased = !notLeased && (raw.includes("leased") || raw.includes("preleased") || raw.includes("pre-leased"));
  const notReady = raw.includes("not ready") || raw.includes("not-ready") || raw.includes("nr");
  const ready = raw.includes("ready") && !notReady;
  if (notice && leased) return "NTV LEASED";
  if (notice) return "NTV NOT LEASED";
  if (raw.includes("vacant") && leased && ready) return "VACANT LEASED READY";
  if (raw.includes("vacant") && leased) return "VACANT LEASED NOT READY";
  if (raw.includes("vacant") && (notLeased || ready) && ready) return "VACANT NOT LEASED READY";
  if (raw.includes("vacant")) return "VACANT NOT LEASED NOT READY";
  return row.occupancyStatus ?? "UNKNOWN";
}

async function preferredSectionKey(tx: Prisma.TransactionClient, propertyId: string, status: string) {
  const readyStatus = (status.includes("READY") && !status.includes("NOT READY")) || status === "VACANT_READY" || status === "VACANT_LEASED";
  const sectionType = readyStatus
    ? "READY"
    : status === "DOWN" || status === "MODEL"
      ? "DOWN"
      : "MAKE_READY";
  const section = await tx.boardSection.findFirst({
    where: { propertyId, sectionType, isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  return section?.key ?? (await tx.boardSection.findFirst({ where: { propertyId, isActive: true }, orderBy: { sortOrder: "asc" } }))?.key ?? "MAKE_READY";
}

function mayManage(userRole: UserRole) {
  return userRole === UserRole.ADMIN || userRole === UserRole.MANAGER;
}

function defaultOperatingCalendar(propertyId: string, property?: { code: string }) {
  return {
    id: `default:${propertyId}`,
    propertyId,
    name: property ? `${property.code} Operating Calendar` : "Default Operating Calendar",
    timezone: "America/Chicago",
    noWeekendScheduling: true,
    avoidMondayScheduling: false,
    avoidFridayScheduling: false,
    maintenanceStartMinute: 480,
    maintenanceEndMinute: 1020,
    vendorLeadDays: 3,
    dailyScheduledUnitLimit: null,
    scopeDay: null,
    workStartDay: null,
    autoPopulateEnabled: false,
    notes: null,
    createdAt: null,
    updatedAt: null,
    property,
  };
}

async function ensureManagerOrAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (!mayManage(request.currentUser!.role)) {
    reply.code(403).send({ message: "Manager or admin access required" });
    return false;
  }
  return true;
}

function canAccessProperty(request: FastifyRequest, propertyId: string) {
  const propertyIds = allowedPropertyIds(request.currentUser!);
  return propertyIds === null || propertyIds.includes(propertyId);
}

async function requireAccessibleProperty(request: FastifyRequest, reply: FastifyReply, propertyId: string, allowArchived = false) {
  if (!canAccessProperty(request, propertyId)) {
    reply.code(403).send({ message: "Property access denied" });
    return null;
  }
  const property = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!property || (!allowArchived && !property.isActive)) {
    reply.code(404).send({ message: "Active property not found" });
    return null;
  }
  return property;
}

async function normalizeUnitFloorPlan(request: FastifyRequest, reply: FastifyReply, data: z.infer<typeof unitCreateSchema>, propertyId: string) {
  if (!data.floorPlanId) return data;
  const plan = await prisma.floorPlan.findFirst({ where: { id: data.floorPlanId, propertyId, isActive: true } });
  if (!plan) {
    reply.code(400).send({ message: "Select an active floor plan at the chosen property" });
    return null;
  }
  return {
    ...data,
    floorPlan: plan.code,
    squareFeet: plan.squareFeet,
    bedrooms: plan.bedrooms,
    bathrooms: plan.bathrooms,
  };
}

export async function operationsRoutes(app: FastifyInstance) {
  app.get("/operations/board-sections", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const query = operationsQuerySchema.parse(request.query);
    const propertyIds = allowedPropertyIds(request.currentUser!);
    if (query.propertyId && !canAccessProperty(request, query.propertyId)) {
      reply.code(403);
      return { message: "Property access denied" };
    }
    const sections = await prisma.boardSection.findMany({
      where: {
        propertyId: query.propertyId ?? (propertyIds === null ? undefined : { in: propertyIds }),
        isActive: query.includeArchived ? undefined : true,
      },
      include: { property: true },
      orderBy: [{ propertyId: "asc" }, { sortOrder: "asc" }],
    });
    return { sections };
  });

  app.patch("/operations/board-sections/:id", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const payload = sectionPatchSchema.parse(request.body);
    const existing = await prisma.boardSection.findUnique({ where: { id }, include: { property: true } });
    if (!existing) {
      reply.code(404);
      return { message: "Board section not found" };
    }
    if (!canAccessProperty(request, existing.propertyId)) {
      reply.code(403);
      return { message: "Property access denied" };
    }
    const section = await prisma.boardSection.update({ where: { id }, data: payload, include: { property: true } });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: section.propertyId,
      entityType: "BOARD_SECTION",
      entityId: section.id,
      action: "BOARD_SECTION_RENAMED",
      message: `Renamed ${section.property.code} section ${existing.displayName} to ${section.displayName}`,
      metadata: { key: section.key, sectionType: section.sectionType, previousName: existing.displayName },
    });
    return { section };
  });

  app.get("/operations/columns", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const columns = await prisma.boardColumnDefinition.findMany({ orderBy: { fieldKey: "asc" } });
    return { columns };
  });

  app.patch("/operations/columns/:fieldKey", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const { fieldKey } = z.object({ fieldKey: z.string() }).parse(request.params);
    if (!builtInColumnKeys.has(fieldKey)) {
      reply.code(400);
      return { message: "Only built-in board column labels are configured here" };
    }
    const payload = columnLabelSchema.parse(request.body);
    const label = payload.reset ? defaultColumnLabels[fieldKey] : payload.label!;
    const column = await prisma.boardColumnDefinition.upsert({
      where: { fieldKey },
      create: { fieldKey, label },
      update: { label },
    });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      entityType: "BOARD_COLUMN",
      entityId: fieldKey,
      action: payload.reset ? "BOARD_COLUMN_LABEL_RESET" : "BOARD_COLUMN_LABEL_UPDATED",
      message: payload.reset ? `Reset board column ${fieldKey} to ${column.label}` : `Renamed board column ${fieldKey} to ${column.label}`,
    });
    return { column };
  });

  app.get("/operations/schedule-tracks", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const tracks = await prisma.scheduleTrack.findMany({ orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }] });
    return { tracks };
  });

  async function validScheduleSource(sourceField: string) {
    if (["moveOutDate", "vacatedDate", "makeReadyDate", "moveInDate", "flooringDate"].includes(sourceField)) return true;
    if (!sourceField.startsWith("custom:")) return false;
    return Boolean(await prisma.customField.findFirst({
      where: { id: sourceField.slice(7), module: "make-ready", fieldType: "DATE", isArchived: false },
    }));
  }

  async function validScheduleColorSource(sourceField: string | null | undefined) {
    if (!sourceField) return false;
    if (managedOptionFields.has(sourceField)) return true;
    if (!sourceField.startsWith("custom:")) return false;
    return Boolean(await prisma.customField.findFirst({
      where: {
        id: sourceField.slice(7),
        module: "make-ready",
        fieldType: { in: ["SINGLE_SELECT", "MULTI_SELECT"] },
        isArchived: false,
      },
    }));
  }

  async function validateTrackConfig(
    payload: Pick<z.infer<typeof scheduleTrackSchema>, "sourceField" | "colorBasis" | "colorSourceField" | "fixedColor">,
    reply: FastifyReply,
  ) {
    if (!(await validScheduleSource(payload.sourceField))) {
      reply.code(400).send({ message: "Schedule tracks require an active built-in or custom date field" });
      return false;
    }
    if (payload.colorBasis === "FIXED" && !payload.fixedColor) {
      reply.code(400).send({ message: "Fixed-color tracks require a color" });
      return false;
    }
    if (payload.colorBasis === "FIELD" && !(await validScheduleColorSource(payload.colorSourceField))) {
      reply.code(400).send({ message: "Field-color tracks require an active status/select field" });
      return false;
    }
    return true;
  }

  app.post("/operations/schedule-tracks", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const payload = scheduleTrackSchema.parse(request.body);
    if (!(await validateTrackConfig(payload, reply))) return;
    const duplicate = await prisma.scheduleTrack.findUnique({ where: { sourceField: payload.sourceField } });
    if (duplicate) {
      reply.code(409);
      return { message: "That schedule source already has a configured track" };
    }
    const sortOrder = await prisma.scheduleTrack.count();
    const track = await prisma.scheduleTrack.create({
      data: {
        ...payload,
        visibilityFilter: payload.visibilityFilter ? payload.visibilityFilter as Prisma.InputJsonValue : Prisma.DbNull,
        sortOrder,
      },
    });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      entityType: "SCHEDULE_TRACK",
      entityId: track.id,
      action: "SCHEDULE_TRACK_CREATED",
      message: `Created schedule track ${track.displayName}`,
    });
    reply.code(201);
    return { track };
  });

  app.patch("/operations/schedule-tracks/:id", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const payload = scheduleTrackPatchSchema.parse(request.body);
    const existing = await prisma.scheduleTrack.findUnique({ where: { id } });
    if (!existing) {
      reply.code(404);
      return { message: "Schedule track not found" };
    }
    if (payload.sourceField && payload.sourceField !== existing.sourceField) {
      const duplicate = await prisma.scheduleTrack.findUnique({ where: { sourceField: payload.sourceField } });
      if (duplicate) {
        reply.code(409);
        return { message: "That schedule source already has a configured track" };
      }
    }
    const merged = {
      sourceField: payload.sourceField ?? existing.sourceField,
      colorBasis: (payload.colorBasis ?? existing.colorBasis) as z.infer<typeof scheduleTrackSchema>["colorBasis"],
      colorSourceField: payload.colorSourceField === undefined ? existing.colorSourceField : payload.colorSourceField,
      fixedColor: payload.fixedColor === undefined ? existing.fixedColor : payload.fixedColor,
    };
    if (!(await validateTrackConfig(merged, reply))) return;
    const track = await prisma.scheduleTrack.update({
      where: { id },
      data: {
        ...payload,
        visibilityFilter: payload.visibilityFilter === undefined
          ? undefined
          : payload.visibilityFilter
            ? payload.visibilityFilter as Prisma.InputJsonValue
            : Prisma.DbNull,
      },
    });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      entityType: "SCHEDULE_TRACK",
      entityId: track.id,
      action: "SCHEDULE_TRACK_UPDATED",
      message: `Updated schedule track ${track.displayName}`,
      metadata: { enabled: track.isEnabled },
    });
    return { track };
  });

  app.post("/operations/schedule-tracks/:id/archive", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.scheduleTrack.findUnique({ where: { id } });
    if (!existing) {
      reply.code(404);
      return { message: "Schedule track not found" };
    }
    const track = await prisma.scheduleTrack.update({ where: { id }, data: { isArchived: true, isEnabled: false } });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      entityType: "SCHEDULE_TRACK",
      entityId: track.id,
      action: "SCHEDULE_TRACK_ARCHIVED",
      message: `Archived schedule track ${track.displayName}`,
    });
    return { track };
  });

  app.post("/operations/schedule-tracks/:id/restore", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.scheduleTrack.findUnique({ where: { id } });
    if (!existing) {
      reply.code(404);
      return { message: "Schedule track not found" };
    }
    const track = await prisma.scheduleTrack.update({ where: { id }, data: { isArchived: false } });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      entityType: "SCHEDULE_TRACK",
      entityId: track.id,
      action: "SCHEDULE_TRACK_RESTORED",
      message: `Restored schedule track ${track.displayName}`,
    });
    return { track };
  });

  app.put("/operations/schedule-tracks/reorder", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const payload = reorderScheduleTracksSchema.parse(request.body);
    const tracks = await prisma.scheduleTrack.findMany({ where: { id: { in: payload.ids } } });
    if (tracks.length !== payload.ids.length) {
      reply.code(400);
      return { message: "All schedule tracks must exist before reordering" };
    }
    await prisma.$transaction(payload.ids.map((id, index) => prisma.scheduleTrack.update({ where: { id }, data: { sortOrder: index } })));
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      entityType: "SCHEDULE_TRACK_SET",
      action: "SCHEDULE_TRACKS_REORDERED",
      message: "Reordered schedule tracks",
    });
    return { ok: true };
  });

  app.get("/operations/operating-calendars", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const query = operationsQuerySchema.parse(request.query);
    const propertyIds = allowedPropertyIds(request.currentUser!);
    if (query.propertyId && !canAccessProperty(request, query.propertyId)) {
      reply.code(403);
      return { message: "Property access denied" };
    }
    const properties = await prisma.property.findMany({
      where: {
        id: query.propertyId ?? (propertyIds === null ? undefined : { in: propertyIds }),
        isActive: query.includeArchived ? undefined : true,
      },
      orderBy: { code: "asc" },
    });
    const calendars = await prisma.operatingCalendar.findMany({
      where: { propertyId: { in: properties.map((property) => property.id) } },
      include: { property: true },
    });
    const byProperty = new Map(calendars.map((calendar) => [calendar.propertyId, calendar]));
    return {
      calendars: properties.map((property) => byProperty.get(property.id) ?? defaultOperatingCalendar(property.id, property)),
    };
  });

  app.put("/operations/properties/:propertyId/operating-calendar", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const { propertyId } = z.object({ propertyId: z.string() }).parse(request.params);
    const property = await requireAccessibleProperty(request, reply, propertyId, true);
    if (!property) return;
    const payload = operatingCalendarSchema.parse(request.body);
    const calendar = await prisma.operatingCalendar.upsert({
      where: { propertyId },
      create: { ...payload, propertyId },
      update: payload,
      include: { property: true },
    });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId,
      entityType: "OPERATING_CALENDAR",
      entityId: calendar.id,
      action: "OPERATING_CALENDAR_UPDATED",
      message: `Updated operating calendar for ${property.code}`,
      metadata: {
        noWeekendScheduling: calendar.noWeekendScheduling,
        avoidMondayScheduling: calendar.avoidMondayScheduling,
        avoidFridayScheduling: calendar.avoidFridayScheduling,
        dailyScheduledUnitLimit: calendar.dailyScheduledUnitLimit,
        autoPopulateEnabled: calendar.autoPopulateEnabled,
      },
    });
    return { calendar };
  });

  app.get("/operations/properties", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const query = operationsQuerySchema.parse(request.query);
    const propertyIds = allowedPropertyIds(request.currentUser!);
    const properties = await prisma.property.findMany({
      where: {
        id: propertyIds === null ? undefined : { in: propertyIds },
        isActive: query.includeArchived ? undefined : true,
      },
      include: {
        _count: {
          select: {
            units: true,
            makeReadyItems: true,
          },
        },
      },
      orderBy: [{ isActive: "desc" }, { code: "asc" }],
    });
    return { properties };
  });

  app.post("/operations/properties", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    if (request.currentUser!.role !== UserRole.ADMIN) {
      reply.code(403);
      return { message: "Only administrators can create properties" };
    }
    const payload = propertyCreateSchema.parse(request.body);
    const existing = await prisma.property.findUnique({ where: { code: payload.code } });
    if (existing) {
      reply.code(409);
      return { message: "A property with that code already exists" };
    }
    const property = await prisma.property.create({ data: payload });
    await prisma.boardSection.createMany({
      data: defaultSections(property.code).map(([key, sectionType, displayName], sortOrder) => ({
        propertyId: property.id, key, sectionType, displayName, sortOrder,
      })),
    });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: property.id,
      entityType: "PROPERTY",
      entityId: property.id,
      action: "PROPERTY_CREATED",
      message: `Created property ${property.code}`,
    });
    reply.code(201);
    return { property };
  });

  app.patch("/operations/properties/:id", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const payload = propertyPatchSchema.parse(request.body);
    const existing = await requireAccessibleProperty(request, reply, id, true);
    if (!existing) return;
    if (payload.code && payload.code !== existing.code) {
      const duplicate = await prisma.property.findUnique({ where: { code: payload.code } });
      if (duplicate) {
        reply.code(409);
        return { message: "A property with that code already exists" };
      }
    }
    const property = await prisma.property.update({ where: { id }, data: payload });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: property.id,
      entityType: "PROPERTY",
      entityId: property.id,
      action: "PROPERTY_UPDATED",
      message: `Updated property ${property.code}`,
      metadata: { previousCode: existing.code, previousName: existing.name },
    });
    return { property };
  });

  app.post("/operations/properties/:id/archive", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    if (request.currentUser!.role !== UserRole.ADMIN) {
      reply.code(403);
      return { message: "Only administrators can archive properties" };
    }
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await requireAccessibleProperty(request, reply, id, true);
    if (!existing) return;
    const property = await prisma.property.update({ where: { id }, data: { isActive: false } });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: property.id,
      entityType: "PROPERTY",
      entityId: property.id,
      action: "PROPERTY_ARCHIVED",
      message: `Archived property ${property.code}`,
    });
    return { property };
  });

  app.post("/operations/properties/:id/restore", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    if (request.currentUser!.role !== UserRole.ADMIN) {
      reply.code(403);
      return { message: "Only administrators can restore properties" };
    }
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await requireAccessibleProperty(request, reply, id, true);
    if (!existing) return;
    const property = await prisma.property.update({ where: { id }, data: { isActive: true } });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: property.id,
      entityType: "PROPERTY",
      entityId: property.id,
      action: "PROPERTY_RESTORED",
      message: `Restored property ${property.code}`,
    });
    return { property };
  });

  app.delete("/operations/properties/:id", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    if (request.currentUser!.role !== UserRole.ADMIN) {
      reply.code(403);
      return { message: "Only administrators can delete properties" };
    }
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await requireAccessibleProperty(request, reply, id, true);
    if (!existing) return;
    if (existing.isActive) {
      reply.code(409);
      return { message: "Archive the property before deletion" };
    }
    const linkedCount = await prisma.$transaction([
      prisma.unit.count({ where: { propertyId: id } }),
      prisma.makeReadyItem.count({ where: { propertyId: id } }),
    ]);
    if (linkedCount.some((count) => count > 0)) {
      reply.code(409);
      return { message: "Property retains linked units or make-ready history and cannot be deleted safely" };
    }
    await prisma.property.delete({ where: { id } });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      entityType: "PROPERTY",
      entityId: id,
      action: "PROPERTY_DELETED",
      message: `Deleted archived property ${existing.code}`,
    });
    return { ok: true };
  });

  app.get("/operations/units", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const query = operationsQuerySchema.parse(request.query);
    const propertyIds = allowedPropertyIds(request.currentUser!);
    if (query.propertyId && !canAccessProperty(request, query.propertyId)) {
      reply.code(403);
      return { message: "Property access denied" };
    }
    const units = await prisma.unit.findMany({
      where: {
        propertyId: query.propertyId ?? (propertyIds === null ? undefined : { in: propertyIds }),
        isActive: query.includeArchived ? undefined : true,
      },
      include: {
        property: true,
        floorPlanRecord: true,
        _count: { select: { makeReadyItems: true } },
      },
      orderBy: [{ propertyId: "asc" }, { isActive: "desc" }, { number: "asc" }],
    });
    return { units };
  });

  app.post("/operations/units", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const payload = unitCreateSchema.parse(request.body);
    const property = await requireAccessibleProperty(request, reply, payload.propertyId);
    if (!property) return;
    const normalizedPayload = await normalizeUnitFloorPlan(request, reply, payload, payload.propertyId);
    if (!normalizedPayload) return;
    const duplicate = await prisma.unit.findUnique({
      where: { propertyId_number: { propertyId: payload.propertyId, number: payload.number } },
    });
    if (duplicate) {
      reply.code(409);
      return { message: "That unit already exists at the selected property" };
    }
    const unit = await prisma.unit.create({
      data: normalizedPayload,
      include: { property: true, floorPlanRecord: true },
    });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: unit.propertyId,
      entityType: "UNIT",
      entityId: unit.id,
      action: "UNIT_CREATED",
      message: `Created unit ${unit.number} at ${property.code}`,
    });
    reply.code(201);
    return { unit };
  });

  app.post("/operations/units/import", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const payload = unitImportSchema.parse(request.body);
    const property = await requireAccessibleProperty(request, reply, payload.propertyId);
    if (!property) return;

    const summary = { created: 0, updated: 0, skipped: 0, floorPlansCreated: 0, floorPlansUpdated: 0, errors: [] as string[] };
    const createdUnitIds: string[] = [];
    const updatedUnitIds: string[] = [];
    const seen = new Set<string>();
    const sanitizedRows = payload.units.flatMap((row, index) => {
      const number = row.number.trim();
      const key = number.toUpperCase();
      if (seen.has(key)) {
        summary.skipped += 1;
        summary.errors.push(`Row ${index + 1}: duplicate unit ${number} in import file`);
        return [];
      }
      seen.add(key);
      return [{ ...row, number }];
    });

    await prisma.$transaction(async (tx) => {
      const floorPlanCache = new Map<string, { id: string; code: string; name: string; bedrooms: number | null; bathrooms: number | null; squareFeet: number | null }>();
      const existingPlans = await tx.floorPlan.findMany({
        where: { propertyId: payload.propertyId },
        select: { id: true, code: true, name: true, bedrooms: true, bathrooms: true, squareFeet: true, isActive: true },
      });
      for (const plan of existingPlans) floorPlanCache.set(plan.code.trim().toUpperCase(), plan);

      const resolveImportedFloorPlan = async (row: (typeof sanitizedRows)[number]) => {
        const code = row.floorPlan?.trim();
        if (!code) return null;
        const key = code.toUpperCase();
        const cached = floorPlanCache.get(key);
        const metadata = {
          bedrooms: row.bedrooms ?? null,
          bathrooms: row.bathrooms ?? null,
          squareFeet: row.squareFeet ?? null,
        };
        if (cached) {
          const updateData: Prisma.FloorPlanUncheckedUpdateInput = {};
          if (cached.bedrooms === null && metadata.bedrooms !== null) updateData.bedrooms = metadata.bedrooms;
          if (cached.bathrooms === null && metadata.bathrooms !== null) updateData.bathrooms = metadata.bathrooms;
          if (cached.squareFeet === null && metadata.squareFeet !== null) updateData.squareFeet = metadata.squareFeet;
          if (Object.keys(updateData).length > 0) {
            const updated = await tx.floorPlan.update({
              where: { id: cached.id },
              data: updateData,
              select: { id: true, code: true, name: true, bedrooms: true, bathrooms: true, squareFeet: true },
            });
            floorPlanCache.set(key, updated);
            summary.floorPlansUpdated += 1;
            return updated;
          }
          return cached;
        }
        const created = await tx.floorPlan.create({
          data: { propertyId: payload.propertyId, code, name: code, ...metadata },
          select: { id: true, code: true, name: true, bedrooms: true, bathrooms: true, squareFeet: true },
        });
        floorPlanCache.set(key, created);
        summary.floorPlansCreated += 1;
        return created;
      };

      for (const row of sanitizedRows) {
        const existing = await tx.unit.findUnique({
          where: { propertyId_number: { propertyId: payload.propertyId, number: row.number } },
        });
        const importedPlan = await resolveImportedFloorPlan(row);
        const createData = {
          floorPlanId: importedPlan?.id ?? null,
          floorPlan: importedPlan?.code ?? row.floorPlan ?? null,
          squareFeet: importedPlan?.squareFeet ?? row.squareFeet ?? null,
          bedrooms: importedPlan?.bedrooms ?? row.bedrooms ?? null,
          bathrooms: importedPlan?.bathrooms ?? row.bathrooms ?? null,
          occupancyStatus: row.occupancyStatus ?? "OCCUPIED",
          building: row.building || null,
          area: row.area || null,
          floor: row.floor || null,
          isBudgeted: row.isBudgeted ?? true,
        };
        if (existing) {
          if (!payload.updateExisting) {
            summary.skipped += 1;
            continue;
          }
          const updateData: Prisma.UnitUncheckedUpdateInput = {};
          if (importedPlan) {
            updateData.floorPlanId = importedPlan.id;
            updateData.floorPlan = importedPlan.code;
            if (importedPlan.squareFeet !== null) updateData.squareFeet = importedPlan.squareFeet;
            if (importedPlan.bedrooms !== null) updateData.bedrooms = importedPlan.bedrooms;
            if (importedPlan.bathrooms !== null) updateData.bathrooms = importedPlan.bathrooms;
          } else if (Object.prototype.hasOwnProperty.call(row, "floorPlan") && row.floorPlan) {
            updateData.floorPlan = row.floorPlan;
          }
          if (!importedPlan && Object.prototype.hasOwnProperty.call(row, "squareFeet") && row.squareFeet !== null && row.squareFeet !== undefined) updateData.squareFeet = row.squareFeet;
          if (!importedPlan && Object.prototype.hasOwnProperty.call(row, "bedrooms") && row.bedrooms !== null && row.bedrooms !== undefined) updateData.bedrooms = row.bedrooms;
          if (!importedPlan && Object.prototype.hasOwnProperty.call(row, "bathrooms") && row.bathrooms !== null && row.bathrooms !== undefined) updateData.bathrooms = row.bathrooms;
          if (Object.prototype.hasOwnProperty.call(row, "occupancyStatus") && row.occupancyStatus) updateData.occupancyStatus = row.occupancyStatus;
          if (Object.prototype.hasOwnProperty.call(row, "building") && row.building) updateData.building = row.building;
          if (Object.prototype.hasOwnProperty.call(row, "area") && row.area) updateData.area = row.area;
          if (Object.prototype.hasOwnProperty.call(row, "floor") && row.floor) updateData.floor = row.floor;
          if (Object.prototype.hasOwnProperty.call(row, "isBudgeted") && row.isBudgeted !== undefined) updateData.isBudgeted = row.isBudgeted;
          if (Object.keys(updateData).length > 0) {
            await tx.unit.update({ where: { id: existing.id }, data: updateData });
          }
          summary.updated += 1;
          updatedUnitIds.push(existing.id);
        } else {
          const created = await tx.unit.create({ data: { ...createData, propertyId: payload.propertyId, number: row.number } });
          createdUnitIds.push(created.id);
          summary.created += 1;
        }
      }
    });

    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: property.id,
      entityType: "UNIT_DIRECTORY",
      action: "UNIT_DIRECTORY_IMPORTED",
      message: `Imported unit directory rows for ${property.code}: ${summary.created} created, ${summary.updated} updated, ${summary.skipped} skipped`,
      metadata: summary,
    });
    return {
      property: { id: property.id, code: property.code, name: property.name },
      summary,
      createdUnitIds,
      updatedUnitIds,
    };
  });

  app.post("/operations/availability/import", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const payload = availabilityImportSchema.parse(request.body);
    const property = await requireAccessibleProperty(request, reply, payload.propertyId);
    if (!property) return;

    const summary = {
      unitsCreated: 0,
      unitsUpdated: 0,
      turnsCreated: 0,
      turnsUpdated: 0,
      skipped: 0,
      floorPlansCreated: 0,
      floorPlansUpdated: 0,
      errors: [] as string[],
    };
    const createdItemIds: string[] = [];
    const updatedItemIds: string[] = [];
    const availabilityActivity: Array<{
      itemId: string;
      unitNumber: string;
      reportDate: string | null;
      sourceStatus: string | null;
      dateApplied: string | null;
      importNote: string | null;
      vacancyStatus: string;
    }> = [];
    const seen = new Set<string>();
    const sanitizedRows = payload.rows.flatMap((row, index) => {
      const number = row.number.trim();
      const key = number.toUpperCase();
      if (seen.has(key)) {
        summary.skipped += 1;
        summary.errors.push(`Row ${index + 1}: duplicate unit ${number} in availability import`);
        return [];
      }
      seen.add(key);
      return [{ ...row, number }];
    });

    const boardSections = await prisma.boardSection.findMany({
      where: { propertyId: payload.propertyId, isActive: true },
      select: { key: true, sectionType: true, sortOrder: true },
      orderBy: { sortOrder: "asc" },
    });
    const existingTurns = await prisma.makeReadyItem.findMany({
      where: {
        propertyId: payload.propertyId,
        isArchived: false,
        unitNumber: { in: sanitizedRows.map((row) => row.number) },
      },
      orderBy: [{ unitNumber: "asc" }, { updatedAt: "desc" }],
    });
    const existingTurnByUnit = new Map<string, (typeof existingTurns)[number]>();
    for (const turn of existingTurns) {
      const key = turn.unitNumber.toUpperCase();
      if (!existingTurnByUnit.has(key)) existingTurnByUnit.set(key, turn);
    }
    const preferredSectionKeyForStatus = (status: string) => {
      const readyStatus = (status.includes("READY") && !status.includes("NOT READY")) || status === "VACANT_READY" || status === "VACANT_LEASED";
      const sectionType = readyStatus ? "READY" : status === "DOWN" || status === "MODEL" ? "DOWN" : "MAKE_READY";
      return boardSections.find((section) => section.sectionType === sectionType)?.key ?? boardSections[0]?.key ?? "MAKE_READY";
    };
    const conflicts = sanitizedRows.flatMap((row) => {
      if (!payload.updateExisting) return [];
      const existingTurn = existingTurnByUnit.get(row.number.toUpperCase());
      if (!existingTurn) return [];
      const status = normalizeAvailabilityStatus(row);
      const projectedBoardGroup = preferredSectionKeyForStatus(status);
      const conflict = buildAvailabilityConflict(existingTurn, row, status, projectedBoardGroup);
      return conflict ? [conflict] : [];
    });

    if (conflicts.length > 0 && !payload.overrideConflicts) {
      reply.code(409);
      return {
        message: `Availability import found ${conflicts.length} board conflict${conflicts.length === 1 ? "" : "s"}. Review local-vs-report differences before overwriting.`,
        property: { id: property.id, code: property.code, name: property.name },
        conflicts,
      };
    }

    await prisma.$transaction(async (tx) => {
      const floorPlanCache = new Map<string, { id: string; code: string; name: string; bedrooms: number | null; bathrooms: number | null; squareFeet: number | null }>();
      const existingPlans = await tx.floorPlan.findMany({
        where: { propertyId: payload.propertyId },
        select: { id: true, code: true, name: true, bedrooms: true, bathrooms: true, squareFeet: true },
      });
      for (const plan of existingPlans) floorPlanCache.set(plan.code.trim().toUpperCase(), plan);

      const resolveImportedFloorPlan = async (row: (typeof sanitizedRows)[number]) => {
        const code = row.floorPlan?.trim();
        if (!code) return null;
        const key = code.toUpperCase();
        const cached = floorPlanCache.get(key);
        const metadata = {
          bedrooms: row.bedrooms ?? null,
          bathrooms: row.bathrooms ?? null,
          squareFeet: row.squareFeet ?? null,
        };
        if (cached) {
          const updateData: Prisma.FloorPlanUncheckedUpdateInput = {};
          if (cached.bedrooms === null && metadata.bedrooms !== null) updateData.bedrooms = metadata.bedrooms;
          if (cached.bathrooms === null && metadata.bathrooms !== null) updateData.bathrooms = metadata.bathrooms;
          if (cached.squareFeet === null && metadata.squareFeet !== null) updateData.squareFeet = metadata.squareFeet;
          if (Object.keys(updateData).length > 0) {
            const updated = await tx.floorPlan.update({
              where: { id: cached.id },
              data: updateData,
              select: { id: true, code: true, name: true, bedrooms: true, bathrooms: true, squareFeet: true },
            });
            floorPlanCache.set(key, updated);
            summary.floorPlansUpdated += 1;
            return updated;
          }
          return cached;
        }
        const created = await tx.floorPlan.create({
          data: { propertyId: payload.propertyId, code, name: code, ...metadata },
          select: { id: true, code: true, name: true, bedrooms: true, bathrooms: true, squareFeet: true },
        });
        floorPlanCache.set(key, created);
        summary.floorPlansCreated += 1;
        return created;
      };

      for (const row of sanitizedRows) {
        const status = normalizeAvailabilityStatus(row);
        const floorPlan = await resolveImportedFloorPlan(row);
        const existingUnit = await tx.unit.findUnique({
          where: { propertyId_number: { propertyId: payload.propertyId, number: row.number } },
        });
        const unitData = {
          floorPlanId: floorPlan?.id ?? null,
          floorPlan: floorPlan?.code ?? row.floorPlan ?? null,
          squareFeet: floorPlan?.squareFeet ?? row.squareFeet ?? null,
          bedrooms: floorPlan?.bedrooms ?? row.bedrooms ?? null,
          bathrooms: floorPlan?.bathrooms ?? row.bathrooms ?? null,
          occupancyStatus: status,
          building: row.building || null,
          area: row.area || null,
          floor: row.floor || null,
          isBudgeted: row.isBudgeted ?? true,
        };
        const unit = existingUnit
          ? await tx.unit.update({
              where: { id: existingUnit.id },
              data: {
                ...(floorPlan ? { floorPlanId: floorPlan.id, floorPlan: floorPlan.code } : row.floorPlan ? { floorPlan: row.floorPlan } : {}),
                ...(unitData.squareFeet !== null ? { squareFeet: unitData.squareFeet } : {}),
                ...(unitData.bedrooms !== null ? { bedrooms: unitData.bedrooms } : {}),
                ...(unitData.bathrooms !== null ? { bathrooms: unitData.bathrooms } : {}),
                occupancyStatus: status,
                ...(row.building ? { building: row.building } : {}),
                ...(row.area ? { area: row.area } : {}),
                ...(row.floor ? { floor: row.floor } : {}),
                ...(row.isBudgeted !== undefined ? { isBudgeted: row.isBudgeted } : {}),
              },
            })
          : await tx.unit.create({ data: { propertyId: payload.propertyId, number: row.number, ...unitData } });
        if (existingUnit) summary.unitsUpdated += 1;
        else summary.unitsCreated += 1;

        if (!payload.createTurns || status === "OCCUPIED" || status === "UNKNOWN") continue;

        const boardGroup = await preferredSectionKey(tx, payload.propertyId, status);
        const existingTurn = await tx.makeReadyItem.findFirst({
          where: {
            propertyId: payload.propertyId,
            isArchived: false,
            OR: [{ unitId: unit.id }, { unitNumber: row.number }],
          },
          orderBy: { updatedAt: "desc" },
        });
        const parsedMoveOutDate = parseOptionalDate(row.moveOutDate);
        const parsedVacatedDate = parseOptionalDate(row.vacatedDate);
        const noticeStatus = status === "NTV" || status === "NTV_LEASED" || status === "NTV NOT LEASED" || status === "NTV LEASED";
        const sourceDetails = {
          reportDate: row.reportDate ?? null,
          sourceStatus: row.availabilityStatus ?? null,
          dateApplied: row.dateApplied ?? null,
          importNote: row.notes ?? null,
          vacancyStatus: status,
        };
        const createTurnData = {
          unitId: unit.id,
          boardGroup,
          itemName: row.number,
          unitNumber: row.number,
          floorPlan: floorPlan?.code ?? row.floorPlan ?? unit.floorPlan,
          vacancyStatus: status === "MODEL" ? "VACANT NOT LEASED NOT READY" : status,
          applicant: row.applicant ?? null,
          moveOutDate: noticeStatus ? parsedMoveOutDate : null,
          vacatedDate: parsedVacatedDate ?? (!noticeStatus ? parsedMoveOutDate : null),
          makeReadyDate: parseOptionalDate(row.makeReadyDate),
          moveInDate: parseOptionalDate(row.moveInDate),
          makeReadyStatus: row.makeReadyStatus ?? (status === "VACANT_READY" || status === "VACANT NOT LEASED READY" || status === "VACANT LEASED READY" ? "DONE" : null),
          scopeLevel: row.scopeLevel ?? null,
          notes: null,
        };
        const createDerived = {
          ...computeDerivedFields(createTurnData),
          ...(row.daysVacant !== undefined ? { daysVacant: row.daysVacant } : {}),
        };
        if (existingTurn) {
          if (!payload.updateExisting) {
            summary.skipped += 1;
            continue;
          }
          const cleanedNotes = stripAvailabilityImportNotes(existingTurn.notes);
          const updateTurnData = {
            unitId: unit.id,
            boardGroup,
            itemName: row.number,
            unitNumber: row.number,
            floorPlan: floorPlan?.code ?? row.floorPlan ?? existingTurn.floorPlan ?? unit.floorPlan,
            vacancyStatus: status === "MODEL" ? "VACANT NOT LEASED NOT READY" : status,
            applicant: row.applicant !== undefined ? row.applicant ?? null : existingTurn.applicant,
            moveOutDate: row.moveOutDate !== undefined ? (noticeStatus ? parsedMoveOutDate : null) : existingTurn.moveOutDate,
            vacatedDate: row.vacatedDate !== undefined || row.moveOutDate !== undefined
              ? parsedVacatedDate ?? (!noticeStatus ? parsedMoveOutDate : null)
              : existingTurn.vacatedDate,
            makeReadyDate: row.makeReadyDate !== undefined ? parseOptionalDate(row.makeReadyDate) : existingTurn.makeReadyDate,
            moveInDate: row.moveInDate !== undefined ? parseOptionalDate(row.moveInDate) : existingTurn.moveInDate,
            makeReadyStatus: row.makeReadyStatus !== undefined
              ? row.makeReadyStatus
              : existingTurn.makeReadyStatus ?? (status === "VACANT_READY" || status === "VACANT NOT LEASED READY" || status === "VACANT LEASED READY" ? "DONE" : null),
            scopeLevel: row.scopeLevel !== undefined ? row.scopeLevel : existingTurn.scopeLevel,
            notes: cleanedNotes,
          };
          const updateDerived = {
            ...computeDerivedFields(updateTurnData),
            ...(row.daysVacant !== undefined ? { daysVacant: row.daysVacant } : {}),
          };
          const updated = await tx.makeReadyItem.update({
            where: { id: existingTurn.id },
            data: { ...updateTurnData, ...updateDerived },
          });
          updatedItemIds.push(updated.id);
          availabilityActivity.push({ itemId: updated.id, unitNumber: row.number, ...sourceDetails });
          summary.turnsUpdated += 1;
        } else {
          const created = await tx.makeReadyItem.create({
            data: { propertyId: payload.propertyId, ...createTurnData, ...createDerived },
          });
          createdItemIds.push(created.id);
          availabilityActivity.push({ itemId: created.id, unitNumber: row.number, ...sourceDetails });
          summary.turnsCreated += 1;
        }
      }
    });

    for (const itemId of [...createdItemIds, ...updatedItemIds]) {
      await evaluateAndPersistItemRisk(itemId, { notify: true });
    }

    for (const entry of availabilityActivity) {
      const detail = [
        entry.reportDate ? `report ${entry.reportDate}` : null,
        entry.sourceStatus ? `source ${entry.sourceStatus}` : null,
      ].filter(Boolean).join(" / ");
      await writeAuditLog({
        request,
        actorUserId: request.currentUser!.id,
        propertyId: property.id,
        entityType: "MAKE_READY_ITEM",
        entityId: entry.itemId,
        action: "AVAILABILITY_SYNCED",
        message: `Availability import updated ${entry.unitNumber}${detail ? ` (${detail})` : ""}`,
        metadata: entry,
      });
    }

    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: property.id,
      entityType: "AVAILABILITY_IMPORT",
      action: "AVAILABILITY_IMPORTED",
      message: `Imported availability rows for ${property.code}: ${summary.turnsCreated} turns created, ${summary.turnsUpdated} turns updated`,
      metadata: summary,
    });
    return {
      property: { id: property.id, code: property.code, name: property.name },
      summary,
      createdItemIds,
      updatedItemIds,
    };
  });

  app.post("/operations/units/import/revert", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const payload = unitImportRevertSchema.parse(request.body);
    const property = await requireAccessibleProperty(request, reply, payload.propertyId);
    if (!property) return;

    const candidateUnits = await prisma.unit.findMany({
      where: { id: { in: payload.createdUnitIds }, propertyId: payload.propertyId },
      select: {
        id: true,
        number: true,
        _count: { select: { makeReadyItems: true, mapLocations: true } },
      },
    });
    const safeIds = candidateUnits
      .filter((unit) => unit._count.makeReadyItems === 0 && unit._count.mapLocations === 0)
      .map((unit) => unit.id);
    const blocked = candidateUnits
      .filter((unit) => unit._count.makeReadyItems > 0 || unit._count.mapLocations > 0)
      .map((unit) => unit.number);

    const deleted = safeIds.length
      ? await prisma.unit.deleteMany({ where: { id: { in: safeIds }, propertyId: payload.propertyId } })
      : { count: 0 };

    const summary = {
      deleted: deleted.count,
      skipped: payload.createdUnitIds.length - deleted.count,
      blocked,
    };
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: property.id,
      entityType: "UNIT_DIRECTORY",
      action: "UNIT_DIRECTORY_IMPORT_REVERTED",
      message: `Reverted unit directory import for ${property.code}: ${summary.deleted} deleted, ${summary.skipped} skipped`,
      metadata: summary,
    });
    return { summary };
  });

  app.patch("/operations/units/:id", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const payload = unitPatchSchema.parse(request.body);
    const existing = await prisma.unit.findUnique({ where: { id }, include: { property: true } });
    if (!existing) {
      reply.code(404);
      return { message: "Unit not found" };
    }
    if (!canAccessProperty(request, existing.propertyId)) {
      reply.code(403);
      return { message: "Property access denied" };
    }
    const propertyId = payload.propertyId ?? existing.propertyId;
    const property = await requireAccessibleProperty(request, reply, propertyId);
    if (!property) return;
    const normalizedPayload = await normalizeUnitFloorPlan(
      request,
      reply,
      { ...payload, propertyId, number: payload.number ?? existing.number },
      propertyId,
    );
    if (!normalizedPayload) return;
    if (payload.number || payload.propertyId) {
      const duplicate = await prisma.unit.findUnique({
        where: { propertyId_number: { propertyId, number: payload.number ?? existing.number } },
      });
      if (duplicate && duplicate.id !== existing.id) {
        reply.code(409);
        return { message: "That unit already exists at the selected property" };
      }
    }
    const unit = await prisma.$transaction(async (tx) => {
      const updated = await tx.unit.update({
        where: { id },
        data: {
          ...payload,
          floorPlanId: normalizedPayload.floorPlanId,
          floorPlan: normalizedPayload.floorPlan,
          squareFeet: normalizedPayload.squareFeet,
          bedrooms: "bedrooms" in normalizedPayload ? normalizedPayload.bedrooms : undefined,
          bathrooms: "bathrooms" in normalizedPayload ? normalizedPayload.bathrooms : undefined,
        },
        include: { property: true, floorPlanRecord: true },
      });
      if (payload.floorPlanId) {
        await tx.makeReadyItem.updateMany({
          where: { unitId: id },
          data: { floorPlan: updated.floorPlan },
        });
      }
      return updated;
    });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: unit.propertyId,
      entityType: "UNIT",
      entityId: unit.id,
      action: "UNIT_UPDATED",
      message: `Updated unit ${unit.number}`,
      metadata: { previousPropertyId: existing.propertyId, previousNumber: existing.number },
    });
    return { unit };
  });

  app.post("/operations/units/:id/archive", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.unit.findUnique({ where: { id }, include: { property: true } });
    if (!existing) {
      reply.code(404);
      return { message: "Unit not found" };
    }
    if (!canAccessProperty(request, existing.propertyId)) {
      reply.code(403);
      return { message: "Property access denied" };
    }
    const unit = await prisma.unit.update({ where: { id }, data: { isActive: false }, include: { property: true } });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: unit.propertyId,
      entityType: "UNIT",
      entityId: unit.id,
      action: "UNIT_ARCHIVED",
      message: `Archived unit ${unit.number}`,
    });
    return { unit };
  });

  app.post("/operations/units/:id/restore", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.unit.findUnique({ where: { id }, include: { property: true } });
    if (!existing || !(await requireAccessibleProperty(request, reply, existing.propertyId))) return;
    const unit = await prisma.unit.update({ where: { id }, data: { isActive: true }, include: { property: true } });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: unit.propertyId,
      entityType: "UNIT",
      entityId: unit.id,
      action: "UNIT_RESTORED",
      message: `Restored unit ${unit.number}`,
    });
    return { unit };
  });

  app.delete("/operations/units/:id", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.unit.findUnique({ where: { id } });
    if (!existing) {
      reply.code(404);
      return { message: "Unit not found" };
    }
    if (!canAccessProperty(request, existing.propertyId)) {
      reply.code(403);
      return { message: "Property access denied" };
    }
    if (existing.isActive) {
      reply.code(409);
      return { message: "Archive the unit before deletion" };
    }
    const linkedItems = await prisma.makeReadyItem.count({ where: { unitId: id } });
    if (linkedItems > 0) {
      reply.code(409);
      return { message: "Unit retains make-ready history and cannot be deleted safely" };
    }
    await prisma.unit.delete({ where: { id } });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: existing.propertyId,
      entityType: "UNIT",
      entityId: id,
      action: "UNIT_DELETED",
      message: `Deleted archived unit ${existing.number}`,
    });
    return { ok: true };
  });

  app.get("/operations/options", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const options = await prisma.labelDefinition.findMany({
      orderBy: [{ fieldKey: "asc" }, { sortOrder: "asc" }, { value: "asc" }],
    });
    return { options: options.filter((option) => managedOptionFields.has(option.fieldKey)) };
  });

  app.post("/operations/options", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const payload = boardOptionInputSchema.parse(request.body);
    if (!managedOptionFields.has(payload.fieldKey)) {
      reply.code(400);
      return { message: "Unsupported built-in option set" };
    }
    const duplicate = await prisma.labelDefinition.findUnique({ where: { fieldKey_value: { fieldKey: payload.fieldKey, value: payload.value } } });
    if (duplicate) {
      reply.code(409);
      return { message: "That option already exists in the selected set" };
    }
    const sortOrder = await prisma.labelDefinition.count({ where: { fieldKey: payload.fieldKey } });
    const option = await prisma.labelDefinition.create({ data: { ...payload, sortOrder } });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      entityType: "BOARD_OPTION",
      entityId: option.id,
      action: "BOARD_OPTION_CREATED",
      message: `Created ${option.fieldKey} option ${option.value}`,
    });
    reply.code(201);
    return { option };
  });

  app.patch("/operations/options/:id", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const payload = boardOptionPatchSchema.parse(request.body);
    const existing = await prisma.labelDefinition.findUnique({ where: { id } });
    if (!existing || !managedOptionFields.has(existing.fieldKey)) {
      reply.code(404);
      return { message: "Board option not found" };
    }
    const dataField = existing.fieldKey as keyof Prisma.MakeReadyItemUpdateManyMutationInput;
    const option = await prisma.$transaction(async (tx) => {
      const updated = await tx.labelDefinition.update({ where: { id }, data: payload });
      if (payload.value && payload.value !== existing.value && builtInColumnKeys.has(existing.fieldKey)) {
        await tx.makeReadyItem.updateMany({
          where: { [existing.fieldKey]: existing.value },
          data: { [dataField]: payload.value },
        });
      }
      return updated;
    });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      entityType: "BOARD_OPTION",
      entityId: option.id,
      action: "BOARD_OPTION_UPDATED",
      message: `Updated ${option.fieldKey} option ${option.value}`,
      metadata: { previousValue: existing.value },
    });
    return { option };
  });

  app.put("/operations/options/reorder", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const payload = reorderOptionsSchema.parse(request.body);
    const options = await prisma.labelDefinition.findMany({ where: { id: { in: payload.ids } } });
    if (options.length !== payload.ids.length || new Set(options.map((option) => option.fieldKey)).size !== 1) {
      reply.code(400);
      return { message: "Options must belong to one built-in option set" };
    }
    await prisma.$transaction(payload.ids.map((id, index) => prisma.labelDefinition.update({ where: { id }, data: { sortOrder: index } })));
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      entityType: "BOARD_OPTION_SET",
      entityId: options[0]?.fieldKey,
      action: "BOARD_OPTIONS_REORDERED",
      message: `Reordered ${options[0]?.fieldKey} options`,
    });
    return { ok: true };
  });

  app.post("/operations/options/:id/archive", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.labelDefinition.findUnique({ where: { id } });
    if (!existing || !managedOptionFields.has(existing.fieldKey)) {
      reply.code(404);
      return { message: "Board option not found" };
    }
    const option = await prisma.labelDefinition.update({ where: { id }, data: { isArchived: true } });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      entityType: "BOARD_OPTION",
      entityId: option.id,
      action: "BOARD_OPTION_ARCHIVED",
      message: `Archived ${option.fieldKey} option ${option.value}`,
    });
    return { option };
  });

  app.post("/operations/options/:id/restore", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const option = await prisma.labelDefinition.update({ where: { id }, data: { isArchived: false } });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      entityType: "BOARD_OPTION",
      entityId: option.id,
      action: "BOARD_OPTION_RESTORED",
      message: `Restored ${option.fieldKey} option ${option.value}`,
    });
    return { option };
  });

  app.delete("/operations/options/:id", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    reply.code(409);
    return { message: "Board options are retained for history; archive the option instead of deleting it" };
  });

  app.get("/operations/floor-plans", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const query = operationsQuerySchema.parse(request.query);
    if (query.propertyId && !canAccessProperty(request, query.propertyId)) {
      reply.code(403);
      return { message: "Property access denied" };
    }
    const propertyIds = allowedPropertyIds(request.currentUser!);
    const floorPlans = await prisma.floorPlan.findMany({
      where: {
        propertyId: query.propertyId ?? (propertyIds === null ? undefined : { in: propertyIds }),
        isActive: query.includeArchived ? undefined : true,
      },
      include: { property: true, _count: { select: { units: true } } },
      orderBy: [{ propertyId: "asc" }, { isActive: "desc" }, { code: "asc" }],
    });
    return { floorPlans };
  });

  app.post("/operations/floor-plans", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const payload = floorPlanCreateSchema.parse(request.body);
    const property = await requireAccessibleProperty(request, reply, payload.propertyId);
    if (!property) return;
    const code = payload.code?.trim() || payload.name.trim();
    const existing = await prisma.floorPlan.findUnique({ where: { propertyId_code: { propertyId: payload.propertyId, code } } });
    if (existing) {
      reply.code(409);
      return { message: "That floor plan code already exists at the selected property" };
    }
    const floorPlan = await prisma.floorPlan.create({ data: { ...payload, code }, include: { property: true } });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: floorPlan.propertyId,
      entityType: "FLOOR_PLAN",
      entityId: floorPlan.id,
      action: "FLOOR_PLAN_CREATED",
      message: `Created floor plan ${floorPlan.name} at ${property.code}`,
    });
    reply.code(201);
    return { floorPlan };
  });

  app.patch("/operations/floor-plans/:id", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const payload = floorPlanPatchSchema.parse(request.body);
    const existing = await prisma.floorPlan.findUnique({ where: { id } });
    if (!existing || !canAccessProperty(request, existing.propertyId)) {
      reply.code(existing ? 403 : 404);
      return { message: existing ? "Property access denied" : "Floor plan not found" };
    }
    const propertyId = payload.propertyId ?? existing.propertyId;
    if (!(await requireAccessibleProperty(request, reply, propertyId))) return;
    const nextCode = payload.code?.trim() || existing.code;
    if (payload.code || payload.propertyId) {
      const duplicate = await prisma.floorPlan.findUnique({ where: { propertyId_code: { propertyId, code: nextCode } } });
      if (duplicate && duplicate.id !== existing.id) {
        reply.code(409);
        return { message: "That floor plan code already exists at the selected property" };
      }
    }
    const floorPlan = await prisma.$transaction(async (tx) => {
      const updated = await tx.floorPlan.update({ where: { id }, data: payload, include: { property: true } });
      await tx.unit.updateMany({
        where: { floorPlanId: id },
        data: {
          floorPlan: updated.code,
          bedrooms: updated.bedrooms,
          bathrooms: updated.bathrooms,
          squareFeet: updated.squareFeet,
        },
      });
      await tx.makeReadyItem.updateMany({
        where: { unit: { floorPlanId: id } },
        data: { floorPlan: updated.code },
      });
      return updated;
    });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: floorPlan.propertyId,
      entityType: "FLOOR_PLAN",
      entityId: floorPlan.id,
      action: "FLOOR_PLAN_UPDATED",
      message: `Updated floor plan ${floorPlan.name}`,
    });
    return { floorPlan };
  });

  for (const operation of ["archive", "restore"] as const) {
    app.post(`/operations/floor-plans/:id/${operation}`, async (request, reply) => {
      if (!(await ensureManagerOrAdmin(request, reply))) return;
      const { id } = z.object({ id: z.string() }).parse(request.params);
      const existing = await prisma.floorPlan.findUnique({ where: { id } });
      if (!existing || !canAccessProperty(request, existing.propertyId)) {
        reply.code(existing ? 403 : 404);
        return { message: existing ? "Property access denied" : "Floor plan not found" };
      }
      const floorPlan = await prisma.floorPlan.update({ where: { id }, data: { isActive: operation === "restore" } });
      await writeAuditLog({
        request,
        actorUserId: request.currentUser!.id,
        propertyId: existing.propertyId,
        entityType: "FLOOR_PLAN",
        entityId: id,
        action: `FLOOR_PLAN_${operation.toUpperCase()}D`,
        message: `${operation === "restore" ? "Restored" : "Archived"} floor plan ${existing.name}`,
      });
      return { floorPlan };
    });
  }

  app.delete("/operations/floor-plans/:id", async (request, reply) => {
    if (!(await ensureManagerOrAdmin(request, reply))) return;
    reply.code(409);
    return { message: "Floor plans are retained for history; archive the floor plan instead of deleting it" };
  });
}
