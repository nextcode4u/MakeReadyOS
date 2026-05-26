import type { BoardColumnDefinition, BoardSection, CustomField, LabelDefinition, ScheduleTrack } from "./api";

export const boardColumns = [
  { key: "unitNumber", label: "Item", type: "text" },
  { key: "floorPlan", label: "Floor Plan", type: "floorplan" },
  { key: "applicant", label: "Applicant", type: "text" },
  { key: "moveOutDate", label: "NTV / Expected Vacate", type: "date" },
  { key: "vacancyStatus", label: "Vacancy", type: "label" },
  { key: "vacatedDate", label: "Vacated", type: "date" },
  { key: "daysVacant", label: "Days Vacant", type: "readonly" },
  { key: "assignedTech", label: "Assigned", type: "assignee" },
  { key: "scopeLevel", label: "Scope", type: "label" },
  { key: "makeReadyDate", label: "Make Ready", type: "date" },
  { key: "moveInDate", label: "Move-In", type: "date" },
  { key: "paintStatus", label: "Paint", type: "label" },
  { key: "doorsStatus", label: "Doors", type: "label" },
  { key: "completionStatus", label: "Completed", type: "label" },
  { key: "sheetrockStatus", label: "Sheetrock", type: "label" },
  { key: "pestStatus", label: "Pest", type: "label" },
  { key: "pestTreated", label: "Pest Treated", type: "label" },
  { key: "trashOutStatus", label: "Trash Out", type: "label" },
  { key: "floorsStatus", label: "Floors", type: "label" },
  { key: "flooringDate", label: "Flooring Date", type: "date" },
  { key: "makeReadyStatus", label: "Make Ready Scope", type: "label" },
  { key: "cleaningStatus", label: "Cleaning", type: "label" },
  { key: "keysMadeStatus", label: "Keys Made", type: "label" },
  { key: "cabinetsStatus", label: "Cabinets", type: "label" },
  { key: "countertopsStatus", label: "Countertops", type: "label" },
  { key: "appliancesStatus", label: "Appliances", type: "label" },
  { key: "notes", label: "Notes", type: "text" },
] as const;

export const requiredTableColumnKeys = ["unitNumber"] as const;

export type VisibleColumnOption = {
  key: string;
  label: string;
  custom: boolean;
  required: boolean;
};

export const tableColumnPresets: Array<{ key: string; label: string; columns: string[] }> = [
  {
    key: "basic",
    label: "Basic",
    columns: ["unitNumber", "floorPlan", "vacancyStatus", "assignedTech", "scopeLevel", "makeReadyDate", "moveInDate", "completionStatus"],
  },
  {
    key: "maintenance",
    label: "Maintenance",
    columns: ["unitNumber", "assignedTech", "scopeLevel", "paintStatus", "doorsStatus", "sheetrockStatus", "pestStatus", "trashOutStatus", "floorsStatus", "flooringDate", "makeReadyStatus", "cleaningStatus", "keysMadeStatus", "cabinetsStatus"],
  },
  {
    key: "manager",
    label: "Manager",
    columns: ["unitNumber", "floorPlan", "applicant", "vacancyStatus", "vacatedDate", "daysVacant", "assignedTech", "scopeLevel", "makeReadyDate", "moveInDate", "completionStatus", "cleaningStatus", "notes"],
  },
  {
    key: "move-in-risk",
    label: "Move-In Risk",
    columns: ["unitNumber", "floorPlan", "applicant", "vacancyStatus", "vacatedDate", "daysVacant", "assignedTech", "makeReadyDate", "moveInDate", "completionStatus", "makeReadyStatus", "cleaningStatus", "keysMadeStatus", "notes"],
  },
];

export function customColumnKey(fieldId: string) {
  return `custom:${fieldId}`;
}

export function configuredBoardColumns(definitions: BoardColumnDefinition[]) {
  const labelByKey = new Map(definitions.map((definition) => [definition.fieldKey, definition.label]));
  return boardColumns.map((column) => ({ ...column, label: labelByKey.get(column.key) ?? column.label }));
}

