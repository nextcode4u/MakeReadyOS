import type { CustomField, Prisma } from "@prisma/client";
import { automationRuleInputSchema, type AutomationActionInput, type AutomationConditionInput, type AutomationRuleInput } from "./automationDefinition.js";
import { prisma } from "./prisma.js";

type TemplateCategory = "Schedule Risk" | "Specialty Work" | "Priority";
type RequiredField = {
  source: "BUILT_IN" | "CUSTOM";
  key: string;
  label: string;
  fieldType?: "DATE";
  purpose: string;
};
type TemplateCondition = AutomationConditionInput | {
  customFieldKey: string;
  operator: AutomationConditionInput["operator"];
  value?: string | number | boolean | string[];
};
type TemplateDefinition = {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  triggerType: AutomationRuleInput["triggerType"];
  conditions: { all: TemplateCondition[]; any?: TemplateCondition[] };
  actions: AutomationActionInput[];
  requiredFields: RequiredField[];
  setupNotes: string[];
};

const templates: TemplateDefinition[] = [
  {
    id: "overdue-make-ready",
    name: "Overdue Make Ready",
    description: "Flag incomplete turns after the scheduled make-ready date passes.",
    category: "Schedule Risk",
    triggerType: "SCHEDULED_CHECK",
    conditions: { all: [
      { field: "makeReadyDate", operator: "dateBeforeToday" },
      { field: "completionStatus", operator: "notEquals", value: "DONE" },
      { field: "completionStatus", operator: "notEquals", value: "YES" },
    ] },
    actions: [{ type: "addAuditNote", value: "Template alert: make-ready work is overdue and incomplete." }],
    requiredFields: [
      { source: "BUILT_IN", key: "makeReadyDate", label: "Make Ready Date", purpose: "Target date to evaluate." },
      { source: "BUILT_IN", key: "completionStatus", label: "Completion Status", purpose: "Excludes completed turns." },
    ],
    setupNotes: ["Run as a scheduled check, then adjust the activity-note wording if your operations terminology differs."],
  },
  {
    id: "move-in-within-seven-days",
    name: "Move-In Within 7 Days",
    description: "Highlight nearby move-ins while completion is still outstanding.",
    category: "Schedule Risk",
    triggerType: "SCHEDULED_CHECK",
    conditions: { all: [
      { field: "moveInDate", operator: "dateWithinNextDays", value: 7 },
      { field: "completionStatus", operator: "notEquals", value: "DONE" },
      { field: "completionStatus", operator: "notEquals", value: "YES" },
    ] },
    actions: [{ type: "addAuditNote", value: "Template alert: move-in is within seven days and work remains incomplete." }],
    requiredFields: [
      { source: "BUILT_IN", key: "moveInDate", label: "Move-In Date", purpose: "Scheduled occupancy date." },
      { source: "BUILT_IN", key: "completionStatus", label: "Completion Status", purpose: "Excludes completed turns." },
    ],
    setupNotes: ["Change the seven-day window after installation if your leasing handoff uses a different lead time."],
  },
  {
    id: "missing-make-ready-date",
    name: "Missing Make Ready Date",
    description: "Identify incomplete turns that do not yet have a make-ready date.",
    category: "Schedule Risk",
    triggerType: "SCHEDULED_CHECK",
    conditions: { all: [
      { field: "makeReadyDate", operator: "dateMissing" },
      { field: "completionStatus", operator: "notEquals", value: "DONE" },
      { field: "completionStatus", operator: "notEquals", value: "YES" },
    ] },
    actions: [{ type: "addAuditNote", value: "Template alert: make-ready date is missing for incomplete work." }],
    requiredFields: [
      { source: "BUILT_IN", key: "makeReadyDate", label: "Make Ready Date", purpose: "Schedule field to require." },
      { source: "BUILT_IN", key: "completionStatus", label: "Completion Status", purpose: "Excludes completed turns." },
    ],
    setupNotes: ["This is a schedule-completeness check and can run hourly or daily."],
  },
  {
    id: "date-fail-safe",
    name: "Date Fail-Safe / Date Conflict Warning",
    description: "Flag vacated turns without a scheduled move-in date for schedule review.",
    category: "Schedule Risk",
    triggerType: "SCHEDULED_CHECK",
    conditions: { all: [
      { field: "vacatedDate", operator: "notEmpty" },
      { field: "moveInDate", operator: "dateMissing" },
      { field: "completionStatus", operator: "notEquals", value: "DONE" },
    ] },
    actions: [{ type: "addAuditNote", value: "Template alert: schedule dates require review before move-in planning." }],
    requiredFields: [
      { source: "BUILT_IN", key: "vacatedDate", label: "Vacated Date", purpose: "Confirms turnover has started." },
      { source: "BUILT_IN", key: "moveInDate", label: "Move-In Date", purpose: "Identifies incomplete scheduling." },
    ],
    setupNotes: ["This safe template checks missing downstream scheduling. Field-to-field date-order comparison is not yet available in the structured engine."],
  },
  {
    id: "pest-follow-up-needed",
    name: "Pest Treatment Follow-Up Needed",
    description: "Flag serious pest findings when no follow-up date has been recorded.",
    category: "Specialty Work",
    triggerType: "SCHEDULED_CHECK",
    conditions: { all: [
      { field: "pestStatus", operator: "in", value: ["ROACHES", "BED BUGS", "FLEAS"] },
      { customFieldKey: "pestFollowUpDate", operator: "dateMissing" },
    ] },
    actions: [{ type: "addAuditNote", value: "Template alert: serious pest issue needs a scheduled follow-up." }],
    requiredFields: [
      { source: "BUILT_IN", key: "pestStatus", label: "Pest Status", purpose: "Identifies serious pest issues." },
      { source: "CUSTOM", key: "pestFollowUpDate", label: "Pest Follow-Up Date", fieldType: "DATE", purpose: "Tracks required follow-up scheduling." },
    ],
    setupNotes: ["Create an active DATE custom field named `Pest Follow-Up Date` before installing this template."],
  },
  {
    id: "flooring-date-missing",
    name: "Flooring Date Missing When Flooring Replacement Selected",
    description: "Flag flooring replacement selections that do not have scheduled flooring work.",
    category: "Specialty Work",
    triggerType: "STATUS_FIELD_CHANGED",
    conditions: { all: [
      { field: "floorsStatus", operator: "equals", value: "REPLACE CARPET" },
      { field: "flooringDate", operator: "dateMissing" },
    ] },
    actions: [{ type: "addAuditNote", value: "Template alert: flooring replacement selected without a flooring date." }],
    requiredFields: [
      { source: "BUILT_IN", key: "floorsStatus", label: "Floors Status", purpose: "Tracks replacement selection." },
      { source: "BUILT_IN", key: "flooringDate", label: "Flooring Date", purpose: "Tracks work scheduling." },
    ],
    setupNotes: ["This event rule evaluates when status-related board data changes."],
  },
  {
    id: "major-scope-priority",
    name: "Major Scope Priority Flag",
    description: "Increase priority when a turnover is classified as major scope.",
    category: "Priority",
    triggerType: "STATUS_FIELD_CHANGED",
    conditions: { all: [{ field: "scopeLevel", operator: "equals", value: "MAJOR" }] },
    actions: [{ type: "setPriority", value: 8 }],
    requiredFields: [{ source: "BUILT_IN", key: "scopeLevel", label: "Scope Level", purpose: "Identifies major work." }],
    setupNotes: ["Review the priority value after installation to align with local triage practices."],
  },
];

