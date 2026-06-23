import { lazy, Suspense, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActiveFilterBar } from "./components/ActiveFilterBar";
import { BoardTable } from "./components/BoardTable";
import { CommandPalette, type CommandPaletteWorkspaceGroup } from "./components/CommandPalette";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { FilterBar, type ThemeMode } from "./components/FilterBar";
import { LoginScreen } from "./components/LoginScreen";
import { Modal } from "./components/Modal";
import { NotificationDrawer } from "./components/NotificationDrawer";
import { OnboardingPanel } from "./components/OnboardingPanel";
import { PWAInstallPrompt } from "./components/PWAInstallPrompt";
import { StatusState } from "./components/StatusState";
import { ToastItem, ToastViewport } from "./components/ToastViewport";
import {
  enqueueMakeReadyPatch,
  getOfflineSyncEventName,
  getOfflineSyncJob,
  listOfflineSyncJobs,
  getOfflineSyncPendingCount,
  removeOfflineSyncJob,
  retryOfflineSyncJob,
  type OfflineSyncJob,
  type OfflineSyncJobSummary,
  syncOfflineJobs,
} from "./lib/offlineSync";
import {
  createAdminUser,
  createAutomation,
  createCustomField,
  createSavedView,
  createMakeReadyItem,
  createProperty,
  createUnit,
  createBoardOption,
  createFloorPlan,
  createScheduleTrack,
  createVendor,
  createVendorAssignment,
  createPropertyMap,
  createPropertyTemplateFromProperty,
  deletePropertyTemplate,
  importAvailability,
  importUnits,
  revertUnitImport,
  archiveMakeReadyItem,
  archiveProperty,
  archiveUnit,
  archiveBoardOption,
  archiveFloorPlan,
  archiveScheduleTrack,
  archiveSavedView,
  archiveCustomField,
  restoreCustomField,
  restoreSavedView,
  trashCustomField,
  permanentlyDeleteCustomField,
  archiveAutomation,
  archiveVendor,
  archivePropertyMap,
  archivePropertyTemplate,
  CurrentUser,
  deletePropertyMap,
  deleteProperty,
  deleteSavedView,
  deleteUnit,
  deactivateAdminUser,
  getAdminProperties,
  getAdminUsers,
  getAnalyticsSummary,
  getAutomations,
  getAutomationTemplates,
  getOperationalLibraryPacks,
  getAutomationRuns,
  getCurrentUser,
  getCustomFields,
  getDashboard,
  getItemCollaboration,
  getLeaseComplianceIssues,
  getMakeReadyItem,
  getMakeReadyItemPage,
  getPoolEntries,
  getProjectRecords,
  getProjectRecord,
  type ChecklistInstance,
  type ItemCollaboration,
  MakeReadyItem,
  MakeReadyItemsPage,
  ManagedUser,
  getMeta,
  getNotifications,
  getMyWork,
  getPlanning,
  getPestIssues,
  getPreventiveMaintenanceHistory,
  getPreventiveMaintenanceTasks,
  type PreventiveMaintenanceTask,
  type PoolLogEntry,
  type ProjectRecord,
  getRiskPolicies,
  getOperationsProperties,
  getOperationsUnits,
  getBoardOptions,
  getFloorPlans,
  getScheduleTracks,
  getOperatingCalendars,
  getSavedViews,
  getVendors,
  getVendorAssignments,
  getPropertyMaps,
  getPropertyTemplates,
  getUnitMapLocations,
  getPropertyMapAreas,
  login,
  logout,
  installAutomationTemplate,
  installOperationalLibraryPack,
  markMakeReadyItemReady,
  patchMakeReadyItem,
  previewAutomation,
  previewOperationalLibraryPack,
  type OperationalLibraryPreviewResponse,
  previewPropertyTemplateFromProperty,
  runAutomationNow,
  reorderCustomFields,
  restorePropertyTemplate,
  resetAdminUserPassword,
  SavedView,
  AutomationPreviewResponse,
  isApiError,
  updateAdminUser,
  updateAdminUserPropertyAccess,
  updateCurrentUserPreferences,
  toggleAutomation,
  updateAutomation,
  updateCustomField,
  updateCustomFieldValue,
  updateProperty,
  updateSavedView,
  updateUnit,
  updateBoardOption,
  updateFloorPlan,
  updateBoardColumn,
  updateBoardSection,
  updateScheduleTrack,
  updateOperatingCalendar,
  updateRiskPolicy,
  reorderBoardOptions,
  reorderScheduleTracks,
  batchMakeReadyItems,
  restoreMakeReadyItem,
  restoreProperty,
  restoreUnit,
  markAllNotificationsRead,
  markNotificationRead,
  dismissNotification,
  updateNotificationSettings,
  updateNotificationPreference,
  updateVendorAssignment,
  uploadPropertyMap,
  saveUnitMapLocation,
  removeUnitMapLocation,
  createPropertyMapArea,
  updatePropertyMapArea,
  removePropertyMapArea,
  createWorkAssignmentBlock,
  updateWorkAssignmentBlock,
  applyPropertyTemplate,
  type LeaseComplianceIssue,
  type MetaResponse,
  type PestIssue,
  type PropertyMap,
} from "./lib/api";
import { configuredScheduleTracks, kanbanGroupOptions, labelMap, normalizeVisibleColumns, tableColumnPresets, visibleColumnOptions } from "./lib/board";
import { clockModeStorageKey, type ClockMode } from "./lib/dateTime";
import { t, tWithVars } from "./lib/i18n";
import { customFieldFilterChipLabel, customOperatorsByType, defaultCustomFilterFor, defaultStructuredFilters, itemMatchesStructuredFilters, normalizeCustomFieldFilters, type CustomFieldFilter, type StructuredFilters } from "./lib/structuredFilters";
import { openWikiRecordEventName, type OpenWikiRecordRequest } from "./lib/wikiNavigation";
import { openProjectCreateEventName, openProjectRecordEventName, type OpenProjectCreateRequest, type OpenProjectRecordRequest } from "./lib/projectNavigation";
import { openPestQuickAddEventName, openPestWorkspaceEventName, type OpenPestQuickAddRequest, type OpenPestWorkspaceRequest } from "./lib/pestNavigation";
import { openLeaseQuickAddEventName, openLeaseWorkspaceEventName, type OpenLeaseQuickAddRequest, type OpenLeaseWorkspaceRequest } from "./lib/leaseNavigation";
import { isTouchMobileViewport } from "./lib/responsive";

const AdminPanel = lazy(() => import("./components/AdminPanel").then((module) => ({ default: module.AdminPanel })));
const ActivityPanel = lazy(() => import("./components/ActivityPanel").then((module) => ({ default: module.ActivityPanel })));
const AutomationPanel = lazy(() => import("./components/AutomationPanel").then((module) => ({ default: module.AutomationPanel })));
const BoardConfigurationPanel = lazy(() => import("./components/BoardConfigurationPanel").then((module) => ({ default: module.BoardConfigurationPanel })));
const CalendarView = lazy(() => import("./components/CalendarView").then((module) => ({ default: module.CalendarView })));
const CustomFieldsPanel = lazy(() => import("./components/CustomFieldsPanel").then((module) => ({ default: module.CustomFieldsPanel })));
const DashboardPanel = lazy(() => import("./components/DashboardPanel").then((module) => ({ default: module.DashboardPanel })));
const FrogPondPanel = lazy(() => import("./components/FrogPondPanel").then((module) => ({ default: module.FrogPondPanel })));
const ItemDrawer = lazy(() => import("./components/ItemDrawer").then((module) => ({ default: module.ItemDrawer })));
const KanbanBoard = lazy(() => import("./components/KanbanBoard").then((module) => ({ default: module.KanbanBoard })));
const MyWorkPanel = lazy(() => import("./components/MyWorkPanel").then((module) => ({ default: module.MyWorkPanel })));
const OperationsPanel = lazy(() => import("./components/OperationsPanel").then((module) => ({ default: module.OperationsPanel })));
const PlanningPanel = lazy(() => import("./components/PlanningPanel").then((module) => ({ default: module.PlanningPanel })));
const PreventiveMaintenancePanel = lazy(() => import("./components/PreventiveMaintenancePanel").then((module) => ({ default: module.PreventiveMaintenancePanel })));
const PoolLogPanel = lazy(() => import("./components/PoolLogPanel").then((module) => ({ default: module.PoolLogPanel })));
const PestControlPanel = lazy(() => import("./components/PestControlPanel").then((module) => ({ default: module.PestControlPanel })));
const LeaseCompliancePanel = lazy(() => import("./components/LeaseCompliancePanel").then((module) => ({ default: module.LeaseCompliancePanel })));
const PropertyWikiPanel = lazy(() => import("./components/PropertyWikiPanel").then((module) => ({ default: module.PropertyWikiPanel })));
const PropertyMapsPanel = lazy(() => import("./components/PropertyMapsPanel").then((module) => ({ default: module.PropertyMapsPanel })));
const ProjectsPanel = lazy(() => import("./components/ProjectsPanel").then((module) => ({ default: module.ProjectsPanel })));
const RefrigerantPanel = lazy(() => import("./components/RefrigerantPanel").then((module) => ({ default: module.RefrigerantPanel })));
const VendorsPanel = lazy(() => import("./components/VendorsPanel").then((module) => ({ default: module.VendorsPanel })));

type AppView = "dashboard" | "mywork" | "planning" | "table" | "kanban" | "calendar" | "maps" | "pond" | "operations" | "vendors" | "refrigerant" | "pool" | "pest" | "lease" | "pm" | "projects" | "wiki" | "fields" | "automations" | "activity" | "admin";
type KanbanGroupKey = string;
type NavigationHistoryState = { view?: AppView; selectedItemId?: string | null };
type DashboardDrilldownContext = {
  label: string;
  savedViewName: string;
};
const compactModeStorageKey = "makereadyos.compactMode";
const themeModeStorageKey = "makereadyos.themeMode";
const eyeStrainModeStorageKey = "makereadyos.eyeStrainMode";
const dyslexiaModeStorageKey = "makereadyos.dyslexiaMode";
const onboardingSkippedStorageKey = "makereadyos.onboardingSkipped";
const boardWindowedModeStorageKey = "makereadyos.boardWindowedMode";
const boardWindowLimitStorageKey = "makereadyos.boardWindowLimit";
const metaCacheStorageKey = "makereadyos.meta-cache";
const boardWindowPageSize = 250;
const serverSortableItemFields = new Set([
  "boardGroup",
  "unitNumber",
  "moveInDate",
  "makeReadyDate",
  "vacatedDate",
  "flooringDate",
  "daysVacant",
  "riskScore",
  "riskLevel",
  "assignedTech",
  "updatedAt",
  "createdAt",
]);

function readCachedMeta() {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(metaCacheStorageKey);
    if (!raw) return undefined;
    return JSON.parse(raw) as MetaResponse;
  } catch {
    return undefined;
  }
}

function readStorageFlag(key: string) {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function readStorageValue(key: string) {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorageValue(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures.
  }
}

function removeStorageValue(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage failures.
  }
}

function writeCachedMeta(meta: MetaResponse) {
  writeStorageValue(metaCacheStorageKey, JSON.stringify(meta));
}

const techEditableFields = new Set([
  "assignedTech",
  "completionStatus",
  "sheetrockStatus",
  "pestStatus",
  "pestTreated",
  "trashOutStatus",
  "floorsStatus",
  "flooringDate",
  "makeReadyStatus",
  "cleaningStatus",
  "keysMadeStatus",
  "cabinetsStatus",
  "countertopsStatus",
  "appliancesStatus",
  "paintStatus",
  "doorsStatus",
  "notes",
]);
const leasingEditableFields = new Set([
  "applicant",
  "status",
  "vacancyStatus",
  "moveOutDate",
  "vacatedDate",
  "moveInDate",
  "daysUntilMoveIn",
  "notes",
]);
const cleanerEditableFields = new Set([
  "assignedTech",
  "completionStatus",
  "cleaningStatus",
  "makeReadyStatus",
  "notes",
]);

function compareValues(a: unknown, b: unknown, direction: "asc" | "desc") {
  const left = a ?? "";
  const right = b ?? "";
  const factor = direction === "asc" ? 1 : -1;

  if (typeof left === "number" && typeof right === "number") {
    return (left - right) * factor;
  }

  return String(left).localeCompare(String(right)) * factor;
}

function humanizeField(key: string) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (value) => value.toUpperCase())
    .trim();
}

function moduleRailMask(path: string) {
  return { "--icon-mask": `url("${path}")` } as React.CSSProperties;
}

function isAppView(value: unknown): value is AppView {
  return typeof value === "string" && [
    "dashboard", "mywork", "planning", "table", "kanban", "calendar", "maps", "pond", "operations", "vendors",
    "refrigerant", "pool", "pest", "lease", "pm", "projects", "wiki", "fields", "automations", "activity", "admin",
  ].includes(value);
}

function replaceAdminUser(users: ManagedUser[] | undefined, nextUser: ManagedUser) {
  if (!users) {
    return users;
  }
  return users.map((user) => (user.id === nextUser.id ? nextUser : user));
}

function offlineJobChangeSummary(job: OfflineSyncJob) {
  switch (job.payload.kind) {
    case "makeReadyPatch":
      return Object.entries(job.payload.data).map(([field, value]) => `${humanizeField(field)}: ${String(value ?? "-")}`);
    case "makeReadyUpload":
    case "poolUpload":
    case "pmUpload":
      return job.payload.files.map((file) => file.name);
    case "makeReadyCommentCreate":
    case "makeReadyCommentUpdate":
      return [job.payload.body];
    case "makeReadyCommentDelete":
      return [`Comment ID: ${job.payload.commentId}`];
    case "makeReadyChecklistAttach":
      return [`Checklist template ID: ${job.payload.templateId}`];
    case "makeReadyChecklistUpdate":
      return Object.entries(job.payload.input).map(([field, value]) => `${humanizeField(field)}: ${String(value ?? "-")}`);
    case "projectCreate":
      return [
        `Title: ${job.payload.input.title}`,
        `Type: ${job.payload.input.recordType}`,
        `Files: ${job.payload.files.map((file) => file.name).join(", ") || "-"}`,
      ];
    case "projectUpload":
      return job.payload.files.map((file) => `${file.name}${file.caption ? ` / ${file.caption}` : ""}`);
    case "leaseCreate":
      return [
        `Issue: ${job.payload.input.issueTypeName}`,
        `Location: ${job.payload.input.unitId || job.payload.input.area || job.payload.input.building || "-"}`,
        `Files: ${job.payload.files.map((file) => file.name).join(", ") || "-"}`,
      ];
    case "leaseUpload":
    case "pestUpload":
      return job.payload.files.map((file) => `${file.name}${"caption" in file && file.caption ? ` / ${file.caption}` : ""}`);
    case "pestCreate":
      return [
        `Pest: ${job.payload.input.pestType}`,
        `Location: ${job.payload.input.unitId || job.payload.input.area || "-"}`,
        `Priority: ${job.payload.input.priority}`,
      ];
    case "poolCreate":
      return [
        `Facility: ${job.payload.input.facilityId}`,
        `Date: ${job.payload.input.logDate}`,
        job.payload.input.notes ? `Notes: ${job.payload.input.notes}` : "Notes: -",
      ];
    case "pmComplete":
      return [
        `Outcome: ${job.payload.input.outcome}`,
        `Notes: ${job.payload.input.notes || "-"}`,
      ];
    case "pmSkip":
      return [`Notes: ${job.payload.input.notes || "-"}`];
    default:
      return [];
  }
}

function formatOfflineComparisonValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Empty";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.length ? value.map((entry) => formatOfflineComparisonValue(entry)).join(", ") : "Empty";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

type OfflineQueueComparisonRow = {
  field: string;
  queuedValue: string;
  serverValue: string;
  changed: boolean;
};

function comparisonRow(field: string, queuedValue: unknown, serverValue: unknown): OfflineQueueComparisonRow {
  return {
    field,
    queuedValue: formatOfflineComparisonValue(queuedValue),
    serverValue: formatOfflineComparisonValue(serverValue),
    changed: JSON.stringify(queuedValue ?? null) !== JSON.stringify(serverValue ?? null),
  };
}

type OfflineQueueUploadReview = {
  recordLabel: string;
  queuedFiles: string[];
  liveFiles: string[];
  duplicateFiles: string[];
};

function pickLikelyLeaseIssueMatch(
  issues: LeaseComplianceIssue[],
  payload: {
    propertyId: string;
    unitId?: string | null;
    issueTypeName?: string | null;
    additionalIssueType?: string | null;
    building?: string | null;
    area?: string | null;
  },
) {
  const normalizedIssueType = (payload.issueTypeName ?? "").trim().toLowerCase();
  const normalizedAdditionalType = (payload.additionalIssueType ?? "").trim().toLowerCase();
  const normalizedBuilding = (payload.building ?? "").trim().toLowerCase();
  const normalizedArea = (payload.area ?? "").trim().toLowerCase();
  return [...issues].sort((left, right) => {
    const score = (issue: LeaseComplianceIssue) => {
      let total = 0;
      if (payload.unitId && issue.unitId === payload.unitId) total += 6;
      if (normalizedIssueType && issue.issueTypeName.trim().toLowerCase() === normalizedIssueType) total += 4;
      if (normalizedAdditionalType && (issue.additionalIssueType ?? "").trim().toLowerCase() === normalizedAdditionalType) total += 2;
      if (normalizedBuilding && (issue.building ?? "").trim().toLowerCase() === normalizedBuilding) total += 2;
      if (normalizedArea && (issue.area ?? "").trim().toLowerCase() === normalizedArea) total += 2;
      return total;
    };
    const scoreDiff = score(right) - score(left);
    if (scoreDiff !== 0) return scoreDiff;
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  })[0] ?? null;
}

function pickLikelyPestIssueMatch(
  issues: PestIssue[],
  payload: {
    propertyId: string;
    unitId?: string | null;
    makeReadyItemId?: string | null;
    pestType?: string | null;
    additionalPestType?: string | null;
    area?: string | null;
  },
) {
  const normalizedPestType = (payload.pestType ?? "").trim().toLowerCase();
  const normalizedAdditionalType = (payload.additionalPestType ?? "").trim().toLowerCase();
  const normalizedArea = (payload.area ?? "").trim().toLowerCase();
  return [...issues].sort((left, right) => {
    const score = (issue: PestIssue) => {
      let total = 0;
      if (payload.makeReadyItemId && issue.makeReadyItemId === payload.makeReadyItemId) total += 6;
      if (payload.unitId && issue.unitId === payload.unitId) total += 5;
      if (normalizedPestType && issue.pestType.trim().toLowerCase() === normalizedPestType) total += 4;
      if (normalizedAdditionalType && (issue.additionalPestType ?? "").trim().toLowerCase() === normalizedAdditionalType) total += 2;
      if (normalizedArea && (issue.area ?? "").trim().toLowerCase() === normalizedArea) total += 2;
      return total;
    };
    const scoreDiff = score(right) - score(left);
    if (scoreDiff !== 0) return scoreDiff;
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  })[0] ?? null;
}

function findPmTaskById(tasks: PreventiveMaintenanceTask[], taskId: string) {
  return tasks.find((task) => task.id === taskId) ?? null;
}

function pickLikelyProjectRecordMatch(
  records: ProjectRecord[],
  payload: {
    title: string;
    recordType: ProjectRecord["recordType"];
    building?: string | null;
    area?: string | null;
    status: string;
    priority?: ProjectRecord["priority"];
  },
) {
  const normalizedTitle = payload.title.trim().toLowerCase();
  const normalizedBuilding = (payload.building ?? "").trim().toLowerCase();
  const normalizedArea = (payload.area ?? "").trim().toLowerCase();
  return [...records].sort((left, right) => {
    const score = (record: ProjectRecord) => {
      let total = 0;
      if (record.title.trim().toLowerCase() === normalizedTitle) total += 6;
      if (record.recordType === payload.recordType) total += 4;
      if (normalizedBuilding && (record.building ?? "").trim().toLowerCase() === normalizedBuilding) total += 2;
      if (normalizedArea && (record.area ?? "").trim().toLowerCase() === normalizedArea) total += 2;
      if (record.status === payload.status) total += 1;
      if (payload.priority && record.priority === payload.priority) total += 1;
      return total;
    };
    const scoreDiff = score(right) - score(left);
    if (scoreDiff !== 0) return scoreDiff;
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  })[0] ?? null;
}

function pickLikelyPoolEntryMatch(
  entries: PoolLogEntry[],
  payload: {
    facilityId: string;
    logDate: string;
    logTime?: string | null;
    notes?: string | null;
  },
) {
  const normalizedNotes = (payload.notes ?? "").trim().toLowerCase();
  return [...entries].sort((left, right) => {
    const score = (entry: PoolLogEntry) => {
      let total = 0;
      if (entry.facilityId === payload.facilityId) total += 6;
      if (entry.logDate === payload.logDate) total += 5;
      if ((entry.logTime ?? "") === (payload.logTime ?? "")) total += 2;
      if (normalizedNotes && (entry.notes ?? "").trim().toLowerCase() === normalizedNotes) total += 1;
      return total;
    };
    const scoreDiff = score(right) - score(left);
    if (scoreDiff !== 0) return scoreDiff;
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  })[0] ?? null;
}

async function findChecklistParentItemId(
  checklistItemId: string,
  seedItems: Array<MakeReadyItem & { checklistInstances?: ChecklistInstance[] }> = [],
) {
  const seededMatch = seedItems.find((item) =>
    item.checklistInstances?.some((instance) => instance.items.some((entry) => entry.id === checklistItemId)),
  );
  if (seededMatch) return seededMatch.id;
  let offset = 0;
  let scanned = 0;
  const limit = 250;
  const maxScanned = 2000;
  while (scanned < maxScanned) {
    const page = await getMakeReadyItemPage({ includeArchived: true, limit, offset });
    const pageItems = page.items as Array<MakeReadyItem & { checklistInstances?: ChecklistInstance[] }>;
    const match = pageItems.find((item) =>
      item.checklistInstances?.some((instance) => instance.items.some((entry) => entry.id === checklistItemId)),
    );
    if (match) return match.id;
    scanned += pageItems.length;
    if (!page.pagination.hasMore || page.pagination.nextOffset === null || !pageItems.length) break;
    offset = page.pagination.nextOffset;
  }
  return null;
}

