import { zodToJsonSchema } from "zod-to-json-schema";
import type { ZodTypeAny } from "zod";
import { loginSchema } from "../routes/auth.js";
import {
  makeReadyBatchSchema,
  makeReadyCreateSchema,
  makeReadyCustomFieldFilterSchema,
  makeReadyPatchSchema,
  makeReadyQuerySchema,
} from "../routes/makeReady.js";
import {
  propertyCreateSchema,
  propertyPatchSchema,
  unitCreateSchema,
  unitPatchSchema,
  unitImportSchema,
  columnLabelSchema,
  scheduleTrackSchema,
  scheduleTrackPatchSchema,
  reorderScheduleTracksSchema,
  operatingCalendarSchema,
  boardOptionInputSchema,
  boardOptionPatchSchema,
  reorderOptionsSchema,
  floorPlanCreateSchema,
  floorPlanPatchSchema,
  sectionPatchSchema,
} from "../routes/operations.js";
import {
  customFieldCreateSchema,
  customFieldUpdateSchema,
  customFieldReorderSchema,
  customFieldValueSchema,
} from "../routes/customFields.js";
import {
  savedViewModuleQuerySchema,
  savedViewSchema,
  savedViewUpdateSchema,
} from "../routes/savedViews.js";
import {
  itemCommentInputSchema,
  attachmentPatchSchema,
  chargePriceSheetCreateSchema,
  chargePriceSheetPatchSchema,
  checklistTemplateInputSchema,
} from "../routes/collaboration.js";
import {
  automationInstallTemplateSchema,
  automationPreviewSchema,
  automationRunQuerySchema,
  automationToggleSchema,
  automationUpdateSchema,
} from "../routes/automations.js";
import {
  apiTokenCreateSchema,
  webhookCreateSchema,
  webhookPatchSchema,
  webhookDeliveryQuerySchema,
  webhookTestPayloadSchema,
} from "../routes/integrations.js";
import {
  vendorSchema,
  vendorPatchSchema,
  vendorAssignmentSchema,
  vendorAssignmentPatchSchema,
} from "../routes/vendors.js";
import {
  propertyMapCreateSchema,
  propertyMapPatchSchema,
  propertyMapAreaInputSchema,
  propertyMapAreaPatchSchema,
  unitMapLocationInputSchema,
  unitMapLocationPatchSchema,
} from "../routes/propertyMaps.js";
import {
  propertyTemplateCreateFromPropertySchema,
  propertyTemplateApplySchema,
} from "../routes/propertyTemplates.js";
import { planningBlockSchema, planningCapacitySchema, planningPatchBlockSchema } from "../routes/planning.js";
import { riskEvaluateSchema, riskPolicyPayloadSchema } from "../routes/risk.js";
import {
  adminCreateUserSchema,
  adminPropertyStorageRoutingSchema,
  adminResetPasswordSchema,
  adminStoragePathSchema,
  adminUpdatePropertyAccessSchema,
  adminUpdateUserSchema,
} from "../routes/admin.js";
import { operationalLibraryPackRequestSchema, operationalLibraryPackSchema } from "../routes/operationalLibrary.js";
import { webhookEventTypes } from "./webhookQueue.js";

const zodSchemas: Record<string, ZodTypeAny> = {
  AuthLoginRequest: loginSchema,
  MakeReadyQuery: makeReadyQuerySchema,
  MakeReadyCreateRequest: makeReadyCreateSchema,
  MakeReadyPatchRequest: makeReadyPatchSchema,
  MakeReadyBatchRequest: makeReadyBatchSchema,
  MakeReadyCustomFieldFilter: makeReadyCustomFieldFilterSchema,
  PropertyCreateRequest: propertyCreateSchema,
  PropertyPatchRequest: propertyPatchSchema,
  UnitCreateRequest: unitCreateSchema,
  UnitPatchRequest: unitPatchSchema,
  UnitImportRequest: unitImportSchema,
  ColumnLabelRequest: columnLabelSchema,
  ScheduleTrackCreateRequest: scheduleTrackSchema,
  ScheduleTrackPatchRequest: scheduleTrackPatchSchema,
  ScheduleTrackReorderRequest: reorderScheduleTracksSchema,
  OperatingCalendarRequest: operatingCalendarSchema,
  BoardOptionCreateRequest: boardOptionInputSchema,
  BoardOptionPatchRequest: boardOptionPatchSchema,
  BoardOptionReorderRequest: reorderOptionsSchema,
  FloorPlanCreateRequest: floorPlanCreateSchema,
  FloorPlanPatchRequest: floorPlanPatchSchema,
  SectionPatchRequest: sectionPatchSchema,
  CustomFieldCreateRequest: customFieldCreateSchema,
  CustomFieldUpdateRequest: customFieldUpdateSchema,
  CustomFieldReorderRequest: customFieldReorderSchema,
  CustomFieldValueRequest: customFieldValueSchema,
  SavedViewQuery: savedViewModuleQuerySchema,
  SavedViewCreateRequest: savedViewSchema,
  SavedViewUpdateRequest: savedViewUpdateSchema,
  ItemCommentRequest: itemCommentInputSchema,
  AttachmentPatchRequest: attachmentPatchSchema,
  ChargePriceSheetCreateRequest: chargePriceSheetCreateSchema,
  ChargePriceSheetPatchRequest: chargePriceSheetPatchSchema,
  ChecklistTemplateCreateRequest: checklistTemplateInputSchema,
  AutomationInstallTemplateRequest: automationInstallTemplateSchema,
  AutomationPreviewRequest: automationPreviewSchema,
  AutomationRunQuery: automationRunQuerySchema,
  AutomationToggleRequest: automationToggleSchema,
  AutomationUpdateRequest: automationUpdateSchema,
  ApiTokenCreateRequest: apiTokenCreateSchema,
  WebhookCreateRequest: webhookCreateSchema,
  WebhookPatchRequest: webhookPatchSchema,
  WebhookDeliveryQuery: webhookDeliveryQuerySchema,
  WebhookTestPayloadRequest: webhookTestPayloadSchema,
  VendorCreateRequest: vendorSchema,
  VendorPatchRequest: vendorPatchSchema,
  VendorAssignmentCreateRequest: vendorAssignmentSchema,
  VendorAssignmentPatchRequest: vendorAssignmentPatchSchema,
  PropertyMapCreateRequest: propertyMapCreateSchema,
  PropertyMapPatchRequest: propertyMapPatchSchema,
  PropertyMapAreaCreateRequest: propertyMapAreaInputSchema,
  PropertyMapAreaPatchRequest: propertyMapAreaPatchSchema,
  UnitMapLocationRequest: unitMapLocationInputSchema,
  UnitMapLocationPatchRequest: unitMapLocationPatchSchema,
  PropertyTemplateCreateFromPropertyRequest: propertyTemplateCreateFromPropertySchema,
  PropertyTemplateApplyRequest: propertyTemplateApplySchema,
  PlanningBlockCreateRequest: planningBlockSchema,
  PlanningBlockPatchRequest: planningPatchBlockSchema,
  PlanningCapacityRequest: planningCapacitySchema,
  RiskEvaluateRequest: riskEvaluateSchema,
  RiskPolicyRequest: riskPolicyPayloadSchema,
  AdminCreateUserRequest: adminCreateUserSchema,
  AdminUpdateUserRequest: adminUpdateUserSchema,
  AdminResetPasswordRequest: adminResetPasswordSchema,
  AdminUpdatePropertyAccessRequest: adminUpdatePropertyAccessSchema,
  AdminStoragePathRequest: adminStoragePathSchema,
  AdminPropertyStorageRoutingRequest: adminPropertyStorageRoutingSchema,
  OperationalLibraryPack: operationalLibraryPackSchema,
  OperationalLibraryPackInstallRequest: operationalLibraryPackRequestSchema,
};

const generatedValidationSchemas = Object.fromEntries(
  Object.entries(zodSchemas).map(([name, schema]) => [
    name,
    zodToJsonSchema(schema, { target: "openApi3" }),
  ]),
);

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const arrayOf = (schema: Record<string, unknown>) => ({ type: "array", items: schema });
const envelope = (key: string, schema: Record<string, unknown>, required = true) => ({
  type: "object",
  required: required ? [key] : [],
  properties: { [key]: schema },
});
const pagination = {
  type: "object",
  required: ["total", "limit", "offset", "hasMore"],
  properties: {
    total: { type: "integer" },
    limit: { type: "integer" },
    offset: { type: "integer" },
    hasMore: { type: "boolean" },
  },
};
const okResponse = {
  type: "object",
  required: ["ok"],
  properties: { ok: { type: "boolean" } },
};

