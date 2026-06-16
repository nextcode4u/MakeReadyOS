import { lazy, Suspense, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActiveFilterBar } from "./components/ActiveFilterBar";
import { BoardTable } from "./components/BoardTable";
import { CommandPalette } from "./components/CommandPalette";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { FilterBar, type ThemeMode } from "./components/FilterBar";
import { LoginScreen } from "./components/LoginScreen";
import { NotificationDrawer } from "./components/NotificationDrawer";
import { OnboardingPanel } from "./components/OnboardingPanel";
import { PWAInstallPrompt } from "./components/PWAInstallPrompt";
import { StatusState } from "./components/StatusState";
import { ToastItem, ToastViewport } from "./components/ToastViewport";
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
  importAvailability,
  importUnits,
  revertUnitImport,
  archiveMakeReadyItem,
  archiveProperty,
  archiveUnit,
  archiveBoardOption,
  archiveFloorPlan,
  archiveScheduleTrack,
  archiveCustomField,
  restoreCustomField,
  trashCustomField,
  permanentlyDeleteCustomField,
  archiveAutomation,
  archiveVendor,
  archivePropertyMap,
  archivePropertyTemplate,
  CurrentUser,
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
  getMakeReadyItemPage,
  MakeReadyItem,
  ManagedUser,
  getMeta,
  getNotifications,
  getMyWork,
  getPlanning,
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
  previewPropertyTemplateFromProperty,
  runAutomationNow,
  reorderCustomFields,
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
} from "./lib/api";
import { configuredScheduleTracks, kanbanGroupOptions, labelMap, normalizeVisibleColumns, visibleColumnOptions } from "./lib/board";
import { clockModeStorageKey, type ClockMode } from "./lib/dateTime";
import { customFieldFilterChipLabel, customOperatorsByType, defaultCustomFilterFor, defaultStructuredFilters, itemMatchesStructuredFilters, normalizeCustomFieldFilters, type CustomFieldFilter, type StructuredFilters } from "./lib/structuredFilters";
import { openWikiRecordEventName, type OpenWikiRecordRequest } from "./lib/wikiNavigation";
import { openProjectCreateEventName, openProjectRecordEventName, type OpenProjectCreateRequest, type OpenProjectRecordRequest } from "./lib/projectNavigation";
import { openPestQuickAddEventName, openPestWorkspaceEventName, type OpenPestQuickAddRequest, type OpenPestWorkspaceRequest } from "./lib/pestNavigation";
import { openLeaseQuickAddEventName, type OpenLeaseQuickAddRequest } from "./lib/leaseNavigation";

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
const compactModeStorageKey = "makereadyos.compactMode";
const themeModeStorageKey = "makereadyos.themeMode";
const eyeStrainModeStorageKey = "makereadyos.eyeStrainMode";
const dyslexiaModeStorageKey = "makereadyos.dyslexiaMode";
const onboardingSkippedStorageKey = "makereadyos.onboardingSkipped";
const boardWindowedModeStorageKey = "makereadyos.boardWindowedMode";
const boardWindowLimitStorageKey = "makereadyos.boardWindowLimit";
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