function App() {
  const [propertyId, setPropertyId] = useState("");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [activeView, setActiveView] = useState<AppView>("table");
  const [activeCalendarField, setActiveCalendarField] = useState("moveInDate");
  const [kanbanGroupBy, setKanbanGroupBy] = useState<KanbanGroupKey>("makeReadyStatus");
  const [kanbanColorBy, setKanbanColorBy] = useState<string>("vacancyStatus");
  const [kanbanCardFields, setKanbanCardFields] = useState<string[]>(["floorPlan", "vacancyStatus", "scopeLevel", "assignedTech", "moveInDate"]);
  const [kanbanSortBy, setKanbanSortBy] = useState("moveInDate");
  const [kanbanHideEmpty, setKanbanHideEmpty] = useState(false);
  const [calendarLayout, setCalendarLayout] = useState<"single" | "split" | "grid" | "auto">("single");
  const [calendarPanelFields, setCalendarPanelFields] = useState<string[]>([]);
  const [dashboardLayout, setDashboardLayout] = useState<"overview" | "focus">("overview");
  const [sortKey, setSortKey] = useState("moveInDate");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [scopeLevelFilter, setScopeLevelFilter] = useState("");
  const [structuredFilters, setStructuredFilters] = useState<StructuredFilters>(defaultStructuredFilters);
  const [dashboardDrilldownContext, setDashboardDrilldownContext] = useState<DashboardDrilldownContext | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<string[] | null>(null);
  const [customFieldToAdd, setCustomFieldToAdd] = useState("");
  const [tableFiltersOpen, setTableFiltersOpen] = useState(() => !isTouchMobileViewport());
  const [loginError, setLoginError] = useState("");
  const [adminMessage, setAdminMessage] = useState("");
  const [adminError, setAdminError] = useState("");
  const [viewMessage, setViewMessage] = useState("");
  const [viewError, setViewError] = useState("");
  const [fieldMessage, setFieldMessage] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [automationMessage, setAutomationMessage] = useState("");
  const [automationError, setAutomationError] = useState("");
  const [libraryPreview, setLibraryPreview] = useState<OperationalLibraryPreviewResponse | null>(null);
  const [templatePreview, setTemplatePreview] = useState<string>("");
  const [operationsMessage, setOperationsMessage] = useState("");
  const [operationsError, setOperationsError] = useState("");
  const [automationRuleId, setAutomationRuleId] = useState<string | undefined>();
  const [automationPreview, setAutomationPreview] = useState<AutomationPreviewResponse | null>(null);
  const [sessionMessage, setSessionMessage] = useState("");
  const [forceLoggedOut, setForceLoggedOut] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [compactMode, setCompactMode] = useState(() => readStorageFlag(compactModeStorageKey));
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const stored = readStorageValue(themeModeStorageKey);
    return stored === "dark" || stored === "light" ? stored : "default";
  });
  const [eyeStrainMode, setEyeStrainMode] = useState(() => readStorageFlag(eyeStrainModeStorageKey));
  const [dyslexiaMode, setDyslexiaMode] = useState(() => readStorageFlag(dyslexiaModeStorageKey));
  const [clockMode, setClockMode] = useState<ClockMode>(() => (readStorageValue(clockModeStorageKey) === "24h" ? "24h" : "12h"));
  const [boardWindowedMode, setBoardWindowedMode] = useState(() => readStorageFlag(boardWindowedModeStorageKey));
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [boardWindowLimit, setBoardWindowLimit] = useState(() => {
    const stored = Number(readStorageValue(boardWindowLimitStorageKey));
    return Number.isFinite(stored) && stored >= boardWindowPageSize ? stored : boardWindowPageSize;
  });
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingSkipped, setOnboardingSkipped] = useState(() => readStorageFlag(onboardingSkippedStorageKey));
  const [myWorkUserId, setMyWorkUserId] = useState("");
  const [defaultWorkspaceAppliedForUser, setDefaultWorkspaceAppliedForUser] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [apiDegraded, setApiDegraded] = useState(false);
  const [lastConnectionIssueAt, setLastConnectionIssueAt] = useState<string | null>(null);
  const [offlineQueuePendingCount, setOfflineQueuePendingCount] = useState(0);
  const [offlineQueueSyncing, setOfflineQueueSyncing] = useState(false);
  const [offlineQueueBlockedJobs, setOfflineQueueBlockedJobs] = useState<OfflineSyncJobSummary[]>([]);
  const [offlineQueueReviewOpen, setOfflineQueueReviewOpen] = useState(false);
  const [selectedOfflineQueueJob, setSelectedOfflineQueueJob] = useState<OfflineSyncJob | null>(null);
  const [offlineQueueJobLoading, setOfflineQueueJobLoading] = useState(false);
  const [selectedOfflineQueueServerItem, setSelectedOfflineQueueServerItem] = useState<MakeReadyItem | null>(null);
  const [selectedOfflineQueueServerLeaseIssue, setSelectedOfflineQueueServerLeaseIssue] = useState<LeaseComplianceIssue | null>(null);
  const [selectedOfflineQueueServerPestIssue, setSelectedOfflineQueueServerPestIssue] = useState<PestIssue | null>(null);
  const [selectedOfflineQueueServerPmTask, setSelectedOfflineQueueServerPmTask] = useState<PreventiveMaintenanceTask | null>(null);
  const [selectedOfflineQueueServerPoolEntry, setSelectedOfflineQueueServerPoolEntry] = useState<PoolLogEntry | null>(null);
  const [selectedOfflineQueueServerProjectRecord, setSelectedOfflineQueueServerProjectRecord] = useState<ProjectRecord | null>(null);
  const [selectedOfflineQueueServerCollaboration, setSelectedOfflineQueueServerCollaboration] = useState<ItemCollaboration | null>(null);
  const [selectedOfflineQueueResolvedItemId, setSelectedOfflineQueueResolvedItemId] = useState<string | null>(null);
  const [selectedOfflineQueueServerError, setSelectedOfflineQueueServerError] = useState("");
  const [wikiRecordRequest, setWikiRecordRequest] = useState<(OpenWikiRecordRequest & { nonce: number }) | null>(null);
  const [projectRecordRequest, setProjectRecordRequest] = useState<(OpenProjectRecordRequest & { nonce: number }) | null>(null);
  const [projectCreateRequest, setProjectCreateRequest] = useState<(OpenProjectCreateRequest & { nonce: number }) | null>(null);
  const [pestQuickAddRequest, setPestQuickAddRequest] = useState<(OpenPestQuickAddRequest & { nonce: number }) | null>(null);
  const [pestWorkspaceRequest, setPestWorkspaceRequest] = useState<(OpenPestWorkspaceRequest & { nonce: number }) | null>(null);
  const [leaseWorkspaceRequest, setLeaseWorkspaceRequest] = useState<(OpenLeaseWorkspaceRequest & { nonce: number }) | null>(null);
  const [leaseQuickAddRequest, setLeaseQuickAddRequest] = useState<(OpenLeaseQuickAddRequest & { nonce: number }) | null>(null);
  const queryClient = useQueryClient();
  const hasInitializedHistoryRef = useRef(false);
  const suppressHistorySyncRef = useRef(false);
  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: getCurrentUser,
    retry: false,
  });

  const setAppView = (view: AppView) => setActiveView(view);
  const openItemDrawer = (id: string) => setSelectedItemId(id);
  const closeItemDrawer = () => setSelectedItemId(null);
  const getToastLanguage = () => meQuery.data?.user.language ?? "en";
  const language = getToastLanguage();
  const isToastSpanish = () => getToastLanguage() === "es";

  const pushToast = (title: string, message: string | undefined, tone: ToastItem["tone"]) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { id, title, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4200);
  };

  const dismissToast = (id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  };

  const handleSessionExpired = (message = t(meQuery.data?.user.language ?? "en", "auth.sessionExpiredCopy")) => {
    if (sessionMessage === message) {
      return;
    }
    setForceLoggedOut(true);
    setSessionMessage(message);
    queryClient.removeQueries({ queryKey: ["auth", "me"] });
    pushToast(t(meQuery.data?.user.language ?? "en", "auth.sessionExpired"), message, "error");
  };

  const retryConnection = () => {
    setApiDegraded(false);
    void queryClient.invalidateQueries();
    pushToast(t(meQuery.data?.user.language ?? "en", "connection.retrying"), t(meQuery.data?.user.language ?? "en", "connection.retryingCopy"), "info");
    void syncQueuedOfflineChanges();
  };

  const refreshOfflineQueueState = async () => {
    const [pendingCount, jobs] = await Promise.all([getOfflineSyncPendingCount(), listOfflineSyncJobs()]);
    setOfflineQueuePendingCount(pendingCount);
    setOfflineQueueBlockedJobs(jobs.filter((job) => Boolean(job.lastErrorStatus) && job.lastErrorStatus !== 0));
  };

  const syncQueuedOfflineChanges = async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    const result = await syncOfflineJobs();
    await refreshOfflineQueueState();
    if (result.synced > 0) {
      pushToast(
        t(meQuery.data?.user.language ?? "en", "connection.syncedTitle"),
        tWithVars(meQuery.data?.user.language ?? "en", result.synced === 1 ? "connection.syncedSingle" : "connection.syncedPlural", { count: String(result.synced) }),
        "success",
      );
      await queryClient.invalidateQueries();
    }
  };

  const discardOfflineQueueJob = async (job: OfflineSyncJobSummary) => {
    await removeOfflineSyncJob(job.id);
    await refreshOfflineQueueState();
    if (selectedOfflineQueueJob?.id === job.id) {
      setSelectedOfflineQueueJob(null);
      setSelectedOfflineQueueServerItem(null);
      setSelectedOfflineQueueServerLeaseIssue(null);
      setSelectedOfflineQueueServerPestIssue(null);
      setSelectedOfflineQueueServerPmTask(null);
      setSelectedOfflineQueueServerPoolEntry(null);
      setSelectedOfflineQueueServerProjectRecord(null);
      setSelectedOfflineQueueServerCollaboration(null);
      setSelectedOfflineQueueResolvedItemId(null);
      setSelectedOfflineQueueServerError("");
    }
    pushToast(t(meQuery.data?.user.language ?? "en", "offlineQueue.removed"), t(meQuery.data?.user.language ?? "en", "offlineQueue.removedCopy").replace("{title}", job.title), "info");
  };

  const reviewOfflineQueueJob = async (job: OfflineSyncJobSummary) => {
    setOfflineQueueJobLoading(true);
    setSelectedOfflineQueueServerItem(null);
    setSelectedOfflineQueueServerLeaseIssue(null);
    setSelectedOfflineQueueServerPestIssue(null);
    setSelectedOfflineQueueServerPmTask(null);
   setSelectedOfflineQueueServerPoolEntry(null);
    setSelectedOfflineQueueServerProjectRecord(null);
    setSelectedOfflineQueueServerCollaboration(null);
    setSelectedOfflineQueueResolvedItemId(null);
    setSelectedOfflineQueueServerError("");
    try {
      const detail = await getOfflineSyncJob(job.id);
      setSelectedOfflineQueueJob(detail);
      if (detail?.payload.kind === "makeReadyPatch") {
        try {
          setSelectedOfflineQueueServerItem(await getMakeReadyItem(detail.payload.itemId));
        } catch (error) {
          setSelectedOfflineQueueServerError(error instanceof Error ? error.message : t(meQuery.data?.user.language ?? "en", "offlineQueue.liveLoad.makeReadyRecord"));
        }
      } else if (detail?.payload.kind === "makeReadyUpload") {
        try {
          setSelectedOfflineQueueServerCollaboration(await getItemCollaboration(detail.payload.itemId, { attachmentLimit: 100 }));
        } catch (error) {
          setSelectedOfflineQueueServerError(error instanceof Error ? error.message : t(meQuery.data?.user.language ?? "en", "offlineQueue.liveLoad.makeReadyAttachments"));
        }
      } else if (detail?.payload.kind === "projectCreate") {
        try {
          const response = await getProjectRecords({
            propertyId: detail.payload.input.propertyId,
            recordType: detail.payload.input.recordType,
            q: [detail.payload.input.title, detail.payload.input.building, detail.payload.input.area]
              .filter(Boolean)
              .join(" ") || undefined,
            includeArchived: true,
            limit: 25,
          });
          setSelectedOfflineQueueServerProjectRecord(pickLikelyProjectRecordMatch(response.records, detail.payload.input));
        } catch (error) {
          setSelectedOfflineQueueServerError(error instanceof Error ? error.message : t(meQuery.data?.user.language ?? "en", "offlineQueue.liveLoad.projectRecord"));
        }
      } else if (detail?.payload.kind === "leaseCreate") {
        try {
          const response = await getLeaseComplianceIssues({
            propertyId: detail.payload.input.propertyId,
            unitId: detail.payload.input.unitId ?? undefined,
            includeArchived: true,
            q: [detail.payload.input.issueTypeName, detail.payload.input.additionalIssueType, detail.payload.input.area, detail.payload.input.building]
              .filter(Boolean)
              .join(" ") || undefined,
            limit: 25,
          });
          setSelectedOfflineQueueServerLeaseIssue(pickLikelyLeaseIssueMatch(response.issues, detail.payload.input));
        } catch (error) {
          setSelectedOfflineQueueServerError(error instanceof Error ? error.message : t(meQuery.data?.user.language ?? "en", "offlineQueue.liveLoad.leaseIssue"));
        }
      } else if (detail?.payload.kind === "leaseUpload") {
        const payload = detail.payload;
        try {
          const response = await getLeaseComplianceIssues({
            propertyId: payload.propertyId,
            includeArchived: true,
            limit: payload.propertyId ? 200 : 400,
          });
          setSelectedOfflineQueueServerLeaseIssue(response.issues.find((issue) => issue.id === payload.issueId) ?? null);
        } catch (error) {
          setSelectedOfflineQueueServerError(error instanceof Error ? error.message : t(meQuery.data?.user.language ?? "en", "offlineQueue.liveLoad.leaseIssue"));
        }
      } else if (detail?.payload.kind === "pestCreate") {
        try {
          const response = await getPestIssues({
            propertyId: detail.payload.input.propertyId,
            unitId: detail.payload.input.unitId ?? undefined,
            makeReadyItemId: detail.payload.input.makeReadyItemId ?? undefined,
            includeArchived: true,
            q: [detail.payload.input.pestType, detail.payload.input.additionalPestType, detail.payload.input.area]
              .filter(Boolean)
              .join(" ") || undefined,
            limit: 25,
          });
          setSelectedOfflineQueueServerPestIssue(pickLikelyPestIssueMatch(response.issues, detail.payload.input));
        } catch (error) {
          setSelectedOfflineQueueServerError(error instanceof Error ? error.message : t(meQuery.data?.user.language ?? "en", "offlineQueue.liveLoad.pestIssue"));
        }
      } else if (detail?.payload.kind === "poolCreate") {
        try {
          const response = await getPoolEntries({
            propertyId: detail.payload.input.propertyId,
            facilityId: detail.payload.input.facilityId,
            from: detail.payload.input.logDate,
            to: detail.payload.input.logDate,
            limit: 25,
          });
          setSelectedOfflineQueueServerPoolEntry(pickLikelyPoolEntryMatch(response.entries, detail.payload.input));
        } catch (error) {
          setSelectedOfflineQueueServerError(error instanceof Error ? error.message : t(meQuery.data?.user.language ?? "en", "offlineQueue.liveLoad.poolEntry"));
        }
      } else if (detail?.payload.kind === "pestUpload") {
        const payload = detail.payload;
        try {
          const response = await getPestIssues({
            propertyId: payload.propertyId,
            includeArchived: true,
            limit: payload.propertyId ? 200 : 400,
          });
          setSelectedOfflineQueueServerPestIssue(response.issues.find((issue) => issue.id === payload.issueId) ?? null);
        } catch (error) {
          setSelectedOfflineQueueServerError(error instanceof Error ? error.message : t(meQuery.data?.user.language ?? "en", "offlineQueue.liveLoad.pestIssue"));
        }
      } else if (detail?.payload.kind === "pmComplete" || detail?.payload.kind === "pmSkip") {
        try {
          const [activeResponse, historyResponse] = await Promise.all([
            getPreventiveMaintenanceTasks({ limit: 200 }),
            getPreventiveMaintenanceHistory({ limit: 200 }),
          ]);
          setSelectedOfflineQueueServerPmTask(
            findPmTaskById(activeResponse.tasks, detail.payload.taskId)
            ?? findPmTaskById(historyResponse.tasks, detail.payload.taskId),
          );
        } catch (error) {
          setSelectedOfflineQueueServerError(error instanceof Error ? error.message : t(meQuery.data?.user.language ?? "en", "offlineQueue.liveLoad.pmTask"));
        }
      } else if (detail?.payload.kind === "pmUpload") {
        try {
          const [activeResponse, historyResponse] = await Promise.all([
            getPreventiveMaintenanceTasks({ propertyId: detail.payload.propertyId, limit: detail.payload.propertyId ? 200 : 400 }),
            getPreventiveMaintenanceHistory({ propertyId: detail.payload.propertyId, limit: detail.payload.propertyId ? 200 : 400 }),
          ]);
          setSelectedOfflineQueueServerPmTask(
            findPmTaskById(activeResponse.tasks, detail.payload.taskId)
            ?? findPmTaskById(historyResponse.tasks, detail.payload.taskId),
          );
        } catch (error) {
          setSelectedOfflineQueueServerError(error instanceof Error ? error.message : t(meQuery.data?.user.language ?? "en", "offlineQueue.liveLoad.pmTask"));
        }
      } else if (detail?.payload.kind === "projectUpload") {
        try {
          const response = await getProjectRecord(detail.payload.recordId);
          setSelectedOfflineQueueServerProjectRecord(response.record);
        } catch (error) {
          setSelectedOfflineQueueServerError(error instanceof Error ? error.message : t(meQuery.data?.user.language ?? "en", "offlineQueue.liveLoad.projectRecord"));
        }
      } else if (detail?.payload.kind === "poolUpload") {
        const payload = detail.payload;
        try {
          const response = await getPoolEntries({ propertyId: payload.propertyId, limit: payload.propertyId ? 200 : 400 });
          setSelectedOfflineQueueServerPoolEntry(response.entries.find((entry) => entry.id === payload.entryId) ?? null);
        } catch (error) {
          setSelectedOfflineQueueServerError(error instanceof Error ? error.message : t(meQuery.data?.user.language ?? "en", "offlineQueue.liveLoad.poolEntry"));
        }
      } else if (
        detail?.payload.kind === "makeReadyCommentCreate"
        || detail?.payload.kind === "makeReadyCommentUpdate"
        || detail?.payload.kind === "makeReadyCommentDelete"
        || detail?.payload.kind === "makeReadyChecklistAttach"
        || (detail?.payload.kind === "makeReadyChecklistUpdate" && Boolean(detail.payload.itemId))
      ) {
        try {
          setSelectedOfflineQueueResolvedItemId(detail.payload.itemId!);
          setSelectedOfflineQueueServerCollaboration(await getItemCollaboration(detail.payload.itemId!, { commentLimit: 100, checklistLimit: 100 }));
        } catch (error) {
          setSelectedOfflineQueueServerError(error instanceof Error ? error.message : t(meQuery.data?.user.language ?? "en", "offlineQueue.liveLoad.collaboration"));
        }
      } else if (detail?.payload.kind === "makeReadyChecklistUpdate") {
        try {
          const resolvedItemId = await findChecklistParentItemId(detail.payload.checklistItemId, boardItems);
          if (!resolvedItemId) {
            setSelectedOfflineQueueServerError(t(meQuery.data?.user.language ?? "en", "offlineQueue.legacyChecklistHelp"));
          } else {
            setSelectedOfflineQueueResolvedItemId(resolvedItemId);
            setSelectedOfflineQueueServerCollaboration(await getItemCollaboration(resolvedItemId, { commentLimit: 100, checklistLimit: 100 }));
          }
        } catch (error) {
          setSelectedOfflineQueueServerError(error instanceof Error ? error.message : t(meQuery.data?.user.language ?? "en", "offlineQueue.liveLoad.collaboration"));
        }
      }
    } finally {
      setOfflineQueueJobLoading(false);
    }
  };

  const retrySingleOfflineQueueJob = async (job: OfflineSyncJobSummary) => {
    try {
      const result = await retryOfflineSyncJob(job.id);
      await refreshOfflineQueueState();
      if (result.synced) {
        if (selectedOfflineQueueJob?.id === job.id) {
          setSelectedOfflineQueueJob(null);
          setSelectedOfflineQueueServerItem(null);
          setSelectedOfflineQueueServerLeaseIssue(null);
          setSelectedOfflineQueueServerPestIssue(null);
          setSelectedOfflineQueueServerPmTask(null);
          setSelectedOfflineQueueServerPoolEntry(null);
          setSelectedOfflineQueueServerProjectRecord(null);
          setSelectedOfflineQueueServerCollaboration(null);
          setSelectedOfflineQueueResolvedItemId(null);
          setSelectedOfflineQueueServerError("");
        }
        pushToast("Queued change synced", `${job.title} reached the server.`, "success");
        await queryClient.invalidateQueries();
        return;
      }
      pushToast("Retry skipped", "Reconnect before retrying this queued change.", "info");
    } catch (error) {
      await reviewOfflineQueueJob(job);
      pushToast("Retry failed", error instanceof Error ? error.message : "Retry failed", "error");
    }
  };

  const reapplyQueuedMakeReadyPatch = async (job: OfflineSyncJob) => {
    if (job.payload.kind !== "makeReadyPatch") return;
    await patchMakeReadyItem(job.payload.itemId, job.payload.data);
    await removeOfflineSyncJob(job.id);
    setSelectedOfflineQueueJob(null);
    setSelectedOfflineQueueServerItem(null);
    setSelectedOfflineQueueServerPoolEntry(null);
    setSelectedOfflineQueueServerProjectRecord(null);
    setSelectedOfflineQueueResolvedItemId(null);
    setSelectedOfflineQueueServerError("");
    await refreshOfflineQueueState();
    await queryClient.invalidateQueries();
    pushToast("Local values reapplied", "The queued make-ready change was applied to the live record.", "success");
  };

  const applyQueuedMakeReadyPatch = (id: string, data: Record<string, unknown>) => {
    queryClient.setQueriesData<MakeReadyItemsPage>({ queryKey: ["make-ready-items"] }, (current) => {
      if (!current) return current;
      return {
        ...current,
        items: current.items.map((item) => (item.id === id ? { ...item, ...data } : item)),
      };
    });
  };

  useEffect(() => {
    const handleOpenWikiRecord = (event: Event) => {
      const detail = (event as CustomEvent<OpenWikiRecordRequest>).detail;
      if (!detail?.id || !detail?.targetType) return;
      if (detail.propertyId) setPropertyId(detail.propertyId);
      setWikiRecordRequest({ ...detail, nonce: Date.now() });
      setAppView("wiki");
    };
    window.addEventListener(openWikiRecordEventName, handleOpenWikiRecord as EventListener);
    return () => window.removeEventListener(openWikiRecordEventName, handleOpenWikiRecord as EventListener);
  }, []);

  const selectedOfflineQueueComparison = useMemo<OfflineQueueComparisonRow[]>(() => {
    if (selectedOfflineQueueJob?.payload.kind !== "makeReadyPatch" || !selectedOfflineQueueServerItem) {
      return [];
    }
    return Object.entries(selectedOfflineQueueJob.payload.data).map(([field, queuedValue]) => {
      const serverValue = selectedOfflineQueueServerItem[field as keyof MakeReadyItem];
      return comparisonRow(field, queuedValue, serverValue);
    });
  }, [selectedOfflineQueueJob, selectedOfflineQueueServerItem]);

  const selectedOfflineQueueLeaseComparison = useMemo<OfflineQueueComparisonRow[]>(() => {
    if (selectedOfflineQueueJob?.payload.kind !== "leaseCreate" || !selectedOfflineQueueServerLeaseIssue) {
      return [];
    }
    const queued = selectedOfflineQueueJob.payload.input;
    return [
      comparisonRow("unit", queued.unitId ?? null, selectedOfflineQueueServerLeaseIssue.unit?.number ?? selectedOfflineQueueServerLeaseIssue.unitId),
      comparisonRow("building", queued.building ?? null, selectedOfflineQueueServerLeaseIssue.building),
      comparisonRow("area", queued.area ?? null, selectedOfflineQueueServerLeaseIssue.area),
      comparisonRow("issueTypeName", queued.issueTypeName, selectedOfflineQueueServerLeaseIssue.issueTypeName),
      comparisonRow("additionalIssueType", queued.additionalIssueType ?? null, selectedOfflineQueueServerLeaseIssue.additionalIssueType),
      comparisonRow("priority", queued.priority ?? null, selectedOfflineQueueServerLeaseIssue.priority),
      comparisonRow("status", queued.status ?? null, selectedOfflineQueueServerLeaseIssue.status),
      comparisonRow("source", queued.source ?? null, selectedOfflineQueueServerLeaseIssue.source),
      comparisonRow("description", queued.description ?? null, selectedOfflineQueueServerLeaseIssue.description),
      comparisonRow("locationNotes", queued.locationNotes ?? null, selectedOfflineQueueServerLeaseIssue.locationNotes),
      comparisonRow("assignedUserId", queued.assignedUserId ?? null, selectedOfflineQueueServerLeaseIssue.assignedUserName ?? selectedOfflineQueueServerLeaseIssue.assignedUserId),
    ];
  }, [selectedOfflineQueueJob, selectedOfflineQueueServerLeaseIssue]);

  const selectedOfflineQueueProjectComparison = useMemo<OfflineQueueComparisonRow[]>(() => {
    if (selectedOfflineQueueJob?.payload.kind !== "projectCreate" || !selectedOfflineQueueServerProjectRecord) {
      return [];
    }
    const queued = selectedOfflineQueueJob.payload.input;
    return [
      comparisonRow("title", queued.title, selectedOfflineQueueServerProjectRecord.title),
      comparisonRow("recordType", queued.recordType, selectedOfflineQueueServerProjectRecord.recordType),
      comparisonRow("building", queued.building ?? null, selectedOfflineQueueServerProjectRecord.building),
      comparisonRow("area", queued.area ?? null, selectedOfflineQueueServerProjectRecord.area),
      comparisonRow("status", queued.status, selectedOfflineQueueServerProjectRecord.status),
      comparisonRow("priority", queued.priority ?? null, selectedOfflineQueueServerProjectRecord.priority),
      comparisonRow("source", queued.source ?? null, selectedOfflineQueueServerProjectRecord.source),
      comparisonRow("description", queued.description ?? null, selectedOfflineQueueServerProjectRecord.description),
      comparisonRow("locationNotes", queued.locationNotes ?? null, selectedOfflineQueueServerProjectRecord.locationNotes),
      comparisonRow("companyName", queued.companyName ?? null, selectedOfflineQueueServerProjectRecord.companyName),
      comparisonRow("estimatedCost", queued.estimatedCost ?? null, selectedOfflineQueueServerProjectRecord.estimatedCost),
      comparisonRow("files", selectedOfflineQueueJob.payload.files.map((file) => file.name), selectedOfflineQueueServerProjectRecord.attachments.map((attachment) => attachment.originalName)),
    ];
  }, [selectedOfflineQueueJob, selectedOfflineQueueServerProjectRecord]);

  const selectedOfflineQueuePestComparison = useMemo<OfflineQueueComparisonRow[]>(() => {
    if (selectedOfflineQueueJob?.payload.kind !== "pestCreate" || !selectedOfflineQueueServerPestIssue) {
      return [];
    }
    const queued = selectedOfflineQueueJob.payload.input;
    return [
      comparisonRow("unit", queued.unitId ?? null, selectedOfflineQueueServerPestIssue.unit?.number ?? selectedOfflineQueueServerPestIssue.unitId),
      comparisonRow("makeReadyItemId", queued.makeReadyItemId ?? null, selectedOfflineQueueServerPestIssue.makeReadyItem?.unitNumber ?? selectedOfflineQueueServerPestIssue.makeReadyItemId),
      comparisonRow("building", queued.building ?? null, selectedOfflineQueueServerPestIssue.building),
      comparisonRow("area", queued.area ?? null, selectedOfflineQueueServerPestIssue.area),
      comparisonRow("pestType", queued.pestType, selectedOfflineQueueServerPestIssue.pestType),
      comparisonRow("additionalPestType", queued.additionalPestType ?? null, selectedOfflineQueueServerPestIssue.additionalPestType),
      comparisonRow("priority", queued.priority ?? null, selectedOfflineQueueServerPestIssue.priority),
      comparisonRow("status", queued.status ?? null, selectedOfflineQueueServerPestIssue.status),
      comparisonRow("source", queued.source ?? null, selectedOfflineQueueServerPestIssue.source),
      comparisonRow("vendorId", queued.vendorId ?? null, selectedOfflineQueueServerPestIssue.vendor?.vendorName ?? selectedOfflineQueueServerPestIssue.vendorId),
      comparisonRow("assignedUserId", queued.assignedUserId ?? null, selectedOfflineQueueServerPestIssue.assignedUser?.fullName ?? selectedOfflineQueueServerPestIssue.assignedUserId),
      comparisonRow("description", queued.description ?? null, selectedOfflineQueueServerPestIssue.description),
    ];
  }, [selectedOfflineQueueJob, selectedOfflineQueueServerPestIssue]);

  const selectedOfflineQueuePoolComparison = useMemo<OfflineQueueComparisonRow[]>(() => {
    if (selectedOfflineQueueJob?.payload.kind !== "poolCreate" || !selectedOfflineQueueServerPoolEntry) {
      return [];
    }
    const queued = selectedOfflineQueueJob.payload.input;
    return [
      comparisonRow("facility", queued.facilityId, selectedOfflineQueueServerPoolEntry.facility.name),
      comparisonRow("logDate", queued.logDate, selectedOfflineQueueServerPoolEntry.logDate),
      comparisonRow("logTime", queued.logTime ?? null, selectedOfflineQueueServerPoolEntry.logTime),
      comparisonRow("ph", queued.ph ?? null, selectedOfflineQueueServerPoolEntry.ph),
      comparisonRow("freeChlorine", queued.freeChlorine ?? null, selectedOfflineQueueServerPoolEntry.freeChlorine),
      comparisonRow("combinedChlorine", queued.combinedChlorine ?? null, selectedOfflineQueueServerPoolEntry.combinedChlorine),
      comparisonRow("waterTemperature", queued.waterTemperature ?? null, selectedOfflineQueueServerPoolEntry.waterTemperature),
      comparisonRow("notes", queued.notes ?? null, selectedOfflineQueueServerPoolEntry.notes),
      comparisonRow("chemicalAdditions", queued.chemicalAdditions?.map((entry) => `${entry.chemicalName} ${entry.amount} ${entry.unit}`) ?? [], selectedOfflineQueueServerPoolEntry.chemicalAdditions.map((entry) => `${entry.chemicalName} ${entry.amount} ${entry.unit}`)),
    ];
  }, [selectedOfflineQueueJob, selectedOfflineQueueServerPoolEntry]);

  const selectedOfflineQueuePmComparison = useMemo<OfflineQueueComparisonRow[]>(() => {
    if (
      (selectedOfflineQueueJob?.payload.kind !== "pmComplete" && selectedOfflineQueueJob?.payload.kind !== "pmSkip")
      || !selectedOfflineQueueServerPmTask
    ) {
      return [];
    }
    if (selectedOfflineQueueJob.payload.kind === "pmComplete") {
      return [
        comparisonRow("taskName", selectedOfflineQueueServerPmTask.taskName, selectedOfflineQueueServerPmTask.taskName),
        comparisonRow("status", t(meQuery.data?.user.language ?? "en", "offlineQueue.pmQueuedComplete"), selectedOfflineQueueServerPmTask.status),
        comparisonRow("queuedOutcome", selectedOfflineQueueJob.payload.input.outcome, selectedOfflineQueueServerPmTask.completionOutcome),
        comparisonRow("queuedNotes", selectedOfflineQueueJob.payload.input.notes ?? null, selectedOfflineQueueServerPmTask.completionNotes),
        comparisonRow("completedAt", t(meQuery.data?.user.language ?? "en", "offlineQueue.pendingSync"), selectedOfflineQueueServerPmTask.completedAt),
        comparisonRow("completedBy", t(meQuery.data?.user.language ?? "en", "offlineQueue.localQueuedAction"), selectedOfflineQueueServerPmTask.completedByName),
      ];
    }
    return [
      comparisonRow("taskName", selectedOfflineQueueServerPmTask.taskName, selectedOfflineQueueServerPmTask.taskName),
      comparisonRow("status", t(meQuery.data?.user.language ?? "en", "offlineQueue.pmQueuedSkip"), selectedOfflineQueueServerPmTask.status),
      comparisonRow("queuedNotes", selectedOfflineQueueJob.payload.input.notes ?? null, selectedOfflineQueueServerPmTask.completionNotes),
      comparisonRow("completedAt", t(meQuery.data?.user.language ?? "en", "offlineQueue.pendingSync"), selectedOfflineQueueServerPmTask.completedAt),
      comparisonRow("completedBy", t(meQuery.data?.user.language ?? "en", "offlineQueue.localQueuedAction"), selectedOfflineQueueServerPmTask.completedByName),
    ];
  }, [selectedOfflineQueueJob, selectedOfflineQueueServerPmTask]);

  const selectedOfflineQueueCollaborationComparison = useMemo<OfflineQueueComparisonRow[]>(() => {
    if (!selectedOfflineQueueJob || !selectedOfflineQueueServerCollaboration) {
      return [];
    }
    switch (selectedOfflineQueueJob.payload.kind) {
      case "makeReadyCommentCreate": {
        const latestComment = selectedOfflineQueueServerCollaboration.comments[0] ?? null;
        return [
          comparisonRow("queuedComment", selectedOfflineQueueJob.payload.body, latestComment?.body ?? null),
          comparisonRow("latestLiveCommentAt", "Pending sync", latestComment?.createdAt ?? null),
        ];
      }
      case "makeReadyCommentUpdate": {
        const payload = selectedOfflineQueueJob.payload;
        const liveComment = selectedOfflineQueueServerCollaboration.comments.find((comment) => comment.id === payload.commentId) ?? null;
        return [
          comparisonRow("commentId", payload.commentId, liveComment?.id ?? null),
          comparisonRow("queuedComment", payload.body, liveComment?.body ?? null),
          comparisonRow("editedAt", "Pending sync", liveComment?.editedAt ?? liveComment?.createdAt ?? null),
        ];
      }
      case "makeReadyCommentDelete": {
        const payload = selectedOfflineQueueJob.payload;
        const liveComment = selectedOfflineQueueServerCollaboration.comments.find((comment) => comment.id === payload.commentId) ?? null;
        return [
          comparisonRow("commentId", payload.commentId, liveComment?.id ?? null),
          comparisonRow("queuedDelete", "Delete comment", liveComment?.body ?? "Already removed"),
        ];
      }
      case "makeReadyChecklistAttach": {
        const payload = selectedOfflineQueueJob.payload;
        const queuedTemplate = selectedOfflineQueueServerCollaboration.templates.find(
          (template) => template.id === payload.templateId,
        ) ?? null;
        const matchingLiveInstances = queuedTemplate
          ? selectedOfflineQueueServerCollaboration.checklistInstances.filter((instance) => instance.name === queuedTemplate.name)
          : [];
        return [
          comparisonRow("templateId", payload.templateId, queuedTemplate?.id ?? null),
          comparisonRow("templateName", queuedTemplate?.name ?? payload.templateId, matchingLiveInstances.map((instance) => instance.name).join(", ") || null),
          comparisonRow(
            "matchingLiveChecklist",
            t(meQuery.data?.user.language ?? "en", "offlineQueue.pendingAttach"),
            matchingLiveInstances.length
              ? `${matchingLiveInstances.length} ${t(meQuery.data?.user.language ?? "en", "offlineQueue.alreadyAttached")}`
              : t(meQuery.data?.user.language ?? "en", "offlineQueue.noneAttached"),
          ),
          comparisonRow("liveChecklistCount", "Pending attach", selectedOfflineQueueServerCollaboration.checklistInstances.length),
        ];
      }
      case "makeReadyChecklistUpdate": {
        const payload = selectedOfflineQueueJob.payload;
        const liveChecklistItem = selectedOfflineQueueServerCollaboration.checklistInstances
          .flatMap((instance) => instance.items)
          .find((entry) => entry.id === payload.checklistItemId) ?? null;
        return [
          comparisonRow("checklistItemId", payload.checklistItemId, liveChecklistItem?.id ?? null),
          comparisonRow("completed", payload.input.completed ?? null, liveChecklistItem?.completed ?? null),
          comparisonRow("notes", payload.input.notes ?? null, liveChecklistItem?.notes ?? null),
          comparisonRow("completedAt", t(meQuery.data?.user.language ?? "en", "offlineQueue.pendingSync"), liveChecklistItem?.completedAt ?? null),
        ];
      }
      default:
        return [];
    }
  }, [selectedOfflineQueueJob, selectedOfflineQueueServerCollaboration]);

  const selectedOfflineQueueUploadReview = useMemo<OfflineQueueUploadReview | null>(() => {
    if (!selectedOfflineQueueJob) {
      return null;
    }
    const buildReview = (recordLabel: string, queuedFiles: string[], liveFiles: string[]) => {
      const normalizedLiveNames = new Set(liveFiles.map((name) => name.trim().toLowerCase()).filter(Boolean));
      const duplicateFiles = queuedFiles.filter((name) => normalizedLiveNames.has(name.trim().toLowerCase()));
      return { recordLabel, queuedFiles, liveFiles, duplicateFiles };
    };
    switch (selectedOfflineQueueJob.payload.kind) {
      case "makeReadyUpload":
        if (!selectedOfflineQueueServerCollaboration) return null;
        return buildReview(
          `Item ${selectedOfflineQueueJob.payload.itemId}`,
          selectedOfflineQueueJob.payload.files.map((file) => file.name),
          selectedOfflineQueueServerCollaboration.attachments.map((attachment) => attachment.originalName),
        );
      case "projectUpload":
        if (!selectedOfflineQueueServerProjectRecord) return null;
        return buildReview(
          selectedOfflineQueueServerProjectRecord.title,
          selectedOfflineQueueJob.payload.files.map((file) => file.name),
          selectedOfflineQueueServerProjectRecord.attachments.map((attachment) => attachment.originalName),
        );
      case "leaseUpload":
        if (!selectedOfflineQueueServerLeaseIssue) return null;
        return buildReview(
          selectedOfflineQueueServerLeaseIssue.unit?.number ?? selectedOfflineQueueServerLeaseIssue.area ?? selectedOfflineQueueServerLeaseIssue.building ?? selectedOfflineQueueServerLeaseIssue.issueTypeName,
          selectedOfflineQueueJob.payload.files.map((file) => file.name),
          selectedOfflineQueueServerLeaseIssue.photos.map((photo) => photo.originalName),
        );
      case "pestUpload":
        if (!selectedOfflineQueueServerPestIssue) return null;
        return buildReview(
          selectedOfflineQueueServerPestIssue.unit?.number ?? selectedOfflineQueueServerPestIssue.area ?? selectedOfflineQueueServerPestIssue.pestType,
          selectedOfflineQueueJob.payload.files.map((file) => file.name),
          selectedOfflineQueueServerPestIssue.attachments.map((attachment) => attachment.originalName),
        );
      case "poolUpload":
        if (!selectedOfflineQueueServerPoolEntry) return null;
        return buildReview(
          `${selectedOfflineQueueServerPoolEntry.facility.name} ${new Date(selectedOfflineQueueServerPoolEntry.logDate).toLocaleDateString()}`,
          selectedOfflineQueueJob.payload.files.map((file) => file.name),
          selectedOfflineQueueServerPoolEntry.attachments.map((attachment) => attachment.originalName),
        );
      case "pmUpload":
        if (!selectedOfflineQueueServerPmTask) return null;
        return buildReview(
          selectedOfflineQueueServerPmTask.taskName,
          selectedOfflineQueueJob.payload.files.map((file) => file.name),
          selectedOfflineQueueServerPmTask.attachments.map((attachment) => attachment.originalName),
        );
      default:
        return null;
    }
  }, [
    selectedOfflineQueueJob,
    selectedOfflineQueueServerCollaboration,
    selectedOfflineQueueServerLeaseIssue,
    selectedOfflineQueueServerPestIssue,
    selectedOfflineQueueServerPmTask,
    selectedOfflineQueueServerPoolEntry,
    selectedOfflineQueueServerProjectRecord,
  ]);

  useEffect(() => {
    const handleOpenProjectRecord = (event: Event) => {
      const detail = (event as CustomEvent<OpenProjectRecordRequest>).detail;
      if (!detail?.id) return;
      if (detail.propertyId) setPropertyId(detail.propertyId);
      setProjectRecordRequest({ ...detail, nonce: Date.now() });
      setAppView("projects");
    };
    window.addEventListener(openProjectRecordEventName, handleOpenProjectRecord as EventListener);
    return () => window.removeEventListener(openProjectRecordEventName, handleOpenProjectRecord as EventListener);
  }, []);

  useEffect(() => {
    const handleOpenProjectCreate = (event: Event) => {
      const detail = (event as CustomEvent<OpenProjectCreateRequest>).detail;
      if (!detail?.propertyId) return;
      setPropertyId(detail.propertyId);
      setProjectCreateRequest({ ...detail, nonce: Date.now() });
      setAppView("projects");
    };
    window.addEventListener(openProjectCreateEventName, handleOpenProjectCreate as EventListener);
    return () => window.removeEventListener(openProjectCreateEventName, handleOpenProjectCreate as EventListener);
  }, []);

  useEffect(() => {
    const handleOpenPestQuickAdd = (event: Event) => {
      const detail = (event as CustomEvent<OpenPestQuickAddRequest>).detail;
      if (!detail?.propertyId) return;
      setPropertyId(detail.propertyId);
      setPestQuickAddRequest({ ...detail, nonce: Date.now() });
      setAppView("pest");
    };
    window.addEventListener(openPestQuickAddEventName, handleOpenPestQuickAdd as EventListener);
    return () => window.removeEventListener(openPestQuickAddEventName, handleOpenPestQuickAdd as EventListener);
  }, []);

  useEffect(() => {
    const handleOpenPestWorkspace = (event: Event) => {
      const detail = (event as CustomEvent<OpenPestWorkspaceRequest>).detail;
      if (!detail?.propertyId) return;
      setPropertyId(detail.propertyId);
      setPestWorkspaceRequest({ ...detail, nonce: Date.now() });
      setAppView("pest");
    };
    window.addEventListener(openPestWorkspaceEventName, handleOpenPestWorkspace as EventListener);
    return () => window.removeEventListener(openPestWorkspaceEventName, handleOpenPestWorkspace as EventListener);
  }, []);

  useEffect(() => {
    const handleOpenLeaseQuickAdd = (event: Event) => {
      const detail = (event as CustomEvent<OpenLeaseQuickAddRequest>).detail;
      if (!detail?.propertyId) return;
      setPropertyId(detail.propertyId);
      setLeaseQuickAddRequest({ ...detail, nonce: Date.now() });
      setAppView("lease");
    };
    window.addEventListener(openLeaseQuickAddEventName, handleOpenLeaseQuickAdd as EventListener);
    return () => window.removeEventListener(openLeaseQuickAddEventName, handleOpenLeaseQuickAdd as EventListener);
  }, []);

  useEffect(() => {
    const handleOpenLeaseWorkspace = (event: Event) => {
      const detail = (event as CustomEvent<OpenLeaseWorkspaceRequest>).detail;
      if (!detail?.propertyId) return;
      setPropertyId(detail.propertyId);
      setLeaseWorkspaceRequest({ ...detail, nonce: Date.now() });
      setAppView("lease");
    };
    window.addEventListener(openLeaseWorkspaceEventName, handleOpenLeaseWorkspace as EventListener);
    return () => window.removeEventListener(openLeaseWorkspaceEventName, handleOpenLeaseWorkspace as EventListener);
  }, []);

  useEffect(() => {
    const handleSetActiveView = (event: Event) => {
      const detail = (event as CustomEvent<{ view?: AppView; propertyId?: string }>).detail;
      if (!detail?.view) return;
      if (detail.propertyId) setPropertyId(detail.propertyId);
      setAppView(detail.view);
    };
    window.addEventListener("makereadyos:set-active-view", handleSetActiveView as EventListener);
    return () => window.removeEventListener("makereadyos:set-active-view", handleSetActiveView as EventListener);
  }, []);

  useEffect(() => {
    const applyHistoryState = (state: NavigationHistoryState | null | undefined) => {
      const nextView = isAppView(state?.view) ? state.view : "table";
      const nextSelectedItemId = typeof state?.selectedItemId === "string" ? state.selectedItemId : null;
      suppressHistorySyncRef.current = true;
      setActiveView(nextView);
      setSelectedItemId(nextSelectedItemId);
    };

    const initialState = window.history.state as NavigationHistoryState | null;
    if (initialState && (isAppView(initialState.view) || typeof initialState.selectedItemId === "string")) {
      applyHistoryState(initialState);
    } else {
      window.history.replaceState({ view: activeView, selectedItemId }, "", window.location.href);
    }

    const handlePopState = (event: PopStateEvent) => {
      applyHistoryState((event.state as NavigationHistoryState | null) ?? null);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const nextState: NavigationHistoryState = { view: activeView, selectedItemId };
    if (!hasInitializedHistoryRef.current) {
      hasInitializedHistoryRef.current = true;
      window.history.replaceState(nextState, "", window.location.href);
      return;
    }
    if (suppressHistorySyncRef.current) {
      suppressHistorySyncRef.current = false;
      window.history.replaceState(nextState, "", window.location.href);
      return;
    }
    const current = window.history.state as NavigationHistoryState | null;
    if (current?.view === nextState.view && (current?.selectedItemId ?? null) === nextState.selectedItemId) {
      return;
    }
    window.history.pushState(nextState, "", window.location.href);
  }, [activeView, selectedItemId]);

  const metaQuery = useQuery({
    queryKey: ["meta"],
    queryFn: getMeta,
    enabled: meQuery.isSuccess,
    initialData: readCachedMeta,
  });
  useEffect(() => {
    if (metaQuery.data) {
      writeCachedMeta(metaQuery.data);
    }
  }, [metaQuery.data]);

  const itemServerFilters = useMemo(() => ({
    propertyId: propertyId || undefined,
    q: deferredSearch || undefined,
    includeArchived: structuredFilters.archiveState !== "active" || activeView === "operations",
    boardSection: structuredFilters.boardSection || undefined,
    vacancyStatus: structuredFilters.vacancyStatus || undefined,
    assignedTech: structuredFilters.assignedTech || undefined,
    scopeLevel: scopeLevelFilter || undefined,
    makeReadyStatus: structuredFilters.makeReadyStatus || undefined,
    riskLevel: structuredFilters.riskLevel || undefined,
    riskCategory: structuredFilters.riskCategory || undefined,
    moveInWindow: structuredFilters.moveInWindow || undefined,
    overdueOnly: structuredFilters.overdueOnly,
    missingDatesOnly: structuredFilters.missingDatesOnly,
    pestIssuesOnly: structuredFilters.pestIssuesOnly,
    flooringNeededOnly: structuredFilters.flooringNeededOnly,
    paintNeededOnly: structuredFilters.paintNeededOnly,
    moveInRiskOnly: structuredFilters.moveInRiskOnly,
    customFieldFilters: structuredFilters.customFieldFilters,
  }), [
    activeView,
    deferredSearch,
    propertyId,
    scopeLevelFilter,
    structuredFilters.archiveState,
    structuredFilters.assignedTech,
    structuredFilters.boardSection,
    structuredFilters.flooringNeededOnly,
    structuredFilters.makeReadyStatus,
    structuredFilters.missingDatesOnly,
    structuredFilters.moveInRiskOnly,
    structuredFilters.moveInWindow,
    structuredFilters.overdueOnly,
    structuredFilters.paintNeededOnly,
    structuredFilters.pestIssuesOnly,
    structuredFilters.riskLevel,
    structuredFilters.riskCategory,
    structuredFilters.vacancyStatus,
    structuredFilters.customFieldFilters,
  ]);

  const effectiveItemServerFilters = useMemo(() => ({
    ...itemServerFilters,
    ...(boardWindowedMode ? {
      limit: boardWindowLimit,
      offset: 0,
      ...(serverSortableItemFields.has(sortKey) ? { sortBy: sortKey as NonNullable<Parameters<typeof getMakeReadyItemPage>[0]["sortBy"]>, sortDirection } : {}),
    } : {}),
  }), [boardWindowLimit, boardWindowedMode, itemServerFilters, sortDirection, sortKey]);

  const itemsQuery = useQuery({
    queryKey: ["make-ready-items", effectiveItemServerFilters],
    queryFn: () => getMakeReadyItemPage(effectiveItemServerFilters),
    enabled: meQuery.isSuccess,
  });
  const boardItems = itemsQuery.data?.items ?? [];
  const boardPagination = itemsQuery.data?.pagination;

  const savedViewsQuery = useQuery({
    queryKey: ["saved-views"],
    queryFn: () => getSavedViews({ includeArchived: true }),
    enabled: meQuery.isSuccess,
  });
  const dashboardQuery = useQuery({
    queryKey: ["dashboard", propertyId],
    queryFn: () => getDashboard(propertyId || undefined),
    enabled: meQuery.isSuccess && activeView === "dashboard",
  });
  const analyticsQuery = useQuery({
    queryKey: ["analytics-summary", propertyId],
    queryFn: () => getAnalyticsSummary(propertyId || undefined),
    enabled: meQuery.isSuccess && activeView === "dashboard",
  });
  const notificationsQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: () => getNotifications(),
    enabled: meQuery.isSuccess,
    refetchInterval: 60000,
  });
  const myWorkQuery = useQuery({
    queryKey: ["my-work", myWorkUserId],
    queryFn: () => getMyWork(myWorkUserId || undefined),
    enabled: meQuery.isSuccess && activeView === "mywork",
  });

  const planningQuery = useQuery({
    queryKey: ["planning", propertyId],
    queryFn: () => getPlanning({ propertyId: propertyId || undefined }),
    enabled: meQuery.isSuccess && activeView === "planning",
  });

  const operationsPropertiesQuery = useQuery({
    queryKey: ["operations", "properties"],
    queryFn: () => getOperationsProperties(true),
    enabled: meQuery.isSuccess
      && (meQuery.data?.user.role === "ADMIN" || meQuery.data?.user.role === "MANAGER")
      && activeView === "operations",
  });

  const operationsUnitsQuery = useQuery({
    queryKey: ["operations", "units"],
    queryFn: () => getOperationsUnits(undefined, true),
    enabled: meQuery.isSuccess
      && (meQuery.data?.user.role === "ADMIN" || meQuery.data?.user.role === "MANAGER")
      && activeView === "operations",
  });

  const operationsOptionsQuery = useQuery({
    queryKey: ["operations", "options"],
    queryFn: getBoardOptions,
    enabled: meQuery.isSuccess
      && (meQuery.data?.user.role === "ADMIN" || meQuery.data?.user.role === "MANAGER")
      && activeView === "operations",
  });

  const floorPlansQuery = useQuery({
    queryKey: ["operations", "floor-plans"],
    queryFn: () => getFloorPlans(undefined, true),
    enabled: meQuery.isSuccess
      && (meQuery.data?.user.role === "ADMIN" || meQuery.data?.user.role === "MANAGER")
      && ["table", "kanban", "calendar", "maps", "pond", "operations", "mywork"].includes(activeView),
  });

  const vendorsQuery = useQuery({
    queryKey: ["vendors", propertyId],
    queryFn: () => getVendors({ propertyId: propertyId || undefined, includeArchived: true }),
    enabled: meQuery.isSuccess && ["vendors", "table", "kanban", "calendar", "maps", "dashboard", "mywork", "planning"].includes(activeView),
  });

  const vendorAssignmentsQuery = useQuery({
    queryKey: ["vendor-assignments", propertyId],
    queryFn: () => getVendorAssignments({ propertyId: propertyId || undefined, includeCompleted: activeView === "vendors", limit: 200 }),
    enabled: meQuery.isSuccess && ["vendors", "table", "kanban", "calendar", "maps", "dashboard", "mywork", "planning"].includes(activeView),
  });

  const propertyMapsQuery = useQuery({
    queryKey: ["property-maps", propertyId],
    queryFn: () => getPropertyMaps({ propertyId: propertyId || undefined, includeArchived: true }),
    enabled: meQuery.isSuccess && ["maps", "dashboard"].includes(activeView),
  });

  const unitMapLocationsQuery = useQuery({
    queryKey: ["unit-map-locations", propertyId],
    queryFn: () => getUnitMapLocations({ propertyId: propertyId || undefined, includeArchived: false }),
    enabled: meQuery.isSuccess && ["maps", "dashboard"].includes(activeView),
  });

  const propertyMapAreasQuery = useQuery({
    queryKey: ["property-map-areas", propertyId],
    queryFn: () => getPropertyMapAreas({ propertyId: propertyId || undefined, includeArchived: false }),
    enabled: meQuery.isSuccess && ["maps", "dashboard"].includes(activeView),
  });

  const scheduleTracksQuery = useQuery({
    queryKey: ["operations", "schedule-tracks"],
    queryFn: getScheduleTracks,
    enabled: meQuery.isSuccess
      && (meQuery.data?.user.role === "ADMIN" || meQuery.data?.user.role === "MANAGER")
      && activeView === "operations",
  });

  const operatingCalendarsQuery = useQuery({
    queryKey: ["operations", "operating-calendars"],
    queryFn: () => getOperatingCalendars(undefined, true),
    enabled: meQuery.isSuccess
      && (meQuery.data?.user.role === "ADMIN" || meQuery.data?.user.role === "MANAGER")
      && activeView === "operations",
  });

  const riskPoliciesQuery = useQuery({
    queryKey: ["operations", "risk-policies"],
    queryFn: () => getRiskPolicies(),
    enabled: meQuery.isSuccess
      && (meQuery.data?.user.role === "ADMIN" || meQuery.data?.user.role === "MANAGER")
      && activeView === "operations",
  });

  const adminUsersQuery = useQuery({
    queryKey: ["admin", "users"],
    queryFn: getAdminUsers,
    enabled: meQuery.isSuccess && meQuery.data?.user.role === "ADMIN" && activeView === "admin",
  });

  const adminPropertiesQuery = useQuery({
    queryKey: ["admin", "properties"],
    queryFn: getAdminProperties,
    enabled: meQuery.isSuccess && meQuery.data?.user.role === "ADMIN" && activeView === "admin",
  });

  const customFieldsQuery = useQuery({
    queryKey: ["custom-fields", "manage"],
    queryFn: () => getCustomFields(true, true),
    enabled: meQuery.isSuccess
      && (meQuery.data?.user.role === "ADMIN" || meQuery.data?.user.role === "MANAGER")
      && activeView === "fields",
  });

  const automationsQuery = useQuery({
    queryKey: ["automations"],
    queryFn: () => getAutomations(false),
    enabled: meQuery.isSuccess
      && (meQuery.data?.user.role === "ADMIN" || meQuery.data?.user.role === "MANAGER")
      && activeView === "automations",
  });

  const automationRunsQuery = useQuery({
    queryKey: ["automations", "runs", automationRuleId],
    queryFn: () => getAutomationRuns(automationRuleId),
    enabled: meQuery.isSuccess
      && (meQuery.data?.user.role === "ADMIN" || meQuery.data?.user.role === "MANAGER")
      && activeView === "automations",
  });

  const automationTemplatesQuery = useQuery({
    queryKey: ["automations", "templates"],
    queryFn: getAutomationTemplates,
    enabled: meQuery.isSuccess
      && (meQuery.data?.user.role === "ADMIN" || meQuery.data?.user.role === "MANAGER")
      && activeView === "automations",
  });

  const operationalLibraryQuery = useQuery({
    queryKey: ["operational-library", "packs"],
    queryFn: getOperationalLibraryPacks,
    enabled: meQuery.isSuccess
      && (meQuery.data?.user.role === "ADMIN" || meQuery.data?.user.role === "MANAGER")
      && activeView === "automations",
  });

  const propertyTemplatesQuery = useQuery({
    queryKey: ["property-templates"],
    queryFn: () => getPropertyTemplates(true),
    enabled: meQuery.isSuccess
      && (meQuery.data?.user.role === "ADMIN" || meQuery.data?.user.role === "MANAGER")
      && activeView === "automations",
  });

  const loginMutation = useMutation({
    mutationFn: ({ identifier, password }: { identifier: string; password: string }) => login(identifier, password),
    onSuccess: async () => {
      setForceLoggedOut(false);
      setLoginError("");
      setSessionMessage("");
      pushToast(t(meQuery.data?.user.language ?? "en", "auth.signedIn"), t(meQuery.data?.user.language ?? "en", "auth.signedInCopy"), "success");
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      await queryClient.invalidateQueries({ queryKey: ["meta"] });
      await queryClient.invalidateQueries({ queryKey: ["make-ready-items"] });
      await queryClient.invalidateQueries({ queryKey: ["saved-views"] });
    },
    onError: (error) => {
      setLoginError(error instanceof Error ? error.message : t(meQuery.data?.user.language ?? "en", "auth.signInFailed"));
      pushToast(t(meQuery.data?.user.language ?? "en", "auth.signInFailed"), error instanceof Error ? error.message : t(meQuery.data?.user.language ?? "en", "auth.signInFailed"), "error");
    },
  });

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      pushToast(t(meQuery.data?.user.language ?? "en", "auth.signedOut"), t(meQuery.data?.user.language ?? "en", "auth.signedOutCopy"), "info");
      setSessionMessage(t(meQuery.data?.user.language ?? "en", "auth.signedOutMessage"));
      setForceLoggedOut(true);
      queryClient.setQueryData(["auth", "me"], null);
      queryClient.setQueryData(["meta"], undefined);
      queryClient.setQueryData(["make-ready-items"], undefined);
      queryClient.setQueryData(["saved-views"], undefined);
      queryClient.setQueryData(["admin", "users"], undefined);
      queryClient.setQueryData(["admin", "properties"], undefined);
      queryClient.setQueryData(["custom-fields", "manage"], undefined);
      queryClient.setQueryData(["automations"], undefined);
      setAutomationPreview(null);
      queryClient.removeQueries({ queryKey: ["auth", "me"] });
      queryClient.removeQueries({ queryKey: ["meta"] });
      queryClient.removeQueries({ queryKey: ["make-ready-items"] });
      queryClient.removeQueries({ queryKey: ["saved-views"] });
      queryClient.removeQueries({ queryKey: ["admin"] });
      queryClient.removeQueries({ queryKey: ["custom-fields"] });
      queryClient.removeQueries({ queryKey: ["automations"] });
      removeStorageValue(metaCacheStorageKey);
    },
    onError: (error) => {
      pushToast(t(meQuery.data?.user.language ?? "en", "auth.logoutFailed"), error instanceof Error ? error.message : t(meQuery.data?.user.language ?? "en", "auth.logoutFailed"), "error");
    },
  });

  const patchMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      try {
        await patchMakeReadyItem(id, data);
        return { queued: false };
      } catch (error) {
        if (isApiError(error) && error.status === 0) {
          await enqueueMakeReadyPatch(id, data);
          return { queued: true };
        }
        throw error;
      }
    },
    onSuccess: (result, variables) => {
      const field = Object.keys(variables.data)[0] ?? "item";
      if (result.queued) {
        applyQueuedMakeReadyPatch(variables.id, variables.data);
        pushToast(
          t(meQuery.data?.user.language ?? "en", "updates.changeQueued"),
          tWithVars(meQuery.data?.user.language ?? "en", "updates.changeQueuedCopy", { field: humanizeField(field) }),
          "info",
        );
        return;
      }
      const title = activeView === "kanban"
        ? t(meQuery.data?.user.language ?? "en", "updates.cardMoved")
        : t(meQuery.data?.user.language ?? "en", "updates.itemUpdated");
      pushToast(title, tWithVars(meQuery.data?.user.language ?? "en", "updates.fieldSaved", { field: humanizeField(field) }), "success");
      queryClient.invalidateQueries({ queryKey: ["make-ready-items"] });
    },
    onError: (error) => {
      if (isApiError(error) && error.status === 401) {
        handleSessionExpired();
        return;
      }
      pushToast(t(meQuery.data?.user.language ?? "en", "updates.updateFailed"), error instanceof Error ? error.message : t(meQuery.data?.user.language ?? "en", "updates.updateFailed"), "error");
    },
  });

  const markReadyMutation = useMutation({
    mutationFn: markMakeReadyItemReady,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["make-ready-items"] });
      await queryClient.invalidateQueries({ queryKey: ["activity"] });
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      pushToast(t(meQuery.data?.user.language ?? "en", "updates.unitMarkedReady"), t(meQuery.data?.user.language ?? "en", "updates.unitMarkedReadyCopy"), "success");
    },
    onError: (error) => {
      pushToast(t(meQuery.data?.user.language ?? "en", "updates.markReadyFailed"), error instanceof Error ? error.message : t(meQuery.data?.user.language ?? "en", "updates.markReadyFailedCopy"), "error");
    },
  });

  const customValueMutation = useMutation({
    mutationFn: ({ itemId, fieldId, value }: { itemId: string; fieldId: string; value: unknown }) => updateCustomFieldValue(itemId, fieldId, value),
    onSuccess: async () => {
      pushToast(t(meQuery.data?.user.language ?? "en", "updates.customValueUpdated"), t(meQuery.data?.user.language ?? "en", "updates.customValueUpdatedCopy"), "success");
      await queryClient.invalidateQueries({ queryKey: ["make-ready-items"] });
    },
    onError: (error) => {
      pushToast(t(meQuery.data?.user.language ?? "en", "updates.customValueFailed"), error instanceof Error ? error.message : t(meQuery.data?.user.language ?? "en", "updates.customValueFailedCopy"), "error");
    },
  });

  const assignFloorPlan = async (item: MakeReadyItem, floorPlanId: string) => {
    if (!item.unitId) {
      throw new Error("This turnover item must be linked to a unit before assigning a managed floor plan.");
    }
    const result = await updateUnitMutation.mutateAsync({ id: item.unitId, data: { floorPlanId } });
    await patchMutation.mutateAsync({ id: item.id, data: { floorPlan: result.unit.floorPlan } });
  };

  const refreshOperations = async (message: string) => {
    setOperationsError("");
    setOperationsMessage(message);
    await queryClient.invalidateQueries({ queryKey: ["operations"] });
    await queryClient.invalidateQueries({ queryKey: ["meta"] });
    await queryClient.invalidateQueries({ queryKey: ["make-ready-items"] });
    await queryClient.invalidateQueries({ queryKey: ["activity"] });
  };

  const createPropertyMutation = useMutation({
    mutationFn: createProperty,
    onSuccess: async (data) => {
      await refreshOperations(`Created property ${data.property.code}`);
      pushToast(t(meQuery.data?.user.language ?? "en", "ops.propertyCreated"), tWithVars(meQuery.data?.user.language ?? "en", "ops.propertyCreatedCopy", { name: data.property.name }), "success");
    },
    onError: (error) => {
      setOperationsError(error instanceof Error ? error.message : "Property creation failed");
      pushToast(t(meQuery.data?.user.language ?? "en", "ops.propertyCreationFailed"), error instanceof Error ? error.message : undefined, "error");
    },
  });

  const updatePropertyMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateProperty>[1] }) => updateProperty(id, data),
    onSuccess: async (data) => {
      await refreshOperations(`Updated property ${data.property.code}`);
      pushToast(t(meQuery.data?.user.language ?? "en", "ops.propertyUpdated"), tWithVars(meQuery.data?.user.language ?? "en", "ops.propertyUpdatedCopy", { name: data.property.name }), "success");
    },
    onError: (error) => {
      setOperationsError(error instanceof Error ? error.message : "Property update failed");
      pushToast(t(meQuery.data?.user.language ?? "en", "ops.propertyUpdateFailed"), error instanceof Error ? error.message : undefined, "error");
    },
  });

  const propertyLifecycleMutation = useMutation({
    mutationFn: ({ id, restore }: { id: string; restore: boolean }) => restore ? restoreProperty(id) : archiveProperty(id),
    onSuccess: async (data) => {
      await refreshOperations(`${data.property.isActive ? "Restored" : "Archived"} property ${data.property.code}`);
      pushToast(t(meQuery.data?.user.language ?? "en", "ops.propertyStatusUpdated"), tWithVars(meQuery.data?.user.language ?? "en", "ops.propertyStatusUpdatedCopy", { code: data.property.code, status: data.property.isActive ? t(meQuery.data?.user.language ?? "en", "ops.active") : t(meQuery.data?.user.language ?? "en", "ops.archived") }), "info");
    },
    onError: (error) => {
      setOperationsError(error instanceof Error ? error.message : "Property status update failed");
      pushToast(t(meQuery.data?.user.language ?? "en", "ops.propertyStatusFailed"), error instanceof Error ? error.message : undefined, "error");
    },
  });

  const deletePropertyMutation = useMutation({
    mutationFn: deleteProperty,
    onSuccess: async () => {
      await refreshOperations("Deleted archived property");
      pushToast(t(meQuery.data?.user.language ?? "en", "ops.propertyDeleted"), t(meQuery.data?.user.language ?? "en", "ops.propertyDeletedCopy"), "info");
    },
    onError: (error) => {
      setOperationsError(error instanceof Error ? error.message : "Property deletion failed");
      pushToast(t(meQuery.data?.user.language ?? "en", "ops.propertyDeletionBlocked"), error instanceof Error ? error.message : undefined, "error");
    },
  });

  const createUnitMutation = useMutation({
    mutationFn: createUnit,
    onSuccess: async (data) => {
      await refreshOperations(`Created unit ${data.unit.number}`);
      pushToast(t(meQuery.data?.user.language ?? "en", "ops.unitCreated"), tWithVars(meQuery.data?.user.language ?? "en", "ops.unitCreatedCopy", { property: data.unit.property.code, unit: data.unit.number }), "success");
    },
    onError: (error) => {
      setOperationsError(error instanceof Error ? error.message : "Unit creation failed");
      pushToast(t(meQuery.data?.user.language ?? "en", "ops.unitCreationFailed"), error instanceof Error ? error.message : undefined, "error");
    },
  });

  const updateUnitMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateUnit>[1] }) => updateUnit(id, data),
    onSuccess: async (data) => {
      await refreshOperations(`Updated unit ${data.unit.number}`);
      pushToast(t(meQuery.data?.user.language ?? "en", "ops.unitUpdated"), tWithVars(meQuery.data?.user.language ?? "en", "ops.unitUpdatedCopy", { unit: data.unit.number }), "success");
    },
    onError: (error) => {
      setOperationsError(error instanceof Error ? error.message : "Unit update failed");
      pushToast(t(meQuery.data?.user.language ?? "en", "ops.unitUpdateFailed"), error instanceof Error ? error.message : undefined, "error");
    },
  });

  const importUnitsMutation = useMutation({
    mutationFn: importUnits,
    onSuccess: async (data) => {
      await refreshOperations(`Imported unit directory: ${data.summary.created} created, ${data.summary.updated} updated`);
      const floorPlanSummary = data.summary.floorPlansCreated || data.summary.floorPlansUpdated
        ? ` ${data.summary.floorPlansCreated ?? 0} floor plans created, ${data.summary.floorPlansUpdated ?? 0} updated.`
        : "";
      pushToast(t(meQuery.data?.user.language ?? "en", "ops.unitDirectoryImported"), tWithVars(meQuery.data?.user.language ?? "en", "ops.unitDirectoryImportedCopy", { created: String(data.summary.created), updated: String(data.summary.updated), skipped: String(data.summary.skipped), extra: floorPlanSummary }), "success");
    },
    onError: (error) => {
      setOperationsError(error instanceof Error ? error.message : "Unit import failed");
      pushToast(t(meQuery.data?.user.language ?? "en", "ops.unitImportFailed"), error instanceof Error ? error.message : undefined, "error");
    },
  });

  const importAvailabilityMutation = useMutation({
    mutationFn: importAvailability,
    onSuccess: async (data) => {
      await Promise.all([
        refreshOperations(`Imported availability: ${data.summary.turnsCreated} turns created, ${data.summary.turnsUpdated} updated`),
        queryClient.invalidateQueries({ queryKey: ["make-ready-items"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
      const floorPlanSummary = data.summary.floorPlansCreated || data.summary.floorPlansUpdated
        ? ` ${data.summary.floorPlansCreated ?? 0} floor plans created, ${data.summary.floorPlansUpdated ?? 0} updated.`
        : "";
      pushToast(t(meQuery.data?.user.language ?? "en", "ops.availabilityImported"), tWithVars(meQuery.data?.user.language ?? "en", "ops.availabilityImportedCopy", { created: String(data.summary.turnsCreated), updated: String(data.summary.turnsUpdated), skipped: String(data.summary.skipped), extra: floorPlanSummary }), "success");
    },
    onError: (error) => {
      setOperationsError(error instanceof Error ? error.message : "Availability import failed");
      if (isApiError(error) && error.status === 409) {
        pushToast(t(meQuery.data?.user.language ?? "en", "ops.availabilityImportBlocked"), error.message, "info");
        return;
      }
      pushToast(t(meQuery.data?.user.language ?? "en", "ops.availabilityImportFailed"), error instanceof Error ? error.message : undefined, "error");
    },
  });

  const revertUnitImportMutation = useMutation({
    mutationFn: revertUnitImport,
    onSuccess: async (data) => {
      await refreshOperations(`Reverted unit directory import: ${data.summary.deleted} created units removed`);
      const blocked = data.summary.blocked.length ? ` ${data.summary.blocked.length} linked units were kept.` : "";
      pushToast(t(meQuery.data?.user.language ?? "en", "ops.unitImportReverted"), tWithVars(meQuery.data?.user.language ?? "en", "ops.unitImportRevertedCopy", { deleted: String(data.summary.deleted), blocked }), "info");
    },
    onError: (error) => {
      setOperationsError(error instanceof Error ? error.message : "Unit import revert failed");
      pushToast(t(meQuery.data?.user.language ?? "en", "ops.importRevertFailed"), error instanceof Error ? error.message : undefined, "error");
    },
  });

  const unitLifecycleMutation = useMutation({
    mutationFn: ({ id, restore }: { id: string; restore: boolean }) => restore ? restoreUnit(id) : archiveUnit(id),
    onSuccess: async (data) => {
      await refreshOperations(`${data.unit.isActive ? "Restored" : "Archived"} unit ${data.unit.number}`);
      pushToast(t(meQuery.data?.user.language ?? "en", "ops.unitStatusUpdated"), tWithVars(meQuery.data?.user.language ?? "en", "ops.unitStatusUpdatedCopy", { unit: data.unit.number, status: data.unit.isActive ? t(meQuery.data?.user.language ?? "en", "ops.active") : t(meQuery.data?.user.language ?? "en", "ops.archived") }), "info");
    },
    onError: (error) => {
      setOperationsError(error instanceof Error ? error.message : "Unit status update failed");
      pushToast(t(meQuery.data?.user.language ?? "en", "ops.unitStatusFailed"), error instanceof Error ? error.message : undefined, "error");
    },
  });

  const deleteUnitMutation = useMutation({
    mutationFn: deleteUnit,
    onSuccess: async () => {
      await refreshOperations("Deleted archived unit");
      pushToast(t(meQuery.data?.user.language ?? "en", "ops.unitDeleted"), t(meQuery.data?.user.language ?? "en", "ops.unitDeletedCopy"), "info");
    },
    onError: (error) => {
      setOperationsError(error instanceof Error ? error.message : "Unit deletion failed");
      pushToast(t(meQuery.data?.user.language ?? "en", "ops.unitDeletionBlocked"), error instanceof Error ? error.message : undefined, "error");
    },
  });

  const createItemMutation = useMutation({
    mutationFn: createMakeReadyItem,
    onSuccess: async (data) => {
      await refreshOperations(`Created make-ready item ${data.unitNumber}`);
      pushToast(t(meQuery.data?.user.language ?? "en", "ops.turnCreated"), tWithVars(meQuery.data?.user.language ?? "en", "ops.turnCreatedCopy", { unit: data.unitNumber }), "success");
    },
    onError: (error) => {
      setOperationsError(error instanceof Error ? error.message : "Turn creation failed");
      pushToast(t(meQuery.data?.user.language ?? "en", "ops.turnCreationFailed"), error instanceof Error ? error.message : undefined, "error");
    },
  });

  const itemLifecycleMutation = useMutation({
    mutationFn: ({ id, restore }: { id: string; restore: boolean }) => restore ? restoreMakeReadyItem(id) : archiveMakeReadyItem(id),
    onSuccess: async (data) => {
      await refreshOperations(`${data.isArchived ? "Archived" : "Restored"} make-ready item ${data.unitNumber}`);
      pushToast(t(meQuery.data?.user.language ?? "en", "ops.turnStatusUpdated"), tWithVars(meQuery.data?.user.language ?? "en", "ops.turnStatusUpdatedCopy", { unit: data.unitNumber, status: data.isArchived ? t(meQuery.data?.user.language ?? "en", "ops.archived") : t(meQuery.data?.user.language ?? "en", "ops.active") }), "info");
    },
    onError: (error) => {
      setOperationsError(error instanceof Error ? error.message : "Turn status update failed");
      pushToast(t(meQuery.data?.user.language ?? "en", "ops.turnStatusFailed"), error instanceof Error ? error.message : undefined, "error");
    },
  });

  const batchItemsMutation = useMutation({
    mutationFn: batchMakeReadyItems,
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["make-ready-items"] });
      await queryClient.invalidateQueries({ queryKey: ["activity"] });
      pushToast(t(meQuery.data?.user.language ?? "en", "ops.batchUpdateComplete"), tWithVars(meQuery.data?.user.language ?? "en", "ops.batchUpdateCompleteCopy", { count: String(data.count) }), "success");
    },
    onError: (error) => pushToast(t(meQuery.data?.user.language ?? "en", "ops.batchUpdateFailed"), error instanceof Error ? error.message : undefined, "error"),
  });
  const renameSectionMutation = useMutation({
    mutationFn: ({ id, displayName }: { id: string; displayName: string }) => updateBoardSection(id, displayName),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["meta"] });
      pushToast(t(meQuery.data?.user.language ?? "en", "ops.sectionRenamed"), tWithVars(meQuery.data?.user.language ?? "en", "ops.sectionRenamedCopy", { name: data.section.displayName }), "success");
    },
    onError: (error) => pushToast(t(meQuery.data?.user.language ?? "en", "ops.sectionRenameFailed"), error instanceof Error ? error.message : undefined, "error"),
  });
  const readNotificationMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const readAllNotificationsMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const dismissNotificationMutation = useMutation({
    mutationFn: dismissNotification,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const notificationPreferenceMutation = useMutation({
    mutationFn: ({ category, enabled, propertyId }: { category: string; enabled: boolean; propertyId?: string | null }) => updateNotificationPreference(category, enabled, propertyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      pushToast(t(meQuery.data?.user.language ?? "en", "ops.preferenceUpdated"), t(meQuery.data?.user.language ?? "en", "ops.preferenceUpdatedCopy"), "success");
    },
    onError: (error) => pushToast(t(meQuery.data?.user.language ?? "en", "ops.preferenceUpdateFailed"), error instanceof Error ? error.message : undefined, "error"),
  });
  const notificationSettingsMutation = useMutation({
    mutationFn: updateNotificationSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      pushToast(
        t(meQuery.data?.user.language ?? "en", "ops.preferenceUpdated"),
        meQuery.data?.user.language === "es" ? "Las horas de silencio se guardaron." : "Quiet hours were saved.",
        "success",
      );
    },
    onError: (error) => pushToast(t(meQuery.data?.user.language ?? "en", "ops.preferenceUpdateFailed"), error instanceof Error ? error.message : undefined, "error"),
  });

  const optionCreateMutation = useMutation({
    mutationFn: createBoardOption,
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["operations", "options"] });
      await queryClient.invalidateQueries({ queryKey: ["meta"] });
      pushToast(t(meQuery.data?.user.language ?? "en", "ops.labelAdded"), tWithVars(meQuery.data?.user.language ?? "en", "ops.labelAddedCopy", { name: data.option.value }), "success");
    },
    onError: (error) => pushToast(t(meQuery.data?.user.language ?? "en", "ops.labelCreationFailed"), error instanceof Error ? error.message : undefined, "error"),
  });
  const optionUpdateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateBoardOption>[1] }) => updateBoardOption(id, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["operations", "options"] });
      await queryClient.invalidateQueries({ queryKey: ["meta"] });
      pushToast(t(meQuery.data?.user.language ?? "en", "ops.labelUpdated"), t(meQuery.data?.user.language ?? "en", "ops.labelUpdatedCopy"), "success");
    },
    onError: (error) => pushToast(t(meQuery.data?.user.language ?? "en", "ops.labelUpdateFailed"), error instanceof Error ? error.message : undefined, "error"),
  });
  const optionArchiveMutation = useMutation({
    mutationFn: ({ id, restore }: { id: string; restore: boolean }) => archiveBoardOption(id, restore),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["operations", "options"] });
      await queryClient.invalidateQueries({ queryKey: ["meta"] });
      pushToast(t(meQuery.data?.user.language ?? "en", "ops.labelStatusUpdated"), t(meQuery.data?.user.language ?? "en", "ops.labelStatusUpdatedCopy"), "info");
    },
    onError: (error) => pushToast(t(meQuery.data?.user.language ?? "en", "ops.labelUpdateFailed"), error instanceof Error ? error.message : undefined, "error"),
  });
  const optionReorderMutation = useMutation({
    mutationFn: reorderBoardOptions,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["operations", "options"] });
      await queryClient.invalidateQueries({ queryKey: ["meta"] });
    },
  });
  const floorPlanCreateMutation = useMutation({
    mutationFn: createFloorPlan,
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["operations", "floor-plans"] });
      pushToast(t(meQuery.data?.user.language ?? "en", "ops.floorPlanCreated"), tWithVars(meQuery.data?.user.language ?? "en", "ops.floorPlanCreatedCopy", { name: data.floorPlan.name }), "success");
    },
    onError: (error) => pushToast(t(meQuery.data?.user.language ?? "en", "ops.floorPlanCreationFailed"), error instanceof Error ? error.message : undefined, "error"),
  });
  const floorPlanUpdateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateFloorPlan>[1] }) => updateFloorPlan(id, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["operations", "floor-plans"] });
      await queryClient.invalidateQueries({ queryKey: ["meta"] });
      await queryClient.invalidateQueries({ queryKey: ["make-ready-items"] });
      pushToast(t(meQuery.data?.user.language ?? "en", "ops.floorPlanUpdated"), t(meQuery.data?.user.language ?? "en", "ops.floorPlanUpdatedCopy"), "success");
    },
    onError: (error) => pushToast(t(meQuery.data?.user.language ?? "en", "ops.floorPlanUpdateFailed"), error instanceof Error ? error.message : undefined, "error"),
  });
  const floorPlanArchiveMutation = useMutation({
    mutationFn: ({ id, restore }: { id: string; restore: boolean }) => archiveFloorPlan(id, restore),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["operations", "floor-plans"] });
      await queryClient.invalidateQueries({ queryKey: ["meta"] });
      pushToast(t(meQuery.data?.user.language ?? "en", "ops.floorPlanStatusUpdated"), t(meQuery.data?.user.language ?? "en", "ops.floorPlanStatusUpdatedCopy"), "info");
    },
    onError: (error) => pushToast(t(meQuery.data?.user.language ?? "en", "ops.floorPlanUpdateFailed"), error instanceof Error ? error.message : undefined, "error"),
  });
  const columnUpdateMutation = useMutation({
    mutationFn: ({ fieldKey, label, reset }: { fieldKey: string; label?: string; reset?: boolean }) => updateBoardColumn(fieldKey, label, reset),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["meta"] });
      pushToast(t(meQuery.data?.user.language ?? "en", "ops.columnLabelUpdated"), tWithVars(meQuery.data?.user.language ?? "en", "ops.columnLabelUpdatedCopy", { name: data.column.label }), "success");
    },
    onError: (error) => pushToast(t(meQuery.data?.user.language ?? "en", "ops.columnUpdateFailed"), error instanceof Error ? error.message : undefined, "error"),
  });
  const scheduleTrackCreateMutation = useMutation({
    mutationFn: createScheduleTrack,
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["meta"] });
      await queryClient.invalidateQueries({ queryKey: ["operations", "schedule-tracks"] });
      pushToast(t(meQuery.data?.user.language ?? "en", "ops.scheduleTrackCreated"), tWithVars(meQuery.data?.user.language ?? "en", "ops.scheduleTrackCreatedCopy", { name: data.track.displayName }), "success");
    },
    onError: (error) => pushToast(t(meQuery.data?.user.language ?? "en", "ops.scheduleTrackCreationFailed"), error instanceof Error ? error.message : undefined, "error"),
  });
  const scheduleTrackUpdateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateScheduleTrack>[1] }) => updateScheduleTrack(id, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["meta"] });
      await queryClient.invalidateQueries({ queryKey: ["operations", "schedule-tracks"] });
      pushToast(t(meQuery.data?.user.language ?? "en", "ops.scheduleTrackUpdated"), t(meQuery.data?.user.language ?? "en", "ops.scheduleTrackUpdatedCopy"), "success");
    },
    onError: (error) => pushToast(t(meQuery.data?.user.language ?? "en", "ops.scheduleTrackUpdateFailed"), error instanceof Error ? error.message : undefined, "error"),
  });
  const scheduleTrackReorderMutation = useMutation({
    mutationFn: reorderScheduleTracks,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["meta"] });
      await queryClient.invalidateQueries({ queryKey: ["operations", "schedule-tracks"] });
    },
    onError: (error) => pushToast(t(meQuery.data?.user.language ?? "en", "ops.scheduleTrackReorderFailed"), error instanceof Error ? error.message : undefined, "error"),
  });
  const scheduleTrackArchiveMutation = useMutation({
    mutationFn: ({ id, restore }: { id: string; restore: boolean }) => archiveScheduleTrack(id, restore),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["meta"] });
      await queryClient.invalidateQueries({ queryKey: ["operations", "schedule-tracks"] });
      pushToast(t(meQuery.data?.user.language ?? "en", "ops.scheduleTrackStatusUpdated"), t(meQuery.data?.user.language ?? "en", "ops.scheduleTrackStatusUpdatedCopy"), "info");
    },
    onError: (error) => pushToast(t(meQuery.data?.user.language ?? "en", "ops.scheduleTrackStatusFailed"), error instanceof Error ? error.message : undefined, "error"),
  });
  const operatingCalendarUpdateMutation = useMutation({
    mutationFn: ({ propertyId, data }: { propertyId: string; data: Parameters<typeof updateOperatingCalendar>[1] }) => updateOperatingCalendar(propertyId, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["operations", "operating-calendars"] });
      pushToast(t(meQuery.data?.user.language ?? "en", "ops.operatingCalendarSaved"), t(meQuery.data?.user.language ?? "en", "ops.operatingCalendarSavedCopy"), "success");
    },
    onError: (error) => pushToast(t(meQuery.data?.user.language ?? "en", "ops.operatingCalendarUpdateFailed"), error instanceof Error ? error.message : undefined, "error"),
  });
  const riskPolicyUpdateMutation = useMutation({
    mutationFn: ({ propertyId, data }: { propertyId: string; data: Parameters<typeof updateRiskPolicy>[1] }) => updateRiskPolicy(propertyId, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["operations", "risk-policies"] });
      await queryClient.invalidateQueries({ queryKey: ["risk"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      pushToast(t(meQuery.data?.user.language ?? "en", "ops.riskPolicySaved"), t(meQuery.data?.user.language ?? "en", "ops.riskPolicySavedCopy"), "success");
    },
    onError: (error) => pushToast(t(meQuery.data?.user.language ?? "en", "ops.riskPolicyUpdateFailed"), error instanceof Error ? error.message : undefined, "error"),
  });

  const refreshVendors = async () => {
    await queryClient.invalidateQueries({ queryKey: ["vendors"] });
    await queryClient.invalidateQueries({ queryKey: ["vendor-assignments"] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    await queryClient.invalidateQueries({ queryKey: ["make-ready-items"] });
    await queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };
  const vendorCreateMutation = useMutation({
    mutationFn: createVendor,
    onSuccess: async (data) => {
      await refreshVendors();
      pushToast(t("ops.vendorCreated", language), tWithVars("ops.vendorCreatedCopy", language, { name: data.vendor.name }), "success");
    },
    onError: (error) => pushToast(t("ops.vendorCreationFailed", language), error instanceof Error ? error.message : undefined, "error"),
  });
  const vendorArchiveMutation = useMutation({
    mutationFn: ({ id, restore }: { id: string; restore: boolean }) => archiveVendor(id, restore),
    onSuccess: async () => {
      await refreshVendors();
      pushToast(t("ops.vendorStatusUpdated", language), t("ops.vendorStatusUpdatedCopy", language), "info");
    },
    onError: (error) => pushToast(t("ops.vendorUpdateFailed", language), error instanceof Error ? error.message : undefined, "error"),
  });
  const vendorAssignmentCreateMutation = useMutation({
    mutationFn: createVendorAssignment,
    onSuccess: async () => {
      await refreshVendors();
      pushToast(t("ops.vendorWorkAdded", language), t("ops.vendorWorkAddedCopy", language), "success");
    },
    onError: (error) => pushToast(t("ops.vendorAssignmentFailed", language), error instanceof Error ? error.message : undefined, "error"),
  });
  const vendorAssignmentUpdateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateVendorAssignment>[1] }) => updateVendorAssignment(id, data),
    onSuccess: async () => {
      await refreshVendors();
      pushToast(t("ops.vendorWorkUpdated", language), t("ops.vendorWorkUpdatedCopy", language), "success");
    },
    onError: (error) => pushToast(t("ops.vendorUpdateFailed", language), error instanceof Error ? error.message : undefined, "error"),
  });

  const refreshPlanning = async () => {
    await queryClient.invalidateQueries({ queryKey: ["planning"] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    await queryClient.invalidateQueries({ queryKey: ["make-ready-items"] });
    await queryClient.invalidateQueries({ queryKey: ["my-work"] });
    await queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };
  const workBlockCreateMutation = useMutation({
    mutationFn: createWorkAssignmentBlock,
    onSuccess: async () => {
      await refreshPlanning();
      pushToast(t("ops.workPlanned", language), t("ops.workPlannedCopy", language), "success");
    },
    onError: (error) => pushToast(t("ops.planningFailed", language), error instanceof Error ? error.message : undefined, "error"),
  });
  const workBlockUpdateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateWorkAssignmentBlock>[1] }) => updateWorkAssignmentBlock(id, data),
    onSuccess: async () => {
      await refreshPlanning();
      pushToast(t("ops.plannedWorkUpdated", language), t("ops.plannedWorkUpdatedCopy", language), "success");
    },
    onError: (error) => pushToast(t("ops.planningUpdateFailed", language), error instanceof Error ? error.message : undefined, "error"),
  });
  const refreshMaps = async () => {
    await queryClient.invalidateQueries({ queryKey: ["property-maps"] });
    await queryClient.invalidateQueries({ queryKey: ["unit-map-locations"] });
    await queryClient.invalidateQueries({ queryKey: ["property-map-areas"] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    await queryClient.invalidateQueries({ queryKey: ["activity"] });
  };
  const upsertPropertyMapCache = (map: PropertyMap) => {
    queryClient.setQueriesData<{ maps: PropertyMap[] }>({ queryKey: ["property-maps"] }, (current) => {
      if (!current) return current;
      const maps = [...current.maps.filter((entry) => entry.id !== map.id), map].sort((left, right) => {
        const propertyCompare = left.propertyId.localeCompare(right.propertyId);
        if (propertyCompare !== 0) return propertyCompare;
        if (left.isActive !== right.isActive) return left.isActive ? -1 : 1;
        return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
      });
      return { ...current, maps };
    });
  };
  const removePropertyMapFromCache = (id: string) => {
    queryClient.setQueriesData<{ maps: PropertyMap[] }>({ queryKey: ["property-maps"] }, (current) => {
      if (!current) return current;
      return { ...current, maps: current.maps.filter((entry) => entry.id !== id) };
    });
  };
  const propertyMapCreateMutation = useMutation({
    mutationFn: createPropertyMap,
    onSuccess: async (data) => {
      upsertPropertyMapCache(data.map);
      await refreshMaps();
      pushToast(t("ops.propertyMapCreated", language), tWithVars("ops.propertyMapCreatedCopy", language, { name: data.map.name }), "success");
    },
    onError: (error) => pushToast(t("ops.mapCreationFailed", language), error instanceof Error ? error.message : undefined, "error"),
  });
  const propertyMapArchiveMutation = useMutation({
    mutationFn: ({ id, restore }: { id: string; restore: boolean }) => archivePropertyMap(id, restore),
    onSuccess: async (data) => {
      upsertPropertyMapCache(data.map);
      await refreshMaps();
      pushToast(t("ops.mapStatusUpdated", language), t("ops.mapStatusUpdatedCopy", language), "info");
    },
    onError: (error) => pushToast(t("ops.mapStatusFailed", language), error instanceof Error ? error.message : undefined, "error"),
  });
  const propertyMapDeleteMutation = useMutation({
    mutationFn: deletePropertyMap,
    onSuccess: async (_data, id) => {
      removePropertyMapFromCache(id);
      await refreshMaps();
      pushToast(t("ops.mapDeleted", language), t("ops.mapDeletedCopy", language), "success");
    },
    onError: (error) => pushToast(t("ops.mapDeleteFailed", language), error instanceof Error ? error.message : undefined, "error"),
  });
  const propertyMapUploadMutation = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => uploadPropertyMap(id, file),
    onSuccess: async (data) => {
      upsertPropertyMapCache(data.map);
      await refreshMaps();
      pushToast(t("ops.mapUploaded", language), t("ops.mapUploadedCopy", language), "success");
    },
    onError: (error) => pushToast(t("ops.mapUploadFailed", language), error instanceof Error ? error.message : undefined, "error"),
  });
  const unitMapLocationSaveMutation = useMutation({
    mutationFn: saveUnitMapLocation,
    onSuccess: async () => {
      await refreshMaps();
      pushToast(t("ops.unitMarkerSaved", language), t("ops.unitMarkerSavedCopy", language), "success");
    },
    onError: (error) => pushToast(t("ops.markerSaveFailed", language), error instanceof Error ? error.message : undefined, "error"),
  });
  const unitMapLocationRemoveMutation = useMutation({
    mutationFn: removeUnitMapLocation,
    onSuccess: async () => {
      await refreshMaps();
      pushToast(t("ops.unitMarkerRemoved", language), t("ops.unitMarkerRemovedCopy", language), "info");
    },
    onError: (error) => pushToast(t("ops.markerRemoveFailed", language), error instanceof Error ? error.message : undefined, "error"),
  });
  const propertyMapAreaCreateMutation = useMutation({
    mutationFn: createPropertyMapArea,
    onSuccess: async () => {
      await refreshMaps();
      pushToast(t("ops.mapAreaSaved", language), t("ops.mapAreaSavedCopy", language), "success");
    },
    onError: (error) => pushToast(t("ops.areaSaveFailed", language), error instanceof Error ? error.message : undefined, "error"),
  });
  const propertyMapAreaUpdateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updatePropertyMapArea>[1] }) => updatePropertyMapArea(id, data),
    onSuccess: async () => {
      await refreshMaps();
      pushToast(t("ops.mapAreaUpdated", language), t("ops.mapAreaUpdatedCopy", language), "success");
    },
    onError: (error) => pushToast(t("ops.areaUpdateFailed", language), error instanceof Error ? error.message : undefined, "error"),
  });
  const propertyMapAreaRemoveMutation = useMutation({
    mutationFn: removePropertyMapArea,
    onSuccess: async () => {
      await refreshMaps();
      pushToast(t("ops.mapAreaArchived", language), t("ops.mapAreaArchivedCopy", language), "info");
    },
    onError: (error) => pushToast(t("ops.areaArchiveFailed", language), error instanceof Error ? error.message : undefined, "error"),
  });

  const refreshFields = async (message: string) => {
    setFieldError("");
    setFieldMessage(message);
    await queryClient.invalidateQueries({ queryKey: ["custom-fields"] });
    await queryClient.invalidateQueries({ queryKey: ["meta"] });
    await queryClient.invalidateQueries({ queryKey: ["make-ready-items"] });
  };

  const createFieldMutation = useMutation({
    mutationFn: createCustomField,
    onSuccess: async (data) => {
      await refreshFields(`Created field ${data.field.label}`);
      pushToast(t("ops.fieldCreated", language), tWithVars("ops.fieldCreatedCopy", language, { name: data.field.label }), "success");
    },
    onError: (error) => {
      setFieldMessage("");
      setFieldError(error instanceof Error ? error.message : "Create field failed");
      pushToast(t("ops.fieldCreationFailed", language), error instanceof Error ? error.message : t("ops.fieldCreationFailed", language), "error");
    },
  });

  const updateFieldMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateCustomField>[1] }) => updateCustomField(id, data),
    onSuccess: async (data) => {
      await refreshFields(`Updated field ${data.field.label}`);
      pushToast(t("ops.fieldUpdated", language), tWithVars("ops.fieldUpdatedCopy", language, { name: data.field.label }), "success");
    },
    onError: (error) => {
      setFieldMessage("");
      setFieldError(error instanceof Error ? error.message : "Update field failed");
      pushToast(t("ops.fieldUpdateFailed", language), error instanceof Error ? error.message : t("ops.fieldUpdateFailed", language), "error");
    },
  });

  const archiveFieldMutation = useMutation({
    mutationFn: archiveCustomField,
    onSuccess: async () => {
      await refreshFields("Archived custom field");
      pushToast(t("ops.fieldArchived", language), t("ops.fieldArchivedCopy", language), "info");
    },
    onError: (error) => {
      setFieldMessage("");
      setFieldError(error instanceof Error ? error.message : "Archive field failed");
      pushToast(t("ops.fieldArchiveFailed", language), error instanceof Error ? error.message : t("ops.fieldArchiveFailed", language), "error");
    },
  });

  const restoreFieldMutation = useMutation({
    mutationFn: restoreCustomField,
    onSuccess: async () => {
      await refreshFields("Restored custom field");
      pushToast(t("ops.fieldRestored", language), t("ops.fieldRestoredCopy", language), "success");
    },
    onError: (error) => {
      setFieldMessage("");
      setFieldError(error instanceof Error ? error.message : "Restore field failed");
      pushToast(t("ops.fieldRestoreFailed", language), error instanceof Error ? error.message : t("ops.fieldRestoreFailed", language), "error");
    },
  });

  const trashFieldMutation = useMutation({
    mutationFn: trashCustomField,
    onSuccess: async (data) => {
      await refreshFields("Moved custom field to trash");
      pushToast(t("ops.fieldTrashed", language), tWithVars("ops.fieldTrashedCopy", language, { date: new Date(data.deleteAfter).toLocaleDateString() }), "info");
    },
    onError: (error) => {
      setFieldMessage("");
      setFieldError(error instanceof Error ? error.message : "Move field to trash failed");
      pushToast(t("ops.fieldTrashFailed", language), error instanceof Error ? error.message : t("ops.fieldTrashFailed", language), "error");
    },
  });

  const deleteFieldMutation = useMutation({
    mutationFn: permanentlyDeleteCustomField,
    onSuccess: async () => {
      await refreshFields("Permanently deleted custom field");
      pushToast(t("ops.fieldDeleted", language), t("ops.fieldDeletedCopy", language), "success");
    },
    onError: (error) => {
      setFieldMessage("");
      setFieldError(error instanceof Error ? error.message : "Permanent delete failed");
      pushToast(t("ops.fieldDeleteFailed", language), error instanceof Error ? error.message : t("ops.fieldDeleteFailed", language), "error");
    },
  });

  const reorderFieldMutation = useMutation({
    mutationFn: reorderCustomFields,
    onSuccess: async () => {
      await refreshFields("Reordered custom fields");
    },
    onError: (error) => {
      setFieldMessage("");
      setFieldError(error instanceof Error ? error.message : "Reorder fields failed");
      pushToast(t("ops.fieldReorderFailed", language), error instanceof Error ? error.message : t("ops.fieldReorderFailed", language), "error");
    },
  });

  const refreshAutomations = async (message: string) => {
    setAutomationError("");
    setAutomationMessage(message);
    await queryClient.invalidateQueries({ queryKey: ["automations"] });
    await queryClient.invalidateQueries({ queryKey: ["activity"] });
  };

  const createAutomationMutation = useMutation({
    mutationFn: createAutomation,
    onSuccess: async (data) => {
      setAutomationRuleId(data.rule.id);
      await refreshAutomations(`Created automation ${data.rule.name}`);
      pushToast(t("ops.automationCreated", language), tWithVars("ops.automationCreatedCopy", language, { name: data.rule.name }), "success");
    },
    onError: (error) => {
      setAutomationMessage("");
      setAutomationError(error instanceof Error ? error.message : "Create automation failed");
      pushToast(t("ops.automationFailed", language), error instanceof Error ? error.message : t("ops.automationCreationFailed", language), "error");
    },
  });

  const installAutomationTemplateMutation = useMutation({
    mutationFn: ({ templateId, propertyId, enabled }: { templateId: string; propertyId: string | null; enabled: boolean }) => installAutomationTemplate(templateId, { propertyId, enabled }),
    onSuccess: async (data) => {
      setAutomationRuleId(data.rule.id);
      await refreshAutomations(`Installed template ${data.rule.name}`);
      pushToast(
        t("ops.templateInstalled", language),
        tWithVars("ops.templateInstalledCopy", language, {
          name: data.rule.name,
          state: data.rule.enabled ? t("ops.templateEnabled", language) : t("ops.templateDisabledForReview", language),
        }),
        "success",
      );
    },
    onError: (error) => {
      setAutomationMessage("");
      setAutomationError(error instanceof Error ? error.message : "Template installation failed");
      pushToast(t("ops.templateInstallationFailed", language), error instanceof Error ? error.message : t("ops.templateInstallationFailed", language), "error");
    },
  });

  const previewOperationalLibraryMutation = useMutation({
    mutationFn: previewOperationalLibraryPack,
    onSuccess: (data) => {
      setLibraryPreview(data);
      setAutomationError("");
      pushToast(t("ops.libraryPreviewComplete", language), tWithVars("ops.libraryPreviewCompleteCopy", language, { name: data.pack.name }), "info");
    },
    onError: (error) => {
      setLibraryPreview(null);
      setAutomationError(error instanceof Error ? error.message : "Library preview failed");
      pushToast(t("ops.libraryPreviewFailed", language), error instanceof Error ? error.message : t("ops.libraryPreviewFailed", language), "error");
    },
  });

  const installOperationalLibraryMutation = useMutation({
    mutationFn: installOperationalLibraryPack,
    onSuccess: async (data) => {
      const created = Object.values(data.summary).reduce((sum, bucket) => sum + bucket.created, 0);
      setAutomationMessage(`Installed operational library items: ${created} created`);
      setAutomationError("");
      await queryClient.invalidateQueries({ queryKey: ["operational-library"] });
      await queryClient.invalidateQueries({ queryKey: ["automations"] });
      await queryClient.invalidateQueries({ queryKey: ["custom-fields"] });
      await queryClient.invalidateQueries({ queryKey: ["meta"] });
      pushToast(t("ops.libraryInstalled", language), tWithVars("ops.libraryInstalledCopy", language, { count: created }), "success");
    },
    onError: (error) => {
      setAutomationError(error instanceof Error ? error.message : "Library install failed");
      pushToast(t("ops.libraryInstallFailed", language), error instanceof Error ? error.message : t("ops.libraryInstallFailed", language), "error");
    },
  });

  const previewPropertyTemplateMutation = useMutation({
    mutationFn: previewPropertyTemplateFromProperty,
    onSuccess: (data) => {
      const lines = [
        "Create template preview:",
        ...Object.entries(data.counts).map(([bucket, count]) => `${bucket}: ${count}`),
        ...data.warnings,
      ];
      setTemplatePreview(lines.join("\n"));
      setAutomationError("");
      pushToast(t("ops.templatePreviewComplete", language), t("ops.templatePreviewCompleteCopy", language), "info");
    },
    onError: (error) => {
      setTemplatePreview("");
      setAutomationError(error instanceof Error ? error.message : "Template preview failed");
      pushToast(t("ops.templatePreviewFailed", language), error instanceof Error ? error.message : t("ops.templatePreviewFailed", language), "error");
    },
  });

  const createPropertyTemplateMutation = useMutation({
    mutationFn: createPropertyTemplateFromProperty,
    onSuccess: async (data) => {
      setTemplatePreview(`Saved template ${data.template.name}`);
      await queryClient.invalidateQueries({ queryKey: ["property-templates"] });
      await queryClient.invalidateQueries({ queryKey: ["activity"] });
      pushToast(t("ops.propertyTemplateSaved", language), tWithVars("ops.propertyTemplateSavedCopy", language, { name: data.template.name }), "success");
    },
    onError: (error) => {
      setAutomationError(error instanceof Error ? error.message : "Template create failed");
      pushToast(t("ops.templateCreateFailed", language), error instanceof Error ? error.message : t("ops.templateCreateFailed", language), "error");
    },
  });

  const applyPropertyTemplateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof applyPropertyTemplate>[1] }) => applyPropertyTemplate(id, input),
    onSuccess: async (data) => {
      const lines = [
        data.dryRun ? "Apply dry run:" : `Applied to ${data.property?.code ?? "property"}:`,
        ...Object.entries(data.summary).map(([bucket, summary]) => `${bucket}: ${summary.created} create, ${summary.skipped} skip, ${summary.conflicts} conflict${summary.errors.length ? ` (${summary.errors.join("; ")})` : ""}`),
      ];
      setTemplatePreview(lines.join("\n"));
      await queryClient.invalidateQueries({ queryKey: ["meta"] });
      await queryClient.invalidateQueries({ queryKey: ["operations"] });
      await queryClient.invalidateQueries({ queryKey: ["automations"] });
      await queryClient.invalidateQueries({ queryKey: ["saved-views"] });
      await queryClient.invalidateQueries({ queryKey: ["custom-fields"] });
      pushToast(
        data.dryRun ? t("ops.templateDryRunComplete", language) : t("ops.templateApplied", language),
        data.dryRun ? t("ops.templateDryRunCompleteCopy", language) : t("ops.templateAppliedCopy", language),
        data.dryRun ? "info" : "success",
      );
    },
    onError: (error) => {
      setAutomationError(error instanceof Error ? error.message : "Template apply failed");
      pushToast(t("ops.templateApplyFailed", language), error instanceof Error ? error.message : t("ops.templateApplyFailed", language), "error");
    },
  });

  const archivePropertyTemplateMutation = useMutation({
    mutationFn: archivePropertyTemplate,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["property-templates"] });
      pushToast(t("ops.templateArchived", language), t("ops.templateArchivedCopy", language), "info");
    },
    onError: (error) => {
      setAutomationError(error instanceof Error ? error.message : "Template archive failed");
      pushToast(t("ops.templateArchiveFailed", language), error instanceof Error ? error.message : t("ops.templateArchiveFailed", language), "error");
    },
  });

  const restorePropertyTemplateMutation = useMutation({
    mutationFn: restorePropertyTemplate,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["property-templates"] });
      pushToast(t("ops.templateRestored", language), t("ops.templateRestoredCopy", language), "success");
    },
    onError: (error) => {
      setAutomationError(error instanceof Error ? error.message : "Template restore failed");
      pushToast(t("ops.templateRestoreFailed", language), error instanceof Error ? error.message : t("ops.templateRestoreFailed", language), "error");
    },
  });

  const deletePropertyTemplateMutation = useMutation({
    mutationFn: deletePropertyTemplate,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["property-templates"] });
      pushToast(t("ops.templateDeleted", language), t("ops.templateDeletedCopy", language), "info");
    },
    onError: (error) => {
      setAutomationError(error instanceof Error ? error.message : "Template delete failed");
      pushToast(t("ops.templateDeleteFailed", language), error instanceof Error ? error.message : t("ops.templateDeleteFailed", language), "error");
    },
  });

  const updateAutomationMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateAutomation>[1] }) => updateAutomation(id, data),
    onSuccess: async (data) => {
      await refreshAutomations(`Updated automation ${data.rule.name}`);
      pushToast(t("ops.automationUpdated", language), tWithVars("ops.automationUpdatedCopy", language, { name: data.rule.name }), "success");
    },
    onError: (error) => {
      setAutomationMessage("");
      setAutomationError(error instanceof Error ? error.message : "Update automation failed");
      pushToast(t("ops.automationUpdateFailed", language), error instanceof Error ? error.message : t("ops.automationUpdateFailed", language), "error");
    },
  });

  const toggleAutomationMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => toggleAutomation(id, enabled),
    onSuccess: async (data) => {
      await refreshAutomations(`${data.rule.enabled ? "Enabled" : "Disabled"} ${data.rule.name}`);
      pushToast(
        t("ops.automationStatusUpdated", language),
        tWithVars("ops.automationStatusUpdatedCopy", language, {
          name: data.rule.name,
          state: data.rule.enabled ? t("ops.enabled", language) : t("ops.disabled", language),
        }),
        "success",
      );
    },
    onError: (error) => {
      setAutomationError(error instanceof Error ? error.message : "Automation toggle failed");
      pushToast(t("ops.automationStatusFailed", language), error instanceof Error ? error.message : t("ops.automationToggleFailed", language), "error");
    },
  });

  const archiveAutomationMutation = useMutation({
    mutationFn: archiveAutomation,
    onSuccess: async () => {
      setAutomationRuleId(undefined);
      await refreshAutomations("Archived automation rule");
      pushToast(t("ops.automationArchived", language), t("ops.automationArchivedCopy", language), "info");
    },
    onError: (error) => {
      setAutomationError(error instanceof Error ? error.message : "Archive automation failed");
      pushToast(t("ops.automationArchiveFailed", language), error instanceof Error ? error.message : t("ops.automationArchiveFailed", language), "error");
    },
  });

  const previewAutomationMutation = useMutation({
    mutationFn: previewAutomation,
    onSuccess: (data) => {
      setAutomationError("");
      setAutomationPreview(data);
      pushToast(t("ops.previewComplete", language), tWithVars("ops.previewCompleteCopy", language, { count: data.matchingItemCount }), "info");
      queryClient.invalidateQueries({ queryKey: ["activity"] });
    },
    onError: (error) => {
      setAutomationPreview(null);
      setAutomationError(error instanceof Error ? error.message : "Automation preview failed");
      pushToast(t("ops.previewFailed", language), error instanceof Error ? error.message : t("ops.automationPreviewFailed", language), "error");
    },
  });

  const runAutomationMutation = useMutation({
    mutationFn: runAutomationNow,
    onSuccess: async (data) => {
      setAutomationError("");
      await queryClient.invalidateQueries({ queryKey: ["automations", "runs"] });
      await queryClient.invalidateQueries({ queryKey: ["activity"] });
      await queryClient.invalidateQueries({ queryKey: ["make-ready-items"] });
      const execution = data.execution;
      setAutomationMessage(`Run completed: ${execution.matchedCount} matched, ${execution.actionCount} actions`);
      pushToast(t("ops.scheduledCheckCompleted", language), tWithVars("ops.scheduledCheckCompletedCopy", language, { matched: execution.matchedCount, actions: execution.actionCount }), "success");
    },
    onError: (error) => {
      setAutomationError(error instanceof Error ? error.message : "Run automation failed");
      pushToast(t("ops.scheduledCheckFailed", language), error instanceof Error ? error.message : t("ops.runAutomationFailed", language), "error");
    },
  });

  const refreshAdmin = async (message: string) => {
    setAdminError("");
    setAdminMessage(message);
    await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    await queryClient.invalidateQueries({ queryKey: ["admin", "properties"] });
  };

  const adminCreateMutation = useMutation({
    mutationFn: createAdminUser,
    onSuccess: async (data) => {
      queryClient.setQueryData<{ users: ManagedUser[] } | undefined>(["admin", "users"], (current) => ({
        users: [...(current?.users ?? []), data.user],
      }));
      const inviteSuffix = data.inviteSent
        ? " and sent invite email"
        : data.inviteError
          ? ` but invite email failed: ${data.inviteError}`
          : "";
      await refreshAdmin(`Created user ${data.user.fullName}${inviteSuffix}`);
      pushToast(
        t("ops.userCreated", language),
        data.inviteSent
          ? tWithVars("ops.userCreatedInviteSentCopy", language, { name: data.user.fullName })
          : data.inviteError
            ? tWithVars("ops.userCreatedInviteFailedCopy", language, { name: data.user.fullName })
            : tWithVars("ops.userCreatedCopy", language, { name: data.user.fullName }),
        data.inviteError ? "info" : "success"
      );
    },
    onError: (error) => {
      setAdminMessage("");
      setAdminError(error instanceof Error ? error.message : "Create user failed");
      pushToast(t("ops.userCreationFailed", language), error instanceof Error ? error.message : t("ops.userCreationFailed", language), "error");
    },
  });

  const adminUpdateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateAdminUser>[1] }) => updateAdminUser(id, data),
    onSuccess: async (data) => {
      queryClient.setQueryData<{ users: ManagedUser[] } | undefined>(["admin", "users"], (current) => (
        current ? { users: replaceAdminUser(current.users, data.user) ?? current.users } : current
      ));
      if (currentUser?.id === data.user.id) {
        queryClient.setQueryData<{ user: CurrentUser; roles: string[]; csrfToken: string } | null | undefined>(["auth", "me"], (current) => (
          current ? { ...current, user: { ...current.user, fullName: data.user.fullName, username: data.user.username, email: data.user.email, role: data.user.role, language: data.user.language } } : current
        ));
      }
      await refreshAdmin(`Updated ${data.user.fullName}`);
      pushToast(t("ops.userUpdated", language), tWithVars("ops.userUpdatedCopy", language, { name: data.user.fullName }), "success");
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
    onError: (error) => {
      setAdminMessage("");
      setAdminError(error instanceof Error ? error.message : "Update user failed");
      pushToast(t("ops.userUpdateFailed", language), error instanceof Error ? error.message : t("ops.userUpdateFailed", language), "error");
    },
  });

  const updateLanguageMutation = useMutation({
    mutationFn: updateCurrentUserPreferences,
    onSuccess: (data) => {
      queryClient.setQueryData<{ user: CurrentUser; roles: string[]; csrfToken: string } | null | undefined>(["auth", "me"], (current) => (
        current ? { ...current, user: data.user } : current
      ));
      pushToast(t("ops.languageUpdated", data.user.language), t("ops.languageUpdatedCopy", data.user.language), "success");
    },
    onError: (error) => {
      pushToast(t("ops.languageUpdateFailed", language), error instanceof Error ? error.message : t("ops.languagePreferenceNotSaved", language), "error");
    },
  });

  const adminResetPasswordMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => resetAdminUserPassword(id, password),
    onSuccess: async (_, variables) => {
      const name = adminUsersQuery.data?.users.find((user) => user.id === variables.id)?.fullName ?? "user";
      await refreshAdmin(`Reset password for ${name}`);
      pushToast(t("ops.passwordReset", language), tWithVars("ops.passwordResetCopy", language, { name }), "success");
    },
    onError: (error) => {
      setAdminMessage("");
      setAdminError(error instanceof Error ? error.message : "Password reset failed");
      pushToast(t("ops.passwordResetFailed", language), error instanceof Error ? error.message : t("ops.passwordResetFailed", language), "error");
    },
  });

  const adminDeactivateMutation = useMutation({
    mutationFn: deactivateAdminUser,
    onSuccess: async (data) => {
      queryClient.setQueryData<{ users: ManagedUser[] } | undefined>(["admin", "users"], (current) => (
        current ? { users: replaceAdminUser(current.users, data.user) ?? current.users } : current
      ));
      await refreshAdmin(`Deactivated ${data.user.fullName}`);
      pushToast(t("ops.userDeactivated", language), tWithVars("ops.userDeactivatedCopy", language, { name: data.user.fullName }), "info");
    },
    onError: (error) => {
      setAdminMessage("");
      setAdminError(error instanceof Error ? error.message : "Deactivate user failed");
      pushToast(t("ops.userDeactivationFailed", language), error instanceof Error ? error.message : t("ops.userDeactivationFailed", language), "error");
    },
  });

  const adminPropertyAccessMutation = useMutation({
    mutationFn: ({ id, propertyIds }: { id: string; propertyIds: string[] }) => updateAdminUserPropertyAccess(id, propertyIds),
    onSuccess: async (data) => {
      queryClient.setQueryData<{ users: ManagedUser[] } | undefined>(["admin", "users"], (current) => (
        current ? { users: replaceAdminUser(current.users, data.user) ?? current.users } : current
      ));
      await refreshAdmin(`Updated property access for ${data.user.fullName}`);
      pushToast(t("ops.propertyAccessUpdated", language), tWithVars("ops.propertyAccessUpdatedCopy", language, { name: data.user.fullName }), "success");
    },
    onError: (error) => {
      setAdminMessage("");
      setAdminError(error instanceof Error ? error.message : "Property access update failed");
      pushToast(t("ops.propertyAccessFailed", language), error instanceof Error ? error.message : t("ops.propertyAccessFailed", language), "error");
    },
  });

  const refreshViews = async (message: string) => {
    setViewError("");
    setViewMessage(message);
    await queryClient.invalidateQueries({ queryKey: ["saved-views"] });
    await queryClient.invalidateQueries({ queryKey: ["meta"] });
  };

  const createViewMutation = useMutation({
    mutationFn: createSavedView,
    onSuccess: async (data) => {
      queryClient.setQueryData<{ views: SavedView[] } | undefined>(["saved-views"], (current) => ({
        views: [...(current?.views ?? []), data.view],
      }));
      await refreshViews(`Saved view ${data.view.name}`);
      pushToast(t("ops.savedViewCreated", language), tWithVars("ops.savedViewCreatedCopy", language, { name: data.view.name }), "success");
    },
    onError: (error) => {
      setViewMessage("");
      setViewError(error instanceof Error ? error.message : "Create view failed");
      pushToast(t("ops.saveViewFailed", language), error instanceof Error ? error.message : t("ops.createViewFailed", language), "error");
    },
  });

  const updateViewMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateSavedView>[1] }) => updateSavedView(id, data),
    onSuccess: async (data) => {
      queryClient.setQueryData<{ views: SavedView[] } | undefined>(["saved-views"], (current) => (
        current ? { views: current.views.map((view) => (view.id === data.view.id ? data.view : view)) } : current
      ));
      await refreshViews(`Updated view ${data.view.name}`);
      pushToast(t("ops.savedViewUpdated", language), tWithVars("ops.savedViewUpdatedCopy", language, { name: data.view.name }), "success");
    },
    onError: (error) => {
      setViewMessage("");
      setViewError(error instanceof Error ? error.message : "Update view failed");
      pushToast(t("ops.updateViewFailed", language), error instanceof Error ? error.message : t("ops.updateViewFailed", language), "error");
    },
  });

  const deleteViewMutation = useMutation({
    mutationFn: deleteSavedView,
    onSuccess: async (_, id) => {
      queryClient.setQueryData<{ views: SavedView[] } | undefined>(["saved-views"], (current) => (
        current ? { views: current.views.filter((view) => view.id !== id) } : current
      ));
      await refreshViews("Deleted saved view");
      pushToast(t("ops.savedViewDeleted", language), t("ops.savedViewDeletedCopy", language), "info");
    },
    onError: (error) => {
      setViewMessage("");
      setViewError(error instanceof Error ? error.message : "Delete view failed");
      pushToast(t("ops.deleteViewFailed", language), error instanceof Error ? error.message : t("ops.deleteViewFailed", language), "error");
    },
  });

  const archiveViewMutation = useMutation({
    mutationFn: archiveSavedView,
    onSuccess: async (data) => {
      queryClient.setQueryData<{ views: SavedView[] } | undefined>(["saved-views"], (current) => (
        current ? { views: current.views.map((view) => (view.id === data.view.id ? data.view : view)) } : current
      ));
      await refreshViews(`Archived view ${data.view.name}`);
      pushToast(t("ops.savedViewArchived", language), tWithVars("ops.savedViewArchivedCopy", language, { name: data.view.name }), "info");
    },
    onError: (error) => {
      setViewMessage("");
      setViewError(error instanceof Error ? error.message : "Archive view failed");
      pushToast(t("ops.archiveViewFailed", language), error instanceof Error ? error.message : t("ops.archiveViewFailed", language), "error");
    },
  });

  const restoreViewMutation = useMutation({
    mutationFn: restoreSavedView,
    onSuccess: async (data) => {
      queryClient.setQueryData<{ views: SavedView[] } | undefined>(["saved-views"], (current) => (
        current ? { views: current.views.map((view) => (view.id === data.view.id ? data.view : view)) } : current
      ));
      await refreshViews(`Restored view ${data.view.name}`);
      pushToast(t("ops.savedViewRestored", language), tWithVars("ops.savedViewRestoredCopy", language, { name: data.view.name }), "success");
    },
    onError: (error) => {
      setViewMessage("");
      setViewError(error instanceof Error ? error.message : "Restore view failed");
      pushToast(t("ops.restoreViewFailed", language), error instanceof Error ? error.message : t("ops.restoreViewFailed", language), "error");
    },
  });

  useEffect(() => {
    writeStorageValue(compactModeStorageKey, String(compactMode));
  }, [compactMode]);

  useEffect(() => {
    writeStorageValue(themeModeStorageKey, themeMode);
    document.documentElement.dataset.theme = themeMode;
  }, [themeMode]);

  useEffect(() => {
    writeStorageValue(eyeStrainModeStorageKey, String(eyeStrainMode));
    document.documentElement.classList.toggle("eye-strain-mode", eyeStrainMode);
  }, [eyeStrainMode]);

  useEffect(() => {
    writeStorageValue(dyslexiaModeStorageKey, String(dyslexiaMode));
    document.documentElement.classList.toggle("dyslexia-mode", dyslexiaMode);
  }, [dyslexiaMode]);

  useEffect(() => {
    writeStorageValue(clockModeStorageKey, clockMode);
    document.documentElement.dataset.clockMode = clockMode;
  }, [clockMode]);

  useEffect(() => {
    writeStorageValue(boardWindowedModeStorageKey, String(boardWindowedMode));
  }, [boardWindowedMode]);

  useEffect(() => {
    writeStorageValue(boardWindowLimitStorageKey, String(boardWindowLimit));
  }, [boardWindowLimit]);

  useEffect(() => {
    setBoardWindowLimit(boardWindowPageSize);
  }, [itemServerFilters, sortDirection, sortKey]);

  const onboardingUser = forceLoggedOut ? undefined : meQuery.data?.user;
  const canUseOnboarding = onboardingUser?.role === "ADMIN" || onboardingUser?.role === "MANAGER";
  const firstRunDetected = Boolean(canUseOnboarding && metaQuery.isSuccess && (metaQuery.data?.properties.length ?? 0) === 0);

  useEffect(() => {
    if (firstRunDetected && !onboardingSkipped) {
      setOnboardingOpen(true);
    }
  }, [firstRunDetected, onboardingSkipped]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandPaletteOpen((open) => !open);
      }
      if (event.key === "Escape") {
        setCommandPaletteOpen(false);
        setNotificationsOpen(false);
        setOnboardingOpen(false);
        setSelectedItemId(null);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const pairs = [
      [".modal-backdrop", ".modal-panel"],
      [".notification-backdrop", ".notification-drawer"],
      [".palette-backdrop", ".command-palette"],
      [".onboarding-backdrop", ".onboarding-panel"],
      [".item-drawer-backdrop", ".item-drawer"],
    ] as const;

    const cleanupOrphanBlockers = () => {
      for (const [backdropSelector, panelSelector] of pairs) {
        const backdrop = document.querySelector<HTMLElement>(backdropSelector);
        if (backdrop && !document.querySelector(panelSelector)) {
          backdrop.remove();
        }
      }

      document.querySelectorAll<HTMLInputElement>('input[type="file"]').forEach((input) => {
        const rect = input.getBoundingClientRect();
        if (rect.width > window.innerWidth * 0.8 || rect.height > window.innerHeight * 0.8) {
          input.style.pointerEvents = "none";
        }
      });
    };

    cleanupOrphanBlockers();
    const interval = window.setInterval(cleanupOrphanBlockers, 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const queueEventName = getOfflineSyncEventName();
    const handleQueueState = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail as { pendingCount?: number; syncing?: boolean } : {};
      setOfflineQueuePendingCount(detail.pendingCount ?? 0);
      setOfflineQueueSyncing(Boolean(detail.syncing));
      void refreshOfflineQueueState();
    };
    void refreshOfflineQueueState();
    window.addEventListener(queueEventName, handleQueueState as EventListener);
    return () => window.removeEventListener(queueEventName, handleQueueState as EventListener);
  }, []);

  useEffect(() => {
    const online = () => {
      setIsOnline(true);
      setApiDegraded(false);
      pushToast(t(meQuery.data?.user.language ?? "en", "connection.backOnline"), t(meQuery.data?.user.language ?? "en", "connection.backOnlineCopy"), "success");
      void queryClient.invalidateQueries();
      void syncQueuedOfflineChanges();
    };
    const offline = () => {
      setIsOnline(false);
      setLastConnectionIssueAt(new Date().toISOString());
      pushToast(t(meQuery.data?.user.language ?? "en", "connection.offlineToast"), t(meQuery.data?.user.language ?? "en", "connection.offlineToastCopy"), "error");
    };
    const unreachable = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail as { at?: string } : {};
      setApiDegraded(true);
      setLastConnectionIssueAt(detail.at ?? new Date().toISOString());
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    window.addEventListener("makereadyos:api-unreachable", unreachable);
    window.addEventListener("focus", syncQueuedOfflineChanges);
    document.addEventListener("visibilitychange", syncQueuedOfflineChanges);
    void syncQueuedOfflineChanges();
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      window.removeEventListener("makereadyos:api-unreachable", unreachable);
      window.removeEventListener("focus", syncQueuedOfflineChanges);
      document.removeEventListener("visibilitychange", syncQueuedOfflineChanges);
    };
  }, [queryClient]);

  useEffect(() => {
    const possible401Errors = [
      metaQuery.error,
      itemsQuery.error,
      savedViewsQuery.error,
      adminUsersQuery.error,
      adminPropertiesQuery.error,
      customFieldsQuery.error,
      automationsQuery.error,
      automationRunsQuery.error,
      operationsPropertiesQuery.error,
      operationsUnitsQuery.error,
      scheduleTracksQuery.error,
      dashboardQuery.error,
      notificationsQuery.error,
      myWorkQuery.error,
    ];
    if (possible401Errors.some((error) => isApiError(error) && error.status === 401)) {
      handleSessionExpired();
    }
  }, [adminPropertiesQuery.error, adminUsersQuery.error, automationRunsQuery.error, automationsQuery.error, customFieldsQuery.error, dashboardQuery.error, itemsQuery.error, metaQuery.error, myWorkQuery.error, notificationsQuery.error, operationsPropertiesQuery.error, operationsUnitsQuery.error, savedViewsQuery.error, scheduleTracksQuery.error, sessionMessage]);

  const labelsByField = useMemo(() => labelMap(metaQuery.data?.labels ?? []), [metaQuery.data?.labels]);
  const tableColumnOptions = useMemo(() => visibleColumnOptions(metaQuery.data?.customFields ?? [], metaQuery.data?.columns ?? []), [metaQuery.data?.columns, metaQuery.data?.customFields]);
  const kanbanOptions = useMemo(() => kanbanGroupOptions(metaQuery.data?.customFields ?? [], metaQuery.data?.columns ?? []), [metaQuery.data?.columns, metaQuery.data?.customFields]);
  const columnLabels = useMemo(() => Object.fromEntries((metaQuery.data?.columns ?? []).map((column) => [column.fieldKey, column.label])), [metaQuery.data?.columns]);
  const scheduleFieldOptions = useMemo(() => configuredScheduleTracks(metaQuery.data?.scheduleTracks ?? [], metaQuery.data?.customFields ?? []), [metaQuery.data?.customFields, metaQuery.data?.scheduleTracks]);
  const activeScheduleTrack = scheduleFieldOptions.find((track) => track.id === activeCalendarField || track.sourceField === activeCalendarField) ?? scheduleFieldOptions[0];
  const currentUser = forceLoggedOut ? undefined : meQuery.data?.user;
  const applyBasicBoardMode = () => {
    const basicPreset = tableColumnPresets.find((preset) => preset.key === "basic");
    setActiveView("table");
    setVisibleColumns(normalizeVisibleColumns(basicPreset?.columns ?? ["unitNumber"], metaQuery.data?.customFields ?? [], metaQuery.data?.columns ?? []));
  };
  const commandPaletteWorkspaceGroups = useMemo<CommandPaletteWorkspaceGroup[]>(() => {
    if (!currentUser) {
      return [];
    }

    const groups: CommandPaletteWorkspaceGroup[] = [
      {
        id: "operations",
        label: t(currentUser.language, "nav.operations"),
        actions: [
          { id: "table", label: t(currentUser.language, "command.board"), description: t(currentUser.language, "command.boardCopy"), view: "table" as const },
          { id: "kanban", label: t(currentUser.language, "nav.kanban"), description: t(currentUser.language, "command.kanbanCopy"), view: "kanban" as const },
          { id: "calendar", label: t(currentUser.language, "nav.schedule"), description: t(currentUser.language, "command.scheduleCopy"), view: "calendar" as const },
          { id: "mywork", label: t(currentUser.language, "nav.myWork"), description: t(currentUser.language, "command.myWorkCopy"), view: "mywork" as const },
          { id: "planning", label: t(currentUser.language, "nav.planning"), description: t(currentUser.language, "command.planningCopy"), view: "planning" as const },
        ] as CommandPaletteWorkspaceGroup["actions"],
      },
      {
        id: "visibility",
        label: t(currentUser.language, "nav.visibility"),
        actions: [
          { id: "dashboard", label: t(currentUser.language, "nav.dashboard"), description: t(currentUser.language, "command.dashboardCopy"), view: "dashboard" as const },
          { id: "activity", label: t(currentUser.language, "nav.activity"), description: t(currentUser.language, "command.activityCopy"), view: "activity" as const },
          { id: "maps", label: t(currentUser.language, "nav.maps"), description: t(currentUser.language, "command.mapsCopy"), view: "maps" as const },
          { id: "pond", label: "Frog Pond", description: t(currentUser.language, "command.pondCopy"), view: "pond" as const },
        ].filter((action) => action.view !== "activity" || currentUser.role === "ADMIN" || currentUser.role === "MANAGER" || currentUser.role === "LEASING") as CommandPaletteWorkspaceGroup["actions"],
      },
      {
        id: "modules",
        label: t(currentUser.language, "command.modules"),
        actions: [
          { id: "refrigerant", label: t(currentUser.language, "command.refrigerant"), description: t(currentUser.language, "command.refrigerantCopy"), view: "refrigerant" as const },
          { id: "pool", label: t(currentUser.language, "command.pool"), description: t(currentUser.language, "command.poolCopy"), view: "pool" as const },
          { id: "pest", label: t(currentUser.language, "command.pest"), description: t(currentUser.language, "command.pestCopy"), view: "pest" as const },
          { id: "lease", label: t(currentUser.language, "command.lease"), description: t(currentUser.language, "command.leaseCopy"), view: "lease" as const },
          { id: "pm", label: t(currentUser.language, "command.pm"), description: t(currentUser.language, "command.pmCopy"), view: "pm" as const },
          { id: "projects", label: t(currentUser.language, "command.projects"), description: t(currentUser.language, "command.projectsCopy"), view: "projects" as const },
          { id: "wiki", label: t(currentUser.language, "command.wiki"), description: t(currentUser.language, "command.wikiCopy"), view: "wiki" as const },
        ].filter((action) => {
          if (action.view === "refrigerant") {
            return currentUser.role !== "CLEANER" && currentUser.role !== "LEASING";
          }
          if (action.view === "projects") {
            return currentUser.role !== "CLEANER";
          }
          return true;
        }),
      },
    ];

    const managementActions: CommandPaletteWorkspaceGroup["actions"] = [
      { id: "vendors", label: t(currentUser.language, "nav.vendors"), description: t(currentUser.language, "command.vendorsCopy"), view: "vendors" as const },
      { id: "automations", label: t(currentUser.language, "nav.automations"), description: t(currentUser.language, "command.automationsCopy"), view: "automations" as const },
    ].filter((action) => {
      if (action.view === "vendors") {
        return currentUser.role !== "VIEWER" && currentUser.role !== "CLEANER";
      }
      if (action.view === "automations") {
        return currentUser.role === "ADMIN" || currentUser.role === "MANAGER";
      }
      return true;
    });
    if (managementActions.length) {
      groups.push({ id: "management", label: t(currentUser.language, "nav.manage"), actions: managementActions });
    }

    const adminActions: CommandPaletteWorkspaceGroup["actions"] = [
      { id: "operations", label: t(currentUser.language, "nav.setup"), description: t(currentUser.language, "command.setupCopy"), view: "operations" as const },
      { id: "fields", label: t(currentUser.language, "nav.fields"), description: t(currentUser.language, "command.fieldsCopy"), view: "fields" as const },
      { id: "admin", label: "Admin", description: t(currentUser.language, "command.adminCopy"), view: "admin" as const },
    ].filter((action) => {
      if (action.view === "operations" || action.view === "fields") {
        return currentUser.role === "ADMIN" || currentUser.role === "MANAGER";
      }
      if (action.view === "admin") {
        return currentUser.role === "ADMIN";
      }
      return true;
    });
    if (adminActions.length) {
      groups.push({ id: "admin", label: t(currentUser.language, "command.adminSetup"), actions: adminActions });
    }

    return groups;
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || defaultWorkspaceAppliedForUser === currentUser.id) {
      return;
    }
    setDefaultWorkspaceAppliedForUser(currentUser.id);
    if (currentUser.role === "TECH" || currentUser.role === "CLEANER") {
      setActiveView("mywork");
    }
  }, [currentUser, defaultWorkspaceAppliedForUser]);

  useEffect(() => {
    if (activeScheduleTrack && activeCalendarField !== activeScheduleTrack.id) {
      setActiveCalendarField(activeScheduleTrack.id);
    }
  }, [activeCalendarField, activeScheduleTrack]);

  const canEditField = (user: CurrentUser, key: string) => {
    if (user.role === "ADMIN" || user.role === "MANAGER" || user.role === "LEASING") {
      return true;
    }
    if (user.role === "TECH") {
      return techEditableFields.has(key);
    }
    if (user.role === "CLEANER") {
      return cleanerEditableFields.has(key);
    }
    return false;
  };

  const filteredItems = useMemo(() => {
    const allItems = boardItems;

    return allItems.filter((item) => {
      if (propertyId && item.propertyId !== propertyId) {
        return false;
      }

      if (deferredSearch) {
        const haystack = [item.unitNumber, item.itemName, item.applicant ?? "", item.assignedTech ?? "", item.property.code].join(" ").toLowerCase();
        if (!haystack.includes(deferredSearch.toLowerCase())) {
          return false;
        }
      }

      if (scopeLevelFilter && item.scopeLevel !== scopeLevelFilter) {
        return false;
      }
      return itemMatchesStructuredFilters(item, structuredFilters, metaQuery.data?.boardSections ?? [], metaQuery.data?.customFields ?? []);
    });
  }, [boardItems, metaQuery.data?.boardSections, propertyId, scopeLevelFilter, deferredSearch, structuredFilters]);

  const sortedItems = useMemo(() => {
    return [...filteredItems].sort((a, b) => compareValues(a[sortKey as keyof typeof a], b[sortKey as keyof typeof b], sortDirection));
  }, [filteredItems, sortDirection, sortKey]);
  const occupiedDirectoryResultCount = useMemo(() => {
    if (structuredFilters.archiveState !== "occupied") return 0;
    const query = deferredSearch.trim().toLowerCase();
    return (metaQuery.data?.units ?? []).filter((unit) => {
      if (!unit.isActive || unit.occupancyStatus !== "OCCUPIED") return false;
      if (propertyId && unit.propertyId !== propertyId) return false;
      if (!query) return true;
      return [unit.number, unit.floorPlan ?? "", unit.floorPlanRecord?.code ?? "", unit.floorPlanRecord?.name ?? "", unit.building ?? "", unit.area ?? "", unit.property.code]
        .join(" ")
        .toLowerCase()
        .includes(query);
    }).length;
  }, [deferredSearch, metaQuery.data?.units, propertyId, structuredFilters.archiveState]);
  const itemsById = useMemo(() => new Map(boardItems.map((item) => [item.id, item])), [boardItems]);
  const selectedItem = selectedItemId ? itemsById.get(selectedItemId) ?? null : null;
  const selectedItemPlanningQuery = useQuery({
    queryKey: ["planning", "item-drawer", selectedItemId],
    queryFn: () => getPlanning({ propertyId: selectedItem?.propertyId }),
    enabled: meQuery.isSuccess && Boolean(selectedItemId && selectedItem?.propertyId),
  });
  const clearBoardFilters = (preserveProperty = false) => {
    setSearch("");
    setScopeLevelFilter("");
    setStructuredFilters(defaultStructuredFilters);
    setDashboardDrilldownContext(null);
    if (!preserveProperty) setPropertyId("");
  };
  const activeFilterChips = [
    propertyId ? { key: "property", label: `Property: ${metaQuery.data?.properties.find((property) => property.id === propertyId)?.code ?? "Selected"}`, onRemove: () => setPropertyId("") } : null,
    search ? { key: "search", label: `Search: ${search}`, onRemove: () => setSearch("") } : null,
    scopeLevelFilter ? { key: "scope", label: `Scope: ${scopeLevelFilter}`, onRemove: () => setScopeLevelFilter("") } : null,
    structuredFilters.vacancyStatus ? { key: "vacancy", label: `Vacancy: ${structuredFilters.vacancyStatus === "__ntv__" ? "NTV" : structuredFilters.vacancyStatus === "__vacant__" ? "Vacant not leased" : structuredFilters.vacancyStatus === "__vacant_leased__" ? "Vacant leased" : structuredFilters.vacancyStatus}`, onRemove: () => setStructuredFilters((current) => ({ ...current, vacancyStatus: "" })) } : null,
    structuredFilters.assignedTech ? { key: "tech", label: `Assigned: ${structuredFilters.assignedTech === "__unassigned__" ? "Unassigned" : structuredFilters.assignedTech}`, onRemove: () => setStructuredFilters((current) => ({ ...current, assignedTech: "" })) } : null,
    structuredFilters.boardSection ? { key: "section", label: `Section: ${structuredFilters.boardSection.replace("type:", "")}`, onRemove: () => setStructuredFilters((current) => ({ ...current, boardSection: "" })) } : null,
    structuredFilters.makeReadyStatus ? { key: "make-ready", label: `Make Ready: ${structuredFilters.makeReadyStatus}`, onRemove: () => setStructuredFilters((current) => ({ ...current, makeReadyStatus: "" })) } : null,
    structuredFilters.moveInWindow ? { key: "move-in", label: `Move-In: ${structuredFilters.moveInWindow === "week" ? "This Week" : `Next ${structuredFilters.moveInWindow} Days`}`, onRemove: () => setStructuredFilters((current) => ({ ...current, moveInWindow: "" })) } : null,
    structuredFilters.overdueOnly ? { key: "overdue", label: "Overdue", onRemove: () => setStructuredFilters((current) => ({ ...current, overdueOnly: false })) } : null,
    structuredFilters.missingDatesOnly ? { key: "missing-dates", label: "Missing Dates", onRemove: () => setStructuredFilters((current) => ({ ...current, missingDatesOnly: false })) } : null,
    structuredFilters.pestIssuesOnly ? { key: "pest", label: "Pest Issues", onRemove: () => setStructuredFilters((current) => ({ ...current, pestIssuesOnly: false })) } : null,
    structuredFilters.flooringNeededOnly ? { key: "flooring", label: "Flooring Needed", onRemove: () => setStructuredFilters((current) => ({ ...current, flooringNeededOnly: false })) } : null,
    structuredFilters.paintNeededOnly ? { key: "paint", label: "Paint Needed", onRemove: () => setStructuredFilters((current) => ({ ...current, paintNeededOnly: false })) } : null,
    structuredFilters.moveInRiskOnly ? { key: "move-in-risk", label: "Move-In Risk", onRemove: () => setStructuredFilters((current) => ({ ...current, moveInRiskOnly: false })) } : null,
    structuredFilters.riskLevel ? { key: "risk-level", label: `Risk: ${structuredFilters.riskLevel}`, onRemove: () => setStructuredFilters((current) => ({ ...current, riskLevel: "" })) } : null,
    structuredFilters.riskCategory ? { key: "risk-category", label: `Risk Category: ${structuredFilters.riskCategory.replace(/_/g, " ")}`, onRemove: () => setStructuredFilters((current) => ({ ...current, riskCategory: "" })) } : null,
    structuredFilters.archiveState !== "active" ? { key: "archive", label: structuredFilters.archiveState === "archived" ? "Archived Only" : structuredFilters.archiveState === "occupied" ? "Occupied" : "Including Archived", onRemove: () => setStructuredFilters((current) => ({ ...current, archiveState: "active" })) } : null,
    ...structuredFilters.customFieldFilters.map((filter) => ({
      key: `custom-${filter.fieldId}`,
      label: customFieldFilterChipLabel(filter, metaQuery.data?.customFields ?? [], metaQuery.data?.staff ?? []),
      onRemove: () => setStructuredFilters((current) => ({ ...current, customFieldFilters: current.customFieldFilters.filter((entry) => entry.fieldId !== filter.fieldId) })),
    })),
  ].filter((chip): chip is { key: string; label: string; onRemove: () => void } => Boolean(chip));
  const activeCustomFields = (metaQuery.data?.customFields ?? []).filter((field) => !field.isArchived);
  const availableCustomFields = activeCustomFields.filter((field) => !structuredFilters.customFieldFilters.some((filter) => filter.fieldId === field.id));
  const updateCustomFilter = (fieldId: string, data: Partial<CustomFieldFilter>) => {
    setStructuredFilters((current) => ({
      ...current,
      customFieldFilters: current.customFieldFilters.map((filter) => filter.fieldId === fieldId ? { ...filter, ...data } : filter),
    }));
  };
  const serializedFilters = {
    propertyId,
    search,
    scopeLevel: scopeLevelFilter,
    ...structuredFilters,
    moveInThisWeek: structuredFilters.moveInWindow === "week",
  };

  const saveDashboardDrilldownView = async () => {
    if (!dashboardDrilldownContext || !currentUser || currentUser.role === "VIEWER") return;
    await createViewMutation.mutateAsync({
      name: dashboardDrilldownContext.savedViewName,
      module: "make-ready-board",
      viewType: activeView === "kanban" || activeView === "calendar" || activeView === "dashboard" ? activeView : "table",
      filters: serializedFilters,
      sorts: { key: sortKey, direction: sortDirection },
      grouping: {
        kanbanBy: kanbanGroupBy,
        kanbanColorBy,
        kanbanCardFields,
        kanbanSortBy,
        kanbanHideEmpty,
        calendarField: activeCalendarField,
        calendarLayout,
        calendarFields: calendarPanelFields,
        dashboardLayout,
      },
      visibleColumns,
      isShared: false,
    });
  };

  const calendarEventsByTrack = useMemo(() => Object.fromEntries(scheduleFieldOptions.map((track) => {
    const sourceField = track.sourceField;
    if (sourceField === "vendorScheduledDate" || sourceField === "vendorDueDate") {
      const itemIds = new Set(sortedItems.map((item) => item.id));
      const events = (vendorAssignmentsQuery.data?.assignments ?? [])
        .filter((assignment) => itemIds.has(assignment.itemId))
        .map((assignment) => ({
          id: assignment.itemId,
          title: `${assignment.vendor.name} ${assignment.trade}`,
          unitNumber: assignment.item.unitNumber,
          boardGroup: itemsById.get(assignment.itemId)?.boardGroup ?? "",
          propertyCode: assignment.property.code,
          date: (sourceField === "vendorScheduledDate" ? assignment.scheduledDate : assignment.dueDate) ?? "",
          moveInSoon: false,
          overdue: Boolean(track.overdueEnabled && assignment.dueDate && new Date(assignment.dueDate) < new Date()),
          trackLabel: track.displayName,
          statusField: "vendorStatus",
          statusValue: assignment.status,
          colorBasis: track.colorBasis,
          fixedColor: track.fixedColor,
          customColor: null,
          customColorLabel: assignment.status.toLowerCase().replace(/_/g, " "),
          riskLevel: itemsById.get(assignment.itemId)?.riskLevel ?? "NONE",
        }))
        .filter((event) => Boolean(event.date))
        .filter((event) => !track.visibilityFilter?.boardGroups?.length || track.visibilityFilter.boardGroups.includes(event.boardGroup))
        .filter((event) => !track.visibilityFilter?.statusValues?.length || Boolean(event.statusValue && track.visibilityFilter.statusValues.includes(event.statusValue)));
      return [track.id, events];
    }
    const customFieldId = sourceField.startsWith("custom:") ? sourceField.slice(7) : null;
    const contextByField: Record<string, { statusField: string; key: keyof (typeof sortedItems)[number] }> = {
      moveOutDate: { statusField: "vacancyStatus", key: "vacancyStatus" },
      vacatedDate: { statusField: "vacancyStatus", key: "vacancyStatus" },
      makeReadyDate: { statusField: "makeReadyStatus", key: "makeReadyStatus" },
      moveInDate: { statusField: "vacancyStatus", key: "vacancyStatus" },
      flooringDate: { statusField: "floorsStatus", key: "floorsStatus" },
    };
    const context = track.colorBasis === "SCOPE"
      ? { statusField: "scopeLevel", key: "scopeLevel" as const }
      : track.colorBasis === "STATUS"
        ? contextByField[sourceField]
        : track.colorBasis === "FIELD" && track.colorSourceField && !track.colorSourceField.startsWith("custom:")
          ? { statusField: track.colorSourceField, key: track.colorSourceField as keyof (typeof sortedItems)[number] }
        : undefined;
    const events = sortedItems
      .map((item) => {
        const date = customFieldId
          ? item.customFieldValues.find((value) => value.customFieldId === customFieldId)?.value
          : item[sourceField as keyof typeof item];
        const customColorFieldId = track.colorBasis === "FIELD" && track.colorSourceField?.startsWith("custom:")
          ? track.colorSourceField.slice(7)
          : null;
        const customColorValue = customColorFieldId
          ? item.customFieldValues.find((value) => value.customFieldId === customColorFieldId)?.value
          : null;
        const colorField = customColorFieldId
          ? (metaQuery.data?.customFields ?? []).find((field) => field.id === customColorFieldId)
          : null;
        const customOption = typeof customColorValue === "string" ? colorField?.options.find((option) => option.label === customColorValue) : null;
        return {
          id: item.id,
          title: item.itemName,
          unitNumber: item.unitNumber,
          boardGroup: item.boardGroup,
          propertyCode: item.property.code,
          date: typeof date === "string" ? date : "",
          moveInSoon: Boolean(track.moveInSoonEnabled && item.moveInSoon),
          overdue: Boolean(track.overdueEnabled && item.overdue),
          trackLabel: track.displayName,
          statusField: context?.statusField ?? "",
          statusValue: context && typeof item[context.key] === "string" ? String(item[context.key]) : null,
          colorBasis: track.colorBasis,
          fixedColor: track.fixedColor,
          customColor: customOption?.color ?? null,
          customColorLabel: typeof customColorValue === "string" ? customColorValue : null,
          riskLevel: item.riskLevel,
        };
      })
      .filter((event) => Boolean(event.date))
      .filter((event) => !track.visibilityFilter?.boardGroups?.length || track.visibilityFilter.boardGroups.includes(event.boardGroup))
      .filter((event) => !track.visibilityFilter?.statusValues?.length || Boolean(event.statusValue && track.visibilityFilter.statusValues.includes(event.statusValue)));
    return [track.id, events];
  })), [scheduleFieldOptions, metaQuery.data?.customFields, sortedItems, vendorAssignmentsQuery.data?.assignments, itemsById]);

  const applySavedView = (view: SavedView) => {
    const filters = (view.filters ?? {}) as Record<string, unknown>;
    const grouping = (view.grouping ?? {}) as Record<string, unknown>;
    setActiveView(view.viewType === "table" || view.viewType === "kanban" || view.viewType === "calendar" || view.viewType === "dashboard" ? view.viewType : "table");
    setPropertyId(typeof filters.propertyId === "string" ? filters.propertyId : "");
    setSearch(typeof filters.search === "string" ? filters.search : "");
    setScopeLevelFilter(typeof filters.scopeLevel === "string" ? filters.scopeLevel : "");
    setStructuredFilters({
      vacancyStatus: typeof filters.vacancyStatus === "string" ? filters.vacancyStatus : "",
      assignedTech: typeof filters.assignedTech === "string" ? filters.assignedTech : "",
      boardSection: typeof filters.boardSection === "string" ? filters.boardSection : "",
      makeReadyStatus: typeof filters.makeReadyStatus === "string" ? filters.makeReadyStatus : "",
      moveInWindow: filters.moveInWindow === "week" || filters.moveInWindow === "7" || filters.moveInWindow === "14" ? filters.moveInWindow : Boolean(filters.moveInThisWeek) ? "week" : "",
      overdueOnly: Boolean(filters.overdueOnly),
      missingDatesOnly: Boolean(filters.missingDatesOnly),
      pestIssuesOnly: Boolean(filters.pestIssuesOnly),
      flooringNeededOnly: Boolean(filters.flooringNeededOnly),
      paintNeededOnly: Boolean(filters.paintNeededOnly),
      moveInRiskOnly: Boolean(filters.moveInRiskOnly),
      riskLevel: typeof filters.riskLevel === "string" ? filters.riskLevel : "",
      riskCategory: typeof filters.riskCategory === "string" ? filters.riskCategory : "",
      archiveState: filters.archiveState === "archived" || filters.archiveState === "occupied" || filters.archiveState === "all" ? filters.archiveState : "active",
      customFieldFilters: normalizeCustomFieldFilters(filters.customFieldFilters, metaQuery.data?.customFields ?? []),
    });
    setSortKey(view.sorts?.key ?? "moveInDate");
    setSortDirection(view.sorts?.direction ?? "asc");
    setKanbanGroupBy((typeof grouping.kanbanBy === "string" ? grouping.kanbanBy : "makeReadyStatus") as KanbanGroupKey);
    setKanbanColorBy((typeof grouping.kanbanColorBy === "string" ? grouping.kanbanColorBy : "vacancyStatus") as typeof kanbanColorBy);
    setKanbanCardFields(Array.isArray(grouping.kanbanCardFields) ? grouping.kanbanCardFields.map(String) : ["floorPlan", "vacancyStatus", "scopeLevel", "assignedTech", "moveInDate"]);
    setKanbanSortBy(typeof grouping.kanbanSortBy === "string" ? grouping.kanbanSortBy : "moveInDate");
    setKanbanHideEmpty(Boolean(grouping.kanbanHideEmpty));
    setActiveCalendarField(typeof grouping.calendarField === "string" ? grouping.calendarField : "moveInDate");
    setCalendarLayout((typeof grouping.calendarLayout === "string" ? grouping.calendarLayout : "single") as typeof calendarLayout);
    setCalendarPanelFields(Array.isArray(grouping.calendarFields) ? grouping.calendarFields.map(String) : []);
    setDashboardLayout(grouping.dashboardLayout === "focus" ? "focus" : "overview");
    setVisibleColumns(normalizeVisibleColumns(view.visibleColumns, metaQuery.data?.customFields ?? [], metaQuery.data?.columns ?? []));
  };

  useEffect(() => {
    if (currentUser && typeof document !== "undefined") {
      document.documentElement.lang = currentUser.language;
    }
  }, [currentUser]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName ?? "";
      const isEditingTarget = target?.isContentEditable || tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
      if (isEditingTarget) return;
      if (event.key === "?") {
        event.preventDefault();
        setShortcutHelpOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (meQuery.isPending && !forceLoggedOut) {
    return (
      <main className="login-shell">
        <StatusState title="Checking session" description="Restoring your last active workspace and permissions." />
      </main>
    );
  }

  if (!currentUser) {
    return (
      <>
        <LoginScreen
          loading={loginMutation.isPending}
          errorMessage={loginError || (meQuery.error instanceof Error && !isApiError(meQuery.error) ? meQuery.error.message : "")}
          infoMessage={sessionMessage}
          language="en"
          onSubmit={async (identifier, password) => {
            await loginMutation.mutateAsync({ identifier, password });
          }}
        />
        <PWAInstallPrompt />
        <ToastViewport toasts={toasts} onDismiss={dismissToast} language="en" />
      </>
    );
  }

  return (
    <div className={`${compactMode ? "app-shell compact-mode" : "app-shell"}${eyeStrainMode ? " reading-mode" : ""}${dyslexiaMode ? " dyslexia-mode" : ""}`} data-theme={themeMode}>
      <FilterBar
        properties={metaQuery.data?.properties ?? []}
        currentUser={currentUser}
        selectedPropertyId={propertyId}
        search={search}
        onPropertyChange={setPropertyId}
        onSearchChange={setSearch}
        activeView={activeView}
        onViewChange={setActiveView}
        showAdmin={currentUser.role === "ADMIN"}
        showFieldManager={currentUser.role === "ADMIN" || currentUser.role === "MANAGER"}
        showAutomations={currentUser.role === "ADMIN" || currentUser.role === "MANAGER"}
        showActivity={currentUser.role === "ADMIN" || currentUser.role === "MANAGER" || currentUser.role === "LEASING"}
        showOperations={currentUser.role === "ADMIN" || currentUser.role === "MANAGER"}
        showVendors={currentUser.role !== "VIEWER" && currentUser.role !== "CLEANER"}
        compactMode={compactMode}
        onCompactModeChange={setCompactMode}
        themeMode={themeMode}
        onThemeModeChange={setThemeMode}
        clockMode={clockMode}
        onClockModeChange={setClockMode}
        eyeStrainMode={eyeStrainMode}
        onEyeStrainModeChange={setEyeStrainMode}
        dyslexiaMode={dyslexiaMode}
        onDyslexiaModeChange={setDyslexiaMode}
        language={currentUser.language}
        onLanguageChange={(language) => {
          updateLanguageMutation.mutate({ language });
        }}
        archiveMode={structuredFilters.archiveState}
        onArchiveModeChange={(value) => setStructuredFilters((current) => ({ ...current, archiveState: value }))}
        notificationUnreadCount={notificationsQuery.data?.unreadCount ?? 0}
        onOpenNotifications={() => setNotificationsOpen(true)}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        onOpenOnboarding={() => {
          setOnboardingSkipped(false);
          removeStorageValue(onboardingSkippedStorageKey);
          setOnboardingOpen(true);
        }}
        onApplyBasicMode={applyBasicBoardMode}
        onOpenShortcutHelp={() => setShortcutHelpOpen(true)}
        onLogout={async () => {
          await logoutMutation.mutateAsync();
        }}
      />

      <main className="workspace module-rail-layout">
        <aside className="module-rail" aria-label="MakeReadyOS modules">
          <button
            className={activeView === "refrigerant" || activeView === "pool" || activeView === "pest" || activeView === "lease" || activeView === "pm" || activeView === "projects" || activeView === "wiki" ? "module-rail-button" : "module-rail-button active"}
            type="button"
            title="MakeReadyOS board"
            aria-label="MakeReadyOS board"
            onClick={() => setActiveView("table")}
          >
            <span className="module-rail-icon" style={moduleRailMask("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M4 5h6v14H4V5Zm9 0h7v4h-7V5Zm0 7h7v7h-7v-7Z'/%3E%3C/svg%3E")} aria-hidden="true" />
          </button>
          {currentUser.role !== "CLEANER" && currentUser.role !== "LEASING" ? (
            <button
              className={activeView === "refrigerant" ? "module-rail-button active" : "module-rail-button"}
              type="button"
              title="RefrigerantLogOS"
              aria-label="Open RefrigerantLogOS"
              data-testid="module-rail-refrigerant"
              onClick={() => setActiveView("refrigerant")}
            >
              <span className="module-rail-icon" style={moduleRailMask("/icons/fontawesome/snowflake.svg")} aria-hidden="true" />
            </button>
          ) : null}
          <button
            className={activeView === "pool" ? "module-rail-button active" : "module-rail-button"}
            type="button"
            title="PoolLogOS"
            aria-label="Open PoolLogOS"
            data-testid="module-rail-pool"
            onClick={() => setActiveView("pool")}
          >
            <span className="module-rail-icon" style={moduleRailMask("/icons/fontawesome/pool.svg")} aria-hidden="true" />
          </button>
          <button
            className={activeView === "pest" ? "module-rail-button active" : "module-rail-button"}
            type="button"
            title="Pest Control"
            aria-label="Open Pest Control"
            data-testid="module-rail-pest"
            onClick={() => setActiveView("pest")}
          >
            <span className="module-rail-icon" style={moduleRailMask("/icons/fontawesome/pest.svg")} aria-hidden="true" />
          </button>
          <button
            className={activeView === "lease" ? "module-rail-button active" : "module-rail-button"}
            type="button"
            title="Lease Compliance"
            aria-label="Open Lease Compliance"
            data-testid="module-rail-lease-compliance"
            onClick={() => setActiveView("lease")}
          >
            <span className="module-rail-icon" style={moduleRailMask("/icons/fontawesome/lease.svg")} aria-hidden="true" />
          </button>
          <button
            className={activeView === "pm" ? "module-rail-button active" : "module-rail-button"}
            type="button"
            title="Preventive Maintenance"
            aria-label="Open Preventive Maintenance"
            data-testid="module-rail-pm"
            onClick={() => setActiveView("pm")}
          >
            <span className="module-rail-icon" style={moduleRailMask("/icons/fontawesome/pm.svg")} aria-hidden="true" />
          </button>
          {currentUser.role !== "CLEANER" ? (
            <button
              className={activeView === "projects" ? "module-rail-button active" : "module-rail-button"}
              type="button"
              title="Projects"
              aria-label="Open Projects"
              data-testid="module-rail-projects"
              onClick={() => setActiveView("projects")}
            >
              <span className="module-rail-icon" style={moduleRailMask("/icons/fontawesome/projects.svg")} aria-hidden="true" />
            </button>
          ) : null}
          <button
            className={activeView === "wiki" ? "module-rail-button active" : "module-rail-button"}
            type="button"
            title="Property Wiki"
            aria-label="Open Property Wiki"
            data-testid="module-rail-property-wiki"
            onClick={() => setActiveView("wiki")}
          >
            <span className="module-rail-icon" style={moduleRailMask("/icons/fontawesome/wiki.svg")} aria-hidden="true" />
          </button>
          {activeFilterChips.length ? (
            <button className="module-rail-button rail-filter-count" type="button" onClick={() => clearBoardFilters(true)} aria-label="Clear active filters">{activeFilterChips.length}</button>
          ) : null}
        </aside>

        <section className="primary-panel">
          <ConnectionStatus
            online={isOnline}
            degraded={apiDegraded}
            lastIssueAt={lastConnectionIssueAt}
            pendingSyncCount={offlineQueuePendingCount}
            blockedCount={offlineQueueBlockedJobs.length}
            conflictCount={offlineQueueBlockedJobs.filter((job) => job.lastErrorStatus === 409).length}
            syncing={offlineQueueSyncing}
            language={currentUser.language}
            onRetry={retryConnection}
            onReviewQueue={() => setOfflineQueueReviewOpen(true)}
          />
          <Suspense fallback={
            <div className="panel-state-wrap">
              <StatusState title={t(currentUser.language, "status.loadingWorkspace")} description={t(currentUser.language, "status.loadingWorkspaceCopy")} />
            </div>
          }>
          {activeView === "dashboard" ? (
            <DashboardPanel
              data={dashboardQuery.data}
              analytics={analyticsQuery.data}
              loading={dashboardQuery.isLoading}
              analyticsLoading={analyticsQuery.isLoading}
              error={dashboardQuery.isError}
              propertyId={propertyId}
              onOpenItem={openItemDrawer}
              language={currentUser.language}
              onDrillDown={({ type, value }) => {
                setActiveView("table");
                clearBoardFilters(true);
                const contextLabel = currentUser.language === "es"
                  ? `Filtro aplicado desde el dashboard: ${value}`
                  : `Dashboard drilldown: ${value}`;
                const savedViewName = currentUser.language === "es"
                  ? `Dashboard / ${value}`
                  : `Dashboard / ${value}`;
                setDashboardDrilldownContext({ label: contextLabel, savedViewName });
                if (type === "property") {
                  setPropertyId(metaQuery.data?.properties.find((property) => property.code === value)?.id ?? "");
                } else if (type === "vacancy") {
                  setStructuredFilters((current) => ({ ...current, vacancyStatus: value }));
                } else if (type === "tech") {
                  setStructuredFilters((current) => ({ ...current, assignedTech: value === "Unassigned" ? "__unassigned__" : value }));
                } else if (type === "scope") {
                  setScopeLevelFilter(value);
                } else if (type === "risk") {
                  setStructuredFilters((current) => ({ ...current, riskLevel: value }));
                } else if (type === "kpi") {
                  if (value === "mappedUnits" || value === "unmappedUnits" || value === "highRiskMappedUnits") {
                    setActiveView("maps");
                    return;
                  }
                  const kpiFilters: Record<string, Partial<StructuredFilters>> = {
                    vacant: { vacancyStatus: "__vacant__" },
                    vacantLeased: { vacancyStatus: "__vacant_leased__" },
                    ntv: { vacancyStatus: "__ntv__" },
                    downUnits: { boardSection: "type:DOWN" },
                    readyUnits: { boardSection: "type:READY" },
                    archived: { archiveState: "archived" },
                    moveInsThisWeek: { moveInWindow: "week" },
                    moveInsNext7Days: { moveInWindow: "7" },
                    moveInsNext14Days: { moveInWindow: "14" },
                    overdue: { overdueOnly: true },
                    missingTech: { assignedTech: "__unassigned__" },
                    missingCriticalDates: { missingDatesOnly: true },
                    pestIssues: { pestIssuesOnly: true },
                    flooringNeeds: { flooringNeededOnly: true },
                    paintNeeds: { paintNeededOnly: true },
                    moveInRisk: { moveInRiskOnly: true },
                    riskCritical: { riskLevel: "CRITICAL" },
                    riskHigh: { riskLevel: "HIGH" },
                    agingTurns: { riskCategory: "PROPERTY_WORKLOAD" },
                    vendorOverdue: { riskCategory: "VENDOR_RISK" },
                    vendorFollowUpNeeded: { riskCategory: "VENDOR_RISK" },
                    blockedByVendor: { riskCategory: "VENDOR_RISK" },
                  };
                  const next = kpiFilters[value] ?? {};
                  setStructuredFilters((current) => ({ ...current, ...next }));
                }
              }}
              onOpenPond={() => setActiveView("pond")}
              layout={dashboardLayout}
              onLayoutChange={setDashboardLayout}
            />
          ) : activeView === "mywork" ? (
            <MyWorkPanel
              data={myWorkQuery.data}
              loading={myWorkQuery.isLoading}
              error={myWorkQuery.isError}
              currentUser={currentUser}
              staff={metaQuery.data?.staff ?? []}
              labelsByField={labelsByField}
              selectedUserId={myWorkUserId}
              onUserChange={setMyWorkUserId}
              onOpenItem={openItemDrawer}
              onRetry={() => void myWorkQuery.refetch()}
              onQuickStatusChange={async (id, value) => {
                await patchMutation.mutateAsync({ id, data: { makeReadyStatus: value } });
              }}
            />
          ) : activeView === "planning" ? (
            <PlanningPanel
              data={planningQuery.data}
              properties={metaQuery.data?.properties ?? []}
              items={boardItems}
              propertyId={propertyId}
              language={currentUser.language}
              onPropertyChange={setPropertyId}
              loading={planningQuery.isLoading || itemsQuery.isLoading}
              error={planningQuery.isError}
              canManage={currentUser.role === "ADMIN" || currentUser.role === "MANAGER" || currentUser.role === "TECH"}
              onCreateBlock={async (input) => { await workBlockCreateMutation.mutateAsync(input); }}
              onUpdateBlock={async (id, input) => { await workBlockUpdateMutation.mutateAsync({ id, data: input }); }}
              onOpenItem={openItemDrawer}
            />
          ) : activeView === "operations" && (currentUser.role === "ADMIN" || currentUser.role === "MANAGER") ? (
            operationsPropertiesQuery.isLoading || operationsUnitsQuery.isLoading || operationsOptionsQuery.isLoading || floorPlansQuery.isLoading || scheduleTracksQuery.isLoading || operatingCalendarsQuery.isLoading || riskPoliciesQuery.isLoading ? (
              <div className="panel-state-wrap">
                <StatusState title={t(currentUser.language, "status.loadingBoardSetup")} description={t(currentUser.language, "status.loadingBoardSetupCopy")} />
              </div>
            ) : operationsPropertiesQuery.isError || operationsUnitsQuery.isError || operationsOptionsQuery.isError || floorPlansQuery.isError || scheduleTracksQuery.isError || operatingCalendarsQuery.isError || riskPoliciesQuery.isError ? (
              <div className="panel-state-wrap">
                <StatusState title={t(currentUser.language, "status.boardSetupFailed")} description={t(currentUser.language, "status.boardSetupFailedCopy")} tone="error" />
              </div>
            ) : (
              <>
              <OperationsPanel
                language={currentUser.language}
                role={currentUser.role}
                properties={operationsPropertiesQuery.data?.properties ?? []}
                units={operationsUnitsQuery.data?.units ?? []}
                floorPlans={floorPlansQuery.data?.floorPlans ?? []}
                operatingCalendars={operatingCalendarsQuery.data?.calendars ?? []}
                riskPolicies={riskPoliciesQuery.data?.policies ?? []}
                labels={operationsOptionsQuery.data?.options ?? []}
                staff={metaQuery.data?.staff ?? []}
                items={boardItems}
                boardGroups={metaQuery.data?.boardGroups ?? []}
                boardSections={metaQuery.data?.boardSections ?? []}
                loading={
                  createPropertyMutation.isPending || updatePropertyMutation.isPending || propertyLifecycleMutation.isPending || deletePropertyMutation.isPending
                  || createUnitMutation.isPending || updateUnitMutation.isPending || importUnitsMutation.isPending || importAvailabilityMutation.isPending || unitLifecycleMutation.isPending || deleteUnitMutation.isPending
                  || revertUnitImportMutation.isPending
                  || createItemMutation.isPending || itemLifecycleMutation.isPending
                  || operatingCalendarUpdateMutation.isPending
                  || riskPolicyUpdateMutation.isPending
                }
                message={operationsMessage}
                error={operationsError}
                onCreateProperty={async (input) => { await createPropertyMutation.mutateAsync(input); }}
                onUpdateProperty={async (id, input) => { await updatePropertyMutation.mutateAsync({ id, data: input }); }}
                onArchiveProperty={async (id, restore) => { await propertyLifecycleMutation.mutateAsync({ id, restore }); }}
                onDeleteProperty={async (id) => { await deletePropertyMutation.mutateAsync(id); }}
                onCreateUnit={async (input) => { await createUnitMutation.mutateAsync(input); }}
                onUpdateUnit={async (id, input) => { await updateUnitMutation.mutateAsync({ id, data: input }); }}
                onImportUnits={async (input) => importUnitsMutation.mutateAsync(input)}
                onImportAvailability={async (input) => importAvailabilityMutation.mutateAsync(input)}
                onRevertUnitImport={async (input) => { await revertUnitImportMutation.mutateAsync(input); }}
                onArchiveUnit={async (id, restore) => { await unitLifecycleMutation.mutateAsync({ id, restore }); }}
                onDeleteUnit={async (id) => { await deleteUnitMutation.mutateAsync(id); }}
                onCreateItem={async (input) => { await createItemMutation.mutateAsync(input); }}
                onArchiveItem={async (id, restore) => { await itemLifecycleMutation.mutateAsync({ id, restore }); }}
                onOpenItem={openItemDrawer}
                onUpdateOperatingCalendar={async (propertyId, input) => { await operatingCalendarUpdateMutation.mutateAsync({ propertyId, data: input }); }}
                onUpdateRiskPolicy={async (propertyId, input) => { await riskPolicyUpdateMutation.mutateAsync({ propertyId, data: input }); }}
              />
              <BoardConfigurationPanel
                language={currentUser.language}
                properties={operationsPropertiesQuery.data?.properties ?? []}
                boardSections={metaQuery.data?.boardSections ?? []}
                options={operationsOptionsQuery.data?.options ?? []}
                floorPlans={floorPlansQuery.data?.floorPlans ?? []}
                columns={metaQuery.data?.columns ?? []}
                scheduleTracks={scheduleTracksQuery.data?.tracks ?? []}
                customFields={metaQuery.data?.customFields ?? []}
                loading={optionCreateMutation.isPending || optionUpdateMutation.isPending || optionArchiveMutation.isPending || renameSectionMutation.isPending || floorPlanCreateMutation.isPending || floorPlanUpdateMutation.isPending || floorPlanArchiveMutation.isPending || columnUpdateMutation.isPending || scheduleTrackCreateMutation.isPending || scheduleTrackUpdateMutation.isPending || scheduleTrackReorderMutation.isPending || scheduleTrackArchiveMutation.isPending}
                onCreateOption={async (input) => { await optionCreateMutation.mutateAsync(input); }}
                onUpdateOption={async (id, input) => { await optionUpdateMutation.mutateAsync({ id, data: input }); }}
                onArchiveOption={async (id, restore) => { await optionArchiveMutation.mutateAsync({ id, restore }); }}
                onReorderOptions={async (ids) => { await optionReorderMutation.mutateAsync(ids); }}
                onUpdateBoardSection={async (id, displayName) => { await renameSectionMutation.mutateAsync({ id, displayName }); }}
                onCreateFloorPlan={async (input) => { await floorPlanCreateMutation.mutateAsync(input); }}
                onUpdateFloorPlan={async (id, input) => { await floorPlanUpdateMutation.mutateAsync({ id, data: input }); }}
                onArchiveFloorPlan={async (id, restore) => { await floorPlanArchiveMutation.mutateAsync({ id, restore }); }}
                onUpdateColumn={async (fieldKey, label) => { await columnUpdateMutation.mutateAsync({ fieldKey, label }); }}
                onCreateScheduleTrack={async (input) => { await scheduleTrackCreateMutation.mutateAsync(input); }}
                onUpdateScheduleTrack={async (id, input) => { await scheduleTrackUpdateMutation.mutateAsync({ id, data: input }); }}
                onReorderScheduleTracks={async (ids) => { await scheduleTrackReorderMutation.mutateAsync(ids); }}
                onArchiveScheduleTrack={async (id, restore) => { await scheduleTrackArchiveMutation.mutateAsync({ id, restore }); }}
              />
              </>
            )
          ) : activeView === "maps" ? (
            <PropertyMapsPanel
              properties={metaQuery.data?.properties ?? []}
              units={metaQuery.data?.units ?? []}
              items={boardItems}
              maps={propertyMapsQuery.data?.maps ?? []}
              locations={unitMapLocationsQuery.data?.locations ?? []}
              areas={propertyMapAreasQuery.data?.areas ?? []}
              labelsByField={labelsByField}
              boardSections={metaQuery.data?.boardSections ?? []}
              selectedPropertyId={propertyId}
              canManage={currentUser.role === "ADMIN" || currentUser.role === "MANAGER"}
              language={currentUser.language}
              loading={propertyMapsQuery.isLoading || unitMapLocationsQuery.isLoading || propertyMapAreasQuery.isLoading}
              error={propertyMapsQuery.isError || unitMapLocationsQuery.isError || propertyMapAreasQuery.isError ? "Property map data failed to load." : null}
              onPropertyChange={setPropertyId}
              onCreateMap={async (input) => (await propertyMapCreateMutation.mutateAsync(input)).map}
              onArchiveMap={async (id, restore = false) => { await propertyMapArchiveMutation.mutateAsync({ id, restore }); }}
              onDeleteMap={async (id) => { await propertyMapDeleteMutation.mutateAsync(id); }}
              onUploadMap={async (id, file) => (await propertyMapUploadMutation.mutateAsync({ id, file })).map}
              onSaveLocation={async (input) => { await unitMapLocationSaveMutation.mutateAsync(input); }}
              onRemoveLocation={async (id) => { await unitMapLocationRemoveMutation.mutateAsync(id); }}
              onCreateArea={async (input) => { await propertyMapAreaCreateMutation.mutateAsync(input); }}
              onUpdateArea={async (id, input) => { await propertyMapAreaUpdateMutation.mutateAsync({ id, data: input }); }}
              onRemoveArea={async (id) => { await propertyMapAreaRemoveMutation.mutateAsync(id); }}
              onOpenItem={openItemDrawer}
            />
          ) : activeView === "pond" ? (
            <FrogPondPanel
              items={sortedItems}
              properties={metaQuery.data?.properties ?? []}
              boardSections={metaQuery.data?.boardSections ?? []}
              labelsByField={labelsByField}
              language={currentUser.language}
              selectedPropertyId={propertyId}
              loading={metaQuery.isLoading || itemsQuery.isLoading}
              error={metaQuery.isError || itemsQuery.isError}
              onOpenItem={openItemDrawer}
              onPropertyChange={setPropertyId}
              onGroupDrillDown={({ type, value }) => {
                setActiveView("table");
                if (type === "property") {
                  setPropertyId(metaQuery.data?.properties.find((property) => property.code === value)?.id ?? propertyId);
                } else if (type === "boardSection") {
                  const section = (metaQuery.data?.boardSections ?? []).find((entry) => entry.displayName === value || entry.key === value);
                  setStructuredFilters((current) => ({ ...current, boardSection: section?.key ?? "" }));
                } else if (type === "riskLevel") {
                  setStructuredFilters((current) => ({ ...current, riskLevel: value === "No active risk" ? "NONE" : value }));
                } else if (type === "assignedTech") {
                  setStructuredFilters((current) => ({ ...current, assignedTech: value === "Unassigned" ? "__unassigned__" : value }));
                }
              }}
            />
          ) : activeView === "vendors" && currentUser.role !== "VIEWER" && currentUser.role !== "CLEANER" ? (
            <VendorsPanel
              vendors={vendorsQuery.data?.vendors ?? []}
              assignments={vendorAssignmentsQuery.data?.assignments ?? []}
              properties={metaQuery.data?.properties ?? []}
              items={boardItems}
              canManageDirectory={currentUser.role === "ADMIN" || currentUser.role === "MANAGER"}
              canCoordinateAssignments={currentUser.role === "ADMIN" || currentUser.role === "MANAGER" || currentUser.role === "TECH" || currentUser.role === "LEASING"}
              language={currentUser.language}
              loading={vendorsQuery.isLoading || vendorAssignmentsQuery.isLoading}
              error={vendorsQuery.isError || vendorAssignmentsQuery.isError ? "Vendor data failed to load." : null}
              onCreateVendor={async (input) => { await vendorCreateMutation.mutateAsync(input); }}
              onArchiveVendor={async (id, restore = false) => { await vendorArchiveMutation.mutateAsync({ id, restore }); }}
              onCreateAssignment={async (input) => { await vendorAssignmentCreateMutation.mutateAsync(input); }}
              onUpdateAssignment={async (id, input) => { await vendorAssignmentUpdateMutation.mutateAsync({ id, data: input }); }}
            />
          ) : activeView === "refrigerant" && currentUser.role !== "CLEANER" && currentUser.role !== "LEASING" ? (
            <RefrigerantPanel
              properties={metaQuery.data?.properties ?? []}
              units={metaQuery.data?.units ?? []}
              userRole={currentUser.role}
              language={currentUser.language}
            />
          ) : activeView === "pool" ? (
            <PoolLogPanel
              properties={metaQuery.data?.properties ?? []}
              selectedPropertyId={propertyId}
              userRole={currentUser.role}
              language={currentUser.language}
            />
          ) : activeView === "pest" ? (
            <PestControlPanel
              properties={metaQuery.data?.properties ?? []}
              units={metaQuery.data?.units ?? []}
              users={adminUsersQuery.data?.users?.map((user) => ({ id: user.id, fullName: user.fullName, role: user.role })) ?? []}
              selectedPropertyId={propertyId}
              userRole={currentUser.role}
              language={currentUser.language}
              openQuickAddRequest={pestQuickAddRequest}
              workspaceRequest={pestWorkspaceRequest}
            />
          ) : activeView === "lease" ? (
            <LeaseCompliancePanel
              properties={metaQuery.data?.properties ?? []}
              units={metaQuery.data?.units ?? []}
              users={adminUsersQuery.data?.users?.map((user) => ({ id: user.id, fullName: user.fullName, role: user.role })) ?? []}
              selectedPropertyId={propertyId}
              userRole={currentUser.role}
              language={currentUser.language}
              openQuickAddRequest={leaseQuickAddRequest}
              workspaceRequest={leaseWorkspaceRequest}
            />
          ) : activeView === "pm" ? (
            <PreventiveMaintenancePanel
              properties={metaQuery.data?.properties ?? []}
              selectedPropertyId={propertyId}
              userRole={currentUser.role}
              language={currentUser.language}
            />
          ) : activeView === "projects" && currentUser.role !== "CLEANER" ? (
            <ProjectsPanel
              properties={metaQuery.data?.properties ?? []}
              users={adminUsersQuery.data?.users?.map((user) => ({ id: user.id, fullName: user.fullName, role: user.role })) ?? []}
              selectedPropertyId={propertyId}
              userRole={currentUser.role}
              language={currentUser.language}
              openRecordRequest={projectRecordRequest}
              openCreateRequest={projectCreateRequest}
            />
          ) : activeView === "wiki" ? (
            <PropertyWikiPanel
              properties={metaQuery.data?.properties ?? []}
              selectedPropertyId={propertyId}
              userRole={currentUser.role}
              language={currentUser.language}
              openRecordRequest={wikiRecordRequest}
            />
          ) : activeView === "fields" && (currentUser.role === "ADMIN" || currentUser.role === "MANAGER") ? (
            customFieldsQuery.isLoading ? (
              <div className="panel-state-wrap">
                <StatusState title={t(currentUser.language, "status.loadingCustomFields")} description={t(currentUser.language, "status.loadingCustomFieldsCopy")} />
              </div>
            ) : customFieldsQuery.isError ? (
              <div className="panel-state-wrap">
                <StatusState title={t(currentUser.language, "status.customFieldsFailed")} description={t(currentUser.language, "status.customFieldsFailedCopy")} tone="error" />
              </div>
            ) : (
              <CustomFieldsPanel
                language={currentUser.language}
                fields={customFieldsQuery.data?.fields ?? []}
                loading={createFieldMutation.isPending || updateFieldMutation.isPending || archiveFieldMutation.isPending || restoreFieldMutation.isPending || trashFieldMutation.isPending || deleteFieldMutation.isPending || reorderFieldMutation.isPending}
                message={fieldMessage}
                error={fieldError}
                onCreate={async (input) => {
                  await createFieldMutation.mutateAsync(input);
                }}
                onUpdate={async (id, input) => {
                  await updateFieldMutation.mutateAsync({ id, data: input });
                }}
                onArchive={async (id) => {
                  await archiveFieldMutation.mutateAsync(id);
                }}
                onRestore={async (id) => {
                  await restoreFieldMutation.mutateAsync(id);
                }}
                onTrash={async (id) => {
                  await trashFieldMutation.mutateAsync(id);
                }}
                onPermanentDelete={async (id) => {
                  await deleteFieldMutation.mutateAsync(id);
                }}
                onReorder={async (fieldIds) => {
                  await reorderFieldMutation.mutateAsync(fieldIds);
                }}
              />
            )
          ) : activeView === "automations" && (currentUser.role === "ADMIN" || currentUser.role === "MANAGER") ? (
            automationsQuery.isLoading || automationTemplatesQuery.isLoading || operationalLibraryQuery.isLoading || propertyTemplatesQuery.isLoading ? (
              <div className="panel-state-wrap">
                <StatusState title={t(currentUser.language, "status.loadingAutomations")} description={t(currentUser.language, "status.loadingAutomationsCopy")} />
              </div>
            ) : automationsQuery.isError || automationTemplatesQuery.isError || operationalLibraryQuery.isError || propertyTemplatesQuery.isError ? (
              <div className="panel-state-wrap">
                <StatusState title={t(currentUser.language, "status.automationsFailed")} description={t(currentUser.language, "status.automationsFailedCopy")} tone="error" />
              </div>
            ) : (
              <AutomationPanel
                role={currentUser.role}
                language={currentUser.language}
                properties={metaQuery.data?.properties ?? []}
                customFields={metaQuery.data?.customFields ?? []}
                rules={automationsQuery.data?.rules ?? []}
                templates={automationTemplatesQuery.data?.templates ?? []}
                libraryPacks={operationalLibraryQuery.data?.packs ?? []}
                propertyTemplates={propertyTemplatesQuery.data?.templates ?? []}
                libraryPreview={libraryPreview}
                templatePreview={templatePreview}
                runs={automationRunsQuery.data?.runs ?? []}
                preview={automationPreview}
                loading={createAutomationMutation.isPending || installAutomationTemplateMutation.isPending || previewOperationalLibraryMutation.isPending || installOperationalLibraryMutation.isPending || previewPropertyTemplateMutation.isPending || createPropertyTemplateMutation.isPending || applyPropertyTemplateMutation.isPending || archivePropertyTemplateMutation.isPending || restorePropertyTemplateMutation.isPending || deletePropertyTemplateMutation.isPending || updateAutomationMutation.isPending || toggleAutomationMutation.isPending || archiveAutomationMutation.isPending || previewAutomationMutation.isPending || runAutomationMutation.isPending}
                previewLoading={previewAutomationMutation.isPending}
                message={automationMessage}
                error={automationError}
                onCreate={async (input) => {
                  await createAutomationMutation.mutateAsync(input);
                }}
                onInstallTemplate={async (templateId, propertyId, enabled) => {
                  await installAutomationTemplateMutation.mutateAsync({ templateId, propertyId, enabled });
                }}
                onPreviewLibraryPack={async (input) => {
                  await previewOperationalLibraryMutation.mutateAsync(input);
                }}
                onInstallLibraryPack={async (input) => {
                  await installOperationalLibraryMutation.mutateAsync(input);
                }}
                onPreviewPropertyTemplate={async (input) => {
                  await previewPropertyTemplateMutation.mutateAsync(input);
                }}
                onCreatePropertyTemplate={async (input) => {
                  await createPropertyTemplateMutation.mutateAsync(input);
                }}
                onApplyPropertyTemplate={async (id, input) => {
                  await applyPropertyTemplateMutation.mutateAsync({ id, input });
                }}
                onArchivePropertyTemplate={async (id) => {
                  await archivePropertyTemplateMutation.mutateAsync(id);
                }}
                onRestorePropertyTemplate={async (id) => {
                  await restorePropertyTemplateMutation.mutateAsync(id);
                }}
                onDeletePropertyTemplate={async (id) => {
                  await deletePropertyTemplateMutation.mutateAsync(id);
                }}
                onUpdate={async (id, input) => {
                  await updateAutomationMutation.mutateAsync({ id, data: input });
                }}
                onToggle={async (id, enabled) => {
                  await toggleAutomationMutation.mutateAsync({ id, enabled });
                }}
                onArchive={async (id) => {
                  await archiveAutomationMutation.mutateAsync(id);
                }}
                onPreviewStored={async (id) => {
                  await previewAutomationMutation.mutateAsync({ ruleId: id });
                }}
                onPreviewDraft={async (draft) => {
                  await previewAutomationMutation.mutateAsync({ draft });
                }}
                onRunNow={async (id) => {
                  await runAutomationMutation.mutateAsync(id);
                }}
                onSelectRule={(id) => {
                  setAutomationRuleId(id);
                  setAutomationPreview(null);
                }}
              />
            )
          ) : activeView === "activity" && (currentUser.role === "ADMIN" || currentUser.role === "MANAGER" || currentUser.role === "LEASING") ? (
            <ActivityPanel onSessionExpired={handleSessionExpired} language={currentUser.language} />
          ) : activeView === "admin" && currentUser.role === "ADMIN" ? (
            adminUsersQuery.isLoading || adminPropertiesQuery.isLoading ? (
              <div className="panel-state-wrap">
                <StatusState title={t(currentUser.language, "status.loadingAdminWorkspace")} description={t(currentUser.language, "status.loadingAdminWorkspaceCopy")} />
              </div>
            ) : adminUsersQuery.isError || adminPropertiesQuery.isError ? (
              <div className="panel-state-wrap">
                <StatusState
                  title={t(currentUser.language, "status.adminFailed")}
                  description={t(currentUser.language, "status.adminFailedCopy")}
                  tone="error"
                />
              </div>
            ) : (
              <AdminPanel
                users={adminUsersQuery.data?.users ?? []}
                properties={adminPropertiesQuery.data?.properties ?? []}
                appInfo={metaQuery.data?.app ?? null}
                currentUserId={currentUser.id}
                language={currentUser.language}
                loading={
                  adminUsersQuery.isLoading ||
                  adminCreateMutation.isPending ||
                  adminUpdateMutation.isPending ||
                  adminResetPasswordMutation.isPending ||
                  adminDeactivateMutation.isPending ||
                  adminPropertyAccessMutation.isPending
                }
                successMessage={adminMessage}
                errorMessage={adminError}
                onCreateUser={async (input) => {
                  await adminCreateMutation.mutateAsync(input);
                }}
                onUpdateUser={async (id, data) => {
                  await adminUpdateMutation.mutateAsync({ id, data });
                }}
                onResetPassword={async (id, password) => {
                  await adminResetPasswordMutation.mutateAsync({ id, password });
                }}
                onDeactivateUser={async (id) => {
                  await adminDeactivateMutation.mutateAsync(id);
                }}
                onUpdatePropertyAccess={async (id, propertyIds) => {
                  await adminPropertyAccessMutation.mutateAsync({ id, propertyIds });
                }}
                onBackupImported={async () => {
                  await queryClient.invalidateQueries({ queryKey: ["meta"] });
                  await queryClient.invalidateQueries({ queryKey: ["make-ready-items"] });
                  await queryClient.invalidateQueries({ queryKey: ["saved-views"] });
                  pushToast(t("ops.backupImported", language), t("ops.backupImportedCopy", language), "success");
                }}
              />
            )
          ) : metaQuery.isLoading || itemsQuery.isLoading ? (
            <div className="panel-state-wrap">
              <StatusState title={t(currentUser.language, "status.loadingBoard")} description={t(currentUser.language, "status.loadingBoardCopy")} />
            </div>
          ) : metaQuery.isError || itemsQuery.isError ? (
            <div className="panel-state-wrap">
              <StatusState
                title={t(currentUser.language, "status.boardFailed")}
                description={t(currentUser.language, "status.boardFailedCopy")}
                tone="error"
                action={{ label: t(currentUser.language, "status.reload"), onClick: () => window.location.reload() }}
              />
            </div>
          ) : savedViewsQuery.isLoading ? (
            <div className="panel-state-wrap">
              <StatusState title={t(currentUser.language, "status.loadingSavedViews")} description={t(currentUser.language, "status.loadingSavedViewsCopy")} />
            </div>
          ) : savedViewsQuery.isError ? (
            <div className="panel-state-wrap">
              <StatusState title={t(currentUser.language, "status.savedViewsFailed")} description={t(currentUser.language, "status.savedViewsFailedCopy")} tone="error" />
            </div>
          ) : <>
            {(activeView === "table" || activeView === "kanban" || activeView === "calendar") ? (
              <>
                <ActiveFilterBar
                  chips={activeFilterChips}
                  resultCount={structuredFilters.archiveState === "occupied" ? occupiedDirectoryResultCount : sortedItems.length}
                  onClear={() => clearBoardFilters()}
                  contextLabel={dashboardDrilldownContext?.label ?? null}
                  onDismissContext={dashboardDrilldownContext ? () => setDashboardDrilldownContext(null) : undefined}
                  saveLabel={currentUser.role === "VIEWER" ? null : currentUser.language === "es" ? "Guardar vista" : "Save view"}
                  onSaveContext={dashboardDrilldownContext && currentUser.role !== "VIEWER" ? () => void saveDashboardDrilldownView() : undefined}
                  savingContext={createViewMutation.isPending}
                />
                <div className="board-window-controls" data-testid="board-window-controls">
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      data-testid="board-windowed-toggle"
                      checked={boardWindowedMode}
                      onChange={(event) => setBoardWindowedMode(event.target.checked)}
                    />
                    Windowed loading
                  </label>
                  <span>
                    {boardWindowedMode
                      ? `Loaded ${boardItems.length}${boardPagination?.total !== undefined ? ` of ${boardPagination.total}` : ""} records`
                      : `Full board stream: ${boardItems.length} records`}
                  </span>
                  {boardWindowedMode && boardPagination?.hasMore ? (
                    <button
                      type="button"
                      className="button button-secondary"
                      data-testid="board-window-load-more"
                      disabled={itemsQuery.isFetching}
                      onClick={() => setBoardWindowLimit((current) => Math.min(current + boardWindowPageSize, boardPagination.total || current + boardWindowPageSize))}
                    >
                      Load next {boardWindowPageSize}
                    </button>
                  ) : null}
                  {boardWindowedMode ? (
                    <button
                      type="button"
                      className="button button-ghost"
                      data-testid="board-window-disable"
                      onClick={() => setBoardWindowedMode(false)}
                    >
                      Load full board
                    </button>
                  ) : null}
                </div>
              </>
            ) : null}
            {activeView === "table" ? (
            <>
            <details className="table-filter-panel advanced-filters" data-testid="advanced-filters" open={tableFiltersOpen} onToggle={(event) => setTableFiltersOpen(event.currentTarget.open)}>
              <summary>Table filters</summary>
              <div className="table-filter-row table-filter-row-selects">
                <label>Property
                  <select data-testid="table-filter-property" value={propertyId} onChange={(event) => setPropertyId(event.target.value)}>
                    <option value="">All properties</option>
                    {(metaQuery.data?.properties ?? []).map((property) => <option key={property.id} value={property.id}>{property.code} / {property.name}</option>)}
                  </select>
                </label>
                <label>Section
                  <select data-testid="table-filter-section" value={structuredFilters.boardSection} onChange={(event) => setStructuredFilters((current) => ({ ...current, boardSection: event.target.value }))}>
                    <option value="">All sections</option>
                    <option value="type:READY">Ready Units</option>
                    <option value="type:MAKE_READY">Make Ready</option>
                    <option value="type:DOWN">Down Units</option>
                    <option value="type:ARCHIVE">Archive</option>
                    {(metaQuery.data?.boardSections ?? []).map((section) => {
                      const property = metaQuery.data?.properties.find((entry) => entry.id === section.propertyId);
                      return <option key={section.id} value={section.key}>{property?.code ?? "Property"} / {section.displayName}</option>;
                    })}
                  </select>
                </label>
                <label>Vacancy
                  <select data-testid="filter-vacancy-status" value={structuredFilters.vacancyStatus} onChange={(event) => setStructuredFilters((current) => ({ ...current, vacancyStatus: event.target.value }))}>
                    <option value="">All vacancy statuses</option>
                    <option value="__vacant__">Vacant not leased</option>
                    <option value="__vacant_leased__">Vacant leased</option>
                    <option value="__ntv__">NTV / Notice to Vacate</option>
                    {Object.values(labelsByField.vacancyStatus ?? {}).filter((label) => !label.isArchived).map((label) => <option key={label.id} value={label.value}>{label.value}</option>)}
                  </select>
                </label>
                <label>Assigned
                  <select data-testid="filter-assigned-tech" value={structuredFilters.assignedTech} onChange={(event) => setStructuredFilters((current) => ({ ...current, assignedTech: event.target.value }))}>
                    <option value="">All staff</option>
                    <option value="__unassigned__">Unassigned</option>
                    {(metaQuery.data?.staff ?? []).map((member) => <option key={member.id} value={member.fullName}>{member.fullName}</option>)}
                  </select>
                </label>
                <label>Make Ready
                  <select data-testid="filter-make-ready-status" value={structuredFilters.makeReadyStatus} onChange={(event) => setStructuredFilters((current) => ({ ...current, makeReadyStatus: event.target.value }))}>
                    <option value="">All make-ready statuses</option>
                    {Object.values(labelsByField.makeReadyStatus ?? {}).filter((label) => !label.isArchived).map((label) => <option key={label.id} value={label.value}>{label.value}</option>)}
                  </select>
                </label>
                <label>Move-In Window
                  <select data-testid="filter-move-in-window" value={structuredFilters.moveInWindow} onChange={(event) => setStructuredFilters((current) => ({ ...current, moveInWindow: event.target.value as StructuredFilters["moveInWindow"] }))}>
                    <option value="">Any date</option>
                    <option value="week">This week</option>
                    <option value="7">Next 7 days</option>
                    <option value="14">Next 14 days</option>
                  </select>
                </label>
                <label>Archive
                  <select data-testid="filter-archive-state" value={structuredFilters.archiveState} onChange={(event) => setStructuredFilters((current) => ({ ...current, archiveState: event.target.value as StructuredFilters["archiveState"] }))}>
                    <option value="active">Active items</option>
                    <option value="archived">Archived only</option>
                    <option value="occupied">Occupied</option>
                    <option value="all">Active + archived</option>
                  </select>
                </label>
                <label>Risk Level
                  <select data-testid="filter-risk-level" value={structuredFilters.riskLevel} onChange={(event) => setStructuredFilters((current) => ({ ...current, riskLevel: event.target.value }))}>
                    <option value="">Any risk</option>
                    <option value="CRITICAL">Critical</option>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                    <option value="NONE">None</option>
                  </select>
                </label>
                <label>Risk Category
                  <select data-testid="filter-risk-category" value={structuredFilters.riskCategory} onChange={(event) => setStructuredFilters((current) => ({ ...current, riskCategory: event.target.value }))}>
                    <option value="">Any category</option>
                    <option value="MOVE_IN_RISK">Move-in risk</option>
                    <option value="OVERDUE_MAKE_READY">Overdue make-ready</option>
                    <option value="MISSING_CRITICAL_DATES">Missing dates</option>
                    <option value="UNASSIGNED_WORK">Unassigned work</option>
                    <option value="PEST_RISK">Pest risk</option>
                    <option value="FLOORING_RISK">Flooring risk</option>
                    <option value="PAINT_RISK">Paint risk</option>
                    <option value="CHECKLIST_RISK">Checklist risk</option>
                    <option value="STALE_ACTIVITY">Stale activity</option>
                    <option value="DATE_CONFLICT">Date conflict</option>
                    <option value="PROPERTY_WORKLOAD">Aging turn</option>
                  </select>
                </label>
              </div>
              <div className="table-filter-row table-filter-row-flags" aria-label="Operational filter flags">
                <label className="toggle-row"><input type="checkbox" checked={structuredFilters.overdueOnly} onChange={(event) => setStructuredFilters((current) => ({ ...current, overdueOnly: event.target.checked }))} />Overdue</label>
                <label className="toggle-row"><input type="checkbox" checked={structuredFilters.missingDatesOnly} onChange={(event) => setStructuredFilters((current) => ({ ...current, missingDatesOnly: event.target.checked }))} />Missing dates</label>
                <label className="toggle-row"><input type="checkbox" checked={structuredFilters.pestIssuesOnly} onChange={(event) => setStructuredFilters((current) => ({ ...current, pestIssuesOnly: event.target.checked }))} />Pest issues</label>
                <label className="toggle-row"><input type="checkbox" checked={structuredFilters.flooringNeededOnly} onChange={(event) => setStructuredFilters((current) => ({ ...current, flooringNeededOnly: event.target.checked }))} />Flooring needed</label>
                <label className="toggle-row"><input type="checkbox" checked={structuredFilters.paintNeededOnly} onChange={(event) => setStructuredFilters((current) => ({ ...current, paintNeededOnly: event.target.checked }))} />Paint needed</label>
                <label className="toggle-row"><input type="checkbox" checked={structuredFilters.moveInRiskOnly} onChange={(event) => setStructuredFilters((current) => ({ ...current, moveInRiskOnly: event.target.checked }))} />Move-in risk</label>
              </div>
              <section className="custom-filter-section" data-testid="custom-field-filters">
                <header>
                  <strong>Custom fields</strong>
                  <span>{structuredFilters.customFieldFilters.length} applied</span>
                </header>
                {structuredFilters.customFieldFilters.map((filter) => {
                  const field = activeCustomFields.find((entry) => entry.id === filter.fieldId);
                  if (!field) return null;
                  const needsValue = !["empty", "notEmpty", "isTrue", "isFalse", "overdue"].includes(filter.operator);
                  return (
                    <div className="custom-filter-row" data-testid={`custom-filter-row-${field.fieldKey}`} key={field.id}>
                      <strong title={field.label}>{field.label}</strong>
                      <select data-testid={`custom-filter-operator-${field.fieldKey}`} value={filter.operator} onChange={(event) => updateCustomFilter(field.id, { ...defaultCustomFilterFor(field), operator: event.target.value as CustomFieldFilter["operator"] })} aria-label={`Operator for ${field.label}`}>
                        {customOperatorsByType[field.fieldType].map((operator) => <option key={operator.value} value={operator.value}>{operator.label}</option>)}
                      </select>
                      {needsValue && (field.fieldType === "SINGLE_SELECT" || field.fieldType === "MULTI_SELECT") ? (
                        <select data-testid={`custom-filter-value-${field.fieldKey}`} value={String(filter.value ?? "")} onChange={(event) => updateCustomFilter(field.id, { value: event.target.value })} aria-label={`Value for ${field.label}`}>
                          <option value="">Select option</option>
                          {field.options.filter((option) => !option.isArchived).map((option) => <option key={option.id} value={option.label}>{option.label}</option>)}
                        </select>
                      ) : needsValue && field.fieldType === "USER" ? (
                        <select data-testid={`custom-filter-value-${field.fieldKey}`} value={String(filter.value ?? "")} onChange={(event) => updateCustomFilter(field.id, { value: event.target.value })} aria-label={`Value for ${field.label}`}>
                          <option value="">Select staff</option>
                          {(metaQuery.data?.staff ?? []).map((member) => <option key={member.id} value={member.id}>{member.fullName}</option>)}
                        </select>
                      ) : needsValue ? (
                        <div className="custom-filter-operands">
                          <input
                            data-testid={`custom-filter-value-${field.fieldKey}`}
                            type={field.fieldType === "DATE" && filter.operator !== "withinNextDays" ? "date" : field.fieldType === "NUMBER" || filter.operator === "withinNextDays" ? "number" : "text"}
                            value={String(filter.value ?? "")}
                            onChange={(event) => updateCustomFilter(field.id, { value: field.fieldType === "NUMBER" || filter.operator === "withinNextDays" ? Number(event.target.value) : event.target.value })}
                            aria-label={`Value for ${field.label}`}
                          />
                          {filter.operator === "between" ? (
                            <input data-testid={`custom-filter-value-to-${field.fieldKey}`} type="date" value={filter.valueTo ?? ""} onChange={(event) => updateCustomFilter(field.id, { valueTo: event.target.value })} aria-label={`End value for ${field.label}`} />
                          ) : null}
                        </div>
                      ) : <span className="custom-filter-no-value">No value needed</span>}
                      <button type="button" className="icon-button custom-filter-remove" data-testid={`custom-filter-remove-${field.fieldKey}`} aria-label={`Remove ${field.label} filter`} onClick={() => setStructuredFilters((current) => ({ ...current, customFieldFilters: current.customFieldFilters.filter((entry) => entry.fieldId !== field.id) }))}>&times;</button>
                    </div>
                  );
                })}
                {activeCustomFields.length === 0 ? (
                  <div className="custom-filter-empty">
                    <span>No custom fields yet.</span>
                    {(currentUser?.role === "ADMIN" || currentUser?.role === "MANAGER") ? (
                      <button type="button" className="link-button" data-testid="custom-filter-create-field" onClick={() => setActiveView("fields")}>
                        Create one
                      </button>
                    ) : null}
                  </div>
                ) : availableCustomFields.length === 0 ? (
                  <p className="custom-filter-empty">All active custom fields are already included.</p>
                ) : (
                  <div className="custom-filter-add">
                    <select data-testid="custom-filter-field-add" value={customFieldToAdd} onChange={(event) => setCustomFieldToAdd(event.target.value)} aria-label="Choose custom field to filter">
                      <option value="">Add custom-field filter</option>
                      {availableCustomFields.map((field) => <option key={field.id} value={field.id}>{field.label}</option>)}
                    </select>
                    <button type="button" className="button button-secondary" data-testid="custom-filter-add" disabled={!customFieldToAdd} onClick={() => {
                      const field = activeCustomFields.find((entry) => entry.id === customFieldToAdd);
                      if (field) {
                        setTableFiltersOpen(true);
                        setStructuredFilters((current) => ({ ...current, customFieldFilters: [...current.customFieldFilters, defaultCustomFilterFor(field)] }));
                      }
                      setCustomFieldToAdd("");
                    }}>Add</button>
                  </div>
                )}
              </section>
            </details>
            <BoardTable
              items={sortedItems}
              labelsByField={labelsByField}
              customFields={metaQuery.data?.customFields ?? []}
              columnDefinitions={metaQuery.data?.columns ?? []}
              properties={metaQuery.data?.properties ?? []}
              units={metaQuery.data?.units ?? []}
              floorPlans={floorPlansQuery.data?.floorPlans ?? []}
              staff={metaQuery.data?.staff ?? []}
              boardGroups={metaQuery.data?.boardGroups ?? []}
              boardSections={metaQuery.data?.boardSections ?? []}
              language={currentUser.language}
              preferredPropertyId={propertyId}
              archiveState={structuredFilters.archiveState}
              searchText={deferredSearch}
              visibleColumns={visibleColumns}
              canEditField={(item, key) => canEditField(currentUser, key)}
              canEditCustomFields={currentUser.role === "ADMIN" || currentUser.role === "MANAGER"}
              canManageItems={currentUser.role === "ADMIN" || currentUser.role === "MANAGER"}
              onPatch={async (id, data) => {
                await patchMutation.mutateAsync({ id, data });
              }}
              onPatchCustomField={async (itemId, fieldId, value) => {
                await customValueMutation.mutateAsync({ itemId, fieldId, value });
              }}
              onCreateItem={async (input) => {
                await createItemMutation.mutateAsync(input);
              }}
              onCreateUnit={async (input) => {
                const result = await createUnitMutation.mutateAsync(input);
                return result.unit;
              }}
              onBatch={async (input) => {
                await batchItemsMutation.mutateAsync(input);
              }}
              onOpenFieldManager={() => setActiveView("fields")}
              onOpenBoardSetup={() => setActiveView("operations")}
              onAddBuiltInOption={async (fieldKey, value, color) => {
                await optionCreateMutation.mutateAsync({ fieldKey, value, color, textColor: "#ffffff" });
              }}
              onAddCustomOption={async (field, value, color) => {
                await updateFieldMutation.mutateAsync({
                  id: field.id,
                  data: {
                    label: field.label,
                    fieldType: field.fieldType,
                    description: field.description,
                    options: [
                      ...field.options.map((option) => ({ ...option })),
                      { label: value, color, sortOrder: field.options.length, isArchived: false },
                    ],
                  },
                });
              }}
              onUpdateBuiltInOption={async (id, data) => {
                await optionUpdateMutation.mutateAsync({ id, data });
              }}
              onArchiveBuiltInOption={async (id, restore) => {
                await optionArchiveMutation.mutateAsync({ id, restore });
              }}
              onReorderBuiltInOptions={async (ids) => {
                await optionReorderMutation.mutateAsync(ids);
              }}
              onUpdateCustomOptions={async (field, options) => {
                await updateFieldMutation.mutateAsync({
                  id: field.id,
                  data: {
                    options: options.map((option) => ({ ...option })),
                  },
                });
              }}
              onCreateFloorPlan={async (input) => {
                await floorPlanCreateMutation.mutateAsync(input);
              }}
              onUpdateFloorPlan={async (id, input) => {
                await floorPlanUpdateMutation.mutateAsync({ id, data: input });
              }}
              onArchiveFloorPlan={async (id, restore) => {
                await floorPlanArchiveMutation.mutateAsync({ id, restore });
              }}
              onRenameBuiltInColumn={async (fieldKey, label, reset) => {
                await columnUpdateMutation.mutateAsync({ fieldKey, label, reset });
              }}
              onRenameCustomColumn={async (field, label) => {
                await updateFieldMutation.mutateAsync({ id: field.id, data: { label } });
              }}
              onHideColumn={(key) => {
                const currentlyVisible = visibleColumns ?? tableColumnOptions.map((column) => column.key);
                setVisibleColumns(normalizeVisibleColumns(currentlyVisible.filter((column) => column !== key), metaQuery.data?.customFields ?? [], metaQuery.data?.columns ?? []));
              }}
              onSortColumn={(key, direction) => {
                setSortKey(key);
                setSortDirection(direction);
              }}
              onOpenItem={openItemDrawer}
              onAssignFloorPlan={assignFloorPlan}
              onReorderColumns={(columns) => setVisibleColumns(columns)}
              onRenameSection={async (id, displayName) => { await renameSectionMutation.mutateAsync({ id, displayName }); }}
            />
            </>
          ) : activeView === "kanban" ? (
            <KanbanBoard
              items={sortedItems}
              groupBy={kanbanGroupBy}
              properties={metaQuery.data?.properties ?? []}
              labelsByField={labelsByField}
              canEditField={(item, key) => canEditField(currentUser, key)}
              onMove={async (id, data) => {
                await patchMutation.mutateAsync({ id, data });
              }}
              onOpenItem={openItemDrawer}
              colorBy={kanbanColorBy}
              cardFields={kanbanCardFields}
              sortBy={kanbanSortBy}
              hideEmpty={kanbanHideEmpty}
              groupOptions={kanbanOptions}
              selectedPropertyId={propertyId}
              onPropertyChange={setPropertyId}
              customFields={metaQuery.data?.customFields ?? []}
              columnDefinitions={metaQuery.data?.columns ?? []}
              onConfigChange={(next) => {
                if (next.groupBy) setKanbanGroupBy(next.groupBy as KanbanGroupKey);
                if (next.colorBy) setKanbanColorBy(next.colorBy);
                if (next.cardFields) setKanbanCardFields(next.cardFields);
                if (next.sortBy) setKanbanSortBy(next.sortBy);
                if (next.hideEmpty !== undefined) setKanbanHideEmpty(next.hideEmpty);
              }}
              language={currentUser.language}
            />
          ) : (
            <CalendarView
              eventsByTrack={calendarEventsByTrack}
              labelsByField={labelsByField}
              fieldOptions={scheduleFieldOptions}
              layout={calendarLayout}
              language={currentUser.language}
              selectedFields={calendarPanelFields.length ? calendarPanelFields : [activeScheduleTrack?.id ?? ""]}
              onLayoutChange={setCalendarLayout}
              onFieldChange={(index, value) => {
                const next = [...calendarPanelFields];
                next[index] = value;
                setCalendarPanelFields(next);
                if (index === 0) setActiveCalendarField(value);
              }}
              onOpenItem={openItemDrawer}
            />
          )}</>}
          </Suspense>
        </section>
      </main>
      {selectedItem && metaQuery.data ? (
        <Suspense fallback={null}>
          <ItemDrawer
            item={selectedItem}
            currentUser={currentUser}
            labelsByField={labelsByField}
            customFields={metaQuery.data.customFields}
            columnDefinitions={metaQuery.data.columns}
            staff={metaQuery.data.staff}
            floorPlans={floorPlansQuery.data?.floorPlans ?? []}
            boardGroups={metaQuery.data.boardGroups}
            boardSections={metaQuery.data.boardSections}
            vendors={vendorsQuery.data?.vendors ?? []}
            vendorAssignments={vendorAssignmentsQuery.data?.assignments ?? []}
            workBlocks={selectedItemPlanningQuery.data?.blocks ?? []}
            canEditField={(item, key) => canEditField(currentUser, key)}
            canEditCustomFields={currentUser.role === "ADMIN" || currentUser.role === "MANAGER"}
            canManageItems={currentUser.role === "ADMIN" || currentUser.role === "MANAGER"}
            canViewActivity={currentUser.role === "ADMIN" || currentUser.role === "MANAGER" || currentUser.role === "LEASING"}
            onClose={closeItemDrawer}
            onPatch={async (id, data) => { await patchMutation.mutateAsync({ id, data }); }}
            onPatchCustomField={async (itemId, fieldId, value) => { await customValueMutation.mutateAsync({ itemId, fieldId, value }); }}
            onAssignFloorPlan={assignFloorPlan}
            onCreateVendorAssignment={async (input) => { await vendorAssignmentCreateMutation.mutateAsync(input); }}
            onUpdateVendorAssignment={async (id, input) => { await vendorAssignmentUpdateMutation.mutateAsync({ id, data: input }); }}
            onMarkReady={async (id) => { await markReadyMutation.mutateAsync(id); }}
            onBatch={async (input) => { await batchItemsMutation.mutateAsync(input); }}
          />
        </Suspense>
      ) : null}
      <NotificationDrawer
        open={notificationsOpen}
        language={currentUser.language}
        data={notificationsQuery.data}
        loading={notificationsQuery.isLoading}
        onClose={() => setNotificationsOpen(false)}
        onRead={async (id) => { await readNotificationMutation.mutateAsync(id); }}
        onReadAll={async () => { await readAllNotificationsMutation.mutateAsync(); }}
        onDismiss={async (id) => { await dismissNotificationMutation.mutateAsync(id); }}
        onOpenItem={(id) => { openItemDrawer(id); setNotificationsOpen(false); }}
        onPreferenceChange={async (category, enabled, propertyId) => { await notificationPreferenceMutation.mutateAsync({ category, enabled, propertyId }); }}
        onSettingsChange={async (input) => { await notificationSettingsMutation.mutateAsync(input); }}
      />
      <CommandPalette
        open={commandPaletteOpen}
        language={currentUser.language}
        items={boardItems}
        properties={metaQuery.data?.properties ?? []}
        views={(savedViewsQuery.data?.views ?? []).filter((view) => !view.isArchived)}
        staff={metaQuery.data?.staff ?? []}
        floorPlans={floorPlansQuery.data?.floorPlans ?? []}
        workspaceGroups={commandPaletteWorkspaceGroups}
        onClose={() => setCommandPaletteOpen(false)}
        onOpenItem={openItemDrawer}
        onNavigate={setAppView}
        onOpenNotifications={() => setNotificationsOpen(true)}
        onOpenOnboarding={() => {
          setOnboardingSkipped(false);
          removeStorageValue(onboardingSkippedStorageKey);
          setOnboardingOpen(true);
        }}
        onApplyBasicMode={applyBasicBoardMode}
        onOpenShortcutHelp={() => setShortcutHelpOpen(true)}
        onLoadView={applySavedView}
      />
      <OnboardingPanel
        open={onboardingOpen}
        currentUser={currentUser}
        properties={metaQuery.data?.properties ?? []}
        units={metaQuery.data?.units ?? []}
        floorPlans={floorPlansQuery.data?.floorPlans ?? []}
        savedViews={(savedViewsQuery.data?.views ?? metaQuery.data?.views ?? []).filter((view) => !view.isArchived)}
        scheduleTracks={metaQuery.data?.scheduleTracks ?? []}
        firstRunDetected={firstRunDetected}
        onNavigate={(view) => setActiveView(view)}
        onClose={() => setOnboardingOpen(false)}
        onSkip={() => {
          writeStorageValue(onboardingSkippedStorageKey, "true");
          setOnboardingSkipped(true);
          setOnboardingOpen(false);
        }}
      />
      <Modal
        open={shortcutHelpOpen}
        title={currentUser.language === "es" ? "Atajos del tablero" : "Board shortcuts"}
        onClose={() => setShortcutHelpOpen(false)}
        testId="shortcut-help-modal"
      >
        <div className="shortcut-help-list">
          <div className="shortcut-help-row"><strong>{currentUser.language === "es" ? "Abrir busqueda rapida" : "Open quick search"}</strong><kbd>Ctrl / Command + K</kbd></div>
          <div className="shortcut-help-row"><strong>{currentUser.language === "es" ? "Cerrar dialogos o paneles" : "Close dialogs or panels"}</strong><kbd>Escape</kbd></div>
          <div className="shortcut-help-row"><strong>{currentUser.language === "es" ? "Abrir ayuda de atajos" : "Open shortcut help"}</strong><kbd>?</kbd></div>
          <div className="shortcut-help-row"><strong>{currentUser.language === "es" ? "Modo basico" : "Basic board mode"}</strong><span>{currentUser.language === "es" ? "Usa el boton Basic board para mostrar solo las columnas esenciales." : "Use the Basic board button to show only the essential columns."}</span></div>
          <div className="shortcut-help-row"><strong>{currentUser.language === "es" ? "Configuracion rapida de tabla" : "Quick table setup"}</strong><span>{currentUser.language === "es" ? "Usa Board Tools para agregar campos o ajustar etiquetas y planos." : "Use Board Tools to add fields or adjust labels and floor plans."}</span></div>
        </div>
      </Modal>
      <Modal
        open={offlineQueueReviewOpen}
        title={t(currentUser.language, "offlineQueue.title")}
        onClose={() => setOfflineQueueReviewOpen(false)}
        testId="offline-queue-review-modal"
        actions={(
          <>
            <button type="button" className="button button-secondary" onClick={() => void refreshOfflineQueueState()}>
              {t(currentUser.language, "offlineQueue.refresh")}
            </button>
            <button type="button" className="button button-primary" onClick={() => void syncQueuedOfflineChanges()} disabled={offlineQueueSyncing || !isOnline}>
              {offlineQueueSyncing ? t(currentUser.language, "connection.syncingNow") : t(currentUser.language, "offlineQueue.syncNow")}
            </button>
          </>
        )}
      >
        {!offlineQueueBlockedJobs.length ? (
          <p className="admin-message success">{t(currentUser.language, "offlineQueue.empty")}</p>
        ) : (
          <div className="offline-queue-review-list">
            <p className="admin-message warning">
              {t(currentUser.language, "offlineQueue.needsReview").replace("{count}", String(offlineQueueBlockedJobs.length))}
            </p>
            {offlineQueueBlockedJobs.map((job) => {
              const conflict = job.lastErrorStatus === 409;
              return (
                <article key={job.id} className="admin-card offline-queue-review-card">
                  <div className="drawer-section-title">
                    <h3>{job.title}</h3>
                    <span className={conflict ? "summary-alert" : "muted"}>{conflict ? t(currentUser.language, "offlineQueue.conflict") : `HTTP ${job.lastErrorStatus ?? t(currentUser.language, "offlineQueue.error")}`}</span>
                  </div>
                  <p><strong>{t(currentUser.language, "offlineQueue.module")}:</strong> {job.module}</p>
                  <p><strong>{t(currentUser.language, "offlineQueue.attempts")}:</strong> {job.attemptCount}</p>
                  <p><strong>{t(currentUser.language, "offlineQueue.lastError")}:</strong> {job.lastError ?? t(currentUser.language, "offlineQueue.unknownError")}</p>
                  <p className="helper-copy">
                    {conflict
                      ? t(currentUser.language, "offlineQueue.conflictHelp")
                      : t(currentUser.language, "offlineQueue.serverErrorHelp")}
                  </p>
                  <div className="drawer-actions">
                    <button type="button" className="button button-secondary" onClick={() => void reviewOfflineQueueJob(job)}>
                      {t(currentUser.language, "offlineQueue.reviewDetails")}
                    </button>
                    <button type="button" className="button button-secondary" onClick={() => void syncQueuedOfflineChanges()} disabled={offlineQueueSyncing || !isOnline}>
                      {t(currentUser.language, "offlineQueue.retrySync")}
                    </button>
                    <button type="button" className="button button-secondary" onClick={() => void retrySingleOfflineQueueJob(job)} disabled={offlineQueueSyncing || !isOnline}>
                      {t(currentUser.language, "offlineQueue.retryThis")}
                    </button>
                    <button type="button" className="button button-ghost danger" onClick={() => void discardOfflineQueueJob(job)}>
                      {t(currentUser.language, "offlineQueue.discard")}
                    </button>
                  </div>
                </article>
              );
            })}
            <section className="admin-card offline-queue-review-card offline-queue-detail-card">
              <div className="drawer-section-title">
                <h3>{t(currentUser.language, "offlineQueue.localChange")}</h3>
                {selectedOfflineQueueJob ? <span className="muted">{selectedOfflineQueueJob.payload.kind}</span> : null}
              </div>
              {offlineQueueJobLoading ? (
                <p className="helper-copy">{t(currentUser.language, "offlineQueue.loadingDetails")}</p>
              ) : selectedOfflineQueueJob ? (
                <>
                  <p className="helper-copy">{t(currentUser.language, "offlineQueue.reviewHelp")}</p>
                  <div className="offline-queue-change-list">
                    {offlineJobChangeSummary(selectedOfflineQueueJob).map((line) => (
                      <div key={line} className="offline-queue-change-row">{line}</div>
                    ))}
                    {!offlineJobChangeSummary(selectedOfflineQueueJob).length ? (
                      <div className="offline-queue-change-row">{t(currentUser.language, "offlineQueue.noChangePreview")}</div>
                    ) : null}
                  </div>
                  {selectedOfflineQueueJob.payload.kind === "makeReadyPatch" ? (
                    <>
                      <div className="drawer-section-title">
                        <h3>{t(currentUser.language, "offlineQueue.currentRecord")}</h3>
                        {selectedOfflineQueueServerItem ? <span className="muted">{selectedOfflineQueueServerItem.unitNumber}</span> : null}
                      </div>
                      {selectedOfflineQueueServerError ? (
                        <p className="helper-copy">{selectedOfflineQueueServerError}</p>
                      ) : !selectedOfflineQueueServerItem ? (
                        <p className="helper-copy">{t(currentUser.language, "offlineQueue.loadingLiveRecord")}</p>
                      ) : (
                        <>
                          <p className="helper-copy">{t(currentUser.language, "offlineQueue.currentRecordHelp")}</p>
                          <div className="offline-queue-merge-list">
                            {selectedOfflineQueueComparison.map((row) => (
                              <div key={row.field} className={`offline-queue-merge-row${row.changed ? " is-conflict" : ""}`}>
                                <strong>{humanizeField(row.field)}</strong>
                                <span>{t(currentUser.language, "offlineQueue.serverValue")}: {row.serverValue}</span>
                                <span>{t(currentUser.language, "offlineQueue.queuedValue")}: {row.queuedValue}</span>
                              </div>
                            ))}
                            {!selectedOfflineQueueComparison.length ? (
                              <div className="offline-queue-change-row">{t(currentUser.language, "offlineQueue.noFieldComparison")}</div>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            className="button button-primary"
                            onClick={() => void reapplyQueuedMakeReadyPatch(selectedOfflineQueueJob)}
                            disabled={offlineQueueSyncing || !isOnline}
                          >
                            {t(currentUser.language, "offlineQueue.reapplyLocalValues")}
                          </button>
                        </>
                      )}
                    </>
                  ) : null}
                  {selectedOfflineQueueJob.payload.kind === "projectCreate" ? (
                    <>
                      <div className="drawer-section-title">
                        <h3>{t(currentUser.language, "offlineQueue.currentRecord")}</h3>
                        {selectedOfflineQueueServerProjectRecord ? <span className="muted">{selectedOfflineQueueServerProjectRecord.title}</span> : null}
                      </div>
                      {selectedOfflineQueueServerError ? (
                        <p className="helper-copy">{selectedOfflineQueueServerError}</p>
                      ) : !selectedOfflineQueueServerProjectRecord ? (
                        <p className="helper-copy">{t(currentUser.language, "offlineQueue.noProjectMatch")}</p>
                      ) : (
                        <>
                          <p className="helper-copy">{t(currentUser.language, "offlineQueue.projectCompareHelp")}</p>
                          <div className="offline-queue-merge-list">
                            {selectedOfflineQueueProjectComparison.map((row) => (
                              <div key={row.field} className={`offline-queue-merge-row${row.changed ? " is-conflict" : ""}`}>
                                <strong>{humanizeField(row.field)}</strong>
                                <span>{t(currentUser.language, "offlineQueue.serverValue")}: {row.serverValue}</span>
                                <span>{t(currentUser.language, "offlineQueue.queuedValue")}: {row.queuedValue}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </>
                  ) : null}
                  {selectedOfflineQueueJob.payload.kind === "leaseCreate" ? (
                    <>
                      <div className="drawer-section-title">
                        <h3>{t(currentUser.language, "offlineQueue.currentRecord")}</h3>
                        {selectedOfflineQueueServerLeaseIssue ? <span className="muted">{selectedOfflineQueueServerLeaseIssue.unit?.number ?? selectedOfflineQueueServerLeaseIssue.area ?? selectedOfflineQueueServerLeaseIssue.building ?? selectedOfflineQueueServerLeaseIssue.issueTypeName}</span> : null}
                      </div>
                      {selectedOfflineQueueServerError ? (
                        <p className="helper-copy">{selectedOfflineQueueServerError}</p>
                      ) : !selectedOfflineQueueServerLeaseIssue ? (
                        <p className="helper-copy">{t(currentUser.language, "offlineQueue.noLeaseMatch")}</p>
                      ) : (
                        <>
                          <p className="helper-copy">{t(currentUser.language, "offlineQueue.leaseCompareHelp")}</p>
                          <div className="offline-queue-merge-list">
                            {selectedOfflineQueueLeaseComparison.map((row) => (
                              <div key={row.field} className={`offline-queue-merge-row${row.changed ? " is-conflict" : ""}`}>
                                <strong>{humanizeField(row.field)}</strong>
                                <span>{t(currentUser.language, "offlineQueue.serverValue")}: {row.serverValue}</span>
                                <span>{t(currentUser.language, "offlineQueue.queuedValue")}: {row.queuedValue}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </>
                  ) : null}
                  {selectedOfflineQueueJob.payload.kind === "pestCreate" ? (
                    <>
                      <div className="drawer-section-title">
                        <h3>{t(currentUser.language, "offlineQueue.currentRecord")}</h3>
                        {selectedOfflineQueueServerPestIssue ? <span className="muted">{selectedOfflineQueueServerPestIssue.unit?.number ?? selectedOfflineQueueServerPestIssue.area ?? selectedOfflineQueueServerPestIssue.pestType}</span> : null}
                      </div>
                      {selectedOfflineQueueServerError ? (
                        <p className="helper-copy">{selectedOfflineQueueServerError}</p>
                      ) : !selectedOfflineQueueServerPestIssue ? (
                        <p className="helper-copy">{t(currentUser.language, "offlineQueue.noPestMatch")}</p>
                      ) : (
                        <>
                          <p className="helper-copy">{t(currentUser.language, "offlineQueue.pestCompareHelp")}</p>
                          <div className="offline-queue-merge-list">
                            {selectedOfflineQueuePestComparison.map((row) => (
                              <div key={row.field} className={`offline-queue-merge-row${row.changed ? " is-conflict" : ""}`}>
                                <strong>{humanizeField(row.field)}</strong>
                                <span>{t(currentUser.language, "offlineQueue.serverValue")}: {row.serverValue}</span>
                                <span>{t(currentUser.language, "offlineQueue.queuedValue")}: {row.queuedValue}</span>
                              </div>
                            ))}
                          </div>
                          <button
                            type="button"
                            className="button button-secondary"
                            onClick={() => {
                              setPropertyId(selectedOfflineQueueServerPestIssue.propertyId);
                              setPestWorkspaceRequest({
                                propertyId: selectedOfflineQueueServerPestIssue.propertyId,
                                tab: "active",
                                search: selectedOfflineQueueServerPestIssue.unit?.number ?? selectedOfflineQueueServerPestIssue.area ?? selectedOfflineQueueServerPestIssue.pestType,
                                nonce: Date.now(),
                              });
                              setAppView("pest");
                              setOfflineQueueReviewOpen(false);
                            }}
                          >
                            {t(currentUser.language, "offlineQueue.openPestWorkspace")}
                          </button>
                        </>
                      )}
                    </>
                  ) : null}
                  {selectedOfflineQueueJob.payload.kind === "poolCreate" ? (
                    <>
                      <div className="drawer-section-title">
                        <h3>{t(currentUser.language, "offlineQueue.currentRecord")}</h3>
                        {selectedOfflineQueueServerPoolEntry ? <span className="muted">{selectedOfflineQueueServerPoolEntry.facility.name}</span> : null}
                      </div>
                      {selectedOfflineQueueServerError ? (
                        <p className="helper-copy">{selectedOfflineQueueServerError}</p>
                      ) : !selectedOfflineQueueServerPoolEntry ? (
                        <p className="helper-copy">{t(currentUser.language, "offlineQueue.noPoolMatch")}</p>
                      ) : (
                        <>
                          <p className="helper-copy">{t(currentUser.language, "offlineQueue.poolCompareHelp")}</p>
                          <div className="offline-queue-merge-list">
                            {selectedOfflineQueuePoolComparison.map((row) => (
                              <div key={row.field} className={`offline-queue-merge-row${row.changed ? " is-conflict" : ""}`}>
                                <strong>{humanizeField(row.field)}</strong>
                                <span>{t(currentUser.language, "offlineQueue.serverValue")}: {row.serverValue}</span>
                                <span>{t(currentUser.language, "offlineQueue.queuedValue")}: {row.queuedValue}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </>
                  ) : null}
                  {selectedOfflineQueueJob.payload.kind === "pmComplete" || selectedOfflineQueueJob.payload.kind === "pmSkip" ? (
                    <>
                      <div className="drawer-section-title">
                        <h3>{t(currentUser.language, "offlineQueue.currentRecord")}</h3>
                        {selectedOfflineQueueServerPmTask ? <span className="muted">{selectedOfflineQueueServerPmTask.taskName}</span> : null}
                      </div>
                      {selectedOfflineQueueServerError ? (
                        <p className="helper-copy">{selectedOfflineQueueServerError}</p>
                      ) : !selectedOfflineQueueServerPmTask ? (
                        <p className="helper-copy">{t(currentUser.language, "offlineQueue.noPmMatch")}</p>
                      ) : (
                        <>
                          <p className="helper-copy">{t(currentUser.language, "offlineQueue.pmCompareHelp")}</p>
                          <div className="offline-queue-merge-list">
                            {selectedOfflineQueuePmComparison.map((row) => (
                              <div key={row.field} className={`offline-queue-merge-row${row.changed ? " is-conflict" : ""}`}>
                                <strong>{humanizeField(row.field)}</strong>
                                <span>{t(currentUser.language, "offlineQueue.serverValue")}: {row.serverValue}</span>
                                <span>{t(currentUser.language, "offlineQueue.queuedValue")}: {row.queuedValue}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </>
                  ) : null}
                  {selectedOfflineQueueJob.payload.kind === "makeReadyUpload"
                  || selectedOfflineQueueJob.payload.kind === "projectUpload"
                  || selectedOfflineQueueJob.payload.kind === "leaseUpload"
                  || selectedOfflineQueueJob.payload.kind === "pestUpload"
                  || selectedOfflineQueueJob.payload.kind === "poolUpload"
                  || selectedOfflineQueueJob.payload.kind === "pmUpload" ? (
                    <>
                      <div className="drawer-section-title">
                        <h3>{t(currentUser.language, "offlineQueue.currentRecord")}</h3>
                        {selectedOfflineQueueUploadReview ? <span className="muted">{selectedOfflineQueueUploadReview.recordLabel}</span> : null}
                      </div>
                      {selectedOfflineQueueServerError ? (
                        <p className="helper-copy">{selectedOfflineQueueServerError}</p>
                      ) : !selectedOfflineQueueUploadReview ? (
                        <p className="helper-copy">{t(currentUser.language, "offlineQueue.noUploadContext")}</p>
                      ) : (
                        <>
                          <p className="helper-copy">{t(currentUser.language, "offlineQueue.uploadCompareHelp")}</p>
                          <div className="offline-queue-merge-list">
                            <div className="offline-queue-merge-row">
                              <strong>{t(currentUser.language, "offlineQueue.queuedFiles")}</strong>
                              <span>{selectedOfflineQueueUploadReview.queuedFiles.join(", ") || t(currentUser.language, "offlineQueue.none")}</span>
                            </div>
                            <div className="offline-queue-merge-row">
                              <strong>{t(currentUser.language, "offlineQueue.liveFiles")}</strong>
                              <span>{selectedOfflineQueueUploadReview.liveFiles.join(", ") || t(currentUser.language, "offlineQueue.none")}</span>
                            </div>
                            <div className={`offline-queue-merge-row${selectedOfflineQueueUploadReview.duplicateFiles.length ? " is-conflict" : ""}`}>
                              <strong>{t(currentUser.language, "offlineQueue.matchingLiveNames")}</strong>
                              <span>{selectedOfflineQueueUploadReview.duplicateFiles.join(", ") || t(currentUser.language, "offlineQueue.noneDetected")}</span>
                            </div>
                          </div>
                        </>
                      )}
                    </>
                  ) : null}
                  {selectedOfflineQueueJob.payload.kind === "makeReadyCommentCreate"
                  || selectedOfflineQueueJob.payload.kind === "makeReadyCommentUpdate"
                  || selectedOfflineQueueJob.payload.kind === "makeReadyCommentDelete"
                  || selectedOfflineQueueJob.payload.kind === "makeReadyChecklistAttach"
                  || selectedOfflineQueueJob.payload.kind === "makeReadyChecklistUpdate" ? (
                    <>
                      <div className="drawer-section-title">
                        <h3>{t(currentUser.language, "offlineQueue.currentRecord")}</h3>
                        {selectedOfflineQueueJob.payload.kind.startsWith("makeReadyComment")
                          ? <span className="muted">{t(currentUser.language, "offlineQueue.liveComments")}</span>
                          : <span className="muted">{t(currentUser.language, "offlineQueue.liveChecklists")}</span>}
                      </div>
                      {selectedOfflineQueueServerError ? (
                        <p className="helper-copy">{selectedOfflineQueueServerError}</p>
                      ) : !selectedOfflineQueueServerCollaboration ? (
                        <p className="helper-copy">{t(currentUser.language, "offlineQueue.noCollaborationContext")}</p>
                      ) : (
                        <>
                          <p className="helper-copy">{t(currentUser.language, "offlineQueue.collaborationCompareHelp")}</p>
                          <div className="offline-queue-merge-list">
                            {selectedOfflineQueueCollaborationComparison.map((row) => (
                              <div key={row.field} className={`offline-queue-merge-row${row.changed ? " is-conflict" : ""}`}>
                                <strong>{humanizeField(row.field)}</strong>
                                <span>{t(currentUser.language, "offlineQueue.serverValue")}: {row.serverValue}</span>
                                <span>{t(currentUser.language, "offlineQueue.queuedValue")}: {row.queuedValue}</span>
                              </div>
                            ))}
                            {!selectedOfflineQueueCollaborationComparison.length ? (
                              <div className="offline-queue-change-row">{t(currentUser.language, "offlineQueue.noCollaborationRows")}</div>
                            ) : null}
                          </div>
                          {selectedOfflineQueueJob.payload.kind.startsWith("makeReadyComment") ? (
                            <div className="offline-queue-change-list">
                              {selectedOfflineQueueServerCollaboration.comments.slice(0, 3).map((comment) => (
                                <div key={comment.id} className="offline-queue-change-row">
                                  {comment.authorName}: {comment.body}
                                </div>
                              ))}
                              {!selectedOfflineQueueServerCollaboration.comments.length ? (
                                <div className="offline-queue-change-row">{t(currentUser.language, "offlineQueue.noLiveComments")}</div>
                              ) : null}
                            </div>
                          ) : (
                            <div className="offline-queue-change-list">
                              {selectedOfflineQueueServerCollaboration.checklistInstances.slice(0, 3).map((instance) => (
                                <div key={instance.id} className="offline-queue-change-row">
                                  {instance.name}: {instance.items.filter((item) => item.completed).length}/{instance.items.length} {t(currentUser.language, "offlineQueue.checklistComplete")}
                                </div>
                              ))}
                              {!selectedOfflineQueueServerCollaboration.checklistInstances.length ? (
                                <div className="offline-queue-change-row">{t(currentUser.language, "offlineQueue.noLiveChecklists")}</div>
                              ) : null}
                            </div>
                          )}
                        </>
                      )}
                    </>
                  ) : null}
                  {selectedOfflineQueueJob.payload.kind === "makeReadyChecklistUpdate" && !selectedOfflineQueueJob.payload.itemId && !selectedOfflineQueueResolvedItemId ? (
                    <p className="helper-copy">{t(currentUser.language, "offlineQueue.legacyChecklistHelp")}</p>
                  ) : null}
                </>
              ) : (
                <p className="helper-copy">{t(currentUser.language, "offlineQueue.selectJob")}</p>
              )}
            </section>
          </div>
        )}
      </Modal>
      <PWAInstallPrompt />
        <ToastViewport toasts={toasts} onDismiss={dismissToast} language={currentUser.language} />
    </div>
  );
}

export default App;
