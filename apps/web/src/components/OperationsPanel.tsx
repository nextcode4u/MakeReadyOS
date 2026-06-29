import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getUnitHistory, isApiError, type AvailabilityImportConflict, type AvailabilityImportConflictResponse, type AvailabilityImportInput, type AvailabilityImportResult, type BoardSection, type FloorPlan, type LabelDefinition, type MakeReadyItem, type OperatingCalendar, type OperatingCalendarInput, type Property, type RiskPolicy, type StaffOption, type Unit, type UserRole } from "../lib/api";
import type { ArchiveFilter } from "../lib/structuredFilters";
import { ConfirmDialog } from "./ConfirmDialog";
import { SearchSelect, type SearchSelectOption } from "./SearchSelect";
import { StatusState } from "./StatusState";
import { UnitSearchSelect } from "./UnitSearchSelect";

function floorPlanLabel(plan: Pick<FloorPlan, "code" | "name">) {
  return plan.name && plan.name !== plan.code ? `${plan.code} - ${plan.name}` : plan.code;
}

type Props = {
  language: "en" | "es";
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
  onImportAvailability: (input: { propertyId: string; rows: AvailabilityImportInput[]; updateExisting: boolean; createTurns: boolean; overrideConflicts?: boolean }) => Promise<AvailabilityImportResult>;
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

type TurnHistoryDateField = "vacatedDate" | "makeReadyDate" | "moveInDate" | "archivedAt" | "updatedAt";

function displayGroup(group: string) {
  return group.replace(/_/g, " ");
}

function normalizeDateOnly(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 10);
}

function turnHistoryDateValue(item: MakeReadyItem, field: TurnHistoryDateField) {
  return normalizeDateOnly(item[field]);
}

function turnInspectionStage(item: MakeReadyItem) {
  return item.makeReadyStatus || item.completionStatus || item.boardGroup || "";
}

