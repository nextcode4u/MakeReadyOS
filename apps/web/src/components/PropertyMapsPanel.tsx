import { useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
import type { BoardSection, LabelDefinition, MakeReadyItem, Property, PropertyMap, PropertyMapArea, Unit, UnitMapLocation } from "../lib/api";
import { propertyMapFileUrl } from "../lib/api";
import { displayUnitNumber } from "../lib/board";

type ColorSource = "riskLevel" | "vacancyStatus" | "boardSection" | "assignedTech" | "makeReadyStatus";

function floorPlanLabel(plan: { code: string; name: string }) {
  return plan.name && plan.name !== plan.code ? `${plan.code} - ${plan.name}` : plan.code;
}

type Props = {
  properties: Property[];
  units: Unit[];
  items: MakeReadyItem[];
  maps: PropertyMap[];
  locations: UnitMapLocation[];
  areas: PropertyMapArea[];
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
  onCreateArea: (input: {
    propertyId: string;
    mapId: string;
    name: string;
    areaType?: string;
    xPercent: number;
    yPercent: number;
    color?: string | null;
    expectedUnitCount?: number | null;
    notes?: string | null;
  }) => Promise<void>;
  onUpdateArea: (id: string, input: Partial<{
    name: string;
    areaType: string;
    xPercent: number;
    yPercent: number;
    color: string | null;
    expectedUnitCount: number | null;
    notes: string | null;
    isArchived: boolean;
  }>) => Promise<void>;
  onRemoveArea: (id: string) => Promise<void>;
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
  areas,
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
  onCreateArea,
  onUpdateArea,
  onRemoveArea,
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
  const [areaDraft, setAreaDraft] = useState({ name: "", areaType: "BUILDING", expectedUnitCount: "", color: "#1f8fdb" });
  const [placingArea, setPlacingArea] = useState(false);
  const [selectedBuilding, setSelectedBuilding] = useState("");
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{ locationId: string; startX: number; startY: number; moved: boolean } | null>(null);
  const suppressMarkerClick = useRef<string | null>(null);

  const propertyUnits = units.filter((unit) => unit.propertyId === propertyId && unit.isActive);
  const itemByUnit = useMemo(() => {
    const result = new Map<string, MakeReadyItem>();
    for (const item of items) {
      if (item.unitId && item.propertyId === propertyId && !item.isArchived && !result.has(item.unitId)) result.set(item.unitId, item);
    }
    return result;
  }, [items, propertyId]);
  const mapLocations = locations.filter((location) => location.mapId === selectedMap?.id && !location.isArchived);
  const mapAreas = areas.filter((area) => area.mapId === selectedMap?.id && !area.isArchived);
  const locationByUnit = useMemo(() => new Map(mapLocations.map((location) => [location.unitId, location])), [mapLocations]);
  const unmappedUnits = propertyUnits.filter((unit) => !locationByUnit.has(unit.id));
  const imagePreview = selectedMap?.mimeType?.startsWith("image/");
  const buildingSummaries = useMemo(() => {
    const summaries = new Map<string, {
      key: string;
      label: string;
      units: Unit[];
      mapped: number;
      activeTurns: number;
      x: number | null;
      y: number | null;
    }>();
    for (const area of mapAreas) {
      const label = area.name.trim() || "Unnamed area";
      summaries.set(label.toLowerCase(), {
        key: label.toLowerCase(),
        label,
        units: [],
        mapped: 0,
        activeTurns: 0,
        x: area.xPercent,
        y: area.yPercent,
      });
    }
    for (const unit of propertyUnits) {
      const location = locationByUnit.get(unit.id);
      const label = unit.building?.trim() || location?.building?.trim() || unit.area?.trim() || location?.area?.trim() || "No building";
      const key = label.toLowerCase();
      const existing = summaries.get(key) ?? { key, label, units: [], mapped: 0, activeTurns: 0, x: null, y: null };
      existing.units.push(unit);
      if (location) {
        existing.mapped += 1;
        existing.x = existing.x === null ? location.xPercent : (existing.x + location.xPercent) / 2;
        existing.y = existing.y === null ? location.yPercent : (existing.y + location.yPercent) / 2;
      }
      if (itemByUnit.has(unit.id)) existing.activeTurns += 1;
      summaries.set(key, existing);
    }
    return Array.from(summaries.values()).sort((left, right) => {
      if (left.label === "No building") return 1;
      if (right.label === "No building") return -1;
      return left.label.localeCompare(right.label, undefined, { numeric: true });
    });
  }, [itemByUnit, locationByUnit, mapAreas, propertyUnits]);
  const filteredPropertyUnits = selectedBuilding
    ? propertyUnits.filter((unit) => {
      const location = locationByUnit.get(unit.id);
      return (unit.building?.trim() || location?.building?.trim() || unit.area?.trim() || location?.area?.trim() || "No building").toLowerCase() === selectedBuilding;
    })
    : propertyUnits;

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
    setSelectedBuilding("");
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
  const saveAreaAt = async (xPercent: number, yPercent: number) => {
    if (!canManage || !selectedMap || !areaDraft.name.trim()) return;
    await onCreateArea({
      propertyId,
      mapId: selectedMap.id,
      name: areaDraft.name.trim(),
      areaType: areaDraft.areaType,
      xPercent,
      yPercent,
      color: areaDraft.color || null,
      expectedUnitCount: areaDraft.expectedUnitCount ? Number(areaDraft.expectedUnitCount) : null,
    });
    setAreaDraft((current) => ({ ...current, name: "", expectedUnitCount: "" }));
    setPlacingArea(false);
  };
  const saveLocationAt = async (location: UnitMapLocation, xPercent: number, yPercent: number) => {
    if (!canManage || !selectedMap) return;
    const unit = propertyUnits.find((entry) => entry.id === location.unitId) ?? location.unit;
    await onSaveLocation({
      propertyId,
      mapId: selectedMap.id,
      unitId: location.unitId,
      xPercent: Math.max(0, Math.min(100, xPercent)),
      yPercent: Math.max(0, Math.min(100, yPercent)),
      building: location.building ?? unit?.building ?? null,
      area: location.area ?? unit?.area ?? null,
      floor: location.floor ?? unit?.floor ?? null,
    });
  };
  const percentFromPointer = (event: PointerEvent<HTMLElement>) => {
    const box = canvasRef.current?.getBoundingClientRect();
    if (!box) return null;
    return {
      xPercent: Math.max(0, Math.min(100, ((event.clientX - box.left) / box.width) * 100)),
      yPercent: Math.max(0, Math.min(100, ((event.clientY - box.top) / box.height) * 100)),
    };
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
            ref={canvasRef}
            className={`property-map-canvas ${imagePreview ? "" : "no-preview"}`}
            data-testid="property-map-canvas"
            onClick={(event) => {
              const box = event.currentTarget.getBoundingClientRect();
              const xPercent = ((event.clientX - box.left) / box.width) * 100;
              const yPercent = ((event.clientY - box.top) / box.height) * 100;
              if (placingArea) void saveAreaAt(xPercent, yPercent);
              else void saveAt(xPercent, yPercent);
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
                  draggable={false}
                  onPointerDown={(event) => {
                    if (!canManage) return;
                    event.stopPropagation();
                    dragState.current = { locationId: location.id, startX: event.clientX, startY: event.clientY, moved: false };
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={(event) => {
                    const drag = dragState.current;
                    if (!drag || drag.locationId !== location.id) return;
                    if (Math.abs(event.clientX - drag.startX) > 4 || Math.abs(event.clientY - drag.startY) > 4) drag.moved = true;
                  }}
                  onPointerUp={(event) => {
                    const drag = dragState.current;
                    if (!drag || drag.locationId !== location.id) return;
                    dragState.current = null;
                    if (drag.moved) {
                      event.preventDefault();
                      event.stopPropagation();
                      suppressMarkerClick.current = location.id;
                      const point = percentFromPointer(event);
                      if (point) void saveLocationAt(location, point.xPercent, point.yPercent);
                    }
                  }}
                  onPointerCancel={() => {
                    dragState.current = null;
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (suppressMarkerClick.current === location.id) {
                      suppressMarkerClick.current = null;
                      return;
                    }
                    if (item) onOpenItem(item.id);
                  }}
                >
                  {unit.number}
                </button>
              );
            })}
            {buildingSummaries
              .filter((summary) => summary.units.length > 0 && summary.mapped > 0 && summary.x !== null && summary.y !== null)
              .map((summary) => (
                <button
                  key={summary.key}
                  type="button"
                  className="map-building-marker"
                  data-testid={`map-building-${summary.key.replace(/[^a-z0-9]+/g, "-")}`}
                  style={{ left: `${summary.x}%`, top: `${summary.y}%` }}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedBuilding(summary.key);
                  }}
                  title={`${summary.label}: ${summary.units.length} units, ${summary.mapped} mapped`}
                >
                  <strong>{summary.label}</strong>
                  <span>{summary.units.length} units</span>
                </button>
              ))}
            {mapAreas.map((area) => (
              <button
                key={area.id}
                type="button"
                className="map-area-marker"
                data-testid={`map-area-${area.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}
                style={{ left: `${area.xPercent}%`, top: `${area.yPercent}%`, borderColor: area.color ?? undefined }}
                title={`${area.name}: ${area.expectedUnitCount ?? "unknown"} expected units`}
                onPointerDown={(event) => {
                  if (!canManage) return;
                  event.stopPropagation();
                  dragState.current = { locationId: `area:${area.id}`, startX: event.clientX, startY: event.clientY, moved: false };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  const drag = dragState.current;
                  if (!drag || drag.locationId !== `area:${area.id}`) return;
                  if (Math.abs(event.clientX - drag.startX) > 4 || Math.abs(event.clientY - drag.startY) > 4) drag.moved = true;
                }}
                onPointerUp={(event) => {
                  const drag = dragState.current;
                  if (!drag || drag.locationId !== `area:${area.id}`) return;
                  dragState.current = null;
                  event.stopPropagation();
                  if (drag.moved) {
                    const point = percentFromPointer(event);
                    if (point) void onUpdateArea(area.id, { xPercent: point.xPercent, yPercent: point.yPercent });
                  } else {
                    setSelectedBuilding(area.name.toLowerCase());
                  }
                }}
                onPointerCancel={() => {
                  dragState.current = null;
                }}
                onClick={(event) => event.stopPropagation()}
              >
                <strong>{area.name}</strong>
                <span>{area.expectedUnitCount ?? 0} expected</span>
              </button>
            ))}
          </div>
          {selectedMap?.mimeType === "application/pdf" ? <a className="button button-secondary" href={propertyMapFileUrl(selectedMap.id)} target="_blank" rel="noreferrer">Open PDF map</a> : null}
        </div>

        <div className="operations-card unit-directory-card" data-testid="unit-directory-panel">
          <h3>Unit Directory</h3>
          <div className="map-building-summary" data-testid="map-building-summary">
            <button type="button" className={!selectedBuilding ? "selected" : ""} onClick={() => setSelectedBuilding("")}>
              All buildings <strong>{propertyUnits.length}</strong>
            </button>
            {buildingSummaries.map((summary) => (
              <button
                key={summary.key}
                type="button"
                className={selectedBuilding === summary.key ? "selected" : ""}
                data-testid={`map-building-filter-${summary.key.replace(/[^a-z0-9]+/g, "-")}`}
                onClick={() => setSelectedBuilding(summary.key)}
              >
                {summary.label}
                <strong>{summary.mapped}/{summary.units.length} mapped</strong>
                {summary.activeTurns ? <span>{summary.activeTurns} active</span> : null}
              </button>
            ))}
          </div>
          {canManage ? (
            <div className="map-area-editor" data-testid="map-area-editor">
              <h4>Building / area markers</h4>
              <p className="muted">Mark buildings, floors, or site zones. Unit placement still stays unit-specific.</p>
              <div className="map-area-form">
                <input value={areaDraft.name} onChange={(event) => setAreaDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Building or area name" />
                <select value={areaDraft.areaType} onChange={(event) => setAreaDraft((current) => ({ ...current, areaType: event.target.value }))}>
                  <option value="BUILDING">Building</option>
                  <option value="AREA">Area</option>
                  <option value="FLOOR">Floor</option>
                  <option value="ZONE">Zone</option>
                </select>
                <input type="number" min="0" value={areaDraft.expectedUnitCount} onChange={(event) => setAreaDraft((current) => ({ ...current, expectedUnitCount: event.target.value }))} placeholder="Expected units" />
                <input type="color" value={areaDraft.color} onChange={(event) => setAreaDraft((current) => ({ ...current, color: event.target.value }))} aria-label="Area marker color" />
                <button className="button button-secondary" type="button" disabled={!selectedMap || !areaDraft.name.trim()} onClick={() => setPlacingArea((current) => !current)}>
                  {placingArea ? "Click map to place" : "Place marker"}
                </button>
              </div>
              <div className="map-area-list">
                {mapAreas.length === 0 ? <span className="muted">No building or area markers yet.</span> : mapAreas.map((area) => (
                  <article key={area.id}>
                    <button type="button" onClick={() => setSelectedBuilding(area.name.toLowerCase())}>
                      <strong>{area.name}</strong>
                      <small>{area.areaType.toLowerCase()} / {area.expectedUnitCount ?? 0} expected units</small>
                    </button>
                    <button type="button" className="button button-secondary" onClick={() => void onRemoveArea(area.id)}>Archive</button>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
          <div className="stacked-form">
            <label>Unit to place
              <select data-testid="map-unit-select" value={selectedUnitId} onChange={(event) => {
                setSelectedUnitId(event.target.value);
                const existing = locationByUnit.get(event.target.value);
                const unit = propertyUnits.find((entry) => entry.id === event.target.value);
                setLocationMeta({ building: existing?.building ?? unit?.building ?? "", area: existing?.area ?? unit?.area ?? "", floor: existing?.floor ?? unit?.floor ?? "" });
              }}>
                <option value="">Select unit</option>
                {filteredPropertyUnits.map((unit) => {
                  const location = locationByUnit.get(unit.id);
                  const building = unit.building || location?.building;
                  return <option key={unit.id} value={unit.id}>{displayUnitNumber(property?.code ?? "", unit.number)}{building ? ` / Bldg ${building}` : ""}{location ? " / mapped" : " / unmapped"}</option>;
                })}
              </select>
            </label>
            <div className="three-column-form">
              <input data-testid="map-location-building" value={locationMeta.building} onChange={(event) => setLocationMeta((current) => ({ ...current, building: event.target.value }))} placeholder="Building" />
              <input data-testid="map-location-area" value={locationMeta.area} onChange={(event) => setLocationMeta((current) => ({ ...current, area: event.target.value }))} placeholder="Area" />
              <input data-testid="map-location-floor" value={locationMeta.floor} onChange={(event) => setLocationMeta((current) => ({ ...current, floor: event.target.value }))} placeholder="Floor" />
            </div>
            {canManage ? <p className="muted">Select a unit, then click the map to place it. Drag existing markers to adjust placement.</p> : <p className="muted">Map editing requires manager or admin access.</p>}
          </div>
          <div className="unit-directory-list">
            {filteredPropertyUnits.map((unit) => {
              const location = locationByUnit.get(unit.id);
              const item = itemByUnit.get(unit.id);
              return (
                <article key={unit.id} className="unit-directory-row">
                  <button type="button" onClick={() => item && onOpenItem(item.id)} disabled={!item}>
                    <strong>{displayUnitNumber(property?.code ?? "", unit.number)}</strong>
                    <small>{unit.floorPlanRecord ? floorPlanLabel(unit.floorPlanRecord) : unit.floorPlan ?? "No floor plan"} / {unit.occupancyStatus?.replace(/_/g, " ") ?? "UNKNOWN"} / {location ? `${location.building ? `Bldg ${location.building} ` : ""}${location.area || "No area"} ${location.floor || ""}` : "Unmapped"}</small>
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