function isCustomCondition(condition: TemplateCondition): condition is Extract<TemplateCondition, { customFieldKey: string }> {
  return "customFieldKey" in condition;
}

export async function templateCatalog() {
  const requiredKeys = templates.flatMap((template) => template.requiredFields
    .filter((field) => field.source === "CUSTOM")
    .map((field) => field.key));
  const fields = await prisma.customField.findMany({
    where: { module: "make-ready", fieldKey: { in: requiredKeys }, isArchived: false },
  });
  const fieldsByKey = new Map(fields.map((field) => [field.fieldKey, field]));
  return templates.map((template) => resolveTemplate(template, fieldsByKey));
}

export async function templateById(templateId: string) {
  const template = templates.find((candidate) => candidate.id === templateId);
  if (!template) return null;
  const requiredKeys = template.requiredFields.filter((field) => field.source === "CUSTOM").map((field) => field.key);
  const fields = await prisma.customField.findMany({
    where: { module: "make-ready", fieldKey: { in: requiredKeys }, isArchived: false },
  });
  return resolveTemplate(template, new Map(fields.map((field) => [field.fieldKey, field])));
}

function resolveTemplate(template: TemplateDefinition, fieldsByKey: Map<string, CustomField>) {
  const requiredFields = template.requiredFields.map((required) => {
    const field = required.source === "CUSTOM" ? fieldsByKey.get(required.key) : undefined;
    const available = required.source === "BUILT_IN" || Boolean(field && (!required.fieldType || field.fieldType === required.fieldType));
    return { ...required, available, fieldId: field?.id ?? null };
  });
  const setupRequirements = requiredFields.filter((field) => !field.available).map((field) => (
    `Create an active ${field.fieldType ?? ""} custom field named "${field.label}" (${field.key}).`.replace(/\s+/g, " ")
  ));
  const conditions = {
    all: template.conditions.all.map((condition) => {
      if (!isCustomCondition(condition)) return condition;
      const field = fieldsByKey.get(condition.customFieldKey);
      return field ? { customFieldId: field.id, operator: condition.operator, value: condition.value } : null;
    }).filter((condition): condition is AutomationConditionInput => condition !== null),
    ...(template.conditions.any ? {
      any: template.conditions.any.map((condition) => {
        if (!isCustomCondition(condition)) return condition;
        const field = fieldsByKey.get(condition.customFieldKey);
        return field ? { customFieldId: field.id, operator: condition.operator, value: condition.value } : null;
      }).filter((condition): condition is AutomationConditionInput => condition !== null),
    } : {}),
  };
  const draft = setupRequirements.length === 0 ? automationRuleInputSchema.parse({
    name: template.name,
    description: template.description,
    enabled: false,
    triggerType: template.triggerType,
    propertyId: null,
    conditions,
    actions: template.actions,
  }) : null;
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    category: template.category,
    triggerType: template.triggerType,
    defaultConditions: template.conditions as unknown as Prisma.JsonValue,
    defaultActions: template.actions,
    requiredFields,
    setupNotes: template.setupNotes,
    setupRequirements,
    readyToInstall: setupRequirements.length === 0,
    draft,
  };
}