const generatedResponseSchemas = {
  HealthResponse: envelope("ok", { type: "boolean" }),
  AuthUser: {
    type: "object",
    additionalProperties: true,
    properties: {
      id: { type: "string" },
      email: { type: "string", format: "email" },
      fullName: { type: "string" },
      role: { type: "string" },
      propertyAccess: arrayOf({ type: "object", additionalProperties: true }),
    },
  },
  AuthSessionResponse: {
    type: "object",
    required: ["user", "csrfToken", "roles"],
    properties: {
      user: ref("AuthUser"),
      csrfToken: { type: "string" },
      roles: arrayOf({ type: "string" }),
    },
  },
  MetaResponse: {
    type: "object",
    additionalProperties: true,
    properties: {
      properties: arrayOf(ref("Property")),
      users: arrayOf(ref("AuthUser")),
      boardGroups: arrayOf({ type: "string" }),
      boardOptions: arrayOf({ type: "object", additionalProperties: true }),
      customFields: arrayOf(ref("CustomField")),
      scheduleTracks: arrayOf({ type: "object", additionalProperties: true }),
    },
  },
  PropertiesResponse: envelope("properties", arrayOf(ref("Property"))),
  PropertyResponse: envelope("property", ref("Property")),
  UnitsResponse: envelope("units", arrayOf(ref("Unit"))),
  UnitResponse: envelope("unit", ref("Unit")),
  UnitImportResponse: envelope("summary", { type: "object", additionalProperties: true }),
  BoardSectionsResponse: envelope("sections", arrayOf(ref("BoardSection"))),
  BoardSectionResponse: envelope("section", ref("BoardSection")),
  BoardColumnsResponse: envelope("columns", arrayOf(ref("BoardColumnDefinition"))),
  BoardColumnResponse: envelope("column", ref("BoardColumnDefinition")),
  ScheduleTracksResponse: envelope("tracks", arrayOf(ref("ScheduleTrack"))),
  ScheduleTrackResponse: envelope("track", ref("ScheduleTrack")),
  OperatingCalendarsResponse: envelope("calendars", arrayOf(ref("OperatingCalendar"))),
  OperatingCalendarResponse: envelope("calendar", ref("OperatingCalendar")),
  BoardOptionsResponse: envelope("options", arrayOf(ref("BoardOption"))),
  BoardOptionResponse: envelope("option", ref("BoardOption")),
  FloorPlansResponse: envelope("floorPlans", arrayOf(ref("FloorPlan"))),
  FloorPlanResponse: envelope("floorPlan", ref("FloorPlan")),
  CustomFieldsResponse: envelope("fields", arrayOf(ref("CustomField"))),
  CustomFieldResponse: envelope("field", ref("CustomField")),
  CustomFieldValueResponse: {
    type: "object",
    required: ["fieldId", "itemId", "value"],
    properties: {
      fieldId: { type: "string" },
      itemId: { type: "string" },
      value: {},
    },
  },
  SavedViewsResponse: envelope("views", arrayOf(ref("SavedView"))),
  SavedViewResponse: envelope("view", ref("SavedView")),
  MakeReadyItemsResponse: arrayOf(ref("MakeReadyItem")),
  MakeReadyItemResponse: envelope("item", ref("MakeReadyItem")),
  MakeReadyBatchResponse: {
    type: "object",
    additionalProperties: true,
    properties: {
      updated: { type: "integer" },
      items: arrayOf(ref("MakeReadyItem")),
    },
  },
  CommentsResponse: envelope("comments", arrayOf(ref("Comment"))),
  CommentResponse: envelope("comment", ref("Comment")),
  CollaborationResponse: {
    type: "object",
    additionalProperties: true,
    properties: {
      comments: arrayOf(ref("Comment")),
      attachments: arrayOf(ref("Attachment")),
      checklists: arrayOf({ type: "object", additionalProperties: true }),
    },
  },
  AttachmentsResponse: envelope("items", arrayOf(ref("Attachment"))),
  AttachmentResponse: envelope("attachment", ref("Attachment")),
  ChargeReportResponse: ref("ChargeReport"),
  ChecklistTemplatesResponse: envelope("templates", arrayOf(ref("ChecklistTemplate"))),
  ChecklistTemplateResponse: envelope("template", ref("ChecklistTemplate")),
  ChecklistInstanceResponse: envelope("instance", ref("ChecklistInstance")),
  ChecklistItemResponse: envelope("checklistItem", ref("ChecklistItem")),
  DashboardSummaryResponse: ref("DashboardSummary"),
  AnalyticsSummaryResponse: { type: "object", additionalProperties: true },
  AnalyticsSnapshotsResponse: envelope("snapshots", arrayOf({ type: "object", additionalProperties: true })),
  RiskSummaryResponse: { type: "object", additionalProperties: true },
  RiskItemsResponse: arrayOf(ref("RiskItem")),
  RiskPoliciesResponse: envelope("policies", arrayOf({ type: "object", additionalProperties: true })),
  RiskPolicyResponse: envelope("policy", { type: "object", additionalProperties: true }),
  PlanningBlocksResponse: {
    type: "object",
    additionalProperties: true,
    properties: {
      blocks: arrayOf(ref("WorkAssignmentBlock")),
      staff: arrayOf(ref("AuthUser")),
      unscheduled: arrayOf(ref("MakeReadyItem")),
    },
  },
  PlanningBlockResponse: envelope("block", ref("WorkAssignmentBlock")),
  PlanningCapacityResponse: envelope("capacity", { type: "object", additionalProperties: true }),
  VendorsResponse: envelope("vendors", arrayOf(ref("Vendor"))),
  VendorResponse: envelope("vendor", ref("Vendor")),
  VendorAssignmentsResponse: {
    type: "object",
    required: ["assignments"],
    properties: {
      assignments: arrayOf(ref("VendorAssignment")),
      pagination,
    },
  },
  VendorAssignmentResponse: envelope("assignment", ref("VendorAssignment")),
  PropertyMapsResponse: envelope("maps", arrayOf(ref("PropertyMap"))),
  PropertyMapResponse: envelope("map", ref("PropertyMap")),
  PropertyMapAreasResponse: envelope("areas", arrayOf({ type: "object", additionalProperties: true })),
  PropertyMapAreaResponse: envelope("area", { type: "object", additionalProperties: true }),
  UnitMapLocationsResponse: envelope("locations", arrayOf(ref("UnitMapLocation"))),
  UnitMapLocationResponse: envelope("location", ref("UnitMapLocation")),
  ActivityResponse: {
    type: "object",
    required: ["activity"],
    properties: {
      activity: arrayOf(ref("ActivityEntry")),
      filters: ref("ActivityFilters"),
      pagination,
    },
  },
  NotificationsResponse: {
    type: "object",
    required: ["notifications"],
    properties: {
      notifications: arrayOf(ref("Notification")),
      unreadCount: { type: "integer" },
      pagination,
    },
  },
  NotificationPreferenceResponse: envelope("preference", { type: "object", additionalProperties: true }),
  PropertyTemplatesResponse: envelope("templates", arrayOf(ref("PropertyTemplate"))),
  PropertyTemplateResponse: envelope("template", ref("PropertyTemplate")),
  PropertyTemplateApplyResponse: {
    type: "object",
    required: ["dryRun", "summary"],
    properties: {
      dryRun: { type: "boolean" },
      summary: { type: "object", additionalProperties: true },
    },
  },
  AutomationRulesResponse: envelope("rules", arrayOf(ref("AutomationRule"))),
  AutomationRuleResponse: envelope("rule", ref("AutomationRule")),
  AutomationTemplatesResponse: envelope("templates", arrayOf(ref("AutomationTemplate"))),
  AutomationPreviewResponse: {
    type: "object",
    additionalProperties: true,
    properties: {
      matchingItemCount: { type: "integer" },
      rule: ref("AutomationPreviewRule"),
      affectedItems: arrayOf(ref("AutomationPreviewAffectedItem")),
      warnings: arrayOf({ type: "string" }),
    },
  },
  AutomationExecutionResponse: envelope("execution", ref("AutomationExecution")),
  AutomationRunsResponse: {
    type: "object",
    required: ["runs", "pagination"],
    properties: {
      runs: arrayOf(ref("AutomationRun")),
      pagination,
    },
  },
  OperationalLibraryResponse: {
    type: "object",
    required: ["packs", "installedPacks"],
    properties: {
      packs: arrayOf(ref("OperationalLibraryPackSummary")),
      installedPacks: arrayOf(ref("InstalledOperationalLibraryPack")),
    },
  },
  OperationalLibraryInstallResponse: {
    type: "object",
    required: ["summary"],
    properties: {
      pack: ref("InstalledOperationalLibraryPack"),
      summary: ref("OperationalLibraryInstallSummary"),
    },
  },
  NativeBackupData: {
    type: "object",
    required: [
      "properties",
      "units",
      "makeReadyItems",
      "customFields",
      "customFieldOptions",
      "customFieldValues",
      "savedViews",
      "automationRules",
      "checklistTemplates",
      "notes",
    ],
    properties: {
      properties: arrayOf({ type: "object", additionalProperties: true }),
      floorPlans: arrayOf({ type: "object", additionalProperties: true }),
      boardOptions: arrayOf({ type: "object", additionalProperties: true }),
      boardColumns: arrayOf({ type: "object", additionalProperties: true }),
      boardSections: arrayOf({ type: "object", additionalProperties: true }),
      scheduleTracks: arrayOf({ type: "object", additionalProperties: true }),
      operatingCalendars: arrayOf({ type: "object", additionalProperties: true }),
      riskPolicies: arrayOf({ type: "object", additionalProperties: true }),
      units: arrayOf({ type: "object", additionalProperties: true }),
      makeReadyItems: arrayOf({ type: "object", additionalProperties: true }),
      customFields: arrayOf({ type: "object", additionalProperties: true }),
      customFieldOptions: arrayOf({ type: "object", additionalProperties: true }),
      customFieldValues: arrayOf({ type: "object", additionalProperties: true }),
      savedViews: arrayOf({ type: "object", additionalProperties: true }),
      automationRules: arrayOf({ type: "object", additionalProperties: true }),
      checklistTemplates: arrayOf({ type: "object", additionalProperties: true }),
      chargePriceSheetItems: arrayOf({ type: "object", additionalProperties: true }),
      comments: arrayOf({ type: "object", additionalProperties: true }),
      vendors: arrayOf({ type: "object", additionalProperties: true }),
      vendorAssignments: arrayOf({ type: "object", additionalProperties: true }),
      propertyMaps: arrayOf({ type: "object", additionalProperties: true }),
      propertyMapAreas: arrayOf({ type: "object", additionalProperties: true }),
      unitMapLocations: arrayOf({ type: "object", additionalProperties: true }),
      checklistInstances: arrayOf({ type: "object", additionalProperties: true }),
      notes: arrayOf({ type: "object", additionalProperties: true }),
      propertyTemplates: arrayOf({ type: "object", additionalProperties: true }),
    },
  },
  NativeBackup: {
    type: "object",
    required: ["format", "version", "exportedAt", "source", "data"],
    properties: {
      format: { type: "string", enum: ["makereadyos.backup"] },
      version: { type: "integer", enum: [1] },
      exportedAt: { type: "string", format: "date-time" },
      source: {
        type: "object",
        required: ["app"],
        properties: {
          app: { type: "string", enum: ["MakeReadyOS"] },
          schemaVersion: { type: "string" },
        },
      },
      data: ref("NativeBackupData"),
    },
  },
  BackupImportRequest: {
    type: "object",
    required: ["backup"],
    properties: {
      dryRun: { type: "boolean", default: true },
      mode: { type: "string", enum: ["merge"], default: "merge" },
      backup: ref("NativeBackup"),
    },
  },
  BackupExportResponse: ref("NativeBackup"),
  BackupImportResponse: {
    type: "object",
    required: ["dryRun", "mode", "summary"],
    properties: {
      dryRun: { type: "boolean" },
      mode: { type: "string", enum: ["merge"] },
      summary: { type: "object", additionalProperties: true },
    },
  },
  AdminIntegrationsResponse: {
    type: "object",
    required: ["apiTokens", "webhooks"],
    properties: {
      apiTokens: arrayOf(ref("ApiToken")),
      webhooks: arrayOf(ref("WebhookEndpoint")),
      scopes: arrayOf({ type: "string" }),
      webhookEvents: arrayOf({ type: "string" }),
      properties: arrayOf(ref("Property")),
      webhookDelivery: { type: "string" },
    },
  },
  ApiTokenResponse: {
    type: "object",
    required: ["apiToken"],
    properties: {
      apiToken: ref("ApiToken"),
      token: { type: "string" },
    },
  },
  WebhookResponse: {
    type: "object",
    required: ["webhook"],
    properties: {
      webhook: ref("WebhookEndpoint"),
      secret: { type: "string" },
    },
  },
  WebhookDeliveriesResponse: envelope("deliveries", arrayOf(ref("WebhookDeliveryAttempt"))),
  WebhookHealthResponse: {
    type: "object",
    required: ["webhook", "health"],
    properties: {
      webhook: ref("WebhookEndpoint"),
      health: {
        type: "object",
        required: ["state", "total", "pendingCount", "statusCounts", "eventCounts", "failureCount"],
        properties: {
          state: { type: "string", enum: ["READY", "PENDING", "FAILING", "DISABLED"] },
          total: { type: "integer" },
          pendingCount: { type: "integer" },
          statusCounts: { type: "object", additionalProperties: { type: "integer" } },
          eventCounts: { type: "object", additionalProperties: { type: "integer" } },
          failureCount: { type: "integer" },
          lastDeliveryAt: { type: ["string", "null"], format: "date-time" },
          oldestPendingAt: { type: ["string", "null"], format: "date-time" },
          latestFailure: { oneOf: [ref("WebhookDeliveryAttempt"), { type: "null" }] },
        },
      },
    },
  },
  AdminUsersResponse: envelope("users", arrayOf(ref("AuthUser"))),
  AdminPropertiesResponse: envelope("properties", arrayOf(ref("Property"))),
  AdminStorageResponse: { type: "object", additionalProperties: true },
  CalendarEventsResponse: envelope("events", arrayOf(ref("CalendarEvent"))),
  ChargePriceSheetItemsResponse: envelope("items", arrayOf(ref("ChargePriceSheetItem"))),
  ChargePriceSheetItemResponse: envelope("item", ref("ChargePriceSheetItem")),
  MyWorkResponse: ref("MyWork"),
  PlanningSummaryResponse: ref("PlanningSummary"),
  PlanningCapacitiesResponse: envelope("capacities", arrayOf(ref("PlanningCapacity"))),
  OkResponse: okResponse,
};

