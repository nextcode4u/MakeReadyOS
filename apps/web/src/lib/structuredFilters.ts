import type { BoardSection, CustomField, CustomFieldType, MakeReadyItem, StaffOption } from "./api";

export type MoveInWindowFilter = "" | "week" | "7" | "14";
export type ArchiveFilter = "active" | "archived" | "occupied" | "all";
export type CustomFieldFilterOperator =
  | "contains"
  | "notContains"
  | "equals"
  | "notEquals"
  | "empty"
  | "notEmpty"
  | "greaterThan"
  | "lessThan"
  | "before"
  | "after"
  | "between"
  | "withinNextDays"
  | "overdue"
  | "isTrue"
  | "isFalse";

export type CustomFieldFilter = {
  fieldId: string;
  operator: CustomFieldFilterOperator;
  value?: string | number | boolean | null;
  valueTo?: string | null;
};

export type StructuredFilters = {
  vacancyStatus: string;
  assignedTech: string;
  boardSection: string;
  makeReadyStatus: string;
  moveInWindow: MoveInWindowFilter;
  overdueOnly: boolean;
  missingDatesOnly: boolean;
  pestIssuesOnly: boolean;
  flooringNeededOnly: boolean;
  paintNeededOnly: boolean;
  moveInRiskOnly: boolean;
  riskLevel: string;
  riskCategory: string;
  archiveState: ArchiveFilter;
  customFieldFilters: CustomFieldFilter[];
};

export const defaultStructuredFilters: StructuredFilters = {
  vacancyStatus: "",
  assignedTech: "",
  boardSection: "",
  makeReadyStatus: "",
  moveInWindow: "",
  overdueOnly: false,
  missingDatesOnly: false,
  pestIssuesOnly: false,
  flooringNeededOnly: false,
  paintNeededOnly: false,
  moveInRiskOnly: false,
  riskLevel: "",
  riskCategory: "",
  archiveState: "active",
  customFieldFilters: [],
};

export const customOperatorsByType: Record<CustomFieldType, Array<{ value: CustomFieldFilterOperator; label: string }>> = {
  TEXT: [
    { value: "contains", label: "Contains" }, { value: "equals", label: "Equals" }, { value: "empty", label: "Is empty" }, { value: "notEmpty", label: "Is not empty" },
  ],
  LONG_TEXT: [
    { value: "contains", label: "Contains" }, { value: "empty", label: "Is empty" }, { value: "notEmpty", label: "Is not empty" },
  ],
  NUMBER: [
    { value: "equals", label: "Equals" }, { value: "greaterThan", label: "Greater than" }, { value: "lessThan", label: "Less than" }, { value: "empty", label: "Is empty" }, { value: "notEmpty", label: "Is not empty" },
  ],
  DATE: [
    { value: "before", label: "Before" }, { value: "after", label: "After" }, { value: "between", label: "Between" }, { value: "empty", label: "Is empty" }, { value: "notEmpty", label: "Is not empty" }, { value: "withinNextDays", label: "Within next days" }, { value: "overdue", label: "Overdue" },
  ],
  SINGLE_SELECT: [
    { value: "equals", label: "Equals" }, { value: "notEquals", label: "Does not equal" }, { value: "empty", label: "Is empty" }, { value: "notEmpty", label: "Is not empty" },
  ],
  MULTI_SELECT: [
    { value: "contains", label: "Contains option" }, { value: "notContains", label: "Does not contain option" }, { value: "empty", label: "Is empty" }, { value: "notEmpty", label: "Is not empty" },
  ],
  BOOLEAN: [
    { value: "isTrue", label: "Is true" }, { value: "isFalse", label: "Is false" }, { value: "empty", label: "Is empty" }, { value: "notEmpty", label: "Is not empty" },
  ],
  USER: [
    { value: "equals", label: "Equals" }, { value: "empty", label: "Is empty" }, { value: "notEmpty", label: "Is not empty" },
  ],
};

export function defaultCustomFilterFor(field: CustomField): CustomFieldFilter {
  const operator = customOperatorsByType[field.fieldType][0].value;
  const activeOption = field.options.find((option) => !option.isArchived);
  const value = field.fieldType === "SINGLE_SELECT" || field.fieldType === "MULTI_SELECT" ? activeOption?.label ?? "" : field.fieldType === "NUMBER" || (field.fieldType === "DATE" && operator === "withinNextDays") ? 0 : "";
  return { fieldId: field.id, operator, value };
}

