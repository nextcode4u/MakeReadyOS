import { useEffect, useMemo, useState } from "react";
import type { BoardColumnDefinition, CustomField, FloorPlan, LabelDefinition, Property, ScheduleTrack } from "../lib/api";
import { LabelPill } from "./LabelPill";
import { StatusState } from "./StatusState";

const optionSets = [
  ["vacancyStatus", "Vacancy"],
  ["scopeLevel", "Scope"],
  ["paintStatus", "Paint"],
  ["doorsStatus", "Doors"],
  ["completionStatus", "Completed"],
  ["sheetrockStatus", "Sheetrock"],
  ["pestStatus", "Pest"],
  ["trashOutStatus", "Trash Out"],
  ["floorsStatus", "Floors"],
  ["makeReadyStatus", "Make Ready"],
  ["cleaningStatus", "Cleaning"],
  ["keysMadeStatus", "Keys Made"],
  ["cabinetsStatus", "Cabinets"],
] as const;

type Props = {
  properties: Property[];
  options: LabelDefinition[];
  floorPlans: FloorPlan[];
  columns: BoardColumnDefinition[];
  scheduleTracks: ScheduleTrack[];
  customFields: CustomField[];
  loading: boolean;
  onCreateOption: (input: { fieldKey: string; value: string; color: string; textColor: string }) => Promise<void>;
  onUpdateOption: (id: string, input: Partial<Pick<LabelDefinition, "value" | "color" | "textColor">>) => Promise<void>;
  onArchiveOption: (id: string, restore: boolean) => Promise<void>;
  onReorderOptions: (ids: string[]) => Promise<void>;
  onCreateFloorPlan: (input: { propertyId: string; name: string; bedrooms: number | null; bathrooms: number | null; squareFeet: number | null; description: string | null }) => Promise<void>;
  onUpdateFloorPlan: (id: string, input: { name: string; bedrooms: number | null; bathrooms: number | null; squareFeet: number | null; description: string | null }) => Promise<void>;
  onArchiveFloorPlan: (id: string, restore: boolean) => Promise<void>;
  onUpdateColumn: (fieldKey: string, label: string) => Promise<void>;
  onCreateScheduleTrack: (input: Omit<ScheduleTrack, "id" | "sortOrder">) => Promise<void>;
  onUpdateScheduleTrack: (id: string, input: Partial<Omit<ScheduleTrack, "id" | "sortOrder">>) => Promise<void>;
  onArchiveScheduleTrack: (id: string, restore: boolean) => Promise<void>;
  onReorderScheduleTracks: (ids: string[]) => Promise<void>;
};

