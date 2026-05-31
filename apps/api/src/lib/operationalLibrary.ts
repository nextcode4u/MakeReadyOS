import type { AutomationRuleInput } from "./automationDefinition.js";

export type OperationalLibraryPackManifest = {
  format: "makereadyos.libraryPack";
  version: 1;
  packKey: string;
  name: string;
  description?: string;
  category?: string;
  setupNotes?: string[];
  items?: {
    automationTemplates?: Array<AutomationRuleInput & { key: string; category?: string; setupNotes?: string[] }>;
    checklistTemplates?: Array<{
      key: string;
      name: string;
      scope?: string | null;
      items: Array<{ title: string; notes?: string | null; required?: boolean; dueOffsetDays?: number | null; tradeCategory?: string | null }>;
    }>;
    customFields?: Array<{
      key: string;
      fieldKey: string;
      label: string;
      fieldType: "TEXT" | "LONG_TEXT" | "NUMBER" | "DATE" | "SINGLE_SELECT" | "MULTI_SELECT" | "BOOLEAN" | "USER";
      description?: string | null;
      options?: Array<{ label: string; color: string; sortOrder?: number; isArchived?: boolean }>;
    }>;
    optionSets?: Array<{
      key: string;
      fieldKey: string;
      options: Array<{ value: string; color: string; textColor?: string; sortOrder?: number }>;
    }>;
    scheduleTracks?: Array<{
      key: string;
      sourceField: string;
      displayName: string;
      colorBasis?: string;
      colorSourceField?: string | null;
      fixedColor?: string | null;
      groupingMode?: string;
      visibilityFilter?: unknown;
      overdueEnabled?: boolean;
      moveInSoonEnabled?: boolean;
    }>;
    savedViews?: Array<{
      key: string;
      name: string;
      module: string;
      viewType: string;
      filters: Record<string, unknown>;
      sorts?: unknown;
      grouping?: unknown;
      visibleColumns?: unknown;
      isShared?: boolean;
    }>;
  };
};

