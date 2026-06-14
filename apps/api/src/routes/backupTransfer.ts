import { CustomFieldType, Prisma } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../lib/auth.js";
import { writeAuditLog } from "../lib/audit.js";
import { prisma } from "../lib/prisma.js";

const backupFormat = "makereadyos.backup";
const backupVersion = 1;
const supportedScheduleColorBases = ["STATUS", "SCOPE", "FIELD", "FIXED", "NEUTRAL"] as const;

const propertySchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  occupancyGoalPercent: z.number().nullable().optional().default(null),
  uploadStorageMode: z.enum(["DEFAULT", "PROPERTY_SUBDIR"]).optional().default("DEFAULT"),
  uploadSubdir: z.string().nullable().optional().default(null),
  isActive: z.boolean().default(true),
});

const floorPlanSchema = z.object({
  propertyCode: z.string().min(1),
  code: z.string().min(1).optional(),
  name: z.string().min(1),
  bedrooms: z.number().int().nullable(),
  bathrooms: z.number().nullable(),
  squareFeet: z.number().int().nullable(),
  description: z.string().nullable(),
  isActive: z.boolean(),
});

const boardOptionSchema = z.object({
  fieldKey: z.string().min(1),
  value: z.string(),
  color: z.string(),
  textColor: z.string(),
  sortOrder: z.number().int(),
  isArchived: z.boolean(),
});

const boardColumnSchema = z.object({
  fieldKey: z.string().min(1),
  label: z.string().min(1),
});
const boardSectionSchema = z.object({
  propertyCode: z.string().min(1),
  key: z.string().min(1),
  sectionType: z.enum(["READY", "MAKE_READY", "DOWN", "ARCHIVE"]),
  displayName: z.string().min(1),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
});

const scheduleTrackSchema = z.object({
  sourceField: z.string().min(1),
  displayName: z.string().min(1),
  colorBasis: z.enum(supportedScheduleColorBases),
  colorSourceField: z.string().nullable().optional().default(null),
  fixedColor: z.string().nullable(),
  groupingMode: z.enum(["NONE", "PROPERTY", "BOARD_GROUP"]).optional().default("NONE"),
  visibilityFilter: z.object({
    boardGroups: z.array(z.string()).optional(),
    statusValues: z.array(z.string()).optional(),
  }).nullable().optional().default(null),
  overdueEnabled: z.boolean().optional().default(true),
  moveInSoonEnabled: z.boolean().optional().default(true),
  isEnabled: z.boolean(),
  isArchived: z.boolean().optional().default(false),
  sortOrder: z.number().int(),
});

const operatingCalendarSchema = z.object({
  propertyCode: z.string().min(1),
  name: z.string().min(1),
  timezone: z.string().min(1),
  noWeekendScheduling: z.boolean(),
  avoidMondayScheduling: z.boolean(),
  avoidFridayScheduling: z.boolean(),
  maintenanceStartMinute: z.number().int(),
  maintenanceEndMinute: z.number().int(),
  vendorLeadDays: z.number().int(),
  dailyScheduledUnitLimit: z.number().int().nullable(),
  scopeDay: z.number().int().nullable(),
  workStartDay: z.number().int().nullable(),
  autoPopulateEnabled: z.boolean(),
  notes: z.string().nullable(),
});

const unitSchema = z.object({
  propertyCode: z.string().min(1),
  number: z.string().min(1),
  floorPlanCode: z.string().nullable().optional().default(null),
  floorPlanName: z.string().nullable().optional().default(null),
  floorPlan: z.string().nullable(),
  squareFeet: z.number().int().nullable(),
  bedrooms: z.number().int().nullable(),
  bathrooms: z.number().nullable(),
  isActive: z.boolean(),
});

const nullableDate = z.string().datetime().nullable();
const makeReadyItemSchema = z.object({
  portableKey: z.string().min(1),
  propertyCode: z.string().min(1),
  unitNumber: z.string().nullable(),
  boardGroup: z.string().min(1),
  itemName: z.string().min(1),
  floorPlan: z.string().nullable(),
  applicant: z.string().nullable(),
  assignedTech: z.string().nullable(),
  scopeLevel: z.string().nullable(),
  status: z.string(),
  vacancyStatus: z.string().nullable(),
  moveOutDate: nullableDate,
  vacatedDate: nullableDate,
  makeReadyDate: nullableDate,
  moveInDate: nullableDate,
  daysVacant: z.number().int(),
  daysUntilMoveIn: z.number().int().nullable(),
  priority: z.number().int(),
  overdue: z.boolean(),
  moveInSoon: z.boolean(),
  riskScore: z.number().int().optional().default(0),
  riskLevel: z.string().optional().default("NONE"),
  riskReasons: z.unknown().optional().default([]),
  lastRiskEvaluatedAt: nullableDate.optional().default(null),
  completionStatus: z.string().nullable(),
  sheetrockStatus: z.string().nullable(),
  pestStatus: z.string().nullable(),
  pestTreated: z.string().nullable(),
  trashOutStatus: z.string().nullable(),
  floorsStatus: z.string().nullable(),
  flooringDate: nullableDate,
  makeReadyStatus: z.string().nullable(),
  cleaningStatus: z.string().nullable(),
  keysMadeStatus: z.string().nullable(),
  cabinetsStatus: z.string().nullable(),
  countertopsStatus: z.string().nullable(),
  appliancesStatus: z.string().nullable(),
  paintStatus: z.string().nullable(),
  doorsStatus: z.string().nullable(),
  newDoorCode: z.string().nullable(),
  notes: z.string().nullable(),
  isArchived: z.boolean().default(false),
  archivedAt: nullableDate.optional().default(null),
});

const customFieldSchema = z.object({
  fieldKey: z.string().min(1),
  module: z.string(),
  label: z.string(),
  fieldType: z.nativeEnum(CustomFieldType),
  description: z.string().nullable(),
  sortOrder: z.number().int(),
  isArchived: z.boolean(),
});

const customFieldOptionSchema = z.object({
  fieldKey: z.string().min(1),
  label: z.string().min(1),
  color: z.string(),
  sortOrder: z.number().int(),
  isArchived: z.boolean(),
});

const customFieldValueSchema = z.object({
  fieldKey: z.string().min(1),
  itemKey: z.string().min(1),
  value: z.unknown(),
});

const savedViewSchema = z.object({
  name: z.string().min(1),
  module: z.string(),
  viewType: z.string(),
  filters: z.unknown(),
  sorts: z.unknown().nullable(),
  grouping: z.unknown().nullable(),
  visibleColumns: z.array(z.string()).nullable(),
  isShared: z.literal(true),
  isDefault: z.boolean(),
});

const automationRuleSchema = z.object({
  templateId: z.string().nullable().optional(),
  name: z.string().min(1),
  description: z.string().nullable(),
  propertyCode: z.string().nullable().default(null),
  triggerType: z.string(),
  enabled: z.boolean(),
  isArchived: z.boolean().default(false),
  conditions: z.unknown(),
  actions: z.unknown(),
});

const checklistTemplateSchema = z.object({
  propertyCode: z.string().nullable(),
  name: z.string().min(1),
  scope: z.string().nullable(),
  items: z.array(z.object({
    label: z.string().min(1),
    notes: z.string().nullable().optional().default(null),
    sortOrder: z.number().int(),
    required: z.boolean(),
    dueOffsetDays: z.number().int().nullable().optional().default(null),
    tradeCategory: z.string().nullable().optional().default(null),
  })),
});

const chargePriceSheetItemSchema = z.object({
  propertyCode: z.string().min(1),
  name: z.string().min(1),
  category: z.string().nullable().optional().default(null),
  unitLabel: z.string().nullable().optional().default(null),
  defaultCents: z.number().int().nullable().optional().default(null),
  description: z.string().nullable().optional().default(null),
  isActive: z.boolean().optional().default(true),
  isArchived: z.boolean().optional().default(false),
  sortOrder: z.number().int().optional().default(0),
});

const itemCommentSchema = z.object({
  itemKey: z.string().min(1),
  authorName: z.string().min(1),
  body: z.string(),
  category: z.string(),
  createdAt: z.string().datetime(),
  editedAt: z.string().datetime().nullable(),
});

const vendorSchema = z.object({
  name: z.string().min(1),
  trade: z.string().min(1),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  notes: z.string().nullable(),
  isActive: z.boolean(),
  isPreferred: z.boolean(),
  insuranceExpiresAt: nullableDate.optional().default(null),
  licenseExpiresAt: nullableDate.optional().default(null),
  propertyCodes: z.array(z.string()).default([]),
});

const vendorAssignmentSchema = z.object({
  vendorName: z.string().min(1),
  vendorTrade: z.string().min(1),
  itemKey: z.string().min(1),
  propertyCode: z.string().min(1),
  trade: z.string().min(1),
  status: z.string(),
  scheduledDate: nullableDate.optional().default(null),
  dueDate: nullableDate.optional().default(null),
  completedAt: nullableDate.optional().default(null),
  notes: z.string().nullable(),
  costEstimate: z.number().nullable(),
  invoiceRef: z.string().nullable(),
});

const propertyMapSchema = z.object({
  propertyCode: z.string().min(1),
  name: z.string().min(1),
  originalName: z.string().nullable().optional().default(null),
  mimeType: z.string().nullable().optional().default(null),
  sizeBytes: z.number().int().nullable().optional().default(null),
  width: z.number().int().nullable().optional().default(null),
  height: z.number().int().nullable().optional().default(null),
  notes: z.string().nullable().optional().default(null),
  isActive: z.boolean(),
  isArchived: z.boolean().optional().default(false),
});

const propertyMapAreaSchema = z.object({
  propertyCode: z.string().min(1),
  mapName: z.string().min(1),
  name: z.string().min(1),
  areaType: z.string().min(1).default("BUILDING"),
  xPercent: z.number().min(0).max(100),
  yPercent: z.number().min(0).max(100),
  widthPercent: z.number().min(0).max(100).nullable().optional().default(null),
  heightPercent: z.number().min(0).max(100).nullable().optional().default(null),
  color: z.string().nullable().optional().default(null),
  expectedUnitCount: z.number().int().nullable().optional().default(null),
  notes: z.string().nullable().optional().default(null),
  isActive: z.boolean(),
  isArchived: z.boolean().optional().default(false),
});

const unitMapLocationSchema = z.object({
  propertyCode: z.string().min(1),
  mapName: z.string().min(1),
  unitNumber: z.string().min(1),
  xPercent: z.number().min(0).max(100),
  yPercent: z.number().min(0).max(100),
  labelXPercent: z.number().min(0).max(100).nullable().optional().default(null),
  labelYPercent: z.number().min(0).max(100).nullable().optional().default(null),
  building: z.string().nullable().optional().default(null),
  area: z.string().nullable().optional().default(null),
  floor: z.string().nullable().optional().default(null),
  isActive: z.boolean(),
  isArchived: z.boolean().optional().default(false),
});

const checklistInstanceSchema = z.object({
  itemKey: z.string().min(1),
  templateName: z.string().nullable(),
  name: z.string().min(1),
  items: z.array(z.object({
    title: z.string().min(1),
    notes: z.string().nullable(),
    sortOrder: z.number().int(),
    required: z.boolean(),
    dueOffsetDays: z.number().int().nullable(),
    tradeCategory: z.string().nullable(),
    completed: z.boolean(),
    completedAt: z.string().datetime().nullable(),
  })),
});

const propertyNoteSchema = z.object({
  propertyCode: z.string().min(1),
  title: z.string().min(1),
  body: z.string(),
  noteType: z.string(),
});

const propertyRiskPolicySchema = z.object({
  propertyCode: z.string().min(1),
  moveInCriticalDays: z.number().int(),
  moveInHighDays: z.number().int(),
  moveInMediumDays: z.number().int(),
  unassignedHighDays: z.number().int(),
  staleActivityDays: z.number().int(),
  agingMediumDays: z.number().int(),
  agingHighDays: z.number().int(),
  vendorNearMoveInDays: z.number().int(),
  checklistNearMoveInDays: z.number().int(),
  planningNearMoveInDays: z.number().int(),
});

const propertyTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable(),
  category: z.string().nullable(),
  version: z.number().int(),
  notes: z.string().nullable(),
  sourcePropertyCode: z.string().nullable(),
  includeConfig: z.unknown(),
  manifest: z.unknown(),
  isArchived: z.boolean().default(false),
});

const refrigerantTypeSchema = z.object({
  name: z.string().min(1),
  notes: z.string().nullable().optional().default(null),
  isActive: z.boolean().optional().default(true),
});