export function normalizeCustomFieldFilters(value: unknown, fields: CustomField[]): CustomFieldFilter[] {
  if (!Array.isArray(value)) return [];
  const activeFields = new Map(fields.filter((field) => !field.isArchived).map((field) => [field.id, field]));
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const candidate = raw as Record<string, unknown>;
    const field = typeof candidate.fieldId === "string" ? activeFields.get(candidate.fieldId) : undefined;
    if (!field) return [];
    const validOperators = customOperatorsByType[field.fieldType].map((operator) => operator.value);
    if (!validOperators.includes(candidate.operator as CustomFieldFilterOperator)) return [];
    return [{
      fieldId: field.id,
      operator: candidate.operator as CustomFieldFilterOperator,
      value: typeof candidate.value === "string" || typeof candidate.value === "number" || typeof candidate.value === "boolean" || candidate.value === null ? candidate.value : undefined,
      valueTo: typeof candidate.valueTo === "string" || candidate.valueTo === null ? candidate.valueTo : undefined,
    }];
  });
}

function startOfWeek(date: Date) {
  const next = new Date(date);
  const day = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - day);
  next.setHours(0, 0, 0, 0);
  return next;
}

function dateWithinNextDays(value: string | null, days: number, now: Date) {
  if (!value) return false;
  const date = new Date(value);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setDate(end.getDate() + days);
  return date >= today && date <= end;
}

