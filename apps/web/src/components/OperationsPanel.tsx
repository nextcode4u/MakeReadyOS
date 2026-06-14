import { useEffect, useMemo, useState } from "react";
import type { AvailabilityImportInput, AvailabilityImportResult, BoardSection, FloorPlan, LabelDefinition, MakeReadyItem, OperatingCalendar, OperatingCalendarInput, Property, RiskPolicy, StaffOption, Unit, UserRole } from "../lib/api";
import type { ArchiveFilter } from "../lib/structuredFilters";
import { ConfirmDialog } from "./ConfirmDialog";
import { StatusState } from "./StatusState";

function floorPlanLabel(plan: Pick<FloorPlan, "code" | "name">) {
  return plan.name && plan.name !== plan.code ? `${plan.code} - ${plan.name}` : plan.code;
}

type Props = {
  role: UserRole;
  properties: Property[];
  units: Unit[];
  floorPlans: FloorPlan[];
  operatingCalendars: OperatingCalendar[];
  riskPolicies: Array<{ property: Property; policy: RiskPolicy; customized: boolean }>;
  labels: LabelDefinition[];
  staff: StaffOption[];
  items: MakeReadyItem[];
  boardGroups: string[];
  boardSections: BoardSection[];
  loading: boolean;
  message?: string;
  error?: string;
  onCreateProperty: (input: { name: string; code: string; occupancyGoalPercent?: number | null }) => Promise<void>;
  onUpdateProperty: (id: string, input: { name: string; code: string; occupancyGoalPercent?: number | null }) => Promise<void>;
  onArchiveProperty: (id: string, restore: boolean) => Promise<void>;
  onDeleteProperty: (id: string) => Promise<void>;
  onCreateUnit: (input: UnitInput) => Promise<void>;
  onUpdateUnit: (id: string, input: UnitInput) => Promise<void>;
  onImportUnits: (input: { propertyId: string; units: UnitImportInput[]; updateExisting: boolean }) => Promise<UnitImportResult>;
  onImportAvailability: (input: { propertyId: string; rows: AvailabilityImportInput[]; updateExisting: boolean; createTurns: boolean }) => Promise<AvailabilityImportResult>;
  onRevertUnitImport: (input: { propertyId: string; createdUnitIds: string[] }) => Promise<void>;
  onArchiveUnit: (id: string, restore: boolean) => Promise<void>;
  onDeleteUnit: (id: string) => Promise<void>;
  onCreateItem: (input: {
    propertyId: string;
    unitId: string | null;
    boardGroup: string;
    itemName: string;
    unitNumber: string;
    floorPlan: string | null;
    vacancyStatus: string | null;
    makeReadyStatus: string | null;
    completionStatus: string | null;
    makeReadyDate: string | null;
    moveInDate: string | null;
    scopeLevel: string | null;
    assignedTech: string | null;
  }) => Promise<void>;
  onArchiveItem: (id: string, restore: boolean) => Promise<void>;
  onOpenItem: (itemId: string) => void;
  onUpdateOperatingCalendar: (propertyId: string, input: OperatingCalendarInput) => Promise<void>;
  onUpdateRiskPolicy: (propertyId: string, input: Partial<RiskPolicy>) => Promise<void>;
};

