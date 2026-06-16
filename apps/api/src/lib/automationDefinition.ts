import { CustomFieldType } from "@prisma/client";
import { z } from "zod";
import { automationTriggerTypes, editableFields, ruleConditionFields } from "./board.js";
import { dateOffsetFields } from "./operatingCalendar.js";
import { prisma } from "./prisma.js";
import { assignableStaffRoles } from "./auth.js";

export const triggerSchema = z.enum(automationTriggerTypes);
export const ruleValueSchema = z.union([z.string().max(1000), z.number().finite(), z.boolean(), z.array(z.string().max(200)).max(20)]);
const relativeDateOperators = ["dateBeforeToday", "dateAfterToday", "dateWithinNextDays", "dateMissing", "dateOnWeekend", "dateOnMondayOrFriday"] as const;

const builtInConditionSchema = z.object({
  field: z.enum(ruleConditionFields),
  operator: z.enum(["equals", "notEquals", "in", "isEmpty", "notEmpty", "dateBefore", "dateAfter", ...relativeDateOperators]),
  value: ruleValueSchema.optional(),
}).superRefine((condition, context) => {
  if (["equals", "notEquals", "in", "dateBefore", "dateAfter", "dateWithinNextDays"].includes(condition.operator) && condition.value === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "This operator requires a value", path: ["value"] });
  }
  if (["dateBefore", "dateAfter"].includes(condition.operator) && (typeof condition.value !== "string" || Number.isNaN(new Date(condition.value).getTime()))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Date comparisons require a valid date value", path: ["value"] });
  }
  if (condition.operator === "dateWithinNextDays" && (typeof condition.value !== "number" || !Number.isInteger(condition.value) || condition.value < 0 || condition.value > 365)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Date window requires a whole number of days from 0 to 365", path: ["value"] });
  }
  if (relativeDateOperators.includes(condition.operator as (typeof relativeDateOperators)[number]) && !condition.field.endsWith("Date")) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Relative date checks require a date field", path: ["field"] });
  }
});

const customConditionSchema = z.object({
  customFieldId: z.string().min(1),
  operator: z.enum(["equals", "notEquals", "contains", "isEmpty", "notEmpty", ...relativeDateOperators]),
  value: ruleValueSchema.optional(),
}).superRefine((condition, context) => {
  if (["equals", "notEquals", "contains", "dateWithinNextDays"].includes(condition.operator) && condition.value === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "This operator requires a value", path: ["value"] });
  }
  if (condition.operator === "dateWithinNextDays" && (typeof condition.value !== "number" || !Number.isInteger(condition.value) || condition.value < 0 || condition.value > 365)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Date window requires a whole number of days from 0 to 365", path: ["value"] });
  }
});

export const conditionSchema = z.union([builtInConditionSchema, customConditionSchema]);

export const conditionsSchema = z.object({
  all: z.array(conditionSchema).max(12).default([]),
  any: z.array(conditionSchema).max(12).optional(),
}).refine((conditions) => conditions.all.length > 0 || Boolean(conditions.any?.length), {
  message: "At least one condition is required",
});

export const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("setField"),
    field: z.enum(editableFields),
    value: z.string().max(1000).nullable(),
  }),
  z.object({
    type: z.literal("setCustomField"),
    fieldId: z.string().min(1),
    value: ruleValueSchema.nullable(),
  }),
  z.object({
    type: z.literal("addAuditNote"),
    value: z.string().trim().min(1).max(500),
  }),
  z.object({
    type: z.literal("setDateFromField"),
    sourceField: z.enum(dateOffsetFields),
    targetField: z.enum(dateOffsetFields),
    offsetDays: z.number().int().min(-60).max(60),
    respectOperatingCalendar: z.boolean().default(true),
  }),
  z.object({
    type: z.literal("assignLeastLoadedStaff"),
    eligibleRoles: z.array(z.enum(["ADMIN", "MANAGER", "TECH", "CLEANER"])).min(1).max(assignableStaffRoles.length).default(["TECH"]),
    eligibleUserIds: z.array(z.string().min(1)).max(25).optional(),
    excludedUserIds: z.array(z.string().min(1)).max(25).optional(),
    lookAheadDays: z.number().int().min(0).max(30).default(7),
    includePlannedWork: z.boolean().default(true),
    onlyWhenUnassigned: z.boolean().default(true),
    dailyAssignmentCap: z.number().int().min(1).max(50).nullable().optional(),
    targetDateField: z.enum(["makeReadyDate", "moveInDate", "vacatedDate"]).default("makeReadyDate"),
  }),
  // Event-rule compatibility only. Scheduled checks cannot use these legacy actions.
  z.object({
    type: z.literal("setPriority"),
    value: z.number().int().min(0).max(10),
  }),
  z.object({
    type: z.literal("appendNote"),
    value: z.string().trim().min(1).max(500),
  }),
]).superRefine((action, context) => {
  if (action.type === "setDateFromField" && action.sourceField === action.targetField) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Source and target date fields must be different",
      path: ["targetField"],
    });
  }
});