const refrigerantCylinderSchema = z.object({
  identifier: z.string().min(1),
  refrigerantTypeName: z.string().min(1),
  category: z.enum(["VIRGIN", "CLEAN_RECOVERY", "DIRTY_RECOVERY"]),
  tankSize: z.number(),
  currentWeight: z.number(),
  status: z.enum(["ACTIVE", "EMPTY_PENDING_RECOVERY", "ARCHIVED"]),
  notes: z.string().nullable().optional().default(null),
  dispositionNotes: z.string().nullable().optional().default(null),
  finalRecoveryCompleted: z.boolean().optional().default(false),
  archivedAt: nullableDate.optional().default(null),
});

const refrigerantTransactionSchema = z.object({
  transactionType: z.enum(["VIRGIN_CHARGE", "CLEAN_RECOVERY", "DIRTY_RECOVERY", "FINAL_RECOVERY"]),
  propertyCode: z.string().nullable().optional().default(null),
  unitNumber: z.string().nullable().optional().default(null),
  refrigerantTypeName: z.string().min(1),
  sourceCylinderIdentifier: z.string().nullable().optional().default(null),
  recoveryCylinderIdentifier: z.string().nullable().optional().default(null),
  occurredAt: z.string().datetime(),
  startWeight: z.number(),
  endWeight: z.number(),
  amount: z.number(),
  notes: z.string().nullable().optional().default(null),
  createdByName: z.string().nullable().optional().default(null),
});

const refrigerantLeakFlagSchema = z.object({
  propertyCode: z.string().nullable().optional().default(null),
  unitNumber: z.string().min(1),
  refrigerantTypeName: z.string().nullable().optional().default(null),
  level: z.string().min(1),
  reason: z.string().min(1),
  status: z.string().min(1),
  lastDetectedAt: z.string().datetime(),
  dismissedAt: nullableDate.optional().default(null),
  dismissalNotes: z.string().nullable().optional().default(null),
});

const poolFacilityBackupSchema = z.object({
  propertyCode: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  capacityGallons: z.number().nullable().optional().default(null),
  surfaceType: z.string().nullable().optional().default(null),
  notes: z.string().nullable().optional().default(null),
  isActive: z.boolean().optional().default(true),
});

const poolChemicalBackupSchema = z.object({
  propertyCode: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  concentrationPercent: z.number().nullable().optional().default(null),
  unit: z.string().min(1),
  notes: z.string().nullable().optional().default(null),
  isActive: z.boolean().optional().default(true),
});

const poolChemistryTargetBackupSchema = z.object({
  propertyCode: z.string().nullable().optional().default(null),
  facilityType: z.string().min(1),
  phMin: z.number(),
  phMax: z.number(),
  freeChlorineMin: z.number(),
  freeChlorineMax: z.number(),
  combinedChlorineMax: z.number(),
  totalAlkalinityMin: z.number(),
  totalAlkalinityMax: z.number(),
  cyaMin: z.number(),
  cyaMax: z.number(),
  calciumHardnessMin: z.number(),
  calciumHardnessMax: z.number(),
});

const poolLogEntryBackupSchema = z.object({
  propertyCode: z.string().min(1),
  facilityName: z.string().min(1),
  technicianName: z.string().nullable().optional().default(null),
  logDate: z.string().datetime(),
  logTime: z.string().nullable().optional().default(null),
  ph: z.number().nullable().optional().default(null),
  freeChlorine: z.number().nullable().optional().default(null),
  combinedChlorine: z.number().nullable().optional().default(null),
  totalChlorine: z.number().nullable().optional().default(null),
  totalAlkalinity: z.number().nullable().optional().default(null),
  cyanuricAcid: z.number().nullable().optional().default(null),
  calciumHardness: z.number().nullable().optional().default(null),
  waterTemperature: z.number().nullable().optional().default(null),
  vacuumed: z.boolean().optional().default(false),
  backwashed: z.boolean().optional().default(false),
  skimmerCleaned: z.boolean().optional().default(false),
  pumpRunning: z.boolean().optional().default(false),
  filterOperating: z.boolean().optional().default(false),
  waterClear: z.boolean().optional().default(false),
  waterCloudy: z.boolean().optional().default(false),
  algaePresent: z.boolean().optional().default(false),
  notes: z.string().nullable().optional().default(null),
  evaluationJson: z.unknown().nullable().optional().default(null),
});

const poolSafetyCheckBackupSchema = z.object({
  entryKey: z.string().min(1),
  label: z.string().min(1),
  value: z.string().min(1),
  notes: z.string().nullable().optional().default(null),
  sortOrder: z.number().int().optional().default(0),
});

const poolChemicalAdditionBackupSchema = z.object({
  entryKey: z.string().min(1),
  chemicalName: z.string().min(1),
  amount: z.number(),
  unit: z.string().min(1),
  notes: z.string().nullable().optional().default(null),
});

const backupSchema = z.object({
  format: z.literal(backupFormat),
  version: z.literal(backupVersion),
  exportedAt: z.string().datetime(),
  source: z.object({
    app: z.literal("MakeReadyOS"),
    schemaVersion: z.string().optional(),
  }),
  data: z.object({
    properties: z.array(propertySchema),
    floorPlans: z.array(floorPlanSchema).optional().default([]),
    boardOptions: z.array(boardOptionSchema).optional().default([]),
    boardColumns: z.array(boardColumnSchema).optional().default([]),
    boardSections: z.array(boardSectionSchema).optional().default([]),
    scheduleTracks: z.array(scheduleTrackSchema).optional().default([]),
    operatingCalendars: z.array(operatingCalendarSchema).optional().default([]),
    riskPolicies: z.array(propertyRiskPolicySchema).optional().default([]),
    units: z.array(unitSchema),
    makeReadyItems: z.array(makeReadyItemSchema),
    customFields: z.array(customFieldSchema),
    customFieldOptions: z.array(customFieldOptionSchema),
    customFieldValues: z.array(customFieldValueSchema),
    savedViews: z.array(savedViewSchema),
    automationRules: z.array(automationRuleSchema),
    checklistTemplates: z.array(checklistTemplateSchema),
    chargePriceSheetItems: z.array(chargePriceSheetItemSchema).optional().default([]),
    comments: z.array(itemCommentSchema).optional().default([]),
    vendors: z.array(vendorSchema).optional().default([]),
    vendorAssignments: z.array(vendorAssignmentSchema).optional().default([]),
    propertyMaps: z.array(propertyMapSchema).optional().default([]),
    propertyMapAreas: z.array(propertyMapAreaSchema).optional().default([]),
    unitMapLocations: z.array(unitMapLocationSchema).optional().default([]),
    checklistInstances: z.array(checklistInstanceSchema).optional().default([]),
    notes: z.array(propertyNoteSchema),
    propertyTemplates: z.array(propertyTemplateSchema).optional().default([]),
    refrigerantTypes: z.array(refrigerantTypeSchema).optional().default([]),
    refrigerantCylinders: z.array(refrigerantCylinderSchema).optional().default([]),
    refrigerantTransactions: z.array(refrigerantTransactionSchema).optional().default([]),
    refrigerantLeakFlags: z.array(refrigerantLeakFlagSchema).optional().default([]),
    poolFacilities: z.array(poolFacilityBackupSchema).optional().default([]),
    poolChemicals: z.array(poolChemicalBackupSchema).optional().default([]),
    poolChemistryTargets: z.array(poolChemistryTargetBackupSchema).optional().default([]),
    poolLogEntries: z.array(poolLogEntryBackupSchema).optional().default([]),
    poolSafetyChecks: z.array(poolSafetyCheckBackupSchema).optional().default([]),
    poolChemicalAdditions: z.array(poolChemicalAdditionBackupSchema).optional().default([]),
  }),
});

const importSchema = z.object({
  dryRun: z.boolean().default(true),
  mode: z.literal("merge").default("merge"),
  backup: z.unknown(),
});

type NativeBackup = z.infer<typeof backupSchema>;
type SummaryBucket = { created: number; skipped: number; conflicts: number; errors: string[] };
type ImportSummary = Record<keyof NativeBackup["data"], SummaryBucket>;

function itemPortableKey(item: {
  property: { code: string };
  boardGroup: string;
  unitNumber: string;
  moveOutDate: Date | null;
  moveInDate: Date | null;
}) {
  return [item.property.code, item.boardGroup, item.unitNumber, item.moveOutDate?.toISOString() ?? "", item.moveInDate?.toISOString() ?? ""].join("|");
}

function emptySummary(): ImportSummary {
  const bucket = (): SummaryBucket => ({ created: 0, skipped: 0, conflicts: 0, errors: [] });
  return {
    properties: bucket(),
    floorPlans: bucket(),
    boardOptions: bucket(),
    boardColumns: bucket(),
    boardSections: bucket(),
    scheduleTracks: bucket(),
    operatingCalendars: bucket(),
    riskPolicies: bucket(),
    units: bucket(),
    makeReadyItems: bucket(),
    customFields: bucket(),
    customFieldOptions: bucket(),
    customFieldValues: bucket(),
    savedViews: bucket(),
    automationRules: bucket(),
    checklistTemplates: bucket(),
    chargePriceSheetItems: bucket(),
    comments: bucket(),
    vendors: bucket(),
    vendorAssignments: bucket(),
    propertyMaps: bucket(),
    propertyMapAreas: bucket(),
    unitMapLocations: bucket(),
    checklistInstances: bucket(),
    notes: bucket(),
    propertyTemplates: bucket(),
    refrigerantTypes: bucket(),
    refrigerantCylinders: bucket(),
    refrigerantTransactions: bucket(),
    refrigerantLeakFlags: bucket(),
    poolFacilities: bucket(),
    poolChemicals: bucket(),
    poolChemistryTargets: bucket(),
    poolLogEntries: bucket(),
    poolSafetyChecks: bucket(),
    poolChemicalAdditions: bucket(),
  };
}

function jsonValue(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function nullableJson(value: unknown) {
  return value === null ? Prisma.DbNull : jsonValue(value);
}

function dateValue(value: string | null) {
  return value ? new Date(value) : null;
}

function poolEntryPortableKey(entry: { property: { code: string }; facility: { name: string }; logDate: Date; logTime: string | null }) {
  return [entry.property.code, entry.facility.name, entry.logDate.toISOString(), entry.logTime ?? ""].join("|");
}

function defaultBoardSections(propertyCode: string) {
  const code = propertyCode.toUpperCase();
  const records = code === "TA"
    ? [["READY_UNITS_TA", "READY", "Ready Units"], ["MAKE_READY_BOARD_TA", "MAKE_READY", "Make Ready"], ["DOWN_AND_MODELS", "DOWN", "Down Units"], ["ARCHIVE_TA", "ARCHIVE", "Archive"]]
    : code === "VAB"
      ? [["READY_UNITS_VAB", "READY", "Ready Units"], ["MAKE_READY_BOARD_VAB", "MAKE_READY", "Make Ready"], ["VAB_DOWN_UNITS", "DOWN", "Down Units"], ["ARCHIVE_VAB", "ARCHIVE", "Archive"]]
      : [[`${code}_READY_UNITS`, "READY", "Ready Units"], [`${code}_MAKE_READY`, "MAKE_READY", "Make Ready"], [`${code}_DOWN_UNITS`, "DOWN", "Down Units"], [`${code}_ARCHIVE`, "ARCHIVE", "Archive"]];
  return records.map(([key, sectionType, displayName], sortOrder) => ({
    propertyCode,
    key,
    sectionType: sectionType as "READY" | "MAKE_READY" | "DOWN" | "ARCHIVE",
    displayName,
    sortOrder,
    isActive: true,
  }));
}

async function ensureAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (await requireAdmin(request, reply)) return false;
  return true;
}