function isEmptyValue(value: unknown) {
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

function customValue(item: MakeReadyItem, fieldId: string) {
  return item.customFieldValues.find((entry) => entry.customFieldId === fieldId)?.value;
}

function matchesCustomFilter(item: MakeReadyItem, filter: CustomFieldFilter, field: CustomField, now: Date) {
  const value = customValue(item, field.id);
  if (filter.operator === "empty") return isEmptyValue(value);
  if (filter.operator === "notEmpty") return !isEmptyValue(value);
  if (filter.operator === "isTrue") return value === true;
  if (filter.operator === "isFalse") return value === false;
  if (isEmptyValue(value)) return false;
  if (filter.operator === "contains" && field.fieldType === "MULTI_SELECT") return Array.isArray(value) && value.includes(filter.value);
  if (filter.operator === "notContains" && field.fieldType === "MULTI_SELECT") return Array.isArray(value) && !value.includes(filter.value);
  if (filter.operator === "contains") return String(value).toLowerCase().includes(String(filter.value ?? "").toLowerCase());
  if (filter.operator === "equals") {
    return field.fieldType === "NUMBER"
      ? Number(value) === Number(filter.value)
      : String(value).toLowerCase() === String(filter.value ?? "").toLowerCase();
  }
  if (filter.operator === "notEquals") return String(value).toLowerCase() !== String(filter.value ?? "").toLowerCase();
  if (filter.operator === "greaterThan") return Number(value) > Number(filter.value);
  if (filter.operator === "lessThan") return Number(value) < Number(filter.value);
  if (field.fieldType === "DATE") {
    const date = new Date(String(value));
    const operand = typeof filter.value === "string" ? new Date(filter.value) : null;
    if (filter.operator === "before") return Boolean(operand && date < operand);
    if (filter.operator === "after") return Boolean(operand && date > operand);
    if (filter.operator === "between") return Boolean(operand && filter.valueTo && date >= operand && date <= new Date(filter.valueTo));
    if (filter.operator === "withinNextDays") return dateWithinNextDays(String(value), Number(filter.value), now);
    if (filter.operator === "overdue") {
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      return date < today;
    }
  }
  return false;
}

export function customFieldFilterChipLabel(filter: CustomFieldFilter, fields: CustomField[], staff: StaffOption[]) {
  const field = fields.find((entry) => entry.id === filter.fieldId);
  if (!field) return "Unavailable custom field";
  const operator = customOperatorsByType[field.fieldType].find((entry) => entry.value === filter.operator)?.label ?? filter.operator;
  const displayValue = field.fieldType === "USER"
    ? staff.find((member) => member.id === filter.value)?.fullName ?? String(filter.value ?? "")
    : filter.operator === "between"
      ? `${filter.value ?? ""} - ${filter.valueTo ?? ""}`
      : String(filter.value ?? "");
  return ["empty", "notEmpty", "isTrue", "isFalse", "overdue"].includes(filter.operator)
    ? `${field.label}: ${operator}`
    : `${field.label}: ${operator} ${displayValue}`;
}

export function itemMatchesStructuredFilters(
  item: MakeReadyItem,
  filters: StructuredFilters,
  sections: BoardSection[],
  customFields: CustomField[],
  now = new Date(),
) {
  if (filters.archiveState === "active" && item.isArchived) return false;
  if (filters.archiveState === "archived" && !item.isArchived) return false;
  if (filters.archiveState === "occupied") {
    const unitIsOccupied = item.unit?.occupancyStatus === "OCCUPIED";
    const itemLooksOccupied = item.vacancyStatus === "OCCUPIED";
    if (!unitIsOccupied && !itemLooksOccupied) return false;
  }
  if (filters.vacancyStatus === "__ntv__") {
    if (!item.vacancyStatus?.startsWith("NTV")) return false;
  } else if (filters.vacancyStatus === "__vacant__") {
    if (!["VACANT", "VACANT_NOT_LEASED", "VACANT_READY", "VACANT NOT LEASED READY", "VACANT NOT LEASED NOT READY"].includes(item.vacancyStatus ?? "")) return false;
  } else if (filters.vacancyStatus === "__vacant_leased__") {
    if (!["VACANT LEASED", "VACANT_LEASED", "VACANT LEASED READY", "VACANT LEASED NOT READY"].includes(item.vacancyStatus ?? "")) return false;
  } else if (filters.vacancyStatus && item.vacancyStatus !== filters.vacancyStatus) {
    return false;
  }
  if (filters.assignedTech === "__unassigned__") {
    if (item.assignedTech?.trim()) return false;
  } else if (filters.assignedTech && item.assignedTech !== filters.assignedTech) {
    return false;
  }
  if (filters.boardSection) {
    const section = sections.find((entry) => entry.propertyId === item.propertyId && entry.key === item.boardGroup);
    if (filters.boardSection.startsWith("type:")) {
      if (section?.sectionType !== filters.boardSection.slice(5)) return false;
    } else if (item.boardGroup !== filters.boardSection) {
      return false;
    }
  }
  if (filters.makeReadyStatus && item.makeReadyStatus !== filters.makeReadyStatus) return false;
  if (filters.overdueOnly && !item.overdue) return false;
  if (filters.missingDatesOnly && item.makeReadyDate && item.vacatedDate) return false;
  if (filters.pestIssuesOnly && (!item.pestStatus || ["NONE", "TREATED"].includes(item.pestStatus))) return false;
  if (filters.flooringNeededOnly && item.floorsStatus !== "REPLACE CARPET") return false;
  if (filters.paintNeededOnly && (!item.paintStatus || item.paintStatus === "GOOD")) return false;

  if (filters.moveInWindow === "week") {
    const weekStart = startOfWeek(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    if (!item.moveInDate || new Date(item.moveInDate) < weekStart || new Date(item.moveInDate) >= weekEnd) return false;
  } else if (filters.moveInWindow && !dateWithinNextDays(item.moveInDate, Number(filters.moveInWindow), now)) {
    return false;
  }

  if (filters.moveInRiskOnly) {
    const imminentIncomplete = dateWithinNextDays(item.moveInDate, 7, now) && item.completionStatus !== "YES";
    const conflict = Boolean(item.moveInDate && item.makeReadyDate && new Date(item.moveInDate) < new Date(item.makeReadyDate));
    if (!imminentIncomplete && !conflict) return false;
  }
  if (filters.riskLevel && item.riskLevel !== filters.riskLevel) return false;
  if (filters.riskCategory && !item.riskReasons?.some((reason) => reason.category === filters.riskCategory)) return false;
  const fields = new Map(customFields.filter((field) => !field.isArchived).map((field) => [field.id, field]));
  if (filters.customFieldFilters.some((filter) => {
    const field = fields.get(filter.fieldId);
    return field ? !matchesCustomFilter(item, filter, field, now) : false;
  })) return false;
  return true;
}