export function visibleColumnOptions(customFields: CustomField[], definitions: BoardColumnDefinition[] = []): VisibleColumnOption[] {
  const configured = configuredBoardColumns(definitions);
  return [
    ...configured.map((column) => ({
      key: column.key,
      label: column.label,
      custom: false,
      required: requiredTableColumnKeys.includes(column.key as (typeof requiredTableColumnKeys)[number]),
    })),
    ...customFields.map((field) => ({
      key: customColumnKey(field.id),
      label: field.label,
      custom: true,
      required: false,
    })),
  ];
}

export function normalizeVisibleColumns(columns: string[] | null, customFields: CustomField[], definitions: BoardColumnDefinition[] = []) {
  if (columns === null) return null;
  const available = new Set(visibleColumnOptions(customFields, definitions).map((column) => column.key));
  return Array.from(new Set([...requiredTableColumnKeys, ...columns.filter((column) => available.has(column))]));
}

export const boardGroupTitles: Record<string, string> = {
  READY_UNITS_TA: "READY UNITS TA",
  MAKE_READY_BOARD_TA: "MAKE READY BOARD TA",
  DOWN_AND_MODELS: "DOWN & MODELS",
  READY_UNITS_VAB: "READY UNITS VAB",
  MAKE_READY_BOARD_VAB: "MAKE READY BOARD VAB",
  ARCHIVE_TA: "ARCHIVE TA",
  ARCHIVE_VAB: "ARCHIVE VAB",
};

export function boardGroupLabel(group: string, propertyId?: string, sections: BoardSection[] = []) {
  return sections.find((section) => section.key === group && (!propertyId || section.propertyId === propertyId))?.displayName
    ?? boardGroupTitles[group]
    ?? group;
}

export const calendarFields = [
  { key: "moveOutDate", label: "NTV / Notice to Vacate" },
  { key: "vacatedDate", label: "Vacated" },
  { key: "makeReadyDate", label: "Make Ready" },
  { key: "moveInDate", label: "Move-In" },
  { key: "flooringDate", label: "Flooring" },
];

export function calendarFieldOptions(customFields: CustomField[]) {
  return [
    ...calendarFields,
    ...customFields
      .filter((field) => !field.isArchived && field.fieldType === "DATE")
      .map((field) => ({ key: customColumnKey(field.id), label: field.label })),
  ];
}

export function configuredScheduleTracks(tracks: ScheduleTrack[], customFields: CustomField[]) {
  if (tracks.length > 0) return tracks.filter((track) => track.isEnabled);
  return calendarFieldOptions(customFields).map((field, index) => ({
    id: field.key,
    sourceField: field.key,
    displayName: field.label,
    colorBasis: "STATUS" as const,
    colorSourceField: null,
    fixedColor: null,
    groupingMode: "NONE" as const,
    visibilityFilter: null,
    overdueEnabled: true,
    moveInSoonEnabled: true,
    isEnabled: true,
    isArchived: false,
    sortOrder: index,
  }));
}

export function kanbanGroupOptions(customFields: CustomField[], definitions: BoardColumnDefinition[] = []) {
  return [
    ...configuredBoardColumns(definitions)
      .filter((column) => column.type === "label" || column.type === "date" || column.type === "floorplan")
      .map((column) => ({ key: column.key, label: column.label })),
    { key: "assignedTech", label: "Assigned Tech" },
    { key: "property", label: "Property" },
    ...customFields
      .filter((field) => !field.isArchived && ["SINGLE_SELECT", "MULTI_SELECT", "DATE"].includes(field.fieldType))
      .map((field) => ({ key: customColumnKey(field.id), label: field.label })),
  ];
}

export const sortOptions = [
  { key: "moveInDate", label: "Move-In Date" },
  { key: "makeReadyDate", label: "Make Ready Date" },
  { key: "priority", label: "Priority" },
  { key: "unitNumber", label: "Unit Number" },
  { key: "updatedAt", label: "Last Updated" },
] as const;

export function displayUnitNumber(propertyCode: string, unitNumber: string) {
  const normalized = unitNumber.trim();
  return normalized.toUpperCase().startsWith(`${propertyCode.toUpperCase()} `)
    ? normalized
    : `${propertyCode} ${normalized}`;
}

export function labelMap(labels: LabelDefinition[]) {
  return labels.reduce<Record<string, Record<string, LabelDefinition>>>((acc, label) => {
    acc[label.fieldKey] ??= {};
    acc[label.fieldKey][label.value] = label;
    return acc;
  }, {});
}
