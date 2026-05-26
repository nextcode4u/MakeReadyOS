import { useEffect, useMemo, useState } from "react";
import type { BoardSection, FloorPlan, LabelDefinition, MakeReadyItem, Property, StaffOption, Unit, UserRole } from "../lib/api";
import { ConfirmDialog } from "./ConfirmDialog";
import { StatusState } from "./StatusState";

type Props = {
  role: UserRole;
  properties: Property[];
  units: Unit[];
  floorPlans: FloorPlan[];
  labels: LabelDefinition[];
  staff: StaffOption[];
  items: MakeReadyItem[];
  boardGroups: string[];
  boardSections: BoardSection[];
  loading: boolean;
  message?: string;
  error?: string;
  onCreateProperty: (input: { name: string; code: string }) => Promise<void>;
  onUpdateProperty: (id: string, input: { name: string; code: string }) => Promise<void>;
  onArchiveProperty: (id: string, restore: boolean) => Promise<void>;
  onDeleteProperty: (id: string) => Promise<void>;
  onCreateUnit: (input: { propertyId: string; number: string; floorPlanId: string | null; floorPlan: string | null; squareFeet: number | null }) => Promise<void>;
  onUpdateUnit: (id: string, input: { propertyId: string; number: string; floorPlanId: string | null; floorPlan: string | null; squareFeet: number | null }) => Promise<void>;
  onArchiveUnit: (id: string, restore: boolean) => Promise<void>;
  onDeleteUnit: (id: string) => Promise<void>;
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
    makeReadyDate: string | null;
    moveInDate: string | null;
    scopeLevel: string | null;
    assignedTech: string | null;
  }) => Promise<void>;
  onArchiveItem: (id: string, restore: boolean) => Promise<void>;
};

type ConfirmTarget =
  | { type: "property"; operation: "archive" | "delete"; record: Property }
  | { type: "unit"; operation: "archive" | "delete"; record: Unit }
  | { type: "item"; operation: "archive"; record: MakeReadyItem }
  | null;

function displayGroup(group: string) {
  return group.replace(/_/g, " ");
}

