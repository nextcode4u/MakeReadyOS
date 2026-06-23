import { useEffect, useMemo, useState } from "react";
import type { BoardSection, CustomField, LabelDefinition, Property, SavedView, StaffOption, UserLanguage, UserRole } from "../lib/api";
import { customOperatorsByType, defaultCustomFilterFor, type ArchiveFilter, type CustomFieldFilter, type MoveInWindowFilter } from "../lib/structuredFilters";
import { sortOptions, tableColumnPresets, type VisibleColumnOption } from "../lib/board";
import { t, tWithVars } from "../lib/i18n";
import { ConfirmDialog } from "./ConfirmDialog";
import { StatusState } from "./StatusState";

type AppView = "table" | "kanban" | "calendar" | "dashboard";

type CurrentConfig = {
  activeView: AppView;
  propertyId: string;
  search: string;
  overdueOnly: boolean;
  moveInWindow: MoveInWindowFilter;
  scopeLevel: string;
  vacancyStatus: string;
  assignedTech: string;
  boardSection: string;
  makeReadyStatus: string;
  missingDatesOnly: boolean;
  pestIssuesOnly: boolean;
  flooringNeededOnly: boolean;
  paintNeededOnly: boolean;
  moveInRiskOnly: boolean;
  riskLevel: string;
  riskCategory: string;
  archiveState: ArchiveFilter;
  customFieldFilters: CustomFieldFilter[];
  sortKey: string;
  sortDirection: "asc" | "desc";
  kanbanGroupBy: string;
  calendarField: string;
  visibleColumns: string[] | null;
  columnLabels: Record<string, string>;
};

type Props = {
  views: SavedView[];
  currentUserId: string;
  currentUserRole: UserRole;
  language?: UserLanguage;
  loading?: boolean;
  config: CurrentConfig;
  columnOptions: VisibleColumnOption[];
  calendarOptions: Array<{ key: string; label: string }>;
  kanbanOptions: Array<{ key: string; label: string }>;
  labelsByField: Record<string, Record<string, LabelDefinition>>;
  staff: StaffOption[];
  boardSections: BoardSection[];
  properties: Property[];
  customFields: CustomField[];
  canConfigureColumns: boolean;
  onApplyView: (view: SavedView) => void;
  onCreateView: (input: {
    name: string;
    isShared: boolean;
  }) => Promise<void>;
  onUpdateView: (id: string, input: {
    name?: string;
    isShared?: boolean;
  }) => Promise<void>;
  onArchiveView: (id: string) => Promise<void>;
  onRestoreView: (id: string) => Promise<void>;
  onDeleteView: (id: string) => Promise<void>;
  onConfigChange: (next: Partial<CurrentConfig>) => void;
  onRenameColumn: (fieldKey: string, label: string) => Promise<void>;
};

function canManageSharedViews(role: UserRole) {
  return role === "ADMIN" || role === "MANAGER";
}

