import { useEffect, useMemo, useState } from "react";
import type { BoardColumnDefinition, BoardSection, CustomField, FloorPlan, LabelDefinition, Property, ScheduleTrack, UserLanguage } from "../lib/api";
import { ConfirmDialog } from "./ConfirmDialog";
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
  language: UserLanguage;
  properties: Property[];
  boardSections: BoardSection[];
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
  onUpdateBoardSection: (id: string, displayName: string) => Promise<void>;
  onCreateFloorPlan: (input: { propertyId: string; code: string; name: string; bedrooms: number | null; bathrooms: number | null; squareFeet: number | null; description: string | null }) => Promise<void>;
  onUpdateFloorPlan: (id: string, input: { code: string; name: string; bedrooms: number | null; bathrooms: number | null; squareFeet: number | null; description: string | null }) => Promise<void>;
  onArchiveFloorPlan: (id: string, restore: boolean) => Promise<void>;
  onUpdateColumn: (fieldKey: string, label: string) => Promise<void>;
  onCreateScheduleTrack: (input: Omit<ScheduleTrack, "id" | "sortOrder">) => Promise<void>;
  onUpdateScheduleTrack: (id: string, input: Partial<Omit<ScheduleTrack, "id" | "sortOrder">>) => Promise<void>;
  onArchiveScheduleTrack: (id: string, restore: boolean) => Promise<void>;
  onReorderScheduleTracks: (ids: string[]) => Promise<void>;
};

