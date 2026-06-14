import { useEffect, useMemo, useState } from "react";
import type { BoardSection, CustomField, LabelDefinition, Property, SavedView, StaffOption, UserRole } from "../lib/api";
import { customOperatorsByType, defaultCustomFilterFor, type ArchiveFilter, type CustomFieldFilter, type MoveInWindowFilter } from "../lib/structuredFilters";
import { sortOptions, tableColumnPresets, type VisibleColumnOption } from "../lib/board";
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
  onDeleteView,
  onConfigChange,
  onRenameColumn,
}: Props) {
  const [viewName, setViewName] = useState("");
  const [shared, setShared] = useState(false);
  const [selectedViewId, setSelectedViewId] = useState("");
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
      <h2>Saved Views</h2>

      <div className="saved-view-settings">
        <label>
          View Type
          <select data-testid="saved-view-type" value={config.activeView} onChange={(event) => onConfigChange({ activeView: event.target.value as AppView })}>
            <option value="table">Table</option>
            <option value="kanban">Kanban</option>
            <option value="calendar">Calendar</option>
            <option value="dashboard">Dashboard</option>
          </select>
        </label>

        <label>
          Sort
          <select data-testid="saved-view-sort-key" value={config.sortKey} onChange={(event) => onConfigChange({ sortKey: event.target.value })}>
            {sortOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Direction
          <select data-testid="saved-view-sort-direction" value={config.sortDirection} onChange={(event) => onConfigChange({ sortDirection: event.target.value as "asc" | "desc" })}>
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </label>

        {config.activeView === "kanban" ? (
          <label>
            Group By
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
            Calendar Field
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
          <summary>Advanced filters</summary>
          <div className="advanced-filter-grid">
            <label>
              Vacancy
              <select data-testid="filter-vacancy-status" value={config.vacancyStatus} onChange={(event) => onConfigChange({ vacancyStatus: event.target.value })}>
                <option value="">All vacancy statuses</option>
                <option value="__vacant__">Vacant not leased</option>
                <option value="__vacant_leased__">Vacant leased</option>
                <option value="__ntv__">NTV / Notice to Vacate</option>
                {Object.values(labelsByField.vacancyStatus ?? {}).filter((option) => !option.isArchived).map((option) => <option key={option.id} value={option.value}>{option.value}</option>)}
              </select>
            </label>
            <label>
              Assigned Tech
              <select data-testid="filter-assigned-tech" value={config.assignedTech} onChange={(event) => onConfigChange({ assignedTech: event.target.value })}>
                <option value="">All staff</option>
                <option value="__unassigned__">Unassigned</option>
                {staff.map((member) => <option key={member.id} value={member.fullName}>{member.fullName}</option>)}
              </select>
            </label>
            <label>
              Section
              <select data-testid="filter-board-section" value={config.boardSection} onChange={(event) => onConfigChange({ boardSection: event.target.value })}>
                <option value="">All sections</option>
                <option value="type:READY">Ready Units</option>
                <option value="type:MAKE_READY">Make Ready</option>
                <option value="type:DOWN">Down Units</option>
                <option value="type:ARCHIVE">Archive</option>
                {boardSections.map((section) => <option key={section.id} value={section.key}>{section.property.code} / {section.displayName}</option>)}
              </select>
            </label>
            <label>
              Property
              <select data-testid="filter-property-advanced" value={config.propertyId} onChange={(event) => onConfigChange({ propertyId: event.target.value })}>
                <option value="">All properties</option>
                {properties.map((property) => <option key={property.id} value={property.id}>{property.code} / {property.name}</option>)}
              </select>
            </label>
            <label>
              Scope
              <select data-testid="saved-view-scope-filter" value={config.scopeLevel} onChange={(event) => onConfigChange({ scopeLevel: event.target.value })}>
                <option value="">All scopes</option>
                {Object.values(labelsByField.scopeLevel ?? {}).filter((option) => !option.isArchived).map((option) => <option key={option.id} value={option.value}>{option.value}</option>)}
              </select>
            </label>
            <label>
              Make Ready Status
              <select data-testid="filter-make-ready-status" value={config.makeReadyStatus} onChange={(event) => onConfigChange({ makeReadyStatus: event.target.value })}>
                <option value="">All make-ready statuses</option>
                {Object.values(labelsByField.makeReadyStatus ?? {}).filter((option) => !option.isArchived).map((option) => <option key={option.id} value={option.value}>{option.value}</option>)}
              </select>
            </label>
            <label>
              Move-In Window
              <select data-testid="filter-move-in-window" value={config.moveInWindow} onChange={(event) => onConfigChange({ moveInWindow: event.target.value as MoveInWindowFilter })}>
                <option value="">Any date</option>
                <option value="week">This week</option>
                <option value="7">Next 7 days</option>
                <option value="14">Next 14 days</option>
              </select>
            </label>
            <label>
              Archive State
              <select data-testid="filter-archive-state" value={config.archiveState} onChange={(event) => onConfigChange({ archiveState: event.target.value as ArchiveFilter })}>
                <option value="active">Active items</option>
                <option value="archived">Archived items</option>
                <option value="occupied">Occupied</option>
                <option value="all">Active + archived</option>
              </select>
            </label>
          </div>
          <div className="advanced-filter-flags">
            <label className="toggle-row"><input data-testid="filter-overdueOnly" type="checkbox" checked={config.overdueOnly} onChange={(event) => onConfigChange({ overdueOnly: event.target.checked })} />Overdue</label>
            <label className="toggle-row"><input data-testid="filter-missingDatesOnly" type="checkbox" checked={config.missingDatesOnly} onChange={(event) => onConfigChange({ missingDatesOnly: event.target.checked })} />Missing dates</label>
            <label className="toggle-row"><input data-testid="filter-pestIssuesOnly" type="checkbox" checked={config.pestIssuesOnly} onChange={(event) => onConfigChange({ pestIssuesOnly: event.target.checked })} />Pest issues</label>
            <label className="toggle-row"><input data-testid="filter-flooringNeededOnly" type="checkbox" checked={config.flooringNeededOnly} onChange={(event) => onConfigChange({ flooringNeededOnly: event.target.checked })} />Flooring needed</label>
            <label className="toggle-row"><input data-testid="filter-paintNeededOnly" type="checkbox" checked={config.paintNeededOnly} onChange={(event) => onConfigChange({ paintNeededOnly: event.target.checked })} />Paint needed</label>
            <label className="toggle-row"><input data-testid="filter-moveInRiskOnly" type="checkbox" checked={config.moveInRiskOnly} onChange={(event) => onConfigChange({ moveInRiskOnly: event.target.checked })} />Move-in risk</label>
          </div>
          <div className="advanced-filter-grid">
            <label>
              Risk Level
              <select data-testid="filter-risk-level" value={config.riskLevel} onChange={(event) => onConfigChange({ riskLevel: event.target.value })}>
                <option value="">Any risk</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
                <option value="NONE">None</option>
              </select>
            </label>
            <label>
              Risk Category
              <select data-testid="filter-risk-category" value={config.riskCategory} onChange={(event) => onConfigChange({ riskCategory: event.target.value })}>
                <option value="">Any category</option>
                <option value="MOVE_IN_RISK">Move-in risk</option>
                <option value="OVERDUE_MAKE_READY">Overdue make-ready</option>
                <option value="MISSING_CRITICAL_DATES">Missing dates</option>
                <option value="UNASSIGNED_WORK">Unassigned work</option>
                <option value="PEST_RISK">Pest risk</option>
                <option value="FLOORING_RISK">Flooring risk</option>
                <option value="PAINT_RISK">Paint risk</option>
                <option value="CHECKLIST_RISK">Checklist risk</option>
                <option value="STALE_ACTIVITY">Stale activity</option>
                <option value="DATE_CONFLICT">Date conflict</option>
                <option value="PROPERTY_WORKLOAD">Aging turn</option>
              </select>
            </label>
          </div>
          <section className="custom-filter-section" data-testid="saved-view-custom-field-filters">
            <header>
              <strong>Custom fields</strong>
              <span>{config.customFieldFilters.length} applied</span>
            </header>
            {config.customFieldFilters.map((filter) => {
              const field = activeCustomFields.find((entry) => entry.id === filter.fieldId);
              if (!field) return null;
              const needsValue = !["empty", "notEmpty", "isTrue", "isFalse", "overdue"].includes(filter.operator);
              return (
                <div className="custom-filter-row" data-testid={`saved-view-custom-filter-row-${field.fieldKey}`} key={field.id}>
                  <strong title={field.label}>{field.label}</strong>
                  <select data-testid={`saved-view-custom-filter-operator-${field.fieldKey}`} value={filter.operator} onChange={(event) => updateCustomFilter(field.id, { ...defaultCustomFilterFor(field), operator: event.target.value as CustomFieldFilter["operator"] })} aria-label={`Operator for ${field.label}`}>
                    {customOperatorsByType[field.fieldType].map((operator) => <option key={operator.value} value={operator.value}>{operator.label}</option>)}
                  </select>
                  {needsValue && (field.fieldType === "SINGLE_SELECT" || field.fieldType === "MULTI_SELECT") ? (
                    <select data-testid={`saved-view-custom-filter-value-${field.fieldKey}`} value={String(filter.value ?? "")} onChange={(event) => updateCustomFilter(field.id, { value: event.target.value })} aria-label={`Value for ${field.label}`}>
                      <option value="">Select option</option>
                      {field.options.filter((option) => !option.isArchived).map((option) => <option key={option.id} value={option.label}>{option.label}</option>)}
                    </select>
                  ) : needsValue && field.fieldType === "USER" ? (
                    <select data-testid={`saved-view-custom-filter-value-${field.fieldKey}`} value={String(filter.value ?? "")} onChange={(event) => updateCustomFilter(field.id, { value: event.target.value })} aria-label={`Value for ${field.label}`}>
                      <option value="">Select staff</option>
                      {staff.map((member) => <option key={member.id} value={member.id}>{member.fullName}</option>)}
                    </select>
                  ) : needsValue ? (
                    <div className="custom-filter-operands">
                      <input
                        data-testid={`saved-view-custom-filter-value-${field.fieldKey}`}
                        type={field.fieldType === "DATE" && filter.operator !== "withinNextDays" ? "date" : field.fieldType === "NUMBER" || filter.operator === "withinNextDays" ? "number" : "text"}
                        value={String(filter.value ?? "")}
                        onChange={(event) => updateCustomFilter(field.id, { value: field.fieldType === "NUMBER" || filter.operator === "withinNextDays" ? Number(event.target.value) : event.target.value })}
                        aria-label={`Value for ${field.label}`}
                      />
                      {filter.operator === "between" ? (
                        <input data-testid={`saved-view-custom-filter-value-to-${field.fieldKey}`} type="date" value={filter.valueTo ?? ""} onChange={(event) => updateCustomFilter(field.id, { valueTo: event.target.value })} aria-label={`End value for ${field.label}`} />
                      ) : null}
                    </div>
                  ) : <span className="custom-filter-no-value">No value needed</span>}
                  <button type="button" className="icon-button custom-filter-remove" data-testid={`saved-view-custom-filter-remove-${field.fieldKey}`} aria-label={`Remove ${field.label} filter`} onClick={() => onConfigChange({ customFieldFilters: config.customFieldFilters.filter((entry) => entry.fieldId !== field.id) })}>&times;</button>
                </div>
              );
            })}
            {activeCustomFields.length === 0 ? <p className="empty-copy">No active custom fields are available for filtering.</p> : (
              <div className="custom-filter-add">
                <select data-testid="saved-view-custom-filter-field-add" value={customFieldToAdd} onChange={(event) => setCustomFieldToAdd(event.target.value)} aria-label="Choose custom field to filter">
                  <option value="">Add custom-field filter</option>
                  {availableCustomFields.map((field) => <option key={field.id} value={field.id}>{field.label}</option>)}
                </select>
                <button type="button" className="button button-secondary" data-testid="saved-view-custom-filter-add" disabled={!customFieldToAdd} onClick={() => {
                  const field = activeCustomFields.find((entry) => entry.id === customFieldToAdd);
                  if (field) onConfigChange({ customFieldFilters: [...config.customFieldFilters, defaultCustomFilterFor(field)] });
                  setCustomFieldToAdd("");
                }}>Add</button>
              </div>
            )}
          </section>
        </details>

        {config.activeView === "table" ? (
          <details className="column-visibility" data-testid="visible-columns-panel">
            <summary className="column-visibility-heading">
              <strong>Visible Columns</strong>
              <small>{activeColumnKeys.length}/{columnOptions.length}</small>
            </summary>
            <div className="column-presets" aria-label="Column presets">
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
              <button type="button" className="column-preset" data-testid="visible-column-preset-full" onClick={() => applyColumnPreset("full")}>Full</button>
              <button type="button" className="column-preset" data-testid="visible-column-reset-order" onClick={() => onConfigChange({ visibleColumns: null })}>Reset Order</button>
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
                      aria-label={`Display name for ${column.key}`}
                    />
                  )}
                  {column.custom ? <small>Custom</small> : null}
                  {column.required ? <small>Required</small> : null}
                  <button type="button" data-testid={`column-up-${column.key}`} className="icon-button" disabled={!activeColumnSet.has(column.key) || activeColumnKeys.indexOf(column.key) === 0} onClick={() => moveColumn(column.key, -1)} aria-label={`Move ${column.label} up`}>↑</button>
                  <button type="button" data-testid={`column-down-${column.key}`} className="icon-button" disabled={!activeColumnSet.has(column.key) || activeColumnKeys.indexOf(column.key) === activeColumnKeys.length - 1} onClick={() => moveColumn(column.key, 1)} aria-label={`Move ${column.label} down`}>↓</button>
                </div>
              ))}
            </div>
            <p className="column-visibility-note">Item remains visible so rows are always identifiable.</p>
          </details>
        ) : null}
      </div>

      <div className="saved-view-list">
        {loading ? (
          <StatusState
            title="Loading saved views"
            description="Fetching your personal and shared board presets."
            tone="subtle"
          />
        ) : views.length === 0 ? (
          <StatusState
            title="No saved views yet"
            description="Save the current board setup to keep common operational slices one click away."
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
                onApplyView(view);
              }}
            >
              <span className="saved-view-copy">
                <strong>{view.name}</strong>
                <small>{view.viewType.toUpperCase()}</small>
              </span>
              <small className={view.isShared ? "saved-view-badge shared" : "saved-view-badge"}>
                {view.isShared ? "Shared" : "Personal"}
              </small>
            </button>
          ))
        )}
      </div>

      <div className="saved-view-settings">
        <label>
          View name
          <input data-testid="saved-view-name-input" value={viewName} onChange={(event) => setViewName(event.target.value)} placeholder="View name" disabled={!canCreate} />
        </label>

        {canShare ? (
          <label className="toggle-row">
            <input data-testid="saved-view-shared-toggle" type="checkbox" checked={shared} onChange={(event) => setShared(event.target.checked)} disabled={!canCreate} />
            Shared View
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
          Save Current View
        </button>

        {selectedView && canManageSelected ? (
          <>
            <div className="saved-view-selected">
              <span>Selected view</span>
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
                Shared
              </label>
            ) : null}
            <button
              data-testid="saved-view-update-button"
              className="button button-secondary"
              disabled={!viewName.trim()}
              onClick={async () => {
                await onUpdateView(selectedView.id, { name: viewName.trim(), isShared: shared });
              }}
            >
              Update Selected View
            </button>
            <button
              data-testid="saved-view-delete-button"
              className="button button-danger"
              onClick={() => setShowDeleteConfirm(true)}
            >
              Delete Selected View
            </button>
          </>
        ) : null}
      </div>

      <ConfirmDialog
        open={showDeleteConfirm && Boolean(selectedView)}
        title="Delete saved view"
        description={`Delete ${selectedView?.name ?? "this saved view"}? This removes it from saved view lists for anyone who can access it.`}
        confirmLabel="Delete view"
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
          setShowDeleteConfirm(false);
        }}
      />
    </section>
  );
}
