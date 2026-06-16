import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { BoardColumnDefinition, BoardSection, CustomField, FloorPlan, LabelDefinition, MakeReadyItem, Property, StaffOption, Unit } from "../lib/api";
import type { ArchiveFilter } from "../lib/structuredFilters";
import { boardColumns, boardGroupLabel, configuredBoardColumns, customColumnKey, defaultHiddenTableColumnKeys, requiredTableColumnKeys } from "../lib/board";
import { formatDateDisplay, formatDateInput } from "../lib/dateTime";
import { openPestQuickAdd, openPestWorkspace } from "../lib/pestNavigation";
import { ConfirmDialog } from "./ConfirmDialog";
import { LabelPill } from "./LabelPill";
import { Modal } from "./Modal";
import { StatusState } from "./StatusState";

type Props = {
  items: MakeReadyItem[];
  labelsByField: Record<string, Record<string, LabelDefinition>>;
  customFields: CustomField[];
  columnDefinitions: BoardColumnDefinition[];
  visibleColumns: string[] | null;
  onPatch: (id: string, data: Record<string, unknown>) => Promise<void>;
  onPatchCustomField: (itemId: string, fieldId: string, value: unknown) => Promise<void>;
  canEditField: (item: MakeReadyItem, key: string) => boolean;
  canEditCustomFields: boolean;
  canManageItems: boolean;
  properties: Property[];
  units: Unit[];
  floorPlans: FloorPlan[];
  staff: StaffOption[];
  boardGroups: string[];
  boardSections: BoardSection[];
  preferredPropertyId: string;
  archiveState: ArchiveFilter;
  searchText: string;
  onCreateUnit: (input: { propertyId: string; number: string; floorPlanId: null; floorPlan: null; squareFeet: null }) => Promise<Unit>;
  onCreateItem: (input: {
    propertyId: string;
    unitId: string | null;
    boardGroup: string;
    itemName: string;
    unitNumber: string;
    floorPlan: string | null;
    vacancyStatus: string | null;
    makeReadyStatus: string | null;
    completionStatus: string | null;
    assignedTech: string | null;
  }) => Promise<void>;
  onBatch: (input:
    | { action: "ARCHIVE" | "RESTORE"; ids: string[] }
    | { action: "ASSIGN_TECH"; ids: string[]; value: string | null }
    | { action: "MOVE_GROUP"; ids: string[]; boardGroup: string }
    | { action: "SET_FIELD"; ids: string[]; field: "makeReadyStatus"; value: string | null }
  ) => Promise<void>;
  onOpenFieldManager: () => void;
  onOpenBoardSetup: () => void;
  onAddBuiltInOption: (fieldKey: string, value: string, color: string) => Promise<void>;
  onAddCustomOption: (field: CustomField, value: string, color: string) => Promise<void>;
  onUpdateBuiltInOption: (id: string, data: Partial<Pick<LabelDefinition, "value" | "color" | "textColor">>) => Promise<void>;
  onArchiveBuiltInOption: (id: string, restore: boolean) => Promise<void>;
  onReorderBuiltInOptions: (ids: string[]) => Promise<void>;
  onUpdateCustomOptions: (field: CustomField, options: CustomField["options"]) => Promise<void>;
  onCreateFloorPlan: (input: { propertyId: string; code: string; name: string; bedrooms: number | null; bathrooms: number | null; squareFeet: number | null; description: string | null }) => Promise<void>;
  onUpdateFloorPlan: (id: string, input: { code: string; name: string; bedrooms: number | null; bathrooms: number | null; squareFeet: number | null; description: string | null }) => Promise<void>;
  onArchiveFloorPlan: (id: string, restore: boolean) => Promise<void>;
  onRenameBuiltInColumn: (fieldKey: string, label: string, reset?: boolean) => Promise<void>;
  onRenameCustomColumn: (field: CustomField, label: string) => Promise<void>;
  onHideColumn: (key: string) => void;
  onSortColumn: (key: string, direction: "asc" | "desc") => void;
  onOpenItem: (id: string) => void;
  onAssignFloorPlan: (item: MakeReadyItem, floorPlanId: string) => Promise<void>;
  onReorderColumns: (keys: string[]) => void;
  onRenameSection: (id: string, displayName: string) => Promise<void>;
};

type Cell = { itemId: string; key: string; custom: boolean };
type EditingCell = Cell & { draft: unknown; original: unknown };
type SaveState = "saving" | "saved" | "error";

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function customValue(item: MakeReadyItem, fieldId: string) {
  return item.customFieldValues?.find((value) => value.customFieldId === fieldId)?.value ?? null;
}

function displayCustomValue(value: unknown) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "YES" : "NO";
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function floorPlanLabel(plan: Pick<FloorPlan, "code" | "name">) {
  return plan.name && plan.name !== plan.code ? `${plan.code} - ${plan.name}` : plan.code;
}