export function OperationsPanel({
  role,
  properties,
  units,
  floorPlans,
  labels,
  staff,
  items,
  boardGroups,
  boardSections,
  loading,
  message,
  error,
  onCreateProperty,
  onUpdateProperty,
  onArchiveProperty,
  onDeleteProperty,
  onCreateUnit,
  onUpdateUnit,
  onArchiveUnit,
  onDeleteUnit,
  onCreateItem,
  onArchiveItem,
}: Props) {
  const activeProperties = properties.filter((property) => property.isActive);
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [showArchivedItems, setShowArchivedItems] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget>(null);
  const [propertyDraft, setPropertyDraft] = useState({ name: "", code: "" });
  const [newProperty, setNewProperty] = useState({ name: "", code: "" });
  const [unitDraft, setUnitDraft] = useState({ propertyId: "", number: "", floorPlanId: "", floorPlan: "", squareFeet: "" });
  const [newUnit, setNewUnit] = useState({ propertyId: "", number: "", floorPlanId: "", floorPlan: "", squareFeet: "" });
  const [newItem, setNewItem] = useState({
    propertyId: "",
    unitId: "",
    boardGroup: "MAKE_READY_BOARD_TA",
    vacancyStatus: "TO WALK",
    makeReadyStatus: "",
    completionStatus: "NO",
    makeReadyDate: "",
    moveInDate: "",
    scopeLevel: "",
    assignedTech: "",
  });

  useEffect(() => {
    if (!selectedPropertyId && properties[0]) setSelectedPropertyId(properties[0].id);
  }, [properties, selectedPropertyId]);

  const selectedProperty = properties.find((property) => property.id === selectedPropertyId) ?? null;
  const unitsForProperty = units.filter((unit) => unit.propertyId === selectedPropertyId);
  const selectedUnit = units.find((unit) => unit.id === selectedUnitId) ?? null;
  const activeUnitsForItem = units.filter((unit) => unit.propertyId === newItem.propertyId && unit.isActive);
  const sectionsForNewItem = boardSections
    .filter((section) => section.propertyId === newItem.propertyId && section.isActive && section.sectionType !== "ARCHIVE")
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const floorPlansForNewUnit = floorPlans.filter((plan) => plan.propertyId === newUnit.propertyId && plan.isActive);
  const floorPlansForEditUnit = floorPlans.filter((plan) => plan.propertyId === unitDraft.propertyId && plan.isActive);
  const labelOptions = (key: string) => labels.filter((label) => label.fieldKey === key && !label.isArchived);
  const visibleItems = useMemo(
    () => items.filter((item) => (showArchivedItems ? true : !item.isArchived)),
    [items, showArchivedItems],
  );

  useEffect(() => {
    if (!selectedProperty) return;
    setPropertyDraft({ name: selectedProperty.name, code: selectedProperty.code });
    setNewUnit((current) => ({ ...current, propertyId: selectedProperty.isActive ? selectedProperty.id : activeProperties[0]?.id ?? "" }));
  }, [selectedProperty]);

  useEffect(() => {
    if (!selectedUnit) return;
    setUnitDraft({
      propertyId: selectedUnit.propertyId,
      number: selectedUnit.number,
      floorPlanId: selectedUnit.floorPlanId ?? "",
      floorPlan: selectedUnit.floorPlan ?? "",
      squareFeet: selectedUnit.squareFeet?.toString() ?? "",
    });
  }, [selectedUnit]);

  useEffect(() => {
    if (!newItem.propertyId && activeProperties[0]) {
      setNewItem((current) => ({ ...current, propertyId: activeProperties[0].id }));
    }
  }, [activeProperties, newItem.propertyId]);

  useEffect(() => {
    if (!newItem.propertyId || sectionsForNewItem.length === 0) return;
    if (!sectionsForNewItem.some((section) => section.key === newItem.boardGroup)) {
      const preferredSection = sectionsForNewItem.find((section) => section.sectionType === "MAKE_READY") ?? sectionsForNewItem[0];
      setNewItem((current) => ({ ...current, boardGroup: preferredSection.key }));
    }
  }, [newItem.boardGroup, newItem.propertyId, sectionsForNewItem]);

  const chooseItemUnit = (unitId: string) => {
    setNewItem((current) => ({ ...current, unitId }));
  };

  const createItem = async () => {
    const unit = units.find((candidate) => candidate.id === newItem.unitId);
    if (!unit) return;
    await onCreateItem({
      propertyId: newItem.propertyId,
      unitId: unit.id,
      boardGroup: newItem.boardGroup,
      itemName: unit.number,
      unitNumber: unit.number,
      floorPlan: unit.floorPlan,
      vacancyStatus: newItem.vacancyStatus || null,
      makeReadyStatus: newItem.makeReadyStatus || null,
      completionStatus: newItem.completionStatus || null,
      makeReadyDate: newItem.makeReadyDate || null,
      moveInDate: newItem.moveInDate || null,
      scopeLevel: newItem.scopeLevel || null,
      assignedTech: newItem.assignedTech || null,
    });
    setNewItem((current) => ({ ...current, unitId: "", makeReadyDate: "", moveInDate: "", scopeLevel: "", assignedTech: "" }));
  };

  return (
    <div className="operations-panel" data-testid="operations-panel">
      <header className="operations-header">
        <div>
          <p className="eyebrow">Board Setup</p>
          <h2>Properties, Units & Turns</h2>
          <p className="subtitle">Maintain the inventory behind the board and safely archive completed or retired records.</p>
        </div>
        <span className="role-chip">{role} ACCESS</span>
      </header>

      {message ? <div className="admin-message success">{message}</div> : null}
      {error ? <div className="admin-message error">{error}</div> : null}

      <section className="operations-grid">
        <article className="operations-card" data-testid="property-management">
          <div className="admin-section-head">
            <h3>Properties</h3>
            <span className="subtitle">{activeProperties.length} active</span>
          </div>
          {role === "ADMIN" ? (
            <form className="compact-form" onSubmit={(event) => {
              event.preventDefault();
              void onCreateProperty(newProperty).then(() => setNewProperty({ name: "", code: "" }));
            }}>
              <input data-testid="property-create-name" placeholder="Property name" value={newProperty.name} onChange={(event) => setNewProperty((current) => ({ ...current, name: event.target.value }))} required />
              <input data-testid="property-create-code" placeholder="Code" value={newProperty.code} onChange={(event) => setNewProperty((current) => ({ ...current, code: event.target.value }))} required />
              <button data-testid="property-create-submit" className="button button-primary" disabled={loading}>Add Property</button>
            </form>
          ) : <p className="helper-copy">Managers can edit assigned properties; administrators add or archive inventory.</p>}
          <div className="record-list">
            {properties.length === 0 ? <StatusState title="No properties assigned" description="An administrator must add or assign a property." tone="subtle" /> : properties.map((property) => (
              <button key={property.id} type="button" data-testid={`property-row-${property.code.toLowerCase()}`} className={selectedPropertyId === property.id ? "record-row selected" : "record-row"} onClick={() => setSelectedPropertyId(property.id)}>
                <span><strong>{property.code}</strong>{property.name}</span>
                <span className={property.isActive ? "status-chip active" : "status-chip inactive"}>{property.isActive ? "Active" : "Archived"}</span>
              </button>
            ))}
          </div>
          {selectedProperty ? (
            <div className="editor-block">
              <label>Name<input data-testid="property-edit-name" value={propertyDraft.name} onChange={(event) => setPropertyDraft((current) => ({ ...current, name: event.target.value }))} /></label>
              <label>Code<input data-testid="property-edit-code" value={propertyDraft.code} onChange={(event) => setPropertyDraft((current) => ({ ...current, code: event.target.value }))} /></label>
              <div className="admin-actions">
                <button data-testid="property-save" className="button button-primary" disabled={loading} onClick={() => void onUpdateProperty(selectedProperty.id, propertyDraft)}>Save</button>
                {role === "ADMIN" ? (
                  <button data-testid={selectedProperty.isActive ? "property-archive" : "property-restore"} className={selectedProperty.isActive ? "button button-danger" : "button button-secondary"} onClick={() => selectedProperty.isActive ? setConfirmTarget({ type: "property", operation: "archive", record: selectedProperty }) : void onArchiveProperty(selectedProperty.id, true)}>
                    {selectedProperty.isActive ? "Archive" : "Restore"}
                  </button>
                ) : null}
                {role === "ADMIN" && !selectedProperty.isActive ? <button data-testid="property-delete" className="button button-danger" onClick={() => setConfirmTarget({ type: "property", operation: "delete", record: selectedProperty })}>Delete</button> : null}
              </div>
            </div>
          ) : null}
        </article>

        <article className="operations-card" data-testid="unit-management">
          <div className="admin-section-head">
            <h3>Units</h3>
            <span className="subtitle">{unitsForProperty.length} in selected property</span>
          </div>
          <form className="compact-form" onSubmit={(event) => {
            event.preventDefault();
            void onCreateUnit({
              propertyId: newUnit.propertyId,
              number: newUnit.number,
              floorPlanId: newUnit.floorPlanId || null,
              floorPlan: newUnit.floorPlan || null,
              squareFeet: newUnit.squareFeet ? Number(newUnit.squareFeet) : null,
            }).then(() => setNewUnit((current) => ({ ...current, number: "", floorPlanId: "", floorPlan: "", squareFeet: "" })));
          }}>
            <select data-testid="unit-create-property" value={newUnit.propertyId} onChange={(event) => setNewUnit((current) => ({ ...current, propertyId: event.target.value }))} required>
              <option value="">Select property</option>
              {activeProperties.map((property) => <option key={property.id} value={property.id}>{property.code}</option>)}
            </select>
            <input data-testid="unit-create-number" placeholder="Unit number" value={newUnit.number} onChange={(event) => setNewUnit((current) => ({ ...current, number: event.target.value }))} required />
            <select data-testid="unit-create-floor-plan-managed" value={newUnit.floorPlanId} onChange={(event) => setNewUnit((current) => ({ ...current, floorPlanId: event.target.value }))}><option value="">Legacy/freeform</option>{floorPlansForNewUnit.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select>
            <input data-testid="unit-create-floor-plan" placeholder="Legacy floor plan text" value={newUnit.floorPlan} onChange={(event) => setNewUnit((current) => ({ ...current, floorPlan: event.target.value }))} />
            <input data-testid="unit-create-square-feet" type="number" min="1" placeholder="Sq ft" value={newUnit.squareFeet} onChange={(event) => setNewUnit((current) => ({ ...current, squareFeet: event.target.value }))} />
            <button data-testid="unit-create-submit" className="button button-primary" disabled={loading || !newUnit.propertyId}>Add Unit</button>
          </form>
          <div className="record-list unit-list">
            {unitsForProperty.length === 0 ? <StatusState title="No units found" description="Add a unit to start a make-ready turn." tone="subtle" /> : unitsForProperty.map((unit) => (
              <button key={unit.id} type="button" data-testid={`unit-row-${unit.number.toLowerCase()}`} className={selectedUnitId === unit.id ? "record-row selected" : "record-row"} onClick={() => setSelectedUnitId(unit.id)}>
                <span><strong>{unit.number}</strong>{unit.floorPlan || "No floor plan"}</span>
                <span className={unit.isActive ? "status-chip active" : "status-chip inactive"}>{unit.isActive ? "Active" : "Archived"}</span>
              </button>
            ))}
          </div>
          {selectedUnit ? (
            <div className="editor-block">
              <label>Property<select data-testid="unit-edit-property" value={unitDraft.propertyId} onChange={(event) => setUnitDraft((current) => ({ ...current, propertyId: event.target.value }))}>{activeProperties.map((property) => <option key={property.id} value={property.id}>{property.code}</option>)}</select></label>
              <label>Unit<input data-testid="unit-edit-number" value={unitDraft.number} onChange={(event) => setUnitDraft((current) => ({ ...current, number: event.target.value }))} /></label>
              <label>Managed floor plan<select data-testid="unit-edit-floor-plan-managed" value={unitDraft.floorPlanId} onChange={(event) => setUnitDraft((current) => ({ ...current, floorPlanId: event.target.value }))}><option value="">Legacy/freeform</option>{floorPlansForEditUnit.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
              <label>Legacy text<input data-testid="unit-edit-floor-plan" value={unitDraft.floorPlan} onChange={(event) => setUnitDraft((current) => ({ ...current, floorPlan: event.target.value }))} /></label>
              <label>Square feet<input data-testid="unit-edit-square-feet" type="number" value={unitDraft.squareFeet} onChange={(event) => setUnitDraft((current) => ({ ...current, squareFeet: event.target.value }))} /></label>
              <div className="admin-actions span-full">
                <button data-testid="unit-save" className="button button-primary" onClick={() => void onUpdateUnit(selectedUnit.id, { propertyId: unitDraft.propertyId, number: unitDraft.number, floorPlanId: unitDraft.floorPlanId || null, floorPlan: unitDraft.floorPlan || null, squareFeet: unitDraft.squareFeet ? Number(unitDraft.squareFeet) : null })}>Save</button>
                <button data-testid={selectedUnit.isActive ? "unit-archive" : "unit-restore"} className={selectedUnit.isActive ? "button button-danger" : "button button-secondary"} onClick={() => selectedUnit.isActive ? setConfirmTarget({ type: "unit", operation: "archive", record: selectedUnit }) : void onArchiveUnit(selectedUnit.id, true)}>{selectedUnit.isActive ? "Archive" : "Restore"}</button>
                {!selectedUnit.isActive ? <button data-testid="unit-delete" className="button button-danger" onClick={() => setConfirmTarget({ type: "unit", operation: "delete", record: selectedUnit })}>Delete</button> : null}
              </div>
            </div>
          ) : null}
        </article>
      </section>

      <section className="operations-grid turns-grid">
        <article className="operations-card" data-testid="turn-create-panel">
          <div className="admin-section-head">
            <h3>New Make-Ready Item</h3>
            <span className="subtitle">Create a turnover from an active unit</span>
          </div>
          <div className="turn-form">
            <label>Property<select data-testid="item-create-property" value={newItem.propertyId} onChange={(event) => setNewItem((current) => ({ ...current, propertyId: event.target.value, unitId: "" }))}>{activeProperties.map((property) => <option key={property.id} value={property.id}>{property.code} - {property.name}</option>)}</select></label>
            <label>Unit<select data-testid="item-create-unit" value={newItem.unitId} onChange={(event) => chooseItemUnit(event.target.value)}><option value="">Select unit</option>{activeUnitsForItem.map((unit) => <option key={unit.id} value={unit.id}>{unit.number} - {unit.floorPlan || "No floor plan"}</option>)}</select></label>
            <label>Section<select data-testid="item-create-group" value={newItem.boardGroup} onChange={(event) => setNewItem((current) => ({ ...current, boardGroup: event.target.value }))}>{sectionsForNewItem.map((section) => <option key={section.id} value={section.key}>{section.displayName}</option>)}</select></label>
            <label>Vacancy<select data-testid="item-create-vacancy" value={newItem.vacancyStatus} onChange={(event) => setNewItem((current) => ({ ...current, vacancyStatus: event.target.value }))}>{labelOptions("vacancyStatus").map((option) => <option key={option.id} value={option.value}>{option.value}</option>)}</select></label>
            <label>Make-ready status<select data-testid="item-create-status" value={newItem.makeReadyStatus} onChange={(event) => setNewItem((current) => ({ ...current, makeReadyStatus: event.target.value }))}><option value="">Unset</option>{labelOptions("makeReadyStatus").map((option) => <option key={option.id} value={option.value}>{option.value}</option>)}</select></label>
            <label>Scope<select data-testid="item-create-scope" value={newItem.scopeLevel} onChange={(event) => setNewItem((current) => ({ ...current, scopeLevel: event.target.value }))}><option value="">Unset</option>{labelOptions("scopeLevel").map((option) => <option key={option.id} value={option.value}>{option.value}</option>)}</select></label>
            <label>Assigned tech<select data-testid="item-create-assigned-tech" value={newItem.assignedTech} onChange={(event) => setNewItem((current) => ({ ...current, assignedTech: event.target.value }))}><option value="">Unassigned</option>{staff.map((person) => <option key={person.id} value={person.fullName}>{person.fullName} - {person.role}</option>)}</select></label>
            <label>Make-ready date<input data-testid="item-create-make-ready-date" type="date" value={newItem.makeReadyDate} onChange={(event) => setNewItem((current) => ({ ...current, makeReadyDate: event.target.value }))} /></label>
            <label>Move-in date<input data-testid="item-create-move-in-date" type="date" value={newItem.moveInDate} onChange={(event) => setNewItem((current) => ({ ...current, moveInDate: event.target.value }))} /></label>
            <button data-testid="item-create-submit" className="button button-primary span-full" disabled={loading || !newItem.unitId} onClick={() => void createItem()}>Create Make-Ready Item</button>
          </div>
        </article>

        <article className="operations-card" data-testid="turn-lifecycle-panel">
          <div className="admin-section-head">
            <h3>Turn Lifecycle</h3>
            <label className="toggle-row">
              <input data-testid="item-show-archived" type="checkbox" checked={showArchivedItems} onChange={(event) => setShowArchivedItems(event.target.checked)} />
              Show archived
            </label>
          </div>
          <div className="turn-list">
            {visibleItems.length === 0 ? <StatusState title="No turnover records" description="Create a make-ready item or display archived history." tone="subtle" /> : visibleItems.slice(0, 40).map((item) => (
              <div className="turn-row" data-testid={`turn-row-${item.unitNumber.toLowerCase()}`} key={item.id}>
                <div>
                  <strong>{item.unitNumber}</strong>
                  <span>{item.property.code} / {displayGroup(item.boardGroup)}</span>
                </div>
                <span className={item.isArchived ? "status-chip inactive" : "status-chip active"}>{item.isArchived ? "Archived" : item.makeReadyStatus || "Active"}</span>
                <button data-testid={`${item.isArchived ? "item-restore" : "item-archive"}-${item.unitNumber.toLowerCase()}`} className={item.isArchived ? "button button-secondary" : "button button-danger"} onClick={() => item.isArchived ? void onArchiveItem(item.id, true) : setConfirmTarget({ type: "item", operation: "archive", record: item })}>
                  {item.isArchived ? "Restore" : "Archive"}
                </button>
              </div>
            ))}
          </div>
        </article>
      </section>

      <ConfirmDialog
        open={Boolean(confirmTarget)}
        title={`${confirmTarget?.operation === "delete" ? "Delete" : "Archive"} ${confirmTarget?.type ?? "record"}`}
        description={confirmTarget?.operation === "delete" ? "Deletion is permitted only when no linked operational history remains. This action cannot be undone." : "This hides the record from active workflows without deleting its history. It can be restored later."}
        confirmLabel={confirmTarget?.operation === "delete" ? "Delete" : "Archive"}
        tone="danger"
        onClose={() => setConfirmTarget(null)}
        onConfirm={async () => {
          if (!confirmTarget) return;
          if (confirmTarget.type === "property" && confirmTarget.operation === "delete") await onDeleteProperty(confirmTarget.record.id);
          else if (confirmTarget.type === "property") await onArchiveProperty(confirmTarget.record.id, false);
          if (confirmTarget.type === "unit" && confirmTarget.operation === "delete") await onDeleteUnit(confirmTarget.record.id);
          else if (confirmTarget.type === "unit") await onArchiveUnit(confirmTarget.record.id, false);
          if (confirmTarget.type === "item") await onArchiveItem(confirmTarget.record.id, false);
          setConfirmTarget(null);
        }}
      />
    </div>
  );
}