function replaceAdminUser(users: ManagedUser[] | undefined, nextUser: ManagedUser) {
  if (!users) {
    return users;
  }
  return users.map((user) => (user.id === nextUser.id ? nextUser : user));
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
  const [visibleColumns, setVisibleColumns] = useState<string[] | null>(null);
  const [customFieldToAdd, setCustomFieldToAdd] = useState("");
  const [tableFiltersOpen, setTableFiltersOpen] = useState(() => typeof window !== "undefined" ? window.innerWidth > 860 : true);
  const [loginError, setLoginError] = useState("");
  const [adminMessage, setAdminMessage] = useState("");
  const [adminError, setAdminError] = useState("");
  const [viewMessage, setViewMessage] = useState("");
  const [viewError, setViewError] = useState("");
  const [fieldMessage, setFieldMessage] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [automationMessage, setAutomationMessage] = useState("");
  const [automationError, setAutomationError] = useState("");
  const [libraryPreview, setLibraryPreview] = useState<string>("");
  const [templatePreview, setTemplatePreview] = useState<string>("");
  const [operationsMessage, setOperationsMessage] = useState("");
  const [operationsError, setOperationsError] = useState("");
  const [automationRuleId, setAutomationRuleId] = useState<string | undefined>();
  const [automationPreview, setAutomationPreview] = useState<AutomationPreviewResponse | null>(null);
  const [sessionMessage, setSessionMessage] = useState("");
  const [forceLoggedOut, setForceLoggedOut] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [compactMode, setCompactMode] = useState(() => window.localStorage.getItem(compactModeStorageKey) === "true");
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const stored = window.localStorage.getItem(themeModeStorageKey);
    return stored === "dark" || stored === "light" ? stored : "default";
  });
  const [eyeStrainMode, setEyeStrainMode] = useState(() => window.localStorage.getItem(eyeStrainModeStorageKey) === "true");
  const [dyslexiaMode, setDyslexiaMode] = useState(() => window.localStorage.getItem(dyslexiaModeStorageKey) === "true");
  const [clockMode, setClockMode] = useState<ClockMode>(() => (window.localStorage.getItem(clockModeStorageKey) === "24h" ? "24h" : "12h"));
  const [boardWindowedMode, setBoardWindowedMode] = useState(() => window.localStorage.getItem(boardWindowedModeStorageKey) === "true");
  const [boardWindowLimit, setBoardWindowLimit] = useState(() => {
    const stored = Number(window.localStorage.getItem(boardWindowLimitStorageKey));
    return Number.isFinite(stored) && stored >= boardWindowPageSize ? stored : boardWindowPageSize;
  });
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingSkipped, setOnboardingSkipped] = useState(() => window.localStorage.getItem(onboardingSkippedStorageKey) === "true");
  const [myWorkUserId, setMyWorkUserId] = useState("");
  const [defaultWorkspaceAppliedForUser, setDefaultWorkspaceAppliedForUser] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [apiDegraded, setApiDegraded] = useState(false);
  const [lastConnectionIssueAt, setLastConnectionIssueAt] = useState<string | null>(null);
  const [wikiRecordRequest, setWikiRecordRequest] = useState<(OpenWikiRecordRequest & { nonce: number }) | null>(null);
  const [projectRecordRequest, setProjectRecordRequest] = useState<(OpenProjectRecordRequest & { nonce: number }) | null>(null);
  const [projectCreateRequest, setProjectCreateRequest] = useState<(OpenProjectCreateRequest & { nonce: number }) | null>(null);
  const [pestQuickAddRequest, setPestQuickAddRequest] = useState<(OpenPestQuickAddRequest & { nonce: number }) | null>(null);
  const [pestWorkspaceRequest, setPestWorkspaceRequest] = useState<(OpenPestWorkspaceRequest & { nonce: number }) | null>(null);
  const [leaseQuickAddRequest, setLeaseQuickAddRequest] = useState<(OpenLeaseQuickAddRequest & { nonce: number }) | null>(null);
  const queryClient = useQueryClient();

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

  const handleSessionExpired = (message = "Your session expired. Sign in again to continue.") => {
    if (sessionMessage === message) {
      return;
    }
    setForceLoggedOut(true);
    setSessionMessage(message);
    queryClient.removeQueries({ queryKey: ["auth", "me"] });
    pushToast("Session expired", message, "error");
  };

  const retryConnection = () => {
    setApiDegraded(false);
    void queryClient.invalidateQueries();
    pushToast("Retrying connection", "Refreshing active MakeReadyOS data.", "info");
  };

  useEffect(() => {
    const handleOpenWikiRecord = (event: Event) => {
      const detail = (event as CustomEvent<OpenWikiRecordRequest>).detail;
      if (!detail?.id || !detail?.targetType) return;
      if (detail.propertyId) setPropertyId(detail.propertyId);
      setWikiRecordRequest({ ...detail, nonce: Date.now() });
      setActiveView("wiki");
    };
    window.addEventListener(openWikiRecordEventName, handleOpenWikiRecord as EventListener);
    return () => window.removeEventListener(openWikiRecordEventName, handleOpenWikiRecord as EventListener);
  }, []);

  useEffect(() => {
    const handleOpenProjectRecord = (event: Event) => {
      const detail = (event as CustomEvent<OpenProjectRecordRequest>).detail;
      if (!detail?.id) return;
      if (detail.propertyId) setPropertyId(detail.propertyId);
      setProjectRecordRequest({ ...detail, nonce: Date.now() });
      setActiveView("projects");
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
      setActiveView("projects");
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
      setActiveView("pest");
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
      setActiveView("pest");
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
      setActiveView("lease");
    };
    window.addEventListener(openLeaseQuickAddEventName, handleOpenLeaseQuickAdd as EventListener);
    return () => window.removeEventListener(openLeaseQuickAddEventName, handleOpenLeaseQuickAdd as EventListener);
  }, []);

  useEffect(() => {
    const handleSetActiveView = (event: Event) => {
      const detail = (event as CustomEvent<{ view?: AppView; propertyId?: string }>).detail;
      if (!detail?.view) return;
      if (detail.propertyId) setPropertyId(detail.propertyId);
      setActiveView(detail.view);
    };
    window.addEventListener("makereadyos:set-active-view", handleSetActiveView as EventListener);
    return () => window.removeEventListener("makereadyos:set-active-view", handleSetActiveView as EventListener);
  }, []);

  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: getCurrentUser,
    retry: false,
  });

  const metaQuery = useQuery({
    queryKey: ["meta"],
    queryFn: getMeta,
    enabled: meQuery.isSuccess,
  });

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
    queryFn: getSavedViews,
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
    queryFn: getPropertyTemplates,
    enabled: meQuery.isSuccess
      && (meQuery.data?.user.role === "ADMIN" || meQuery.data?.user.role === "MANAGER")
      && activeView === "automations",
  });

  const loginMutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => login(email, password),
    onSuccess: async () => {
      setForceLoggedOut(false);
      setLoginError("");
      setSessionMessage("");
      pushToast("Signed in", "Your board workspace is ready.", "success");
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      await queryClient.invalidateQueries({ queryKey: ["meta"] });
      await queryClient.invalidateQueries({ queryKey: ["make-ready-items"] });
      await queryClient.invalidateQueries({ queryKey: ["saved-views"] });
    },
    onError: (error) => {
      setLoginError(error instanceof Error ? error.message : "Sign-in failed");
      pushToast("Sign-in failed", error instanceof Error ? error.message : "Sign-in failed", "error");
    },
  });

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      pushToast("Signed out", "Your current session has been closed.", "info");
      setSessionMessage("You have been signed out.");
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
    },
    onError: (error) => {
      pushToast("Logout failed", error instanceof Error ? error.message : "Logout failed", "error");
    },
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => patchMakeReadyItem(id, data),
    onSuccess: (_, variables) => {
      const field = Object.keys(variables.data)[0] ?? "item";
      const title = activeView === "kanban" ? "Card moved" : "Item updated";
      pushToast(title, `${humanizeField(field)} saved successfully.`, "success");
      queryClient.invalidateQueries({ queryKey: ["make-ready-items"] });
    },
    onError: (error) => {
      if (isApiError(error) && error.status === 401) {
        handleSessionExpired();
        return;
      }
      pushToast("Update failed", error instanceof Error ? error.message : "Update failed", "error");
    },
  });

  const markReadyMutation = useMutation({
    mutationFn: markMakeReadyItemReady,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["make-ready-items"] });
      await queryClient.invalidateQueries({ queryKey: ["activity"] });
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      pushToast("Unit marked ready", "Final walk signoff moved the unit to Ready Units.", "success");
    },
    onError: (error) => {
      pushToast("Mark ready failed", error instanceof Error ? error.message : "Could not mark unit ready", "error");
    },
  });

  const customValueMutation = useMutation({
    mutationFn: ({ itemId, fieldId, value }: { itemId: string; fieldId: string; value: unknown }) => updateCustomFieldValue(itemId, fieldId, value),
    onSuccess: async () => {
      pushToast("Custom value updated", "The custom field value was saved.", "success");
      await queryClient.invalidateQueries({ queryKey: ["make-ready-items"] });
    },
    onError: (error) => {
      pushToast("Custom value failed", error instanceof Error ? error.message : "Could not save custom field value", "error");
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
      pushToast("Property created", `${data.property.name} is ready for unit setup.`, "success");
    },
    onError: (error) => {
      setOperationsError(error instanceof Error ? error.message : "Property creation failed");
      pushToast("Property creation failed", error instanceof Error ? error.message : undefined, "error");
    },
  });

  const updatePropertyMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateProperty>[1] }) => updateProperty(id, data),
    onSuccess: async (data) => {
      await refreshOperations(`Updated property ${data.property.code}`);
      pushToast("Property updated", `${data.property.name} was saved.`, "success");
    },
    onError: (error) => {
      setOperationsError(error instanceof Error ? error.message : "Property update failed");
      pushToast("Property update failed", error instanceof Error ? error.message : undefined, "error");
    },
  });

  const propertyLifecycleMutation = useMutation({
    mutationFn: ({ id, restore }: { id: string; restore: boolean }) => restore ? restoreProperty(id) : archiveProperty(id),
    onSuccess: async (data) => {
      await refreshOperations(`${data.property.isActive ? "Restored" : "Archived"} property ${data.property.code}`);
      pushToast("Property status updated", `${data.property.code} is ${data.property.isActive ? "active" : "archived"}.`, "info");
    },
    onError: (error) => {
      setOperationsError(error instanceof Error ? error.message : "Property status update failed");
      pushToast("Property status failed", error instanceof Error ? error.message : undefined, "error");
    },
  });

  const deletePropertyMutation = useMutation({
    mutationFn: deleteProperty,
    onSuccess: async () => {
      await refreshOperations("Deleted archived property");
      pushToast("Property deleted", "The unlinked archived property was removed.", "info");
    },
    onError: (error) => {
      setOperationsError(error instanceof Error ? error.message : "Property deletion failed");
      pushToast("Property deletion blocked", error instanceof Error ? error.message : undefined, "error");
    },
  });

  const createUnitMutation = useMutation({
    mutationFn: createUnit,
    onSuccess: async (data) => {
      await refreshOperations(`Created unit ${data.unit.number}`);
      pushToast("Unit created", `${data.unit.property.code} ${data.unit.number} was added.`, "success");
    },
    onError: (error) => {
      setOperationsError(error instanceof Error ? error.message : "Unit creation failed");
      pushToast("Unit creation failed", error instanceof Error ? error.message : undefined, "error");
    },
  });

  const updateUnitMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateUnit>[1] }) => updateUnit(id, data),
    onSuccess: async (data) => {
      await refreshOperations(`Updated unit ${data.unit.number}`);
      pushToast("Unit updated", `${data.unit.number} was saved.`, "success");
    },
    onError: (error) => {
      setOperationsError(error instanceof Error ? error.message : "Unit update failed");
      pushToast("Unit update failed", error instanceof Error ? error.message : undefined, "error");
    },
  });

  const importUnitsMutation = useMutation({
    mutationFn: importUnits,
    onSuccess: async (data) => {
      await refreshOperations(`Imported unit directory: ${data.summary.created} created, ${data.summary.updated} updated`);
      const floorPlanSummary = data.summary.floorPlansCreated || data.summary.floorPlansUpdated
        ? ` ${data.summary.floorPlansCreated ?? 0} floor plans created, ${data.summary.floorPlansUpdated ?? 0} updated.`
        : "";
      pushToast("Unit directory imported", `${data.summary.created} created, ${data.summary.updated} updated, ${data.summary.skipped} skipped.${floorPlanSummary}`, "success");
    },
    onError: (error) => {
      setOperationsError(error instanceof Error ? error.message : "Unit import failed");
      pushToast("Unit import failed", error instanceof Error ? error.message : undefined, "error");
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
      pushToast("Availability imported", `${data.summary.turnsCreated} turns created, ${data.summary.turnsUpdated} turns updated, ${data.summary.skipped} skipped.${floorPlanSummary}`, "success");
    },
    onError: (error) => {
      setOperationsError(error instanceof Error ? error.message : "Availability import failed");
      if (isApiError(error) && error.status === 409) {
        pushToast("Availability import blocked", error.message, "info");
        return;
      }
      pushToast("Availability import failed", error instanceof Error ? error.message : undefined, "error");
    },
  });

  const revertUnitImportMutation = useMutation({
    mutationFn: revertUnitImport,
    onSuccess: async (data) => {
      await refreshOperations(`Reverted unit directory import: ${data.summary.deleted} created units removed`);
      const blocked = data.summary.blocked.length ? ` ${data.summary.blocked.length} linked units were kept.` : "";
      pushToast("Unit import reverted", `${data.summary.deleted} created units removed.${blocked}`, "info");
    },
    onError: (error) => {
      setOperationsError(error instanceof Error ? error.message : "Unit import revert failed");
      pushToast("Import revert failed", error instanceof Error ? error.message : undefined, "error");
    },
  });

  const unitLifecycleMutation = useMutation({
    mutationFn: ({ id, restore }: { id: string; restore: boolean }) => restore ? restoreUnit(id) : archiveUnit(id),
    onSuccess: async (data) => {
      await refreshOperations(`${data.unit.isActive ? "Restored" : "Archived"} unit ${data.unit.number}`);
      pushToast("Unit status updated", `${data.unit.number} is ${data.unit.isActive ? "active" : "archived"}.`, "info");
    },
    onError: (error) => {
      setOperationsError(error instanceof Error ? error.message : "Unit status update failed");
      pushToast("Unit status failed", error instanceof Error ? error.message : undefined, "error");
    },
  });

  const deleteUnitMutation = useMutation({
    mutationFn: deleteUnit,
    onSuccess: async () => {
      await refreshOperations("Deleted archived unit");
      pushToast("Unit deleted", "The unlinked archived unit was removed.", "info");
    },
    onError: (error) => {
      setOperationsError(error instanceof Error ? error.message : "Unit deletion failed");
      pushToast("Unit deletion blocked", error instanceof Error ? error.message : undefined, "error");
    },
  });

  const createItemMutation = useMutation({
    mutationFn: createMakeReadyItem,
    onSuccess: async (data) => {
      await refreshOperations(`Created make-ready item ${data.unitNumber}`);
      pushToast("Turn created", `${data.unitNumber} is now on the board.`, "success");
    },
    onError: (error) => {
      setOperationsError(error instanceof Error ? error.message : "Turn creation failed");
      pushToast("Turn creation failed", error instanceof Error ? error.message : undefined, "error");
    },
  });

  const itemLifecycleMutation = useMutation({
    mutationFn: ({ id, restore }: { id: string; restore: boolean }) => restore ? restoreMakeReadyItem(id) : archiveMakeReadyItem(id),
    onSuccess: async (data) => {
      await refreshOperations(`${data.isArchived ? "Archived" : "Restored"} make-ready item ${data.unitNumber}`);
      pushToast("Turn status updated", `${data.unitNumber} is ${data.isArchived ? "archived" : "active"}.`, "info");
    },
    onError: (error) => {
      setOperationsError(error instanceof Error ? error.message : "Turn status update failed");
      pushToast("Turn status failed", error instanceof Error ? error.message : undefined, "error");
    },
  });

  const batchItemsMutation = useMutation({
    mutationFn: batchMakeReadyItems,
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["make-ready-items"] });
      await queryClient.invalidateQueries({ queryKey: ["activity"] });
      pushToast("Batch update complete", `${data.count} item${data.count === 1 ? "" : "s"} updated.`, "success");
    },
    onError: (error) => pushToast("Batch update failed", error instanceof Error ? error.message : undefined, "error"),
  });
  const renameSectionMutation = useMutation({
    mutationFn: ({ id, displayName }: { id: string; displayName: string }) => updateBoardSection(id, displayName),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["meta"] });
      pushToast("Section renamed", `${data.section.displayName} is now used across the board.`, "success");
    },
    onError: (error) => pushToast("Section rename failed", error instanceof Error ? error.message : undefined, "error"),
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
    mutationFn: ({ category, enabled }: { category: string; enabled: boolean }) => updateNotificationPreference(category, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      pushToast("Preference updated", "In-app alert delivery was updated.", "success");
    },
    onError: (error) => pushToast("Preference update failed", error instanceof Error ? error.message : undefined, "error"),
  });

  const optionCreateMutation = useMutation({
    mutationFn: createBoardOption,
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["operations", "options"] });
      await queryClient.invalidateQueries({ queryKey: ["meta"] });
      pushToast("Label added", `${data.option.value} is available on the board.`, "success");
    },
    onError: (error) => pushToast("Label creation failed", error instanceof Error ? error.message : undefined, "error"),
  });
  const optionUpdateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateBoardOption>[1] }) => updateBoardOption(id, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["operations", "options"] });
      await queryClient.invalidateQueries({ queryKey: ["meta"] });
      pushToast("Label updated", "Board label changes were saved.", "success");
    },
    onError: (error) => pushToast("Label update failed", error instanceof Error ? error.message : undefined, "error"),
  });
  const optionArchiveMutation = useMutation({
    mutationFn: ({ id, restore }: { id: string; restore: boolean }) => archiveBoardOption(id, restore),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["operations", "options"] });
      await queryClient.invalidateQueries({ queryKey: ["meta"] });
      pushToast("Label status updated", "Archived choices remain in historical records.", "info");
    },
    onError: (error) => pushToast("Label update failed", error instanceof Error ? error.message : undefined, "error"),
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
      pushToast("Floor plan created", `${data.floorPlan.name} can now be assigned to units.`, "success");
    },
    onError: (error) => pushToast("Floor plan creation failed", error instanceof Error ? error.message : undefined, "error"),
  });
  const floorPlanUpdateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateFloorPlan>[1] }) => updateFloorPlan(id, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["operations", "floor-plans"] });
      await queryClient.invalidateQueries({ queryKey: ["meta"] });
      await queryClient.invalidateQueries({ queryKey: ["make-ready-items"] });
      pushToast("Floor plan updated", "Floor plan settings were saved.", "success");
    },
    onError: (error) => pushToast("Floor plan update failed", error instanceof Error ? error.message : undefined, "error"),
  });
  const floorPlanArchiveMutation = useMutation({
    mutationFn: ({ id, restore }: { id: string; restore: boolean }) => archiveFloorPlan(id, restore),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["operations", "floor-plans"] });
      await queryClient.invalidateQueries({ queryKey: ["meta"] });
      pushToast("Floor plan status updated", "Existing unit history remains unchanged.", "info");
    },
    onError: (error) => pushToast("Floor plan update failed", error instanceof Error ? error.message : undefined, "error"),
  });
  const columnUpdateMutation = useMutation({
    mutationFn: ({ fieldKey, label, reset }: { fieldKey: string; label?: string; reset?: boolean }) => updateBoardColumn(fieldKey, label, reset),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["meta"] });
      pushToast("Column label updated", `${data.column.label} is now shown on the board.`, "success");
    },
    onError: (error) => pushToast("Column update failed", error instanceof Error ? error.message : undefined, "error"),
  });
  const scheduleTrackCreateMutation = useMutation({
    mutationFn: createScheduleTrack,
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["meta"] });
      await queryClient.invalidateQueries({ queryKey: ["operations", "schedule-tracks"] });
      pushToast("Schedule track created", `${data.track.displayName} is available in Calendar.`, "success");
    },
    onError: (error) => pushToast("Schedule track creation failed", error instanceof Error ? error.message : undefined, "error"),
  });
  const scheduleTrackUpdateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateScheduleTrack>[1] }) => updateScheduleTrack(id, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["meta"] });
      await queryClient.invalidateQueries({ queryKey: ["operations", "schedule-tracks"] });
      pushToast("Schedule track updated", "Calendar settings were saved.", "success");
    },
    onError: (error) => pushToast("Schedule track update failed", error instanceof Error ? error.message : undefined, "error"),
  });
  const scheduleTrackReorderMutation = useMutation({
    mutationFn: reorderScheduleTracks,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["meta"] });
      await queryClient.invalidateQueries({ queryKey: ["operations", "schedule-tracks"] });
    },
    onError: (error) => pushToast("Schedule track reorder failed", error instanceof Error ? error.message : undefined, "error"),
  });
  const scheduleTrackArchiveMutation = useMutation({
    mutationFn: ({ id, restore }: { id: string; restore: boolean }) => archiveScheduleTrack(id, restore),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["meta"] });
      await queryClient.invalidateQueries({ queryKey: ["operations", "schedule-tracks"] });
      pushToast("Schedule track status updated", "Archived tracks remain available to restore in Setup.", "info");
    },
    onError: (error) => pushToast("Schedule track status failed", error instanceof Error ? error.message : undefined, "error"),
  });
  const operatingCalendarUpdateMutation = useMutation({
    mutationFn: ({ propertyId, data }: { propertyId: string; data: Parameters<typeof updateOperatingCalendar>[1] }) => updateOperatingCalendar(propertyId, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["operations", "operating-calendars"] });
      pushToast("Operating calendar saved", "Scheduling guardrails are ready for planning and automation review.", "success");
    },
    onError: (error) => pushToast("Operating calendar update failed", error instanceof Error ? error.message : undefined, "error"),
  });
  const riskPolicyUpdateMutation = useMutation({
    mutationFn: ({ propertyId, data }: { propertyId: string; data: Parameters<typeof updateRiskPolicy>[1] }) => updateRiskPolicy(propertyId, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["operations", "risk-policies"] });
      await queryClient.invalidateQueries({ queryKey: ["risk"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      pushToast("Risk policy saved", "Thresholds will apply to the next risk evaluation.", "success");
    },
    onError: (error) => pushToast("Risk policy update failed", error instanceof Error ? error.message : undefined, "error"),
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
      pushToast("Vendor created", `${data.vendor.name} is available for assignments.`, "success");
    },
    onError: (error) => pushToast("Vendor creation failed", error instanceof Error ? error.message : undefined, "error"),
  });
  const vendorArchiveMutation = useMutation({
    mutationFn: ({ id, restore }: { id: string; restore: boolean }) => archiveVendor(id, restore),
    onSuccess: async () => {
      await refreshVendors();
      pushToast("Vendor status updated", "Vendor directory changes were saved.", "info");
    },
    onError: (error) => pushToast("Vendor update failed", error instanceof Error ? error.message : undefined, "error"),
  });
  const vendorAssignmentCreateMutation = useMutation({
    mutationFn: createVendorAssignment,
    onSuccess: async () => {
      await refreshVendors();
      pushToast("Vendor work added", "The assignment is now tracked on the item and schedule.", "success");
    },
    onError: (error) => pushToast("Vendor assignment failed", error instanceof Error ? error.message : undefined, "error"),
  });
  const vendorAssignmentUpdateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateVendorAssignment>[1] }) => updateVendorAssignment(id, data),
    onSuccess: async () => {
      await refreshVendors();
      pushToast("Vendor work updated", "Assignment status was saved.", "success");
    },
    onError: (error) => pushToast("Vendor update failed", error instanceof Error ? error.message : undefined, "error"),
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
      pushToast("Work planned", "The assignment is now on the workload plan.", "success");
    },
    onError: (error) => pushToast("Planning failed", error instanceof Error ? error.message : undefined, "error"),
  });
  const workBlockUpdateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateWorkAssignmentBlock>[1] }) => updateWorkAssignmentBlock(id, data),
    onSuccess: async () => {
      await refreshPlanning();
      pushToast("Planned work updated", "Workload changes were saved.", "success");
    },
    onError: (error) => pushToast("Planning update failed", error instanceof Error ? error.message : undefined, "error"),
  });
  const refreshMaps = async () => {
    await queryClient.invalidateQueries({ queryKey: ["property-maps"] });
    await queryClient.invalidateQueries({ queryKey: ["unit-map-locations"] });
    await queryClient.invalidateQueries({ queryKey: ["property-map-areas"] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    await queryClient.invalidateQueries({ queryKey: ["activity"] });
  };
  const propertyMapCreateMutation = useMutation({
    mutationFn: createPropertyMap,
    onSuccess: async (data) => {
      await refreshMaps();
      pushToast("Property map created", `${data.map.name} is ready for unit markers.`, "success");
    },
    onError: (error) => pushToast("Map creation failed", error instanceof Error ? error.message : undefined, "error"),
  });
  const propertyMapArchiveMutation = useMutation({
    mutationFn: ({ id, restore }: { id: string; restore: boolean }) => archivePropertyMap(id, restore),
    onSuccess: async () => {
      await refreshMaps();
      pushToast("Map status updated", "Property map availability was saved.", "info");
    },
    onError: (error) => pushToast("Map status failed", error instanceof Error ? error.message : undefined, "error"),
  });
  const propertyMapUploadMutation = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => uploadPropertyMap(id, file),
    onSuccess: async () => {
      await refreshMaps();
      pushToast("Map uploaded", "The local map file is available to authorized users.", "success");
    },
    onError: (error) => pushToast("Map upload failed", error instanceof Error ? error.message : undefined, "error"),
  });
  const unitMapLocationSaveMutation = useMutation({
    mutationFn: saveUnitMapLocation,
    onSuccess: async () => {
      await refreshMaps();
      pushToast("Unit marker saved", "Map location was updated.", "success");
    },
    onError: (error) => pushToast("Marker save failed", error instanceof Error ? error.message : undefined, "error"),
  });
  const unitMapLocationRemoveMutation = useMutation({
    mutationFn: removeUnitMapLocation,
    onSuccess: async () => {
      await refreshMaps();
      pushToast("Unit marker removed", "The unit is now listed as unmapped.", "info");
    },
    onError: (error) => pushToast("Marker remove failed", error instanceof Error ? error.message : undefined, "error"),
  });
  const propertyMapAreaCreateMutation = useMutation({
    mutationFn: createPropertyMapArea,
    onSuccess: async () => {
      await refreshMaps();
      pushToast("Map area saved", "Building or area marker was added.", "success");
    },
    onError: (error) => pushToast("Area save failed", error instanceof Error ? error.message : undefined, "error"),
  });
  const propertyMapAreaUpdateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updatePropertyMapArea>[1] }) => updatePropertyMapArea(id, data),
    onSuccess: async () => {
      await refreshMaps();
      pushToast("Map area updated", "Building or area marker was updated.", "success");
    },
    onError: (error) => pushToast("Area update failed", error instanceof Error ? error.message : undefined, "error"),
  });
  const propertyMapAreaRemoveMutation = useMutation({
    mutationFn: removePropertyMapArea,
    onSuccess: async () => {
      await refreshMaps();
      pushToast("Map area archived", "The building or area marker was hidden.", "info");
    },
    onError: (error) => pushToast("Area archive failed", error instanceof Error ? error.message : undefined, "error"),
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
      pushToast("Field created", `${data.field.label} is now available on the board.`, "success");
    },
    onError: (error) => {
      setFieldMessage("");
      setFieldError(error instanceof Error ? error.message : "Create field failed");
      pushToast("Create field failed", error instanceof Error ? error.message : "Create field failed", "error");
    },
  });

  const updateFieldMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateCustomField>[1] }) => updateCustomField(id, data),
    onSuccess: async (data) => {
      await refreshFields(`Updated field ${data.field.label}`);
      pushToast("Field updated", `${data.field.label} was saved.`, "success");
    },
    onError: (error) => {
      setFieldMessage("");
      setFieldError(error instanceof Error ? error.message : "Update field failed");
      pushToast("Update field failed", error instanceof Error ? error.message : "Update field failed", "error");
    },
  });

  const archiveFieldMutation = useMutation({
    mutationFn: archiveCustomField,
    onSuccess: async () => {
      await refreshFields("Archived custom field");
      pushToast("Field archived", "The field was hidden while retaining its historical values.", "info");
    },
    onError: (error) => {
      setFieldMessage("");
      setFieldError(error instanceof Error ? error.message : "Archive field failed");
      pushToast("Archive failed", error instanceof Error ? error.message : "Archive field failed", "error");
    },
  });

  const restoreFieldMutation = useMutation({
    mutationFn: restoreCustomField,
    onSuccess: async () => {
      await refreshFields("Restored custom field");
      pushToast("Field restored", "The field is active again.", "success");
    },
    onError: (error) => {
      setFieldMessage("");
      setFieldError(error instanceof Error ? error.message : "Restore field failed");
      pushToast("Restore failed", error instanceof Error ? error.message : "Restore field failed", "error");
    },
  });

  const trashFieldMutation = useMutation({
    mutationFn: trashCustomField,
    onSuccess: async (data) => {
      await refreshFields("Moved custom field to trash");
      pushToast("Field moved to trash", `Retained until ${new Date(data.deleteAfter).toLocaleDateString()}.`, "info");
    },
    onError: (error) => {
      setFieldMessage("");
      setFieldError(error instanceof Error ? error.message : "Move field to trash failed");
      pushToast("Trash failed", error instanceof Error ? error.message : "Move field to trash failed", "error");
    },
  });

  const deleteFieldMutation = useMutation({
    mutationFn: permanentlyDeleteCustomField,
    onSuccess: async () => {
      await refreshFields("Permanently deleted custom field");
      pushToast("Field deleted", "The field was permanently removed.", "success");
    },
    onError: (error) => {
      setFieldMessage("");
      setFieldError(error instanceof Error ? error.message : "Permanent delete failed");
      pushToast("Delete failed", error instanceof Error ? error.message : "Permanent delete failed", "error");
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
      pushToast("Reorder failed", error instanceof Error ? error.message : "Reorder fields failed", "error");
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
      pushToast("Automation created", `${data.rule.name} is ready for structured execution.`, "success");
    },
    onError: (error) => {
      setAutomationMessage("");
      setAutomationError(error instanceof Error ? error.message : "Create automation failed");
      pushToast("Automation failed", error instanceof Error ? error.message : "Create automation failed", "error");
    },
  });

  const installAutomationTemplateMutation = useMutation({
    mutationFn: ({ templateId, propertyId, enabled }: { templateId: string; propertyId: string | null; enabled: boolean }) => installAutomationTemplate(templateId, { propertyId, enabled }),
    onSuccess: async (data) => {
      setAutomationRuleId(data.rule.id);
      await refreshAutomations(`Installed template ${data.rule.name}`);
      pushToast("Template installed", `${data.rule.name} was installed ${data.rule.enabled ? "and enabled" : "as a disabled rule for review"}.`, "success");
    },
    onError: (error) => {
      setAutomationMessage("");
      setAutomationError(error instanceof Error ? error.message : "Template installation failed");
      pushToast("Template installation failed", error instanceof Error ? error.message : "Template installation failed", "error");
    },
  });

  const previewOperationalLibraryMutation = useMutation({
    mutationFn: previewOperationalLibraryPack,
    onSuccess: (data) => {
      const lines = Object.entries(data.summary).map(([bucket, summary]) => `${bucket}: ${summary.created} create, ${summary.skipped} skip, ${summary.conflicts} conflict`);
      setLibraryPreview(lines.join("\n"));
      setAutomationError("");
      pushToast("Library preview complete", `${data.pack.name} was validated without changing data.`, "info");
    },
    onError: (error) => {
      setLibraryPreview("");
      setAutomationError(error instanceof Error ? error.message : "Library preview failed");
      pushToast("Library preview failed", error instanceof Error ? error.message : "Library preview failed", "error");
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
      pushToast("Library installed", `${created} library item${created === 1 ? "" : "s"} created; duplicates were skipped.`, "success");
    },
    onError: (error) => {
      setAutomationError(error instanceof Error ? error.message : "Library install failed");
      pushToast("Library install failed", error instanceof Error ? error.message : "Library install failed", "error");
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
      pushToast("Template preview complete", "Reusable property configuration was summarized without saving.", "info");
    },
    onError: (error) => {
      setTemplatePreview("");
      setAutomationError(error instanceof Error ? error.message : "Template preview failed");
      pushToast("Template preview failed", error instanceof Error ? error.message : "Template preview failed", "error");
    },
  });

  const createPropertyTemplateMutation = useMutation({
    mutationFn: createPropertyTemplateFromProperty,
    onSuccess: async (data) => {
      setTemplatePreview(`Saved template ${data.template.name}`);
      await queryClient.invalidateQueries({ queryKey: ["property-templates"] });
      await queryClient.invalidateQueries({ queryKey: ["activity"] });
      pushToast("Property template saved", `${data.template.name} is ready to reuse.`, "success");
    },
    onError: (error) => {
      setAutomationError(error instanceof Error ? error.message : "Template create failed");
      pushToast("Template create failed", error instanceof Error ? error.message : "Template create failed", "error");
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
      pushToast(data.dryRun ? "Template dry run complete" : "Template applied", data.dryRun ? "No data was changed." : "Reusable property setup was merged duplicate-safely.", data.dryRun ? "info" : "success");
    },
    onError: (error) => {
      setAutomationError(error instanceof Error ? error.message : "Template apply failed");
      pushToast("Template apply failed", error instanceof Error ? error.message : "Template apply failed", "error");
    },
  });

  const archivePropertyTemplateMutation = useMutation({
    mutationFn: archivePropertyTemplate,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["property-templates"] });
      pushToast("Template archived", "The property template was hidden from the active library.", "info");
    },
    onError: (error) => {
      setAutomationError(error instanceof Error ? error.message : "Template archive failed");
      pushToast("Template archive failed", error instanceof Error ? error.message : "Template archive failed", "error");
    },
  });

  const updateAutomationMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateAutomation>[1] }) => updateAutomation(id, data),
    onSuccess: async (data) => {
      await refreshAutomations(`Updated automation ${data.rule.name}`);
      pushToast("Automation updated", `${data.rule.name} was saved.`, "success");
    },
    onError: (error) => {
      setAutomationMessage("");
      setAutomationError(error instanceof Error ? error.message : "Update automation failed");
      pushToast("Automation update failed", error instanceof Error ? error.message : "Update automation failed", "error");
    },
  });

  const toggleAutomationMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => toggleAutomation(id, enabled),
    onSuccess: async (data) => {
      await refreshAutomations(`${data.rule.enabled ? "Enabled" : "Disabled"} ${data.rule.name}`);
      pushToast("Automation status updated", `${data.rule.name} is ${data.rule.enabled ? "enabled" : "disabled"}.`, "success");
    },
    onError: (error) => {
      setAutomationError(error instanceof Error ? error.message : "Automation toggle failed");
      pushToast("Automation status failed", error instanceof Error ? error.message : "Automation toggle failed", "error");
    },
  });

  const archiveAutomationMutation = useMutation({
    mutationFn: archiveAutomation,
    onSuccess: async () => {
      setAutomationRuleId(undefined);
      await refreshAutomations("Archived automation rule");
      pushToast("Automation archived", "The rule is disabled and retained for history.", "info");
    },
    onError: (error) => {
      setAutomationError(error instanceof Error ? error.message : "Archive automation failed");
      pushToast("Automation archive failed", error instanceof Error ? error.message : "Archive automation failed", "error");
    },
  });

  const previewAutomationMutation = useMutation({
    mutationFn: previewAutomation,
    onSuccess: (data) => {
      setAutomationError("");
      setAutomationPreview(data);
      pushToast("Preview complete", `${data.matchingItemCount} matching item${data.matchingItemCount === 1 ? "" : "s"}. No board changes made.`, "info");
      queryClient.invalidateQueries({ queryKey: ["activity"] });
    },
    onError: (error) => {
      setAutomationPreview(null);
      setAutomationError(error instanceof Error ? error.message : "Automation preview failed");
      pushToast("Preview failed", error instanceof Error ? error.message : "Automation preview failed", "error");
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
      pushToast("Scheduled check completed", `${execution.matchedCount} matched item${execution.matchedCount === 1 ? "" : "s"}; ${execution.actionCount} action${execution.actionCount === 1 ? "" : "s"}.`, "success");
    },
    onError: (error) => {
      setAutomationError(error instanceof Error ? error.message : "Run automation failed");
      pushToast("Scheduled check failed", error instanceof Error ? error.message : "Run automation failed", "error");
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
      await refreshAdmin(`Created user ${data.user.fullName}`);
      pushToast("User created", `${data.user.fullName} was added successfully.`, "success");
    },
    onError: (error) => {
      setAdminMessage("");
      setAdminError(error instanceof Error ? error.message : "Create user failed");
      pushToast("Create user failed", error instanceof Error ? error.message : "Create user failed", "error");
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
          current ? { ...current, user: { ...current.user, fullName: data.user.fullName, email: data.user.email, role: data.user.role, language: data.user.language } } : current
        ));
      }
      await refreshAdmin(`Updated ${data.user.fullName}`);
      pushToast("User updated", `${data.user.fullName} was saved.`, "success");
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
    onError: (error) => {
      setAdminMessage("");
      setAdminError(error instanceof Error ? error.message : "Update user failed");
      pushToast("Update failed", error instanceof Error ? error.message : "Update user failed", "error");
    },
  });

  const updateLanguageMutation = useMutation({
    mutationFn: updateCurrentUserPreferences,
    onSuccess: (data) => {
      queryClient.setQueryData<{ user: CurrentUser; roles: string[]; csrfToken: string } | null | undefined>(["auth", "me"], (current) => (
        current ? { ...current, user: data.user } : current
      ));
      pushToast("Language updated", data.user.language === "es" ? "La interfaz principal ahora usa español." : "Core interface labels now use English.", "success");
    },
    onError: (error) => {
      pushToast("Language update failed", error instanceof Error ? error.message : "Language preference was not saved", "error");
    },
  });

  const adminResetPasswordMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => resetAdminUserPassword(id, password),
    onSuccess: async (_, variables) => {
      const name = adminUsersQuery.data?.users.find((user) => user.id === variables.id)?.fullName ?? "user";
      await refreshAdmin(`Reset password for ${name}`);
      pushToast("Password reset", `${name}'s password was reset.`, "success");
    },
    onError: (error) => {
      setAdminMessage("");
      setAdminError(error instanceof Error ? error.message : "Password reset failed");
      pushToast("Password reset failed", error instanceof Error ? error.message : "Password reset failed", "error");
    },
  });

  const adminDeactivateMutation = useMutation({
    mutationFn: deactivateAdminUser,
    onSuccess: async (data) => {
      queryClient.setQueryData<{ users: ManagedUser[] } | undefined>(["admin", "users"], (current) => (
        current ? { users: replaceAdminUser(current.users, data.user) ?? current.users } : current
      ));
      await refreshAdmin(`Deactivated ${data.user.fullName}`);
      pushToast("User deactivated", `${data.user.fullName} can no longer sign in.`, "info");
    },
    onError: (error) => {
      setAdminMessage("");
      setAdminError(error instanceof Error ? error.message : "Deactivate user failed");
      pushToast("Deactivation failed", error instanceof Error ? error.message : "Deactivate user failed", "error");
    },
  });

  const adminPropertyAccessMutation = useMutation({
    mutationFn: ({ id, propertyIds }: { id: string; propertyIds: string[] }) => updateAdminUserPropertyAccess(id, propertyIds),
    onSuccess: async (data) => {
      queryClient.setQueryData<{ users: ManagedUser[] } | undefined>(["admin", "users"], (current) => (
        current ? { users: replaceAdminUser(current.users, data.user) ?? current.users } : current
      ));
      await refreshAdmin(`Updated property access for ${data.user.fullName}`);
      pushToast("Property access updated", `${data.user.fullName}'s property access was saved.`, "success");
    },
    onError: (error) => {
      setAdminMessage("");
      setAdminError(error instanceof Error ? error.message : "Property access update failed");
      pushToast("Property access failed", error instanceof Error ? error.message : "Property access update failed", "error");
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
      pushToast("Saved view created", `${data.view.name} is now available in your view list.`, "success");
    },
    onError: (error) => {
      setViewMessage("");
      setViewError(error instanceof Error ? error.message : "Create view failed");
      pushToast("Save view failed", error instanceof Error ? error.message : "Create view failed", "error");
    },
  });

  const updateViewMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateSavedView>[1] }) => updateSavedView(id, data),
    onSuccess: async (data) => {
      queryClient.setQueryData<{ views: SavedView[] } | undefined>(["saved-views"], (current) => (
        current ? { views: current.views.map((view) => (view.id === data.view.id ? data.view : view)) } : current
      ));
      await refreshViews(`Updated view ${data.view.name}`);
      pushToast("Saved view updated", `${data.view.name} was updated.`, "success");
    },
    onError: (error) => {
      setViewMessage("");
      setViewError(error instanceof Error ? error.message : "Update view failed");
      pushToast("Update view failed", error instanceof Error ? error.message : "Update view failed", "error");
    },
  });

  const deleteViewMutation = useMutation({
    mutationFn: deleteSavedView,
    onSuccess: async (_, id) => {
      queryClient.setQueryData<{ views: SavedView[] } | undefined>(["saved-views"], (current) => (
        current ? { views: current.views.filter((view) => view.id !== id) } : current
      ));
      await refreshViews("Deleted saved view");
      pushToast("Saved view deleted", "The selected view was removed.", "info");
    },
    onError: (error) => {
      setViewMessage("");
      setViewError(error instanceof Error ? error.message : "Delete view failed");
      pushToast("Delete view failed", error instanceof Error ? error.message : "Delete view failed", "error");
    },
  });

  useEffect(() => {
    window.localStorage.setItem(compactModeStorageKey, String(compactMode));
  }, [compactMode]);

  useEffect(() => {
    window.localStorage.setItem(themeModeStorageKey, themeMode);
    document.documentElement.dataset.theme = themeMode;
  }, [themeMode]);

  useEffect(() => {
    window.localStorage.setItem(eyeStrainModeStorageKey, String(eyeStrainMode));
    document.documentElement.classList.toggle("eye-strain-mode", eyeStrainMode);
  }, [eyeStrainMode]);

  useEffect(() => {
    window.localStorage.setItem(dyslexiaModeStorageKey, String(dyslexiaMode));
    document.documentElement.classList.toggle("dyslexia-mode", dyslexiaMode);
  }, [dyslexiaMode]);

  useEffect(() => {
    window.localStorage.setItem(clockModeStorageKey, clockMode);
    document.documentElement.dataset.clockMode = clockMode;
  }, [clockMode]);

  useEffect(() => {
    window.localStorage.setItem(boardWindowedModeStorageKey, String(boardWindowedMode));
  }, [boardWindowedMode]);

  useEffect(() => {
    window.localStorage.setItem(boardWindowLimitStorageKey, String(boardWindowLimit));
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
    const online = () => {
      setIsOnline(true);
      setApiDegraded(false);
      pushToast("Back online", "Refreshing current workspace data.", "success");
      void queryClient.invalidateQueries();
    };
    const offline = () => {
      setIsOnline(false);
      setLastConnectionIssueAt(new Date().toISOString());
      pushToast("Offline", "Do not close this screen. Save changes after reconnecting.", "error");
    };
    const unreachable = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail as { at?: string } : {};
      setApiDegraded(true);
      setLastConnectionIssueAt(detail.at ?? new Date().toISOString());
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    window.addEventListener("makereadyos:api-unreachable", unreachable);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      window.removeEventListener("makereadyos:api-unreachable", unreachable);
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
    if (user.role === "ADMIN" || user.role === "MANAGER") {
      return true;
    }
    if (user.role === "TECH") {
      return techEditableFields.has(key);
    }
    if (user.role === "LEASING") {
      return leasingEditableFields.has(key);
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
          onSubmit={async (email, password) => {
            await loginMutation.mutateAsync({ email, password });
          }}
        />
        <PWAInstallPrompt />
        <ToastViewport toasts={toasts} onDismiss={dismissToast} />
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
        showActivity={currentUser.role === "ADMIN" || currentUser.role === "MANAGER"}
        showOperations={currentUser.role === "ADMIN" || currentUser.role === "MANAGER"}
        showVendors={currentUser.role !== "VIEWER" && currentUser.role !== "CLEANER" && currentUser.role !== "LEASING"}
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
          window.localStorage.removeItem(onboardingSkippedStorageKey);
          setOnboardingOpen(true);
        }}
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
            <span className="module-rail-icon" style={moduleRailMask("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm2 4v2h6V8H9Zm0 4v2h6v-2H9Zm-2-8v16H5V4h2Z'/%3E%3C/svg%3E")} aria-hidden="true" />
          </button>
          <button
            className={activeView === "pm" ? "module-rail-button active" : "module-rail-button"}
            type="button"
            title="Preventive Maintenance"
            aria-label="Open Preventive Maintenance"
            data-testid="module-rail-pm"
            onClick={() => setActiveView("pm")}
          >
            <span className="module-rail-icon" style={moduleRailMask("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M21 7.5 16.5 3l-2.1 2.1 1.5 1.5-3.9 3.9-1.5-1.5L3 16.5 7.5 21l7.5-7.5-1.5-1.5 3.9-3.9 1.5 1.5L21 7.5Z'/%3E%3C/svg%3E")} aria-hidden="true" />
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
          <ConnectionStatus online={isOnline} degraded={apiDegraded} lastIssueAt={lastConnectionIssueAt} onRetry={retryConnection} />
          <Suspense fallback={
            <div className="panel-state-wrap">
              <StatusState title="Loading workspace" description="Preparing this MakeReadyOS view." />
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
              onOpenItem={setSelectedItemId}
              onDrillDown={({ type, value }) => {
                setActiveView("table");
                clearBoardFilters(true);
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
              onOpenItem={setSelectedItemId}
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
              onPropertyChange={setPropertyId}
              loading={planningQuery.isLoading || itemsQuery.isLoading}
              error={planningQuery.isError}
              canManage={currentUser.role === "ADMIN" || currentUser.role === "MANAGER" || currentUser.role === "TECH"}
              onCreateBlock={async (input) => { await workBlockCreateMutation.mutateAsync(input); }}
              onUpdateBlock={async (id, input) => { await workBlockUpdateMutation.mutateAsync({ id, data: input }); }}
              onOpenItem={setSelectedItemId}
            />
          ) : activeView === "operations" && (currentUser.role === "ADMIN" || currentUser.role === "MANAGER") ? (
            operationsPropertiesQuery.isLoading || operationsUnitsQuery.isLoading || operationsOptionsQuery.isLoading || floorPlansQuery.isLoading || scheduleTracksQuery.isLoading || operatingCalendarsQuery.isLoading || riskPoliciesQuery.isLoading ? (
              <div className="panel-state-wrap">
                <StatusState title="Loading board setup" description="Fetching properties, units, and turnover lifecycle records." />
              </div>
            ) : operationsPropertiesQuery.isError || operationsUnitsQuery.isError || operationsOptionsQuery.isError || floorPlansQuery.isError || scheduleTracksQuery.isError || operatingCalendarsQuery.isError || riskPoliciesQuery.isError ? (
              <div className="panel-state-wrap">
                <StatusState title="Board setup failed to load" description="Refresh the workspace and retry." tone="error" />
              </div>
            ) : (
              <>
              <OperationsPanel
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
                onOpenItem={setSelectedItemId}
                onUpdateOperatingCalendar={async (propertyId, input) => { await operatingCalendarUpdateMutation.mutateAsync({ propertyId, data: input }); }}
                onUpdateRiskPolicy={async (propertyId, input) => { await riskPolicyUpdateMutation.mutateAsync({ propertyId, data: input }); }}
              />
              <BoardConfigurationPanel
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
              loading={propertyMapsQuery.isLoading || unitMapLocationsQuery.isLoading || propertyMapAreasQuery.isLoading}
              error={propertyMapsQuery.isError || unitMapLocationsQuery.isError || propertyMapAreasQuery.isError ? "Property map data failed to load." : null}
              onPropertyChange={setPropertyId}
              onCreateMap={async (input) => { await propertyMapCreateMutation.mutateAsync(input); }}
              onArchiveMap={async (id, restore = false) => { await propertyMapArchiveMutation.mutateAsync({ id, restore }); }}
              onUploadMap={async (id, file) => { await propertyMapUploadMutation.mutateAsync({ id, file }); }}
              onSaveLocation={async (input) => { await unitMapLocationSaveMutation.mutateAsync(input); }}
              onRemoveLocation={async (id) => { await unitMapLocationRemoveMutation.mutateAsync(id); }}
              onCreateArea={async (input) => { await propertyMapAreaCreateMutation.mutateAsync(input); }}
              onUpdateArea={async (id, input) => { await propertyMapAreaUpdateMutation.mutateAsync({ id, data: input }); }}
              onRemoveArea={async (id) => { await propertyMapAreaRemoveMutation.mutateAsync(id); }}
              onOpenItem={setSelectedItemId}
            />
          ) : activeView === "pond" ? (
            <FrogPondPanel
              items={sortedItems}
              properties={metaQuery.data?.properties ?? []}
              boardSections={metaQuery.data?.boardSections ?? []}
              labelsByField={labelsByField}
              selectedPropertyId={propertyId}
              loading={metaQuery.isLoading || itemsQuery.isLoading}
              error={metaQuery.isError || itemsQuery.isError}
              onOpenItem={setSelectedItemId}
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
          ) : activeView === "vendors" && currentUser.role !== "VIEWER" && currentUser.role !== "CLEANER" && currentUser.role !== "LEASING" ? (
            <VendorsPanel
              vendors={vendorsQuery.data?.vendors ?? []}
              assignments={vendorAssignmentsQuery.data?.assignments ?? []}
              properties={metaQuery.data?.properties ?? []}
              items={boardItems}
              canManage={currentUser.role === "ADMIN" || currentUser.role === "MANAGER"}
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
            />
          ) : activeView === "pool" ? (
            <PoolLogPanel
              properties={metaQuery.data?.properties ?? []}
              selectedPropertyId={propertyId}
              userRole={currentUser.role}
            />
          ) : activeView === "pest" ? (
            <PestControlPanel
              properties={metaQuery.data?.properties ?? []}
              units={metaQuery.data?.units ?? []}
              users={adminUsersQuery.data?.users?.map((user) => ({ id: user.id, fullName: user.fullName, role: user.role })) ?? []}
              selectedPropertyId={propertyId}
              userRole={currentUser.role}
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
              openQuickAddRequest={leaseQuickAddRequest}
            />
          ) : activeView === "pm" ? (
            <PreventiveMaintenancePanel
              properties={metaQuery.data?.properties ?? []}
              selectedPropertyId={propertyId}
              userRole={currentUser.role}
            />
          ) : activeView === "projects" && currentUser.role !== "CLEANER" ? (
            <ProjectsPanel
              properties={metaQuery.data?.properties ?? []}
              users={adminUsersQuery.data?.users?.map((user) => ({ id: user.id, fullName: user.fullName, role: user.role })) ?? []}
              selectedPropertyId={propertyId}
              userRole={currentUser.role}
              openRecordRequest={projectRecordRequest}
              openCreateRequest={projectCreateRequest}
            />
          ) : activeView === "wiki" ? (
            <PropertyWikiPanel
              properties={metaQuery.data?.properties ?? []}
              selectedPropertyId={propertyId}
              userRole={currentUser.role}
              openRecordRequest={wikiRecordRequest}
            />
          ) : activeView === "fields" && (currentUser.role === "ADMIN" || currentUser.role === "MANAGER") ? (
            customFieldsQuery.isLoading ? (
              <div className="panel-state-wrap">
                <StatusState title="Loading custom fields" description="Fetching configurable make-ready columns and option sets." />
              </div>
            ) : customFieldsQuery.isError ? (
              <div className="panel-state-wrap">
                <StatusState title="Custom fields failed to load" description="Refresh the workspace and retry." tone="error" />
              </div>
            ) : (
              <CustomFieldsPanel
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
                <StatusState title="Loading automations" description="Fetching structured rules and recent execution history." />
              </div>
            ) : automationsQuery.isError || automationTemplatesQuery.isError || operationalLibraryQuery.isError || propertyTemplatesQuery.isError ? (
              <div className="panel-state-wrap">
                <StatusState title="Automations failed to load" description="Refresh the workspace and retry." tone="error" />
              </div>
            ) : (
              <AutomationPanel
                role={currentUser.role}
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
                loading={createAutomationMutation.isPending || installAutomationTemplateMutation.isPending || previewOperationalLibraryMutation.isPending || installOperationalLibraryMutation.isPending || previewPropertyTemplateMutation.isPending || createPropertyTemplateMutation.isPending || applyPropertyTemplateMutation.isPending || archivePropertyTemplateMutation.isPending || updateAutomationMutation.isPending || toggleAutomationMutation.isPending || archiveAutomationMutation.isPending || previewAutomationMutation.isPending || runAutomationMutation.isPending}
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
          ) : activeView === "activity" && (currentUser.role === "ADMIN" || currentUser.role === "MANAGER") ? (
            <ActivityPanel onSessionExpired={handleSessionExpired} />
          ) : activeView === "admin" && currentUser.role === "ADMIN" ? (
            adminUsersQuery.isLoading || adminPropertiesQuery.isLoading ? (
              <div className="panel-state-wrap">
                <StatusState title="Loading admin workspace" description="Fetching users, roles, and property access settings." />
              </div>
            ) : adminUsersQuery.isError || adminPropertiesQuery.isError ? (
              <div className="panel-state-wrap">
                <StatusState
                  title="Admin data failed to load"
                  description="Refresh the page or sign in again if your session expired."
                  tone="error"
                />
              </div>
            ) : (
              <AdminPanel
                users={adminUsersQuery.data?.users ?? []}
                properties={adminPropertiesQuery.data?.properties ?? []}
                appInfo={metaQuery.data?.app ?? null}
                currentUserId={currentUser.id}
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
                  pushToast("Backup imported", "Operational data was refreshed from the transferred backup.", "success");
                }}
              />
            )
          ) : metaQuery.isLoading || itemsQuery.isLoading ? (
            <div className="panel-state-wrap">
              <StatusState title="Loading board" description="Preparing properties, labels, and make-ready items." />
            </div>
          ) : metaQuery.isError || itemsQuery.isError ? (
            <div className="panel-state-wrap">
              <StatusState
                title="Board data failed to load"
                description="Refresh the workspace or sign in again if your session has expired."
                tone="error"
                action={{ label: "Reload", onClick: () => window.location.reload() }}
              />
            </div>
          ) : savedViewsQuery.isLoading ? (
            <div className="panel-state-wrap">
              <StatusState title="Loading saved views" description="Restoring your view presets and board preferences." />
            </div>
          ) : savedViewsQuery.isError ? (
            <div className="panel-state-wrap">
              <StatusState title="Saved views failed to load" description="The board is still available, but your stored views could not be fetched." tone="error" />
            </div>
          ) : <>
            {(activeView === "table" || activeView === "kanban" || activeView === "calendar") ? (
              <>
                <ActiveFilterBar chips={activeFilterChips} resultCount={structuredFilters.archiveState === "occupied" ? occupiedDirectoryResultCount : sortedItems.length} onClear={() => clearBoardFilters()} />
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
              onOpenItem={setSelectedItemId}
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
              onOpenItem={setSelectedItemId}
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
            />
          ) : (
            <CalendarView
              eventsByTrack={calendarEventsByTrack}
              labelsByField={labelsByField}
              fieldOptions={scheduleFieldOptions}
              layout={calendarLayout}
              selectedFields={calendarPanelFields.length ? calendarPanelFields : [activeScheduleTrack?.id ?? ""]}
              onLayoutChange={setCalendarLayout}
              onFieldChange={(index, value) => {
                const next = [...calendarPanelFields];
                next[index] = value;
                setCalendarPanelFields(next);
                if (index === 0) setActiveCalendarField(value);
              }}
              onOpenItem={setSelectedItemId}
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
            canViewActivity={currentUser.role === "ADMIN" || currentUser.role === "MANAGER"}
            onClose={() => setSelectedItemId(null)}
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
        data={notificationsQuery.data}
        loading={notificationsQuery.isLoading}
        onClose={() => setNotificationsOpen(false)}
        onRead={async (id) => { await readNotificationMutation.mutateAsync(id); }}
        onReadAll={async () => { await readAllNotificationsMutation.mutateAsync(); }}
        onDismiss={async (id) => { await dismissNotificationMutation.mutateAsync(id); }}
        onOpenItem={(id) => { setSelectedItemId(id); setNotificationsOpen(false); }}
        onPreferenceChange={async (category, enabled) => { await notificationPreferenceMutation.mutateAsync({ category, enabled }); }}
      />
      <CommandPalette
        open={commandPaletteOpen}
        items={boardItems}
        properties={metaQuery.data?.properties ?? []}
        views={savedViewsQuery.data?.views ?? []}
        staff={metaQuery.data?.staff ?? []}
        floorPlans={floorPlansQuery.data?.floorPlans ?? []}
        onClose={() => setCommandPaletteOpen(false)}
        onOpenItem={setSelectedItemId}
        onNavigate={(view) => setActiveView(view)}
        onOpenNotifications={() => setNotificationsOpen(true)}
        onOpenOnboarding={() => {
          setOnboardingSkipped(false);
          window.localStorage.removeItem(onboardingSkippedStorageKey);
          setOnboardingOpen(true);
        }}
        onLoadView={applySavedView}
      />
      <OnboardingPanel
        open={onboardingOpen}
        currentUser={currentUser}
        properties={metaQuery.data?.properties ?? []}
        units={metaQuery.data?.units ?? []}
        floorPlans={floorPlansQuery.data?.floorPlans ?? []}
        savedViews={savedViewsQuery.data?.views ?? metaQuery.data?.views ?? []}
        scheduleTracks={metaQuery.data?.scheduleTracks ?? []}
        firstRunDetected={firstRunDetected}
        onNavigate={(view) => setActiveView(view)}
        onClose={() => setOnboardingOpen(false)}
        onSkip={() => {
          window.localStorage.setItem(onboardingSkippedStorageKey, "true");
          setOnboardingSkipped(true);
          setOnboardingOpen(false);
        }}
      />
      <PWAInstallPrompt />
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default App;
