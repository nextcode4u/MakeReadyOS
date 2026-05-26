import { useMemo, useState } from "react";
import type { BoardSection, LabelDefinition, MakeReadyItem, Property, PropertyMap, Unit, UnitMapLocation } from "../lib/api";
import { propertyMapFileUrl } from "../lib/api";
import { displayUnitNumber } from "../lib/board";

type ColorSource = "riskLevel" | "vacancyStatus" | "boardSection" | "assignedTech" | "makeReadyStatus";

type Props = {
  properties: Property[];
  units: Unit[];
  items: MakeReadyItem[];
  maps: PropertyMap[];
  locations: UnitMapLocation[];
  labelsByField: Record<string, Record<string, LabelDefinition>>;
  boardSections: BoardSection[];
  selectedPropertyId: string;
  canManage: boolean;
  loading?: boolean;
  error?: string | null;
  onPropertyChange: (propertyId: string) => void;
  onCreateMap: (input: { propertyId: string; name: string; notes?: string | null; width?: number | null; height?: number | null }) => Promise<void>;
  onArchiveMap: (id: string, restore?: boolean) => Promise<void>;
  onUploadMap: (id: string, file: File) => Promise<void>;
  onSaveLocation: (input: {
    propertyId: string;
    mapId: string;
    unitId: string;
    xPercent: number;
    yPercent: number;
    building?: string | null;
    area?: string | null;
    floor?: string | null;
  }) => Promise<void>;
  onRemoveLocation: (id: string) => Promise<void>;
  onOpenItem: (itemId: string) => void;
};

const riskColors: Record<string, string> = {
  NONE: "#8a93a6",
  LOW: "#41c98f",
  MEDIUM: "#ffc268",
  HIGH: "#ec6b7d",
  CRITICAL: "#ff3b30",
};

const sectionColors: Record<string, string> = {
  READY: "#41c98f",
  MAKE_READY: "#3ca2d1",
  DOWN: "#ffc268",
  ARCHIVE: "#8a93a6",
};

