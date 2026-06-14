import { useMemo, useState } from "react";
import type { BoardColumnDefinition, CustomField, LabelDefinition, MakeReadyItem, Property } from "../lib/api";
import { configuredBoardColumns, customColumnKey } from "../lib/board";
import { formatDateDisplay } from "../lib/dateTime";
import { LabelPill } from "./LabelPill";

type GroupKey = string;

type Props = {
  items: MakeReadyItem[];
  groupBy: GroupKey;
  properties: Property[];
  labelsByField: Record<string, Record<string, LabelDefinition>>;
  customFields: CustomField[];
  columnDefinitions: BoardColumnDefinition[];
  canEditField: (item: MakeReadyItem, key: string) => boolean;
  onMove: (id: string, data: Record<string, unknown>) => Promise<void>;
  onOpenItem: (id: string) => void;
  colorBy: string;
  cardFields: string[];
  sortBy: string;
  hideEmpty: boolean;
  groupOptions: Array<{ key: string; label: string }>;
  selectedPropertyId: string;
  onPropertyChange: (id: string) => void;
  onConfigChange: (next: { groupBy?: string; colorBy?: string; cardFields?: string[]; sortBy?: string; hideEmpty?: boolean }) => void;
};

const EMPTY_KEY = "__empty__";

function floorPlanLabel(plan: { code: string; name: string }) {
  return plan.name && plan.name !== plan.code ? `${plan.code} - ${plan.name}` : plan.code;
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "empty";
}

function valueForGroup(item: MakeReadyItem, groupBy: GroupKey) {
  if (groupBy === "property") {
    return item.property.code;
  }

  if (groupBy === "floorPlan") return item.unit?.floorPlanRecord ? floorPlanLabel(item.unit.floorPlanRecord) : item.floorPlan ?? "";
  if (groupBy.startsWith("custom:")) {
    const value = item.customFieldValues.find((entry) => entry.customFieldId === groupBy.slice(7))?.value;
    return Array.isArray(value) ? value.join(", ") : String(value ?? "");
  }
  const value = item[groupBy as keyof MakeReadyItem];
  return typeof value === "string" ? value.slice(0, 10) : String(value ?? "");
}

function titleForColumn(groupBy: GroupKey, key: string) {
  if (key === EMPTY_KEY) {
    return groupBy === "assignedTech" ? "Unassigned" : "Unset";
  }
  return key;
}

function labelForGroup(labelsByField: Record<string, Record<string, LabelDefinition>>, groupBy: GroupKey, key: string) {
  if (key === EMPTY_KEY || groupBy === "assignedTech" || groupBy === "property" || groupBy === "floorPlan" || groupBy.startsWith("custom:")) {
    return undefined;
  }
  return labelsByField[groupBy]?.[key];
}

function valueForField(item: MakeReadyItem, key: string) {
  return key.startsWith("custom:")
    ? item.customFieldValues.find((value) => value.customFieldId === key.slice(7))?.value
    : item[key as keyof MakeReadyItem];
}

