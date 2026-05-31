import { useEffect, useState } from "react";
import type { AutomationAction, AutomationCondition, AutomationPreviewResponse, AutomationRule, AutomationRun, AutomationTemplate, AutomationTriggerType, CustomField, OperationalLibraryPack, Property, PropertyTemplate, PropertyTemplateInclude, UserRole } from "../lib/api";
import { formatDateTime } from "../lib/dateTime";
import { ConfirmDialog } from "./ConfirmDialog";
import { StatusState } from "./StatusState";

const triggers: Array<{ value: AutomationTriggerType; label: string }> = [
  { value: "ITEM_CREATED", label: "Make-ready item created" },
  { value: "ITEM_UPDATED", label: "Make-ready item updated" },
  { value: "DATE_FIELD_CHANGED", label: "Date field changed" },
  { value: "STATUS_FIELD_CHANGED", label: "Status field changed" },
  { value: "SCHEDULED_CHECK", label: "Scheduled check" },
];
const conditionFields = ["moveInDate", "makeReadyDate", "vacatedDate", "vacancyStatus", "completionStatus", "scopeLevel", "pestStatus", "floorsStatus", "makeReadyStatus", "cleaningStatus", "overdue", "moveInSoon"];
const builtInOperators: AutomationCondition["operator"][] = ["equals", "notEquals", "in", "isEmpty", "notEmpty", "dateBefore", "dateAfter", "dateBeforeToday", "dateAfterToday", "dateWithinNextDays", "dateMissing", "dateOnWeekend", "dateOnMondayOrFriday"];
const noValueOperators: AutomationCondition["operator"][] = ["isEmpty", "notEmpty", "dateBeforeToday", "dateAfterToday", "dateMissing", "dateOnWeekend", "dateOnMondayOrFriday"];
const settableFields = ["vacancyStatus", "completionStatus", "scopeLevel", "pestTreated", "makeReadyStatus", "cleaningStatus", "paintStatus", "doorsStatus", "notes"];
const dateActionFields = ["moveOutDate", "vacatedDate", "makeReadyDate", "flooringDate", "moveInDate"];

type DraftCondition = { field: string; operator: AutomationCondition["operator"]; value: string };
type DraftAction = { type: AutomationAction["type"]; field: string; fieldId: string; value: string; sourceField: string; targetField: string; offsetDays: string };
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
    actions: [{ type: "addAuditNote", field: "vacancyStatus", fieldId: "", value: "Automation attention required.", sourceField: "makeReadyDate", targetField: "flooringDate", offsetDays: "1" }],
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
  return !action.value.trim();
}

