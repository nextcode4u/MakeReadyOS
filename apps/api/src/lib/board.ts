import type { MakeReadyItem, Prisma } from "@prisma/client";
import { applyBusinessDayOffset, type DateOffsetField, type OperatingCalendarPolicy } from "./operatingCalendar.js";

const DAY_MS = 1000 * 60 * 60 * 24;

export const editableFields = [
  "applicant",
  "assignedTech",
  "scopeLevel",
  "vacancyStatus",
  "moveOutDate",
  "vacatedDate",
  "makeReadyDate",
  "moveInDate",
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
  "newDoorCode",
  "notes",
  "status",
  "boardGroup",
  "itemName",
  "unitNumber",
  "floorPlan",
] as const;

type EditableField = (typeof editableFields)[number];

export const ruleConditionFields = [
  ...editableFields,
  "daysVacant",
  "daysUntilMoveIn",
  "priority",
  "overdue",
  "moveInSoon",
] as const;

export const automationTriggerTypes = [
  "ITEM_CREATED",
  "ITEM_UPDATED",
  "DATE_FIELD_CHANGED",
  "STATUS_FIELD_CHANGED",
  "SCHEDULED_CHECK",
] as const;

export type RuleOperator =
  | "equals"
  | "notEquals"
  | "in"
  | "contains"
  | "isEmpty"
  | "notEmpty"
  | "dateBefore"
  | "dateAfter"
  | "dateBeforeToday"
  | "dateAfterToday"
  | "dateWithinNextDays"
  | "dateMissing"
  | "dateOnWeekend"
  | "dateOnMondayOrFriday";

export type RuleCondition = {
  field?: string;
  customFieldId?: string;
  operator:
    RuleOperator;
  value?: string | number | boolean | string[];
};

export type RuleAction =
  | {
      type: "setField";
      field: EditableField;
      value: string | null;
    }
  | {
      type: "setPriority";
      value: number;
    }
  | {
      type: "appendNote";
      value: string;
    }
  | {
      type: "setCustomField";
      fieldId: string;
      value: string | number | boolean | string[] | null;
    }
  | {
      type: "addAuditNote";
      value: string;
    }
  | {
      type: "setDateFromField";
      sourceField: DateOffsetField;
      targetField: DateOffsetField;
      offsetDays: number;
      respectOperatingCalendar?: boolean;
    };

export type RuleConfig = {
  all?: RuleCondition[];
  any?: RuleCondition[];
};

