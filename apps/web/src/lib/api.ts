export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "/api";
let csrfToken: string | null = null;

function notifyApiUnreachable(path: string, method: string) {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent("makereadyos:api-unreachable", {
    detail: { path, method, at: new Date().toISOString() },
  }));
}

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export type UserRole = "ADMIN" | "MANAGER" | "TECH" | "LEASING" | "CLEANER" | "VIEWER";
export type UserLanguage = "en" | "es";
export type CustomFieldType = "TEXT" | "LONG_TEXT" | "NUMBER" | "DATE" | "SINGLE_SELECT" | "MULTI_SELECT" | "BOOLEAN" | "USER";

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  language: UserLanguage;
  propertyAccess: Array<{
    propertyId: string;
    role: UserRole;
  }>;
};

export type StaffOption = {
  id: string;
  fullName: string;
  role: "ADMIN" | "MANAGER" | "TECH" | "LEASING" | "CLEANER";
};

export type BoardColumnDefinition = {
  fieldKey: string;
  label: string;
};

export type ScheduleTrack = {
  id: string;
  sourceField: string;
  displayName: string;
  colorBasis: "STATUS" | "SCOPE" | "FIELD" | "FIXED" | "NEUTRAL";
  colorSourceField: string | null;
  fixedColor: string | null;
  groupingMode: "NONE" | "PROPERTY" | "BOARD_GROUP";
  visibilityFilter: { boardGroups?: string[]; statusValues?: string[] } | null;
  overdueEnabled: boolean;
  moveInSoonEnabled: boolean;
  isEnabled: boolean;
  isArchived: boolean;
  sortOrder: number;
};

export type OperatingCalendar = {
  id: string;
  propertyId: string;
  name: string;
  timezone: string;
  noWeekendScheduling: boolean;
  avoidMondayScheduling: boolean;
  avoidFridayScheduling: boolean;
  maintenanceStartMinute: number;
  maintenanceEndMinute: number;
  vendorLeadDays: number;
  dailyScheduledUnitLimit: number | null;
  scopeDay: number | null;
  workStartDay: number | null;
  autoPopulateEnabled: boolean;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  property: Property;
};

export type ManagedUser = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  language: UserLanguage;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  propertyAccess: Array<{
    propertyId: string;
    role: UserRole;
  }>;
};

export type SavedView = {
  id: string;
  ownerUserId: string | null;
  name: string;
  module: string;
  viewType: "table" | "kanban" | "calendar" | "dashboard";
  filters: Record<string, unknown>;
  sorts: { key: string; direction: "asc" | "desc" } | null;
  grouping: Record<string, unknown> | null;
  visibleColumns: string[] | null;
  isShared: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BackupSummaryBucket = {
  created: number;
  skipped: number;
  conflicts: number;
  errors: string[];
};

export type BackupImportSummary = Record<string, BackupSummaryBucket>;

export type NativeBackup = {
  format: "makereadyos.backup";
  version: number;
  exportedAt: string;
  source: { app: "MakeReadyOS"; schemaVersion?: string };
  data: Record<string, unknown[]>;
};

export type Property = {
  id: string;
  name: string;
  code: string;
  occupancyGoalPercent: number | null;
  isActive: boolean;
  _count?: { units: number; makeReadyItems: number };
};

export type ApiTokenScope =
  | "read:items"
  | "write:items"
  | "read:vendors"
  | "write:vendors"
  | "read:dashboard"
  | "read:activity"
  | "write:comments"
  | "read:maps"
  | "read:library"
  | "write:library";

export type ApiTokenRecord = {
  id: string;
  name: string;
  tokenPrefix: string;
  tokenLastFour: string;
  scopes: ApiTokenScope[];
  isActive: boolean;
  revokedAt: string | null;
  useCount: number;
  lastUsedAt: string | null;
  lastUsedPath: string | null;
  lastUsedMethod: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; fullName: string; email: string };
  properties: Array<Pick<Property, "id" | "name" | "code">>;
};

export type WebhookEventType =
  | "item.created"
  | "item.updated"
  | "item.assigned"
  | "item.archived"
  | "item.restored"
  | "item.risk.changed"
  | "comment.created"
  | "attachment.created"
  | "attachment.deleted"
  | "vendor.assignment.updated"
  | "checklist.completed"
  | "project.record.created"
  | "project.record.updated"
  | "project.record.archived"
  | "pest.issue.created"
  | "pest.issue.updated"
  | "pest.issue.archived"
  | "pm.template.created"
  | "pm.template.updated"
  | "pm.task.completed"
  | "pm.task.skipped"
  | "pool.entry.created";

export type WebhookEndpointRecord = {
  id: string;
  name: string;
  url: string;
  secretLastFour: string;
  eventTypes: WebhookEventType[];
  isEnabled: boolean;
  lastDeliveryAt: string | null;
  failureCount: number;
  deliveryAttemptCount?: number;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; fullName: string; email: string };
  properties: Array<Pick<Property, "id" | "name" | "code">>;
};