function humanize(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
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

export function AutomationPanel({ role, properties, customFields, rules, templates, libraryPacks, propertyTemplates, libraryPreview, templatePreview, runs, preview, loading, previewLoading, message, error, onCreate, onInstallTemplate, onPreviewLibraryPack, onInstallLibraryPack, onPreviewPropertyTemplate, onCreatePropertyTemplate, onApplyPropertyTemplate, onArchivePropertyTemplate, onUpdate, onToggle, onArchive, onPreviewStored, onPreviewDraft, onRunNow, onSelectRule }: Props) {
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
  const selected = rules.find((rule) => rule.id === selectedId) ?? rules[0] ?? null;
  const canEditSelected = role === "ADMIN" || Boolean(selected?.propertyId);
  const incompleteCondition = draft.conditions.some((condition) => !noValueOperators.includes(condition.operator) && !condition.value.trim());
  const categories = ["All", ...Array.from(new Set(templates.map((template) => template.category)))];
  const visibleTemplates = templateCategory === "All" ? templates : templates.filter((template) => template.category === templateCategory);
  const templateScopeId = templatePropertyId || null;

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

  return (
    <div className="automation-shell" data-testid="automation-panel">
      <nav className="automation-section-nav span-full" aria-label="Automation workspace sections">
        <a href="#automation-rule-templates">Rule templates</a>
        <a href="#automation-library-packs">Library packs</a>
        <a href="#property-template-library-section">Property templates</a>
        <a href="#automation-rules-section">Rules</a>
        <a href="#automation-history-section">Run history</a>
      </nav>

      <section id="automation-rule-templates" className="automation-templates span-full" data-testid="automation-template-library">
        <header className="admin-section-head">
          <div>
            <p className="eyebrow">Rule Templates</p>
            <h2>Operational Library</h2>
          </div>
          <div className="automation-template-controls">
            <label>Category
              <select data-testid="automation-template-category" value={templateCategory} onChange={(event) => setTemplateCategory(event.target.value)}>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
            <label>Install scope
              <select data-testid="automation-template-property" value={templatePropertyId} disabled={role === "MANAGER"} onChange={(event) => setTemplatePropertyId(event.target.value)}>
                {role === "ADMIN" ? <option value="">Global - all properties</option> : null}
                {properties.map((property) => <option key={property.id} value={property.id}>{property.code}</option>)}
              </select>
            </label>
            <label className="toggle-row automation-template-enable">
              <input data-testid="automation-template-enable" type="checkbox" checked={enableTemplateOnInstall} onChange={(event) => setEnableTemplateOnInstall(event.target.checked)} />
              Enable on install
            </label>
          </div>
        </header>
        <p className="subtitle">Templates install as editable structured rules. They stay disabled unless you explicitly enable them during installation.</p>
        <div className="automation-template-grid">
          {visibleTemplates.map((template) => {
            const installedForScope = template.installedRules.some((rule) => rule.propertyId === templateScopeId);
            const scopeMissing = role === "MANAGER" && !templateScopeId;
            return (
              <article className="automation-template" key={template.id} data-testid={`automation-template-${template.id}`}>
                <div className="automation-template-head">
                  <span className="automation-template-category">{template.category}</span>
                  <span className={`status-chip ${installedForScope ? "active" : "inactive"}`}>{installedForScope ? "Installed" : "Available"}</span>
                </div>
                <h3>{template.name}</h3>
                <p>{template.description}</p>
                <div className="automation-template-meta">
                  <span>{humanize(template.triggerType)}</span>
                  <span>{template.requiredFields.length} required field{template.requiredFields.length === 1 ? "" : "s"}</span>
                </div>
                {template.setupRequirements.length > 0 ? (
                  <div className="automation-template-requirement" data-testid={`automation-template-requirements-${template.id}`}>
                    <strong>Setup required</strong>
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
                    disabled={!template.draft || previewLoading || scopeMissing}
                    onClick={() => template.draft && void onPreviewDraft({ ...template.draft, propertyId: templateScopeId, enabled: false })}
                  >Preview</button>
                  <button
                    className="button button-primary"
                    type="button"
                    data-testid={`automation-template-install-${template.id}`}
                    disabled={!template.readyToInstall || installedForScope || loading || scopeMissing}
                    onClick={() => void onInstallTemplate(template.id, templateScopeId, enableTemplateOnInstall)}
                  >{installedForScope ? "Installed" : "Install"}</button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section id="automation-library-packs" className="automation-templates span-full" data-testid="operational-library">
        <header className="admin-section-head">
          <div>
            <p className="eyebrow">Library Packs</p>
            <h2>Operational Library Packs</h2>
          </div>
        </header>
        <p className="subtitle">Packs are versioned MakeReadyOS JSON data. They may add fields, options, checklists, views, schedule tracks, and disabled automation rules; JavaScript is never imported or executed.</p>
        {libraryPacks.length === 0 ? (
          <StatusState title="No library packs" description="Bundled and imported operational packs appear here." tone="subtle" />
        ) : (
          <div className="automation-template-grid">
            {libraryPacks.map((pack) => {
              const counts = Object.entries(pack.items ?? {}).map(([key, value]) => `${Array.isArray(value) ? value.length : 0} ${humanize(key)}`);
              return (
                <article className="automation-template" key={pack.packKey} data-testid={`library-pack-${pack.packKey}`}>
                  <div className="automation-template-head">
                    <span className="automation-template-category">{pack.category ?? "Library"}</span>
                    <span className={`status-chip ${pack.installed ? "active" : "inactive"}`}>{pack.installed ? "Installed" : "Available"}</span>
                  </div>
                  <h3>{pack.name}</h3>
                  <p>{pack.description}</p>
                  <div className="automation-template-meta">
                    <span>v{pack.version}</span>
                    <span>{pack.usageCount ?? 0} installed item{pack.usageCount === 1 ? "" : "s"}</span>
                  </div>
                  {counts.length > 0 ? <p className="automation-template-note">{counts.join(" · ")}</p> : null}
                  {pack.setupNotes?.length ? (
                    <div className="automation-template-requirement">
                      <strong>Setup notes</strong>
                      {pack.setupNotes.slice(0, 2).map((note) => <span key={note}>{note}</span>)}
                    </div>
                  ) : null}
                  <div className="automation-template-actions">
                    <button className="button button-secondary" type="button" data-testid={`library-pack-preview-${pack.packKey}`} disabled={loading} onClick={() => void onPreviewLibraryPack({ packKey: pack.packKey })}>Preview Pack</button>
                    <button className="button button-primary" type="button" data-testid={`library-pack-install-${pack.packKey}`} disabled={loading} onClick={() => void onInstallLibraryPack({ packKey: pack.packKey })}>Install Pack</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        <div className="library-import" data-testid="library-import">
          <label className="span-full">Import library pack JSON
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
                  window.alert("Invalid library pack JSON.");
                }
              }}
            >Preview Imported JSON</button>
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
                  window.alert("Invalid library pack JSON.");
                }
              }}
            >Install Imported JSON</button>
          </div>
        </div>
        {libraryPreview ? <pre className="library-preview" data-testid="library-preview-summary">{libraryPreview}</pre> : null}
      </section>

      <section id="property-template-library-section" className="automation-templates span-full" data-testid="property-template-library">
        <header className="admin-section-head">
          <div>
            <p className="eyebrow">Property Templates</p>
            <h2>Reusable Board Setups</h2>
          </div>
        </header>
        <p className="subtitle">Templates copy reusable configuration only. They do not clone units, make-ready items, comments, attachments, history, users, tokens, or sessions.</p>
        <div className="library-import template-quick-create" data-testid="property-template-create">
          <label>Source property
            <select data-testid="property-template-source" value={templateDraft.propertyId} onChange={(event) => setTemplateDraft((current) => ({ ...current, propertyId: event.target.value }))}>
              {properties.map((property) => <option key={property.id} value={property.id}>{property.code} - {property.name}</option>)}
            </select>
          </label>
          <label>Template name
            <input data-testid="property-template-name" value={templateDraft.name} onChange={(event) => setTemplateDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Standard Make Ready Setup" />
          </label>
          <label>Category
            <input data-testid="property-template-category" value={templateDraft.category} onChange={(event) => setTemplateDraft((current) => ({ ...current, category: event.target.value }))} />
          </label>
          <label className="span-full">Description
            <textarea data-testid="property-template-description" value={templateDraft.description} onChange={(event) => setTemplateDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Reusable sections, labels, fields, views, schedules, checklists, and disabled automations." />
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
            >Preview Template</button>
            <button
              className="button button-primary"
              type="button"
              data-testid="property-template-create-submit"
              disabled={loading || !templateDraft.propertyId || !templateDraft.name.trim()}
              onClick={() => void onCreatePropertyTemplate({ ...templateDraft, include: templateInclude, description: templateDraft.description || null, notes: templateDraft.notes || null })}
            >Save Template</button>
          </div>
        </div>

        {propertyTemplates.length === 0 ? (
          <StatusState title="No property templates" description="Save a setup from an existing property to reuse it later." tone="subtle" />
        ) : (
          <div className="automation-template-grid">
            {propertyTemplates.map((template) => (
              <article className="automation-template" key={template.id} data-testid={`property-template-${template.id}`}>
                <div className="automation-template-head">
                  <span className="automation-template-category">{template.category ?? "Property Template"}</span>
                  <span className="status-chip inactive">v{template.version}</span>
                </div>
                <h3>{template.name}</h3>
                <p>{template.description ?? "Reusable MakeReadyOS property setup."}</p>
                <div className="automation-template-meta">
                  <span>Source {template.sourcePropertyCode ?? "library"}</span>
                  <span>{Object.values(template.counts ?? {}).reduce((sum, count) => sum + count, 0)} config records</span>
                </div>
                <p className="automation-template-note">
                  {Object.entries(template.counts ?? {}).filter(([, count]) => count > 0).slice(0, 5).map(([key, count]) => `${count} ${humanize(key)}`).join(" · ") || "No config records"}
                </p>
                <div className="automation-template-actions">
                  <button className="button button-secondary" type="button" data-testid={`property-template-select-${template.id}`} onClick={() => setApplyTarget((current) => ({ ...current, templateId: template.id }))}>Select</button>
                  <button className="button button-danger" type="button" data-testid={`property-template-archive-${template.id}`} disabled={loading} onClick={() => void onArchivePropertyTemplate(template.id)}>Archive</button>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="library-import" data-testid="property-template-apply">
          <label>Template
            <select data-testid="property-template-apply-template" value={applyTarget.templateId} onChange={(event) => setApplyTarget((current) => ({ ...current, templateId: event.target.value }))}>
              <option value="">Choose template</option>
              {propertyTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
            </select>
          </label>
          <label className="toggle-row">
            <input data-testid="property-template-create-new-toggle" type="checkbox" checked={applyTarget.createNew} onChange={(event) => setApplyTarget((current) => ({ ...current, createNew: event.target.checked }))} />
            Apply to new property
          </label>
          {applyTarget.createNew ? (
            <>
              <label>New property name
                <input data-testid="property-template-new-name" value={applyTarget.newName} onChange={(event) => setApplyTarget((current) => ({ ...current, newName: event.target.value }))} />
              </label>
              <label>New property code
                <input data-testid="property-template-new-code" value={applyTarget.newCode} onChange={(event) => setApplyTarget((current) => ({ ...current, newCode: event.target.value.toUpperCase() }))} />
              </label>
            </>
          ) : (
            <label>Target property
              <select data-testid="property-template-target" value={applyTarget.propertyId} onChange={(event) => setApplyTarget((current) => ({ ...current, propertyId: event.target.value }))}>
                {properties.map((property) => <option key={property.id} value={property.id}>{property.code} - {property.name}</option>)}
              </select>
            </label>
          )}
          <label className="toggle-row">
            <input data-testid="property-template-enable-automations" type="checkbox" checked={applyTarget.enableAutomations} onChange={(event) => setApplyTarget((current) => ({ ...current, enableAutomations: event.target.checked }))} />
            Enable installed automations
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
            >Dry Run Apply</button>
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
            >Apply Template</button>
          </div>
        </div>
        {templatePreview ? <pre className="library-preview" data-testid="property-template-preview-summary">{templatePreview}</pre> : null}
      </section>

      <section id="automation-rules-section" className="automation-rule-list">
        <header className="admin-section-head">
          <div>
            <p className="eyebrow">Structured Rules</p>
            <h2>Automations</h2>
          </div>
          <button className="button button-primary" type="button" data-testid="automation-new" onClick={() => {
            setCreating(true);
            setSelectedId("");
            onSelectRule();
            setDraft(emptyDraft(role, properties));
          }}>New Rule</button>
        </header>
        <p className="subtitle">Rules use validated conditions and actions only. JavaScript is never executed.</p>
        {rules.length === 0 ? (
          <StatusState title="No automation rules" description="Create a structured rule for a make-ready workflow." tone="subtle" />
        ) : (
          <div className="automation-items">
            {rules.map((rule) => (
              <div className={selected?.id === rule.id && !creating ? "automation-item active" : "automation-item"} key={rule.id}>
                <button type="button" data-testid={`automation-item-${rule.id}`} onClick={() => chooseRule(rule)}>
                  <strong>{rule.name}</strong>
                  <small>{humanize(rule.triggerType)} · {rule.property?.code ?? "Global"}</small>
                </button>
                <label className="toggle-row" title={role === "MANAGER" && !rule.propertyId ? "Global rules are admin-controlled" : "Enable automation rule"}>
                  <input
                    data-testid={`automation-toggle-${rule.id}`}
                    type="checkbox"
                    checked={rule.enabled}
                    disabled={loading || (role === "MANAGER" && !rule.propertyId)}
                    onChange={(event) => void onToggle(rule.id, event.target.checked)}
                  />
                  {rule.enabled ? "On" : "Off"}
                </label>
              </div>
            ))}
          </div>
        )}
      </section>

      <section id="automation-editor-section" className="automation-editor">
        <header className="admin-section-head">
          <h3>{creating ? "Create Rule" : selected ? "Edit Rule" : "Rule Setup"}</h3>
          {!creating && selected ? (
            <div className="automation-editor-actions">
              <button
                className="button button-secondary"
                data-testid="automation-preview-stored"
                type="button"
                disabled={previewLoading || (role === "MANAGER" && !selected.propertyId)}
                title={role === "MANAGER" && !selected.propertyId ? "Managers may preview assigned-property rules only" : "Preview this saved rule"}
                onClick={() => void onPreviewStored(selected.id)}
              >Preview</button>
              {selected.triggerType === "SCHEDULED_CHECK" && selected.enabled && canEditSelected ? (
                <button
                  className="button button-primary"
                  data-testid="automation-run-now"
                  type="button"
                  disabled={loading}
                  onClick={() => void onRunNow(selected.id)}
                >Run Now</button>
              ) : null}
              {canEditSelected ? <button className="button button-danger" type="button" onClick={() => setArchiveTarget(selected)}>Archive</button> : null}
            </div>
          ) : null}
        </header>
        {message ? <div className="admin-message success">{message}</div> : null}
        {error ? <div className="admin-message error">{error}</div> : null}
        {!creating && !selected ? (
          <StatusState title="Choose a rule" description="Select an automation rule or create a new one." tone="subtle" />
        ) : (
          <div className="automation-form">
            {!canEditSelected && !creating ? <div className="admin-message warning span-full">This global rule is visible to managers but can only be changed by an admin.</div> : null}
            <label>Rule name<input data-testid="automation-name" value={draft.name} disabled={!creating && !canEditSelected} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
            <label>Trigger<select data-testid="automation-trigger" value={draft.triggerType} disabled={!creating && !canEditSelected} onChange={(event) => setDraft((current) => ({ ...current, triggerType: event.target.value as AutomationTriggerType }))}>{triggers.map((trigger) => <option key={trigger.value} value={trigger.value}>{trigger.label}</option>)}</select></label>
            <label className="span-full">Description<input data-testid="automation-description" value={draft.description} disabled={!creating && !canEditSelected} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label>
            <label>Property scope
              <select data-testid="automation-property" value={draft.propertyId} disabled={role === "MANAGER" || (!creating && !canEditSelected)} onChange={(event) => setDraft((current) => ({ ...current, propertyId: event.target.value }))}>
                {role === "ADMIN" ? <option value="">Global - all properties</option> : null}
                {properties.map((property) => <option key={property.id} value={property.id}>{property.code} - {property.name}</option>)}
              </select>
            </label>
            <label className="toggle-row automation-enabled"><input type="checkbox" checked={draft.enabled} disabled={!creating} onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))} />Enabled on create</label>

            <section className="automation-builder span-full">
              <div className="admin-section-head">
                <strong>All Conditions</strong>
                <button className="button button-secondary" type="button" disabled={!creating && !canEditSelected} onClick={() => setDraft((current) => ({ ...current, conditions: [...current.conditions, { field: "completionStatus", operator: "equals", value: "DONE" }] }))}>Add Condition</button>
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
                      <optgroup label="Built-in fields">{conditionFields.map((field) => <option key={field} value={field}>{humanize(field)}</option>)}</optgroup>
                      {customFields.length > 0 ? <optgroup label="Custom fields">{customFields.map((field) => <option key={field.id} value={`custom:${field.id}`}>{field.label}</option>)}</optgroup> : null}
                    </select>
                    <select data-testid={`automation-condition-operator-${index}`} disabled={!creating && !canEditSelected} value={condition.operator} onChange={(event) => setDraft((current) => ({ ...current, conditions: current.conditions.map((entry, entryIndex) => entryIndex === index ? { ...entry, operator: event.target.value as AutomationCondition["operator"] } : entry) }))}>{availableOperators.map((operator) => <option key={operator} value={operator}>{humanize(operator)}</option>)}</select>
                    {noValueOperators.includes(condition.operator) ? (
                      <span className="subtitle">No value required</span>
                    ) : customField?.fieldType === "BOOLEAN" ? (
                      <select data-testid={`automation-condition-value-${index}`} disabled={!creating && !canEditSelected} value={condition.value} onChange={(event) => setDraft((current) => ({ ...current, conditions: current.conditions.map((entry, entryIndex) => entryIndex === index ? { ...entry, value: event.target.value } : entry) }))}>
                        <option value="true">True</option>
                        <option value="false">False</option>
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
                        placeholder={condition.operator === "dateWithinNextDays" ? "Days (0-365)" : "Value"}
                        onChange={(event) => setDraft((current) => ({ ...current, conditions: current.conditions.map((entry, entryIndex) => entryIndex === index ? { ...entry, value: event.target.value } : entry) }))}
                      />
                    )}
                    <button className="icon-button" type="button" aria-label="Remove condition" disabled={draft.conditions.length === 1 || (!creating && !canEditSelected)} onClick={() => setDraft((current) => ({ ...current, conditions: current.conditions.filter((_, entryIndex) => entryIndex !== index) }))}>x</button>
                  </div>
                );
              })}
            </section>

            <section className="automation-builder span-full">
              <div className="admin-section-head">
                <strong>Actions</strong>
                <button className="button button-secondary" type="button" disabled={!creating && !canEditSelected} onClick={() => setDraft((current) => ({ ...current, actions: [...current.actions, { type: "addAuditNote", field: "vacancyStatus", fieldId: "", value: "", sourceField: "makeReadyDate", targetField: "flooringDate", offsetDays: "1" }] }))}>Add Action</button>
              </div>
              {draft.actions.map((action, index) => (
                <div className="automation-builder-row" key={`action-${index}`}>
                  <select data-testid={`automation-action-type-${index}`} disabled={!creating && !canEditSelected} value={action.type} onChange={(event) => setDraft((current) => ({ ...current, actions: current.actions.map((entry, entryIndex) => entryIndex === index ? { ...entry, type: event.target.value as AutomationAction["type"] } : entry) }))}>
                    <option value="setField">Set field value</option>
                    <option value="setDateFromField">Set date from operating offset</option>
                    <option value="setCustomField">Set custom field value</option>
                    <option value="addAuditNote">Add activity note</option>
                    {draft.triggerType !== "SCHEDULED_CHECK" ? <option value="setPriority">Set priority (existing)</option> : null}
                    {draft.triggerType !== "SCHEDULED_CHECK" ? <option value="appendNote">Append item note (existing)</option> : null}
                  </select>
                  {action.type === "setField" ? <select disabled={!creating && !canEditSelected} value={action.field} onChange={(event) => setDraft((current) => ({ ...current, actions: current.actions.map((entry, entryIndex) => entryIndex === index ? { ...entry, field: event.target.value } : entry) }))}>{settableFields.map((field) => <option key={field} value={field}>{humanize(field)}</option>)}</select> : null}
                  {action.type === "setDateFromField" ? (
                    <>
                      <select data-testid={`automation-action-source-field-${index}`} disabled={!creating && !canEditSelected} value={action.sourceField} onChange={(event) => setDraft((current) => ({ ...current, actions: current.actions.map((entry, entryIndex) => entryIndex === index ? { ...entry, sourceField: event.target.value } : entry) }))}>
                        {dateActionFields.map((field) => <option key={field} value={field}>From {humanize(field)}</option>)}
                      </select>
                      <select data-testid={`automation-action-target-field-${index}`} disabled={!creating && !canEditSelected} value={action.targetField} onChange={(event) => setDraft((current) => ({ ...current, actions: current.actions.map((entry, entryIndex) => entryIndex === index ? { ...entry, targetField: event.target.value } : entry) }))}>
                        {dateActionFields.map((field) => <option key={field} value={field}>Set {humanize(field)}</option>)}
                      </select>
                      <input
                        type="number"
                        data-testid={`automation-action-offset-days-${index}`}
                        disabled={!creating && !canEditSelected}
                        value={action.offsetDays}
                        min={-60}
                        max={60}
                        placeholder="Operating days"
                        onChange={(event) => setDraft((current) => ({ ...current, actions: current.actions.map((entry, entryIndex) => entryIndex === index ? { ...entry, offsetDays: event.target.value } : entry) }))}
                      />
                    </>
                  ) : null}
                  {action.type === "setCustomField" ? <select disabled={!creating && !canEditSelected} value={action.fieldId} onChange={(event) => setDraft((current) => ({ ...current, actions: current.actions.map((entry, entryIndex) => entryIndex === index ? { ...entry, fieldId: event.target.value } : entry) }))}><option value="">Choose field</option>{customFields.map((field) => <option key={field.id} value={field.id}>{field.label}</option>)}</select> : null}
                  {action.type !== "setDateFromField" ? (
                    <input data-testid={`automation-action-value-${index}`} disabled={!creating && !canEditSelected} value={action.value} placeholder={action.type === "addAuditNote" ? "Activity note" : "Value"} onChange={(event) => setDraft((current) => ({ ...current, actions: current.actions.map((entry, entryIndex) => entryIndex === index ? { ...entry, value: event.target.value } : entry) }))} />
                  ) : <span className="subtitle">Uses property operating calendar rules</span>}
                  <button className="icon-button" type="button" aria-label="Remove action" disabled={draft.actions.length === 1 || (!creating && !canEditSelected)} onClick={() => setDraft((current) => ({ ...current, actions: current.actions.filter((_, entryIndex) => entryIndex !== index) }))}>x</button>
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
                  >Preview Draft</button>
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
                >{creating ? "Create Rule" : "Save Rule"}</button>
              </div>
            ) : null}
          </div>
        )}
      </section>

      {preview ? (
        <section className="automation-preview span-full" data-testid="automation-preview-panel">
          <div className="admin-section-head">
            <div>
              <p className="eyebrow">Dry Run</p>
              <h3>Preview: {preview.rule.name}</h3>
            </div>
            <strong className="status-chip active">{preview.matchingItemCount} match{preview.matchingItemCount === 1 ? "" : "es"}</strong>
          </div>
          <div className="automation-preview-notice" data-testid="automation-preview-notice">No changes will be made. This preview is audit logged for accountability.</div>
          <div className="automation-preview-warnings">
            {preview.warnings.map((warning) => <p key={warning}>{warning}</p>)}
          </div>
          {preview.affectedItems.length === 0 ? (
            <StatusState title="No matching items" description="The current item data does not satisfy this rule's conditions." tone="subtle" />
          ) : (
            <div className="automation-preview-items">
              {preview.affectedItems.map((item) => (
                <article className="automation-preview-item" key={item.itemId} data-testid="automation-preview-item">
                  <div>
                    <strong>{item.property.code} / {item.unitNumber}</strong>
                    <small>{item.triggerSummary}</small>
                  </div>
                  <span>{item.conditionSummary.all.filter((condition) => condition.matched).length} of {item.conditionSummary.all.length} required conditions matched</span>
                  <div className="automation-preview-actions">
                    {item.proposedActions.map((action, index) => <span key={`${action.type}-${index}`}>{action.summary}</span>)}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <section id="automation-history-section" className="automation-history span-full">
        <div className="admin-section-head"><h3>Recent Runs</h3><span className="subtitle">{selected ? selected.name : "All accessible rules"}</span></div>
        {runs.length === 0 ? <StatusState title="No recent runs" description="Runs appear here after matching make-ready changes trigger an enabled rule." tone="subtle" /> : (
          <div className="automation-run-list" data-testid="automation-run-history">
            {runs.map((run) => (
              <div className="automation-run" key={run.id}>
                <strong><span className={`automation-run-type ${run.runType.toLowerCase()}`}>{run.runType}</span>{run.rule.name}</strong>
                <span>{run.message}</span>
                <span>{run.item ? `${run.item.property.code} / ${run.item.unitNumber}` : run.checkedCount === null ? "No linked item" : `${run.checkedCount} checked / ${run.matchedCount ?? 0} matched / ${run.actionCount ?? 0} actions`}</span>
                <time>{formatDateTime(run.ranAt)}</time>
              </div>
            ))}
          </div>
        )}
      </section>
      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title="Archive automation rule"
        description={`Archive ${archiveTarget?.name ?? "this rule"}? It will be disabled and no longer evaluated.`}
        confirmLabel="Archive Rule"
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
