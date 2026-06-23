import { useEffect, useMemo, useState } from "react";
import type { AutomationAction, AutomationActionSummary, AutomationCondition, AutomationPreviewResponse, AutomationRule, AutomationRun, AutomationTemplate, AutomationTriggerType, CustomField, OperationalLibraryPack, OperationalLibraryPreviewResponse, Property, PropertyTemplate, PropertyTemplateInclude, UserRole } from "../lib/api";
import { formatDateDisplay, formatDateTime } from "../lib/dateTime";
import { ConfirmDialog } from "./ConfirmDialog";
import { StatusState } from "./StatusState";

const triggers: AutomationTriggerType[] = [
  "ITEM_CREATED",
  "ITEM_UPDATED",
  "DATE_FIELD_CHANGED",
  "STATUS_FIELD_CHANGED",
  "SCHEDULED_CHECK",
];
const conditionFields = ["moveInDate", "makeReadyDate", "vacatedDate", "vacancyStatus", "completionStatus", "scopeLevel", "pestStatus", "floorsStatus", "makeReadyStatus", "cleaningStatus", "overdue", "moveInSoon"];
const builtInOperators: AutomationCondition["operator"][] = ["equals", "notEquals", "in", "isEmpty", "notEmpty", "dateBefore", "dateAfter", "dateBeforeToday", "dateAfterToday", "dateWithinNextDays", "dateMissing", "dateOnWeekend", "dateOnMondayOrFriday"];
const noValueOperators: AutomationCondition["operator"][] = ["isEmpty", "notEmpty", "dateBeforeToday", "dateAfterToday", "dateMissing", "dateOnWeekend", "dateOnMondayOrFriday"];
const settableFields = ["vacancyStatus", "completionStatus", "scopeLevel", "pestTreated", "makeReadyStatus", "cleaningStatus", "paintStatus", "doorsStatus", "notes"];
const dateActionFields = ["moveOutDate", "vacatedDate", "makeReadyDate", "flooringDate", "moveInDate"];
const assignableRoles = ["ADMIN", "MANAGER", "TECH", "CLEANER"] as const;

type DraftCondition = { field: string; operator: AutomationCondition["operator"]; value: string };
type DraftAction = {
  type: AutomationAction["type"];
  field: string;
  fieldId: string;
  value: string;
  sourceField: string;
  targetField: string;
  offsetDays: string;
  eligibleRoles: string[];
  eligibleUserIds: string;
  excludedUserIds: string;
  lookAheadDays: string;
  dailyAssignmentCap: string;
  onlyWhenUnassigned: boolean;
  includePlannedWork: boolean;
};
type Draft = {
  name: string;
  description: string;
  propertyId: string;
  triggerType: AutomationTriggerType;
  enabled: boolean;
  conditions: DraftCondition[];
  actions: DraftAction[];
};

type Props = {
  role: UserRole;
  language?: string;
  properties: Property[];
  customFields: CustomField[];
  rules: AutomationRule[];
  templates: AutomationTemplate[];
  libraryPacks: OperationalLibraryPack[];
  propertyTemplates: PropertyTemplate[];
  libraryPreview: OperationalLibraryPreviewResponse | null;
  templatePreview: string;
  runs: AutomationRun[];
  preview: AutomationPreviewResponse | null;
  loading: boolean;
  previewLoading: boolean;
  message: string;
  error: string;
  onCreate: (input: ReturnType<typeof draftPayload>) => Promise<void>;
  onInstallTemplate: (templateId: string, propertyId: string | null, enabled: boolean) => Promise<void>;
  onPreviewLibraryPack: (input: { packKey?: string; pack?: unknown }) => Promise<void>;
  onInstallLibraryPack: (input: { packKey?: string; pack?: unknown }) => Promise<void>;
  onPreviewPropertyTemplate: (input: { propertyId: string; name: string; description?: string | null; category?: string | null; version?: number; notes?: string | null; include: PropertyTemplateInclude }) => Promise<void>;
  onCreatePropertyTemplate: (input: { propertyId: string; name: string; description?: string | null; category?: string | null; version?: number; notes?: string | null; include: PropertyTemplateInclude }) => Promise<void>;
  onApplyPropertyTemplate: (id: string, input: { dryRun: boolean; targetPropertyId?: string | null; newProperty?: { name: string; code: string } | null; enableAutomations?: boolean }) => Promise<void>;
  onArchivePropertyTemplate: (id: string) => Promise<void>;
  onRestorePropertyTemplate: (id: string) => Promise<void>;
  onDeletePropertyTemplate: (id: string) => Promise<void>;
  onUpdate: (id: string, input: ReturnType<typeof draftPayload>) => Promise<void>;
  onToggle: (id: string, enabled: boolean) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
  onRestore: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onPreviewStored: (id: string) => Promise<void>;
  onPreviewDraft: (input: ReturnType<typeof draftPayload>) => Promise<void>;
  onRunNow: (id: string) => Promise<void>;
  onSelectRule: (id?: string) => void;
};

function emptyDraft(role: UserRole, properties: Property[]): Draft {
  return {
    name: "",
    description: "",
    propertyId: role === "MANAGER" ? properties[0]?.id ?? "" : "",
    triggerType: "ITEM_UPDATED",
    enabled: true,
    conditions: [{ field: "completionStatus", operator: "notEquals", value: "DONE" }],
    actions: [{
      type: "addAuditNote",
      field: "vacancyStatus",
      fieldId: "",
      value: "Automation attention required.",
      sourceField: "makeReadyDate",
      targetField: "flooringDate",
      offsetDays: "1",
      eligibleRoles: ["TECH"],
      eligibleUserIds: "",
      excludedUserIds: "",
      lookAheadDays: "7",
      dailyAssignmentCap: "",
      onlyWhenUnassigned: true,
      includePlannedWork: true,
    }],
  };
}

function toDraft(rule: AutomationRule): Draft {
  const conditions = rule.conditions.all?.map((condition) => ({
    field: condition.customFieldId ? `custom:${condition.customFieldId}` : condition.field ?? "completionStatus",
    operator: condition.operator,
    value: Array.isArray(condition.value) ? condition.value.join(", ") : String(condition.value ?? ""),
  })) ?? [];
  const actions = rule.actions.map((action) => ({
    type: action.type,
    field: "field" in action ? action.field : "vacancyStatus",
    fieldId: "fieldId" in action ? action.fieldId : "",
    value: "value" in action ? (Array.isArray(action.value) ? action.value.join(", ") : String(action.value ?? "")) : "",
    sourceField: "sourceField" in action ? action.sourceField : "makeReadyDate",
    targetField: "targetField" in action ? action.targetField : "flooringDate",
    offsetDays: "offsetDays" in action ? String(action.offsetDays) : "1",
    eligibleRoles: action.type === "assignLeastLoadedStaff" ? action.eligibleRoles : ["TECH"],
    eligibleUserIds: action.type === "assignLeastLoadedStaff" ? action.eligibleUserIds?.join(", ") ?? "" : "",
    excludedUserIds: action.type === "assignLeastLoadedStaff" ? action.excludedUserIds?.join(", ") ?? "" : "",
    lookAheadDays: action.type === "assignLeastLoadedStaff" ? String(action.lookAheadDays) : "7",
    dailyAssignmentCap: action.type === "assignLeastLoadedStaff" && action.dailyAssignmentCap ? String(action.dailyAssignmentCap) : "",
    onlyWhenUnassigned: action.type === "assignLeastLoadedStaff" ? action.onlyWhenUnassigned ?? true : true,
    includePlannedWork: action.type === "assignLeastLoadedStaff" ? action.includePlannedWork ?? true : true,
  }));
  return {
    name: rule.name,
    description: rule.description ?? "",
    propertyId: rule.propertyId ?? "",
    triggerType: rule.triggerType,
    enabled: rule.enabled,
    conditions,
    actions,
  };
}

function customFieldForTarget(target: string, customFields: CustomField[]) {
  return target.startsWith("custom:") ? customFields.find((field) => field.id === target.slice("custom:".length)) : undefined;
}

function operatorsForTarget(target: string, customFields: CustomField[]): AutomationCondition["operator"][] {
  const field = customFieldForTarget(target, customFields);
  if (!field) return builtInOperators;
  switch (field.fieldType) {
    case "DATE":
      return ["dateBeforeToday", "dateAfterToday", "dateWithinNextDays", "dateOnWeekend", "dateOnMondayOrFriday", "equals", "notEquals", "isEmpty", "notEmpty", "dateMissing"];
    case "MULTI_SELECT":
      return ["contains", "isEmpty", "notEmpty"];
    default:
      return ["equals", "notEquals", "isEmpty", "notEmpty"];
  }
}

function defaultConditionValue(target: string, customFields: CustomField[]) {
  const field = customFieldForTarget(target, customFields);
  if (field?.fieldType === "BOOLEAN") return "true";
  if (field?.fieldType === "SINGLE_SELECT" || field?.fieldType === "MULTI_SELECT") return field.options[0]?.label ?? "";
  return "";
}

function draftPayload(draft: Draft, customFields: CustomField[]) {
  const conditions: AutomationCondition[] = draft.conditions.map((condition) => {
    const customField = customFieldForTarget(condition.field, customFields);
    const value = noValueOperators.includes(condition.operator)
      ? undefined
      : condition.operator === "in"
        ? condition.value.split(",").map((entry) => entry.trim()).filter(Boolean)
        : condition.operator === "dateWithinNextDays"
          ? Number(condition.value)
          : customField?.fieldType === "NUMBER"
            ? Number(condition.value)
          : customField?.fieldType === "BOOLEAN"
            ? condition.value === "true"
            : condition.value;
    return {
      ...(customField ? { customFieldId: customField.id } : { field: condition.field }),
      operator: condition.operator,
      ...(value === undefined ? {} : { value }),
    };
  });
  const actions: AutomationAction[] = draft.actions.map((action) => {
    if (action.type === "setField") return { type: "setField", field: action.field, value: action.value || null };
    if (action.type === "setCustomField") return { type: "setCustomField", fieldId: action.fieldId, value: action.value || null };
    if (action.type === "setDateFromField") return { type: "setDateFromField", sourceField: action.sourceField, targetField: action.targetField, offsetDays: Number(action.offsetDays || 0), respectOperatingCalendar: true };
    if (action.type === "assignLeastLoadedStaff") {
      return {
        type: "assignLeastLoadedStaff",
        eligibleRoles: action.eligibleRoles.filter(Boolean) as Array<"ADMIN" | "MANAGER" | "TECH" | "CLEANER">,
        eligibleUserIds: action.eligibleUserIds.split(",").map((entry) => entry.trim()).filter(Boolean),
        excludedUserIds: action.excludedUserIds.split(",").map((entry) => entry.trim()).filter(Boolean),
        lookAheadDays: Number(action.lookAheadDays || 0),
        includePlannedWork: action.includePlannedWork,
        onlyWhenUnassigned: action.onlyWhenUnassigned,
        dailyAssignmentCap: action.dailyAssignmentCap.trim() ? Number(action.dailyAssignmentCap) : null,
        targetDateField: action.sourceField as "makeReadyDate" | "moveInDate" | "vacatedDate",
      };
    }
    if (action.type === "setPriority") return { type: "setPriority", value: Number(action.value || 0) };
    return { type: action.type, value: action.value };
  });
  return {
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    propertyId: draft.propertyId || null,
    triggerType: draft.triggerType,
    enabled: draft.enabled,
    conditions: { all: conditions },
    actions,
  };
}

function isActionIncomplete(action: DraftAction) {
  if (action.type === "setCustomField") return !action.fieldId || !action.value.trim();
  if (action.type === "setDateFromField") {
    const offset = Number(action.offsetDays);
    return !action.sourceField || !action.targetField || action.sourceField === action.targetField || !Number.isInteger(offset) || offset < -60 || offset > 60;
  }
  if (action.type === "assignLeastLoadedStaff") {
    const lookAhead = Number(action.lookAheadDays);
    const cap = action.dailyAssignmentCap.trim() ? Number(action.dailyAssignmentCap) : null;
    return action.eligibleRoles.length === 0
      || !["makeReadyDate", "moveInDate", "vacatedDate"].includes(action.sourceField)
      || !Number.isInteger(lookAhead)
      || lookAhead < 0
      || lookAhead > 30
      || (cap !== null && (!Number.isInteger(cap) || cap < 1 || cap > 50));
  }
  return !action.value.trim();
}

function humanize(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
}

function isOperationalLibraryPack(value: unknown): value is OperationalLibraryPack {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return candidate.format === "makereadyos.libraryPack"
    && candidate.version === 1
    && typeof candidate.packKey === "string"
    && typeof candidate.name === "string";
}

function packItemGroups(pack: OperationalLibraryPack) {
  return Object.entries(pack.items ?? {}).filter(([, value]) => Array.isArray(value) && value.length > 0);
}

function describePackEntry(section: string, item: unknown) {
  const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
  const primary = typeof record.name === "string"
    ? record.name
    : typeof record.label === "string"
      ? record.label
      : typeof record.displayName === "string"
        ? record.displayName
        : typeof record.key === "string"
          ? record.key
          : typeof record.fieldKey === "string"
            ? record.fieldKey
            : "Item";
  const target = typeof record.fieldKey === "string"
    ? record.fieldKey
    : typeof record.sourceField === "string"
      ? record.sourceField
      : typeof record.key === "string"
        ? record.key
        : null;
  const optionSample = Array.isArray(record.options)
    ? record.options
      .map((entry) => {
        const option = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
        return typeof option.label === "string"
          ? option.label
          : typeof option.value === "string"
            ? option.value
            : null;
      })
      .filter((entry): entry is string => Boolean(entry))
      .slice(0, 3)
    : [];
  const detail = section === "optionSets" && Array.isArray(record.options)
    ? `${record.options.length} options${optionSample.length ? ` · ${optionSample.join(", ")}` : ""}`
    : section === "customFields" && Array.isArray(record.options)
      ? `${record.options.length} choices${optionSample.length ? ` · ${optionSample.join(", ")}` : ""}`
      : typeof record.description === "string" && record.description
        ? record.description
        : null;
  return { primary, target, detail };
}

const installedPackSectionByType: Record<string, string> = {
  CUSTOM_FIELD: "customFields",
  OPTION: "optionSets",
  CHECKLIST_TEMPLATE: "checklistTemplates",
  SCHEDULE_TRACK: "scheduleTracks",
  SAVED_VIEW: "savedViews",
  AUTOMATION_RULE: "automationRules",
  PROPERTY_TEMPLATE: "propertyTemplates",
};

