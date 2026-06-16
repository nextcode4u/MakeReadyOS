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

const propertyMapPinSchema = z.object({
  propertyCode: z.string().min(1),
  mapName: z.string().min(1),
  title: z.string().min(1),
  pinType: z.string().min(1),
  xPercent: z.number().min(0).max(100),
  yPercent: z.number().min(0).max(100),
  building: z.string().nullable().optional().default(null),
  unitLabel: z.string().nullable().optional().default(null),
  area: z.string().nullable().optional().default(null),
  description: z.string().nullable().optional().default(null),
  linkedRecordType: z.string().nullable().optional().default(null),
  linkedRecordId: z.string().nullable().optional().default(null),
  tags: z.array(z.string()).optional().default([]),
  isEmergency: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
  isArchived: z.boolean().optional().default(false),
});

const propertyMapPinAttachmentBackupSchema = z.object({
  pinKey: z.string().min(1),
  propertyCode: z.string().min(1),
  uploaderName: z.string().nullable().optional().default(null),
  originalName: z.string().min(1),
  storedName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int(),
  caption: z.string().nullable().optional().default(null),
  createdAt: z.string().datetime(),
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

const propertyWikiEntryBackupSchema = z.object({
  portableKey: z.string().min(1),
  propertyCode: z.string().min(1),
  section: z.string().min(1),
  title: z.string().min(1),
  category: z.string().nullable().optional().default(null),
  building: z.string().nullable().optional().default(null),
  locationDescription: z.string().nullable().optional().default(null),
  equipmentModel: z.string().nullable().optional().default(null),
  manufacturer: z.string().nullable().optional().default(null),
  serialNumber: z.string().nullable().optional().default(null),
  installDate: nullableDate.optional().default(null),
  warrantyExpiresAt: nullableDate.optional().default(null),
  floorPlan: z.string().nullable().optional().default(null),
  unitType: z.string().nullable().optional().default(null),
  blindSizes: z.string().nullable().optional().default(null),
  hvacNotes: z.string().nullable().optional().default(null),
  waterHeaterNotes: z.string().nullable().optional().default(null),
  applianceNotes: z.string().nullable().optional().default(null),
  paintStandards: z.string().nullable().optional().default(null),
  countertopNotes: z.string().nullable().optional().default(null),
  cabinetNotes: z.string().nullable().optional().default(null),
  flooringNotes: z.string().nullable().optional().default(null),
  contactType: z.string().nullable().optional().default(null),
  contactTitle: z.string().nullable().optional().default(null),
  phone: z.string().nullable().optional().default(null),
  email: z.string().nullable().optional().default(null),
  isEmergencyContact: z.boolean().optional().default(false),
  relatedEntryKeys: z.array(z.string()).optional().default([]),
  relatedVendorKeys: z.array(z.string()).optional().default([]),
  notes: z.string().nullable().optional().default(null),
  content: z.string().nullable().optional().default(null),
  issueStatus: z.string().nullable().optional().default(null),
  tags: z.array(z.string()).optional().default([]),
  contacts: z.string().nullable().optional().default(null),
  situation: z.string().nullable().optional().default(null),
  poolCapacity: z.string().nullable().optional().default(null),
  spaCapacity: z.string().nullable().optional().default(null),
  pumpModels: z.string().nullable().optional().default(null),
  filterModels: z.string().nullable().optional().default(null),
  filterSizes: z.string().nullable().optional().default(null),
  heaterModels: z.string().nullable().optional().default(null),
  controllerNotes: z.string().nullable().optional().default(null),
  chemicalTargetNotes: z.string().nullable().optional().default(null),
  isPinned: z.boolean().optional().default(false),
  isEmergency: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
});

const propertyWikiVendorBackupSchema = z.object({
  portableKey: z.string().min(1),
  propertyCode: z.string().min(1),
  vendorType: z.string().min(1),
  companyName: z.string().min(1),
  contactName: z.string().nullable().optional().default(null),
  phone: z.string().nullable().optional().default(null),
  email: z.string().nullable().optional().default(null),
  emergencyPhone: z.string().nullable().optional().default(null),
  notes: z.string().nullable().optional().default(null),
  isActive: z.boolean().optional().default(true),
});

const propertyWikiAssetBackupSchema = z.object({
  portableKey: z.string().min(1),
  propertyCode: z.string().min(1),
  kind: z.string().min(1),
  title: z.string().min(1),
  category: z.string().nullable().optional().default(null),
  building: z.string().nullable().optional().default(null),
  description: z.string().nullable().optional().default(null),
  tags: z.array(z.string()).optional().default([]),
  isEmergency: z.boolean().optional().default(false),
  entryKey: z.string().nullable().optional().default(null),
  vendorKey: z.string().nullable().optional().default(null),
  storedName: z.string().min(1),
  originalName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int(),
  createdAt: z.string().datetime(),
});

const propertyWikiReferenceBackupSchema = z.object({
  propertyCode: z.string().min(1),
  recordType: z.enum(["MAKE_READY_ITEM", "REFRIGERANT_TRANSACTION", "POOL_LOG_ENTRY", "LEASE_COMPLIANCE_ISSUE"]),
  recordKey: z.string().min(1),
  targetType: z.enum(["ENTRY", "VENDOR", "ASSET"]),
  targetKey: z.string().min(1),
  createdAt: z.string().datetime().nullable().optional().default(null),
});

const preventiveMaintenanceTemplateBackupSchema = z.object({
  portableKey: z.string().min(1),
  propertyCode: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  description: z.string().nullable().optional().default(null),
  instructions: z.string().nullable().optional().default(null),
  frequency: z.string().min(1),
  customEveryDays: z.number().int().nullable().optional().default(null),
  annualMonth: z.number().int().nullable().optional().default(null),
  annualDay: z.number().int().nullable().optional().default(null),
  assignedRole: z.string().min(1),
  assignedUserName: z.string().nullable().optional().default(null),
  priority: z.string().min(1),
  photosRequired: z.boolean().optional().default(false),
  notesRequired: z.boolean().optional().default(false),
  passFailRequired: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
  isArchived: z.boolean().optional().default(false),
});

const preventiveMaintenanceTaskBackupSchema = z.object({
  portableKey: z.string().min(1),
  templateKey: z.string().min(1),
  propertyCode: z.string().min(1),
  taskName: z.string().min(1),
  category: z.string().min(1),
  description: z.string().nullable().optional().default(null),
  instructions: z.string().nullable().optional().default(null),
  assignedRole: z.string().min(1),
  assignedUserName: z.string().nullable().optional().default(null),
  dueDate: z.string().datetime(),
  status: z.string().min(1),
  priority: z.string().min(1),
  photosRequired: z.boolean().optional().default(false),
  notesRequired: z.boolean().optional().default(false),
  passFailRequired: z.boolean().optional().default(false),
  completionOutcome: z.string().nullable().optional().default(null),
  completionNotes: z.string().nullable().optional().default(null),
  completedByName: z.string().nullable().optional().default(null),
  completedAt: nullableDate.optional().default(null),
});

const preventiveMaintenanceTaskAttachmentBackupSchema = z.object({
  taskKey: z.string().min(1),
  propertyCode: z.string().min(1),
  uploaderName: z.string().nullable().optional().default(null),
  originalName: z.string().min(1),
  storedName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int(),
  note: z.string().nullable().optional().default(null),
  createdAt: z.string().datetime(),
});

const preventiveMaintenanceWikiReferenceBackupSchema = z.object({
  propertyCode: z.string().min(1),
  recordType: z.enum(["PM_TEMPLATE", "PM_TASK"]),
  recordKey: z.string().min(1),
  targetType: z.enum(["ENTRY", "VENDOR", "ASSET"]),
  entrySection: z.string().nullable().optional().default(null),
  targetTitle: z.string().nullable().optional().default(null),
  vendorType: z.string().nullable().optional().default(null),
  companyName: z.string().nullable().optional().default(null),
  assetKind: z.string().nullable().optional().default(null),
  originalName: z.string().nullable().optional().default(null),
  createdAt: z.string().datetime().nullable().optional().default(null),
});

const projectCategoryBackupSchema = z.object({
  propertyCode: z.string().nullable().optional().default(null),
  name: z.string().min(1),
  color: z.string().nullable().optional().default(null),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
});

const projectRecordBackupSchema = z.object({
  portableKey: z.string().min(1),
  propertyCode: z.string().min(1),
  recordType: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable().optional().default(null),
  source: z.string().nullable().optional().default(null),
  sourceRecordType: z.string().nullable().optional().default(null),
  sourceRecordId: z.string().nullable().optional().default(null),
  sourceRecordLabel: z.string().nullable().optional().default(null),
  status: z.string().min(1),
  priority: z.string().min(1),
  executionType: z.string().min(1),
  categoryName: z.string().nullable().optional().default(null),
  building: z.string().nullable().optional().default(null),
  area: z.string().nullable().optional().default(null),
  locationNotes: z.string().nullable().optional().default(null),
  propertyMapName: z.string().nullable().optional().default(null),
  pinX: z.number().min(0).max(100).nullable().optional().default(null),
  pinY: z.number().min(0).max(100).nullable().optional().default(null),
  estimatedQuantity: z.number().nullable().optional().default(null),
  quantityUnit: z.string().nullable().optional().default(null),
  estimatedCost: z.number().nullable().optional().default(null),
  actualCost: z.number().nullable().optional().default(null),
  totalAmount: z.number().nullable().optional().default(null),
  deferredMaintenance: z.boolean().optional().default(false),
  deferredReason: z.string().nullable().optional().default(null),
  targetYear: z.number().int().nullable().optional().default(null),
  deferredNotes: z.string().nullable().optional().default(null),
  budgetYear: z.string().nullable().optional().default(null),
  companyName: z.string().nullable().optional().default(null),
  contactName: z.string().nullable().optional().default(null),
  contactPhone: z.string().nullable().optional().default(null),
  contactEmail: z.string().nullable().optional().default(null),
  bidStatus: z.string().nullable().optional().default(null),
  bidNotes: z.string().nullable().optional().default(null),
  assignedUserName: z.string().nullable().optional().default(null),
  assignedRole: z.string().nullable().optional().default(null),
  assignedTeam: z.string().nullable().optional().default(null),
  scheduledDate: nullableDate.optional().default(null),
  startDate: nullableDate.optional().default(null),
  dueDate: nullableDate.optional().default(null),
  completedDate: nullableDate.optional().default(null),
  tags: z.array(z.string()).optional().default([]),
  isArchived: z.boolean().optional().default(false),
  archivedAt: nullableDate.optional().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const projectCommentBackupSchema = z.object({
  recordKey: z.string().min(1),
  propertyCode: z.string().min(1),
  authorName: z.string().nullable().optional().default(null),
  body: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const projectTaskBackupSchema = z.object({
  recordKey: z.string().min(1),
  propertyCode: z.string().min(1),
  title: z.string().min(1),
  status: z.string().min(1),
  assignedUserName: z.string().nullable().optional().default(null),
  dueDate: nullableDate.optional().default(null),
  completedByName: z.string().nullable().optional().default(null),
  completedDate: nullableDate.optional().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const projectAttachmentBackupSchema = z.object({
  recordKey: z.string().min(1),
  propertyCode: z.string().min(1),
  uploaderName: z.string().nullable().optional().default(null),
  originalName: z.string().min(1),
  storedName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int(),
  attachmentType: z.string().min(1),
  caption: z.string().nullable().optional().default(null),
  createdAt: z.string().datetime(),
});

const projectWikiReferenceBackupSchema = z.object({
  propertyCode: z.string().min(1),
  recordKey: z.string().min(1),
  targetType: z.enum(["ENTRY", "VENDOR", "ASSET"]),
  targetKey: z.string().min(1),
  createdAt: z.string().datetime().nullable().optional().default(null),
});

const pestVendorBackupSchema = z.object({
  portableKey: z.string().min(1),
  propertyCode: z.string().min(1),
  vendorName: z.string().min(1),
  primaryContact: z.string().nullable().optional().default(null),
  phone: z.string().nullable().optional().default(null),
  email: z.string().nullable().optional().default(null),
  emergencyPhone: z.string().nullable().optional().default(null),
  serviceDay: z.string().nullable().optional().default(null),
  serviceFrequency: z.string().nullable().optional().default(null),
  notes: z.string().nullable().optional().default(null),
  isActive: z.boolean().optional().default(true),
  isDefault: z.boolean().optional().default(false),
});

const pestIssueBackupSchema = z.object({
  portableKey: z.string().min(1),
  propertyCode: z.string().min(1),
  unitNumber: z.string().nullable().optional().default(null),
  makeReadyItemKey: z.string().nullable().optional().default(null),
  building: z.string().nullable().optional().default(null),
  area: z.string().nullable().optional().default(null),
  requestDate: z.string().datetime(),
  pestType: z.string().min(1),
  additionalPestType: z.string().nullable().optional().default(null),
  status: z.string().min(1),
  priority: z.string().min(1),
  source: z.string().min(1),
  vendorKey: z.string().nullable().optional().default(null),
  thirdPartyWorkOrderNumber: z.string().nullable().optional().default(null),
  reportedBy: z.string().nullable().optional().default(null),
  assignedUserName: z.string().nullable().optional().default(null),
  treatmentDate: nullableDate.optional().default(null),
  followUpRequired: z.boolean().optional().default(false),
  followUpDate: nullableDate.optional().default(null),
  followUpNotes: z.string().nullable().optional().default(null),
  description: z.string().nullable().optional().default(null),
  closedNotes: z.string().nullable().optional().default(null),
  recurringConcern: z.boolean().optional().default(false),
  managerReviewRequired: z.boolean().optional().default(false),
  recurringDismissedAt: nullableDate.optional().default(null),
  recurringDismissalNotes: z.string().nullable().optional().default(null),
  closedAt: nullableDate.optional().default(null),
  isArchived: z.boolean().optional().default(false),
  archivedAt: nullableDate.optional().default(null),
  archiveNotes: z.string().nullable().optional().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const pestIssueNoteBackupSchema = z.object({
  issueKey: z.string().min(1),
  propertyCode: z.string().min(1),
  authorName: z.string().nullable().optional().default(null),
  body: z.string().min(1),
  createdAt: z.string().datetime(),
});

const pestAttachmentBackupSchema = z.object({
  issueKey: z.string().min(1),
  propertyCode: z.string().min(1),
  uploaderName: z.string().nullable().optional().default(null),
  photoType: z.string().min(1),
  caption: z.string().nullable().optional().default(null),
  originalName: z.string().min(1),
  storedName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int(),
  createdAt: z.string().datetime(),
});

const leaseComplianceIssueTypeBackupSchema = z.object({
  propertyCode: z.string().min(1),
  name: z.string().min(1),
  color: z.string().nullable().optional().default(null),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const leaseComplianceSettingsBackupSchema = z.object({
  propertyCode: z.string().min(1),
  defaultPriority: z.string().min(1),
  watchDays: z.number().int(),
  warningDays: z.number().int(),
  criticalDays: z.number().int(),
  firstNoticeLabel: z.string().min(1),
  secondNoticeLabel: z.string().min(1),
  thirdNoticeLabel: z.string().min(1),
  archiveResolvedAfterDays: z.number().int().nullable().optional().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const leaseComplianceIssueBackupSchema = z.object({
  portableKey: z.string().min(1),
  propertyCode: z.string().min(1),
  unitNumber: z.string().nullable().optional().default(null),
  issueTypeKey: z.string().nullable().optional().default(null),
  propertyMapName: z.string().nullable().optional().default(null),
  building: z.string().nullable().optional().default(null),
  area: z.string().nullable().optional().default(null),
  issueTypeName: z.string().min(1),
  additionalIssueType: z.string().nullable().optional().default(null),
  status: z.string().min(1),
  noticeStage: z.string().min(1),
  priority: z.string().min(1),
  source: z.string().min(1),
  description: z.string().nullable().optional().default(null),
  locationNotes: z.string().nullable().optional().default(null),
  tags: z.array(z.string()).optional().default([]),
  assignedUserName: z.string().nullable().optional().default(null),
  lastPersistenceCheckDate: z.string().datetime().nullable().optional().default(null),
  daysOpenOverride: z.number().int().nullable().optional().default(null),
  persistenceCount: z.number().int().default(0),
  residentNotifiedDate: z.string().datetime().nullable().optional().default(null),
  notice1Date: z.string().datetime().nullable().optional().default(null),
  notice2Date: z.string().datetime().nullable().optional().default(null),
  notice3Date: z.string().datetime().nullable().optional().default(null),
  violationNeededDate: z.string().datetime().nullable().optional().default(null),
  recurringConcern: z.boolean().default(false),
  managerReviewRequired: z.boolean().default(false),
  recurringDismissedAt: z.string().datetime().nullable().optional().default(null),
  recurringDismissalNotes: z.string().nullable().optional().default(null),
  resolvedDate: z.string().datetime().nullable().optional().default(null),
  resolutionNotes: z.string().nullable().optional().default(null),
  isArchived: z.boolean().default(false),
  archiveDate: z.string().datetime().nullable().optional().default(null),
  archiveNotes: z.string().nullable().optional().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const leaseComplianceIssueNoteBackupSchema = z.object({
  issueKey: z.string().min(1),
  propertyCode: z.string().min(1),
  authorName: z.string().nullable().optional().default(null),
  body: z.string().min(1),
  createdAt: z.string().datetime(),
});

const leaseComplianceIssuePhotoBackupSchema = z.object({
  issueKey: z.string().min(1),
  propertyCode: z.string().min(1),
  uploaderName: z.string().nullable().optional().default(null),
  photoCategory: z.string().min(1),
  caption: z.string().nullable().optional().default(null),
  originalName: z.string().min(1),
  storedName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int(),
  createdAt: z.string().datetime(),
});

const leaseComplianceNoticeActionBackupSchema = z.object({
  issueKey: z.string().min(1),
  propertyCode: z.string().min(1),
  actedByName: z.string().nullable().optional().default(null),
  action: z.string().min(1),
  noticeStage: z.string().min(1),
  notes: z.string().nullable().optional().default(null),
  createdAt: z.string().datetime(),
});

const leaseCompliancePersistenceCheckBackupSchema = z.object({
  issueKey: z.string().min(1),
  propertyCode: z.string().min(1),
  checkedByName: z.string().nullable().optional().default(null),
  stillPersists: z.boolean().default(true),
  notes: z.string().nullable().optional().default(null),
  createdAt: z.string().datetime(),
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
    propertyMapPins: z.array(propertyMapPinSchema).optional().default([]),
    propertyMapPinAttachments: z.array(propertyMapPinAttachmentBackupSchema).optional().default([]),
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
    propertyWikiEntries: z.array(propertyWikiEntryBackupSchema).optional().default([]),
    propertyWikiVendors: z.array(propertyWikiVendorBackupSchema).optional().default([]),
    propertyWikiAssets: z.array(propertyWikiAssetBackupSchema).optional().default([]),
    propertyWikiReferences: z.array(propertyWikiReferenceBackupSchema).optional().default([]),
    preventiveMaintenanceTemplates: z.array(preventiveMaintenanceTemplateBackupSchema).optional().default([]),
    preventiveMaintenanceTasks: z.array(preventiveMaintenanceTaskBackupSchema).optional().default([]),
    preventiveMaintenanceTaskAttachments: z.array(preventiveMaintenanceTaskAttachmentBackupSchema).optional().default([]),
    preventiveMaintenanceWikiReferences: z.array(preventiveMaintenanceWikiReferenceBackupSchema).optional().default([]),
    projectCategories: z.array(projectCategoryBackupSchema).optional().default([]),
    projectRecords: z.array(projectRecordBackupSchema).optional().default([]),
    projectComments: z.array(projectCommentBackupSchema).optional().default([]),
    projectTasks: z.array(projectTaskBackupSchema).optional().default([]),
    projectAttachments: z.array(projectAttachmentBackupSchema).optional().default([]),
    projectWikiReferences: z.array(projectWikiReferenceBackupSchema).optional().default([]),
    pestVendors: z.array(pestVendorBackupSchema).optional().default([]),
    pestIssues: z.array(pestIssueBackupSchema).optional().default([]),
    pestIssueNotes: z.array(pestIssueNoteBackupSchema).optional().default([]),
    pestAttachments: z.array(pestAttachmentBackupSchema).optional().default([]),
    leaseComplianceIssueTypes: z.array(leaseComplianceIssueTypeBackupSchema).optional().default([]),
    leaseComplianceSettings: z.array(leaseComplianceSettingsBackupSchema).optional().default([]),
    leaseComplianceIssues: z.array(leaseComplianceIssueBackupSchema).optional().default([]),
    leaseComplianceIssueNotes: z.array(leaseComplianceIssueNoteBackupSchema).optional().default([]),
    leaseComplianceIssuePhotos: z.array(leaseComplianceIssuePhotoBackupSchema).optional().default([]),
    leaseComplianceNoticeActions: z.array(leaseComplianceNoticeActionBackupSchema).optional().default([]),
    leaseCompliancePersistenceChecks: z.array(leaseCompliancePersistenceCheckBackupSchema).optional().default([]),
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

function propertyMapPinPortableKey(pin: {
  propertyCode: string;
  mapName: string;
  title: string;
  pinType: string;
  xPercent: number;
  yPercent: number;
}) {
  return [pin.propertyCode, pin.mapName, pin.title, pin.pinType, pin.xPercent, pin.yPercent].join("|");
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
    propertyMapPins: bucket(),
    propertyMapPinAttachments: bucket(),
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
    propertyWikiEntries: bucket(),
    propertyWikiVendors: bucket(),
    propertyWikiAssets: bucket(),
    propertyWikiReferences: bucket(),
    preventiveMaintenanceTemplates: bucket(),
    preventiveMaintenanceTasks: bucket(),
    preventiveMaintenanceTaskAttachments: bucket(),
    preventiveMaintenanceWikiReferences: bucket(),
    projectCategories: bucket(),
    projectRecords: bucket(),
    projectComments: bucket(),
    projectTasks: bucket(),
    projectAttachments: bucket(),
    projectWikiReferences: bucket(),
    pestVendors: bucket(),
    pestIssues: bucket(),
    pestIssueNotes: bucket(),
    pestAttachments: bucket(),
    leaseComplianceIssueTypes: bucket(),
    leaseComplianceSettings: bucket(),
    leaseComplianceIssues: bucket(),
    leaseComplianceIssueNotes: bucket(),
    leaseComplianceIssuePhotos: bucket(),
    leaseComplianceNoticeActions: bucket(),
    leaseCompliancePersistenceChecks: bucket(),
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

function preventiveMaintenanceTemplatePortableKey(template: {
  propertyCode: string;
  name: string;
  category: string;
  frequency: string;
  customEveryDays: number | null;
  annualMonth: number | null;
  annualDay: number | null;
}) {
  return [
    template.propertyCode,
    template.name,
    template.category,
    template.frequency,
    template.customEveryDays ?? "",
    template.annualMonth ?? "",
    template.annualDay ?? "",
  ].join("|");
}

function preventiveMaintenanceTaskPortableKey(task: {
  templateKey: string;
  taskName: string;
  dueDate: string;
}) {
  return [task.templateKey, task.taskName, task.dueDate].join("|");
}

function refrigerantTransactionPortableKey(entry: {
  transactionType: string;
  propertyCode: string | null;
  unitNumber: string | null;
  refrigerantTypeName: string;
  occurredAt: string;
  amount: number;
}) {
  return [entry.transactionType, entry.propertyCode ?? "", entry.unitNumber ?? "", entry.refrigerantTypeName, entry.occurredAt, entry.amount].join("|");
}

function propertyWikiEntryPortableKey(entry: {
  propertyCode: string;
  section: string;
  title: string;
}) {
  return [entry.propertyCode, entry.section, entry.title].join("|");
}

function propertyWikiVendorPortableKey(vendor: {
  propertyCode: string;
  vendorType: string;
  companyName: string;
}) {
  return [vendor.propertyCode, vendor.vendorType, vendor.companyName].join("|");
}

function propertyWikiAssetPortableKey(asset: {
  propertyCode: string;
  kind: string;
  storedName: string;
}) {
  return [asset.propertyCode, asset.kind, asset.storedName].join("|");
}

function projectCategoryPortableKey(category: {
  propertyCode: string | null;
  name: string;
}) {
  return [category.propertyCode ?? "global", category.name].join("|");
}

function projectRecordPortableKey(record: {
  propertyCode: string;
  recordType: string;
  title: string;
  createdAt: string;
}) {
  return [record.propertyCode, record.recordType, record.title, record.createdAt].join("|");
}

function pestVendorPortableKey(vendor: {
  propertyCode: string;
  vendorName: string;
}) {
  return [vendor.propertyCode, vendor.vendorName].join("|");
}

function pestIssuePortableKey(issue: {
  propertyCode: string;
  unitNumber: string | null;
  area: string | null;
  pestType: string;
  requestDate: string;
}) {
  return [issue.propertyCode, issue.unitNumber ?? "", issue.area ?? "", issue.pestType, issue.requestDate].join("|");
}

function leaseComplianceIssueTypePortableKey(issueType: {
  propertyCode: string;
  name: string;
}) {
  return [issueType.propertyCode, issueType.name].join("|");
}

function leaseComplianceIssuePortableKey(issue: {
  propertyCode: string;
  unitNumber: string | null;
  building: string | null;
  area: string | null;
  issueTypeName: string;
  createdAt: string;
}) {
  return [issue.propertyCode, issue.unitNumber ?? "", issue.building ?? "", issue.area ?? "", issue.issueTypeName, issue.createdAt].join("|");
}

async function ensureAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (await requireAdmin(request, reply)) return false;
  return true;
}

async function buildExport(): Promise<NativeBackup> {
  const [properties, floorPlans, boardOptions, boardColumns, boardSections, scheduleTracks, operatingCalendars, riskPolicies, units, items, fields, savedViews, rules, templates, chargePriceSheetItems, comments, vendors, vendorAssignments, propertyMaps, propertyMapAreas, propertyMapPins, propertyMapPinAttachments, unitMapLocations, checklistInstances, notes, propertyTemplates, refrigerantTypes, refrigerantCylinders, refrigerantTransactions, refrigerantLeakFlags, poolFacilities, poolChemicals, poolChemistryTargets, poolLogEntries, poolSafetyChecks, poolChemicalAdditions, propertyWikiReferences, preventiveMaintenanceTemplates, preventiveMaintenanceTasks, preventiveMaintenanceWikiReferences, wikiEntries, wikiVendors, wikiAssets, projectCategories, projectRecords, pestVendors, pestIssues, leaseComplianceIssueTypes, leaseComplianceSettings, leaseComplianceIssues] = await Promise.all([
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
    prisma.propertyMapPin.findMany({ include: { property: true, map: true }, orderBy: [{ property: { code: "asc" } }, { createdAt: "asc" }] }),
    prisma.propertyMapPinAttachment.findMany({ include: { property: true, pin: { include: { property: true, map: true } } }, orderBy: [{ createdAt: "asc" }] }),
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
    prisma.propertyWikiReference.findMany({
      where: { recordType: { in: ["MAKE_READY_ITEM", "REFRIGERANT_TRANSACTION", "POOL_LOG_ENTRY", "LEASE_COMPLIANCE_ISSUE"] } },
      include: { property: true },
      orderBy: [{ createdAt: "asc" }],
    }),
    prisma.preventiveMaintenanceTemplate.findMany({ include: { property: true }, orderBy: [{ property: { code: "asc" } }, { category: "asc" }, { name: "asc" }] }),
    prisma.preventiveMaintenanceTask.findMany({
      include: {
        property: true,
        template: { include: { property: true } },
        attachments: { orderBy: [{ createdAt: "asc" }, { originalName: "asc" }] },
      },
      orderBy: [{ dueDate: "asc" }, { taskName: "asc" }],
    }),
    prisma.propertyWikiReference.findMany({
      where: { recordType: { in: ["PM_TEMPLATE", "PM_TASK"] } },
      include: { property: true },
      orderBy: [{ createdAt: "asc" }],
    }),
    prisma.propertyWikiEntry.findMany({ orderBy: [{ createdAt: "asc" }] }),
    prisma.propertyWikiVendor.findMany({ orderBy: [{ createdAt: "asc" }] }),
    prisma.propertyWikiAsset.findMany({ orderBy: [{ createdAt: "asc" }] }),
    prisma.projectCategory.findMany({ include: { property: true }, orderBy: [{ propertyId: "asc" }, { sortOrder: "asc" }, { name: "asc" }] }),
    prisma.projectRecord.findMany({
      include: {
        property: true,
        propertyMap: true,
        attachments: { orderBy: { createdAt: "asc" } },
        comments: { orderBy: { createdAt: "asc" } },
        tasks: { orderBy: { createdAt: "asc" } },
        wikiReferences: { orderBy: { createdAt: "asc" } },
      },
      orderBy: [{ createdAt: "asc" }],
    }),
    prisma.pestVendor.findMany({ include: { property: true }, orderBy: [{ property: { code: "asc" } }, { vendorName: "asc" }] }),
    prisma.pestIssue.findMany({
      include: {
        property: true,
        unit: true,
        vendor: { include: { property: true } },
        makeReadyItem: { include: { property: true } },
        notes: { orderBy: { createdAt: "asc" } },
        attachments: { orderBy: { createdAt: "asc" } },
      },
      orderBy: [{ createdAt: "asc" }],
    }),
    prisma.leaseComplianceIssueType.findMany({ include: { property: true }, orderBy: [{ property: { code: "asc" } }, { sortOrder: "asc" }, { name: "asc" }] }),
    prisma.leaseComplianceSettings.findMany({ include: { property: true }, orderBy: [{ property: { code: "asc" } }] }),
    prisma.leaseComplianceIssue.findMany({
      include: {
        property: true,
        unit: true,
        issueType: { include: { property: true } },
        propertyMap: true,
        notes: { orderBy: { createdAt: "asc" } },
        photos: { orderBy: { createdAt: "asc" } },
        noticeActions: { orderBy: { createdAt: "asc" } },
        persistenceChecks: { orderBy: { createdAt: "asc" } },
      },
      orderBy: [{ createdAt: "asc" }],
    }),
  ]);
  const fieldKeysById = new Map(fields.map((field) => [field.id, field.fieldKey]));
  const itemKeysById = new Map(items.map((item) => [item.id, itemPortableKey(item)]));
  const refrigerantTransactionKeysById = new Map(
    refrigerantTransactions.map((entry) => [entry.id, refrigerantTransactionPortableKey({
      transactionType: entry.transactionType,
      propertyCode: properties.find((candidate) => candidate.id === entry.propertyId)?.code ?? null,
      unitNumber: entry.unitNumber,
      refrigerantTypeName: entry.refrigerantType.name,
      occurredAt: entry.occurredAt.toISOString(),
      amount: entry.amount,
    })]),
  );
  const wikiEntryKeysById = new Map(
    wikiEntries.map((entry) => [entry.id, propertyWikiEntryPortableKey({
      propertyCode: properties.find((candidate) => candidate.id === entry.propertyId)?.code ?? "",
      section: entry.section,
      title: entry.title,
    })]),
  );
  const wikiVendorKeysById = new Map(
    wikiVendors.map((vendor) => [vendor.id, propertyWikiVendorPortableKey({
      propertyCode: properties.find((candidate) => candidate.id === vendor.propertyId)?.code ?? "",
      vendorType: vendor.vendorType,
      companyName: vendor.companyName,
    })]),
  );
  const wikiAssetKeysById = new Map(
    wikiAssets.map((asset) => [asset.id, propertyWikiAssetPortableKey({
      propertyCode: properties.find((candidate) => candidate.id === asset.propertyId)?.code ?? "",
      kind: asset.kind,
      storedName: asset.storedName,
    })]),
  );
  const projectRecordKeysById = new Map(
    projectRecords.map((record) => [record.id, projectRecordPortableKey({
      propertyCode: record.property.code,
      recordType: record.recordType,
      title: record.title,
      createdAt: record.createdAt.toISOString(),
    })]),
  );
  const pestVendorKeysById = new Map(
    pestVendors.map((vendor) => [vendor.id, pestVendorPortableKey({
      propertyCode: vendor.property.code,
      vendorName: vendor.vendorName,
    })]),
  );
  const pestIssueKeysById = new Map(
    pestIssues.map((issue) => [issue.id, pestIssuePortableKey({
      propertyCode: issue.property.code,
      unitNumber: issue.unit?.number ?? null,
      area: issue.area,
      pestType: issue.pestType,
      requestDate: issue.requestDate.toISOString(),
    })]),
  );
  const leaseComplianceIssueTypeKeysById = new Map(
    leaseComplianceIssueTypes.map((issueType) => [issueType.id, leaseComplianceIssueTypePortableKey({
      propertyCode: issueType.property.code,
      name: issueType.name,
    })]),
  );
  const leaseComplianceIssueKeysById = new Map(
    leaseComplianceIssues.map((issue) => [issue.id, leaseComplianceIssuePortableKey({
      propertyCode: issue.property.code,
      unitNumber: issue.unit?.number ?? null,
      building: issue.building,
      area: issue.area,
      issueTypeName: issue.issueTypeName,
      createdAt: issue.createdAt.toISOString(),
    })]),
  );
  const preventiveMaintenanceTemplateKeysById = new Map(
    preventiveMaintenanceTemplates.map((template) => [template.id, preventiveMaintenanceTemplatePortableKey({
      propertyCode: template.property.code,
      name: template.name,
      category: template.category,
      frequency: template.frequency,
      customEveryDays: template.customEveryDays,
      annualMonth: template.annualMonth,
      annualDay: template.annualDay,
    })]),
  );
  const preventiveMaintenanceTaskKeysById = new Map(
    preventiveMaintenanceTasks
      .map((task) => {
        const templateKey = preventiveMaintenanceTemplateKeysById.get(task.templateId);
        return templateKey ? [task.id, preventiveMaintenanceTaskPortableKey({
          templateKey,
          taskName: task.taskName,
          dueDate: task.dueDate.toISOString(),
        })] : null;
      })
      .filter((entry): entry is [string, string] => Boolean(entry)),
  );
  const wikiEntriesById = new Map(wikiEntries.map((entry) => [entry.id, entry]));
  const wikiVendorsById = new Map(wikiVendors.map((vendor) => [vendor.id, vendor]));
  const wikiAssetsById = new Map(wikiAssets.map((asset) => [asset.id, asset]));
  const portableColumns = (columns: unknown) => Array.isArray(columns)
    ? columns.map((column) => typeof column === "string" && column.startsWith("custom:")
      ? `custom-field:${fieldKeysById.get(column.slice(7)) ?? column.slice(7)}`
      : String(column))
    : null;
  const portablePreventiveMaintenanceTemplates: z.infer<typeof preventiveMaintenanceTemplateBackupSchema>[] = preventiveMaintenanceTemplates.map((template) => ({
    portableKey: preventiveMaintenanceTemplateKeysById.get(template.id) ?? preventiveMaintenanceTemplatePortableKey({
      propertyCode: template.property.code,
      name: template.name,
      category: template.category,
      frequency: template.frequency,
      customEveryDays: template.customEveryDays,
      annualMonth: template.annualMonth,
      annualDay: template.annualDay,
    }),
    propertyCode: template.property.code,
    name: template.name,
    category: template.category,
    description: template.description,
    instructions: template.instructions,
    frequency: template.frequency,
    customEveryDays: template.customEveryDays,
    annualMonth: template.annualMonth,
    annualDay: template.annualDay,
    assignedRole: template.assignedRole,
    assignedUserName: template.assignedUserName,
    photosRequired: template.photosRequired,
    notesRequired: template.notesRequired,
    passFailRequired: template.passFailRequired,
    priority: template.priority,
    isActive: template.isActive,
    isArchived: template.isArchived,
  }));
  const portablePreventiveMaintenanceTasks: z.infer<typeof preventiveMaintenanceTaskBackupSchema>[] = preventiveMaintenanceTasks.flatMap((task) => {
    const templateKey = preventiveMaintenanceTemplateKeysById.get(task.templateId);
    const portableKey = preventiveMaintenanceTaskKeysById.get(task.id);
    return templateKey && portableKey ? [{
      portableKey,
      templateKey,
      propertyCode: task.property.code,
      taskName: task.taskName,
      category: task.category,
      description: task.description,
      instructions: task.instructions,
      assignedRole: task.assignedRole,
      assignedUserName: task.assignedUserName,
      dueDate: task.dueDate.toISOString(),
      status: task.status,
      priority: task.priority,
      photosRequired: task.photosRequired,
      notesRequired: task.notesRequired,
      passFailRequired: task.passFailRequired,
      completionOutcome: task.completionOutcome,
      completionNotes: task.completionNotes,
      completedByName: task.completedByName,
      completedAt: task.completedAt?.toISOString() ?? null,
    }] : [];
  });
  const portablePreventiveMaintenanceTaskAttachments: z.infer<typeof preventiveMaintenanceTaskAttachmentBackupSchema>[] = preventiveMaintenanceTasks.flatMap((task) => {
    const taskKey = preventiveMaintenanceTaskKeysById.get(task.id);
    return taskKey ? task.attachments.map((attachment) => ({
      taskKey,
      propertyCode: task.property.code,
      uploaderName: attachment.uploaderName,
      originalName: attachment.originalName,
      storedName: attachment.storedName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      note: attachment.note,
      createdAt: attachment.createdAt.toISOString(),
    })) : [];
  });
  const portablePreventiveMaintenanceWikiReferences: z.infer<typeof preventiveMaintenanceWikiReferenceBackupSchema>[] = [];
  for (const reference of preventiveMaintenanceWikiReferences) {
    const recordKey = reference.recordType === "PM_TEMPLATE"
      ? preventiveMaintenanceTemplateKeysById.get(reference.recordId)
      : preventiveMaintenanceTaskKeysById.get(reference.recordId);
    if (!recordKey) continue;
    if (reference.targetType === "ENTRY") {
      const target = wikiEntriesById.get(reference.targetId);
      if (!target) continue;
      portablePreventiveMaintenanceWikiReferences.push({
        propertyCode: reference.property.code,
        recordType: reference.recordType as "PM_TEMPLATE" | "PM_TASK",
        recordKey,
        targetType: "ENTRY",
        entrySection: target.section,
        targetTitle: target.title,
        vendorType: null,
        companyName: null,
        assetKind: null,
        originalName: null,
        createdAt: reference.createdAt.toISOString(),
      });
      continue;
    }
    if (reference.targetType === "VENDOR") {
      const target = wikiVendorsById.get(reference.targetId);
      if (!target) continue;
      portablePreventiveMaintenanceWikiReferences.push({
        propertyCode: reference.property.code,
        recordType: reference.recordType as "PM_TEMPLATE" | "PM_TASK",
        recordKey,
        targetType: "VENDOR",
        entrySection: null,
        targetTitle: null,
        vendorType: target.vendorType,
        companyName: target.companyName,
        assetKind: null,
        originalName: null,
        createdAt: reference.createdAt.toISOString(),
      });
      continue;
    }
    const target = wikiAssetsById.get(reference.targetId);
    if (!target) continue;
    portablePreventiveMaintenanceWikiReferences.push({
      propertyCode: reference.property.code,
      recordType: reference.recordType as "PM_TEMPLATE" | "PM_TASK",
      recordKey,
      targetType: "ASSET",
      entrySection: null,
      targetTitle: target.title,
      vendorType: null,
      companyName: null,
      assetKind: target.kind,
      originalName: target.originalName,
      createdAt: reference.createdAt.toISOString(),
    });
  }

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
      propertyMapPins: propertyMapPins.map((pin) => ({
        propertyCode: pin.property.code,
        mapName: pin.map.name,
        title: pin.title,
        pinType: pin.pinType,
        xPercent: pin.xPercent,
        yPercent: pin.yPercent,
        building: pin.building,
        unitLabel: pin.unitLabel,
        area: pin.area,
        description: pin.description,
        linkedRecordType: pin.linkedRecordType,
        linkedRecordId: pin.linkedRecordId,
        tags: pin.tags,
        isEmergency: pin.isEmergency,
        isActive: pin.isActive,
        isArchived: pin.isArchived,
      })),
      propertyMapPinAttachments: propertyMapPinAttachments.map((attachment) => ({
        pinKey: propertyMapPinPortableKey({
          propertyCode: attachment.pin.property.code,
          mapName: attachment.pin.map.name,
          title: attachment.pin.title,
          pinType: attachment.pin.pinType,
          xPercent: attachment.pin.xPercent,
          yPercent: attachment.pin.yPercent,
        }),
        propertyCode: attachment.property.code,
        uploaderName: attachment.uploaderName,
        originalName: attachment.originalName,
        storedName: attachment.storedName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        caption: attachment.caption,
        createdAt: attachment.createdAt.toISOString(),
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
      propertyWikiEntries: wikiEntries.map((entry) => ({
        portableKey: wikiEntryKeysById.get(entry.id) ?? propertyWikiEntryPortableKey({
          propertyCode: properties.find((candidate) => candidate.id === entry.propertyId)?.code ?? "",
          section: entry.section,
          title: entry.title,
        }),
        propertyCode: properties.find((candidate) => candidate.id === entry.propertyId)?.code ?? "",
        section: entry.section,
        title: entry.title,
        category: entry.category,
        building: entry.building,
        locationDescription: entry.locationDescription,
        equipmentModel: entry.equipmentModel,
        manufacturer: entry.manufacturer,
        serialNumber: entry.serialNumber,
        installDate: entry.installDate?.toISOString() ?? null,
        warrantyExpiresAt: entry.warrantyExpiresAt?.toISOString() ?? null,
        floorPlan: entry.floorPlan,
        unitType: entry.unitType,
        blindSizes: entry.blindSizes,
        hvacNotes: entry.hvacNotes,
        waterHeaterNotes: entry.waterHeaterNotes,
        applianceNotes: entry.applianceNotes,
        paintStandards: entry.paintStandards,
        countertopNotes: entry.countertopNotes,
        cabinetNotes: entry.cabinetNotes,
        flooringNotes: entry.flooringNotes,
        contactType: entry.contactType,
        contactTitle: entry.contactTitle,
        phone: entry.phone,
        email: entry.email,
        isEmergencyContact: entry.isEmergencyContact,
        relatedEntryKeys: entry.relatedEntryIds.map((id) => wikiEntryKeysById.get(id)).filter((value): value is string => Boolean(value)),
        relatedVendorKeys: entry.relatedVendorIds.map((id) => wikiVendorKeysById.get(id)).filter((value): value is string => Boolean(value)),
        notes: entry.notes,
        content: entry.content,
        issueStatus: entry.issueStatus,
        tags: entry.tags,
        contacts: entry.contacts,
        situation: entry.situation,
        poolCapacity: entry.poolCapacity,
        spaCapacity: entry.spaCapacity,
        pumpModels: entry.pumpModels,
        filterModels: entry.filterModels,
        filterSizes: entry.filterSizes,
        heaterModels: entry.heaterModels,
        controllerNotes: entry.controllerNotes,
        chemicalTargetNotes: entry.chemicalTargetNotes,
        isPinned: entry.isPinned,
        isEmergency: entry.isEmergency,
        isActive: entry.isActive,
      })),
      propertyWikiVendors: wikiVendors.map((vendor) => ({
        portableKey: wikiVendorKeysById.get(vendor.id) ?? propertyWikiVendorPortableKey({
          propertyCode: properties.find((candidate) => candidate.id === vendor.propertyId)?.code ?? "",
          vendorType: vendor.vendorType,
          companyName: vendor.companyName,
        }),
        propertyCode: properties.find((candidate) => candidate.id === vendor.propertyId)?.code ?? "",
        vendorType: vendor.vendorType,
        companyName: vendor.companyName,
        contactName: vendor.contactName,
        phone: vendor.phone,
        email: vendor.email,
        emergencyPhone: vendor.emergencyPhone,
        notes: vendor.notes,
        isActive: vendor.isActive,
      })),
      propertyWikiAssets: wikiAssets.map((asset) => ({
        portableKey: wikiAssetKeysById.get(asset.id) ?? propertyWikiAssetPortableKey({
          propertyCode: properties.find((candidate) => candidate.id === asset.propertyId)?.code ?? "",
          kind: asset.kind,
          storedName: asset.storedName,
        }),
        propertyCode: properties.find((candidate) => candidate.id === asset.propertyId)?.code ?? "",
        kind: asset.kind,
        title: asset.title,
        category: asset.category,
        building: asset.building,
        description: asset.description,
        tags: asset.tags,
        isEmergency: asset.isEmergency,
        entryKey: asset.entryId ? wikiEntryKeysById.get(asset.entryId) ?? null : null,
        vendorKey: asset.vendorId ? wikiVendorKeysById.get(asset.vendorId) ?? null : null,
        storedName: asset.storedName,
        originalName: asset.originalName,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        createdAt: asset.createdAt.toISOString(),
      })),
      propertyWikiReferences: propertyWikiReferences.flatMap((reference) => {
        const recordKey = reference.recordType === "MAKE_READY_ITEM"
          ? itemKeysById.get(reference.recordId)
          : reference.recordType === "REFRIGERANT_TRANSACTION"
            ? refrigerantTransactionKeysById.get(reference.recordId)
            : reference.recordType === "POOL_LOG_ENTRY"
              ? poolLogEntries.find((entry) => entry.id === reference.recordId)
                ? poolEntryPortableKey(poolLogEntries.find((entry) => entry.id === reference.recordId)!)
                : null
              : leaseComplianceIssueKeysById.get(reference.recordId) ?? null;
        const targetKey = reference.targetType === "ENTRY"
          ? wikiEntryKeysById.get(reference.targetId)
          : reference.targetType === "VENDOR"
            ? wikiVendorKeysById.get(reference.targetId)
            : wikiAssetKeysById.get(reference.targetId);
        return recordKey && targetKey ? [{
          propertyCode: reference.property.code,
          recordType: reference.recordType as "MAKE_READY_ITEM" | "REFRIGERANT_TRANSACTION" | "POOL_LOG_ENTRY" | "LEASE_COMPLIANCE_ISSUE",
          recordKey,
          targetType: reference.targetType as "ENTRY" | "VENDOR" | "ASSET",
          targetKey,
          createdAt: reference.createdAt.toISOString(),
        }] : [];
      }),
      preventiveMaintenanceTemplates: portablePreventiveMaintenanceTemplates,
      preventiveMaintenanceTasks: portablePreventiveMaintenanceTasks,
      preventiveMaintenanceTaskAttachments: portablePreventiveMaintenanceTaskAttachments,
      preventiveMaintenanceWikiReferences: portablePreventiveMaintenanceWikiReferences,
      projectCategories: projectCategories.map((category) => ({
        propertyCode: category.property?.code ?? null,
        name: category.name,
        color: category.color,
        isActive: category.isActive,
        sortOrder: category.sortOrder,
      })),
      projectRecords: projectRecords.map((record) => ({
        portableKey: projectRecordKeysById.get(record.id) ?? projectRecordPortableKey({
          propertyCode: record.property.code,
          recordType: record.recordType,
          title: record.title,
          createdAt: record.createdAt.toISOString(),
        }),
        propertyCode: record.property.code,
        recordType: record.recordType,
        title: record.title,
        description: record.description,
        source: record.source,
        sourceRecordType: record.sourceRecordType,
        sourceRecordId: record.sourceRecordId,
        sourceRecordLabel: record.sourceRecordLabel,
        status: record.status,
        priority: record.priority,
        executionType: record.executionType,
        categoryName: record.categoryName,
        building: record.building,
        area: record.area,
        locationNotes: record.locationNotes,
        propertyMapName: record.propertyMap?.name ?? null,
        pinX: record.pinX,
        pinY: record.pinY,
        estimatedQuantity: record.estimatedQuantity,
        quantityUnit: record.quantityUnit,
        estimatedCost: record.estimatedCost,
        actualCost: record.actualCost,
        totalAmount: record.totalAmount,
        deferredMaintenance: record.deferredMaintenance,
        deferredReason: record.deferredReason,
        targetYear: record.targetYear,
        deferredNotes: record.deferredNotes,
        budgetYear: record.budgetYear,
        companyName: record.companyName,
        contactName: record.contactName,
        contactPhone: record.contactPhone,
        contactEmail: record.contactEmail,
        bidStatus: record.bidStatus,
        bidNotes: record.bidNotes,
        assignedUserName: record.assignedUserName,
        assignedRole: record.assignedRole,
        assignedTeam: record.assignedTeam,
        scheduledDate: record.scheduledDate?.toISOString() ?? null,
        startDate: record.startDate?.toISOString() ?? null,
        dueDate: record.dueDate?.toISOString() ?? null,
        completedDate: record.completedDate?.toISOString() ?? null,
        tags: record.tags,
        isArchived: record.isArchived,
        archivedAt: record.archivedAt?.toISOString() ?? null,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
      })),
      projectComments: projectRecords.flatMap((record) => record.comments.map((comment) => ({
        recordKey: projectRecordKeysById.get(record.id) ?? "",
        propertyCode: record.property.code,
        authorName: comment.authorName,
        body: comment.body,
        createdAt: comment.createdAt.toISOString(),
        updatedAt: comment.updatedAt.toISOString(),
      }))).filter((comment) => comment.recordKey),
      projectTasks: projectRecords.flatMap((record) => record.tasks.map((task) => ({
        recordKey: projectRecordKeysById.get(record.id) ?? "",
        propertyCode: record.property.code,
        title: task.title,
        status: task.status,
        assignedUserName: task.assignedUserName,
        dueDate: task.dueDate?.toISOString() ?? null,
        completedByName: null,
        completedDate: task.completedDate?.toISOString() ?? null,
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString(),
      }))).filter((task) => task.recordKey),
      projectAttachments: projectRecords.flatMap((record) => record.attachments.map((attachment) => ({
        recordKey: projectRecordKeysById.get(record.id) ?? "",
        propertyCode: record.property.code,
        uploaderName: attachment.uploaderName,
        originalName: attachment.originalName,
        storedName: attachment.storedName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        attachmentType: attachment.attachmentType,
        caption: attachment.caption,
        createdAt: attachment.createdAt.toISOString(),
      }))).filter((attachment) => attachment.recordKey),
      projectWikiReferences: projectRecords.flatMap((record) => record.wikiReferences.flatMap((reference) => {
        const targetKey = reference.targetType === "ENTRY"
          ? wikiEntryKeysById.get(reference.targetId)
          : reference.targetType === "VENDOR"
            ? wikiVendorKeysById.get(reference.targetId)
            : wikiAssetKeysById.get(reference.targetId);
        const recordKey = projectRecordKeysById.get(record.id);
        return recordKey && targetKey ? [{
          propertyCode: record.property.code,
          recordKey,
          targetType: reference.targetType as "ENTRY" | "VENDOR" | "ASSET",
          targetKey,
          createdAt: reference.createdAt.toISOString(),
        }] : [];
      })),
      pestVendors: pestVendors.map((vendor) => ({
        portableKey: pestVendorKeysById.get(vendor.id) ?? pestVendorPortableKey({
          propertyCode: vendor.property.code,
          vendorName: vendor.vendorName,
        }),
        propertyCode: vendor.property.code,
        vendorName: vendor.vendorName,
        primaryContact: vendor.primaryContact,
        phone: vendor.phone,
        email: vendor.email,
        emergencyPhone: vendor.emergencyPhone,
        serviceDay: vendor.serviceDay,
        serviceFrequency: vendor.serviceFrequency,
        notes: vendor.notes,
        isActive: vendor.isActive,
        isDefault: vendor.isDefault,
      })),
      pestIssues: pestIssues.map((issue) => ({
        portableKey: pestIssueKeysById.get(issue.id) ?? pestIssuePortableKey({
          propertyCode: issue.property.code,
          unitNumber: issue.unit?.number ?? null,
          area: issue.area,
          pestType: issue.pestType,
          requestDate: issue.requestDate.toISOString(),
        }),
        propertyCode: issue.property.code,
        unitNumber: issue.unit?.number ?? null,
        makeReadyItemKey: issue.makeReadyItem ? itemPortableKey(issue.makeReadyItem) : null,
        building: issue.building,
        area: issue.area,
        requestDate: issue.requestDate.toISOString(),
        pestType: issue.pestType,
        additionalPestType: issue.additionalPestType,
        status: issue.status,
        priority: issue.priority,
        source: issue.source,
        vendorKey: issue.vendor ? pestVendorKeysById.get(issue.vendor.id) ?? null : null,
        thirdPartyWorkOrderNumber: issue.thirdPartyWorkOrderNumber,
        reportedBy: issue.reportedBy,
        assignedUserName: issue.assignedUserId ? null : null,
        treatmentDate: issue.treatmentDate?.toISOString() ?? null,
        followUpRequired: issue.followUpRequired,
        followUpDate: issue.followUpDate?.toISOString() ?? null,
        followUpNotes: issue.followUpNotes,
        description: issue.description,
        closedNotes: issue.closedNotes,
        recurringConcern: issue.recurringConcern,
        managerReviewRequired: issue.managerReviewRequired,
        recurringDismissedAt: issue.recurringDismissedAt?.toISOString() ?? null,
        recurringDismissalNotes: issue.recurringDismissalNotes,
        closedAt: issue.closedAt?.toISOString() ?? null,
        isArchived: issue.isArchived,
        archivedAt: issue.archivedAt?.toISOString() ?? null,
        archiveNotes: issue.archiveNotes,
        createdAt: issue.createdAt.toISOString(),
        updatedAt: issue.updatedAt.toISOString(),
      })),
      pestIssueNotes: pestIssues.flatMap((issue) => issue.notes.map((note) => ({
        issueKey: pestIssueKeysById.get(issue.id) ?? "",
        propertyCode: issue.property.code,
        authorName: note.authorName,
        body: note.body,
        createdAt: note.createdAt.toISOString(),
      }))).filter((note) => note.issueKey),
      pestAttachments: pestIssues.flatMap((issue) => issue.attachments.map((attachment) => ({
        issueKey: pestIssueKeysById.get(issue.id) ?? "",
        propertyCode: issue.property.code,
        uploaderName: attachment.uploaderName,
        photoType: attachment.photoType,
        caption: attachment.caption,
        originalName: attachment.originalName,
        storedName: attachment.storedName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        createdAt: attachment.createdAt.toISOString(),
      }))).filter((attachment) => attachment.issueKey),
      leaseComplianceIssueTypes: leaseComplianceIssueTypes.map((issueType) => ({
        propertyCode: issueType.property.code,
        name: issueType.name,
        color: issueType.color,
        isActive: issueType.isActive,
        sortOrder: issueType.sortOrder,
        createdAt: issueType.createdAt.toISOString(),
        updatedAt: issueType.updatedAt.toISOString(),
      })),
      leaseComplianceSettings: leaseComplianceSettings.map((settings) => ({
        propertyCode: settings.property.code,
        defaultPriority: settings.defaultPriority,
        watchDays: settings.watchDays,
        warningDays: settings.warningDays,
        criticalDays: settings.criticalDays,
        firstNoticeLabel: settings.firstNoticeLabel,
        secondNoticeLabel: settings.secondNoticeLabel,
        thirdNoticeLabel: settings.thirdNoticeLabel,
        archiveResolvedAfterDays: settings.archiveResolvedAfterDays,
        createdAt: settings.createdAt.toISOString(),
        updatedAt: settings.updatedAt.toISOString(),
      })),
      leaseComplianceIssues: leaseComplianceIssues.map((issue) => ({
        portableKey: leaseComplianceIssueKeysById.get(issue.id) ?? leaseComplianceIssuePortableKey({
          propertyCode: issue.property.code,
          unitNumber: issue.unit?.number ?? null,
          building: issue.building,
          area: issue.area,
          issueTypeName: issue.issueTypeName,
          createdAt: issue.createdAt.toISOString(),
        }),
        propertyCode: issue.property.code,
        unitNumber: issue.unit?.number ?? null,
        issueTypeKey: issue.issueType ? leaseComplianceIssueTypeKeysById.get(issue.issueType.id) ?? null : null,
        propertyMapName: issue.propertyMap?.name ?? null,
        building: issue.building,
        area: issue.area,
        issueTypeName: issue.issueTypeName,
        additionalIssueType: issue.additionalIssueType,
        status: issue.status,
        noticeStage: issue.noticeStage,
        priority: issue.priority,
        source: issue.source,
        description: issue.description,
        locationNotes: issue.locationNotes,
        tags: issue.tags,
        assignedUserName: issue.assignedUserName,
        lastPersistenceCheckDate: issue.lastPersistenceCheckDate?.toISOString() ?? null,
        daysOpenOverride: issue.daysOpenOverride,
        persistenceCount: issue.persistenceCount,
        residentNotifiedDate: issue.residentNotifiedDate?.toISOString() ?? null,
        notice1Date: issue.notice1Date?.toISOString() ?? null,
        notice2Date: issue.notice2Date?.toISOString() ?? null,
        notice3Date: issue.notice3Date?.toISOString() ?? null,
        violationNeededDate: issue.violationNeededDate?.toISOString() ?? null,
        recurringConcern: issue.recurringConcern,
        managerReviewRequired: issue.managerReviewRequired,
        recurringDismissedAt: issue.recurringDismissedAt?.toISOString() ?? null,
        recurringDismissalNotes: issue.recurringDismissalNotes,
        resolvedDate: issue.resolvedDate?.toISOString() ?? null,
        resolutionNotes: issue.resolutionNotes,
        isArchived: issue.isArchived,
        archiveDate: issue.archiveDate?.toISOString() ?? null,
        archiveNotes: issue.archiveNotes,
        createdAt: issue.createdAt.toISOString(),
        updatedAt: issue.updatedAt.toISOString(),
      })),
      leaseComplianceIssueNotes: leaseComplianceIssues.flatMap((issue) => issue.notes.map((note) => ({
        issueKey: leaseComplianceIssueKeysById.get(issue.id) ?? "",
        propertyCode: issue.property.code,
        authorName: note.authorName,
        body: note.body,
        createdAt: note.createdAt.toISOString(),
      }))).filter((note) => note.issueKey),
      leaseComplianceIssuePhotos: leaseComplianceIssues.flatMap((issue) => issue.photos.map((photo) => ({
        issueKey: leaseComplianceIssueKeysById.get(issue.id) ?? "",
        propertyCode: issue.property.code,
        uploaderName: photo.uploaderName,
        photoCategory: photo.photoCategory,
        caption: photo.caption,
        originalName: photo.originalName,
        storedName: photo.storedName,
        mimeType: photo.mimeType,
        sizeBytes: photo.sizeBytes,
        createdAt: photo.createdAt.toISOString(),
      }))).filter((photo) => photo.issueKey),
      leaseComplianceNoticeActions: leaseComplianceIssues.flatMap((issue) => issue.noticeActions.map((action) => ({
        issueKey: leaseComplianceIssueKeysById.get(issue.id) ?? "",
        propertyCode: issue.property.code,
        actedByName: action.actedByName,
        action: action.action,
        noticeStage: action.noticeStage,
        notes: action.notes,
        createdAt: action.createdAt.toISOString(),
      }))).filter((action) => action.issueKey),
      leaseCompliancePersistenceChecks: leaseComplianceIssues.flatMap((issue) => issue.persistenceChecks.map((check) => ({
        issueKey: leaseComplianceIssueKeysById.get(issue.id) ?? "",
        propertyCode: issue.property.code,
        checkedByName: check.checkedByName,
        stillPersists: check.stillPersists,
        notes: check.notes,
        createdAt: check.createdAt.toISOString(),
      }))).filter((check) => check.issueKey),
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
  rejectDuplicates("propertyMapPins", backup.data.propertyMapPins.map((pin) => propertyMapPinPortableKey(pin)));
  rejectDuplicates("propertyMapPinAttachments", backup.data.propertyMapPinAttachments.map((attachment) => `${attachment.pinKey}|${attachment.storedName}`));
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
  rejectDuplicates("propertyWikiEntries", backup.data.propertyWikiEntries.map((entry) => entry.portableKey));
  rejectDuplicates("propertyWikiVendors", backup.data.propertyWikiVendors.map((vendor) => vendor.portableKey));
  rejectDuplicates("propertyWikiAssets", backup.data.propertyWikiAssets.map((asset) => asset.portableKey));
  rejectDuplicates("propertyWikiReferences", backup.data.propertyWikiReferences.map((reference) => `${reference.recordType}|${reference.recordKey}|${reference.targetType}|${reference.targetKey}`));
  rejectDuplicates("preventiveMaintenanceTemplates", backup.data.preventiveMaintenanceTemplates.map((template) => preventiveMaintenanceTemplatePortableKey(template)));
  rejectDuplicates("preventiveMaintenanceTasks", backup.data.preventiveMaintenanceTasks.map((task) => preventiveMaintenanceTaskPortableKey(task)));
  rejectDuplicates("preventiveMaintenanceTaskAttachments", backup.data.preventiveMaintenanceTaskAttachments.map((attachment) => `${attachment.taskKey}|${attachment.storedName}`));
  rejectDuplicates("preventiveMaintenanceWikiReferences", backup.data.preventiveMaintenanceWikiReferences.map((reference) => `${reference.recordType}|${reference.recordKey}|${reference.targetType}|${reference.entrySection ?? ""}|${reference.targetTitle ?? ""}|${reference.vendorType ?? ""}|${reference.companyName ?? ""}|${reference.assetKind ?? ""}|${reference.originalName ?? ""}`));
  rejectDuplicates("projectCategories", backup.data.projectCategories.map((category) => projectCategoryPortableKey(category)));
  rejectDuplicates("projectRecords", backup.data.projectRecords.map((record) => record.portableKey));
  rejectDuplicates("projectComments", backup.data.projectComments.map((comment) => `${comment.recordKey}|${comment.authorName ?? ""}|${comment.createdAt}`));
  rejectDuplicates("projectTasks", backup.data.projectTasks.map((task) => `${task.recordKey}|${task.title}|${task.createdAt}`));
  rejectDuplicates("projectAttachments", backup.data.projectAttachments.map((attachment) => `${attachment.recordKey}|${attachment.storedName}`));
  rejectDuplicates("projectWikiReferences", backup.data.projectWikiReferences.map((reference) => `${reference.recordKey}|${reference.targetType}|${reference.targetKey}`));
  rejectDuplicates("pestVendors", backup.data.pestVendors.map((vendor) => vendor.portableKey));
  rejectDuplicates("pestIssues", backup.data.pestIssues.map((issue) => issue.portableKey));
  rejectDuplicates("pestIssueNotes", backup.data.pestIssueNotes.map((note) => `${note.issueKey}|${note.authorName ?? ""}|${note.createdAt}`));
  rejectDuplicates("pestAttachments", backup.data.pestAttachments.map((attachment) => `${attachment.issueKey}|${attachment.storedName}`));
  rejectDuplicates("leaseComplianceIssueTypes", backup.data.leaseComplianceIssueTypes.map((issueType) => leaseComplianceIssueTypePortableKey(issueType)));
  rejectDuplicates("leaseComplianceSettings", backup.data.leaseComplianceSettings.map((settings) => settings.propertyCode));
  rejectDuplicates("leaseComplianceIssues", backup.data.leaseComplianceIssues.map((issue) => issue.portableKey));
  rejectDuplicates("leaseComplianceIssueNotes", backup.data.leaseComplianceIssueNotes.map((note) => `${note.issueKey}|${note.authorName ?? ""}|${note.createdAt}`));
  rejectDuplicates("leaseComplianceIssuePhotos", backup.data.leaseComplianceIssuePhotos.map((photo) => `${photo.issueKey}|${photo.storedName}`));
  rejectDuplicates("leaseComplianceNoticeActions", backup.data.leaseComplianceNoticeActions.map((action) => `${action.issueKey}|${action.action}|${action.createdAt}`));
  rejectDuplicates("leaseCompliancePersistenceChecks", backup.data.leaseCompliancePersistenceChecks.map((check) => `${check.issueKey}|${check.stillPersists}|${check.createdAt}`));

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
  for (const pin of backup.data.propertyMapPins) {
    if (!propertyCodes.has(pin.propertyCode) && !(await prisma.property.findUnique({ where: { code: pin.propertyCode } }))) {
      summary.propertyMapPins.errors.push(`Property ${pin.propertyCode} is missing for map pin ${pin.title}`);
    }
    const mapInBackup = backup.data.propertyMaps.some((map) => map.propertyCode === pin.propertyCode && map.name === pin.mapName);
    if (!mapInBackup) {
      const property = await prisma.property.findUnique({ where: { code: pin.propertyCode } });
      const existingMap = property ? await prisma.propertyMap.findFirst({ where: { propertyId: property.id, name: pin.mapName } }) : null;
      if (!existingMap) summary.propertyMapPins.errors.push(`Property map ${pin.mapName} is missing for map pin ${pin.title}`);
    }
  }
  const propertyMapPinKeys = new Set(backup.data.propertyMapPins.map((pin) => propertyMapPinPortableKey(pin)));
  for (const attachment of backup.data.propertyMapPinAttachments) {
    if (!propertyMapPinKeys.has(attachment.pinKey)) summary.propertyMapPinAttachments.errors.push(`Property map pin ${attachment.pinKey} is missing for attachment ${attachment.originalName}`);
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
  const propertyWikiEntryKeys = new Set(backup.data.propertyWikiEntries.map((entry) => entry.portableKey));
  const propertyWikiVendorKeys = new Set(backup.data.propertyWikiVendors.map((vendor) => vendor.portableKey));
  const propertyWikiAssetKeys = new Set(backup.data.propertyWikiAssets.map((asset) => asset.portableKey));
  const leaseComplianceIssueTypeKeys = new Set(backup.data.leaseComplianceIssueTypes.map((issueType) => leaseComplianceIssueTypePortableKey(issueType)));
  const leaseComplianceIssueKeys = new Set(backup.data.leaseComplianceIssues.map((issue) => issue.portableKey));
  const preventiveMaintenanceTemplateKeys = new Set(
    backup.data.preventiveMaintenanceTemplates.map((template) => preventiveMaintenanceTemplatePortableKey(template)),
  );
  const preventiveMaintenanceTaskKeys = new Set(
    backup.data.preventiveMaintenanceTasks.map((task) => preventiveMaintenanceTaskPortableKey(task)),
  );
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
  for (const entry of backup.data.propertyWikiEntries) {
    if (!propertyCodes.has(entry.propertyCode) && !(await prisma.property.findUnique({ where: { code: entry.propertyCode } }))) {
      summary.propertyWikiEntries.errors.push(`Property ${entry.propertyCode} is missing for Property Wiki entry ${entry.title}`);
    }
    for (const relatedEntryKey of entry.relatedEntryKeys) {
      if (!propertyWikiEntryKeys.has(relatedEntryKey)) {
        const [propertyCode, section, title] = relatedEntryKey.split("|");
        const property = await prisma.property.findUnique({ where: { code: propertyCode } });
        const existingEntry = property ? await prisma.propertyWikiEntry.findFirst({ where: { propertyId: property.id, section, title } }) : null;
        if (!existingEntry) summary.propertyWikiEntries.errors.push(`Related Property Wiki entry ${relatedEntryKey} is missing for ${entry.title}`);
      }
    }
    for (const relatedVendorKey of entry.relatedVendorKeys) {
      if (!propertyWikiVendorKeys.has(relatedVendorKey)) {
        const [propertyCode, vendorType, companyName] = relatedVendorKey.split("|");
        const property = await prisma.property.findUnique({ where: { code: propertyCode } });
        const existingVendor = property ? await prisma.propertyWikiVendor.findFirst({ where: { propertyId: property.id, vendorType, companyName } }) : null;
        if (!existingVendor) summary.propertyWikiEntries.errors.push(`Related Property Wiki vendor ${relatedVendorKey} is missing for ${entry.title}`);
      }
    }
  }
  for (const vendor of backup.data.propertyWikiVendors) {
    if (!propertyCodes.has(vendor.propertyCode) && !(await prisma.property.findUnique({ where: { code: vendor.propertyCode } }))) {
      summary.propertyWikiVendors.errors.push(`Property ${vendor.propertyCode} is missing for Property Wiki vendor ${vendor.companyName}`);
    }
  }
  for (const asset of backup.data.propertyWikiAssets) {
    if (!propertyCodes.has(asset.propertyCode) && !(await prisma.property.findUnique({ where: { code: asset.propertyCode } }))) {
      summary.propertyWikiAssets.errors.push(`Property ${asset.propertyCode} is missing for Property Wiki asset ${asset.title}`);
    }
    if (asset.entryKey && !propertyWikiEntryKeys.has(asset.entryKey)) {
      const [propertyCode, section, title] = asset.entryKey.split("|");
      const property = await prisma.property.findUnique({ where: { code: propertyCode } });
      const existingEntry = property ? await prisma.propertyWikiEntry.findFirst({ where: { propertyId: property.id, section, title } }) : null;
      if (!existingEntry) summary.propertyWikiAssets.errors.push(`Linked Property Wiki entry ${asset.entryKey} is missing for asset ${asset.title}`);
    }
    if (asset.vendorKey && !propertyWikiVendorKeys.has(asset.vendorKey)) {
      const [propertyCode, vendorType, companyName] = asset.vendorKey.split("|");
      const property = await prisma.property.findUnique({ where: { code: propertyCode } });
      const existingVendor = property ? await prisma.propertyWikiVendor.findFirst({ where: { propertyId: property.id, vendorType, companyName } }) : null;
      if (!existingVendor) summary.propertyWikiAssets.errors.push(`Linked Property Wiki vendor ${asset.vendorKey} is missing for asset ${asset.title}`);
    }
  }
  for (const reference of backup.data.propertyWikiReferences) {
    if (reference.recordType === "MAKE_READY_ITEM" && !itemKeys.has(reference.recordKey)) {
      summary.propertyWikiReferences.errors.push(`Make-ready item ${reference.recordKey} is missing for Property Wiki reference`);
    }
    if (reference.recordType === "REFRIGERANT_TRANSACTION"
      && !backup.data.refrigerantTransactions.some((entry) => refrigerantTransactionPortableKey(entry) === reference.recordKey)) {
      const [transactionType, propertyCode, unitNumber, refrigerantTypeName, occurredAt, amount] = reference.recordKey.split("|");
      const property = propertyCode ? await prisma.property.findUnique({ where: { code: propertyCode } }) : null;
      const refrigerantType = await prisma.refrigerantType.findUnique({ where: { name: refrigerantTypeName } });
      const existingTransaction = refrigerantType ? await prisma.refrigerantTransaction.findFirst({
        where: {
          transactionType,
          propertyId: property?.id ?? null,
          unitNumber: unitNumber || null,
          refrigerantTypeId: refrigerantType.id,
          occurredAt: new Date(occurredAt),
          amount: Number(amount),
        },
      }) : null;
      if (!existingTransaction) summary.propertyWikiReferences.errors.push(`Refrigerant transaction ${reference.recordKey} is missing for Property Wiki reference`);
    }
    if (reference.recordType === "POOL_LOG_ENTRY" && !poolEntryKeys.has(reference.recordKey)) {
      const [propertyCode, facilityName, logDate, logTime] = reference.recordKey.split("|");
      const property = await prisma.property.findUnique({ where: { code: propertyCode } });
      const facility = property ? await prisma.poolFacility.findUnique({ where: { propertyId_name: { propertyId: property.id, name: facilityName } } }) : null;
      const existingEntry = facility ? await prisma.poolLogEntry.findFirst({ where: { propertyId: property!.id, facilityId: facility.id, logDate: new Date(logDate), logTime: logTime || null } }) : null;
      if (!existingEntry) summary.propertyWikiReferences.errors.push(`Pool log entry ${reference.recordKey} is missing for Property Wiki reference`);
    }
    if (reference.recordType === "LEASE_COMPLIANCE_ISSUE" && !leaseComplianceIssueKeys.has(reference.recordKey)) {
      const [propertyCode, unitNumber, building, area, issueTypeName, createdAt] = reference.recordKey.split("|");
      const property = await prisma.property.findUnique({ where: { code: propertyCode } });
      const unit = property && unitNumber ? await prisma.unit.findUnique({ where: { propertyId_number: { propertyId: property.id, number: unitNumber } } }) : null;
      const existingIssue = property ? await prisma.leaseComplianceIssue.findFirst({
        where: {
          propertyId: property.id,
          unitId: unit?.id ?? null,
          building: building || null,
          area: area || null,
          issueTypeName,
          createdAt: new Date(createdAt),
        },
      }) : null;
      if (!existingIssue) summary.propertyWikiReferences.errors.push(`Lease Compliance issue ${reference.recordKey} is missing for Property Wiki reference`);
    }
    if (reference.targetType === "ENTRY" && !propertyWikiEntryKeys.has(reference.targetKey)) {
      const [propertyCode, section, title] = reference.targetKey.split("|");
      const property = await prisma.property.findUnique({ where: { code: propertyCode } });
      const existingEntry = property ? await prisma.propertyWikiEntry.findFirst({ where: { propertyId: property.id, section, title } }) : null;
      if (!existingEntry) summary.propertyWikiReferences.errors.push(`Property Wiki entry ${reference.targetKey} is missing for workflow reference`);
    }
    if (reference.targetType === "VENDOR" && !propertyWikiVendorKeys.has(reference.targetKey)) {
      const [propertyCode, vendorType, companyName] = reference.targetKey.split("|");
      const property = await prisma.property.findUnique({ where: { code: propertyCode } });
      const existingVendor = property ? await prisma.propertyWikiVendor.findFirst({ where: { propertyId: property.id, vendorType, companyName } }) : null;
      if (!existingVendor) summary.propertyWikiReferences.errors.push(`Property Wiki vendor ${reference.targetKey} is missing for workflow reference`);
    }
    if (reference.targetType === "ASSET" && !propertyWikiAssetKeys.has(reference.targetKey)) {
      const [propertyCode, kind, storedName] = reference.targetKey.split("|");
      const property = await prisma.property.findUnique({ where: { code: propertyCode } });
      const existingAsset = property ? await prisma.propertyWikiAsset.findFirst({ where: { propertyId: property.id, kind, storedName } }) : null;
      if (!existingAsset) summary.propertyWikiReferences.errors.push(`Property Wiki asset ${reference.targetKey} is missing for workflow reference`);
    }
  }
  for (const template of backup.data.preventiveMaintenanceTemplates) {
    if (!propertyCodes.has(template.propertyCode) && !(await prisma.property.findUnique({ where: { code: template.propertyCode } }))) {
      summary.preventiveMaintenanceTemplates.errors.push(`Property ${template.propertyCode} is missing for PM template ${template.name}`);
    }
  }
  for (const task of backup.data.preventiveMaintenanceTasks) {
    if (!propertyCodes.has(task.propertyCode) && !(await prisma.property.findUnique({ where: { code: task.propertyCode } }))) {
      summary.preventiveMaintenanceTasks.errors.push(`Property ${task.propertyCode} is missing for PM task ${task.taskName}`);
    }
    if (!preventiveMaintenanceTemplateKeys.has(task.templateKey)) {
      const [propertyCode, name, category, frequency, customEveryDays, annualMonth, annualDay] = task.templateKey.split("|");
      const property = await prisma.property.findUnique({ where: { code: propertyCode } });
      const existingTemplate = property ? await prisma.preventiveMaintenanceTemplate.findFirst({
        where: {
          propertyId: property.id,
          name,
          category,
          frequency,
          customEveryDays: customEveryDays ? Number(customEveryDays) : null,
          annualMonth: annualMonth ? Number(annualMonth) : null,
          annualDay: annualDay ? Number(annualDay) : null,
        },
      }) : null;
      if (!existingTemplate) summary.preventiveMaintenanceTasks.errors.push(`PM template ${task.templateKey} is missing for PM task ${task.taskName}`);
    }
  }
  for (const attachment of backup.data.preventiveMaintenanceTaskAttachments) {
    if (!preventiveMaintenanceTaskKeys.has(attachment.taskKey)) summary.preventiveMaintenanceTaskAttachments.errors.push(`PM task ${attachment.taskKey} is missing for attachment ${attachment.originalName}`);
  }
  const projectCategoryKeys = new Set(backup.data.projectCategories.map((category) => projectCategoryPortableKey(category)));
  const projectRecordKeys = new Set(backup.data.projectRecords.map((record) => record.portableKey));
  const pestVendorKeys = new Set(backup.data.pestVendors.map((vendor) => vendor.portableKey));
  const pestIssueKeys = new Set(backup.data.pestIssues.map((issue) => issue.portableKey));
  for (const category of backup.data.projectCategories) {
    if (category.propertyCode && !propertyCodes.has(category.propertyCode) && !(await prisma.property.findUnique({ where: { code: category.propertyCode } }))) {
      summary.projectCategories.errors.push(`Property ${category.propertyCode} is missing for project category ${category.name}`);
    }
  }
  for (const record of backup.data.projectRecords) {
    if (!propertyCodes.has(record.propertyCode) && !(await prisma.property.findUnique({ where: { code: record.propertyCode } }))) {
      summary.projectRecords.errors.push(`Property ${record.propertyCode} is missing for project record ${record.title}`);
    }
    if (record.categoryName && !projectCategoryKeys.has(projectCategoryPortableKey({ propertyCode: record.propertyCode, name: record.categoryName })) && !projectCategoryKeys.has(projectCategoryPortableKey({ propertyCode: null, name: record.categoryName }))) {
      const property = await prisma.property.findUnique({ where: { code: record.propertyCode } });
      const existingCategory = property ? await prisma.projectCategory.findFirst({ where: { OR: [{ propertyId: property.id }, { propertyId: null }], name: record.categoryName } }) : null;
      if (!existingCategory) summary.projectRecords.errors.push(`Project category ${record.categoryName} is missing for record ${record.title}`);
    }
    if (record.propertyMapName) {
      const mapInBackup = backup.data.propertyMaps.some((map) => map.propertyCode === record.propertyCode && map.name === record.propertyMapName);
      if (!mapInBackup) {
        const property = await prisma.property.findUnique({ where: { code: record.propertyCode } });
        const existingMap = property ? await prisma.propertyMap.findFirst({ where: { propertyId: property.id, name: record.propertyMapName } }) : null;
        if (!existingMap) summary.projectRecords.errors.push(`Property map ${record.propertyMapName} is missing for project record ${record.title}`);
      }
    }
  }
  for (const comment of backup.data.projectComments) {
    if (!projectRecordKeys.has(comment.recordKey)) summary.projectComments.errors.push(`Project record ${comment.recordKey} is missing for comment`);
  }
  for (const task of backup.data.projectTasks) {
    if (!projectRecordKeys.has(task.recordKey)) summary.projectTasks.errors.push(`Project record ${task.recordKey} is missing for task ${task.title}`);
  }
  for (const attachment of backup.data.projectAttachments) {
    if (!projectRecordKeys.has(attachment.recordKey)) summary.projectAttachments.errors.push(`Project record ${attachment.recordKey} is missing for attachment ${attachment.originalName}`);
  }
  for (const reference of backup.data.projectWikiReferences) {
    if (!projectRecordKeys.has(reference.recordKey)) summary.projectWikiReferences.errors.push(`Project record ${reference.recordKey} is missing for wiki reference`);
    if (reference.targetType === "ENTRY" && !backup.data.propertyWikiEntries.some((entry) => entry.portableKey === reference.targetKey)) {
      const existingEntry = await prisma.propertyWikiEntry.findFirst({ where: { title: reference.targetKey } }).catch(() => null);
      if (!existingEntry) summary.projectWikiReferences.errors.push(`Property Wiki entry ${reference.targetKey} is missing for project wiki reference`);
    }
    if (reference.targetType === "VENDOR" && !backup.data.propertyWikiVendors.some((vendor) => vendor.portableKey === reference.targetKey)) {
      const existingVendor = await prisma.propertyWikiVendor.findFirst({ where: { companyName: reference.targetKey } }).catch(() => null);
      if (!existingVendor) summary.projectWikiReferences.errors.push(`Property Wiki vendor ${reference.targetKey} is missing for project wiki reference`);
    }
    if (reference.targetType === "ASSET" && !backup.data.propertyWikiAssets.some((asset) => asset.portableKey === reference.targetKey)) {
      const existingAsset = await prisma.propertyWikiAsset.findFirst({ where: { storedName: reference.targetKey } }).catch(() => null);
      if (!existingAsset) summary.projectWikiReferences.errors.push(`Property Wiki asset ${reference.targetKey} is missing for project wiki reference`);
    }
  }
  for (const vendor of backup.data.pestVendors) {
    if (!propertyCodes.has(vendor.propertyCode) && !(await prisma.property.findUnique({ where: { code: vendor.propertyCode } }))) {
      summary.pestVendors.errors.push(`Property ${vendor.propertyCode} is missing for pest vendor ${vendor.vendorName}`);
    }
  }
  for (const issue of backup.data.pestIssues) {
    if (!propertyCodes.has(issue.propertyCode) && !(await prisma.property.findUnique({ where: { code: issue.propertyCode } }))) {
      summary.pestIssues.errors.push(`Property ${issue.propertyCode} is missing for pest issue ${issue.pestType}`);
    }
    if (issue.vendorKey && !pestVendorKeys.has(issue.vendorKey)) {
      const property = await prisma.property.findUnique({ where: { code: issue.propertyCode } });
      const existingVendor = property ? await prisma.pestVendor.findFirst({ where: { propertyId: property.id, vendorName: issue.vendorKey.split("|")[1] ?? issue.vendorKey } }) : null;
      if (!existingVendor) summary.pestIssues.errors.push(`Pest vendor ${issue.vendorKey} is missing for issue ${issue.pestType}`);
    }
    if (issue.makeReadyItemKey && !itemKeys.has(issue.makeReadyItemKey)) {
      summary.pestIssues.errors.push(`Make-ready item ${issue.makeReadyItemKey} is missing for pest issue ${issue.pestType}`);
    }
  }
  for (const note of backup.data.pestIssueNotes) {
    if (!pestIssueKeys.has(note.issueKey)) summary.pestIssueNotes.errors.push(`Pest issue ${note.issueKey} is missing for note`);
  }
  for (const attachment of backup.data.pestAttachments) {
    if (!pestIssueKeys.has(attachment.issueKey)) summary.pestAttachments.errors.push(`Pest issue ${attachment.issueKey} is missing for attachment ${attachment.originalName}`);
  }
  for (const issueType of backup.data.leaseComplianceIssueTypes) {
    if (!propertyCodes.has(issueType.propertyCode) && !(await prisma.property.findUnique({ where: { code: issueType.propertyCode } }))) {
      summary.leaseComplianceIssueTypes.errors.push(`Property ${issueType.propertyCode} is missing for lease issue type ${issueType.name}`);
    }
  }
  for (const settings of backup.data.leaseComplianceSettings) {
    if (!propertyCodes.has(settings.propertyCode) && !(await prisma.property.findUnique({ where: { code: settings.propertyCode } }))) {
      summary.leaseComplianceSettings.errors.push(`Property ${settings.propertyCode} is missing for lease settings`);
    }
  }
  for (const issue of backup.data.leaseComplianceIssues) {
    if (!propertyCodes.has(issue.propertyCode) && !(await prisma.property.findUnique({ where: { code: issue.propertyCode } }))) {
      summary.leaseComplianceIssues.errors.push(`Property ${issue.propertyCode} is missing for lease issue ${issue.issueTypeName}`);
    }
    if (issue.issueTypeKey && !leaseComplianceIssueTypeKeys.has(issue.issueTypeKey)) {
      const [propertyCode, name] = issue.issueTypeKey.split("|");
      const property = await prisma.property.findUnique({ where: { code: propertyCode } });
      const existingIssueType = property ? await prisma.leaseComplianceIssueType.findFirst({ where: { propertyId: property.id, name } }) : null;
      if (!existingIssueType) summary.leaseComplianceIssues.errors.push(`Lease issue type ${issue.issueTypeKey} is missing for issue ${issue.issueTypeName}`);
    }
    if (issue.propertyMapName) {
      const mapInBackup = backup.data.propertyMaps.some((map) => map.propertyCode === issue.propertyCode && map.name === issue.propertyMapName);
      if (!mapInBackup) {
        const property = await prisma.property.findUnique({ where: { code: issue.propertyCode } });
        const existingMap = property ? await prisma.propertyMap.findFirst({ where: { propertyId: property.id, name: issue.propertyMapName } }) : null;
        if (!existingMap) summary.leaseComplianceIssues.errors.push(`Property map ${issue.propertyMapName} is missing for lease issue ${issue.issueTypeName}`);
      }
    }
  }
  for (const note of backup.data.leaseComplianceIssueNotes) {
    if (!leaseComplianceIssueKeys.has(note.issueKey)) summary.leaseComplianceIssueNotes.errors.push(`Lease issue ${note.issueKey} is missing for note`);
  }
  for (const photo of backup.data.leaseComplianceIssuePhotos) {
    if (!leaseComplianceIssueKeys.has(photo.issueKey)) summary.leaseComplianceIssuePhotos.errors.push(`Lease issue ${photo.issueKey} is missing for photo ${photo.originalName}`);
  }
  for (const action of backup.data.leaseComplianceNoticeActions) {
    if (!leaseComplianceIssueKeys.has(action.issueKey)) summary.leaseComplianceNoticeActions.errors.push(`Lease issue ${action.issueKey} is missing for notice action ${action.action}`);
  }
  for (const check of backup.data.leaseCompliancePersistenceChecks) {
    if (!leaseComplianceIssueKeys.has(check.issueKey)) summary.leaseCompliancePersistenceChecks.errors.push(`Lease issue ${check.issueKey} is missing for persistence check`);
  }
  for (const reference of backup.data.preventiveMaintenanceWikiReferences) {
    if (reference.recordType === "PM_TEMPLATE" && !preventiveMaintenanceTemplateKeys.has(reference.recordKey)) {
      summary.preventiveMaintenanceWikiReferences.errors.push(`PM template ${reference.recordKey} is missing for wiki reference`);
    }
    if (reference.recordType === "PM_TASK" && !preventiveMaintenanceTaskKeys.has(reference.recordKey)) {
      summary.preventiveMaintenanceWikiReferences.errors.push(`PM task ${reference.recordKey} is missing for wiki reference`);
    }
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

    for (const pin of backup.data.propertyMapPins) {
      const propertyId = propertyMap.get(pin.propertyCode);
      const mapId = propertyMapMap.get(`${pin.propertyCode}|${pin.mapName}`);
      const existing = mapId ? await tx.propertyMapPin.findFirst({
        where: {
          propertyId,
          mapId,
          title: pin.title,
          pinType: pin.pinType,
          xPercent: pin.xPercent,
          yPercent: pin.yPercent,
        },
      }) : null;
      if (existing) summary.propertyMapPins.skipped += 1;
      else {
        summary.propertyMapPins.created += 1;
        if (!dryRun && propertyId && mapId) {
          const { propertyCode: _propertyCode, mapName: _mapName, ...pinData } = pin;
          await tx.propertyMapPin.create({ data: { ...pinData, propertyId, mapId, createdById: null, updatedById: null } });
        }
      }
    }

    for (const attachment of backup.data.propertyMapPinAttachments) {
      const pin = backup.data.propertyMapPins.find((entry) => propertyMapPinPortableKey(entry) === attachment.pinKey);
      const propertyId = pin ? propertyMap.get(pin.propertyCode) : undefined;
      const mapId = pin ? propertyMapMap.get(`${pin.propertyCode}|${pin.mapName}`) : undefined;
      const pinId = pin && propertyId && mapId
        ? (await tx.propertyMapPin.findFirst({
          where: {
            propertyId,
            mapId,
            title: pin.title,
            pinType: pin.pinType,
            xPercent: pin.xPercent,
            yPercent: pin.yPercent,
          },
        }))?.id
        : undefined;
      const existing = await tx.propertyMapPinAttachment.findUnique({ where: { storedName: attachment.storedName } });
      if (existing) summary.propertyMapPinAttachments.skipped += 1;
      else {
        summary.propertyMapPinAttachments.created += 1;
        if (!dryRun && propertyId && pinId) {
          const { pinKey: _pinKey, propertyCode: _propertyCode, ...attachmentData } = attachment;
          await tx.propertyMapPinAttachment.create({
            data: {
              ...attachmentData,
              propertyId,
              pinId,
              uploadedById: null,
              uploaderName: attachmentData.uploaderName ?? "Imported backup",
              createdAt: new Date(attachmentData.createdAt),
            },
          });
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

    const refrigerantTransactionMap = new Map<string, string>();
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
      const portableKey = refrigerantTransactionPortableKey(entry);
      if (existing) {
        refrigerantTransactionMap.set(portableKey, existing.id);
        summary.refrigerantTransactions.skipped += 1;
      }
      else {
        summary.refrigerantTransactions.created += 1;
        if (!dryRun && refrigerantTypeId) {
          const unitId = entry.propertyCode && entry.unitNumber ? unitMap.get(`${entry.propertyCode}|${entry.unitNumber}`) ?? null : null;
          const created = await tx.refrigerantTransaction.create({
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
          refrigerantTransactionMap.set(portableKey, created.id);
        }
      }
    }
    if (dryRun && backup.data.refrigerantTransactions.length > 0) {
      const existingTransactions = await tx.refrigerantTransaction.findMany({
        include: { refrigerantType: true },
        where: {
          OR: backup.data.refrigerantTransactions.flatMap((entry) => {
            const propertyId = entry.propertyCode ? propertyMap.get(entry.propertyCode) ?? null : null;
            const refrigerantTypeId = refrigerantTypeMap.get(entry.refrigerantTypeName);
            return refrigerantTypeId ? [{
              transactionType: entry.transactionType,
              propertyId,
              unitNumber: entry.unitNumber,
              refrigerantTypeId,
              occurredAt: new Date(entry.occurredAt),
              amount: entry.amount,
            }] : [];
          }),
        },
      });
      existingTransactions.forEach((entry) => refrigerantTransactionMap.set(refrigerantTransactionPortableKey({
        transactionType: entry.transactionType,
        propertyCode: [...propertyMap.entries()].find(([, id]) => id === entry.propertyId)?.[0] ?? null,
        unitNumber: entry.unitNumber,
        refrigerantTypeName: entry.refrigerantType.name,
        occurredAt: entry.occurredAt.toISOString(),
        amount: entry.amount,
      }), entry.id));
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

    const propertyWikiEntryMap = new Map<string, string>();
    for (const entry of backup.data.propertyWikiEntries) {
      const propertyId = propertyMap.get(entry.propertyCode);
      const existing = propertyId ? await tx.propertyWikiEntry.findFirst({
        where: {
          propertyId,
          section: entry.section,
          title: entry.title,
        },
      }) : null;
      if (existing) {
        propertyWikiEntryMap.set(entry.portableKey, existing.id);
        summary.propertyWikiEntries.skipped += 1;
      } else {
        summary.propertyWikiEntries.created += 1;
        if (!dryRun && propertyId) {
          const {
            portableKey: _portableKey,
            propertyCode: _propertyCode,
            relatedEntryKeys: _relatedEntryKeys,
            relatedVendorKeys: _relatedVendorKeys,
            installDate,
            warrantyExpiresAt,
            ...data
          } = entry;
          const created = await tx.propertyWikiEntry.create({
            data: {
              ...data,
              propertyId,
              installDate: dateValue(installDate),
              warrantyExpiresAt: dateValue(warrantyExpiresAt),
              relatedEntryIds: [],
              relatedVendorIds: [],
              createdById: null,
              updatedById: null,
            },
          });
          propertyWikiEntryMap.set(entry.portableKey, created.id);
        }
      }
    }
    if (dryRun && backup.data.propertyWikiEntries.length > 0) {
      const existingEntries = await tx.propertyWikiEntry.findMany({
        include: { property: true },
        where: {
          OR: backup.data.propertyWikiEntries.flatMap((entry) => {
            const propertyId = propertyMap.get(entry.propertyCode);
            return propertyId ? [{ propertyId, section: entry.section, title: entry.title }] : [];
          }),
        },
      });
      existingEntries.forEach((entry) => propertyWikiEntryMap.set(propertyWikiEntryPortableKey({
        propertyCode: entry.property.code,
        section: entry.section,
        title: entry.title,
      }), entry.id));
    }

    const propertyWikiVendorMap = new Map<string, string>();
    for (const vendor of backup.data.propertyWikiVendors) {
      const propertyId = propertyMap.get(vendor.propertyCode);
      const existing = propertyId ? await tx.propertyWikiVendor.findFirst({
        where: {
          propertyId,
          vendorType: vendor.vendorType,
          companyName: vendor.companyName,
        },
      }) : null;
      if (existing) {
        propertyWikiVendorMap.set(vendor.portableKey, existing.id);
        summary.propertyWikiVendors.skipped += 1;
      } else {
        summary.propertyWikiVendors.created += 1;
        if (!dryRun && propertyId) {
          const { portableKey: _portableKey, propertyCode: _propertyCode, ...data } = vendor;
          const created = await tx.propertyWikiVendor.create({
            data: {
              ...data,
              propertyId,
              createdById: null,
              updatedById: null,
            },
          });
          propertyWikiVendorMap.set(vendor.portableKey, created.id);
        }
      }
    }
    if (dryRun && backup.data.propertyWikiVendors.length > 0) {
      const existingVendors = await tx.propertyWikiVendor.findMany({
        include: { property: true },
        where: {
          OR: backup.data.propertyWikiVendors.flatMap((vendor) => {
            const propertyId = propertyMap.get(vendor.propertyCode);
            return propertyId ? [{ propertyId, vendorType: vendor.vendorType, companyName: vendor.companyName }] : [];
          }),
        },
      });
      existingVendors.forEach((vendor) => propertyWikiVendorMap.set(propertyWikiVendorPortableKey({
        propertyCode: vendor.property.code,
        vendorType: vendor.vendorType,
        companyName: vendor.companyName,
      }), vendor.id));
    }

    const propertyWikiAssetMap = new Map<string, string>();
    for (const asset of backup.data.propertyWikiAssets) {
      const propertyId = propertyMap.get(asset.propertyCode);
      const entryId = asset.entryKey ? propertyWikiEntryMap.get(asset.entryKey) ?? null : null;
      const vendorId = asset.vendorKey ? propertyWikiVendorMap.get(asset.vendorKey) ?? null : null;
      const existing = await tx.propertyWikiAsset.findUnique({ where: { storedName: asset.storedName } }).catch(() => null);
      if (existing) {
        propertyWikiAssetMap.set(asset.portableKey, existing.id);
        summary.propertyWikiAssets.skipped += 1;
      } else {
        summary.propertyWikiAssets.created += 1;
        if (!dryRun && propertyId) {
          const { portableKey: _portableKey, propertyCode: _propertyCode, entryKey: _entryKey, vendorKey: _vendorKey, createdAt, ...data } = asset;
          const created = await tx.propertyWikiAsset.create({
            data: {
              ...data,
              propertyId,
              entryId,
              vendorId,
              createdAt: new Date(createdAt),
              createdById: null,
            },
          });
          propertyWikiAssetMap.set(asset.portableKey, created.id);
        }
      }
    }
    if (dryRun && backup.data.propertyWikiAssets.length > 0) {
      const existingAssets = await tx.propertyWikiAsset.findMany({
        include: { property: true },
        where: { storedName: { in: backup.data.propertyWikiAssets.map((asset) => asset.storedName) } },
      });
      existingAssets.forEach((asset) => propertyWikiAssetMap.set(propertyWikiAssetPortableKey({
        propertyCode: asset.property.code,
        kind: asset.kind,
        storedName: asset.storedName,
      }), asset.id));
    }

    for (const entry of backup.data.propertyWikiEntries) {
      const entryId = propertyWikiEntryMap.get(entry.portableKey);
      if (!entryId || dryRun) continue;
      await tx.propertyWikiEntry.update({
        where: { id: entryId },
        data: {
          relatedEntryIds: entry.relatedEntryKeys.flatMap((key) => propertyWikiEntryMap.get(key) ? [propertyWikiEntryMap.get(key)!] : []),
          relatedVendorIds: entry.relatedVendorKeys.flatMap((key) => propertyWikiVendorMap.get(key) ? [propertyWikiVendorMap.get(key)!] : []),
        },
      });
    }

    for (const reference of backup.data.propertyWikiReferences) {
      if (reference.recordType === "LEASE_COMPLIANCE_ISSUE") continue;
      const propertyId = propertyMap.get(reference.propertyCode);
      const recordId = reference.recordType === "MAKE_READY_ITEM"
        ? itemMap.get(reference.recordKey)
        : reference.recordType === "REFRIGERANT_TRANSACTION"
          ? refrigerantTransactionMap.get(reference.recordKey)
          : poolEntryMap.get(reference.recordKey);
      const targetId = reference.targetType === "ENTRY"
        ? propertyWikiEntryMap.get(reference.targetKey)
        : reference.targetType === "VENDOR"
          ? propertyWikiVendorMap.get(reference.targetKey)
          : propertyWikiAssetMap.get(reference.targetKey);
      if (!propertyId || !recordId || !targetId) {
        summary.propertyWikiReferences.skipped += 1;
        summary.propertyWikiReferences.errors.push(`Property Wiki workflow reference could not be resolved for ${reference.recordType}:${reference.recordKey}`);
        continue;
      }
      const existing = await tx.propertyWikiReference.findUnique({
        where: {
          recordType_recordId_targetType_targetId: {
            recordType: reference.recordType,
            recordId,
            targetType: reference.targetType,
            targetId,
          },
        },
      });
      if (existing) summary.propertyWikiReferences.skipped += 1;
      else {
        summary.propertyWikiReferences.created += 1;
        if (!dryRun) {
          await tx.propertyWikiReference.create({
            data: {
              propertyId,
              recordType: reference.recordType,
              recordId,
              targetType: reference.targetType,
              targetId,
              createdById: null,
              createdAt: dateValue(reference.createdAt) ?? new Date(),
            },
          });
        }
      }
    }

    const preventiveMaintenanceTemplateMap = new Map<string, string>();
    for (const template of backup.data.preventiveMaintenanceTemplates) {
      const propertyId = propertyMap.get(template.propertyCode);
      const portableKey = preventiveMaintenanceTemplatePortableKey(template);
      const existing = propertyId ? await tx.preventiveMaintenanceTemplate.findFirst({
        where: {
          propertyId,
          name: template.name,
          category: template.category,
          frequency: template.frequency,
          customEveryDays: template.customEveryDays,
          annualMonth: template.annualMonth,
          annualDay: template.annualDay,
        },
      }) : null;
      if (existing) {
        preventiveMaintenanceTemplateMap.set(portableKey, existing.id);
        summary.preventiveMaintenanceTemplates.skipped += 1;
      } else {
        summary.preventiveMaintenanceTemplates.created += 1;
        if (!dryRun && propertyId) {
          const { propertyCode: _propertyCode, ...data } = template;
          const created = await tx.preventiveMaintenanceTemplate.create({
            data: {
              ...data,
              propertyId,
              assignedUserId: null,
            },
          });
          preventiveMaintenanceTemplateMap.set(portableKey, created.id);
        }
      }
    }
    if (dryRun && backup.data.preventiveMaintenanceTemplates.length > 0) {
      const existingTemplates = await tx.preventiveMaintenanceTemplate.findMany({
        include: { property: true },
        where: {
          OR: backup.data.preventiveMaintenanceTemplates.flatMap((template) => {
            const propertyId = propertyMap.get(template.propertyCode);
            return propertyId ? [{
              propertyId,
              name: template.name,
              category: template.category,
              frequency: template.frequency,
              customEveryDays: template.customEveryDays,
              annualMonth: template.annualMonth,
              annualDay: template.annualDay,
            }] : [];
          }),
        },
      });
      existingTemplates.forEach((template) => preventiveMaintenanceTemplateMap.set(preventiveMaintenanceTemplatePortableKey({
        propertyCode: template.property.code,
        name: template.name,
        category: template.category,
        frequency: template.frequency,
        customEveryDays: template.customEveryDays,
        annualMonth: template.annualMonth,
        annualDay: template.annualDay,
      }), template.id));
    }

    const preventiveMaintenanceTaskMap = new Map<string, string>();
    for (const task of backup.data.preventiveMaintenanceTasks) {
      const propertyId = propertyMap.get(task.propertyCode);
      const templateId = preventiveMaintenanceTemplateMap.get(task.templateKey);
      const portableKey = preventiveMaintenanceTaskPortableKey(task);
      const dueDate = new Date(task.dueDate);
      const existing = propertyId && templateId ? await tx.preventiveMaintenanceTask.findFirst({
        where: {
          propertyId,
          templateId,
          taskName: task.taskName,
          dueDate,
        },
      }) : null;
      if (existing) {
        preventiveMaintenanceTaskMap.set(portableKey, existing.id);
        summary.preventiveMaintenanceTasks.skipped += 1;
      } else {
        summary.preventiveMaintenanceTasks.created += 1;
        if (!dryRun && propertyId && templateId) {
          const { propertyCode: _propertyCode, templateKey: _templateKey, dueDate: _dueDate, ...data } = task;
          const created = await tx.preventiveMaintenanceTask.create({
            data: {
              ...data,
              propertyId,
              templateId,
              dueDate,
              assignedUserId: null,
              completedById: null,
            },
          });
          preventiveMaintenanceTaskMap.set(portableKey, created.id);
        }
      }
    }
    if (dryRun && backup.data.preventiveMaintenanceTasks.length > 0) {
      const existingTasks = await tx.preventiveMaintenanceTask.findMany({
        include: {
          property: true,
          template: { include: { property: true } },
        },
        where: {
          OR: backup.data.preventiveMaintenanceTasks.flatMap((task) => {
            const propertyId = propertyMap.get(task.propertyCode);
            const templateId = preventiveMaintenanceTemplateMap.get(task.templateKey);
            return propertyId && templateId ? [{
              propertyId,
              templateId,
              taskName: task.taskName,
              dueDate: new Date(task.dueDate),
            }] : [];
          }),
        },
      });
      existingTasks.forEach((task) => {
        const templateKey = preventiveMaintenanceTemplatePortableKey({
          propertyCode: task.template.property.code,
          name: task.template.name,
          category: task.template.category,
          frequency: task.template.frequency,
          customEveryDays: task.template.customEveryDays,
          annualMonth: task.template.annualMonth,
          annualDay: task.template.annualDay,
        });
        preventiveMaintenanceTaskMap.set(preventiveMaintenanceTaskPortableKey({
          templateKey,
          taskName: task.taskName,
          dueDate: task.dueDate.toISOString(),
        }), task.id);
      });
    }

    for (const attachment of backup.data.preventiveMaintenanceTaskAttachments) {
      const propertyId = propertyMap.get(attachment.propertyCode);
      const taskId = preventiveMaintenanceTaskMap.get(attachment.taskKey);
      const existing = await tx.preventiveMaintenanceTaskAttachment.findUnique({ where: { storedName: attachment.storedName } }).catch(() => null);
      if (existing) summary.preventiveMaintenanceTaskAttachments.skipped += 1;
      else {
        summary.preventiveMaintenanceTaskAttachments.created += 1;
        if (!dryRun && propertyId && taskId) {
          const { taskKey: _taskKey, propertyCode: _propertyCode, createdAt: _createdAt, uploaderName, ...data } = attachment;
          await tx.preventiveMaintenanceTaskAttachment.create({
            data: {
              ...data,
              propertyId,
              taskId,
              uploaderName: uploaderName ?? "Imported backup",
              uploadedById: null,
              createdAt: new Date(_createdAt),
            },
          });
        }
      }
    }

    for (const reference of backup.data.preventiveMaintenanceWikiReferences) {
      const propertyId = propertyMap.get(reference.propertyCode);
      const recordId = reference.recordType === "PM_TEMPLATE"
        ? preventiveMaintenanceTemplateMap.get(reference.recordKey)
        : preventiveMaintenanceTaskMap.get(reference.recordKey);
      if (!propertyId || !recordId) {
        summary.preventiveMaintenanceWikiReferences.conflicts += 1;
        summary.preventiveMaintenanceWikiReferences.errors.push(`Record ${reference.recordType}:${reference.recordKey} was not available for wiki reference import`);
        continue;
      }

      let targetId: string | null = null;
      if (reference.targetType === "ENTRY" && reference.entrySection && reference.targetTitle) {
        const entry = await tx.propertyWikiEntry.findFirst({
          where: {
            propertyId,
            section: reference.entrySection,
            title: reference.targetTitle,
          },
        });
        targetId = entry?.id ?? null;
      } else if (reference.targetType === "VENDOR" && reference.vendorType && reference.companyName) {
        const vendor = await tx.propertyWikiVendor.findFirst({
          where: {
            propertyId,
            vendorType: reference.vendorType,
            companyName: reference.companyName,
          },
        });
        targetId = vendor?.id ?? null;
      } else if (reference.targetType === "ASSET" && reference.assetKind && reference.targetTitle && reference.originalName) {
        const asset = await tx.propertyWikiAsset.findFirst({
          where: {
            propertyId,
            kind: reference.assetKind,
            title: reference.targetTitle,
            originalName: reference.originalName,
          },
        });
        targetId = asset?.id ?? null;
      }

      if (!targetId) {
        summary.preventiveMaintenanceWikiReferences.skipped += 1;
        summary.preventiveMaintenanceWikiReferences.errors.push(`Wiki target ${reference.targetType} could not be resolved for ${reference.recordType}:${reference.recordKey}`);
        continue;
      }

      const existing = await tx.propertyWikiReference.findUnique({
        where: {
          recordType_recordId_targetType_targetId: {
            recordType: reference.recordType,
            recordId,
            targetType: reference.targetType,
            targetId,
          },
        },
      });
      if (existing) summary.preventiveMaintenanceWikiReferences.skipped += 1;
      else {
        summary.preventiveMaintenanceWikiReferences.created += 1;
        if (!dryRun) {
          await tx.propertyWikiReference.create({
            data: {
              propertyId,
              recordType: reference.recordType,
              recordId,
              targetType: reference.targetType,
              targetId,
              createdById: null,
              createdAt: dateValue(reference.createdAt) ?? new Date(),
            },
          });
        }
      }
    }

    const projectCategoryMap = new Map<string, string>();
    for (const category of backup.data.projectCategories) {
      const propertyId = category.propertyCode ? propertyMap.get(category.propertyCode) ?? null : null;
      const portableKey = projectCategoryPortableKey(category);
      const existing = await tx.projectCategory.findFirst({
        where: {
          propertyId,
          name: category.name,
        },
      });
      if (existing) {
        projectCategoryMap.set(portableKey, existing.id);
        summary.projectCategories.skipped += 1;
      } else {
        summary.projectCategories.created += 1;
        if (!dryRun) {
          const created = await tx.projectCategory.create({
            data: {
              propertyId,
              name: category.name,
              color: category.color,
              isActive: category.isActive,
              sortOrder: category.sortOrder,
            },
          });
          projectCategoryMap.set(portableKey, created.id);
        }
      }
    }
    if (dryRun && backup.data.projectCategories.length > 0) {
      const existingCategories = await tx.projectCategory.findMany({
        include: { property: true },
        where: {
          OR: backup.data.projectCategories.map((category) => ({
            propertyId: category.propertyCode ? propertyMap.get(category.propertyCode) ?? null : null,
            name: category.name,
          })),
        },
      });
      existingCategories.forEach((category) => projectCategoryMap.set(projectCategoryPortableKey({
        propertyCode: category.property?.code ?? null,
        name: category.name,
      }), category.id));
    }

    const projectRecordMap = new Map<string, string>();
    for (const record of backup.data.projectRecords) {
      const propertyId = propertyMap.get(record.propertyCode);
      const categoryId = record.categoryName
        ? projectCategoryMap.get(projectCategoryPortableKey({ propertyCode: record.propertyCode, name: record.categoryName }))
          ?? projectCategoryMap.get(projectCategoryPortableKey({ propertyCode: null, name: record.categoryName }))
          ?? null
        : null;
      const propertyMapId = record.propertyMapName ? propertyMapMap.get(`${record.propertyCode}|${record.propertyMapName}`) ?? null : null;
      const existing = propertyId ? await tx.projectRecord.findFirst({
        where: {
          propertyId,
          recordType: record.recordType,
          title: record.title,
          createdAt: new Date(record.createdAt),
        },
      }) : null;
      if (existing) {
        projectRecordMap.set(record.portableKey, existing.id);
        summary.projectRecords.skipped += 1;
      } else {
        summary.projectRecords.created += 1;
        if (!dryRun && propertyId) {
          const { portableKey: _portableKey, propertyCode: _propertyCode, categoryName: _categoryName, propertyMapName: _propertyMapName, ...data } = record;
          const created = await tx.projectRecord.create({
            data: {
              ...data,
              propertyId,
              categoryId,
              propertyMapId,
              categoryName: record.categoryName,
              createdById: null,
              updatedById: null,
              completedById: null,
              createdAt: new Date(record.createdAt),
              updatedAt: new Date(record.updatedAt),
              archivedAt: dateValue(record.archivedAt),
              scheduledDate: dateValue(record.scheduledDate),
              startDate: dateValue(record.startDate),
              dueDate: dateValue(record.dueDate),
              completedDate: dateValue(record.completedDate),
            },
          });
          projectRecordMap.set(record.portableKey, created.id);
        }
      }
    }
    if (dryRun && backup.data.projectRecords.length > 0) {
      const existingRecords = await tx.projectRecord.findMany({
        include: { property: true },
        where: {
          OR: backup.data.projectRecords.flatMap((record) => {
            const propertyId = propertyMap.get(record.propertyCode);
            return propertyId ? [{
              propertyId,
              recordType: record.recordType,
              title: record.title,
              createdAt: new Date(record.createdAt),
            }] : [];
          }),
        },
      });
      existingRecords.forEach((record) => projectRecordMap.set(projectRecordPortableKey({
        propertyCode: record.property.code,
        recordType: record.recordType,
        title: record.title,
        createdAt: record.createdAt.toISOString(),
      }), record.id));
    }

    for (const comment of backup.data.projectComments) {
      const recordId = projectRecordMap.get(comment.recordKey);
      const propertyId = propertyMap.get(comment.propertyCode);
      const existing = recordId ? await tx.projectComment.findFirst({
        where: {
          recordId,
          authorName: comment.authorName,
          body: comment.body,
          createdAt: new Date(comment.createdAt),
        },
      }) : null;
      if (existing) summary.projectComments.skipped += 1;
      else {
        summary.projectComments.created += 1;
        if (!dryRun && recordId && propertyId) {
          await tx.projectComment.create({
            data: {
              recordId,
              propertyId,
              authorId: null,
              authorName: comment.authorName,
              body: comment.body,
              createdAt: new Date(comment.createdAt),
              updatedAt: new Date(comment.updatedAt),
            },
          });
        }
      }
    }

    for (const task of backup.data.projectTasks) {
      const recordId = projectRecordMap.get(task.recordKey);
      const propertyId = propertyMap.get(task.propertyCode);
      const existing = recordId ? await tx.projectTask.findFirst({
        where: {
          recordId,
          title: task.title,
          createdAt: new Date(task.createdAt),
        },
      }) : null;
      if (existing) summary.projectTasks.skipped += 1;
      else {
        summary.projectTasks.created += 1;
        if (!dryRun && recordId && propertyId) {
          await tx.projectTask.create({
            data: {
              recordId,
              propertyId,
              title: task.title,
              status: task.status,
              assignedUserId: null,
              assignedUserName: task.assignedUserName,
              dueDate: dateValue(task.dueDate),
              completedById: null,
              completedDate: dateValue(task.completedDate),
              createdAt: new Date(task.createdAt),
              updatedAt: new Date(task.updatedAt),
            },
          });
        }
      }
    }

    for (const attachment of backup.data.projectAttachments) {
      const recordId = projectRecordMap.get(attachment.recordKey);
      const propertyId = propertyMap.get(attachment.propertyCode);
      const existing = await tx.projectAttachment.findFirst({ where: { storedName: attachment.storedName } });
      if (existing) summary.projectAttachments.skipped += 1;
      else {
        summary.projectAttachments.created += 1;
        if (!dryRun && recordId && propertyId) {
          await tx.projectAttachment.create({
            data: {
              recordId,
              propertyId,
              uploadedById: null,
              uploaderName: attachment.uploaderName,
              originalName: attachment.originalName,
              storedName: attachment.storedName,
              mimeType: attachment.mimeType,
              sizeBytes: attachment.sizeBytes,
              attachmentType: attachment.attachmentType,
              caption: attachment.caption,
              createdAt: new Date(attachment.createdAt),
            },
          });
        }
      }
    }

    for (const reference of backup.data.projectWikiReferences) {
      const propertyId = propertyMap.get(reference.propertyCode);
      const recordId = projectRecordMap.get(reference.recordKey);
      const targetId = reference.targetType === "ENTRY"
        ? propertyWikiEntryMap.get(reference.targetKey)
        : reference.targetType === "VENDOR"
          ? propertyWikiVendorMap.get(reference.targetKey)
          : propertyWikiAssetMap.get(reference.targetKey);
      if (!propertyId || !recordId || !targetId) {
        summary.projectWikiReferences.skipped += 1;
        summary.projectWikiReferences.errors.push(`Project Wiki reference could not be resolved for ${reference.recordKey}`);
        continue;
      }
      const existing = await tx.projectWikiReference.findUnique({
        where: {
          recordId_targetType_targetId: {
            recordId,
            targetType: reference.targetType,
            targetId,
          },
        },
      }).catch(() => null);
      if (existing) summary.projectWikiReferences.skipped += 1;
      else {
        summary.projectWikiReferences.created += 1;
        if (!dryRun) {
          await tx.projectWikiReference.create({
            data: {
              recordId,
              propertyId,
              targetType: reference.targetType,
              targetId,
              createdById: null,
              createdAt: dateValue(reference.createdAt) ?? new Date(),
            },
          });
        }
      }
    }

    const pestVendorMap = new Map<string, string>();
    for (const vendor of backup.data.pestVendors) {
      const propertyId = propertyMap.get(vendor.propertyCode);
      const existing = propertyId ? await tx.pestVendor.findFirst({
        where: {
          propertyId,
          vendorName: vendor.vendorName,
        },
      }) : null;
      if (existing) {
        pestVendorMap.set(vendor.portableKey, existing.id);
        summary.pestVendors.skipped += 1;
      } else {
        summary.pestVendors.created += 1;
        if (!dryRun && propertyId) {
          const { portableKey: _portableKey, propertyCode: _propertyCode, ...data } = vendor;
          const created = await tx.pestVendor.create({
            data: {
              ...data,
              propertyId,
              createdById: null,
              updatedById: null,
            },
          });
          pestVendorMap.set(vendor.portableKey, created.id);
        }
      }
    }
    if (dryRun && backup.data.pestVendors.length > 0) {
      const existingVendors = await tx.pestVendor.findMany({
        include: { property: true },
        where: {
          OR: backup.data.pestVendors.flatMap((vendor) => {
            const propertyId = propertyMap.get(vendor.propertyCode);
            return propertyId ? [{ propertyId, vendorName: vendor.vendorName }] : [];
          }),
        },
      });
      existingVendors.forEach((vendor) => pestVendorMap.set(pestVendorPortableKey({
        propertyCode: vendor.property.code,
        vendorName: vendor.vendorName,
      }), vendor.id));
    }

    const pestIssueMap = new Map<string, string>();
    for (const issue of backup.data.pestIssues) {
      const propertyId = propertyMap.get(issue.propertyCode);
      const unitId = issue.unitNumber ? unitMap.get(`${issue.propertyCode}|${issue.unitNumber}`) ?? null : null;
      const makeReadyItemId = issue.makeReadyItemKey ? itemMap.get(issue.makeReadyItemKey) ?? null : null;
      const vendorId = issue.vendorKey ? pestVendorMap.get(issue.vendorKey) ?? null : null;
      const existing = propertyId ? await tx.pestIssue.findFirst({
        where: {
          propertyId,
          pestType: issue.pestType,
          requestDate: new Date(issue.requestDate),
          area: issue.area,
          unitId,
        },
      }) : null;
      if (existing) {
        pestIssueMap.set(issue.portableKey, existing.id);
        summary.pestIssues.skipped += 1;
      } else {
        summary.pestIssues.created += 1;
        if (!dryRun && propertyId) {
          const { portableKey: _portableKey, propertyCode: _propertyCode, unitNumber: _unitNumber, makeReadyItemKey: _makeReadyItemKey, vendorKey: _vendorKey, ...data } = issue;
          const created = await tx.pestIssue.create({
            data: {
              ...data,
              propertyId,
              unitId,
              makeReadyItemId,
              vendorId,
              assignedUserId: null,
              createdById: null,
              updatedById: null,
              closedById: null,
              archivedById: null,
              requestDate: new Date(issue.requestDate),
              treatmentDate: dateValue(issue.treatmentDate),
              followUpDate: dateValue(issue.followUpDate),
              recurringDismissedAt: dateValue(issue.recurringDismissedAt),
              closedAt: dateValue(issue.closedAt),
              archivedAt: dateValue(issue.archivedAt),
              createdAt: new Date(issue.createdAt),
              updatedAt: new Date(issue.updatedAt),
            },
          });
          pestIssueMap.set(issue.portableKey, created.id);
        }
      }
    }
    if (dryRun && backup.data.pestIssues.length > 0) {
      const existingIssues = await tx.pestIssue.findMany({
        include: { property: true, unit: true },
        where: {
          OR: backup.data.pestIssues.flatMap((issue) => {
            const propertyId = propertyMap.get(issue.propertyCode);
            const unitId = issue.unitNumber ? unitMap.get(`${issue.propertyCode}|${issue.unitNumber}`) ?? null : null;
            return propertyId ? [{
              propertyId,
              pestType: issue.pestType,
              requestDate: new Date(issue.requestDate),
              area: issue.area,
              unitId,
            }] : [];
          }),
        },
      });
      existingIssues.forEach((issue) => pestIssueMap.set(pestIssuePortableKey({
        propertyCode: issue.property.code,
        unitNumber: issue.unit?.number ?? null,
        area: issue.area,
        pestType: issue.pestType,
        requestDate: issue.requestDate.toISOString(),
      }), issue.id));
    }

    for (const note of backup.data.pestIssueNotes) {
      const issueId = pestIssueMap.get(note.issueKey);
      const propertyId = propertyMap.get(note.propertyCode);
      const existing = issueId ? await tx.pestIssueNote.findFirst({
        where: {
          issueId,
          authorName: note.authorName ?? "Imported backup",
          body: note.body,
          createdAt: new Date(note.createdAt),
        },
      }) : null;
      if (existing) summary.pestIssueNotes.skipped += 1;
      else {
        summary.pestIssueNotes.created += 1;
        if (!dryRun && issueId && propertyId) {
          await tx.pestIssueNote.create({
            data: {
              issueId,
              propertyId,
              authorUserId: null,
              authorName: note.authorName ?? "Imported backup",
              body: note.body,
              createdAt: new Date(note.createdAt),
            },
          });
        }
      }
    }

    for (const attachment of backup.data.pestAttachments) {
      const issueId = pestIssueMap.get(attachment.issueKey);
      const propertyId = propertyMap.get(attachment.propertyCode);
      const existing = await tx.pestIssueAttachment.findUnique({ where: { storedName: attachment.storedName } }).catch(() => null);
      if (existing) summary.pestAttachments.skipped += 1;
      else {
        summary.pestAttachments.created += 1;
        if (!dryRun && issueId && propertyId) {
          await tx.pestIssueAttachment.create({
            data: {
              issueId,
              propertyId,
              uploadedById: null,
              uploaderName: attachment.uploaderName ?? "Imported backup",
              photoType: attachment.photoType,
              caption: attachment.caption,
              originalName: attachment.originalName,
              storedName: attachment.storedName,
              mimeType: attachment.mimeType,
              sizeBytes: attachment.sizeBytes,
              createdAt: new Date(attachment.createdAt),
            },
          });
        }
      }
    }

    const leaseComplianceIssueTypeMap = new Map<string, string>();
    for (const issueType of backup.data.leaseComplianceIssueTypes) {
      const propertyId = propertyMap.get(issueType.propertyCode);
      const existing = propertyId ? await tx.leaseComplianceIssueType.findFirst({
        where: {
          propertyId,
          name: issueType.name,
        },
      }) : null;
      const portableKey = leaseComplianceIssueTypePortableKey(issueType);
      if (existing) {
        leaseComplianceIssueTypeMap.set(portableKey, existing.id);
        summary.leaseComplianceIssueTypes.skipped += 1;
      } else {
        summary.leaseComplianceIssueTypes.created += 1;
        if (!dryRun && propertyId) {
          const { propertyCode: _propertyCode, ...data } = issueType;
          const created = await tx.leaseComplianceIssueType.create({
            data: {
              ...data,
              propertyId,
              createdById: null,
              updatedById: null,
              color: issueType.color ?? undefined,
              createdAt: new Date(issueType.createdAt),
              updatedAt: new Date(issueType.updatedAt),
            },
          });
          leaseComplianceIssueTypeMap.set(portableKey, created.id);
        }
      }
    }
    if (dryRun && backup.data.leaseComplianceIssueTypes.length > 0) {
      const existingIssueTypes = await tx.leaseComplianceIssueType.findMany({
        include: { property: true },
        where: {
          OR: backup.data.leaseComplianceIssueTypes.flatMap((issueType) => {
            const propertyId = propertyMap.get(issueType.propertyCode);
            return propertyId ? [{ propertyId, name: issueType.name }] : [];
          }),
        },
      });
      existingIssueTypes.forEach((issueType) => leaseComplianceIssueTypeMap.set(leaseComplianceIssueTypePortableKey({
        propertyCode: issueType.property.code,
        name: issueType.name,
      }), issueType.id));
    }

    for (const settings of backup.data.leaseComplianceSettings) {
      const propertyId = propertyMap.get(settings.propertyCode);
      const existing = propertyId ? await tx.leaseComplianceSettings.findUnique({ where: { propertyId } }) : null;
      if (existing) summary.leaseComplianceSettings.skipped += 1;
      else {
        summary.leaseComplianceSettings.created += 1;
        if (!dryRun && propertyId) {
          const { propertyCode: _propertyCode, ...data } = settings;
          await tx.leaseComplianceSettings.create({
            data: {
              ...data,
              propertyId,
              updatedById: null,
              createdAt: new Date(settings.createdAt),
              updatedAt: new Date(settings.updatedAt),
            },
          });
        }
      }
    }

    const leaseComplianceIssueMap = new Map<string, string>();
    for (const issue of backup.data.leaseComplianceIssues) {
      const propertyId = propertyMap.get(issue.propertyCode);
      const unitId = issue.unitNumber ? unitMap.get(`${issue.propertyCode}|${issue.unitNumber}`) ?? null : null;
      const issueTypeId = issue.issueTypeKey ? leaseComplianceIssueTypeMap.get(issue.issueTypeKey) ?? null : null;
      const propertyMapId = issue.propertyMapName ? propertyMapMap.get(`${issue.propertyCode}|${issue.propertyMapName}`) ?? null : null;
      const existing = propertyId ? await tx.leaseComplianceIssue.findFirst({
        where: {
          propertyId,
          unitId,
          building: issue.building,
          area: issue.area,
          issueTypeName: issue.issueTypeName,
          createdAt: new Date(issue.createdAt),
        },
      }) : null;
      if (existing) {
        leaseComplianceIssueMap.set(issue.portableKey, existing.id);
        summary.leaseComplianceIssues.skipped += 1;
      } else {
        summary.leaseComplianceIssues.created += 1;
        if (!dryRun && propertyId) {
          const {
            portableKey: _portableKey,
            propertyCode: _propertyCode,
            unitNumber: _unitNumber,
            issueTypeKey: _issueTypeKey,
            propertyMapName: _propertyMapName,
            ...data
          } = issue;
          const created = await tx.leaseComplianceIssue.create({
            data: {
              ...data,
              propertyId,
              unitId,
              issueTypeId,
              propertyMapId,
              assignedUserId: null,
              resolvedById: null,
              archivedById: null,
              createdById: null,
              updatedById: null,
              lastPersistenceCheckDate: dateValue(issue.lastPersistenceCheckDate),
              residentNotifiedDate: dateValue(issue.residentNotifiedDate),
              notice1Date: dateValue(issue.notice1Date),
              notice2Date: dateValue(issue.notice2Date),
              notice3Date: dateValue(issue.notice3Date),
              violationNeededDate: dateValue(issue.violationNeededDate),
              recurringDismissedAt: dateValue(issue.recurringDismissedAt),
              resolvedDate: dateValue(issue.resolvedDate),
              archiveDate: dateValue(issue.archiveDate),
              createdAt: new Date(issue.createdAt),
              updatedAt: new Date(issue.updatedAt),
            },
          });
          leaseComplianceIssueMap.set(issue.portableKey, created.id);
        }
      }
    }
    if (dryRun && backup.data.leaseComplianceIssues.length > 0) {
      const existingIssues = await tx.leaseComplianceIssue.findMany({
        include: { property: true, unit: true },
        where: {
          OR: backup.data.leaseComplianceIssues.flatMap((issue) => {
            const propertyId = propertyMap.get(issue.propertyCode);
            const unitId = issue.unitNumber ? unitMap.get(`${issue.propertyCode}|${issue.unitNumber}`) ?? null : null;
            return propertyId ? [{
              propertyId,
              unitId,
              building: issue.building,
              area: issue.area,
              issueTypeName: issue.issueTypeName,
              createdAt: new Date(issue.createdAt),
            }] : [];
          }),
        },
      });
      existingIssues.forEach((issue) => leaseComplianceIssueMap.set(leaseComplianceIssuePortableKey({
        propertyCode: issue.property.code,
        unitNumber: issue.unit?.number ?? null,
        building: issue.building,
        area: issue.area,
        issueTypeName: issue.issueTypeName,
        createdAt: issue.createdAt.toISOString(),
      }), issue.id));
    }

    for (const note of backup.data.leaseComplianceIssueNotes) {
      const issueId = leaseComplianceIssueMap.get(note.issueKey);
      const propertyId = propertyMap.get(note.propertyCode);
      const existing = issueId ? await tx.leaseComplianceIssueNote.findFirst({
        where: {
          issueId,
          authorName: note.authorName ?? "Imported backup",
          body: note.body,
          createdAt: new Date(note.createdAt),
        },
      }) : null;
      if (existing) summary.leaseComplianceIssueNotes.skipped += 1;
      else {
        summary.leaseComplianceIssueNotes.created += 1;
        if (!dryRun && issueId && propertyId) {
          await tx.leaseComplianceIssueNote.create({
            data: {
              issueId,
              propertyId,
              authorUserId: null,
              authorName: note.authorName ?? "Imported backup",
              body: note.body,
              createdAt: new Date(note.createdAt),
            },
          });
        }
      }
    }

    for (const photo of backup.data.leaseComplianceIssuePhotos) {
      const issueId = leaseComplianceIssueMap.get(photo.issueKey);
      const propertyId = propertyMap.get(photo.propertyCode);
      const existing = await tx.leaseComplianceIssuePhoto.findUnique({ where: { storedName: photo.storedName } }).catch(() => null);
      if (existing) summary.leaseComplianceIssuePhotos.skipped += 1;
      else {
        summary.leaseComplianceIssuePhotos.created += 1;
        if (!dryRun && issueId && propertyId) {
          await tx.leaseComplianceIssuePhoto.create({
            data: {
              issueId,
              propertyId,
              uploadedById: null,
              uploaderName: photo.uploaderName ?? "Imported backup",
              photoCategory: photo.photoCategory,
              caption: photo.caption,
              originalName: photo.originalName,
              storedName: photo.storedName,
              mimeType: photo.mimeType,
              sizeBytes: photo.sizeBytes,
              createdAt: new Date(photo.createdAt),
            },
          });
        }
      }
    }

    for (const action of backup.data.leaseComplianceNoticeActions) {
      const issueId = leaseComplianceIssueMap.get(action.issueKey);
      const propertyId = propertyMap.get(action.propertyCode);
      const existing = issueId ? await tx.leaseComplianceNoticeAction.findFirst({
        where: {
          issueId,
          action: action.action,
          createdAt: new Date(action.createdAt),
        },
      }) : null;
      if (existing) summary.leaseComplianceNoticeActions.skipped += 1;
      else {
        summary.leaseComplianceNoticeActions.created += 1;
        if (!dryRun && issueId && propertyId) {
          await tx.leaseComplianceNoticeAction.create({
            data: {
              issueId,
              propertyId,
              actedById: null,
              actedByName: action.actedByName ?? "Imported backup",
              action: action.action,
              noticeStage: action.noticeStage,
              notes: action.notes,
              createdAt: new Date(action.createdAt),
            },
          });
        }
      }
    }

    for (const check of backup.data.leaseCompliancePersistenceChecks) {
      const issueId = leaseComplianceIssueMap.get(check.issueKey);
      const propertyId = propertyMap.get(check.propertyCode);
      const existing = issueId ? await tx.leaseCompliancePersistenceCheck.findFirst({
        where: {
          issueId,
          stillPersists: check.stillPersists,
          createdAt: new Date(check.createdAt),
        },
      }) : null;
      if (existing) summary.leaseCompliancePersistenceChecks.skipped += 1;
      else {
        summary.leaseCompliancePersistenceChecks.created += 1;
        if (!dryRun && issueId && propertyId) {
          await tx.leaseCompliancePersistenceCheck.create({
            data: {
              issueId,
              propertyId,
              checkedById: null,
              checkedByName: check.checkedByName ?? "Imported backup",
              stillPersists: check.stillPersists,
              notes: check.notes,
              createdAt: new Date(check.createdAt),
            },
          });
        }
      }
    }

    for (const reference of backup.data.propertyWikiReferences.filter((entry) => entry.recordType === "LEASE_COMPLIANCE_ISSUE")) {
      const propertyId = propertyMap.get(reference.propertyCode);
      const recordId = leaseComplianceIssueMap.get(reference.recordKey);
      const targetId = reference.targetType === "ENTRY"
        ? propertyWikiEntryMap.get(reference.targetKey)
        : reference.targetType === "VENDOR"
          ? propertyWikiVendorMap.get(reference.targetKey)
          : propertyWikiAssetMap.get(reference.targetKey);
      if (!propertyId || !recordId || !targetId) {
        summary.propertyWikiReferences.skipped += 1;
        summary.propertyWikiReferences.errors.push(`Property Wiki workflow reference could not be resolved for ${reference.recordType}:${reference.recordKey}`);
        continue;
      }
      const existing = await tx.propertyWikiReference.findUnique({
        where: {
          recordType_recordId_targetType_targetId: {
            recordType: reference.recordType,
            recordId,
            targetType: reference.targetType,
            targetId,
          },
        },
      });
      if (existing) summary.propertyWikiReferences.skipped += 1;
      else {
        summary.propertyWikiReferences.created += 1;
        if (!dryRun) {
          await tx.propertyWikiReference.create({
            data: {
              propertyId,
              recordType: reference.recordType,
              recordId,
              targetType: reference.targetType,
              targetId,
              createdById: null,
              createdAt: dateValue(reference.createdAt) ?? new Date(),
            },
          });
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