export function BoardConfigurationPanel({
  language,
  properties,
  boardSections,
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
  onUpdateBoardSection,
  onCreateFloorPlan,
  onUpdateFloorPlan,
  onArchiveFloorPlan,
  onUpdateColumn,
  onCreateScheduleTrack,
  onUpdateScheduleTrack,
  onArchiveScheduleTrack,
  onReorderScheduleTracks,
}: Props) {
  const isSpanish = language === "es";
  const [sectionPropertyId, setSectionPropertyId] = useState(properties[0]?.id ?? "");
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [sectionLabelDraft, setSectionLabelDraft] = useState("");
  const propertySections = useMemo(
    () => boardSections.filter((section) => section.propertyId === sectionPropertyId).sort((left, right) => left.sortOrder - right.sortOrder),
    [boardSections, sectionPropertyId],
  );
  const selectedSection = propertySections.find((section) => section.id === selectedSectionId) ?? null;
  const [fieldKey, setFieldKey] = useState<string>("vacancyStatus");
  const [newOption, setNewOption] = useState({ value: "", color: "#46d39c", textColor: "#06291c" });
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [optionDraft, setOptionDraft] = useState({ value: "", color: "#46d39c", textColor: "#06291c" });
  const [pendingOptionArchive, setPendingOptionArchive] = useState<LabelDefinition | null>(null);
  const fieldOptions = useMemo(() => options.filter((option) => option.fieldKey === fieldKey), [fieldKey, options]);
  const selectedOption = fieldOptions.find((option) => option.id === selectedOptionId) ?? null;
  const activeOptionCount = fieldOptions.filter((option) => !option.isArchived).length;
  const archivedOptionCount = fieldOptions.filter((option) => option.isArchived).length;

  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? "");
  const [newPlan, setNewPlan] = useState({ code: "", name: "", bedrooms: "", bathrooms: "", squareFeet: "", description: "" });
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [planDraft, setPlanDraft] = useState({ code: "", name: "", bedrooms: "", bathrooms: "", squareFeet: "", description: "" });
  const propertyPlans = floorPlans.filter((plan) => plan.propertyId === propertyId);
  const activePropertyPlans = propertyPlans.filter((plan) => plan.isActive);
  const archivedPropertyPlans = propertyPlans.filter((plan) => !plan.isActive);
  const selectedPlan = propertyPlans.find((plan) => plan.id === selectedPlanId) ?? null;
  const [selectedColumnKey, setSelectedColumnKey] = useState("vacatedDate");
  const [columnLabel, setColumnLabel] = useState("");
  const selectedColumn = columns.find((column) => column.fieldKey === selectedColumnKey) ?? null;
  const blankTrack = { sourceField: "", displayName: "", colorBasis: "NEUTRAL" as ScheduleTrack["colorBasis"], colorSourceField: null as string | null, fixedColor: "#58a6de", groupingMode: "NONE" as ScheduleTrack["groupingMode"], visibilityFilter: null, overdueEnabled: true, moveInSoonEnabled: true, isEnabled: true, isArchived: false };
  const [newTrack, setNewTrack] = useState(blankTrack);
  const [selectedTrackId, setSelectedTrackId] = useState("");
  const selectedTrack = scheduleTracks.find((track) => track.id === selectedTrackId) ?? null;
  const activeScheduleTracks = scheduleTracks.filter((track) => !track.isArchived);
  const archivedScheduleTracks = scheduleTracks.filter((track) => track.isArchived);
  const [trackDraft, setTrackDraft] = useState({ sourceField: "", displayName: "", colorBasis: "NEUTRAL" as ScheduleTrack["colorBasis"], colorSourceField: null as string | null, fixedColor: "#58a6de", groupingMode: "NONE" as ScheduleTrack["groupingMode"], visibilityFilter: null as ScheduleTrack["visibilityFilter"], overdueEnabled: true, moveInSoonEnabled: true, isEnabled: true });
  const configuredSources = new Set(scheduleTracks.map((track) => track.sourceField));
  const scheduleVisibleSections = useMemo(
    () => boardSections
      .filter((section) => section.isActive)
      .sort((left, right) => left.property.code.localeCompare(right.property.code) || left.sortOrder - right.sortOrder),
    [boardSections],
  );
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
    if (!sectionPropertyId && properties[0]) setSectionPropertyId(properties[0].id);
  }, [properties, sectionPropertyId]);

  useEffect(() => {
    if (!propertyId && properties[0]) setPropertyId(properties[0].id);
  }, [properties, propertyId]);

  useEffect(() => {
    if (propertySections.length === 0) {
      setSelectedSectionId("");
      return;
    }
    if (!propertySections.some((section) => section.id === selectedSectionId)) {
      setSelectedSectionId(propertySections[0]?.id ?? "");
    }
  }, [propertySections, selectedSectionId]);

  useEffect(() => {
    setSectionLabelDraft(selectedSection?.displayName ?? "");
  }, [selectedSection]);

  useEffect(() => {
    if (!selectedOption) return;
    setOptionDraft({ value: selectedOption.value, color: selectedOption.color, textColor: selectedOption.textColor });
  }, [selectedOption]);

  useEffect(() => {
    if (!selectedPlan) return;
    setPlanDraft({
      code: selectedPlan.code,
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
  const scheduleSourceLabel = (key: string | null | undefined) => {
    if (!key) return isSpanish ? "No configurado" : "Not configured";
    return scheduleSources.find((source) => source.key === key)?.label ?? `${key} ${isSpanish ? "(campo faltante)" : "(missing field)"}`;
  };
  const scheduleColorSourceLabel = (key: string | null | undefined) => {
    if (!key) return isSpanish ? "No configurado" : "Not configured";
    return scheduleColorSources.find((source) => source.key === key)?.label ?? `${key} ${isSpanish ? "(campo faltante)" : "(missing field)"}`;
  };
  const scheduleColorBasisLabel = (basis: ScheduleTrack["colorBasis"]) => {
    switch (basis) {
      case "STATUS":
        return isSpanish ? "Colores de estado" : "Status colors";
      case "SCOPE":
        return isSpanish ? "Colores de alcance" : "Scope colors";
      case "FIELD":
        return isSpanish ? "Colores de campo" : "Field colors";
      case "FIXED":
        return isSpanish ? "Color fijo" : "Fixed color";
      default:
        return isSpanish ? "Neutro" : "Neutral";
    }
  };
  const scheduleGroupingLabel = (grouping: ScheduleTrack["groupingMode"]) => {
    switch (grouping) {
      case "PROPERTY":
        return isSpanish ? "Agrupar por propiedad" : "Group by property";
      case "BOARD_GROUP":
        return isSpanish ? "Agrupar por sección del tablero" : "Group by board section";
      default:
        return isSpanish ? "Carril único" : "Single lane";
    }
  };
  const scheduleVisibilityLabel = (visibilityFilter: ScheduleTrack["visibilityFilter"] | null | undefined) => {
    const boardGroups = visibilityFilter?.boardGroups ?? [];
    if (boardGroups.length === 0) {
      return isSpanish ? "Todas las secciones activas" : "All active sections";
    }
    return isSpanish ? `${boardGroups.length} secciones seleccionadas` : `${boardGroups.length} selected sections`;
  };
  const createTrackGuidance = [
    isSpanish
      ? "Cada campo de fecha solo puede impulsar un carril activo. Si necesita otra vista, edite el carril existente en lugar de duplicarlo."
      : "Each date field can drive only one active track. If you need a different view, edit the existing track instead of duplicating it.",
    isSpanish
      ? "Los nuevos carriles empiezan simples: sin agrupación, visibles en todas las secciones y con alertas activas. Ajuste agrupación/visibilidad después de guardarlo."
      : "New tracks start simple: no grouping, visible across all sections, and with risk cues enabled. Adjust grouping/visibility after saving.",
    isSpanish
      ? "Estado usa colores de ciclo de vida; alcance usa colores de alcance; campo usa otro select administrado; fijo bloquea un solo color."
      : "Status uses lifecycle colors; Scope uses scope colors; Field uses another managed select field; Fixed locks one color.",
  ];
  const createTrackWarnings: string[] = [];
  if (newTrack.sourceField && configuredSources.has(newTrack.sourceField)) {
    createTrackWarnings.push(isSpanish ? "Ese campo de fecha ya está asignado a otro carril." : "That date field is already assigned to another track.");
  }
  if (newTrack.colorBasis === "FIELD" && !newTrack.colorSourceField) {
    createTrackWarnings.push(isSpanish ? "Seleccione un campo de color antes de guardar este carril." : "Select a color field before saving this track.");
  }
  const editTrackWarnings: string[] = [];
  const duplicateTrack = selectedTrack
    ? scheduleTracks.find((track) => track.id !== selectedTrack.id && track.sourceField === trackDraft.sourceField)
    : null;
  if (duplicateTrack) {
    editTrackWarnings.push(
      isSpanish
        ? `La fuente ${scheduleSourceLabel(trackDraft.sourceField)} ya la usa ${duplicateTrack.displayName}. Cambie la fuente o consolide ese carril.`
        : `${scheduleSourceLabel(trackDraft.sourceField)} is already used by ${duplicateTrack.displayName}. Change the source or consolidate that track.`,
    );
  }
  if (trackDraft.colorBasis === "FIELD" && !trackDraft.colorSourceField) {
    editTrackWarnings.push(isSpanish ? "El modo de color por campo requiere seleccionar un campo administrado." : "Field color mode requires a managed color field selection.");
  }
  if (trackDraft.groupingMode === "BOARD_GROUP" && (trackDraft.visibilityFilter?.boardGroups?.length ?? 0) === 0) {
    editTrackWarnings.push(
      isSpanish
        ? "Agrupar por sección sin filtro visible mostrará todas las secciones activas. Seleccione solo las secciones que realmente deban aparecer."
        : "Board-section grouping without a visible filter will show every active section. Select only the sections that should actually appear.",
    );
  }
  if (!trackDraft.isEnabled) {
    editTrackWarnings.push(isSpanish ? "Este carril está deshabilitado y no aparecerá en calendarios activos hasta volver a activarlo." : "This track is disabled and will not appear on active calendars until you enable it again.");
  }
  if (selectedTrack?.isArchived) {
    editTrackWarnings.push(isSpanish ? "Este carril está archivado. Restaurarlo vuelve a mostrarlo en la configuración operativa." : "This track is archived. Restore it to bring it back into the live operational setup.");
  }
  const editTrackGuidance = [
    isSpanish
      ? `${scheduleGroupingLabel(trackDraft.groupingMode)}. ${trackDraft.groupingMode === "BOARD_GROUP" ? scheduleVisibilityLabel(trackDraft.visibilityFilter) : trackDraft.groupingMode === "PROPERTY" ? "Una columna/línea por propiedad." : "Todos los eventos comparten una sola línea."}`
      : `${scheduleGroupingLabel(trackDraft.groupingMode)}. ${trackDraft.groupingMode === "BOARD_GROUP" ? scheduleVisibilityLabel(trackDraft.visibilityFilter) : trackDraft.groupingMode === "PROPERTY" ? "One lane per property." : "All events share one lane."}`,
    isSpanish
      ? `Base de color: ${scheduleColorBasisLabel(trackDraft.colorBasis)}${trackDraft.colorBasis === "FIELD" ? ` (${scheduleColorSourceLabel(trackDraft.colorSourceField)})` : ""}.`
      : `Color basis: ${scheduleColorBasisLabel(trackDraft.colorBasis)}${trackDraft.colorBasis === "FIELD" ? ` (${scheduleColorSourceLabel(trackDraft.colorSourceField)})` : ""}.`,
    isSpanish
      ? `${trackDraft.overdueEnabled ? "Los vencidos se resaltarán." : "Los vencidos no se resaltarán."} ${trackDraft.moveInSoonEnabled ? "Los próximos move-ins también se resaltarán." : "Move-in-soon cues are off."}`
      : `${trackDraft.overdueEnabled ? "Overdue work will be highlighted." : "Overdue highlighting is off."} ${trackDraft.moveInSoonEnabled ? "Move-in-soon cues are also on." : "Move-in-soon cues are off."}`,
  ];
  const availableEditSources = selectedTrack && !scheduleSources.some((source) => source.key === selectedTrack.sourceField)
    ? [{ key: selectedTrack.sourceField, label: scheduleSourceLabel(selectedTrack.sourceField) }, ...scheduleSources]
    : scheduleSources;
  const availableEditColorSources = trackDraft.colorSourceField && !scheduleColorSources.some((source) => source.key === trackDraft.colorSourceField)
    ? [{ key: trackDraft.colorSourceField, label: scheduleColorSourceLabel(trackDraft.colorSourceField) }, ...scheduleColorSources]
    : scheduleColorSources;

  return (
    <section className="operations-grid config-grid" data-testid="board-configuration-panel">
      <article className="operations-card" data-testid="board-section-management">
        <div className="admin-section-head">
          <h3>{isSpanish ? "Secciones / tablas del tablero" : "Board Sections / Tables"}</h3>
          <span className="subtitle">{isSpanish ? "Las secciones del flujo se administran por separado de las etiquetas" : "Workflow sections managed separately from labels"}</span>
        </div>
        <label className="config-field">{isSpanish ? "Propiedad" : "Property"}
          <select data-testid="board-section-property" value={sectionPropertyId} onChange={(event) => { setSectionPropertyId(event.target.value); setSelectedSectionId(""); }}>
            {properties.filter((property) => property.isActive).map((property) => <option key={property.id} value={property.id}>{property.code} - {property.name}</option>)}
          </select>
        </label>
        <div className="record-list">
          {propertySections.length === 0 ? (
            <StatusState title={isSpanish ? "No se encontraron secciones del tablero" : "No board sections found"} description={isSpanish ? "Seleccione otra propiedad o termine primero la configuración de la propiedad." : "Select another property or finish property setup first."} tone="subtle" />
          ) : propertySections.map((section) => (
            <button
              key={section.id}
              type="button"
              data-testid={`board-section-row-${section.sectionType.toLowerCase()}`}
              className={selectedSectionId === section.id ? "record-row selected" : "record-row"}
              onClick={() => setSelectedSectionId(section.id)}
            >
              <span><strong>{section.displayName}</strong>{` ${section.property.code} / ${section.key}`}</span>
              <span className="status-chip active">{section.sectionType.replace(/_/g, " ")}</span>
            </button>
          ))}
        </div>
        {selectedSection ? (
          <div className="editor-block">
            <label>{isSpanish ? "Nombre visible" : "Display name"}
              <input data-testid="board-section-edit-label" value={sectionLabelDraft} onChange={(event) => setSectionLabelDraft(event.target.value)} />
            </label>
            <label>{isSpanish ? "Clave interna" : "Internal key"}<input value={selectedSection.key} readOnly /></label>
            <label>{isSpanish ? "Tipo de sección" : "Section type"}<input value={selectedSection.sectionType.replace(/_/g, " ")} readOnly /></label>
            <p className="helper-copy span-full">{isSpanish ? "Cambie aquí el nombre visible para operadores. Los filtros, automatizaciones, APIs y lógica de importación siguen usando la clave interna y el tipo de sección estables." : "Rename the operator-facing section name here. Filters, automations, APIs, and import logic continue to use the stable internal key and section type."}</p>
            <button
              data-testid="board-section-save"
              className="button button-primary span-full"
              disabled={!sectionLabelDraft.trim() || sectionLabelDraft.trim() === selectedSection.displayName}
              onClick={() => void onUpdateBoardSection(selectedSection.id, sectionLabelDraft.trim())}
            >
              {isSpanish ? "Guardar nombre de sección" : "Save Section Name"}
            </button>
          </div>
        ) : null}
      </article>

      <article className="operations-card" data-testid="option-management">
        <div className="admin-section-head">
          <h3>{isSpanish ? "Etiquetas del tablero" : "Board Labels"}</h3>
          <span className="subtitle">{isSpanish ? "Colores de estado y opciones" : "Status colors and choices"}</span>
        </div>
        <label className="config-field">{isSpanish ? "Conjunto de opciones" : "Option set"}
          <select data-testid="option-set-select" value={fieldKey} onChange={(event) => { setFieldKey(event.target.value); setSelectedOptionId(""); }}>
            {optionSets.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <form className="option-create" onSubmit={(event) => {
          event.preventDefault();
          void onCreateOption({ fieldKey, ...newOption }).then(() => setNewOption((current) => ({ ...current, value: "" })));
        }}>
          <input data-testid="option-create-value" value={newOption.value} placeholder={isSpanish ? "Nueva etiqueta" : "New label"} onChange={(event) => setNewOption((current) => ({ ...current, value: event.target.value }))} required />
          <input data-testid="option-create-color" type="color" value={newOption.color} onChange={(event) => setNewOption((current) => ({ ...current, color: event.target.value }))} aria-label={isSpanish ? "Color de fondo de la opción" : "Option background color"} />
          <button data-testid="option-create-submit" className="button button-primary" disabled={loading}>{isSpanish ? "Agregar" : "Add"}</button>
        </form>
        <div className="option-summary" data-testid="board-option-summary">
          <span className="status-chip active">{isSpanish ? `${activeOptionCount} activas` : `${activeOptionCount} active`}</span>
          <span className="status-chip inactive">{isSpanish ? `${archivedOptionCount} archivadas` : `${archivedOptionCount} archived`}</span>
          {newOption.value.trim() ? <LabelPill value={newOption.value.trim()} label={{ color: newOption.color, textColor: newOption.textColor } as LabelDefinition} /> : null}
        </div>
        <p className="helper-copy span-full">
          {isSpanish
            ? "Las opciones archivadas siguen visibles en filas historicas, pero ya no aparecen como seleccionables para operadores."
            : "Archived options stay visible on historical rows, but they no longer appear as selectable choices for operators."}
        </p>
        <div className="option-list">
          {fieldOptions.map((option, index) => (
            <div className="option-row" key={option.id}>
              <button data-testid={`option-row-${option.value.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} className="option-pick" onClick={() => setSelectedOptionId(option.id)}>
                <LabelPill value={option.value} label={option} muted={option.isArchived} />
              </button>
              <button className="icon-button" aria-label={isSpanish ? "Mover hacia arriba" : "Move up"} disabled={index === 0} onClick={() => void moveOption(option.id, -1)}>↑</button>
              <button className="icon-button" aria-label={isSpanish ? "Mover hacia abajo" : "Move down"} disabled={index === fieldOptions.length - 1} onClick={() => void moveOption(option.id, 1)}>↓</button>
            </div>
          ))}
        </div>
        {selectedOption ? (
          <div className="editor-block option-editor">
            <label>{isSpanish ? "Etiqueta" : "Label"}<input data-testid="option-edit-value" value={optionDraft.value} onChange={(event) => setOptionDraft((current) => ({ ...current, value: event.target.value }))} /></label>
            <label>{isSpanish ? "Color" : "Color"}<input data-testid="option-edit-color" type="color" value={optionDraft.color} onChange={(event) => setOptionDraft((current) => ({ ...current, color: event.target.value }))} /></label>
            <div className="option-summary span-full">
              <LabelPill value={optionDraft.value || selectedOption.value} label={{ color: optionDraft.color, textColor: selectedOption.textColor } as LabelDefinition} muted={selectedOption.isArchived} />
              <span className={`option-state-badge ${selectedOption.isArchived ? "archived" : "active"}`}>
                {selectedOption.isArchived ? (isSpanish ? "Solo historial" : "Historical only") : (isSpanish ? "Seleccionable" : "Selectable")}
              </span>
            </div>
            <p className="helper-copy span-full">
              {selectedOption.isArchived
                ? (isSpanish ? "Restaurar vuelve a mostrar esta opcion en listas y celdas editables." : "Restore makes this option selectable again in lists and editable cells.")
                : (isSpanish ? "Archivar conserva el valor en registros existentes y lo retira de nuevas selecciones." : "Archive keeps the value on existing records and removes it from new selections.")}
            </p>
            <div className="admin-actions span-full">
              <button data-testid="option-save" className="button button-primary" onClick={() => void onUpdateOption(selectedOption.id, optionDraft)}>{isSpanish ? "Guardar" : "Save"}</button>
              <button data-testid={selectedOption.isArchived ? "option-restore" : "option-archive"} className="button button-secondary" onClick={() => setPendingOptionArchive(selectedOption)}>
                {selectedOption.isArchived ? (isSpanish ? "Restaurar" : "Restore") : (isSpanish ? "Archivar" : "Archive")}
              </button>
            </div>
          </div>
        ) : null}
      </article>

      <article className="operations-card" data-testid="floor-plan-management">
        <div className="admin-section-head">
          <h3>{isSpanish ? "Planos de unidad" : "Floor Plans"}</h3>
          <span className="subtitle">{isSpanish ? "Configurados por propiedad" : "Configured per property"}</span>
        </div>
        <label className="config-field">{isSpanish ? "Propiedad" : "Property"}
          <select data-testid="floor-plan-property" value={propertyId} onChange={(event) => { setPropertyId(event.target.value); setSelectedPlanId(""); }}>
            {properties.filter((property) => property.isActive).map((property) => <option key={property.id} value={property.id}>{property.code} - {property.name}</option>)}
          </select>
        </label>
        <form className="floor-plan-form" onSubmit={(event) => {
          event.preventDefault();
          void onCreateFloorPlan({
            propertyId,
            code: newPlan.code,
            name: newPlan.name.trim() || newPlan.code.trim(),
            bedrooms: numberOrNull(newPlan.bedrooms),
            bathrooms: numberOrNull(newPlan.bathrooms),
            squareFeet: numberOrNull(newPlan.squareFeet),
            description: newPlan.description || null,
          }).then(() => setNewPlan({ code: "", name: "", bedrooms: "", bathrooms: "", squareFeet: "", description: "" }));
        }}>
          <input data-testid="floor-plan-create-code" placeholder={isSpanish ? "Código (B1, C2)" : "Code (B1, C2)"} value={newPlan.code} onChange={(event) => setNewPlan((current) => ({ ...current, code: event.target.value }))} required />
          <input data-testid="floor-plan-create-name" placeholder={isSpanish ? "Nombre amigable (Arlington)" : "Friendly name (Arlington)"} value={newPlan.name} onChange={(event) => setNewPlan((current) => ({ ...current, name: event.target.value }))} />
          <input data-testid="floor-plan-create-beds" type="number" min="0" placeholder={isSpanish ? "Recámaras" : "Beds"} value={newPlan.bedrooms} onChange={(event) => setNewPlan((current) => ({ ...current, bedrooms: event.target.value }))} />
          <input data-testid="floor-plan-create-baths" type="number" step="0.5" min="0" placeholder={isSpanish ? "Baños" : "Baths"} value={newPlan.bathrooms} onChange={(event) => setNewPlan((current) => ({ ...current, bathrooms: event.target.value }))} />
          <input data-testid="floor-plan-create-sqft" type="number" min="1" placeholder={isSpanish ? "Pies²" : "Sq ft"} value={newPlan.squareFeet} onChange={(event) => setNewPlan((current) => ({ ...current, squareFeet: event.target.value }))} />
          <input data-testid="floor-plan-create-description" className="span-full" placeholder={isSpanish ? "Descripción (opcional)" : "Description (optional)"} value={newPlan.description} onChange={(event) => setNewPlan((current) => ({ ...current, description: event.target.value }))} />
          <button data-testid="floor-plan-create-submit" className="button button-primary span-full" disabled={loading || !propertyId}>{isSpanish ? "Agregar plano" : "Add Floor Plan"}</button>
        </form>
        <div className="record-list">
          {propertyPlans.length === 0 ? <StatusState title={isSpanish ? "No hay planos configurados" : "No configured floor plans"} description={isSpanish ? "El texto heredado sigue siendo válido hasta que se asigne una unidad." : "Legacy text remains valid until a unit is mapped."} tone="subtle" /> : (
            <>
              <div className="section-header">
                <strong>{isSpanish ? "Planos activos" : "Active floor plans"}</strong>
                <span className="muted">{activePropertyPlans.length}</span>
              </div>
              {activePropertyPlans.map((plan) => (
                <button key={plan.id} type="button" data-testid={`floor-plan-row-${plan.code.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} className={selectedPlanId === plan.id ? "record-row selected" : "record-row"} onClick={() => setSelectedPlanId(plan.id)}>
                  <span><strong>{plan.code}</strong>{plan.name !== plan.code ? ` ${plan.name}` : ""}{plan.squareFeet ? ` ${plan.squareFeet} ${isSpanish ? "pies²" : "sq ft"}` : isSpanish ? " Sin metraje" : " No square footage"}</span>
                  <span className="status-chip active">{isSpanish ? "Activo" : "Active"}</span>
                </button>
              ))}
              {archivedPropertyPlans.length > 0 ? (
                <>
                  <div className="section-header" style={{ marginTop: 12 }}>
                    <strong>{isSpanish ? "Planos archivados" : "Archived floor plans"}</strong>
                    <span className="muted">{archivedPropertyPlans.length}</span>
                  </div>
                  {archivedPropertyPlans.map((plan) => (
                    <button key={plan.id} type="button" data-testid={`floor-plan-row-${plan.code.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} className={selectedPlanId === plan.id ? "record-row selected" : "record-row"} onClick={() => setSelectedPlanId(plan.id)}>
                      <span><strong>{plan.code}</strong>{plan.name !== plan.code ? ` ${plan.name}` : ""}{plan.squareFeet ? ` ${plan.squareFeet} ${isSpanish ? "pies²" : "sq ft"}` : isSpanish ? " Sin metraje" : " No square footage"}</span>
                      <span className="status-chip inactive">{isSpanish ? "Archivado" : "Archived"}</span>
                    </button>
                  ))}
                </>
              ) : null}
            </>
          )}
        </div>
        {selectedPlan ? (
          <div className="editor-block">
            <label>{isSpanish ? "Código" : "Code"}<input data-testid="floor-plan-edit-code" value={planDraft.code} onChange={(event) => setPlanDraft((current) => ({ ...current, code: event.target.value }))} /></label>
            <label>{isSpanish ? "Nombre" : "Name"}<input data-testid="floor-plan-edit-name" value={planDraft.name} onChange={(event) => setPlanDraft((current) => ({ ...current, name: event.target.value }))} /></label>
            <label>{isSpanish ? "Recámaras" : "Beds"}<input type="number" value={planDraft.bedrooms} onChange={(event) => setPlanDraft((current) => ({ ...current, bedrooms: event.target.value }))} /></label>
            <label>{isSpanish ? "Baños" : "Baths"}<input type="number" step="0.5" value={planDraft.bathrooms} onChange={(event) => setPlanDraft((current) => ({ ...current, bathrooms: event.target.value }))} /></label>
            <label>{isSpanish ? "Pies²" : "Sq ft"}<input type="number" value={planDraft.squareFeet} onChange={(event) => setPlanDraft((current) => ({ ...current, squareFeet: event.target.value }))} /></label>
            <label className="span-full">{isSpanish ? "Descripción" : "Description"}<input data-testid="floor-plan-edit-description" value={planDraft.description} onChange={(event) => setPlanDraft((current) => ({ ...current, description: event.target.value }))} /></label>
            <div className="admin-actions span-full">
              <button data-testid="floor-plan-save" className="button button-primary" onClick={() => void onUpdateFloorPlan(selectedPlan.id, { code: planDraft.code.trim(), name: planDraft.name.trim() || planDraft.code.trim(), bedrooms: numberOrNull(planDraft.bedrooms), bathrooms: numberOrNull(planDraft.bathrooms), squareFeet: numberOrNull(planDraft.squareFeet), description: planDraft.description || null })}>{isSpanish ? "Guardar" : "Save"}</button>
              <button data-testid={selectedPlan.isActive ? "floor-plan-archive" : "floor-plan-restore"} className="button button-secondary" onClick={() => void onArchiveFloorPlan(selectedPlan.id, selectedPlan.isActive)}>{selectedPlan.isActive ? (isSpanish ? "Archivar" : "Archive") : (isSpanish ? "Restaurar" : "Restore")}</button>
            </div>
          </div>
        ) : null}
      </article>

      <ConfirmDialog
        open={Boolean(pendingOptionArchive)}
        language={isSpanish ? "es" : "en"}
        title={pendingOptionArchive?.isArchived ? (isSpanish ? "Restaurar opcion" : "Restore option") : (isSpanish ? "Archivar opcion" : "Archive option")}
        description={pendingOptionArchive?.isArchived
          ? `${isSpanish ? "Restaurar" : "Restore"} ${pendingOptionArchive?.value ?? (isSpanish ? "esta opcion" : "this option")}? ${isSpanish ? "Volvera a aparecer en listas, celdas editables y configuraciones operativas." : "It will appear again in lists, editable cells, and operational setup."}`
          : `${isSpanish ? "Archivar" : "Archive"} ${pendingOptionArchive?.value ?? (isSpanish ? "esta opcion" : "this option")}? ${isSpanish ? "Los registros existentes conservaran el valor, pero los operadores ya no podran seleccionarlo en nuevas actualizaciones." : "Existing records keep the value, but operators will not be able to select it for new updates."}`}
        confirmLabel={pendingOptionArchive?.isArchived ? (isSpanish ? "Restaurar opcion" : "Restore option") : (isSpanish ? "Archivar opcion" : "Archive option")}
        tone={pendingOptionArchive?.isArchived ? "default" : "danger"}
        onClose={() => setPendingOptionArchive(null)}
        onConfirm={async () => {
          if (!pendingOptionArchive) return;
          await onArchiveOption(pendingOptionArchive.id, Boolean(pendingOptionArchive.isArchived));
          setPendingOptionArchive(null);
        }}
      />

      <article className="operations-card" data-testid="column-label-management">
        <div className="admin-section-head">
          <h3>{isSpanish ? "Etiquetas de columnas" : "Column Labels"}</h3>
          <span className="subtitle">{isSpanish ? "Solo nombres visibles; las claves permanecen estables" : "Display names only; keys remain stable"}</span>
        </div>
        <label className="config-field">{isSpanish ? "Campo integrado" : "Built-in field"}
          <select data-testid="column-config-key" value={selectedColumnKey} onChange={(event) => setSelectedColumnKey(event.target.value)}>
            {columns.map((column) => <option key={column.fieldKey} value={column.fieldKey}>{column.fieldKey}</option>)}
          </select>
        </label>
        <label className="config-field">{isSpanish ? "Nombre visible" : "Display name"}
          <input data-testid="column-config-label" value={columnLabel} onChange={(event) => setColumnLabel(event.target.value)} />
        </label>
        <button data-testid="column-config-save" className="button button-primary" disabled={!columnLabel.trim()} onClick={() => void onUpdateColumn(selectedColumnKey, columnLabel.trim())}>{isSpanish ? "Guardar nombre visible" : "Save Display Name"}</button>
        <p className="helper-copy">{isSpanish ? "Las vistas guardadas, importaciones y automatizaciones siguen vinculándose por la clave interna sin cambios." : "Saved views, imports, and automations continue to bind by the unchanged internal field key."}</p>
      </article>

      <article className="operations-card" data-testid="schedule-track-management">
        <div className="admin-section-head">
          <h3>{isSpanish ? "Carriles de calendario" : "Schedule Tracks"}</h3>
          <span className="subtitle">{isSpanish ? "Campos de calendario y base de color" : "Calendar fields and color basis"}</span>
        </div>
        <div className="schedule-track-presets" data-testid="schedule-track-presets">
          {schedulePresets.map((preset) => {
            const sourceExists = scheduleSources.some((source) => source.key === preset.sourceField);
            const colorSourceExists = !preset.colorSourceField || scheduleColorSources.some((source) => source.key === preset.colorSourceField);
            const alreadyConfigured = configuredSources.has(preset.sourceField);
            const disabled = loading || !sourceExists || !colorSourceExists || alreadyConfigured;
            const note = alreadyConfigured ? (isSpanish ? "Ya configurado" : "Already configured") : !sourceExists ? (isSpanish ? "Falta el campo de fecha" : "Date field missing") : !colorSourceExists ? (isSpanish ? "Falta el campo de color" : "Color field missing") : (isSpanish ? "Crear preajuste" : "Create preset");

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
            <option value="">{isSpanish ? "Campo de fecha" : "Date field"}</option>
            {scheduleSources.filter((source) => !configuredSources.has(source.key)).map((source) => <option key={source.key} value={source.key}>{source.label}</option>)}
          </select>
          <input data-testid="schedule-track-create-name" placeholder={isSpanish ? "Nombre del carril" : "Track name"} value={newTrack.displayName} onChange={(event) => setNewTrack((current) => ({ ...current, displayName: event.target.value }))} required />
          <select data-testid="schedule-track-create-basis" value={newTrack.colorBasis} onChange={(event) => setNewTrack((current) => ({ ...current, colorBasis: event.target.value as ScheduleTrack["colorBasis"] }))}>
            <option value="STATUS">{isSpanish ? "Color por estado" : "Status color"}</option>
            <option value="SCOPE">{isSpanish ? "Color por alcance" : "Scope color"}</option>
            <option value="FIELD">{isSpanish ? "Color del campo seleccionado" : "Selected field color"}</option>
            <option value="FIXED">{isSpanish ? "Color fijo" : "Fixed color"}</option>
            <option value="NEUTRAL">{isSpanish ? "Neutro" : "Neutral"}</option>
          </select>
          {newTrack.colorBasis === "FIELD" ? <select data-testid="schedule-track-create-color-source" value={newTrack.colorSourceField ?? ""} onChange={(event) => setNewTrack((current) => ({ ...current, colorSourceField: event.target.value || null }))} required><option value="">{isSpanish ? "Campo de color" : "Color field"}</option>{scheduleColorSources.map((source) => <option key={source.key} value={source.key}>{source.label}</option>)}</select> : null}
          {newTrack.colorBasis === "FIXED" ? <input data-testid="schedule-track-create-color" type="color" value={newTrack.fixedColor} onChange={(event) => setNewTrack((current) => ({ ...current, fixedColor: event.target.value }))} /> : null}
          <button data-testid="schedule-track-create-submit" className="button button-primary" disabled={!newTrack.sourceField || !newTrack.displayName.trim()}>{isSpanish ? "Agregar carril" : "Add Track"}</button>
        </form>
        <div className="schedule-track-guidance" data-testid="schedule-track-create-guidance">
          <div className="schedule-track-guidance-card">
            <strong>{isSpanish ? "Nuevo carril" : "New track"}</strong>
            <div className="option-summary">
              <span className="status-chip active">{newTrack.sourceField ? scheduleSourceLabel(newTrack.sourceField) : (isSpanish ? "Elija fecha" : "Choose date")}</span>
              <span className="status-chip inactive">{scheduleColorBasisLabel(newTrack.colorBasis)}</span>
              {newTrack.colorBasis === "FIELD" && newTrack.colorSourceField ? <span className="status-chip inactive">{scheduleColorSourceLabel(newTrack.colorSourceField)}</span> : null}
            </div>
            <ul className="schedule-track-hint-list">
              {createTrackGuidance.map((note) => <li key={note}>{note}</li>)}
            </ul>
          </div>
          {createTrackWarnings.length ? (
            <div className="schedule-track-warning" data-testid="schedule-track-create-warning">
              <strong>{isSpanish ? "Revise antes de guardar" : "Review before saving"}</strong>
              <ul className="schedule-track-hint-list">
                {createTrackWarnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </div>
          ) : null}
        </div>
        <div className="option-list">
          <div className="section-header">
            <strong>{isSpanish ? "Carriles activos" : "Active tracks"}</strong>
            <span className="muted">{activeScheduleTracks.length}</span>
          </div>
          {activeScheduleTracks.map((track, index) => (
            <div className="schedule-track-row" key={track.id}>
              <button data-testid={`schedule-track-row-${track.sourceField.replace(/[^a-zA-Z0-9]+/g, "-")}`} className="option-pick" onClick={() => setSelectedTrackId(track.id)}>
                <strong>{track.displayName}</strong><small>{track.sourceField} / {track.colorBasis}{track.isEnabled ? "" : " / Disabled"}</small>
              </button>
              <button className="icon-button" aria-label={isSpanish ? "Mover carril hacia arriba" : "Move track up"} disabled={index === 0} onClick={() => void moveTrack(track.id, -1)}>↑</button>
              <button className="icon-button" aria-label={isSpanish ? "Mover carril hacia abajo" : "Move track down"} disabled={index === activeScheduleTracks.length - 1} onClick={() => void moveTrack(track.id, 1)}>↓</button>
            </div>
          ))}
          {archivedScheduleTracks.length > 0 ? (
            <>
              <div className="section-header" style={{ marginTop: 12 }}>
                <strong>{isSpanish ? "Carriles archivados" : "Archived tracks"}</strong>
                <span className="muted">{archivedScheduleTracks.length}</span>
              </div>
              {archivedScheduleTracks.map((track) => (
                <div className="schedule-track-row" key={track.id}>
                  <button data-testid={`schedule-track-row-${track.sourceField.replace(/[^a-zA-Z0-9]+/g, "-")}`} className="option-pick" onClick={() => setSelectedTrackId(track.id)}>
                    <strong>{track.displayName}</strong><small>{track.sourceField} / {track.colorBasis} / Archived</small>
                  </button>
                </div>
              ))}
            </>
          ) : null}
        </div>
        {selectedTrack ? (
          <div className="editor-block">
            <label>{isSpanish ? "Fuente de fecha" : "Date source"}<select data-testid="schedule-track-edit-source" value={trackDraft.sourceField} onChange={(event) => setTrackDraft((current) => ({ ...current, sourceField: event.target.value }))}>{availableEditSources.filter((source) => source.key === selectedTrack.sourceField || !configuredSources.has(source.key)).map((source) => <option key={source.key} value={source.key}>{source.label}</option>)}</select></label>
            <label>{isSpanish ? "Nombre" : "Name"}<input data-testid="schedule-track-edit-name" value={trackDraft.displayName} onChange={(event) => setTrackDraft((current) => ({ ...current, displayName: event.target.value }))} /></label>
            <label>{isSpanish ? "Colores" : "Colors"}<select data-testid="schedule-track-edit-basis" value={trackDraft.colorBasis} onChange={(event) => setTrackDraft((current) => ({ ...current, colorBasis: event.target.value as ScheduleTrack["colorBasis"] }))}><option value="STATUS">{isSpanish ? "Color por estado" : "Status color"}</option><option value="SCOPE">{isSpanish ? "Color por alcance" : "Scope color"}</option><option value="FIELD">{isSpanish ? "Color del campo seleccionado" : "Selected field color"}</option><option value="FIXED">{isSpanish ? "Color fijo" : "Fixed color"}</option><option value="NEUTRAL">{isSpanish ? "Neutro" : "Neutral"}</option></select></label>
            {trackDraft.colorBasis === "FIELD" ? <label>{isSpanish ? "Campo de color" : "Color field"}<select data-testid="schedule-track-edit-color-source" value={trackDraft.colorSourceField ?? ""} onChange={(event) => setTrackDraft((current) => ({ ...current, colorSourceField: event.target.value || null }))}>{availableEditColorSources.map((source) => <option key={source.key} value={source.key}>{source.label}</option>)}</select></label> : null}
            {trackDraft.colorBasis === "FIXED" ? <label>{isSpanish ? "Color fijo" : "Fixed color"}<input data-testid="schedule-track-edit-color" type="color" value={trackDraft.fixedColor} onChange={(event) => setTrackDraft((current) => ({ ...current, fixedColor: event.target.value }))} /></label> : null}
            <label>{isSpanish ? "Agrupación" : "Grouping"}<select data-testid="schedule-track-edit-grouping" value={trackDraft.groupingMode} onChange={(event) => setTrackDraft((current) => ({ ...current, groupingMode: event.target.value as ScheduleTrack["groupingMode"] }))}><option value="NONE">{isSpanish ? "Sin agrupación" : "No grouping"}</option><option value="PROPERTY">{isSpanish ? "Propiedad" : "Property"}</option><option value="BOARD_GROUP">{isSpanish ? "Sección del tablero" : "Board section"}</option></select></label>
            <label className="span-full">{isSpanish ? "Secciones visibles" : "Visible sections"}
              <select
                multiple
                data-testid="schedule-track-edit-visible-groups"
                value={trackDraft.visibilityFilter?.boardGroups ?? []}
                onChange={(event) => {
                  const boardGroups = Array.from(event.target.selectedOptions).map((option) => option.value);
                  setTrackDraft((current) => ({ ...current, visibilityFilter: { ...(current.visibilityFilter ?? {}), boardGroups } }));
                }}
              >
                {scheduleVisibleSections.map((section) => (
                  <option key={section.id} value={section.key}>
                    {section.property.code} / {section.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="toggle-row"><input data-testid="schedule-track-edit-overdue" type="checkbox" checked={trackDraft.overdueEnabled} onChange={(event) => setTrackDraft((current) => ({ ...current, overdueEnabled: event.target.checked }))} /> {isSpanish ? "Marcar vencidos" : "Flag overdue"}</label>
            <label className="toggle-row"><input data-testid="schedule-track-edit-soon" type="checkbox" checked={trackDraft.moveInSoonEnabled} onChange={(event) => setTrackDraft((current) => ({ ...current, moveInSoonEnabled: event.target.checked }))} /> {isSpanish ? "Marcar próximo move-in" : "Flag move-in soon"}</label>
            <label className="toggle-row"><input data-testid="schedule-track-edit-enabled" type="checkbox" checked={trackDraft.isEnabled} onChange={(event) => setTrackDraft((current) => ({ ...current, isEnabled: event.target.checked }))} /> {isSpanish ? "Habilitado" : "Enabled"}</label>
            <div className="schedule-track-guidance span-full" data-testid="schedule-track-edit-guidance">
              <div className="schedule-track-guidance-card">
                <strong>{isSpanish ? "Resumen operativo" : "Operational summary"}</strong>
                <div className="option-summary">
                  <span className="status-chip active">{scheduleSourceLabel(trackDraft.sourceField)}</span>
                  <span className="status-chip inactive">{scheduleColorBasisLabel(trackDraft.colorBasis)}</span>
                  <span className="status-chip inactive">{scheduleGroupingLabel(trackDraft.groupingMode)}</span>
                  <span className="status-chip inactive">{scheduleVisibilityLabel(trackDraft.visibilityFilter)}</span>
                </div>
                <ul className="schedule-track-hint-list">
                  {editTrackGuidance.map((note) => <li key={note}>{note}</li>)}
                </ul>
              </div>
              {editTrackWarnings.length ? (
                <div className="schedule-track-warning" data-testid="schedule-track-edit-warning">
                  <strong>{isSpanish ? "Conflictos o alcance a revisar" : "Conflicts or scope to review"}</strong>
                  <ul className="schedule-track-hint-list">
                    {editTrackWarnings.map((warning) => <li key={warning}>{warning}</li>)}
                  </ul>
                </div>
              ) : null}
            </div>
            <button data-testid="schedule-track-save" className="button button-primary span-full" onClick={() => void onUpdateScheduleTrack(selectedTrack.id, { ...trackDraft, colorSourceField: trackDraft.colorBasis === "FIELD" ? trackDraft.colorSourceField : null, fixedColor: trackDraft.colorBasis === "FIXED" ? trackDraft.fixedColor : null })}>{isSpanish ? "Guardar carril" : "Save Track"}</button>
            <button data-testid={selectedTrack.isArchived ? "schedule-track-restore" : "schedule-track-archive"} className="button button-secondary span-full" onClick={() => void onArchiveScheduleTrack(selectedTrack.id, selectedTrack.isArchived)}>{selectedTrack.isArchived ? (isSpanish ? "Restaurar carril" : "Restore Track") : (isSpanish ? "Archivar carril" : "Archive Track")}</button>
          </div>
        ) : null}
      </article>
    </section>
  );
}