function valuesMatch(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function stateLabel(state: SaveState) {
  if (state === "saving") return "Saving";
  if (state === "saved") return "Saved";
  return "Save failed";
}

function columnClassName(key: string, custom = false) {
  return `${custom ? "column-custom" : "column-built-in"} column-${slug(key)}`;
}

const OCCUPIED_GROUP_PREFIX = "OCCUPIED_DIRECTORY:";

function occupiedGroupKey(propertyId: string) {
  return `${OCCUPIED_GROUP_PREFIX}${propertyId}`;
}

function isOccupiedDirectoryGroup(group: string) {
  return group.startsWith(OCCUPIED_GROUP_PREFIX);
}

function isOccupiedDirectoryItem(item: MakeReadyItem) {
  return item.id.startsWith("occupied-unit:");
}

function hasActivePestIssue(item: MakeReadyItem) {
  return Boolean(item.pestStatus && item.pestStatus !== "NONE");
}

function openPestForItem(item: MakeReadyItem) {
  if (hasActivePestIssue(item)) {
    openPestWorkspace({ propertyId: item.propertyId, tab: "make-ready", makeReadyItemId: item.id });
    return;
  }
  openPestQuickAdd({
    propertyId: item.propertyId,
    unitId: item.unitId ?? undefined,
    makeReadyItemId: item.id,
    area: item.unit?.area ?? undefined,
    source: "Make Ready",
    priority: item.moveInSoon || item.overdue ? "High" : "Normal",
    description: item.notes ?? undefined,
  });
}

function CellState({ dirty, state, testId }: { dirty: boolean; state?: SaveState; testId: string }) {
  if (!dirty && !state) return null;
  const activeState = state === "saving" || state === "error" || !dirty ? state : undefined;
  const label = activeState ? stateLabel(activeState) : "Unsaved";
  const tone = activeState ?? "dirty";
  return (
    <span className={`cell-save-state ${tone}`} data-testid={testId} role={state === "error" ? "alert" : "status"} aria-live="polite">
      {label}
    </span>
  );
}

export function BoardTable({ items, labelsByField, customFields, columnDefinitions, visibleColumns, onPatch, onPatchCustomField, canEditField, canEditCustomFields, canManageItems, properties, units, floorPlans, staff, boardGroups, boardSections, preferredPropertyId, archiveState, searchText, onCreateUnit, onCreateItem, onBatch, onOpenFieldManager, onOpenBoardSetup, onAddBuiltInOption, onAddCustomOption, onUpdateBuiltInOption, onArchiveBuiltInOption, onReorderBuiltInOptions, onUpdateCustomOptions, onCreateFloorPlan, onUpdateFloorPlan, onArchiveFloorPlan, onRenameBuiltInColumn, onRenameCustomColumn, onHideColumn, onSortColumn, onOpenItem, onAssignFloorPlan, onReorderColumns, onRenameSection }: Props) {
  const visibleColumnSet = useMemo(() => visibleColumns === null ? null : new Set([...requiredTableColumnKeys, ...visibleColumns]), [visibleColumns]);
  const defaultHiddenColumnSet = useMemo(() => new Set<string>(defaultHiddenTableColumnKeys), []);
  const configuredColumns = useMemo(() => configuredBoardColumns(columnDefinitions), [columnDefinitions]);
  const visibleBoardColumns = useMemo(
    () => configuredColumns
      .filter((column) => visibleColumnSet === null ? !defaultHiddenColumnSet.has(column.key) : visibleColumnSet.has(column.key))
      .sort((left, right) => visibleColumns === null ? 0 : visibleColumns.indexOf(left.key) - visibleColumns.indexOf(right.key)),
    [configuredColumns, defaultHiddenColumnSet, visibleColumnSet, visibleColumns],
  );
  const visibleCustomFields = useMemo(
    () => customFields
      .filter((field) => visibleColumnSet === null || visibleColumnSet.has(customColumnKey(field.id)))
      .sort((left, right) => visibleColumns === null ? 0 : visibleColumns.indexOf(customColumnKey(left.id)) - visibleColumns.indexOf(customColumnKey(right.id))),
    [customFields, visibleColumnSet, visibleColumns],
  );
  const orderedVisibleColumns = useMemo(() => {
    const builtIn = visibleBoardColumns.map((column) => ({ key: column.key, custom: false as const, column }));
    const configured = visibleCustomFields.map((field) => ({ key: customColumnKey(field.id), custom: true as const, field }));
    const columns = [...builtIn, ...configured];
    if (visibleColumns === null) return columns;
    const position = new Map(visibleColumns.map((key, index) => [key, index]));
    return columns.sort((left, right) => (position.get(left.key) ?? Number.MAX_SAFE_INTEGER) - (position.get(right.key) ?? Number.MAX_SAFE_INTEGER));
  }, [visibleBoardColumns, visibleColumns, visibleCustomFields]);
  const activeProperties = properties.filter((property) => property.isActive);
  const allowedPropertyIds = useMemo(
    () => new Set(preferredPropertyId ? [preferredPropertyId] : activeProperties.map((property) => property.id)),
    [activeProperties, preferredPropertyId],
  );
  const visibleSectionKeys = useMemo(() => {
    if (archiveState === "occupied") {
      return activeProperties
        .filter((property) => allowedPropertyIds.has(property.id))
        .sort((left, right) => left.code.localeCompare(right.code))
        .map((property) => occupiedGroupKey(property.id));
    }
    const sectionTypes = archiveState === "archived" ? new Set(["ARCHIVE"]) : archiveState === "active" ? new Set(["READY", "MAKE_READY", "DOWN"]) : new Set(["READY", "MAKE_READY", "DOWN", "ARCHIVE"]);
    return boardSections
      .filter((section) => section.isActive && allowedPropertyIds.has(section.propertyId) && sectionTypes.has(section.sectionType))
      .sort((left, right) => {
        const propertyCompare = (activeProperties.find((property) => property.id === left.propertyId)?.code ?? "").localeCompare(activeProperties.find((property) => property.id === right.propertyId)?.code ?? "");
        return propertyCompare || left.sortOrder - right.sortOrder;
      })
      .map((section) => section.key);
  }, [activeProperties, allowedPropertyIds, archiveState, boardSections]);
  const occupiedDirectoryItems = useMemo(() => {
    if (archiveState !== "occupied") return [];
    const query = searchText.trim().toLowerCase();
    return units
      .filter((unit) => unit.isActive && unit.occupancyStatus === "OCCUPIED" && allowedPropertyIds.has(unit.propertyId))
      .filter((unit) => {
        if (!query) return true;
        return [unit.number, unit.floorPlan ?? "", unit.floorPlanRecord?.code ?? "", unit.floorPlanRecord?.name ?? "", unit.building ?? "", unit.area ?? "", unit.property.code]
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .sort((left, right) => {
        const propertyCompare = left.property.code.localeCompare(right.property.code);
        return propertyCompare || left.number.localeCompare(right.number, undefined, { numeric: true });
      })
      .map((unit) => ({
        id: `occupied-unit:${unit.id}`,
        propertyId: unit.propertyId,
        unitId: unit.id,
        boardGroup: occupiedGroupKey(unit.propertyId),
        itemName: unit.number,
        unitNumber: unit.number,
        floorPlan: unit.floorPlanRecord?.code ?? unit.floorPlan,
        applicant: null,
        assignedTech: null,
        scopeLevel: null,
        status: "OCCUPIED",
        vacancyStatus: "OCCUPIED",
        moveOutDate: null,
        vacatedDate: null,
        makeReadyDate: null,
        moveInDate: null,
        daysVacant: 0,
        daysUntilMoveIn: null,
        priority: 0,
        overdue: false,
        moveInSoon: false,
        riskScore: 0,
        riskLevel: "NONE",
        riskReasons: [],
        lastRiskEvaluatedAt: null,
        completionStatus: null,
        sheetrockStatus: null,
        pestStatus: null,
        pestTreated: null,
        trashOutStatus: null,
        floorsStatus: null,
        flooringDate: null,
        makeReadyStatus: null,
        cleaningStatus: null,
        keysMadeStatus: null,
        cabinetsStatus: null,
        countertopsStatus: null,
        appliancesStatus: null,
        paintStatus: null,
        doorsStatus: null,
        newDoorCode: null,
        notes: unit.building || unit.area || unit.floor ? [unit.building ? `Building ${unit.building}` : "", unit.area ? `Area ${unit.area}` : "", unit.floor ? `Floor ${unit.floor}` : ""].filter(Boolean).join(" / ") : null,
        isArchived: false,
        archivedAt: null,
        updatedAt: "",
        property: unit.property,
        unit,
        customFieldValues: [],
      } satisfies MakeReadyItem));
  }, [allowedPropertyIds, archiveState, searchText, units]);
  const tableItems = archiveState === "occupied" ? occupiedDirectoryItems : items;
  const groups = useMemo(() => {
    const acc = Object.fromEntries(visibleSectionKeys.map((key) => [key, [] as MakeReadyItem[]]));
    return tableItems.reduce<Record<string, MakeReadyItem[]>>((acc, item) => {
      acc[item.boardGroup] ??= [];
      acc[item.boardGroup].push(item);
      return acc;
    }, acc);
  }, [tableItems, visibleSectionKeys]);
  const orderedItems = useMemo(() => Object.values(groups).flat(), [groups]);
  const itemById = useMemo(() => new Map(tableItems.map((item) => [item.id, item])), [tableItems]);
  const fieldById = useMemo(() => new Map(customFields.map((field) => [field.id, field])), [customFields]);
  const editableCells = useMemo(() => orderedItems.flatMap((item) => orderedVisibleColumns.flatMap((entry) => {
    if (isOccupiedDirectoryItem(item)) return [];
    if (entry.custom) return canEditCustomFields ? [{ itemId: item.id, key: entry.field.id, custom: true }] : [];
    return entry.column.type !== "readonly" && canEditField(item, entry.column.key)
      ? [{ itemId: item.id, key: entry.column.key, custom: false }]
      : [];
  })), [canEditCustomFields, orderedVisibleColumns, orderedItems, canEditField]);

  const [editing, setEditing] = useState<EditingCell | null>(null);
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [addGroup, setAddGroup] = useState<string | null>(null);
  const [newItem, setNewItem] = useState({ propertyId: "", unitNumber: "", assignedTech: "", vacancyStatus: "VACANT NOT LEASED NOT READY", makeReadyStatus: "" });
  const [batchTech, setBatchTech] = useState("");
  const [batchStatus, setBatchStatus] = useState("");
  const [batchGroup, setBatchGroup] = useState("");
  const [pendingGroupMove, setPendingGroupMove] = useState<string | null>(null);
  const [optionTarget, setOptionTarget] = useState<{ fieldKey: string; label: string; customField?: CustomField } | null>(null);
  const [quickOption, setQuickOption] = useState({ value: "", color: "#58a6de" });
  const [optionDrafts, setOptionDrafts] = useState<Record<string, { value: string; color: string; isArchived: boolean }>>({});
  const [optionBusy, setOptionBusy] = useState(false);
  const [dragColumn, setDragColumn] = useState<string | null>(null);
  const [renamingSection, setRenamingSection] = useState<{ id: string; value: string } | null>(null);
  const [columnMenu, setColumnMenu] = useState<{ group: string; key: string } | null>(null);
  const [columnRename, setColumnRename] = useState<{ key: string; label: string; customField?: CustomField; defaultLabel?: string } | null>(null);
  const [floorPlanPropertyId, setFloorPlanPropertyId] = useState<string | null>(null);
  const [newPlan, setNewPlan] = useState({ code: "", name: "", bedrooms: "", bathrooms: "", squareFeet: "", description: "" });
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [planDraft, setPlanDraft] = useState({ code: "", name: "", bedrooms: "", bathrooms: "", squareFeet: "", description: "" });
  const pendingCells = useRef(new Set<string>());
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedItems = useMemo(() => items.filter((item) => selectedSet.has(item.id)), [items, selectedSet]);
  const sectionForGroup = (group: string) => {
    if (isOccupiedDirectoryGroup(group)) return undefined;
    const property = propertyForGroup(group);
    return boardSections.find((section) => section.key === group && (!property || section.propertyId === property.id));
  };
  const groupName = (group: string) => {
    const property = propertyForGroup(group);
    if (isOccupiedDirectoryGroup(group)) return property ? `${property.code} / Occupied` : "Occupied";
    const section = sectionForGroup(group);
    const label = section?.displayName ?? boardGroupLabel(group, property?.id, boardSections);
    return property ? `${property.code} / ${label}` : label;
  };

  const propertyForGroup = (group: string) => {
    if (isOccupiedDirectoryGroup(group)) {
      const propertyId = group.slice(OCCUPIED_GROUP_PREFIX.length);
      return activeProperties.find((property) => property.id === propertyId) ?? null;
    }
    const preferred = activeProperties.find((property) => property.id === preferredPropertyId);
    if (preferred && boardSections.some((section) => section.key === group && section.propertyId === preferred.id)) return preferred;
    const configuredSection = boardSections.find((section) => section.key === group);
    const configuredProperty = configuredSection ? activeProperties.find((property) => property.id === configuredSection.propertyId) : null;
    if (configuredProperty) return configuredProperty;
    const groupPropertyIds = Array.from(new Set((groups[group] ?? []).map((item) => item.propertyId)));
    if (groupPropertyIds.length === 1) {
      return activeProperties.find((property) => property.id === groupPropertyIds[0]) ?? null;
    }
    const groupParts = group.split("_");
    const suffix = groupParts[groupParts.length - 1];
    return activeProperties.find((property) => property.code.toUpperCase() === suffix) ?? (activeProperties.length === 1 ? activeProperties[0] : null);
  };

  const cellToken = (cell: Cell) => `${cell.itemId}:${cell.key}`;

  const editorValue = (cell: Cell) => {
    const item = itemById.get(cell.itemId);
    if (!item) return "";
    if (cell.custom) {
      const field = fieldById.get(cell.key);
      const value = customValue(item, cell.key);
      if (field?.fieldType === "NUMBER") return value === null ? "" : String(value);
      if (field?.fieldType === "BOOLEAN") return typeof value === "boolean" ? String(value) : "";
      return value ?? "";
    }
    const column = boardColumns.find((entry) => entry.key === cell.key);
    const value = item[cell.key as keyof MakeReadyItem];
    if (column?.type === "date") return typeof value === "string" ? formatDateInput(value) : "";
    return typeof value === "string" ? value : "";
  };

  const beginEdit = (cell: Cell) => {
    if (pendingCells.current.has(cellToken(cell))) return;
    if (editing && cellToken(editing) !== cellToken(cell) && !valuesMatch(editing.draft, editing.original)) {
      return;
    }
    const value = editorValue(cell);
    setEditing({ ...cell, draft: value, original: value });
    setSaveStates((current) => {
      const next = { ...current };
      delete next[cellToken(cell)];
      return next;
    });
  };

  const moveFrom = (cell: Cell, direction: 1 | -1) => {
    const index = editableCells.findIndex((entry) => cellToken(entry) === cellToken(cell));
    const next = editableCells[index + direction];
    if (next) {
      const value = editorValue(next);
      setEditing({ ...next, draft: value, original: value });
      setSaveStates((current) => {
        const state = { ...current };
        delete state[cellToken(next)];
        return state;
      });
    }
  };

  const saveEdit = async (cell: Cell, nextValue: unknown, direction?: 1 | -1) => {
    const token = cellToken(cell);
    if (pendingCells.current.has(token)) return false;
    const original = editing && cellToken(editing) === token ? editing.original : editorValue(cell);
    if (valuesMatch(original, nextValue)) {
      setEditing((current) => (current && cellToken(current) === token ? null : current));
      if (direction) moveFrom(cell, direction);
      return true;
    }

    pendingCells.current.add(token);
    setSaveStates((current) => ({ ...current, [token]: "saving" }));
    try {
      if (cell.custom) {
        await onPatchCustomField(cell.itemId, cell.key, nextValue);
      } else {
        await onPatch(cell.itemId, { [cell.key]: nextValue });
      }
      setSaveStates((current) => ({ ...current, [token]: "saved" }));
      setEditing((current) => (current && cellToken(current) === token ? null : current));
      if (direction) moveFrom(cell, direction);
      return true;
    } catch {
      setSaveStates((current) => ({ ...current, [token]: "error" }));
      return false;
    } finally {
      pendingCells.current.delete(token);
    }
  };

  const updateDraft = (value: unknown) => {
    if (editing) {
      setSaveStates((states) => {
        const next = { ...states };
        delete next[cellToken(editing)];
        return next;
      });
    }
    setEditing((current) => (current ? { ...current, draft: value } : current));
  };

  const cancelEdit = (cell: Cell) => {
    setEditing((current) => (current && cellToken(current) === cellToken(cell) ? null : current));
  };

  const handleEditorKeys = async (event: KeyboardEvent<HTMLElement>, cell: Cell, value: unknown, multiline = false) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelEdit(cell);
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      await saveEdit(cell, value, event.shiftKey ? -1 : 1);
      return;
    }
    if (event.key === "Enter" && (!multiline || !event.shiftKey)) {
      event.preventDefault();
      await saveEdit(cell, value);
    }
  };

  const handleBlur = (cell: Cell, value: unknown) => {
    if (!pendingCells.current.has(cellToken(cell))) {
      void saveEdit(cell, value);
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id]);
  };

  const toggleGroup = (groupItems: MakeReadyItem[]) => {
    const ids = groupItems.filter((item) => !isOccupiedDirectoryItem(item)).map((item) => item.id);
    if (ids.length === 0) return;
    const selected = ids.every((id) => selectedSet.has(id));
    setSelectedIds((current) => selected ? current.filter((id) => !ids.includes(id)) : Array.from(new Set([...current, ...ids])));
  };

  const createInGroup = async (group: string) => {
    const property = activeProperties.find((candidate) => candidate.id === newItem.propertyId) ?? propertyForGroup(group);
    const unitNumber = newItem.unitNumber.trim();
    if (!property || !unitNumber) return;
    let unit = units.find((candidate) =>
      candidate.isActive && candidate.propertyId === property.id && candidate.number.toLowerCase() === unitNumber.toLowerCase(),
    );
    if (!unit) {
      unit = await onCreateUnit({ propertyId: property.id, number: unitNumber, floorPlanId: null, floorPlan: null, squareFeet: null });
    }
    await onCreateItem({
      propertyId: property.id,
      unitId: unit.id,
      boardGroup: group,
      itemName: unit.number,
      unitNumber: unit.number,
      floorPlan: unit.floorPlan,
      vacancyStatus: newItem.vacancyStatus || null,
      makeReadyStatus: newItem.makeReadyStatus || null,
      completionStatus: "NO",
      assignedTech: newItem.assignedTech || null,
    });
    setAddGroup(null);
    setNewItem((current) => ({ ...current, unitNumber: "", assignedTech: "", makeReadyStatus: "" }));
  };

  const applyBatch = async (input: Parameters<Props["onBatch"]>[0]) => {
    await onBatch(input);
    setSelectedIds([]);
  };

  const openOptionManager = (fieldKey: string, label: string, customField?: CustomField) => {
    setQuickOption({ value: "", color: "#58a6de" });
    const options = customField
      ? customField.options.map((option) => ({ id: option.id, value: option.label, color: option.color, isArchived: option.isArchived }))
      : Object.values(labelsByField[fieldKey] ?? {}).map((option) => ({ id: option.id, value: option.value, color: option.color, isArchived: Boolean(option.isArchived) }));
    setOptionDrafts(Object.fromEntries(options.map((option) => [option.id, { value: option.value, color: option.color, isArchived: option.isArchived }])));
    setOptionTarget({ fieldKey, label, customField });
  };

  const openFloorPlanManager = (propertyId?: string) => {
    setFloorPlanPropertyId(propertyId ?? preferredPropertyId ?? activeProperties[0]?.id ?? "");
    setSelectedPlanId("");
    setNewPlan({ code: "", name: "", bedrooms: "", bathrooms: "", squareFeet: "", description: "" });
  };

  const moveColumn = (key: string, direction: -1 | 1) => {
    if (key === "unitNumber") return;
    const keys = orderedVisibleColumns.map((entry) => entry.key);
    const position = keys.indexOf(key);
    const next = position + direction;
    if (position < 0 || next < 0 || next >= keys.length || keys[next] === "unitNumber") return;
    [keys[position], keys[next]] = [keys[next], keys[position]];
    onReorderColumns(keys);
    setColumnMenu(null);
  };

  const reorderColumns = (targetKey: string) => {
    if (!dragColumn || dragColumn === targetKey || dragColumn === "unitNumber" || targetKey === "unitNumber") return;
    const keys = orderedVisibleColumns.map((entry) => entry.key);
    const from = keys.indexOf(dragColumn);
    const to = keys.indexOf(targetKey);
    if (from < 0 || to < 0) return;
    keys.splice(to, 0, keys.splice(from, 1)[0]);
    onReorderColumns(keys);
    setDragColumn(null);
  };

  const createQuickOption = async () => {
    if (!optionTarget || !quickOption.value.trim()) return;
    setOptionBusy(true);
    try {
      if (optionTarget.customField) {
        await onAddCustomOption(optionTarget.customField, quickOption.value.trim(), quickOption.color);
      } else {
        await onAddBuiltInOption(optionTarget.fieldKey, quickOption.value.trim(), quickOption.color);
      }
      setOptionTarget(null);
    } finally {
      setOptionBusy(false);
    }
  };

  const optionsForTarget = optionTarget?.customField
    ? optionTarget.customField.options
    : Object.values(labelsByField[optionTarget?.fieldKey ?? ""] ?? {});
  const plansForInlineManager = floorPlans.filter((plan) => plan.propertyId === floorPlanPropertyId);
  const selectedPlan = plansForInlineManager.find((plan) => plan.id === selectedPlanId);
  const numberOrNull = (value: string) => value === "" ? null : Number(value);

  const saveManagedOptions = async () => {
    if (!optionTarget) return;
    setOptionBusy(true);
    try {
      if (optionTarget.customField) {
        await onUpdateCustomOptions(optionTarget.customField, optionTarget.customField.options.map((option, index) => ({
          ...option,
          label: optionDrafts[option.id]?.value ?? option.label,
          color: optionDrafts[option.id]?.color ?? option.color,
          isArchived: optionDrafts[option.id]?.isArchived ?? option.isArchived,
          sortOrder: index,
        })));
      } else {
        for (const option of optionsForTarget as LabelDefinition[]) {
          const next = optionDrafts[option.id];
          if (!next) continue;
          if (next.value !== option.value || next.color !== option.color) {
            await onUpdateBuiltInOption(option.id, { value: next.value, color: next.color });
          }
          if (next.isArchived !== Boolean(option.isArchived)) {
            await onArchiveBuiltInOption(option.id, !next.isArchived);
          }
        }
      }
      setOptionTarget(null);
    } finally {
      setOptionBusy(false);
    }
  };

  const moveManagedOption = async (id: string, direction: -1 | 1) => {
    if (!optionTarget) return;
    const options = [...optionsForTarget];
    const index = options.findIndex((option) => option.id === id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= options.length) return;
    [options[index], options[next]] = [options[next], options[index]];
    if (optionTarget.customField) {
      await onUpdateCustomOptions(optionTarget.customField, (options as CustomField["options"]).map((option, sortOrder) => ({ ...option, sortOrder })));
    } else {
      await onReorderBuiltInOptions(options.map((option) => option.id));
    }
  };

  const workflowTools = canManageItems ? (
    <div className="table-workflow-bar" data-testid="table-workflow-bar" role="toolbar" aria-label="Table configuration shortcuts">
      <strong>Board tools</strong>
      <button type="button" data-testid="table-add-field-shortcut" className="button button-secondary" onClick={onOpenFieldManager}>+ Add field</button>
      <button type="button" data-testid="table-setup-shortcut" className="button button-secondary" onClick={onOpenBoardSetup}>Labels &amp; floor plans</button>
      <span>Use a status cell to add choices without leaving the table.</span>
    </div>
  ) : null;

  if (orderedItems.length === 0 && Object.keys(groups).length === 0) {
    return (
      <div className="board-scroll" data-testid="board-table-view">
        {workflowTools}
        <StatusState
          title="No board items match this view"
          description="Try clearing filters, changing the property, or loading a different saved view."
          tone="subtle"
        />
      </div>
    );
  }

  return (
    <div className="board-scroll" data-testid="board-table-view">
      {workflowTools}
      {selectedIds.length > 0 && canManageItems ? (
        <div className="batch-action-bar" data-testid="batch-action-bar" role="toolbar" aria-label="Actions for selected make-ready items">
          <strong>{selectedIds.length} selected</strong>
          <button data-testid="batch-archive" className="button button-danger" onClick={() => void applyBatch({ action: "ARCHIVE", ids: selectedIds })}>Archive</button>
          {selectedItems.some((item) => item.isArchived) ? <button data-testid="batch-restore" className="button button-secondary" onClick={() => void applyBatch({ action: "RESTORE", ids: selectedIds })}>Restore</button> : null}
          <select data-testid="batch-tech-select" value={batchTech} onChange={(event) => setBatchTech(event.target.value)}>
            <option value="">Assign tech...</option>
            {staff.map((person) => <option key={person.id} value={person.fullName}>{person.fullName} - {person.role}</option>)}
          </select>
          <button data-testid="batch-assign-tech" className="button button-secondary" disabled={!batchTech} onClick={() => void applyBatch({ action: "ASSIGN_TECH", ids: selectedIds, value: batchTech || null })}>Assign</button>
          <select data-testid="batch-status-select" value={batchStatus} onChange={(event) => setBatchStatus(event.target.value)}>
            <option value="">Set make-ready...</option>
            {Object.values(labelsByField.makeReadyStatus ?? {}).filter((label) => !label.isArchived).map((label) => <option key={label.id} value={label.value}>{label.value}</option>)}
          </select>
          <button className="button button-secondary" disabled={!batchStatus} onClick={() => void applyBatch({ action: "SET_FIELD", ids: selectedIds, field: "makeReadyStatus", value: batchStatus || null })}>Set</button>
          <select data-testid="batch-group-select" value={batchGroup} onChange={(event) => setBatchGroup(event.target.value)}>
            <option value="">Move to section...</option>
            {boardGroups.map((group) => <option key={group} value={group}>{groupName(group)}</option>)}
          </select>
          <button data-testid="batch-move" className="button button-secondary" disabled={!batchGroup} onClick={() => setPendingGroupMove(batchGroup)}>Move</button>
          <button className="button button-ghost" onClick={() => setSelectedIds([])}>Clear</button>
        </div>
      ) : null}
      <div className="mobile-board-list" data-testid="mobile-board-list">
        {orderedItems.map((item) => (
          <article key={item.id} className={item.overdue ? "mobile-board-card overdue" : item.moveInSoon ? "mobile-board-card soon" : "mobile-board-card"}>
            <header className="mobile-board-card-header">
              <div className="mobile-board-card-identity-wrap">
                {canManageItems && !isOccupiedDirectoryItem(item) ? <input data-testid={`mobile-select-${slug(item.unitNumber)}`} type="checkbox" checked={selectedSet.has(item.id)} onChange={() => toggleSelected(item.id)} aria-label={`Select ${item.unitNumber}`} /> : null}
                <div className="mobile-board-card-identity">
                  <div className="mobile-board-card-title-row">
                    <strong>{item.unitNumber}</strong>
                    <LabelPill value={item.vacancyStatus} label={item.vacancyStatus ? labelsByField.vacancyStatus?.[item.vacancyStatus] : undefined} muted />
                  </div>
                  <span>{item.property.code} · {item.floorPlan ?? "No floor plan"}</span>
                  <small>{boardGroupLabel(item.boardGroup, item.propertyId, boardSections)} · {item.assignedTech || "Unassigned tech"}</small>
                </div>
              </div>
              {!isOccupiedDirectoryItem(item) ? (
                <button type="button" className="item-details-button mobile-board-open" data-testid={`mobile-details-${slug(item.unitNumber)}`} onClick={() => onOpenItem(item.id)} aria-label={`Open details for ${item.unitNumber}`}>Open</button>
              ) : null}
            </header>
            <div className="mobile-board-card-status-grid">
              <div>
                <span>Make Ready</span>
                <LabelPill value={item.makeReadyStatus} label={item.makeReadyStatus ? labelsByField.makeReadyStatus?.[item.makeReadyStatus] : undefined} muted />
              </div>
              <div>
                <span>Move-In</span>
                <strong>{item.moveInDate ? formatDateDisplay(item.moveInDate) : "—"}</strong>
              </div>
              <div>
                <span>Pest</span>
                {!isOccupiedDirectoryItem(item) ? (
                  <button
                    type="button"
                    className="cell-button mobile-status-button"
                    data-testid={`mobile-pest-status-${slug(item.unitNumber)}`}
                    onClick={() => openPestForItem(item)}
                    aria-label={`${hasActivePestIssue(item) ? "Open" : "Create"} pest record for ${item.unitNumber}`}
                  >
                    <LabelPill value={item.pestStatus} label={item.pestStatus ? labelsByField.pestStatus?.[item.pestStatus] : undefined} muted />
                  </button>
                ) : (
                  <LabelPill value={item.pestStatus} label={item.pestStatus ? labelsByField.pestStatus?.[item.pestStatus] : undefined} muted />
                )}
              </div>
              <div>
                <span>Pest Treated</span>
                {!isOccupiedDirectoryItem(item) ? (
                  <button
                    type="button"
                    className="cell-button mobile-status-button"
                    data-testid={`mobile-pest-treated-${slug(item.unitNumber)}`}
                    onClick={() => openPestForItem(item)}
                    aria-label={`${hasActivePestIssue(item) ? "Open" : "Create"} pest treatment record for ${item.unitNumber}`}
                  >
                    <LabelPill value={item.pestTreated} label={item.pestTreated ? labelsByField.pestTreated?.[item.pestTreated] : undefined} muted />
                  </button>
                ) : (
                  <LabelPill value={item.pestTreated} label={item.pestTreated ? labelsByField.pestTreated?.[item.pestTreated] : undefined} muted />
                )}
              </div>
            </div>
            <dl className="mobile-board-card-detail-grid">
              <div><dt>Section</dt><dd>{boardGroupLabel(item.boardGroup, item.propertyId, boardSections)}</dd></div>
              <div><dt>Tech</dt><dd>{item.assignedTech || "Unassigned"}</dd></div>
              <div><dt>Vacated</dt><dd>{item.vacatedDate ? formatDateDisplay(item.vacatedDate) : "—"}</dd></div>
              <div><dt>Days Vacant</dt><dd>{item.daysVacant ?? "—"}</dd></div>
            </dl>
            {item.overdue ? <p className="mobile-alert danger">Overdue make-ready</p> : item.moveInSoon ? <p className="mobile-alert warning">Move-in approaching</p> : null}
            <details className="mobile-board-card-more">
              <summary>More status</summary>
              <dl>
                <div><dt>Flooring</dt><dd>{item.flooringDate ? formatDateDisplay(item.flooringDate) : "—"}</dd></div>
                <div><dt>Move-Out</dt><dd>{item.moveOutDate ? formatDateDisplay(item.moveOutDate) : "—"}</dd></div>
                <div><dt>Completion</dt><dd><LabelPill value={item.completionStatus} label={item.completionStatus ? labelsByField.completionStatus?.[item.completionStatus] : undefined} muted /></dd></div>
                <div><dt>Ready Date</dt><dd>{item.makeReadyDate ? formatDateDisplay(item.makeReadyDate) : "—"}</dd></div>
              </dl>
            </details>
          </article>
        ))}
      </div>
      {Object.entries(groups).map(([group, groupItems]) => (
        <section className="board-group" key={group}>
          <header className="board-group-title" data-testid={`section-title-${slug(group)}`}>
            {renamingSection && renamingSection.id === sectionForGroup(group)?.id ? (
              <form onSubmit={async (event) => { event.preventDefault(); await onRenameSection(renamingSection.id, renamingSection.value); setRenamingSection(null); }}>
                <input data-testid={`section-name-input-${slug(group)}`} value={renamingSection.value} onChange={(event) => setRenamingSection({ id: renamingSection.id, value: event.target.value })} autoFocus />
                <button className="button button-secondary" type="submit">Save</button>
                <button className="button button-ghost" type="button" onClick={() => setRenamingSection(null)}>Cancel</button>
              </form>
            ) : (
              <>
                <span>{groupName(group)}</span>
                {canManageItems && sectionForGroup(group) ? (
                  <button data-testid={`section-rename-${slug(group)}`} type="button" className="section-rename-button" onClick={() => setRenamingSection({ id: sectionForGroup(group)!.id, value: groupName(group) })}>Rename</button>
                ) : null}
              </>
            )}
          </header>
          <div className="table-wrap">
            <table className={canManageItems ? "board-table has-selection" : "board-table"} data-testid={`board-group-table-${slug(group)}`}>
              <thead>
                <tr>
                  {canManageItems ? <th className="select-column"><input data-testid={`select-group-${slug(group)}`} type="checkbox" checked={groupItems.filter((item) => !isOccupiedDirectoryItem(item)).length > 0 && groupItems.filter((item) => !isOccupiedDirectoryItem(item)).every((item) => selectedSet.has(item.id))} disabled={groupItems.every(isOccupiedDirectoryItem)} onChange={() => toggleGroup(groupItems)} aria-label={`Select all in ${groupName(group)}`} /></th> : null}
                  {orderedVisibleColumns.map((entry) => {
                    const key = entry.key;
                    const label = entry.custom ? entry.field.label : entry.column.label;
                    const fixed = key === "unitNumber";
                    return (
                      <th
                        key={key}
                        draggable={!fixed}
                        onDragStart={() => setDragColumn(key)}
                        onDragOver={(event) => { if (!fixed) event.preventDefault(); }}
                        onDrop={() => reorderColumns(key)}
                        onDragEnd={() => setDragColumn(null)}
                        className={`${columnClassName(key, entry.custom)} ${!entry.custom && fixed ? "identity-column " : ""}${!fixed ? "draggable-column" : ""}${dragColumn === key ? " dragging-column" : ""}`}
                        data-testid={entry.custom ? `custom-field-header-${entry.field.fieldKey}` : `board-column-header-${entry.column.key}`}
                        aria-label={`${label}${fixed ? "" : ", drag to reorder column"}`}
                      >
                        <span className="column-header-label">{label}</span>
                        {!fixed ? <span className="column-drag-handle" aria-hidden="true">::</span> : null}
                        {canManageItems ? (
                          <button
                            type="button"
                            className="column-menu-trigger"
                            data-testid={`column-menu-${entry.custom ? entry.field.fieldKey : entry.column.key}`}
                            aria-label={`Configure ${label} column`}
                            aria-expanded={columnMenu?.group === group && columnMenu.key === key}
                            onClick={(event) => {
                              event.stopPropagation();
                              setColumnMenu((current) => current?.group === group && current.key === key ? null : { group, key });
                            }}
                          >...</button>
                        ) : null}
                        {columnMenu?.group === group && columnMenu.key === key ? (
                          <div className="column-header-menu" role="menu" data-testid={`column-header-menu-${entry.custom ? entry.field.fieldKey : entry.column.key}`} onClick={(event) => event.stopPropagation()}>
                            <button type="button" role="menuitem" onClick={() => {
                              const defaultColumn = !entry.custom ? boardColumns.find((column) => column.key === entry.column.key) : undefined;
                              setColumnRename({ key, label, customField: entry.custom ? entry.field : undefined, defaultLabel: defaultColumn?.label });
                              setColumnMenu(null);
                            }}>Rename column</button>
                            {!fixed ? <button type="button" role="menuitem" onClick={() => { onHideColumn(key); setColumnMenu(null); }}>Hide column</button> : null}
                            {!fixed ? <button type="button" role="menuitem" onClick={() => moveColumn(key, -1)}>Move left</button> : null}
                            {!fixed ? <button type="button" role="menuitem" onClick={() => moveColumn(key, 1)}>Move right</button> : null}
                            {!entry.custom && label !== boardColumns.find((column) => column.key === entry.column.key)?.label ? (
                              <button type="button" role="menuitem" onClick={() => { void onRenameBuiltInColumn(entry.column.key, "", true); setColumnMenu(null); }}>Reset label</button>
                            ) : null}
                            {!entry.custom && entry.column.type === "label" ? <button type="button" role="menuitem" onClick={() => { openOptionManager(entry.column.key, label); setColumnMenu(null); }}>Manage options</button> : null}
                            {entry.custom && (entry.field.fieldType === "SINGLE_SELECT" || entry.field.fieldType === "MULTI_SELECT") ? <button type="button" role="menuitem" onClick={() => { openOptionManager(entry.field.fieldKey, label, entry.field); setColumnMenu(null); }}>Manage options</button> : null}
                            {!entry.custom && entry.column.type === "floorplan" ? <button type="button" role="menuitem" onClick={() => { openFloorPlanManager(); setColumnMenu(null); }}>Manage floor plans</button> : null}
                            {!entry.custom ? <button type="button" role="menuitem" onClick={() => { onSortColumn(key, "asc"); setColumnMenu(null); }}>Sort ascending</button> : null}
                            {!entry.custom ? <button type="button" role="menuitem" onClick={() => { onSortColumn(key, "desc"); setColumnMenu(null); }}>Sort descending</button> : null}
                          </div>
                        ) : null}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {groupItems.map((item) => (
                  <tr key={item.id} className={[item.overdue ? "row-overdue" : item.moveInSoon ? "row-soon" : "", selectedSet.has(item.id) ? "row-selected" : ""].filter(Boolean).join(" ")}>
                    {canManageItems ? <td className="select-column">{!isOccupiedDirectoryItem(item) ? <input data-testid={`select-item-${slug(item.unitNumber)}`} type="checkbox" checked={selectedSet.has(item.id)} onChange={() => toggleSelected(item.id)} aria-label={`Select ${item.unitNumber}`} /> : null}</td> : null}
                    {orderedVisibleColumns.map((entry) => {
                      if (entry.custom) {
                        const field = entry.field;
                        const cell = { itemId: item.id, key: field.id, custom: true };
                        const token = cellToken(cell);
                        const isEditing = editing && cellToken(editing) === token;
                        const value = customValue(item, field.id);
                        const dirty = Boolean(isEditing && !valuesMatch(editing.draft, editing.original));
                        const feedback = <CellState dirty={dirty} state={dirty ? undefined : saveStates[token]} testId={`cell-status-${field.fieldKey}-${slug(item.unitNumber)}`} />;
                        const inputTestId = `custom-field-input-${field.fieldKey}-${slug(item.unitNumber)}`;
                        const draft = isEditing ? editing.draft : value;
                        const selectedOption = typeof value === "string" ? field.options.find((option) => option.label === value) : undefined;
                        const customEditable = canEditCustomFields && !isOccupiedDirectoryItem(item);
                        const label = selectedOption ? {
                          id: selectedOption.id,
                          fieldKey: field.fieldKey,
                          value: selectedOption.label,
                          color: selectedOption.color,
                          textColor: "#f4f6fa",
                          sortOrder: selectedOption.sortOrder,
                        } : undefined;

                        return (
                          <td key={field.id} className={`${columnClassName(field.fieldKey, true)} ${customEditable ? "editable-cell custom-cell" : "readonly-cell custom-cell"}`}>
                            {isEditing && customEditable ? (
                              <div className="cell-editor">
                                {field.fieldType === "SINGLE_SELECT" ? (
                                  <select
                                    autoFocus
                                    className="cell-select"
                                    data-testid={inputTestId}
                                    value={typeof draft === "string" ? draft : ""}
                                    onChange={(event) => {
                                      const next = event.target.value || null;
                                      updateDraft(event.target.value);
                                      void saveEdit(cell, next);
                                    }}
                                    onKeyDown={(event) => void handleEditorKeys(event, cell, typeof draft === "string" ? draft || null : null)}
                                    onBlur={() => handleBlur(cell, typeof draft === "string" ? draft || null : null)}
                                  >
                                    <option value="">Select</option>
                                    {field.options.filter((option) => !option.isArchived).map((option) => <option key={option.id} value={option.label}>{option.label}</option>)}
                                  </select>
                                ) : field.fieldType === "MULTI_SELECT" ? (
                                  <select
                                    autoFocus
                                    multiple
                                    data-testid={inputTestId}
                                    value={Array.isArray(draft) ? draft as string[] : []}
                                    onChange={(event) => updateDraft(Array.from(event.target.selectedOptions).map((option) => option.value))}
                                    onKeyDown={(event) => void handleEditorKeys(event, cell, Array.isArray(draft) ? draft : [])}
                                    onBlur={() => handleBlur(cell, Array.isArray(draft) ? draft : [])}
                                  >
                                    {field.options.filter((option) => !option.isArchived).map((option) => <option key={option.id} value={option.label}>{option.label}</option>)}
                                  </select>
                                ) : field.fieldType === "BOOLEAN" ? (
                                  <select
                                    autoFocus
                                    className="cell-select"
                                    data-testid={inputTestId}
                                    value={typeof draft === "boolean" ? String(draft) : typeof draft === "string" ? draft : ""}
                                    onChange={(event) => {
                                      const next = event.target.value === "" ? null : event.target.value === "true";
                                      updateDraft(next);
                                      void saveEdit(cell, next);
                                    }}
                                    onKeyDown={(event) => void handleEditorKeys(event, cell, draft)}
                                    onBlur={() => handleBlur(cell, draft)}
                                  >
                                    <option value="">Select</option>
                                    <option value="true">YES</option>
                                    <option value="false">NO</option>
                                  </select>
                                ) : field.fieldType === "LONG_TEXT" ? (
                                  <textarea
                                    autoFocus
                                    data-testid={inputTestId}
                                    value={typeof draft === "string" ? draft : ""}
                                    onChange={(event) => updateDraft(event.target.value)}
                                    onBlur={() => handleBlur(cell, typeof draft === "string" ? draft || null : null)}
                                    onKeyDown={(event) => void handleEditorKeys(event, cell, typeof draft === "string" ? draft || null : null, true)}
                                  />
                                ) : (
                                  <input
                                    autoFocus
                                    data-testid={inputTestId}
                                    type={field.fieldType === "NUMBER" ? "number" : field.fieldType === "DATE" ? "date" : "text"}
                                    value={draft === null || draft === undefined ? "" : String(draft)}
                                    onChange={(event) => updateDraft(event.target.value)}
                                    onBlur={() => {
                                      const raw = draft === null || draft === undefined ? "" : String(draft);
                                      handleBlur(cell, raw === "" ? null : field.fieldType === "NUMBER" ? Number(raw) : raw);
                                    }}
                                    onKeyDown={(event) => {
                                      const raw = draft === null || draft === undefined ? "" : String(draft);
                                      void handleEditorKeys(event, cell, raw === "" ? null : field.fieldType === "NUMBER" ? Number(raw) : raw);
                                    }}
                                  />
                                )}
                                {(field.fieldType === "SINGLE_SELECT" || field.fieldType === "MULTI_SELECT") && customEditable ? (
                                  <button type="button" data-testid={`manage-options-${field.fieldKey}-${slug(item.unitNumber)}`} className="cell-manage-link" onMouseDown={(event) => event.preventDefault()} onClick={() => openOptionManager(field.fieldKey, field.label, field)}>+ Add option</button>
                                ) : null}
                                {feedback}
                              </div>
                            ) : (
                              <div className="cell-display">
                                <button
                                  type="button"
                                  data-testid={`custom-field-cell-${field.fieldKey}-${slug(item.unitNumber)}`}
                                  className="cell-button cell-button-text"
                                  disabled={!customEditable}
                                  aria-label={`Edit ${field.label} for ${item.unitNumber}`}
                                  onClick={() => customEditable && beginEdit(cell)}
                                >
                                  {field.fieldType === "SINGLE_SELECT" ? (
                                    <LabelPill value={typeof value === "string" ? value : null} label={label} muted={!customEditable} />
                                  ) : (
                                    <span>{displayCustomValue(value)}</span>
                                  )}
                                </button>
                                {feedback}
                              </div>
                            )}
                          </td>
                        );
                      }
                      const column = entry.column;
                      const cell = { itemId: item.id, key: column.key, custom: false };
                      const token = cellToken(cell);
                      const isEditing = editing && cellToken(editing) === token;
                      const value = item[column.key as keyof MakeReadyItem];
                      const editable = !isOccupiedDirectoryItem(item) && column.type !== "readonly" && canEditField(item, column.key);
                      const dirty = Boolean(isEditing && !valuesMatch(editing.draft, editing.original));
                      const feedback = <CellState dirty={dirty} state={dirty ? undefined : saveStates[token]} testId={`cell-status-${column.key}-${slug(item.unitNumber)}`} />;

                      if (column.type === "readonly") return <td key={column.key}>{String(value ?? "")}</td>;

                      if (column.type === "floorplan") {
                        const currentPlan = floorPlans.find((plan) => plan.id === item.unit?.floorPlanId) ?? item.unit?.floorPlanRecord ?? undefined;
                        const legacy = Boolean(item.floorPlan && !currentPlan);
                        const options = floorPlans.filter((plan) => plan.propertyId === item.propertyId && (plan.isActive || plan.id === currentPlan?.id));
                        return (
                          <td key={column.key} className={`${columnClassName(column.key)} ${editable ? "editable-cell floor-plan-cell" : "readonly-cell floor-plan-cell"}`}>
                            {isEditing && editable ? (
                              <div className="cell-editor floor-plan-editor">
                                <select
                                  autoFocus
                                  className="cell-select"
                                  data-testid={`builtin-input-${column.key}-${slug(item.unitNumber)}`}
                                  value={currentPlan?.id ?? ""}
                                  onChange={(event) => {
                                    const nextId = event.target.value;
                                    if (!nextId) return;
                                    void onAssignFloorPlan(item, nextId);
                                    setEditing(null);
                                  }}
                                >
                                  <option value="">{legacy ? `LEGACY: ${item.floorPlan}` : "Select managed floor plan"}</option>
                                  {options.map((plan) => (
                                    <option key={plan.id} value={plan.id}>
                                      {floorPlanLabel(plan)} / {plan.bedrooms ?? "-"} bd / {plan.bathrooms ?? "-"} ba / {plan.squareFeet ?? "-"} sqft
                                    </option>
                                  ))}
                                </select>
                                {canManageItems ? <button type="button" data-testid={`manage-floor-plans-${slug(item.unitNumber)}`} className="cell-manage-link" onMouseDown={(event) => event.preventDefault()} onClick={() => openFloorPlanManager(item.propertyId)}>Manage floor plans</button> : null}
                                {feedback}
                              </div>
                            ) : (
                              <div className="cell-display">
                                <button
                                  type="button"
                                  data-testid={`builtin-cell-${column.key}-${slug(item.unitNumber)}`}
                                  className="cell-button cell-button-text floor-plan-button"
                                  onClick={() => editable && beginEdit(cell)}
                                  disabled={!editable}
                                  aria-label={`Select ${column.label} for ${item.unitNumber}`}
                                >
                                  <span>{currentPlan ? floorPlanLabel(currentPlan) : item.floorPlan ?? "—"}</span>
                                  {legacy ? <small className="legacy-value">LEGACY</small> : null}
                                  {currentPlan ? <small className="floor-plan-meta">{currentPlan.bedrooms ?? "-"}bd / {currentPlan.bathrooms ?? "-"}ba / {currentPlan.squareFeet ?? "-"}sf</small> : null}
                                </button>
                                {feedback}
                              </div>
                            )}
                          </td>
                        );
                      }

                      if (column.type === "assignee") {
                        const current = typeof value === "string" ? value : "";
                        const knownAssignment = staff.some((person) => person.fullName === current);
                        const draft = isEditing ? String(editing.draft ?? "") : "";
                        return (
                          <td key={column.key} className={`${columnClassName(column.key)} ${editable ? "editable-cell" : "readonly-cell"}`}>
                            {isEditing && editable ? (
                              <div className="cell-editor">
                                <select
                                  autoFocus
                                  className="cell-select"
                                  data-testid={`builtin-input-${column.key}-${slug(item.unitNumber)}`}
                                  value={draft}
                                  onChange={(event) => {
                                    const next = event.target.value || null;
                                    updateDraft(event.target.value);
                                    void saveEdit(cell, next);
                                  }}
                                  onKeyDown={(event) => void handleEditorKeys(event, cell, draft || null)}
                                  onBlur={() => handleBlur(cell, draft || null)}
                                >
                                  <option value="">Unassigned</option>
                                  {current && !knownAssignment ? <option value={current}>{current} (legacy)</option> : null}
                                  {staff.map((person) => <option key={person.id} value={person.fullName}>{person.fullName} - {person.role}</option>)}
                                </select>
                                {feedback}
                              </div>
                            ) : (
                              <div className="cell-display">
                                <button
                                  type="button"
                                  data-testid={`builtin-cell-${column.key}-${slug(item.unitNumber)}`}
                                  className="cell-button cell-button-text"
                                  onClick={() => editable && beginEdit(cell)}
                                  disabled={!editable}
                                  aria-label={`Edit ${column.label} for ${item.unitNumber}`}
                                >
                                  <span>{current || "Unassigned"}</span>
                                  {current && !knownAssignment ? <small className="legacy-value">Legacy</small> : null}
                                </button>
                                {feedback}
                              </div>
                            )}
                          </td>
                        );
                      }

                      if (column.type === "label") {
                        const options = Object.values(labelsByField[column.key] ?? {}).filter((option) => !option.isArchived).sort((a, b) => a.sortOrder - b.sortOrder);
                        const draft = isEditing ? String(editing.draft ?? "") : "";
                        const isPestColumn = column.key === "pestStatus" || column.key === "pestTreated";
                        const pestActionEnabled = isPestColumn && !isOccupiedDirectoryItem(item);
                        return (
                          <td key={column.key} className={`${columnClassName(column.key)} ${editable ? "editable-cell" : "readonly-cell"}`}>
                            {isEditing && editable ? (
                              <div className="cell-editor">
                                <select
                                  autoFocus
                                  className="cell-select"
                                  data-testid={`builtin-input-${column.key}-${slug(item.unitNumber)}`}
                                  value={draft}
                                  onChange={(event) => {
                                    const next = event.target.value;
                                    updateDraft(next);
                                    void saveEdit(cell, next);
                                  }}
                                  onKeyDown={(event) => void handleEditorKeys(event, cell, draft)}
                                  onBlur={() => handleBlur(cell, draft)}
                                >
                                  <option value="">Select</option>
                                  {options.map((option) => <option key={option.id} value={option.value}>{option.value}</option>)}
                                </select>
                                {canManageItems ? <button type="button" data-testid={`manage-options-${column.key}-${slug(item.unitNumber)}`} className="cell-manage-link" onMouseDown={(event) => event.preventDefault()} onClick={() => openOptionManager(column.key, column.label)}>+ Add option</button> : null}
                                {feedback}
                              </div>
                            ) : (
                              <div className="cell-display">
                                <button
                                  type="button"
                                  data-testid={`builtin-cell-${column.key}-${slug(item.unitNumber)}`}
                                  className="cell-button"
                                  onClick={() => {
                                    if (pestActionEnabled) {
                                      openPestForItem(item);
                                      return;
                                    }
                                    if (editable) beginEdit(cell);
                                  }}
                                  disabled={!editable && !pestActionEnabled}
                                  aria-label={pestActionEnabled
                                    ? `${hasActivePestIssue(item) ? "Open" : "Create"} pest record for ${item.unitNumber}`
                                    : `Edit ${column.label} for ${item.unitNumber}`}
                                >
                                  <LabelPill value={typeof value === "string" ? value : null} label={typeof value === "string" ? labelsByField[column.key]?.[value] : undefined} muted={!editable} />
                                </button>
                                {feedback}
                              </div>
                            )}
                          </td>
                        );
                      }

                      const draft = isEditing ? String(editing.draft ?? "") : "";
                      const displayValue = column.type === "date" ? (typeof value === "string" ? formatDateDisplay(value) : "—") : String(value ?? "—");
                      const noteText = column.key === "notes" ? displayValue : "";
                      const noteHasMore = column.key === "notes" && noteText.length > 72;
                      return (
                        <td key={column.key} className={`${columnClassName(column.key)} ${editable ? "editable-cell" : "readonly-cell"}${column.key === "unitNumber" ? " identity-column" : ""}`}>
                          {isEditing && editable ? (
                            <div className="cell-editor">
                              <input
                                autoFocus
                                data-testid={`builtin-input-${column.key}-${slug(item.unitNumber)}`}
                                type={column.type === "date" ? "date" : "text"}
                                value={draft}
                                onChange={(event) => updateDraft(event.target.value)}
                                onBlur={() => handleBlur(cell, column.type === "date" ? draft || null : draft)}
                                onKeyDown={(event) => void handleEditorKeys(event, cell, column.type === "date" ? draft || null : draft)}
                              />
                              {feedback}
                            </div>
                          ) : (
                            <div className="cell-display">
                              <button
                                type="button"
                                data-testid={`builtin-cell-${column.key}-${slug(item.unitNumber)}`}
                                className={column.key === "notes" ? "cell-button cell-button-text notes-cell" : "cell-button cell-button-text"}
                                onClick={() => editable && beginEdit(cell)}
                                disabled={!editable}
                                aria-label={`Edit ${column.label} for ${item.unitNumber}`}
                              >
                                <span className={`${editable ? "" : "read-only-cell"}${column.key === "notes" ? " notes-preview" : ""}`}>
                                  {displayValue}
                                </span>
                                {noteHasMore ? <small className="notes-more">... see more</small> : null}
                                {column.key === "unitNumber" && item.riskLevel && item.riskLevel !== "NONE" ? <small className={`risk-marker ${item.riskLevel === "CRITICAL" || item.riskLevel === "HIGH" ? "danger" : "warning"}`} data-testid={`risk-pill-${slug(item.unitNumber)}`}>{item.riskLevel} risk</small> : null}
                                {column.key === "unitNumber" && (!item.riskLevel || item.riskLevel === "NONE") && item.overdue ? <small className="risk-marker danger">Overdue</small> : null}
                                {column.key === "unitNumber" && (!item.riskLevel || item.riskLevel === "NONE") && !item.overdue && item.moveInSoon ? <small className="risk-marker warning">Move-in soon</small> : null}
                                {column.key === "unitNumber" && item.pestStatus && item.pestStatus !== "NONE" ? <small className="risk-marker warning">Pest: {item.pestStatus}</small> : null}
                              </button>
                              {column.key === "unitNumber" && !isOccupiedDirectoryItem(item) ? <button type="button" className="item-details-icon" data-testid={`item-details-${slug(item.unitNumber)}`} onClick={() => onOpenItem(item.id)} aria-label={`Open details for ${item.unitNumber}`}>›</button> : null}
                              {feedback}
                            </div>
                          )}
                        </td>
                      );
                    })}
                    {false && visibleCustomFields.map((field) => {
                      const cell = { itemId: item.id, key: field.id, custom: true };
                      const token = cellToken(cell);
                      const isEditing = editing && cellToken(editing) === token;
                      const value = customValue(item, field.id);
                      const dirty = Boolean(isEditing && !valuesMatch(editing.draft, editing.original));
                      const feedback = <CellState dirty={dirty} state={dirty ? undefined : saveStates[token]} testId={`cell-status-${field.fieldKey}-${slug(item.unitNumber)}`} />;
                      const inputTestId = `custom-field-input-${field.fieldKey}-${slug(item.unitNumber)}`;
                      const draft = isEditing ? editing.draft : value;
                      const selectedOption = typeof value === "string" ? field.options.find((option) => option.label === value) : undefined;
                      const label = selectedOption ? {
                        id: selectedOption.id,
                        fieldKey: field.fieldKey,
                        value: selectedOption.label,
                        color: selectedOption.color,
                        textColor: "#f4f6fa",
                        sortOrder: selectedOption.sortOrder,
                      } : undefined;

                      return (
                        <td key={field.id} className={`${columnClassName(field.fieldKey, true)} ${canEditCustomFields ? "editable-cell custom-cell" : "readonly-cell custom-cell"}`}>
                          {isEditing && canEditCustomFields ? (
                            <div className="cell-editor">
                              {field.fieldType === "SINGLE_SELECT" ? (
                                <select
                                  autoFocus
                                  className="cell-select"
                                  data-testid={inputTestId}
                                  value={typeof draft === "string" ? draft : ""}
                                  onChange={(event) => {
                                    const next = event.target.value || null;
                                    updateDraft(event.target.value);
                                    void saveEdit(cell, next);
                                  }}
                                  onKeyDown={(event) => void handleEditorKeys(event, cell, typeof draft === "string" ? draft || null : null)}
                                  onBlur={() => handleBlur(cell, typeof draft === "string" ? draft || null : null)}
                                >
                                  <option value="">Select</option>
                                  {field.options.filter((option) => !option.isArchived).map((option) => <option key={option.id} value={option.label}>{option.label}</option>)}
                                </select>
                              ) : field.fieldType === "MULTI_SELECT" ? (
                                <select
                                  autoFocus
                                  multiple
                                  data-testid={inputTestId}
                                  value={Array.isArray(draft) ? draft as string[] : []}
                                  onChange={(event) => updateDraft(Array.from(event.target.selectedOptions).map((option) => option.value))}
                                  onKeyDown={(event) => void handleEditorKeys(event, cell, Array.isArray(draft) ? draft : [])}
                                  onBlur={() => handleBlur(cell, Array.isArray(draft) ? draft : [])}
                                >
                                  {field.options.filter((option) => !option.isArchived).map((option) => <option key={option.id} value={option.label}>{option.label}</option>)}
                                </select>
                              ) : field.fieldType === "BOOLEAN" ? (
                                <select
                                  autoFocus
                                  className="cell-select"
                                  data-testid={inputTestId}
                                  value={typeof draft === "boolean" ? String(draft) : typeof draft === "string" ? draft : ""}
                                  onChange={(event) => {
                                    const next = event.target.value === "" ? null : event.target.value === "true";
                                    updateDraft(next);
                                    void saveEdit(cell, next);
                                  }}
                                  onKeyDown={(event) => void handleEditorKeys(event, cell, draft)}
                                  onBlur={() => handleBlur(cell, draft)}
                                >
                                  <option value="">Select</option>
                                  <option value="true">YES</option>
                                  <option value="false">NO</option>
                                </select>
                              ) : field.fieldType === "LONG_TEXT" ? (
                                <textarea
                                  autoFocus
                                  data-testid={inputTestId}
                                  value={typeof draft === "string" ? draft : ""}
                                  onChange={(event) => updateDraft(event.target.value)}
                                  onBlur={() => handleBlur(cell, typeof draft === "string" ? draft || null : null)}
                                  onKeyDown={(event) => void handleEditorKeys(event, cell, typeof draft === "string" ? draft || null : null, true)}
                                />
                              ) : (
                                <input
                                  autoFocus
                                  data-testid={inputTestId}
                                  type={field.fieldType === "NUMBER" ? "number" : field.fieldType === "DATE" ? "date" : "text"}
                                  value={draft === null || draft === undefined ? "" : String(draft)}
                                  onChange={(event) => updateDraft(event.target.value)}
                                  onBlur={() => {
                                    const raw = draft === null || draft === undefined ? "" : String(draft);
                                    handleBlur(cell, raw === "" ? null : field.fieldType === "NUMBER" ? Number(raw) : raw);
                                  }}
                                  onKeyDown={(event) => {
                                    const raw = draft === null || draft === undefined ? "" : String(draft);
                                    void handleEditorKeys(event, cell, raw === "" ? null : field.fieldType === "NUMBER" ? Number(raw) : raw);
                                  }}
                                />
                              )}
                              {(field.fieldType === "SINGLE_SELECT" || field.fieldType === "MULTI_SELECT") && canEditCustomFields ? (
                                <button type="button" data-testid={`manage-options-${field.fieldKey}-${slug(item.unitNumber)}`} className="cell-manage-link" onMouseDown={(event) => event.preventDefault()} onClick={() => openOptionManager(field.fieldKey, field.label, field)}>+ Add option</button>
                              ) : null}
                              {feedback}
                            </div>
                          ) : (
                            <div className="cell-display">
                              <button
                                type="button"
                                data-testid={`custom-field-cell-${field.fieldKey}-${slug(item.unitNumber)}`}
                                className="cell-button cell-button-text"
                                disabled={!canEditCustomFields}
                                aria-label={`Edit ${field.label} for ${item.unitNumber}`}
                                onClick={() => canEditCustomFields && beginEdit(cell)}
                              >
                                {field.fieldType === "SINGLE_SELECT" ? (
                                  <LabelPill value={typeof value === "string" ? value : null} label={label} muted={!canEditCustomFields} />
                                ) : (
                                  <span>{displayCustomValue(value)}</span>
                                )}
                              </button>
                              {feedback}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {canManageItems && archiveState !== "occupied" ? (
                  <tr className="add-item-row">
                    <td className="select-column" />
                    <td colSpan={orderedVisibleColumns.length}>
                      {addGroup === group ? (
                        <div className="inline-add-item" data-testid={`add-item-form-${slug(group)}`}>
                          <span className="inline-add-context">{(activeProperties.find((property) => property.id === newItem.propertyId) ?? propertyForGroup(group))?.code ?? "Choose property"} / {groupName(group)}</span>
                          {!propertyForGroup(group) && activeProperties.length > 1 ? (
                            <select data-testid={`add-item-property-${slug(group)}`} value={newItem.propertyId} onChange={(event) => setNewItem((current) => ({ ...current, propertyId: event.target.value }))}>
                              <option value="">Property</option>
                              {activeProperties.map((property) => <option key={property.id} value={property.id}>{property.code}</option>)}
                            </select>
                          ) : null}
                          <input data-testid={`add-item-unit-number-${slug(group)}`} value={newItem.unitNumber} onChange={(event) => setNewItem((current) => ({ ...current, unitNumber: event.target.value }))} placeholder="Unit number" aria-label="Unit number" />
                          <select data-testid={`add-item-tech-${slug(group)}`} value={newItem.assignedTech} onChange={(event) => setNewItem((current) => ({ ...current, assignedTech: event.target.value }))}>
                            <option value="">Unassigned</option>
                            {staff.map((person) => <option key={person.id} value={person.fullName}>{person.fullName} - {person.role}</option>)}
                          </select>
                          <select value={newItem.makeReadyStatus} onChange={(event) => setNewItem((current) => ({ ...current, makeReadyStatus: event.target.value }))}>
                            <option value="">Status</option>
                            {Object.values(labelsByField.makeReadyStatus ?? {}).filter((label) => !label.isArchived).map((label) => <option key={label.id} value={label.value}>{label.value}</option>)}
                          </select>
                          <button data-testid={`add-item-save-${slug(group)}`} className="button button-primary" disabled={!newItem.unitNumber.trim() || !(newItem.propertyId || propertyForGroup(group))} onClick={() => void createInGroup(group)}>Add</button>
                          <button className="button button-ghost" onClick={() => setAddGroup(null)}>Cancel</button>
                        </div>
                      ) : (
                        <button data-testid={`add-item-row-${slug(group)}`} className="add-item-button" onClick={() => {
                          setAddGroup(group);
                          setNewItem((current) => ({ ...current, propertyId: propertyForGroup(group)?.id ?? (current.propertyId || activeProperties[0]?.id || ""), unitNumber: "", assignedTech: "" }));
                        }}>+ Add item</button>
                      )}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      <Modal
        open={Boolean(optionTarget)}
        title={`Manage ${optionTarget?.label ?? "status"} options`}
        testId="table-option-modal"
        onClose={() => setOptionTarget(null)}
        actions={(
          <>
            <button type="button" className="button button-ghost" onClick={() => setOptionTarget(null)}>Cancel</button>
            <button type="button" data-testid="table-option-save-existing" className="button button-secondary" disabled={optionBusy} onClick={() => void saveManagedOptions()}>
              Save changes
            </button>
            <button type="button" data-testid="table-option-save" className="button button-primary" disabled={optionBusy || !quickOption.value.trim()} onClick={() => void createQuickOption()}>
              Add option
            </button>
          </>
        )}
      >
        <p className="modal-copy">New choices become selectable immediately. Archived choices remain stored for historical rows.</p>
        <div className="quick-option-form">
          <label>Label<input autoFocus data-testid="table-option-label" value={quickOption.value} onChange={(event) => setQuickOption((current) => ({ ...current, value: event.target.value }))} /></label>
          <label>Color<input data-testid="table-option-color" type="color" value={quickOption.color} onChange={(event) => setQuickOption((current) => ({ ...current, color: event.target.value }))} /></label>
        </div>
        <div className="inline-option-list">
          {optionsForTarget.map((option, index) => {
            const draft = optionDrafts[option.id] ?? {
              value: "value" in option ? option.value : option.label,
              color: option.color,
              isArchived: Boolean(option.isArchived),
            };
            return (
              <div className="inline-option-row" key={option.id}>
                <input aria-label={`Rename ${"value" in option ? option.value : option.label}`} data-testid={`table-option-edit-${option.id}`} value={draft.value} onChange={(event) => setOptionDrafts((current) => ({ ...current, [option.id]: { ...draft, value: event.target.value } }))} />
                <input type="color" aria-label={`Color for ${draft.value}`} value={draft.color} onChange={(event) => setOptionDrafts((current) => ({ ...current, [option.id]: { ...draft, color: event.target.value } }))} />
                <label><input type="checkbox" checked={draft.isArchived} onChange={(event) => setOptionDrafts((current) => ({ ...current, [option.id]: { ...draft, isArchived: event.target.checked } }))} /> Archived</label>
                <button type="button" className="icon-button" aria-label={`Move ${draft.value} up`} disabled={index === 0} onClick={() => void moveManagedOption(option.id, -1)}>↑</button>
                <button type="button" className="icon-button" aria-label={`Move ${draft.value} down`} disabled={index === optionsForTarget.length - 1} onClick={() => void moveManagedOption(option.id, 1)}>↓</button>
              </div>
            );
          })}
        </div>
        {!optionTarget?.customField ? <button type="button" className="cell-manage-link full-settings-link" onClick={() => { setOptionTarget(null); onOpenBoardSetup(); }}>Open full label management</button> : <button type="button" className="cell-manage-link full-settings-link" onClick={() => { setOptionTarget(null); onOpenFieldManager(); }}>Open full field management</button>}
      </Modal>
      <Modal
        open={Boolean(columnRename)}
        title={`Rename ${columnRename?.label ?? "column"}`}
        testId="column-rename-modal"
        onClose={() => setColumnRename(null)}
        actions={(
          <>
            {columnRename && !columnRename.customField && columnRename.defaultLabel && columnRename.label !== columnRename.defaultLabel ? (
              <button type="button" data-testid="column-label-reset" className="button button-secondary" onClick={async () => {
                await onRenameBuiltInColumn(columnRename.key, "", true);
                setColumnRename(null);
              }}>Reset default</button>
            ) : null}
            <button type="button" className="button button-ghost" onClick={() => setColumnRename(null)}>Cancel</button>
            <button type="button" data-testid="column-rename-save" className="button button-primary" disabled={!columnRename?.label.trim()} onClick={async () => {
              if (!columnRename) return;
              if (columnRename.customField) await onRenameCustomColumn(columnRename.customField, columnRename.label.trim());
              else await onRenameBuiltInColumn(columnRename.key, columnRename.label.trim());
              setColumnRename(null);
            }}>Save label</button>
          </>
        )}
      >
        <label className="inline-config-field">Display label
          <input autoFocus data-testid="column-rename-input" value={columnRename?.label ?? ""} onChange={(event) => setColumnRename((current) => current ? { ...current, label: event.target.value } : current)} />
        </label>
        <p className="modal-copy">Internal key <code>{columnRename?.customField?.fieldKey ?? columnRename?.key}</code> remains unchanged for rules, imports, exports and saved views.</p>
      </Modal>
      <Modal
        open={floorPlanPropertyId !== null}
        title="Manage floor plans"
        testId="inline-floor-plan-modal"
        onClose={() => setFloorPlanPropertyId(null)}
        actions={<button type="button" className="button button-ghost" onClick={() => setFloorPlanPropertyId(null)}>Close</button>}
      >
        <label className="inline-config-field">Property
          <select data-testid="inline-floor-plan-property" value={floorPlanPropertyId ?? ""} onChange={(event) => { setFloorPlanPropertyId(event.target.value); setSelectedPlanId(""); }}>
            {activeProperties.map((property) => <option key={property.id} value={property.id}>{property.code} - {property.name}</option>)}
          </select>
        </label>
        <form className="inline-plan-form" onSubmit={async (event) => {
          event.preventDefault();
          if (!floorPlanPropertyId || !newPlan.code.trim()) return;
          await onCreateFloorPlan({
            propertyId: floorPlanPropertyId,
            code: newPlan.code.trim(),
            name: newPlan.name.trim() || newPlan.code.trim(),
            bedrooms: numberOrNull(newPlan.bedrooms),
            bathrooms: numberOrNull(newPlan.bathrooms),
            squareFeet: numberOrNull(newPlan.squareFeet),
            description: newPlan.description.trim() || null,
          });
          setNewPlan({ code: "", name: "", bedrooms: "", bathrooms: "", squareFeet: "", description: "" });
        }}>
          <input data-testid="inline-floor-plan-code" placeholder="Code (B1, C2)" value={newPlan.code} onChange={(event) => setNewPlan((current) => ({ ...current, code: event.target.value }))} required />
          <input data-testid="inline-floor-plan-name" placeholder="Friendly name (Arlington)" value={newPlan.name} onChange={(event) => setNewPlan((current) => ({ ...current, name: event.target.value }))} />
          <input data-testid="inline-floor-plan-beds" type="number" min="0" placeholder="Beds" value={newPlan.bedrooms} onChange={(event) => setNewPlan((current) => ({ ...current, bedrooms: event.target.value }))} />
          <input data-testid="inline-floor-plan-baths" type="number" step="0.5" min="0" placeholder="Baths" value={newPlan.bathrooms} onChange={(event) => setNewPlan((current) => ({ ...current, bathrooms: event.target.value }))} />
          <input data-testid="inline-floor-plan-sqft" type="number" min="1" placeholder="Sq ft" value={newPlan.squareFeet} onChange={(event) => setNewPlan((current) => ({ ...current, squareFeet: event.target.value }))} />
          <input data-testid="inline-floor-plan-description" className="span-full" placeholder="Description" value={newPlan.description} onChange={(event) => setNewPlan((current) => ({ ...current, description: event.target.value }))} />
          <button type="submit" data-testid="inline-floor-plan-add" className="button button-primary span-full">Add floor plan</button>
        </form>
        <div className="inline-plan-list">
          {plansForInlineManager.map((plan) => (
            <button type="button" className={selectedPlanId === plan.id ? "record-row selected" : "record-row"} key={plan.id} onClick={() => {
              setSelectedPlanId(plan.id);
              setPlanDraft({ code: plan.code, name: plan.name, bedrooms: plan.bedrooms?.toString() ?? "", bathrooms: plan.bathrooms?.toString() ?? "", squareFeet: plan.squareFeet?.toString() ?? "", description: plan.description ?? "" });
            }}>
              <span><strong>{floorPlanLabel(plan)}</strong>{plan.squareFeet ? ` ${plan.squareFeet} sq ft` : " No square footage"}</span>
              <span className={plan.isActive ? "status-chip active" : "status-chip inactive"}>{plan.isActive ? "Active" : "Archived"}</span>
            </button>
          ))}
        </div>
        {selectedPlan ? (
          <div className="inline-plan-editor" data-testid="inline-floor-plan-editor">
            <input data-testid="inline-floor-plan-edit-code" value={planDraft.code} onChange={(event) => setPlanDraft((current) => ({ ...current, code: event.target.value }))} />
            <input data-testid="inline-floor-plan-edit-name" value={planDraft.name} onChange={(event) => setPlanDraft((current) => ({ ...current, name: event.target.value }))} />
            <input type="number" min="0" value={planDraft.bedrooms} onChange={(event) => setPlanDraft((current) => ({ ...current, bedrooms: event.target.value }))} />
            <input type="number" step="0.5" min="0" value={planDraft.bathrooms} onChange={(event) => setPlanDraft((current) => ({ ...current, bathrooms: event.target.value }))} />
            <input type="number" min="1" value={planDraft.squareFeet} onChange={(event) => setPlanDraft((current) => ({ ...current, squareFeet: event.target.value }))} />
            <input className="span-full" value={planDraft.description} onChange={(event) => setPlanDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Description" />
            <button data-testid="inline-floor-plan-save" type="button" className="button button-primary" onClick={() => void onUpdateFloorPlan(selectedPlan.id, { code: planDraft.code.trim(), name: planDraft.name.trim() || planDraft.code.trim(), bedrooms: numberOrNull(planDraft.bedrooms), bathrooms: numberOrNull(planDraft.bathrooms), squareFeet: numberOrNull(planDraft.squareFeet), description: planDraft.description.trim() || null })}>Save</button>
            <button data-testid={selectedPlan.isActive ? "inline-floor-plan-archive" : "inline-floor-plan-restore"} type="button" className="button button-secondary" onClick={() => void onArchiveFloorPlan(selectedPlan.id, !selectedPlan.isActive)}>{selectedPlan.isActive ? "Archive" : "Restore"}</button>
          </div>
        ) : null}
      </Modal>
      <ConfirmDialog
        open={Boolean(pendingGroupMove)}
        title="Move selected items?"
        description={`Move ${selectedIds.length} selected make-ready item${selectedIds.length === 1 ? "" : "s"} to ${pendingGroupMove ? groupName(pendingGroupMove) : "the selected section"}?`}
        confirmLabel="Move items"
        onClose={() => setPendingGroupMove(null)}
        onConfirm={async () => {
          if (!pendingGroupMove) return;
          await applyBatch({ action: "MOVE_GROUP", ids: selectedIds, boardGroup: pendingGroupMove });
          setBatchGroup("");
          setPendingGroupMove(null);
        }}
      />
    </div>
  );
}