export function SavedViewsPanel({
  views,
  currentUserId,
  currentUserRole,
  language = "en",
  loading,
  config,
  columnOptions,
  calendarOptions,
  kanbanOptions,
  labelsByField,
  staff,
  boardSections,
  properties,
  customFields,
  canConfigureColumns,
  onApplyView,
  onCreateView,
  onUpdateView,
  onArchiveView,
  onRestoreView,
  onDeleteView,
  onConfigChange,
  onRenameColumn,
}: Props) {
  const [viewName, setViewName] = useState("");
  const [shared, setShared] = useState(false);
  const [selectedViewId, setSelectedViewId] = useState("");
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [customFieldToAdd, setCustomFieldToAdd] = useState("");

  const selectedView = useMemo(
    () => views.find((view) => view.id === selectedViewId) ?? null,
    [selectedViewId, views],
  );

  useEffect(() => {
    if (selectedViewId && !views.some((view) => view.id === selectedViewId)) {
      setSelectedViewId("");
      setViewName("");
      setShared(false);
    }
  }, [selectedViewId, views]);

  const canCreate = currentUserRole !== "VIEWER";
  const canShare = canManageSharedViews(currentUserRole);
  const canManageSelected = Boolean(selectedView && (selectedView.ownerUserId === currentUserId || currentUserRole === "ADMIN"));
  const activeCustomFields = customFields.filter((field) => !field.isArchived);
  const availableCustomFields = activeCustomFields.filter((field) => !config.customFieldFilters.some((filter) => filter.fieldId === field.id));
  const updateCustomFilter = (fieldId: string, data: Partial<CustomFieldFilter>) => {
    onConfigChange({ customFieldFilters: config.customFieldFilters.map((filter) => filter.fieldId === fieldId ? { ...filter, ...data } : filter) });
  };
  const activeColumnKeys = config.visibleColumns ?? columnOptions.map((column) => column.key);
  const activeColumnSet = new Set(activeColumnKeys);
  const orderedColumnOptions = [
    ...activeColumnKeys.map((key) => columnOptions.find((column) => column.key === key)).filter((column): column is VisibleColumnOption => Boolean(column)),
    ...columnOptions.filter((column) => !activeColumnSet.has(column.key)),
  ];
  const applyColumnPreset = (key: string) => {
    const columns = key === "full"
      ? columnOptions.map((column) => column.key)
      : tableColumnPresets.find((preset) => preset.key === key)?.columns ?? [];
    const available = new Set(columnOptions.map((column) => column.key));
    onConfigChange({ visibleColumns: columns.filter((column) => available.has(column)) });
  };
  const moveColumn = (key: string, offset: -1 | 1) => {
    const current = [...activeColumnKeys];
    const index = current.indexOf(key);
    const swap = index + offset;
    if (index < 0 || swap < 0 || swap >= current.length) return;
    [current[index], current[swap]] = [current[swap], current[index]];
    onConfigChange({ visibleColumns: current });
  };

  return (
    <section className="sidebar-block" data-testid="saved-views-panel">
      <h2>{t(language, "savedViews.title")}</h2>

      <div className="saved-view-settings">
        <label>
          {t(language, "savedViews.viewType")}
          <select data-testid="saved-view-type" value={config.activeView} onChange={(event) => onConfigChange({ activeView: event.target.value as AppView })}>
            <option value="table">{t(language, "nav.table")}</option>
            <option value="kanban">{t(language, "nav.kanban")}</option>
            <option value="calendar">{t(language, "nav.schedule")}</option>
            <option value="dashboard">{t(language, "nav.dashboard")}</option>
          </select>
        </label>

        <label>
          {t(language, "savedViews.sort")}
          <select data-testid="saved-view-sort-key" value={config.sortKey} onChange={(event) => onConfigChange({ sortKey: event.target.value })}>
            {sortOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          {t(language, "savedViews.direction")}
          <select data-testid="saved-view-sort-direction" value={config.sortDirection} onChange={(event) => onConfigChange({ sortDirection: event.target.value as "asc" | "desc" })}>
            <option value="asc">{t(language, "savedViews.ascending")}</option>
            <option value="desc">{t(language, "savedViews.descending")}</option>
          </select>
        </label>

        {config.activeView === "kanban" ? (
          <label>
            {t(language, "savedViews.groupBy")}
            <select data-testid="saved-view-kanban-group" value={config.kanbanGroupBy} onChange={(event) => onConfigChange({ kanbanGroupBy: event.target.value })}>
              {kanbanOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {config.activeView === "calendar" ? (
          <label>
            {t(language, "savedViews.calendarField")}
            <select data-testid="saved-view-calendar-field" value={config.calendarField} onChange={(event) => onConfigChange({ calendarField: event.target.value })}>
              {calendarOptions.map((field) => (
                <option key={field.key} value={field.key}>
                  {field.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <details className="advanced-filters" data-testid="advanced-filters">
          <summary>{t(language, "savedViews.advancedFilters")}</summary>
          <div className="advanced-filter-grid">
            <label>
              {t(language, "savedViews.vacancy")}
              <select data-testid="filter-vacancy-status" value={config.vacancyStatus} onChange={(event) => onConfigChange({ vacancyStatus: event.target.value })}>
                <option value="">{t(language, "savedViews.allVacancyStatuses")}</option>
                <option value="__vacant__">{t(language, "savedViews.vacantNotLeased")}</option>
                <option value="__vacant_leased__">{t(language, "savedViews.vacantLeased")}</option>
                <option value="__ntv__">{t(language, "savedViews.noticeToVacate")}</option>
                {Object.values(labelsByField.vacancyStatus ?? {}).filter((option) => !option.isArchived).map((option) => <option key={option.id} value={option.value}>{option.value}</option>)}
              </select>
            </label>
            <label>
              {t(language, "savedViews.assignedTech")}
              <select data-testid="filter-assigned-tech" value={config.assignedTech} onChange={(event) => onConfigChange({ assignedTech: event.target.value })}>
                <option value="">{t(language, "savedViews.allStaff")}</option>
                <option value="__unassigned__">{t(language, "savedViews.unassigned")}</option>
                {staff.map((member) => <option key={member.id} value={member.fullName}>{member.fullName}</option>)}
              </select>
            </label>
            <label>
              {t(language, "savedViews.section")}
              <select data-testid="filter-board-section" value={config.boardSection} onChange={(event) => onConfigChange({ boardSection: event.target.value })}>
                <option value="">{t(language, "savedViews.allSections")}</option>
                <option value="type:READY">{t(language, "savedViews.readyUnits")}</option>
                <option value="type:MAKE_READY">{t(language, "savedViews.makeReady")}</option>
                <option value="type:DOWN">{t(language, "savedViews.downUnits")}</option>
                <option value="type:ARCHIVE">{t(language, "savedViews.archive")}</option>
                {boardSections.map((section) => <option key={section.id} value={section.key}>{section.property.code} / {section.displayName}</option>)}
              </select>
            </label>
            <label>
              {t(language, "savedViews.property")}
              <select data-testid="filter-property-advanced" value={config.propertyId} onChange={(event) => onConfigChange({ propertyId: event.target.value })}>
                <option value="">{t(language, "nav.allProperties")}</option>
                {properties.map((property) => <option key={property.id} value={property.id}>{property.code} / {property.name}</option>)}
              </select>
            </label>
            <label>
              {t(language, "savedViews.scope")}
              <select data-testid="saved-view-scope-filter" value={config.scopeLevel} onChange={(event) => onConfigChange({ scopeLevel: event.target.value })}>
                <option value="">{t(language, "savedViews.allScopes")}</option>
                {Object.values(labelsByField.scopeLevel ?? {}).filter((option) => !option.isArchived).map((option) => <option key={option.id} value={option.value}>{option.value}</option>)}
              </select>
            </label>
            <label>
              {t(language, "savedViews.makeReadyStatus")}
              <select data-testid="filter-make-ready-status" value={config.makeReadyStatus} onChange={(event) => onConfigChange({ makeReadyStatus: event.target.value })}>
                <option value="">{t(language, "savedViews.allMakeReadyStatuses")}</option>
                {Object.values(labelsByField.makeReadyStatus ?? {}).filter((option) => !option.isArchived).map((option) => <option key={option.id} value={option.value}>{option.value}</option>)}
              </select>
            </label>
            <label>
              {t(language, "savedViews.moveInWindow")}
              <select data-testid="filter-move-in-window" value={config.moveInWindow} onChange={(event) => onConfigChange({ moveInWindow: event.target.value as MoveInWindowFilter })}>
                <option value="">{t(language, "savedViews.anyDate")}</option>
                <option value="week">{t(language, "savedViews.thisWeek")}</option>
                <option value="7">{t(language, "savedViews.next7Days")}</option>
                <option value="14">{t(language, "savedViews.next14Days")}</option>
              </select>
            </label>
            <label>
              {t(language, "savedViews.archiveState")}
              <select data-testid="filter-archive-state" value={config.archiveState} onChange={(event) => onConfigChange({ archiveState: event.target.value as ArchiveFilter })}>
                <option value="active">{t(language, "savedViews.activeItems")}</option>
                <option value="archived">{t(language, "savedViews.archivedItems")}</option>
                <option value="occupied">{t(language, "savedViews.occupied")}</option>
                <option value="all">{t(language, "savedViews.activeAndArchived")}</option>
              </select>
            </label>
          </div>
          <div className="advanced-filter-flags">
            <label className="toggle-row"><input data-testid="filter-overdueOnly" type="checkbox" checked={config.overdueOnly} onChange={(event) => onConfigChange({ overdueOnly: event.target.checked })} />{t(language, "savedViews.overdue")}</label>
            <label className="toggle-row"><input data-testid="filter-missingDatesOnly" type="checkbox" checked={config.missingDatesOnly} onChange={(event) => onConfigChange({ missingDatesOnly: event.target.checked })} />{t(language, "savedViews.missingDates")}</label>
            <label className="toggle-row"><input data-testid="filter-pestIssuesOnly" type="checkbox" checked={config.pestIssuesOnly} onChange={(event) => onConfigChange({ pestIssuesOnly: event.target.checked })} />{t(language, "savedViews.pestIssues")}</label>
            <label className="toggle-row"><input data-testid="filter-flooringNeededOnly" type="checkbox" checked={config.flooringNeededOnly} onChange={(event) => onConfigChange({ flooringNeededOnly: event.target.checked })} />{t(language, "savedViews.flooringNeeded")}</label>
            <label className="toggle-row"><input data-testid="filter-paintNeededOnly" type="checkbox" checked={config.paintNeededOnly} onChange={(event) => onConfigChange({ paintNeededOnly: event.target.checked })} />{t(language, "savedViews.paintNeeded")}</label>
            <label className="toggle-row"><input data-testid="filter-moveInRiskOnly" type="checkbox" checked={config.moveInRiskOnly} onChange={(event) => onConfigChange({ moveInRiskOnly: event.target.checked })} />{t(language, "savedViews.moveInRisk")}</label>
          </div>
          <div className="advanced-filter-grid">
            <label>
              {t(language, "savedViews.riskLevel")}
              <select data-testid="filter-risk-level" value={config.riskLevel} onChange={(event) => onConfigChange({ riskLevel: event.target.value })}>
                <option value="">{t(language, "savedViews.anyRisk")}</option>
                <option value="CRITICAL">{t(language, "savedViews.critical")}</option>
                <option value="HIGH">{t(language, "savedViews.high")}</option>
                <option value="MEDIUM">{t(language, "savedViews.medium")}</option>
                <option value="LOW">{t(language, "savedViews.low")}</option>
                <option value="NONE">{t(language, "savedViews.none")}</option>
              </select>
            </label>
            <label>
              {t(language, "savedViews.riskCategory")}
              <select data-testid="filter-risk-category" value={config.riskCategory} onChange={(event) => onConfigChange({ riskCategory: event.target.value })}>
                <option value="">{t(language, "savedViews.anyCategory")}</option>
                <option value="MOVE_IN_RISK">{t(language, "savedViews.moveInRisk")}</option>
                <option value="OVERDUE_MAKE_READY">{t(language, "savedViews.overdueMakeReady")}</option>
                <option value="MISSING_CRITICAL_DATES">{t(language, "savedViews.missingDates")}</option>
                <option value="UNASSIGNED_WORK">{t(language, "savedViews.unassignedWork")}</option>
                <option value="PEST_RISK">{t(language, "savedViews.pestRisk")}</option>
                <option value="FLOORING_RISK">{t(language, "savedViews.flooringRisk")}</option>
                <option value="PAINT_RISK">{t(language, "savedViews.paintRisk")}</option>
                <option value="CHECKLIST_RISK">{t(language, "savedViews.checklistRisk")}</option>
                <option value="STALE_ACTIVITY">Stale activity</option>
                <option value="DATE_CONFLICT">Date conflict</option>
                <option value="PROPERTY_WORKLOAD">Aging turn</option>
              </select>
            </label>
          </div>
          <section className="custom-filter-section" data-testid="saved-view-custom-field-filters">
            <header>
              <strong>{t(language, "savedViews.customFields")}</strong>
              <span>{tWithVars(language, "savedViews.appliedCount", { count: config.customFieldFilters.length })}</span>
            </header>
            {config.customFieldFilters.map((filter) => {
              const field = activeCustomFields.find((entry) => entry.id === filter.fieldId);
              if (!field) return null;
              const needsValue = !["empty", "notEmpty", "isTrue", "isFalse", "overdue"].includes(filter.operator);
              return (
                <div className="custom-filter-row" data-testid={`saved-view-custom-filter-row-${field.fieldKey}`} key={field.id}>
                  <strong title={field.label}>{field.label}</strong>
                  <select data-testid={`saved-view-custom-filter-operator-${field.fieldKey}`} value={filter.operator} onChange={(event) => updateCustomFilter(field.id, { ...defaultCustomFilterFor(field), operator: event.target.value as CustomFieldFilter["operator"] })} aria-label={tWithVars(language, "savedViews.operatorFor", { label: field.label })}>
                    {customOperatorsByType[field.fieldType].map((operator) => <option key={operator.value} value={operator.value}>{operator.label}</option>)}
                  </select>
                  {needsValue && (field.fieldType === "SINGLE_SELECT" || field.fieldType === "MULTI_SELECT") ? (
                    <select data-testid={`saved-view-custom-filter-value-${field.fieldKey}`} value={String(filter.value ?? "")} onChange={(event) => updateCustomFilter(field.id, { value: event.target.value })} aria-label={tWithVars(language, "savedViews.valueFor", { label: field.label })}>
                      <option value="">{t(language, "savedViews.selectOption")}</option>
                      {field.options.filter((option) => !option.isArchived).map((option) => <option key={option.id} value={option.label}>{option.label}</option>)}
                    </select>
                  ) : needsValue && field.fieldType === "USER" ? (
                    <select data-testid={`saved-view-custom-filter-value-${field.fieldKey}`} value={String(filter.value ?? "")} onChange={(event) => updateCustomFilter(field.id, { value: event.target.value })} aria-label={tWithVars(language, "savedViews.valueFor", { label: field.label })}>
                      <option value="">{t(language, "savedViews.selectStaff")}</option>
                      {staff.map((member) => <option key={member.id} value={member.id}>{member.fullName}</option>)}
                    </select>
                  ) : needsValue ? (
                    <div className="custom-filter-operands">
                      <input
                        data-testid={`saved-view-custom-filter-value-${field.fieldKey}`}
                        type={field.fieldType === "DATE" && filter.operator !== "withinNextDays" ? "date" : field.fieldType === "NUMBER" || filter.operator === "withinNextDays" ? "number" : "text"}
                        value={String(filter.value ?? "")}
                        onChange={(event) => updateCustomFilter(field.id, { value: field.fieldType === "NUMBER" || filter.operator === "withinNextDays" ? Number(event.target.value) : event.target.value })}
                        aria-label={tWithVars(language, "savedViews.valueFor", { label: field.label })}
                      />
                      {filter.operator === "between" ? (
                        <input data-testid={`saved-view-custom-filter-value-to-${field.fieldKey}`} type="date" value={filter.valueTo ?? ""} onChange={(event) => updateCustomFilter(field.id, { valueTo: event.target.value })} aria-label={tWithVars(language, "savedViews.endValueFor", { label: field.label })} />
                      ) : null}
                    </div>
                  ) : <span className="custom-filter-no-value">{t(language, "savedViews.noValueNeeded")}</span>}
                  <button type="button" className="icon-button custom-filter-remove" data-testid={`saved-view-custom-filter-remove-${field.fieldKey}`} aria-label={tWithVars(language, "savedViews.removeFilter", { label: field.label })} onClick={() => onConfigChange({ customFieldFilters: config.customFieldFilters.filter((entry) => entry.fieldId !== field.id) })}>&times;</button>
                </div>
              );
            })}
            {activeCustomFields.length === 0 ? <p className="empty-copy">{t(language, "savedViews.noActiveCustomFields")}</p> : (
              <div className="custom-filter-add">
                <select data-testid="saved-view-custom-filter-field-add" value={customFieldToAdd} onChange={(event) => setCustomFieldToAdd(event.target.value)} aria-label={t(language, "savedViews.chooseCustomField")}>
                  <option value="">{t(language, "savedViews.addCustomFieldFilter")}</option>
                  {availableCustomFields.map((field) => <option key={field.id} value={field.id}>{field.label}</option>)}
                </select>
                <button type="button" className="button button-secondary" data-testid="saved-view-custom-filter-add" disabled={!customFieldToAdd} onClick={() => {
                  const field = activeCustomFields.find((entry) => entry.id === customFieldToAdd);
                  if (field) onConfigChange({ customFieldFilters: [...config.customFieldFilters, defaultCustomFilterFor(field)] });
                  setCustomFieldToAdd("");
                }}>{t(language, "savedViews.add")}</button>
              </div>
            )}
          </section>
        </details>

        {config.activeView === "table" ? (
          <details className="column-visibility" data-testid="visible-columns-panel">
            <summary className="column-visibility-heading">
              <strong>{t(language, "savedViews.visibleColumns")}</strong>
              <small>{activeColumnKeys.length}/{columnOptions.length}</small>
            </summary>
            <div className="column-presets" aria-label={t(language, "savedViews.columnPresets")}>
              {tableColumnPresets.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  className="column-preset"
                  data-testid={`visible-column-preset-${preset.key}`}
                  onClick={() => applyColumnPreset(preset.key)}
                >
                  {preset.label}
                </button>
              ))}
              <button type="button" className="column-preset" data-testid="visible-column-preset-full" onClick={() => applyColumnPreset("full")}>{t(language, "savedViews.full")}</button>
              <button type="button" className="column-preset" data-testid="visible-column-reset-order" onClick={() => onConfigChange({ visibleColumns: null })}>{t(language, "savedViews.resetOrder")}</button>
            </div>
            <div className="column-choice-list">
              {orderedColumnOptions.map((column, index) => (
                <div className={column.required ? "column-choice required" : "column-choice"} key={column.key}>
                  <input
                    type="checkbox"
                    data-testid={`visible-column-${column.key.replace(/[^a-zA-Z0-9-]/g, "-")}`}
                    checked={activeColumnSet.has(column.key)}
                    disabled={column.required}
                    onChange={(event) => {
                      const next = new Set(activeColumnKeys);
                      if (event.target.checked) next.add(column.key);
                      else next.delete(column.key);
                      onConfigChange({ visibleColumns: Array.from(next) });
                    }}
                  />
                  {column.custom || !canConfigureColumns ? <span>{column.label}</span> : (
                    <input
                      className="column-label-input"
                      data-testid={`column-label-${column.key}`}
                      value={config.columnLabels[column.key] ?? column.label}
                      onChange={(event) => onConfigChange({ columnLabels: { ...config.columnLabels, [column.key]: event.target.value } })}
                      onBlur={(event) => void onRenameColumn(column.key, event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void onRenameColumn(column.key, event.currentTarget.value);
                      }}
                      aria-label={tWithVars(language, "savedViews.displayNameFor", { label: column.key })}
                    />
                  )}
                  {column.custom ? <small>{t(language, "savedViews.custom")}</small> : null}
                  {column.required ? <small>{t(language, "savedViews.required")}</small> : null}
                  <button type="button" data-testid={`column-up-${column.key}`} className="icon-button" disabled={!activeColumnSet.has(column.key) || activeColumnKeys.indexOf(column.key) === 0} onClick={() => moveColumn(column.key, -1)} aria-label={tWithVars(language, "savedViews.moveUp", { label: column.label })}>↑</button>
                  <button type="button" data-testid={`column-down-${column.key}`} className="icon-button" disabled={!activeColumnSet.has(column.key) || activeColumnKeys.indexOf(column.key) === activeColumnKeys.length - 1} onClick={() => moveColumn(column.key, 1)} aria-label={tWithVars(language, "savedViews.moveDown", { label: column.label })}>↓</button>
                </div>
              ))}
            </div>
            <p className="column-visibility-note">{t(language, "savedViews.itemAlwaysVisible")}</p>
          </details>
        ) : null}
      </div>

      <div className="saved-view-list">
        {loading ? (
          <StatusState
            title={t(language, "savedViews.loadingTitle")}
            description={t(language, "savedViews.loadingCopy")}
            tone="subtle"
          />
        ) : views.length === 0 ? (
          <StatusState
            title={t(language, "savedViews.emptyTitle")}
            description={t(language, "savedViews.emptyCopy")}
            tone="subtle"
          />
        ) : (
          views.map((view) => (
            <button
              key={view.id}
              data-testid={`saved-view-item-${view.id}`}
            className={selectedViewId === view.id ? "saved-view active" : "saved-view"}
            onClick={() => {
              setSelectedViewId(view.id);
              setViewName(view.name);
              setShared(view.isShared);
              if (!view.isArchived) {
                onApplyView(view);
              }
            }}
          >
              <span className="saved-view-copy">
                <strong>{view.name}</strong>
                <small>{view.viewType.toUpperCase()}</small>
              </span>
              <span className="saved-view-badges">
                <small className={view.isShared ? "saved-view-badge shared" : "saved-view-badge"}>
                  {view.isShared ? t(language, "savedViews.shared") : t(language, "savedViews.personal")}
                </small>
                {view.isArchived ? (
                  <small className="saved-view-badge archived">{t(language, "savedViews.archived")}</small>
                ) : null}
              </span>
            </button>
          ))
        )}
      </div>

      <div className="saved-view-settings">
        <label>
          {t(language, "savedViews.viewName")}
          <input data-testid="saved-view-name-input" value={viewName} onChange={(event) => setViewName(event.target.value)} placeholder={t(language, "savedViews.viewName")} disabled={!canCreate} />
        </label>

        {canShare ? (
          <label className="toggle-row">
            <input data-testid="saved-view-shared-toggle" type="checkbox" checked={shared} onChange={(event) => setShared(event.target.checked)} disabled={!canCreate} />
            {t(language, "savedViews.sharedView")}
          </label>
        ) : null}

        <button
          data-testid="saved-view-create-button"
          className="button button-primary"
          disabled={!canCreate || !viewName.trim()}
          onClick={async () => {
            await onCreateView({ name: viewName.trim(), isShared: shared });
            setViewName("");
            setShared(false);
          }}
        >
          {t(language, "savedViews.saveCurrent")}
        </button>

        {selectedView && canManageSelected ? (
          <>
            <div className="saved-view-selected">
              <span>{t(language, "savedViews.selectedView")}</span>
              <strong>{selectedView.name}</strong>
            </div>
            {canShare ? (
              <label className="toggle-row">
                <input
                  data-testid="saved-view-selected-shared-toggle"
                  type="checkbox"
                  checked={shared}
                  onChange={(event) => setShared(event.target.checked)}
                />
                {t(language, "savedViews.shared")}
              </label>
            ) : null}
            <button
              data-testid="saved-view-update-button"
              className="button button-secondary"
              disabled={!viewName.trim() || selectedView.isArchived}
              onClick={async () => {
                await onUpdateView(selectedView.id, { name: viewName.trim(), isShared: shared });
              }}
            >
              {t(language, "savedViews.updateSelected")}
            </button>
            {selectedView.isArchived ? (
              <>
                <p className="empty-copy">{t(language, "savedViews.archivedHint")}</p>
                <button
                  data-testid="saved-view-restore-button"
                  className="button button-secondary"
                  onClick={async () => {
                    await onRestoreView(selectedView.id);
                  }}
                >
                  {t(language, "savedViews.restoreSelected")}
                </button>
                <button
                  data-testid="saved-view-delete-button"
                  className="button button-danger"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  {t(language, "savedViews.deleteSelected")}
                </button>
              </>
            ) : (
              <button
                data-testid="saved-view-archive-button"
                className="button button-secondary"
                onClick={() => setShowArchiveConfirm(true)}
              >
                {t(language, "savedViews.archiveSelected")}
              </button>
            )}
          </>
        ) : null}
      </div>

      <ConfirmDialog
        open={showArchiveConfirm && Boolean(selectedView) && !selectedView?.isArchived}
        language={language}
        title={t(language, "savedViews.archiveTitle")}
        description={tWithVars(language, "savedViews.archiveConfirm", { name: selectedView?.name ?? t(language, "savedViews.title").toLowerCase() })}
        confirmLabel={t(language, "savedViews.archiveLabel")}
        onClose={() => setShowArchiveConfirm(false)}
        onConfirm={async () => {
          if (!selectedView) {
            return;
          }
          await onArchiveView(selectedView.id);
          setShowArchiveConfirm(false);
        }}
      />

      <ConfirmDialog
        open={showDeleteConfirm && Boolean(selectedView)}
        language={language}
        title={t(language, "savedViews.deleteTitle")}
        description={tWithVars(language, "savedViews.deleteConfirm", { name: selectedView?.name ?? t(language, "savedViews.title").toLowerCase() })}
        confirmLabel={t(language, "savedViews.deleteLabel")}
        tone="danger"
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={async () => {
          if (!selectedView) {
            return;
          }
          await onDeleteView(selectedView.id);
          setSelectedViewId("");
          setViewName("");
          setShared(false);
          setShowArchiveConfirm(false);
          setShowDeleteConfirm(false);
        }}
      />
    </section>
  );
}