export const automationRuleBaseSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  enabled: z.boolean().default(true),
  triggerType: triggerSchema,
  propertyId: z.string().nullable().optional(),
  conditions: conditionsSchema,
  actions: z.array(actionSchema).min(1).max(10),
});

export const automationRuleInputSchema = automationRuleBaseSchema.superRefine((rule, context) => {
  if (rule.triggerType === "SCHEDULED_CHECK") {
    rule.actions.forEach((action, index) => {
      if (action.type === "setPriority" || action.type === "appendNote") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Scheduled checks support setField, setDateFromField, setCustomField, and addAuditNote actions only",
          path: ["actions", index, "type"],
        });
      }
    });
  }
  if (rule.triggerType !== "SCHEDULED_CHECK") {
    rule.actions.forEach((action, index) => {
      if (action.type === "assignLeastLoadedStaff") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Least-loaded assignment is available for scheduled checks only",
          path: ["actions", index, "type"],
        });
      }
    });
  }
});

export type AutomationRuleInput = z.infer<typeof automationRuleInputSchema>;
export type AutomationActionInput = z.infer<typeof actionSchema>;
export type AutomationConditionInput = z.infer<typeof conditionSchema>;

function validateCustomCondition(
  condition: Extract<AutomationConditionInput, { customFieldId: string }>,
  field: {
    label: string;
    fieldType: CustomFieldType;
    options: Array<{ label: string }>;
  },
) {
  const allowedByType: Record<CustomFieldType, AutomationConditionInput["operator"][]> = {
    TEXT: ["equals", "notEquals", "isEmpty", "notEmpty"],
    LONG_TEXT: ["equals", "notEquals", "isEmpty", "notEmpty"],
    NUMBER: ["equals", "notEquals", "isEmpty", "notEmpty"],
    DATE: ["equals", "notEquals", "isEmpty", "notEmpty", "dateBeforeToday", "dateAfterToday", "dateWithinNextDays", "dateMissing", "dateOnWeekend", "dateOnMondayOrFriday"],
    SINGLE_SELECT: ["equals", "notEquals", "isEmpty", "notEmpty"],
    MULTI_SELECT: ["contains", "isEmpty", "notEmpty"],
    BOOLEAN: ["equals", "notEquals", "isEmpty", "notEmpty"],
    USER: ["equals", "notEquals", "isEmpty", "notEmpty"],
  };
  if (!allowedByType[field.fieldType].includes(condition.operator)) {
    throw new Error(`${condition.operator} is not valid for custom field ${field.label} (${field.fieldType})`);
  }
  if (["equals", "notEquals"].includes(condition.operator)) {
    if ((field.fieldType === CustomFieldType.TEXT || field.fieldType === CustomFieldType.LONG_TEXT || field.fieldType === CustomFieldType.USER) && typeof condition.value !== "string") {
      throw new Error(`Custom field ${field.label} requires a text value`);
    }
    if (field.fieldType === CustomFieldType.DATE && (typeof condition.value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(condition.value))) {
      throw new Error(`Custom date field ${field.label} requires a YYYY-MM-DD value`);
    }
    if (field.fieldType === CustomFieldType.NUMBER && typeof condition.value !== "number") {
      throw new Error(`Custom number field ${field.label} requires a numeric value`);
    }
    if (field.fieldType === CustomFieldType.BOOLEAN && typeof condition.value !== "boolean") {
      throw new Error(`Custom boolean field ${field.label} requires a true or false value`);
    }
  }
  if ((field.fieldType === CustomFieldType.SINGLE_SELECT && ["equals", "notEquals"].includes(condition.operator))
    || (field.fieldType === CustomFieldType.MULTI_SELECT && condition.operator === "contains")) {
    if (typeof condition.value !== "string" || !field.options.some((option) => option.label === condition.value)) {
      throw new Error(`Selected option is unavailable for custom field ${field.label}`);
    }
  }
}

export async function validateRuleReferences(
  conditions: { all?: AutomationConditionInput[]; any?: AutomationConditionInput[] },
  actions: AutomationActionInput[],
  propertyId: string | null | undefined,
) {
  if (propertyId) {
    const property = await prisma.property.findUnique({ where: { id: propertyId } });
    if (!property) throw new Error("Selected property was not found");
  }
  const customConditions = [...(conditions.all ?? []), ...(conditions.any ?? [])]
    .filter((condition): condition is Extract<AutomationConditionInput, { customFieldId: string }> => "customFieldId" in condition);
  const customFieldIds = [
    ...customConditions.map((condition) => condition.customFieldId),
    ...actions.filter((action) => action.type === "setCustomField").map((action) => action.fieldId),
  ];
  if (customFieldIds.length > 0) {
    const fields = await prisma.customField.findMany({
      where: { id: { in: customFieldIds }, module: "make-ready", isArchived: false },
      select: {
        id: true,
        label: true,
        fieldType: true,
        options: { where: { isArchived: false }, select: { label: true } },
      },
    });
    if (fields.length !== new Set(customFieldIds).size) throw new Error("One or more selected custom fields are unavailable");
    const fieldsById = new Map(fields.map((field) => [field.id, field]));
    for (const condition of customConditions) {
      validateCustomCondition(condition, fieldsById.get(condition.customFieldId)!);
    }
  }
}
