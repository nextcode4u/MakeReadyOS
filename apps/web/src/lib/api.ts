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

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export type UserRole = "ADMIN" | "MANAGER" | "TECH" | "LEASING" | "CLEANER" | "VIEWER";
export type CustomFieldType = "TEXT" | "LONG_TEXT" | "NUMBER" | "DATE" | "SINGLE_SELECT" | "MULTI_SELECT" | "BOOLEAN" | "USER";

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
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
  lastUsedAt: string | null;
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
  | "checklist.completed";

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
  rule: Pick<AutomationRule, "id" | "name" | "triggerType">;
  item: { id: string; unitNumber: string; property: Property } | null;
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
    proposedActions: Array<{ type: string; summary: string; proposedValue?: unknown }>;
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
  occupancyStatus: "OCCUPIED" | "VACANT_READY" | "VACANT_LEASED" | "VACANT_NOT_LEASED" | "NTV" | "NTV_LEASED" | "DOWN" | "MODEL" | "UNKNOWN";
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
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  notes: string | null;
  isActive: boolean;
  isArchived: boolean;
  property: Property;
  _count?: { locations: number };
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
    try {
      const body = (await response.json()) as { message?: string };
      if (body.message) {
        message = body.message;
      }
    } catch {
      // Ignore JSON parsing errors for non-JSON failures.
    }

    if (response.status === 401) {
      csrfToken = null;
    }

    throw new ApiError(response.status, message);
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
  return request<{ summary: { created: number; updated: number; skipped: number; errors: string[] } }>("/operations/units/import", {
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

export function createPropertyMap(input: { propertyId: string; name: string; notes?: string | null; width?: number | null; height?: number | null }) {
  return request<{ map: PropertyMap }>("/property-maps", { method: "POST", body: JSON.stringify(input) });
}

export function updatePropertyMap(id: string, input: Partial<{ name: string; notes: string | null; width: number | null; height: number | null; isActive: boolean }>) {
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