function occupancyOptionsFor(language: "en" | "es"): Array<{ value: Unit["occupancyStatus"]; label: string }> {
  return language === "es"
    ? [
        { value: "OCCUPIED", label: "Ocupada" },
        { value: "VACANT NOT LEASED READY", label: "Vacante no rentada lista" },
        { value: "VACANT NOT LEASED NOT READY", label: "Vacante no rentada no lista" },
        { value: "NTV NOT LEASED", label: "NTV no rentada" },
        { value: "NTV LEASED", label: "NTV rentada" },
        { value: "VACANT LEASED READY", label: "Vacante rentada lista" },
        { value: "VACANT LEASED NOT READY", label: "Vacante rentada no lista" },
        { value: "DOWN", label: "Fuera de servicio" },
        { value: "TO PRE-WALK", label: "Para pre-recorrido" },
        { value: "TO SCOPE", label: "Para alcance" },
        { value: "TO FINAL WALK", label: "Para recorrido final" },
        { value: "MODEL", label: "Modelo" },
        { value: "UNKNOWN", label: "Desconocido" },
      ]
    : [
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
}

function occupancyLabel(value: string | null | undefined, language: "en" | "es") {
  return occupancyOptionsFor(language).find((option) => option.value === value)?.label ?? value?.replace(/_/g, " ").toLowerCase() ?? (language === "es" ? "Desconocido" : "Unknown");
}

function compareUnitLike(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
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

const availabilityImportSamples = {
  standard: "unit,floorPlan,sqft,availabilityStatus,vacancyStatus,moveOutDate,vacatedDate,daysVacant,makeReadyDate,moveInDate,applicant,reportDate,dateApplied,building,area,floor\n081,B1,1186,Vacant Not Leased Not Ready,VACANT NOT LEASED NOT READY,,2026-05-04,19,2026-05-05,,,2026-06-07,,,,\n103,B1,1186,Vacant Not Leased Ready,VACANT NOT LEASED READY,,2026-04-30,24,2026-05-08,,,2026-06-07,,,,\n180,C1,1344,NTV Not Leased,NTV NOT LEASED,2026-05-30,,0,2026-06-02,2026-06-05,,2026-06-07,,,,\n190,C1,1344,Vacant Leased Not Ready,VACANT LEASED NOT READY,,2026-05-28,2,2026-06-01,2026-06-05,Future Applicant,2026-06-07,,,,",
  realpage: "bldgUnit,plan,sqft,availabilityStatus,MoveOut,Days Vacant,Make Ready,Scheduled Move-In,Preleased Name,Date Applied,Report Date\n12-081,B1,1186,Vacant Not Leased Not Ready,05/04/2026,19,05/05/2026,,,06/07/2026\n12-103,B1,1186,Vacant Not Leased Ready,04/30/2026,24,05/08/2026,,,06/07/2026\n14-180,C1,1344,NTV Not Leased,05/30/2026,0,06/02/2026,06/05/2026,,06/07/2026\n14-190,C1,1344,Vacant Leased Not Ready,05/28/2026,2,06/01/2026,06/05/2026,Future Applicant,05/27/2026,06/07/2026",
  yardi: "Unit #,Unit Type,Sq Ft,Avail Status,Vacate,Days Vacant,Ready Dt,Future Resident,Apply Date,As Of Date\n081,B1,1186,Vacant Not Leased Not Ready,05/04/2026,19,05/05/2026,,05/01/2026,06/07/2026\n103,B1,1186,Vacant Not Leased Ready,04/30/2026,24,05/08/2026,,04/28/2026,06/07/2026\n180,C1,1344,NTV Not Leased,05/30/2026,0,06/02/2026,,05/29/2026,06/07/2026\n190,C1,1344,Vacant Leased Not Ready,05/28/2026,2,06/01/2026,Future Applicant,05/27/2026,06/07/2026",
  mri: "Unit Code,Plan Code,Sq Ft,Status,Notice Date,Ready Date,Future Resident,Apply Date,Snapshot Date,Building\n081,B1,1186,Vacant Not Leased Not Ready,05/04/2026,05/05/2026,,05/01/2026,06/07/2026,12\n103,B1,1186,Vacant Not Leased Ready,04/30/2026,05/08/2026,,04/28/2026,06/07/2026,12\n180,C1,1344,NTV Not Leased,05/30/2026,06/02/2026,,05/29/2026,06/07/2026,14\n190,C1,1344,Vacant Leased Not Ready,05/28/2026,06/01/2026,Future Applicant,05/27/2026,06/07/2026,14",
  compact: "unit,availabilityStatus,MoveOut,Days Vacant,Report Date\n081,Vacant Not Leased Not Ready,05/04/2026,19,06/07/2026\n103,Vacant Not Leased Ready,04/30/2026,24,06/07/2026\n180,NTV Not Leased,05/30/2026,0,06/07/2026",
} as const;

const unitDirectoryImportSamples = {
  standard: "unit,building,area,floor,floorPlan,beds,baths,sqft,occupancyStatus,budgeted\n101,1,North,1,A1,1,1,720,OCCUPIED,yes\n102,1,North,1,A1,1,1,720,NTV LEASED,yes",
  combined: "buildingUnit,floorPlan,beds,baths,sqft,occupancyStatus,budgeted\n1-101,A1,1,1,720,OCCUPIED,yes\n1-102,A1,1,1,720,NTV LEASED,yes\n2-260,B2,2,2,1040,VACANT NOT LEASED READY,yes",
  yardi: "Unit #,Building,Floor,Unit Type,Bedrooms,Bathrooms,Sq Ft,Status,Occupancy Eligible\n101,1,1,A1,1,1,720,Occupied,Yes\n102,1,1,A1,1,1,720,NTV Leased,Yes\n260,2,2,B2,2,2,1040,Vacant Not Leased Ready,Yes\nOffice,,,Office,0,0,0,Occupied,No",
  mri: "Unit Code,Building,Floor,Plan Code,Bedrooms,Bathrooms,Sq Ft,Status,Occupancy Eligible\n101,1,1,A1,1,1,720,Occupied,Yes\n102,1,1,A1,1,1,720,NTV Leased,Yes\n260,2,2,B2,2,2,1040,Vacant Not Leased Ready,Yes\nOffice,,,Office,0,0,0,Occupied,No",
  sparse: "unit,floorPlan,sqft,occupancyStatus\n101,A1,720,OCCUPIED\n102,A1,720,NTV LEASED\n260,B2,1040,VACANT NOT LEASED READY",
} as const;

function detectDelimitedInput(line: string): "," | "\t" | ";" {
  if (line.includes("\t")) return "\t";
  const commaCount = (line.match(/,/g) ?? []).length;
  const semicolonCount = (line.match(/;/g) ?? []).length;
  if (semicolonCount > commaCount) return ";";
  return ",";
}

function splitDelimitedLine(line: string, delimiter: "," | "\t" | ";") {
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

function isReadyLikeOccupancy(value: string | null | undefined) {
  const raw = String(value ?? "").toUpperCase();
  return raw.includes("READY") && !raw.includes("NOT READY");
}

function isMeaningfulDaysVacantDifference(currentValue: number | null | undefined, importedValue: number | null | undefined) {
  if (importedValue === undefined || importedValue === null) return false;
  return Math.abs(Number(importedValue) - Number(currentValue ?? 0)) > 1;
}

function isDoneLikeMakeReadyStatus(value: string | null | undefined) {
  const raw = String(value ?? "").trim().toUpperCase();
  return raw === "DONE" || raw === "YES" || raw === "GOOD";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not set";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
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

function normalizeImportedDate(value: string | null | undefined) {
  const normalized = normalizePreviewDate(value);
  return normalized || undefined;
}

function splitCombinedBuildingUnit(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return { building: "", unit: "" };
  }
  const match = trimmed.match(/^(.+?)(?:\s*[-/]\s*|\s+)([A-Z0-9]+)$/i);
  if (!match) {
    return { building: "", unit: trimmed };
  }
  const [, building, unit] = match;
  if (!building || !unit) {
    return { building: "", unit: trimmed };
  }
  return {
    building: building.trim(),
    unit: unit.trim(),
  };
}

function hasImportedValue(value: unknown) {
  return value !== undefined && value !== null && `${value}`.trim() !== "";
}

function mergeAvailabilityContinuationRows(
  rows: string[],
  delimiter: "," | "\t" | ";",
  headers: string[],
) {
  const unitIndex = headers.findIndex((header) => ["unit", "unitid", "number", "unitnumber", "apartment", "apartmentnumber", "bldgunit", "bldgapt", "bldgunitnumber"].includes(header));
  const applicantIndex = headers.findIndex((header) => [
    "applicant", "applicantname", "futureapplicant", "futureapplicantname", "preleased", "prelease", "preleasedname",
    "preleasedapplicant", "preleasedapplicantname", "preleasename", "leasedto", "leasename", "futuretenant",
    "futuretenantname", "prospect", "prospectname", "scheduledresident", "scheduledresidentname", "scheduledapplicant",
    "scheduledapplicantname", "resident", "name",
  ].includes(header));
  if (unitIndex < 0 || applicantIndex < 0) return rows;
  const merged: string[][] = [];
  for (const row of rows) {
    const cells = splitDelimitedLine(row, delimiter);
    const unitValue = cells[unitIndex]?.trim() ?? "";
    if (!unitValue && merged.length > 0) {
      const nonEmptyIndexes = cells.reduce<number[]>((acc, cell, index) => {
        if (cell.trim()) acc.push(index);
        return acc;
      }, []);
      const applicantValue = cells[applicantIndex]?.trim() ?? "";
      const applicantOnlyContinuation = applicantValue && nonEmptyIndexes.every((index) => index === applicantIndex);
      if (applicantOnlyContinuation) {
        const previous = merged[merged.length - 1];
        const existingApplicant = previous[applicantIndex]?.trim() ?? "";
        previous[applicantIndex] = existingApplicant ? `${existingApplicant} ${applicantValue}` : applicantValue;
        continue;
      }
    }
    merged.push(cells);
  }
  return merged.map((cells) => cells.join(delimiter));
}

function looksLikeAvailabilityNoiseRow(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return [
    "amenity",
    "amenities",
    "comment",
    "comments",
    "hold",
    "holds",
    "vacant",
    "leased",
    "preleased",
    "pre-leased",
    "notice",
    "ntv",
    "down",
    "model",
    "ready",
    "not ready",
    "garage",
    "carport",
    "storage",
    "patio",
    "balcony",
    "washer",
    "dryer",
    "fireplace",
  ].some((token) => normalized.includes(token));
}

function looksLikeUnitDirectoryNoiseRow(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return [
    "occupancy summary",
    "occupancy",
    "summary",
    "total units",
    "unit count",
    "available units",
    "vacant units",
    "occupied units",
    "model units",
    "down units",
    "amenity",
    "amenities",
    "floor plan summary",
    "unit type summary",
    "building summary",
    "phase summary",
    "property summary",
    "sq ft summary",
    "square footage summary",
  ].some((token) => normalized.includes(token));
}

function prepareUnitDirectoryImportRows(
  rows: string[],
  delimiter: "," | "\t" | ";",
  headers: string[],
) {
  const unitIndex = headers.findIndex((header) => ["unit", "unitid", "number", "unitnumber", "unitno", "unitnum", "unit#", "apartment", "apt", "aptno", "aptnumber", "apartmentnumber", "bldgunit", "bldgapt", "bldgunitnumber", "buildingunit", "buildingandunit", "bldgunitno"].includes(header));
  const preparedRows: string[] = [];
  const ignoredRows: string[] = [];
  for (const row of rows) {
    const cells = splitDelimitedLine(row, delimiter);
    const unitValue = unitIndex >= 0 ? (cells[unitIndex]?.trim() ?? "") : "";
    if (unitValue) {
      preparedRows.push(row);
      continue;
    }
    const nonEmptyCells = cells.map((cell) => cell.trim()).filter(Boolean);
    if (nonEmptyCells.length === 1 && looksLikeUnitDirectoryNoiseRow(nonEmptyCells[0])) {
      ignoredRows.push(nonEmptyCells[0]);
      continue;
    }
    preparedRows.push(row);
  }
  return { preparedRows, ignoredRows };
}

function prepareAvailabilityImportRows(
  rows: string[],
  delimiter: "," | "\t" | ";",
  headers: string[],
) {
  const mergedRows = mergeAvailabilityContinuationRows(rows, delimiter, headers);
  const unitIndex = headers.findIndex((header) => ["unit", "unitid", "number", "unitnumber", "apartment", "apartmentnumber", "bldgunit", "bldgapt", "bldgunitnumber"].includes(header));
  const preparedRows: string[] = [];
  const ignoredRows: string[] = [];
  for (const row of mergedRows) {
    const cells = splitDelimitedLine(row, delimiter);
    const unitValue = cells[unitIndex]?.trim() ?? "";
    if (unitValue) {
      preparedRows.push(row);
      continue;
    }
    const nonEmptyCells = cells.map((cell) => cell.trim()).filter(Boolean);
    if (nonEmptyCells.length === 1 && looksLikeAvailabilityNoiseRow(nonEmptyCells[0])) {
      ignoredRows.push(nonEmptyCells[0]);
      continue;
    }
    preparedRows.push(row);
  }
  return { preparedRows, ignoredRows };
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
  language,
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
  const isSpanish = language === "es";
  const occupancyOptions = useMemo(() => occupancyOptionsFor(language), [language]);
  const activeProperties = properties.filter((property) => property.isActive);
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [turnArchiveMode, setTurnArchiveMode] = useState<ArchiveFilter>("active");
  const [turnHistorySearch, setTurnHistorySearch] = useState("");
  const [turnHistoryUnitFilter, setTurnHistoryUnitFilter] = useState("");
  const [turnHistoryApplicantFilter, setTurnHistoryApplicantFilter] = useState("");
  const [turnHistoryReasonFilter, setTurnHistoryReasonFilter] = useState("");
  const [turnHistoryStageFilter, setTurnHistoryStageFilter] = useState("");
  const [turnHistoryDateField, setTurnHistoryDateField] = useState<TurnHistoryDateField>("vacatedDate");
  const [turnHistoryDateStart, setTurnHistoryDateStart] = useState("");
  const [turnHistoryDateEnd, setTurnHistoryDateEnd] = useState("");
  const [historyInspectorUnitId, setHistoryInspectorUnitId] = useState("");
  const [occupiedReconciliationBusy, setOccupiedReconciliationBusy] = useState(false);
  const [occupiedReconciliationMessage, setOccupiedReconciliationMessage] = useState("");
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
  const [availabilityImportConflicts, setAvailabilityImportConflicts] = useState<AvailabilityImportConflict[] | null>(null);
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
  const archivedProperties = properties.filter((property) => !property.isActive);
  const activeUnitsForProperty = unitsForProperty.filter((unit) => unit.isActive);
  const archivedUnitsForProperty = unitsForProperty.filter((unit) => !unit.isActive);
  const selectedUnit = units.find((unit) => unit.id === selectedUnitId) ?? null;
  const historyUnitsForProperty = useMemo(
    () => units
      .filter((unit) => !selectedPropertyId || unit.propertyId === selectedPropertyId)
      .sort((left, right) => left.number.localeCompare(right.number, undefined, { numeric: true })),
    [selectedPropertyId, units],
  );
  const historyInspectorUnit = historyUnitsForProperty.find((unit) => unit.id === historyInspectorUnitId) ?? null;
  const activeUnitsForItem = units.filter((unit) => unit.propertyId === newItem.propertyId && unit.isActive);
  const staffOptions = useMemo<SearchSelectOption[]>(() => staff.map((person) => ({
    value: person.fullName,
    label: `${person.fullName} - ${person.role}`,
    keywords: [person.fullName, person.role],
  })), [staff]);
  const sectionsForNewItem = boardSections
    .filter((section) => section.propertyId === newItem.propertyId && section.isActive && section.sectionType !== "ARCHIVE")
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const floorPlansForNewUnit = floorPlans.filter((plan) => plan.propertyId === newUnit.propertyId && plan.isActive);
  const floorPlansForEditUnit = floorPlans.filter((plan) => plan.propertyId === unitDraft.propertyId && plan.isActive);
  const labelOptions = (key: string) => labels.filter((label) => label.fieldKey === key && !label.isArchived);
  const existingActiveTurnsByUnitId = useMemo(
    () => new Map(
      items
        .filter((item) => !item.isArchived && item.unitId)
        .map((item) => [item.unitId as string, item]),
    ),
    [items],
  );
  const newItemActiveTurn = newItem.unitId ? existingActiveTurnsByUnitId.get(newItem.unitId) ?? null : null;

  const turnReasonOptions = useMemo(
    () => Array.from(new Set(
      items
        .filter((item) => !selectedPropertyId || item.propertyId === selectedPropertyId)
        .map((item) => item.vacancyStatus?.trim())
        .filter((value): value is string => Boolean(value)),
    )).sort((left, right) => left.localeCompare(right)),
    [items, selectedPropertyId],
  );
  const turnStageOptions = useMemo(
    () => Array.from(new Set(
      items
        .filter((item) => !selectedPropertyId || item.propertyId === selectedPropertyId)
        .map((item) => turnInspectionStage(item).trim())
        .filter(Boolean),
    )).sort((left, right) => left.localeCompare(right)),
    [items, selectedPropertyId],
  );

  useEffect(() => {
    if (selectedUnitId && !units.some((unit) => unit.id === selectedUnitId && unit.propertyId === selectedPropertyId)) {
      setSelectedUnitId("");
    }
  }, [selectedPropertyId, selectedUnitId, units]);

  useEffect(() => {
    if (historyInspectorUnitId && !historyUnitsForProperty.some((unit) => unit.id === historyInspectorUnitId)) {
      setHistoryInspectorUnitId("");
    }
  }, [historyInspectorUnitId, historyUnitsForProperty]);

  useEffect(() => {
    if (!historyInspectorUnitId && selectedUnitId && historyUnitsForProperty.some((unit) => unit.id === selectedUnitId)) {
      setHistoryInspectorUnitId(selectedUnitId);
    }
  }, [historyInspectorUnitId, historyUnitsForProperty, selectedUnitId]);

  useEffect(() => {
    setAvailabilityImportConflicts(null);
    setAvailabilityImportError("");
  }, [availabilityImportText, selectedPropertyId]);
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
      })
      .filter((item) => {
        if (!turnHistoryUnitFilter) return true;
        return item.unitId === turnHistoryUnitFilter || item.unitNumber === turnHistoryUnitFilter;
      })
      .filter((item) => {
        const applicantQuery = turnHistoryApplicantFilter.trim().toLowerCase();
        if (!applicantQuery) return true;
        return String(item.applicant ?? "").toLowerCase().includes(applicantQuery);
      })
      .filter((item) => !turnHistoryReasonFilter || (item.vacancyStatus ?? "") === turnHistoryReasonFilter)
      .filter((item) => !turnHistoryStageFilter || turnInspectionStage(item) === turnHistoryStageFilter)
      .filter((item) => {
        if (!turnHistoryDateStart && !turnHistoryDateEnd) return true;
        const dateValue = turnHistoryDateValue(item, turnHistoryDateField);
        if (!dateValue) return false;
        if (turnHistoryDateStart && dateValue < turnHistoryDateStart) return false;
        if (turnHistoryDateEnd && dateValue > turnHistoryDateEnd) return false;
        return true;
      }),
    [
      items,
      selectedPropertyId,
      turnArchiveMode,
      turnHistorySearch,
      turnHistoryUnitFilter,
      turnHistoryApplicantFilter,
      turnHistoryReasonFilter,
      turnHistoryStageFilter,
      turnHistoryDateField,
      turnHistoryDateStart,
      turnHistoryDateEnd,
    ],
  );
  const occupiedDirectoryRows = useMemo(() => {
    if (turnArchiveMode !== "occupied") return [];
    const query = turnHistorySearch.trim().toLowerCase();
    return units
      .filter((unit) => (!selectedPropertyId || unit.propertyId === selectedPropertyId) && unit.occupancyStatus === "OCCUPIED")
      .filter((unit) => {
        if (!turnHistoryUnitFilter) return true;
        return unit.id === turnHistoryUnitFilter || unit.number === turnHistoryUnitFilter;
      })
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
  }, [selectedPropertyId, turnArchiveMode, turnHistorySearch, turnHistoryUnitFilter, units]);
  const turnsByUnit = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      const key = `${item.propertyId}|${item.unitId ?? item.unitNumber}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [items]);
  const occupiedTurnConflicts = useMemo(
    () => occupiedDirectoryRows
      .map((unit) => {
        const activeTurn = existingActiveTurnsByUnitId.get(unit.id) ?? null;
        if (!activeTurn) return null;
        const turnCount = turnsByUnit.get(`${unit.propertyId}|${unit.id}`) ?? turnsByUnit.get(`${unit.propertyId}|${unit.number}`) ?? 0;
        return { unit, activeTurn, turnCount };
      })
      .filter((entry): entry is { unit: Unit; activeTurn: MakeReadyItem; turnCount: number } => Boolean(entry)),
    [existingActiveTurnsByUnitId, occupiedDirectoryRows, turnsByUnit],
  );
  const visibleHistoryCount = turnArchiveMode === "occupied" ? occupiedDirectoryRows.length : visibleItems.length;
  const hasTurnHistoryFilters = Boolean(
    turnHistoryUnitFilter
    || turnHistoryApplicantFilter.trim()
    || turnHistoryReasonFilter
    || turnHistoryStageFilter
    || turnHistoryDateStart
    || turnHistoryDateEnd,
  );
  const unitHistoryQuery = useQuery({
    queryKey: ["operations-unit-history", historyInspectorUnitId],
    queryFn: () => getUnitHistory(historyInspectorUnitId),
    enabled: Boolean(historyInspectorUnitId),
  });

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

  const archiveOccupiedConflict = async (entry: { unit: Unit; activeTurn: MakeReadyItem }) => {
    setOccupiedReconciliationBusy(true);
    setOccupiedReconciliationMessage("");
    try {
      await onArchiveItem(entry.activeTurn.id, false);
      setOccupiedReconciliationMessage(
        isSpanish
          ? `Se archivo la rotacion activa de ${entry.unit.number} porque el directorio ya la marca como ocupada.`
          : `Archived the active turn for ${entry.unit.number} because the directory already marks it occupied.`,
      );
    } finally {
      setOccupiedReconciliationBusy(false);
    }
  };

  const archiveAllOccupiedConflicts = async () => {
    if (!occupiedTurnConflicts.length) return;
    setOccupiedReconciliationBusy(true);
    setOccupiedReconciliationMessage("");
    try {
      for (const entry of occupiedTurnConflicts) {
        await onArchiveItem(entry.activeTurn.id, false);
      }
      setOccupiedReconciliationMessage(
        isSpanish
          ? `Se archivaron ${occupiedTurnConflicts.length} rotacion(es) activas que el directorio ya marca como ocupadas.`
          : `Archived ${occupiedTurnConflicts.length} active turn(s) already marked occupied in the directory.`,
      );
    } finally {
      setOccupiedReconciliationBusy(false);
    }
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

  const buildUnitDirectoryPreviewRows = () => {
    const rows = unitImportText.split(/\r?\n/).map((row) => row.trim()).filter(Boolean);
    if (rows.length === 0) throw new Error(language === "es" ? "Pegue filas CSV antes de importar." : "Paste CSV rows before importing.");
    const delimiter = detectDelimitedInput(rows[0]);
    const firstCells = splitDelimitedLine(rows[0], delimiter).map(normalizeHeader);
    const hasHeader = firstCells.some((cell) => ["unit", "number", "unitnumber", "occupancystatus", "availabilitystatus"].includes(cell));
    const headers = hasHeader
      ? firstCells
      : inferHeaderlessUnitHeaders(firstCells.length);
    const { preparedRows: dataRows, ignoredRows } = prepareUnitDirectoryImportRows(hasHeader ? rows.slice(1) : rows, delimiter, headers);
    if (dataRows.length === 0) throw new Error(language === "es" ? "Agregue al menos una fila de unidad debajo del encabezado." : "Add at least one unit row below the header.");
    const valueAt = (cells: string[], names: string[]) => {
      const index = headers.findIndex((header) => names.includes(header));
      return index >= 0 ? cells[index]?.trim() ?? "" : "";
    };
    const hasColumn = (names: string[]) => headers.some((header) => names.includes(header));
    const parsedRows = dataRows.map((row) => {
      const cells = splitDelimitedLine(row, delimiter);
      const combinedUnit = valueAt(cells, ["bldgunit", "bldgapt", "bldgunitnumber", "buildingunit", "buildingandunit", "bldgunitno"]);
      const explicitNumber = valueAt(cells, ["unit", "unitid", "unitcode", "number", "unitnumber", "unitno", "unitnum", "unit#", "apartment", "apt", "aptno", "aptnumber", "apartmentnumber"]);
      const splitUnit = !explicitNumber && combinedUnit ? splitCombinedBuildingUnit(combinedUnit) : { building: "", unit: explicitNumber };
      const number = explicitNumber || splitUnit.unit;
      if (!number) throw new Error(language === "es" ? "Cada fila importada necesita un número de unidad." : "Every imported row needs a unit number.");
      const sqft = parseNumberCell(valueAt(cells, ["sqft", "squarefeet", "squarefootage", "rentablesqft", "unitsqft"]));
      const beds = parseNumberCell(valueAt(cells, ["beds", "bed", "bedrooms"]));
      const baths = parseNumberCell(valueAt(cells, ["baths", "bath", "bathrooms"]));
      const imported: UnitImportInput = { number };
      const floorPlan = valueAt(cells, ["floorplan", "floorplancode", "plancode", "plan", "planname", "unittype", "unittypename", "unitplan"]);
      const building = valueAt(cells, ["building", "buildingnumber", "bldg", "bldgno", "buildingname", "bldg#"]) || splitUnit.building;
      const area = valueAt(cells, ["area", "phase", "zone", "section", "propertyarea"]);
      const floor = valueAt(cells, ["floor", "level"]);
      const occupancy = valueAt(cells, ["occupancystatus", "availabilitystatus", "availability", "occupancy", "status", "statusdescription", "unitstatus", "currentstatus", "availstatus"]);
      const budgeted = valueAt(cells, ["budgeted", "isbudgeted", "includeinoccupancy", "occupancyeligible", "budget", "includedinoccupancy"]);
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
    return { rows: parsedRows, ignoredRows };
  };

  const parseUnitDirectoryRows = () => {
    return buildUnitDirectoryPreviewRows().rows;
  };

  const parseAvailabilityRows = () => {
    return buildAvailabilityImportPreviewRows().rows;
  };

  const buildAvailabilityImportPreviewRows = () => {
    const rows = availabilityImportText.split(/\r?\n/).map((row) => row.trim()).filter(Boolean);
    if (rows.length === 0) throw new Error(language === "es" ? "Pegue filas CSV de disponibilidad antes de importar." : "Paste availability CSV rows before importing.");
    const delimiter = detectDelimitedInput(rows[0]);
    const firstCells = splitDelimitedLine(rows[0], delimiter).map(normalizeHeader);
    const hasHeader = firstCells.some((cell) => ["unit", "unitnumber", "bldgunit", "vacancystatus", "availabilitystatus", "makereadydate", "makeready"].includes(cell));
    if (!hasHeader) throw new Error("Availability import needs a header row. Use the helper prompt for PDFs or spreadsheets.");
    const headers = firstCells;
    const { preparedRows: dataRows, ignoredRows } = prepareAvailabilityImportRows(rows.slice(1), delimiter, headers);
    if (dataRows.length === 0) throw new Error(language === "es" ? "Agregue al menos una fila de disponibilidad debajo del encabezado." : "Add at least one availability row below the header.");
    const valueAt = (cells: string[], names: string[]) => {
      const index = headers.findIndex((header) => names.includes(header));
      return index >= 0 ? cells[index]?.trim() ?? "" : "";
    };
    const parsedRows = dataRows.map((row) => {
      const cells = splitDelimitedLine(row, delimiter);
      const combinedUnit = valueAt(cells, ["bldgunit", "bldgapt", "bldgunitnumber", "buildingunit", "buildingandunit", "bldgunitno"]);
      const explicitNumber = valueAt(cells, ["unit", "unitid", "unitcode", "number", "unitnumber", "unitno", "unitnum", "apartment", "apt", "aptno", "aptnumber", "apartmentnumber"]);
      const splitUnit = !explicitNumber && combinedUnit ? splitCombinedBuildingUnit(combinedUnit) : { building: "", unit: explicitNumber };
      const number = explicitNumber || splitUnit.unit;
      if (!number) throw new Error(language === "es" ? "Cada fila de disponibilidad necesita un número de unidad." : "Every availability row needs a unit number.");
      const imported: AvailabilityImportInput = { number };
      const floorPlan = valueAt(cells, ["floorplan", "floorplancode", "plancode", "plan", "planname", "unittype", "unittypename", "floorplantype", "unitplan"]);
      const availabilityStatus = valueAt(cells, ["availabilitystatus", "availability", "availabilitysection", "reportsection", "section", "status", "statusdescription", "unitstatus", "currentstatus", "unitavailability", "availstatus", "unitavailabilitystatus", "unitavailstatus", "rentalstatus"]);
      const vacancyStatus = valueAt(cells, ["vacancystatus", "operationalstatus", "occupancystatus", "occupancy"]);
      const sqft = parseNumberCell(valueAt(cells, ["sqft", "squarefeet", "squarefootage", "rentablesqft", "unitsqft"]));
      const beds = parseNumberCell(valueAt(cells, ["beds", "bed", "bedrooms"]));
      const baths = parseNumberCell(valueAt(cells, ["baths", "bath", "bathrooms"]));
      const building = valueAt(cells, ["building", "buildingnumber", "bldg", "bldgno", "buildingname"]) || splitUnit.building;
      const area = valueAt(cells, ["area", "phase", "zone", "section", "propertyarea"]);
      const floor = valueAt(cells, ["floor", "level"]);
      const rawMoveOutDate = normalizeImportedDate(valueAt(cells, ["moveoutdate", "moveout", "expectedmoveout", "ntvdate", "noticedate", "noticedt", "noticegivendate", "expectedvacate", "expectedvacatedate", "vacate", "vacateon", "vacatedt", "moveoutdt"]));
      const rawVacatedDate = normalizeImportedDate(valueAt(cells, ["vacateddate", "vacated", "possessiondate", "actualvacate", "actualmoveout", "vacateddt", "actualmoveoutdate"]));
      const daysVacant = parseNumberCell(valueAt(cells, ["daysvacant", "vacantdays", "dayvacant", "daysempty", "daysvac", "daysvacantready"]));
      const makeReadyDate = normalizeImportedDate(valueAt(cells, ["makereadydate", "makeready", "movereadydate", "unitreadydate", "readydate", "readydt", "marketready", "marketreadydate", "marketreadydt", "scheduledmakeready", "scheduledmakereadydate", "scheduledreadydate", "makereadydt"]));
      const moveInDate = normalizeImportedDate(valueAt(cells, ["moveindate", "movein", "scheduledmovein", "scheduledmoveindate", "scheduledmoveindate", "scheduledmi", "schedmovein", "schedmi", "moveindt"]));
      const reportDate = normalizeImportedDate(valueAt(cells, ["reportdate", "reportgenerated", "reportgenerateddate", "generatedat", "generateddate", "rundate", "snapshotdate", "asof", "asofdate", "reportasof", "availabilitydate", "reportdt", "asofdt", "printdate", "asofdtm"]));
      const dateApplied = normalizeImportedDate(valueAt(cells, ["dateapplied", "applieddate", "applicationdate", "appdate", "applieddt", "applydate"]));
      const applicant = valueAt(cells, ["applicant", "applicantname", "futureapplicant", "futureapplicantname", "futureresident", "futureresidentname", "preleased", "prelease", "preleasedname", "preleasedapplicant", "preleasedapplicantname", "preleasename", "leasedto", "leasename", "futuretenant", "futuretenantname", "prospect", "prospectname", "scheduledresident", "scheduledresidentname", "scheduledapplicant", "scheduledapplicantname", "residentname", "resident", "name"]);
      const notes = valueAt(cells, ["notes", "note", "comments", "comment", "memo", "remark", "remarks"]);
      const normalizedStatus = vacancyStatus ? normalizeOccupancy(vacancyStatus) : normalizeOccupancy(availabilityStatus);
      const useMoveOutAsVacated = normalizedStatus.includes("VACANT") && !normalizedStatus.includes("NTV");
      const moveOutDate = useMoveOutAsVacated ? undefined : rawMoveOutDate;
      const vacatedDate = rawVacatedDate ?? (useMoveOutAsVacated ? rawMoveOutDate : undefined);
      if (floorPlan) imported.floorPlan = floorPlan;
      if (availabilityStatus) imported.availabilityStatus = availabilityStatus;
      if (normalizedStatus && normalizedStatus !== "OCCUPIED") {
        imported.vacancyStatus = normalizedStatus as AvailabilityImportInput["vacancyStatus"];
      }
      if (availabilityStatus && !imported.vacancyStatus) {
        imported.availabilityStatus = availabilityStatus;
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
    return { rows: parsedRows, ignoredRows };
  };

  const unitImportPreview = useMemo(() => {
    if (!unitImportText.trim()) return null;
    try {
      const { rows: parsed, ignoredRows } = buildUnitDirectoryPreviewRows();
      const existing = new Set(unitsForProperty.map((unit) => unit.number.toUpperCase()));
      const existingByNumber = new Map(unitsForProperty.map((unit) => [unit.number.toUpperCase(), unit]));
      const statuses = parsed.reduce<Record<string, number>>((acc, unit) => {
        acc[unit.occupancyStatus ?? "OCCUPIED"] = (acc[unit.occupancyStatus ?? "OCCUPIED"] ?? 0) + 1;
        return acc;
      }, {});
      const creates = parsed
        .filter((unit) => !existing.has(unit.number.toUpperCase()))
        .map((unit) => ({
          unit: unit.number,
          summary: [
            unit.building ? `${isSpanish ? "Edificio" : "Building"} ${unit.building}` : null,
            unit.floorPlan ? `${isSpanish ? "Plano" : "Plan"} ${unit.floorPlan}` : null,
            unit.squareFeet ? `${unit.squareFeet} ${isSpanish ? "pies²" : "sq ft"}` : null,
            occupancyLabel(unit.occupancyStatus ?? "OCCUPIED", language),
          ].filter(Boolean).join(" / "),
        }))
        .sort((left, right) => compareUnitLike(left.unit, right.unit));
      const updates = parsed.flatMap((row) => {
        const existingUnit = existingByNumber.get(row.number.toUpperCase());
        if (!existingUnit) return [];
        const changedFields: string[] = [];
        if (hasImportedValue(row.floorPlan) && (row.floorPlan ?? "") !== (existingUnit.floorPlan ?? "")) changedFields.push(`${isSpanish ? "Plano" : "Floor plan"}: ${existingUnit.floorPlan || (isSpanish ? "vacío" : "blank")} -> ${row.floorPlan}`);
        if (row.squareFeet !== undefined && row.squareFeet !== null && Number(row.squareFeet) !== Number(existingUnit.squareFeet ?? 0)) changedFields.push(`${isSpanish ? "Pies²" : "Sq ft"}: ${existingUnit.squareFeet ?? 0} -> ${row.squareFeet}`);
        if (row.bedrooms !== undefined && row.bedrooms !== null && Number(row.bedrooms) !== Number(existingUnit.bedrooms ?? 0)) changedFields.push(`${isSpanish ? "Recámaras" : "Beds"}: ${existingUnit.bedrooms ?? 0} -> ${row.bedrooms}`);
        if (row.bathrooms !== undefined && row.bathrooms !== null && Number(row.bathrooms) !== Number(existingUnit.bathrooms ?? 0)) changedFields.push(`${isSpanish ? "Baños" : "Baths"}: ${existingUnit.bathrooms ?? 0} -> ${row.bathrooms}`);
        if (hasImportedValue(row.building) && (row.building ?? "") !== (existingUnit.building ?? "")) changedFields.push(`${isSpanish ? "Edificio" : "Building"}: ${existingUnit.building || (isSpanish ? "vacío" : "blank")} -> ${row.building}`);
        if (hasImportedValue(row.area) && (row.area ?? "") !== (existingUnit.area ?? "")) changedFields.push(`${isSpanish ? "Área" : "Area"}: ${existingUnit.area || (isSpanish ? "vacía" : "blank")} -> ${row.area}`);
        if (hasImportedValue(row.floor) && (row.floor ?? "") !== (existingUnit.floor ?? "")) changedFields.push(`${isSpanish ? "Piso" : "Floor"}: ${existingUnit.floor || (isSpanish ? "vacío" : "blank")} -> ${row.floor}`);
        if (hasImportedValue(row.occupancyStatus) && row.occupancyStatus !== existingUnit.occupancyStatus) changedFields.push(`${isSpanish ? "Ocupación" : "Occupancy"}: ${occupancyLabel(existingUnit.occupancyStatus, language)} -> ${occupancyLabel(row.occupancyStatus, language)}`);
        if (row.isBudgeted !== undefined && row.isBudgeted !== existingUnit.isBudgeted) changedFields.push(`${isSpanish ? "Presupuestada" : "Budgeted"}: ${existingUnit.isBudgeted ? (isSpanish ? "sí" : "yes") : (isSpanish ? "no" : "no")} -> ${row.isBudgeted ? (isSpanish ? "sí" : "yes") : (isSpanish ? "no" : "no")}`);
        return changedFields.length > 0 ? [{ unit: row.number, fields: changedFields }] : [];
      }).sort((left, right) => compareUnitLike(left.unit, right.unit));
      return {
        rows: parsed.length,
        creates: parsed.filter((unit) => !existing.has(unit.number.toUpperCase())).length,
        updates: parsed.filter((unit) => existing.has(unit.number.toUpperCase())).length,
        budgeted: parsed.filter((unit) => unit.isBudgeted !== false).length,
        statuses,
        createDetails: creates,
        updateDetails: updates,
        ignoredRows,
      };
    } catch {
      return null;
    }
  }, [isSpanish, language, unitImportText, unitsForProperty]);
  const unitPreviewReviewText = useMemo(() => {
    if (!unitImportPreview) return "";
    const lines: string[] = [];
    if (unitImportPreview.createDetails.length) {
      lines.push(isSpanish ? `Todas las ${unitImportPreview.createDetails.length} unidades nuevas:` : `All ${unitImportPreview.createDetails.length} new units:`);
      for (const created of unitImportPreview.createDetails) {
        lines.push(`${created.unit}: ${created.summary}`);
      }
    }
    if (unitImportPreview.updateDetails.length) {
      if (lines.length) lines.push("");
      lines.push(isSpanish ? `Todas las ${unitImportPreview.updateDetails.length} unidades por actualizar:` : `All ${unitImportPreview.updateDetails.length} units to update:`);
      for (const updated of unitImportPreview.updateDetails) {
        lines.push(`${updated.unit}: ${updated.fields.join("; ")}`);
      }
    }
    return lines.join("\n");
  }, [isSpanish, unitImportPreview]);
  const unitImportParseError = useMemo(() => {
    if (!unitImportText.trim()) return "";
    try {
      parseUnitDirectoryRows();
      return "";
    } catch (error) {
      return error instanceof Error ? error.message : (language === "es" ? "No se pudo analizar el CSV del directorio de unidades." : "Could not parse unit directory CSV.");
    }
  }, [unitImportText]);

  const availabilityImportPreview = useMemo(() => {
    if (!availabilityImportText.trim()) return null;
    try {
      const { rows: parsed, ignoredRows } = buildAvailabilityImportPreviewRows();
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
        if (status && status !== turn.vacancyStatus) changedFields.push(`${isSpanish ? "Vacancia" : "Vacancy"}: ${occupancyLabel(turn.vacancyStatus, language)} -> ${occupancyLabel(status, language)}`);
        if (hasImportedValue(row.applicant) && (row.applicant ?? "") !== (turn.applicant ?? "")) changedFields.push(`Applicant: ${turn.applicant || "blank"} -> ${row.applicant}`);
        if (hasImportedValue(row.moveOutDate) && normalizePreviewDate(row.moveOutDate) !== normalizePreviewDate(turn.moveOutDate)) changedFields.push(`NTV date: ${normalizePreviewDate(turn.moveOutDate) || "blank"} -> ${normalizePreviewDate(row.moveOutDate)}`);
        if (hasImportedValue(row.vacatedDate) && normalizePreviewDate(row.vacatedDate) !== normalizePreviewDate(turn.vacatedDate)) changedFields.push(`Vacated: ${normalizePreviewDate(turn.vacatedDate) || "blank"} -> ${normalizePreviewDate(row.vacatedDate)}`);
        if (hasImportedValue(row.makeReadyDate) && normalizePreviewDate(row.makeReadyDate) !== normalizePreviewDate(turn.makeReadyDate)) changedFields.push(`Make ready: ${normalizePreviewDate(turn.makeReadyDate) || "blank"} -> ${normalizePreviewDate(row.makeReadyDate)}`);
        if (hasImportedValue(row.moveInDate) && normalizePreviewDate(row.moveInDate) !== normalizePreviewDate(turn.moveInDate)) changedFields.push(`Move-in: ${normalizePreviewDate(turn.moveInDate) || "blank"} -> ${normalizePreviewDate(row.moveInDate)}`);
        if (isMeaningfulDaysVacantDifference(turn.daysVacant, row.daysVacant)) changedFields.push(`Days vacant: ${turn.daysVacant ?? 0} -> ${row.daysVacant}`);
        return changedFields.length > 0 ? [{ unit: row.number, fields: changedFields }] : [];
      });
      const parityAlerts = parsed.flatMap((row) => {
        const turn = existingTurnsByUnit.get(row.number.toUpperCase());
        if (!turn) return [];
        const reportStatus = row.vacancyStatus ?? normalizeOccupancy(row.availabilityStatus ?? "");
        const localReady = isReadyLikeOccupancy(turn.vacancyStatus) || isDoneLikeMakeReadyStatus(turn.makeReadyStatus);
        const reportReady = isReadyLikeOccupancy(reportStatus) || isDoneLikeMakeReadyStatus(row.makeReadyStatus ?? null);
        if (localReady === reportReady) return [];
        return [{
          unit: row.number,
          type: localReady && !reportReady ? "LOCAL_AHEAD" as const : "REPORT_AHEAD" as const,
          localVacancyStatus: turn.vacancyStatus ?? "",
          localMakeReadyStatus: turn.makeReadyStatus ?? "",
          reportVacancyStatus: reportStatus,
          reportMakeReadyStatus: row.makeReadyStatus ?? "",
          updatedAt: turn.updatedAt,
          reportDate: row.reportDate ?? null,
        }];
      });
      return {
        rows: parsed.length,
        unitCreates: parsed.filter((row) => !existingUnits.has(row.number.toUpperCase())).length,
        unitUpdates: parsed.filter((row) => existingUnits.has(row.number.toUpperCase())).length,
        turnCreates: parsed.filter((row) => !existingTurns.has(row.number.toUpperCase())).length,
        turnUpdates: parsed.filter((row) => existingTurns.has(row.number.toUpperCase())).length,
        applicants: parsed.filter((row) => hasImportedValue(row.applicant)).length,
        statuses,
        changes: [...changes].sort((left, right) => compareUnitLike(left.unit, right.unit)),
        parityAlerts: [...parityAlerts].sort((left, right) => compareUnitLike(left.unit, right.unit)),
        ignoredRows,
      };
    } catch {
      return null;
    }
  }, [availabilityImportText, items, selectedPropertyId, unitsForProperty]);

  const availabilityPreviewReviewText = useMemo(() => {
    if (!availabilityImportPreview) return "";
    const lines: string[] = [];
    if (availabilityImportPreview.changes.length) {
      lines.push(isSpanish ? `Todas las ${availabilityImportPreview.changes.length} unidades con diferencias del reporte:` : `All ${availabilityImportPreview.changes.length} units with report differences:`);
      for (const change of availabilityImportPreview.changes) {
        lines.push(`${change.unit}: ${change.fields.join("; ")}`);
      }
    }
    if (availabilityImportPreview.parityAlerts.length) {
      if (lines.length) lines.push("");
      lines.push(isSpanish ? `Todas las ${availabilityImportPreview.parityAlerts.length} alertas de paridad listo/no listo:` : `All ${availabilityImportPreview.parityAlerts.length} ready-status parity alerts:`);
      for (const alert of availabilityImportPreview.parityAlerts) {
        lines.push(`${alert.unit}: ${alert.type === "LOCAL_AHEAD" ? "LOCAL_AHEAD" : "REPORT_AHEAD"} | Local ${alert.localVacancyStatus} / ${alert.localMakeReadyStatus || "unset"} | Report ${alert.reportVacancyStatus} / ${alert.reportMakeReadyStatus || "unset"} | Updated ${formatDateTime(alert.updatedAt)} | Report date ${formatDateTime(alert.reportDate)}`);
      }
    }
    return lines.join("\n");
  }, [availabilityImportPreview, isSpanish, language]);

  const availabilityConflictReviewText = useMemo(() => {
    if (!availabilityImportConflicts?.length) return "";
    return availabilityImportConflicts
      .slice()
      .sort((left, right) => compareUnitLike(left.unitNumber, right.unitNumber))
      .map((conflict) => `${conflict.unitNumber}: ${conflict.reason} | ${conflict.recommendedAction} | ${conflict.fieldChanges.join("; ")} | Updated ${formatDateTime(conflict.updatedAt)} | Report date ${formatDateTime(conflict.reportDate)}`)
      .join("\n");
  }, [availabilityImportConflicts]);

  const availabilityImportParseError = useMemo(() => {
    if (!availabilityImportText.trim()) return "";
    try {
      parseAvailabilityRows();
      return "";
    } catch (error) {
      return error instanceof Error ? error.message : (language === "es" ? "No se pudo analizar el CSV de disponibilidad." : "Could not parse availability CSV.");
    }
  }, [availabilityImportText]);

  const importUnitDirectory = async () => {
    if (!properties.length) {
      setUnitImportError(isSpanish ? "Cree una propiedad antes de importar un directorio de unidades." : "Create a property before importing a unit directory.");
      return;
    }
    if (!selectedPropertyId || !selectedProperty) {
      setUnitImportError(isSpanish ? "Seleccione la propiedad dueña de este directorio de unidades antes de importar." : "Select the property that owns this unit directory before importing.");
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
      setUnitImportError(error instanceof Error ? error.message : (isSpanish ? "No se pudo analizar el CSV del directorio de unidades." : "Could not parse unit directory CSV."));
    }
  };

  const revertLastUnitImport = async () => {
    if (!lastImport || lastImport.createdUnitIds.length === 0) return;
    await onRevertUnitImport({ propertyId: lastImport.property.id, createdUnitIds: lastImport.createdUnitIds });
    setLastImport(null);
  };

  const importAvailabilityReport = async (overrideConflicts = false) => {
    if (!properties.length) {
      setAvailabilityImportError(isSpanish ? "Cree una propiedad antes de importar disponibilidad." : "Create a property before importing availability.");
      return;
    }
    if (!selectedPropertyId || !selectedProperty) {
      setAvailabilityImportError(isSpanish ? "Seleccione la propiedad dueña de este reporte de disponibilidad antes de importar." : "Select the property that owns this availability report before importing.");
      return;
    }
    try {
      setAvailabilityImportError("");
      if (!overrideConflicts) setAvailabilityImportConflicts(null);
      const parsedRows = parseAvailabilityRows();
      const result = await onImportAvailability({ propertyId: selectedPropertyId, rows: parsedRows, updateExisting: true, createTurns: true, overrideConflicts });
      setLastAvailabilityImport(result);
      setAvailabilityImportText("");
      setAvailabilityImportConflicts(null);
    } catch (error) {
      if (isApiError(error) && error.status === 409 && error.details && typeof error.details === "object" && "conflicts" in (error.details as Record<string, unknown>)) {
        const payload = error.details as AvailabilityImportConflictResponse;
        setAvailabilityImportConflicts(payload.conflicts);
        setAvailabilityImportError("");
        return;
      }
      setAvailabilityImportError(error instanceof Error ? error.message : (isSpanish ? "No se pudo analizar el CSV de disponibilidad." : "Could not parse availability CSV."));
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
          <p className="eyebrow">{isSpanish ? "Configuración del tablero" : "Board Setup"}</p>
          <h2>{isSpanish ? "Propiedades, Unidades y Rotaciones" : "Properties, Units & Turns"}</h2>
          <p className="subtitle">{isSpanish ? "Mantenga el inventario detrás del tablero y archive de forma segura los registros completados o retirados." : "Maintain the inventory behind the board and safely archive completed or retired records."}</p>
        </div>
        <span className="role-chip">{role} {isSpanish ? "ACCESO" : "ACCESS"}</span>
      </header>

      {message ? <div className="admin-message success">{message}</div> : null}
      {error ? <div className="admin-message error">{error}</div> : null}

      <section className="operations-grid">
        <article className="operations-card" data-testid="property-management">
          <div className="admin-section-head">
            <h3>{isSpanish ? "Propiedades" : "Properties"}</h3>
            <span className="subtitle">{activeProperties.length} {isSpanish ? "activas" : "active"}</span>
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
              <input data-testid="property-create-name" placeholder={isSpanish ? "Nombre de la propiedad" : "Property name"} value={newProperty.name} onChange={(event) => setNewProperty((current) => ({ ...current, name: event.target.value }))} required />
              <input data-testid="property-create-code" placeholder={isSpanish ? "Código" : "Code"} value={newProperty.code} onChange={(event) => setNewProperty((current) => ({ ...current, code: event.target.value }))} required />
              <input data-testid="property-create-occupancy-goal" type="number" min="0" max="100" step="0.1" placeholder={isSpanish ? "Meta de ocupación %" : "Occupancy goal %"} value={newProperty.occupancyGoalPercent} onChange={(event) => setNewProperty((current) => ({ ...current, occupancyGoalPercent: event.target.value }))} />
              <button data-testid="property-create-submit" className="button button-primary" disabled={loading}>{isSpanish ? "Agregar propiedad" : "Add Property"}</button>
            </form>
          ) : <p className="helper-copy">{isSpanish ? "Los gerentes pueden editar propiedades asignadas; los administradores agregan o archivan inventario." : "Managers can edit assigned properties; administrators add or archive inventory."}</p>}
          <div className="record-list">
            {properties.length === 0 ? <StatusState title={isSpanish ? "No hay propiedades asignadas" : "No properties assigned"} description={isSpanish ? "Un administrador debe agregar o asignar una propiedad." : "An administrator must add or assign a property."} tone="subtle" /> : (
              <>
                <div className="section-header">
                  <strong>{isSpanish ? "Propiedades activas" : "Active properties"}</strong>
                  <span className="muted">{activeProperties.length}</span>
                </div>
                {activeProperties.map((property) => (
                  <button key={property.id} type="button" data-testid={`property-row-${property.code.toLowerCase()}`} className={selectedPropertyId === property.id ? "record-row selected" : "record-row"} onClick={() => setSelectedPropertyId(property.id)}>
                    <span><strong>{property.code}</strong>{property.name}</span>
                    <span className="status-chip active">{isSpanish ? "Activa" : "Active"}</span>
                  </button>
                ))}
                {archivedProperties.length > 0 ? (
                  <>
                    <div className="section-header" style={{ marginTop: 12 }}>
                      <strong>{isSpanish ? "Propiedades archivadas" : "Archived properties"}</strong>
                      <span className="muted">{archivedProperties.length}</span>
                    </div>
                    {archivedProperties.map((property) => (
                      <button key={property.id} type="button" data-testid={`property-row-${property.code.toLowerCase()}`} className={selectedPropertyId === property.id ? "record-row selected" : "record-row"} onClick={() => setSelectedPropertyId(property.id)}>
                        <span><strong>{property.code}</strong>{property.name}</span>
                        <span className="status-chip inactive">{isSpanish ? "Archivada" : "Archived"}</span>
                      </button>
                    ))}
                  </>
                ) : null}
              </>
            )}
          </div>
          {selectedProperty ? (
            <div className="editor-block">
              <label>{isSpanish ? "Nombre" : "Name"}<input data-testid="property-edit-name" value={propertyDraft.name} onChange={(event) => setPropertyDraft((current) => ({ ...current, name: event.target.value }))} /></label>
              <label>{isSpanish ? "Código" : "Code"}<input data-testid="property-edit-code" value={propertyDraft.code} onChange={(event) => setPropertyDraft((current) => ({ ...current, code: event.target.value }))} /></label>
              <label>{isSpanish ? "Meta de ocupación %" : "Occupancy goal %"}<input data-testid="property-edit-occupancy-goal" type="number" min="0" max="100" step="0.1" value={propertyDraft.occupancyGoalPercent} onChange={(event) => setPropertyDraft((current) => ({ ...current, occupancyGoalPercent: event.target.value }))} /></label>
              <div className="operations-mini-stats">
                <span><strong>{occupancyPercent}%</strong> {isSpanish ? "ocupación actual" : "current occupancy"}</span>
                <span><strong>{selectedProperty.occupancyGoalPercent ?? (isSpanish ? "Sin definir" : "Unset")}%</strong> {isSpanish ? "meta" : "goal"}</span>
                <span><strong>{occupiedCount}</strong> {isSpanish ? "ocupadas" : "occupied"} / {unitsForProperty.length} {isSpanish ? "unidades" : "units"}</span>
              </div>
              <div className="admin-actions">
                <button data-testid="property-save" className="button button-primary" disabled={loading} onClick={() => void onUpdateProperty(selectedProperty.id, { name: propertyDraft.name, code: propertyDraft.code, occupancyGoalPercent: propertyDraft.occupancyGoalPercent ? Number(propertyDraft.occupancyGoalPercent) : null })}>{isSpanish ? "Guardar" : "Save"}</button>
                {role === "ADMIN" ? (
                  <button data-testid={selectedProperty.isActive ? "property-archive" : "property-restore"} className={selectedProperty.isActive ? "button button-danger" : "button button-secondary"} onClick={() => selectedProperty.isActive ? setConfirmTarget({ type: "property", operation: "archive", record: selectedProperty }) : void onArchiveProperty(selectedProperty.id, true)}>
                    {selectedProperty.isActive ? (isSpanish ? "Archivar" : "Archive") : (isSpanish ? "Restaurar" : "Restore")}
                  </button>
                ) : null}
                {role === "ADMIN" && !selectedProperty.isActive ? <button data-testid="property-delete" className="button button-danger" onClick={() => setConfirmTarget({ type: "property", operation: "delete", record: selectedProperty })}>{isSpanish ? "Eliminar" : "Delete"}</button> : null}
              </div>
            </div>
          ) : null}
        </article>

        <article className="operations-card" data-testid="operating-calendar-management">
          <div className="admin-section-head">
            <h3>{isSpanish ? "Calendario operativo" : "Operating Calendar"}</h3>
            <span className="subtitle">{isSpanish ? "Reglas de programación para la propiedad seleccionada" : "Scheduling guardrails for the selected property"}</span>
          </div>
          {!selectedProperty ? (
            <StatusState title="Choose a property" description="Select a property before editing scheduling rules." tone="subtle" />
          ) : (
            <div className="editor-block">
              <label className="span-full">{isSpanish ? "Nombre del calendario" : "Calendar name"}<input data-testid="operating-calendar-name" value={calendarDraft.name} onChange={(event) => setCalendarDraft((current) => ({ ...current, name: event.target.value }))} /></label>
              <label>{isSpanish ? "Zona horaria" : "Timezone"}<input data-testid="operating-calendar-timezone" value={calendarDraft.timezone} onChange={(event) => setCalendarDraft((current) => ({ ...current, timezone: event.target.value }))} /></label>
              <label>{isSpanish ? "Inicio operativo" : "Operating start"}<input data-testid="operating-calendar-start" type="time" value={minutesToTime(calendarDraft.maintenanceStartMinute)} onChange={(event) => setCalendarDraft((current) => ({ ...current, maintenanceStartMinute: timeToMinutes(event.target.value, current.maintenanceStartMinute) }))} /></label>
              <label>{isSpanish ? "Fin operativo" : "Operating end"}<input data-testid="operating-calendar-end" type="time" value={minutesToTime(calendarDraft.maintenanceEndMinute)} onChange={(event) => setCalendarDraft((current) => ({ ...current, maintenanceEndMinute: timeToMinutes(event.target.value, current.maintenanceEndMinute) }))} /></label>
              <label>{isSpanish ? "Días de anticipación para proveedor" : "Vendor lead days"}<input data-testid="operating-calendar-vendor-lead-days" type="number" min="0" max="60" value={calendarDraft.vendorLeadDays} onChange={(event) => setCalendarDraft((current) => ({ ...current, vendorLeadDays: Number(event.target.value) }))} /></label>
              <label>{isSpanish ? "Límite diario de unidades" : "Daily unit limit"}<input data-testid="operating-calendar-daily-limit" type="number" min="1" max="50" value={calendarDraft.dailyScheduledUnitLimit ?? ""} placeholder={isSpanish ? "Sin tope" : "No cap"} onChange={(event) => setCalendarDraft((current) => ({ ...current, dailyScheduledUnitLimit: event.target.value ? Number(event.target.value) : null }))} /></label>
              <label>{isSpanish ? "Día de alcance" : "Scope day"}<select data-testid="operating-calendar-scope-day" value={calendarDraft.scopeDay ?? ""} onChange={(event) => setCalendarDraft((current) => ({ ...current, scopeDay: event.target.value ? Number(event.target.value) : null }))}>{weekdayOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label>{isSpanish ? "Día de inicio de trabajo" : "Work start day"}<select data-testid="operating-calendar-work-start-day" value={calendarDraft.workStartDay ?? ""} onChange={(event) => setCalendarDraft((current) => ({ ...current, workStartDay: event.target.value ? Number(event.target.value) : null }))}>{weekdayOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label className="toggle-row"><input data-testid="operating-calendar-no-weekends" type="checkbox" checked={calendarDraft.noWeekendScheduling} onChange={(event) => setCalendarDraft((current) => ({ ...current, noWeekendScheduling: event.target.checked }))} />{isSpanish ? "No programar fines de semana" : "No weekend scheduling"}</label>
              <label className="toggle-row"><input data-testid="operating-calendar-avoid-monday" type="checkbox" checked={calendarDraft.avoidMondayScheduling} onChange={(event) => setCalendarDraft((current) => ({ ...current, avoidMondayScheduling: event.target.checked }))} />{isSpanish ? "Evitar inicios en lunes" : "Avoid Monday starts"}</label>
              <label className="toggle-row"><input data-testid="operating-calendar-avoid-friday" type="checkbox" checked={calendarDraft.avoidFridayScheduling} onChange={(event) => setCalendarDraft((current) => ({ ...current, avoidFridayScheduling: event.target.checked }))} />{isSpanish ? "Evitar inicios en viernes" : "Avoid Friday starts"}</label>
              <label className="toggle-row"><input data-testid="operating-calendar-autopopulate" type="checkbox" checked={calendarDraft.autoPopulateEnabled} onChange={(event) => setCalendarDraft((current) => ({ ...current, autoPopulateEnabled: event.target.checked }))} />{isSpanish ? "Permitir reglas futuras de autollenado" : "Allow future auto-populate rules"}</label>
              <label className="span-full">{isSpanish ? "Notas" : "Notes"}<textarea data-testid="operating-calendar-notes" rows={3} value={calendarDraft.notes ?? ""} onChange={(event) => setCalendarDraft((current) => ({ ...current, notes: event.target.value || null }))} placeholder={isSpanish ? "Ejemplos: los proveedores necesitan tres días hábiles, alcance el lunes / ejecutar el martes, repartir más de dos unidades durante la semana." : "Examples: vendors need three business days, scope Monday / execute Tuesday, spread more than two units across the week."} /></label>
              <p className="helper-copy span-full">{isSpanish ? "Estas reglas ya se guardan para planeación, revisión de calendario y futura población de fechas por días hábiles. Las automatizaciones actuales todavía requieren revisión explícita antes de cambiar fechas del programa." : "These rules are stored now for planning, calendar review, and future business-day date population. Current automations still require explicit review before changing schedule dates."}</p>
              <button
                data-testid="operating-calendar-save"
                className="button button-primary span-full"
                disabled={loading || calendarDraft.maintenanceEndMinute <= calendarDraft.maintenanceStartMinute}
                onClick={() => void onUpdateOperatingCalendar(selectedProperty.id, calendarDraft)}
              >
                {isSpanish ? "Guardar calendario operativo" : "Save Operating Calendar"}
              </button>
            </div>
          )}
        </article>

        <article className="operations-card" data-testid="risk-policy-card">
          <div className="admin-section-head">
            <h3>{isSpanish ? "Política de riesgo" : "Risk Policy"}</h3>
            <span className="subtitle">{selectedRiskPolicy?.customized ? "Customized thresholds" : "Default thresholds"}</span>
          </div>
          {!selectedProperty ? (
            <StatusState title="Choose a property" description="Select a property before editing risk thresholds." tone="subtle" />
          ) : (
            <div className="editor-block">
              <p className="helper-copy span-full">{isSpanish ? "Estos umbrales controlan el riesgo de mudanza, trabajo estancado, antigüedad de rotaciones, tiempos de proveedor, riesgo de listas y cobertura planificada. Los nombres de categorías de riesgo se mantienen estables para filtros, tableros, automatizaciones e historial." : "These thresholds control move-in risk, stale work, aging turns, vendor timing, checklist risk, and planned coverage. Risk category names stay stable for filters, dashboards, automations, and history."}</p>
              <label>{isSpanish ? "Ventana crítica de mudanza" : "Critical move-in window"}<input data-testid="risk-policy-critical-days" type="number" min="0" max="30" value={riskDraft.moveInCriticalDays} onChange={(event) => updateRiskDraftNumber("moveInCriticalDays", event.target.value)} /></label>
              <label>{isSpanish ? "Ventana alta de mudanza" : "High move-in window"}<input type="number" min="0" max="60" value={riskDraft.moveInHighDays} onChange={(event) => updateRiskDraftNumber("moveInHighDays", event.target.value)} /></label>
              <label>{isSpanish ? "Ventana media de mudanza" : "Medium move-in window"}<input type="number" min="0" max="90" value={riskDraft.moveInMediumDays} onChange={(event) => updateRiskDraftNumber("moveInMediumDays", event.target.value)} /></label>
              <label>{isSpanish ? "Ventana de alto riesgo sin asignar" : "Unassigned high-risk window"}<input type="number" min="0" max="90" value={riskDraft.unassignedHighDays} onChange={(event) => updateRiskDraftNumber("unassignedHighDays", event.target.value)} /></label>
              <label>{isSpanish ? "Días de actividad estancada" : "Stale activity days"}<input type="number" min="1" max="90" value={riskDraft.staleActivityDays} onChange={(event) => updateRiskDraftNumber("staleActivityDays", event.target.value)} /></label>
              <label>{isSpanish ? "Días medios de antigüedad" : "Aging medium days"}<input type="number" min="1" max="365" value={riskDraft.agingMediumDays} onChange={(event) => updateRiskDraftNumber("agingMediumDays", event.target.value)} /></label>
              <label>{isSpanish ? "Días altos de antigüedad" : "Aging high days"}<input type="number" min="1" max="365" value={riskDraft.agingHighDays} onChange={(event) => updateRiskDraftNumber("agingHighDays", event.target.value)} /></label>
              <label>{isSpanish ? "Días de proveedor cerca de mudanza" : "Vendor near move-in days"}<input type="number" min="0" max="90" value={riskDraft.vendorNearMoveInDays} onChange={(event) => updateRiskDraftNumber("vendorNearMoveInDays", event.target.value)} /></label>
              <label>{isSpanish ? "Días de checklist cerca de mudanza" : "Checklist near move-in days"}<input type="number" min="0" max="90" value={riskDraft.checklistNearMoveInDays} onChange={(event) => updateRiskDraftNumber("checklistNearMoveInDays", event.target.value)} /></label>
              <label>{isSpanish ? "Días de planeación cerca de mudanza" : "Planning near move-in days"}<input type="number" min="0" max="90" value={riskDraft.planningNearMoveInDays} onChange={(event) => updateRiskDraftNumber("planningNearMoveInDays", event.target.value)} /></label>
              <button
                data-testid="save-risk-policy"
                className="button button-primary span-full"
                disabled={loading}
                onClick={() => void onUpdateRiskPolicy(selectedProperty.id, riskDraft)}
              >
                {isSpanish ? "Guardar política de riesgo" : "Save Risk Policy"}
              </button>
            </div>
          )}
        </article>

        <article className="operations-card" data-testid="unit-management">
          <div className="admin-section-head">
            <h3>{isSpanish ? "Unidades" : "Units"}</h3>
            <span className="subtitle">{isSpanish ? `${unitsForProperty.length} en la propiedad seleccionada` : `${unitsForProperty.length} in selected property`}</span>
          </div>
          <label className="span-full unit-directory-target">
            {isSpanish ? "Propiedad del directorio de unidades" : "Unit directory property"}
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
              <option value="">{isSpanish ? "Seleccione una propiedad antes de importar" : "Select property before importing"}</option>
              {properties.map((property) => <option key={property.id} value={property.id}>{property.code} - {property.name}</option>)}
            </select>
            <span className="helper-copy">{isSpanish ? "La lista de unidades, la vista previa CSV y la importación usan esta propiedad seleccionada." : "The unit list, CSV preview, and import all use this selected property."}</span>
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
              <option value="">{isSpanish ? "Seleccionar propiedad" : "Select property"}</option>
              {activeProperties.map((property) => <option key={property.id} value={property.id}>{property.code}</option>)}
            </select>
            <input data-testid="unit-create-number" placeholder={isSpanish ? "Número de unidad" : "Unit number"} value={newUnit.number} onChange={(event) => setNewUnit((current) => ({ ...current, number: event.target.value }))} required />
            <select data-testid="unit-create-floor-plan-managed" value={newUnit.floorPlanId} onChange={(event) => setNewUnit((current) => ({ ...current, floorPlanId: event.target.value }))}><option value="">{isSpanish ? "Anterior/libre" : "Legacy/freeform"}</option>{floorPlansForNewUnit.map((plan) => <option key={plan.id} value={plan.id}>{floorPlanLabel(plan)}</option>)}</select>
            <input data-testid="unit-create-floor-plan" placeholder={isSpanish ? "Texto libre del plano anterior" : "Legacy floor plan text"} value={newUnit.floorPlan} onChange={(event) => setNewUnit((current) => ({ ...current, floorPlan: event.target.value }))} />
            <input data-testid="unit-create-square-feet" type="number" min="1" placeholder={isSpanish ? "Pies²" : "Sq ft"} value={newUnit.squareFeet} onChange={(event) => setNewUnit((current) => ({ ...current, squareFeet: event.target.value }))} />
            <input data-testid="unit-create-building" placeholder={isSpanish ? "Edificio" : "Building"} value={newUnit.building} onChange={(event) => setNewUnit((current) => ({ ...current, building: event.target.value }))} />
            <input data-testid="unit-create-area" placeholder={isSpanish ? "Área" : "Area"} value={newUnit.area} onChange={(event) => setNewUnit((current) => ({ ...current, area: event.target.value }))} />
            <input data-testid="unit-create-floor" placeholder={isSpanish ? "Piso" : "Floor"} value={newUnit.floor} onChange={(event) => setNewUnit((current) => ({ ...current, floor: event.target.value }))} />
            <select data-testid="unit-create-occupancy" value={newUnit.occupancyStatus} onChange={(event) => setNewUnit((current) => ({ ...current, occupancyStatus: event.target.value as Unit["occupancyStatus"] }))}>{occupancyOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
            <button data-testid="unit-create-submit" className="button button-primary" disabled={loading || !newUnit.propertyId}>{isSpanish ? "Agregar unidad" : "Add Unit"}</button>
          </form>
          <div className="operations-mini-stats wrap">
            {occupancyOptions.map((option) => occupancyCounts[option.value] ? <span key={option.value}><strong>{occupancyCounts[option.value]}</strong> {option.label}</span> : null)}
          </div>
          <div className="record-list unit-list">
            {unitsForProperty.length === 0 ? <StatusState title={isSpanish ? "No se encontraron unidades" : "No units found"} description={isSpanish ? "Agregue una unidad para iniciar una rotación de make-ready." : "Add a unit to start a make-ready turn."} tone="subtle" /> : (
              <>
                <div className="section-header">
                  <strong>{isSpanish ? "Unidades activas" : "Active units"}</strong>
                  <span className="muted">{activeUnitsForProperty.length}</span>
                </div>
                {activeUnitsForProperty.map((unit) => (
                  <button key={unit.id} type="button" data-testid={`unit-row-${unit.number.toLowerCase()}`} className={selectedUnitId === unit.id ? "record-row selected" : "record-row"} onClick={() => setSelectedUnitId(unit.id)}>
                    <span><strong>{unit.number}</strong>{unit.building ? `${isSpanish ? "Edif." : "Bldg"} ${unit.building} / ` : ""}{unit.floorPlanRecord ? floorPlanLabel(unit.floorPlanRecord) : unit.floorPlan || (isSpanish ? "Sin plano" : "No floor plan")} / {occupancyLabel(unit.occupancyStatus, language)}</span>
                    <span className="status-chip active">{isSpanish ? "Activa" : "Active"}</span>
                  </button>
                ))}
                {archivedUnitsForProperty.length > 0 ? (
                  <>
                    <div className="section-header" style={{ marginTop: 12 }}>
                      <strong>{isSpanish ? "Unidades archivadas" : "Archived units"}</strong>
                      <span className="muted">{archivedUnitsForProperty.length}</span>
                    </div>
                    {archivedUnitsForProperty.map((unit) => (
                      <button key={unit.id} type="button" data-testid={`unit-row-${unit.number.toLowerCase()}`} className={selectedUnitId === unit.id ? "record-row selected" : "record-row"} onClick={() => setSelectedUnitId(unit.id)}>
                        <span><strong>{unit.number}</strong>{unit.building ? `${isSpanish ? "Edif." : "Bldg"} ${unit.building} / ` : ""}{unit.floorPlanRecord ? floorPlanLabel(unit.floorPlanRecord) : unit.floorPlan || (isSpanish ? "Sin plano" : "No floor plan")} / {occupancyLabel(unit.occupancyStatus, language)}</span>
                        <span className="status-chip inactive">{isSpanish ? "Archivada" : "Archived"}</span>
                      </button>
                    ))}
                  </>
                ) : null}
              </>
            )}
          </div>
          {selectedUnit ? (
            <div className="editor-block">
              <label>{isSpanish ? "Propiedad" : "Property"}<select data-testid="unit-edit-property" value={unitDraft.propertyId} onChange={(event) => setUnitDraft((current) => ({ ...current, propertyId: event.target.value }))}>{activeProperties.map((property) => <option key={property.id} value={property.id}>{property.code}</option>)}</select></label>
              <label>{isSpanish ? "Unidad" : "Unit"}<input data-testid="unit-edit-number" value={unitDraft.number} onChange={(event) => setUnitDraft((current) => ({ ...current, number: event.target.value }))} /></label>
              <label>{isSpanish ? "Plano administrado" : "Managed floor plan"}<select data-testid="unit-edit-floor-plan-managed" value={unitDraft.floorPlanId} onChange={(event) => setUnitDraft((current) => ({ ...current, floorPlanId: event.target.value }))}><option value="">{isSpanish ? "Anterior/libre" : "Legacy/freeform"}</option>{floorPlansForEditUnit.map((plan) => <option key={plan.id} value={plan.id}>{floorPlanLabel(plan)}</option>)}</select></label>
              <label>{isSpanish ? "Texto anterior" : "Legacy text"}<input data-testid="unit-edit-floor-plan" value={unitDraft.floorPlan} onChange={(event) => setUnitDraft((current) => ({ ...current, floorPlan: event.target.value }))} /></label>
              <label>{isSpanish ? "Pies cuadrados" : "Square feet"}<input data-testid="unit-edit-square-feet" type="number" value={unitDraft.squareFeet} onChange={(event) => setUnitDraft((current) => ({ ...current, squareFeet: event.target.value }))} /></label>
              <label>{isSpanish ? "Edificio" : "Building"}<input data-testid="unit-edit-building" value={unitDraft.building} onChange={(event) => setUnitDraft((current) => ({ ...current, building: event.target.value }))} /></label>
              <label>{isSpanish ? "Área" : "Area"}<input data-testid="unit-edit-area" value={unitDraft.area} onChange={(event) => setUnitDraft((current) => ({ ...current, area: event.target.value }))} /></label>
              <label>{isSpanish ? "Piso" : "Floor"}<input data-testid="unit-edit-floor" value={unitDraft.floor} onChange={(event) => setUnitDraft((current) => ({ ...current, floor: event.target.value }))} /></label>
              <label>{isSpanish ? "Ocupación" : "Occupancy"}<select data-testid="unit-edit-occupancy" value={unitDraft.occupancyStatus} onChange={(event) => setUnitDraft((current) => ({ ...current, occupancyStatus: event.target.value as Unit["occupancyStatus"] }))}>{occupancyOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <div className="admin-actions span-full">
                <button data-testid="unit-save" className="button button-primary" onClick={() => void onUpdateUnit(selectedUnit.id, { propertyId: unitDraft.propertyId, number: unitDraft.number, floorPlanId: unitDraft.floorPlanId || null, floorPlan: unitDraft.floorPlan || null, squareFeet: unitDraft.squareFeet ? Number(unitDraft.squareFeet) : null, bedrooms: unitDraft.bedrooms ? Number(unitDraft.bedrooms) : null, bathrooms: unitDraft.bathrooms ? Number(unitDraft.bathrooms) : null, occupancyStatus: unitDraft.occupancyStatus, building: unitDraft.building || null, area: unitDraft.area || null, floor: unitDraft.floor || null, isBudgeted: unitDraft.isBudgeted })}>{isSpanish ? "Guardar" : "Save"}</button>
                <button data-testid={selectedUnit.isActive ? "unit-archive" : "unit-restore"} className={selectedUnit.isActive ? "button button-danger" : "button button-secondary"} onClick={() => selectedUnit.isActive ? setConfirmTarget({ type: "unit", operation: "archive", record: selectedUnit }) : void onArchiveUnit(selectedUnit.id, true)}>{selectedUnit.isActive ? (isSpanish ? "Archivar" : "Archive") : (isSpanish ? "Restaurar" : "Restore")}</button>
                {!selectedUnit.isActive ? <button data-testid="unit-delete" className="button button-danger" onClick={() => setConfirmTarget({ type: "unit", operation: "delete", record: selectedUnit })}>{isSpanish ? "Eliminar" : "Delete"}</button> : null}
              </div>
            </div>
          ) : null}
          <div className="editor-block unit-import-block">
            <h4>{isSpanish ? "Pegar CSV de disponibilidad" : "Paste Availability CSV"}</h4>
            <p className="helper-copy">{isSpanish ? "Use esto para reportes de disponibilidad como NTV, NTV arrendado, vacante arrendado, vacante listo, fuera de servicio y unidades modelo. Esto actualiza la ocupación de la unidad y crea o actualiza filas activas de make-ready para registros de disponibilidad no ocupados." : "Use this for availability snapshots such as NTV, NTV leased, vacant leased, vacant ready, down, and model units. This updates unit occupancy and creates or updates active make-ready table rows for non-occupied availability records."}</p>
            <div className="unit-import-actions">
              <input
                data-testid="availability-import-file"
                type="file"
                accept=".csv,.txt,.tsv,text/csv,text/tab-separated-values,text/plain"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (!file) return;
                  void file.text().then(setAvailabilityImportText).catch(() => setAvailabilityImportError(isSpanish ? "No se pudo leer ese archivo." : "Could not read that file."));
                }}
              />
              <button type="button" className="button button-secondary" onClick={() => setAvailabilityImportText(availabilityImportSamples.standard)}>{isSpanish ? "Cargar ejemplo" : "Load sample"}</button>
              <button type="button" className="button button-secondary" onClick={() => setShowAvailabilityImportHelp((current) => !current)}>{isSpanish ? "¿Necesita convertir PDF/XLSX?" : "Need to convert PDF/XLSX?"}</button>
              <button type="button" className="button button-secondary" disabled={!availabilityImportText.trim()} onClick={() => setAvailabilityImportText("")}>{isSpanish ? "Limpiar" : "Clear"}</button>
            </div>
            <div className="import-presets" data-testid="availability-import-presets">
              <span className="helper-copy">{isSpanish ? "Presets rápidos:" : "Quick presets:"}</span>
              <button type="button" className="button button-secondary" onClick={() => setAvailabilityImportText(availabilityImportSamples.standard)}>{isSpanish ? "Completo" : "Full"}</button>
              <button type="button" className="button button-secondary" onClick={() => setAvailabilityImportText(availabilityImportSamples.realpage)}>{isSpanish ? "Estilo RealPage" : "RealPage-style"}</button>
              <button type="button" className="button button-secondary" onClick={() => setAvailabilityImportText(availabilityImportSamples.yardi)}>{isSpanish ? "Estilo Yardi" : "Yardi-style"}</button>
              <button type="button" className="button button-secondary" onClick={() => setAvailabilityImportText(availabilityImportSamples.mri)}>{isSpanish ? "Estilo MRI" : "MRI-style"}</button>
              <button type="button" className="button button-secondary" onClick={() => setAvailabilityImportText(availabilityImportSamples.compact)}>{isSpanish ? "Compacto" : "Compact"}</button>
            </div>
            {showAvailabilityImportHelp ? (
              <div className="unit-import-help" data-testid="availability-import-ai-help">
                <div className="admin-section-head">
                  <div>
                    <strong>{isSpanish ? "Asistente de conversión con IA" : "AI conversion helper"}</strong>
                    <p className="helper-copy">{isSpanish ? "Use esto con una exportación PDF/hoja de cálculo de disponibilidad para conservar estados, fechas, nombres de solicitantes y la fecha del reporte. Si el origen se parece a RealPage, pruebe primero el preset Estilo RealPage. Si viene de Yardi o usa columnas como Unit #, Avail Status o Ready Dt, pruebe Estilo Yardi. Si usa encabezados como Unit Code, Plan Code, Notice Date o Snapshot Date, pruebe Estilo MRI." : "Use this with an availability PDF/spreadsheet export to preserve statuses, dates, applicant names, and the report date. If the source looks like RealPage, try the RealPage-style preset first. If it comes from Yardi or uses columns like Unit #, Avail Status, or Ready Dt, try Yardi-style. If it uses headers like Unit Code, Plan Code, Notice Date, or Snapshot Date, try MRI-style."}</p>
                  </div>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => void navigator.clipboard?.writeText(availabilityAiPrompt)}
                  >
                    {isSpanish ? "Copiar prompt" : "Copy prompt"}
                  </button>
                </div>
                <textarea readOnly rows={12} value={availabilityAiPrompt} />
              </div>
            ) : null}
            <textarea data-testid="availability-import-csv" rows={5} value={availabilityImportText} onChange={(event) => setAvailabilityImportText(event.target.value)} placeholder={"unit,floorPlan,sqft,availabilityStatus,vacancyStatus,moveOutDate,vacatedDate,daysVacant,makeReadyDate,moveInDate,applicant,reportDate\n081,B1,1186,Vacant Not Leased Not Ready,VACANT NOT LEASED NOT READY,,2026-05-04,19,2026-05-05,,,2026-06-07"} />
            {availabilityImportPreview ? (
              <div className="unit-import-preview" data-testid="availability-import-preview">
                <span><strong>{selectedProperty?.code ?? (isSpanish ? "Sin propiedad" : "No property")}</strong> {isSpanish ? "destino" : "target"}</span>
                <span><strong>{availabilityImportPreview.rows}</strong> {isSpanish ? "filas" : "rows"}</span>
                <span><strong>{availabilityImportPreview.unitCreates}</strong> {isSpanish ? "unidades nuevas" : "units new"}</span>
                <span><strong>{availabilityImportPreview.unitUpdates}</strong> {isSpanish ? "unidades por actualizar" : "units update"}</span>
                <span><strong>{availabilityImportPreview.turnCreates}</strong> {isSpanish ? "rotaciones nuevas" : "turns new"}</span>
                <span><strong>{availabilityImportPreview.turnUpdates}</strong> {isSpanish ? "rotaciones por actualizar" : "turns update"}</span>
                <span><strong>{availabilityImportPreview.applicants}</strong> {isSpanish ? "solicitantes" : "applicants"}</span>
                {Object.entries(availabilityImportPreview.statuses).map(([status, count]) => <span key={status}><strong>{count}</strong> {occupancyLabel(status, language)}</span>)}
              </div>
            ) : null}
            {availabilityImportPreview?.ignoredRows.length ? (
              <div className="admin-message warning">
                <strong>{availabilityImportPreview.ignoredRows.length}</strong>{" "}
                {isSpanish
                  ? `fila${availabilityImportPreview.ignoredRows.length === 1 ? "" : "s"} sin unidad fueron omitidas como encabezados/amenidades/ruido del reporte.`
                  : `blank-unit row${availabilityImportPreview.ignoredRows.length === 1 ? "" : "s"} were ignored as report heading/amenity noise.`}
                <ul className="compact-list">
                  {availabilityImportPreview.ignoredRows.slice(0, 5).map((sample) => (
                    <li key={sample}>{sample}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {availabilityImportPreview?.changes.length ? (
              <div className="admin-message warning" data-testid="availability-import-diff-preview">
                <strong>{availabilityImportPreview.changes.length}</strong> {isSpanish ? "rotaciones existentes tienen diferencias con el reporte. La importación actualizará los campos incluidos y dejará sin cambios los campos omitidos." : "existing turns have report differences. Import will update provided report fields and keep omitted fields unchanged."}
                <div className="unit-import-actions">
                  <span className="helper-copy">{isSpanish ? "Se muestran todas las unidades con diferencias en orden de unidad." : "All changed units are shown below in unit order."}</span>
                  <button type="button" className="button button-secondary" onClick={() => void navigator.clipboard?.writeText(availabilityPreviewReviewText)}>
                    {isSpanish ? "Copiar lista completa" : "Copy Full List"}
                  </button>
                </div>
                <ul className="compact-list import-review-list">
                  {availabilityImportPreview.changes.map((change) => (
                    <li key={change.unit}><strong>{change.unit}</strong>: {change.fields.join("; ")}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {availabilityImportPreview?.parityAlerts.length ? (
              <div className="admin-message warning" data-testid="availability-import-parity-alerts">
                <strong>{availabilityImportPreview.parityAlerts.length}</strong>{" "}
                {isSpanish
                  ? `${availabilityImportPreview.parityAlerts.length === 1 ? "unidad" : "unidades"} tienen desajustes de estado listo entre MakeReadyOS y el reporte fuente. Revise estos casos antes de importar para no perder paridad con RealPage/Yardi.`
                  : `unit${availabilityImportPreview.parityAlerts.length === 1 ? "" : "s"} have ready-status parity mismatches between MakeReadyOS and the source report. Review these before importing so RealPage/Yardi parity is not missed.`}
                <ul className="compact-list">
                  {availabilityImportPreview.parityAlerts.map((alert) => (
                    <li key={`${alert.unit}:${alert.type}`}>
                      <strong>{alert.unit}</strong>:{" "}
                      {alert.type === "LOCAL_AHEAD"
                        ? (isSpanish
                            ? `MakeReadyOS ya muestra la unidad como lista o terminada, pero el reporte todavía no. Actualice el sistema fuente antes de importar si MakeReadyOS es correcto.`
                            : `MakeReadyOS already shows this unit as ready/completed, but the report does not. Update the source system before importing if MakeReadyOS is correct.`)
                        : (isSpanish
                            ? `El reporte muestra la unidad como lista, pero MakeReadyOS todavía no. Confirme si el tablero local está atrasado antes de sobrescribirlo.`
                            : `The report shows this unit as ready, but MakeReadyOS does not yet. Confirm whether the local board is behind before overwriting it.`)}{" "}
                      {isSpanish ? "Local" : "Local"}: {occupancyLabel(alert.localVacancyStatus, language)} / {(alert.localMakeReadyStatus || (isSpanish ? "sin estado" : "unset"))}.{" "}
                      {isSpanish ? "Reporte" : "Report"}: {occupancyLabel(alert.reportVacancyStatus, language)} / {(alert.reportMakeReadyStatus || (isSpanish ? "sin estado" : "unset"))}.{" "}
                      {isSpanish ? "Último cambio local" : "Last local change"}: {formatDateTime(alert.updatedAt)}.{" "}
                      {isSpanish ? "Fecha del reporte" : "Report date"}: {formatDateTime(alert.reportDate)}.
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {availabilityImportConflicts?.length ? (
              <div className="admin-message warning" data-testid="availability-import-conflicts">
                <strong>{availabilityImportConflicts.length}</strong> {isSpanish ? `rotaci${availabilityImportConflicts.length === 1 ? "ón" : "ones"} tienen cambios locales más nuevos o más avanzados que este reporte. MakeReadyOS bloqueó la importación para que el reporte antiguo no sobrescriba silenciosamente el progreso local.` : `turn${availabilityImportConflicts.length === 1 ? "" : "s"} have newer or more advanced local board changes than this report. MakeReadyOS blocked the import so the stale report cannot silently overwrite local progress.`}
                <div className="unit-import-actions">
                  <span className="helper-copy">{isSpanish ? "Se muestran todos los conflictos bloqueados para revisión antes de sobrescribir." : "All blocked conflicts are shown below for review before overriding."}</span>
                  <button type="button" className="button button-secondary" onClick={() => void navigator.clipboard?.writeText(availabilityConflictReviewText)}>
                    {isSpanish ? "Copiar conflictos" : "Copy Conflicts"}
                  </button>
                </div>
                <ul className="compact-list import-review-list">
                  {availabilityImportConflicts
                    .slice()
                    .sort((left, right) => compareUnitLike(left.unitNumber, right.unitNumber))
                    .map((conflict) => (
                    <li key={conflict.itemId}>
                      <strong>{conflict.unitNumber}</strong>: {conflict.reason}{" "}
                      {conflict.conflictKind === "LOCAL_AHEAD_READY"
                        ? (isSpanish
                            ? "Acción recomendada: primero confirme o actualice el sistema fuente para que refleje el estado listo/terminado actual."
                            : "Recommended action: first confirm or update the source system so it reflects the current ready/completed state.")
                        : (isSpanish
                            ? "Acción recomendada: compare las ediciones locales más nuevas antes de permitir que el reporte las reemplace."
                            : "Recommended action: compare the newer local edits before allowing the report to replace them." )}{" "}
                      {conflict.recommendedAction}{" "}
                      {isSpanish ? "Último cambio local" : "Last local change"}: {formatDateTime(conflict.updatedAt)}.{" "}
                      {isSpanish ? "Fecha del reporte" : "Report date"}: {formatDateTime(conflict.reportDate)}.{" "}
                      {conflict.fieldChanges.join("; ")}
                    </li>
                  ))}
                </ul>
                <div className="unit-import-actions">
                  <button type="button" className="button button-primary" onClick={() => void importAvailabilityReport(true)}>
                    {isSpanish ? "Sobrescribir e importar valores del reporte" : "Override And Import Report Values"}
                  </button>
                  <button type="button" className="button button-secondary" onClick={() => setAvailabilityImportConflicts(null)}>
                    {isSpanish ? "Conservar valores locales del tablero" : "Keep Local Board Values"}
                  </button>
                </div>
              </div>
            ) : null}
            {availabilityImportParseError ? <p className="admin-message error">{availabilityImportParseError}</p> : null}
            {availabilityImportError ? <p className="admin-message error">{availabilityImportError}</p> : null}
            {lastAvailabilityImport ? (
              <div className="admin-message success" data-testid="availability-import-last-import">
                {isSpanish
                  ? `Última importación de disponibilidad a ${lastAvailabilityImport.property.code}: ${lastAvailabilityImport.summary.turnsCreated} rotaciones creadas, ${lastAvailabilityImport.summary.turnsUpdated} rotaciones actualizadas, ${lastAvailabilityImport.summary.unitsCreated} unidades creadas, ${lastAvailabilityImport.summary.unitsUpdated} unidades actualizadas.`
                  : `Last availability import to ${lastAvailabilityImport.property.code}: ${lastAvailabilityImport.summary.turnsCreated} turns created, ${lastAvailabilityImport.summary.turnsUpdated} turns updated, ${lastAvailabilityImport.summary.unitsCreated} units created, ${lastAvailabilityImport.summary.unitsUpdated} units updated.`}
              </div>
            ) : null}
            <button data-testid="availability-import-submit" className="button button-primary" disabled={loading || !properties.length || !selectedPropertyId || !availabilityImportText.trim()} onClick={() => void importAvailabilityReport()}>{isSpanish ? "Importar disponibilidad y llenar tablero" : "Import Availability & Populate Board"}</button>
          </div>
          <div className="editor-block unit-import-block">
            <h4>{isSpanish ? "Pegar CSV del directorio de unidades" : "Paste Unit Directory CSV"}</h4>
            <p className="helper-copy">{isSpanish ? "Use esto solo para inventario permanente. Actualiza el estado ocupado/vacante del directorio, pero no crea filas activas de make-ready. Para poblar el tablero, use el CSV de disponibilidad de arriba." : "Use this for permanent inventory only. It updates occupied/vacant directory status but does not create active make-ready table rows. For board population, use Availability CSV above."}</p>
            <div className="unit-import-actions">
              <input
                data-testid="unit-import-file"
                type="file"
                accept=".csv,.txt,.tsv,text/csv,text/tab-separated-values,text/plain"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (!file) return;
                  void file.text().then(setUnitImportText).catch(() => setUnitImportError(isSpanish ? "No se pudo leer ese archivo." : "Could not read that file."));
                }}
              />
              <button type="button" className="button button-secondary" onClick={() => setUnitImportText(unitDirectoryImportSamples.standard)}>{isSpanish ? "Cargar ejemplo" : "Load sample"}</button>
              <button type="button" className="button button-secondary" onClick={() => setShowImportHelp((current) => !current)}>{isSpanish ? "¿Necesita convertir Excel/PDF?" : "Need to convert Excel/PDF?"}</button>
              <button type="button" className="button button-secondary" disabled={!unitImportText.trim()} onClick={() => setUnitImportText("")}>{isSpanish ? "Limpiar" : "Clear"}</button>
            </div>
            <div className="import-presets" data-testid="unit-import-presets">
              <span className="helper-copy">{isSpanish ? "Presets rápidos:" : "Quick presets:"}</span>
              <button type="button" className="button button-secondary" onClick={() => setUnitImportText(unitDirectoryImportSamples.standard)}>{isSpanish ? "Completo" : "Full"}</button>
              <button type="button" className="button button-secondary" onClick={() => setUnitImportText(unitDirectoryImportSamples.combined)}>{isSpanish ? "Edificio + unidad" : "Building + unit"}</button>
              <button type="button" className="button button-secondary" onClick={() => setUnitImportText(unitDirectoryImportSamples.yardi)}>{isSpanish ? "Estilo Yardi" : "Yardi-style"}</button>
              <button type="button" className="button button-secondary" onClick={() => setUnitImportText(unitDirectoryImportSamples.mri)}>{isSpanish ? "Estilo MRI" : "MRI-style"}</button>
              <button type="button" className="button button-secondary" onClick={() => setUnitImportText(unitDirectoryImportSamples.sparse)}>{isSpanish ? "Mínimo" : "Minimal"}</button>
            </div>
            {showImportHelp ? (
              <div className="unit-import-help" data-testid="unit-import-ai-help">
                <div className="admin-section-head">
                  <div>
                    <strong>{isSpanish ? "Asistente de conversión con IA" : "AI conversion helper"}</strong>
                    <p className="helper-copy">{isSpanish ? "Use esto con una exportación de hoja de cálculo/PDF cuando necesite un CSV listo para MakeReadyOS. Si el origen mezcla edificio y unidad en una sola columna, pruebe primero el preset Edificio + unidad. Si viene de Yardi o usa columnas como Unit #, Unit Type u Occupancy Eligible, pruebe Estilo Yardi. Si usa encabezados como Unit Code, Plan Code o Status Description, pruebe Estilo MRI." : "Use this with a spreadsheet/PDF export when you need a MakeReadyOS-ready CSV. If the source combines building and unit in one column, try the Building + unit preset first. If it comes from Yardi or uses columns like Unit #, Unit Type, or Occupancy Eligible, try Yardi-style. If it uses headers like Unit Code, Plan Code, or Status Description, try MRI-style."}</p>
                  </div>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => void navigator.clipboard?.writeText(unitDirectoryAiPrompt)}
                  >
                    {isSpanish ? "Copiar prompt" : "Copy prompt"}
                  </button>
                </div>
                <textarea readOnly rows={10} value={unitDirectoryAiPrompt} />
              </div>
            ) : null}
            <textarea data-testid="unit-import-csv" rows={5} value={unitImportText} onChange={(event) => setUnitImportText(event.target.value)} placeholder={"unit\tbuilding\tfloorPlan\tbeds\tbaths\tsqft\toccupancyStatus\n101\t1\tA1\t1\t1\t720\tOCCUPIED"} />
            {unitImportPreview ? (
              <div className="unit-import-preview" data-testid="unit-import-preview">
                {unitImportPreview.ignoredRows.length ? (
                  <p className="helper-copy">
                    <strong>{unitImportPreview.ignoredRows.length}</strong>{" "}
                    {isSpanish
                      ? `fila${unitImportPreview.ignoredRows.length === 1 ? "" : "s"} sin unidad fueron omitidas como encabezados/resúmenes/ruido del directorio.`
                      : `blank-unit row${unitImportPreview.ignoredRows.length === 1 ? "" : "s"} were ignored as directory heading/summary noise.`}
                    {" "}
                    {unitImportPreview.ignoredRows.slice(0, 5).map((sample) => (
                      <code key={sample}>{sample}</code>
                    ))}
                  </p>
                ) : null}
                <span><strong>{selectedProperty?.code ?? (isSpanish ? "Sin propiedad" : "No property")}</strong> {isSpanish ? "destino" : "target"}</span>
                <span><strong>{unitImportPreview.rows}</strong> {isSpanish ? "filas" : "rows"}</span>
                <span><strong>{unitImportPreview.creates}</strong> {isSpanish ? "nuevas" : "new"}</span>
                <span><strong>{unitImportPreview.updates}</strong> {isSpanish ? "actualizaciones" : "updates"}</span>
                <span><strong>{unitImportPreview.budgeted}</strong> {isSpanish ? "presupuestadas" : "budgeted"}</span>
                {Object.entries(unitImportPreview.statuses).map(([status, count]) => <span key={status}><strong>{count}</strong> {occupancyLabel(status, language)}</span>)}
              </div>
            ) : null}
            {unitImportPreview?.createDetails.length ? (
              <div className="admin-message warning">
                <strong>{unitImportPreview.createDetails.length}</strong> {isSpanish ? `unidad${unitImportPreview.createDetails.length === 1 ? "" : "es"} nuevas se crearán en el directorio.` : `new unit${unitImportPreview.createDetails.length === 1 ? "" : "s"} will be created in the directory.`}
                <ul className="helper-list">
                  {unitImportPreview.createDetails.map((created) => (
                    <li key={created.unit}>
                      <strong>{created.unit}</strong>: {created.summary}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {unitImportPreview?.updateDetails.length ? (
              <div className="admin-message warning">
                <strong>{unitImportPreview.updateDetails.length}</strong> {isSpanish ? `unidad${unitImportPreview.updateDetails.length === 1 ? "" : "es"} existentes tienen diferencias con el directorio pegado.` : `existing unit${unitImportPreview.updateDetails.length === 1 ? "" : "s"} have differences from the pasted directory.`}
                <div className="drawer-history-header">
                  <span className="helper-copy">{isSpanish ? "Se muestran todas las unidades por actualizar en orden de unidad." : "All units to update are shown below in unit order."}</span>
                  <button type="button" className="button button-secondary" onClick={() => void navigator.clipboard?.writeText(unitPreviewReviewText)}>
                    {isSpanish ? "Copiar revisión" : "Copy review"}
                  </button>
                </div>
                <ul className="helper-list">
                  {unitImportPreview.updateDetails.map((updated) => (
                    <li key={updated.unit}>
                      <strong>{updated.unit}</strong>: {updated.fields.join("; ")}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {unitImportParseError ? <p className="admin-message error">{unitImportParseError}</p> : null}
            {unitImportError ? <p className="admin-message error">{unitImportError}</p> : null}
            {lastImport ? (
              <div className="admin-message warning" data-testid="unit-import-last-import">
                {isSpanish
                  ? `Última importación a ${lastImport.property.code}: ${lastImport.summary.created} creadas, ${lastImport.summary.updated} actualizadas, ${lastImport.summary.skipped} omitidas, ${lastImport.summary.floorPlansCreated ?? 0} planos creados, ${lastImport.summary.floorPlansUpdated ?? 0} planos actualizados.`
                  : `Last import to ${lastImport.property.code}: ${lastImport.summary.created} created, ${lastImport.summary.updated} updated, ${lastImport.summary.skipped} skipped, ${lastImport.summary.floorPlansCreated ?? 0} floor plans created, ${lastImport.summary.floorPlansUpdated ?? 0} floor plans updated.`}
                {lastImport.createdUnitIds.length > 0 ? (
                  <button type="button" className="button button-danger" disabled={loading} onClick={() => void revertLastUnitImport()}>
                    {isSpanish ? "Deshacer unidades creadas" : "Undo created units"}
                  </button>
                ) : <span>{isSpanish ? " No hay unidades creadas para deshacer." : " No created units to undo."}</span>}
              </div>
            ) : null}
            <button data-testid="unit-import-submit" className="button button-secondary" disabled={loading || !properties.length || !selectedPropertyId || !unitImportText.trim()} onClick={() => void importUnitDirectory()}>{isSpanish ? "Importar / actualizar directorio" : "Import / Update Directory"}</button>
          </div>
        </article>
      </section>

      <section className="operations-grid turns-grid">
        <article className="operations-card" data-testid="turn-create-panel">
          <div className="admin-section-head">
            <h3>{isSpanish ? "Nuevo elemento de make-ready" : "New Make-Ready Item"}</h3>
            <span className="subtitle">{isSpanish ? "Crear una rotación desde una unidad activa" : "Create a turnover from an active unit"}</span>
          </div>
          <div className="turn-form">
            <label>{isSpanish ? "Propiedad" : "Property"}<select data-testid="item-create-property" value={newItem.propertyId} onChange={(event) => setNewItem((current) => ({ ...current, propertyId: event.target.value, unitId: "" }))}>{activeProperties.map((property) => <option key={property.id} value={property.id}>{property.code} - {property.name}</option>)}</select></label>
            <label>{isSpanish ? "Unidad" : "Unit"}
              <UnitSearchSelect
                units={activeUnitsForItem}
                value={newItem.unitId}
                onChange={chooseItemUnit}
                placeholder={isSpanish ? "Buscar unidad..." : "Search unit..."}
                emptyLabel={isSpanish ? "No hay unidad seleccionada" : "No unit selected"}
              />
            </label>
            <label>{isSpanish ? "Sección" : "Section"}<select data-testid="item-create-group" value={newItem.boardGroup} onChange={(event) => setNewItem((current) => ({ ...current, boardGroup: event.target.value }))}>{sectionsForNewItem.map((section) => <option key={section.id} value={section.key}>{section.displayName}</option>)}</select></label>
            <label>{isSpanish ? "Vacancia" : "Vacancy"}<select data-testid="item-create-vacancy" value={newItem.vacancyStatus} onChange={(event) => setNewItem((current) => ({ ...current, vacancyStatus: event.target.value }))}>{labelOptions("vacancyStatus").map((option) => <option key={option.id} value={option.value}>{option.value}</option>)}</select></label>
            <label>{isSpanish ? "Estado de make-ready" : "Make-ready status"}<select data-testid="item-create-status" value={newItem.makeReadyStatus} onChange={(event) => setNewItem((current) => ({ ...current, makeReadyStatus: event.target.value }))}><option value="">{isSpanish ? "Sin definir" : "Unset"}</option>{labelOptions("makeReadyStatus").map((option) => <option key={option.id} value={option.value}>{option.value}</option>)}</select></label>
            <label>{isSpanish ? "Alcance" : "Scope"}<select data-testid="item-create-scope" value={newItem.scopeLevel} onChange={(event) => setNewItem((current) => ({ ...current, scopeLevel: event.target.value }))}><option value="">{isSpanish ? "Sin definir" : "Unset"}</option>{labelOptions("scopeLevel").map((option) => <option key={option.id} value={option.value}>{option.value}</option>)}</select></label>
            <label>{isSpanish ? "Técnico asignado" : "Assigned tech"}
              <SearchSelect
                options={staffOptions}
                value={newItem.assignedTech}
                onChange={(assignedTech) => setNewItem((current) => ({ ...current, assignedTech }))}
                placeholder={isSpanish ? "Buscar técnico..." : "Search tech..."}
                emptyLabel={isSpanish ? "Sin asignar" : "Unassigned"}
                noMatchesLabel={isSpanish ? "No hay técnicos coincidentes" : "No matching techs"}
                clearLabel={isSpanish ? "Quitar técnico asignado" : "Clear assigned tech"}
              />
            </label>
            <label>{isSpanish ? "Fecha de make-ready" : "Make-ready date"}<input data-testid="item-create-make-ready-date" type="date" value={newItem.makeReadyDate} onChange={(event) => setNewItem((current) => ({ ...current, makeReadyDate: event.target.value }))} /></label>
            <label>{isSpanish ? "Fecha de mudanza" : "Move-in date"}<input data-testid="item-create-move-in-date" type="date" value={newItem.moveInDate} onChange={(event) => setNewItem((current) => ({ ...current, moveInDate: event.target.value }))} /></label>
            {newItemActiveTurn ? (
              <div className="turn-create-guard span-full">
                <strong>{isSpanish ? "Esta unidad ya tiene una rotación activa." : "This unit already has an active turn."}</strong>
                <span>
                  {newItemActiveTurn.unitNumber} / {displayGroup(newItemActiveTurn.boardGroup)}
                  {newItemActiveTurn.makeReadyStatus ? ` / ${newItemActiveTurn.makeReadyStatus}` : ""}
                  {newItemActiveTurn.assignedTech ? ` / ${newItemActiveTurn.assignedTech}` : ""}
                </span>
                <div className="turn-create-guard-actions">
                  <button type="button" className="button button-secondary" onClick={() => onOpenItem(newItemActiveTurn.id)}>
                    {isSpanish ? "Abrir rotación activa" : "Open active turn"}
                  </button>
                  <small>{isSpanish ? "Archive o restaure esa rotación explícitamente antes de crear otra para esta unidad." : "Archive or restore that turn explicitly before creating another one for this unit."}</small>
                </div>
              </div>
            ) : null}
            <button data-testid="item-create-submit" className="button button-primary span-full" disabled={loading || !newItem.unitId || Boolean(newItemActiveTurn)} onClick={() => void createItem()}>{isSpanish ? "Crear elemento de make-ready" : "Create Make-Ready Item"}</button>
          </div>
        </article>

        <article className="operations-card" data-testid="turn-lifecycle-panel">
          <div className="admin-section-head">
            <div>
              <h3>{isSpanish ? "Archivo / Unidades ocupadas" : "Archive / Occupied Units"}</h3>
              <p className="helper-copy">{isSpanish ? "Cada elemento de make-ready es una rotación. Archive las rotaciones completadas después de la mudanza manteniendo disponible el historial por unidad, fotos, comentarios, proveedores, listas, riesgo y actividad para consulta." : "Each make-ready item is one turn. Archive completed turns after move-in while keeping unit-level history, photos, comments, vendors, checklists, risk, and activity available for lookup."}</p>
            </div>
            <div className="archive-history-controls">
              <input
                data-testid="turn-history-search"
                value={turnHistorySearch}
                onChange={(event) => setTurnHistorySearch(event.target.value)}
                placeholder={isSpanish ? "Buscar unidad, solicitante o técnico" : "Search unit, applicant, tech"}
              />
              <label className="toolbar-select">
                <span className="sr-only">{isSpanish ? "Modo de archivo de rotaciones" : "Turn archive mode"}</span>
                <select data-testid="item-archive-mode" value={turnArchiveMode} onChange={(event) => setTurnArchiveMode(event.target.value as ArchiveFilter)}>
                  <option value="active">{isSpanish ? "Rotaciones activas" : "Active turns"}</option>
                  <option value="archived">{isSpanish ? "Solo archivo" : "Archive only"}</option>
                  <option value="occupied">{isSpanish ? "Ocupadas" : "Occupied"}</option>
                  <option value="all">{isSpanish ? "Activas + archivo" : "Active + archive"}</option>
                </select>
              </label>
            </div>
          </div>
          <div className="archive-history-filter-grid">
            <label>
              <span>{isSpanish ? "Unidad" : "Unit"}</span>
              <select value={turnHistoryUnitFilter} onChange={(event) => setTurnHistoryUnitFilter(event.target.value)}>
                <option value="">{isSpanish ? "Todas las unidades" : "All units"}</option>
                {historyUnitsForProperty.map((unit) => <option key={unit.id} value={unit.id}>{unit.number}</option>)}
              </select>
            </label>
            <label>
              <span>{isSpanish ? "Solicitante previo" : "Prior applicant"}</span>
              <input
                value={turnHistoryApplicantFilter}
                onChange={(event) => setTurnHistoryApplicantFilter(event.target.value)}
                placeholder={isSpanish ? "Filtrar solicitante si existe" : "Filter applicant if stored"}
              />
            </label>
            <label>
              <span>{isSpanish ? "Motivo / disponibilidad" : "Turn reason / availability"}</span>
              <select value={turnHistoryReasonFilter} onChange={(event) => setTurnHistoryReasonFilter(event.target.value)}>
                <option value="">{isSpanish ? "Todos los motivos" : "All reasons"}</option>
                {turnReasonOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label>
              <span>{isSpanish ? "Etapa de inspección" : "Inspection stage"}</span>
              <select value={turnHistoryStageFilter} onChange={(event) => setTurnHistoryStageFilter(event.target.value)}>
                <option value="">{isSpanish ? "Todas las etapas" : "All stages"}</option>
                {turnStageOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label>
              <span>{isSpanish ? "Campo de fecha" : "Date field"}</span>
              <select value={turnHistoryDateField} onChange={(event) => setTurnHistoryDateField(event.target.value as TurnHistoryDateField)}>
                <option value="vacatedDate">{isSpanish ? "Fecha desocupada" : "Vacated date"}</option>
                <option value="makeReadyDate">{isSpanish ? "Fecha make-ready" : "Make-ready date"}</option>
                <option value="moveInDate">{isSpanish ? "Fecha de mudanza" : "Move-in date"}</option>
                <option value="archivedAt">{isSpanish ? "Fecha archivada" : "Archived date"}</option>
                <option value="updatedAt">{isSpanish ? "Última actualización" : "Last updated"}</option>
              </select>
            </label>
            <label>
              <span>{isSpanish ? "Desde" : "From"}</span>
              <input type="date" value={turnHistoryDateStart} onChange={(event) => setTurnHistoryDateStart(event.target.value)} />
            </label>
            <label>
              <span>{isSpanish ? "Hasta" : "To"}</span>
              <input type="date" value={turnHistoryDateEnd} onChange={(event) => setTurnHistoryDateEnd(event.target.value)} />
            </label>
            <div className="archive-history-filter-actions">
              <button
                type="button"
                className="button button-secondary"
                disabled={!hasTurnHistoryFilters}
                onClick={() => {
                  setTurnHistoryUnitFilter("");
                  setTurnHistoryApplicantFilter("");
                  setTurnHistoryReasonFilter("");
                  setTurnHistoryStageFilter("");
                  setTurnHistoryDateField("vacatedDate");
                  setTurnHistoryDateStart("");
                  setTurnHistoryDateEnd("");
                }}
              >
                {isSpanish ? "Limpiar filtros" : "Clear filters"}
              </button>
              <small>
                {turnArchiveMode === "occupied"
                  ? (isSpanish ? "Las fechas, solicitantes y etapas aplican a rotaciones; en Ocupadas se prioriza unidad y búsqueda." : "Date/applicant/stage filters apply to turns; Occupied mode primarily uses unit and text search.")
                  : (isSpanish ? "Use filtros por unidad, rango de fechas, solicitante, motivo y etapa para revisar daños o reparaciones recurrentes." : "Filter by unit, date window, applicant, reason, and stage to spot recurring repairs or damage patterns.")}
              </small>
            </div>
          </div>
          <div className="operations-mini-stats wrap">
            <span><strong>{activeTurns.length}</strong> {isSpanish ? "rotaciones activas" : "active turns"}</span>
            <span><strong>{archivedTurns.length}</strong> {isSpanish ? "rotaciones archivadas" : "archived turns"}</span>
            <span><strong>{occupiedCount}</strong> {isSpanish ? "unidades ocupadas en directorio" : "occupied directory units"}</span>
            <span><strong>{visibleHistoryCount}</strong> {isSpanish ? "mostradas" : "shown"}</span>
          </div>
          {turnArchiveMode === "occupied" && occupiedTurnConflicts.length ? (
            <div className="admin-message warning" data-testid="occupied-reconciliation-panel">
              <strong>
                {occupiedTurnConflicts.length}{" "}
                {isSpanish
                  ? `unidad${occupiedTurnConflicts.length === 1 ? "" : "es"} ocupada${occupiedTurnConflicts.length === 1 ? "" : "s"} todavia ${occupiedTurnConflicts.length === 1 ? "tiene" : "tienen"} una rotacion activa en el tablero.`
                  : `occupied unit${occupiedTurnConflicts.length === 1 ? "" : "s"} still ${occupiedTurnConflicts.length === 1 ? "has" : "have"} an active board turn.`}
              </strong>
              <div className="unit-import-actions">
                <span className="helper-copy">
                  {isSpanish
                    ? "Use esto para limpiar unidades ya ocupadas en RealPage/Yardi que siguen visibles en MakeReadyOS."
                    : "Use this to clear units already occupied in RealPage/Yardi that still remain visible in MakeReadyOS."}
                </span>
                <button
                  type="button"
                  className="button button-danger"
                  disabled={loading || occupiedReconciliationBusy}
                  onClick={() => void archiveAllOccupiedConflicts()}
                >
                  {isSpanish ? "Archivar todas las rotaciones activas visibles" : "Archive All Visible Active Turns"}
                </button>
              </div>
              <ul className="compact-list import-review-list">
                {occupiedTurnConflicts.map(({ unit, activeTurn, turnCount }) => (
                  <li key={unit.id}>
                    <strong>{unit.number}</strong>:{" "}
                    {isSpanish
                      ? `el directorio indica Ocupada, pero el tablero aun muestra ${displayGroup(activeTurn.boardGroup)} / ${activeTurn.vacancyStatus || activeTurn.makeReadyStatus || "Activa"}.`
                      : `directory says Occupied, but the board still shows ${displayGroup(activeTurn.boardGroup)} / ${activeTurn.vacancyStatus || activeTurn.makeReadyStatus || "Active"}.`}{" "}
                    {isSpanish ? "Rotaciones previas" : "Prior turns"}: {turnCount}.{" "}
                    {activeTurn.moveInDate ? `${isSpanish ? "Mudanza" : "Move-in"}: ${activeTurn.moveInDate.slice(0, 10)}. ` : ""}
                    <button type="button" className="button button-secondary" onClick={() => onOpenItem(activeTurn.id)}>
                      {isSpanish ? "Abrir rotacion" : "Open turn"}
                    </button>{" "}
                    <button
                      type="button"
                      className="button button-danger"
                      disabled={loading || occupiedReconciliationBusy}
                      onClick={() => void archiveOccupiedConflict({ unit, activeTurn })}
                    >
                      {isSpanish ? "Archivar rotacion" : "Archive turn"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {turnArchiveMode === "occupied" && occupiedReconciliationMessage ? (
            <div className="admin-message success">{occupiedReconciliationMessage}</div>
          ) : null}
          <div className="turn-list">
            {turnArchiveMode === "occupied" ? (
              occupiedDirectoryRows.length === 0 ? (
                <StatusState title={isSpanish ? "No hay unidades ocupadas en el directorio" : "No occupied directory units"} description={isSpanish ? "Importe un directorio de unidades con unidades ocupadas o cambie de modo para revisar rotaciones activas y archivadas." : "Import a unit directory with occupied units, or switch modes to review active and archived make-ready turns."} tone="subtle" />
              ) : occupiedDirectoryRows.slice(0, 80).map((unit) => {
                const turnCount = turnsByUnit.get(`${unit.propertyId}|${unit.id}`) ?? turnsByUnit.get(`${unit.propertyId}|${unit.number}`) ?? 0;
                const activeTurn = existingActiveTurnsByUnitId.get(unit.id) ?? null;
                return (
                  <div className="turn-row" data-testid={`occupied-unit-row-${unit.number.toLowerCase()}`} key={unit.id}>
                    <div>
                      <strong>{unit.property.code} {unit.number}</strong>
                      <span>{unit.property.name} / {unit.floorPlanRecord ? floorPlanLabel(unit.floorPlanRecord) : unit.floorPlan || (isSpanish ? "Sin plano" : "No floor plan")} / {turnCount} {isSpanish ? "rotación(es) previas" : "prior turn(s)"}</span>
                      <small>{unit.building ? `${isSpanish ? "Edificio" : "Building"} ${unit.building}` : (isSpanish ? "Sin edificio" : "No building")} / {unit.area || (isSpanish ? "Sin área" : "No area")} / {unit.floor ? `${isSpanish ? "Piso" : "Floor"} ${unit.floor}` : (isSpanish ? "Sin piso" : "No floor")} / {unit.isBudgeted ? (isSpanish ? "Presupuestada" : "Budgeted") : (isSpanish ? "No presupuestada" : "Non-budgeted")}</small>
                    </div>
                    <span className={activeTurn ? "status-chip warning" : "status-chip active"}>{activeTurn ? (isSpanish ? "Rotación activa" : "Active turn exists") : (isSpanish ? "Ocupada" : "Occupied")}</span>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => {
                        setSelectedPropertyId(unit.propertyId);
                        setSelectedUnitId(unit.id);
                        setHistoryInspectorUnitId(unit.id);
                      }}
                    >
                      {isSpanish ? "Editar unidad" : "Edit unit"}
                    </button>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => {
                        setSelectedPropertyId(unit.propertyId);
                        setHistoryInspectorUnitId(unit.id);
                      }}
                    >
                      {isSpanish ? "Historial" : "History"}
                    </button>
                    <button
                      type="button"
                      className="button button-primary"
                      onClick={() => {
                        if (activeTurn) {
                          onOpenItem(activeTurn.id);
                          return;
                        }
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
                      {activeTurn ? (isSpanish ? "Abrir activa" : "Open active") : (isSpanish ? "Iniciar rotación" : "Start turn")}
                    </button>
                    {activeTurn ? (
                      <button
                        type="button"
                        className="button button-danger"
                        disabled={loading || occupiedReconciliationBusy}
                        onClick={() => void archiveOccupiedConflict({ unit, activeTurn })}
                      >
                        {isSpanish ? "Archivar rotación" : "Archive turn"}
                      </button>
                    ) : null}
                  </div>
                );
              })
            ) : visibleItems.length === 0 ? <StatusState title={isSpanish ? "No hay registros de rotación" : "No turnover records"} description={isSpanish ? "Cree un elemento de make-ready o cambie a Ocupadas para revisar unidades ocupadas importadas." : "Create a make-ready item or switch to Occupied to review imported occupied directory units."} tone="subtle" /> : visibleItems.slice(0, 40).map((item) => (
              <div className="turn-row" data-testid={`turn-row-${item.unitNumber.toLowerCase()}`} key={item.id}>
                <div>
                  <strong>{item.unitNumber}</strong>
                  <span>{item.property.code} / {displayGroup(item.boardGroup)} / {turnsByUnit.get(`${item.propertyId}|${item.unitId ?? item.unitNumber}`) ?? 1} {isSpanish ? "rotación(es)" : "turn(s)"}</span>
                  <small>{item.vacatedDate ? `${isSpanish ? "Desocupada" : "Vacated"} ${item.vacatedDate.slice(0, 10)}` : (isSpanish ? "Sin fecha de desocupación" : "No vacated date")} / {item.moveInDate ? `${isSpanish ? "Mudanza" : "Move-in"} ${item.moveInDate.slice(0, 10)}` : (isSpanish ? "Sin fecha de mudanza" : "No move-in date")}</small>
                </div>
                <span className={item.isArchived ? "status-chip inactive" : "status-chip active"}>{item.isArchived ? (isSpanish ? "Archivada" : "Archived") : item.makeReadyStatus || (isSpanish ? "Activa" : "Active")}</span>
                <button type="button" className="button button-secondary" onClick={() => onOpenItem(item.id)}>{isSpanish ? "Detalles" : "Details"}</button>
                {item.unitId ? <button type="button" className="button button-secondary" onClick={() => setHistoryInspectorUnitId(item.unitId!)}>{isSpanish ? "Historial" : "History"}</button> : null}
                <button data-testid={`${item.isArchived ? "item-restore" : "item-archive"}-${item.unitNumber.toLowerCase()}`} className={item.isArchived ? "button button-secondary" : "button button-danger"} onClick={() => item.isArchived ? void onArchiveItem(item.id, true) : setConfirmTarget({ type: "item", operation: "archive", record: item })}>
                  {item.isArchived ? (isSpanish ? "Restaurar" : "Restore") : (isSpanish ? "Archivar" : "Archive")}
                </button>
              </div>
            ))}
          </div>
          <div className="unit-history-inspector">
            <div className="admin-section-head">
              <div>
                <h4>{isSpanish ? "Historial por unidad" : "Unit history inspector"}</h4>
                <p className="helper-copy">{isSpanish ? "Separe la unidad actual, rotaciones previas y eventos operativos sin depender del panel lateral del drawer." : "Separate current status, prior turns, and operational events without depending on the drawer side panel."}</p>
              </div>
            </div>
            <div className="unit-history-inspector-controls">
              <label>
                <span>{isSpanish ? "Unidad" : "Unit"}</span>
                <UnitSearchSelect
                  units={historyUnitsForProperty}
                  value={historyInspectorUnitId}
                  onChange={setHistoryInspectorUnitId}
                  placeholder={isSpanish ? "Buscar unidad para historial..." : "Search unit for history..."}
                  emptyLabel={isSpanish ? "No hay unidad seleccionada" : "No unit selected"}
                />
              </label>
            </div>
            {!historyInspectorUnitId ? (
              <StatusState title={isSpanish ? "Seleccione una unidad" : "Select a unit"} description={isSpanish ? "Use la búsqueda o el botón Historial desde una rotación/unidad ocupada para revisar toda su línea de tiempo." : "Use search or the History button from a turn/occupied unit to review its full timeline."} tone="subtle" />
            ) : unitHistoryQuery.isLoading ? (
              <StatusState title={isSpanish ? "Cargando historial" : "Loading history"} description={isSpanish ? "Reuniendo rotaciones, evidencia y actividad de esta unidad." : "Collecting turns, evidence, and activity for this unit."} tone="subtle" />
            ) : unitHistoryQuery.isError ? (
              <StatusState title={isSpanish ? "No se pudo cargar el historial" : "Could not load history"} description={isSpanish ? "Intente de nuevo o abra la unidad desde el drawer si el problema continúa." : "Try again or open the unit from the drawer if the issue persists."} tone="subtle" />
            ) : (
              <>
                <div className="operations-mini-stats wrap">
                  <span><strong>{unitHistoryQuery.data?.turns.length ?? 0}</strong> {isSpanish ? "rotaciones" : "turns"}</span>
                  <span><strong>{unitHistoryQuery.data?.recurringSignals.highRisk ?? 0}</strong> {isSpanish ? "alto riesgo" : "high risk"}</span>
                  <span><strong>{unitHistoryQuery.data?.recurringSignals.vendor ?? 0}</strong> {isSpanish ? "con proveedor" : "vendor-backed"}</span>
                  <span><strong>{unitHistoryQuery.data?.events.length ?? 0}</strong> {isSpanish ? "eventos" : "events"}</span>
                </div>
                <div className="unit-history-summary-card">
                  <strong>{historyInspectorUnit?.property.code} {historyInspectorUnit?.number}</strong>
                  <span>
                    {historyInspectorUnit?.building ? `${isSpanish ? "Edificio" : "Building"} ${historyInspectorUnit.building}` : (isSpanish ? "Sin edificio" : "No building")}
                    {" / "}
                    {historyInspectorUnit?.area || (isSpanish ? "Sin área" : "No area")}
                    {" / "}
                    {historyInspectorUnit?.floorPlanRecord ? floorPlanLabel(historyInspectorUnit.floorPlanRecord) : historyInspectorUnit?.floorPlan || (isSpanish ? "Sin plano" : "No floor plan")}
                  </span>
                </div>
                <div className="unit-history-turn-grid">
                  {unitHistoryQuery.data?.turns.map((turn) => (
                    <div key={turn.itemId} className={`unit-history-turn-card${turn.current ? " current" : ""}`}>
                      <strong>{turn.current ? (isSpanish ? "Rotación actual" : "Current turn") : (isSpanish ? "Rotación previa" : "Previous turn")}</strong>
                      <span>{isSpanish ? "Creada" : "Created"} {new Date(turn.createdAt).toLocaleDateString()}</span>
                      <span>{isSpanish ? "Riesgo" : "Risk"} {turn.riskLevel}</span>
                      <span>{isSpanish ? "Duración" : "Duration"} {turn.turnDuration ?? "-"} {isSpanish ? "días" : "days"}</span>
                      <span>{isSpanish ? "Vacante" : "Days vacant"} {turn.daysVacant}</span>
                      <span>{isSpanish ? "Checklist" : "Checklist"} {turn.checklistCompletionPercent}%</span>
                      <span>{isSpanish ? "Proveedor" : "Vendor work"} {turn.vendorWorkCount}</span>
                      <span>{isSpanish ? "Técnico" : "Tech"} {turn.assignedTech || (isSpanish ? "Sin asignar" : "Unassigned")}</span>
                      <span>{isSpanish ? "Desocupada" : "Vacated"} {normalizeDateOnly(turn.vacatedDate) || "-"}</span>
                      <span>{isSpanish ? "Make-ready" : "Make-ready"} {normalizeDateOnly(turn.makeReadyDate) || "-"}</span>
                      <span>{isSpanish ? "Mudanza" : "Move-in"} {normalizeDateOnly(turn.moveInDate) || "-"}</span>
                    </div>
                  ))}
                </div>
                <div className="unit-history-event-list">
                  {unitHistoryQuery.data?.events.slice(0, 40).map((entry, index) => (
                    <div key={`${entry.type}-${entry.occurredAt}-${index}`} className="drawer-timeline-row">
                      <strong>{entry.title}</strong>
                      <span>{entry.description} / {formatDateTime(entry.occurredAt)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </article>
      </section>

      <ConfirmDialog
        open={Boolean(confirmTarget)}
        language={language}
        title={`${confirmTarget?.operation === "delete" ? (isSpanish ? "Eliminar" : "Delete") : (isSpanish ? "Archivar" : "Archive")} ${confirmTarget?.type ?? (isSpanish ? "registro" : "record")}`}
        description={confirmTarget?.operation === "delete" ? (isSpanish ? "La eliminación se permite solo cuando no queda historial operativo vinculado. Esta acción no se puede deshacer." : "Deletion is permitted only when no linked operational history remains. This action cannot be undone.") : (isSpanish ? "Esto oculta el registro de los flujos de trabajo activos sin borrar su historial. Se puede restaurar más adelante." : "This hides the record from active workflows without deleting its history. It can be restored later.")}
        confirmLabel={confirmTarget?.operation === "delete" ? (isSpanish ? "Eliminar" : "Delete") : (isSpanish ? "Archivar" : "Archive")}
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