export const bundledOperationalLibraryPacks: OperationalLibraryPackManifest[] = [
  {
    format: "makereadyos.libraryPack",
    version: 1,
    packKey: "make-ready-operations-starter",
    name: "Make Ready Operations Starter",
    category: "Make Ready",
    description: "Safe starter library with common make-ready checklist, risk field, options, schedule track, and disabled automation rules.",
    setupNotes: [
      "Installed automations are created disabled by default.",
      "Review property scope, notes, and thresholds before enabling any installed rule.",
    ],
    items: {
      customFields: [
        {
          key: "risk-level-field",
          fieldKey: "operationalRiskLevel",
          label: "Operational Risk Level",
          fieldType: "SINGLE_SELECT",
          description: "Library field used by dashboard and automation presets to classify turnover risk.",
          options: [
            { label: "LOW", color: "#44d19d", sortOrder: 0 },
            { label: "MEDIUM", color: "#f7b955", sortOrder: 1 },
            { label: "HIGH", color: "#e9697a", sortOrder: 2 },
          ],
        },
      ],
      checklistTemplates: [
        {
          key: "standard-turnover-qc",
          name: "Library - Standard Turnover QC",
          scope: "MAKE_READY",
          items: [
            { title: "Verify trash-out complete", required: true, tradeCategory: "Trash Out" },
            { title: "Confirm paint/sheetrock scope", required: true, tradeCategory: "Paint" },
            { title: "Confirm cleaning complete", required: true, tradeCategory: "Cleaning" },
            { title: "Final keys and access check", required: true, tradeCategory: "QC" },
          ],
        },
      ],
      optionSets: [
        {
          key: "cleaning-options",
          fieldKey: "cleaningStatus",
          options: [
            { value: "NEEDS CLEAN", color: "#f7b955", textColor: "#1f2937", sortOrder: 20 },
            { value: "FINAL TOUCH", color: "#58a6de", textColor: "#ffffff", sortOrder: 21 },
          ],
        },
      ],
      scheduleTracks: [
        {
          key: "library-move-in-risk-track",
          sourceField: "moveInDate",
          displayName: "Move-In Risk",
          colorBasis: "FIELD",
          colorSourceField: "vacancyStatus",
          groupingMode: "PROPERTY",
          overdueEnabled: true,
          moveInSoonEnabled: true,
        },
      ],
      savedViews: [
        {
          key: "move-in-risk-view",
          name: "Library - Move-In Risk",
          module: "make-ready",
          viewType: "table",
          filters: { structured: { moveInSoon: true } },
          grouping: { kanbanBy: "vacancyStatus" },
          visibleColumns: ["unitNumber", "property", "vacancyStatus", "makeReadyDate", "moveInDate", "assignedTech", "completionStatus"],
          isShared: true,
        },
      ],
      automationTemplates: [
        {
          key: "library-no-weekend-schedule-note",
          name: "No Weekend Make-Ready Schedule Guard",
          description: "Flags scheduled make-ready dates that land on Saturday or Sunday so managers can move the work to an operating day.",
          enabled: false,
          triggerType: "SCHEDULED_CHECK",
          propertyId: null,
          conditions: {
            all: [
              { field: "makeReadyDate", operator: "dateOnWeekend" },
            ],
          },
          actions: [{ type: "addAuditNote", value: "Library scheduling guard: make-ready date should be reviewed for weekend/operating-day conflict." }],
          category: "Scheduling",
          setupNotes: ["Use this as a review note until full operating-calendar constraints are configured."],
        },
        {
          key: "library-no-monday-friday-schedule-note",
          name: "No Monday / Friday Make-Ready Guard",
          description: "Flags Monday or Friday make-ready dates for teams that prefer mid-week scheduling.",
          enabled: false,
          triggerType: "SCHEDULED_CHECK",
          propertyId: null,
          conditions: {
            all: [
              { field: "makeReadyDate", operator: "dateOnMondayOrFriday" },
              { field: "completionStatus", operator: "notEquals", value: "DONE" },
            ],
          },
          actions: [{ type: "addAuditNote", value: "Library scheduling guard: make-ready date falls on Monday or Friday. Review if mid-week scheduling is preferred." }],
          category: "Scheduling",
          setupNotes: ["This is a soft review rule; it does not automatically move scheduled dates."],
        },
        {
          key: "library-daily-load-review-note",
          name: "Daily Schedule Load Review",
          description: "Adds a review note to nearby move-ins so supervisors can spread work when too many units land on one day.",
          enabled: false,
          triggerType: "SCHEDULED_CHECK",
          propertyId: null,
          conditions: {
            all: [
              { field: "moveInDate", operator: "dateWithinNextDays", value: 7 },
              { field: "completionStatus", operator: "notEquals", value: "DONE" },
            ],
          },
          actions: [{ type: "addAuditNote", value: "Library scheduling note: check daily load and spread work if too many turns are landing on the same day." }],
          category: "Planning",
          setupNotes: ["Future capacity rules can enforce per-day limits; this starter keeps the review visible without blocking operators."],
        },
        {
          key: "library-vendor-lead-time-note",
          name: "Vendor Lead-Time Reminder",
          description: "Adds a manager activity note when vendor work should be contacted before the scheduled date.",
          enabled: false,
          triggerType: "SCHEDULED_CHECK",
          propertyId: null,
          conditions: {
            all: [
              { field: "moveInDate", operator: "dateWithinNextDays", value: 10 },
              { field: "floorsStatus", operator: "notEquals", value: "GOOD" },
            ],
          },
          actions: [{ type: "addAuditNote", value: "Library reminder: contact vendor early enough to avoid last-minute scheduling." }],
          category: "Vendors",
          setupNotes: ["Adjust the lead-time window and trade field after installing for your vendor process."],
        },
        {
          key: "library-scope-day-planning-note",
          name: "Scope Day Planning Reminder",
          description: "Prompts teams to scope parts, materials, vendors, and checklist needs before make-ready execution starts.",
          enabled: false,
          triggerType: "SCHEDULED_CHECK",
          propertyId: null,
          conditions: {
            all: [
              { field: "makeReadyDate", operator: "dateWithinNextDays", value: 2 },
              { field: "completionStatus", operator: "notEquals", value: "DONE" },
            ],
          },
          actions: [{ type: "addAuditNote", value: "Library planning reminder: scope unit, materials, and vendor needs before execution day." }],
          category: "Planning",
          setupNotes: ["Useful for properties that scope on one day and execute make-ready work on the next operating day."],
        },
        {
          key: "library-turn-date-sequence-review",
          name: "Turn Date Sequence Review",
          description: "Reviews upcoming turns so downstream paint, cleaning, final walk, and vendor dates can be sequenced around operating-day rules.",
          enabled: false,
          triggerType: "SCHEDULED_CHECK",
          propertyId: null,
          conditions: {
            all: [
              { field: "makeReadyDate", operator: "dateWithinNextDays", value: 14 },
              { field: "completionStatus", operator: "notEquals", value: "DONE" },
            ],
          },
          actions: [{ type: "addAuditNote", value: "Library scheduling review: confirm downstream dates are sequenced after make-ready and avoid non-operating days." }],
          category: "Scheduling",
          setupNotes: ["Data-only scaffold for future business-day date auto-population; does not move dates automatically."],
        },
        {
          key: "library-in-house-vendor-routing-review",
          name: "In-House / Vendor Work Routing Review",
          description: "Prompts teams to decide which trades will be handled in-house and which require vendor scheduling before deadlines tighten.",
          enabled: false,
          triggerType: "SCHEDULED_CHECK",
          propertyId: null,
          conditions: {
            all: [
              { field: "makeReadyDate", operator: "dateWithinNextDays", value: 7 },
              { field: "completionStatus", operator: "notEquals", value: "DONE" },
            ],
          },
          actions: [{ type: "addAuditNote", value: "Library planning review: confirm in-house versus vendor routing for paint, cleaning, flooring, and specialty work." }],
          category: "Planning",
          setupNotes: ["Useful when vendor involvement differs by property, trade, scope, or staffing."],
        },
        {
          key: "library-ready-stock-expectation-note",
          name: "Ready Unit Stock Expectation",
          description: "Flags low ready-unit stock risk by noting active turns that should be converted into ready inventory.",
          enabled: false,
          triggerType: "SCHEDULED_CHECK",
          propertyId: null,
          conditions: {
            all: [
              { field: "vacancyStatus", operator: "equals", value: "VACANT" },
              { field: "completionStatus", operator: "notEquals", value: "DONE" },
            ],
          },
          actions: [{ type: "addAuditNote", value: "Library inventory note: review whether this vacant unit should become move-in-ready stock." }],
          category: "Leasing",
          setupNotes: ["Pair this with occupancy and availability goals once property-level targets are configured."],
        },
        {
          key: "library-move-in-risk-note",
          name: "Library - Move-In Risk Note",
          description: "Adds an audit note when a move-in is within 7 days and completion is not done.",
          enabled: false,
          triggerType: "SCHEDULED_CHECK",
          propertyId: null,
          conditions: {
            all: [
              { field: "moveInDate", operator: "dateWithinNextDays", value: 7 },
              { field: "completionStatus", operator: "notEquals", value: "DONE" },
              { field: "completionStatus", operator: "notEquals", value: "YES" },
            ],
          },
          actions: [{ type: "addAuditNote", value: "Library alert: move-in risk needs supervisor review." }],
          category: "Scheduling",
          setupNotes: ["Review the seven-day lead time before enabling."],
        },
        {
          key: "library-missing-date-risk-note",
          name: "Library - Missing Date Risk Note",
          description: "Adds an audit note when a make-ready date is missing.",
          enabled: false,
          triggerType: "SCHEDULED_CHECK",
          propertyId: null,
          conditions: {
            all: [
              { field: "makeReadyDate", operator: "dateMissing" },
            ],
          },
          actions: [{ type: "addAuditNote", value: "Library alert: missing make-ready date risk needs manager review." }],
          category: "Risk / SLA",
          setupNotes: ["Use the native Risk Engine for scoring; this template is an optional activity note helper."],
        },
      ],
    },
  },
];