export type WebhookDeliveryAttempt = {
  id: string;
  webhookId: string;
  eventType: WebhookEventType;
  status: "PENDING" | "DELIVERED" | "FAILED" | "GAVE_UP" | "DRY_RUN";
  deliveryId: string;
  payload: unknown;
  headers: unknown;
  attemptNumber: number;
  responseStatus: number | null;
  responseBody: string | null;
  errorMessage: string | null;
  nextAttemptAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WebhookHealthResponse = {
  webhook: WebhookEndpointRecord;
  health: {
    state: "READY" | "PENDING" | "FAILING" | "DISABLED";
    total: number;
    pendingCount: number;
    statusCounts: Record<string, number>;
    eventCounts: Record<string, number>;
    failureCount: number;
    lastDeliveryAt: string | null;
    oldestPendingAt: string | null;
    latestFailure: WebhookDeliveryAttempt | null;
  };
};

export type IntegrationsResponse = {
  scopes: ApiTokenScope[];
  apiTokenRateLimit: {
    max: number;
    windowMinutes: number;
    storage: "database-shared";
  };
  webhookEvents: WebhookEventType[];
  apiTokens: ApiTokenRecord[];
  webhooks: WebhookEndpointRecord[];
  properties: Array<Pick<Property, "id" | "name" | "code">>;
  webhookDelivery: "scaffolded" | "enabled";
};

export type StorageSettingsResponse = {
  storage: {
    mode: "HOST_PATH" | "DOCKER_VOLUME";
    uploadDir: string;
    hostPath: string;
    maxUploadMb: number;
    uploadLimitDisabled: boolean;
    uploadLimitLabel: string;
    bundledProxyLimit: string;
    activationRequiresRestart: boolean;
    current: {
      uploadDir: string;
      writable: boolean;
      freeBytes: number | null;
      totalBytes: number | null;
      error: string | null;
    };
    notes: string[];
    propertyRouting: Array<{
      id: string;
      code: string;
      name: string;
      uploadStorageMode: "DEFAULT" | "PROPERTY_SUBDIR";
      uploadSubdir: string | null;
      effectiveSubdir: string | null;
      suggestedSubdir: string;
    }>;
  };
};

export type StorageValidationResponse = {
  normalizedPath: string;
  safe: boolean;
  errors: string[];
  warnings: string[];
  commands: null | {
    dryRun: string;
    move: string;
    env: string;
    restart: string;
    backup: string;
  };
};

export type BoardSection = {
  id: string;
  propertyId: string;
  key: string;
  sectionType: "READY" | "MAKE_READY" | "DOWN" | "ARCHIVE";
  displayName: string;
  sortOrder: number;
  isActive: boolean;
  property: Property;
};

export type DashboardResponse = {
  kpis: Record<string, number>;
  vacancyBreakdown: Record<string, number>;
  scopeBreakdown: Record<string, number>;
  techWorkload: Record<string, number>;
  propertyComparison: Record<string, number>;
  downUnitsByArea: Record<string, number>;
  riskByLevel: Record<string, number>;
  riskByCategory: Record<string, number>;
  riskByProperty: Record<string, number>;
  riskByAssignedTech: Record<string, number>;
  planningWorkload?: Record<string, number>;
  riskTrend: { available: boolean; message: string };
  longestVacant: Array<{ itemId: string; unitNumber: string; property: Property; daysVacant: number }>;
  needsAttention: Array<{ itemId: string; unitNumber: string; property: Property; reasons: string[]; riskLevel?: string; riskScore?: number }>;
  recentStatusChanges: Array<{
    key: string;
    itemId: string;
    unitNumber: string;
    property: Property;
    changeType: "VACATED" | "NOTICE" | "READY" | "MOVED_IN" | "AVAILABILITY";
    title: string;
    detail: string;
    changedAt: string;
    source: "board" | "availability";
  }>;
  propertyMaps?: {
    totalMaps: number;
    activeMaps: number;
    defaultMapName: string | null;
    totalPins: number;
    emergencyPins: number;
    utilityPins: number;
    unmappedUnits: number;
    recentPins: Array<{ id: string; title: string; pinType: string; mapName: string; isEmergency: boolean; building: string | null; unitLabel: string | null; area: string | null }>;
  };
};

export type AnalyticsSummaryResponse = {
  generatedAt: string;
  metrics: {
    activeTurns: number;
    averageDaysVacant: number;
    averageTurnDuration: number;
    completedThisWeek: number;
    completedThisMonth: number;
    overdue: number;
    highRisk: number;
    criticalRisk: number;
    slaMisses: number;
    staleRiskItems: number;
  };
  riskByLevel: Record<string, number>;
  riskByCategory: Record<string, number>;
  propertyComparison: Record<string, { active: number; overdue: number; highRisk: number; averageDaysVacant: number }>;
  trends: Array<{ date: string; property: Property; activeTurns: number; overdue: number; highRisk: number; averageDaysVacant: number; completedTurnsCount: number }>;
  recurringProblemUnits: Array<{ unitId: string | null; unitNumber: string; property: Property; turnCount: number; score: number; signals: Record<string, number> }>;
  recentCompletedTurns: Array<{ itemId: string; unitNumber: string; property: Property; completedAt: string; turnDuration: number | null; daysVacant: number; riskLevel: string; assignedTech: string | null; vendorWorkCount: number; checklistCompletionPercent: number }>;
};

export type UnitHistoryResponse = {
  unit: Unit;
  turns: Array<{ itemId: string; current: boolean; createdAt: string; vacatedDate: string | null; makeReadyDate: string | null; moveInDate: string | null; completedAt: string | null; daysVacant: number; turnDuration: number | null; riskLevel: string; assignedTech: string | null; vendorWorkCount: number; checklistCompletionPercent: number }>;
  recurringSignals: Record<"pest" | "flooring" | "paint" | "vendor" | "highRisk", number>;
  events: Array<{ type: string; occurredAt: string; title: string; description: string; source: string; metadata: Record<string, unknown> }>;
};

export type RiskReason = {
  category: string;
  level: "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  score: number;
  message: string;
};

export type RiskSummaryResponse = {
  totals: { evaluated: number; critical: number; high: number; medium: number; low: number };
  byLevel: Record<string, number>;
  byCategory: Record<string, number>;
  byProperty: Record<string, { total: number; highOrCritical: number }>;
  byAssignedTech: Record<string, { total: number; highOrCritical: number }>;
  topRiskItems: Array<{ itemId: string; unitNumber: string; property: Property; riskScore: number; riskLevel: string; riskReasons: RiskReason[] }>;
  trend: { available: boolean; message: string };
};

export type RiskPolicy = {
  moveInCriticalDays: number;
  moveInHighDays: number;
  moveInMediumDays: number;
  unassignedHighDays: number;
  staleActivityDays: number;
  agingMediumDays: number;
  agingHighDays: number;
  vendorNearMoveInDays: number;
  checklistNearMoveInDays: number;
  planningNearMoveInDays: number;
};

export type NotificationRecord = {
  id: string;
  category: string;
  title: string;
  message: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  property: Property | null;
  item: { id: string; unitNumber: string } | null;
};

export type Vendor = {
  id: string;
  name: string;
  trade: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  isActive: boolean;
  isPreferred: boolean;
  insuranceExpiresAt: string | null;
  licenseExpiresAt: string | null;
  serviceAreas: Array<{ propertyId: string; property: Property }>;
  _count?: { assignments: number };
};

export type VendorAssignment = {
  id: string;
  vendorId: string;
  propertyId: string;
  itemId: string;
  trade: string;
  status: "REQUESTED" | "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELED" | "FOLLOW_UP_NEEDED";
  scheduledDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  notes: string | null;
  costEstimate: number | null;
  invoiceRef: string | null;
  vendor: Vendor;
  property: Property;
  item: Pick<MakeReadyItem, "id" | "unitNumber" | "assignedTech" | "moveInDate">;
};

export type RefrigerantType = {
  id: string;
  name: string;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RefrigerantCylinder = {
  id: string;
  identifier: string;
  refrigerantTypeId: string;
  refrigerantType: RefrigerantType;
  category: "VIRGIN" | "CLEAN_RECOVERY" | "DIRTY_RECOVERY";
  tankSize: number;
  currentWeight: number;
  fillPercent?: number;
  status: "ACTIVE" | "EMPTY_PENDING_RECOVERY" | "ARCHIVED";
  notes: string | null;
  dispositionNotes: string | null;
  finalRecoveryCompleted: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RefrigerantTransaction = {
  id: string;
  transactionType: "VIRGIN_CHARGE" | "CLEAN_RECOVERY" | "DIRTY_RECOVERY" | "FINAL_RECOVERY";
  propertyId: string | null;
  unitId: string | null;
  unitNumber: string | null;
  refrigerantTypeId: string;
  refrigerantType: RefrigerantType;
  sourceCylinder: RefrigerantCylinder | null;
  recoveryCylinder: RefrigerantCylinder | null;
  occurredAt: string;
  startWeight: number;
  endWeight: number;
  amount: number;
  notes: string | null;
  createdByName: string | null;
};

export type RefrigerantLeakFlag = {
  id: string;
  propertyId: string | null;
  unitId: string | null;
  unitNumber: string;
  refrigerantTypeId: string | null;
  refrigerantType?: RefrigerantType | null;
  level: "POTENTIAL_REFRIGERANT_LEAK" | "MANAGER_REVIEW_REQUIRED";
  status: "ACTIVE" | "DISMISSED";
  reason: string;
  firstDetectedAt: string;
  lastDetectedAt: string;
  dismissedAt: string | null;
  dismissalNotes: string | null;
};

export type RefrigerantComplianceIssue = {
  severity: "MEDIUM" | "HIGH" | "CRITICAL";
  type: string;
  message: string;
  cylinderId?: string;
  transactionId?: string;
  leakFlagId?: string;
};

export type RefrigerantOverviewResponse = {
  permissions: { view: boolean; edit: boolean; admin: boolean };
  types: RefrigerantType[];
  summary: {
    activeVirginByType: Record<string, number>;
    recoveryNearCapacity: number;
    repeatedAdditionFlags: number;
    complianceIssues: number;
    recentActivity: number;
  };
  recoveryNearCapacity: RefrigerantCylinder[];
  leakFlags: RefrigerantLeakFlag[];
  complianceIssues: RefrigerantComplianceIssue[];
  recent: RefrigerantTransaction[];
};

export type RefrigerantHistoryResponse = {
  transactions: RefrigerantTransaction[];
  pagination: { total: number; limit: number; offset: number; hasMore: boolean };
};

export type PoolFacility = {
  id: string;
  propertyId: string;
  property?: Property;
  name: string;
  type: "POOL" | "SPA" | "WADING_POOL" | "SPLASH_PAD" | "OTHER";
  capacityGallons: number | null;
  surfaceType: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PoolChemical = {
  id: string;
  propertyId: string;
  property?: Property;
  name: string;
  category: "CHLORINE" | "PH_UP" | "PH_DOWN" | "ALKALINITY_UP" | "STABILIZER" | "CALCIUM_HARDNESS" | "OTHER";
  concentrationPercent: number | null;
  unit: "POUNDS" | "OUNCES" | "GALLONS" | "QUARTS" | "TABLETS";
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PoolSafetyCheck = {
  id: string;
  entryId: string;
  label: string;
  value: "PASS" | "FAIL" | "NA";
  notes: string | null;
  sortOrder: number;
};

export type PoolChemicalAddition = {
  id: string;
  entryId: string;
  chemicalId: string | null;
  chemicalName: string;
  amount: number;
  unit: PoolChemical["unit"];
  notes: string | null;
};

export type PoolLogAttachment = {
  id: string;
  entryId: string;
  propertyId: string;
  uploadedById: string | null;
  uploaderName: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  sizeBytes: number;
  category: string | null;
  notes: string | null;
  createdAt: string;
};

export type PoolEvaluation = {
  status: "OK" | "REVIEW";
  issueCount: number;
  issues: Array<{ code: string; severity: "LOW" | "MEDIUM" | "HIGH"; message: string }>;
  recommendations: string[];
  dosage: Array<{ chemicalCategory: string; chemicalName?: string; amount?: number; unit?: string; message: string; missing?: string[] }>;
};

export type PoolLogEntry = {
  id: string;
  propertyId: string;
  property?: Property;
  facilityId: string;
  facility: PoolFacility;
  technicianId: string | null;
  technicianName: string | null;
  logDate: string;
  logTime: string | null;
  ph: number | null;
  freeChlorine: number | null;
  combinedChlorine: number | null;
  totalChlorine: number | null;
  totalAlkalinity: number | null;
  cyanuricAcid: number | null;
  calciumHardness: number | null;
  waterTemperature: number | null;
  vacuumed: boolean;
  backwashed: boolean;
  skimmerCleaned: boolean;
  pumpRunning: boolean;
  filterOperating: boolean;
  waterClear: boolean;
  waterCloudy: boolean;
  algaePresent: boolean;
  notes: string | null;
  evaluationJson: PoolEvaluation | null;
  safetyChecks: PoolSafetyCheck[];
  chemicalAdditions: PoolChemicalAddition[];
  attachments: PoolLogAttachment[];
  createdAt: string;
  updatedAt: string;
};

export type PoolOverviewResponse = {
  permissions: { view: boolean; edit: boolean; manage: boolean };
  safetyItems: string[];
  facilities: PoolFacility[];
  chemicals: PoolChemical[];
  summary: {
    activeFacilities: number;
    logsToday: number;
    missingLogs: number;
    safetyFailures: number;
    chemistryIssues: number;
    chemicalAdditions: number;
  };
  missingFacilities: PoolFacility[];
  safetyFailures: Array<{ entryId: string; facilityName: string; label: string; notes: string | null }>;
  chemistryIssues: Array<{ entryId: string; facilityName: string; issue: unknown }>;
  usageToday: PoolChemicalAddition[];
  recentEntries: PoolLogEntry[];
};

export type PoolEntriesResponse = {
  entries: PoolLogEntry[];
  pagination: { total: number; limit: number; offset: number; hasMore: boolean };
};

export type PreventiveMaintenanceCategory =
  | "Pool"
  | "Gate"
  | "HVAC"
  | "Electrical"
  | "Fire Safety"
  | "Irrigation"
  | "Roof"
  | "Grounds"
  | "Building"
  | "Clubhouse"
  | "General"
  | "Other";

export type PreventiveMaintenanceFrequency =
  | "Daily"
  | "Weekly"
  | "Biweekly"
  | "Monthly"
  | "Quarterly"
  | "Semi-Annual"
  | "Annual"
  | "Custom";

export type PreventiveMaintenancePriority = "Low" | "Normal" | "High" | "Critical";
export type PreventiveMaintenanceStatus = "UPCOMING" | "DUE" | "COMPLETED" | "OVERDUE" | "SKIPPED";
export type PreventiveMaintenanceCompletionOutcome = "PASS" | "FAIL" | "COMPLETE" | "SKIPPED";

export type PreventiveMaintenanceTemplate = {
  id: string;
  propertyId: string;
  property?: Property;
  name: string;
  category: PreventiveMaintenanceCategory;
  description: string | null;
  instructions: string | null;
  frequency: PreventiveMaintenanceFrequency;
  customEveryDays: number | null;
  annualMonth: number | null;
  annualDay: number | null;
  assignedRole: UserRole;
  assignedUserId: string | null;
  assignedUserName: string | null;
  photosRequired: boolean;
  notesRequired: boolean;
  passFailRequired: boolean;
  priority: PreventiveMaintenancePriority;
  isActive: boolean;
  isArchived: boolean;
  createdById: string | null;
  updatedById: string | null;
  createdAt: string;
  updatedAt: string;
  tasks?: Array<{ id: string; dueDate: string; status: PreventiveMaintenanceStatus }>;
};

export type PreventiveMaintenanceTaskAttachment = {
  id: string;
  taskId: string;
  propertyId: string;
  uploadedById: string | null;
  uploaderName: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  sizeBytes: number;
  note: string | null;
  createdAt: string;
};

export type PreventiveMaintenanceTask = {
  id: string;
  propertyId: string;
  property: Property;
  templateId: string;
  template: PreventiveMaintenanceTemplate;
  taskName: string;
  category: PreventiveMaintenanceCategory;
  description: string | null;
  instructions: string | null;
  assignedRole: UserRole;
  assignedUserId: string | null;
  assignedUserName: string | null;
  dueDate: string;
  status: PreventiveMaintenanceStatus;
  priority: PreventiveMaintenancePriority;
  photosRequired: boolean;
  notesRequired: boolean;
  passFailRequired: boolean;
  completionOutcome: PreventiveMaintenanceCompletionOutcome | null;
  completionNotes: string | null;
  completedById: string | null;
  completedByName: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  attachments: PreventiveMaintenanceTaskAttachment[];
};

export type PreventiveMaintenanceOverviewResponse = {
  permissions: { view: boolean; edit: boolean; admin: boolean };
  categories: PreventiveMaintenanceCategory[];
  frequencies: PreventiveMaintenanceFrequency[];
  priorities: PreventiveMaintenancePriority[];
  assignedRoles: UserRole[];
  assignableUsers: Array<{ id: string; fullName: string; role: UserRole }>;
  summary: {
    dueToday: number;
    dueThisWeek: number;
    overdue: number;
    completedThisMonth: number;
    completionRate: number;
  };
  upcomingTasks: PreventiveMaintenanceTask[];
  overdueTasks: PreventiveMaintenanceTask[];
  recentCompletions: PreventiveMaintenanceTask[];
  compliance: {
    green: number;
    yellow: number;
    red: number;
  };
};

export type PropertyWikiSection =
  | "UTILITIES"
  | "ACCESS_CONTROL"
  | "POOLS"
  | "EMERGENCY_PROCEDURES"
  | "CUSTOM_PAGES"
  | "EQUIPMENT_REGISTRY"
  | "UNIT_STANDARDS"
  | "PROPERTY_CONTACTS"
  | "SOP_LIBRARY"
  | "KNOWN_ISSUES";
export type PropertyWikiAssetKind = "DOCUMENT" | "PHOTO";
export type PropertyWikiTargetType = "ENTRY" | "VENDOR" | "ASSET";

export type PropertyWikiRecordSummary = {
  targetType: PropertyWikiTargetType;
  id: string;
  propertyId: string;
  property: Property;
  section: string;
  title: string;
  snippet: string;
  tags: string[];
  updatedAt: string;
  building: string | null;
  isFavorite: boolean;
  isEmergency: boolean;
};

export type PropertyWikiProfile = {
  id: string;
  propertyId: string;
  property?: Property;
  address: string | null;
  unitCount: number | null;
  buildingCount: number | null;
  officePhone: string | null;
  afterHoursPhone: string | null;
  propertyManager: string | null;
  maintenanceSupervisor: string | null;
  regionalManager: string | null;
  generalNotes: string | null;
  createdById: string | null;
  updatedById: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PropertyWikiAsset = {
  id: string;
  propertyId: string;
  property?: Property;
  entryId: string | null;
  vendorId: string | null;
  kind: PropertyWikiAssetKind;
  title: string;
  category: string | null;
  building: string | null;
  description: string | null;
  tags: string[];
  isEmergency: boolean;
  storedName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdById: string | null;
  createdAt: string;
  entry?: { id: string; title: string; section: PropertyWikiSection } | null;
  vendor?: { id: string; companyName: string; vendorType: string } | null;
};

export type PropertyWikiEntry = {
  id: string;
  propertyId: string;
  property?: Property;
  section: PropertyWikiSection;
  title: string;
  category: string | null;
  building: string | null;
  locationDescription: string | null;
  equipmentModel: string | null;
  manufacturer: string | null;
  serialNumber: string | null;
  installDate: string | null;
  warrantyExpiresAt: string | null;
  floorPlan: string | null;
  unitType: string | null;
  blindSizes: string | null;
  hvacNotes: string | null;
  waterHeaterNotes: string | null;
  applianceNotes: string | null;
  paintStandards: string | null;
  countertopNotes: string | null;
  cabinetNotes: string | null;
  flooringNotes: string | null;
  contactType: string | null;
  contactTitle: string | null;
  phone: string | null;
  email: string | null;
  isEmergencyContact: boolean;
  relatedEntryIds: string[];
  relatedVendorIds: string[];
  notes: string | null;
  content: string | null;
  issueStatus: "Active" | "Resolved" | "Archived" | null;
  tags: string[];
  contacts: string | null;
  situation: string | null;
  poolCapacity: string | null;
  spaCapacity: string | null;
  pumpModels: string | null;
  filterModels: string | null;
  filterSizes: string | null;
  heaterModels: string | null;
  controllerNotes: string | null;
  chemicalTargetNotes: string | null;
  isPinned: boolean;
  isEmergency: boolean;
  isActive: boolean;
  createdById: string | null;
  updatedById: string | null;
  createdAt: string;
  updatedAt: string;
  assets: PropertyWikiAsset[];
};

export type PropertyWikiVendor = {
  id: string;
  propertyId: string;
  property?: Property;
  vendorType: string;
  companyName: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  emergencyPhone: string | null;
  notes: string | null;
  isActive: boolean;
  createdById: string | null;
  updatedById: string | null;
  createdAt: string;
  updatedAt: string;
  assets: PropertyWikiAsset[];
};

export type PropertyWikiOverviewResponse = {
  permissions: { view: boolean; edit: boolean; admin: boolean };
  categories: {
    utility: string[];
    accessControl: string[];
    equipment: string[];
    knownIssueStatuses: string[];
    propertyContacts: string[];
    sop: string[];
    vendorTypes: string[];
    document: string[];
    photo: string[];
  };
  defaultEmergencyProcedures: string[];
  property: Property | null;
  profile: PropertyWikiProfile | null;
  recentlyUpdated: PropertyWikiEntry[];
  pinnedCriticalInformation: PropertyWikiEntry[];
  favorites: PropertyWikiRecordSummary[];
  recentlyViewed: Array<PropertyWikiRecordSummary & { viewedAt: string }>;
  emergencyMode: PropertyWikiRecordSummary[];
  emergencyProcedures: PropertyWikiEntry[];
  emergencyContacts: PropertyWikiEntry[];
  vendorHighlights: PropertyWikiVendor[];
  recentDocuments: PropertyWikiAsset[];
  recentPhotos: PropertyWikiAsset[];
  commonCategories: Array<{ label: string; count: number }>;
};

export type PropertyWikiSearchResult = {
  id: string;
  propertyId: string;
  property: Property;
  targetType: PropertyWikiTargetType;
  section: string;
  title: string;
  snippet: string;
  tags: string[];
  building: string | null;
  isFavorite: boolean;
  isEmergency: boolean;
  updatedAt: string;
};

export type PropertyWikiRecordDetail = {
  record: PropertyWikiRecordSummary | null;
  entry: PropertyWikiEntry | null;
  vendor: PropertyWikiVendor | null;
  asset: PropertyWikiAsset | null;
  related: {
    sops: PropertyWikiRecordSummary[];
    equipment: PropertyWikiRecordSummary[];
    knownIssues: PropertyWikiRecordSummary[];
    vendors: PropertyWikiRecordSummary[];
    photos: PropertyWikiRecordSummary[];
    documents: PropertyWikiRecordSummary[];
  };
  history: Array<{
    id: string;
    user: string;
    date: string;
    action: string;
  }>;
};

export type PropertyWikiWorkflowRecordType =
  | "MAKE_READY_ITEM"
  | "REFRIGERANT_TRANSACTION"
  | "POOL_LOG_ENTRY"
  | "PM_TEMPLATE"
  | "PM_TASK"
  | "PROJECT_RECORD"
  | "LEASE_COMPLIANCE_ISSUE"
  | "FUTURE_WORK_ORDER";

export type PropertyWikiWorkflowModule =
  | "MAKE_READY"
  | "INSPECTION"
  | "REFRIGERANT"
  | "POOL_LOG"
  | "PREVENTIVE_MAINTENANCE"
  | "PROJECTS"
  | "LEASE_COMPLIANCE"
  | "FUTURE_WORK_ORDER";

export type PropertyWikiReference = {
  referenceId: string;
  attachedAt: string;
} & PropertyWikiRecordSummary;

export type PropertyWikiWorkflowContext = {
  context: {
    module: PropertyWikiWorkflowModule;
    propertyId: string;
    recordType: PropertyWikiWorkflowRecordType | null;
    recordId: string | null;
    floorPlan: string | null;
    unitNumber: string | null;
    building: string | null;
    facilityName: string | null;
    equipmentQuery: string | null;
    query: string | null;
  };
  attached: PropertyWikiReference[];
  suggestions: PropertyWikiRecordSummary[];
  makeReadyStandards: PropertyWikiRecordSummary[];
  knownIssues: PropertyWikiRecordSummary[];
  emergencyRecords: PropertyWikiRecordSummary[];
  related: {
    sops: PropertyWikiRecordSummary[];
    vendors: PropertyWikiRecordSummary[];
    equipment: PropertyWikiRecordSummary[];
    photos: PropertyWikiRecordSummary[];
    documents: PropertyWikiRecordSummary[];
    knownIssues: PropertyWikiRecordSummary[];
  };
};

export type UserCapacity = {
  id: string;
  userId: string;
  defaultDailyHours: number;
  tradeCategories: string[];
  unavailableDays: string[];
};

export type WorkAssignmentBlock = {
  id: string;
  assignedUserId: string;
  propertyId: string;
  itemId: string;
  category: string;
  plannedDate: string;
  estimatedHours: number;
  actualHours: number | null;
  status: "PLANNED" | "IN_PROGRESS" | "DONE" | "CANCELED";
  notes: string | null;
  assignedUser: { id: string; fullName: string; role: UserRole };
  property: Property;
  item: MakeReadyItem;
};

export type PlanningResponse = {
  window: { from: string; to: string };
  staff: Array<StaffOption & { capacity: UserCapacity | null }>;
  capacities: Array<UserCapacity & { user: StaffOption }>;
  blocks: WorkAssignmentBlock[];
  workloadByUserDay: Array<{ user: StaffOption; date: string; plannedHours: number; capacityHours: number; overloaded: boolean }>;
  overloaded: Array<{ user: StaffOption; date: string; plannedHours: number; capacityHours: number; overloaded: boolean }>;
  unscheduledItems: MakeReadyItem[];
  summary: {
    plannedBlocks: number;
    estimatedHours: number;
    overloadedDays: number;
    unplannedWork: number;
    moveInsNotCovered: number;
    vendorOpenAssignments: number;
    inHouseBlocks: number;
  };
};

export type NotificationResponse = {
  notifications: NotificationRecord[];
  unreadCount: number;
  preferences: Array<{ category: string; enabled: boolean }>;
  categories: string[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
};

export type ItemComment = {
  id: string;
  authorUserId: string | null;
  authorName: string;
  body: string;
  category: string;
  editedAt: string | null;
  createdAt: string;
};

export type ItemAttachment = {
  id: string;
  uploadedById: string | null;
  uploaderName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  note: string | null;
  inspectionStage: string;
  category: string | null;
  chargeCandidate: boolean;
  chargeNote: string | null;
  chargePriceSheetItemId: string | null;
  chargePriceSheetItem: ChargePriceSheetItem | null;
  chargeQuantity: number | null;
  chargeEstimatedCents: number | null;
  markupAnnotations: Array<{
    id: string;
    x: number;
    y: number;
    label: string;
    note?: string | null;
    category?: string | null;
    chargeCandidate?: boolean;
    chargePriceSheetItemId?: string | null;
    chargePriceSheetItemName?: string | null;
    chargeQuantity?: number | null;
    chargeEstimatedCents?: number | null;
  }> | null;
  createdAt: string;
};

export type ChargePriceSheetItem = {
  id: string;
  propertyId: string;
  name: string;
  category: string | null;
  unitLabel: string | null;
  defaultCents: number | null;
  description: string | null;
  isActive: boolean;
  isArchived: boolean;
  sortOrder: number;
};

export type ChargeReport = {
  item: {
    id: string;
    propertyId: string;
    propertyCode: string;
    unitNumber: string;
    boardGroup: string;
  };
  summary: {
    fileCount: number;
    pinCount: number;
    lineCount: number;
    missingContext: number;
    totalEstimatedCents: number;
  };
  lines: Array<{
    type: "FILE" | "PIN";
    attachmentId: string;
    attachmentName: string;
    pinId?: string | null;
    label: string;
    category: string | null;
    inspectionStage: string;
    note: string | null;
    chargeNote: string | null;
    priceSheetItemId: string | null;
    priceSheetItemName: string | null;
    quantity: number | null;
    estimatedCents: number;
  }>;
};

export type ChecklistTemplate = {
  id: string;
  name: string;
  propertyId: string | null;
  items: Array<{ id: string; label: string; notes: string | null; required: boolean }>;
};

export type ChecklistInstance = {
  id: string;
  name: string;
  items: Array<{
    id: string;
    title: string;
    notes: string | null;
    required: boolean;
    completed: boolean;
    completedAt: string | null;
    completedBy: { fullName: string } | null;
  }>;
};

export type ItemCollaboration = {
  comments: ItemComment[];
  attachments: ItemAttachment[];
  checklistInstances: ChecklistInstance[];
  templates: ChecklistTemplate[];
  pagination: {
    comments: { total: number; limit: number; hasMore: boolean };
    attachments: { total: number; limit: number; hasMore: boolean };
  };
};

export type MyWorkResponse = {
  target: { id: string; fullName: string };
  stats: { total: number; overdue: number; dueSoon: number; openChecklistTasks: number };
  items: Array<MakeReadyItem & { checklistInstances: ChecklistInstance[]; workAssignmentBlocks?: WorkAssignmentBlock[] }>;
  projectItems?: ProjectRecord[];
  pestItems?: PestIssue[];
  leaseComplianceItems?: LeaseComplianceIssue[];
};

export type LeaseComplianceStatus = "Open" | "Resident Notified" | "Notice Sent" | "Violation Needed" | "Resolved" | "Archived";
export type LeaseComplianceNoticeStage = "None" | "Resident Notified" | "1st Notice" | "2nd Notice" | "3rd Notice" | "Violation Needed";
export type LeaseCompliancePriority = "Low" | "Normal" | "High" | "Critical";
export type LeaseComplianceSource = "Property Walk" | "Grounds Walk" | "Inspection" | "Leasing Follow Up" | "Manager Review" | "Resident Complaint" | "Other";
export type LeaseCompliancePhotoCategory = "INITIAL_ISSUE" | "STILL_PERSISTS" | "RESOLUTION" | "GENERAL";

export type LeaseComplianceIssueType = {
  id: string;
  propertyId: string;
  name: string;
  color: string | null;
  isActive: boolean;
  sortOrder: number;
  createdById?: string | null;
  updatedById?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LeaseComplianceSettings = {
  id: string;
  propertyId: string;
  defaultPriority: LeaseCompliancePriority;
  watchDays: number;
  warningDays: number;
  criticalDays: number;
  firstNoticeLabel: string;
  secondNoticeLabel: string;
  thirdNoticeLabel: string;
  archiveResolvedAfterDays: number | null;
  updatedById?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LeaseComplianceIssueNote = {
  id: string;
  issueId: string;
  propertyId: string;
  authorUserId: string | null;
  authorName: string;
  body: string;
  createdAt: string;
};

export type LeaseComplianceIssuePhoto = {
  id: string;
  issueId: string;
  propertyId: string;
  uploadedById: string | null;
  uploaderName: string;
  photoCategory: LeaseCompliancePhotoCategory;
  caption: string | null;
  originalName: string;
  storedName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

export type LeaseComplianceNoticeAction = {
  id: string;
  issueId: string;
  propertyId: string;
  actedById: string | null;
  actedByName: string;
  action: "RESIDENT_NOTIFIED" | "NOTICE_1_SENT" | "NOTICE_2_SENT" | "NOTICE_3_SENT" | "VIOLATION_NEEDED";
  noticeStage: LeaseComplianceNoticeStage;
  notes: string | null;
  createdAt: string;
};

export type LeaseCompliancePersistenceCheck = {
  id: string;
  issueId: string;
  propertyId: string;
  checkedById: string | null;
  checkedByName: string;
  stillPersists: boolean;
  notes: string | null;
  createdAt: string;
};

export type LeaseComplianceIssue = {
  id: string;
  propertyId: string;
  property: Property;
  unitId: string | null;
  unit: Unit | null;
  issueTypeId: string | null;
  issueType?: LeaseComplianceIssueType | null;
  propertyMapId: string | null;
  propertyMap?: { id: string; name: string } | null;
  building: string | null;
  area: string | null;
  issueTypeName: string;
  additionalIssueType: string | null;
  status: LeaseComplianceStatus;
  noticeStage: LeaseComplianceNoticeStage;
  priority: LeaseCompliancePriority;
  source: LeaseComplianceSource;
  description: string | null;
  locationNotes: string | null;
  tags: string[];
  assignedUserId: string | null;
  assignedUserName: string | null;
  assignedUser?: Pick<CurrentUser, "id" | "fullName" | "role"> | null;
  lastPersistenceCheckDate: string | null;
  daysOpenOverride?: number | null;
  persistenceCount: number;
  residentNotifiedDate: string | null;
  notice1Date: string | null;
  notice2Date: string | null;
  notice3Date: string | null;
  violationNeededDate: string | null;
  recurringConcern: boolean;
  managerReviewRequired: boolean;
  recurringDismissedAt: string | null;
  recurringDismissalNotes: string | null;
  resolvedDate: string | null;
  resolvedById: string | null;
  resolutionNotes: string | null;
  isArchived: boolean;
  archiveDate: string | null;
  archivedById: string | null;
  archiveNotes: string | null;
  createdById: string | null;
  updatedById: string | null;
  createdAt: string;
  updatedAt: string;
  notes: LeaseComplianceIssueNote[];
  photos: LeaseComplianceIssuePhoto[];
  noticeActions: LeaseComplianceNoticeAction[];
  persistenceChecks: LeaseCompliancePersistenceCheck[];
};

export type LeaseComplianceOverviewResponse = {
  permissions: { view: boolean; edit: boolean; notice: boolean; admin: boolean };
  summary: {
    openIssues: number;
    needsNotice: number;
    violationNeeded: number;
    resolvedThisMonth: number;
    recurringConcerns: number;
    managerReviewRequired: number;
    overdueOpen: number;
  };
  issueTypes: LeaseComplianceIssueType[];
  settings: LeaseComplianceSettings | null;
  recentIssues: LeaseComplianceIssue[];
  needsNotice: LeaseComplianceIssue[];
  violationNeeded: LeaseComplianceIssue[];
  recentResolved: LeaseComplianceIssue[];
};

export type PestStatus = "Open" | "Scheduled" | "Treated" | "Needs Follow Up" | "Closed" | "Cancelled" | "Archived";
export type PestPriority = "Low" | "Normal" | "High" | "Critical";
export type PestSource = "Third Party Work Order" | "Leasing" | "Resident Request" | "Maintenance" | "Manager" | "Inspection" | "Preventive Maintenance" | "Make Ready" | "Property Walk" | "Other";
export type PestPhotoType = "ISSUE" | "TREATMENT" | "ACCESS_ISSUE" | "GENERAL";
export type PestType = "Pest Not Stated" | "Roaches" | "Ants" | "Spiders" | "Rats" | "Mice" | "Rodents" | "Fleas" | "Bed Bugs" | "Wasps" | "Bees" | "Gnats" | "Flies" | "Termites" | "Other";

export type PestVendor = {
  id: string;
  propertyId: string;
  vendorName: string;
  primaryContact: string | null;
  phone: string | null;
  email: string | null;
  emergencyPhone: string | null;
  serviceDay: string | null;
  serviceFrequency: string | null;
  notes: string | null;
  isActive: boolean;
  isDefault: boolean;
  createdById: string | null;
  updatedById: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PestIssueNote = {
  id: string;
  issueId: string;
  propertyId: string;
  authorUserId: string | null;
  authorName: string;
  body: string;
  createdAt: string;
};

export type PestIssueAttachment = {
  id: string;
  issueId: string;
  propertyId: string;
  uploadedById: string | null;
  uploaderName: string;
  photoType: PestPhotoType;
  caption: string | null;
  originalName: string;
  storedName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

export type PestIssue = {
  id: string;
  propertyId: string;
  property: Property;
  unitId: string | null;
  unit: Unit | null;
  makeReadyItemId: string | null;
  makeReadyItem: Pick<MakeReadyItem, "id" | "unitNumber" | "moveInDate" | "makeReadyDate"> | null;
  building: string | null;
  area: string | null;
  requestDate: string;
  pestType: PestType;
  additionalPestType: string | null;
  status: PestStatus;
  priority: PestPriority;
  source: PestSource;
  vendorId: string | null;
  vendor: PestVendor | null;
  thirdPartyWorkOrderNumber: string | null;
  reportedBy: string | null;
  assignedUserId: string | null;
  assignedUser: Pick<CurrentUser, "id" | "fullName"> | null;
  treatmentDate: string | null;
  followUpRequired: boolean;
  followUpDate: string | null;
  followUpNotes: string | null;
  description: string | null;
  closedNotes: string | null;
  recurringConcern: boolean;
  managerReviewRequired: boolean;
  recurringDismissedAt: string | null;
  recurringDismissalNotes: string | null;
  createdById: string | null;
  updatedById: string | null;
  closedById: string | null;
  closedAt: string | null;
  isArchived: boolean;
  archivedById: string | null;
  archivedAt: string | null;
  archiveNotes: string | null;
  createdAt: string;
  updatedAt: string;
  notes: PestIssueNote[];
  attachments: PestIssueAttachment[];
};

export type PestOverviewResponse = {
  summary: {
    openRequests: number;
    scheduled: number;
    needsFollowUp: number;
    overdueFollowUps: number;
    dueFollowUps: number;
    makeReadyPending: number;
    closedThisMonth: number;
    recurringUnits: number;
  };
  recentRequests: PestIssue[];
  recentTreatments: PestIssue[];
  upcomingFollowUps: PestIssue[];
  vendors: PestVendor[];
  defaultVendor: PestVendor | null;
  pestTypes: PestType[];
  statuses: PestStatus[];
  priorities: PestPriority[];
  sources: PestSource[];
};

export type ProjectRecordType = "Recommendation" | "Project";
export type ProjectExecutionType = "In-House" | "Vendor" | "Hybrid" | "Undecided";
export type ProjectPriority = "Low" | "Normal" | "High" | "Critical";
export type ProjectTaskStatus = "Open" | "In Progress" | "Completed" | "Skipped";
export type ProjectAttachmentType = "GENERAL" | "BEFORE" | "PROGRESS" | "AFTER" | "BID" | "LOCATION";
export type ProjectBidStatus = "Needed" | "Requested" | "Received" | "Approved" | "Denied" | "Warranty" | "Not Applicable";
export type ProjectSource = "Quick Capture" | "Inspection" | "Preventive Maintenance" | "Pool Log" | "Manager Walk" | "Property Walk" | "Resident Feedback" | "Vendor Recommendation" | "Regional Request" | "Ownership Request" | "Property Wiki" | "Map Finding" | "Other";

export type ProjectCategory = {
  id: string;
  propertyId: string | null;
  name: string;
  color: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ProjectAttachment = {
  id: string;
  recordId: string;
  propertyId: string;
  uploadedById: string | null;
  uploaderName: string | null;
  originalName: string;
  storedName: string;
  mimeType: string;
  sizeBytes: number;
  attachmentType: ProjectAttachmentType;
  caption: string | null;
  createdAt: string;
};

export type ProjectComment = {
  id: string;
  recordId: string;
  propertyId: string;
  authorId: string | null;
  authorName: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectTask = {
  id: string;
  recordId: string;
  propertyId: string;
  title: string;
  status: ProjectTaskStatus;
  assignedUserId: string | null;
  assignedUserName: string | null;
  dueDate: string | null;
  completedById: string | null;
  completedDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectWikiReference = {
  id: string;
  recordId: string;
  propertyId: string;
  targetType: "ENTRY" | "VENDOR" | "ASSET";
  targetId: string;
  createdById: string | null;
  createdAt: string;
};

export type ProjectRecord = {
  id: string;
  propertyId: string;
  property: Property;
  recordType: ProjectRecordType;
  title: string;
  description: string | null;
  source: ProjectSource | null;
  sourceRecordType: string | null;
  sourceRecordId: string | null;
  sourceRecordLabel: string | null;
  status: string;
  priority: ProjectPriority;
  executionType: ProjectExecutionType;
  categoryId: string | null;
  categoryName: string | null;
  category?: ProjectCategory | null;
  building: string | null;
  area: string | null;
  locationNotes: string | null;
  propertyMapId: string | null;
  pinX: number | null;
  pinY: number | null;
  estimatedQuantity: number | null;
  quantityUnit: string | null;
  estimatedCost: number | null;
  actualCost: number | null;
  totalAmount: number | null;
  deferredMaintenance: boolean;
  deferredReason: string | null;
  targetYear: number | null;
  deferredNotes: string | null;
  budgetYear: string | null;
  companyName: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  bidStatus: ProjectBidStatus | null;
  bidNotes: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  assignedRole: UserRole | null;
  assignedTeam: string | null;
  scheduledDate: string | null;
  startDate: string | null;
  dueDate: string | null;
  completedDate: string | null;
  tags: string[];
  isArchived: boolean;
  archivedAt: string | null;
  createdById: string | null;
  updatedById: string | null;
  completedById: string | null;
  createdAt: string;
  updatedAt: string;
  daysOpen?: number;
  agingBucket?: "0-30" | "31-90" | "91-180" | "180+";
  attachments: ProjectAttachment[];
  comments: ProjectComment[];
  tasks: ProjectTask[];
  wikiReferences: ProjectWikiReference[];
};

export type ProjectsOverviewResponse = {
  permissions: { view: boolean; edit: boolean; admin: boolean };
  summary: {
    openRecommendations: number;
    needsBid: number;
    approvedProjects: number;
    inProgress: number;
    waiting: number;
    completedThisMonth: number;
    overdue: number;
    deferredMaintenance: number;
    estimatedProjectValue: number;
    actualCompletedCostThisYear: number;
  };
  recommendationsByAge: Array<{ label: string; value: number }>;
  projectsByBudgetYear: Array<{ label: string; value: number }>;
  projectsBySource: Array<{ label: string; value: number }>;
  recentActivity: ProjectRecord[];
  recentPhotoActivity: ProjectRecord[];
  upcomingScheduledProjects: ProjectRecord[];
  highPriorityItems: ProjectRecord[];
};

export type ProjectHistoryEntry = {
  id: string;
  user: string;
  date: string;
  action: string;
};

export type ActivityRecord = {
  id: string;
  createdAt: string;
  actor: Pick<CurrentUser, "id" | "email" | "fullName"> | null;
  action: string;
  entityType: string;
  entityId: string | null;
  description: string;
  property: Property | null;
  unitNumber: string | null;
};

export type ActivityResponse = {
  activity: ActivityRecord[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  filterOptions: {
    actors: Array<Pick<CurrentUser, "id" | "email" | "fullName">>;
    actions: string[];
    entityTypes: string[];
    properties: Property[];
  };
};

export type DailyActivityCategory =
  | "markedReady"
  | "availability"
  | "archived"
  | "restored"
  | "created"
  | "updated"
  | "exception";

export type DailyActivityReport = {
  date: string;
  range: { from: string; to: string };
  summary: Record<DailyActivityCategory | "totalChanges", number>;
  records: Array<{
    id: string;
    at: string;
    category: DailyActivityCategory;
    action: string;
    description: string;
    actor: Pick<CurrentUser, "id" | "email" | "fullName"> | null;
    property: Property | null;
    itemId: string | null;
    unitNumber: string | null;
    applicant: string | null;
    vacancyStatus: string | null;
    boardGroup: string | null;
    riskLevel: string | null;
    moveOutDate: string | null;
    vacatedDate: string | null;
    makeReadyDate: string | null;
    moveInDate: string | null;
    isArchived: boolean | null;
    externalActionHint: string;
  }>;
  filterOptions: {
    properties: Property[];
  };
};

export type AutomationTriggerType = "ITEM_CREATED" | "ITEM_UPDATED" | "DATE_FIELD_CHANGED" | "STATUS_FIELD_CHANGED" | "SCHEDULED_CHECK";
export type AutomationConditionOperator = "equals" | "notEquals" | "in" | "contains" | "isEmpty" | "notEmpty" | "dateBefore" | "dateAfter" | "dateBeforeToday" | "dateAfterToday" | "dateWithinNextDays" | "dateMissing" | "dateOnWeekend" | "dateOnMondayOrFriday";
export type AutomationCondition = {
  field?: string;
  customFieldId?: string;
  operator: AutomationConditionOperator;
  value?: string | number | boolean | string[];
};
export type AutomationAction =
  | { type: "setField"; field: string; value: string | null }
  | { type: "setCustomField"; fieldId: string; value: string | number | boolean | string[] | null }
  | { type: "addAuditNote"; value: string }
  | { type: "setDateFromField"; sourceField: string; targetField: string; offsetDays: number; respectOperatingCalendar?: boolean }
  | { type: "assignLeastLoadedStaff"; eligibleRoles: Array<"ADMIN" | "MANAGER" | "TECH" | "CLEANER">; eligibleUserIds?: string[]; excludedUserIds?: string[]; lookAheadDays: number; includePlannedWork?: boolean; onlyWhenUnassigned?: boolean; dailyAssignmentCap?: number | null; targetDateField: "makeReadyDate" | "moveInDate" | "vacatedDate" }
  | { type: "setPriority"; value: number }
  | { type: "appendNote"; value: string };
export type AutomationRule = {
  id: string;
  templateId: string | null;
  name: string;
  description: string | null;
  propertyId: string | null;
  property: Property | null;
  triggerType: AutomationTriggerType;
  enabled: boolean;
  isArchived: boolean;
  conditions: { all?: AutomationCondition[]; any?: AutomationCondition[] };
  actions: AutomationAction[];
  createdAt: string;
  updatedAt: string;
};
export type AutomationTemplate = {
  id: string;
  name: string;
  description: string;
  category: string;
  triggerType: AutomationTriggerType;
  defaultConditions: unknown;
  defaultActions: AutomationAction[];
  requiredFields: Array<{
    source: "BUILT_IN" | "CUSTOM";
    key: string;
    label: string;
    fieldType?: CustomFieldType;
    purpose: string;
    available: boolean;
    fieldId: string | null;
  }>;
  setupNotes: string[];
  setupRequirements: string[];
  readyToInstall: boolean;
  draft: AutomationRuleDraft | null;
  installed: boolean;
  installedRules: Array<Pick<AutomationRule, "id" | "name" | "propertyId" | "enabled">>;
};
export type AutomationRun = {
  id: string;
  success: boolean;
  message: string;
  ranAt: string;
  runType: "EVENT" | "MANUAL" | "SCHEDULED";
  checkedCount: number | null;
  matchedCount: number | null;
  actionCount: number | null;
  warnings: string[] | null;
  errors: string[] | null;
  context: AutomationRunContext | null;
  rule: Pick<AutomationRule, "id" | "name" | "triggerType">;
  item: { id: string; unitNumber: string; property: Property } | null;
};
export type AutomationAssignmentCandidate = {
  userId: string;
  fullName: string;
  role: UserRole;
  activeCount: number;
  plannedCount: number;
  plannedDayCount: number;
  workloadScore: number;
  status: "selected" | "eligible" | "daily-cap-blocked";
  reason: string | null;
};
export type AutomationAssignmentDiagnostics = {
  targetDate: string;
  lookAheadDays: number;
  includePlannedWork: boolean;
  dailyAssignmentCap: number | null;
  selectedUserId: string | null;
  selectedUserName: string | null;
  selectedReason: string | null;
  candidates: AutomationAssignmentCandidate[];
};
export type AutomationActionSummary = {
  type: string;
  summary: string;
  proposedValue?: unknown;
  diagnostics?: {
    assignment?: AutomationAssignmentDiagnostics;
  };
};
export type AutomationRunContext = {
  itemName?: string | null;
  unitNumber?: string | null;
  triggerType?: string;
  triggerTypes?: string[];
  cooldownHours?: number;
  actionSummaries?: AutomationActionSummary[];
  matchedItems?: Array<{
    itemId: string;
    propertyId: string;
    propertyCode: string;
    unitNumber: string;
    actionSummaries: AutomationActionSummary[];
  }>;
  matchedItemsTruncated?: boolean;
};
export type AutomationExecutionResult = {
  mode: "MANUAL" | "SCHEDULED";
  rulesEvaluated: number;
  checkedCount: number;
  matchedCount: number;
  actionCount: number;
  results: Array<{
    ruleId: string;
    name: string;
    checkedCount: number;
    matchedCount: number;
    actionCount: number;
    warnings: string[];
    errors: string[];
  }>;
};
export type AutomationRuleDraft = {
  name: string;
  description: string | null;
  propertyId: string | null;
  triggerType: AutomationTriggerType;
  enabled: boolean;
  conditions: { all: AutomationCondition[] };
  actions: AutomationAction[];
};
export type AutomationPreviewResponse = {
  preview: true;
  notice: string;
  rule: {
    id: string | null;
    name: string;
    triggerType: AutomationTriggerType;
    propertyId: string | null;
    source: "stored" | "draft";
  };
  matchingItemCount: number;
  assignmentSummary: {
    matchedActionCount: number;
    assignedItemCount: number;
    alreadyAssignedItemCount: number;
    noEligibleStaffItemCount: number;
    dailyCapBlockedItemCount: number;
    otherBlockedItemCount: number;
    selectedUsers: Array<{ fullName: string; count: number }>;
  } | null;
  affectedItems: Array<{
    itemId: string;
    property: Property;
    unitNumber: string;
    triggerSummary: string;
    conditionSummary: {
      matched: boolean;
      all: Array<{ condition: AutomationCondition; matched: boolean }>;
      any: Array<{ condition: AutomationCondition; matched: boolean }>;
    };
    proposedActions: AutomationActionSummary[];
    warnings: string[];
  }>;
  warnings: string[];
  limit: number;
};

export type OperationalLibraryPack = {
  format: "makereadyos.libraryPack";
  version: 1;
  packKey: string;
  name: string;
  description?: string;
  category?: string;
  setupNotes?: string[];
  items?: Record<string, unknown[]>;
  installed?: boolean;
  installedAt?: string | null;
  installedItems?: Array<{ id: string; itemType: string; itemKey: string; targetId: string | null; status: string }>;
  usageCount?: number;
};

export type OperationalLibrarySummary = Record<string, {
  created: number;
  skipped: number;
  conflicts: number;
  errors: string[];
}>;

export type PropertyTemplate = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  version: number;
  notes: string | null;
  sourcePropertyId: string | null;
  sourcePropertyCode: string | null;
  includeConfig: Record<string, unknown>;
  manifest: Record<string, unknown>;
  counts: Record<string, number>;
  isArchived: boolean;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PropertyTemplateInclude = {
  boardSections: boolean;
  optionSets: boolean;
  customFields: boolean;
  floorPlans: boolean;
  scheduleTracks: boolean;
  savedViews: boolean;
  dashboardPresets: boolean;
  checklistTemplates: boolean;
  automationRules: boolean;
  notificationDefaults: boolean;
  planningDefaults: boolean;
};

export type PropertyTemplateSummary = OperationalLibrarySummary & {
  properties: { created: number; skipped: number; conflicts: number; errors: string[] };
};

export type LabelDefinition = {
  id: string;
  fieldKey: string;
  value: string;
  color: string;
  textColor: string;
  sortOrder: number;
  isArchived?: boolean;
};

export type FloorPlan = {
  id: string;
  propertyId: string;
  code: string;
  name: string;
  bedrooms: number | null;
  bathrooms: number | null;
  squareFeet: number | null;
  description: string | null;
  isActive: boolean;
  property: Property;
  _count?: { units: number };
};

export type CustomFieldOption = {
  id: string;
  label: string;
  color: string;
  sortOrder: number;
  isArchived: boolean;
};

export type CustomField = {
  id: string;
  module: string;
  fieldKey: string;
  label: string;
  fieldType: CustomFieldType;
  description: string | null;
  sortOrder: number;
  isArchived: boolean;
  deletedAt: string | null;
  deleteAfter: string | null;
  options: CustomFieldOption[];
};

export type Unit = {
  id: string;
  number: string;
  floorPlan: string | null;
  floorPlanId: string | null;
  floorPlanRecord?: FloorPlan | null;
  propertyId: string;
  property: Property;
  squareFeet: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  occupancyStatus:
    | "OCCUPIED"
    | "VACANT_READY"
    | "VACANT_LEASED"
    | "VACANT_NOT_LEASED"
    | "NTV"
    | "NTV_LEASED"
    | "VACANT NOT LEASED READY"
    | "VACANT NOT LEASED NOT READY"
    | "NTV NOT LEASED"
    | "NTV LEASED"
    | "VACANT LEASED READY"
    | "VACANT LEASED NOT READY"
    | "DOWN"
    | "TO PRE-WALK"
    | "TO SCOPE"
    | "TO FINAL WALK"
    | "MODEL"
    | "UNKNOWN";
  building: string | null;
  area: string | null;
  floor: string | null;
  isBudgeted: boolean;
  isActive: boolean;
  _count?: { makeReadyItems: number };
};

export type PropertyMap = {
  id: string;
  propertyId: string;
  name: string;
  mapType: string;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  description: string | null;
  notes: string | null;
  isDefault: boolean;
  isActive: boolean;
  isArchived: boolean;
  property: Property;
  _count?: { locations: number };
};

export type PropertyMapPin = {
  id: string;
  propertyId: string;
  mapId: string;
  title: string;
  pinType: string;
  xPercent: number;
  yPercent: number;
  building: string | null;
  unitLabel: string | null;
  area: string | null;
  description: string | null;
  linkedRecordType: string | null;
  linkedRecordId: string | null;
  tags: string[];
  isEmergency: boolean;
  isActive: boolean;
  isArchived: boolean;
  property: Property;
  map: PropertyMap;
  attachments: Array<{
    id: string;
    caption: string | null;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    uploaderName: string | null;
    createdAt: string;
  }>;
  linkedRecord?: { targetType: string; id: string; title: string; subtitle: string | null; status: string | null } | null;
};

export type UnitMapLocation = {
  id: string;
  propertyId: string;
  unitId: string;
  mapId: string;
  xPercent: number;
  yPercent: number;
  labelXPercent: number | null;
  labelYPercent: number | null;
  building: string | null;
  area: string | null;
  floor: string | null;
  isActive: boolean;
  isArchived: boolean;
  unit: Unit;
  property: Property;
  map: PropertyMap;
};

export type PropertyMapArea = {
  id: string;
  propertyId: string;
  mapId: string;
  name: string;
  areaType: string;
  xPercent: number;
  yPercent: number;
  widthPercent: number | null;
  heightPercent: number | null;
  color: string | null;
  expectedUnitCount: number | null;
  notes: string | null;
  isActive: boolean;
  isArchived: boolean;
  property: Property;
  map: PropertyMap;
};

export type MakeReadyItem = {
  id: string;
  propertyId: string;
  unitId: string | null;
  boardGroup: string;
  itemName: string;
  unitNumber: string;
  floorPlan: string | null;
  applicant: string | null;
  assignedTech: string | null;
  scopeLevel: string | null;
  status: string;
  vacancyStatus: string | null;
  moveOutDate: string | null;
  vacatedDate: string | null;
  makeReadyDate: string | null;
  moveInDate: string | null;
  daysVacant: number;
  daysUntilMoveIn: number | null;
  priority: number;
  overdue: boolean;
  moveInSoon: boolean;
  riskScore: number;
  riskLevel: "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  riskReasons: RiskReason[];
  lastRiskEvaluatedAt: string | null;
  completionStatus: string | null;
  sheetrockStatus: string | null;
  pestStatus: string | null;
  pestTreated: string | null;
  trashOutStatus: string | null;
  floorsStatus: string | null;
  flooringDate: string | null;
  makeReadyStatus: string | null;
  cleaningStatus: string | null;
  keysMadeStatus: string | null;
  cabinetsStatus: string | null;
  countertopsStatus: string | null;
  appliancesStatus: string | null;
  paintStatus: string | null;
  doorsStatus: string | null;
  newDoorCode: string | null;
  notes: string | null;
  isArchived: boolean;
  archivedAt: string | null;
  updatedAt: string;
  property: Property;
  unit?: Unit | null;
  customFieldValues: Array<{
    customFieldId: string;
    value: unknown;
  }>;
};

export type MetaResponse = {
  properties: Property[];
  labels: LabelDefinition[];
  units: Unit[];
  boardGroups: string[];
  views: SavedView[];
  automations: Array<{ id: string; name: string; enabled: boolean; description: string | null }>;
  customFields: CustomField[];
  staff: StaffOption[];
  columns: BoardColumnDefinition[];
  scheduleTracks: ScheduleTrack[];
  boardSections: BoardSection[];
  auth: {
    user: CurrentUser;
  };
  app: {
    version: string;
    releaseChannel: string;
    buildRef: string | null;
    buildDate: string | null;
    updateCommand: string;
    updatePullCommand: string;
    deploymentDocsPath: string;
    latestRelease: {
      tag: string;
      version: string;
      publishedAt: string | null;
      url: string | null;
      updateAvailable: boolean;
    } | null;
    deployment: {
      appUrl: string | null;
      allowedOrigins: string[];
      extraAllowedOrigins: string[];
      trustedOrigins: string[];
      trustedProxy: boolean;
      secureCookies: boolean;
      cookieDomain: string | null;
      environment: "development" | "test" | "production";
      selfHosted: boolean;
      currentOrigin: string | null;
      startupWarnings: string[];
    };
  };
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method || "GET").toUpperCase();
  const hasJsonBody = init?.body !== undefined && init?.body !== null && !(init.body instanceof FormData);
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      credentials: "include",
      headers: {
        ...(hasJsonBody ? { "Content-Type": "application/json" } : {}),
        ...(csrfToken && !["GET", "HEAD", "OPTIONS"].includes(method) ? { "X-CSRF-Token": csrfToken } : {}),
        ...(init?.headers ?? {}),
      },
      ...init,
    });
  } catch {
    notifyApiUnreachable(path, method);
    throw new ApiError(0, "Could not reach the MakeReadyOS API. If this happened during photo upload, confirm the app is running and that any external reverse proxy allows large request bodies.");
  }

  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    let details: unknown;
    try {
      const body = (await response.json()) as { message?: string };
      details = body;
      if (body.message) {
        message = body.message;
      }
    } catch {
      // Ignore JSON parsing errors for non-JSON failures.
    }

    if (response.status === 401) {
      csrfToken = null;
    }

    throw new ApiError(response.status, message, details);
  }

  if (response.headers.get("content-type")?.includes("application/json")) {
    const body = (await response.json()) as T & { csrfToken?: string | null };
    if (typeof body === "object" && body && "csrfToken" in body) {
      csrfToken = body.csrfToken ?? null;
    }
    return body;
  }

  return response.text() as unknown as T;
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function getMeta() {
  return request<MetaResponse>("/meta");
}

export function getDashboard(propertyId?: string) {
  const params = propertyId ? `?propertyId=${encodeURIComponent(propertyId)}` : "";
  return request<DashboardResponse>(`/dashboard${params}`);
}

export function getAnalyticsSummary(propertyId?: string) {
  const params = propertyId ? `?propertyId=${encodeURIComponent(propertyId)}` : "";
  return request<AnalyticsSummaryResponse>(`/analytics/summary${params}`);
}

export function runAnalyticsSnapshot(propertyId?: string) {
  const params = propertyId ? `?propertyId=${encodeURIComponent(propertyId)}` : "";
  return request<{ date: string; count: number; snapshots: unknown[] }>(`/analytics/snapshot/run${params}`, { method: "POST" });
}

export function getUnitHistory(unitId: string) {
  return request<UnitHistoryResponse>(`/units/${unitId}/history`);
}

export function getRiskSummary(propertyId?: string) {
  const params = propertyId ? `?propertyId=${encodeURIComponent(propertyId)}` : "";
  return request<RiskSummaryResponse>(`/risk/summary${params}`);
}

export function getRiskPolicies(propertyId?: string) {
  const params = propertyId ? `?propertyId=${encodeURIComponent(propertyId)}` : "";
  return request<{ defaults: RiskPolicy; policies: Array<{ property: Property; policy: RiskPolicy; customized: boolean }> }>(`/risk/policies${params}`);
}

export function updateRiskPolicy(propertyId: string, policy: Partial<RiskPolicy>) {
  return request<{ policy: RiskPolicy }>(`/risk/policies/${propertyId}`, {
    method: "PUT",
    body: JSON.stringify(policy),
  });
}

export function evaluateRisk(input: { propertyId?: string; itemIds?: string[]; notify?: boolean }) {
  return request<{ evaluated: number; byLevel: Record<string, number>; items: Array<{ itemId: string; riskScore: number; riskLevel: string; riskReasons: RiskReason[] }> }>("/risk/evaluate", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getNotifications(limit = 30, offset = 0) {
  return request<NotificationResponse>(`/notifications?limit=${limit}&offset=${offset}`);
}

export function markNotificationRead(id: string) {
  return request<{ ok: true }>(`/notifications/${id}/read`, { method: "POST" });
}

export function markAllNotificationsRead() {
  return request<{ ok: true; count: number }>("/notifications/read-all", { method: "POST" });
}

export function dismissNotification(id: string) {
  return request<{ ok: true }>(`/notifications/${id}`, { method: "DELETE" });
}

export function updateNotificationPreference(category: string, enabled: boolean) {
  return request<{ preference: { category: string; enabled: boolean } }>(`/notifications/preferences/${encodeURIComponent(category)}`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
}

export function getItemCollaboration(itemId: string, limits?: { commentLimit?: number; attachmentLimit?: number; checklistLimit?: number }) {
  const params = new URLSearchParams();
  if (limits?.commentLimit) params.set("commentLimit", String(limits.commentLimit));
  if (limits?.attachmentLimit) params.set("attachmentLimit", String(limits.attachmentLimit));
  if (limits?.checklistLimit) params.set("checklistLimit", String(limits.checklistLimit));
  const query = params.toString();
  return request<ItemCollaboration>(`/make-ready-items/${itemId}/collaboration${query ? `?${query}` : ""}`);
}

export function getChargeReport(itemId: string) {
  return request<ChargeReport>(`/make-ready-items/${itemId}/charge-report`);
}

export function chargeReportCsvUrl(itemId: string) {
  return `${apiBaseUrl}/make-ready-items/${encodeURIComponent(itemId)}/charge-report.csv`;
}

export function createItemComment(itemId: string, body: string) {
  return request<{ comment: ItemComment }>(`/make-ready-items/${itemId}/comments`, { method: "POST", body: JSON.stringify({ body }) });
}

export function updateItemComment(itemId: string, commentId: string, body: string) {
  return request<{ comment: ItemComment }>(`/make-ready-items/${itemId}/comments/${commentId}`, { method: "PATCH", body: JSON.stringify({ body }) });
}

export function deleteItemComment(itemId: string, commentId: string) {
  return request<{ ok: true }>(`/make-ready-items/${itemId}/comments/${commentId}`, { method: "DELETE" });
}

export function uploadItemAttachment(itemId: string, file: File) {
  const data = new FormData();
  data.append("file", file);
  return request<{ attachment: ItemAttachment }>(`/make-ready-items/${itemId}/attachments`, { method: "POST", body: data });
}

export function attachmentDownloadUrl(id: string) {
  return `${apiBaseUrl}/attachments/${encodeURIComponent(id)}/download`;
}

export function attachmentArchiveUrl(itemId: string, filter?: { stage?: string; category?: string | null }) {
  const params = new URLSearchParams();
  if (filter?.stage) params.set("stage", filter.stage);
  if (filter?.category) params.set("category", filter.category);
  const query = params.toString();
  return `${apiBaseUrl}/make-ready-items/${encodeURIComponent(itemId)}/attachments/archive${query ? `?${query}` : ""}`;
}

export function deleteItemAttachment(id: string) {
  return request<{ ok: true }>(`/attachments/${id}`, { method: "DELETE" });
}

export function updateItemAttachment(id: string, input: {
  note?: string | null;
  inspectionStage?: string;
  category?: string | null;
  chargeCandidate?: boolean;
  chargeNote?: string | null;
  chargePriceSheetItemId?: string | null;
  chargeQuantity?: number | null;
  chargeEstimatedCents?: number | null;
  markupAnnotations?: ItemAttachment["markupAnnotations"];
}) {
  return request<{ attachment: ItemAttachment }>(`/attachments/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function getChargePriceSheetItems(propertyId?: string, includeArchived = false) {
  const params = new URLSearchParams();
  if (propertyId) params.set("propertyId", propertyId);
  if (includeArchived) params.set("includeArchived", "true");
  const query = params.toString();
  return request<{ items: ChargePriceSheetItem[] }>(`/charge-price-sheet-items${query ? `?${query}` : ""}`);
}

export function createChargePriceSheetItem(input: {
  propertyId: string;
  name: string;
  category?: string | null;
  unitLabel?: string | null;
  defaultCents?: number | null;
  description?: string | null;
}) {
  return request<{ item: ChargePriceSheetItem }>("/charge-price-sheet-items", { method: "POST", body: JSON.stringify(input) });
}

export function createChecklistTemplate(input: {
  propertyId: string | null;
  name: string;
  items: Array<{ title: string; required?: boolean; notes?: string | null }>;
}) {
  return request<{ template: ChecklistTemplate }>("/checklist-templates", { method: "POST", body: JSON.stringify(input) });
}

export function attachChecklist(itemId: string, templateId: string) {
  return request<{ instance: ChecklistInstance }>(`/make-ready-items/${itemId}/checklists`, { method: "POST", body: JSON.stringify({ templateId }) });
}

export function updateChecklistItem(id: string, input: { completed?: boolean; notes?: string | null }) {
  return request<{ checklistItem: ChecklistInstance["items"][number] }>(`/checklist-items/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function getMyWork(userId?: string) {
  const params = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  return request<MyWorkResponse>(`/my-work${params}`);
}

export function getLeaseComplianceOverview(propertyId?: string) {
  const params = new URLSearchParams();
  if (propertyId) params.set("propertyId", propertyId);
  return request<LeaseComplianceOverviewResponse>(`/lease-compliance/overview${params.toString() ? `?${params.toString()}` : ""}`);
}

export function getLeaseComplianceSettings(propertyId: string) {
  const params = new URLSearchParams({ propertyId });
  return request<{ settings: LeaseComplianceSettings }>(`/lease-compliance/settings?${params.toString()}`);
}

export function updateLeaseComplianceSettings(input: { propertyId: string } & Partial<LeaseComplianceSettings>) {
  return request<{ settings: LeaseComplianceSettings }>("/lease-compliance/settings", { method: "PATCH", body: JSON.stringify(input) });
}

export function getLeaseComplianceIssueTypes(propertyId: string) {
  const params = new URLSearchParams({ propertyId });
  return request<{ issueTypes: LeaseComplianceIssueType[] }>(`/lease-compliance/issue-types?${params.toString()}`);
}

export function createLeaseComplianceIssueType(input: {
  propertyId: string;
  name: string;
  color?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}) {
  return request<{ issueType: LeaseComplianceIssueType }>("/lease-compliance/issue-types", { method: "POST", body: JSON.stringify(input) });
}

export function updateLeaseComplianceIssueType(id: string, input: Partial<Parameters<typeof createLeaseComplianceIssueType>[0]>) {
  return request<{ issueType: LeaseComplianceIssueType }>(`/lease-compliance/issue-types/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function getLeaseComplianceIssues(filters: {
  propertyId?: string;
  unitId?: string;
  status?: LeaseComplianceStatus;
  noticeStage?: LeaseComplianceNoticeStage;
  priority?: LeaseCompliancePriority;
  assignedUserId?: string;
  includeArchived?: boolean;
  recurringOnly?: boolean;
  q?: string;
  limit?: number;
  offset?: number;
} = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  return request<{ issues: LeaseComplianceIssue[]; pagination: { total: number; limit: number; offset: number; hasMore: boolean } }>(`/lease-compliance/issues${params.toString() ? `?${params.toString()}` : ""}`);
}

export function createLeaseComplianceIssue(input: {
  propertyId: string;
  unitId?: string | null;
  issueTypeId?: string | null;
  propertyMapId?: string | null;
  building?: string | null;
  area?: string | null;
  issueTypeName: string;
  additionalIssueType?: string | null;
  status?: LeaseComplianceStatus;
  noticeStage?: LeaseComplianceNoticeStage;
  priority?: LeaseCompliancePriority;
  source?: LeaseComplianceSource;
  description?: string | null;
  locationNotes?: string | null;
  tags?: string[];
  assignedUserId?: string | null;
}) {
  return request<{ issue: LeaseComplianceIssue }>("/lease-compliance/issues", { method: "POST", body: JSON.stringify(input) });
}

export function updateLeaseComplianceIssue(id: string, input: Partial<Parameters<typeof createLeaseComplianceIssue>[0]>) {
  return request<{ issue: LeaseComplianceIssue }>(`/lease-compliance/issues/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function addLeaseComplianceIssueNote(id: string, body: string) {
  return request<{ note: LeaseComplianceIssueNote }>(`/lease-compliance/issues/${encodeURIComponent(id)}/notes`, { method: "POST", body: JSON.stringify({ body }) });
}

export function markLeaseComplianceStillPersists(id: string, notes?: string | null) {
  return request<{ issue: LeaseComplianceIssue; check: LeaseCompliancePersistenceCheck }>(`/lease-compliance/issues/${encodeURIComponent(id)}/persist`, { method: "POST", body: JSON.stringify({ notes: notes ?? null }) });
}

export function markLeaseComplianceNotice(id: string, input: { action: LeaseComplianceNoticeAction["action"]; notes?: string | null }) {
  return request<{ issue: LeaseComplianceIssue; noticeAction: LeaseComplianceNoticeAction }>(`/lease-compliance/issues/${encodeURIComponent(id)}/notice`, { method: "POST", body: JSON.stringify(input) });
}

export function resolveLeaseComplianceIssue(id: string, resolutionNotes: string) {
  return request<{ issue: LeaseComplianceIssue }>(`/lease-compliance/issues/${encodeURIComponent(id)}/resolve`, { method: "POST", body: JSON.stringify({ resolutionNotes }) });
}

export function archiveLeaseComplianceIssue(id: string, archiveNotes?: string | null) {
  return request<{ issue: LeaseComplianceIssue }>(`/lease-compliance/issues/${encodeURIComponent(id)}/archive`, { method: "POST", body: JSON.stringify({ archiveNotes: archiveNotes ?? null }) });
}

export function dismissLeaseComplianceRecurringFlag(id: string, notes: string) {
  return request<{ issue: LeaseComplianceIssue }>(`/lease-compliance/issues/${encodeURIComponent(id)}/dismiss-recurring`, { method: "POST", body: JSON.stringify({ notes }) });
}

export async function uploadLeaseComplianceIssuePhoto(issueId: string, file: File, options?: { photoCategory?: LeaseCompliancePhotoCategory; caption?: string }) {
  const form = new FormData();
  form.append("file", file);
  if (options?.photoCategory) form.append("photoCategory", options.photoCategory);
  if (options?.caption) form.append("caption", options.caption);
  return request<{ photo: LeaseComplianceIssuePhoto }>(`/lease-compliance/issues/${encodeURIComponent(issueId)}/photos`, {
    method: "POST",
    body: form,
  });
}

export function deleteLeaseComplianceIssuePhoto(id: string) {
  return request<{ ok: true }>(`/lease-compliance/photos/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function leaseComplianceIssuePhotoDownloadUrl(id: string) {
  return `${apiBaseUrl}/lease-compliance/photos/${encodeURIComponent(id)}/download`;
}

export function leaseComplianceExportCsvUrl(filters: Parameters<typeof getLeaseComplianceIssues>[0] = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  return `${apiBaseUrl}/lease-compliance/export.csv${params.toString() ? `?${params.toString()}` : ""}`;
}

export function leaseCompliancePrintableHtmlReportUrl(filters: Parameters<typeof getLeaseComplianceIssues>[0] = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  return `${apiBaseUrl}/lease-compliance/report.html${params.toString() ? `?${params.toString()}` : ""}`;
}

export function leaseCompliancePrintableReportUrl(filters: Parameters<typeof getLeaseComplianceIssues>[0] = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  return `${apiBaseUrl}/lease-compliance/report.pdf${params.toString() ? `?${params.toString()}` : ""}`;
}

export function getPestOverview(propertyId?: string) {
  const params = new URLSearchParams();
  if (propertyId) params.set("propertyId", propertyId);
  return request<PestOverviewResponse>(`/pest/overview${params.toString() ? `?${params.toString()}` : ""}`);
}

export function getPestIssues(filters: {
  propertyId?: string;
  unitId?: string;
  makeReadyItemId?: string;
  status?: PestStatus;
  pestType?: PestType;
  vendorId?: string;
  assignedUserId?: string;
  source?: PestSource;
  includeArchived?: boolean;
  makeReadyOnly?: boolean;
  recurringOnly?: boolean;
  q?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
} = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  return request<{ issues: PestIssue[]; pagination: { total: number; limit: number; offset: number; hasMore: boolean } }>(`/pest/issues${params.toString() ? `?${params.toString()}` : ""}`);
}

export function createPestIssue(input: {
  propertyId: string;
  unitId?: string | null;
  makeReadyItemId?: string | null;
  building?: string | null;
  area?: string | null;
  requestDate?: string;
  pestType: PestType;
  additionalPestType?: string | null;
  status?: PestStatus;
  priority?: PestPriority;
  source?: PestSource;
  vendorId?: string | null;
  thirdPartyWorkOrderNumber?: string | null;
  reportedBy?: string | null;
  assignedUserId?: string | null;
  treatmentDate?: string | null;
  followUpRequired?: boolean;
  followUpDate?: string | null;
  followUpNotes?: string | null;
  description?: string | null;
}) {
  return request<{ issue: PestIssue }>("/pest/issues", { method: "POST", body: JSON.stringify(input) });
}

export function updatePestIssue(id: string, input: Partial<Parameters<typeof createPestIssue>[0]>) {
  return request<{ issue: PestIssue }>(`/pest/issues/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function addPestIssueNote(id: string, body: string) {
  return request<{ note: PestIssueNote }>(`/pest/issues/${id}/notes`, { method: "POST", body: JSON.stringify({ body }) });
}

export function closePestIssue(id: string, input: { closingNotes: string; treatmentDate?: string | null; followUpDate?: string | null }) {
  return request<{ issue: PestIssue }>(`/pest/issues/${id}/close`, { method: "POST", body: JSON.stringify(input) });
}

export function archivePestIssue(id: string, archiveNotes?: string | null) {
  return request<{ issue: PestIssue }>(`/pest/issues/${id}/archive`, { method: "POST", body: JSON.stringify({ archiveNotes: archiveNotes ?? null }) });
}

export function dismissPestRecurringFlag(id: string, notes: string) {
  return request<{ issue: PestIssue }>(`/pest/issues/${id}/dismiss-recurring`, { method: "POST", body: JSON.stringify({ notes }) });
}

export function getPestVendors(propertyId?: string) {
  const params = new URLSearchParams();
  if (propertyId) params.set("propertyId", propertyId);
  return request<{ vendors: PestVendor[] }>(`/pest/vendors${params.toString() ? `?${params.toString()}` : ""}`);
}

export function createPestVendor(input: {
  propertyId: string;
  vendorName: string;
  primaryContact?: string | null;
  phone?: string | null;
  email?: string | null;
  emergencyPhone?: string | null;
  serviceDay?: string | null;
  serviceFrequency?: string | null;
  notes?: string | null;
  isActive?: boolean;
  isDefault?: boolean;
}) {
  return request<{ vendor: PestVendor }>("/pest/vendors", { method: "POST", body: JSON.stringify(input) });
}

export function updatePestVendor(id: string, input: Partial<Parameters<typeof createPestVendor>[0]>) {
  return request<{ vendor: PestVendor }>(`/pest/vendors/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function uploadPestIssueAttachment(issueId: string, file: File, options?: { photoType?: PestPhotoType; caption?: string }) {
  const form = new FormData();
  form.append("file", file);
  if (options?.photoType) form.append("photoType", options.photoType);
  if (options?.caption) form.append("caption", options.caption);
  return request<{ attachment: PestIssueAttachment }>(`/pest/issues/${issueId}/attachments`, {
    method: "POST",
    body: form,
  });
}

export function deletePestIssueAttachment(id: string) {
  return request<{ ok: true }>(`/pest/attachments/${id}`, { method: "DELETE" });
}

export function pestIssueAttachmentDownloadUrl(id: string) {
  return `${apiBaseUrl}/pest/attachments/${id}/download`;
}

export function pestExportCsvUrl(filters: Parameters<typeof getPestIssues>[0] = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  return `${apiBaseUrl}/pest/export.csv${params.toString() ? `?${params.toString()}` : ""}`;
}

export function pestExportXlsUrl(filters: Parameters<typeof getPestIssues>[0] = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  return `${apiBaseUrl}/pest/export.xls${params.toString() ? `?${params.toString()}` : ""}`;
}

export function pestPrintableHtmlReportUrl(filters: Parameters<typeof getPestIssues>[0] = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  return `${apiBaseUrl}/pest/report.html${params.toString() ? `?${params.toString()}` : ""}`;
}

export function pestPrintableReportUrl(filters: Parameters<typeof getPestIssues>[0] = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  return `${apiBaseUrl}/pest/report.pdf${params.toString() ? `?${params.toString()}` : ""}`;
}

export function getProjectsOverview(propertyId?: string) {
  const params = new URLSearchParams();
  if (propertyId) params.set("propertyId", propertyId);
  return request<ProjectsOverviewResponse>(`/projects/overview${params.toString() ? `?${params.toString()}` : ""}`);
}

export function getProjectCategories(propertyId?: string) {
  const params = new URLSearchParams();
  if (propertyId) params.set("propertyId", propertyId);
  return request<{ categories: ProjectCategory[] }>(`/projects/categories${params.toString() ? `?${params.toString()}` : ""}`);
}

export function createProjectCategory(input: {
  propertyId?: string | null;
  name: string;
  color?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}) {
  return request<{ category: ProjectCategory }>("/projects/categories", { method: "POST", body: JSON.stringify(input) });
}

export function updateProjectCategory(id: string, input: {
  propertyId?: string | null;
  name?: string;
  color?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}) {
  return request<{ category: ProjectCategory }>(`/projects/categories/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function getProjectRecords(filters: {
  propertyId?: string;
  recordType?: ProjectRecordType;
  source?: ProjectSource;
  status?: string;
  priority?: ProjectPriority;
  categoryId?: string;
  executionType?: ProjectExecutionType;
  assignedUserId?: string;
  budgetYear?: string;
  deferredMaintenance?: boolean;
  attachmentType?: ProjectAttachmentType;
  agingBucket?: "0-30" | "31-90" | "91-180" | "180+";
  includeArchived?: boolean;
  q?: string;
  limit?: number;
  offset?: number;
} = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  return request<{ records: ProjectRecord[]; pagination: { total: number; limit: number; offset: number; hasMore: boolean } }>(`/projects/records${params.toString() ? `?${params.toString()}` : ""}`);
}

export function getProjectMapRecords(filters: Parameters<typeof getProjectRecords>[0] = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  return request<{ records: ProjectRecord[] }>(`/projects/map${params.toString() ? `?${params.toString()}` : ""}`);
}

export function getProjectRecord(id: string) {
  return request<{ record: ProjectRecord; history: ProjectHistoryEntry[] }>(`/projects/records/${encodeURIComponent(id)}`);
}

export function projectPrintableRecordReportUrl(id: string) {
  return `${apiBaseUrl}/projects/records/${encodeURIComponent(id)}/report.pdf`;
}

export function createProjectRecord(input: {
  propertyId: string;
  recordType: ProjectRecordType;
  title: string;
  description?: string | null;
  source?: ProjectSource | null;
  sourceRecordType?: string | null;
  sourceRecordId?: string | null;
  sourceRecordLabel?: string | null;
  status: string;
  priority?: ProjectPriority;
  executionType?: ProjectExecutionType;
  categoryId?: string | null;
  building?: string | null;
  area?: string | null;
  locationNotes?: string | null;
  propertyMapId?: string | null;
  pinX?: number | null;
  pinY?: number | null;
  estimatedQuantity?: number | null;
  quantityUnit?: string | null;
  estimatedCost?: number | null;
  actualCost?: number | null;
  totalAmount?: number | null;
  deferredMaintenance?: boolean;
  deferredReason?: string | null;
  targetYear?: number | null;
  deferredNotes?: string | null;
  budgetYear?: string | null;
  companyName?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  bidStatus?: ProjectBidStatus | null;
  bidNotes?: string | null;
  assignedUserId?: string | null;
  assignedRole?: UserRole | null;
  assignedTeam?: string | null;
  scheduledDate?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  completedDate?: string | null;
  tags?: string[];
}) {
  return request<{ record: ProjectRecord }>("/projects/records", { method: "POST", body: JSON.stringify(input) });
}

export function updateProjectRecord(id: string, input: Partial<Parameters<typeof createProjectRecord>[0]>) {
  return request<{ record: ProjectRecord }>(`/projects/records/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function convertProjectRecommendation(id: string) {
  return request<{ record: ProjectRecord }>(`/projects/records/${encodeURIComponent(id)}/convert`, { method: "POST" });
}

export function createProjectComment(id: string, input: { body: string }) {
  return request<{ comment: ProjectComment }>(`/projects/records/${encodeURIComponent(id)}/comments`, { method: "POST", body: JSON.stringify(input) });
}

export function createProjectTask(id: string, input: { title: string; status?: ProjectTaskStatus; assignedUserId?: string | null; dueDate?: string | null }) {
  return request<{ task: ProjectTask }>(`/projects/records/${encodeURIComponent(id)}/tasks`, { method: "POST", body: JSON.stringify(input) });
}

export function updateProjectTask(id: string, input: { title?: string; status?: ProjectTaskStatus; assignedUserId?: string | null; dueDate?: string | null; completedDate?: string | null }) {
  return request<{ task: ProjectTask }>(`/projects/tasks/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function uploadProjectAttachment(id: string, file: File, attachmentType?: ProjectAttachmentType, caption?: string) {
  const data = new FormData();
  data.append("file", file);
  if (attachmentType) data.append("attachmentType", attachmentType);
  if (caption) data.append("caption", caption);
  return request<{ attachment: ProjectAttachment }>(`/projects/records/${encodeURIComponent(id)}/attachments`, { method: "POST", body: data });
}

export function updateProjectAttachment(id: string, input: {
  attachmentType?: ProjectAttachmentType;
  caption?: string | null;
}) {
  return request<{ attachment: ProjectAttachment }>(`/projects/attachments/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function projectAttachmentDownloadUrl(id: string) {
  return `${apiBaseUrl}/projects/attachments/${encodeURIComponent(id)}/download`;
}

export function createProjectWikiReference(id: string, input: { targetType: "ENTRY" | "VENDOR" | "ASSET"; targetId: string }) {
  return request<{ reference: ProjectWikiReference }>(`/projects/records/${encodeURIComponent(id)}/wiki-references`, { method: "POST", body: JSON.stringify(input) });
}

export function deleteProjectWikiReference(id: string) {
  return request<{ ok: boolean }>(`/projects/wiki-references/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function projectsExportCsvUrl(filters: Record<string, string | undefined> = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return `${apiBaseUrl}/projects/export.csv${params.toString() ? `?${params.toString()}` : ""}`;
}

export function projectsExportExcelUrl(filters: Record<string, string | undefined> = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return `${apiBaseUrl}/projects/export.xls${params.toString() ? `?${params.toString()}` : ""}`;
}

export function projectsPrintableReportUrl(filters: Record<string, string | undefined> = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return `${apiBaseUrl}/projects/report.html${params.toString() ? `?${params.toString()}` : ""}`;
}

export function projectsPdfReportUrl(filters: Record<string, string | undefined> = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return `${apiBaseUrl}/projects/report.pdf${params.toString() ? `?${params.toString()}` : ""}`;
}

export function makeReadyExportCsvUrl(filters: { propertyId?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.propertyId) params.set("propertyId", filters.propertyId);
  return `${apiBaseUrl}/export/make-ready.csv${params.toString() ? `?${params.toString()}` : ""}`;
}

export function makeReadyPdfReportUrl(filters: { propertyId?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.propertyId) params.set("propertyId", filters.propertyId);
  return `${apiBaseUrl}/export/make-ready.pdf${params.toString() ? `?${params.toString()}` : ""}`;
}

export function getCurrentUser() {
  return request<{ user: CurrentUser; roles: UserRole[]; csrfToken: string }>("/auth/me");
}

export function login(email: string, password: string) {
  return request<{ user: CurrentUser; roles: UserRole[]; csrfToken: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function logout() {
  return request<{ ok: true }>("/auth/logout", {
    method: "POST",
  });
}

export function logoutAllSessions() {
  return request<{ ok: true }>("/auth/logout-all", {
    method: "POST",
  });
}

export function updateCurrentUserPreferences(input: { language: UserLanguage }) {
  return request<{ user: CurrentUser }>("/auth/me/preferences", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function getAdminUsers() {
  return request<{ users: ManagedUser[] }>("/admin/users");
}

export function getAdminProperties() {
  return request<{ properties: Property[] }>("/admin/properties");
}

export function getStorageSettings() {
  return request<StorageSettingsResponse>("/admin/storage");
}

export function validateStoragePath(hostPath: string) {
  return request<StorageValidationResponse>("/admin/storage/validate", {
    method: "POST",
    body: JSON.stringify({ hostPath }),
  });
}

export function updatePropertyStorageRouting(input: {
  propertyId: string;
  uploadStorageMode: "DEFAULT" | "PROPERTY_SUBDIR";
  uploadSubdir?: string | null;
}) {
  return request<{ property: StorageSettingsResponse["storage"]["propertyRouting"][number] }>("/admin/storage/property-routing", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function createAdminUser(input: {
  fullName: string;
  email: string;
  role: UserRole;
  language?: UserLanguage;
  password: string;
  isActive: boolean;
  propertyIds: string[];
}) {
  return request<{ user: ManagedUser }>("/admin/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateAdminUser(id: string, input: {
  fullName?: string;
  email?: string;
  role?: UserRole;
  language?: UserLanguage;
  isActive?: boolean;
}) {
  return request<{ user: ManagedUser }>(`/admin/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function resetAdminUserPassword(id: string, password: string) {
  return request<{ ok: true }>(`/admin/users/${id}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export function deactivateAdminUser(id: string) {
  return request<{ user: ManagedUser }>(`/admin/users/${id}`, {
    method: "DELETE",
  });
}

export function updateAdminUserPropertyAccess(id: string, propertyIds: string[]) {
  return request<{ user: ManagedUser }>(`/admin/users/${id}/property-access`, {
    method: "PUT",
    body: JSON.stringify({ propertyIds }),
  });
}

export function exportNativeBackup() {
  return request<NativeBackup>("/admin/export");
}

export function importNativeBackup(backup: unknown, dryRun: boolean) {
  return request<{ dryRun: boolean; mode: "merge"; summary: BackupImportSummary }>("/admin/import", {
    method: "POST",
    body: JSON.stringify({ backup, dryRun, mode: "merge" }),
  });
}

export function getActivity(filters: {
  from?: string;
  to?: string;
  actorUserId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  propertyId?: string;
  limit?: number;
  offset?: number;
}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  });
  return request<ActivityResponse>(`/activity?${params.toString()}`);
}

export function getDailyActivityReport(filters: { date?: string; propertyId?: string }) {
  const params = new URLSearchParams();
  if (filters.date) params.set("date", filters.date);
  if (filters.propertyId) params.set("propertyId", filters.propertyId);
  if (typeof window !== "undefined") {
    params.set("timezoneOffsetMinutes", String(new Date().getTimezoneOffset()));
  }
  return request<DailyActivityReport>(`/activity/daily-report?${params.toString()}`);
}

export function dailyActivityReportCsvUrl(filters: { date?: string; propertyId?: string }) {
  const params = new URLSearchParams();
  if (filters.date) params.set("date", filters.date);
  if (filters.propertyId) params.set("propertyId", filters.propertyId);
  if (typeof window !== "undefined") {
    params.set("timezoneOffsetMinutes", String(new Date().getTimezoneOffset()));
  }
  return `${apiBaseUrl}/activity/daily-report.csv?${params.toString()}`;
}

export function getAutomations(includeArchived = false) {
  return request<{ rules: AutomationRule[] }>(`/automations?includeArchived=${includeArchived}`);
}

export function getAutomationTemplates() {
  return request<{ templates: AutomationTemplate[] }>("/automations/templates");
}

export function getOperationalLibraryPacks() {
  return request<{ packs: OperationalLibraryPack[]; installed: unknown[] }>("/operational-library/packs");
}

export function previewOperationalLibraryPack(input: { packKey?: string; pack?: unknown }) {
  return request<{ pack: Pick<OperationalLibraryPack, "packKey" | "name" | "version" | "category" | "description" | "setupNotes">; dryRun: true; summary: OperationalLibrarySummary; warnings: string[] }>("/operational-library/preview", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function installOperationalLibraryPack(input: { packKey?: string; pack?: unknown }) {
  return request<{ pack: unknown; summary: OperationalLibrarySummary }>("/operational-library/install", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getPropertyTemplates() {
  return request<{ templates: PropertyTemplate[] }>("/property-templates");
}

export function previewPropertyTemplateFromProperty(input: {
  propertyId: string;
  name: string;
  description?: string | null;
  category?: string | null;
  version?: number;
  notes?: string | null;
  include: PropertyTemplateInclude;
}) {
  return request<{ dryRun: true; counts: Record<string, number>; warnings: string[] }>("/property-templates/from-property/preview", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function createPropertyTemplateFromProperty(input: {
  propertyId: string;
  name: string;
  description?: string | null;
  category?: string | null;
  version?: number;
  notes?: string | null;
  include: PropertyTemplateInclude;
}) {
  return request<{ template: PropertyTemplate }>("/property-templates/from-property", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function applyPropertyTemplate(id: string, input: {
  dryRun: boolean;
  mode?: "merge";
  targetPropertyId?: string | null;
  newProperty?: { name: string; code: string } | null;
  overwriteExisting?: boolean;
  enableAutomations?: boolean;
}) {
  return request<{ dryRun: boolean; property: Property | null; summary: PropertyTemplateSummary }>(`/property-templates/${id}/apply`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function archivePropertyTemplate(id: string) {
  return request<{ template: PropertyTemplate }>(`/property-templates/${id}/archive`, {
    method: "POST",
  });
}

export function getAutomationRuns(ruleId?: string, itemId?: string) {
  const params = new URLSearchParams({ limit: "20" });
  if (ruleId) params.set("ruleId", ruleId);
  if (itemId) params.set("itemId", itemId);
  return request<{ runs: AutomationRun[]; pagination: { total: number; limit: number; offset: number; hasMore: boolean } }>(`/automations/runs?${params.toString()}`);
}

export function createAutomation(input: AutomationRuleDraft) {
  return request<{ rule: AutomationRule }>("/automations", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function installAutomationTemplate(templateId: string, input: { propertyId: string | null; enabled: boolean }) {
  return request<{ rule: AutomationRule; templateId: string; enabled: boolean }>(`/automations/templates/${templateId}/install`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateAutomation(id: string, input: Partial<{
  name: string;
  description: string | null;
  propertyId: string | null;
  triggerType: AutomationTriggerType;
  conditions: { all: AutomationCondition[] };
  actions: AutomationAction[];
}>) {
  return request<{ rule: AutomationRule }>(`/automations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function toggleAutomation(id: string, enabled: boolean) {
  return request<{ rule: AutomationRule }>(`/automations/${id}/enabled`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
}

export function archiveAutomation(id: string) {
  return request<{ ok: true }>(`/automations/${id}`, {
    method: "DELETE",
  });
}

export function previewAutomation(input: {
  ruleId?: string;
  draft?: AutomationRuleDraft;
  propertyId?: string | null;
  limit?: number;
}) {
  return request<AutomationPreviewResponse>("/automations/preview", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function runAutomationNow(id: string) {
  return request<{ execution: AutomationExecutionResult }>(`/automations/${id}/run`, {
    method: "POST",
  });
}

export function getCustomFields(includeArchived = false, includeDeleted = false) {
  return request<{ fields: CustomField[] }>(`/custom-fields?includeArchived=${includeArchived}&includeDeleted=${includeDeleted}`);
}

export function createCustomField(input: {
  label: string;
  fieldType: CustomFieldType;
  description?: string | null;
  options?: Array<Pick<CustomFieldOption, "label" | "color" | "sortOrder" | "isArchived">>;
}) {
  return request<{ field: CustomField }>("/custom-fields", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateCustomField(id: string, input: Partial<{
  label: string;
  fieldType: CustomFieldType;
  description: string | null;
  options: Array<Partial<CustomFieldOption> & Pick<CustomFieldOption, "label" | "color">>;
}>) {
  return request<{ field: CustomField }>(`/custom-fields/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function archiveCustomField(id: string) {
  return request<{ ok: true }>(`/custom-fields/${id}`, {
    method: "DELETE",
  });
}

export function restoreCustomField(id: string) {
  return request<{ ok: true }>(`/custom-fields/${id}/restore`, {
    method: "POST",
  });
}

export function trashCustomField(id: string) {
  return request<{ ok: true; deleteAfter: string }>(`/custom-fields/${id}/trash`, {
    method: "POST",
  });
}

export function permanentlyDeleteCustomField(id: string) {
  return request<{ ok: true }>(`/custom-fields/${id}/permanent`, {
    method: "DELETE",
  });
}

export function reorderCustomFields(fieldIds: string[]) {
  return request<{ ok: true }>("/custom-fields/reorder", {
    method: "PUT",
    body: JSON.stringify({ fieldIds }),
  });
}

export function updateCustomFieldValue(itemId: string, fieldId: string, value: unknown) {
  return request<{ itemId: string; fieldId: string; value: unknown }>(`/make-ready-items/${itemId}/custom-fields/${fieldId}`, {
    method: "PUT",
    body: JSON.stringify({ value }),
  });
}

export function getSavedViews() {
  return request<{ views: SavedView[] }>("/saved-views");
}

export function createSavedView(input: {
  name: string;
  module: string;
  viewType: "table" | "kanban" | "calendar" | "dashboard";
  filters: Record<string, unknown>;
  sorts: { key: string; direction: "asc" | "desc" } | null;
  grouping: Record<string, unknown> | null;
  visibleColumns?: string[] | null;
  isShared: boolean;
}) {
  return request<{ view: SavedView }>("/saved-views", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateSavedView(id: string, input: Partial<{
  name: string;
  viewType: "table" | "kanban" | "calendar" | "dashboard";
  filters: Record<string, unknown>;
  sorts: { key: string; direction: "asc" | "desc" } | null;
  grouping: Record<string, unknown> | null;
  visibleColumns: string[] | null;
  isShared: boolean;
}>) {
  return request<{ view: SavedView }>(`/saved-views/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function updateBoardSection(id: string, displayName: string) {
  return request<{ section: BoardSection }>(`/operations/board-sections/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ displayName }),
  });
}

export function deleteSavedView(id: string) {
  return request<{ ok: true }>(`/saved-views/${id}`, {
    method: "DELETE",
  });
}

export function getMakeReadyItems(filters: {
  propertyId?: string;
  q?: string;
  includeArchived?: boolean;
  boardGroup?: string;
  section?: string;
  boardSection?: string;
  vacancyStatus?: string;
  assignedTech?: string;
  scopeLevel?: string;
  makeReadyStatus?: string;
  riskLevel?: string;
  riskCategory?: string;
  moveInWindow?: "week" | "7" | "14" | "";
  overdueOnly?: boolean;
  missingDatesOnly?: boolean;
  pestIssuesOnly?: boolean;
  flooringNeededOnly?: boolean;
  paintNeededOnly?: boolean;
  moveInRiskOnly?: boolean;
  customFieldFilters?: Array<{
    fieldId: string;
    operator: string;
    value?: string | number | boolean | null;
    valueTo?: string | null;
  }>;
  sortBy?: "boardGroup" | "unitNumber" | "moveInDate" | "makeReadyDate" | "vacatedDate" | "flooringDate" | "daysVacant" | "riskScore" | "riskLevel" | "assignedTech" | "updatedAt" | "createdAt";
  sortDirection?: "asc" | "desc";
  updatedSince?: string;
  limit?: number;
  offset?: number;
}) {
  const params = new URLSearchParams();
  if (filters.propertyId) params.set("propertyId", filters.propertyId);
  if (filters.q) params.set("q", filters.q);
  if (filters.includeArchived) params.set("includeArchived", "true");
  if (filters.boardGroup) params.set("boardGroup", filters.boardGroup);
  if (filters.section) params.set("section", filters.section);
  if (filters.boardSection) params.set("boardSection", filters.boardSection);
  if (filters.vacancyStatus) params.set("vacancyStatus", filters.vacancyStatus);
  if (filters.assignedTech) params.set("assignedTech", filters.assignedTech);
  if (filters.scopeLevel) params.set("scopeLevel", filters.scopeLevel);
  if (filters.makeReadyStatus) params.set("makeReadyStatus", filters.makeReadyStatus);
  if (filters.riskLevel) params.set("riskLevel", filters.riskLevel);
  if (filters.riskCategory) params.set("riskCategory", filters.riskCategory);
  if (filters.moveInWindow) params.set("moveInWindow", filters.moveInWindow);
  if (filters.overdueOnly) params.set("overdueOnly", "true");
  if (filters.missingDatesOnly) params.set("missingDatesOnly", "true");
  if (filters.pestIssuesOnly) params.set("pestIssuesOnly", "true");
  if (filters.flooringNeededOnly) params.set("flooringNeededOnly", "true");
  if (filters.paintNeededOnly) params.set("paintNeededOnly", "true");
  if (filters.moveInRiskOnly) params.set("moveInRiskOnly", "true");
  if (filters.customFieldFilters?.length) params.set("customFieldFilters", JSON.stringify(filters.customFieldFilters));
  if (filters.sortBy) params.set("sortBy", filters.sortBy);
  if (filters.sortDirection) params.set("sortDirection", filters.sortDirection);
  if (filters.updatedSince) params.set("updatedSince", filters.updatedSince);
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.offset) params.set("offset", String(filters.offset));
  return request<MakeReadyItem[]>(`/make-ready-items?${params.toString()}`);
}

export type MakeReadyItemsPage = {
  items: MakeReadyItem[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
    nextOffset: number | null;
  };
};

export async function getMakeReadyItemPage(filters: Parameters<typeof getMakeReadyItems>[0]): Promise<MakeReadyItemsPage> {
  const params = new URLSearchParams();
  if (filters.propertyId) params.set("propertyId", filters.propertyId);
  if (filters.q) params.set("q", filters.q);
  if (filters.includeArchived) params.set("includeArchived", "true");
  if (filters.boardGroup) params.set("boardGroup", filters.boardGroup);
  if (filters.section) params.set("section", filters.section);
  if (filters.boardSection) params.set("boardSection", filters.boardSection);
  if (filters.vacancyStatus) params.set("vacancyStatus", filters.vacancyStatus);
  if (filters.assignedTech) params.set("assignedTech", filters.assignedTech);
  if (filters.scopeLevel) params.set("scopeLevel", filters.scopeLevel);
  if (filters.makeReadyStatus) params.set("makeReadyStatus", filters.makeReadyStatus);
  if (filters.riskLevel) params.set("riskLevel", filters.riskLevel);
  if (filters.riskCategory) params.set("riskCategory", filters.riskCategory);
  if (filters.moveInWindow) params.set("moveInWindow", filters.moveInWindow);
  if (filters.overdueOnly) params.set("overdueOnly", "true");
  if (filters.missingDatesOnly) params.set("missingDatesOnly", "true");
  if (filters.pestIssuesOnly) params.set("pestIssuesOnly", "true");
  if (filters.flooringNeededOnly) params.set("flooringNeededOnly", "true");
  if (filters.paintNeededOnly) params.set("paintNeededOnly", "true");
  if (filters.moveInRiskOnly) params.set("moveInRiskOnly", "true");
  if (filters.customFieldFilters?.length) params.set("customFieldFilters", JSON.stringify(filters.customFieldFilters));
  if (filters.sortBy) params.set("sortBy", filters.sortBy);
  if (filters.sortDirection) params.set("sortDirection", filters.sortDirection);
  if (filters.updatedSince) params.set("updatedSince", filters.updatedSince);
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.offset) params.set("offset", String(filters.offset));

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/make-ready-items?${params.toString()}`, {
      credentials: "include",
    });
  } catch {
    notifyApiUnreachable("/make-ready-items", "GET");
    throw new ApiError(0, "Could not reach the MakeReadyOS API. Check the connection and retry.");
  }
  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const body = (await response.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // Ignore non-JSON failures.
    }
    if (response.status === 401) csrfToken = null;
    throw new ApiError(response.status, message);
  }
  const items = (await response.json()) as MakeReadyItem[];
  const total = Number(response.headers.get("x-total-count") ?? items.length);
  const limit = Number(response.headers.get("x-limit") ?? filters.limit ?? items.length);
  const offset = Number(response.headers.get("x-offset") ?? filters.offset ?? 0);
  const nextOffsetRaw = response.headers.get("x-next-offset");
  return {
    items,
    pagination: {
      total,
      limit,
      offset,
      hasMore: response.headers.get("x-has-more") === "true",
      nextOffset: nextOffsetRaw ? Number(nextOffsetRaw) : null,
    },
  };
}

export function createMakeReadyItem(input: {
  propertyId: string;
  unitId: string | null;
  boardGroup: string;
  itemName: string;
  unitNumber: string;
  floorPlan: string | null;
  vacancyStatus?: string | null;
  makeReadyStatus?: string | null;
  completionStatus?: string | null;
  moveOutDate?: string | null;
  vacatedDate?: string | null;
  makeReadyDate?: string | null;
  moveInDate?: string | null;
  assignedTech?: string | null;
  scopeLevel?: string | null;
}) {
  return request<MakeReadyItem>("/make-ready-items", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function archiveMakeReadyItem(id: string) {
  return request<MakeReadyItem>(`/make-ready-items/${id}/archive`, { method: "POST" });
}

export function restoreMakeReadyItem(id: string) {
  return request<MakeReadyItem>(`/make-ready-items/${id}/restore`, { method: "POST" });
}

export function getOperationsProperties(includeArchived = true) {
  return request<{ properties: Property[] }>(`/operations/properties?includeArchived=${includeArchived}`);
}

export function createProperty(input: { name: string; code: string; occupancyGoalPercent?: number | null }) {
  return request<{ property: Property }>("/operations/properties", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateProperty(id: string, input: { name?: string; code?: string; occupancyGoalPercent?: number | null }) {
  return request<{ property: Property }>(`/operations/properties/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function archiveProperty(id: string) {
  return request<{ property: Property }>(`/operations/properties/${id}/archive`, { method: "POST" });
}

export function restoreProperty(id: string) {
  return request<{ property: Property }>(`/operations/properties/${id}/restore`, { method: "POST" });
}

export function deleteProperty(id: string) {
  return request<{ ok: true }>(`/operations/properties/${id}`, { method: "DELETE" });
}

export function getOperationsUnits(propertyId?: string, includeArchived = true) {
  const params = new URLSearchParams({ includeArchived: String(includeArchived) });
  if (propertyId) params.set("propertyId", propertyId);
  return request<{ units: Unit[] }>(`/operations/units?${params.toString()}`);
}

export type UnitWriteInput = {
  propertyId: string;
  number: string;
  floorPlanId?: string | null;
  floorPlan: string | null;
  squareFeet: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  occupancyStatus?: Unit["occupancyStatus"];
  building?: string | null;
  area?: string | null;
  floor?: string | null;
  isBudgeted?: boolean;
};

export type UnitImportInput = {
  number: string;
  floorPlan?: string | null;
  squareFeet?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  occupancyStatus?: Unit["occupancyStatus"];
  building?: string | null;
  area?: string | null;
  floor?: string | null;
  isBudgeted?: boolean;
};

export type UnitImportResult = {
  property: Pick<Property, "id" | "code" | "name">;
  summary: { created: number; updated: number; skipped: number; floorPlansCreated?: number; floorPlansUpdated?: number; errors: string[] };
  createdUnitIds: string[];
  updatedUnitIds: string[];
};

export type AvailabilityImportInput = UnitImportInput & {
  vacancyStatus?: Exclude<Unit["occupancyStatus"], "OCCUPIED">;
  availabilityStatus?: string | null;
  applicant?: string | null;
  moveOutDate?: string | null;
  vacatedDate?: string | null;
  daysVacant?: number | null;
  makeReadyDate?: string | null;
  moveInDate?: string | null;
  reportDate?: string | null;
  dateApplied?: string | null;
  makeReadyStatus?: string | null;
  scopeLevel?: string | null;
  notes?: string | null;
};

export type AvailabilityImportResult = {
  property: Pick<Property, "id" | "code" | "name">;
  summary: {
    unitsCreated: number;
    unitsUpdated: number;
    turnsCreated: number;
    turnsUpdated: number;
    skipped: number;
    floorPlansCreated?: number;
    floorPlansUpdated?: number;
    errors: string[];
  };
  createdItemIds: string[];
  updatedItemIds: string[];
};

export type AvailabilityImportConflict = {
  itemId: string;
  unitNumber: string;
  updatedAt: string;
  reportDate: string | null;
  reason: string;
  fieldChanges: string[];
};

export type AvailabilityImportConflictResponse = {
  message: string;
  property: Pick<Property, "id" | "code" | "name">;
  conflicts: AvailabilityImportConflict[];
};

export function createUnit(input: UnitWriteInput) {
  return request<{ unit: Unit }>("/operations/units", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateUnit(id: string, input: Partial<UnitWriteInput>) {
  return request<{ unit: Unit }>(`/operations/units/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function importUnits(input: { propertyId: string; units: UnitImportInput[]; updateExisting?: boolean }) {
  return request<UnitImportResult>("/operations/units/import", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function importAvailability(input: { propertyId: string; rows: AvailabilityImportInput[]; updateExisting?: boolean; createTurns?: boolean; overrideConflicts?: boolean }) {
  return request<AvailabilityImportResult>("/operations/availability/import", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function revertUnitImport(input: { propertyId: string; createdUnitIds: string[] }) {
  return request<{ summary: { deleted: number; skipped: number; blocked: string[] } }>("/operations/units/import/revert", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function archiveUnit(id: string) {
  return request<{ unit: Unit }>(`/operations/units/${id}/archive`, { method: "POST" });
}

export function restoreUnit(id: string) {
  return request<{ unit: Unit }>(`/operations/units/${id}/restore`, { method: "POST" });
}

export function deleteUnit(id: string) {
  return request<{ ok: true }>(`/operations/units/${id}`, { method: "DELETE" });
}

export function getBoardOptions() {
  return request<{ options: LabelDefinition[] }>("/operations/options");
}

export function createBoardOption(input: { fieldKey: string; value: string; color: string; textColor: string }) {
  return request<{ option: LabelDefinition }>("/operations/options", { method: "POST", body: JSON.stringify(input) });
}

export function updateBoardOption(id: string, input: Partial<Pick<LabelDefinition, "value" | "color" | "textColor">>) {
  return request<{ option: LabelDefinition }>(`/operations/options/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function archiveBoardOption(id: string, restore = false) {
  return request<{ option: LabelDefinition }>(`/operations/options/${id}/${restore ? "restore" : "archive"}`, { method: "POST" });
}

export function reorderBoardOptions(ids: string[]) {
  return request<{ ok: true }>("/operations/options/reorder", { method: "PUT", body: JSON.stringify({ ids }) });
}

export function getFloorPlans(propertyId?: string, includeArchived = true) {
  const params = new URLSearchParams({ includeArchived: String(includeArchived) });
  if (propertyId) params.set("propertyId", propertyId);
  return request<{ floorPlans: FloorPlan[] }>(`/operations/floor-plans?${params.toString()}`);
}

export function getBoardColumns() {
  return request<{ columns: BoardColumnDefinition[] }>("/operations/columns");
}

export function updateBoardColumn(fieldKey: string, label?: string, reset = false) {
  return request<{ column: BoardColumnDefinition }>(`/operations/columns/${fieldKey}`, {
    method: "PATCH",
    body: JSON.stringify(reset ? { reset: true } : { label }),
  });
}

export function getScheduleTracks() {
  return request<{ tracks: ScheduleTrack[] }>("/operations/schedule-tracks");
}

export function createScheduleTrack(input: Omit<ScheduleTrack, "id" | "sortOrder">) {
  return request<{ track: ScheduleTrack }>("/operations/schedule-tracks", { method: "POST", body: JSON.stringify(input) });
}

export function updateScheduleTrack(id: string, input: Partial<Omit<ScheduleTrack, "id" | "sortOrder">>) {
  return request<{ track: ScheduleTrack }>(`/operations/schedule-tracks/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function archiveScheduleTrack(id: string, restore = false) {
  return request<{ track: ScheduleTrack }>(`/operations/schedule-tracks/${id}/${restore ? "restore" : "archive"}`, { method: "POST" });
}

export function reorderScheduleTracks(ids: string[]) {
  return request<{ ok: true }>("/operations/schedule-tracks/reorder", { method: "PUT", body: JSON.stringify({ ids }) });
}

export type OperatingCalendarInput = Omit<OperatingCalendar, "id" | "propertyId" | "createdAt" | "updatedAt" | "property">;

export function getOperatingCalendars(propertyId?: string, includeArchived = false) {
  const params = new URLSearchParams({ includeArchived: String(includeArchived) });
  if (propertyId) params.set("propertyId", propertyId);
  return request<{ calendars: OperatingCalendar[] }>(`/operations/operating-calendars?${params.toString()}`);
}

export function updateOperatingCalendar(propertyId: string, input: OperatingCalendarInput) {
  return request<{ calendar: OperatingCalendar }>(`/operations/properties/${propertyId}/operating-calendar`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function createFloorPlan(input: Omit<FloorPlan, "id" | "isActive" | "property" | "_count">) {
  return request<{ floorPlan: FloorPlan }>("/operations/floor-plans", { method: "POST", body: JSON.stringify(input) });
}

export function updateFloorPlan(id: string, input: Partial<Omit<FloorPlan, "id" | "isActive" | "property" | "_count">>) {
  return request<{ floorPlan: FloorPlan }>(`/operations/floor-plans/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function archiveFloorPlan(id: string, restore = false) {
  return request<{ floorPlan: FloorPlan }>(`/operations/floor-plans/${id}/${restore ? "restore" : "archive"}`, { method: "POST" });
}

export function batchMakeReadyItems(input:
  | { action: "ARCHIVE" | "RESTORE"; ids: string[] }
  | { action: "ASSIGN_TECH"; ids: string[]; value: string | null }
  | { action: "MOVE_GROUP"; ids: string[]; boardGroup: string }
  | { action: "SET_FIELD"; ids: string[]; field: "vacancyStatus" | "scopeLevel" | "makeReadyStatus" | "completionStatus" | "cleaningStatus"; value: string | null }
) {
  return request<{ ok: true; count: number }>("/make-ready-items/batch", { method: "POST", body: JSON.stringify(input) });
}

export function patchMakeReadyItem(id: string, data: Record<string, unknown>) {
  return request<MakeReadyItem>(`/make-ready-items/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function markMakeReadyItemReady(id: string) {
  return request<MakeReadyItem>(`/make-ready-items/${id}/mark-ready`, { method: "POST" });
}

export function getCalendar(field: string, propertyId?: string) {
  const params = new URLSearchParams({ field });
  if (propertyId) params.set("propertyId", propertyId);
  return request<
    Array<{
      id: string;
      title: string;
      unitNumber: string;
      boardGroup: string;
      propertyCode: string;
      date: string;
      moveInSoon: boolean;
      overdue: boolean;
    }>
  >(`/calendar?${params.toString()}`);
}

export function getVendors(filters: { propertyId?: string; includeArchived?: boolean; trade?: string; q?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.propertyId) params.set("propertyId", filters.propertyId);
  if (filters.includeArchived !== undefined) params.set("includeArchived", String(filters.includeArchived));
  if (filters.trade) params.set("trade", filters.trade);
  if (filters.q) params.set("q", filters.q);
  return request<{ vendors: Vendor[] }>(`/vendors${params.toString() ? `?${params.toString()}` : ""}`);
}

export function createVendor(input: {
  name: string;
  trade: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  isPreferred?: boolean;
  insuranceExpiresAt?: string | null;
  licenseExpiresAt?: string | null;
  propertyIds?: string[];
}) {
  return request<{ vendor: Vendor }>("/vendors", { method: "POST", body: JSON.stringify(input) });
}

export function updateVendor(id: string, input: Partial<Parameters<typeof createVendor>[0]> & { isActive?: boolean }) {
  return request<{ vendor: Vendor }>(`/vendors/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function archiveVendor(id: string, restore = false) {
  return request<{ vendor: Vendor }>(`/vendors/${id}/${restore ? "restore" : "archive"}`, { method: "POST" });
}

export function getRefrigerantOverview() {
  return request<RefrigerantOverviewResponse>("/refrigerant/overview");
}

export function getRefrigerantTypes() {
  return request<{ types: RefrigerantType[] }>("/refrigerant/types");
}

export function createRefrigerantType(input: { name: string; notes?: string | null }) {
  return request<{ type: RefrigerantType }>("/refrigerant/types", { method: "POST", body: JSON.stringify(input) });
}

export function updateRefrigerantType(id: string, input: Partial<{ name: string; notes: string | null; isActive: boolean }>) {
  return request<{ type: RefrigerantType }>(`/refrigerant/types/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function getRefrigerantCylinders(filters: { category?: RefrigerantCylinder["category"]; status?: RefrigerantCylinder["status"]; includeArchived?: boolean } = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      const serialized = String(value);
      if (serialized) params.set(key, serialized);
    }
  });
  return request<{ cylinders: RefrigerantCylinder[] }>(`/refrigerant/cylinders${params.toString() ? `?${params.toString()}` : ""}`);
}

export function createRefrigerantCylinder(input: {
  identifier: string;
  refrigerantTypeId: string;
  category: RefrigerantCylinder["category"];
  tankSize: number;
  currentWeight: number;
  status?: RefrigerantCylinder["status"];
  notes?: string | null;
  dispositionNotes?: string | null;
  overrideActiveVirgin?: boolean;
}) {
  return request<{ cylinder: RefrigerantCylinder }>("/refrigerant/cylinders", { method: "POST", body: JSON.stringify(input) });
}

export function updateRefrigerantCylinder(id: string, input: Partial<Parameters<typeof createRefrigerantCylinder>[0]> & { finalRecoveryCompleted?: boolean }) {
  return request<{ cylinder: RefrigerantCylinder }>(`/refrigerant/cylinders/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function getRefrigerantHistory(filters: { propertyId?: string; unitId?: string; unitNumber?: string; refrigerantTypeId?: string; transactionType?: RefrigerantTransaction["transactionType"]; from?: string; to?: string; limit?: number; offset?: number } = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  return request<RefrigerantHistoryResponse>(`/refrigerant/history${params.toString() ? `?${params.toString()}` : ""}`);
}

export function createRefrigerantCharge(input: RefrigerantTransactionInput) {
  return request<{ transaction: RefrigerantTransaction }>("/refrigerant/transactions/charge", { method: "POST", body: JSON.stringify(input) });
}

export function createRefrigerantRecovery(input: RefrigerantTransactionInput & { recoveryType: "CLEAN" | "DIRTY" }) {
  return request<{ transaction: RefrigerantTransaction }>("/refrigerant/transactions/recovery", { method: "POST", body: JSON.stringify(input) });
}

export function createRefrigerantFinalRecovery(input: RefrigerantTransactionInput) {
  return request<{ transaction: RefrigerantTransaction }>("/refrigerant/transactions/final-recovery", { method: "POST", body: JSON.stringify(input) });
}

export function dismissRefrigerantLeakFlag(id: string, notes: string) {
  return request<{ flag: RefrigerantLeakFlag }>(`/refrigerant/leak-flags/${id}/dismiss`, { method: "POST", body: JSON.stringify({ notes }) });
}

export function refrigerantExportCsvUrl(report: "usage" | "recovery" | "cylinders" | "compliance" | "unitHistory" | "fullAudit") {
  return `${apiBaseUrl}/refrigerant/export.csv?report=${encodeURIComponent(report)}`;
}

export function refrigerantExportExcelUrl(report: "usage" | "recovery" | "cylinders" | "compliance" | "unitHistory" | "fullAudit") {
  return `${apiBaseUrl}/refrigerant/export.xls?report=${encodeURIComponent(report)}`;
}

export function refrigerantPrintableHtmlReportUrl(report: "usage" | "recovery" | "cylinders" | "compliance" | "unitHistory" | "fullAudit") {
  return `${apiBaseUrl}/refrigerant/report.html?report=${encodeURIComponent(report)}`;
}

export function refrigerantPrintableReportUrl(report: "usage" | "recovery" | "cylinders" | "compliance" | "unitHistory" | "fullAudit") {
  return `${apiBaseUrl}/refrigerant/report.pdf?report=${encodeURIComponent(report)}`;
}

export type RefrigerantTransactionInput = {
  propertyId?: string;
  unitId?: string;
  unitNumber?: string;
  refrigerantTypeId: string;
  sourceCylinderId?: string;
  recoveryCylinderId?: string;
  startWeight: number;
  endWeight: number;
  occurredAt?: string;
  notes?: string | null;
};

export function getPoolOverview(filters: { propertyId?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.propertyId) params.set("propertyId", filters.propertyId);
  return request<PoolOverviewResponse>(`/pool/overview${params.toString() ? `?${params.toString()}` : ""}`);
}

export function getPoolFacilities(filters: { propertyId?: string; includeArchived?: boolean } = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  return request<{ facilities: PoolFacility[] }>(`/pool/facilities${params.toString() ? `?${params.toString()}` : ""}`);
}

export function createPoolFacility(input: {
  propertyId: string;
  name: string;
  type: PoolFacility["type"];
  capacityGallons?: number | null;
  surfaceType?: string | null;
  notes?: string | null;
}) {
  return request<{ facility: PoolFacility }>("/pool/facilities", { method: "POST", body: JSON.stringify(input) });
}

export function updatePoolFacility(id: string, input: Partial<Parameters<typeof createPoolFacility>[0]> & { isActive?: boolean }) {
  return request<{ facility: PoolFacility }>(`/pool/facilities/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function getPoolChemicals(filters: { propertyId?: string; includeArchived?: boolean } = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  return request<{ chemicals: PoolChemical[] }>(`/pool/chemicals${params.toString() ? `?${params.toString()}` : ""}`);
}

export function createPoolChemical(input: {
  propertyId: string;
  name: string;
  category: PoolChemical["category"];
  concentrationPercent?: number | null;
  unit: PoolChemical["unit"];
  notes?: string | null;
}) {
  return request<{ chemical: PoolChemical }>("/pool/chemicals", { method: "POST", body: JSON.stringify(input) });
}

export function updatePoolChemical(id: string, input: Partial<Parameters<typeof createPoolChemical>[0]> & { isActive?: boolean }) {
  return request<{ chemical: PoolChemical }>(`/pool/chemicals/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function getPoolEntries(filters: { propertyId?: string; facilityId?: string; from?: string; to?: string; limit?: number; offset?: number } = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  return request<PoolEntriesResponse>(`/pool/entries${params.toString() ? `?${params.toString()}` : ""}`);
}

export function createPoolLogEntry(input: {
  propertyId: string;
  facilityId: string;
  logDate: string;
  logTime?: string | null;
  ph?: number | null;
  freeChlorine?: number | null;
  combinedChlorine?: number | null;
  totalChlorine?: number | null;
  totalAlkalinity?: number | null;
  cyanuricAcid?: number | null;
  calciumHardness?: number | null;
  waterTemperature?: number | null;
  vacuumed?: boolean;
  backwashed?: boolean;
  skimmerCleaned?: boolean;
  pumpRunning?: boolean;
  filterOperating?: boolean;
  waterClear?: boolean;
  waterCloudy?: boolean;
  algaePresent?: boolean;
  notes?: string | null;
  safetyChecks?: Array<{ label: string; value: PoolSafetyCheck["value"]; notes?: string | null; sortOrder?: number }>;
  chemicalAdditions?: Array<{ chemicalId?: string | null; chemicalName: string; amount: number; unit: PoolChemical["unit"]; notes?: string | null }>;
}) {
  return request<{ entry: PoolLogEntry }>("/pool/entries", { method: "POST", body: JSON.stringify(input) });
}

export function poolLogExportCsvUrl(filters: { propertyId?: string; from?: string; to?: string } = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, String(value));
  });
  return `${apiBaseUrl}/pool/export.csv${params.toString() ? `?${params.toString()}` : ""}`;
}

export function poolLogPrintableReportUrl(filters: { propertyId?: string; from?: string; to?: string } = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, String(value));
  });
  return `${apiBaseUrl}/pool/report.pdf${params.toString() ? `?${params.toString()}` : ""}`;
}

export function uploadPoolLogAttachment(entryId: string, file: File) {
  const data = new FormData();
  data.append("file", file);
  return request<{ attachment: PoolLogAttachment }>(`/pool/entries/${entryId}/attachments`, { method: "POST", body: data });
}

export function poolAttachmentDownloadUrl(id: string) {
  return `${apiBaseUrl}/pool/attachments/${encodeURIComponent(id)}/download`;
}

export function deletePoolLogAttachment(id: string) {
  return request<{ ok: true }>(`/pool/attachments/${id}`, { method: "DELETE" });
}

export function getPreventiveMaintenanceOverview(propertyId?: string) {
  const params = new URLSearchParams();
  if (propertyId) params.set("propertyId", propertyId);
  return request<PreventiveMaintenanceOverviewResponse>(`/pm/overview${params.toString() ? `?${params.toString()}` : ""}`);
}

export function getPreventiveMaintenanceTemplates(filters: { propertyId?: string; includeArchived?: boolean } = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  return request<{ templates: PreventiveMaintenanceTemplate[]; permissions: { view: boolean; edit: boolean; admin: boolean } }>(`/pm/templates${params.toString() ? `?${params.toString()}` : ""}`);
}

export function createPreventiveMaintenanceTemplate(input: {
  propertyId: string;
  name: string;
  category: PreventiveMaintenanceCategory;
  description?: string | null;
  instructions?: string | null;
  frequency: PreventiveMaintenanceFrequency;
  customEveryDays?: number | null;
  annualMonth?: number | null;
  annualDay?: number | null;
  assignedRole: UserRole;
  assignedUserId?: string | null;
  photosRequired?: boolean;
  notesRequired?: boolean;
  passFailRequired?: boolean;
  priority?: PreventiveMaintenancePriority;
  isActive?: boolean;
  isArchived?: boolean;
}) {
  return request<{ template: PreventiveMaintenanceTemplate }>("/pm/templates", { method: "POST", body: JSON.stringify(input) });
}

export function updatePreventiveMaintenanceTemplate(id: string, input: Partial<Parameters<typeof createPreventiveMaintenanceTemplate>[0]>) {
  return request<{ template: PreventiveMaintenanceTemplate }>(`/pm/templates/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function getPreventiveMaintenanceTasks(filters: {
  propertyId?: string;
  category?: PreventiveMaintenanceCategory;
  status?: PreventiveMaintenanceStatus;
  priority?: PreventiveMaintenancePriority;
  assignedRole?: UserRole;
  from?: string;
  to?: string;
  q?: string;
  limit?: number;
  offset?: number;
} = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  return request<{ tasks: PreventiveMaintenanceTask[]; pagination: { total: number; limit: number; offset: number; hasMore: boolean } }>(`/pm/tasks${params.toString() ? `?${params.toString()}` : ""}`);
}

export function getPreventiveMaintenanceCalendar(filters: { propertyId?: string; from?: string; to?: string } = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, String(value));
  });
  return request<{ tasks: PreventiveMaintenanceTask[]; from: string; to: string }>(`/pm/calendar${params.toString() ? `?${params.toString()}` : ""}`);
}

export function getPreventiveMaintenanceHistory(filters: {
  propertyId?: string;
  category?: PreventiveMaintenanceCategory;
  status?: PreventiveMaintenanceStatus;
  priority?: PreventiveMaintenancePriority;
  assignedRole?: UserRole;
  from?: string;
  to?: string;
  q?: string;
  completedById?: string;
  limit?: number;
  offset?: number;
} = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  return request<{ tasks: PreventiveMaintenanceTask[]; pagination: { total: number; limit: number; offset: number; hasMore: boolean } }>(`/pm/history${params.toString() ? `?${params.toString()}` : ""}`);
}

export function completePreventiveMaintenanceTask(id: string, input: { outcome: "PASS" | "FAIL" | "COMPLETE"; notes?: string | null }) {
  return request<{ task: PreventiveMaintenanceTask }>(`/pm/tasks/${encodeURIComponent(id)}/complete`, { method: "POST", body: JSON.stringify(input) });
}

export function skipPreventiveMaintenanceTask(id: string, input: { notes?: string | null }) {
  return request<{ task: PreventiveMaintenanceTask }>(`/pm/tasks/${encodeURIComponent(id)}/skip`, { method: "POST", body: JSON.stringify(input) });
}

export function uploadPreventiveMaintenanceAttachment(taskId: string, file: File) {
  const data = new FormData();
  data.append("file", file);
  return request<{ attachment: PreventiveMaintenanceTaskAttachment }>(`/pm/tasks/${encodeURIComponent(taskId)}/attachments`, { method: "POST", body: data });
}

export function preventiveMaintenanceAttachmentDownloadUrl(id: string) {
  return `${apiBaseUrl}/pm/attachments/${encodeURIComponent(id)}/download`;
}

export function preventiveMaintenanceExportCsvUrl(filters: Record<string, string | undefined> = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return `${apiBaseUrl}/pm/export.csv${params.toString() ? `?${params.toString()}` : ""}`;
}

export function preventiveMaintenanceExportExcelUrl(filters: Record<string, string | undefined> = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return `${apiBaseUrl}/pm/export.xls${params.toString() ? `?${params.toString()}` : ""}`;
}

export function preventiveMaintenancePrintableReportUrl(filters: Record<string, string | undefined> = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return `${apiBaseUrl}/pm/report.pdf${params.toString() ? `?${params.toString()}` : ""}`;
}

export function getPropertyWikiOverview(propertyId?: string) {
  const params = new URLSearchParams();
  if (propertyId) params.set("propertyId", propertyId);
  return request<PropertyWikiOverviewResponse>(`/property-wiki/overview${params.toString() ? `?${params.toString()}` : ""}`);
}

export function getPropertyWikiProfile(propertyId: string) {
  return request<{ profile: PropertyWikiProfile | null; property: Property | null }>(`/property-wiki/profile?propertyId=${encodeURIComponent(propertyId)}`);
}

export function savePropertyWikiProfile(input: {
  propertyId: string;
  address?: string | null;
  unitCount?: number | null;
  buildingCount?: number | null;
  officePhone?: string | null;
  afterHoursPhone?: string | null;
  propertyManager?: string | null;
  maintenanceSupervisor?: string | null;
  regionalManager?: string | null;
  generalNotes?: string | null;
}) {
  return request<{ profile: PropertyWikiProfile }>("/property-wiki/profile", { method: "PATCH", body: JSON.stringify(input) });
}

export function getPropertyWikiEntries(filters: { propertyId?: string; section?: PropertyWikiSection; includeInactive?: boolean; q?: string } = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  return request<{ entries: PropertyWikiEntry[] }>(`/property-wiki/entries${params.toString() ? `?${params.toString()}` : ""}`);
}

export function createPropertyWikiEntry(input: {
  propertyId: string;
  section: PropertyWikiSection;
  title: string;
  category?: string | null;
  building?: string | null;
  locationDescription?: string | null;
  equipmentModel?: string | null;
  manufacturer?: string | null;
  serialNumber?: string | null;
  installDate?: string | null;
  warrantyExpiresAt?: string | null;
  floorPlan?: string | null;
  unitType?: string | null;
  blindSizes?: string | null;
  hvacNotes?: string | null;
  waterHeaterNotes?: string | null;
  applianceNotes?: string | null;
  paintStandards?: string | null;
  countertopNotes?: string | null;
  cabinetNotes?: string | null;
  flooringNotes?: string | null;
  contactType?: string | null;
  contactTitle?: string | null;
  phone?: string | null;
  email?: string | null;
  isEmergencyContact?: boolean;
  relatedEntryIds?: string[] | string;
  relatedVendorIds?: string[] | string;
  notes?: string | null;
  content?: string | null;
  issueStatus?: "Active" | "Resolved" | "Archived" | null;
  tags?: string[] | string;
  contacts?: string | null;
  situation?: string | null;
  poolCapacity?: string | null;
  spaCapacity?: string | null;
  pumpModels?: string | null;
  filterModels?: string | null;
  filterSizes?: string | null;
  heaterModels?: string | null;
  controllerNotes?: string | null;
  chemicalTargetNotes?: string | null;
  isPinned?: boolean;
  isEmergency?: boolean;
  isActive?: boolean;
}) {
  return request<{ entry: PropertyWikiEntry }>("/property-wiki/entries", { method: "POST", body: JSON.stringify(input) });
}

export function updatePropertyWikiEntry(id: string, input: Partial<Parameters<typeof createPropertyWikiEntry>[0]>) {
  return request<{ entry: PropertyWikiEntry }>(`/property-wiki/entries/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function getPropertyWikiVendors(filters: { propertyId?: string; includeInactive?: boolean; q?: string } = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  return request<{ vendors: PropertyWikiVendor[] }>(`/property-wiki/vendors${params.toString() ? `?${params.toString()}` : ""}`);
}

export function createPropertyWikiVendor(input: {
  propertyId: string;
  vendorType: string;
  companyName: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  emergencyPhone?: string | null;
  notes?: string | null;
  isActive?: boolean;
}) {
  return request<{ vendor: PropertyWikiVendor }>("/property-wiki/vendors", { method: "POST", body: JSON.stringify(input) });
}

export function updatePropertyWikiVendor(id: string, input: Partial<Parameters<typeof createPropertyWikiVendor>[0]>) {
  return request<{ vendor: PropertyWikiVendor }>(`/property-wiki/vendors/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function getPropertyWikiAssets(filters: { propertyId?: string; kind?: PropertyWikiAssetKind; entryId?: string; vendorId?: string; q?: string } = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  return request<{ assets: PropertyWikiAsset[] }>(`/property-wiki/assets${params.toString() ? `?${params.toString()}` : ""}`);
}

export function uploadPropertyWikiAsset(input: {
  propertyId: string;
  kind: PropertyWikiAssetKind;
  title: string;
  category?: string | null;
  building?: string | null;
  description?: string | null;
  tags?: string[] | string;
  isEmergency?: boolean;
  entryId?: string | null;
  vendorId?: string | null;
  file: File;
}) {
  const data = new FormData();
  data.append("propertyId", input.propertyId);
  data.append("kind", input.kind);
  data.append("title", input.title);
  if (input.category) data.append("category", input.category);
  if (input.building) data.append("building", input.building);
  if (input.description) data.append("description", input.description);
  if (input.isEmergency !== undefined) data.append("isEmergency", String(input.isEmergency));
  if (input.entryId) data.append("entryId", input.entryId);
  if (input.vendorId) data.append("vendorId", input.vendorId);
  if (input.tags) data.append("tags", Array.isArray(input.tags) ? input.tags.join(", ") : input.tags);
  data.append("file", input.file);
  return request<{ asset: PropertyWikiAsset }>("/property-wiki/assets/upload", { method: "POST", body: data });
}

export function updatePropertyWikiAsset(id: string, input: { title?: string; category?: string | null; building?: string | null; description?: string | null; tags?: string[] | string; isEmergency?: boolean }) {
  return request<{ asset: PropertyWikiAsset }>(`/property-wiki/assets/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function propertyWikiAssetDownloadUrl(id: string) {
  return `${apiBaseUrl}/property-wiki/assets/${encodeURIComponent(id)}/download`;
}

export function deletePropertyWikiAsset(id: string) {
  return request<{ ok: true }>(`/property-wiki/assets/${id}`, { method: "DELETE" });
}

export function searchPropertyWiki(input: { propertyId?: string; q: string }) {
  const params = new URLSearchParams();
  if (input.propertyId) params.set("propertyId", input.propertyId);
  params.set("q", input.q);
  return request<{ results: PropertyWikiSearchResult[] }>(`/property-wiki/search?${params.toString()}`);
}

export function togglePropertyWikiFavorite(input: { targetType: PropertyWikiTargetType; targetId: string }) {
  return request<{ favorited: boolean }>("/property-wiki/favorites/toggle", { method: "POST", body: JSON.stringify(input) });
}

export function getPropertyWikiRecord(targetType: PropertyWikiTargetType, id: string) {
  return request<PropertyWikiRecordDetail>(`/property-wiki/records/${encodeURIComponent(targetType)}/${encodeURIComponent(id)}`);
}

export function getPropertyWikiWorkflowContext(input: {
  module: PropertyWikiWorkflowModule;
  propertyId?: string;
  recordType?: PropertyWikiWorkflowRecordType;
  recordId?: string;
  floorPlan?: string | null;
  unitNumber?: string | null;
  building?: string | null;
  facilityName?: string | null;
  equipmentQuery?: string | null;
  query?: string | null;
}) {
  const params = new URLSearchParams();
  Object.entries(input).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  return request<PropertyWikiWorkflowContext>(`/property-wiki/context?${params.toString()}`);
}

export function attachPropertyWikiReference(input: {
  recordType: PropertyWikiWorkflowRecordType;
  recordId: string;
  targetType: PropertyWikiTargetType;
  targetId: string;
}) {
  return request<{ reference: { id: string } }>("/property-wiki/references", { method: "POST", body: JSON.stringify(input) });
}

export function deletePropertyWikiReference(id: string) {
  return request<{ ok: true }>(`/property-wiki/references/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function getVendorAssignments(filters: { itemId?: string; propertyId?: string; vendorId?: string; status?: VendorAssignment["status"]; includeCompleted?: boolean; limit?: number; offset?: number } = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  return request<{ assignments: VendorAssignment[]; pagination: { total: number; limit: number; offset: number; hasMore: boolean } }>(`/vendor-assignments${params.toString() ? `?${params.toString()}` : ""}`);
}

export function getPlanning(filters: { propertyId?: string; assignedUserId?: string; from?: string; to?: string } = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, String(value));
  });
  return request<PlanningResponse>(`/planning${params.toString() ? `?${params.toString()}` : ""}`);
}

export function createWorkAssignmentBlock(input: {
  assignedUserId: string;
  itemId: string;
  category: string;
  plannedDate: string;
  estimatedHours: number;
  actualHours?: number | null;
  status?: WorkAssignmentBlock["status"];
  notes?: string | null;
}) {
  return request<{ block: WorkAssignmentBlock }>("/planning/blocks", { method: "POST", body: JSON.stringify(input) });
}

export function updateWorkAssignmentBlock(id: string, input: Partial<Parameters<typeof createWorkAssignmentBlock>[0]>) {
  return request<{ block: WorkAssignmentBlock }>(`/planning/blocks/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function updateUserCapacity(userId: string, input: { defaultDailyHours: number; tradeCategories?: string[]; unavailableDays?: string[] }) {
  return request<{ capacity: UserCapacity }>(`/planning/capacities/${userId}`, { method: "PUT", body: JSON.stringify(input) });
}

export function createVendorAssignment(input: {
  vendorId: string;
  itemId: string;
  trade: string;
  status?: VendorAssignment["status"];
  scheduledDate?: string | null;
  dueDate?: string | null;
  notes?: string | null;
  costEstimate?: number | null;
  invoiceRef?: string | null;
}) {
  return request<{ assignment: VendorAssignment }>("/vendor-assignments", { method: "POST", body: JSON.stringify(input) });
}

export function updateVendorAssignment(id: string, input: Partial<Omit<Parameters<typeof createVendorAssignment>[0], "itemId">> & { completedAt?: string | null }) {
  return request<{ assignment: VendorAssignment }>(`/vendor-assignments/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function completeVendorAssignment(id: string) {
  return request<{ assignment: VendorAssignment }>(`/vendor-assignments/${id}/complete`, { method: "POST" });
}

export function cancelVendorAssignment(id: string) {
  return request<{ assignment: VendorAssignment }>(`/vendor-assignments/${id}/cancel`, { method: "POST" });
}

export function getPropertyMaps(filters: { propertyId?: string; includeArchived?: boolean } = {}) {
  const params = new URLSearchParams();
  if (filters.propertyId) params.set("propertyId", filters.propertyId);
  if (filters.includeArchived !== undefined) params.set("includeArchived", String(filters.includeArchived));
  return request<{ maps: PropertyMap[] }>(`/property-maps${params.toString() ? `?${params.toString()}` : ""}`);
}

export function createPropertyMap(input: { propertyId: string; name: string; mapType?: string; description?: string | null; notes?: string | null; width?: number | null; height?: number | null; isDefault?: boolean }) {
  return request<{ map: PropertyMap }>("/property-maps", { method: "POST", body: JSON.stringify(input) });
}

export function updatePropertyMap(id: string, input: Partial<{ name: string; mapType: string; description: string | null; notes: string | null; width: number | null; height: number | null; isDefault: boolean; isActive: boolean }>) {
  return request<{ map: PropertyMap }>(`/property-maps/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function archivePropertyMap(id: string, restore = false) {
  return request<{ map: PropertyMap }>(`/property-maps/${id}/${restore ? "restore" : "archive"}`, { method: "POST" });
}

export function uploadPropertyMap(id: string, file: File) {
  const data = new FormData();
  data.append("file", file);
  return request<{ map: PropertyMap }>(`/property-maps/${id}/upload`, { method: "POST", body: data });
}

export function propertyMapFileUrl(id: string) {
  return `${apiBaseUrl}/property-maps/${encodeURIComponent(id)}/file`;
}

export function getPropertyMapPins(filters: { propertyId?: string; mapId?: string; includeArchived?: boolean; emergencyOnly?: boolean; q?: string; pinTypes?: string[] } = {}) {
  const params = new URLSearchParams();
  if (filters.propertyId) params.set("propertyId", filters.propertyId);
  if (filters.mapId) params.set("mapId", filters.mapId);
  if (filters.includeArchived !== undefined) params.set("includeArchived", String(filters.includeArchived));
  if (filters.emergencyOnly !== undefined) params.set("emergencyOnly", String(filters.emergencyOnly));
  if (filters.q) params.set("q", filters.q);
  if (filters.pinTypes?.length) params.set("pinTypes", filters.pinTypes.join(","));
  return request<{ pins: PropertyMapPin[] }>(`/property-map-pins${params.toString() ? `?${params.toString()}` : ""}`);
}

export function createPropertyMapPin(input: {
  propertyId: string;
  mapId: string;
  title: string;
  pinType: string;
  xPercent: number;
  yPercent: number;
  building?: string | null;
  unitLabel?: string | null;
  area?: string | null;
  description?: string | null;
  linkedRecordType?: string | null;
  linkedRecordId?: string | null;
  tags?: string[];
  isEmergency?: boolean;
}) {
  return request<{ pin: PropertyMapPin }>("/property-map-pins", { method: "POST", body: JSON.stringify(input) });
}

export function updatePropertyMapPin(id: string, input: Partial<Omit<Parameters<typeof createPropertyMapPin>[0], "propertyId" | "mapId">> & { isActive?: boolean; isArchived?: boolean }) {
  return request<{ pin: PropertyMapPin }>(`/property-map-pins/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function removePropertyMapPin(id: string) {
  return request<{ pin: PropertyMapPin }>(`/property-map-pins/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function uploadPropertyMapPinAttachment(pinId: string, file: File, caption?: string) {
  const data = new FormData();
  data.append("file", file);
  if (caption) data.append("caption", caption);
  return request<{ attachment: PropertyMapPin["attachments"][number] }>(`/property-map-pins/${encodeURIComponent(pinId)}/attachments`, { method: "POST", body: data });
}

export function propertyMapPinAttachmentDownloadUrl(id: string) {
  return `${apiBaseUrl}/property-map-pin-attachments/${encodeURIComponent(id)}/download`;
}

export function deletePropertyMapPinAttachment(id: string) {
  return request<{ ok: true }>(`/property-map-pin-attachments/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function propertyMapExportCsvUrl(id: string) {
  return `${apiBaseUrl}/property-maps/${encodeURIComponent(id)}/export.csv`;
}

export function propertyMapExportXlsUrl(id: string) {
  return `${apiBaseUrl}/property-maps/${encodeURIComponent(id)}/export.xls`;
}

export function propertyMapPrintableReportUrl(id: string) {
  return `${apiBaseUrl}/property-maps/${encodeURIComponent(id)}/report.pdf`;
}

export function getUnitMapLocations(filters: { propertyId?: string; mapId?: string; includeArchived?: boolean } = {}) {
  const params = new URLSearchParams();
  if (filters.propertyId) params.set("propertyId", filters.propertyId);
  if (filters.mapId) params.set("mapId", filters.mapId);
  if (filters.includeArchived !== undefined) params.set("includeArchived", String(filters.includeArchived));
  return request<{ locations: UnitMapLocation[] }>(`/unit-map-locations${params.toString() ? `?${params.toString()}` : ""}`);
}

export function getPropertyMapAreas(filters: { propertyId?: string; mapId?: string; includeArchived?: boolean } = {}) {
  const params = new URLSearchParams();
  if (filters.propertyId) params.set("propertyId", filters.propertyId);
  if (filters.mapId) params.set("mapId", filters.mapId);
  if (filters.includeArchived !== undefined) params.set("includeArchived", String(filters.includeArchived));
  return request<{ areas: PropertyMapArea[] }>(`/property-map-areas${params.toString() ? `?${params.toString()}` : ""}`);
}

export function createPropertyMapArea(input: {
  propertyId: string;
  mapId: string;
  name: string;
  areaType?: string;
  xPercent: number;
  yPercent: number;
  widthPercent?: number | null;
  heightPercent?: number | null;
  color?: string | null;
  expectedUnitCount?: number | null;
  notes?: string | null;
}) {
  return request<{ area: PropertyMapArea }>("/property-map-areas", { method: "POST", body: JSON.stringify(input) });
}

export function updatePropertyMapArea(id: string, input: Partial<Omit<Parameters<typeof createPropertyMapArea>[0], "propertyId" | "mapId">> & { isActive?: boolean; isArchived?: boolean }) {
  return request<{ area: PropertyMapArea }>(`/property-map-areas/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function removePropertyMapArea(id: string) {
  return request<{ area: PropertyMapArea }>(`/property-map-areas/${id}`, { method: "DELETE" });
}

export function saveUnitMapLocation(input: {
  propertyId: string;
  unitId: string;
  mapId: string;
  xPercent: number;
  yPercent: number;
  labelXPercent?: number | null;
  labelYPercent?: number | null;
  building?: string | null;
  area?: string | null;
  floor?: string | null;
}) {
  return request<{ location: UnitMapLocation }>("/unit-map-locations", { method: "PUT", body: JSON.stringify(input) });
}

export function updateUnitMapLocation(id: string, input: Partial<Parameters<typeof saveUnitMapLocation>[0]>) {
  return request<{ location: UnitMapLocation }>(`/unit-map-locations/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function removeUnitMapLocation(id: string) {
  return request<{ location: UnitMapLocation }>(`/unit-map-locations/${id}`, { method: "DELETE" });
}

export function getIntegrations() {
  return request<IntegrationsResponse>("/admin/integrations");
}

export function createApiToken(input: { name: string; scopes: ApiTokenScope[]; propertyIds: string[] }) {
  return request<{ apiToken: ApiTokenRecord; token: string }>("/admin/integrations/api-tokens", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function revokeApiToken(id: string) {
  return request<{ apiToken: ApiTokenRecord }>(`/admin/integrations/api-tokens/${id}/revoke`, { method: "POST" });
}

export function createWebhook(input: { name: string; url: string; eventTypes: WebhookEventType[]; propertyIds: string[] }) {
  return request<{ webhook: WebhookEndpointRecord; secret: string }>("/admin/integrations/webhooks", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateWebhook(id: string, input: Partial<{ name: string; url: string; eventTypes: WebhookEventType[]; isEnabled: boolean; propertyIds: string[] }>) {
  return request<{ webhook: WebhookEndpointRecord }>(`/admin/integrations/webhooks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function revokeWebhook(id: string) {
  return request<{ webhook: WebhookEndpointRecord }>(`/admin/integrations/webhooks/${id}/revoke`, { method: "POST" });
}

export function getWebhookDeliveries(id: string, input: { limit?: number; offset?: number } = {}) {
  const params = new URLSearchParams({
    limit: String(input.limit ?? 10),
    offset: String(input.offset ?? 0),
  });
  return request<{
    deliveries: WebhookDeliveryAttempt[];
    pagination: { total: number; limit: number; offset: number; hasMore: boolean };
  }>(`/admin/integrations/webhooks/${id}/deliveries?${params.toString()}`);
}

export function getWebhookHealth(id: string) {
  return request<WebhookHealthResponse>(`/admin/integrations/webhooks/${id}/health`);
}

export function createWebhookTestPayload(id: string, input: { eventType?: WebhookEventType; enqueue?: boolean }) {
  return request<{ webhook: WebhookEndpointRecord; delivery: WebhookDeliveryAttempt; notice: string }>(
    `/admin/integrations/webhooks/${id}/test-payload`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}