export function KanbanBoard({ items, groupBy, properties, labelsByField, customFields, columnDefinitions, canEditField, onMove, onOpenItem, colorBy, cardFields, sortBy, hideEmpty, groupOptions, selectedPropertyId, onPropertyChange, onConfigChange }: Props) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [activeColumn, setActiveColumn] = useState<string | null>(null);

  const columns = useMemo(() => {
    if (groupBy === "property") {
      return properties.map((property) => property.code);
    }

    if (groupBy === "assignedTech") {
      const techs = Array.from(new Set(items.map((item) => item.assignedTech?.trim()).filter(Boolean))) as string[];
      return [...techs.sort((a, b) => a.localeCompare(b)), EMPTY_KEY];
    }

    if (groupBy.startsWith("custom:")) {
      const field = customFields.find((entry) => entry.id === groupBy.slice(7));
      const active = field?.options.filter((option) => !option.isArchived).sort((a, b) => a.sortOrder - b.sortOrder).map((option) => option.label) ?? [];
      const historical = items.map((item) => valueForGroup(item, groupBy)).filter((value) => value && !active.includes(value));
      return [...active, ...Array.from(new Set(historical)), EMPTY_KEY];
    }
    if (!labelsByField[groupBy]) {
      return [...Array.from(new Set(items.map((item) => valueForGroup(item, groupBy)).filter(Boolean))).sort(), EMPTY_KEY];
    }
    const activeLabelKeys = Object.values(labelsByField[groupBy] ?? {})
      .filter((label) => !label.isArchived)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((label) => label.value);
    const historicalKeys = items
      .map((item) => valueForGroup(item, groupBy))
      .filter((value) => value && !activeLabelKeys.includes(value));

    return [...activeLabelKeys, ...Array.from(new Set(historicalKeys)), EMPTY_KEY];
  }, [customFields, groupBy, items, labelsByField, properties]);

  const grouped = useMemo(() => {
    const next = Object.fromEntries(columns.map((column) => [column, [] as MakeReadyItem[]]));
    for (const item of items) {
      const value = valueForGroup(item, groupBy);
      const key = value || EMPTY_KEY;
      next[key] ??= [];
      next[key].push(item);
    }
    return next;
  }, [columns, groupBy, items]);

  const groupField = groupBy === "property" || groupBy === "floorPlan" || groupBy.startsWith("custom:") || groupBy.toLowerCase().includes("date") ? null : groupBy;
  const configuredColumns = useMemo(() => configuredBoardColumns(columnDefinitions), [columnDefinitions]);
  const customFieldsById = useMemo(() => new Map(customFields.map((field) => [field.id, field])), [customFields]);
  const colorOptions = useMemo(() => [
    ...configuredColumns.filter((column) => column.type === "label").map((column) => ({ key: column.key, label: column.label })),
    ...customFields.filter((field) => !field.isArchived && field.fieldType === "SINGLE_SELECT").map((field) => ({ key: customColumnKey(field.id), label: field.label })),
  ], [configuredColumns, customFields]);
  const cardFieldOptions = useMemo(() => [
    ...configuredColumns.filter((column) => column.key !== "unitNumber" && column.key !== "notes").map((column) => [column.key, column.label] as const),
    ...customFields.filter((field) => !field.isArchived).map((field) => [customColumnKey(field.id), field.label] as const),
  ], [configuredColumns, customFields]);
  const sortFieldOptions = useMemo(() => [
    ...configuredColumns.filter((column) => column.type === "date" || ["unitNumber", "daysVacant", "applicant"].includes(column.key)).map((column) => ({ key: column.key, label: column.label })),
    ...customFields.filter((field) => !field.isArchived).map((field) => ({ key: customColumnKey(field.id), label: field.label })),
  ], [configuredColumns, customFields]);
  const colorLabel = (item: MakeReadyItem) => {
    const value = valueForField(item, colorBy);
    if (typeof value !== "string") return undefined;
    if (colorBy.startsWith("custom:")) {
      const field = customFieldsById.get(colorBy.slice(7));
      const option = field?.options.find((entry) => entry.label === value);
      return option ? { id: option.id, fieldKey: colorBy, value: option.label, color: option.color, textColor: "#ffffff", sortOrder: option.sortOrder } : undefined;
    }
    return labelsByField[colorBy]?.[value];
  };

  const renderedColumns = useMemo(() => hideEmpty ? columns.filter((column) => (grouped[column]?.length ?? 0) > 0) : columns, [columns, grouped, hideEmpty]);
  const sortedCardsByColumn = useMemo(() => Object.fromEntries(renderedColumns.map((column) => [
    column,
    [...(grouped[column] ?? [])].sort((left, right) => String(valueForField(left, sortBy) ?? "").localeCompare(String(valueForField(right, sortBy) ?? ""))),
  ])), [grouped, renderedColumns, sortBy]);
  return (
    <section className="kanban-shell" data-testid="kanban-board">
      <div className="kanban-config" data-testid="kanban-config">
        <label>Property
          <select data-testid="kanban-property-filter" value={selectedPropertyId} onChange={(event) => onPropertyChange(event.target.value)}>
            <option value="">All accessible properties</option>
            {properties.map((property) => <option key={property.id} value={property.id}>{property.code} / {property.name}</option>)}
          </select>
        </label>
        <label>Group by
          <select data-testid="kanban-group-by" value={groupBy} onChange={(event) => onConfigChange({ groupBy: event.target.value })}>
            {groupOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>
        </label>
        <label>Color by
          <select data-testid="kanban-color-by" value={colorBy} onChange={(event) => onConfigChange({ colorBy: event.target.value as Props["colorBy"] })}>
            {colorOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>
        </label>
        <label>Sort cards
          <select data-testid="kanban-sort-by" value={sortBy} onChange={(event) => onConfigChange({ sortBy: event.target.value })}>
            {sortFieldOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>
        </label>
        <label className="toggle-row"><input data-testid="kanban-hide-empty" type="checkbox" checked={hideEmpty} onChange={(event) => onConfigChange({ hideEmpty: event.target.checked })} /> Hide empty lanes</label>
        <div className="kanban-card-fields" aria-label="Card fields">
          {cardFieldOptions.map(([key, label]) => <label key={key}><input type="checkbox" checked={cardFields.includes(key)} onChange={(event) => onConfigChange({ cardFields: event.target.checked ? [...cardFields, key] : cardFields.filter((field) => field !== key) })} /> {label}</label>)}
        </div>
      </div>
      <p className="kanban-guide" data-testid="kanban-guide">Lanes group by <strong>{groupBy}</strong>; card accent and legend use <strong>{colorBy}</strong>.</p>
      {groupField === null ? (
        <div className="kanban-note">Grouping by property is view-only. Dragging between properties is disabled.</div>
      ) : null}
      <div className="kanban-grid">
        {renderedColumns.map((column) => (
          (() => {
          const isArchivedTarget = Boolean(groupField && column !== EMPTY_KEY && labelsByField[groupField]?.[column]?.isArchived);
          return (
          <div
            key={column}
            data-testid={`kanban-column-${slugify(titleForColumn(groupBy, column))}`}
            className={activeColumn === column ? "kanban-column active-drop" : "kanban-column"}
            onDragOver={(event) => {
              if (groupField && !isArchivedTarget) {
                event.preventDefault();
                setActiveColumn(column);
              }
            }}
            onDragLeave={() => setActiveColumn((current) => (current === column ? null : current))}
            onDrop={async (event) => {
              if (!groupField || !draggingId || isArchivedTarget) {
                return;
              }
              event.preventDefault();
              const dropped = items.find((item) => item.id === draggingId);
              if (!dropped || !canEditField(dropped, groupField)) {
                return;
              }
              const nextValue = column === EMPTY_KEY ? null : column;
              await onMove(dropped.id, { [groupField]: nextValue });
              setActiveColumn(null);
              setDraggingId(null);
            }}
          >
            <header className="kanban-column-header">
              <LabelPill
                value={titleForColumn(groupBy, column)}
                label={labelForGroup(labelsByField, groupBy, column)}
              />
              <span className="kanban-count">{grouped[column]?.length ?? 0}</span>
              {isArchivedTarget ? <small className="kanban-archived-label">Archived choice</small> : null}
            </header>

            <div className="kanban-cards" data-testid={`kanban-column-body-${slugify(titleForColumn(groupBy, column))}`}>
              {(grouped[column] ?? []).length === 0 ? (
                <div className="kanban-empty-column">
                  <strong>No items</strong>
                  <span>Drop a card here or switch filters to widen this lane.</span>
                </div>
              ) : null}
              {sortedCardsByColumn[column].map((item) => {
                const draggable = Boolean(groupField && canEditField(item, groupField));
                return (
                  <article
                    key={item.id}
                    data-testid={`kanban-card-${slugify(item.unitNumber)}`}
                    className={draggingId === item.id ? "kanban-card draggable dragging" : draggable ? "kanban-card draggable" : "kanban-card"}
                    draggable={draggable}
                    onDragStart={() => setDraggingId(item.id)}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setActiveColumn(null);
                    }}
                    onClick={() => onOpenItem(item.id)}
                  >
                    <div className="kanban-card-title">
                      <LabelPill value={item.unitNumber} label={colorLabel(item)} />
                      {item.riskLevel && item.riskLevel !== "NONE" ? <span className={`risk-marker ${item.riskLevel === "CRITICAL" || item.riskLevel === "HIGH" ? "danger" : "warning"}`}>{item.riskLevel} risk</span> : null}
                    </div>
                    <div className="kanban-card-subtitle">{item.property.code}{cardFields.includes("floorPlan") ? ` · ${item.floorPlan ?? "No floor plan"}` : ""}</div>
                    <div className="kanban-card-meta">
                      {cardFields.includes("vacancyStatus") ? <LabelPill value={item.vacancyStatus} label={item.vacancyStatus ? labelsByField.vacancyStatus?.[item.vacancyStatus] : undefined} muted /> : null}
                      {cardFields.includes("scopeLevel") ? <LabelPill value={item.scopeLevel} label={item.scopeLevel ? labelsByField.scopeLevel?.[item.scopeLevel] : undefined} muted /> : null}
                    </div>
                    <div className="kanban-card-copy">
                      {cardFields.includes("assignedTech") ? <span>Tech: {item.assignedTech || "Unassigned"}</span> : null}
                      {cardFields.includes("moveInDate") ? <span>Move-In: {item.moveInDate ? formatDateDisplay(item.moveInDate) : "-"}</span> : null}
                      {cardFields.filter((field) => field.startsWith("custom:")).map((field) => <span key={field}>{customFieldsById.get(field.slice(7))?.label}: {String(valueForField(item, field) ?? "-")}</span>)}
                    </div>
                    <button type="button" className="kanban-details" data-testid={`kanban-details-${slugify(item.unitNumber)}`} onClick={(event) => { event.stopPropagation(); onOpenItem(item.id); }}>Open details</button>
                  </article>
                );
              })}
            </div>
          </div>
          );
          })()
        ))}
      </div>
    </section>
  );
}