function describeInstalledPackItem(pack: OperationalLibraryPack, item: NonNullable<OperationalLibraryPack["installedItems"]>[number]) {
  const section = installedPackSectionByType[item.itemType];
  const entries = section ? pack.items?.[section] : undefined;
  if (item.itemType === "OPTION" && Array.isArray(entries)) {
    const [optionSetKey, optionValue] = item.itemKey.split(":");
    const optionSet = entries.find((entry) => {
      const record = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
      return typeof record.key === "string" && record.key === optionSetKey;
    });
    const optionSetRecord = optionSet && typeof optionSet === "object" ? optionSet as Record<string, unknown> : null;
    const option = Array.isArray(optionSetRecord?.options)
      ? optionSetRecord.options.find((candidate) => {
          const record = candidate && typeof candidate === "object" ? candidate as Record<string, unknown> : {};
          return typeof record.value === "string" && record.value === optionValue;
        })
      : null;
    const optionRecord = option && typeof option === "object" ? option as Record<string, unknown> : null;
    return {
      primary: typeof optionRecord?.label === "string" ? optionRecord.label : optionValue,
      secondary: typeof optionSetRecord?.name === "string"
        ? optionSetRecord.name
        : typeof optionSetRecord?.key === "string"
          ? optionSetRecord.key
          : humanize(item.itemType),
      key: item.itemKey,
    };
  }
  if (Array.isArray(entries)) {
    const match = entries.find((entry) => {
      const record = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
      return (typeof record.key === "string" && record.key === item.itemKey)
        || (typeof record.fieldKey === "string" && record.fieldKey === item.itemKey);
    });
    if (match) {
      const described = describePackEntry(section, match);
      return {
        primary: described.primary,
        secondary: described.detail ?? humanize(item.itemType),
        key: item.itemKey,
      };
    }
  }
  return {
    primary: humanize(item.itemKey),
    secondary: humanize(item.itemType),
    key: item.itemKey,
  };
}

function summarizeLibraryPreviewTotals(summary: OperationalLibraryPreviewResponse["summary"]) {
  return Object.values(summary).reduce((totals, bucket) => ({
    created: totals.created + bucket.created,
    skipped: totals.skipped + bucket.skipped,
    conflicts: totals.conflicts + bucket.conflicts,
    errors: totals.errors + bucket.errors.length,
  }), { created: 0, skipped: 0, conflicts: 0, errors: 0 });
}

function libraryPreviewDecision(preview: OperationalLibraryPreviewResponse | null) {
  if (!preview) return null;
  const totals = summarizeLibraryPreviewTotals(preview.summary);
  if (totals.conflicts > 0 || totals.errors > 0) {
    return {
      tone: "warning" as const,
      title: "Review conflicts before install",
      titleEs: "Revise los conflictos antes de instalar",
      description: "Some pack sections need attention before this install is considered clean.",
      descriptionEs: "Algunas secciones del pack necesitan revision antes de considerar limpia esta instalacion.",
    };
  }
  if (totals.skipped > 0) {
    return {
      tone: "info" as const,
      title: "Safe to install with duplicate skips",
      titleEs: "Seguro de instalar con omisiones por duplicado",
      description: "Existing matching records will be skipped instead of overwritten.",
      descriptionEs: "Los registros existentes coincidentes se omitiran en lugar de sobrescribirse.",
    };
  }
  return {
    tone: "success" as const,
    title: "Ready to install cleanly",
    titleEs: "Listo para instalar sin conflictos",
    description: "This preview found only net-new pack items.",
    descriptionEs: "Esta vista previa solo encontro elementos nuevos del pack.",
  };
}

function libraryPreviewAppliesToPack(preview: OperationalLibraryPreviewResponse | null, pack: OperationalLibraryPack | null) {
  if (!preview || !pack) return false;
  return preview.pack.packKey === pack.packKey && preview.pack.version === pack.version;
}

function libraryPreviewBucketTone(summary: { created: number; skipped: number; conflicts: number; errors: string[] }) {
  if (summary.conflicts > 0 || summary.errors.length > 0) return "warning";
  if (summary.skipped > 0) return "inactive";
  if (summary.created > 0) return "active";
  return "inactive";
}

function libraryPreviewBucketLabel(summary: { created: number; skipped: number; conflicts: number; errors: string[] }, isSpanish: boolean) {
  if (summary.conflicts > 0 || summary.errors.length > 0) return isSpanish ? "Revisar" : "Review";
  if (summary.skipped > 0) return isSpanish ? "Duplicados omitidos" : "Duplicate skips";
  if (summary.created > 0) return isSpanish ? "Listo" : "Ready";
  return isSpanish ? "Sin cambios" : "No changes";
}

function libraryPreviewGuidance(preview: OperationalLibraryPreviewResponse | null, isSpanish: boolean) {
  if (!preview) return [];
  const guidance: string[] = [];
  const automation = preview.summary.automationTemplates;
  const propertyTemplates = preview.summary.propertyTemplates;
  const customFields = preview.summary.customFields;
  const optionSets = preview.summary.optionSets;
  if (automation?.conflicts || automation?.errors.length) {
    guidance.push(isSpanish
      ? "Revise las reglas de automatizacion con conflictos. Normalmente significa referencias de campos/opciones que no existen todavia o un alcance de propiedad no valido para el usuario actual."
      : "Review automation-rule conflicts first. These usually mean missing field/option references or an invalid property scope for the current user.");
  }
  if (propertyTemplates?.conflicts || propertyTemplates?.errors.length) {
    guidance.push(isSpanish
      ? "Revise las plantillas de propiedad con conflicto. Normalmente significa que el manifiesto no usa el formato/version compatible esperado."
      : "Review conflicting property templates. These usually mean the manifest format/version is not compatible.");
  }
  if ((customFields?.skipped ?? 0) > 0 || (optionSets?.skipped ?? 0) > 0) {
    guidance.push(isSpanish
      ? "Las omisiones por duplicado son seguras: MakeReadyOS conservara los campos u opciones existentes y solo agregara lo que falte."
      : "Duplicate skips are safe: MakeReadyOS will keep existing fields/options and only add what is missing.");
  }
  if (!guidance.length && Object.values(preview.summary).some((bucket) => bucket.created > 0)) {
    guidance.push(isSpanish
      ? "La vista previa se ve limpia. La instalacion deberia agregar solo elementos nuevos del pack."
      : "This preview looks clean. Install should add only net-new pack items.");
  }
  return guidance;
}

function remediateLibraryError(error: string, isSpanish: boolean) {
  const normalized = error.toLowerCase();
  if (normalized.includes("manager has no accessible property scope")) {
    return isSpanish
      ? "Abra o importe este pack con una propiedad accesible seleccionada, o use una cuenta ADMIN si la regla debe permanecer global."
      : "Open or import this pack with an accessible property in scope, or use an ADMIN account if the rule must stay global.";
  }
  if (normalized.includes("selected property was not found")) {
    return isSpanish
      ? "Actualice la regla o plantilla para apuntar a una propiedad valida en esta instancia antes de instalar."
      : "Update the rule or template to target a valid property in this instance before installing.";
  }
  if (normalized.includes("one or more selected custom fields are unavailable")) {
    return isSpanish
      ? "Instale o cree primero los campos personalizados requeridos, o edite la automatizacion del pack para usar campos existentes."
      : "Install or create the required custom fields first, or edit the pack automation to use fields that already exist.";
  }
  if (normalized.includes("unsupported property template manifest")) {
    return isSpanish
      ? "Reexporte la plantilla con el formato actual `makereadyos.propertyTemplate` version 1 antes de volver a importarla."
      : "Re-export the template using the current `makereadyos.propertyTemplate` version 1 format before importing again.";
  }
  return isSpanish
    ? "Revise la referencia nombrada en este error y confirme que el campo, opcion, alcance de propiedad o manifiesto exista en esta instancia."
    : "Review the named reference in this error and confirm the field, option, property scope, or manifest exists in this instance.";
}

function classifyLibraryError(error: string) {
  const normalized = error.toLowerCase();
  if (normalized.includes("manager has no accessible property scope")) return "scope";
  if (normalized.includes("selected property was not found")) return "property";
  if (normalized.includes("one or more selected custom fields are unavailable")) return "customFields";
  if (normalized.includes("unsupported property template manifest")) return "manifest";
  return "generic";
}

