import type { CustomField, Prisma } from "@prisma/client";
import { automationRuleInputSchema, type AutomationActionInput, type AutomationConditionInput, type AutomationRuleInput } from "./automationDefinition.js";
import { prisma } from "./prisma.js";

type TemplateCategory = "Schedule Risk" | "Specialty Work" | "Priority" | "Scheduling" | "Vendors" | "Planning" | "Leasing" | "Assignment";
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
      { field: "pestStatus", operator: "in", value: ["ROACHES", "BED BUGS", "FLEAS", "MICE", "RATS", "RODENTS", "WASPS", "TERMITES", "SILVERFISH"] },
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
  {
    id: "no-weekend-make-ready",
    name: "No Weekend Make-Ready Dates",
    description: "Flag make-ready dates scheduled on Saturday or Sunday for manager review.",
    category: "Scheduling",
    triggerType: "SCHEDULED_CHECK",
    conditions: { all: [
      { field: "makeReadyDate", operator: "dateOnWeekend" },
      { field: "completionStatus", operator: "notEquals", value: "DONE" },
      { field: "completionStatus", operator: "notEquals", value: "YES" },
    ] },
    actions: [{ type: "addAuditNote", value: "Template alert: make-ready date falls on a weekend. Reschedule to an operating day if needed." }],
    requiredFields: [
      { source: "BUILT_IN", key: "makeReadyDate", label: "Make Ready Date", purpose: "Schedule field to inspect for weekend dates." },
      { source: "BUILT_IN", key: "completionStatus", label: "Completion Status", purpose: "Excludes completed turns." },
    ],
    setupNotes: ["Install this with the No Monday/Friday guard if your property also avoids edge-of-week starts."],
  },
  {
    id: "no-monday-friday-make-ready",
    name: "No Monday / Friday Make-Ready Dates",
    description: "Flag make-ready dates on Monday or Friday when teams prefer mid-week execution.",
    category: "Scheduling",
    triggerType: "SCHEDULED_CHECK",
    conditions: { all: [
      { field: "makeReadyDate", operator: "dateOnMondayOrFriday" },
      { field: "completionStatus", operator: "notEquals", value: "DONE" },
      { field: "completionStatus", operator: "notEquals", value: "YES" },
    ] },
    actions: [{ type: "addAuditNote", value: "Template alert: make-ready date falls on Monday or Friday. Review if mid-week scheduling is preferred." }],
    requiredFields: [
      { source: "BUILT_IN", key: "makeReadyDate", label: "Make Ready Date", purpose: "Schedule field to inspect for Monday/Friday dates." },
      { source: "BUILT_IN", key: "completionStatus", label: "Completion Status", purpose: "Excludes completed turns." },
    ],
    setupNotes: ["Use as a soft scheduling review rule; it does not automatically move dates."],
  },
  {
    id: "no-weekend-flooring",
    name: "No Weekend Flooring / Vendor Dates",
    description: "Flag flooring work scheduled on a weekend so in-house/vendor coverage can be confirmed.",
    category: "Vendors",
    triggerType: "SCHEDULED_CHECK",
    conditions: { all: [
      { field: "flooringDate", operator: "dateOnWeekend" },
      { field: "floorsStatus", operator: "notEquals", value: "GOOD" },
    ] },
    actions: [{ type: "addAuditNote", value: "Template alert: flooring/vendor date falls on a weekend. Confirm vendor availability or reschedule." }],
    requiredFields: [
      { source: "BUILT_IN", key: "flooringDate", label: "Flooring Date", purpose: "Vendor/in-house flooring date to inspect." },
      { source: "BUILT_IN", key: "floorsStatus", label: "Floors Status", purpose: "Filters units needing flooring attention." },
    ],
    setupNotes: ["Use this as the vendor-date guard until vendor-assignment-specific scheduling rules are added."],
  },
  {
    id: "vendor-lead-time-reminder",
    name: "Contact Vendor Before Due Date",
    description: "Remind managers to contact vendors before a nearby move-in when flooring still needs attention.",
    category: "Vendors",
    triggerType: "SCHEDULED_CHECK",
    conditions: { all: [
      { field: "moveInDate", operator: "dateWithinNextDays", value: 10 },
      { field: "floorsStatus", operator: "notEquals", value: "GOOD" },
      { field: "floorsStatus", operator: "notEquals", value: "DONE" },
    ] },
    actions: [{ type: "addAuditNote", value: "Template reminder: contact vendor early enough to avoid last-minute scheduling before move-in." }],
    requiredFields: [
      { source: "BUILT_IN", key: "moveInDate", label: "Move-In Date", purpose: "Lead-time window." },
      { source: "BUILT_IN", key: "floorsStatus", label: "Floors Status", purpose: "Finds work likely to need vendor coordination." },
    ],
    setupNotes: ["Adjust the 10-day lead time after install to match local vendor response times."],
  },
  {
    id: "scope-day-planning",
    name: "Scope Day Planning Reminder",
    description: "Prompt teams to scope material, parts, vendors, and checklist needs before make-ready execution.",
    category: "Planning",
    triggerType: "SCHEDULED_CHECK",
    conditions: { all: [
      { field: "makeReadyDate", operator: "dateWithinNextDays", value: 2 },
      { field: "completionStatus", operator: "notEquals", value: "DONE" },
      { field: "completionStatus", operator: "notEquals", value: "YES" },
    ] },
    actions: [{ type: "addAuditNote", value: "Template planning reminder: scope unit, materials, vendors, and checklist needs before execution day." }],
    requiredFields: [
      { source: "BUILT_IN", key: "makeReadyDate", label: "Make Ready Date", purpose: "Identifies upcoming execution day." },
      { source: "BUILT_IN", key: "completionStatus", label: "Completion Status", purpose: "Excludes completed turns." },
    ],
    setupNotes: ["Useful when Monday is scope day and Tuesday starts execution, but the window can be edited after install."],
  },
  {
    id: "turn-date-sequence-review",
    name: "Turn Date Sequence Review",
    description: "Review upcoming turns so make-ready, paint, cleaning, and final walk dates can be sequenced across operating days.",
    category: "Scheduling",
    triggerType: "SCHEDULED_CHECK",
    conditions: { all: [
      { field: "makeReadyDate", operator: "dateWithinNextDays", value: 14 },
      { field: "completionStatus", operator: "notEquals", value: "DONE" },
      { field: "completionStatus", operator: "notEquals", value: "YES" },
    ] },
    actions: [{ type: "addAuditNote", value: "Template scheduling review: confirm downstream paint, cleaning, and final walk dates are sequenced after make-ready and avoid non-operating days." }],
    requiredFields: [
      { source: "BUILT_IN", key: "makeReadyDate", label: "Make Ready Date", purpose: "Starting point for turn sequence planning." },
      { source: "BUILT_IN", key: "completionStatus", label: "Completion Status", purpose: "Excludes completed turns." },
    ],
    setupNotes: ["This is a safe review scaffold. Future structured actions can auto-populate business-day offsets once operating calendars are configurable."],
  },
  {
    id: "auto-populate-flooring-date",
    name: "Auto-Populate Flooring Date From Make-Ready",
    description: "Set flooring date one operating day after make-ready date when flooring is needed and flooring date is missing.",
    category: "Scheduling",
    triggerType: "SCHEDULED_CHECK",
    conditions: { all: [
      { field: "makeReadyDate", operator: "notEmpty" },
      { field: "flooringDate", operator: "dateMissing" },
      { field: "floorsStatus", operator: "notEquals", value: "GOOD" },
      { field: "floorsStatus", operator: "notEquals", value: "DONE" },
    ] },
    actions: [{ type: "setDateFromField", sourceField: "makeReadyDate", targetField: "flooringDate", offsetDays: 1, respectOperatingCalendar: true }],
    requiredFields: [
      { source: "BUILT_IN", key: "makeReadyDate", label: "Make Ready Date", purpose: "Starting point for schedule sequencing." },
      { source: "BUILT_IN", key: "flooringDate", label: "Flooring Date", purpose: "Target date populated by operating-day offset." },
      { source: "BUILT_IN", key: "floorsStatus", label: "Floors Status", purpose: "Limits auto-population to turns that still need flooring." },
    ],
    setupNotes: ["Install disabled first and preview. The action respects no-weekend and Monday/Friday avoidance from the property operating calendar."],
  },
  {
    id: "daily-schedule-load-review",
    name: "Daily Schedule Load Review",
    description: "Prompt supervisors to spread work when too many upcoming turns may land in the same operating window.",
    category: "Planning",
    triggerType: "SCHEDULED_CHECK",
    conditions: { all: [
      { field: "moveInDate", operator: "dateWithinNextDays", value: 7 },
      { field: "completionStatus", operator: "notEquals", value: "DONE" },
      { field: "completionStatus", operator: "notEquals", value: "YES" },
    ] },
    actions: [{ type: "addAuditNote", value: "Template planning review: check daily schedule load and spread work across available operating days before move-in pressure builds." }],
    requiredFields: [
      { source: "BUILT_IN", key: "moveInDate", label: "Move-In Date", purpose: "Near-term demand window." },
      { source: "BUILT_IN", key: "completionStatus", label: "Completion Status", purpose: "Excludes completed turns." },
    ],
    setupNotes: ["This review rule does not enforce a hard per-day cap yet; use it with Planning until capacity limits become configurable."],
  },
  {
    id: "in-house-or-vendor-work-routing",
    name: "In-House / Vendor Work Routing Review",
    description: "Prompt teams to confirm whether flooring, paint, cleaning, and specialty work should be handled in-house or by a vendor.",
    category: "Planning",
    triggerType: "SCHEDULED_CHECK",
    conditions: { all: [
      { field: "makeReadyDate", operator: "dateWithinNextDays", value: 7 },
      { field: "completionStatus", operator: "notEquals", value: "DONE" },
      { field: "completionStatus", operator: "notEquals", value: "YES" },
    ] },
    actions: [{ type: "addAuditNote", value: "Template routing review: confirm which trades are in-house and which require vendor scheduling before the turn window tightens." }],
    requiredFields: [
      { source: "BUILT_IN", key: "makeReadyDate", label: "Make Ready Date", purpose: "Upcoming turn window." },
      { source: "BUILT_IN", key: "completionStatus", label: "Completion Status", purpose: "Excludes completed turns." },
    ],
    setupNotes: ["Useful for properties where flooring, paint, or cleaning may be handled differently by site, scope, or staffing."],
  },
  {
    id: "ready-unit-stock-expectation",
    name: "Ready Unit Stock Expectation",
    description: "Flag vacant incomplete turns that may need to become ready-unit stock for immediate move-ins.",
    category: "Leasing",
    triggerType: "SCHEDULED_CHECK",
    conditions: { all: [
      { field: "vacancyStatus", operator: "equals", value: "VACANT NOT LEASED NOT READY" },
      { field: "completionStatus", operator: "notEquals", value: "DONE" },
      { field: "completionStatus", operator: "notEquals", value: "YES" },
    ] },
    actions: [{ type: "addAuditNote", value: "Template inventory note: review whether this vacant unit should be prioritized as ready-unit stock." }],
    requiredFields: [
      { source: "BUILT_IN", key: "vacancyStatus", label: "Vacancy Status", purpose: "Identifies vacant inventory." },
      { source: "BUILT_IN", key: "completionStatus", label: "Completion Status", purpose: "Finds vacant units not yet ready." },
    ],
    setupNotes: ["Pair with property occupancy goals and availability-report counts to maintain immediate move-in stock."],
  },
  {
    id: "auto-assign-cleaner-review",
    name: "Auto-Assign Cleaner Review",
    description: "Flag turns that appear ready for cleaning so a cleaner can be assigned before final walk.",
    category: "Assignment",
    triggerType: "SCHEDULED_CHECK",
    conditions: { all: [
      { field: "makeReadyStatus", operator: "notEquals", value: "DONE" },
      { field: "cleaningStatus", operator: "notEquals", value: "DONE" },
      { field: "completionStatus", operator: "notEquals", value: "DONE" },
      { field: "completionStatus", operator: "notEquals", value: "YES" },
    ], any: [
      { field: "trashOutStatus", operator: "equals", value: "DONE" },
      { field: "paintStatus", operator: "equals", value: "GOOD" },
      { field: "doorsStatus", operator: "equals", value: "GOOD" },
      { field: "floorsStatus", operator: "equals", value: "GOOD" },
    ] },
    actions: [{ type: "addAuditNote", value: "Template assignment review: turn appears ready for cleaner assignment before final walk." }],
    requiredFields: [
      { source: "BUILT_IN", key: "makeReadyStatus", label: "Make Ready Status", purpose: "Confirms work has not already been completed." },
      { source: "BUILT_IN", key: "cleaningStatus", label: "Cleaning Status", purpose: "Finds turns that still need cleaning ownership." },
      { source: "BUILT_IN", key: "trashOutStatus", label: "Trash Out", purpose: "One signal that upstream work is ready for cleaning." },
    ],
    setupNotes: [
      "Install disabled first and adjust the upstream readiness conditions to match the property workflow.",
      "This starter stays review-first by default. If a property wants controlled auto-assignment, scheduled rules can now use assignLeastLoadedStaff to pick an active eligible cleaner safely.",
    ],
  },
  {
    id: "balanced-tech-assignment-review",
    name: "Balanced Tech Assignment Review",
    description: "Flag unassigned active turns that should be distributed across available make-ready techs.",
    category: "Assignment",
    triggerType: "SCHEDULED_CHECK",
    conditions: { all: [
      { field: "assignedTech", operator: "isEmpty" },
      { field: "makeReadyDate", operator: "dateWithinNextDays", value: 14 },
      { field: "completionStatus", operator: "notEquals", value: "DONE" },
      { field: "completionStatus", operator: "notEquals", value: "YES" },
    ] },
    actions: [{ type: "addAuditNote", value: "Template assignment review: active upcoming turn is unassigned and should be balanced across available techs." }],
    requiredFields: [
      { source: "BUILT_IN", key: "assignedTech", label: "Assigned Tech", purpose: "Finds turns without ownership." },
      { source: "BUILT_IN", key: "makeReadyDate", label: "Make Ready Date", purpose: "Limits review to upcoming make-ready work." },
    ],
    setupNotes: [
      "Use this to keep unassigned upcoming work visible before enabling automatic balancing on a live property.",
      "Scheduled rules can now swap this review note for assignLeastLoadedStaff with eligible roles/users, look-ahead days, planned-day caps, and planning-aware balancing.",
    ],
  },
  {
    id: "balanced-tech-auto-assignment",
    name: "Balanced Tech Auto-Assignment",
    description: "Automatically assign unassigned upcoming turns to the least-loaded eligible make-ready tech.",
    category: "Assignment",
    triggerType: "SCHEDULED_CHECK",
    conditions: { all: [
      { field: "assignedTech", operator: "isEmpty" },
      { field: "makeReadyDate", operator: "dateWithinNextDays", value: 14 },
      { field: "completionStatus", operator: "notEquals", value: "DONE" },
      { field: "completionStatus", operator: "notEquals", value: "YES" },
    ] },
    actions: [{
      type: "assignLeastLoadedStaff",
      eligibleRoles: ["TECH"],
      lookAheadDays: 14,
      includePlannedWork: true,
      onlyWhenUnassigned: true,
      dailyAssignmentCap: 4,
      targetDateField: "makeReadyDate",
    }],
    requiredFields: [
      { source: "BUILT_IN", key: "assignedTech", label: "Assigned Tech", purpose: "Only auto-assigns turns without an existing owner." },
      { source: "BUILT_IN", key: "makeReadyDate", label: "Make Ready Date", purpose: "Balances upcoming work against the scheduled make-ready date." },
    ],
    setupNotes: [
      "Install disabled first and preview against a live property before enabling.",
      "Adjust the look-ahead window and planned-day cap to match how far ahead the property schedules in-house work.",
      "This starter uses TECH-only balancing and includes planned work in the workload score.",
    ],
  },
  {
    id: "balanced-upcoming-make-ready-review",
    name: "Balanced Upcoming Make-Ready Assignment Review",
    description: "Prompt managers to balance new or upcoming make-readies before one tech carries too much of the load.",
    category: "Assignment",
    triggerType: "SCHEDULED_CHECK",
    conditions: { all: [
      { field: "moveInDate", operator: "dateWithinNextDays", value: 21 },
      { field: "completionStatus", operator: "notEquals", value: "DONE" },
      { field: "completionStatus", operator: "notEquals", value: "YES" },
    ] },
    actions: [{ type: "addAuditNote", value: "Template workload review: balance this upcoming make-ready against current staff assignments before move-in pressure builds." }],
    requiredFields: [
      { source: "BUILT_IN", key: "moveInDate", label: "Move-In Date", purpose: "Identifies upcoming turn demand." },
      { source: "BUILT_IN", key: "assignedTech", label: "Assigned Tech", purpose: "Used during manager review to compare workload." },
    ],
    setupNotes: [
      "Change the 21-day look-ahead window after install if your property schedules closer to move-in.",
      "This starter remains advisory by default. Properties can now replace it with assignLeastLoadedStaff once they are ready for planning-aware automatic balancing.",
    ],
  },
  {
    id: "auto-assign-cleaner-balanced",
    name: "Auto-Assign Cleaner",
    description: "Automatically assign ready-for-cleaning turns to the least-loaded eligible cleaner.",
    category: "Assignment",
    triggerType: "SCHEDULED_CHECK",
    conditions: { all: [
      { field: "assignedTech", operator: "isEmpty" },
      { field: "makeReadyStatus", operator: "notEquals", value: "DONE" },
      { field: "cleaningStatus", operator: "notEquals", value: "DONE" },
      { field: "completionStatus", operator: "notEquals", value: "DONE" },
      { field: "completionStatus", operator: "notEquals", value: "YES" },
    ], any: [
      { field: "trashOutStatus", operator: "equals", value: "DONE" },
      { field: "paintStatus", operator: "equals", value: "GOOD" },
      { field: "doorsStatus", operator: "equals", value: "GOOD" },
      { field: "floorsStatus", operator: "equals", value: "GOOD" },
    ] },
    actions: [{
      type: "assignLeastLoadedStaff",
      eligibleRoles: ["CLEANER"],
      lookAheadDays: 7,
      includePlannedWork: true,
      onlyWhenUnassigned: true,
      dailyAssignmentCap: 6,
      targetDateField: "makeReadyDate",
    }],
    requiredFields: [
      { source: "BUILT_IN", key: "assignedTech", label: "Assigned Tech", purpose: "Prevents overwriting an existing assignee." },
      { source: "BUILT_IN", key: "cleaningStatus", label: "Cleaning Status", purpose: "Limits auto-assignment to turns that still need cleaning." },
      { source: "BUILT_IN", key: "trashOutStatus", label: "Trash Out", purpose: "One signal that upstream work is ready for cleaning." },
    ],
    setupNotes: [
      "Install disabled first and preview against a live property before enabling.",
      "Review the readiness conditions carefully so cleaners are not assigned before upstream trade work is truly ready.",
      "This starter uses CLEANER-only balancing and includes planned work in the workload score.",
    ],
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
