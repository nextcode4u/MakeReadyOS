import { useEffect, useMemo, useState } from "react";
import type { AutomationAction, AutomationActionSummary, AutomationCondition, AutomationPreviewResponse, AutomationRule, AutomationRun, AutomationTemplate, AutomationTriggerType, CustomField, OperationalLibraryPack, Property, PropertyTemplate, PropertyTemplateInclude, UserRole } from "../lib/api";
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
  libraryPreview: string;
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
  onUpdate: (id: string, input: ReturnType<typeof draftPayload>) => Promise<void>;
  onToggle: (id: string, enabled: boolean) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
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

export function AutomationPanel({ role, language = "en", properties, customFields, rules, templates, libraryPacks, propertyTemplates, libraryPreview, templatePreview, runs, preview, loading, previewLoading, message, error, onCreate, onInstallTemplate, onPreviewLibraryPack, onInstallLibraryPack, onPreviewPropertyTemplate, onCreatePropertyTemplate, onApplyPropertyTemplate, onArchivePropertyTemplate, onUpdate, onToggle, onArchive, onPreviewStored, onPreviewDraft, onRunNow, onSelectRule }: Props) {
  const isSpanish = language === "es";
  const [selectedId, setSelectedId] = useState(() => rules[0]?.id ?? "");
  const [creating, setCreating] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<AutomationRule | null>(null);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(role, properties));
  const [templateCategory, setTemplateCategory] = useState("All");
  const [templatePropertyId, setTemplatePropertyId] = useState(() => role === "MANAGER" ? properties[0]?.id ?? "" : "");
  const [enableTemplateOnInstall, setEnableTemplateOnInstall] = useState(false);
  const [libraryImportText, setLibraryImportText] = useState("");
  const [templateDraft, setTemplateDraft] = useState({ propertyId: properties[0]?.id ?? "", name: "", description: "", category: "Make Ready", notes: "" });
  const [templateInclude, setTemplateInclude] = useState<PropertyTemplateInclude>(defaultTemplateInclude);
  const [applyTarget, setApplyTarget] = useState({ templateId: "", propertyId: properties[0]?.id ?? "", newName: "", newCode: "", createNew: false, enableAutomations: false });
  const [validationCopyMessage, setValidationCopyMessage] = useState("");
  const selected = rules.find((rule) => rule.id === selectedId) ?? rules[0] ?? null;
  const canEditSelected = role === "ADMIN" || Boolean(selected?.propertyId);
  const incompleteCondition = draft.conditions.some((condition) => !noValueOperators.includes(condition.operator) && !condition.value.trim());
  const categories = ["All", ...Array.from(new Set(templates.map((template) => template.category)))];
  const visibleTemplates = templateCategory === "All" ? templates : templates.filter((template) => template.category === templateCategory);
  const templateScopeId = templatePropertyId || null;
  const assignmentValidationActive = Boolean(preview?.assignmentSummary || ruleHasLeastLoadedAssignment(selected) || draftHasLeastLoadedAssignment(draft) || runs.some(runHasAssignmentDiagnostics));
  const assignmentValidationNotes = useMemo(
    () => buildAssignmentValidationNotes(preview?.assignmentSummary ?? null, runs, isSpanish),
    [isSpanish, preview?.assignmentSummary, runs],
  );

  useEffect(() => {
    if (creating) return;
    if (selected) {
      setDraft(toDraft(selected));
    }
  }, [creating, selected, selectedId]);

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
                    <button className="button button-secondary" type="button" data-testid={`library-pack-preview-${pack.packKey}`} disabled={loading} onClick={() => void onPreviewLibraryPack({ packKey: pack.packKey })}>{isSpanish ? "Vista previa del pack" : "Preview Pack"}</button>
                    <button className="button button-primary" type="button" data-testid={`library-pack-install-${pack.packKey}`} disabled={loading} onClick={() => void onInstallLibraryPack({ packKey: pack.packKey })}>{isSpanish ? "Instalar pack" : "Install Pack"}</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        <div className="library-import" data-testid="library-import">
          <label className="span-full">{isSpanish ? "Importar JSON de pack de biblioteca" : "Import library pack JSON"}
            <textarea
              data-testid="library-import-json"
              value={libraryImportText}
              placeholder='{"format":"makereadyos.libraryPack","version":1,...}'
              onChange={(event) => setLibraryImportText(event.target.value)}
            />
          </label>
          <div className="automation-template-actions">
            <button
              className="button button-secondary"
              type="button"
              data-testid="library-import-preview"
              disabled={loading || !libraryImportText.trim()}
              onClick={() => {
                try {
                  const pack = JSON.parse(libraryImportText);
                  void onPreviewLibraryPack({ pack });
                } catch {
                  window.alert(isSpanish ? "JSON de pack de biblioteca invalido." : "Invalid library pack JSON.");
                }
              }}
            >{isSpanish ? "Vista previa del JSON importado" : "Preview Imported JSON"}</button>
            <button
              className="button button-primary"
              type="button"
              data-testid="library-import-install"
              disabled={loading || !libraryImportText.trim()}
              onClick={() => {
                try {
                  const pack = JSON.parse(libraryImportText);
                  void onInstallLibraryPack({ pack });
                } catch {
                  window.alert(isSpanish ? "JSON de pack de biblioteca invalido." : "Invalid library pack JSON.");
                }
              }}
            >{isSpanish ? "Instalar JSON importado" : "Install Imported JSON"}</button>
          </div>
        </div>
        {libraryPreview ? <pre className="library-preview" data-testid="library-preview-summary">{libraryPreview}</pre> : null}
      </section>

      <section id="property-template-library-section" className="automation-templates span-full" data-testid="property-template-library">
        <header className="admin-section-head">
          <div>
            <p className="eyebrow">{isSpanish ? "Plantillas de propiedad" : "Property Templates"}</p>
            <h2>{isSpanish ? "Configuraciones reutilizables del tablero" : "Reusable Board Setups"}</h2>
          </div>
        </header>
        <p className="subtitle">{isSpanish ? "Las plantillas solo copian configuracion reutilizable. No clonan unidades, items de make-ready, comentarios, adjuntos, historial, usuarios, tokens ni sesiones." : "Templates copy reusable configuration only. They do not clone units, make-ready items, comments, attachments, history, users, tokens, or sessions."}</p>
        <div className="library-import template-quick-create" data-testid="property-template-create">
          <label>{isSpanish ? "Propiedad origen" : "Source property"}
            <select data-testid="property-template-source" value={templateDraft.propertyId} onChange={(event) => setTemplateDraft((current) => ({ ...current, propertyId: event.target.value }))}>
              {properties.map((property) => <option key={property.id} value={property.id}>{property.code} - {property.name}</option>)}
            </select>
          </label>
          <label>{isSpanish ? "Nombre de la plantilla" : "Template name"}
            <input data-testid="property-template-name" value={templateDraft.name} onChange={(event) => setTemplateDraft((current) => ({ ...current, name: event.target.value }))} placeholder={isSpanish ? "Configuracion estandar de Make Ready" : "Standard Make Ready Setup"} />
          </label>
          <label>{isSpanish ? "Categoria" : "Category"}
            <input data-testid="property-template-category" value={templateDraft.category} onChange={(event) => setTemplateDraft((current) => ({ ...current, category: event.target.value }))} />
          </label>
          <label className="span-full">{isSpanish ? "Descripcion" : "Description"}
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

        {propertyTemplates.length === 0 ? (
          <StatusState title={isSpanish ? "No hay plantillas de propiedad" : "No property templates"} description={isSpanish ? "Guarda una configuracion de una propiedad existente para reutilizarla despues." : "Save a setup from an existing property to reuse it later."} tone="subtle" />
        ) : (
          <div className="automation-template-grid">
            {propertyTemplates.map((template) => (
              <article className="automation-template" key={template.id} data-testid={`property-template-${template.id}`}>
                <div className="automation-template-head">
                  <span className="automation-template-category">{template.category ?? (isSpanish ? "Plantilla de propiedad" : "Property Template")}</span>
                  <span className="status-chip inactive">v{template.version}</span>
                </div>
                <h3>{template.name}</h3>
                <p>{template.description ?? (isSpanish ? "Configuracion reutilizable de propiedad de MakeReadyOS." : "Reusable MakeReadyOS property setup.")}</p>
                <div className="automation-template-meta">
                  <span>{isSpanish ? "Origen" : "Source"} {template.sourcePropertyCode ?? (isSpanish ? "biblioteca" : "library")}</span>
                  <span>{Object.values(template.counts ?? {}).reduce((sum, count) => sum + count, 0)} {isSpanish ? "registros de configuracion" : "config records"}</span>
                </div>
                <p className="automation-template-note">
                  {Object.entries(template.counts ?? {}).filter(([, count]) => count > 0).slice(0, 5).map(([key, count]) => `${count} ${humanize(key)}`).join(" · ") || (isSpanish ? "Sin registros de configuracion" : "No config records")}
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
              {propertyTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
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
            >{isSpanish ? "Aplicacion en seco" : "Dry Run Apply"}</button>
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
      </section>

      <section id="automation-rules-section" className="automation-rule-list">
        <header className="admin-section-head">
          <div>
            <p className="eyebrow">{isSpanish ? "Reglas estructuradas" : "Structured Rules"}</p>
            <h2>Automations</h2>
          </div>
          <button className="button button-primary" type="button" data-testid="automation-new" onClick={() => {
            setCreating(true);
            setSelectedId("");
            onSelectRule();
            setDraft(emptyDraft(role, properties));
          }}>{isSpanish ? "Nueva regla" : "New Rule"}</button>
        </header>
        <p className="subtitle">{isSpanish ? "Las reglas solo usan condiciones y acciones validadas. JavaScript nunca se ejecuta." : "Rules use validated conditions and actions only. JavaScript is never executed."}</p>
        {rules.length === 0 ? (
          <StatusState title={isSpanish ? "No hay reglas de automatizacion" : "No automation rules"} description={isSpanish ? "Crea una regla estructurada para un flujo de make-ready." : "Create a structured rule for a make-ready workflow."} tone="subtle" />
        ) : (
          <div className="automation-items">
            {rules.map((rule) => (
              <div className={selected?.id === rule.id && !creating ? "automation-item active" : "automation-item"} key={rule.id}>
                <button type="button" data-testid={`automation-item-${rule.id}`} onClick={() => chooseRule(rule)}>
                  <strong>{rule.name}</strong>
                  <small>{humanize(rule.triggerType)} · {rule.property?.code ?? (isSpanish ? "Global" : "Global")}</small>
                </button>
                <label className="toggle-row" title={role === "MANAGER" && !rule.propertyId ? (isSpanish ? "Las reglas globales son controladas por administracion" : "Global rules are admin-controlled") : (isSpanish ? "Habilitar regla de automatizacion" : "Enable automation rule")}>
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
      </section>

      <section id="automation-editor-section" className="automation-editor">
        <header className="admin-section-head">
          <h3>{creating ? (isSpanish ? "Crear regla" : "Create Rule") : selected ? (isSpanish ? "Editar regla" : "Edit Rule") : (isSpanish ? "Configuracion de regla" : "Rule Setup")}</h3>
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
            <label className="span-full">{isSpanish ? "Descripcion" : "Description"}<input data-testid="automation-description" value={draft.description} disabled={!creating && !canEditSelected} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label>
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
    </div>
  );
}