const json = (schema: Record<string, unknown>) => ({
  content: { "application/json": { schema } },
});

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "MakeReadyOS API",
    version: "0.1.0-rc",
    description:
      "Self-hosted property operations API for make-ready boards, comments, vendors, maps, risk, dashboard summaries, and integration management.",
  },
  servers: [
    {
      url: "/",
      description: "Current MakeReadyOS instance",
    },
  ],
  tags: [
    { name: "System" },
    { name: "Auth" },
    { name: "Make Ready Items" },
    { name: "Operations" },
    { name: "Custom Fields" },
    { name: "Saved Views" },
    { name: "Comments And Attachments" },
    { name: "Dashboard" },
    { name: "Analytics" },
    { name: "Risk" },
    { name: "Planning" },
    { name: "Vendors" },
    { name: "Property Maps" },
    { name: "Activity" },
    { name: "Notifications" },
    { name: "Property Templates" },
    { name: "Operational Library" },
    { name: "Backup And Transfer" },
    { name: "Integrations" },
  ],
  components: {
    securitySchemes: {
      cookieSession: {
        type: "apiKey",
        in: "cookie",
        name: "makereadyos.sid",
        description: "Browser session cookie. Write requests also require a CSRF token.",
      },
      bearerApiToken: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "mro_*",
        description: "Scoped API token created from Admin -> Integrations.",
      },
    },
    schemas: {
      ...generatedValidationSchemas,
      ...generatedResponseSchemas,
      ErrorResponse: {
        type: "object",
        required: ["message"],
        properties: {
          message: { type: "string" },
        },
      },
      PaginationHeaders: {
        type: "object",
        properties: {
          "x-total-count": { type: "integer" },
          "x-limit": { type: "integer" },
          "x-offset": { type: "integer" },
          "x-has-more": { type: "boolean" },
          "x-next-offset": { type: "integer" },
        },
      },
      MakeReadyItem: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: { type: "string" },
          propertyId: { type: "string" },
          unitId: { type: "string" },
          unitNumber: { type: "string" },
          boardGroup: { type: "string" },
          vacancyStatus: { type: ["string", "null"] },
          makeReadyStatus: { type: ["string", "null"] },
          assignedTech: { type: ["string", "null"] },
          moveInDate: { type: ["string", "null"], format: "date-time" },
          riskLevel: { type: ["string", "null"] },
          riskScore: { type: ["number", "null"] },
          isArchived: { type: "boolean" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Property: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          code: { type: "string" },
          occupancyGoalPercent: { type: ["number", "null"] },
          isActive: { type: "boolean" },
        },
      },
      Unit: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: { type: "string" },
          propertyId: { type: "string" },
          unitNumber: { type: "string" },
          floorPlan: { type: ["string", "null"] },
          building: { type: ["string", "null"] },
          area: { type: ["string", "null"] },
          floor: { type: ["string", "null"] },
          occupancyStatus: { type: ["string", "null"] },
          isActive: { type: "boolean" },
        },
      },
      BoardSection: {
        type: "object",
        properties: {
          id: { type: "string" },
          propertyId: { type: "string" },
          key: { type: "string" },
          sectionType: { type: "string", enum: ["READY", "MAKE_READY", "DOWN", "ARCHIVE"] },
          displayName: { type: "string" },
          sortOrder: { type: "integer" },
          isActive: { type: "boolean" },
        },
      },
      BoardColumnDefinition: {
        type: "object",
        required: ["fieldKey", "defaultLabel", "displayLabel"],
        properties: {
          fieldKey: { type: "string", description: "Stable internal field key. Display-label edits must not change this value." },
          defaultLabel: { type: "string" },
          displayLabel: { type: "string" },
          isRequired: { type: "boolean" },
          sortOrder: { type: "integer" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      BoardOption: {
        type: "object",
        required: ["id", "fieldKey", "value", "label", "color"],
        properties: {
          id: { type: "string" },
          fieldKey: { type: "string" },
          value: { type: "string" },
          label: { type: "string" },
          color: { type: "string" },
          sortOrder: { type: "integer" },
          isArchived: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      FloorPlan: {
        type: "object",
        required: ["id", "propertyId", "name", "isActive"],
        properties: {
          id: { type: "string" },
          propertyId: { type: "string" },
          name: { type: "string" },
          beds: { type: ["number", "null"] },
          baths: { type: ["number", "null"] },
          sqft: { type: ["integer", "null"] },
          description: { type: ["string", "null"] },
          color: { type: ["string", "null"] },
          isActive: { type: "boolean" },
          property: ref("Property"),
        },
      },
      ScheduleTrack: {
        type: "object",
        required: ["id", "sourceField", "displayName", "isEnabled"],
        properties: {
          id: { type: "string" },
          sourceField: { type: "string" },
          displayName: { type: "string" },
          colorSource: { type: ["string", "null"] },
          fixedColor: { type: ["string", "null"] },
          legendOverride: { type: ["string", "null"] },
          sortOrder: { type: "integer" },
          isEnabled: { type: "boolean" },
          isArchived: { type: "boolean" },
          visibilityFilters: { type: "object", additionalProperties: true },
          overdueEnabled: { type: "boolean" },
          moveInRiskEnabled: { type: "boolean" },
        },
      },
      OperatingCalendar: {
        type: "object",
        required: ["propertyId"],
        properties: {
          id: { type: "string" },
          propertyId: { type: "string" },
          property: ref("Property"),
          noWeekendScheduling: { type: "boolean" },
          avoidMondayScheduling: { type: "boolean" },
          avoidFridayScheduling: { type: "boolean" },
          operatingHoursStart: { type: ["string", "null"] },
          operatingHoursEnd: { type: ["string", "null"] },
          dailyScheduledUnitLimit: { type: ["integer", "null"] },
          autoPopulateEnabled: { type: "boolean" },
          autoPopulateSteps: { type: "object", additionalProperties: true },
        },
      },
      CustomField: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          fieldType: { type: "string", enum: ["TEXT", "LONG_TEXT", "NUMBER", "DATE", "SINGLE_SELECT", "MULTI_SELECT", "BOOLEAN", "USER"] },
          description: { type: ["string", "null"] },
          sortOrder: { type: "integer" },
          isArchived: { type: "boolean" },
          trashedAt: { type: ["string", "null"], format: "date-time" },
        },
      },
      SavedView: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          module: { type: "string" },
          viewType: { type: "string", enum: ["table", "kanban", "calendar", "dashboard"] },
          filters: { type: "object", additionalProperties: true },
          grouping: { type: ["object", "null"], additionalProperties: true },
          visibleColumns: { type: ["array", "null"], items: { type: "string" } },
          isShared: { type: "boolean" },
        },
      },
      Comment: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: { type: "string" },
          itemId: { type: "string" },
          body: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Attachment: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: { type: "string" },
          itemId: { type: "string" },
          uploadedById: { type: ["string", "null"] },
          uploaderName: { type: "string" },
          originalName: { type: "string" },
          mimeType: { type: "string" },
          sizeBytes: { type: "integer" },
          note: { type: ["string", "null"] },
          inspectionStage: { type: "string" },
          category: { type: ["string", "null"] },
          chargeCandidate: { type: "boolean" },
          chargeNote: { type: ["string", "null"] },
          chargePriceSheetItemId: { type: ["string", "null"] },
          chargePriceSheetItem: { anyOf: [ref("ChargePriceSheetItem"), { type: "null" }] },
          chargeQuantity: { type: ["number", "null"] },
          chargeEstimatedCents: { type: ["integer", "null"] },
          markupAnnotations: {
            type: ["array", "null"],
            items: ref("AttachmentMarkupAnnotation"),
          },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      AttachmentMarkupAnnotation: {
        type: "object",
        additionalProperties: true,
        required: ["id", "x", "y", "label"],
        properties: {
          id: { type: "string" },
          x: { type: "number", minimum: 0, maximum: 100 },
          y: { type: "number", minimum: 0, maximum: 100 },
          label: { type: "string" },
          note: { type: ["string", "null"] },
          category: { type: ["string", "null"] },
          chargeCandidate: { type: "boolean" },
          chargePriceSheetItemId: { type: ["string", "null"] },
          chargePriceSheetItemName: { type: ["string", "null"] },
          chargeQuantity: { type: ["number", "null"] },
          chargeEstimatedCents: { type: ["integer", "null"] },
        },
      },
      ChargeReport: {
        type: "object",
        additionalProperties: true,
        properties: {
          item: {
            type: "object",
            additionalProperties: true,
            properties: {
              id: { type: "string" },
              propertyId: { type: "string" },
              propertyCode: { type: "string" },
              unitNumber: { type: "string" },
              boardGroup: { type: "string" },
            },
          },
          summary: {
            type: "object",
            properties: {
              fileCount: { type: "integer" },
              pinCount: { type: "integer" },
              lineCount: { type: "integer" },
              missingContext: { type: "integer" },
              totalEstimatedCents: { type: "integer" },
            },
          },
          lines: arrayOf({
            type: "object",
            additionalProperties: true,
            properties: {
              type: { type: "string", enum: ["FILE", "PIN"] },
              attachmentId: { type: "string" },
              attachmentName: { type: "string" },
              pinId: { type: ["string", "null"] },
              label: { type: "string" },
              category: { type: ["string", "null"] },
              inspectionStage: { type: "string" },
              note: { type: ["string", "null"] },
              chargeNote: { type: ["string", "null"] },
              priceSheetItemId: { type: ["string", "null"] },
              priceSheetItemName: { type: ["string", "null"] },
              quantity: { type: ["number", "null"] },
              estimatedCents: { type: "integer" },
            },
          }),
        },
      },
      ChecklistTemplate: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          category: { type: ["string", "null"] },
          isActive: { type: "boolean" },
          items: arrayOf({
            type: "object",
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              required: { type: "boolean" },
              sortOrder: { type: "integer" },
            },
          }),
        },
      },
      ChecklistInstance: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: { type: "string" },
          itemId: { type: "string" },
          templateId: { type: ["string", "null"] },
          title: { type: "string" },
          progressPercent: { type: "number" },
          items: arrayOf(ref("ChecklistItem")),
        },
      },
      ChecklistItem: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          required: { type: "boolean" },
          completedAt: { type: ["string", "null"], format: "date-time" },
          completedByUserId: { type: ["string", "null"] },
          notes: { type: ["string", "null"] },
        },
      },
      ChargePriceSheetItem: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: { type: "string" },
          propertyId: { type: ["string", "null"] },
          category: { type: "string" },
          label: { type: "string" },
          defaultAmount: { type: ["number", "null"] },
          isActive: { type: "boolean" },
        },
      },
      CalendarEvent: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: { type: "string" },
          itemId: { type: "string" },
          title: { type: "string" },
          date: { type: "string", format: "date" },
          sourceField: { type: "string" },
          sourceLabel: { type: "string" },
          color: { type: "string" },
          statusLabel: { type: ["string", "null"] },
          propertyCode: { type: ["string", "null"] },
          unitNumber: { type: ["string", "null"] },
        },
      },
      DashboardSummary: {
        type: "object",
        additionalProperties: true,
        properties: {
          kpis: { type: "object", additionalProperties: { type: "number" } },
          vacancyBreakdown: { type: "object", additionalProperties: { type: "number" } },
          scopeBreakdown: { type: "object", additionalProperties: { type: "number" } },
          techWorkload: { type: "object", additionalProperties: { type: "number" } },
          riskByLevel: { type: "object", additionalProperties: { type: "number" } },
        },
      },
      ActivityEntry: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: { type: "string" },
          actorUserId: { type: ["string", "null"] },
          action: { type: "string" },
          entityType: { type: "string" },
          entityId: { type: ["string", "null"] },
          message: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Notification: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: { type: "string" },
          recipientUserId: { type: "string" },
          category: { type: "string" },
          title: { type: "string" },
          body: { type: "string" },
          isRead: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Vendor: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          category: { type: ["string", "null"] },
          phone: { type: ["string", "null"] },
          email: { type: ["string", "null"] },
          isPreferred: { type: "boolean" },
          isArchived: { type: "boolean" },
        },
      },
      VendorAssignment: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: { type: "string" },
          vendorId: { type: "string" },
          makeReadyItemId: { type: "string" },
          category: { type: "string" },
          status: { type: "string" },
          scheduledDate: { type: ["string", "null"], format: "date-time" },
          dueDate: { type: ["string", "null"], format: "date-time" },
          completedAt: { type: ["string", "null"], format: "date-time" },
        },
      },
      PropertyMap: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: { type: "string" },
          propertyId: { type: "string" },
          name: { type: "string" },
          attachmentId: { type: ["string", "null"] },
          isActive: { type: "boolean" },
          isArchived: { type: "boolean" },
        },
      },
      UnitMapLocation: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: { type: "string" },
          propertyId: { type: "string" },
          unitId: { type: "string" },
          mapId: { type: "string" },
          xPercent: { type: "number" },
          yPercent: { type: "number" },
        },
      },
      RiskItem: {
        type: "object",
        additionalProperties: true,
        properties: {
          itemId: { type: "string" },
          unitNumber: { type: "string" },
          propertyCode: { type: "string" },
          riskLevel: { type: "string", enum: ["NONE", "LOW", "MEDIUM", "HIGH", "CRITICAL"] },
          riskScore: { type: "number" },
          reasons: { type: "array", items: { type: "string" } },
        },
      },
      WorkAssignmentBlock: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: { type: "string" },
          assignedUserId: { type: "string" },
          makeReadyItemId: { type: "string" },
          propertyId: { type: "string" },
          category: { type: "string" },
          plannedDate: { type: "string", format: "date-time" },
          status: { type: "string" },
        },
      },
      PlanningCapacity: {
        type: "object",
        additionalProperties: true,
        properties: {
          userId: { type: "string" },
          defaultDailyCapacityHours: { type: ["number", "null"] },
          trades: { type: "array", items: { type: "string" } },
          unavailableDays: { type: "array", items: { type: "string" } },
          user: ref("AuthUser"),
        },
      },
      PlanningSummary: {
        type: "object",
        additionalProperties: true,
        properties: {
          from: { type: "string", format: "date-time" },
          to: { type: "string", format: "date-time" },
          propertyId: { type: ["string", "null"] },
          blocks: arrayOf(ref("WorkAssignmentBlock")),
          capacities: arrayOf(ref("PlanningCapacity")),
          coverage: { type: "object", additionalProperties: true },
          overloaded: arrayOf({ type: "object", additionalProperties: true }),
          unplanned: arrayOf(ref("MakeReadyItem")),
        },
      },
      MyWork: {
        type: "object",
        additionalProperties: true,
        properties: {
          assignedItems: arrayOf(ref("MakeReadyItem")),
          plannedBlocks: arrayOf(ref("WorkAssignmentBlock")),
          checklistItems: arrayOf(ref("ChecklistItem")),
          notifications: arrayOf(ref("Notification")),
        },
      },
      PropertyTemplate: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          description: { type: ["string", "null"] },
          category: { type: ["string", "null"] },
          version: { type: "integer" },
          isArchived: { type: "boolean" },
        },
      },
      AutomationRule: {
        type: "object",
        additionalProperties: true,
        required: ["id", "name", "enabled", "triggerType"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          description: { type: ["string", "null"] },
          enabled: { type: "boolean" },
          triggerType: { type: "string" },
          conditions: { type: "array", items: { type: "object", additionalProperties: true } },
          actions: { type: "array", items: { type: "object", additionalProperties: true } },
          propertyId: { type: ["string", "null"] },
          templateId: { type: ["string", "null"] },
          libraryPackId: { type: ["string", "null"] },
          isArchived: { type: "boolean" },
          lastRunAt: { type: ["string", "null"], format: "date-time" },
          runCount: { type: "integer" },
          matchedCount: { type: "integer" },
          actionCount: { type: "integer" },
          errorCount: { type: "integer" },
        },
      },
      AutomationTemplate: {
        type: "object",
        additionalProperties: true,
        required: ["id", "name", "triggerType", "installed"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          category: { type: "string" },
          triggerType: { type: "string" },
          defaultConditions: { type: "array", items: { type: "object", additionalProperties: true } },
          defaultActions: { type: "array", items: { type: "object", additionalProperties: true } },
          requiredFields: { type: "array", items: { type: "string" } },
          setupNotes: { type: "array", items: { type: "string" } },
          installed: { type: "boolean" },
        },
      },
      AutomationPreviewRule: {
        type: "object",
        properties: {
          name: { type: "string" },
          triggerType: { type: "string" },
          propertyId: { type: ["string", "null"] },
        },
      },
      AutomationPreviewAffectedItem: {
        type: "object",
        additionalProperties: true,
        properties: {
          itemId: { type: "string" },
          unitNumber: { type: "string" },
          propertyCode: { type: "string" },
          matches: { type: "array", items: { type: "string" } },
          proposedActions: { type: "array", items: { type: "object", additionalProperties: true } },
        },
      },
      AutomationExecution: {
        type: "object",
        additionalProperties: true,
        properties: {
          ruleId: { type: ["string", "null"] },
          checkedCount: { type: "integer" },
          matchedCount: { type: "integer" },
          actionCount: { type: "integer" },
          errors: { type: "array", items: { type: "string" } },
          warnings: { type: "array", items: { type: "string" } },
          startedAt: { type: "string", format: "date-time" },
          completedAt: { type: "string", format: "date-time" },
        },
      },
      AutomationRun: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: { type: "string" },
          ruleId: { type: ["string", "null"] },
          itemId: { type: ["string", "null"] },
          triggerType: { type: "string" },
          matchedCount: { type: "integer" },
          actionCount: { type: "integer" },
          errorCount: { type: "integer" },
          ranAt: { type: "string", format: "date-time" },
          rule: ref("AutomationRule"),
          item: ref("MakeReadyItem"),
        },
      },
      OperationalLibraryPackSummary: {
        type: "object",
        additionalProperties: true,
        required: ["packKey", "name", "version"],
        properties: {
          packKey: { type: "string" },
          name: { type: "string" },
          version: { type: "integer" },
          category: { type: ["string", "null"] },
          description: { type: ["string", "null"] },
          setupNotes: { type: "array", items: { type: "string" } },
          installed: { type: "boolean" },
          installedAt: { type: ["string", "null"], format: "date-time" },
        },
      },
      InstalledOperationalLibraryPack: {
        type: "object",
        additionalProperties: true,
        required: ["packKey", "name", "version"],
        properties: {
          id: { type: "string" },
          packKey: { type: "string" },
          name: { type: "string" },
          version: { type: "integer" },
          category: { type: ["string", "null"] },
          description: { type: ["string", "null"] },
          source: { type: ["string", "null"] },
          installedAt: { type: ["string", "null"], format: "date-time" },
          manifest: { type: "object", additionalProperties: true },
        },
      },
      OperationalLibraryInstallBucketSummary: {
        type: "object",
        required: ["created", "skipped", "conflicts", "errors"],
        properties: {
          created: { type: "integer" },
          skipped: { type: "integer" },
          conflicts: { type: "integer" },
          errors: { type: "array", items: { type: "string" } },
        },
      },
      OperationalLibraryInstallSummary: {
        type: "object",
        additionalProperties: false,
        properties: {
          customFields: ref("OperationalLibraryInstallBucketSummary"),
          optionSets: ref("OperationalLibraryInstallBucketSummary"),
          checklistTemplates: ref("OperationalLibraryInstallBucketSummary"),
          scheduleTracks: ref("OperationalLibraryInstallBucketSummary"),
          savedViews: ref("OperationalLibraryInstallBucketSummary"),
          automationTemplates: ref("OperationalLibraryInstallBucketSummary"),
          propertyTemplates: ref("OperationalLibraryInstallBucketSummary"),
        },
      },
      ApiTokenCreate: {
        type: "object",
        required: ["name", "scopes"],
        properties: {
          name: { type: "string", minLength: 2, maxLength: 120 },
          scopes: {
            type: "array",
            minItems: 1,
            items: {
              type: "string",
              enum: [
                "read:items",
                "write:items",
                "read:vendors",
                "write:vendors",
                "read:dashboard",
                "read:activity",
                "write:comments",
                "read:maps",
                "read:library",
                "write:library",
              ],
            },
          },
          propertyIds: {
            type: "array",
            items: { type: "string" },
            default: [],
          },
        },
      },
      WebhookCreate: {
        type: "object",
        required: ["name", "url", "eventTypes"],
        properties: {
          name: { type: "string", minLength: 2, maxLength: 120 },
          url: { type: "string", format: "uri" },
          eventTypes: {
            type: "array",
            minItems: 1,
            items: {
              type: "string",
              enum: webhookEventTypes,
            },
          },
          propertyIds: {
            type: "array",
            items: { type: "string" },
            default: [],
          },
        },
      },
      ApiToken: {
        type: "object",
        required: ["id", "name", "tokenPrefix", "tokenLastFour", "scopes", "isActive"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          tokenPrefix: { type: "string" },
          tokenLastFour: { type: "string" },
          scopes: { type: "array", items: { type: "string" } },
          isActive: { type: "boolean" },
          revokedAt: { type: ["string", "null"], format: "date-time" },
          lastUsedAt: { type: ["string", "null"], format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          createdBy: ref("AuthUser"),
          properties: arrayOf(ref("Property")),
        },
      },
      WebhookEndpoint: {
        type: "object",
        required: ["id", "name", "url", "eventTypes", "isEnabled", "failureCount"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          url: { type: "string", format: "uri" },
          secretLastFour: { type: "string" },
          eventTypes: { type: "array", items: { type: "string" } },
          isEnabled: { type: "boolean" },
          lastDeliveryAt: { type: ["string", "null"], format: "date-time" },
          failureCount: { type: "integer" },
          deliveryAttemptCount: { type: "integer" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          createdBy: ref("AuthUser"),
          properties: arrayOf(ref("Property")),
        },
      },
      WebhookDeliveryAttempt: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: { type: "string" },
          webhookId: { type: "string" },
          eventType: { type: "string" },
          status: { type: "string", examples: ["DRY_RUN", "PENDING", "DELIVERED", "FAILED", "GAVE_UP"] },
          deliveryId: { type: "string" },
          payload: { type: "object" },
          headers: { type: "object" },
          attemptNumber: { type: "integer" },
          responseStatus: { type: ["integer", "null"] },
          responseBody: { type: ["string", "null"] },
          errorMessage: { type: ["string", "null"] },
          nextAttemptAt: { type: ["string", "null"], format: "date-time" },
          deliveredAt: { type: ["string", "null"], format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      ActivityFilters: {
        type: "object",
        additionalProperties: true,
        properties: {
          from: { type: ["string", "null"], format: "date-time" },
          to: { type: ["string", "null"], format: "date-time" },
          actorUserId: { type: ["string", "null"] },
          action: { type: ["string", "null"] },
          entityType: { type: ["string", "null"] },
          propertyId: { type: ["string", "null"] },
        },
      },
    },
    responses: {
      Unauthorized: {
        description: "Authentication required or token invalid.",
        content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
      },
      Forbidden: {
        description: "Authenticated principal does not have the required role, scope, or property access.",
        content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
      },
      BadRequest: {
        description: "Request body, query parameters, or import file failed validation.",
        content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
      },
    },
  },
  paths: {
    "/health": {
      get: {
        tags: ["System"],
        summary: "Health check",
        responses: {
          "200": { description: "API process is running.", ...json(ref("HealthResponse")) },
        },
      },
    },
    "/api/openapi.json": {
      get: {
        tags: ["System"],
        summary: "OpenAPI contract",
        responses: {
          "200": { description: "This OpenAPI document." },
        },
      },
    },
    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Create a browser session",
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("AuthLoginRequest") } },
        },
        responses: {
          "200": { description: "Login succeeded.", ...json(ref("AuthSessionResponse")) },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Return the current browser session user",
        responses: {
          "200": { description: "Current user.", ...json(ref("AuthSessionResponse")) },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "End current browser session",
        responses: {
          "200": { description: "Current session ended.", ...json(ref("OkResponse")) },
        },
      },
    },
    "/api/auth/logout-all": {
      post: {
        tags: ["Auth"],
        summary: "End all sessions for the current user",
        responses: {
          "200": { description: "All current-user sessions ended.", ...json(ref("OkResponse")) },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/meta": {
      get: {
        tags: ["Make Ready Items"],
        summary: "Board metadata",
        security: [{ cookieSession: [] }, { bearerApiToken: [] }],
        responses: {
          "200": { description: "Properties, users, option metadata, sections, and board configuration.", ...json(ref("MetaResponse")) },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/api/operations/properties": {
      get: {
        tags: ["Operations"],
        summary: "List accessible properties",
        security: [{ cookieSession: [] }, { bearerApiToken: [] }],
        responses: {
          "200": {
            description: "Accessible property records.",
            ...json(ref("PropertiesResponse")),
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
      post: {
        tags: ["Operations"],
        summary: "Create property",
        security: [{ cookieSession: [] }],
        responses: {
          "201": { description: "Property created.", ...json(ref("PropertyResponse")) },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/api/operations/units": {
      get: {
        tags: ["Operations"],
        summary: "List units",
        security: [{ cookieSession: [] }, { bearerApiToken: [] }],
        parameters: [
          { name: "propertyId", in: "query", schema: { type: "string" } },
          { name: "includeArchived", in: "query", schema: { type: "boolean" } },
        ],
        responses: {
          "200": {
            description: "Unit directory records.",
            ...json(ref("UnitsResponse")),
          },
        },
      },
      post: {
        tags: ["Operations"],
        summary: "Create unit",
        security: [{ cookieSession: [] }],
        responses: { "201": { description: "Unit created.", ...json(ref("UnitResponse")) }, "403": { $ref: "#/components/responses/Forbidden" } },
      },
    },
    "/api/operations/board-sections": {
      get: {
        tags: ["Operations"],
        summary: "List property board sections",
        security: [{ cookieSession: [] }, { bearerApiToken: [] }],
        parameters: [{ name: "propertyId", in: "query", schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Board sections.",
            ...json(ref("BoardSectionsResponse")),
          },
        },
      },
    },
    "/api/operations/board-sections/{id}": {
      patch: {
        tags: ["Operations"],
        summary: "Rename or update board section metadata",
        security: [{ cookieSession: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("SectionPatchRequest") } },
        },
        responses: { "200": { description: "Board section updated.", ...json(ref("BoardSectionResponse")) }, "403": { $ref: "#/components/responses/Forbidden" } },
      },
    },
    "/api/operations/columns": {
      get: {
        tags: ["Operations"],
        summary: "List configurable built-in column display labels",
        security: [{ cookieSession: [] }],
        responses: { "200": { description: "Column metadata.", ...json(ref("BoardColumnsResponse")) } },
      },
    },
    "/api/operations/columns/{fieldKey}": {
      patch: {
        tags: ["Operations"],
        summary: "Update presentation label for a stable built-in field key",
        security: [{ cookieSession: [] }],
        parameters: [{ name: "fieldKey", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("ColumnLabelRequest") } },
        },
        responses: { "200": { description: "Column label updated.", ...json(ref("BoardColumnResponse")) }, "403": { $ref: "#/components/responses/Forbidden" } },
      },
    },
    "/api/operations/options": {
      get: {
        tags: ["Operations"],
        summary: "List built-in board option metadata",
        security: [{ cookieSession: [] }],
        parameters: [{ name: "fieldKey", in: "query", schema: { type: "string" } }],
        responses: { "200": { description: "Built-in option metadata.", ...json(ref("BoardOptionsResponse")) } },
      },
      post: {
        tags: ["Operations"],
        summary: "Create built-in board option",
        security: [{ cookieSession: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("BoardOptionCreateRequest") } },
        },
        responses: { "201": { description: "Board option created.", ...json(ref("BoardOptionResponse")) }, "403": { $ref: "#/components/responses/Forbidden" } },
      },
    },
    "/api/operations/options/{id}": {
      patch: {
        tags: ["Operations"],
        summary: "Update built-in board option",
        security: [{ cookieSession: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("BoardOptionPatchRequest") } },
        },
        responses: { "200": { description: "Board option updated.", ...json(ref("BoardOptionResponse")) } },
      },
      delete: {
        tags: ["Operations"],
        summary: "Delete unused built-in board option",
        security: [{ cookieSession: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Board option deleted.", ...json(ref("OkResponse")) }, "400": { $ref: "#/components/responses/BadRequest" } },
      },
    },
    "/api/operations/floor-plans": {
      get: {
        tags: ["Operations"],
        summary: "List managed property floor plans",
        security: [{ cookieSession: [] }],
        parameters: [{ name: "propertyId", in: "query", schema: { type: "string" } }],
        responses: { "200": { description: "Managed floor plans.", ...json(ref("FloorPlansResponse")) } },
      },
      post: {
        tags: ["Operations"],
        summary: "Create managed property floor plan",
        security: [{ cookieSession: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("FloorPlanCreateRequest") } },
        },
        responses: { "201": { description: "Floor plan created.", ...json(ref("FloorPlanResponse")) }, "403": { $ref: "#/components/responses/Forbidden" } },
      },
    },
    "/api/operations/floor-plans/{id}": {
      patch: {
        tags: ["Operations"],
        summary: "Update managed floor plan",
        security: [{ cookieSession: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("FloorPlanPatchRequest") } },
        },
        responses: { "200": { description: "Floor plan updated.", ...json(ref("FloorPlanResponse")) } },
      },
      delete: {
        tags: ["Operations"],
        summary: "Delete unused managed floor plan",
        security: [{ cookieSession: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Floor plan deleted.", ...json(ref("OkResponse")) }, "400": { $ref: "#/components/responses/BadRequest" } },
      },
    },
    "/api/operations/schedule-tracks": {
      get: {
        tags: ["Operations"],
        summary: "List configurable schedule tracks",
        security: [{ cookieSession: [] }],
        responses: { "200": { description: "Schedule tracks.", ...json(ref("ScheduleTracksResponse")) } },
      },
      post: {
        tags: ["Operations"],
        summary: "Create schedule track",
        security: [{ cookieSession: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("ScheduleTrackCreateRequest") } },
        },
        responses: { "201": { description: "Schedule track created.", ...json(ref("ScheduleTrackResponse")) }, "403": { $ref: "#/components/responses/Forbidden" } },
      },
    },
    "/api/operations/operating-calendars": {
      get: {
        tags: ["Operations"],
        summary: "List property operating-calendar rules",
        security: [{ cookieSession: [] }],
        responses: { "200": { description: "Operating calendars.", ...json(ref("OperatingCalendarsResponse")) } },
      },
    },
    "/api/operations/properties/{propertyId}/operating-calendar": {
      put: {
        tags: ["Operations"],
        summary: "Update property operating-calendar guardrails",
        security: [{ cookieSession: [] }],
        parameters: [{ name: "propertyId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("OperatingCalendarRequest") } },
        },
        responses: { "200": { description: "Operating calendar updated.", ...json(ref("OperatingCalendarResponse")) }, "403": { $ref: "#/components/responses/Forbidden" } },
      },
    },
    "/api/custom-fields": {
      get: {
        tags: ["Custom Fields"],
        summary: "List custom field definitions",
        security: [{ cookieSession: [] }],
        responses: {
          "200": {
            description: "Custom fields.",
            ...json(ref("CustomFieldsResponse")),
          },
        },
      },
      post: {
        tags: ["Custom Fields"],
        summary: "Create custom field definition",
        security: [{ cookieSession: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("CustomFieldCreateRequest") } },
        },
        responses: { "201": { description: "Custom field created.", ...json(ref("CustomFieldResponse")) }, "403": { $ref: "#/components/responses/Forbidden" } },
      },
    },
    "/api/custom-fields/{id}": {
      patch: {
        tags: ["Custom Fields"],
        summary: "Update custom field definition",
        security: [{ cookieSession: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("CustomFieldUpdateRequest") } },
        },
        responses: { "200": { description: "Custom field updated.", ...json(ref("CustomFieldResponse")) }, "403": { $ref: "#/components/responses/Forbidden" } },
      },
      delete: {
        tags: ["Custom Fields"],
        summary: "Archive custom field definition",
        security: [{ cookieSession: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Custom field archived.", ...json(ref("CustomFieldResponse")) }, "403": { $ref: "#/components/responses/Forbidden" } },
      },
    },
    "/api/custom-fields/reorder": {
      put: {
        tags: ["Custom Fields"],
        summary: "Reorder active custom fields",
        security: [{ cookieSession: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("CustomFieldReorderRequest") } },
        },
        responses: { "200": { description: "Custom field order saved.", ...json(ref("CustomFieldsResponse")) }, "403": { $ref: "#/components/responses/Forbidden" } },
      },
    },
    "/api/make-ready-items/{itemId}/custom-fields/{fieldId}": {
      put: {
        tags: ["Custom Fields"],
        summary: "Set custom field value for a make-ready item",
        security: [{ cookieSession: [] }],
        parameters: [
          { name: "itemId", in: "path", required: true, schema: { type: "string" } },
          { name: "fieldId", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("CustomFieldValueRequest") } },
        },
        responses: { "200": { description: "Custom field value saved.", ...json(ref("CustomFieldValueResponse")) }, "403": { $ref: "#/components/responses/Forbidden" } },
      },
    },
    "/api/saved-views": {
      get: {
        tags: ["Saved Views"],
        summary: "List saved views",
        security: [{ cookieSession: [] }],
        responses: {
          "200": {
            description: "Saved views visible to current user.",
            ...json(ref("SavedViewsResponse")),
          },
        },
      },
      post: {
        tags: ["Saved Views"],
        summary: "Create saved view",
        security: [{ cookieSession: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("SavedViewCreateRequest") } },
        },
        responses: { "201": { description: "Saved view created.", ...json(ref("SavedViewResponse")) } },
      },
    },
    "/api/saved-views/{id}": {
      patch: {
        tags: ["Saved Views"],
        summary: "Update saved view",
        security: [{ cookieSession: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("SavedViewUpdateRequest") } },
        },
        responses: { "200": { description: "Saved view updated.", ...json(ref("SavedViewResponse")) } },
      },
      delete: {
        tags: ["Saved Views"],
        summary: "Delete saved view",
        security: [{ cookieSession: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Saved view deleted.", ...json(ref("OkResponse")) } },
      },
    },
    "/api/make-ready-items": {
      get: {
        tags: ["Make Ready Items"],
        summary: "List make-ready items",
        security: [{ cookieSession: [] }, { bearerApiToken: [] }],
        parameters: [
          { name: "propertyId", in: "query", schema: { type: "string" } },
          { name: "boardSection", in: "query", schema: { type: "string" } },
          { name: "includeArchived", in: "query", schema: { type: "boolean" } },
          { name: "updatedSince", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 500 } },
          { name: "offset", in: "query", schema: { type: "integer", minimum: 0 } },
          { name: "sortBy", in: "query", schema: { type: "string" } },
          { name: "sortDirection", in: "query", schema: { type: "string", enum: ["asc", "desc"] } },
        ],
        responses: {
          "200": {
            description: "Array of make-ready items. Pagination metadata is returned in response headers.",
            ...json(ref("MakeReadyItemsResponse")),
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
      post: {
        tags: ["Make Ready Items"],
        summary: "Create a make-ready item",
        security: [{ cookieSession: [] }, { bearerApiToken: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("MakeReadyCreateRequest") } },
        },
        responses: {
          "201": { description: "Item created.", ...json(ref("MakeReadyItemResponse")) },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/api/make-ready-items/{id}": {
      patch: {
        tags: ["Make Ready Items"],
        summary: "Update a make-ready item",
        security: [{ cookieSession: [] }, { bearerApiToken: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("MakeReadyPatchRequest") } },
        },
        responses: {
          "200": { description: "Item updated.", ...json(ref("MakeReadyItemResponse")) },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/api/make-ready-items/batch": {
      post: {
        tags: ["Make Ready Items"],
        summary: "Batch update visible make-ready items",
        security: [{ cookieSession: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("MakeReadyBatchRequest") } },
        },
        responses: { "200": { description: "Batch update summary.", ...json(ref("MakeReadyBatchResponse")) }, "403": { $ref: "#/components/responses/Forbidden" } },
      },
    },
    "/api/make-ready-items/{id}/archive": {
      post: {
        tags: ["Make Ready Items"],
        summary: "Move item into archive section",
        security: [{ cookieSession: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Item archived.", ...json(ref("MakeReadyItemResponse")) }, "403": { $ref: "#/components/responses/Forbidden" } },
      },
    },
    "/api/make-ready-items/{id}/restore": {
      post: {
        tags: ["Make Ready Items"],
        summary: "Restore archived item",
        security: [{ cookieSession: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Item restored.", ...json(ref("MakeReadyItemResponse")) }, "403": { $ref: "#/components/responses/Forbidden" } },
      },
    },
    "/api/calendar": {
      get: {
        tags: ["Make Ready Items"],
        summary: "Calendar event stream derived from configured date fields",
        security: [{ cookieSession: [] }],
        parameters: [
          { name: "field", in: "query", schema: { type: "string" } },
          { name: "propertyId", in: "query", schema: { type: "string" } },
        ],
        responses: { "200": { description: "Calendar events.", ...json(ref("CalendarEventsResponse")) } },
      },
    },
    "/api/export/make-ready.csv": {
      get: {
        tags: ["Make Ready Items"],
        summary: "Export make-ready report CSV",
        security: [{ cookieSession: [] }],
        responses: {
          "200": {
            description: "CSV report for human reporting, not native backup transfer.",
            content: { "text/csv": { schema: { type: "string" } } },
          },
        },
      },
    },
    "/api/make-ready-items/{id}/comments": {
      get: {
        tags: ["Comments And Attachments"],
        summary: "List comments for an item",
        security: [{ cookieSession: [] }, { bearerApiToken: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
          { name: "offset", in: "query", schema: { type: "integer", minimum: 0 } },
        ],
        responses: { "200": { description: "Comments for the item.", ...json(ref("CommentsResponse")) } },
      },
      post: {
        tags: ["Comments And Attachments"],
        summary: "Create an item comment",
        security: [{ cookieSession: [] }, { bearerApiToken: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("ItemCommentRequest") } },
        },
        responses: { "201": { description: "Comment created.", ...json(ref("CommentResponse")) } },
      },
    },
    "/api/make-ready-items/{id}/attachments": {
      get: {
        tags: ["Comments And Attachments"],
        summary: "List item attachment metadata",
        security: [{ cookieSession: [] }, { bearerApiToken: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Attachment metadata.", ...json(ref("AttachmentsResponse")) } },
      },
      post: {
        tags: ["Comments And Attachments"],
        summary: "Upload an attachment",
        security: [{ cookieSession: [] }, { bearerApiToken: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "201": { description: "Attachment uploaded.", ...json(ref("AttachmentResponse")) } },
      },
    },
    "/api/make-ready-items/{id}/collaboration": {
      get: {
        tags: ["Comments And Attachments"],
        summary: "Item drawer collaboration bundle",
        security: [{ cookieSession: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Comments, attachments, and checklist state for an item.", ...json(ref("CollaborationResponse")) } },
      },
    },
    "/api/make-ready-items/{id}/charge-report": {
      get: {
        tags: ["Comments And Attachments"],
        summary: "Charge/evidence line-item report for an item",
        description: "Returns file-level and markup-pin charge candidates with price-sheet references, notes, and totals. This is evidence/estimate metadata, not accounting.",
        security: [{ cookieSession: [] }, { bearerApiToken: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Charge/evidence report.", ...json(ref("ChargeReportResponse")) } },
      },
    },
    "/api/make-ready-items/{id}/attachments/archive": {
      get: {
        tags: ["Comments And Attachments"],
        summary: "Download filtered item attachments as ZIP",
        security: [{ cookieSession: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "ZIP archive of selected attachment files.",
            content: { "application/zip": { schema: { type: "string", format: "binary" } } },
          },
        },
      },
    },
    "/api/attachments/{id}": {
      patch: {
        tags: ["Comments And Attachments"],
        summary: "Update attachment inspection metadata",
        security: [{ cookieSession: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("AttachmentPatchRequest") } },
        },
        responses: { "200": { description: "Attachment metadata updated.", ...json(ref("AttachmentResponse")) } },
      },
      delete: {
        tags: ["Comments And Attachments"],
        summary: "Remove attachment metadata and local file",
        security: [{ cookieSession: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Attachment removed.", ...json(ref("OkResponse")) } },
      },
    },
    "/api/attachments/{id}/download": {
      get: {
        tags: ["Comments And Attachments"],
        summary: "Download authenticated attachment file",
        security: [{ cookieSession: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Attachment file bytes.",
            content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } },
          },
        },
      },
    },
    "/api/charge-price-sheet-items": {
      get: {
        tags: ["Comments And Attachments"],
        summary: "List charge/evidence price-sheet items",
        security: [{ cookieSession: [] }],
        parameters: [{ name: "propertyId", in: "query", schema: { type: "string" } }],
        responses: { "200": { description: "Price-sheet items.", ...json(ref("ChargePriceSheetItemsResponse")) } },
      },
      post: {
        tags: ["Comments And Attachments"],
        summary: "Create charge/evidence price-sheet item",
        security: [{ cookieSession: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("ChargePriceSheetCreateRequest") } },
        },
        responses: { "201": { description: "Price-sheet item created.", ...json(ref("ChargePriceSheetItemResponse")) }, "403": { $ref: "#/components/responses/Forbidden" } },
      },
    },
    "/api/checklist-templates": {
      get: {
        tags: ["Comments And Attachments"],
        summary: "List checklist templates",
        security: [{ cookieSession: [] }],
        responses: { "200": { description: "Checklist templates.", ...json(ref("ChecklistTemplatesResponse")) } },
      },
      post: {
        tags: ["Comments And Attachments"],
        summary: "Create checklist template",
        security: [{ cookieSession: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("ChecklistTemplateCreateRequest") } },
        },
        responses: { "201": { description: "Checklist template created.", ...json(ref("ChecklistTemplateResponse")) }, "403": { $ref: "#/components/responses/Forbidden" } },
      },
    },
    "/api/my-work": {
      get: {
        tags: ["Comments And Attachments"],
        summary: "Current user's mobile-friendly work list",
        security: [{ cookieSession: [] }],
        responses: { "200": { description: "Assigned work and checklist summary.", ...json(ref("MyWorkResponse")) } },
      },
    },
    "/api/dashboard": {
      get: {
        tags: ["Dashboard"],
        summary: "Dashboard summary",
        security: [{ cookieSession: [] }, { bearerApiToken: [] }],
        responses: {
          "200": {
            description: "Scoped dashboard metrics and attention lists.",
            ...json(ref("DashboardSummaryResponse")),
          },
        },
      },
    },
    "/api/analytics/summary": {
      get: {
        tags: ["Analytics"],
        summary: "Historical analytics summary",
        security: [{ cookieSession: [] }],
        responses: { "200": { description: "Derived turn-history and snapshot metrics.", ...json(ref("AnalyticsSummaryResponse")) } },
      },
    },
    "/api/analytics/snapshots": {
      get: {
        tags: ["Analytics"],
        summary: "List property metric snapshots",
        security: [{ cookieSession: [] }],
        parameters: [
          { name: "propertyId", in: "query", schema: { type: "string" } },
          { name: "from", in: "query", schema: { type: "string", format: "date" } },
          { name: "to", in: "query", schema: { type: "string", format: "date" } },
        ],
        responses: { "200": { description: "Daily/periodic metric snapshots.", ...json(ref("AnalyticsSnapshotsResponse")) } },
      },
    },
    "/api/risk/summary": {
      get: {
        tags: ["Risk"],
        summary: "Risk summary",
        security: [{ cookieSession: [] }, { bearerApiToken: [] }],
        responses: { "200": { description: "Risk totals by level/category/property.", ...json(ref("RiskSummaryResponse")) } },
      },
    },
    "/api/risk/items": {
      get: {
        tags: ["Risk"],
        summary: "Risk-filtered item list",
        security: [{ cookieSession: [] }, { bearerApiToken: [] }],
        responses: {
          "200": {
            description: "Risk item details.",
            ...json(ref("RiskItemsResponse")),
          },
        },
      },
    },
    "/api/risk/policies": {
      get: {
        tags: ["Risk"],
        summary: "List property risk policies",
        security: [{ cookieSession: [] }],
        parameters: [{ name: "propertyId", in: "query", schema: { type: "string" } }],
        responses: { "200": { description: "Property risk thresholds with defaults.", ...json(ref("RiskPoliciesResponse")) } },
      },
    },
    "/api/risk/policies/{propertyId}": {
      put: {
        tags: ["Risk"],
        summary: "Update property risk policy",
        security: [{ cookieSession: [] }],
        parameters: [{ name: "propertyId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("RiskPolicyRequest") } },
        },
        responses: { "200": { description: "Updated property risk policy.", ...json(ref("RiskPolicyResponse")) }, "403": { description: "Manager or admin access required." } },
      },
    },
    "/api/planning/blocks": {
      get: {
        tags: ["Planning"],
        summary: "List planned in-house work blocks",
        security: [{ cookieSession: [] }],
        responses: {
          "200": {
            description: "Work assignment blocks.",
            ...json(ref("PlanningBlocksResponse")),
          },
        },
      },
      post: {
        tags: ["Planning"],
        summary: "Create planned in-house work block",
        security: [{ cookieSession: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("PlanningBlockCreateRequest") } },
        },
        responses: { "201": { description: "Work block created.", ...json(ref("PlanningBlockResponse")) }, "403": { $ref: "#/components/responses/Forbidden" } },
      },
    },
    "/api/planning": {
      get: {
        tags: ["Planning"],
        summary: "Workload planning summary",
        security: [{ cookieSession: [] }],
        parameters: [
          { name: "propertyId", in: "query", schema: { type: "string" } },
          { name: "assignedUserId", in: "query", schema: { type: "string" } },
          { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
        ],
        responses: { "200": { description: "Planning window, staff, capacities, and coverage summary.", ...json(ref("PlanningSummaryResponse")) } },
      },
    },
    "/api/planning/blocks/{id}": {
      patch: {
        tags: ["Planning"],
        summary: "Update planned in-house work block",
        security: [{ cookieSession: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("PlanningBlockPatchRequest") } },
        },
        responses: { "200": { description: "Work block updated.", ...json(ref("PlanningBlockResponse")) }, "403": { $ref: "#/components/responses/Forbidden" } },
      },
    },
    "/api/planning/capacities": {
      get: {
        tags: ["Planning"],
        summary: "List staff planning capacities",
        security: [{ cookieSession: [] }],
        responses: { "200": { description: "Staff capacity scaffolds.", ...json(ref("PlanningCapacitiesResponse")) } },
      },
    },
    "/api/planning/capacities/{userId}": {
      put: {
        tags: ["Planning"],
        summary: "Update staff capacity scaffold",
        security: [{ cookieSession: [] }],
        parameters: [{ name: "userId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("PlanningCapacityRequest") } },
        },
        responses: { "200": { description: "Capacity updated.", ...json(ref("PlanningCapacityResponse")) }, "403": { $ref: "#/components/responses/Forbidden" } },
      },
    },
    "/api/vendors": {
      get: {
        tags: ["Vendors"],
        summary: "List vendors",
        security: [{ cookieSession: [] }, { bearerApiToken: [] }],
        responses: {
          "200": {
            description: "Vendor directory.",
            ...json(ref("VendorsResponse")),
          },
        },
      },
      post: {
        tags: ["Vendors"],
        summary: "Create vendor",
        security: [{ cookieSession: [] }, { bearerApiToken: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("VendorCreateRequest") } },
        },
        responses: { "201": { description: "Vendor created.", ...json(ref("VendorResponse")) } },
      },
    },
    "/api/vendor-assignments": {
      get: {
        tags: ["Vendors"],
        summary: "List vendor assignments",
        security: [{ cookieSession: [] }, { bearerApiToken: [] }],
        responses: {
          "200": {
            description: "Vendor work assignments.",
            ...json(ref("VendorAssignmentsResponse")),
          },
        },
      },
      post: {
        tags: ["Vendors"],
        summary: "Create vendor assignment",
        security: [{ cookieSession: [] }, { bearerApiToken: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("VendorAssignmentCreateRequest") } },
        },
        responses: { "201": { description: "Vendor assignment created.", ...json(ref("VendorAssignmentResponse")) } },
      },
    },
    "/api/property-maps": {
      get: {
        tags: ["Property Maps"],
        summary: "List property maps",
        security: [{ cookieSession: [] }, { bearerApiToken: [] }],
        responses: {
          "200": {
            description: "Map metadata.",
            ...json(ref("PropertyMapsResponse")),
          },
        },
      },
      post: {
        tags: ["Property Maps"],
        summary: "Create property map metadata",
        security: [{ cookieSession: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("PropertyMapCreateRequest") } },
        },
        responses: { "201": { description: "Property map created.", ...json(ref("PropertyMapResponse")) }, "403": { $ref: "#/components/responses/Forbidden" } },
      },
    },
    "/api/property-maps/{id}": {
      patch: {
        tags: ["Property Maps"],
        summary: "Update property map metadata",
        security: [{ cookieSession: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("PropertyMapPatchRequest") } },
        },
        responses: { "200": { description: "Property map updated.", ...json(ref("PropertyMapResponse")) } },
      },
    },
    "/api/property-map-areas": {
      get: {
        tags: ["Property Maps"],
        summary: "List building/area/floor map markers",
        security: [{ cookieSession: [] }],
        parameters: [
          { name: "propertyId", in: "query", schema: { type: "string" } },
          { name: "mapId", in: "query", schema: { type: "string" } },
        ],
        responses: { "200": { description: "Property map areas.", ...json(ref("PropertyMapAreasResponse")) } },
      },
      post: {
        tags: ["Property Maps"],
        summary: "Create building/area/floor map marker",
        security: [{ cookieSession: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("PropertyMapAreaCreateRequest") } },
        },
        responses: { "201": { description: "Property map area created.", ...json(ref("PropertyMapAreaResponse")) }, "403": { $ref: "#/components/responses/Forbidden" } },
      },
    },
    "/api/property-map-areas/{id}": {
      patch: {
        tags: ["Property Maps"],
        summary: "Update property map area marker",
        security: [{ cookieSession: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("PropertyMapAreaPatchRequest") } },
        },
        responses: { "200": { description: "Property map area updated.", ...json(ref("PropertyMapAreaResponse")) } },
      },
      delete: {
        tags: ["Property Maps"],
        summary: "Remove property map area marker",
        security: [{ cookieSession: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Property map area removed.", ...json(ref("OkResponse")) } },
      },
    },
    "/api/unit-map-locations": {
      get: {
        tags: ["Property Maps"],
        summary: "List unit map marker locations",
        security: [{ cookieSession: [] }, { bearerApiToken: [] }],
        responses: {
          "200": {
            description: "Unit map locations.",
            ...json(ref("UnitMapLocationsResponse")),
          },
        },
      },
      put: {
        tags: ["Property Maps"],
        summary: "Create or update unit map marker location",
        security: [{ cookieSession: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("UnitMapLocationRequest") } },
        },
        responses: { "200": { description: "Unit map location saved.", ...json(ref("UnitMapLocationResponse")) }, "403": { $ref: "#/components/responses/Forbidden" } },
      },
    },
    "/api/activity": {
      get: {
        tags: ["Activity"],
        summary: "Activity log",
        security: [{ cookieSession: [] }, { bearerApiToken: [] }],
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 200 } },
          { name: "offset", in: "query", schema: { type: "integer", minimum: 0 } },
        ],
        responses: {
          "200": {
            description: "Activity entries with pagination metadata.",
            ...json(ref("ActivityResponse")),
          },
        },
      },
    },
    "/api/notifications": {
      get: {
        tags: ["Notifications"],
        summary: "List current user's in-app notifications",
        security: [{ cookieSession: [] }],
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
          { name: "offset", in: "query", schema: { type: "integer", minimum: 0 } },
          { name: "unreadOnly", in: "query", schema: { type: "boolean" } },
        ],
        responses: {
          "200": {
            description: "Notification entries with pagination metadata.",
            ...json(ref("NotificationsResponse")),
          },
        },
      },
    },
    "/api/notifications/read-all": {
      post: {
        tags: ["Notifications"],
        summary: "Mark all current-user notifications read",
        security: [{ cookieSession: [] }],
        responses: { "200": { description: "Notifications marked read.", ...json(ref("OkResponse")) } },
      },
    },
    "/api/notifications/{id}/read": {
      post: {
        tags: ["Notifications"],
        summary: "Mark one notification read",
        security: [{ cookieSession: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Notification marked read.", ...json(ref("OkResponse")) } },
      },
    },
    "/api/notifications/{id}": {
      delete: {
        tags: ["Notifications"],
        summary: "Dismiss one notification",
        security: [{ cookieSession: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Notification dismissed.", ...json(ref("OkResponse")) } },
      },
    },
    "/api/notifications/preferences/{category}": {
      patch: {
        tags: ["Notifications"],
        summary: "Update current-user notification preference",
        security: [{ cookieSession: [] }],
        parameters: [{ name: "category", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["enabled"], properties: { enabled: { type: "boolean" } } } } },
        },
        responses: { "200": { description: "Notification preference updated.", ...json(ref("NotificationPreferenceResponse")) } },
      },
    },
    "/api/property-templates": {
      get: {
        tags: ["Property Templates"],
        summary: "List reusable property/board templates",
        security: [{ cookieSession: [] }],
        responses: {
          "200": {
            description: "Reusable property templates.",
            ...json(ref("PropertyTemplatesResponse")),
          },
        },
      },
      post: {
        tags: ["Property Templates"],
        summary: "Create template from existing property configuration",
        security: [{ cookieSession: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("PropertyTemplateCreateFromPropertyRequest") } },
        },
        responses: { "201": { description: "Property template created.", ...json(ref("PropertyTemplateResponse")) }, "403": { $ref: "#/components/responses/Forbidden" } },
      },
    },
    "/api/property-templates/from-property/preview": {
      post: {
        tags: ["Property Templates"],
        summary: "Preview template creation from property configuration",
        security: [{ cookieSession: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("PropertyTemplateCreateFromPropertyRequest") } },
        },
        responses: { "200": { description: "Template preview summary.", ...json(ref("PropertyTemplateApplyResponse")) }, "403": { $ref: "#/components/responses/Forbidden" } },
      },
    },
    "/api/property-templates/{id}/apply": {
      post: {
        tags: ["Property Templates"],
        summary: "Dry-run or apply property template to a property",
        security: [{ cookieSession: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("PropertyTemplateApplyRequest") } },
        },
        responses: { "200": { description: "Apply or dry-run summary.", ...json(ref("PropertyTemplateApplyResponse")) }, "403": { $ref: "#/components/responses/Forbidden" } },
      },
    },
    "/api/automations": {
      get: {
        tags: ["Operational Library"],
        summary: "List automation rules",
        security: [{ cookieSession: [] }],
        responses: { "200": { description: "Automation rules.", ...json(ref("AutomationRulesResponse")) }, "403": { $ref: "#/components/responses/Forbidden" } },
      },
      post: {
        tags: ["Operational Library"],
        summary: "Create automation rule",
        security: [{ cookieSession: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("AutomationUpdateRequest") } },
        },
        responses: { "201": { description: "Automation rule created.", ...json(ref("AutomationRuleResponse")) }, "403": { $ref: "#/components/responses/Forbidden" } },
      },
    },
    "/api/automations/preview": {
      post: {
        tags: ["Operational Library"],
        summary: "Preview automation rule without mutating board data",
        security: [{ cookieSession: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("AutomationPreviewRequest") } },
        },
        responses: { "200": { description: "Preview result.", ...json(ref("AutomationPreviewResponse")) }, "403": { $ref: "#/components/responses/Forbidden" } },
      },
    },
    "/api/automations/{id}/run": {
      post: {
        tags: ["Operational Library"],
        summary: "Run one automation rule immediately",
        security: [{ cookieSession: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Automation execution result.", ...json(ref("AutomationExecutionResponse")) }, "403": { $ref: "#/components/responses/Forbidden" } },
      },
    },
    "/api/automations/runs": {
      get: {
        tags: ["Operational Library"],
        summary: "List automation run history",
        security: [{ cookieSession: [] }],
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
          { name: "offset", in: "query", schema: { type: "integer", minimum: 0 } },
        ],
        responses: { "200": { description: "Automation run history.", ...json(ref("AutomationRunsResponse")) }, "403": { $ref: "#/components/responses/Forbidden" } },
      },
    },
    "/api/operational-library/templates": {
      get: {
        tags: ["Operational Library"],
        summary: "List bundled operational rule templates",
        security: [{ cookieSession: [] }, { bearerApiToken: [] }],
        responses: { "200": { description: "Template library.", ...json(ref("AutomationTemplatesResponse")) } },
      },
    },
    "/api/operational-library/packs": {
      get: {
        tags: ["Operational Library"],
        summary: "List installed and bundled operational library packs",
        security: [{ cookieSession: [] }],
        responses: { "200": { description: "Operational library packs.", ...json(ref("OperationalLibraryResponse")) }, "403": { $ref: "#/components/responses/Forbidden" } },
      },
    },
    "/api/operational-library/preview": {
      post: {
        tags: ["Operational Library"],
        summary: "Preview operational library pack install",
        security: [{ cookieSession: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("OperationalLibraryPack") } },
        },
        responses: { "200": { description: "Pack preview summary.", ...json(ref("OperationalLibraryInstallResponse")) }, "403": { $ref: "#/components/responses/Forbidden" } },
      },
    },
    "/api/operational-library/install": {
      post: {
        tags: ["Operational Library"],
        summary: "Install selected operational library pack contents",
        security: [{ cookieSession: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("OperationalLibraryPackInstallRequest") } },
        },
        responses: { "200": { description: "Pack install summary.", ...json(ref("OperationalLibraryInstallResponse")) }, "403": { $ref: "#/components/responses/Forbidden" } },
      },
    },
    "/api/admin/export": {
      get: {
        tags: ["Backup And Transfer"],
        summary: "Export native MakeReadyOS operational backup",
        security: [{ cookieSession: [] }],
        responses: {
          "200": {
            description: "Versioned native backup JSON. Secrets, sessions, and password hashes are excluded.",
            ...json(ref("NativeBackup")),
          },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/api/admin/import": {
      post: {
        tags: ["Backup And Transfer"],
        summary: "Dry-run or merge native MakeReadyOS backup JSON",
        security: [{ cookieSession: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("BackupImportRequest") } },
        },
        responses: {
          "200": { description: "Import summary for dry-run or merge mode.", ...json(ref("BackupImportResponse")) },
          "400": { $ref: "#/components/responses/BadRequest" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/api/admin/integrations": {
      get: {
        tags: ["Integrations"],
        summary: "Admin integration metadata",
        security: [{ cookieSession: [] }],
        responses: { "200": { description: "API tokens, webhook registrations, scopes, and properties.", ...json(ref("AdminIntegrationsResponse")) } },
      },
    },
    "/api/admin/users": {
      get: {
        tags: ["Integrations"],
        summary: "Admin user list",
        security: [{ cookieSession: [] }],
        responses: { "200": { description: "Users and access metadata.", ...json(ref("AdminUsersResponse")) }, "403": { $ref: "#/components/responses/Forbidden" } },
      },
      post: {
        tags: ["Integrations"],
        summary: "Create user account",
        security: [{ cookieSession: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("AdminCreateUserRequest") } },
        },
        responses: { "201": { description: "User created.", ...json(ref("AuthUser")) }, "403": { $ref: "#/components/responses/Forbidden" } },
      },
    },
    "/api/admin/properties": {
      get: {
        tags: ["Integrations"],
        summary: "List properties assignable by admin",
        security: [{ cookieSession: [] }],
        responses: { "200": { description: "Assignable properties.", ...json(ref("AdminPropertiesResponse")) }, "403": { $ref: "#/components/responses/Forbidden" } },
      },
    },
    "/api/admin/storage": {
      get: {
        tags: ["Integrations"],
        summary: "Admin storage configuration status",
        security: [{ cookieSession: [] }],
        responses: { "200": { description: "Upload storage path/routing status.", ...json(ref("AdminStorageResponse")) }, "403": { $ref: "#/components/responses/Forbidden" } },
      },
    },
    "/api/admin/storage/property-routing": {
      patch: {
        tags: ["Integrations"],
        summary: "Update per-property upload routing",
        security: [{ cookieSession: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("AdminPropertyStorageRoutingRequest") } },
        },
        responses: { "200": { description: "Property upload route updated.", ...json(ref("AdminStorageResponse")) }, "403": { $ref: "#/components/responses/Forbidden" } },
      },
    },
    "/api/admin/storage/validate": {
      post: {
        tags: ["Integrations"],
        summary: "Validate candidate upload storage path",
        security: [{ cookieSession: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("AdminStoragePathRequest") } },
        },
        responses: { "200": { description: "Storage path validation result.", ...json(ref("AdminStorageResponse")) }, "403": { $ref: "#/components/responses/Forbidden" } },
      },
    },
    "/api/admin/integrations/api-tokens": {
      post: {
        tags: ["Integrations"],
        summary: "Create scoped API token",
        security: [{ cookieSession: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("ApiTokenCreateRequest") } },
        },
        responses: { "201": { description: "Token created. Raw token is shown once.", ...json(ref("ApiTokenResponse")) } },
      },
    },
    "/api/admin/integrations/api-tokens/{id}/revoke": {
      post: {
        tags: ["Integrations"],
        summary: "Revoke API token",
        security: [{ cookieSession: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Token revoked.", ...json(ref("ApiTokenResponse")) } },
      },
    },
    "/api/admin/integrations/webhooks": {
      post: {
        tags: ["Integrations"],
        summary: "Register webhook endpoint metadata",
        description: "Registers endpoint metadata. Queued deliveries are processed by the explicit run-webhooks.sh runner.",
        security: [{ cookieSession: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("WebhookCreateRequest") } },
        },
        responses: { "201": { description: "Webhook registered. Secret is shown once.", ...json(ref("WebhookResponse")) } },
      },
    },
    "/api/admin/integrations/webhooks/{id}/test-payload": {
      post: {
        tags: ["Integrations"],
        summary: "Create a signed webhook test payload",
        description: "Creates a signed dry-run delivery-attempt record by default. Passing enqueue=true queues the payload for the explicit run-webhooks.sh runner.",
        security: [{ cookieSession: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          content: {
            "application/json": {
              schema: ref("WebhookTestPayloadRequest"),
            },
          },
        },
        responses: {
          "201": {
            description: "Signed dry-run payload created.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    delivery: { $ref: "#/components/schemas/WebhookDeliveryAttempt" },
                    notice: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/admin/integrations/webhooks/{id}/deliveries": {
      get: {
        tags: ["Integrations"],
        summary: "List webhook delivery attempts",
        security: [{ cookieSession: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
          { name: "offset", in: "query", schema: { type: "integer", minimum: 0 } },
        ],
        responses: {
          "200": { description: "Webhook delivery-attempt history.", ...json(ref("WebhookDeliveriesResponse")) },
        },
      },
    },
    "/api/admin/integrations/webhooks/{id}/health": {
      get: {
        tags: ["Integrations"],
        summary: "Inspect webhook delivery health",
        description: "Returns status counts, event counts, pending work, and the latest failure for a webhook endpoint.",
        security: [{ cookieSession: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Webhook health summary.", ...json(ref("WebhookHealthResponse")) },
        },
      },
    },
  },
} as const;