async function buildExport(): Promise<NativeBackup> {
  const [properties, floorPlans, boardOptions, boardColumns, boardSections, scheduleTracks, operatingCalendars, riskPolicies, units, items, fields, savedViews, rules, templates, chargePriceSheetItems, comments, vendors, vendorAssignments, propertyMaps, propertyMapAreas, unitMapLocations, checklistInstances, notes, propertyTemplates, refrigerantTypes, refrigerantCylinders, refrigerantTransactions, refrigerantLeakFlags, poolFacilities, poolChemicals, poolChemistryTargets, poolLogEntries, poolSafetyChecks, poolChemicalAdditions] = await Promise.all([
    prisma.property.findMany({ orderBy: { code: "asc" } }),
    prisma.floorPlan.findMany({ include: { property: true }, orderBy: [{ property: { code: "asc" } }, { code: "asc" }] }),
    prisma.labelDefinition.findMany({ orderBy: [{ fieldKey: "asc" }, { sortOrder: "asc" }] }),
    prisma.boardColumnDefinition.findMany({ orderBy: { fieldKey: "asc" } }),
    prisma.boardSection.findMany({ include: { property: true }, orderBy: [{ propertyId: "asc" }, { sortOrder: "asc" }] }),
    prisma.scheduleTrack.findMany({ orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }] }),
    prisma.operatingCalendar.findMany({ include: { property: true }, orderBy: [{ property: { code: "asc" } }] }),
    prisma.propertyRiskPolicy.findMany({ include: { property: true }, orderBy: [{ property: { code: "asc" } }] }),
    prisma.unit.findMany({ include: { property: true, floorPlanRecord: true }, orderBy: [{ property: { code: "asc" } }, { number: "asc" }] }),
    prisma.makeReadyItem.findMany({ include: { property: true, customFieldValues: true }, orderBy: { createdAt: "asc" } }),
    prisma.customField.findMany({ where: { deletedAt: null }, include: { options: true }, orderBy: [{ module: "asc" }, { sortOrder: "asc" }] }),
    prisma.savedView.findMany({ where: { isShared: true }, orderBy: { name: "asc" } }),
    prisma.automationRule.findMany({ include: { property: true }, orderBy: { name: "asc" } }),
    prisma.checklistTemplate.findMany({ include: { property: true, items: { orderBy: { sortOrder: "asc" } } }, orderBy: { name: "asc" } }),
    prisma.chargePriceSheetItem.findMany({ include: { property: true }, orderBy: [{ property: { code: "asc" } }, { sortOrder: "asc" }, { name: "asc" }] }),
    prisma.itemComment.findMany({ where: { isDeleted: false }, orderBy: { createdAt: "asc" } }),
    prisma.vendor.findMany({ include: { serviceAreas: { include: { property: true } } }, orderBy: [{ trade: "asc" }, { name: "asc" }] }),
    prisma.vendorAssignment.findMany({ include: { vendor: true, property: true, item: { include: { property: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.propertyMap.findMany({ include: { property: true }, orderBy: [{ property: { code: "asc" } }, { name: "asc" }] }),
    prisma.propertyMapArea.findMany({ include: { property: true, map: true }, orderBy: [{ property: { code: "asc" } }, { areaType: "asc" }, { name: "asc" }] }),
    prisma.unitMapLocation.findMany({ include: { property: true, map: true, unit: true }, orderBy: [{ property: { code: "asc" } }, { area: "asc" }, { floor: "asc" }] }),
    prisma.checklistInstance.findMany({ include: { template: true, items: { orderBy: { sortOrder: "asc" } } }, orderBy: { createdAt: "asc" } }),
    prisma.propertyNote.findMany({ include: { property: true }, orderBy: [{ property: { code: "asc" } }, { title: "asc" }] }),
    prisma.propertyTemplate.findMany({ where: { isArchived: false }, orderBy: [{ category: "asc" }, { name: "asc" }] }),
    prisma.refrigerantType.findMany({ orderBy: { name: "asc" } }),
    prisma.refrigerantCylinder.findMany({ include: { refrigerantType: true }, orderBy: { identifier: "asc" } }),
    prisma.refrigerantTransaction.findMany({ include: { refrigerantType: true, sourceCylinder: true, recoveryCylinder: true }, orderBy: { occurredAt: "asc" } }),
    prisma.refrigerantLeakFlag.findMany({ include: { refrigerantType: true }, orderBy: { lastDetectedAt: "asc" } }),
    prisma.poolFacility.findMany({ include: { property: true }, orderBy: [{ property: { code: "asc" } }, { name: "asc" }] }),
    prisma.poolChemical.findMany({ include: { property: true }, orderBy: [{ property: { code: "asc" } }, { name: "asc" }] }),
    prisma.poolChemistryTarget.findMany({ include: { property: true }, orderBy: [{ facilityType: "asc" }] }),
    prisma.poolLogEntry.findMany({ include: { property: true, facility: true }, orderBy: [{ logDate: "asc" }, { logTime: "asc" }] }),
    prisma.poolSafetyCheck.findMany({ include: { entry: { include: { property: true, facility: true } } }, orderBy: [{ entryId: "asc" }, { sortOrder: "asc" }] }),
    prisma.poolChemicalAddition.findMany({ include: { entry: { include: { property: true, facility: true } } }, orderBy: { createdAt: "asc" } }),
  ]);
  const fieldKeysById = new Map(fields.map((field) => [field.id, field.fieldKey]));
  const itemKeysById = new Map(items.map((item) => [item.id, itemPortableKey(item)]));
  const portableColumns = (columns: unknown) => Array.isArray(columns)
    ? columns.map((column) => typeof column === "string" && column.startsWith("custom:")
      ? `custom-field:${fieldKeysById.get(column.slice(7)) ?? column.slice(7)}`
      : String(column))
    : null;

  return {
    format: backupFormat,
    version: backupVersion,
    exportedAt: new Date().toISOString(),
    source: { app: "MakeReadyOS", schemaVersion: "prisma-v1" },
    data: {
      properties: properties.map((property) => ({
        code: property.code,
        name: property.name,
        occupancyGoalPercent: property.occupancyGoalPercent,
        uploadStorageMode: property.uploadStorageMode === "PROPERTY_SUBDIR" ? "PROPERTY_SUBDIR" : "DEFAULT",
        uploadSubdir: property.uploadSubdir,
        isActive: property.isActive,
      })),
      floorPlans: floorPlans.map((floorPlan) => ({
        propertyCode: floorPlan.property.code,
        code: floorPlan.code,
        name: floorPlan.name,
        bedrooms: floorPlan.bedrooms,
        bathrooms: floorPlan.bathrooms,
        squareFeet: floorPlan.squareFeet,
        description: floorPlan.description,
        isActive: floorPlan.isActive,
      })),
      boardOptions: boardOptions.map((option) => ({
        fieldKey: option.fieldKey,
        value: option.value,
        color: option.color,
        textColor: option.textColor,
        sortOrder: option.sortOrder,
        isArchived: option.isArchived,
      })),
      boardColumns: boardColumns.map((column) => ({ fieldKey: column.fieldKey, label: column.label })),
      boardSections: boardSections.map((section) => ({
        propertyCode: section.property.code,
        key: section.key,
        sectionType: section.sectionType as "READY" | "MAKE_READY" | "DOWN" | "ARCHIVE",
        displayName: section.displayName,
        sortOrder: section.sortOrder,
        isActive: section.isActive,
      })),
      scheduleTracks: scheduleTracks.map((track) => ({
        sourceField: track.sourceField.startsWith("custom:")
          ? `custom-field:${fieldKeysById.get(track.sourceField.slice(7)) ?? track.sourceField.slice(7)}`
          : track.sourceField,
        displayName: track.displayName,
        colorBasis: supportedScheduleColorBases.includes(track.colorBasis as (typeof supportedScheduleColorBases)[number])
          ? track.colorBasis as (typeof supportedScheduleColorBases)[number]
          : "NEUTRAL",
        colorSourceField: track.colorSourceField?.startsWith("custom:")
          ? `custom-field:${fieldKeysById.get(track.colorSourceField.slice(7)) ?? track.colorSourceField.slice(7)}`
          : track.colorSourceField,
        fixedColor: track.fixedColor,
        groupingMode: track.groupingMode as "NONE" | "PROPERTY" | "BOARD_GROUP",
        visibilityFilter: track.visibilityFilter as { boardGroups?: string[]; statusValues?: string[] } | null,
        overdueEnabled: track.overdueEnabled,
        moveInSoonEnabled: track.moveInSoonEnabled,
        isEnabled: track.isEnabled,
        isArchived: track.isArchived,
        sortOrder: track.sortOrder,
      })),
      operatingCalendars: operatingCalendars.map((calendar) => ({
        propertyCode: calendar.property.code,
        name: calendar.name,
        timezone: calendar.timezone,
        noWeekendScheduling: calendar.noWeekendScheduling,
        avoidMondayScheduling: calendar.avoidMondayScheduling,
        avoidFridayScheduling: calendar.avoidFridayScheduling,
        maintenanceStartMinute: calendar.maintenanceStartMinute,
        maintenanceEndMinute: calendar.maintenanceEndMinute,
        vendorLeadDays: calendar.vendorLeadDays,
        dailyScheduledUnitLimit: calendar.dailyScheduledUnitLimit,
        scopeDay: calendar.scopeDay,
        workStartDay: calendar.workStartDay,
        autoPopulateEnabled: calendar.autoPopulateEnabled,
        notes: calendar.notes,
      })),
      riskPolicies: riskPolicies.map((policy) => ({
        propertyCode: policy.property.code,
        moveInCriticalDays: policy.moveInCriticalDays,
        moveInHighDays: policy.moveInHighDays,
        moveInMediumDays: policy.moveInMediumDays,
        unassignedHighDays: policy.unassignedHighDays,
        staleActivityDays: policy.staleActivityDays,
        agingMediumDays: policy.agingMediumDays,
        agingHighDays: policy.agingHighDays,
        vendorNearMoveInDays: policy.vendorNearMoveInDays,
        checklistNearMoveInDays: policy.checklistNearMoveInDays,
        planningNearMoveInDays: policy.planningNearMoveInDays,
      })),
      units: units.map((unit) => ({
        propertyCode: unit.property.code,
        number: unit.number,
        floorPlanCode: unit.floorPlanRecord?.code ?? null,
        floorPlanName: unit.floorPlanRecord?.name ?? null,
        floorPlan: unit.floorPlan,
        squareFeet: unit.squareFeet,
        bedrooms: unit.bedrooms,
        bathrooms: unit.bathrooms,
        isActive: unit.isActive,
      })),
      makeReadyItems: items.map((item) => ({
        portableKey: itemPortableKey(item),
        propertyCode: item.property.code,
        unitNumber: item.unitNumber,
        boardGroup: item.boardGroup,
        itemName: item.itemName,
        floorPlan: item.floorPlan,
        applicant: item.applicant,
        assignedTech: item.assignedTech,
        scopeLevel: item.scopeLevel,
        status: item.status,
        vacancyStatus: item.vacancyStatus,
        moveOutDate: item.moveOutDate?.toISOString() ?? null,
        vacatedDate: item.vacatedDate?.toISOString() ?? null,
        makeReadyDate: item.makeReadyDate?.toISOString() ?? null,
        moveInDate: item.moveInDate?.toISOString() ?? null,
        daysVacant: item.daysVacant,
        daysUntilMoveIn: item.daysUntilMoveIn,
        priority: item.priority,
        overdue: item.overdue,
        moveInSoon: item.moveInSoon,
        riskScore: item.riskScore,
        riskLevel: item.riskLevel,
        riskReasons: item.riskReasons,
        lastRiskEvaluatedAt: item.lastRiskEvaluatedAt?.toISOString() ?? null,
        completionStatus: item.completionStatus,
        sheetrockStatus: item.sheetrockStatus,
        pestStatus: item.pestStatus,
        pestTreated: item.pestTreated,
        trashOutStatus: item.trashOutStatus,
        floorsStatus: item.floorsStatus,
        flooringDate: item.flooringDate?.toISOString() ?? null,
        makeReadyStatus: item.makeReadyStatus,
        cleaningStatus: item.cleaningStatus,
        keysMadeStatus: item.keysMadeStatus,
        cabinetsStatus: item.cabinetsStatus,
        countertopsStatus: item.countertopsStatus,
        appliancesStatus: item.appliancesStatus,
        paintStatus: item.paintStatus,
        doorsStatus: item.doorsStatus,
        newDoorCode: item.newDoorCode,
        notes: item.notes,
        isArchived: item.isArchived,
        archivedAt: item.archivedAt?.toISOString() ?? null,
      })),
      customFields: fields.map((field) => ({
        fieldKey: field.fieldKey,
        module: field.module,
        label: field.label,
        fieldType: field.fieldType,
        description: field.description,
        sortOrder: field.sortOrder,
        isArchived: field.isArchived,
      })),
      customFieldOptions: fields.flatMap((field) => field.options.map((option) => ({
        fieldKey: field.fieldKey,
        label: option.label,
        color: option.color,
        sortOrder: option.sortOrder,
        isArchived: option.isArchived,
      }))),
      customFieldValues: items.flatMap((item) => item.customFieldValues.flatMap((value) => {
        const fieldKey = fieldKeysById.get(value.customFieldId);
        const itemKey = itemKeysById.get(value.itemId);
        return fieldKey && itemKey ? [{ fieldKey, itemKey, value: value.value }] : [];
      })),
      savedViews: savedViews.map((view) => ({
        name: view.name,
        module: view.module,
        viewType: view.viewType,
        filters: view.filters,
        sorts: view.sorts === null ? null : view.sorts,
        grouping: view.grouping === null ? null : view.grouping,
        visibleColumns: portableColumns(view.visibleColumns),
        isShared: true,
        isDefault: view.isDefault,
      })),
      automationRules: rules.map((rule) => ({
        templateId: rule.templateId,
        name: rule.name,
        description: rule.description,
        propertyCode: rule.property?.code ?? null,
        triggerType: rule.triggerType,
        enabled: rule.enabled,
        isArchived: rule.isArchived,
        conditions: rule.conditions,
        actions: rule.actions,
      })),
      checklistTemplates: templates.map((template) => ({
        propertyCode: template.property?.code ?? null,
        name: template.name,
        scope: template.scope,
        items: template.items.map((item) => ({ label: item.label, notes: item.notes, sortOrder: item.sortOrder, required: item.required, dueOffsetDays: item.dueOffsetDays, tradeCategory: item.tradeCategory })),
      })),
      chargePriceSheetItems: chargePriceSheetItems.map((entry) => ({
        propertyCode: entry.property.code,
        name: entry.name,
        category: entry.category,
        unitLabel: entry.unitLabel,
        defaultCents: entry.defaultCents,
        description: entry.description,
        isActive: entry.isActive,
        isArchived: entry.isArchived,
        sortOrder: entry.sortOrder,
      })),
      comments: comments.flatMap((comment) => {
        const itemKey = itemKeysById.get(comment.itemId);
        return itemKey ? [{
          itemKey,
          authorName: comment.authorName,
          body: comment.body,
          category: comment.category,
          createdAt: comment.createdAt.toISOString(),
          editedAt: comment.editedAt?.toISOString() ?? null,
        }] : [];
      }),
      vendors: vendors.map((vendor) => ({
        name: vendor.name,
        trade: vendor.trade,
        phone: vendor.phone,
        email: vendor.email,
        notes: vendor.notes,
        isActive: vendor.isActive,
        isPreferred: vendor.isPreferred,
        insuranceExpiresAt: vendor.insuranceExpiresAt?.toISOString() ?? null,
        licenseExpiresAt: vendor.licenseExpiresAt?.toISOString() ?? null,
        propertyCodes: vendor.serviceAreas.map((area) => area.property.code),
      })),
      vendorAssignments: vendorAssignments.flatMap((assignment) => {
        const itemKey = itemKeysById.get(assignment.itemId);
        return itemKey ? [{
          vendorName: assignment.vendor.name,
          vendorTrade: assignment.vendor.trade,
          itemKey,
          propertyCode: assignment.property.code,
          trade: assignment.trade,
          status: assignment.status,
          scheduledDate: assignment.scheduledDate?.toISOString() ?? null,
          dueDate: assignment.dueDate?.toISOString() ?? null,
          completedAt: assignment.completedAt?.toISOString() ?? null,
          notes: assignment.notes,
          costEstimate: assignment.costEstimate,
          invoiceRef: assignment.invoiceRef,
        }] : [];
      }),
      propertyMaps: propertyMaps.map((map) => ({
        propertyCode: map.property.code,
        name: map.name,
        originalName: map.originalName,
        mimeType: map.mimeType,
        sizeBytes: map.sizeBytes,
        width: map.width,
        height: map.height,
        notes: map.notes,
        isActive: map.isActive,
        isArchived: map.isArchived,
      })),
      propertyMapAreas: propertyMapAreas.map((area) => ({
        propertyCode: area.property.code,
        mapName: area.map.name,
        name: area.name,
        areaType: area.areaType,
        xPercent: area.xPercent,
        yPercent: area.yPercent,
        widthPercent: area.widthPercent,
        heightPercent: area.heightPercent,
        color: area.color,
        expectedUnitCount: area.expectedUnitCount,
        notes: area.notes,
        isActive: area.isActive,
        isArchived: area.isArchived,
      })),
      unitMapLocations: unitMapLocations.map((location) => ({
        propertyCode: location.property.code,
        mapName: location.map.name,
        unitNumber: location.unit.number,
        xPercent: location.xPercent,
        yPercent: location.yPercent,
        labelXPercent: location.labelXPercent,
        labelYPercent: location.labelYPercent,
        building: location.building,
        area: location.area,
        floor: location.floor,
        isActive: location.isActive,
        isArchived: location.isArchived,
      })),
      checklistInstances: checklistInstances.flatMap((instance) => {
        const itemKey = itemKeysById.get(instance.itemId);
        return itemKey ? [{
          itemKey,
          templateName: instance.template?.name ?? null,
          name: instance.name,
          items: instance.items.map((entry) => ({
            title: entry.title,
            notes: entry.notes,
            sortOrder: entry.sortOrder,
            required: entry.required,
            dueOffsetDays: entry.dueOffsetDays,
            tradeCategory: entry.tradeCategory,
            completed: entry.completed,
            completedAt: entry.completedAt?.toISOString() ?? null,
          })),
        }] : [];
      }),
      notes: notes.map((note) => ({
        propertyCode: note.property.code,
        title: note.title,
        body: note.body,
        noteType: note.noteType,
      })),
      propertyTemplates: propertyTemplates.map((template) => ({
        name: template.name,
        description: template.description,
        category: template.category,
        version: template.version,
        notes: template.notes,
        sourcePropertyCode: template.sourcePropertyCode,
        includeConfig: template.includeConfig,
        manifest: template.manifest,
        isArchived: template.isArchived,
      })),
      refrigerantTypes: refrigerantTypes.map((type) => ({
        name: type.name,
        notes: type.notes,
        isActive: type.isActive,
      })),
      refrigerantCylinders: refrigerantCylinders.map((cylinder) => ({
        identifier: cylinder.identifier,
        refrigerantTypeName: cylinder.refrigerantType.name,
        category: cylinder.category as "VIRGIN" | "CLEAN_RECOVERY" | "DIRTY_RECOVERY",
        tankSize: cylinder.tankSize,
        currentWeight: cylinder.currentWeight,
        status: cylinder.status as "ACTIVE" | "EMPTY_PENDING_RECOVERY" | "ARCHIVED",
        notes: cylinder.notes,
        dispositionNotes: cylinder.dispositionNotes,
        finalRecoveryCompleted: cylinder.finalRecoveryCompleted,
        archivedAt: cylinder.archivedAt?.toISOString() ?? null,
      })),
      refrigerantTransactions: refrigerantTransactions.map((entry) => {
        const property = entry.propertyId ? properties.find((candidate) => candidate.id === entry.propertyId) : null;
        return {
          transactionType: entry.transactionType as "VIRGIN_CHARGE" | "CLEAN_RECOVERY" | "DIRTY_RECOVERY" | "FINAL_RECOVERY",
          propertyCode: property?.code ?? null,
          unitNumber: entry.unitNumber,
          refrigerantTypeName: entry.refrigerantType.name,
          sourceCylinderIdentifier: entry.sourceCylinder?.identifier ?? null,
          recoveryCylinderIdentifier: entry.recoveryCylinder?.identifier ?? null,
          occurredAt: entry.occurredAt.toISOString(),
          startWeight: entry.startWeight,
          endWeight: entry.endWeight,
          amount: entry.amount,
          notes: entry.notes,
          createdByName: entry.createdByName,
        };
      }),
      refrigerantLeakFlags: refrigerantLeakFlags.map((flag) => {
        const property = flag.propertyId ? properties.find((candidate) => candidate.id === flag.propertyId) : null;
        return {
          propertyCode: property?.code ?? null,
          unitNumber: flag.unitNumber,
          refrigerantTypeName: flag.refrigerantType?.name ?? null,
          level: flag.level,
          reason: flag.reason,
          status: flag.status,
          lastDetectedAt: flag.lastDetectedAt.toISOString(),
          dismissedAt: flag.dismissedAt?.toISOString() ?? null,
          dismissalNotes: flag.dismissalNotes,
        };
      }),
      poolFacilities: poolFacilities.map((facility) => ({
        propertyCode: facility.property.code,
        name: facility.name,
        type: facility.type,
        capacityGallons: facility.capacityGallons,
        surfaceType: facility.surfaceType,
        notes: facility.notes,
        isActive: facility.isActive,
      })),
      poolChemicals: poolChemicals.map((chemical) => ({
        propertyCode: chemical.property.code,
        name: chemical.name,
        category: chemical.category,
        concentrationPercent: chemical.concentrationPercent,
        unit: chemical.unit,
        notes: chemical.notes,
        isActive: chemical.isActive,
      })),
      poolChemistryTargets: poolChemistryTargets.map((target) => ({
        propertyCode: target.property?.code ?? null,
        facilityType: target.facilityType,
        phMin: target.phMin,
        phMax: target.phMax,
        freeChlorineMin: target.freeChlorineMin,
        freeChlorineMax: target.freeChlorineMax,
        combinedChlorineMax: target.combinedChlorineMax,
        totalAlkalinityMin: target.totalAlkalinityMin,
        totalAlkalinityMax: target.totalAlkalinityMax,
        cyaMin: target.cyaMin,
        cyaMax: target.cyaMax,
        calciumHardnessMin: target.calciumHardnessMin,
        calciumHardnessMax: target.calciumHardnessMax,
      })),
      poolLogEntries: poolLogEntries.map((entry) => ({
        propertyCode: entry.property.code,
        facilityName: entry.facility.name,
        technicianName: entry.technicianName,
        logDate: entry.logDate.toISOString(),
        logTime: entry.logTime,
        ph: entry.ph,
        freeChlorine: entry.freeChlorine,
        combinedChlorine: entry.combinedChlorine,
        totalChlorine: entry.totalChlorine,
        totalAlkalinity: entry.totalAlkalinity,
        cyanuricAcid: entry.cyanuricAcid,
        calciumHardness: entry.calciumHardness,
        waterTemperature: entry.waterTemperature,
        vacuumed: entry.vacuumed,
        backwashed: entry.backwashed,
        skimmerCleaned: entry.skimmerCleaned,
        pumpRunning: entry.pumpRunning,
        filterOperating: entry.filterOperating,
        waterClear: entry.waterClear,
        waterCloudy: entry.waterCloudy,
        algaePresent: entry.algaePresent,
        notes: entry.notes,
        evaluationJson: entry.evaluationJson,
      })),
      poolSafetyChecks: poolSafetyChecks.map((check) => ({
        entryKey: poolEntryPortableKey(check.entry),
        label: check.label,
        value: check.value,
        notes: check.notes,
        sortOrder: check.sortOrder,
      })),
      poolChemicalAdditions: poolChemicalAdditions.map((addition) => ({
        entryKey: poolEntryPortableKey(addition.entry),
        chemicalName: addition.chemicalName,
        amount: addition.amount,
        unit: addition.unit,
        notes: addition.notes,
      })),
    },
  };
}

async function importBackup(backup: NativeBackup, dryRun: boolean) {
  const summary = emptySummary();
  const propertyCodes = new Set(backup.data.properties.map((property) => property.code));
  const sectionPropertyCodes = new Set(backup.data.boardSections.map((section) => section.propertyCode));
  const boardSections = [
    ...backup.data.boardSections,
    ...backup.data.properties
      .filter((property) => !sectionPropertyCodes.has(property.code))
      .flatMap((property) => defaultBoardSections(property.code)),
  ];
  const floorPlanKey = (propertyCode: string, codeOrName: string) => `${propertyCode}|${codeOrName}`;
  const backupFloorPlanCode = (floorPlan: z.infer<typeof floorPlanSchema>) => floorPlan.code ?? floorPlan.name;
  const floorPlanKeys = new Set(backup.data.floorPlans.flatMap((floorPlan) => [
    floorPlanKey(floorPlan.propertyCode, backupFloorPlanCode(floorPlan)),
    floorPlanKey(floorPlan.propertyCode, floorPlan.name),
  ]));
  const fieldKeys = new Set(backup.data.customFields.map((field) => field.fieldKey));
  const itemKeys = new Set(backup.data.makeReadyItems.map((item) => item.portableKey));
  const rejectDuplicates = <K extends keyof ImportSummary>(bucket: K, keys: string[]) => {
    const seen = new Set<string>();
    for (const key of keys) {
      if (seen.has(key)) {
        summary[bucket].conflicts += 1;
        summary[bucket].errors.push(`Duplicate record in backup: ${key}`);
      }
      seen.add(key);
    }
  };
  rejectDuplicates("properties", backup.data.properties.map((property) => property.code));
  rejectDuplicates("floorPlans", backup.data.floorPlans.map((floorPlan) => floorPlanKey(floorPlan.propertyCode, backupFloorPlanCode(floorPlan))));
  rejectDuplicates("boardOptions", backup.data.boardOptions.map((option) => `${option.fieldKey}|${option.value}`));
  rejectDuplicates("boardColumns", backup.data.boardColumns.map((column) => column.fieldKey));
  rejectDuplicates("boardSections", boardSections.map((section) => `${section.propertyCode}|${section.sectionType}`));
  rejectDuplicates("scheduleTracks", backup.data.scheduleTracks.map((track) => track.sourceField));
  rejectDuplicates("operatingCalendars", backup.data.operatingCalendars.map((calendar) => calendar.propertyCode));
  rejectDuplicates("riskPolicies", backup.data.riskPolicies.map((policy) => policy.propertyCode));
  rejectDuplicates("units", backup.data.units.map((unit) => `${unit.propertyCode}|${unit.number}`));
  rejectDuplicates("makeReadyItems", backup.data.makeReadyItems.map((item) => item.portableKey));
  rejectDuplicates("customFields", backup.data.customFields.map((field) => field.fieldKey));
  rejectDuplicates("customFieldOptions", backup.data.customFieldOptions.map((option) => `${option.fieldKey}|${option.label}`));
  rejectDuplicates("customFieldValues", backup.data.customFieldValues.map((value) => `${value.itemKey}|${value.fieldKey}`));
  rejectDuplicates("savedViews", backup.data.savedViews.map((view) => `${view.module}|${view.name}`));
  rejectDuplicates("automationRules", backup.data.automationRules.map((rule) => `${rule.triggerType}|${rule.name}`));
  rejectDuplicates("checklistTemplates", backup.data.checklistTemplates.map((template) => `${template.propertyCode ?? "global"}|${template.scope ?? ""}|${template.name}`));
  rejectDuplicates("chargePriceSheetItems", backup.data.chargePriceSheetItems.map((entry) => `${entry.propertyCode}|${entry.name}`));
  rejectDuplicates("comments", backup.data.comments.map((comment) => `${comment.itemKey}|${comment.authorName}|${comment.createdAt}`));
  rejectDuplicates("vendors", backup.data.vendors.map((vendor) => `${vendor.trade}|${vendor.name}`));
  rejectDuplicates("vendorAssignments", backup.data.vendorAssignments.map((assignment) => `${assignment.vendorTrade}|${assignment.vendorName}|${assignment.itemKey}|${assignment.trade}|${assignment.scheduledDate ?? ""}|${assignment.dueDate ?? ""}`));
  rejectDuplicates("propertyMaps", backup.data.propertyMaps.map((map) => `${map.propertyCode}|${map.name}`));
  rejectDuplicates("propertyMapAreas", backup.data.propertyMapAreas.map((area) => `${area.propertyCode}|${area.mapName}|${area.name}`));
  rejectDuplicates("unitMapLocations", backup.data.unitMapLocations.map((location) => `${location.propertyCode}|${location.mapName}|${location.unitNumber}`));
  rejectDuplicates("checklistInstances", backup.data.checklistInstances.map((instance) => `${instance.itemKey}|${instance.name}`));
  rejectDuplicates("notes", backup.data.notes.map((note) => `${note.propertyCode}|${note.noteType}|${note.title}`));
  rejectDuplicates("propertyTemplates", backup.data.propertyTemplates.map((template) => template.name));
  rejectDuplicates("refrigerantTypes", backup.data.refrigerantTypes.map((type) => type.name));
  rejectDuplicates("refrigerantCylinders", backup.data.refrigerantCylinders.map((cylinder) => cylinder.identifier));
  rejectDuplicates("refrigerantTransactions", backup.data.refrigerantTransactions.map((entry) => `${entry.transactionType}|${entry.refrigerantTypeName}|${entry.propertyCode ?? ""}|${entry.unitNumber ?? ""}|${entry.occurredAt}|${entry.amount}`));
  rejectDuplicates("refrigerantLeakFlags", backup.data.refrigerantLeakFlags.map((flag) => `${flag.propertyCode ?? ""}|${flag.unitNumber}|${flag.refrigerantTypeName ?? ""}|${flag.status}`));
  rejectDuplicates("poolFacilities", backup.data.poolFacilities.map((facility) => `${facility.propertyCode}|${facility.name}`));
  rejectDuplicates("poolChemicals", backup.data.poolChemicals.map((chemical) => `${chemical.propertyCode}|${chemical.name}`));
  rejectDuplicates("poolChemistryTargets", backup.data.poolChemistryTargets.map((target) => `${target.propertyCode ?? "global"}|${target.facilityType}`));
  rejectDuplicates("poolLogEntries", backup.data.poolLogEntries.map((entry) => `${entry.propertyCode}|${entry.facilityName}|${entry.logDate}|${entry.logTime ?? ""}`));
  rejectDuplicates("poolSafetyChecks", backup.data.poolSafetyChecks.map((check) => `${check.entryKey}|${check.label}`));
  rejectDuplicates("poolChemicalAdditions", backup.data.poolChemicalAdditions.map((addition) => `${addition.entryKey}|${addition.chemicalName}|${addition.amount}|${addition.unit}|${addition.notes ?? ""}`));

  for (const unit of backup.data.units) {
    if (!propertyCodes.has(unit.propertyCode) && !(await prisma.property.findUnique({ where: { code: unit.propertyCode } }))) {
      summary.units.errors.push(`Property ${unit.propertyCode} is missing for unit ${unit.number}`);
    }
    const unitFloorPlanRef = unit.floorPlanCode ?? unit.floorPlanName;
    if (unitFloorPlanRef && !floorPlanKeys.has(floorPlanKey(unit.propertyCode, unitFloorPlanRef))) {
      const property = await prisma.property.findUnique({ where: { code: unit.propertyCode } });
      const existingFloorPlan = property
        ? await prisma.floorPlan.findFirst({ where: { propertyId: property.id, OR: [{ code: unitFloorPlanRef }, { name: unitFloorPlanRef }] } })
        : null;
      if (!existingFloorPlan) summary.units.errors.push(`Floor plan ${unitFloorPlanRef} is missing for unit ${unit.number}`);
    }
  }
  for (const floorPlan of backup.data.floorPlans) {
    if (!propertyCodes.has(floorPlan.propertyCode) && !(await prisma.property.findUnique({ where: { code: floorPlan.propertyCode } }))) {
      summary.floorPlans.errors.push(`Property ${floorPlan.propertyCode} is missing for floor plan ${floorPlan.name}`);
    }
  }
  for (const entry of backup.data.chargePriceSheetItems) {
    if (!propertyCodes.has(entry.propertyCode) && !(await prisma.property.findUnique({ where: { code: entry.propertyCode } }))) {
      summary.chargePriceSheetItems.errors.push(`Property ${entry.propertyCode} is missing for charge price-sheet item ${entry.name}`);
    }
  }
  for (const item of backup.data.makeReadyItems) {
    if (!propertyCodes.has(item.propertyCode) && !(await prisma.property.findUnique({ where: { code: item.propertyCode } }))) {
      summary.makeReadyItems.errors.push(`Property ${item.propertyCode} is missing for item ${item.itemName}`);
    }
  }
  for (const value of backup.data.customFieldValues) {
    if (!fieldKeys.has(value.fieldKey) && !(await prisma.customField.findUnique({ where: { fieldKey: value.fieldKey } }))) {
      summary.customFieldValues.errors.push(`Custom field ${value.fieldKey} is missing`);
    }
    if (!itemKeys.has(value.itemKey)) {
      summary.customFieldValues.errors.push(`Make-ready item ${value.itemKey} is missing`);
    }
  }
  for (const comment of backup.data.comments) {
    if (!itemKeys.has(comment.itemKey)) summary.comments.errors.push(`Make-ready item ${comment.itemKey} is missing for comment`);
  }
  for (const vendor of backup.data.vendors) {
    for (const propertyCode of vendor.propertyCodes) {
      if (!propertyCodes.has(propertyCode) && !(await prisma.property.findUnique({ where: { code: propertyCode } }))) {
        summary.vendors.errors.push(`Property ${propertyCode} is missing for vendor ${vendor.name}`);
      }
    }
  }
  for (const assignment of backup.data.vendorAssignments) {
    if (!itemKeys.has(assignment.itemKey)) summary.vendorAssignments.errors.push(`Make-ready item ${assignment.itemKey} is missing for vendor assignment`);
    if (!propertyCodes.has(assignment.propertyCode) && !(await prisma.property.findUnique({ where: { code: assignment.propertyCode } }))) {
      summary.vendorAssignments.errors.push(`Property ${assignment.propertyCode} is missing for vendor assignment`);
    }
  }
  for (const map of backup.data.propertyMaps) {
    if (!propertyCodes.has(map.propertyCode) && !(await prisma.property.findUnique({ where: { code: map.propertyCode } }))) {
      summary.propertyMaps.errors.push(`Property ${map.propertyCode} is missing for map ${map.name}`);
    }
  }
  for (const area of backup.data.propertyMapAreas) {
    if (!propertyCodes.has(area.propertyCode) && !(await prisma.property.findUnique({ where: { code: area.propertyCode } }))) {
      summary.propertyMapAreas.errors.push(`Property ${area.propertyCode} is missing for map area ${area.name}`);
    }
    const mapInBackup = backup.data.propertyMaps.some((map) => map.propertyCode === area.propertyCode && map.name === area.mapName);
    if (!mapInBackup) {
      const property = await prisma.property.findUnique({ where: { code: area.propertyCode } });
      const existingMap = property ? await prisma.propertyMap.findFirst({ where: { propertyId: property.id, name: area.mapName } }) : null;
      if (!existingMap) summary.propertyMapAreas.errors.push(`Property map ${area.mapName} is missing for area ${area.name}`);
    }
  }
  for (const location of backup.data.unitMapLocations) {
    if (!propertyCodes.has(location.propertyCode) && !(await prisma.property.findUnique({ where: { code: location.propertyCode } }))) {
      summary.unitMapLocations.errors.push(`Property ${location.propertyCode} is missing for map location ${location.unitNumber}`);
    }
    const mapInBackup = backup.data.propertyMaps.some((map) => map.propertyCode === location.propertyCode && map.name === location.mapName);
    if (!mapInBackup) {
      const property = await prisma.property.findUnique({ where: { code: location.propertyCode } });
      const existingMap = property ? await prisma.propertyMap.findFirst({ where: { propertyId: property.id, name: location.mapName } }) : null;
      if (!existingMap) summary.unitMapLocations.errors.push(`Property map ${location.mapName} is missing for location ${location.unitNumber}`);
    }
    const unitInBackup = backup.data.units.some((unit) => unit.propertyCode === location.propertyCode && unit.number === location.unitNumber);
    if (!unitInBackup) {
      const property = await prisma.property.findUnique({ where: { code: location.propertyCode } });
      const existingUnit = property ? await prisma.unit.findUnique({ where: { propertyId_number: { propertyId: property.id, number: location.unitNumber } } }) : null;
      if (!existingUnit) summary.unitMapLocations.errors.push(`Unit ${location.unitNumber} is missing for map location`);
    }
  }
  for (const instance of backup.data.checklistInstances) {
    if (!itemKeys.has(instance.itemKey)) summary.checklistInstances.errors.push(`Make-ready item ${instance.itemKey} is missing for checklist ${instance.name}`);
  }
  for (const cylinder of backup.data.refrigerantCylinders) {
    if (!backup.data.refrigerantTypes.some((type) => type.name === cylinder.refrigerantTypeName) && !(await prisma.refrigerantType.findUnique({ where: { name: cylinder.refrigerantTypeName } }))) {
      summary.refrigerantCylinders.errors.push(`Refrigerant type ${cylinder.refrigerantTypeName} is missing for cylinder ${cylinder.identifier}`);
    }
  }
  for (const entry of backup.data.refrigerantTransactions) {
    if (entry.propertyCode && !propertyCodes.has(entry.propertyCode) && !(await prisma.property.findUnique({ where: { code: entry.propertyCode } }))) {
      summary.refrigerantTransactions.errors.push(`Property ${entry.propertyCode} is missing for refrigerant transaction`);
    }
  }
  const poolFacilityKeys = new Set(backup.data.poolFacilities.map((facility) => `${facility.propertyCode}|${facility.name}`));
  const poolEntryKeys = new Set(backup.data.poolLogEntries.map((entry) => `${entry.propertyCode}|${entry.facilityName}|${entry.logDate}|${entry.logTime ?? ""}`));
  for (const facility of backup.data.poolFacilities) {
    if (!propertyCodes.has(facility.propertyCode) && !(await prisma.property.findUnique({ where: { code: facility.propertyCode } }))) {
      summary.poolFacilities.errors.push(`Property ${facility.propertyCode} is missing for pool facility ${facility.name}`);
    }
  }
  for (const chemical of backup.data.poolChemicals) {
    if (!propertyCodes.has(chemical.propertyCode) && !(await prisma.property.findUnique({ where: { code: chemical.propertyCode } }))) {
      summary.poolChemicals.errors.push(`Property ${chemical.propertyCode} is missing for pool chemical ${chemical.name}`);
    }
  }
  for (const target of backup.data.poolChemistryTargets) {
    if (target.propertyCode && !propertyCodes.has(target.propertyCode) && !(await prisma.property.findUnique({ where: { code: target.propertyCode } }))) {
      summary.poolChemistryTargets.errors.push(`Property ${target.propertyCode} is missing for pool chemistry target ${target.facilityType}`);
    }
  }
  for (const entry of backup.data.poolLogEntries) {
    if (!propertyCodes.has(entry.propertyCode) && !(await prisma.property.findUnique({ where: { code: entry.propertyCode } }))) {
      summary.poolLogEntries.errors.push(`Property ${entry.propertyCode} is missing for pool log entry`);
    }
    if (!poolFacilityKeys.has(`${entry.propertyCode}|${entry.facilityName}`)) {
      const property = await prisma.property.findUnique({ where: { code: entry.propertyCode } });
      const existingFacility = property ? await prisma.poolFacility.findUnique({ where: { propertyId_name: { propertyId: property.id, name: entry.facilityName } } }) : null;
      if (!existingFacility) summary.poolLogEntries.errors.push(`Pool facility ${entry.facilityName} is missing for pool log entry`);
    }
  }
  for (const check of backup.data.poolSafetyChecks) {
    if (!poolEntryKeys.has(check.entryKey)) summary.poolSafetyChecks.errors.push(`Pool log entry ${check.entryKey} is missing for safety check ${check.label}`);
  }
  for (const addition of backup.data.poolChemicalAdditions) {
    if (!poolEntryKeys.has(addition.entryKey)) summary.poolChemicalAdditions.errors.push(`Pool log entry ${addition.entryKey} is missing for chemical addition ${addition.chemicalName}`);
  }
  if (Object.values(summary).some((bucket) => bucket.errors.length > 0)) return summary;

  const run = async (tx: Prisma.TransactionClient | typeof prisma) => {
    const propertyMap = new Map<string, string>();
    for (const property of backup.data.properties) {
      const existing = await tx.property.findUnique({ where: { code: property.code } });
      if (existing) {
        propertyMap.set(property.code, existing.id);
        summary.properties.skipped += 1;
      } else {
        summary.properties.created += 1;
        if (!dryRun) {
          const created = await tx.property.create({ data: property });
          propertyMap.set(property.code, created.id);
        }
      }
    }
    if (dryRun) {
      const existingProperties = await tx.property.findMany({ where: { code: { in: [...propertyCodes] } } });
      existingProperties.forEach((property) => propertyMap.set(property.code, property.id));
    }

    const floorPlanMap = new Map<string, string>();
    for (const floorPlan of backup.data.floorPlans) {
      const propertyId = propertyMap.get(floorPlan.propertyCode);
      const code = backupFloorPlanCode(floorPlan);
      const existing = propertyId ? await tx.floorPlan.findUnique({ where: { propertyId_code: { propertyId, code } } }) : null;
      if (existing) {
        floorPlanMap.set(floorPlanKey(floorPlan.propertyCode, code), existing.id);
        floorPlanMap.set(floorPlanKey(floorPlan.propertyCode, floorPlan.name), existing.id);
        summary.floorPlans.skipped += 1;
      } else {
        summary.floorPlans.created += 1;
        if (!dryRun && propertyId) {
          const { propertyCode: _propertyCode, ...floorPlanData } = floorPlan;
          const created = await tx.floorPlan.create({ data: { ...floorPlanData, code, propertyId } });
          floorPlanMap.set(floorPlanKey(floorPlan.propertyCode, created.code), created.id);
          floorPlanMap.set(floorPlanKey(floorPlan.propertyCode, created.name), created.id);
        }
      }
    }

    for (const option of backup.data.boardOptions) {
      const existing = await tx.labelDefinition.findUnique({ where: { fieldKey_value: { fieldKey: option.fieldKey, value: option.value } } });
      if (existing) summary.boardOptions.skipped += 1;
      else {
        summary.boardOptions.created += 1;
        if (!dryRun) await tx.labelDefinition.create({ data: option });
      }
    }

    for (const column of backup.data.boardColumns) {
      const existing = await tx.boardColumnDefinition.findUnique({ where: { fieldKey: column.fieldKey } });
      if (existing) summary.boardColumns.skipped += 1;
      else {
        summary.boardColumns.created += 1;
        if (!dryRun) await tx.boardColumnDefinition.create({ data: column });
      }
    }

    for (const section of boardSections) {
      const propertyId = propertyMap.get(section.propertyCode);
      const existing = propertyId ? await tx.boardSection.findFirst({ where: { propertyId, sectionType: section.sectionType } }) : null;
      if (existing) summary.boardSections.skipped += 1;
      else {
        summary.boardSections.created += 1;
        if (!dryRun && propertyId) {
          const { propertyCode: _propertyCode, ...sectionData } = section;
          await tx.boardSection.create({ data: { ...sectionData, propertyId } });
        }
      }
    }

    const unitMap = new Map<string, string>();
    for (const unit of backup.data.units) {
      const propertyId = propertyMap.get(unit.propertyCode);
      const existing = propertyId ? await tx.unit.findUnique({ where: { propertyId_number: { propertyId, number: unit.number } } }) : null;
      if (existing) {
        unitMap.set(`${unit.propertyCode}|${unit.number}`, existing.id);
        summary.units.skipped += 1;
      } else {
        summary.units.created += 1;
        if (!dryRun && propertyId) {
          const { propertyCode: _propertyCode, floorPlanCode, floorPlanName, ...unitData } = unit;
          const unitFloorPlanRef = floorPlanCode ?? floorPlanName;
          const floorPlanId = unitFloorPlanRef ? floorPlanMap.get(floorPlanKey(unit.propertyCode, unitFloorPlanRef)) ?? null : null;
          const created = await tx.unit.create({ data: { ...unitData, propertyId, floorPlanId } });
          unitMap.set(`${unit.propertyCode}|${unit.number}`, created.id);
        }
      }
    }

    const itemMap = new Map<string, string>();
    for (const item of backup.data.makeReadyItems) {
      const propertyId = propertyMap.get(item.propertyCode);
      const existing = propertyId ? await tx.makeReadyItem.findFirst({
        where: {
          propertyId,
          boardGroup: item.boardGroup,
          unitNumber: item.unitNumber ?? "",
          moveOutDate: dateValue(item.moveOutDate),
          moveInDate: dateValue(item.moveInDate),
        },
      }) : null;
      if (existing) {
        itemMap.set(item.portableKey, existing.id);
        summary.makeReadyItems.skipped += 1;
      } else {
        summary.makeReadyItems.created += 1;
        if (!dryRun && propertyId) {
          const unitId = item.unitNumber ? unitMap.get(`${item.propertyCode}|${item.unitNumber}`) ?? null : null;
          const created = await tx.makeReadyItem.create({
            data: {
              propertyId,
              unitId,
              boardGroup: item.boardGroup,
              itemName: item.itemName,
              unitNumber: item.unitNumber ?? item.itemName,
              floorPlan: item.floorPlan,
              applicant: item.applicant,
              assignedTech: item.assignedTech,
              scopeLevel: item.scopeLevel,
              status: item.status,
              vacancyStatus: item.vacancyStatus,
              moveOutDate: dateValue(item.moveOutDate),
              vacatedDate: dateValue(item.vacatedDate),
              makeReadyDate: dateValue(item.makeReadyDate),
              moveInDate: dateValue(item.moveInDate),
              daysVacant: item.daysVacant,
              daysUntilMoveIn: item.daysUntilMoveIn,
              priority: item.priority,
              overdue: item.overdue,
              moveInSoon: item.moveInSoon,
              riskScore: item.riskScore,
              riskLevel: item.riskLevel,
              riskReasons: item.riskReasons as Prisma.InputJsonValue,
              lastRiskEvaluatedAt: dateValue(item.lastRiskEvaluatedAt),
              completionStatus: item.completionStatus,
              sheetrockStatus: item.sheetrockStatus,
              pestStatus: item.pestStatus,
              pestTreated: item.pestTreated,
              trashOutStatus: item.trashOutStatus,
              floorsStatus: item.floorsStatus,
              flooringDate: dateValue(item.flooringDate),
              makeReadyStatus: item.makeReadyStatus,
              cleaningStatus: item.cleaningStatus,
              keysMadeStatus: item.keysMadeStatus,
              cabinetsStatus: item.cabinetsStatus,
              countertopsStatus: item.countertopsStatus,
              appliancesStatus: item.appliancesStatus,
              paintStatus: item.paintStatus,
              doorsStatus: item.doorsStatus,
              newDoorCode: item.newDoorCode,
              notes: item.notes,
              isArchived: item.isArchived,
              archivedAt: dateValue(item.archivedAt),
            },
          });
          itemMap.set(item.portableKey, created.id);
        }
      }
    }

    const fieldMap = new Map<string, string>();
    for (const field of backup.data.customFields) {
      const existing = await tx.customField.findUnique({ where: { fieldKey: field.fieldKey } });
      if (existing) {
        fieldMap.set(field.fieldKey, existing.id);
        summary.customFields.skipped += 1;
      } else {
        summary.customFields.created += 1;
        if (!dryRun) {
          const created = await tx.customField.create({ data: field });
          fieldMap.set(field.fieldKey, created.id);
        }
      }
    }
    if (dryRun) {
      const existingFields = await tx.customField.findMany({ where: { fieldKey: { in: [...fieldKeys] } } });
      existingFields.forEach((field) => fieldMap.set(field.fieldKey, field.id));
    }

    for (const track of backup.data.scheduleTracks) {
      const sourceField = track.sourceField.startsWith("custom-field:")
        ? `custom:${fieldMap.get(track.sourceField.slice(13)) ?? track.sourceField.slice(13)}`
        : track.sourceField;
      const colorSourceField = track.colorSourceField?.startsWith("custom-field:")
        ? `custom:${fieldMap.get(track.colorSourceField.slice(13)) ?? track.colorSourceField.slice(13)}`
        : track.colorSourceField;
      const existing = await tx.scheduleTrack.findUnique({ where: { sourceField } });
      if (existing) summary.scheduleTracks.skipped += 1;
      else {
        summary.scheduleTracks.created += 1;
        if (!dryRun) {
          const { sourceField: _sourceField, colorSourceField: _colorSourceField, visibilityFilter, ...data } = track;
          await tx.scheduleTrack.create({ data: { ...data, visibilityFilter: visibilityFilter ? jsonValue(visibilityFilter) : Prisma.DbNull, colorSourceField, sourceField } });
        }
      }
    }

    for (const calendar of backup.data.operatingCalendars) {
      const propertyId = propertyMap.get(calendar.propertyCode);
      const existing = propertyId ? await tx.operatingCalendar.findUnique({ where: { propertyId } }) : null;
      if (existing) summary.operatingCalendars.skipped += 1;
      else {
        summary.operatingCalendars.created += 1;
        if (!dryRun && propertyId) {
          const { propertyCode: _propertyCode, ...calendarData } = calendar;
          await tx.operatingCalendar.create({ data: { ...calendarData, propertyId } });
        }
      }
    }

    for (const policy of backup.data.riskPolicies) {
      const propertyId = propertyMap.get(policy.propertyCode);
      const existing = propertyId ? await tx.propertyRiskPolicy.findUnique({ where: { propertyId } }) : null;
      if (existing) summary.riskPolicies.skipped += 1;
      else {
        summary.riskPolicies.created += 1;
        if (!dryRun && propertyId) {
          const { propertyCode: _propertyCode, ...policyData } = policy;
          await tx.propertyRiskPolicy.create({ data: { ...policyData, propertyId } });
        }
      }
    }

    for (const option of backup.data.customFieldOptions) {
      const customFieldId = fieldMap.get(option.fieldKey);
      const existing = customFieldId ? await tx.customFieldOption.findUnique({ where: { customFieldId_label: { customFieldId, label: option.label } } }) : null;
      if (existing) summary.customFieldOptions.skipped += 1;
      else {
        summary.customFieldOptions.created += 1;
        if (!dryRun && customFieldId) {
          const { fieldKey: _fieldKey, ...optionData } = option;
          await tx.customFieldOption.create({ data: { ...optionData, customFieldId } });
        }
      }
    }

    for (const value of backup.data.customFieldValues) {
      const customFieldId = fieldMap.get(value.fieldKey);
      const itemId = itemMap.get(value.itemKey);
      const existing = customFieldId && itemId
        ? await tx.customFieldValue.findUnique({ where: { customFieldId_itemId: { customFieldId, itemId } } })
        : null;
      if (existing) summary.customFieldValues.skipped += 1;
      else {
        summary.customFieldValues.created += 1;
        if (!dryRun && customFieldId && itemId) await tx.customFieldValue.create({ data: { customFieldId, itemId, value: jsonValue(value.value) } });
      }
    }

    for (const view of backup.data.savedViews) {
      const existing = await tx.savedView.findFirst({ where: { module: view.module, name: view.name, isShared: true } });
      if (existing) summary.savedViews.skipped += 1;
      else {
        summary.savedViews.created += 1;
        if (!dryRun) {
          const columns = view.visibleColumns?.map((column) => column.startsWith("custom-field:")
            ? `custom:${fieldMap.get(column.slice(13)) ?? column.slice(13)}`
            : column) ?? null;
          await tx.savedView.create({
            data: {
              ownerUserId: null,
              name: view.name,
              module: view.module,
              viewType: view.viewType,
              filters: jsonValue(view.filters),
              sorts: nullableJson(view.sorts),
              grouping: nullableJson(view.grouping),
              visibleColumns: nullableJson(columns),
              isShared: true,
              isDefault: view.isDefault,
            },
          });
        }
      }
    }

    for (const rule of backup.data.automationRules) {
      const propertyId = rule.propertyCode ? propertyMap.get(rule.propertyCode) : null;
      if (rule.propertyCode && !propertyId) {
        summary.automationRules.conflicts += 1;
        summary.automationRules.errors.push(`Property ${rule.propertyCode} was not available for automation rule ${rule.name}`);
        continue;
      }
      const existing = await tx.automationRule.findFirst({ where: { name: rule.name, triggerType: rule.triggerType, propertyId } });
      if (existing) summary.automationRules.skipped += 1;
      else {
        summary.automationRules.created += 1;
        if (!dryRun) await tx.automationRule.create({
          data: {
            name: rule.name,
            templateId: rule.templateId ?? null,
            description: rule.description,
            propertyId,
            triggerType: rule.triggerType,
            enabled: rule.enabled,
            isArchived: rule.isArchived,
            conditions: jsonValue(rule.conditions),
            actions: jsonValue(rule.actions),
          },
        });
      }
    }

    for (const template of backup.data.checklistTemplates) {
      const propertyId = template.propertyCode ? propertyMap.get(template.propertyCode) ?? null : null;
      const existing = await tx.checklistTemplate.findFirst({ where: { propertyId, name: template.name, scope: template.scope } });
      if (existing) summary.checklistTemplates.skipped += 1;
      else {
        summary.checklistTemplates.created += 1;
        if (!dryRun) await tx.checklistTemplate.create({ data: { propertyId, name: template.name, scope: template.scope, items: { create: template.items } } });
      }
    }

    for (const entry of backup.data.chargePriceSheetItems) {
      const propertyId = propertyMap.get(entry.propertyCode);
      const existing = propertyId ? await tx.chargePriceSheetItem.findUnique({ where: { propertyId_name: { propertyId, name: entry.name } } }) : null;
      if (existing) summary.chargePriceSheetItems.skipped += 1;
      else {
        summary.chargePriceSheetItems.created += 1;
        if (!dryRun && propertyId) {
          const { propertyCode: _propertyCode, ...data } = entry;
          await tx.chargePriceSheetItem.create({ data: { ...data, propertyId } });
        }
      }
    }

    for (const comment of backup.data.comments) {
      const itemId = itemMap.get(comment.itemKey);
      const existing = itemId ? await tx.itemComment.findFirst({ where: { itemId, authorName: comment.authorName, createdAt: new Date(comment.createdAt) } }) : null;
      if (existing) summary.comments.skipped += 1;
      else {
        summary.comments.created += 1;
        if (!dryRun && itemId) {
          const item = await tx.makeReadyItem.findUniqueOrThrow({ where: { id: itemId } });
          await tx.itemComment.create({ data: { itemId, propertyId: item.propertyId, authorName: comment.authorName, body: comment.body, category: comment.category, createdAt: new Date(comment.createdAt), editedAt: comment.editedAt ? new Date(comment.editedAt) : null } });
        }
      }
    }

    const vendorMap = new Map<string, string>();
    for (const vendor of backup.data.vendors) {
      const existing = await tx.vendor.findFirst({ where: { name: vendor.name, trade: vendor.trade } });
      if (existing) {
        vendorMap.set(`${vendor.trade}|${vendor.name}`, existing.id);
        summary.vendors.skipped += 1;
      } else {
        summary.vendors.created += 1;
        if (!dryRun) {
          const propertyIds = vendor.propertyCodes.flatMap((code) => propertyMap.get(code) ? [propertyMap.get(code)!] : []);
          const created = await tx.vendor.create({
            data: {
              name: vendor.name,
              trade: vendor.trade,
              phone: vendor.phone,
              email: vendor.email,
              notes: vendor.notes,
              isActive: vendor.isActive,
              isPreferred: vendor.isPreferred,
              insuranceExpiresAt: dateValue(vendor.insuranceExpiresAt),
              licenseExpiresAt: dateValue(vendor.licenseExpiresAt),
              serviceAreas: { create: propertyIds.map((propertyId) => ({ propertyId })) },
            },
          });
          vendorMap.set(`${vendor.trade}|${vendor.name}`, created.id);
        }
      }
    }
    if (dryRun && backup.data.vendors.length > 0) {
      const existingVendors = await tx.vendor.findMany({ where: { OR: backup.data.vendors.map((vendor) => ({ name: vendor.name, trade: vendor.trade })) } });
      existingVendors.forEach((vendor) => vendorMap.set(`${vendor.trade}|${vendor.name}`, vendor.id));
    }

    const propertyMapMap = new Map<string, string>();
    for (const map of backup.data.propertyMaps) {
      const propertyId = propertyMap.get(map.propertyCode);
      const existing = propertyId ? await tx.propertyMap.findFirst({ where: { propertyId, name: map.name } }) : null;
      if (existing) {
        propertyMapMap.set(`${map.propertyCode}|${map.name}`, existing.id);
        summary.propertyMaps.skipped += 1;
      } else {
        summary.propertyMaps.created += 1;
        if (!dryRun && propertyId) {
          const { propertyCode: _propertyCode, ...mapData } = map;
          const created = await tx.propertyMap.create({ data: { ...mapData, propertyId, storedName: null } });
          propertyMapMap.set(`${map.propertyCode}|${map.name}`, created.id);
        }
      }
    }
    if (dryRun && backup.data.propertyMaps.length > 0) {
      const existingMaps = await tx.propertyMap.findMany({
        where: {
          OR: backup.data.propertyMaps.flatMap((map) => {
            const propertyId = propertyMap.get(map.propertyCode);
            return propertyId ? [{ propertyId, name: map.name }] : [];
          }),
        },
      });
      const existingProperties = await tx.property.findMany({ where: { id: { in: existingMaps.map((map) => map.propertyId) } } });
      const codeById = new Map(existingProperties.map((property) => [property.id, property.code]));
      existingMaps.forEach((map) => propertyMapMap.set(`${codeById.get(map.propertyId)}|${map.name}`, map.id));
    }

    for (const area of backup.data.propertyMapAreas) {
      const propertyId = propertyMap.get(area.propertyCode);
      const mapId = propertyMapMap.get(`${area.propertyCode}|${area.mapName}`);
      const existing = mapId ? await tx.propertyMapArea.findUnique({ where: { mapId_name: { mapId, name: area.name } } }) : null;
      if (existing) summary.propertyMapAreas.skipped += 1;
      else {
        summary.propertyMapAreas.created += 1;
        if (!dryRun && propertyId && mapId) {
          const { propertyCode: _propertyCode, mapName: _mapName, ...areaData } = area;
          await tx.propertyMapArea.create({ data: { ...areaData, propertyId, mapId } });
        }
      }
    }

    for (const location of backup.data.unitMapLocations) {
      const propertyId = propertyMap.get(location.propertyCode);
      const mapId = propertyMapMap.get(`${location.propertyCode}|${location.mapName}`);
      const unitId = unitMap.get(`${location.propertyCode}|${location.unitNumber}`);
      const existing = mapId && unitId ? await tx.unitMapLocation.findUnique({ where: { mapId_unitId: { mapId, unitId } } }) : null;
      if (existing) summary.unitMapLocations.skipped += 1;
      else {
        summary.unitMapLocations.created += 1;
        if (!dryRun && propertyId && mapId && unitId) {
          const { propertyCode: _propertyCode, mapName: _mapName, unitNumber: _unitNumber, ...locationData } = location;
          await tx.unitMapLocation.create({ data: { ...locationData, propertyId, mapId, unitId } });
        }
      }
    }

    for (const assignment of backup.data.vendorAssignments) {
      const vendorId = vendorMap.get(`${assignment.vendorTrade}|${assignment.vendorName}`);
      const itemId = itemMap.get(assignment.itemKey);
      const existing = vendorId && itemId ? await tx.vendorAssignment.findFirst({
        where: {
          vendorId,
          itemId,
          trade: assignment.trade,
          scheduledDate: dateValue(assignment.scheduledDate),
          dueDate: dateValue(assignment.dueDate),
        },
      }) : null;
      if (existing) summary.vendorAssignments.skipped += 1;
      else {
        summary.vendorAssignments.created += 1;
        if (!dryRun && vendorId && itemId) {
          const propertyId = propertyMap.get(assignment.propertyCode);
          if (propertyId) await tx.vendorAssignment.create({
            data: {
              vendorId,
              propertyId,
              itemId,
              trade: assignment.trade,
              status: assignment.status,
              scheduledDate: dateValue(assignment.scheduledDate),
              dueDate: dateValue(assignment.dueDate),
              completedAt: dateValue(assignment.completedAt),
              notes: assignment.notes,
              costEstimate: assignment.costEstimate,
              invoiceRef: assignment.invoiceRef,
            },
          });
        }
      }
    }

    for (const instance of backup.data.checklistInstances) {
      const itemId = itemMap.get(instance.itemKey);
      const existing = itemId ? await tx.checklistInstance.findFirst({ where: { itemId, name: instance.name } }) : null;
      if (existing) summary.checklistInstances.skipped += 1;
      else {
        summary.checklistInstances.created += 1;
        if (!dryRun && itemId) {
          const item = await tx.makeReadyItem.findUniqueOrThrow({ where: { id: itemId } });
          const template = instance.templateName ? await tx.checklistTemplate.findFirst({ where: { name: instance.templateName, OR: [{ propertyId: item.propertyId }, { propertyId: null }] } }) : null;
          await tx.checklistInstance.create({
            data: {
              itemId,
              propertyId: item.propertyId,
              templateId: template?.id ?? null,
              name: instance.name,
              items: { create: instance.items.map((entry) => ({ ...entry, completedAt: entry.completedAt ? new Date(entry.completedAt) : null })) },
            },
          });
        }
      }
    }

    for (const note of backup.data.notes) {
      const propertyId = propertyMap.get(note.propertyCode);
      const existing = propertyId ? await tx.propertyNote.findFirst({ where: { propertyId, title: note.title, noteType: note.noteType } }) : null;
      if (existing) summary.notes.skipped += 1;
      else {
        summary.notes.created += 1;
        if (!dryRun && propertyId) await tx.propertyNote.create({ data: { propertyId, title: note.title, body: note.body, noteType: note.noteType } });
      }
    }

    for (const template of backup.data.propertyTemplates) {
      const existing = await tx.propertyTemplate.findFirst({ where: { name: template.name, isArchived: false } });
      if (existing) summary.propertyTemplates.skipped += 1;
      else {
        summary.propertyTemplates.created += 1;
        if (!dryRun) await tx.propertyTemplate.create({
          data: {
            name: template.name,
            description: template.description,
            category: template.category,
            version: template.version,
            notes: template.notes,
            sourcePropertyCode: template.sourcePropertyCode,
            includeConfig: template.includeConfig as Prisma.InputJsonValue,
            manifest: template.manifest as Prisma.InputJsonValue,
            isArchived: template.isArchived,
          },
        });
      }
    }

    const refrigerantTypeMap = new Map<string, string>();
    for (const type of backup.data.refrigerantTypes) {
      const existing = await tx.refrigerantType.findUnique({ where: { name: type.name } });
      if (existing) {
        refrigerantTypeMap.set(type.name, existing.id);
        summary.refrigerantTypes.skipped += 1;
      } else {
        summary.refrigerantTypes.created += 1;
        if (!dryRun) {
          const created = await tx.refrigerantType.create({
            data: {
              name: type.name,
              notes: type.notes,
              isActive: type.isActive,
            },
          });
          refrigerantTypeMap.set(type.name, created.id);
        }
      }
    }
    if (dryRun && backup.data.refrigerantTypes.length > 0) {
      const existingTypes = await tx.refrigerantType.findMany({ where: { name: { in: backup.data.refrigerantTypes.map((type) => type.name) } } });
      existingTypes.forEach((type) => refrigerantTypeMap.set(type.name, type.id));
    }

    const refrigerantCylinderMap = new Map<string, string>();
    for (const cylinder of backup.data.refrigerantCylinders) {
      const existing = await tx.refrigerantCylinder.findUnique({ where: { identifier: cylinder.identifier } });
      if (existing) {
        refrigerantCylinderMap.set(cylinder.identifier, existing.id);
        summary.refrigerantCylinders.skipped += 1;
      } else {
        summary.refrigerantCylinders.created += 1;
        const refrigerantTypeId = refrigerantTypeMap.get(cylinder.refrigerantTypeName);
        if (!dryRun && refrigerantTypeId) {
          const created = await tx.refrigerantCylinder.create({
            data: {
              identifier: cylinder.identifier,
              refrigerantTypeId,
              category: cylinder.category,
              tankSize: cylinder.tankSize,
              currentWeight: cylinder.currentWeight,
              status: cylinder.status,
              notes: cylinder.notes,
              dispositionNotes: cylinder.dispositionNotes,
              finalRecoveryCompleted: cylinder.finalRecoveryCompleted,
              archivedAt: dateValue(cylinder.archivedAt),
            },
          });
          refrigerantCylinderMap.set(cylinder.identifier, created.id);
        }
      }
    }
    if (dryRun && backup.data.refrigerantCylinders.length > 0) {
      const existingCylinders = await tx.refrigerantCylinder.findMany({ where: { identifier: { in: backup.data.refrigerantCylinders.map((cylinder) => cylinder.identifier) } } });
      existingCylinders.forEach((cylinder) => refrigerantCylinderMap.set(cylinder.identifier, cylinder.id));
    }

    for (const entry of backup.data.refrigerantTransactions) {
      const propertyId = entry.propertyCode ? propertyMap.get(entry.propertyCode) ?? null : null;
      const refrigerantTypeId = refrigerantTypeMap.get(entry.refrigerantTypeName);
      const sourceCylinderId = entry.sourceCylinderIdentifier ? refrigerantCylinderMap.get(entry.sourceCylinderIdentifier) ?? null : null;
      const recoveryCylinderId = entry.recoveryCylinderIdentifier ? refrigerantCylinderMap.get(entry.recoveryCylinderIdentifier) ?? null : null;
      const existing = refrigerantTypeId ? await tx.refrigerantTransaction.findFirst({
        where: {
          transactionType: entry.transactionType,
          propertyId,
          unitNumber: entry.unitNumber,
          refrigerantTypeId,
          occurredAt: new Date(entry.occurredAt),
          amount: entry.amount,
        },
      }) : null;
      if (existing) summary.refrigerantTransactions.skipped += 1;
      else {
        summary.refrigerantTransactions.created += 1;
        if (!dryRun && refrigerantTypeId) {
          const unitId = entry.propertyCode && entry.unitNumber ? unitMap.get(`${entry.propertyCode}|${entry.unitNumber}`) ?? null : null;
          await tx.refrigerantTransaction.create({
            data: {
              transactionType: entry.transactionType,
              propertyId,
              unitId,
              unitNumber: entry.unitNumber,
              refrigerantTypeId,
              sourceCylinderId,
              recoveryCylinderId,
              occurredAt: new Date(entry.occurredAt),
              startWeight: entry.startWeight,
              endWeight: entry.endWeight,
              amount: entry.amount,
              notes: entry.notes,
              createdByName: entry.createdByName,
            },
          });
        }
      }
    }

    for (const flag of backup.data.refrigerantLeakFlags) {
      const propertyId = flag.propertyCode ? propertyMap.get(flag.propertyCode) ?? null : null;
      const refrigerantTypeId = flag.refrigerantTypeName ? refrigerantTypeMap.get(flag.refrigerantTypeName) ?? null : null;
      const unitId = flag.propertyCode ? unitMap.get(`${flag.propertyCode}|${flag.unitNumber}`) ?? null : null;
      const existing = await tx.refrigerantLeakFlag.findFirst({
        where: {
          propertyId,
          unitNumber: flag.unitNumber,
          refrigerantTypeId,
          status: flag.status,
        },
      });
      if (existing) summary.refrigerantLeakFlags.skipped += 1;
      else {
        summary.refrigerantLeakFlags.created += 1;
        if (!dryRun) {
          await tx.refrigerantLeakFlag.create({
            data: {
              propertyId,
              unitId,
              unitNumber: flag.unitNumber,
              refrigerantTypeId,
              level: flag.level,
              reason: flag.reason,
              status: flag.status,
              lastDetectedAt: new Date(flag.lastDetectedAt),
              dismissedAt: dateValue(flag.dismissedAt),
              dismissalNotes: flag.dismissalNotes,
            },
          });
        }
      }
    }

    const poolFacilityMap = new Map<string, string>();
    for (const facility of backup.data.poolFacilities) {
      const propertyId = propertyMap.get(facility.propertyCode);
      const existing = propertyId ? await tx.poolFacility.findUnique({ where: { propertyId_name: { propertyId, name: facility.name } } }) : null;
      if (existing) {
        poolFacilityMap.set(`${facility.propertyCode}|${facility.name}`, existing.id);
        summary.poolFacilities.skipped += 1;
      } else {
        summary.poolFacilities.created += 1;
        if (!dryRun && propertyId) {
          const { propertyCode: _propertyCode, ...data } = facility;
          const created = await tx.poolFacility.create({ data: { ...data, propertyId } });
          poolFacilityMap.set(`${facility.propertyCode}|${facility.name}`, created.id);
        }
      }
    }
    if (dryRun && backup.data.poolFacilities.length > 0) {
      const existingFacilities = await tx.poolFacility.findMany({
        include: { property: true },
        where: {
          OR: backup.data.poolFacilities.flatMap((facility) => {
            const propertyId = propertyMap.get(facility.propertyCode);
            return propertyId ? [{ propertyId, name: facility.name }] : [];
          }),
        },
      });
      existingFacilities.forEach((facility) => poolFacilityMap.set(`${facility.property.code}|${facility.name}`, facility.id));
    }

    const poolChemicalMap = new Map<string, string>();
    for (const chemical of backup.data.poolChemicals) {
      const propertyId = propertyMap.get(chemical.propertyCode);
      const existing = propertyId ? await tx.poolChemical.findUnique({ where: { propertyId_name: { propertyId, name: chemical.name } } }) : null;
      if (existing) {
        poolChemicalMap.set(`${chemical.propertyCode}|${chemical.name}`, existing.id);
        summary.poolChemicals.skipped += 1;
      } else {
        summary.poolChemicals.created += 1;
        if (!dryRun && propertyId) {
          const { propertyCode: _propertyCode, ...data } = chemical;
          const created = await tx.poolChemical.create({ data: { ...data, propertyId } });
          poolChemicalMap.set(`${chemical.propertyCode}|${chemical.name}`, created.id);
        }
      }
    }
    if (dryRun && backup.data.poolChemicals.length > 0) {
      const existingChemicals = await tx.poolChemical.findMany({
        include: { property: true },
        where: {
          OR: backup.data.poolChemicals.flatMap((chemical) => {
            const propertyId = propertyMap.get(chemical.propertyCode);
            return propertyId ? [{ propertyId, name: chemical.name }] : [];
          }),
        },
      });
      existingChemicals.forEach((chemical) => poolChemicalMap.set(`${chemical.property.code}|${chemical.name}`, chemical.id));
    }

    for (const target of backup.data.poolChemistryTargets) {
      const propertyId = target.propertyCode ? propertyMap.get(target.propertyCode) ?? null : null;
      const existing = await tx.poolChemistryTarget.findFirst({ where: { propertyId, facilityType: target.facilityType } });
      if (existing) summary.poolChemistryTargets.skipped += 1;
      else {
        summary.poolChemistryTargets.created += 1;
        if (!dryRun) {
          const { propertyCode: _propertyCode, ...data } = target;
          await tx.poolChemistryTarget.create({ data: { ...data, propertyId } });
        }
      }
    }

    const poolEntryMap = new Map<string, string>();
    for (const entry of backup.data.poolLogEntries) {
      const propertyId = propertyMap.get(entry.propertyCode);
      const facilityId = poolFacilityMap.get(`${entry.propertyCode}|${entry.facilityName}`);
      const logDate = new Date(entry.logDate);
      const existing = propertyId && facilityId ? await tx.poolLogEntry.findFirst({
        where: {
          propertyId,
          facilityId,
          logDate,
          logTime: entry.logTime,
        },
      }) : null;
      const entryKey = `${entry.propertyCode}|${entry.facilityName}|${entry.logDate}|${entry.logTime ?? ""}`;
      if (existing) {
        poolEntryMap.set(entryKey, existing.id);
        summary.poolLogEntries.skipped += 1;
      } else {
        summary.poolLogEntries.created += 1;
        if (!dryRun && propertyId && facilityId) {
          const { propertyCode: _propertyCode, facilityName: _facilityName, logDate: _logDate, evaluationJson, ...data } = entry;
          const created = await tx.poolLogEntry.create({
            data: {
              ...data,
              propertyId,
              facilityId,
              logDate,
              evaluationJson: evaluationJson === null ? Prisma.DbNull : jsonValue(evaluationJson),
            },
          });
          poolEntryMap.set(entryKey, created.id);
        }
      }
    }
    if (dryRun && backup.data.poolLogEntries.length > 0) {
      const existingEntries = await tx.poolLogEntry.findMany({
        include: { property: true, facility: true },
        where: {
          OR: backup.data.poolLogEntries.flatMap((entry) => {
            const propertyId = propertyMap.get(entry.propertyCode);
            const facilityId = poolFacilityMap.get(`${entry.propertyCode}|${entry.facilityName}`);
            return propertyId && facilityId ? [{ propertyId, facilityId, logDate: new Date(entry.logDate), logTime: entry.logTime }] : [];
          }),
        },
      });
      existingEntries.forEach((entry) => poolEntryMap.set(poolEntryPortableKey(entry), entry.id));
    }

    for (const check of backup.data.poolSafetyChecks) {
      const entryId = poolEntryMap.get(check.entryKey);
      const existing = entryId ? await tx.poolSafetyCheck.findFirst({ where: { entryId, label: check.label } }) : null;
      if (existing) summary.poolSafetyChecks.skipped += 1;
      else {
        summary.poolSafetyChecks.created += 1;
        if (!dryRun && entryId) {
          const { entryKey: _entryKey, ...data } = check;
          await tx.poolSafetyCheck.create({ data: { ...data, entryId } });
        }
      }
    }

    for (const addition of backup.data.poolChemicalAdditions) {
      const entryId = poolEntryMap.get(addition.entryKey);
      const existing = entryId ? await tx.poolChemicalAddition.findFirst({
        where: {
          entryId,
          chemicalName: addition.chemicalName,
          amount: addition.amount,
          unit: addition.unit,
          notes: addition.notes,
        },
      }) : null;
      if (existing) summary.poolChemicalAdditions.skipped += 1;
      else {
        summary.poolChemicalAdditions.created += 1;
        if (!dryRun && entryId) {
          const entry = await tx.poolLogEntry.findUnique({ where: { id: entryId }, include: { property: true } });
          const chemicalId = entry ? poolChemicalMap.get(`${entry.property.code}|${addition.chemicalName}`) ?? null : null;
          const { entryKey: _entryKey, ...data } = addition;
          await tx.poolChemicalAddition.create({ data: { ...data, entryId, chemicalId } });
        }
      }
    }
  };

  if (dryRun) await run(prisma);
  else await prisma.$transaction(async (tx) => run(tx));
  return summary;
}

export async function backupTransferRoutes(app: FastifyInstance) {
  app.get("/admin/export", async (request, reply) => {
    if (!(await ensureAdmin(request, reply))) return;
    const actor = request.currentUser!;
    const backup = await buildExport();
    await writeAuditLog({
      request,
      actorUserId: actor.id,
      entityType: "BACKUP",
      action: "BACKUP_EXPORTED",
      message: "Exported MakeReadyOS native backup",
    });
    reply.header("content-disposition", `attachment; filename=makereadyos-backup-${new Date().toISOString().slice(0, 10)}.json`);
    return backup;
  });

  app.post("/admin/import", async (request, reply) => {
    if (!(await ensureAdmin(request, reply))) return;
    const actor = request.currentUser!;
    let requestPayload: z.infer<typeof importSchema>;
    let backup: NativeBackup;
    try {
      requestPayload = importSchema.parse(request.body);
      backup = backupSchema.parse(requestPayload.backup);
    } catch (error) {
      reply.code(400);
      return { message: error instanceof Error ? `Invalid MakeReadyOS backup: ${error.message}` : "Invalid MakeReadyOS backup" };
    }
    const summary = await importBackup(backup, requestPayload.dryRun);
    if (!requestPayload.dryRun && !Object.values(summary).some((bucket) => bucket.errors.length > 0)) {
      await writeAuditLog({
        request,
        actorUserId: actor.id,
        entityType: "BACKUP",
        action: "BACKUP_IMPORTED",
        message: "Imported MakeReadyOS native backup in merge mode",
        metadata: { summary },
      });
    }
    return { dryRun: requestPayload.dryRun, mode: requestPayload.mode, summary };
  });
}
