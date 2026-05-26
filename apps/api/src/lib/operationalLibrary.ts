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