function libraryRemediationPlan(preview: OperationalLibraryPreviewResponse | null, isSpanish: boolean) {
  if (!preview) return [];
  const entries = Object.entries(preview.summary)
    .filter(([, summary]) => summary.conflicts > 0 || summary.errors.length > 0)
    .map(([bucket, summary]) => ({ bucket, summary }));
  if (!entries.length) return [];

  return entries.map(({ bucket, summary }) => {
    const counts = new Map<string, number>();
    for (const entry of summary.errors) {
      const key = classifyLibraryError(entry);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const steps: string[] = [];
    if ((counts.get("customFields") ?? 0) > 0) {
      steps.push(isSpanish
        ? "Cree o instale primero los campos personalizados faltantes."
        : "Create or install the missing custom fields first.");
    }
    if ((counts.get("scope") ?? 0) > 0) {
      steps.push(isSpanish
        ? "Vuelva a previsualizar el pack con una propiedad accesible en alcance, o use una cuenta ADMIN si debe quedar global."
        : "Preview the pack again with an accessible property in scope, or use an ADMIN account if it must stay global.");
    }
    if ((counts.get("property") ?? 0) > 0) {
      steps.push(isSpanish
        ? "Actualice la referencia de propiedad del manifiesto para que apunte a una propiedad existente en esta instancia."
        : "Update the manifest property reference so it points at an existing property in this instance.");
    }
    if ((counts.get("manifest") ?? 0) > 0) {
      steps.push(isSpanish
        ? "Reexporte la plantilla con el formato/version compatible actual antes de volver a importarla."
        : "Re-export the template with the current supported format/version before importing again.");
    }
    if (!steps.length && summary.conflicts > 0) {
      steps.push(isSpanish
        ? "Revise las claves estables mostradas en el mapeo. Los conflictos suelen significar referencias cruzadas ya ocupadas o nombres reutilizados con otra estructura."
        : "Review the stable keys shown in the mapping. Conflicts usually mean cross-record references already claimed or reused names with a different structure.");
    }
    if (!steps.length) {
      steps.push(isSpanish
        ? "Revise los errores detallados de esta sección y confirme que todas las referencias nombradas existan en esta instancia."
        : "Review this section's detailed errors and confirm that every named reference exists in this instance.");
    }

    const issueCount = summary.conflicts + summary.errors.length;
    return {
      bucket,
      title: isSpanish
        ? `${humanize(bucket)}: ${issueCount} bloqueo${issueCount === 1 ? "" : "s"}`
        : `${humanize(bucket)}: ${issueCount} blocking issue${issueCount === 1 ? "" : "s"}`,
      steps,
    };
  });
}

function triggerLabel(value: AutomationTriggerType, isSpanish: boolean) {
  switch (value) {
    case "ITEM_CREATED":
      return isSpanish ? "Item de make-ready creado" : "Make-ready item created";
    case "ITEM_UPDATED":
      return isSpanish ? "Item de make-ready actualizado" : "Make-ready item updated";
    case "DATE_FIELD_CHANGED":
      return isSpanish ? "Campo de fecha cambiado" : "Date field changed";
    case "STATUS_FIELD_CHANGED":
      return isSpanish ? "Campo de estado cambiado" : "Status field changed";
    case "SCHEDULED_CHECK":
      return isSpanish ? "Revision programada" : "Scheduled check";
    default:
      return humanize(value);
  }
}

function templateHasLeastLoadedAssignment(template: AutomationTemplate) {
  return Boolean(template.draft?.actions.some((action) => action.type === "assignLeastLoadedStaff"));
}

function draftHasLeastLoadedAssignment(draft: Draft) {
  return draft.actions.some((action) => action.type === "assignLeastLoadedStaff");
}

function ruleHasLeastLoadedAssignment(rule: AutomationRule | null) {
  return Boolean(rule?.actions.some((action) => action.type === "assignLeastLoadedStaff"));
}

function runHasAssignmentDiagnostics(run: AutomationRun) {
  if (run.context?.actionSummaries?.some((action) => action.diagnostics?.assignment)) {
    return true;
  }
  return Boolean(run.context?.matchedItems?.some((item) => item.actionSummaries.some((action) => action.diagnostics?.assignment)));
}

function assignmentValidationDecision(preview: AutomationPreviewResponse["assignmentSummary"], runs: AutomationRun[]) {
  const relevantRuns = runs.filter(runHasAssignmentDiagnostics);
  const successfulRuns = relevantRuns.filter((run) => run.success);
  const warningRuns = relevantRuns.filter((run) => (run.warnings?.length ?? 0) > 0 || (run.errors?.length ?? 0) > 0);
  const matchedRuns = relevantRuns.filter((run) => (run.matchedCount ?? 0) > 0);
  const actionRuns = relevantRuns.filter((run) => (run.actionCount ?? 0) > 0);

  const previewSafe = Boolean(
    preview
    && preview.assignedItemCount > 0
    && preview.noEligibleStaffItemCount === 0
    && preview.otherBlockedItemCount === 0,
  );
  const previewCaution = Boolean(
    preview
    && (preview.dailyCapBlockedItemCount > 0 || preview.alreadyAssignedItemCount > 0),
  );
  const liveReady = previewSafe && successfulRuns.length >= 2 && warningRuns.length === 0 && matchedRuns.length >= 1 && actionRuns.length >= 1;

  let tone: "safe" | "caution" | "unsafe" = "unsafe";
  let title = "Keep review-only by default";

  if (liveReady) {
    tone = "safe";
    title = "Ready for controlled property rollout";
  } else if (previewSafe || previewCaution || successfulRuns.length > 0) {
    tone = "caution";
    title = "Continue single-property validation";
  }

  return {
    tone,
    title,
    relevantRuns,
    successfulRuns,
    warningRuns,
    matchedRuns,
    actionRuns,
    liveReady,
  };
}

function buildAssignmentValidationNotes(preview: NonNullable<AutomationPreviewResponse["assignmentSummary"]> | null, runs: AutomationRun[], isSpanish: boolean) {
  const decision = assignmentValidationDecision(preview, runs);
  const notes: string[] = [
    isSpanish
      ? "Politica predeterminada del paquete inicial: mantenga los inicios de autoasignacion por menor carga solo en revision hasta que una propiedad apruebe la validacion."
      : "Starter default policy: keep least-loaded auto-assignment starters review-only by default until a property passes validation.",
  ];

  if (!preview) {
    notes.push(isSpanish ? "Todavia no hay una vista previa de asignacion cargada." : "No assignment preview is loaded yet.");
  } else {
    notes.push(
      isSpanish
        ? `Resumen de la vista previa: ${preview.assignedItemCount} se asignarian, ${preview.alreadyAssignedItemCount} ya asignados, ${preview.noEligibleStaffItemCount} sin personal elegible, ${preview.dailyCapBlockedItemCount} bloqueados por el limite diario, ${preview.otherBlockedItemCount} bloqueados por otras razones.`
        : `Preview summary: ${preview.assignedItemCount} would assign, ${preview.alreadyAssignedItemCount} already assigned, ${preview.noEligibleStaffItemCount} with no eligible staff, ${preview.dailyCapBlockedItemCount} blocked by daily cap, ${preview.otherBlockedItemCount} blocked for other reasons.`,
    );
    if (preview.selectedUsers.length) {
      notes.push(
        isSpanish
          ? `Usuarios seleccionados en la vista previa: ${preview.selectedUsers.map((entry) => `${entry.fullName} (${entry.count})`).join(", ")}.`
          : `Preview selected users: ${preview.selectedUsers.map((entry) => `${entry.fullName} (${entry.count})`).join(", ")}.`,
      );
    }
  }

  notes.push(
    isSpanish
      ? `Ejecuciones recientes con diagnostico de asignacion: ${decision.relevantRuns.length} en total, ${decision.successfulRuns.length} exitosas, ${decision.warningRuns.length} con advertencias o errores, ${decision.matchedRuns.length} con coincidencias, ${decision.actionRuns.length} con acciones.`
      : `Recent assignment-aware runs: ${decision.relevantRuns.length} total, ${decision.successfulRuns.length} successful, ${decision.warningRuns.length} with warnings/errors, ${decision.matchedRuns.length} with matches, ${decision.actionRuns.length} with actions.`,
  );

  if (decision.liveReady) {
    notes.push(isSpanish ? "Recomendacion: mantenga el paquete inicial deshabilitado globalmente, pero esta propiedad tiene suficientes senales limpias para una activacion en vivo opcional con seguimiento cercano." : "Recommendation: keep the starter disabled globally, but this property has enough clean signals for an opt-in live rollout with close monitoring.");
  } else if (decision.tone === "caution") {
    notes.push(isSpanish ? "Recomendacion: continue solo con validacion a nivel de propiedad. Todavia no cambie la postura predeterminada del paquete inicial." : "Recommendation: continue property-level validation only. Do not change the default starter posture yet.");
  } else {
    notes.push(isSpanish ? "Recomendacion: mantengalo solo en revision. Corrija cobertura de personal, elegibilidad o restricciones de la regla antes de habilitar la asignacion en vivo." : "Recommendation: remain review-only. Fix staffing coverage, eligibility, or rule constraints before enabling live assignment.");
  }

  notes.push(
    isSpanish
      ? "Pasos requeridos de validacion en campo: ejecute la vista previa en una sola propiedad, instale el paquete inicial deshabilitado solo para esa propiedad, habilitelo durante una ventana observada de trabajo, revise al menos dos ejecuciones recientes limpias y confirme que las asignaciones coinciden con lo esperado por supervision antes de reutilizarlo mas ampliamente."
      : "Required field-validation steps: preview on one property, install the starter disabled for that property only, enable during an observed work window, review at least two clean recent runs, and confirm assignments match supervisor expectations before broader reuse.",
  );

  return notes.join("\n");
}

function formatPreviewActionDiagnostics(action: AutomationActionSummary, isSpanish: boolean) {
  const assignment = action.diagnostics?.assignment;
  if (!assignment) {
    return null;
  }

  return (
    <div className="automation-preview-diagnostics">
      <small>
        {isSpanish ? "Fecha objetivo" : "Target date"} {formatDateDisplay(assignment.targetDate)} · {isSpanish ? "horizonte de" : "look ahead"} {assignment.lookAheadDays} {isSpanish ? `dia${assignment.lookAheadDays === 1 ? "" : "s"}` : `day${assignment.lookAheadDays === 1 ? "" : "s"}`} · {isSpanish ? "trabajo planificado" : "planned work"} {assignment.includePlannedWork ? (isSpanish ? "incluido" : "included") : (isSpanish ? "ignorado" : "ignored")}
        {assignment.dailyAssignmentCap ? (isSpanish ? ` · limite diario ${assignment.dailyAssignmentCap}` : ` · daily cap ${assignment.dailyAssignmentCap}`) : ""}
      </small>
      {assignment.selectedUserName ? <small>{assignment.selectedUserName}: {assignment.selectedReason}</small> : null}
      {assignment.candidates.length > 0 ? (
        <ul className="automation-preview-candidate-list">
          {assignment.candidates.map((candidate) => (
            <li key={candidate.userId}>
              <strong>{candidate.fullName}</strong> ({candidate.role}) · {isSpanish ? "carga" : "workload"} {candidate.workloadScore} · {isSpanish ? "activo" : "active"} {candidate.activeCount} · {isSpanish ? "planificado" : "planned"} {candidate.plannedCount} · {isSpanish ? "dia objetivo" : "target-day"} {candidate.plannedDayCount} · {candidate.status.replace(/-/g, " ")}
              {candidate.reason ? ` · ${candidate.reason}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function renderAssignmentValidation(summary: NonNullable<AutomationPreviewResponse["assignmentSummary"]>, isSpanish: boolean) {
  const blockedCount = summary.noEligibleStaffItemCount + summary.dailyCapBlockedItemCount + summary.otherBlockedItemCount;
  const assignedCount = summary.assignedItemCount;
  const largestAssigneeCount = summary.selectedUsers.reduce((max, entry) => Math.max(max, entry.count), 0);
  const isHeavilySkewed = assignedCount > 1 && largestAssigneeCount / assignedCount >= 0.75;

  let tone: "safe" | "caution" | "unsafe" = "safe";
  let title = isSpanish ? "Listo para validacion de campo por propiedad" : "Ready for property-level field validation";

  if (assignedCount === 0 && blockedCount > 0) {
    tone = "unsafe";
    title = isSpanish ? "No esta listo para habilitarse" : "Not ready to enable";
  } else if (summary.noEligibleStaffItemCount > 0 || summary.otherBlockedItemCount > 0) {
    tone = "unsafe";
    title = isSpanish ? "Corrija personal o restricciones de la regla antes de habilitar" : "Fix staffing or rule constraints before enabling";
  } else if (summary.dailyCapBlockedItemCount > 0 || isHeavilySkewed || summary.alreadyAssignedItemCount > 0) {
    tone = "caution";
    title = isSpanish ? "Use precaucion durante la validacion por propiedad" : "Use caution during property-level validation";
  }

  const notes: string[] = [];
  if (assignedCount > 0) {
    notes.push(isSpanish ? `${assignedCount} elemento${assignedCount === 1 ? "" : "s"} coincidente${assignedCount === 1 ? "" : "s"} recibiria${assignedCount === 1 ? "" : "n"} una asignacion nueva en esta vista previa.` : `${assignedCount} matched item${assignedCount === 1 ? "" : "s"} would receive a fresh assignment in this preview.`);
  }
  if (summary.noEligibleStaffItemCount > 0) {
    notes.push(isSpanish ? `${summary.noEligibleStaffItemCount} elemento${summary.noEligibleStaffItemCount === 1 ? "" : "s"} no tiene${summary.noEligibleStaffItemCount === 1 ? "" : "n"} personal elegible segun los roles, usuarios y personal de la propiedad seleccionados.` : `${summary.noEligibleStaffItemCount} item${summary.noEligibleStaffItemCount === 1 ? "" : "s"} have no eligible staff based on the selected roles/users and property staffing.`);
  }
  if (summary.dailyCapBlockedItemCount > 0) {
    notes.push(isSpanish ? `${summary.dailyCapBlockedItemCount} elemento${summary.dailyCapBlockedItemCount === 1 ? "" : "s"} seria${summary.dailyCapBlockedItemCount === 1 ? "" : "n"} bloqueado${summary.dailyCapBlockedItemCount === 1 ? "" : "s"} por el limite diario configurado.` : `${summary.dailyCapBlockedItemCount} item${summary.dailyCapBlockedItemCount === 1 ? "" : "s"} would be blocked by the configured daily cap.`);
  }
  if (summary.otherBlockedItemCount > 0) {
    notes.push(isSpanish ? `${summary.otherBlockedItemCount} elemento${summary.otherBlockedItemCount === 1 ? "" : "s"} fue${summary.otherBlockedItemCount === 1 ? "" : "ron"} bloqueado${summary.otherBlockedItemCount === 1 ? "" : "s"} por otras razones de la regla y debe${summary.otherBlockedItemCount === 1 ? "" : "n"} revisarse antes de habilitar.` : `${summary.otherBlockedItemCount} item${summary.otherBlockedItemCount === 1 ? "" : "s"} were blocked for other rule reasons and should be inspected before enabling.`);
  }
  if (summary.alreadyAssignedItemCount > 0) {
    notes.push(isSpanish ? `${summary.alreadyAssignedItemCount} elemento${summary.alreadyAssignedItemCount === 1 ? "" : "s"} coincidente${summary.alreadyAssignedItemCount === 1 ? "" : "s"} ya esta${summary.alreadyAssignedItemCount === 1 ? "" : "n"} asignado${summary.alreadyAssignedItemCount === 1 ? "" : "s"}, por lo que los resultados en vivo pueden ser menores que el conteo de coincidencias.` : `${summary.alreadyAssignedItemCount} matched item${summary.alreadyAssignedItemCount === 1 ? "" : "s"} are already assigned, so live results may be smaller than the match count.`);
  }
  if (isHeavilySkewed) {
    const topAssignee = summary.selectedUsers.find((entry) => entry.count === largestAssigneeCount);
    if (topAssignee) {
      notes.push(isSpanish ? `${topAssignee.fullName} recibiria ${topAssignee.count} de ${assignedCount} asignaciones nuevas en esta vista previa, por lo que debe confirmarse que esa concentracion de carga sea intencional.` : `${topAssignee.fullName} would receive ${topAssignee.count} of ${assignedCount} new assignments in this preview, so confirm that workload concentration is intentional.`);
    }
  }
  if (tone === "safe") {
    notes.push(isSpanish ? "Los diagnosticos de la vista previa se ven lo bastante consistentes para una validacion en vivo en una sola propiedad. Mantenga las plantillas iniciales limitadas a una propiedad hasta que el historial de ejecucion confirme el mismo comportamiento." : "Preview diagnostics look consistent enough for a single-property live validation pass. Keep starter templates scoped to one property until run history confirms the same behavior.");
  }

  return (
    <div className={`automation-preview-validation ${tone}`} data-testid="automation-preview-validation">
      <h4>{title}</h4>
      <ul>
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </div>
  );
}

function formatAutomationRunContext(run: AutomationRun, isSpanish: boolean) {
  if (run.context?.matchedItems?.length) {
    return (
      <div className="automation-preview-actions">
        {run.context.matchedItems.map((item) => (
          <div key={item.itemId} className="automation-preview-action">
            <span>{item.propertyCode} / {item.unitNumber}</span>
            {item.actionSummaries.map((action, index) => (
              <div key={`${item.itemId}-${action.type}-${index}`}>
                <span>{action.summary}</span>
                {formatPreviewActionDiagnostics(action, isSpanish)}
              </div>
            ))}
          </div>
        ))}
        {run.context.matchedItemsTruncated ? <div className="automation-preview-diagnostics"><small>{isSpanish ? `Los detalles de la ejecucion se recortaron a los primeros ${run.context.matchedItems.length} elementos coincidentes para facilitar la lectura.` : `Run details truncated to the first ${run.context.matchedItems.length} matched items for readability.`}</small></div> : null}
      </div>
    );
  }
  if (run.context?.actionSummaries?.length) {
    return (
      <div className="automation-preview-actions">
        {run.context.actionSummaries.map((action, index) => (
          <div key={`${run.id}-${action.type}-${index}`} className="automation-preview-action">
            <span>{action.summary}</span>
            {formatPreviewActionDiagnostics(action, isSpanish)}
          </div>
        ))}
      </div>
    );
  }
  return null;
}

function renderAssignmentRolloutPack(preview: NonNullable<AutomationPreviewResponse["assignmentSummary"]> | null, runs: AutomationRun[], validationNotes: string, onCopy: () => void, isSpanish: boolean) {
  const decision = assignmentValidationDecision(preview, runs);
  const checklist = [
    isSpanish ? "Ejecute la vista previa de la regla solo para una propiedad y confirme que no existan bloqueos por falta de personal elegible." : "Preview the rule for one property only and confirm there are no missing eligible staff blockers.",
    isSpanish ? "Instale el paquete inicial deshabilitado solo para esa misma propiedad." : "Install the starter disabled for that same property only.",
    isSpanish ? "Habilitelo durante una ventana de trabajo supervisada y confirme que supervision espera esa distribucion de asignaciones." : "Enable it during a supervised work window and confirm supervisors expect the target assignment distribution.",
    isSpanish ? "Revise al menos dos ejecuciones recientes con diagnostico de asignacion y confirme que sean exitosas sin advertencias o errores inesperados." : "Review at least two recent assignment-aware runs and confirm they are successful with no unexpected warnings/errors.",
    isSpanish ? "Mantenga el paquete inicial global solo en revision a menos que la validacion real por propiedad pase repetidamente." : "Keep the global starter default review-only unless real-property validation repeatedly passes.",
  ];

  return (
    <section className={`automation-preview-validation ${decision.tone}`} data-testid="assignment-rollout-pack">
      <div className="admin-section-head">
        <div>
          <p className="eyebrow">{isSpanish ? "Paquete de despliegue de asignacion" : "Assignment Rollout Pack"}</p>
          <h4>{decision.title}</h4>
        </div>
        <button type="button" className="button button-secondary" data-testid="copy-assignment-validation-notes" onClick={onCopy}>
          {isSpanish ? "Copiar notas de validacion" : "Copy Validation Notes"}
        </button>
      </div>
      <ul>
        {checklist.map((entry) => (
          <li key={entry}>{entry}</li>
        ))}
      </ul>
      <div className="automation-preview-diagnostics">
        <small>
          {isSpanish ? "Ejecuciones recientes con diagnostico de asignacion" : "Recent assignment-aware runs"}: {decision.relevantRuns.length}
          {decision.relevantRuns.length
            ? (isSpanish
              ? ` · ${decision.successfulRuns.length} exitosas · ${decision.warningRuns.length} con advertencias o errores · ${decision.matchedRuns.length} con coincidencias · ${decision.actionRuns.length} con acciones`
              : ` · ${decision.successfulRuns.length} successful · ${decision.warningRuns.length} with warnings/errors · ${decision.matchedRuns.length} with matches · ${decision.actionRuns.length} with actions`)
            : (isSpanish ? " · ninguna aun" : " · none yet")}
        </small>
        <textarea readOnly value={validationNotes} rows={8} aria-label="Assignment validation notes" />
      </div>
    </section>
  );
}

const defaultTemplateInclude: PropertyTemplateInclude = {
  boardSections: true,
  optionSets: true,
  customFields: true,
  floorPlans: false,
  scheduleTracks: true,
  savedViews: true,
  dashboardPresets: true,
  checklistTemplates: true,
  automationRules: true,
  notificationDefaults: false,
  planningDefaults: false,
};

export function AutomationPanel({ role, language = "en", properties, customFields, rules, templates, libraryPacks, propertyTemplates, libraryPreview, templatePreview, runs, preview, loading, previewLoading, message, error, onCreate, onInstallTemplate, onPreviewLibraryPack, onInstallLibraryPack, onPreviewPropertyTemplate, onCreatePropertyTemplate, onApplyPropertyTemplate, onArchivePropertyTemplate, onRestorePropertyTemplate, onDeletePropertyTemplate, onUpdate, onToggle, onArchive, onRestore, onDelete, onPreviewStored, onPreviewDraft, onRunNow, onSelectRule }: Props) {
  const isSpanish = language === "es";
  const activeRules = useMemo(() => rules.filter((rule) => !rule.isArchived), [rules]);
  const archivedRules = useMemo(() => rules.filter((rule) => rule.isArchived), [rules]);
  const [selectedId, setSelectedId] = useState(() => activeRules[0]?.id ?? "");
  const [creating, setCreating] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<AutomationRule | null>(null);
  const [deleteRuleTarget, setDeleteRuleTarget] = useState<AutomationRule | null>(null);
  const [deleteTemplateTarget, setDeleteTemplateTarget] = useState<PropertyTemplate | null>(null);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(role, properties));
  const [templateCategory, setTemplateCategory] = useState("All");
  const [templatePropertyId, setTemplatePropertyId] = useState(() => role === "MANAGER" ? properties[0]?.id ?? "" : "");
  const [enableTemplateOnInstall, setEnableTemplateOnInstall] = useState(false);
  const [libraryImportText, setLibraryImportText] = useState("");
  const [libraryWizardMode, setLibraryWizardMode] = useState<"bundled" | "imported">("bundled");
  const [selectedLibraryPackKey, setSelectedLibraryPackKey] = useState(() => libraryPacks[0]?.packKey ?? "");
  const [libraryDetailKey, setLibraryDetailKey] = useState(() => libraryPacks[0]?.packKey ?? "");
  const [templateDraft, setTemplateDraft] = useState({ propertyId: properties[0]?.id ?? "", name: "", description: "", category: "Make Ready", notes: "" });
  const [templateInclude, setTemplateInclude] = useState<PropertyTemplateInclude>(defaultTemplateInclude);
  const [applyTarget, setApplyTarget] = useState({ templateId: "", propertyId: properties[0]?.id ?? "", newName: "", newCode: "", createNew: false, enableAutomations: false });
  const [validationCopyMessage, setValidationCopyMessage] = useState("");
  const [showLibraryInstallConfirm, setShowLibraryInstallConfirm] = useState(false);
  const selected = activeRules.find((rule) => rule.id === selectedId) ?? activeRules[0] ?? null;
  const canEditSelected = role === "ADMIN" || Boolean(selected?.propertyId);
  const incompleteCondition = draft.conditions.some((condition) => !noValueOperators.includes(condition.operator) && !condition.value.trim());
  const categories = ["All", ...Array.from(new Set(templates.map((template) => template.category)))];
  const visibleTemplates = templateCategory === "All" ? templates : templates.filter((template) => template.category === templateCategory);
  const activePropertyTemplates = useMemo(() => propertyTemplates.filter((template) => !template.isArchived), [propertyTemplates]);
  const archivedPropertyTemplates = useMemo(() => propertyTemplates.filter((template) => template.isArchived), [propertyTemplates]);
  const templateScopeId = templatePropertyId || null;
  const assignmentValidationActive = Boolean(preview?.assignmentSummary || ruleHasLeastLoadedAssignment(selected) || draftHasLeastLoadedAssignment(draft) || runs.some(runHasAssignmentDiagnostics));
  const assignmentValidationNotes = useMemo(
    () => buildAssignmentValidationNotes(preview?.assignmentSummary ?? null, runs, isSpanish),
    [isSpanish, preview?.assignmentSummary, runs],
  );
  const selectedLibraryPack = libraryPacks.find((pack) => pack.packKey === selectedLibraryPackKey) ?? libraryPacks[0] ?? null;
  const libraryDetailPack = libraryPacks.find((pack) => pack.packKey === libraryDetailKey) ?? selectedLibraryPack;
  const parsedLibraryImport = useMemo(() => {
    if (!libraryImportText.trim()) return { pack: null as OperationalLibraryPack | null, error: "" };
    try {
      const parsed = JSON.parse(libraryImportText);
      if (!isOperationalLibraryPack(parsed)) {
        return { pack: null as OperationalLibraryPack | null, error: isSpanish ? "El JSON no coincide con el formato makereadyos.libraryPack." : "JSON does not match the makereadyos.libraryPack format." };
      }
      return { pack: parsed, error: "" };
    } catch {
      return { pack: null as OperationalLibraryPack | null, error: isSpanish ? "JSON de pack de biblioteca invalido." : "Invalid library pack JSON." };
    }
  }, [isSpanish, libraryImportText]);
  const activeLibraryPack = libraryWizardMode === "bundled" ? selectedLibraryPack : parsedLibraryImport.pack;
  const activeLibraryGroups = activeLibraryPack ? packItemGroups(activeLibraryPack) : [];
  const activeLibraryInput = activeLibraryPack
    ? (libraryWizardMode === "bundled" ? { packKey: activeLibraryPack.packKey } : { pack: activeLibraryPack })
    : null;
  const activeLibraryPreview = useMemo(
    () => (libraryPreviewAppliesToPack(libraryPreview, activeLibraryPack) ? libraryPreview : null),
    [activeLibraryPack, libraryPreview],
  );
  const libraryPreviewTotals = useMemo(
    () => (activeLibraryPreview ? summarizeLibraryPreviewTotals(activeLibraryPreview.summary) : null),
    [activeLibraryPreview],
  );
  const libraryPreviewStatus = useMemo(
    () => libraryPreviewDecision(activeLibraryPreview),
    [activeLibraryPreview],
  );
  const libraryPreviewSteps = useMemo(
    () => libraryPreviewGuidance(activeLibraryPreview, isSpanish),
    [activeLibraryPreview, isSpanish],
  );
  const libraryPreviewPlan = useMemo(
    () => libraryRemediationPlan(activeLibraryPreview, isSpanish),
    [activeLibraryPreview, isSpanish],
  );
  const needsFreshLibraryPreview = Boolean(activeLibraryInput && !activeLibraryPreview);

  useEffect(() => {
    if (!activeRules.length) {
      setSelectedId("");
      return;
    }
    if (!selectedId || !activeRules.some((rule) => rule.id === selectedId)) {
      setSelectedId(activeRules[0]?.id ?? "");
    }
  }, [activeRules, selectedId]);

  useEffect(() => {
    if (creating) return;
    if (selected) {
      setDraft(toDraft(selected));
    }
  }, [creating, selected, selectedId]);

  useEffect(() => {
    if (!libraryPacks.length) {
      setSelectedLibraryPackKey("");
      setLibraryDetailKey("");
      return;
    }
    if (!selectedLibraryPackKey || !libraryPacks.some((pack) => pack.packKey === selectedLibraryPackKey)) {
      setSelectedLibraryPackKey(libraryPacks[0]?.packKey ?? "");
    }
    if (!libraryDetailKey || !libraryPacks.some((pack) => pack.packKey === libraryDetailKey)) {
      setLibraryDetailKey(libraryPacks[0]?.packKey ?? "");
    }
  }, [libraryDetailKey, libraryPacks, selectedLibraryPackKey]);

  const chooseRule = (rule: AutomationRule) => {
    setCreating(false);
    setSelectedId(rule.id);
    onSelectRule(rule.id);
  };

  const copyAssignmentValidationNotes = async () => {
    try {
      await navigator.clipboard.writeText(assignmentValidationNotes);
      setValidationCopyMessage(isSpanish ? "Notas de validacion copiadas." : "Validation notes copied.");
      window.setTimeout(() => setValidationCopyMessage(""), 2500);
    } catch {
      setValidationCopyMessage(isSpanish ? "La copia fallo. Selecciona las notas manualmente." : "Copy failed. Select the notes manually.");
      window.setTimeout(() => setValidationCopyMessage(""), 2500);
    }
  };

  return (
    <div className="automation-shell" data-testid="automation-panel">
      <nav className="automation-section-nav span-full" aria-label="Automation workspace sections">
        <a href="#automation-rule-templates">{isSpanish ? "Plantillas de reglas" : "Rule templates"}</a>
        <a href="#automation-library-packs">{isSpanish ? "Packs de biblioteca" : "Library packs"}</a>
        <a href="#property-template-library-section">{isSpanish ? "Plantillas de propiedad" : "Property templates"}</a>
        <a href="#automation-rules-section">{isSpanish ? "Reglas" : "Rules"}</a>
        <a href="#automation-history-section">{isSpanish ? "Historial de ejecucion" : "Run history"}</a>
      </nav>

      <section id="automation-rule-templates" className="automation-templates span-full" data-testid="automation-template-library">
        <header className="admin-section-head">
          <div>
            <p className="eyebrow">{isSpanish ? "Plantillas de reglas" : "Rule Templates"}</p>
            <h2>{isSpanish ? "Biblioteca operativa" : "Operational Library"}</h2>
          </div>
          <div className="automation-template-controls">
            <label>{isSpanish ? "Categoria" : "Category"}
              <select data-testid="automation-template-category" value={templateCategory} onChange={(event) => setTemplateCategory(event.target.value)}>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
            <label>{isSpanish ? "Alcance de instalacion" : "Install scope"}
              <select data-testid="automation-template-property" value={templatePropertyId} disabled={role === "MANAGER"} onChange={(event) => setTemplatePropertyId(event.target.value)}>
                {role === "ADMIN" ? <option value="">{isSpanish ? "Global - todas las propiedades" : "Global - all properties"}</option> : null}
                {properties.map((property) => <option key={property.id} value={property.id}>{property.code}</option>)}
              </select>
            </label>
            <label className="toggle-row automation-template-enable">
              <input data-testid="automation-template-enable" type="checkbox" checked={enableTemplateOnInstall} onChange={(event) => setEnableTemplateOnInstall(event.target.checked)} />
              {isSpanish ? "Habilitar al instalar" : "Enable on install"}
            </label>
          </div>
        </header>
        <p className="subtitle">{isSpanish ? "Las plantillas se instalan como reglas estructuradas editables. Permanecen deshabilitadas a menos que las habilites explicitamente durante la instalacion." : "Templates install as editable structured rules. They stay disabled unless you explicitly enable them during installation."}</p>
        <div className="automation-template-grid">
          {visibleTemplates.map((template) => {
            const installedForScope = template.installedRules.some((rule) => rule.propertyId === templateScopeId);
            const scopeMissing = role === "MANAGER" && !templateScopeId;
            const propertyScopeRequired = templateHasLeastLoadedAssignment(template);
            const assignmentScopeMissing = propertyScopeRequired && !templateScopeId;
            return (
              <article className="automation-template" key={template.id} data-testid={`automation-template-${template.id}`}>
                <div className="automation-template-head">
                  <span className="automation-template-category">{template.category}</span>
                  <span className={`status-chip ${installedForScope ? "active" : "inactive"}`}>{installedForScope ? (isSpanish ? "Instalada" : "Installed") : (isSpanish ? "Disponible" : "Available")}</span>
                </div>
                <h3>{template.name}</h3>
                <p>{template.description}</p>
                <div className="automation-template-meta">
                  <span>{humanize(template.triggerType)}</span>
                  <span>
                    {isSpanish
                      ? `${template.requiredFields.length} campo${template.requiredFields.length === 1 ? "" : "s"} obligatorio${template.requiredFields.length === 1 ? "" : "s"}`
                      : `${template.requiredFields.length} required field${template.requiredFields.length === 1 ? "" : "s"}`}
                  </span>
                </div>
                {propertyScopeRequired ? (
                  <div className="automation-template-requirement">
                    <strong>{isSpanish ? "Se requiere validacion por propiedad" : "Property validation required"}</strong>
                    <span>{isSpanish ? "Los inicios de autoasignacion por menor carga deben previsualizarse e instalarse para una propiedad a la vez." : "Least-loaded auto-assignment starters must be previewed and installed for one property at a time."}</span>
                  </div>
                ) : null}
                {template.setupRequirements.length > 0 ? (
                  <div className="automation-template-requirement" data-testid={`automation-template-requirements-${template.id}`}>
                    <strong>{isSpanish ? "Configuracion requerida" : "Setup required"}</strong>
                    {template.setupRequirements.map((requirement) => <span key={requirement}>{requirement}</span>)}
                  </div>
                ) : (
                  <p className="automation-template-note">{template.setupNotes[0]}</p>
                )}
                <div className="automation-template-actions">
                  <button
                    className="button button-secondary"
                    type="button"
                    data-testid={`automation-template-preview-${template.id}`}
                    disabled={!template.draft || previewLoading || scopeMissing || assignmentScopeMissing}
                    onClick={() => template.draft && void onPreviewDraft({ ...template.draft, propertyId: templateScopeId, enabled: false })}
                  >{isSpanish ? "Vista previa" : "Preview"}</button>
                  <button
                    className="button button-primary"
                    type="button"
                    data-testid={`automation-template-install-${template.id}`}
                    disabled={!template.readyToInstall || installedForScope || loading || scopeMissing || assignmentScopeMissing}
                    onClick={() => void onInstallTemplate(template.id, templateScopeId, enableTemplateOnInstall)}
                  >{installedForScope ? (isSpanish ? "Instalada" : "Installed") : (isSpanish ? "Instalar" : "Install")}</button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section id="automation-library-packs" className="automation-templates span-full" data-testid="operational-library">
        <header className="admin-section-head">
          <div>
            <p className="eyebrow">{isSpanish ? "Packs de biblioteca" : "Library Packs"}</p>
            <h2>{isSpanish ? "Packs de biblioteca operativa" : "Operational Library Packs"}</h2>
          </div>
        </header>
        <p className="subtitle">{isSpanish ? "Los packs son datos JSON versionados de MakeReadyOS. Pueden agregar campos, opciones, listas, vistas, pistas de programacion y reglas de automatizacion deshabilitadas; JavaScript nunca se importa ni se ejecuta." : "Packs are versioned MakeReadyOS JSON data. They may add fields, options, checklists, views, schedule tracks, and disabled automation rules; JavaScript is never imported or executed."}</p>
        {libraryPacks.length === 0 ? (
          <StatusState title={isSpanish ? "No hay packs de biblioteca" : "No library packs"} description={isSpanish ? "Los packs operativos integrados e importados aparecen aqui." : "Bundled and imported operational packs appear here."} tone="subtle" />
        ) : (
          <div className="automation-template-grid">
            {libraryPacks.map((pack) => {
              const counts = Object.entries(pack.items ?? {}).map(([key, value]) => `${Array.isArray(value) ? value.length : 0} ${humanize(key)}`);
              return (
                <article className="automation-template" key={pack.packKey} data-testid={`library-pack-${pack.packKey}`}>
                  <div className="automation-template-head">
                    <span className="automation-template-category">{pack.category ?? (isSpanish ? "Biblioteca" : "Library")}</span>
                    <span className={`status-chip ${pack.installed ? "active" : "inactive"}`}>{pack.installed ? (isSpanish ? "Instalado" : "Installed") : (isSpanish ? "Disponible" : "Available")}</span>
                  </div>
                  <h3>{pack.name}</h3>
                  <p>{pack.description}</p>
                  <div className="automation-template-meta">
                    <span>v{pack.version}</span>
                    <span>
                      {isSpanish
                        ? `${pack.usageCount ?? 0} elemento${(pack.usageCount ?? 0) === 1 ? "" : "s"} instalado${(pack.usageCount ?? 0) === 1 ? "" : "s"}`
                        : `${pack.usageCount ?? 0} installed item${pack.usageCount === 1 ? "" : "s"}`}
                    </span>
                  </div>
                  {counts.length > 0 ? <p className="automation-template-note">{counts.join(" · ")}</p> : null}
                  {pack.setupNotes?.length ? (
                    <div className="automation-template-requirement">
                      <strong>{isSpanish ? "Notas de configuracion" : "Setup notes"}</strong>
                      {pack.setupNotes.slice(0, 2).map((note) => <span key={note}>{note}</span>)}
                    </div>
                  ) : null}
                  <div className="automation-template-actions">
                    <button
                      className="button button-secondary"
                      type="button"
                      data-testid={`library-pack-use-${pack.packKey}`}
                      onClick={() => {
                        setLibraryWizardMode("bundled");
                        setSelectedLibraryPackKey(pack.packKey);
                      }}
                    >{isSpanish ? "Usar en asistente" : "Use In Wizard"}</button>
                    <button
                      className="button button-primary"
                      type="button"
                      data-testid={`library-pack-details-${pack.packKey}`}
                      onClick={() => setLibraryDetailKey(pack.packKey)}
                    >{isSpanish ? "Ver detalles" : "View Details"}</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        <div className="library-wizard" data-testid="library-import">
          <div className="library-wizard-step">
            <div className="admin-section-head">
              <div>
                <p className="eyebrow">{isSpanish ? "Paso 1" : "Step 1"}</p>
                <h3>{isSpanish ? "Elegir origen del pack" : "Choose Pack Source"}</h3>
              </div>
            </div>
            <div className="library-source-toggle">
              <button type="button" className={libraryWizardMode === "bundled" ? "button button-primary" : "button button-secondary"} onClick={() => setLibraryWizardMode("bundled")}>{isSpanish ? "Pack integrado" : "Bundled Pack"}</button>
              <button type="button" className={libraryWizardMode === "imported" ? "button button-primary" : "button button-secondary"} onClick={() => setLibraryWizardMode("imported")}>{isSpanish ? "JSON importado" : "Imported JSON"}</button>
            </div>
            {libraryWizardMode === "bundled" ? (
              <label>{isSpanish ? "Pack" : "Pack"}
                <select value={selectedLibraryPackKey} onChange={(event) => setSelectedLibraryPackKey(event.target.value)} data-testid="library-wizard-pack-select">
                  {libraryPacks.map((pack) => <option key={pack.packKey} value={pack.packKey}>{pack.name} ({pack.category ?? (isSpanish ? "Biblioteca" : "Library")})</option>)}
                </select>
              </label>
            ) : (
              <label className="span-full">{isSpanish ? "Pegar JSON del pack" : "Paste pack JSON"}
                <textarea
                  data-testid="library-import-json"
                  value={libraryImportText}
                  placeholder='{"format":"makereadyos.libraryPack","version":1,...}'
                  onChange={(event) => setLibraryImportText(event.target.value)}
                />
              </label>
            )}
            {libraryWizardMode === "imported" && parsedLibraryImport.error ? <p className="inline-error">{parsedLibraryImport.error}</p> : null}
          </div>
          <div className="library-wizard-step">
            <div className="admin-section-head">
              <div>
                <p className="eyebrow">{isSpanish ? "Paso 2" : "Step 2"}</p>
                <h3>{isSpanish ? "Revisar contenido y mapeo" : "Review Contents And Mapping"}</h3>
              </div>
            </div>
            {!activeLibraryPack ? (
              <StatusState title={isSpanish ? "Elige un pack primero" : "Choose a pack first"} description={isSpanish ? "Selecciona un pack integrado o pega un JSON valido para revisar campos, opciones y artefactos instalables." : "Select a bundled pack or paste valid JSON to review fields, options, and installable artifacts."} tone="subtle" />
            ) : (
              <>
                <div className="library-pack-summary">
                  <strong>{activeLibraryPack.name}</strong>
                  <span>{activeLibraryPack.category ?? (isSpanish ? "Biblioteca" : "Library")} · v{activeLibraryPack.version}</span>
                  {activeLibraryPack.description ? <p>{activeLibraryPack.description}</p> : null}
                </div>
                <div className="template-check-grid">
                  {activeLibraryGroups.map(([section, value]) => (
                    <div key={section} className="automation-item">
                      <button type="button">
                        <strong>{humanize(section)}</strong>
                        <small>{Array.isArray(value) ? value.length : 0} {isSpanish ? "elementos" : "items"}</small>
                      </button>
                    </div>
                  ))}
                </div>
                <div className="library-mapping-grid" data-testid="library-mapping-grid">
                  {activeLibraryGroups.map(([section, value]) => (
                    <article key={section} className="library-mapping-card">
                      <strong>{humanize(section)}</strong>
                      <small>{isSpanish ? "Lo que se instalara y la clave estable usada para evitar duplicados" : "What will install and the stable key used to avoid duplicates"}</small>
                      <div className="library-mapping-list">
                        {(value as unknown[]).slice(0, 6).map((entry, index) => {
                          const described = describePackEntry(section, entry);
                          return (
                            <div key={`${section}-${index}`} className="library-mapping-row">
                              <span>{described.primary}</span>
                              {described.target ? <code>{described.target}</code> : null}
                              {described.detail ? <small>{described.detail}</small> : null}
                            </div>
                          );
                        })}
                        {(value as unknown[]).length > 6 ? <small>{isSpanish ? `+${(value as unknown[]).length - 6} mas` : `+${(value as unknown[]).length - 6} more`}</small> : null}
                      </div>
                    </article>
                  ))}
                </div>
                {activeLibraryPack.setupNotes?.length ? (
                  <div className="automation-template-requirement">
                    <strong>{isSpanish ? "Checklist de configuracion" : "Setup checklist"}</strong>
                    {activeLibraryPack.setupNotes.map((note) => <span key={note}>{note}</span>)}
                  </div>
                ) : null}
              </>
            )}
          </div>
          <div className="library-wizard-step">
            <div className="admin-section-head">
              <div>
                <p className="eyebrow">{isSpanish ? "Paso 3" : "Step 3"}</p>
                <h3>{isSpanish ? "Vista previa e instalacion" : "Preview And Install"}</h3>
              </div>
            </div>
            <p className="subtitle">{isSpanish ? "Haz una vista previa primero para validar el paquete. La instalacion sigue siendo segura ante duplicados y no ejecuta codigo." : "Preview first to validate the pack. Install remains duplicate-safe and never executes code."}</p>
            {needsFreshLibraryPreview ? (
              <div className="admin-message warning">
                <strong>{isSpanish ? "Ejecute una vista previa para este pack antes de instalar" : "Run a preview for this pack before installing"}</strong>
                <span>{isSpanish ? "La instalacion ahora exige una vista previa actual del pack seleccionado para evitar continuar con validacion desactualizada." : "Install now requires a current preview for the selected pack so you do not proceed with stale validation."}</span>
              </div>
            ) : null}
            <div className="automation-template-actions">
              <button
                className="button button-secondary"
                type="button"
                data-testid="library-import-preview"
                disabled={loading || !activeLibraryInput}
                onClick={() => activeLibraryInput && void onPreviewLibraryPack(activeLibraryInput)}
              >{isSpanish ? "Vista previa del pack" : "Preview Pack"}</button>
              <button
                className="button button-primary"
                type="button"
                data-testid="library-import-install"
                disabled={loading || !activeLibraryInput || needsFreshLibraryPreview}
                onClick={() => {
                  if (!activeLibraryInput) return;
                  if (libraryPreviewStatus?.tone === "warning") {
                    setShowLibraryInstallConfirm(true);
                    return;
                  }
                  void onInstallLibraryPack(activeLibraryInput);
                }}
              >{libraryPreviewStatus?.tone === "warning" ? (isSpanish ? "Instalar con revision" : "Install With Review") : (isSpanish ? "Instalar pack" : "Install Pack")}</button>
            </div>
            {activeLibraryPreview ? (
              <div className="library-preview" data-testid="library-preview-summary">
                {libraryPreviewStatus ? (
                  <div className={`admin-message ${libraryPreviewStatus.tone === "warning" ? "warning" : "success"}`}>
                    <strong>{isSpanish ? libraryPreviewStatus.titleEs : libraryPreviewStatus.title}</strong>
                    <span>{isSpanish ? libraryPreviewStatus.descriptionEs : libraryPreviewStatus.description}</span>
                  </div>
                ) : null}
                <div className="library-preview-header">
                  <strong>{activeLibraryPreview.pack.name}</strong>
                  <span>{activeLibraryPreview.pack.category ?? (isSpanish ? "Biblioteca" : "Library")} · v{activeLibraryPreview.pack.version}</span>
                </div>
                <div className="unit-import-preview">
                  <span><strong>{libraryPreviewTotals?.created ?? 0}</strong> {isSpanish ? "por crear" : "to create"}</span>
                  <span><strong>{libraryPreviewTotals?.skipped ?? 0}</strong> {isSpanish ? "por omitir" : "to skip"}</span>
                  <span><strong>{libraryPreviewTotals?.conflicts ?? 0}</strong> {isSpanish ? "conflictos" : "conflicts"}</span>
                  <span><strong>{libraryPreviewTotals?.errors ?? 0}</strong> {isSpanish ? "errores" : "errors"}</span>
                </div>
                <div className="library-preview-grid">
                  {Object.entries(activeLibraryPreview.summary).map(([bucket, summary]) => (
                    <article key={bucket} className="library-preview-card">
                      <div className="library-preview-card-head">
                        <strong>{humanize(bucket)}</strong>
                        <span className={`status-chip ${libraryPreviewBucketTone(summary)}`}>{libraryPreviewBucketLabel(summary, isSpanish)}</span>
                      </div>
                      <div className="library-preview-card-stats">
                        <span>{summary.created} {isSpanish ? "crear" : "create"}</span>
                        <span>{summary.skipped} {isSpanish ? "omitir" : "skip"}</span>
                        <span>{summary.conflicts} {isSpanish ? "conflicto" : "conflict"}</span>
                      </div>
                      {summary.errors.length ? (
                        <ul className="compact-list">
                          {summary.errors.slice(0, 4).map((entry) => <li key={entry}>{entry}{" "}<span className="muted">{remediateLibraryError(entry, isSpanish)}</span></li>)}
                          {summary.errors.length > 4 ? <li>{isSpanish ? `+${summary.errors.length - 4} errores mas` : `+${summary.errors.length - 4} more errors`}</li> : null}
                        </ul>
                      ) : (
                        <small>{isSpanish ? "Sin errores de validacion." : "No validation errors."}</small>
                      )}
                    </article>
                  ))}
                </div>
                {activeLibraryPreview.warnings.length ? (
                  <div className="admin-message warning">
                    <strong>{isSpanish ? "Advertencias" : "Warnings"}</strong>
                    <ul className="compact-list">
                      {activeLibraryPreview.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                    </ul>
                  </div>
                ) : null}
                {libraryPreviewPlan.length ? (
                  <div className="admin-message warning">
                    <strong>{isSpanish ? "Plan de corrección" : "Remediation plan"}</strong>
                    <div className="compact-list">
                      {libraryPreviewPlan.map((entry) => (
                        <div key={entry.title}>
                          <strong>{entry.title}</strong>
                          <ul className="compact-list">
                            {entry.steps.map((step) => <li key={`${entry.title}-${step}`}>{step}</li>)}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {libraryPreviewSteps.length ? (
                  <div className={`admin-message ${libraryPreviewStatus?.tone === "warning" ? "warning" : "success"}`}>
                    <strong>{isSpanish ? "Que revisar" : "What to review"}</strong>
                    <ul className="compact-list">
                      {libraryPreviewSteps.map((step) => <li key={step}>{step}</li>)}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        {libraryDetailPack ? (
          <div className="library-installed-detail" data-testid="library-installed-detail">
            <div className="admin-section-head">
              <div>
                <p className="eyebrow">{isSpanish ? "Pack instalado" : "Installed Pack"}</p>
                <h3>{libraryDetailPack.name}</h3>
              </div>
              <span className={`status-chip ${libraryDetailPack.installed ? "active" : "inactive"}`}>{libraryDetailPack.installed ? (isSpanish ? "Instalado" : "Installed") : (isSpanish ? "Sin instalar" : "Not installed")}</span>
            </div>
            <div className="automation-template-meta">
              <span>{libraryDetailPack.category ?? (isSpanish ? "Biblioteca" : "Library")} · v{libraryDetailPack.version}</span>
              <span>{libraryDetailPack.installedAt ? `${isSpanish ? "Instalado" : "Installed"} ${formatDateDisplay(libraryDetailPack.installedAt)}` : (isSpanish ? "Aun no instalado" : "Not installed yet")}</span>
            </div>
            {libraryDetailPack.installedItems?.length ? (
              <div className="library-installed-list">
                {libraryDetailPack.installedItems.map((item) => {
                  const described = describeInstalledPackItem(libraryDetailPack, item);
                  return (
                    <div key={item.id} className="library-installed-row">
                      <div>
                        <strong>{described.primary}</strong>
                        <small>{described.secondary}</small>
                      </div>
                      <code>{described.key}</code>
                      <small>{item.status.toLowerCase()}</small>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="automation-template-note">{isSpanish ? "Este pack aun no ha creado artefactos instalados en esta instancia." : "This pack has not created installed artifacts on this instance yet."}</p>
            )}
          </div>
        ) : null}
      </section>

      <section id="property-template-library-section" className="automation-templates span-full" data-testid="property-template-library">
        <header className="admin-section-head">
          <div>
            <p className="eyebrow">{isSpanish ? "Plantillas de propiedad" : "Property Templates"}</p>
            <h2>{isSpanish ? "Configuraciones reutilizables del tablero" : "Reusable Board Setups"}</h2>
          </div>
        </header>
        <p className="subtitle">{isSpanish ? "Las plantillas solo copian configuración reutilizable. No clonan unidades, items de make-ready, comentarios, adjuntos, historial, usuarios, tokens ni sesiones." : "Templates copy reusable configuration only. They do not clone units, make-ready items, comments, attachments, history, users, tokens, or sessions."}</p>
        <div className="library-import template-quick-create" data-testid="property-template-create">
          <label>{isSpanish ? "Propiedad origen" : "Source property"}
            <select data-testid="property-template-source" value={templateDraft.propertyId} onChange={(event) => setTemplateDraft((current) => ({ ...current, propertyId: event.target.value }))}>
              {properties.map((property) => <option key={property.id} value={property.id}>{property.code} - {property.name}</option>)}
            </select>
          </label>
          <label>{isSpanish ? "Nombre de la plantilla" : "Template name"}
            <input data-testid="property-template-name" value={templateDraft.name} onChange={(event) => setTemplateDraft((current) => ({ ...current, name: event.target.value }))} placeholder={isSpanish ? "Configuración estándar de Make Ready" : "Standard Make Ready Setup"} />
          </label>
          <label>{isSpanish ? "Categoria" : "Category"}
            <input data-testid="property-template-category" value={templateDraft.category} onChange={(event) => setTemplateDraft((current) => ({ ...current, category: event.target.value }))} />
          </label>
          <label className="span-full">{isSpanish ? "Descripción" : "Description"}
            <textarea data-testid="property-template-description" value={templateDraft.description} onChange={(event) => setTemplateDraft((current) => ({ ...current, description: event.target.value }))} placeholder={isSpanish ? "Secciones, etiquetas, campos, vistas, programaciones, listas y automatizaciones deshabilitadas reutilizables." : "Reusable sections, labels, fields, views, schedules, checklists, and disabled automations."} />
          </label>
          <div className="span-full template-check-grid">
            {Object.entries(templateInclude).map(([key, value]) => (
              <label className="toggle-row" key={key}>
                <input
                  data-testid={`property-template-include-${key}`}
                  type="checkbox"
                  checked={value}
                  onChange={(event) => setTemplateInclude((current) => ({ ...current, [key]: event.target.checked }))}
                />
                {humanize(key)}
              </label>
            ))}
          </div>
          <div className="automation-template-actions span-full">
            <button
              className="button button-secondary"
              type="button"
              data-testid="property-template-preview-create"
              disabled={loading || !templateDraft.propertyId || !templateDraft.name.trim()}
              onClick={() => void onPreviewPropertyTemplate({ ...templateDraft, include: templateInclude, description: templateDraft.description || null, notes: templateDraft.notes || null })}
            >{isSpanish ? "Vista previa de la plantilla" : "Preview Template"}</button>
            <button
              className="button button-primary"
              type="button"
              data-testid="property-template-create-submit"
              disabled={loading || !templateDraft.propertyId || !templateDraft.name.trim()}
              onClick={() => void onCreatePropertyTemplate({ ...templateDraft, include: templateInclude, description: templateDraft.description || null, notes: templateDraft.notes || null })}
            >{isSpanish ? "Guardar plantilla" : "Save Template"}</button>
          </div>
        </div>

        {activePropertyTemplates.length === 0 ? (
          <StatusState title={isSpanish ? "No hay plantillas de propiedad" : "No property templates"} description={isSpanish ? "Guarda una configuracion de una propiedad existente para reutilizarla despues." : "Save a setup from an existing property to reuse it later."} tone="subtle" />
        ) : (
          <div className="automation-template-grid">
            {activePropertyTemplates.map((template) => (
              <article className="automation-template" key={template.id} data-testid={`property-template-${template.id}`}>
                <div className="automation-template-head">
                  <span className="automation-template-category">{template.category ?? (isSpanish ? "Plantilla de propiedad" : "Property Template")}</span>
                  <span className="status-chip inactive">v{template.version}</span>
                </div>
                <h3>{template.name}</h3>
                <p>{template.description ?? (isSpanish ? "Configuración reutilizable de propiedad de MakeReadyOS." : "Reusable MakeReadyOS property setup.")}</p>
                <div className="automation-template-meta">
                  <span>{isSpanish ? "Origen" : "Source"} {template.sourcePropertyCode ?? (isSpanish ? "biblioteca" : "library")}</span>
                  <span>{Object.values(template.counts ?? {}).reduce((sum, count) => sum + count, 0)} {isSpanish ? "registros de configuracion" : "config records"}</span>
                </div>
                <p className="automation-template-note">
                  {Object.entries(template.counts ?? {}).filter(([, count]) => count > 0).slice(0, 5).map(([key, count]) => `${count} ${humanize(key)}`).join(" · ") || (isSpanish ? "Sin registros de configuración" : "No config records")}
                </p>
                <div className="automation-template-actions">
                  <button className="button button-secondary" type="button" data-testid={`property-template-select-${template.id}`} onClick={() => setApplyTarget((current) => ({ ...current, templateId: template.id }))}>{isSpanish ? "Seleccionar" : "Select"}</button>
                  <button className="button button-danger" type="button" data-testid={`property-template-archive-${template.id}`} disabled={loading} onClick={() => void onArchivePropertyTemplate(template.id)}>{isSpanish ? "Archivar" : "Archive"}</button>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="library-import" data-testid="property-template-apply">
          <label>{isSpanish ? "Plantilla" : "Template"}
            <select data-testid="property-template-apply-template" value={applyTarget.templateId} onChange={(event) => setApplyTarget((current) => ({ ...current, templateId: event.target.value }))}>
              <option value="">{isSpanish ? "Elegir plantilla" : "Choose template"}</option>
              {activePropertyTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
            </select>
          </label>
          <label className="toggle-row">
            <input data-testid="property-template-create-new-toggle" type="checkbox" checked={applyTarget.createNew} onChange={(event) => setApplyTarget((current) => ({ ...current, createNew: event.target.checked }))} />
            {isSpanish ? "Aplicar a una nueva propiedad" : "Apply to new property"}
          </label>
          {applyTarget.createNew ? (
            <>
              <label>{isSpanish ? "Nombre de la nueva propiedad" : "New property name"}
                <input data-testid="property-template-new-name" value={applyTarget.newName} onChange={(event) => setApplyTarget((current) => ({ ...current, newName: event.target.value }))} />
              </label>
              <label>{isSpanish ? "Codigo de la nueva propiedad" : "New property code"}
                <input data-testid="property-template-new-code" value={applyTarget.newCode} onChange={(event) => setApplyTarget((current) => ({ ...current, newCode: event.target.value.toUpperCase() }))} />
              </label>
            </>
          ) : (
            <label>{isSpanish ? "Propiedad destino" : "Target property"}
              <select data-testid="property-template-target" value={applyTarget.propertyId} onChange={(event) => setApplyTarget((current) => ({ ...current, propertyId: event.target.value }))}>
                {properties.map((property) => <option key={property.id} value={property.id}>{property.code} - {property.name}</option>)}
              </select>
            </label>
          )}
          <label className="toggle-row">
            <input data-testid="property-template-enable-automations" type="checkbox" checked={applyTarget.enableAutomations} onChange={(event) => setApplyTarget((current) => ({ ...current, enableAutomations: event.target.checked }))} />
            {isSpanish ? "Habilitar automatizaciones instaladas" : "Enable installed automations"}
          </label>
          <div className="automation-template-actions">
            <button
              className="button button-secondary"
              type="button"
              data-testid="property-template-apply-preview"
              disabled={loading || !applyTarget.templateId || (!applyTarget.createNew && !applyTarget.propertyId) || (applyTarget.createNew && (!applyTarget.newName.trim() || !applyTarget.newCode.trim()))}
              onClick={() => void onApplyPropertyTemplate(applyTarget.templateId, {
                dryRun: true,
                targetPropertyId: applyTarget.createNew ? null : applyTarget.propertyId,
                newProperty: applyTarget.createNew ? { name: applyTarget.newName, code: applyTarget.newCode } : null,
                enableAutomations: applyTarget.enableAutomations,
              })}
            >{isSpanish ? "Aplicación en seco" : "Dry Run Apply"}</button>
            <button
              className="button button-primary"
              type="button"
              data-testid="property-template-apply-confirm"
              disabled={loading || !applyTarget.templateId || (!applyTarget.createNew && !applyTarget.propertyId) || (applyTarget.createNew && (!applyTarget.newName.trim() || !applyTarget.newCode.trim()))}
              onClick={() => void onApplyPropertyTemplate(applyTarget.templateId, {
                dryRun: false,
                targetPropertyId: applyTarget.createNew ? null : applyTarget.propertyId,
                newProperty: applyTarget.createNew ? { name: applyTarget.newName, code: applyTarget.newCode } : null,
                enableAutomations: applyTarget.enableAutomations,
              })}
            >{isSpanish ? "Aplicar plantilla" : "Apply Template"}</button>
          </div>
        </div>
        {templatePreview ? <pre className="library-preview" data-testid="property-template-preview-summary">{templatePreview}</pre> : null}
        {archivedPropertyTemplates.length > 0 ? (
          <div className="automation-archived-group" data-testid="property-template-archive-list">
            <div className="admin-section-head">
              <div>
                <p className="eyebrow">{isSpanish ? "Archivadas" : "Archived"}</p>
                <h3>{isSpanish ? "Plantillas archivadas" : "Archived templates"}</h3>
              </div>
              <span className="status-chip inactive">{archivedPropertyTemplates.length}</span>
            </div>
            <p className="automation-template-note">
              {isSpanish
                ? "Las plantillas archivadas se ocultan de la biblioteca activa. Restaurar las devuelve al flujo normal; eliminar las borra de forma permanente."
                : "Archived templates stay out of the active library. Restore brings them back; Delete permanently removes them."}
            </p>
            <div className="automation-template-grid">
              {archivedPropertyTemplates.map((template) => (
                <article className="automation-template" key={template.id} data-testid={`property-template-archived-${template.id}`}>
                  <div className="automation-template-head">
                    <span className="automation-template-category">{template.category ?? (isSpanish ? "Plantilla de propiedad" : "Property Template")}</span>
                    <span className="status-chip inactive">{isSpanish ? "Archivada" : "Archived"}</span>
                  </div>
                  <h3>{template.name}</h3>
                  <p>{template.description ?? (isSpanish ? "Configuración reutilizable de propiedad de MakeReadyOS." : "Reusable MakeReadyOS property setup.")}</p>
                  <div className="automation-template-meta">
                    <span>{isSpanish ? "Origen" : "Source"} {template.sourcePropertyCode ?? (isSpanish ? "biblioteca" : "library")}</span>
                    <span>{Object.values(template.counts ?? {}).reduce((sum, count) => sum + count, 0)} {isSpanish ? "registros de configuración" : "config records"}</span>
                  </div>
                  <div className="automation-template-actions">
                    <button className="button button-secondary" type="button" data-testid={`property-template-restore-${template.id}`} disabled={loading} onClick={() => void onRestorePropertyTemplate(template.id)}>{isSpanish ? "Restaurar" : "Restore"}</button>
                    <button className="button button-danger" type="button" data-testid={`property-template-delete-${template.id}`} disabled={loading} onClick={() => setDeleteTemplateTarget(template)}>{isSpanish ? "Eliminar" : "Delete"}</button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section id="automation-rules-section" className="automation-rule-list">
        <header className="admin-section-head">
          <div>
            <p className="eyebrow">{isSpanish ? "Reglas estructuradas" : "Structured Rules"}</p>
            <h2>{isSpanish ? "Automatizaciones" : "Automations"}</h2>
          </div>
          <button className="button button-primary" type="button" data-testid="automation-new" onClick={() => {
            setCreating(true);
            setSelectedId("");
            onSelectRule();
            setDraft(emptyDraft(role, properties));
          }}>{isSpanish ? "Nueva regla" : "New Rule"}</button>
        </header>
        <p className="subtitle">{isSpanish ? "Las reglas solo usan condiciones y acciones validadas. JavaScript nunca se ejecuta." : "Rules use validated conditions and actions only. JavaScript is never executed."}</p>
        {activeRules.length === 0 ? (
          <StatusState title={isSpanish ? "No hay reglas de automatizacion" : "No automation rules"} description={isSpanish ? "Crea una regla estructurada para un flujo de make-ready." : "Create a structured rule for a make-ready workflow."} tone="subtle" />
        ) : (
          <div className="automation-items">
            {activeRules.map((rule) => (
              <div className={selected?.id === rule.id && !creating ? "automation-item active" : "automation-item"} key={rule.id}>
                <button type="button" data-testid={`automation-item-${rule.id}`} onClick={() => chooseRule(rule)}>
                  <strong>{rule.name}</strong>
                  <small>{triggerLabel(rule.triggerType, isSpanish)} · {rule.property?.code ?? (isSpanish ? "Global" : "Global")}</small>
                </button>
                <label className="toggle-row" title={role === "MANAGER" && !rule.propertyId ? (isSpanish ? "Las reglas globales son controladas por administración" : "Global rules are admin-controlled") : (isSpanish ? "Habilitar regla de automatización" : "Enable automation rule")}>
                  <input
                    data-testid={`automation-toggle-${rule.id}`}
                    type="checkbox"
                    checked={rule.enabled}
                    disabled={loading || (role === "MANAGER" && !rule.propertyId)}
                    onChange={(event) => void onToggle(rule.id, event.target.checked)}
                  />
                  {rule.enabled ? (isSpanish ? "Activa" : "On") : (isSpanish ? "Apagada" : "Off")}
                </label>
              </div>
            ))}
          </div>
        )}
        {archivedRules.length > 0 ? (
          <div className="automation-archived-group" data-testid="automation-archived-rules">
            <div className="admin-section-head">
              <div>
                <h3>{isSpanish ? "Reglas archivadas" : "Archived rules"}</h3>
                <p className="subtitle">
                  {isSpanish
                    ? "Las reglas archivadas no se ejecutan. Restaurar las devuelve a la lista activa; Eliminar las borra permanentemente."
                    : "Archived rules do not run. Restore returns them to the active list; Delete removes them permanently."}
                </p>
              </div>
              <span className="status-chip inactive">{archivedRules.length}</span>
            </div>
            <div className="automation-items">
              {archivedRules.map((rule) => (
                <article className="automation-template" key={`archived-rule-${rule.id}`} data-testid={`automation-archived-${rule.id}`}>
                  <div>
                    <strong>{rule.name}</strong>
                    <p>{triggerLabel(rule.triggerType, isSpanish)} · {rule.property?.code ?? (isSpanish ? "Global" : "Global")}</p>
                  </div>
                  <div className="pool-entry-actions">
                    <button className="button button-secondary" type="button" disabled={loading} onClick={() => void onRestore(rule.id)}>{isSpanish ? "Restaurar" : "Restore"}</button>
                    <button className="button button-danger" type="button" disabled={loading} onClick={() => setDeleteRuleTarget(rule)}>{isSpanish ? "Eliminar" : "Delete"}</button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section id="automation-editor-section" className="automation-editor">
        <header className="admin-section-head">
          <h3>{creating ? (isSpanish ? "Crear regla" : "Create Rule") : selected ? (isSpanish ? "Editar regla" : "Edit Rule") : (isSpanish ? "Configuración de regla" : "Rule Setup")}</h3>
          {!creating && selected ? (
            <div className="automation-editor-actions">
              <button
                className="button button-secondary"
                data-testid="automation-preview-stored"
                type="button"
                disabled={previewLoading || (role === "MANAGER" && !selected.propertyId)}
                title={role === "MANAGER" && !selected.propertyId ? (isSpanish ? "Los gerentes solo pueden previsualizar reglas asignadas a propiedades" : "Managers may preview assigned-property rules only") : (isSpanish ? "Vista previa de esta regla guardada" : "Preview this saved rule")}
                onClick={() => void onPreviewStored(selected.id)}
              >{isSpanish ? "Vista previa" : "Preview"}</button>
              {selected.triggerType === "SCHEDULED_CHECK" && selected.enabled && canEditSelected ? (
                <button
                  className="button button-primary"
                  data-testid="automation-run-now"
                  type="button"
                  disabled={loading}
                  onClick={() => void onRunNow(selected.id)}
                >{isSpanish ? "Ejecutar ahora" : "Run Now"}</button>
              ) : null}
              {canEditSelected ? <button className="button button-danger" type="button" onClick={() => setArchiveTarget(selected)}>{isSpanish ? "Archivar" : "Archive"}</button> : null}
            </div>
          ) : null}
        </header>
        {message ? <div className="admin-message success">{message}</div> : null}
        {error ? <div className="admin-message error">{error}</div> : null}
        {!creating && !selected ? (
          <StatusState title={isSpanish ? "Elige una regla" : "Choose a rule"} description={isSpanish ? "Selecciona una regla de automatizacion o crea una nueva." : "Select an automation rule or create a new one."} tone="subtle" />
        ) : (
          <div className="automation-form">
            {!canEditSelected && !creating ? <div className="admin-message warning span-full">{isSpanish ? "Esta regla global es visible para gerentes pero solo puede cambiarla un administrador." : "This global rule is visible to managers but can only be changed by an admin."}</div> : null}
            <label>{isSpanish ? "Nombre de la regla" : "Rule name"}<input data-testid="automation-name" value={draft.name} disabled={!creating && !canEditSelected} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
            <label>{isSpanish ? "Disparador" : "Trigger"}<select data-testid="automation-trigger" value={draft.triggerType} disabled={!creating && !canEditSelected} onChange={(event) => setDraft((current) => ({ ...current, triggerType: event.target.value as AutomationTriggerType }))}>{triggers.map((trigger) => <option key={trigger} value={trigger}>{triggerLabel(trigger, isSpanish)}</option>)}</select></label>
            <label className="span-full">{isSpanish ? "Descripción" : "Description"}<input data-testid="automation-description" value={draft.description} disabled={!creating && !canEditSelected} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label>
            <label>{isSpanish ? "Alcance de propiedad" : "Property scope"}
              <select data-testid="automation-property" value={draft.propertyId} disabled={role === "MANAGER" || (!creating && !canEditSelected)} onChange={(event) => setDraft((current) => ({ ...current, propertyId: event.target.value }))}>
                {role === "ADMIN" ? <option value="">{isSpanish ? "Global - todas las propiedades" : "Global - all properties"}</option> : null}
                {properties.map((property) => <option key={property.id} value={property.id}>{property.code} - {property.name}</option>)}
              </select>
            </label>
            <label className="toggle-row automation-enabled"><input type="checkbox" checked={draft.enabled} disabled={!creating} onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))} />{isSpanish ? "Habilitada al crear" : "Enabled on create"}</label>

            <section className="automation-builder span-full">
              <div className="admin-section-head">
                <strong>{isSpanish ? "Todas las condiciones" : "All Conditions"}</strong>
                <button className="button button-secondary" type="button" disabled={!creating && !canEditSelected} onClick={() => setDraft((current) => ({ ...current, conditions: [...current.conditions, { field: "completionStatus", operator: "equals", value: "DONE" }] }))}>{isSpanish ? "Agregar condicion" : "Add Condition"}</button>
              </div>
              {draft.conditions.map((condition, index) => {
                const customField = customFieldForTarget(condition.field, customFields);
                const availableOperators = operatorsForTarget(condition.field, customFields);
                return (
                  <div className="automation-builder-row" key={`condition-${index}`}>
                    <select
                      data-testid={`automation-condition-field-${index}`}
                      disabled={!creating && !canEditSelected}
                      value={condition.field}
                      onChange={(event) => {
                        const target = event.target.value;
                        setDraft((current) => ({
                          ...current,
                          conditions: current.conditions.map((entry, entryIndex) => entryIndex === index
                            ? { ...entry, field: target, operator: operatorsForTarget(target, customFields)[0], value: defaultConditionValue(target, customFields) }
                            : entry),
                        }));
                      }}
                    >
                      <optgroup label={isSpanish ? "Campos integrados" : "Built-in fields"}>{conditionFields.map((field) => <option key={field} value={field}>{humanize(field)}</option>)}</optgroup>
                      {customFields.length > 0 ? <optgroup label={isSpanish ? "Campos personalizados" : "Custom fields"}>{customFields.map((field) => <option key={field.id} value={`custom:${field.id}`}>{field.label}</option>)}</optgroup> : null}
                    </select>
                    <select data-testid={`automation-condition-operator-${index}`} disabled={!creating && !canEditSelected} value={condition.operator} onChange={(event) => setDraft((current) => ({ ...current, conditions: current.conditions.map((entry, entryIndex) => entryIndex === index ? { ...entry, operator: event.target.value as AutomationCondition["operator"] } : entry) }))}>{availableOperators.map((operator) => <option key={operator} value={operator}>{humanize(operator)}</option>)}</select>
                    {noValueOperators.includes(condition.operator) ? (
                      <span className="subtitle">{isSpanish ? "No requiere valor" : "No value required"}</span>
                    ) : customField?.fieldType === "BOOLEAN" ? (
                      <select data-testid={`automation-condition-value-${index}`} disabled={!creating && !canEditSelected} value={condition.value} onChange={(event) => setDraft((current) => ({ ...current, conditions: current.conditions.map((entry, entryIndex) => entryIndex === index ? { ...entry, value: event.target.value } : entry) }))}>
                        <option value="true">{isSpanish ? "Verdadero" : "True"}</option>
                        <option value="false">{isSpanish ? "Falso" : "False"}</option>
                      </select>
                    ) : customField?.fieldType === "SINGLE_SELECT" || customField?.fieldType === "MULTI_SELECT" ? (
                      <select data-testid={`automation-condition-value-${index}`} disabled={!creating && !canEditSelected} value={condition.value} onChange={(event) => setDraft((current) => ({ ...current, conditions: current.conditions.map((entry, entryIndex) => entryIndex === index ? { ...entry, value: event.target.value } : entry) }))}>
                        {customField.options.map((option) => <option key={option.id} value={option.label}>{option.label}</option>)}
                      </select>
                    ) : (
                      <input
                        type={customField?.fieldType === "DATE" && ["equals", "notEquals"].includes(condition.operator) ? "date" : customField?.fieldType === "NUMBER" || condition.operator === "dateWithinNextDays" ? "number" : "text"}
                        data-testid={`automation-condition-value-${index}`}
                        disabled={!creating && !canEditSelected}
                        value={condition.value}
                        placeholder={condition.operator === "dateWithinNextDays" ? (isSpanish ? "Dias (0-365)" : "Days (0-365)") : (isSpanish ? "Valor" : "Value")}
                        onChange={(event) => setDraft((current) => ({ ...current, conditions: current.conditions.map((entry, entryIndex) => entryIndex === index ? { ...entry, value: event.target.value } : entry) }))}
                      />
                    )}
                    <button className="icon-button" type="button" aria-label={isSpanish ? "Eliminar condicion" : "Remove condition"} disabled={draft.conditions.length === 1 || (!creating && !canEditSelected)} onClick={() => setDraft((current) => ({ ...current, conditions: current.conditions.filter((_, entryIndex) => entryIndex !== index) }))}>x</button>
                  </div>
                );
              })}
            </section>

            <section className="automation-builder span-full">
              <div className="admin-section-head">
                <strong>{isSpanish ? "Acciones" : "Actions"}</strong>
                <button className="button button-secondary" type="button" disabled={!creating && !canEditSelected} onClick={() => setDraft((current) => ({ ...current, actions: [...current.actions, {
                  type: "addAuditNote",
                  field: "vacancyStatus",
                  fieldId: "",
                  value: "",
                  sourceField: "makeReadyDate",
                  targetField: "flooringDate",
                  offsetDays: "1",
                  eligibleRoles: ["TECH"],
                  eligibleUserIds: "",
                  excludedUserIds: "",
                  lookAheadDays: "7",
                  dailyAssignmentCap: "",
                  onlyWhenUnassigned: true,
                  includePlannedWork: true,
                }] }))}>{isSpanish ? "Agregar accion" : "Add Action"}</button>
              </div>
              {draft.actions.map((action, index) => (
                <div className="automation-builder-row" key={`action-${index}`}>
                  <select data-testid={`automation-action-type-${index}`} disabled={!creating && !canEditSelected} value={action.type} onChange={(event) => setDraft((current) => ({ ...current, actions: current.actions.map((entry, entryIndex) => entryIndex === index ? {
                    ...entry,
                    type: event.target.value as AutomationAction["type"],
                    value: event.target.value === "addAuditNote" ? entry.value : event.target.value === "assignLeastLoadedStaff" ? "" : entry.value,
                  } : entry) }))}>
                    <option value="setField">{isSpanish ? "Establecer valor del campo" : "Set field value"}</option>
                    <option value="setDateFromField">{isSpanish ? "Establecer fecha desde desfase operativo" : "Set date from operating offset"}</option>
                    <option value="setCustomField">{isSpanish ? "Establecer valor de campo personalizado" : "Set custom field value"}</option>
                    <option value="addAuditNote">{isSpanish ? "Agregar nota de actividad" : "Add activity note"}</option>
                    {draft.triggerType === "SCHEDULED_CHECK" ? <option value="assignLeastLoadedStaff">{isSpanish ? "Asignar personal con menor carga" : "Assign least-loaded staff"}</option> : null}
                    {draft.triggerType !== "SCHEDULED_CHECK" ? <option value="setPriority">{isSpanish ? "Establecer prioridad (existente)" : "Set priority (existing)"}</option> : null}
                    {draft.triggerType !== "SCHEDULED_CHECK" ? <option value="appendNote">{isSpanish ? "Agregar nota al item (existente)" : "Append item note (existing)"}</option> : null}
                  </select>
                  {action.type === "setField" ? <select disabled={!creating && !canEditSelected} value={action.field} onChange={(event) => setDraft((current) => ({ ...current, actions: current.actions.map((entry, entryIndex) => entryIndex === index ? { ...entry, field: event.target.value } : entry) }))}>{settableFields.map((field) => <option key={field} value={field}>{humanize(field)}</option>)}</select> : null}
                  {action.type === "setDateFromField" ? (
                    <>
                      <select data-testid={`automation-action-source-field-${index}`} disabled={!creating && !canEditSelected} value={action.sourceField} onChange={(event) => setDraft((current) => ({ ...current, actions: current.actions.map((entry, entryIndex) => entryIndex === index ? { ...entry, sourceField: event.target.value } : entry) }))}>
                        {dateActionFields.map((field) => <option key={field} value={field}>{isSpanish ? `Desde ${humanize(field)}` : `From ${humanize(field)}`}</option>)}
                      </select>
                      <select data-testid={`automation-action-target-field-${index}`} disabled={!creating && !canEditSelected} value={action.targetField} onChange={(event) => setDraft((current) => ({ ...current, actions: current.actions.map((entry, entryIndex) => entryIndex === index ? { ...entry, targetField: event.target.value } : entry) }))}>
                        {dateActionFields.map((field) => <option key={field} value={field}>{isSpanish ? `Establecer ${humanize(field)}` : `Set ${humanize(field)}`}</option>)}
                      </select>
                      <input
                        type="number"
                        data-testid={`automation-action-offset-days-${index}`}
                        disabled={!creating && !canEditSelected}
                        value={action.offsetDays}
                        min={-60}
                        max={60}
                        placeholder={isSpanish ? "Dias operativos" : "Operating days"}
                        onChange={(event) => setDraft((current) => ({ ...current, actions: current.actions.map((entry, entryIndex) => entryIndex === index ? { ...entry, offsetDays: event.target.value } : entry) }))}
                      />
                    </>
                  ) : null}
                  {action.type === "setCustomField" ? <select disabled={!creating && !canEditSelected} value={action.fieldId} onChange={(event) => setDraft((current) => ({ ...current, actions: current.actions.map((entry, entryIndex) => entryIndex === index ? { ...entry, fieldId: event.target.value } : entry) }))}><option value="">{isSpanish ? "Elegir campo" : "Choose field"}</option>{customFields.map((field) => <option key={field.id} value={field.id}>{field.label}</option>)}</select> : null}
                  {action.type === "assignLeastLoadedStaff" ? (
                    <>
                      <select disabled={!creating && !canEditSelected} value={action.sourceField} onChange={(event) => setDraft((current) => ({ ...current, actions: current.actions.map((entry, entryIndex) => entryIndex === index ? { ...entry, sourceField: event.target.value } : entry) }))}>
                        {["makeReadyDate", "moveInDate", "vacatedDate"].map((field) => <option key={field} value={field}>{isSpanish ? `Objetivo ${humanize(field)}` : `Target ${humanize(field)}`}</option>)}
                      </select>
                      <input
                        type="number"
                        disabled={!creating && !canEditSelected}
                        value={action.lookAheadDays}
                        min={0}
                        max={30}
                        placeholder={isSpanish ? "Dias de anticipacion" : "Look-ahead days"}
                        onChange={(event) => setDraft((current) => ({ ...current, actions: current.actions.map((entry, entryIndex) => entryIndex === index ? { ...entry, lookAheadDays: event.target.value } : entry) }))}
                      />
                      <input
                        disabled={!creating && !canEditSelected}
                        value={action.eligibleUserIds}
                        placeholder={isSpanish ? "IDs de usuarios elegibles (opcional)" : "Eligible user IDs (optional)"}
                        onChange={(event) => setDraft((current) => ({ ...current, actions: current.actions.map((entry, entryIndex) => entryIndex === index ? { ...entry, eligibleUserIds: event.target.value } : entry) }))}
                      />
                      <input
                        disabled={!creating && !canEditSelected}
                        value={action.excludedUserIds}
                        placeholder={isSpanish ? "Excluir IDs de usuarios (opcional)" : "Exclude user IDs (optional)"}
                        onChange={(event) => setDraft((current) => ({ ...current, actions: current.actions.map((entry, entryIndex) => entryIndex === index ? { ...entry, excludedUserIds: event.target.value } : entry) }))}
                      />
                      <input
                        type="number"
                        disabled={!creating && !canEditSelected}
                        value={action.dailyAssignmentCap}
                        min={1}
                        max={50}
                        placeholder={isSpanish ? "Limite por dia planificado" : "Planned-day cap"}
                        onChange={(event) => setDraft((current) => ({ ...current, actions: current.actions.map((entry, entryIndex) => entryIndex === index ? { ...entry, dailyAssignmentCap: event.target.value } : entry) }))}
                      />
                    </>
                  ) : null}
                  {action.type !== "setDateFromField" ? (
                    action.type === "assignLeastLoadedStaff" ? (
                      <label className="toggle-row">
                        <input
                          type="checkbox"
                          checked={action.onlyWhenUnassigned}
                          disabled={!creating && !canEditSelected}
                          onChange={(event) => setDraft((current) => ({ ...current, actions: current.actions.map((entry, entryIndex) => entryIndex === index ? { ...entry, onlyWhenUnassigned: event.target.checked } : entry) }))}
                        />
                        {isSpanish ? "Solo cuando no este asignado" : "Only when unassigned"}
                      </label>
                    ) : (
                      <input data-testid={`automation-action-value-${index}`} disabled={!creating && !canEditSelected} value={action.value} placeholder={action.type === "addAuditNote" ? (isSpanish ? "Nota de actividad" : "Activity note") : (isSpanish ? "Valor" : "Value")} onChange={(event) => setDraft((current) => ({ ...current, actions: current.actions.map((entry, entryIndex) => entryIndex === index ? { ...entry, value: event.target.value } : entry) }))} />
                    )
                  ) : <span className="subtitle">{isSpanish ? "Usa las reglas del calendario operativo de la propiedad" : "Uses property operating calendar rules"}</span>}
                  {action.type === "assignLeastLoadedStaff" ? (
                    <label className="toggle-row">
                      <input
                        type="checkbox"
                        checked={action.includePlannedWork}
                        disabled={!creating && !canEditSelected}
                        onChange={(event) => setDraft((current) => ({ ...current, actions: current.actions.map((entry, entryIndex) => entryIndex === index ? { ...entry, includePlannedWork: event.target.checked } : entry) }))}
                      />
                      {isSpanish ? "Incluir trabajo planificado" : "Include planned work"}
                    </label>
                  ) : null}
                  {action.type === "assignLeastLoadedStaff" ? (
                    <div className="automation-role-chips">
                      {assignableRoles.map((roleOption) => {
                        const checked = action.eligibleRoles.includes(roleOption);
                        return (
                          <label className="toggle-row" key={`${index}-${roleOption}`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!creating && !canEditSelected}
                              onChange={(event) => setDraft((current) => ({
                                ...current,
                                actions: current.actions.map((entry, entryIndex) => entryIndex === index ? {
                                  ...entry,
                                  eligibleRoles: event.target.checked
                                    ? Array.from(new Set([...entry.eligibleRoles, roleOption]))
                                    : entry.eligibleRoles.filter((value) => value !== roleOption),
                                } : entry),
                              }))}
                            />
                            {roleOption}
                          </label>
                        );
                      })}
                    </div>
                  ) : null}
                  <button className="icon-button" type="button" aria-label={isSpanish ? "Eliminar accion" : "Remove action"} disabled={draft.actions.length === 1 || (!creating && !canEditSelected)} onClick={() => setDraft((current) => ({ ...current, actions: current.actions.filter((_, entryIndex) => entryIndex !== index) }))}>x</button>
                </div>
              ))}
            </section>

            {(creating || canEditSelected) ? (
              <div className="automation-form-actions span-full">
                {creating ? (
                  <button
                    className="button button-secondary"
                    data-testid="automation-preview-draft"
                    type="button"
                    disabled={loading || !draft.name.trim() || incompleteCondition || draft.actions.some(isActionIncomplete)}
                    onClick={() => void onPreviewDraft(draftPayload(draft, customFields))}
                  >{isSpanish ? "Vista previa del borrador" : "Preview Draft"}</button>
                ) : null}
                <button
                  className="button button-primary"
                  data-testid="automation-save"
                  type="button"
                  disabled={loading || !draft.name.trim() || incompleteCondition || draft.actions.some(isActionIncomplete)}
                  onClick={async () => {
                    const input = draftPayload(draft, customFields);
                    if (creating) {
                      await onCreate(input);
                      setCreating(false);
                    } else if (selected) {
                      await onUpdate(selected.id, input);
                    }
                  }}
            >{creating ? (isSpanish ? "Crear regla" : "Create Rule") : (isSpanish ? "Guardar regla" : "Save Rule")}</button>
              </div>
            ) : null}
          </div>
        )}
      </section>

      {preview ? (
        <section className="automation-preview span-full" data-testid="automation-preview-panel">
          <div className="admin-section-head">
            <div>
              <p className="eyebrow">{isSpanish ? "Ejecucion en seco" : "Dry Run"}</p>
              <h3>{isSpanish ? "Vista previa:" : "Preview:"} {preview.rule.name}</h3>
            </div>
            <strong className="status-chip active">{preview.matchingItemCount} {isSpanish ? `coincidencia${preview.matchingItemCount === 1 ? "" : "s"}` : `match${preview.matchingItemCount === 1 ? "" : "es"}`}</strong>
          </div>
          <div className="automation-preview-notice" data-testid="automation-preview-notice">{isSpanish ? "No se realizaran cambios. Esta vista previa se registra en auditoria para responsabilidad." : "No changes will be made. This preview is audit logged for accountability."}</div>
          {preview.assignmentSummary ? (
            <>
              <div className="automation-preview-diagnostics">
                <small>
                  {isSpanish
                    ? `Vista previa de asignacion: ${preview.assignmentSummary.assignedItemCount} se asignarian`
                    : `Assignment preview: ${preview.assignmentSummary.assignedItemCount} would assign`}
                  {preview.assignmentSummary.alreadyAssignedItemCount ? (isSpanish ? ` · ${preview.assignmentSummary.alreadyAssignedItemCount} ya asignados` : ` · ${preview.assignmentSummary.alreadyAssignedItemCount} already assigned`) : ""}
                  {preview.assignmentSummary.noEligibleStaffItemCount ? (isSpanish ? ` · ${preview.assignmentSummary.noEligibleStaffItemCount} sin personal elegible` : ` · ${preview.assignmentSummary.noEligibleStaffItemCount} no eligible staff`) : ""}
                  {preview.assignmentSummary.dailyCapBlockedItemCount ? (isSpanish ? ` · ${preview.assignmentSummary.dailyCapBlockedItemCount} bloqueados por limite` : ` · ${preview.assignmentSummary.dailyCapBlockedItemCount} blocked by cap`) : ""}
                  {preview.assignmentSummary.otherBlockedItemCount ? (isSpanish ? ` · ${preview.assignmentSummary.otherBlockedItemCount} bloqueados por otras razones` : ` · ${preview.assignmentSummary.otherBlockedItemCount} other blocked`) : ""}
                </small>
                {preview.assignmentSummary.selectedUsers.length ? (
                  <ul className="automation-preview-candidate-list">
                    {preview.assignmentSummary.selectedUsers.map((entry) => (
                      <li key={entry.fullName}>
                        <strong>{entry.fullName}</strong> {isSpanish ? `recibiria ${entry.count} asignacion${entry.count === 1 ? "" : "es"}` : `would receive ${entry.count} assignment${entry.count === 1 ? "" : "s"}`}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              {renderAssignmentValidation(preview.assignmentSummary, isSpanish)}
            </>
          ) : null}
          <div className="automation-preview-warnings">
            {preview.warnings.map((warning) => <p key={warning}>{warning}</p>)}
          </div>
          {preview.affectedItems.length === 0 ? (
            <StatusState title={isSpanish ? "No hay items coincidentes" : "No matching items"} description={isSpanish ? "Los datos actuales del item no satisfacen las condiciones de esta regla." : "The current item data does not satisfy this rule's conditions."} tone="subtle" />
          ) : (
            <div className="automation-preview-items">
              {preview.affectedItems.map((item) => (
                <article className="automation-preview-item" key={item.itemId} data-testid="automation-preview-item">
                  <div>
                    <strong>{item.property.code} / {item.unitNumber}</strong>
                    <small>{item.triggerSummary}</small>
                  </div>
                  <span>
                    {isSpanish
                      ? `${item.conditionSummary.all.filter((condition) => condition.matched).length} de ${item.conditionSummary.all.length} condiciones obligatorias coinciden`
                      : `${item.conditionSummary.all.filter((condition) => condition.matched).length} of ${item.conditionSummary.all.length} required conditions matched`}
                  </span>
                  <div className="automation-preview-actions">
                    {item.proposedActions.map((action, index) => (
                      <div key={`${action.type}-${index}`} className="automation-preview-action">
                        <span>{action.summary}</span>
                        {formatPreviewActionDiagnostics(action, isSpanish)}
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {assignmentValidationActive ? (
        <div className="span-full">
          {renderAssignmentRolloutPack(preview?.assignmentSummary ?? null, runs, assignmentValidationNotes, () => void copyAssignmentValidationNotes(), isSpanish)}
          {validationCopyMessage ? <p className="subtitle">{validationCopyMessage}</p> : null}
        </div>
      ) : null}

      <section id="automation-history-section" className="automation-history span-full">
        <div className="admin-section-head"><h3>{isSpanish ? "Ejecuciones recientes" : "Recent Runs"}</h3><span className="subtitle">{selected ? selected.name : (isSpanish ? "Todas las reglas accesibles" : "All accessible rules")}</span></div>
        {runs.length === 0 ? <StatusState title={isSpanish ? "No hay ejecuciones recientes" : "No recent runs"} description={isSpanish ? "Las ejecuciones aparecen aqui despues de que cambios coincidentes de make-ready disparan una regla habilitada." : "Runs appear here after matching make-ready changes trigger an enabled rule."} tone="subtle" /> : (
          <div className="automation-run-list" data-testid="automation-run-history">
            {runs.map((run) => (
              <div className="automation-run" key={run.id}>
                <strong><span className={`automation-run-type ${run.runType.toLowerCase()}`}>{run.runType}</span>{run.rule.name}</strong>
                <span>{run.message}</span>
                <span>{run.item ? `${run.item.property.code} / ${run.item.unitNumber}` : run.checkedCount === null ? (isSpanish ? "Sin item vinculado" : "No linked item") : (isSpanish ? `${run.checkedCount} revisados / ${run.matchedCount ?? 0} coincidencias / ${run.actionCount ?? 0} acciones` : `${run.checkedCount} checked / ${run.matchedCount ?? 0} matched / ${run.actionCount ?? 0} actions`)}</span>
                {formatAutomationRunContext(run, isSpanish)}
                <time>{formatDateTime(run.ranAt)}</time>
              </div>
            ))}
          </div>
        )}
      </section>
      <ConfirmDialog
        open={showLibraryInstallConfirm && Boolean(activeLibraryInput)}
        language={isSpanish ? "es" : "en"}
        title={isSpanish ? "Instalar pack con conflictos" : "Install pack with conflicts"}
        description={
          isSpanish
            ? "La vista previa encontro conflictos o errores en algunas secciones. MakeReadyOS omitira o bloqueara solo esos registros, pero el resto del pack puede instalarse. Continue solo si ya reviso los conflictos mostrados arriba."
            : "This preview found conflicts or validation errors in some sections. MakeReadyOS will skip or block only those records, but the rest of the pack can still install. Continue only if you already reviewed the conflicts shown above."
        }
        confirmLabel={isSpanish ? "Instalar de todos modos" : "Install Anyway"}
        tone="danger"
        busy={loading}
        onClose={() => setShowLibraryInstallConfirm(false)}
        onConfirm={async () => {
          if (!activeLibraryInput) return;
          await onInstallLibraryPack(activeLibraryInput);
          setShowLibraryInstallConfirm(false);
        }}
      />
      <ConfirmDialog
        open={Boolean(archiveTarget)}
        language={isSpanish ? "es" : "en"}
        title={isSpanish ? "Archivar regla de automatizacion" : "Archive automation rule"}
        description={isSpanish ? `Archivar ${archiveTarget?.name ?? "esta regla"}? Se deshabilitara y ya no se evaluara.` : `Archive ${archiveTarget?.name ?? "this rule"}? It will be disabled and no longer evaluated.`}
        confirmLabel={isSpanish ? "Archivar regla" : "Archive Rule"}
        tone="danger"
        busy={loading}
        onClose={() => setArchiveTarget(null)}
        onConfirm={async () => {
          if (!archiveTarget) return;
          await onArchive(archiveTarget.id);
          setArchiveTarget(null);
          setSelectedId("");
          onSelectRule();
        }}
      />
      <ConfirmDialog
        open={Boolean(deleteTemplateTarget)}
        language={isSpanish ? "es" : "en"}
        title={isSpanish ? "Eliminar plantilla archivada" : "Delete archived template"}
        description={isSpanish
          ? `Eliminar permanentemente ${deleteTemplateTarget?.name ?? "esta plantilla"}? Solo las plantillas ya archivadas pueden borrarse y esta accion no se puede deshacer.`
          : `Permanently delete ${deleteTemplateTarget?.name ?? "this template"}? Only archived templates can be deleted and this action cannot be undone.`}
        confirmLabel={isSpanish ? "Eliminar plantilla" : "Delete Template"}
        tone="danger"
        busy={loading}
        onClose={() => setDeleteTemplateTarget(null)}
        onConfirm={async () => {
          if (!deleteTemplateTarget) return;
          await onDeletePropertyTemplate(deleteTemplateTarget.id);
          setDeleteTemplateTarget(null);
        }}
      />
      <ConfirmDialog
        open={Boolean(deleteRuleTarget)}
        language={isSpanish ? "es" : "en"}
        title={isSpanish ? "Eliminar regla archivada" : "Delete archived rule"}
        description={isSpanish
          ? `Eliminar permanentemente ${deleteRuleTarget?.name ?? "esta regla"}? Solo las reglas ya archivadas pueden borrarse y esta accion no se puede deshacer.`
          : `Permanently delete ${deleteRuleTarget?.name ?? "this rule"}? Only archived rules can be deleted and this action cannot be undone.`}
        confirmLabel={isSpanish ? "Eliminar regla" : "Delete Rule"}
        tone="danger"
        busy={loading}
        onClose={() => setDeleteRuleTarget(null)}
        onConfirm={async () => {
          if (!deleteRuleTarget) return;
          await onDelete(deleteRuleTarget.id);
          setDeleteRuleTarget(null);
        }}
      />
    </div>
  );
}