export function BoardConfigurationPanel({
  properties,
  options,
  floorPlans,
  columns,
  scheduleTracks,
  customFields,
  loading,
  onCreateOption,
  onUpdateOption,
  onArchiveOption,
  onReorderOptions,
  onCreateFloorPlan,
  onUpdateFloorPlan,
  onArchiveFloorPlan,
  onUpdateColumn,
  onCreateScheduleTrack,
  onUpdateScheduleTrack,
  onArchiveScheduleTrack,
  onReorderScheduleTracks,
}: Props) {
  const [fieldKey, setFieldKey] = useState<string>("vacancyStatus");
  const [newOption, setNewOption] = useState({ value: "", color: "#46d39c", textColor: "#06291c" });
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [optionDraft, setOptionDraft] = useState({ value: "", color: "#46d39c", textColor: "#06291c" });
  const fieldOptions = useMemo(() => options.filter((option) => option.fieldKey === fieldKey), [fieldKey, options]);
  const selectedOption = fieldOptions.find((option) => option.id === selectedOptionId) ?? null;

  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? "");
  const [newPlan, setNewPlan] = useState({ name: "", bedrooms: "", bathrooms: "", squareFeet: "", description: "" });
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [planDraft, setPlanDraft] = useState({ name: "", bedrooms: "", bathrooms: "", squareFeet: "", description: "" });
  const propertyPlans = floorPlans.filter((plan) => plan.propertyId === propertyId);
  const selectedPlan = propertyPlans.find((plan) => plan.id === selectedPlanId) ?? null;
  const [selectedColumnKey, setSelectedColumnKey] = useState("vacatedDate");
  const [columnLabel, setColumnLabel] = useState("");
  const selectedColumn = columns.find((column) => column.fieldKey === selectedColumnKey) ?? null;
  const blankTrack = { sourceField: "", displayName: "", colorBasis: "NEUTRAL" as ScheduleTrack["colorBasis"], colorSourceField: null as string | null, fixedColor: "#58a6de", groupingMode: "NONE" as ScheduleTrack["groupingMode"], visibilityFilter: null, overdueEnabled: true, moveInSoonEnabled: true, isEnabled: true, isArchived: false };
  const [newTrack, setNewTrack] = useState(blankTrack);
  const [selectedTrackId, setSelectedTrackId] = useState("");
  const selectedTrack = scheduleTracks.find((track) => track.id === selectedTrackId) ?? null;
  const [trackDraft, setTrackDraft] = useState({ sourceField: "", displayName: "", colorBasis: "NEUTRAL" as ScheduleTrack["colorBasis"], colorSourceField: null as string | null, fixedColor: "#58a6de", groupingMode: "NONE" as ScheduleTrack["groupingMode"], visibilityFilter: null as ScheduleTrack["visibilityFilter"], overdueEnabled: true, moveInSoonEnabled: true, isEnabled: true });
  const configuredSources = new Set(scheduleTracks.map((track) => track.sourceField));
  const scheduleSources = [
    { key: "moveOutDate", label: "NTV / Expected Vacate" },
    { key: "vacatedDate", label: "Vacated" },
    { key: "makeReadyDate", label: "Make Ready" },
    { key: "moveInDate", label: "Move-In" },
    { key: "flooringDate", label: "Flooring" },
    ...customFields.filter((field) => field.fieldType === "DATE" && !field.isArchived).map((field) => ({ key: `custom:${field.id}`, label: field.label })),
  ];
  const scheduleColorSources = [
    ...optionSets.map(([key, label]) => ({ key, label })),
    ...customFields.filter((field) => !field.isArchived && (field.fieldType === "SINGLE_SELECT" || field.fieldType === "MULTI_SELECT")).map((field) => ({ key: `custom:${field.id}`, label: field.label })),
  ];
  const schedulePresets: Array<{
    id: string;
    label: string;
    description: string;
    sourceField: string;
    colorBasis: ScheduleTrack["colorBasis"];
    colorSourceField: string | null;
    fixedColor: string | null;
    groupingMode: ScheduleTrack["groupingMode"];
    overdueEnabled: boolean;
    moveInSoonEnabled: boolean;
  }> = [
    {
      id: "ntv",
      label: "NTV / Notice",
      description: "Expected vacate dates with vacancy status colors.",
      sourceField: "moveOutDate",
      colorBasis: "STATUS",
      colorSourceField: null,
      fixedColor: null,
      groupingMode: "PROPERTY",
      overdueEnabled: false,
      moveInSoonEnabled: true,
    },
    {
      id: "vacated",
      label: "Vacated",
      description: "Actual possession/vacated date grouped by property.",
      sourceField: "vacatedDate",
      colorBasis: "STATUS",
      colorSourceField: null,
      fixedColor: null,
      groupingMode: "PROPERTY",
      overdueEnabled: false,
      moveInSoonEnabled: false,
    },
    {
      id: "make-ready",
      label: "Make Ready",
      description: "Make-ready due date with scope colors and overdue cues.",
      sourceField: "makeReadyDate",
      colorBasis: "SCOPE",
      colorSourceField: null,
      fixedColor: null,
      groupingMode: "BOARD_GROUP",
      overdueEnabled: true,
      moveInSoonEnabled: true,
    },
    {
      id: "move-in",
      label: "Move-In",
      description: "Move-in dates with risk/status overlays.",
      sourceField: "moveInDate",
      colorBasis: "STATUS",
      colorSourceField: null,
      fixedColor: null,
      groupingMode: "PROPERTY",
      overdueEnabled: false,
      moveInSoonEnabled: true,
    },
    {
      id: "flooring",
      label: "Flooring",
      description: "Flooring schedule colored by floor status.",
      sourceField: "flooringDate",
      colorBasis: "FIELD",
      colorSourceField: "floorsStatus",
      fixedColor: null,
      groupingMode: "PROPERTY",
      overdueEnabled: true,
      moveInSoonEnabled: true,
    },
  ];

  useEffect(() => {
    if (!propertyId && properties[0]) setPropertyId(properties[0].id);
  }, [properties, propertyId]);

  useEffect(() => {
    if (!selectedOption) return;
    setOptionDraft({ value: selectedOption.value, color: selectedOption.color, textColor: selectedOption.textColor });
  }, [selectedOption]);

  useEffect(() => {
    if (!selectedPlan) return;
    setPlanDraft({
      name: selectedPlan.name,
      bedrooms: selectedPlan.bedrooms?.toString() ?? "",
      bathrooms: selectedPlan.bathrooms?.toString() ?? "",
      squareFeet: selectedPlan.squareFeet?.toString() ?? "",
      description: selectedPlan.description ?? "",
    });
  }, [selectedPlan]);

  useEffect(() => {
    setColumnLabel(selectedColumn?.label ?? "");
  }, [selectedColumn]);

  useEffect(() => {
    if (!selectedTrack) return;
    setTrackDraft({
      sourceField: selectedTrack.sourceField,
      displayName: selectedTrack.displayName,
      colorBasis: selectedTrack.colorBasis,
      colorSourceField: selectedTrack.colorSourceField,
      fixedColor: selectedTrack.fixedColor ?? "#58a6de",
      groupingMode: selectedTrack.groupingMode,
      visibilityFilter: selectedTrack.visibilityFilter,
      overdueEnabled: selectedTrack.overdueEnabled,
      moveInSoonEnabled: selectedTrack.moveInSoonEnabled,
      isEnabled: selectedTrack.isEnabled,
    });
  }, [selectedTrack]);

  const numberOrNull = (value: string) => value === "" ? null : Number(value);
  const moveOption = async (id: string, offset: -1 | 1) => {
    const index = fieldOptions.findIndex((option) => option.id === id);
    const swap = index + offset;
    if (index < 0 || swap < 0 || swap >= fieldOptions.length) return;
    const ids = fieldOptions.map((option) => option.id);
    [ids[index], ids[swap]] = [ids[swap], ids[index]];
    await onReorderOptions(ids);
  };
  const moveTrack = async (id: string, offset: -1 | 1) => {
    const index = scheduleTracks.findIndex((track) => track.id === id);
    const swap = index + offset;
    if (index < 0 || swap < 0 || swap >= scheduleTracks.length) return;
    const ids = scheduleTracks.map((track) => track.id);
    [ids[index], ids[swap]] = [ids[swap], ids[index]];
    await onReorderScheduleTracks(ids);
  };
  const createSchedulePreset = async (preset: (typeof schedulePresets)[number]) => {
    await onCreateScheduleTrack({
      sourceField: preset.sourceField,
      displayName: preset.label,
      colorBasis: preset.colorBasis,
      colorSourceField: preset.colorBasis === "FIELD" ? preset.colorSourceField : null,
      fixedColor: preset.colorBasis === "FIXED" ? preset.fixedColor : null,
      groupingMode: preset.groupingMode,
      visibilityFilter: null,
      overdueEnabled: preset.overdueEnabled,
      moveInSoonEnabled: preset.moveInSoonEnabled,
      isEnabled: true,
      isArchived: false,
    });
  };

  return (
    <section className="operations-grid config-grid" data-testid="board-configuration-panel">
      <article className="operations-card" data-testid="option-management">
        <div className="admin-section-head">
          <h3>Board Labels</h3>
          <span className="subtitle">Status colors and choices</span>
        </div>
        <label className="config-field">Option set
          <select data-testid="option-set-select" value={fieldKey} onChange={(event) => { setFieldKey(event.target.value); setSelectedOptionId(""); }}>
            {optionSets.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <form className="option-create" onSubmit={(event) => {
          event.preventDefault();
          void onCreateOption({ fieldKey, ...newOption }).then(() => setNewOption((current) => ({ ...current, value: "" })));
        }}>
          <input data-testid="option-create-value" value={newOption.value} placeholder="New label" onChange={(event) => setNewOption((current) => ({ ...current, value: event.target.value }))} required />
          <input data-testid="option-create-color" type="color" value={newOption.color} onChange={(event) => setNewOption((current) => ({ ...current, color: event.target.value }))} aria-label="Option background color" />
          <button data-testid="option-create-submit" className="button button-primary" disabled={loading}>Add</button>
        </form>
        <div className="option-list">
          {fieldOptions.map((option, index) => (
            <div className="option-row" key={option.id}>
              <button data-testid={`option-row-${option.value.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} className="option-pick" onClick={() => setSelectedOptionId(option.id)}>
                <LabelPill value={option.value} label={option} muted={option.isArchived} />
              </button>
              <button className="icon-button" aria-label="Move up" disabled={index === 0} onClick={() => void moveOption(option.id, -1)}>↑</button>
              <button className="icon-button" aria-label="Move down" disabled={index === fieldOptions.length - 1} onClick={() => void moveOption(option.id, 1)}>↓</button>
            </div>
          ))}
        </div>
        {selectedOption ? (
          <div className="editor-block option-editor">
            <label>Label<input data-testid="option-edit-value" value={optionDraft.value} onChange={(event) => setOptionDraft((current) => ({ ...current, value: event.target.value }))} /></label>
            <label>Color<input data-testid="option-edit-color" type="color" value={optionDraft.color} onChange={(event) => setOptionDraft((current) => ({ ...current, color: event.target.value }))} /></label>
            <div className="admin-actions span-full">
              <button data-testid="option-save" className="button button-primary" onClick={() => void onUpdateOption(selectedOption.id, optionDraft)}>Save</button>
              <button data-testid={selectedOption.isArchived ? "option-restore" : "option-archive"} className="button button-secondary" onClick={() => void onArchiveOption(selectedOption.id, Boolean(selectedOption.isArchived))}>
                {selectedOption.isArchived ? "Restore" : "Archive"}
              </button>
            </div>
          </div>
        ) : null}
      </article>

      <article className="operations-card" data-testid="floor-plan-management">
        <div className="admin-section-head">
          <h3>Floor Plans</h3>
          <span className="subtitle">Configured per property</span>
        </div>
        <label className="config-field">Property
          <select data-testid="floor-plan-property" value={propertyId} onChange={(event) => { setPropertyId(event.target.value); setSelectedPlanId(""); }}>
            {properties.filter((property) => property.isActive).map((property) => <option key={property.id} value={property.id}>{property.code} - {property.name}</option>)}
          </select>
        </label>
        <form className="floor-plan-form" onSubmit={(event) => {
          event.preventDefault();
          void onCreateFloorPlan({
            propertyId,
            name: newPlan.name,
            bedrooms: numberOrNull(newPlan.bedrooms),
            bathrooms: numberOrNull(newPlan.bathrooms),
            squareFeet: numberOrNull(newPlan.squareFeet),
            description: newPlan.description || null,
          }).then(() => setNewPlan({ name: "", bedrooms: "", bathrooms: "", squareFeet: "", description: "" }));
        }}>
          <input data-testid="floor-plan-create-name" placeholder="Plan name" value={newPlan.name} onChange={(event) => setNewPlan((current) => ({ ...current, name: event.target.value }))} required />
          <input data-testid="floor-plan-create-beds" type="number" min="0" placeholder="Beds" value={newPlan.bedrooms} onChange={(event) => setNewPlan((current) => ({ ...current, bedrooms: event.target.value }))} />
          <input data-testid="floor-plan-create-baths" type="number" step="0.5" min="0" placeholder="Baths" value={newPlan.bathrooms} onChange={(event) => setNewPlan((current) => ({ ...current, bathrooms: event.target.value }))} />
          <input data-testid="floor-plan-create-sqft" type="number" min="1" placeholder="Sq ft" value={newPlan.squareFeet} onChange={(event) => setNewPlan((current) => ({ ...current, squareFeet: event.target.value }))} />
          <input data-testid="floor-plan-create-description" className="span-full" placeholder="Description (optional)" value={newPlan.description} onChange={(event) => setNewPlan((current) => ({ ...current, description: event.target.value }))} />
          <button data-testid="floor-plan-create-submit" className="button button-primary span-full" disabled={loading || !propertyId}>Add Floor Plan</button>
        </form>
        <div className="record-list">
          {propertyPlans.length === 0 ? <StatusState title="No configured floor plans" description="Legacy text remains valid until a unit is mapped." tone="subtle" /> : propertyPlans.map((plan) => (
            <button key={plan.id} type="button" data-testid={`floor-plan-row-${plan.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} className={selectedPlanId === plan.id ? "record-row selected" : "record-row"} onClick={() => setSelectedPlanId(plan.id)}>
              <span><strong>{plan.name}</strong>{plan.squareFeet ? `${plan.squareFeet} sq ft` : "No square footage"}</span>
              <span className={plan.isActive ? "status-chip active" : "status-chip inactive"}>{plan.isActive ? "Active" : "Archived"}</span>
            </button>
          ))}
        </div>
        {selectedPlan ? (
          <div className="editor-block">
            <label>Name<input data-testid="floor-plan-edit-name" value={planDraft.name} onChange={(event) => setPlanDraft((current) => ({ ...current, name: event.target.value }))} /></label>
            <label>Beds<input type="number" value={planDraft.bedrooms} onChange={(event) => setPlanDraft((current) => ({ ...current, bedrooms: event.target.value }))} /></label>
            <label>Baths<input type="number" step="0.5" value={planDraft.bathrooms} onChange={(event) => setPlanDraft((current) => ({ ...current, bathrooms: event.target.value }))} /></label>
            <label>Sq ft<input type="number" value={planDraft.squareFeet} onChange={(event) => setPlanDraft((current) => ({ ...current, squareFeet: event.target.value }))} /></label>
            <label className="span-full">Description<input data-testid="floor-plan-edit-description" value={planDraft.description} onChange={(event) => setPlanDraft((current) => ({ ...current, description: event.target.value }))} /></label>
            <div className="admin-actions span-full">
              <button data-testid="floor-plan-save" className="button button-primary" onClick={() => void onUpdateFloorPlan(selectedPlan.id, { name: planDraft.name, bedrooms: numberOrNull(planDraft.bedrooms), bathrooms: numberOrNull(planDraft.bathrooms), squareFeet: numberOrNull(planDraft.squareFeet), description: planDraft.description || null })}>Save</button>
              <button data-testid={selectedPlan.isActive ? "floor-plan-archive" : "floor-plan-restore"} className="button button-secondary" onClick={() => void onArchiveFloorPlan(selectedPlan.id, selectedPlan.isActive)}>{selectedPlan.isActive ? "Archive" : "Restore"}</button>
            </div>
          </div>
        ) : null}
      </article>

      <article className="operations-card" data-testid="column-label-management">
        <div className="admin-section-head">
          <h3>Column Labels</h3>
          <span className="subtitle">Display names only; keys remain stable</span>
        </div>
        <label className="config-field">Built-in field
          <select data-testid="column-config-key" value={selectedColumnKey} onChange={(event) => setSelectedColumnKey(event.target.value)}>
            {columns.map((column) => <option key={column.fieldKey} value={column.fieldKey}>{column.fieldKey}</option>)}
          </select>
        </label>
        <label className="config-field">Display name
          <input data-testid="column-config-label" value={columnLabel} onChange={(event) => setColumnLabel(event.target.value)} />
        </label>
        <button data-testid="column-config-save" className="button button-primary" disabled={!columnLabel.trim()} onClick={() => void onUpdateColumn(selectedColumnKey, columnLabel.trim())}>Save Display Name</button>
        <p className="helper-copy">Saved views, imports, and automations continue to bind by the unchanged internal field key.</p>
      </article>

      <article className="operations-card" data-testid="schedule-track-management">
        <div className="admin-section-head">
          <h3>Schedule Tracks</h3>
          <span className="subtitle">Calendar fields and color basis</span>
        </div>
        <div className="schedule-track-presets" data-testid="schedule-track-presets">
          {schedulePresets.map((preset) => {
            const sourceExists = scheduleSources.some((source) => source.key === preset.sourceField);
            const colorSourceExists = !preset.colorSourceField || scheduleColorSources.some((source) => source.key === preset.colorSourceField);
            const alreadyConfigured = configuredSources.has(preset.sourceField);
            const disabled = loading || !sourceExists || !colorSourceExists || alreadyConfigured;
            const note = alreadyConfigured ? "Already configured" : !sourceExists ? "Date field missing" : !colorSourceExists ? "Color field missing" : "Create preset";

            return (
              <button
                key={preset.id}
                type="button"
                data-testid={`schedule-track-preset-${preset.id}`}
                className="schedule-track-preset"
                disabled={disabled}
                title={note}
                onClick={() => void createSchedulePreset(preset)}
              >
                <strong>{preset.label}</strong>
                <span>{preset.description}</span>
                <small>{note}</small>
              </button>
            );
          })}
        </div>
        <form className="schedule-track-create" onSubmit={(event) => {
          event.preventDefault();
          void onCreateScheduleTrack({ ...newTrack, colorSourceField: newTrack.colorBasis === "FIELD" ? newTrack.colorSourceField : null, fixedColor: newTrack.colorBasis === "FIXED" ? newTrack.fixedColor : null })
            .then(() => setNewTrack(blankTrack));
        }}>
          <select data-testid="schedule-track-create-source" value={newTrack.sourceField} onChange={(event) => {
            const source = scheduleSources.find((candidate) => candidate.key === event.target.value);
            setNewTrack((current) => ({ ...current, sourceField: event.target.value, displayName: source?.label ?? current.displayName }));
          }} required>
            <option value="">Date field</option>
            {scheduleSources.filter((source) => !configuredSources.has(source.key)).map((source) => <option key={source.key} value={source.key}>{source.label}</option>)}
          </select>
          <input data-testid="schedule-track-create-name" placeholder="Track name" value={newTrack.displayName} onChange={(event) => setNewTrack((current) => ({ ...current, displayName: event.target.value }))} required />
          <select data-testid="schedule-track-create-basis" value={newTrack.colorBasis} onChange={(event) => setNewTrack((current) => ({ ...current, colorBasis: event.target.value as ScheduleTrack["colorBasis"] }))}>
            <option value="STATUS">Status color</option>
            <option value="SCOPE">Scope color</option>
            <option value="FIELD">Selected field color</option>
            <option value="FIXED">Fixed color</option>
            <option value="NEUTRAL">Neutral</option>
          </select>
          {newTrack.colorBasis === "FIELD" ? <select data-testid="schedule-track-create-color-source" value={newTrack.colorSourceField ?? ""} onChange={(event) => setNewTrack((current) => ({ ...current, colorSourceField: event.target.value || null }))} required><option value="">Color field</option>{scheduleColorSources.map((source) => <option key={source.key} value={source.key}>{source.label}</option>)}</select> : null}
          {newTrack.colorBasis === "FIXED" ? <input data-testid="schedule-track-create-color" type="color" value={newTrack.fixedColor} onChange={(event) => setNewTrack((current) => ({ ...current, fixedColor: event.target.value }))} /> : null}
          <button data-testid="schedule-track-create-submit" className="button button-primary" disabled={!newTrack.sourceField || !newTrack.displayName.trim()}>Add Track</button>
        </form>
        <div className="option-list">
          {scheduleTracks.map((track, index) => (
            <div className="schedule-track-row" key={track.id}>
              <button data-testid={`schedule-track-row-${track.sourceField.replace(/[^a-zA-Z0-9]+/g, "-")}`} className="option-pick" onClick={() => setSelectedTrackId(track.id)}>
                <strong>{track.displayName}</strong><small>{track.sourceField} / {track.colorBasis}{track.isArchived ? " / Archived" : track.isEnabled ? "" : " / Disabled"}</small>
              </button>
              <button className="icon-button" aria-label="Move track up" disabled={index === 0} onClick={() => void moveTrack(track.id, -1)}>↑</button>
              <button className="icon-button" aria-label="Move track down" disabled={index === scheduleTracks.length - 1} onClick={() => void moveTrack(track.id, 1)}>↓</button>
            </div>
          ))}
        </div>
        {selectedTrack ? (
          <div className="editor-block">
            <label>Date source<select data-testid="schedule-track-edit-source" value={trackDraft.sourceField} onChange={(event) => setTrackDraft((current) => ({ ...current, sourceField: event.target.value }))}>{scheduleSources.filter((source) => source.key === selectedTrack.sourceField || !configuredSources.has(source.key)).map((source) => <option key={source.key} value={source.key}>{source.label}</option>)}</select></label>
            <label>Name<input data-testid="schedule-track-edit-name" value={trackDraft.displayName} onChange={(event) => setTrackDraft((current) => ({ ...current, displayName: event.target.value }))} /></label>
            <label>Colors<select data-testid="schedule-track-edit-basis" value={trackDraft.colorBasis} onChange={(event) => setTrackDraft((current) => ({ ...current, colorBasis: event.target.value as ScheduleTrack["colorBasis"] }))}><option value="STATUS">Status color</option><option value="SCOPE">Scope color</option><option value="FIELD">Selected field color</option><option value="FIXED">Fixed color</option><option value="NEUTRAL">Neutral</option></select></label>
            {trackDraft.colorBasis === "FIELD" ? <label>Color field<select data-testid="schedule-track-edit-color-source" value={trackDraft.colorSourceField ?? ""} onChange={(event) => setTrackDraft((current) => ({ ...current, colorSourceField: event.target.value || null }))}>{scheduleColorSources.map((source) => <option key={source.key} value={source.key}>{source.label}</option>)}</select></label> : null}
            {trackDraft.colorBasis === "FIXED" ? <label>Fixed color<input data-testid="schedule-track-edit-color" type="color" value={trackDraft.fixedColor} onChange={(event) => setTrackDraft((current) => ({ ...current, fixedColor: event.target.value }))} /></label> : null}
            <label>Grouping<select data-testid="schedule-track-edit-grouping" value={trackDraft.groupingMode} onChange={(event) => setTrackDraft((current) => ({ ...current, groupingMode: event.target.value as ScheduleTrack["groupingMode"] }))}><option value="NONE">No grouping</option><option value="PROPERTY">Property</option><option value="BOARD_GROUP">Board section</option></select></label>
            <label className="span-full">Visible sections
              <select
                multiple
                data-testid="schedule-track-edit-visible-groups"
                value={trackDraft.visibilityFilter?.boardGroups ?? []}
                onChange={(event) => {
                  const boardGroups = Array.from(event.target.selectedOptions).map((option) => option.value);
                  setTrackDraft((current) => ({ ...current, visibilityFilter: { ...(current.visibilityFilter ?? {}), boardGroups } }));
                }}
              >
                {["READY_UNITS_TA", "MAKE_READY_BOARD_TA", "DOWN_AND_MODELS", "READY_UNITS_VAB", "MAKE_READY_BOARD_VAB", "ARCHIVE_TA", "ARCHIVE_VAB"].map((group) => <option key={group} value={group}>{group.replace(/_/g, " ")}</option>)}
              </select>
            </label>
            <label className="toggle-row"><input data-testid="schedule-track-edit-overdue" type="checkbox" checked={trackDraft.overdueEnabled} onChange={(event) => setTrackDraft((current) => ({ ...current, overdueEnabled: event.target.checked }))} /> Flag overdue</label>
            <label className="toggle-row"><input data-testid="schedule-track-edit-soon" type="checkbox" checked={trackDraft.moveInSoonEnabled} onChange={(event) => setTrackDraft((current) => ({ ...current, moveInSoonEnabled: event.target.checked }))} /> Flag move-in soon</label>
            <label className="toggle-row"><input data-testid="schedule-track-edit-enabled" type="checkbox" checked={trackDraft.isEnabled} onChange={(event) => setTrackDraft((current) => ({ ...current, isEnabled: event.target.checked }))} /> Enabled</label>
            <button data-testid="schedule-track-save" className="button button-primary span-full" onClick={() => void onUpdateScheduleTrack(selectedTrack.id, { ...trackDraft, colorSourceField: trackDraft.colorBasis === "FIELD" ? trackDraft.colorSourceField : null, fixedColor: trackDraft.colorBasis === "FIXED" ? trackDraft.fixedColor : null })}>Save Track</button>
            <button data-testid={selectedTrack.isArchived ? "schedule-track-restore" : "schedule-track-archive"} className="button button-secondary span-full" onClick={() => void onArchiveScheduleTrack(selectedTrack.id, selectedTrack.isArchived)}>{selectedTrack.isArchived ? "Restore Track" : "Archive Track"}</button>
          </div>
        ) : null}
      </article>
    </section>
  );
}