export type AutomationDefinition = {
  id: string;
  name: string;
  enabled: boolean;
  conditions: RuleConfig;
  actions: RuleAction[];
};

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function diffInDays(from: Date, to: Date): number {
  return Math.floor((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);
}

export function computeDerivedFields(item: Partial<MakeReadyItem>, now = new Date()) {
  const sourceVacantDate = item.vacatedDate ?? item.moveOutDate ?? null;
  const daysVacant = sourceVacantDate ? Math.max(0, diffInDays(sourceVacantDate, now)) : 0;
  const daysUntilMoveIn = item.moveInDate ? diffInDays(now, item.moveInDate) : null;
  const overdue = Boolean(
    item.makeReadyDate &&
      diffInDays(item.makeReadyDate, now) > 0 &&
      item.completionStatus !== "DONE" &&
      item.completionStatus !== "YES",
  );
  const moveInSoon = Boolean(
    item.moveInDate &&
      daysUntilMoveIn !== null &&
      daysUntilMoveIn >= 0 &&
      daysUntilMoveIn <= 3 &&
      item.completionStatus !== "DONE" &&
      item.completionStatus !== "YES",
  );

  return {
    daysVacant,
    daysUntilMoveIn,
    overdue,
    moveInSoon,
    lastAutomationAt: now,
  };
}

type CustomFieldValueMap = Record<string, unknown>;

function valueForCondition(item: Partial<MakeReadyItem>, condition: RuleCondition, customValues: CustomFieldValueMap): unknown {
  if (condition.customFieldId) {
    return customValues[condition.customFieldId];
  }
  return item[condition.field as keyof MakeReadyItem];
}

function isValueEmpty(value: unknown) {
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

function isConditionMatch(item: Partial<MakeReadyItem>, condition: RuleCondition, customValues: CustomFieldValueMap) {
  const rawValue = valueForCondition(item, condition, customValues);

  switch (condition.operator) {
    case "equals":
      return rawValue === condition.value;
    case "notEquals":
      return rawValue !== condition.value;
    case "in":
      return Array.isArray(condition.value) ? condition.value.includes(String(rawValue ?? "")) : false;
    case "contains":
      return Array.isArray(rawValue) && typeof condition.value === "string" && rawValue.includes(condition.value);
    case "isEmpty":
      return isValueEmpty(rawValue);
    case "notEmpty":
      return !isValueEmpty(rawValue);
    case "dateBefore": {
      const left = rawValue instanceof Date ? rawValue : new Date(String(rawValue));
      const right = new Date(String(condition.value));
      return !Number.isNaN(left.getTime()) && !Number.isNaN(right.getTime()) && left < right;
    }
    case "dateAfter": {
      const left = rawValue instanceof Date ? rawValue : new Date(String(rawValue));
      const right = new Date(String(condition.value));
      return !Number.isNaN(left.getTime()) && !Number.isNaN(right.getTime()) && left > right;
    }
    case "dateBeforeToday": {
      const left = rawValue instanceof Date ? rawValue : new Date(String(rawValue));
      return !Number.isNaN(left.getTime()) && startOfDay(left) < startOfDay(new Date());
    }
    case "dateAfterToday": {
      const left = rawValue instanceof Date ? rawValue : new Date(String(rawValue));
      return !Number.isNaN(left.getTime()) && startOfDay(left) > startOfDay(new Date());
    }
    case "dateWithinNextDays": {
      const left = rawValue instanceof Date ? rawValue : new Date(String(rawValue));
      const days = typeof condition.value === "number" ? condition.value : Number(condition.value);
      if (Number.isNaN(left.getTime()) || !Number.isInteger(days) || days < 0) return false;
      const difference = diffInDays(new Date(), left);
      return difference >= 0 && difference <= days;
    }
    case "dateMissing":
      return isValueEmpty(rawValue);
    case "dateOnWeekend": {
      const left = rawValue instanceof Date ? rawValue : new Date(String(rawValue));
      if (Number.isNaN(left.getTime())) return false;
      const day = left.getDay();
      return day === 0 || day === 6;
    }
    case "dateOnMondayOrFriday": {
      const left = rawValue instanceof Date ? rawValue : new Date(String(rawValue));
      if (Number.isNaN(left.getTime())) return false;
      const day = left.getDay();
      return day === 1 || day === 5;
    }
    default:
      return false;
  }
}

export function evaluateRuleConditions(item: Partial<MakeReadyItem>, config: RuleConfig, customValues: CustomFieldValueMap = {}) {
  const all = (config.all ?? []).map((condition) => ({
    condition,
    matched: isConditionMatch(item, condition, customValues),
  }));
  const any = (config.any ?? []).map((condition) => ({
    condition,
    matched: isConditionMatch(item, condition, customValues),
  }));

  return {
    matched: all.every((result) => result.matched) && (any.length === 0 || any.some((result) => result.matched)),
    all,
    any,
  };
}

export function applyRules(
  item: Partial<MakeReadyItem>,
  rules: AutomationDefinition[],
  customValues: CustomFieldValueMap = {},
  options: { operatingCalendar?: OperatingCalendarPolicy | null } = {},
): {
  next: Partial<MakeReadyItem>;
  logs: Array<{ ruleId: string; message: string }>;
  customFieldUpdates: Array<{ ruleId: string; fieldId: string; value: string | number | boolean | string[] | null }>;
  auditNotes: Array<{ ruleId: string; message: string }>;
} {
  const next = { ...item };
  const logs: Array<{ ruleId: string; message: string }> = [];
  const customFieldUpdates: Array<{ ruleId: string; fieldId: string; value: string | number | boolean | string[] | null }> = [];
  const auditNotes: Array<{ ruleId: string; message: string }> = [];

  for (const rule of rules) {
    if (!rule.enabled) {
      continue;
    }

    if (!evaluateRuleConditions(next, rule.conditions, customValues).matched) {
      continue;
    }

    for (const action of rule.actions) {
      if (action.type === "setField") {
        next[action.field] = action.value as never;
      }
      if (action.type === "setPriority") {
        next.priority = action.value;
      }
      if (action.type === "appendNote") {
        const currentNotes = typeof next.notes === "string" ? next.notes.trim() : "";
        next.notes = currentNotes ? `${currentNotes}\n${action.value}` : action.value;
      }
      if (action.type === "setCustomField") {
        customFieldUpdates.push({ ruleId: rule.id, fieldId: action.fieldId, value: action.value });
      }
      if (action.type === "addAuditNote") {
        auditNotes.push({ ruleId: rule.id, message: action.value });
      }
      if (action.type === "setDateFromField") {
        const sourceValue = next[action.sourceField];
        const sourceDate = sourceValue instanceof Date ? sourceValue : sourceValue ? new Date(String(sourceValue)) : null;
        if (sourceDate && !Number.isNaN(sourceDate.getTime())) {
          next[action.targetField] = applyBusinessDayOffset(
            sourceDate,
            action.offsetDays,
            action.respectOperatingCalendar === false ? null : options.operatingCalendar,
          ) as never;
        }
      }
    }

    logs.push({
      ruleId: rule.id,
      message: `${rule.name} applied`,
    });
  }

  return { next, logs, customFieldUpdates, auditNotes };
}

export function normalizeItemPatch(payload: Record<string, unknown>) {
  const data: Record<string, unknown> = {};

  for (const field of editableFields) {
    if (!(field in payload)) {
      continue;
    }

    const value = payload[field];

    if (field.endsWith("Date")) {
      data[field] = value ? new Date(String(value)) : null;
      continue;
    }

    if (typeof value === "string") {
      data[field] = value.trim();
      continue;
    }

    if (value === null) {
      data[field] = null;
    }
  }

  return data as Prisma.MakeReadyItemUncheckedUpdateInput;
}