type UnitInput = {
  propertyId: string;
  number: string;
  floorPlanId: string | null;
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

type UnitImportInput = {
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

type UnitImportResult = {
  property: Pick<Property, "id" | "code" | "name">;
  summary: { created: number; updated: number; skipped: number; floorPlansCreated?: number; floorPlansUpdated?: number; errors: string[] };
  createdUnitIds: string[];
  updatedUnitIds: string[];
};

type ConfirmTarget =
  | { type: "property"; operation: "archive" | "delete"; record: Property }
  | { type: "unit"; operation: "archive" | "delete"; record: Unit }
  | { type: "item"; operation: "archive"; record: MakeReadyItem }
  | null;

function displayGroup(group: string) {
  return group.replace(/_/g, " ");
}

const occupancyOptions: Array<{ value: Unit["occupancyStatus"]; label: string }> = [
  { value: "OCCUPIED", label: "Occupied" },
  { value: "VACANT NOT LEASED READY", label: "Vacant not leased ready" },
  { value: "VACANT NOT LEASED NOT READY", label: "Vacant not leased not ready" },
  { value: "NTV NOT LEASED", label: "NTV not leased" },
  { value: "NTV LEASED", label: "NTV leased" },
  { value: "VACANT LEASED READY", label: "Vacant leased ready" },
  { value: "VACANT LEASED NOT READY", label: "Vacant leased not ready" },
  { value: "DOWN", label: "Down" },
  { value: "TO PRE-WALK", label: "To pre-walk" },
  { value: "TO SCOPE", label: "To scope" },
  { value: "TO FINAL WALK", label: "To final walk" },
  { value: "MODEL", label: "Model" },
  { value: "UNKNOWN", label: "Unknown" },
];

function occupancyLabel(value: string | null | undefined) {
  return occupancyOptions.find((option) => option.value === value)?.label ?? value?.replace(/_/g, " ").toLowerCase() ?? "Unknown";
}

const unitDirectoryAiPrompt = `You are converting a property unit directory or availability export into a clean CSV for MakeReadyOS.

Return a CSV file if your interface supports file attachments. If not, return only one fenced csv block and no extra explanation.

Required header, exactly:
unit,building,area,floor,floorPlan,beds,baths,sqft,occupancyStatus,budgeted

Rules:
- One row per unit only.
- Do not include totals, summaries, page headers, footers, blank lines, rent, resident names, lease dates, phone numbers, emails, or private notes.
- If the export only has unit, floor plan, and square footage, leave unknown columns blank and set occupancyStatus to UNKNOWN.
- Preserve leading zeroes in unit numbers.
- Use building only when the source clearly has a building/building number. Leave blank for properties with unit numbers only.
- Use occupancyStatus values only from: OCCUPIED, VACANT NOT LEASED READY, VACANT NOT LEASED NOT READY, NTV NOT LEASED, NTV LEASED, VACANT LEASED READY, VACANT LEASED NOT READY, DOWN, TO PRE-WALK, TO SCOPE, TO FINAL WALK, MODEL, UNKNOWN.
- Convert common availability wording: Vacant Not Leased Ready -> VACANT NOT LEASED READY, Vacant Not Leased Not Ready -> VACANT NOT LEASED NOT READY, NTV Not Leased -> NTV NOT LEASED, NTV Leased -> NTV LEASED, Vacant Leased Ready -> VACANT LEASED READY, Vacant Leased Not Ready -> VACANT LEASED NOT READY, occupied -> OCCUPIED, model -> MODEL, down/unavailable -> DOWN.
- Set budgeted to yes unless the row clearly says the unit should be excluded from occupancy.
- Keep square footage as a whole number with no commas.

Before final output, verify every row has a unit value and the CSV has exactly the required columns.`;

const availabilityAiPrompt = `You are converting a property availability report into MakeReadyOS availability CSV.

Return a CSV file if your interface supports file attachments. If not, return only one fenced csv block and no extra explanation.

Required header, exactly:
unit,floorPlan,sqft,availabilityStatus,vacancyStatus,moveOutDate,vacatedDate,daysVacant,makeReadyDate,moveInDate,applicant,reportDate,dateApplied,building,area,floor

Rules:
- One row per availability/notice unit only. Do not include fully occupied units unless the report explicitly lists them as NTV, vacant, down, or model.
- Preserve leading zeroes in unit numbers.
- Do not include current resident names, phone numbers, emails, rent amounts, charges, totals, page headers, footers, or private notes.
- Do include applicant/preleased names in applicant when the availability report provides them for a future move-in.
- Use vacancyStatus values only from: VACANT NOT LEASED READY, VACANT NOT LEASED NOT READY, NTV NOT LEASED, NTV LEASED, VACANT LEASED READY, VACANT LEASED NOT READY, DOWN, TO PRE-WALK, TO SCOPE, TO FINAL WALK, MODEL, UNKNOWN.
- Map report sections carefully:
  - Vacant Not Leased Ready -> VACANT NOT LEASED READY
  - Vacant Not Leased Not Ready -> VACANT NOT LEASED NOT READY
  - NTV Not Leased -> NTV NOT LEASED
  - NTV Leased -> NTV LEASED
  - Vacant Leased Ready -> VACANT LEASED READY
  - Vacant Leased Not Ready -> VACANT LEASED NOT READY
  - Down/Unavailable -> DOWN
  - Model -> MODEL
- Use moveOutDate for expected notice/vacate dates when the report is an NTV section.
- Use vacatedDate for actual move-out/vacated dates when the report is a vacant section.
- Copy Days Vacant into daysVacant as a whole number when the report provides it.
- Use makeReadyDate only when the report provides a scheduled make-ready date.
- Use moveInDate only when a future move-in date is shown.
- Include the availability report generated/as-of date in reportDate for every row when the source report shows it.
- RealPage-style columns usually mean: report generated/as-of date -> reportDate; MoveOut -> moveOutDate for NTV rows or vacatedDate for already-vacant rows; Days Vacant -> daysVacant; Make Ready -> makeReadyDate; Date Applied -> dateApplied; Scheduled Move-In -> moveInDate; Preleased Name -> applicant.
- If the source has a grouped Preleased header with columns Lease Rent, Lease Signed, Name, and Comments, use the Name value as applicant.
- If an applicant name wraps onto the next line, join the wrapped line into the same applicant value. Example: "Weger, Kameron" on the unit row plus "Ross" on the next line becomes applicant "Weger, Kameron Ross".
- Do not put applicant names into notes. Applicant/preleased names belong only in the applicant column.
- Do not create a notes column for report metadata. MakeReadyOS stores report date/source details in import activity, while item notes are reserved for human operational notes.
- Keep dates as YYYY-MM-DD if possible. MM/DD/YYYY is also acceptable.
- Leave unknown columns blank.

Before final output, verify every row has unit and vacancyStatus and the CSV has exactly the required columns.`;

function splitDelimitedLine(line: string, delimiter: "," | "\t") {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === "\"" && quoted && next === "\"") {
      current += "\"";
      index += 1;
      continue;
    }
    if (char === "\"") {
      quoted = !quoted;
      continue;
    }
    if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseNumberCell(value: string) {
  const cleaned = value.replace(/,/g, "").replace(/[^\d.-]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeOccupancy(value: string): Unit["occupancyStatus"] {
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (normalized === "OCCUPIED" || normalized === "OCC") return "OCCUPIED";
  if (["VACANT_NOT_LEASED_READY", "VNL_READY", "VACANT_READY", "READY", "VR", "VACANT_MAKE_READY", "VACANT_AVAILABLE"].includes(normalized)) return "VACANT NOT LEASED READY";
  if (["VACANT_NOT_LEASED_NOT_READY", "VNL_NOT_READY", "VACANT_NOT_READY", "VACANT_NOT_LEASED", "VNL", "VACANT", "AVAILABLE"].includes(normalized)) return "VACANT NOT LEASED NOT READY";
  if (["NTV_NOT_LEASED", "NTV", "NOTICE", "NOTICE_TO_VACATE", "ON_NOTICE"].includes(normalized)) return "NTV NOT LEASED";
  if (["NTV_LEASED", "NOTICE_LEASED", "ON_NOTICE_LEASED"].includes(normalized)) return "NTV LEASED";
  if (["VACANT_LEASED_READY", "VL_READY"].includes(normalized)) return "VACANT LEASED READY";
  if (["VACANT_LEASED_NOT_READY", "VACANT_LEASED", "LEASED_VACANT", "VL"].includes(normalized)) return "VACANT LEASED NOT READY";
  if (["TO_PRE_WALK", "TO_PREWALK", "PRE_WALK", "PREWALK", "TO_WALK", "WALK"].includes(normalized)) return "TO PRE-WALK";
  if (["TO_SCOPE", "SCOPE"].includes(normalized)) return "TO SCOPE";
  if (["TO_FINAL_WALK", "FINAL_WALK", "FINALWALK", "QC", "FINAL_QC"].includes(normalized)) return "TO FINAL WALK";
  if (["VACANT_READY", "READY", "VR", "VACANT_MAKE_READY", "VACANT_AVAILABLE"].includes(normalized)) return "VACANT_READY";
  if (["VACANT_LEASED", "LEASED_VACANT", "VL"].includes(normalized)) return "VACANT_LEASED";
  if (["VACANT", "VACANT_NOT_LEASED", "VNL", "AVAILABLE"].includes(normalized)) return "VACANT_NOT_LEASED";
  if (["NTV", "NOTICE", "NOTICE_TO_VACATE", "ON_NOTICE"].includes(normalized)) return "NTV";
  if (["NTV_LEASED", "NOTICE_LEASED", "ON_NOTICE_LEASED"].includes(normalized)) return "NTV LEASED";
  if (["DOWN", "DOWN_UNIT", "UNAVAILABLE"].includes(normalized)) return "DOWN";
  if (["MODEL", "MODEL_UNIT"].includes(normalized)) return "MODEL";
  if (["UNKNOWN", "UNK"].includes(normalized)) return "UNKNOWN";
  return "OCCUPIED";
}

function normalizeBooleanCell(value: string, fallback = true) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  if (["false", "no", "n", "0", "exclude", "excluded", "nonbudgeted", "non-budgeted"].includes(normalized)) return false;
  if (["true", "yes", "y", "1", "include", "included", "budgeted"].includes(normalized)) return true;
  return fallback;
}

function normalizePreviewDate(value: string | null | undefined) {
  const trimmed = `${value ?? ""}`.trim();
  if (!trimmed || trimmed === "-" || trimmed === "—") return "";
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const [, mm, dd, yyyy] = slashMatch;
    const year = yyyy.length === 2 ? `20${yyyy}` : yyyy;
    return `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  return trimmed.slice(0, 10);
}

function hasImportedValue(value: unknown) {
  return value !== undefined && value !== null && `${value}`.trim() !== "";
}

function inferHeaderlessUnitHeaders(cellCount: number) {
  if (cellCount <= 1) return ["number"];
  if (cellCount === 2) return ["number", "floorplan"];
  if (cellCount === 3) return ["number", "floorplan", "sqft"];
  if (cellCount === 4) return ["number", "building", "floorplan", "sqft"];
  return ["number", "building", "area", "floor", "floorplan", "beds", "baths", "sqft", "occupancystatus", "budgeted"];
}

const weekdayOptions = [
  { value: "", label: "Not set" },
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

function minutesToTime(value: number) {
  const hours = Math.floor(value / 60).toString().padStart(2, "0");
  const minutes = (value % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function timeToMinutes(value: string, fallback: number) {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return fallback;
  return Math.min(1440, Math.max(0, hours * 60 + minutes));
}

export function OperationsPanel({
  role,
  properties,
  units,
  floorPlans,
  operatingCalendars,
  riskPolicies,
  labels,
  staff,
  items,
  boardGroups,
  boardSections,
  loading,
  message,
  error,
  onCreateProperty,
  onUpdateProperty,
  onArchiveProperty,
  onDeleteProperty,
  onCreateUnit,
  onUpdateUnit,
  onImportUnits,
  onImportAvailability,
  onRevertUnitImport,
  onArchiveUnit,
  onDeleteUnit,
  onCreateItem,
  onArchiveItem,
  onOpenItem,
  onUpdateOperatingCalendar,
  onUpdateRiskPolicy,
}: Props) {
  const activeProperties = properties.filter((property) => property.isActive);
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [turnArchiveMode, setTurnArchiveMode] = useState<ArchiveFilter>("active");
  const [turnHistorySearch, setTurnHistorySearch] = useState("");
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget>(null);
  const [propertyDraft, setPropertyDraft] = useState({ name: "", code: "", occupancyGoalPercent: "" });
  const [newProperty, setNewProperty] = useState({ name: "", code: "", occupancyGoalPercent: "" });
  const [unitDraft, setUnitDraft] = useState({ propertyId: "", number: "", floorPlanId: "", floorPlan: "", squareFeet: "", bedrooms: "", bathrooms: "", occupancyStatus: "OCCUPIED" as Unit["occupancyStatus"], building: "", area: "", floor: "", isBudgeted: true });
  const [newUnit, setNewUnit] = useState({ propertyId: "", number: "", floorPlanId: "", floorPlan: "", squareFeet: "", bedrooms: "", bathrooms: "", occupancyStatus: "OCCUPIED" as Unit["occupancyStatus"], building: "", area: "", floor: "", isBudgeted: true });
  const [unitImportText, setUnitImportText] = useState("");
  const [unitImportError, setUnitImportError] = useState("");
  const [showImportHelp, setShowImportHelp] = useState(false);
  const [lastImport, setLastImport] = useState<UnitImportResult | null>(null);
  const [availabilityImportText, setAvailabilityImportText] = useState("");
  const [availabilityImportError, setAvailabilityImportError] = useState("");
  const [showAvailabilityImportHelp, setShowAvailabilityImportHelp] = useState(false);
  const [lastAvailabilityImport, setLastAvailabilityImport] = useState<AvailabilityImportResult | null>(null);
  const [newItem, setNewItem] = useState({
    propertyId: "",
    unitId: "",
    boardGroup: "MAKE_READY_BOARD_TA",
    vacancyStatus: "VACANT NOT LEASED NOT READY",
    makeReadyStatus: "",
    completionStatus: "NO",
    makeReadyDate: "",
    moveInDate: "",
    scopeLevel: "",
    assignedTech: "",
  });
  const [calendarDraft, setCalendarDraft] = useState<OperatingCalendarInput>({
    name: "Default Operating Calendar",
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
  });
  const [riskDraft, setRiskDraft] = useState<RiskPolicy>({
    moveInCriticalDays: 1,
    moveInHighDays: 3,
    moveInMediumDays: 7,
    unassignedHighDays: 7,
    staleActivityDays: 5,
    agingMediumDays: 14,
    agingHighDays: 21,
    vendorNearMoveInDays: 3,
    checklistNearMoveInDays: 7,
    planningNearMoveInDays: 7,
  });

  useEffect(() => {
    if (!selectedPropertyId && properties[0]) setSelectedPropertyId(properties[0].id);
  }, [properties, selectedPropertyId]);

  const selectedProperty = properties.find((property) => property.id === selectedPropertyId) ?? null;
  const selectedOperatingCalendar = operatingCalendars.find((calendar) => calendar.propertyId === selectedPropertyId) ?? null;
  const selectedRiskPolicy = riskPolicies.find((entry) => entry.property.id === selectedPropertyId) ?? null;
  const unitsForProperty = units.filter((unit) => unit.propertyId === selectedPropertyId);
  const selectedUnit = units.find((unit) => unit.id === selectedUnitId) ?? null;
  const activeUnitsForItem = units.filter((unit) => unit.propertyId === newItem.propertyId && unit.isActive);
  const sectionsForNewItem = boardSections
    .filter((section) => section.propertyId === newItem.propertyId && section.isActive && section.sectionType !== "ARCHIVE")
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const floorPlansForNewUnit = floorPlans.filter((plan) => plan.propertyId === newUnit.propertyId && plan.isActive);
  const floorPlansForEditUnit = floorPlans.filter((plan) => plan.propertyId === unitDraft.propertyId && plan.isActive);
  const labelOptions = (key: string) => labels.filter((label) => label.fieldKey === key && !label.isArchived);

  useEffect(() => {
    if (selectedUnitId && !units.some((unit) => unit.id === selectedUnitId && unit.propertyId === selectedPropertyId)) {
      setSelectedUnitId("");
    }
  }, [selectedPropertyId, selectedUnitId, units]);
  const visibleItems = useMemo(
    () => items
      .filter((item) => !selectedPropertyId || item.propertyId === selectedPropertyId)
      .filter((item) => {
        if (turnArchiveMode === "archived") return item.isArchived;
        if (turnArchiveMode === "occupied") return item.unit?.occupancyStatus === "OCCUPIED" || item.vacancyStatus === "OCCUPIED";
        if (turnArchiveMode === "all") return true;
        return !item.isArchived;
      })
      .filter((item) => {
        const query = turnHistorySearch.trim().toLowerCase();
        if (!query) return true;
        return [item.unitNumber, item.itemName, item.applicant, item.assignedTech, item.boardGroup]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      }),
    [items, selectedPropertyId, turnArchiveMode, turnHistorySearch],
  );
  const occupiedDirectoryRows = useMemo(() => {
    if (turnArchiveMode !== "occupied") return [];
    const query = turnHistorySearch.trim().toLowerCase();
    return units
      .filter((unit) => (!selectedPropertyId || unit.propertyId === selectedPropertyId) && unit.occupancyStatus === "OCCUPIED")
      .filter((unit) => {
        if (!query) return true;
        return [
          unit.number,
          unit.property.code,
          unit.property.name,
          unit.floorPlanRecord ? floorPlanLabel(unit.floorPlanRecord) : unit.floorPlan,
          unit.building,
          unit.area,
          unit.floor,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      })
      .sort((left, right) => left.property.code.localeCompare(right.property.code) || left.number.localeCompare(right.number, undefined, { numeric: true }));
  }, [selectedPropertyId, turnArchiveMode, turnHistorySearch, units]);
  const visibleHistoryCount = turnArchiveMode === "occupied" ? occupiedDirectoryRows.length : visibleItems.length;
  const turnsByUnit = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      const key = `${item.propertyId}|${item.unitId ?? item.unitNumber}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [items]);

  useEffect(() => {
    if (!selectedProperty) return;
    setPropertyDraft({ name: selectedProperty.name, code: selectedProperty.code, occupancyGoalPercent: selectedProperty.occupancyGoalPercent?.toString() ?? "" });
    setNewUnit((current) => ({ ...current, propertyId: selectedProperty.isActive ? selectedProperty.id : activeProperties[0]?.id ?? "" }));
  }, [selectedProperty]);

  useEffect(() => {
    if (!selectedOperatingCalendar) return;
    setCalendarDraft({
      name: selectedOperatingCalendar.name,
      timezone: selectedOperatingCalendar.timezone,
      noWeekendScheduling: selectedOperatingCalendar.noWeekendScheduling,
      avoidMondayScheduling: selectedOperatingCalendar.avoidMondayScheduling,
      avoidFridayScheduling: selectedOperatingCalendar.avoidFridayScheduling,
      maintenanceStartMinute: selectedOperatingCalendar.maintenanceStartMinute,
      maintenanceEndMinute: selectedOperatingCalendar.maintenanceEndMinute,
      vendorLeadDays: selectedOperatingCalendar.vendorLeadDays,
      dailyScheduledUnitLimit: selectedOperatingCalendar.dailyScheduledUnitLimit,
      scopeDay: selectedOperatingCalendar.scopeDay,
      workStartDay: selectedOperatingCalendar.workStartDay,
      autoPopulateEnabled: selectedOperatingCalendar.autoPopulateEnabled,
      notes: selectedOperatingCalendar.notes,
    });
  }, [selectedOperatingCalendar]);

  useEffect(() => {
    if (!selectedRiskPolicy) return;
    setRiskDraft(selectedRiskPolicy.policy);
  }, [selectedRiskPolicy]);

  const updateRiskDraftNumber = (key: keyof RiskPolicy, value: string) => {
    const parsed = Number(value);
    setRiskDraft((current) => ({ ...current, [key]: Number.isFinite(parsed) ? parsed : current[key] }));
  };

  useEffect(() => {
    if (!selectedUnit) return;
    setUnitDraft({
      propertyId: selectedUnit.propertyId,
      number: selectedUnit.number,
      floorPlanId: selectedUnit.floorPlanId ?? "",
      floorPlan: selectedUnit.floorPlan ?? "",
      squareFeet: selectedUnit.squareFeet?.toString() ?? "",
      bedrooms: selectedUnit.bedrooms?.toString() ?? "",
      bathrooms: selectedUnit.bathrooms?.toString() ?? "",
      occupancyStatus: selectedUnit.occupancyStatus,
      building: selectedUnit.building ?? "",
      area: selectedUnit.area ?? "",
      floor: selectedUnit.floor ?? "",
      isBudgeted: selectedUnit.isBudgeted,
    });
  }, [selectedUnit]);

  useEffect(() => {
    if (!newItem.propertyId && activeProperties[0]) {
      setNewItem((current) => ({ ...current, propertyId: activeProperties[0].id }));
    }
  }, [activeProperties, newItem.propertyId]);

  useEffect(() => {
    if (!newItem.propertyId || sectionsForNewItem.length === 0) return;
    if (!sectionsForNewItem.some((section) => section.key === newItem.boardGroup)) {
      const preferredSection = sectionsForNewItem.find((section) => section.sectionType === "MAKE_READY") ?? sectionsForNewItem[0];
      setNewItem((current) => ({ ...current, boardGroup: preferredSection.key }));
    }
  }, [newItem.boardGroup, newItem.propertyId, sectionsForNewItem]);

  const chooseItemUnit = (unitId: string) => {
    setNewItem((current) => ({ ...current, unitId }));
  };

  const createItem = async () => {
    const unit = units.find((candidate) => candidate.id === newItem.unitId);
    if (!unit) return;
    await onCreateItem({
      propertyId: newItem.propertyId,
      unitId: unit.id,
      boardGroup: newItem.boardGroup,
      itemName: unit.number,
      unitNumber: unit.number,
      floorPlan: unit.floorPlan,
      vacancyStatus: newItem.vacancyStatus || null,
      makeReadyStatus: newItem.makeReadyStatus || null,
      completionStatus: newItem.completionStatus || null,
      makeReadyDate: newItem.makeReadyDate || null,
      moveInDate: newItem.moveInDate || null,
      scopeLevel: newItem.scopeLevel || null,
      assignedTech: newItem.assignedTech || null,
    });
    setNewItem((current) => ({ ...current, unitId: "", makeReadyDate: "", moveInDate: "", scopeLevel: "", assignedTech: "" }));
  };

  const parseUnitDirectoryRows = () => {
    const rows = unitImportText.split(/\r?\n/).map((row) => row.trim()).filter(Boolean);
    if (rows.length === 0) throw new Error("Paste CSV rows before importing.");
    const delimiter: "," | "\t" = rows[0].includes("\t") ? "\t" : ",";
    const firstCells = splitDelimitedLine(rows[0], delimiter).map(normalizeHeader);
    const hasHeader = firstCells.some((cell) => ["unit", "number", "unitnumber", "occupancystatus", "availabilitystatus"].includes(cell));
    const headers = hasHeader
      ? firstCells
      : inferHeaderlessUnitHeaders(firstCells.length);
    const dataRows = hasHeader ? rows.slice(1) : rows;
    if (dataRows.length === 0) throw new Error("Add at least one unit row below the header.");
    const valueAt = (cells: string[], names: string[]) => {
      const index = headers.findIndex((header) => names.includes(header));
      return index >= 0 ? cells[index]?.trim() ?? "" : "";
    };
    const hasColumn = (names: string[]) => headers.some((header) => names.includes(header));
    return dataRows.map((row) => {
      const cells = splitDelimitedLine(row, delimiter);
      const number = valueAt(cells, ["unit", "unitid", "number", "unitnumber", "apartment", "apartmentnumber"]);
      if (!number) throw new Error("Every imported row needs a unit number.");
      const sqft = parseNumberCell(valueAt(cells, ["sqft", "squarefeet", "squarefootage", "rentablesqft", "unitsqft"]));
      const beds = parseNumberCell(valueAt(cells, ["beds", "bed", "bedrooms"]));
      const baths = parseNumberCell(valueAt(cells, ["baths", "bath", "bathrooms"]));
      const imported: UnitImportInput = { number };
      const floorPlan = valueAt(cells, ["floorplan", "floorplancode", "plan", "unittype", "unittypename"]);
      const building = valueAt(cells, ["building", "buildingnumber", "bldg", "bldgno", "buildingname"]);
      const area = valueAt(cells, ["area", "phase", "zone", "section"]);
      const floor = valueAt(cells, ["floor", "level"]);
      const occupancy = valueAt(cells, ["occupancystatus", "availabilitystatus", "availability", "occupancy", "status", "unitstatus"]);
      const budgeted = valueAt(cells, ["budgeted", "isbudgeted", "includeinoccupancy", "occupancyeligible"]);
      if (floorPlan) imported.floorPlan = floorPlan;
      if (building) imported.building = building;
      if (area) imported.area = area;
      if (floor) imported.floor = floor;
      if (sqft !== null) imported.squareFeet = Math.round(sqft);
      if (beds !== null) imported.bedrooms = beds;
      if (baths !== null) imported.bathrooms = baths;
      if (occupancy || hasColumn(["occupancystatus", "availabilitystatus", "availability", "occupancy", "status", "unitstatus"])) imported.occupancyStatus = normalizeOccupancy(occupancy);
      if (budgeted || hasColumn(["budgeted", "isbudgeted", "includeinoccupancy", "occupancyeligible"])) imported.isBudgeted = normalizeBooleanCell(budgeted, true);
      return imported;
    });
  };

  const parseAvailabilityRows = () => {
    const rows = availabilityImportText.split(/\r?\n/).map((row) => row.trim()).filter(Boolean);
    if (rows.length === 0) throw new Error("Paste availability CSV rows before importing.");
    const delimiter: "," | "\t" = rows[0].includes("\t") ? "\t" : ",";
    const firstCells = splitDelimitedLine(rows[0], delimiter).map(normalizeHeader);
    const hasHeader = firstCells.some((cell) => ["unit", "unitnumber", "bldgunit", "vacancystatus", "availabilitystatus", "makereadydate", "makeready"].includes(cell));
    if (!hasHeader) throw new Error("Availability import needs a header row. Use the helper prompt for PDFs or spreadsheets.");
    const headers = firstCells;
    const dataRows = rows.slice(1);
    if (dataRows.length === 0) throw new Error("Add at least one availability row below the header.");
    const valueAt = (cells: string[], names: string[]) => {
      const index = headers.findIndex((header) => names.includes(header));
      return index >= 0 ? cells[index]?.trim() ?? "" : "";
    };
    return dataRows.map((row) => {
      const cells = splitDelimitedLine(row, delimiter);
      const number = valueAt(cells, ["unit", "unitid", "number", "unitnumber", "apartment", "apartmentnumber", "bldgunit", "bldgapt", "bldgunitnumber"]);
      if (!number) throw new Error("Every availability row needs a unit number.");
      const imported: AvailabilityImportInput = { number };
      const floorPlan = valueAt(cells, ["floorplan", "floorplancode", "plan", "unittype", "unittypename"]);
      const availabilityStatus = valueAt(cells, ["availabilitystatus", "availability", "availabilitysection", "reportsection", "section", "status", "unitstatus"]);
      const vacancyStatus = valueAt(cells, ["vacancystatus", "operationalstatus", "occupancystatus"]);
      const sqft = parseNumberCell(valueAt(cells, ["sqft", "squarefeet", "squarefootage", "rentablesqft", "unitsqft"]));
      const beds = parseNumberCell(valueAt(cells, ["beds", "bed", "bedrooms"]));
      const baths = parseNumberCell(valueAt(cells, ["baths", "bath", "bathrooms"]));
      const building = valueAt(cells, ["building", "buildingnumber", "bldg", "bldgno", "buildingname"]);
      const area = valueAt(cells, ["area", "phase", "zone", "section"]);
      const floor = valueAt(cells, ["floor", "level"]);
      const moveOutDate = valueAt(cells, ["moveoutdate", "moveout", "expectedmoveout", "ntvdate", "noticedate", "expectedvacate", "expectedvacatedate"]);
      const vacatedDate = valueAt(cells, ["vacateddate", "vacated", "possessiondate", "actualvacate", "actualmoveout"]);
      const daysVacant = parseNumberCell(valueAt(cells, ["daysvacant", "vacantdays", "dayvacant", "daysempty"]));
      const makeReadyDate = valueAt(cells, ["makereadydate", "makeready", "readydate", "scheduledmakeready", "scheduledmakereadydate", "scheduledreadydate"]);
      const moveInDate = valueAt(cells, ["moveindate", "movein", "scheduledmovein", "scheduledmoveindate", "scheduledmoveindate", "scheduledmi", "schedmovein", "schedmi"]);
      const reportDate = valueAt(cells, ["reportdate", "reportgenerated", "reportgenerateddate", "generatedat", "generateddate", "asof", "asofdate", "reportasof", "availabilitydate"]);
      const dateApplied = valueAt(cells, ["dateapplied", "applieddate", "applicationdate", "appdate"]);
      const applicant = valueAt(cells, ["applicant", "applicantname", "futureapplicant", "futureapplicantname", "preleased", "prelease", "preleasedname", "preleasedapplicant", "preleasedapplicantname", "preleasename", "leasedto", "leasename", "futuretenant", "futuretenantname", "prospect", "prospectname", "scheduledresident", "scheduledresidentname", "scheduledapplicant", "scheduledapplicantname", "resident", "name"]);
      const notes = valueAt(cells, ["notes", "note", "comments"]);
      if (floorPlan) imported.floorPlan = floorPlan;
      if (availabilityStatus) imported.availabilityStatus = availabilityStatus;
      if (vacancyStatus) {
        const normalized = normalizeOccupancy(vacancyStatus);
        if (normalized !== "OCCUPIED") imported.vacancyStatus = normalized as AvailabilityImportInput["vacancyStatus"];
      }
      if (sqft !== null) imported.squareFeet = Math.round(sqft);
      if (beds !== null) imported.bedrooms = beds;
      if (baths !== null) imported.bathrooms = baths;
      if (building) imported.building = building;
      if (area) imported.area = area;
      if (floor) imported.floor = floor;
      if (moveOutDate) imported.moveOutDate = moveOutDate;
      if (vacatedDate) imported.vacatedDate = vacatedDate;
      if (daysVacant !== null) imported.daysVacant = Math.max(0, Math.round(daysVacant));
      if (makeReadyDate) imported.makeReadyDate = makeReadyDate;
      if (moveInDate) imported.moveInDate = moveInDate;
      if (reportDate) imported.reportDate = reportDate;
      if (dateApplied) imported.dateApplied = dateApplied;
      if (applicant) imported.applicant = applicant;
      if (notes) imported.notes = notes;
      return imported;
    });
  };

  const unitImportPreview = useMemo(() => {
    if (!unitImportText.trim()) return null;
    try {
      const parsed = parseUnitDirectoryRows();
      const existing = new Set(unitsForProperty.map((unit) => unit.number.toUpperCase()));
      const statuses = parsed.reduce<Record<string, number>>((acc, unit) => {
        acc[unit.occupancyStatus ?? "OCCUPIED"] = (acc[unit.occupancyStatus ?? "OCCUPIED"] ?? 0) + 1;
        return acc;
      }, {});
      return {
        rows: parsed.length,
        creates: parsed.filter((unit) => !existing.has(unit.number.toUpperCase())).length,
        updates: parsed.filter((unit) => existing.has(unit.number.toUpperCase())).length,
        budgeted: parsed.filter((unit) => unit.isBudgeted !== false).length,
        statuses,
      };
    } catch {
      return null;
    }
  }, [unitImportText, unitsForProperty]);
  const unitImportParseError = useMemo(() => {
    if (!unitImportText.trim()) return "";
    try {
      parseUnitDirectoryRows();
      return "";
    } catch (error) {
      return error instanceof Error ? error.message : "Could not parse unit directory CSV.";
    }
  }, [unitImportText]);

  const availabilityImportPreview = useMemo(() => {
    if (!availabilityImportText.trim()) return null;
    try {
      const parsed = parseAvailabilityRows();
      const existingUnits = new Set(unitsForProperty.map((unit) => unit.number.toUpperCase()));
      const existingTurnsByUnit = new Map(items
        .filter((item) => !item.isArchived && item.propertyId === selectedPropertyId)
        .map((item) => [item.unitNumber.toUpperCase(), item]));
      const existingTurns = new Set(existingTurnsByUnit.keys());
      const statuses = parsed.reduce<Record<string, number>>((acc, row) => {
        const status = row.vacancyStatus ?? normalizeOccupancy(row.availabilityStatus ?? "");
        acc[status] = (acc[status] ?? 0) + 1;
        return acc;
      }, {});
      const changes = parsed.flatMap((row) => {
        const turn = existingTurnsByUnit.get(row.number.toUpperCase());
        if (!turn) return [];
        const changedFields: string[] = [];
        const status = row.vacancyStatus ?? normalizeOccupancy(row.availabilityStatus ?? "");
        if (status && status !== turn.vacancyStatus) changedFields.push(`Vacancy: ${occupancyLabel(turn.vacancyStatus)} -> ${occupancyLabel(status)}`);
        if (hasImportedValue(row.applicant) && (row.applicant ?? "") !== (turn.applicant ?? "")) changedFields.push(`Applicant: ${turn.applicant || "blank"} -> ${row.applicant}`);
        if (hasImportedValue(row.moveOutDate) && normalizePreviewDate(row.moveOutDate) !== normalizePreviewDate(turn.moveOutDate)) changedFields.push(`NTV date: ${normalizePreviewDate(turn.moveOutDate) || "blank"} -> ${normalizePreviewDate(row.moveOutDate)}`);
        if (hasImportedValue(row.vacatedDate) && normalizePreviewDate(row.vacatedDate) !== normalizePreviewDate(turn.vacatedDate)) changedFields.push(`Vacated: ${normalizePreviewDate(turn.vacatedDate) || "blank"} -> ${normalizePreviewDate(row.vacatedDate)}`);
        if (hasImportedValue(row.makeReadyDate) && normalizePreviewDate(row.makeReadyDate) !== normalizePreviewDate(turn.makeReadyDate)) changedFields.push(`Make ready: ${normalizePreviewDate(turn.makeReadyDate) || "blank"} -> ${normalizePreviewDate(row.makeReadyDate)}`);
        if (hasImportedValue(row.moveInDate) && normalizePreviewDate(row.moveInDate) !== normalizePreviewDate(turn.moveInDate)) changedFields.push(`Move-in: ${normalizePreviewDate(turn.moveInDate) || "blank"} -> ${normalizePreviewDate(row.moveInDate)}`);
        if (row.daysVacant !== undefined && row.daysVacant !== null && Number(row.daysVacant) !== Number(turn.daysVacant ?? 0)) changedFields.push(`Days vacant: ${turn.daysVacant ?? 0} -> ${row.daysVacant}`);
        return changedFields.length > 0 ? [{ unit: row.number, fields: changedFields }] : [];
      });
      return {
        rows: parsed.length,
        unitCreates: parsed.filter((row) => !existingUnits.has(row.number.toUpperCase())).length,
        unitUpdates: parsed.filter((row) => existingUnits.has(row.number.toUpperCase())).length,
        turnCreates: parsed.filter((row) => !existingTurns.has(row.number.toUpperCase())).length,
        turnUpdates: parsed.filter((row) => existingTurns.has(row.number.toUpperCase())).length,
        applicants: parsed.filter((row) => hasImportedValue(row.applicant)).length,
        statuses,
        changes,
      };
    } catch {
      return null;
    }
  }, [availabilityImportText, items, selectedPropertyId, unitsForProperty]);

  const availabilityImportParseError = useMemo(() => {
    if (!availabilityImportText.trim()) return "";
    try {
      parseAvailabilityRows();
      return "";
    } catch (error) {
      return error instanceof Error ? error.message : "Could not parse availability CSV.";
    }
  }, [availabilityImportText]);

  const importUnitDirectory = async () => {
    if (!properties.length) {
      setUnitImportError("Create a property before importing a unit directory.");
      return;
    }
    if (!selectedPropertyId || !selectedProperty) {
      setUnitImportError("Select the property that owns this unit directory before importing.");
      return;
    }
    try {
      setUnitImportError("");
      const parsedUnits = parseUnitDirectoryRows();
      const result = await onImportUnits({ propertyId: selectedPropertyId, units: parsedUnits, updateExisting: true });
      setLastImport(result);
      setTurnArchiveMode("occupied");
      setUnitImportText("");
    } catch (error) {
      setUnitImportError(error instanceof Error ? error.message : "Could not parse unit directory CSV.");
    }
  };

  const revertLastUnitImport = async () => {
    if (!lastImport || lastImport.createdUnitIds.length === 0) return;
    await onRevertUnitImport({ propertyId: lastImport.property.id, createdUnitIds: lastImport.createdUnitIds });
    setLastImport(null);
  };

  const importAvailabilityReport = async () => {
    if (!properties.length) {
      setAvailabilityImportError("Create a property before importing availability.");
      return;
    }
    if (!selectedPropertyId || !selectedProperty) {
      setAvailabilityImportError("Select the property that owns this availability report before importing.");
      return;
    }
    try {
      setAvailabilityImportError("");
      const parsedRows = parseAvailabilityRows();
      const result = await onImportAvailability({ propertyId: selectedPropertyId, rows: parsedRows, updateExisting: true, createTurns: true });
      setLastAvailabilityImport(result);
      setAvailabilityImportText("");
    } catch (error) {
      setAvailabilityImportError(error instanceof Error ? error.message : "Could not parse availability CSV.");
    }
  };

  const occupancyCounts = unitsForProperty.reduce<Record<string, number>>((acc, unit) => {
    acc[unit.occupancyStatus] = (acc[unit.occupancyStatus] ?? 0) + 1;
    return acc;
  }, {});
  const occupiedCount = occupancyCounts.OCCUPIED ?? 0;
  const occupancyPercent = unitsForProperty.length ? Math.round((occupiedCount / unitsForProperty.length) * 1000) / 10 : 0;
  const archivedTurns = items.filter((item) => item.isArchived && (!selectedPropertyId || item.propertyId === selectedPropertyId));
  const activeTurns = items.filter((item) => !item.isArchived && (!selectedPropertyId || item.propertyId === selectedPropertyId));

  return (
    <div className="operations-panel" data-testid="operations-panel">
      <header className="operations-header">
        <div>
          <p className="eyebrow">Board Setup</p>
          <h2>Properties, Units & Turns</h2>
          <p className="subtitle">Maintain the inventory behind the board and safely archive completed or retired records.</p>
        </div>
        <span className="role-chip">{role} ACCESS</span>
      </header>

      {message ? <div className="admin-message success">{message}</div> : null}
      {error ? <div className="admin-message error">{error}</div> : null}

      <section className="operations-grid">
        <article className="operations-card" data-testid="property-management">
          <div className="admin-section-head">
            <h3>Properties</h3>
            <span className="subtitle">{activeProperties.length} active</span>
          </div>
          {role === "ADMIN" ? (
            <form className="compact-form" onSubmit={(event) => {
              event.preventDefault();
              void onCreateProperty({
                name: newProperty.name,
                code: newProperty.code,
                occupancyGoalPercent: newProperty.occupancyGoalPercent ? Number(newProperty.occupancyGoalPercent) : null,
              }).then(() => setNewProperty({ name: "", code: "", occupancyGoalPercent: "" }));
            }}>
              <input data-testid="property-create-name" placeholder="Property name" value={newProperty.name} onChange={(event) => setNewProperty((current) => ({ ...current, name: event.target.value }))} required />
              <input data-testid="property-create-code" placeholder="Code" value={newProperty.code} onChange={(event) => setNewProperty((current) => ({ ...current, code: event.target.value }))} required />
              <input data-testid="property-create-occupancy-goal" type="number" min="0" max="100" step="0.1" placeholder="Occupancy goal %" value={newProperty.occupancyGoalPercent} onChange={(event) => setNewProperty((current) => ({ ...current, occupancyGoalPercent: event.target.value }))} />
              <button data-testid="property-create-submit" className="button button-primary" disabled={loading}>Add Property</button>
            </form>
          ) : <p className="helper-copy">Managers can edit assigned properties; administrators add or archive inventory.</p>}
          <div className="record-list">
            {properties.length === 0 ? <StatusState title="No properties assigned" description="An administrator must add or assign a property." tone="subtle" /> : properties.map((property) => (
              <button key={property.id} type="button" data-testid={`property-row-${property.code.toLowerCase()}`} className={selectedPropertyId === property.id ? "record-row selected" : "record-row"} onClick={() => setSelectedPropertyId(property.id)}>
                <span><strong>{property.code}</strong>{property.name}</span>
                <span className={property.isActive ? "status-chip active" : "status-chip inactive"}>{property.isActive ? "Active" : "Archived"}</span>
              </button>
            ))}
          </div>
          {selectedProperty ? (
            <div className="editor-block">
              <label>Name<input data-testid="property-edit-name" value={propertyDraft.name} onChange={(event) => setPropertyDraft((current) => ({ ...current, name: event.target.value }))} /></label>
              <label>Code<input data-testid="property-edit-code" value={propertyDraft.code} onChange={(event) => setPropertyDraft((current) => ({ ...current, code: event.target.value }))} /></label>
              <label>Occupancy goal %<input data-testid="property-edit-occupancy-goal" type="number" min="0" max="100" step="0.1" value={propertyDraft.occupancyGoalPercent} onChange={(event) => setPropertyDraft((current) => ({ ...current, occupancyGoalPercent: event.target.value }))} /></label>
              <div className="operations-mini-stats">
                <span><strong>{occupancyPercent}%</strong> current occupancy</span>
                <span><strong>{selectedProperty.occupancyGoalPercent ?? "Unset"}%</strong> goal</span>
                <span><strong>{occupiedCount}</strong> occupied / {unitsForProperty.length} units</span>
              </div>
              <div className="admin-actions">
                <button data-testid="property-save" className="button button-primary" disabled={loading} onClick={() => void onUpdateProperty(selectedProperty.id, { name: propertyDraft.name, code: propertyDraft.code, occupancyGoalPercent: propertyDraft.occupancyGoalPercent ? Number(propertyDraft.occupancyGoalPercent) : null })}>Save</button>
                {role === "ADMIN" ? (
                  <button data-testid={selectedProperty.isActive ? "property-archive" : "property-restore"} className={selectedProperty.isActive ? "button button-danger" : "button button-secondary"} onClick={() => selectedProperty.isActive ? setConfirmTarget({ type: "property", operation: "archive", record: selectedProperty }) : void onArchiveProperty(selectedProperty.id, true)}>
                    {selectedProperty.isActive ? "Archive" : "Restore"}
                  </button>
                ) : null}
                {role === "ADMIN" && !selectedProperty.isActive ? <button data-testid="property-delete" className="button button-danger" onClick={() => setConfirmTarget({ type: "property", operation: "delete", record: selectedProperty })}>Delete</button> : null}
              </div>
            </div>
          ) : null}
        </article>

        <article className="operations-card" data-testid="operating-calendar-management">
          <div className="admin-section-head">
            <h3>Operating Calendar</h3>
            <span className="subtitle">Scheduling guardrails for the selected property</span>
          </div>
          {!selectedProperty ? (
            <StatusState title="Choose a property" description="Select a property before editing scheduling rules." tone="subtle" />
          ) : (
            <div className="editor-block">
              <label className="span-full">Calendar name<input data-testid="operating-calendar-name" value={calendarDraft.name} onChange={(event) => setCalendarDraft((current) => ({ ...current, name: event.target.value }))} /></label>
              <label>Timezone<input data-testid="operating-calendar-timezone" value={calendarDraft.timezone} onChange={(event) => setCalendarDraft((current) => ({ ...current, timezone: event.target.value }))} /></label>
              <label>Operating start<input data-testid="operating-calendar-start" type="time" value={minutesToTime(calendarDraft.maintenanceStartMinute)} onChange={(event) => setCalendarDraft((current) => ({ ...current, maintenanceStartMinute: timeToMinutes(event.target.value, current.maintenanceStartMinute) }))} /></label>
              <label>Operating end<input data-testid="operating-calendar-end" type="time" value={minutesToTime(calendarDraft.maintenanceEndMinute)} onChange={(event) => setCalendarDraft((current) => ({ ...current, maintenanceEndMinute: timeToMinutes(event.target.value, current.maintenanceEndMinute) }))} /></label>
              <label>Vendor lead days<input data-testid="operating-calendar-vendor-lead-days" type="number" min="0" max="60" value={calendarDraft.vendorLeadDays} onChange={(event) => setCalendarDraft((current) => ({ ...current, vendorLeadDays: Number(event.target.value) }))} /></label>
              <label>Daily unit limit<input data-testid="operating-calendar-daily-limit" type="number" min="1" max="50" value={calendarDraft.dailyScheduledUnitLimit ?? ""} placeholder="No cap" onChange={(event) => setCalendarDraft((current) => ({ ...current, dailyScheduledUnitLimit: event.target.value ? Number(event.target.value) : null }))} /></label>
              <label>Scope day<select data-testid="operating-calendar-scope-day" value={calendarDraft.scopeDay ?? ""} onChange={(event) => setCalendarDraft((current) => ({ ...current, scopeDay: event.target.value ? Number(event.target.value) : null }))}>{weekdayOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label>Work start day<select data-testid="operating-calendar-work-start-day" value={calendarDraft.workStartDay ?? ""} onChange={(event) => setCalendarDraft((current) => ({ ...current, workStartDay: event.target.value ? Number(event.target.value) : null }))}>{weekdayOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label className="toggle-row"><input data-testid="operating-calendar-no-weekends" type="checkbox" checked={calendarDraft.noWeekendScheduling} onChange={(event) => setCalendarDraft((current) => ({ ...current, noWeekendScheduling: event.target.checked }))} />No weekend scheduling</label>
              <label className="toggle-row"><input data-testid="operating-calendar-avoid-monday" type="checkbox" checked={calendarDraft.avoidMondayScheduling} onChange={(event) => setCalendarDraft((current) => ({ ...current, avoidMondayScheduling: event.target.checked }))} />Avoid Monday starts</label>
              <label className="toggle-row"><input data-testid="operating-calendar-avoid-friday" type="checkbox" checked={calendarDraft.avoidFridayScheduling} onChange={(event) => setCalendarDraft((current) => ({ ...current, avoidFridayScheduling: event.target.checked }))} />Avoid Friday starts</label>
              <label className="toggle-row"><input data-testid="operating-calendar-autopopulate" type="checkbox" checked={calendarDraft.autoPopulateEnabled} onChange={(event) => setCalendarDraft((current) => ({ ...current, autoPopulateEnabled: event.target.checked }))} />Allow future auto-populate rules</label>
              <label className="span-full">Notes<textarea data-testid="operating-calendar-notes" rows={3} value={calendarDraft.notes ?? ""} onChange={(event) => setCalendarDraft((current) => ({ ...current, notes: event.target.value || null }))} placeholder="Examples: vendors need three business days, scope Monday / execute Tuesday, spread more than two units across the week." /></label>
              <p className="helper-copy span-full">These rules are stored now for planning, calendar review, and future business-day date population. Current automations still require explicit review before changing schedule dates.</p>
              <button
                data-testid="operating-calendar-save"
                className="button button-primary span-full"
                disabled={loading || calendarDraft.maintenanceEndMinute <= calendarDraft.maintenanceStartMinute}
                onClick={() => void onUpdateOperatingCalendar(selectedProperty.id, calendarDraft)}
              >
                Save Operating Calendar
              </button>
            </div>
          )}
        </article>

        <article className="operations-card" data-testid="risk-policy-card">
          <div className="admin-section-head">
            <h3>Risk Policy</h3>
            <span className="subtitle">{selectedRiskPolicy?.customized ? "Customized thresholds" : "Default thresholds"}</span>
          </div>
          {!selectedProperty ? (
            <StatusState title="Choose a property" description="Select a property before editing risk thresholds." tone="subtle" />
          ) : (
            <div className="editor-block">
              <p className="helper-copy span-full">These thresholds control move-in risk, stale work, aging turns, vendor timing, checklist risk, and planned coverage. Risk category names stay stable for filters, dashboards, automations, and history.</p>
              <label>Critical move-in window<input data-testid="risk-policy-critical-days" type="number" min="0" max="30" value={riskDraft.moveInCriticalDays} onChange={(event) => updateRiskDraftNumber("moveInCriticalDays", event.target.value)} /></label>
              <label>High move-in window<input type="number" min="0" max="60" value={riskDraft.moveInHighDays} onChange={(event) => updateRiskDraftNumber("moveInHighDays", event.target.value)} /></label>
              <label>Medium move-in window<input type="number" min="0" max="90" value={riskDraft.moveInMediumDays} onChange={(event) => updateRiskDraftNumber("moveInMediumDays", event.target.value)} /></label>
              <label>Unassigned high-risk window<input type="number" min="0" max="90" value={riskDraft.unassignedHighDays} onChange={(event) => updateRiskDraftNumber("unassignedHighDays", event.target.value)} /></label>
              <label>Stale activity days<input type="number" min="1" max="90" value={riskDraft.staleActivityDays} onChange={(event) => updateRiskDraftNumber("staleActivityDays", event.target.value)} /></label>
              <label>Aging medium days<input type="number" min="1" max="365" value={riskDraft.agingMediumDays} onChange={(event) => updateRiskDraftNumber("agingMediumDays", event.target.value)} /></label>
              <label>Aging high days<input type="number" min="1" max="365" value={riskDraft.agingHighDays} onChange={(event) => updateRiskDraftNumber("agingHighDays", event.target.value)} /></label>
              <label>Vendor near move-in days<input type="number" min="0" max="90" value={riskDraft.vendorNearMoveInDays} onChange={(event) => updateRiskDraftNumber("vendorNearMoveInDays", event.target.value)} /></label>
              <label>Checklist near move-in days<input type="number" min="0" max="90" value={riskDraft.checklistNearMoveInDays} onChange={(event) => updateRiskDraftNumber("checklistNearMoveInDays", event.target.value)} /></label>
              <label>Planning near move-in days<input type="number" min="0" max="90" value={riskDraft.planningNearMoveInDays} onChange={(event) => updateRiskDraftNumber("planningNearMoveInDays", event.target.value)} /></label>
              <button
                data-testid="save-risk-policy"
                className="button button-primary span-full"
                disabled={loading}
                onClick={() => void onUpdateRiskPolicy(selectedProperty.id, riskDraft)}
              >
                Save Risk Policy
              </button>
            </div>
          )}
        </article>

        <article className="operations-card" data-testid="unit-management">
          <div className="admin-section-head">
            <h3>Units</h3>
            <span className="subtitle">{unitsForProperty.length} in selected property</span>
          </div>
          <label className="span-full unit-directory-target">
            Unit directory property
            <select
              data-testid="unit-directory-property"
              value={selectedPropertyId}
              onChange={(event) => {
                setSelectedPropertyId(event.target.value);
                setSelectedUnitId("");
                setLastImport(null);
              }}
              required
            >
              <option value="">Select property before importing</option>
              {properties.map((property) => <option key={property.id} value={property.id}>{property.code} - {property.name}</option>)}
            </select>
            <span className="helper-copy">The unit list, CSV preview, and import all use this selected property.</span>
          </label>
          <form className="compact-form" onSubmit={(event) => {
            event.preventDefault();
            void onCreateUnit({
              propertyId: newUnit.propertyId,
              number: newUnit.number,
              floorPlanId: newUnit.floorPlanId || null,
              floorPlan: newUnit.floorPlan || null,
              squareFeet: newUnit.squareFeet ? Number(newUnit.squareFeet) : null,
              bedrooms: newUnit.bedrooms ? Number(newUnit.bedrooms) : null,
              bathrooms: newUnit.bathrooms ? Number(newUnit.bathrooms) : null,
              occupancyStatus: newUnit.occupancyStatus,
              building: newUnit.building || null,
              area: newUnit.area || null,
              floor: newUnit.floor || null,
              isBudgeted: newUnit.isBudgeted,
            }).then(() => setNewUnit((current) => ({ ...current, number: "", floorPlanId: "", floorPlan: "", squareFeet: "", bedrooms: "", bathrooms: "", building: "", area: "", floor: "" })));
          }}>
            <select data-testid="unit-create-property" value={newUnit.propertyId} onChange={(event) => setNewUnit((current) => ({ ...current, propertyId: event.target.value }))} required>
              <option value="">Select property</option>
              {activeProperties.map((property) => <option key={property.id} value={property.id}>{property.code}</option>)}
            </select>
            <input data-testid="unit-create-number" placeholder="Unit number" value={newUnit.number} onChange={(event) => setNewUnit((current) => ({ ...current, number: event.target.value }))} required />
            <select data-testid="unit-create-floor-plan-managed" value={newUnit.floorPlanId} onChange={(event) => setNewUnit((current) => ({ ...current, floorPlanId: event.target.value }))}><option value="">Legacy/freeform</option>{floorPlansForNewUnit.map((plan) => <option key={plan.id} value={plan.id}>{floorPlanLabel(plan)}</option>)}</select>
            <input data-testid="unit-create-floor-plan" placeholder="Legacy floor plan text" value={newUnit.floorPlan} onChange={(event) => setNewUnit((current) => ({ ...current, floorPlan: event.target.value }))} />
            <input data-testid="unit-create-square-feet" type="number" min="1" placeholder="Sq ft" value={newUnit.squareFeet} onChange={(event) => setNewUnit((current) => ({ ...current, squareFeet: event.target.value }))} />
            <input data-testid="unit-create-building" placeholder="Building" value={newUnit.building} onChange={(event) => setNewUnit((current) => ({ ...current, building: event.target.value }))} />
            <input data-testid="unit-create-area" placeholder="Area" value={newUnit.area} onChange={(event) => setNewUnit((current) => ({ ...current, area: event.target.value }))} />
            <input data-testid="unit-create-floor" placeholder="Floor" value={newUnit.floor} onChange={(event) => setNewUnit((current) => ({ ...current, floor: event.target.value }))} />
            <select data-testid="unit-create-occupancy" value={newUnit.occupancyStatus} onChange={(event) => setNewUnit((current) => ({ ...current, occupancyStatus: event.target.value as Unit["occupancyStatus"] }))}>{occupancyOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
            <button data-testid="unit-create-submit" className="button button-primary" disabled={loading || !newUnit.propertyId}>Add Unit</button>
          </form>
          <div className="operations-mini-stats wrap">
            {occupancyOptions.map((option) => occupancyCounts[option.value] ? <span key={option.value}><strong>{occupancyCounts[option.value]}</strong> {option.label}</span> : null)}
          </div>
          <div className="record-list unit-list">
            {unitsForProperty.length === 0 ? <StatusState title="No units found" description="Add a unit to start a make-ready turn." tone="subtle" /> : unitsForProperty.map((unit) => (
              <button key={unit.id} type="button" data-testid={`unit-row-${unit.number.toLowerCase()}`} className={selectedUnitId === unit.id ? "record-row selected" : "record-row"} onClick={() => setSelectedUnitId(unit.id)}>
                <span><strong>{unit.number}</strong>{unit.building ? `Bldg ${unit.building} / ` : ""}{unit.floorPlanRecord ? floorPlanLabel(unit.floorPlanRecord) : unit.floorPlan || "No floor plan"} / {occupancyLabel(unit.occupancyStatus)}</span>
                <span className={unit.isActive ? "status-chip active" : "status-chip inactive"}>{unit.isActive ? "Active" : "Archived"}</span>
              </button>
            ))}
          </div>
          {selectedUnit ? (
            <div className="editor-block">
              <label>Property<select data-testid="unit-edit-property" value={unitDraft.propertyId} onChange={(event) => setUnitDraft((current) => ({ ...current, propertyId: event.target.value }))}>{activeProperties.map((property) => <option key={property.id} value={property.id}>{property.code}</option>)}</select></label>
              <label>Unit<input data-testid="unit-edit-number" value={unitDraft.number} onChange={(event) => setUnitDraft((current) => ({ ...current, number: event.target.value }))} /></label>
              <label>Managed floor plan<select data-testid="unit-edit-floor-plan-managed" value={unitDraft.floorPlanId} onChange={(event) => setUnitDraft((current) => ({ ...current, floorPlanId: event.target.value }))}><option value="">Legacy/freeform</option>{floorPlansForEditUnit.map((plan) => <option key={plan.id} value={plan.id}>{floorPlanLabel(plan)}</option>)}</select></label>
              <label>Legacy text<input data-testid="unit-edit-floor-plan" value={unitDraft.floorPlan} onChange={(event) => setUnitDraft((current) => ({ ...current, floorPlan: event.target.value }))} /></label>
              <label>Square feet<input data-testid="unit-edit-square-feet" type="number" value={unitDraft.squareFeet} onChange={(event) => setUnitDraft((current) => ({ ...current, squareFeet: event.target.value }))} /></label>
              <label>Building<input data-testid="unit-edit-building" value={unitDraft.building} onChange={(event) => setUnitDraft((current) => ({ ...current, building: event.target.value }))} /></label>
              <label>Area<input data-testid="unit-edit-area" value={unitDraft.area} onChange={(event) => setUnitDraft((current) => ({ ...current, area: event.target.value }))} /></label>
              <label>Floor<input data-testid="unit-edit-floor" value={unitDraft.floor} onChange={(event) => setUnitDraft((current) => ({ ...current, floor: event.target.value }))} /></label>
              <label>Occupancy<select data-testid="unit-edit-occupancy" value={unitDraft.occupancyStatus} onChange={(event) => setUnitDraft((current) => ({ ...current, occupancyStatus: event.target.value as Unit["occupancyStatus"] }))}>{occupancyOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <div className="admin-actions span-full">
                <button data-testid="unit-save" className="button button-primary" onClick={() => void onUpdateUnit(selectedUnit.id, { propertyId: unitDraft.propertyId, number: unitDraft.number, floorPlanId: unitDraft.floorPlanId || null, floorPlan: unitDraft.floorPlan || null, squareFeet: unitDraft.squareFeet ? Number(unitDraft.squareFeet) : null, bedrooms: unitDraft.bedrooms ? Number(unitDraft.bedrooms) : null, bathrooms: unitDraft.bathrooms ? Number(unitDraft.bathrooms) : null, occupancyStatus: unitDraft.occupancyStatus, building: unitDraft.building || null, area: unitDraft.area || null, floor: unitDraft.floor || null, isBudgeted: unitDraft.isBudgeted })}>Save</button>
                <button data-testid={selectedUnit.isActive ? "unit-archive" : "unit-restore"} className={selectedUnit.isActive ? "button button-danger" : "button button-secondary"} onClick={() => selectedUnit.isActive ? setConfirmTarget({ type: "unit", operation: "archive", record: selectedUnit }) : void onArchiveUnit(selectedUnit.id, true)}>{selectedUnit.isActive ? "Archive" : "Restore"}</button>
                {!selectedUnit.isActive ? <button data-testid="unit-delete" className="button button-danger" onClick={() => setConfirmTarget({ type: "unit", operation: "delete", record: selectedUnit })}>Delete</button> : null}
              </div>
            </div>
          ) : null}
          <div className="editor-block unit-import-block">
            <h4>Paste Availability CSV</h4>
            <p className="helper-copy">Use this for availability snapshots such as NTV, NTV leased, vacant leased, vacant ready, down, and model units. This updates unit occupancy and creates or updates active make-ready table rows for non-occupied availability records.</p>
            <div className="unit-import-actions">
              <input
                data-testid="availability-import-file"
                type="file"
                accept=".csv,.txt,.tsv,text/csv,text/tab-separated-values,text/plain"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (!file) return;
                  void file.text().then(setAvailabilityImportText).catch(() => setAvailabilityImportError("Could not read that file."));
                }}
              />
              <button type="button" className="button button-secondary" onClick={() => setAvailabilityImportText("unit,floorPlan,sqft,availabilityStatus,vacancyStatus,moveOutDate,vacatedDate,daysVacant,makeReadyDate,moveInDate,applicant,reportDate,dateApplied,building,area,floor\n081,B1,1186,Vacant Not Leased Not Ready,VACANT NOT LEASED NOT READY,,2026-05-04,19,2026-05-05,,,2026-06-07,,,,\n103,B1,1186,Vacant Not Leased Ready,VACANT NOT LEASED READY,,2026-04-30,24,2026-05-08,,,2026-06-07,,,,\n180,C1,1344,NTV Not Leased,NTV NOT LEASED,2026-05-30,,0,2026-06-02,2026-06-05,,2026-06-07,,,,\n190,C1,1344,Vacant Leased Not Ready,VACANT LEASED NOT READY,,2026-05-28,2,2026-06-01,2026-06-05,Future Applicant,2026-06-07,,,,")}>Load sample</button>
              <button type="button" className="button button-secondary" onClick={() => setShowAvailabilityImportHelp((current) => !current)}>Need to convert PDF/XLSX?</button>
              <button type="button" className="button button-secondary" disabled={!availabilityImportText.trim()} onClick={() => setAvailabilityImportText("")}>Clear</button>
            </div>
            {showAvailabilityImportHelp ? (
              <div className="unit-import-help" data-testid="availability-import-ai-help">
                <div className="admin-section-head">
                  <div>
                    <strong>AI conversion helper</strong>
                    <p className="helper-copy">Use this with an availability PDF/spreadsheet export to preserve statuses, dates, applicant names, and the report date.</p>
                  </div>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => void navigator.clipboard?.writeText(availabilityAiPrompt)}
                  >
                    Copy prompt
                  </button>
                </div>
                <textarea readOnly rows={12} value={availabilityAiPrompt} />
              </div>
            ) : null}
            <textarea data-testid="availability-import-csv" rows={5} value={availabilityImportText} onChange={(event) => setAvailabilityImportText(event.target.value)} placeholder={"unit,floorPlan,sqft,availabilityStatus,vacancyStatus,moveOutDate,vacatedDate,daysVacant,makeReadyDate,moveInDate,applicant,reportDate\n081,B1,1186,Vacant Not Leased Not Ready,VACANT NOT LEASED NOT READY,,2026-05-04,19,2026-05-05,,,2026-06-07"} />
            {availabilityImportPreview ? (
              <div className="unit-import-preview" data-testid="availability-import-preview">
                <span><strong>{selectedProperty?.code ?? "No property"}</strong> target</span>
                <span><strong>{availabilityImportPreview.rows}</strong> rows</span>
                <span><strong>{availabilityImportPreview.unitCreates}</strong> units new</span>
                <span><strong>{availabilityImportPreview.unitUpdates}</strong> units update</span>
                <span><strong>{availabilityImportPreview.turnCreates}</strong> turns new</span>
                <span><strong>{availabilityImportPreview.turnUpdates}</strong> turns update</span>
                <span><strong>{availabilityImportPreview.applicants}</strong> applicants</span>
                {Object.entries(availabilityImportPreview.statuses).map(([status, count]) => <span key={status}><strong>{count}</strong> {occupancyLabel(status)}</span>)}
              </div>
            ) : null}
            {availabilityImportPreview?.changes.length ? (
              <div className="admin-message warning" data-testid="availability-import-diff-preview">
                <strong>{availabilityImportPreview.changes.length}</strong> existing turns have report differences. Import will update provided report fields and keep omitted fields unchanged.
                <ul className="compact-list">
                  {availabilityImportPreview.changes.slice(0, 6).map((change) => (
                    <li key={change.unit}><strong>{change.unit}</strong>: {change.fields.slice(0, 3).join("; ")}{change.fields.length > 3 ? `; +${change.fields.length - 3} more` : ""}</li>
                  ))}
                  {availabilityImportPreview.changes.length > 6 ? <li>+{availabilityImportPreview.changes.length - 6} more changed units</li> : null}
                </ul>
              </div>
            ) : null}
            {availabilityImportParseError ? <p className="admin-message error">{availabilityImportParseError}</p> : null}
            {availabilityImportError ? <p className="admin-message error">{availabilityImportError}</p> : null}
            {lastAvailabilityImport ? (
              <div className="admin-message success" data-testid="availability-import-last-import">
                Last availability import to {lastAvailabilityImport.property.code}: {lastAvailabilityImport.summary.turnsCreated} turns created, {lastAvailabilityImport.summary.turnsUpdated} turns updated, {lastAvailabilityImport.summary.unitsCreated} units created, {lastAvailabilityImport.summary.unitsUpdated} units updated.
              </div>
            ) : null}
            <button data-testid="availability-import-submit" className="button button-primary" disabled={loading || !properties.length || !selectedPropertyId || !availabilityImportText.trim()} onClick={() => void importAvailabilityReport()}>Import Availability & Populate Board</button>
          </div>
          <div className="editor-block unit-import-block">
            <h4>Paste Unit Directory CSV</h4>
            <p className="helper-copy">Use this for permanent inventory only. It updates occupied/vacant directory status but does not create active make-ready table rows. For board population, use Availability CSV above.</p>
            <div className="unit-import-actions">
              <input
                data-testid="unit-import-file"
                type="file"
                accept=".csv,.txt,.tsv,text/csv,text/tab-separated-values,text/plain"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (!file) return;
                  void file.text().then(setUnitImportText).catch(() => setUnitImportError("Could not read that file."));
                }}
              />
              <button type="button" className="button button-secondary" onClick={() => setUnitImportText("unit,building,area,floor,floorPlan,beds,baths,sqft,occupancyStatus,budgeted\n101,1,North,1,A1,1,1,720,OCCUPIED,yes\n102,1,North,1,A1,1,1,720,NTV LEASED,yes")}>Load sample</button>
              <button type="button" className="button button-secondary" onClick={() => setShowImportHelp((current) => !current)}>Need to convert Excel/PDF?</button>
              <button type="button" className="button button-secondary" disabled={!unitImportText.trim()} onClick={() => setUnitImportText("")}>Clear</button>
            </div>
            {showImportHelp ? (
              <div className="unit-import-help" data-testid="unit-import-ai-help">
                <div className="admin-section-head">
                  <div>
                    <strong>AI conversion helper</strong>
                    <p className="helper-copy">Use this with a spreadsheet/PDF export when you need a MakeReadyOS-ready CSV.</p>
                  </div>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => void navigator.clipboard?.writeText(unitDirectoryAiPrompt)}
                  >
                    Copy prompt
                  </button>
                </div>
                <textarea readOnly rows={10} value={unitDirectoryAiPrompt} />
              </div>
            ) : null}
            <textarea data-testid="unit-import-csv" rows={5} value={unitImportText} onChange={(event) => setUnitImportText(event.target.value)} placeholder={"unit\tbuilding\tfloorPlan\tbeds\tbaths\tsqft\toccupancyStatus\n101\t1\tA1\t1\t1\t720\tOCCUPIED"} />
            {unitImportPreview ? (
              <div className="unit-import-preview" data-testid="unit-import-preview">
                <span><strong>{selectedProperty?.code ?? "No property"}</strong> target</span>
                <span><strong>{unitImportPreview.rows}</strong> rows</span>
                <span><strong>{unitImportPreview.creates}</strong> new</span>
                <span><strong>{unitImportPreview.updates}</strong> updates</span>
                <span><strong>{unitImportPreview.budgeted}</strong> budgeted</span>
                {Object.entries(unitImportPreview.statuses).map(([status, count]) => <span key={status}><strong>{count}</strong> {occupancyLabel(status)}</span>)}
              </div>
            ) : null}
            {unitImportParseError ? <p className="admin-message error">{unitImportParseError}</p> : null}
            {unitImportError ? <p className="admin-message error">{unitImportError}</p> : null}
            {lastImport ? (
              <div className="admin-message warning" data-testid="unit-import-last-import">
                Last import to {lastImport.property.code}: {lastImport.summary.created} created, {lastImport.summary.updated} updated, {lastImport.summary.skipped} skipped, {lastImport.summary.floorPlansCreated ?? 0} floor plans created, {lastImport.summary.floorPlansUpdated ?? 0} floor plans updated.
                {lastImport.createdUnitIds.length > 0 ? (
                  <button type="button" className="button button-danger" disabled={loading} onClick={() => void revertLastUnitImport()}>
                    Undo created units
                  </button>
                ) : <span> No created units to undo.</span>}
              </div>
            ) : null}
            <button data-testid="unit-import-submit" className="button button-secondary" disabled={loading || !properties.length || !selectedPropertyId || !unitImportText.trim()} onClick={() => void importUnitDirectory()}>Import / Update Directory</button>
          </div>
        </article>
      </section>

      <section className="operations-grid turns-grid">
        <article className="operations-card" data-testid="turn-create-panel">
          <div className="admin-section-head">
            <h3>New Make-Ready Item</h3>
            <span className="subtitle">Create a turnover from an active unit</span>
          </div>
          <div className="turn-form">
            <label>Property<select data-testid="item-create-property" value={newItem.propertyId} onChange={(event) => setNewItem((current) => ({ ...current, propertyId: event.target.value, unitId: "" }))}>{activeProperties.map((property) => <option key={property.id} value={property.id}>{property.code} - {property.name}</option>)}</select></label>
            <label>Unit<select data-testid="item-create-unit" value={newItem.unitId} onChange={(event) => chooseItemUnit(event.target.value)}><option value="">Select unit</option>{activeUnitsForItem.map((unit) => <option key={unit.id} value={unit.id}>{unit.number} - {unit.floorPlanRecord ? floorPlanLabel(unit.floorPlanRecord) : unit.floorPlan || "No floor plan"}</option>)}</select></label>
            <label>Section<select data-testid="item-create-group" value={newItem.boardGroup} onChange={(event) => setNewItem((current) => ({ ...current, boardGroup: event.target.value }))}>{sectionsForNewItem.map((section) => <option key={section.id} value={section.key}>{section.displayName}</option>)}</select></label>
            <label>Vacancy<select data-testid="item-create-vacancy" value={newItem.vacancyStatus} onChange={(event) => setNewItem((current) => ({ ...current, vacancyStatus: event.target.value }))}>{labelOptions("vacancyStatus").map((option) => <option key={option.id} value={option.value}>{option.value}</option>)}</select></label>
            <label>Make-ready status<select data-testid="item-create-status" value={newItem.makeReadyStatus} onChange={(event) => setNewItem((current) => ({ ...current, makeReadyStatus: event.target.value }))}><option value="">Unset</option>{labelOptions("makeReadyStatus").map((option) => <option key={option.id} value={option.value}>{option.value}</option>)}</select></label>
            <label>Scope<select data-testid="item-create-scope" value={newItem.scopeLevel} onChange={(event) => setNewItem((current) => ({ ...current, scopeLevel: event.target.value }))}><option value="">Unset</option>{labelOptions("scopeLevel").map((option) => <option key={option.id} value={option.value}>{option.value}</option>)}</select></label>
            <label>Assigned tech<select data-testid="item-create-assigned-tech" value={newItem.assignedTech} onChange={(event) => setNewItem((current) => ({ ...current, assignedTech: event.target.value }))}><option value="">Unassigned</option>{staff.map((person) => <option key={person.id} value={person.fullName}>{person.fullName} - {person.role}</option>)}</select></label>
            <label>Make-ready date<input data-testid="item-create-make-ready-date" type="date" value={newItem.makeReadyDate} onChange={(event) => setNewItem((current) => ({ ...current, makeReadyDate: event.target.value }))} /></label>
            <label>Move-in date<input data-testid="item-create-move-in-date" type="date" value={newItem.moveInDate} onChange={(event) => setNewItem((current) => ({ ...current, moveInDate: event.target.value }))} /></label>
            <button data-testid="item-create-submit" className="button button-primary span-full" disabled={loading || !newItem.unitId} onClick={() => void createItem()}>Create Make-Ready Item</button>
          </div>
        </article>

        <article className="operations-card" data-testid="turn-lifecycle-panel">
          <div className="admin-section-head">
            <div>
              <h3>Archive / Occupied Units</h3>
              <p className="helper-copy">Each make-ready item is one turn. Archive completed turns after move-in while keeping unit-level history, photos, comments, vendors, checklists, risk, and activity available for lookup.</p>
            </div>
            <div className="archive-history-controls">
              <input
                data-testid="turn-history-search"
                value={turnHistorySearch}
                onChange={(event) => setTurnHistorySearch(event.target.value)}
                placeholder="Search unit, applicant, tech"
              />
              <label className="toolbar-select">
                <span className="sr-only">Turn archive mode</span>
                <select data-testid="item-archive-mode" value={turnArchiveMode} onChange={(event) => setTurnArchiveMode(event.target.value as ArchiveFilter)}>
                  <option value="active">Active turns</option>
                  <option value="archived">Archive only</option>
                  <option value="occupied">Occupied</option>
                  <option value="all">Active + archive</option>
                </select>
              </label>
            </div>
          </div>
          <div className="operations-mini-stats wrap">
            <span><strong>{activeTurns.length}</strong> active turns</span>
            <span><strong>{archivedTurns.length}</strong> archived turns</span>
            <span><strong>{occupiedCount}</strong> occupied directory units</span>
            <span><strong>{visibleHistoryCount}</strong> shown</span>
          </div>
          <div className="turn-list">
            {turnArchiveMode === "occupied" ? (
              occupiedDirectoryRows.length === 0 ? (
                <StatusState title="No occupied directory units" description="Import a unit directory with occupied units, or switch modes to review active and archived make-ready turns." tone="subtle" />
              ) : occupiedDirectoryRows.slice(0, 80).map((unit) => {
                const turnCount = turnsByUnit.get(`${unit.propertyId}|${unit.id}`) ?? turnsByUnit.get(`${unit.propertyId}|${unit.number}`) ?? 0;
                return (
                  <div className="turn-row" data-testid={`occupied-unit-row-${unit.number.toLowerCase()}`} key={unit.id}>
                    <div>
                      <strong>{unit.property.code} {unit.number}</strong>
                      <span>{unit.property.name} / {unit.floorPlanRecord ? floorPlanLabel(unit.floorPlanRecord) : unit.floorPlan || "No floor plan"} / {turnCount} prior turn(s)</span>
                      <small>{unit.building ? `Building ${unit.building}` : "No building"} / {unit.area || "No area"} / {unit.floor ? `Floor ${unit.floor}` : "No floor"} / {unit.isBudgeted ? "Budgeted" : "Non-budgeted"}</small>
                    </div>
                    <span className="status-chip active">Occupied</span>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => {
                        setSelectedPropertyId(unit.propertyId);
                        setSelectedUnitId(unit.id);
                      }}
                    >
                      Edit unit
                    </button>
                    <button
                      type="button"
                      className="button button-primary"
                      onClick={() => {
                        setNewItem((current) => ({
                          ...current,
                          propertyId: unit.propertyId,
                          unitId: unit.id,
                          itemName: unit.number,
                          unitNumber: unit.number,
                          floorPlan: unit.floorPlan,
                        }));
                      }}
                    >
                      Start turn
                    </button>
                  </div>
                );
              })
            ) : visibleItems.length === 0 ? <StatusState title="No turnover records" description="Create a make-ready item or switch to Occupied to review imported occupied directory units." tone="subtle" /> : visibleItems.slice(0, 40).map((item) => (
              <div className="turn-row" data-testid={`turn-row-${item.unitNumber.toLowerCase()}`} key={item.id}>
                <div>
                  <strong>{item.unitNumber}</strong>
                  <span>{item.property.code} / {displayGroup(item.boardGroup)} / {turnsByUnit.get(`${item.propertyId}|${item.unitId ?? item.unitNumber}`) ?? 1} turn(s)</span>
                  <small>{item.vacatedDate ? `Vacated ${item.vacatedDate.slice(0, 10)}` : "No vacated date"} / {item.moveInDate ? `Move-in ${item.moveInDate.slice(0, 10)}` : "No move-in date"}</small>
                </div>
                <span className={item.isArchived ? "status-chip inactive" : "status-chip active"}>{item.isArchived ? "Archived" : item.makeReadyStatus || "Active"}</span>
                <button type="button" className="button button-secondary" onClick={() => onOpenItem(item.id)}>Details</button>
                <button data-testid={`${item.isArchived ? "item-restore" : "item-archive"}-${item.unitNumber.toLowerCase()}`} className={item.isArchived ? "button button-secondary" : "button button-danger"} onClick={() => item.isArchived ? void onArchiveItem(item.id, true) : setConfirmTarget({ type: "item", operation: "archive", record: item })}>
                  {item.isArchived ? "Restore" : "Archive"}
                </button>
              </div>
            ))}
          </div>
        </article>
      </section>

      <ConfirmDialog
        open={Boolean(confirmTarget)}
        title={`${confirmTarget?.operation === "delete" ? "Delete" : "Archive"} ${confirmTarget?.type ?? "record"}`}
        description={confirmTarget?.operation === "delete" ? "Deletion is permitted only when no linked operational history remains. This action cannot be undone." : "This hides the record from active workflows without deleting its history. It can be restored later."}
        confirmLabel={confirmTarget?.operation === "delete" ? "Delete" : "Archive"}
        tone="danger"
        onClose={() => setConfirmTarget(null)}
        onConfirm={async () => {
          if (!confirmTarget) return;
          if (confirmTarget.type === "property" && confirmTarget.operation === "delete") await onDeleteProperty(confirmTarget.record.id);
          else if (confirmTarget.type === "property") await onArchiveProperty(confirmTarget.record.id, false);
          if (confirmTarget.type === "unit" && confirmTarget.operation === "delete") await onDeleteUnit(confirmTarget.record.id);
          else if (confirmTarget.type === "unit") await onArchiveUnit(confirmTarget.record.id, false);
          if (confirmTarget.type === "item") await onArchiveItem(confirmTarget.record.id, false);
          setConfirmTarget(null);
        }}
      />
    </div>
  );
}