function hashColor(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = value.charCodeAt(index) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360} 62% 52%)`;
}

function markerColor(source: ColorSource, item: MakeReadyItem | undefined, labelsByField: Props["labelsByField"], sections: BoardSection[]) {
  if (!item) return "#8a93a6";
  if (source === "riskLevel") return riskColors[item.riskLevel] ?? riskColors.NONE;
  if (source === "assignedTech") return item.assignedTech ? hashColor(item.assignedTech) : "#8a93a6";
  if (source === "boardSection") {
    const section = sections.find((entry) => entry.propertyId === item.propertyId && entry.key === item.boardGroup);
    return sectionColors[section?.sectionType ?? ""] ?? "#8a93a6";
  }
  const fieldKey = source === "vacancyStatus" ? "vacancyStatus" : "makeReadyStatus";
  const value = source === "vacancyStatus" ? item.vacancyStatus : item.makeReadyStatus;
  return (value && labelsByField[fieldKey]?.[value]?.color) || "#8a93a6";
}

function markerLabel(source: ColorSource, item: MakeReadyItem | undefined, sections: BoardSection[]) {
  if (!item) return "No active turn";
  if (source === "riskLevel") return item.riskLevel;
  if (source === "assignedTech") return item.assignedTech || "Unassigned";
  if (source === "boardSection") return sections.find((entry) => entry.propertyId === item.propertyId && entry.key === item.boardGroup)?.displayName ?? item.boardGroup;
  return source === "vacancyStatus" ? item.vacancyStatus ?? "Unset" : item.makeReadyStatus ?? "Unset";
}

export function PropertyMapsPanel({
  properties,
  units,
  items,
  maps,
  locations,
  labelsByField,
  boardSections,
  selectedPropertyId,
  canManage,
  loading = false,
  error = null,
  onPropertyChange,
  onCreateMap,
  onArchiveMap,
  onUploadMap,
  onSaveLocation,
  onRemoveLocation,
  onOpenItem,
}: Props) {
  const initialPropertyId = selectedPropertyId || properties[0]?.id || "";
  const [localPropertyId, setLocalPropertyId] = useState(initialPropertyId);
  const propertyId = selectedPropertyId || localPropertyId;
  const property = properties.find((entry) => entry.id === propertyId);
  const propertyMaps = maps.filter((map) => map.propertyId === propertyId);
  const activeMap = propertyMaps.find((map) => map.isActive && !map.isArchived) ?? propertyMaps.find((map) => !map.isArchived) ?? propertyMaps[0];
  const [activeMapId, setActiveMapId] = useState("");
  const selectedMap = propertyMaps.find((map) => map.id === (activeMapId || activeMap?.id)) ?? activeMap;
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [colorSource, setColorSource] = useState<ColorSource>("riskLevel");
  const [draftName, setDraftName] = useState("");
  const [locationMeta, setLocationMeta] = useState({ building: "", area: "", floor: "" });

  const propertyUnits = units.filter((unit) => unit.propertyId === propertyId && unit.isActive);
  const itemByUnit = useMemo(() => {
    const result = new Map<string, MakeReadyItem>();
    for (const item of items) {
      if (item.unitId && item.propertyId === propertyId && !item.isArchived && !result.has(item.unitId)) result.set(item.unitId, item);
    }
    return result;
  }, [items, propertyId]);
  const mapLocations = locations.filter((location) => location.mapId === selectedMap?.id && !location.isArchived);
  const locationByUnit = useMemo(() => new Map(mapLocations.map((location) => [location.unitId, location])), [mapLocations]);
  const unmappedUnits = propertyUnits.filter((unit) => !locationByUnit.has(unit.id));
  const imagePreview = selectedMap?.mimeType?.startsWith("image/");

  const legendEntries = useMemo(() => {
    const entries = new Map<string, string>();
    for (const location of mapLocations) {
      const item = itemByUnit.get(location.unitId);
      entries.set(markerLabel(colorSource, item, boardSections), markerColor(colorSource, item, labelsByField, boardSections));
    }
    return Array.from(entries.entries());
  }, [boardSections, colorSource, itemByUnit, labelsByField, mapLocations]);

  const updateProperty = (value: string) => {
    setLocalPropertyId(value);
    onPropertyChange(value);
    setActiveMapId("");
    setSelectedUnitId("");
  };

  const saveAt = async (xPercent: number, yPercent: number) => {
    if (!canManage || !selectedMap || !selectedUnitId) return;
    await onSaveLocation({
      propertyId,
      mapId: selectedMap.id,
      unitId: selectedUnitId,
      xPercent,
      yPercent,
      building: locationMeta.building || null,
      area: locationMeta.area || null,
      floor: locationMeta.floor || null,
    });
  };

  return (
    <section className="panel property-map-panel" data-testid="property-maps-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Property Maps</p>
          <h2>Map & Unit Directory</h2>
          <p className="muted">Local site maps, unit markers, mapped/unmapped status, and visual navigation without external map services.</p>
        </div>
      </div>
      {loading && <div className="state-card">Loading property maps...</div>}
      {error && <div className="state-card error">{error}</div>}

      <div className="toolbar compact-toolbar map-toolbar">
        <label>Property
          <select data-testid="map-property-select" value={propertyId} onChange={(event) => updateProperty(event.target.value)}>
            {properties.map((entry) => <option key={entry.id} value={entry.id}>{entry.code} - {entry.name}</option>)}
          </select>
        </label>
        <label>Map
          <select data-testid="map-active-select" value={selectedMap?.id ?? ""} onChange={(event) => setActiveMapId(event.target.value)}>
            <option value="">No map selected</option>
            {propertyMaps.map((map) => <option key={map.id} value={map.id}>{map.name}{map.isArchived ? " (archived)" : ""}</option>)}
          </select>
        </label>
        <label>Color by
          <select data-testid="map-color-source" value={colorSource} onChange={(event) => setColorSource(event.target.value as ColorSource)}>
            <option value="riskLevel">Risk Level</option>
            <option value="vacancyStatus">Vacancy Status</option>
            <option value="boardSection">Board Section</option>
            <option value="assignedTech">Assigned Tech</option>
            <option value="makeReadyStatus">Make Ready Status</option>
          </select>
        </label>
      </div>

      {canManage && (
        <div className="operations-card map-management-card">
          <h3>Map Setup</h3>
          <form className="inline-form" data-testid="map-create-form" onSubmit={async (event) => {
            event.preventDefault();
            if (!propertyId || !draftName.trim()) return;
            await onCreateMap({ propertyId, name: draftName.trim() });
            setDraftName("");
          }}>
            <input data-testid="map-create-name" value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder="New map name" />
            <button data-testid="map-create-submit" className="button button-primary" disabled={!draftName.trim()}>Create Map</button>
          </form>
          {selectedMap ? (
            <div className="map-file-actions">
              <input data-testid="map-file-upload" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onUploadMap(selectedMap.id, file);
              }} />
              <button className="button button-secondary" data-testid="map-archive-button" onClick={() => void onArchiveMap(selectedMap.id, !selectedMap.isArchived)}>
                {selectedMap.isArchived ? "Restore Map" : "Archive Map"}
              </button>
            </div>
          ) : null}
        </div>
      )}

      <div className="map-grid">
        <div className="operations-card map-editor-card">
          <div className="map-card-header">
            <div>
              <h3>{selectedMap?.name ?? "No map configured"}</h3>
              <p className="muted">{property ? `${property.code} unit map` : "Select a property"} / {mapLocations.length} mapped / {unmappedUnits.length} unmapped</p>
            </div>
            <div className="map-legend" data-testid="map-legend">
              {legendEntries.length === 0 ? <span className="muted">No marker legend yet</span> : legendEntries.map(([label, color]) => <span key={label}><i style={{ background: color }} />{label}</span>)}
            </div>
          </div>
          <div
            className={`property-map-canvas ${imagePreview ? "" : "no-preview"}`}
            data-testid="property-map-canvas"
            onClick={(event) => {
              const box = event.currentTarget.getBoundingClientRect();
              void saveAt(((event.clientX - box.left) / box.width) * 100, ((event.clientY - box.top) / box.height) * 100);
            }}
          >
            {selectedMap && imagePreview ? <img src={propertyMapFileUrl(selectedMap.id)} alt={`${selectedMap.name} map`} /> : (
              <div className="map-placeholder">
                <strong>{selectedMap ? "Map file preview unavailable" : "Create or select a map"}</strong>
                <span>{selectedMap?.mimeType === "application/pdf" ? "PDF maps are stored and downloadable; marker editing uses this neutral canvas." : "Upload a PNG, JPG, WebP, or PDF property map."}</span>
              </div>
            )}
            {mapLocations.map((location) => {
              const item = itemByUnit.get(location.unitId);
              const unit = propertyUnits.find((entry) => entry.id === location.unitId) ?? location.unit;
              const color = markerColor(colorSource, item, labelsByField, boardSections);
              return (
                <button
                  key={location.id}
                  type="button"
                  className="map-marker"
                  data-testid={`map-marker-${unit.number}`}
                  style={{ left: `${location.xPercent}%`, top: `${location.yPercent}%`, background: color }}
                  title={`${unit.number} / ${markerLabel(colorSource, item, boardSections)}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (item) onOpenItem(item.id);
                  }}
                >
                  {unit.number}
                </button>
              );
            })}
          </div>
          {selectedMap?.mimeType === "application/pdf" ? <a className="button button-secondary" href={propertyMapFileUrl(selectedMap.id)} target="_blank" rel="noreferrer">Open PDF map</a> : null}
        </div>

        <div className="operations-card unit-directory-card" data-testid="unit-directory-panel">
          <h3>Unit Directory</h3>
          <div className="stacked-form">
            <label>Unit to place
              <select data-testid="map-unit-select" value={selectedUnitId} onChange={(event) => {
                setSelectedUnitId(event.target.value);
                const existing = locationByUnit.get(event.target.value);
                setLocationMeta({ building: existing?.building ?? "", area: existing?.area ?? "", floor: existing?.floor ?? "" });
              }}>
                <option value="">Select unit</option>
                {propertyUnits.map((unit) => <option key={unit.id} value={unit.id}>{displayUnitNumber(property?.code ?? "", unit.number)}{locationByUnit.has(unit.id) ? " / mapped" : " / unmapped"}</option>)}
              </select>
            </label>
            <div className="three-column-form">
              <input data-testid="map-location-building" value={locationMeta.building} onChange={(event) => setLocationMeta((current) => ({ ...current, building: event.target.value }))} placeholder="Building" />
              <input data-testid="map-location-area" value={locationMeta.area} onChange={(event) => setLocationMeta((current) => ({ ...current, area: event.target.value }))} placeholder="Area" />
              <input data-testid="map-location-floor" value={locationMeta.floor} onChange={(event) => setLocationMeta((current) => ({ ...current, floor: event.target.value }))} placeholder="Floor" />
            </div>
            {canManage ? <p className="muted">Select a unit, then click the map to save or move its marker.</p> : <p className="muted">Map editing requires manager or admin access.</p>}
          </div>
          <div className="unit-directory-list">
            {propertyUnits.map((unit) => {
              const location = locationByUnit.get(unit.id);
              const item = itemByUnit.get(unit.id);
              return (
                <article key={unit.id} className="unit-directory-row">
                  <button type="button" onClick={() => item && onOpenItem(item.id)} disabled={!item}>
                    <strong>{displayUnitNumber(property?.code ?? "", unit.number)}</strong>
                    <small>{unit.floorPlanRecord?.name ?? unit.floorPlan ?? "No floor plan"} / {location ? `${location.area || "No area"} ${location.floor || ""}` : "Unmapped"}</small>
                  </button>
                  {location && canManage ? <button className="button button-secondary" data-testid={`map-location-remove-${unit.number}`} onClick={() => void onRemoveLocation(location.id)}>Remove</button> : null}
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
