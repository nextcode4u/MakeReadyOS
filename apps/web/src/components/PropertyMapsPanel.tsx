import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BoardSection,
  LabelDefinition,
  LeaseComplianceIssue,
  MakeReadyItem,
  PestIssue,
  PreventiveMaintenanceTask,
  ProjectRecord,
  Property,
  PropertyMap,
  PropertyMapArea,
  PropertyMapPin,
  PropertyWikiEntry,
  Unit,
  UnitMapLocation,
} from "../lib/api";
import {
  createPropertyMapPin,
  getLeaseComplianceIssues,
  getPestIssues,
  getPreventiveMaintenanceTasks,
  getProjectMapRecords,
  getPropertyMapPins,
  getPropertyWikiEntries,
  propertyMapPinAttachmentDownloadUrl,
  propertyMapExportCsvUrl,
  propertyMapExportXlsUrl,
  propertyMapFileUrl,
  propertyMapPrintableReportUrl,
  removePropertyMapPin,
  deletePropertyMapPinAttachment,
  updatePropertyMapPin,
  uploadPropertyMapPinAttachment,
} from "../lib/api";
import { displayUnitNumber } from "../lib/board";
import { openLeaseQuickAdd } from "../lib/leaseNavigation";
import { openPestQuickAdd } from "../lib/pestNavigation";
import { openProjectCreate, openProjectRecord } from "../lib/projectNavigation";
import { UnitSearchSelect } from "./UnitSearchSelect";

type ColorSource = "riskLevel" | "vacancyStatus" | "boardSection" | "assignedTech" | "makeReadyStatus";
type MarkerKind = "unit" | "area" | "pin" | "project";
type PlacementMode = "none" | "unit" | "area" | "pin" | "move-pin";

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

type SelectedMarker =
  | { kind: "unit"; location: UnitMapLocation }
  | { kind: "area"; area: PropertyMapArea }
  | { kind: "pin"; pin: PropertyMapPin }
  | { kind: "project"; record: ProjectRecord };

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

const pinTypePalette: Record<string, string> = {
  Building: "#4d91ff",
  Unit: "#8a93a6",
  Utility: "#e5b33b",
  Equipment: "#39c8c5",
  Project: "#ef6b73",
  Recommendation: "#f39c47",
  "Pest Control": "#9c6cff",
  "Preventive Maintenance": "#41c98f",
  Inspection: "#ef7ab8",
  Pool: "#45d4ff",
  Gate: "#8f5b31",
  "Fire System": "#ef4444",
  "Access Control": "#7c5cff",
  "Known Issue": "#f59e0b",
  Wiki: "#5b6dff",
  Custom: "#cbd5e1",
};

const pinTypeOptions = [
  "Building",
  "Unit",
  "Utility",
  "Equipment",
  "Project",
  "Recommendation",
  "Pest Control",
  "Preventive Maintenance",
  "Inspection",
  "Pool",
  "Gate",
  "Fire System",
  "Access Control",
  "Known Issue",
  "Wiki",
  "Custom",
];

function floorPlanLabel(plan: { code: string; name: string }) {
  return plan.name && plan.name !== plan.code ? `${plan.code} - ${plan.name}` : plan.code;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

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

function markerMatchesSearch(values: Array<string | null | undefined>, search: string) {
  if (!search.trim()) return true;
  const query = search.trim().toLowerCase();
  return values.some((value) => value?.toLowerCase().includes(query));
}

function overlapOffset(index: number, total: number) {
  if (total <= 1) {
    return { offsetX: 0, offsetY: 0 };
  }
  const radius = Math.min(28, 12 + Math.floor((total - 1) / 4) * 7);
  const angle = ((Math.PI * 2) / total) * index - Math.PI / 2;
  return {
    offsetX: Math.round(Math.cos(angle) * radius),
    offsetY: Math.round(Math.sin(angle) * radius),
  };
}

function buildMarkerOffsetMap(entries: Array<{ key: string; xPercent: number; yPercent: number }>, bucketSize = 2.5) {
  const groups = new Map<string, Array<{ key: string; xPercent: number; yPercent: number }>>();
  for (const entry of entries) {
    const bucketX = Math.round(entry.xPercent / bucketSize);
    const bucketY = Math.round(entry.yPercent / bucketSize);
    const bucketKey = `${bucketX}:${bucketY}`;
    groups.set(bucketKey, [...(groups.get(bucketKey) ?? []), entry]);
  }
  const offsets = new Map<string, { offsetX: number; offsetY: number; overlapCount: number }>();
  for (const group of groups.values()) {
    group.forEach((entry, index) => {
      const { offsetX, offsetY } = overlapOffset(index, group.length);
      offsets.set(entry.key, { offsetX, offsetY, overlapCount: group.length });
    });
  }
  return offsets;
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
  const queryClient = useQueryClient();
  const [localPropertyId, setLocalPropertyId] = useState(selectedPropertyId || properties[0]?.id || "");
  const propertyId = selectedPropertyId || localPropertyId;
  const property = properties.find((entry) => entry.id === propertyId);
  const propertyMaps = maps.filter((map) => map.propertyId === propertyId);
  const defaultMap = propertyMaps.find((map) => map.isDefault && !map.isArchived) ?? propertyMaps.find((map) => map.isActive && !map.isArchived) ?? propertyMaps.find((map) => !map.isArchived) ?? propertyMaps[0];
  const [selectedMapId, setSelectedMapId] = useState("");
  const selectedMap = propertyMaps.find((map) => map.id === (selectedMapId || defaultMap?.id)) ?? defaultMap ?? null;
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [selectedMarker, setSelectedMarker] = useState<SelectedMarker | null>(null);
  const [placementMode, setPlacementMode] = useState<PlacementMode>("none");
  const [colorSource, setColorSource] = useState<ColorSource>("riskLevel");
  const [zoom, setZoom] = useState(1);
  const [search, setSearch] = useState("");
  const [emergencyOnly, setEmergencyOnly] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [locationMeta, setLocationMeta] = useState({ building: "", area: "", floor: "" });
  const [areaDraft, setAreaDraft] = useState({ name: "", areaType: "BUILDING", expectedUnitCount: "", color: "#1f8fdb" });
  const [pinDraft, setPinDraft] = useState({
    title: "",
    pinType: "Utility",
    building: "",
    unitLabel: "",
    area: "",
    description: "",
    linkedRecordType: "",
    linkedRecordId: "",
    tags: "",
    isEmergency: false,
  });
  const [layerToggles, setLayerToggles] = useState<Record<string, boolean>>({
    units: true,
    areas: true,
    pins: true,
    projects: true,
    recommendations: true,
    pest: true,
    pm: true,
    wiki: true,
  });
  const [selectedBuilding, setSelectedBuilding] = useState("");

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

  const pinsQuery = useQuery({
    queryKey: ["property-map-pins", propertyId, selectedMap?.id],
    queryFn: () => getPropertyMapPins({ propertyId, mapId: selectedMap?.id ?? undefined }),
    enabled: Boolean(propertyId && selectedMap?.id),
  });
  const projectPinsQuery = useQuery({
    queryKey: ["property-map-projects", propertyId],
    queryFn: () => getProjectMapRecords({ propertyId }),
    enabled: Boolean(propertyId),
  });
  const pestQuery = useQuery({
    queryKey: ["property-map-pest", propertyId],
    queryFn: () => getPestIssues({ propertyId, limit: 300, includeArchived: false }),
    enabled: Boolean(propertyId),
  });
  const leaseQuery = useQuery({
    queryKey: ["property-map-lease", propertyId],
    queryFn: () => getLeaseComplianceIssues({ propertyId, limit: 300, includeArchived: false }),
    enabled: Boolean(propertyId),
  });
  const pmQuery = useQuery({
    queryKey: ["property-map-pm", propertyId],
    queryFn: () => getPreventiveMaintenanceTasks({ propertyId, limit: 300 }),
    enabled: Boolean(propertyId),
  });
  const wikiQuery = useQuery({
    queryKey: ["property-map-wiki", propertyId],
    queryFn: () => getPropertyWikiEntries({ propertyId, includeInactive: false }),
    enabled: Boolean(propertyId),
  });

  const pinCreateMutation = useMutation({
    mutationFn: createPropertyMapPin,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["property-map-pins"] });
    },
  });
  const pinUpdateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updatePropertyMapPin>[1] }) => updatePropertyMapPin(id, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["property-map-pins"] });
    },
  });
  const pinRemoveMutation = useMutation({
    mutationFn: removePropertyMapPin,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["property-map-pins"] });
      setSelectedMarker(null);
    },
  });
  const pinAttachmentUploadMutation = useMutation({
    mutationFn: ({ pinId, file }: { pinId: string; file: File }) => uploadPropertyMapPinAttachment(pinId, file),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["property-map-pins"] });
    },
  });
  const pinAttachmentDeleteMutation = useMutation({
    mutationFn: deletePropertyMapPinAttachment,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["property-map-pins"] });
    },
  });

  const wikiEntries = wikiQuery.data?.entries ?? [];
  const pestIssues = pestQuery.data?.issues ?? [];
  const leaseIssues = leaseQuery.data?.issues ?? [];
  const pmTasks = pmQuery.data?.tasks ?? [];
  const projectRecords = (projectPinsQuery.data?.records ?? []).filter((record) => record.propertyMapId === selectedMap?.id && record.pinX !== null && record.pinY !== null);
  const customPins = pinsQuery.data?.pins ?? [];

  const buildingSummaries = useMemo(() => {
    const summaries = new Map<string, { key: string; label: string; units: Unit[]; mapped: number; x: number | null; y: number | null }>();
    for (const area of mapAreas) {
      const label = area.name.trim() || "Unnamed area";
      summaries.set(label.toLowerCase(), { key: label.toLowerCase(), label, units: [], mapped: 0, x: area.xPercent, y: area.yPercent });
    }
    for (const unit of propertyUnits) {
      const location = locationByUnit.get(unit.id);
      const label = unit.building?.trim() || location?.building?.trim() || unit.area?.trim() || location?.area?.trim() || "No building";
      const key = label.toLowerCase();
      const existing = summaries.get(key) ?? { key, label, units: [], mapped: 0, x: null, y: null };
      existing.units.push(unit);
      if (location) {
        existing.mapped += 1;
        existing.x = existing.x === null ? location.xPercent : (existing.x + location.xPercent) / 2;
        existing.y = existing.y === null ? location.yPercent : (existing.y + location.yPercent) / 2;
      }
      summaries.set(key, existing);
    }
    return Array.from(summaries.values()).sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true }));
  }, [locationByUnit, mapAreas, propertyUnits]);

  const linkedRecordOptions = useMemo(() => ({
    PROJECT_RECORD: projectPinsQuery.data?.records ?? [],
    PEST_ISSUE: pestIssues,
    LEASE_COMPLIANCE_ISSUE: leaseIssues,
    PM_TASK: pmTasks,
    WIKI_ENTRY: wikiEntries,
  }), [leaseIssues, pestIssues, pmTasks, projectPinsQuery.data?.records, wikiEntries]);

  const imagePreview = selectedMap?.mimeType?.startsWith("image/");

  const updateProperty = (value: string) => {
    setLocalPropertyId(value);
    onPropertyChange(value);
    setSelectedMapId("");
    setSelectedUnitId("");
    setSelectedMarker(null);
    setSelectedBuilding("");
  };

  const percentFromClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return {
      xPercent: Math.max(0, Math.min(100, ((event.clientX - box.left) / box.width) * 100)),
      yPercent: Math.max(0, Math.min(100, ((event.clientY - box.top) / box.height) * 100)),
    };
  };

  const handleMapClick = async (event: React.MouseEvent<HTMLDivElement>) => {
    if (!selectedMap || !canManage) return;
    const point = percentFromClick(event);
    if (placementMode === "unit" && selectedUnitId) {
      await onSaveLocation({
        propertyId,
        mapId: selectedMap.id,
        unitId: selectedUnitId,
        xPercent: point.xPercent,
        yPercent: point.yPercent,
        building: locationMeta.building || null,
        area: locationMeta.area || null,
        floor: locationMeta.floor || null,
      });
      return;
    }
    if (placementMode === "area" && areaDraft.name.trim()) {
      await onCreateArea({
        propertyId,
        mapId: selectedMap.id,
        name: areaDraft.name.trim(),
        areaType: areaDraft.areaType,
        xPercent: point.xPercent,
        yPercent: point.yPercent,
        color: areaDraft.color || null,
        expectedUnitCount: areaDraft.expectedUnitCount ? Number(areaDraft.expectedUnitCount) : null,
      });
      setAreaDraft((current) => ({ ...current, name: "", expectedUnitCount: "" }));
      setPlacementMode("none");
      return;
    }
    if (placementMode === "pin" && pinDraft.title.trim()) {
      await pinCreateMutation.mutateAsync({
        propertyId,
        mapId: selectedMap.id,
        title: pinDraft.title.trim(),
        pinType: pinDraft.pinType,
        xPercent: point.xPercent,
        yPercent: point.yPercent,
        building: pinDraft.building || null,
        unitLabel: pinDraft.unitLabel || null,
        area: pinDraft.area || null,
        description: pinDraft.description || null,
        linkedRecordType: pinDraft.linkedRecordType || null,
        linkedRecordId: pinDraft.linkedRecordId || null,
        tags: pinDraft.tags.split(",").map((value) => value.trim()).filter(Boolean),
        isEmergency: pinDraft.isEmergency,
      });
      setPinDraft((current) => ({ ...current, title: "", description: "", tags: "" }));
      setPlacementMode("none");
      return;
    }
    if (placementMode === "move-pin" && selectedMarker?.kind === "pin") {
      await pinUpdateMutation.mutateAsync({ id: selectedMarker.pin.id, input: { xPercent: point.xPercent, yPercent: point.yPercent } });
      setPlacementMode("none");
    }
  };

  const mergedSearchResults = useMemo(() => {
    const results: Array<{ id: string; title: string; subtitle: string; onSelect: () => void }> = [];
    for (const location of mapLocations) {
      const unit = propertyUnits.find((entry) => entry.id === location.unitId) ?? location.unit;
      if (!markerMatchesSearch([unit.number, location.building, location.area, location.floor], search)) continue;
      results.push({
        id: `unit:${location.id}`,
        title: `Unit ${unit.number}`,
        subtitle: [location.building, location.area, location.floor].filter(Boolean).join(" / ") || "Unit marker",
        onSelect: () => setSelectedMarker({ kind: "unit", location }),
      });
    }
    for (const area of mapAreas) {
      if (!markerMatchesSearch([area.name, area.areaType, area.notes], search)) continue;
      results.push({
        id: `area:${area.id}`,
        title: area.name,
        subtitle: `${area.areaType} area`,
        onSelect: () => setSelectedMarker({ kind: "area", area }),
      });
    }
    for (const pin of customPins) {
      if (!markerMatchesSearch([pin.title, pin.pinType, pin.building, pin.unitLabel, pin.area, pin.description, pin.tags.join(" ")], search)) continue;
      results.push({
        id: `pin:${pin.id}`,
        title: pin.title,
        subtitle: [pin.pinType, pin.building, pin.unitLabel, pin.area].filter(Boolean).join(" / "),
        onSelect: () => setSelectedMarker({ kind: "pin", pin }),
      });
    }
    for (const record of projectRecords) {
      if (!markerMatchesSearch([record.title, record.recordType, record.building, record.area, record.locationNotes, record.tags.join(" ")], search)) continue;
      results.push({
        id: `project:${record.id}`,
        title: record.title,
        subtitle: [record.recordType, record.status, record.building, record.area].filter(Boolean).join(" / "),
        onSelect: () => setSelectedMarker({ kind: "project", record }),
      });
    }
    return results.slice(0, 30);
  }, [customPins, mapAreas, mapLocations, projectRecords, propertyUnits, search]);

  const selectedMarkerDetails = (() => {
    if (!selectedMarker) return null;
    if (selectedMarker.kind === "unit") {
      const location = selectedMarker.location;
      const unit = propertyUnits.find((entry) => entry.id === location.unitId) ?? location.unit;
      const item = itemByUnit.get(location.unitId);
      const unitPests = pestIssues.filter((issue) => issue.unitId === location.unitId).slice(0, 4);
      const relatedWiki = wikiEntries.filter((entry) => (entry.building && entry.building === (unit.building ?? location.building)) || entry.floorPlan === unit.floorPlan).slice(0, 4);
      return {
        title: `Unit ${unit.number}`,
        type: "Unit",
        description: [location.building ? `Building ${location.building}` : null, location.area, location.floor].filter(Boolean).join(" / "),
        related: [
          item ? `Make Ready: ${item.makeReadyStatus ?? item.status}` : null,
          unitPests[0] ? `Pest: ${unitPests[0].pestType} / ${unitPests[0].status}` : null,
          relatedWiki[0] ? `Wiki: ${relatedWiki[0].title}` : null,
        ].filter(Boolean),
      };
    }
    if (selectedMarker.kind === "area") {
      return {
        title: selectedMarker.area.name,
        type: selectedMarker.area.areaType,
        description: selectedMarker.area.notes || `${selectedMarker.area.expectedUnitCount ?? 0} expected units`,
        related: [
          `${propertyUnits.filter((unit) => (unit.building ?? unit.area ?? "").toLowerCase() === selectedMarker.area.name.toLowerCase()).length} units`,
        ],
      };
    }
    if (selectedMarker.kind === "pin") {
      const pin = selectedMarker.pin;
      return {
        title: pin.title,
        type: pin.pinType,
        description: pin.description || [pin.building, pin.unitLabel, pin.area].filter(Boolean).join(" / "),
        related: [
          pin.linkedRecord ? `${pin.linkedRecord.title} / ${pin.linkedRecord.subtitle ?? pin.linkedRecord.targetType}` : null,
          pin.isEmergency ? "Emergency pin" : null,
          pin.attachments.length ? `${pin.attachments.length} attachment${pin.attachments.length === 1 ? "" : "s"}` : null,
          pin.tags.length ? `Tags: ${pin.tags.join(", ")}` : null,
        ].filter(Boolean),
      };
    }
    return {
      title: selectedMarker.record.title,
      type: selectedMarker.record.recordType,
      description: selectedMarker.record.description || [selectedMarker.record.building, selectedMarker.record.area].filter(Boolean).join(" / "),
      related: [
        selectedMarker.record.status,
        selectedMarker.record.priority,
        selectedMarker.record.assignedUserName ?? selectedMarker.record.companyName ?? null,
      ].filter(Boolean),
    };
  })();

  const visibleUnitMarkers = layerToggles.units ? mapLocations.filter((location) => !selectedBuilding || (location.building ?? location.area ?? "").toLowerCase() === selectedBuilding) : [];
  const visibleAreaMarkers = layerToggles.areas ? mapAreas.filter((area) => !search || markerMatchesSearch([area.name, area.areaType, area.notes], search)) : [];
  const visiblePins = layerToggles.pins ? customPins.filter((pin) => (!emergencyOnly || pin.isEmergency) && markerMatchesSearch([pin.title, pin.pinType, pin.building, pin.unitLabel, pin.area, pin.description, pin.tags.join(" ")], search)) : [];
  const visibleProjects = projectRecords.filter((record) => (record.recordType === "Project" ? layerToggles.projects : layerToggles.recommendations) && markerMatchesSearch([record.title, record.recordType, record.building, record.area, record.locationNotes, record.tags.join(" ")], search));
  const markerOffsets = useMemo(() => buildMarkerOffsetMap([
    ...visibleUnitMarkers.map((location) => ({ key: `unit:${location.id}`, xPercent: location.xPercent, yPercent: location.yPercent })),
    ...visibleAreaMarkers.map((area) => ({ key: `area:${area.id}`, xPercent: area.xPercent, yPercent: area.yPercent })),
    ...visiblePins.map((pin) => ({ key: `pin:${pin.id}`, xPercent: pin.xPercent, yPercent: pin.yPercent })),
    ...visibleProjects.map((record) => ({ key: `project:${record.id}`, xPercent: record.pinX ?? 0, yPercent: record.pinY ?? 0 })),
  ]), [visibleAreaMarkers, visiblePins, visibleProjects, visibleUnitMarkers]);

  const buildingFilteredUnits = selectedBuilding
    ? propertyUnits.filter((unit) => {
      const location = locationByUnit.get(unit.id);
      return (unit.building?.trim() || location?.building?.trim() || unit.area?.trim() || location?.area?.trim() || "No building").toLowerCase() === selectedBuilding;
    })
    : propertyUnits;

  return (
    <section className="panel property-map-panel" data-testid="property-maps-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Property Maps</p>
          <h2>Visual Property Operations</h2>
          <p className="muted">Maps, units, areas, emergency utilities, and linked records in one operational view.</p>
        </div>
      </div>
      {loading && <div className="state-card">Loading property maps...</div>}
      {error && <div className="state-card error">{error}</div>}

      <div className="toolbar compact-toolbar map-toolbar">
        <label>Property
          <select data-testid="property-maps-property-select" value={propertyId} onChange={(event) => updateProperty(event.target.value)}>
            {properties.map((entry) => <option key={entry.id} value={entry.id}>{entry.code} - {entry.name}</option>)}
          </select>
        </label>
        <label>Map
          <select data-testid="property-maps-map-select" value={selectedMap?.id ?? ""} onChange={(event) => setSelectedMapId(event.target.value)}>
            <option value="">No map selected</option>
            {propertyMaps.map((map) => <option key={map.id} value={map.id}>{map.name}{map.isDefault ? " / default" : ""}</option>)}
          </select>
        </label>
        <label>Search
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Building, unit, pin, project, issue..." />
        </label>
        <label>Color by
          <select value={colorSource} onChange={(event) => setColorSource(event.target.value as ColorSource)}>
            <option value="riskLevel">Risk Level</option>
            <option value="vacancyStatus">Vacancy Status</option>
            <option value="boardSection">Board Section</option>
            <option value="assignedTech">Assigned Tech</option>
            <option value="makeReadyStatus">Make Ready Status</option>
          </select>
        </label>
        <label className="compact-toggle">Emergency mode
          <input type="checkbox" checked={emergencyOnly} onChange={(event) => setEmergencyOnly(event.target.checked)} />
        </label>
      </div>

      {canManage ? (
        <div className="operations-card map-management-card">
          <h3>Map Setup</h3>
          <div className="map-management-grid">
            <form className="inline-form" onSubmit={async (event) => {
              event.preventDefault();
              if (!propertyId || !draftName.trim()) return;
              await onCreateMap({ propertyId, name: draftName.trim() });
              setDraftName("");
            }}>
              <input data-testid="property-maps-create-name" value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder="New map name" />
              <button data-testid="property-maps-create-submit" className="button button-primary" disabled={!draftName.trim()}>Create Map</button>
            </form>
            {selectedMap ? (
              <div className="map-file-actions">
                <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void onUploadMap(selectedMap.id, file);
                }} />
                <button className="button button-secondary" type="button" onClick={() => void onArchiveMap(selectedMap.id, !selectedMap.isArchived)}>
                  {selectedMap.isArchived ? "Restore Map" : "Archive Map"}
                </button>
                <a className="button button-secondary" href={propertyMapExportCsvUrl(selectedMap.id)} target="_blank" rel="noreferrer">CSV</a>
                <a className="button button-secondary" href={propertyMapExportXlsUrl(selectedMap.id)} target="_blank" rel="noreferrer">Excel</a>
                <a className="button button-secondary" href={propertyMapPrintableReportUrl(selectedMap.id)} target="_blank" rel="noreferrer">PDF</a>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="map-grid property-map-enhanced-grid">
        <div className="operations-card map-editor-card">
          <div className="map-card-header">
            <div>
              <h3>{selectedMap?.name ?? "No map configured"}</h3>
              <p className="muted">{selectedMap ? `${selectedMap.mapType} / ${visibleUnitMarkers.length} unit markers / ${visiblePins.length} custom pins / ${visibleProjects.length} project pins` : "Select a property map to begin"}</p>
            </div>
            <div className="map-legend">
              <button type="button" className="button button-secondary" onClick={() => setZoom((current) => Math.max(0.7, Number((current - 0.1).toFixed(1))))}>-</button>
              <span>{Math.round(zoom * 100)}%</span>
              <button type="button" className="button button-secondary" onClick={() => setZoom((current) => Math.min(2, Number((current + 0.1).toFixed(1))))}>+</button>
              <button type="button" className="button button-secondary" onClick={() => setZoom(1)}>Reset</button>
            </div>
          </div>
          <div className="map-layer-row">
            {[
              ["units", "Units"],
              ["areas", "Areas"],
              ["pins", "Pins"],
              ["projects", "Projects"],
              ["recommendations", "Recommendations"],
            ].map(([key, label]) => (
              <label key={key} className="compact-toggle">
                <input type="checkbox" checked={layerToggles[key]} onChange={(event) => setLayerToggles((current) => ({ ...current, [key]: event.target.checked }))} />
                {label}
              </label>
            ))}
          </div>
          <div className="property-map-scroll">
            <div
              data-testid="property-maps-canvas" className={`property-map-canvas ${imagePreview ? "" : "no-preview"}`}
              onClick={handleMapClick}
              style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
            >
              {selectedMap && imagePreview ? <img src={propertyMapFileUrl(selectedMap.id)} alt={`${selectedMap.name} map`} /> : (
                <div className="map-placeholder">
                  <strong>{selectedMap ? "Map preview unavailable" : "Create or select a map"}</strong>
                  <span>{selectedMap?.mimeType === "application/pdf" ? "PDF maps stay usable for pin placement and export." : "Upload a PNG, JPG, WebP, or PDF map."}</span>
                </div>
              )}
              {visibleAreaMarkers.map((area) => (
                <button
                  key={area.id}
                  type="button"
                  className={`map-area-marker${(markerOffsets.get(`area:${area.id}`)?.overlapCount ?? 1) > 1 ? " overlap-group" : ""}`}
                  style={{
                    left: `${area.xPercent}%`,
                    top: `${area.yPercent}%`,
                    borderColor: area.color ?? undefined,
                    transform: `translate(calc(-50% + ${markerOffsets.get(`area:${area.id}`)?.offsetX ?? 0}px), calc(-50% + ${markerOffsets.get(`area:${area.id}`)?.offsetY ?? 0}px))`,
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedMarker({ kind: "area", area });
                    setSelectedBuilding(area.name.toLowerCase());
                  }}
                >
                  <strong>{area.name}</strong>
                  <span>{area.areaType.toLowerCase()}</span>
                </button>
              ))}
              {visibleUnitMarkers.map((location) => {
                const unit = propertyUnits.find((entry) => entry.id === location.unitId) ?? location.unit;
                const item = itemByUnit.get(location.unitId);
                return (
                  <button
                    key={location.id}
                    type="button"
                    className={`map-marker${(markerOffsets.get(`unit:${location.id}`)?.overlapCount ?? 1) > 1 ? " overlap-group" : ""}`}
                    style={{
                      left: `${location.xPercent}%`,
                      top: `${location.yPercent}%`,
                      background: markerColor(colorSource, item, labelsByField, boardSections),
                      transform: `translate(calc(-50% + ${markerOffsets.get(`unit:${location.id}`)?.offsetX ?? 0}px), calc(-50% + ${markerOffsets.get(`unit:${location.id}`)?.offsetY ?? 0}px))`,
                    }}
                    title={`${unit.number} / ${markerLabel(colorSource, item, boardSections)}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedMarker({ kind: "unit", location });
                    }}
                  >
                    {unit.number}
                  </button>
                );
              })}
              {visiblePins.map((pin) => (
                <button
                  key={pin.id}
                  type="button"
                  className={`map-pin-marker${pin.isEmergency ? " emergency" : ""}${(markerOffsets.get(`pin:${pin.id}`)?.overlapCount ?? 1) > 1 ? " overlap-group" : ""}`}
                  style={{
                    left: `${pin.xPercent}%`,
                    top: `${pin.yPercent}%`,
                    background: pinTypePalette[pin.pinType] ?? pinTypePalette.Custom,
                    transform: `translate(calc(-50% + ${markerOffsets.get(`pin:${pin.id}`)?.offsetX ?? 0}px), calc(-50% + ${markerOffsets.get(`pin:${pin.id}`)?.offsetY ?? 0}px))`,
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedMarker({ kind: "pin", pin });
                  }}
                >
                  {pin.title}
                </button>
              ))}
              {visibleProjects.map((record) => (
                <button
                  key={record.id}
                  type="button"
                  className={`map-project-marker${(markerOffsets.get(`project:${record.id}`)?.overlapCount ?? 1) > 1 ? " overlap-group" : ""}`}
                  style={{
                    left: `${record.pinX}%`,
                    top: `${record.pinY}%`,
                    background: record.recordType === "Project" ? pinTypePalette.Project : pinTypePalette.Recommendation,
                    transform: `translate(calc(-50% + ${markerOffsets.get(`project:${record.id}`)?.offsetX ?? 0}px), calc(-50% + ${markerOffsets.get(`project:${record.id}`)?.offsetY ?? 0}px))`,
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedMarker({ kind: "project", record });
                  }}
                >
                  {record.title}
                </button>
              ))}
            </div>
          </div>
          {selectedMap?.mimeType === "application/pdf" ? <a className="button button-secondary" href={propertyMapFileUrl(selectedMap.id)} target="_blank" rel="noreferrer">Open PDF Map</a> : null}
        </div>

        <div className="operations-card unit-directory-card">
          <h3>Map Controls</h3>
          <div className="map-building-summary">
            <button type="button" className={!selectedBuilding ? "selected" : ""} onClick={() => setSelectedBuilding("")}>
              All buildings <strong>{propertyUnits.length}</strong>
            </button>
            {buildingSummaries.map((summary) => (
              <button key={summary.key} type="button" className={selectedBuilding === summary.key ? "selected" : ""} onClick={() => setSelectedBuilding(summary.key)}>
                {summary.label}
                <strong>{summary.mapped}/{summary.units.length} mapped</strong>
              </button>
            ))}
          </div>

          <div className="map-mode-stack">
            <label>Placement mode
              <select data-testid="property-maps-placement-mode" value={placementMode} onChange={(event) => setPlacementMode(event.target.value as PlacementMode)}>
                <option value="none">Browse only</option>
                <option value="unit">Place unit</option>
                <option value="area">Place building / area</option>
                <option value="pin">Add shared pin</option>
                {selectedMarker?.kind === "pin" ? <option value="move-pin">Move selected pin</option> : null}
              </select>
            </label>
          </div>

          {placementMode === "unit" ? (
            <div className="stacked-form">
              <label>Unit to place</label>
              <UnitSearchSelect
                units={buildingFilteredUnits}
                value={selectedUnitId}
                onChange={(value) => {
                  setSelectedUnitId(value);
                  const existing = locationByUnit.get(value);
                  const unit = propertyUnits.find((entry) => entry.id === value);
                  setLocationMeta({ building: existing?.building ?? unit?.building ?? "", area: existing?.area ?? unit?.area ?? "", floor: existing?.floor ?? unit?.floor ?? "" });
                }}
                placeholder="Search unit..."
              />
              <div className="three-column-form">
                <input value={locationMeta.building} onChange={(event) => setLocationMeta((current) => ({ ...current, building: event.target.value }))} placeholder="Building" />
                <input value={locationMeta.area} onChange={(event) => setLocationMeta((current) => ({ ...current, area: event.target.value }))} placeholder="Area" />
                <input value={locationMeta.floor} onChange={(event) => setLocationMeta((current) => ({ ...current, floor: event.target.value }))} placeholder="Floor" />
              </div>
              <p className="muted">Select a unit, then click the map to place it.</p>
            </div>
          ) : null}

          {placementMode === "area" ? (
            <div className="map-area-editor">
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
              </div>
              <p className="muted">Click the map to place the building or area marker.</p>
            </div>
          ) : null}

          {placementMode === "pin" ? (
            <div className="map-pin-editor">
              <div className="map-pin-form">
                <input value={pinDraft.title} onChange={(event) => setPinDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Pin title" />
                <select value={pinDraft.pinType} onChange={(event) => setPinDraft((current) => ({ ...current, pinType: event.target.value }))}>
                  {pinTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
                <input value={pinDraft.building} onChange={(event) => setPinDraft((current) => ({ ...current, building: event.target.value }))} placeholder="Building" />
                <input value={pinDraft.unitLabel} onChange={(event) => setPinDraft((current) => ({ ...current, unitLabel: event.target.value }))} placeholder="Unit" />
                <input value={pinDraft.area} onChange={(event) => setPinDraft((current) => ({ ...current, area: event.target.value }))} placeholder="Area" />
                <textarea value={pinDraft.description} onChange={(event) => setPinDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Description" />
                <select value={pinDraft.linkedRecordType} onChange={(event) => setPinDraft((current) => ({ ...current, linkedRecordType: event.target.value, linkedRecordId: "" }))}>
                  <option value="">No linked record</option>
                  <option value="PROJECT_RECORD">Project / Recommendation</option>
                  <option value="PEST_ISSUE">Pest Control</option>
                  <option value="LEASE_COMPLIANCE_ISSUE">Lease Compliance</option>
                  <option value="PM_TASK">PM Task</option>
                  <option value="WIKI_ENTRY">Wiki Entry</option>
                </select>
                {pinDraft.linkedRecordType ? (
                  <select value={pinDraft.linkedRecordId} onChange={(event) => setPinDraft((current) => ({ ...current, linkedRecordId: event.target.value }))}>
                    <option value="">Choose linked record</option>
                    {pinDraft.linkedRecordType === "PROJECT_RECORD" ? linkedRecordOptions.PROJECT_RECORD.map((record) => <option key={record.id} value={record.id}>{record.title}</option>) : null}
                    {pinDraft.linkedRecordType === "PEST_ISSUE" ? linkedRecordOptions.PEST_ISSUE.map((issue) => <option key={issue.id} value={issue.id}>{issue.unit?.number ?? issue.area ?? issue.pestType} / {issue.pestType}</option>) : null}
                    {pinDraft.linkedRecordType === "LEASE_COMPLIANCE_ISSUE" ? linkedRecordOptions.LEASE_COMPLIANCE_ISSUE.map((issue: LeaseComplianceIssue) => <option key={issue.id} value={issue.id}>{issue.unit?.number ?? issue.area ?? issue.issueTypeName} / {issue.issueTypeName}</option>) : null}
                    {pinDraft.linkedRecordType === "PM_TASK" ? linkedRecordOptions.PM_TASK.map((task) => <option key={task.id} value={task.id}>{task.taskName}</option>) : null}
                    {pinDraft.linkedRecordType === "WIKI_ENTRY" ? linkedRecordOptions.WIKI_ENTRY.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>) : null}
                  </select>
                ) : null}
                <input value={pinDraft.tags} onChange={(event) => setPinDraft((current) => ({ ...current, tags: event.target.value }))} placeholder="tag1, tag2" />
                <label className="compact-toggle">Emergency pin
                  <input type="checkbox" checked={pinDraft.isEmergency} onChange={(event) => setPinDraft((current) => ({ ...current, isEmergency: event.target.checked }))} />
                </label>
              </div>
              <p className="muted">Click the map to place the shared pin.</p>
            </div>
          ) : null}

          {search.trim() ? (
            <div className="map-search-results">
              {mergedSearchResults.length === 0 ? <p className="muted">No map matches for this search.</p> : mergedSearchResults.map((result) => (
                <button key={result.id} type="button" className="map-search-result" onClick={result.onSelect}>
                  <strong>{result.title}</strong>
                  <span>{result.subtitle}</span>
                </button>
              ))}
            </div>
          ) : null}

          <div className="unit-directory-list">
            {buildingFilteredUnits.map((unit) => {
              const location = locationByUnit.get(unit.id);
              const item = itemByUnit.get(unit.id);
              return (
                <article key={unit.id} className="unit-directory-row">
                  <button type="button" onClick={() => item && onOpenItem(item.id)} disabled={!item}>
                    <strong>{displayUnitNumber(property?.code ?? "", unit.number)}</strong>
                    <small>{unit.floorPlanRecord ? floorPlanLabel(unit.floorPlanRecord) : unit.floorPlan ?? "No floor plan"} / {location ? `${location.building ? `Bldg ${location.building}` : ""} ${location.area ?? "Mapped"}` : "Unmapped"}</small>
                  </button>
                  {location && canManage ? <button className="button button-secondary" type="button" onClick={() => void onRemoveLocation(location.id)}>Remove</button> : null}
                </article>
              );
            })}
            {!buildingFilteredUnits.length ? <p className="muted">No units match the selected building filter.</p> : null}
          </div>
        </div>

        <div className="operations-card map-detail-card">
          <h3>Selected Record</h3>
          {selectedMarkerDetails ? (
            <div className="map-detail-stack">
              <div>
                <strong>{selectedMarkerDetails.title}</strong>
                <p className="muted">{selectedMarkerDetails.type}</p>
              </div>
              <p>{selectedMarkerDetails.description || "No additional description."}</p>
            <div className="map-detail-list">
              {selectedMarkerDetails.related.map((entry) => <span key={entry}>{entry}</span>)}
            </div>
              {canManage ? (
                <div className="pool-entry-actions">
                  {selectedMarker?.kind === "unit" ? (
                    <>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => {
                          const location = selectedMarker.location;
                          const unit = propertyUnits.find((entry) => entry.id === location.unitId) ?? location.unit;
                          openProjectCreate({
                            propertyId,
                            source: "Map Finding",
                            recordType: "Recommendation",
                            title: `Unit ${unit.number} map finding`,
                            description: [location.building ? `Building ${location.building}` : null, location.area, location.floor].filter(Boolean).join(" / "),
                            sourceRecordType: "UNIT_MAP_LOCATION",
                            sourceRecordId: location.id,
                            sourceRecordLabel: unit.number,
                            building: location.building ?? unit.building ?? "",
                            area: location.area ?? unit.area ?? "",
                            tags: ["property-map", "unit"],
                          });
                        }}
                      >
                        Create Recommendation
                      </button>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => {
                          const location = selectedMarker.location;
                          const unit = propertyUnits.find((entry) => entry.id === location.unitId) ?? location.unit;
                          openPestQuickAdd({
                            propertyId,
                            unitId: location.unitId,
                            area: location.area ?? unit.area ?? "",
                            source: "Property Walk",
                            priority: "Normal",
                            description: [`Map follow-up for unit ${unit.number}.`, location.building ? `Building ${location.building}` : null, location.area, location.floor].filter(Boolean).join(" / "),
                          });
                        }}
                      >
                        Create Pest Request
                      </button>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => {
                          const location = selectedMarker.location;
                          const unit = propertyUnits.find((entry) => entry.id === location.unitId) ?? location.unit;
                          openLeaseQuickAdd({
                            propertyId,
                            unitId: location.unitId,
                            building: location.building ?? unit.building ?? "",
                            area: location.area ?? unit.area ?? "",
                            source: "Grounds Walk",
                            description: `Map follow-up for unit ${unit.number}.`,
                            locationNotes: [location.building ? `Building ${location.building}` : null, location.area, location.floor].filter(Boolean).join(" / "),
                            mapPin: {
                              mapId: location.mapId,
                              xPercent: location.xPercent,
                              yPercent: location.yPercent,
                              sourceRecordType: "UNIT_MAP_LOCATION",
                              sourceRecordId: location.id,
                              sourceRecordLabel: unit.number,
                            },
                          });
                        }}
                      >
                        Create Lease Issue
                      </button>
                    </>
                  ) : null}
                  {selectedMarker?.kind === "area" ? (
                    <>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => openProjectCreate({
                          propertyId,
                          source: "Map Finding",
                          recordType: "Recommendation",
                          title: selectedMarker.area.name,
                          description: selectedMarker.area.notes || `${selectedMarker.area.areaType} map area`,
                          sourceRecordType: "PROPERTY_MAP_AREA",
                          sourceRecordId: selectedMarker.area.id,
                          sourceRecordLabel: selectedMarker.area.name,
                          building: selectedMarker.area.areaType === "BUILDING" ? selectedMarker.area.name : "",
                          area: selectedMarker.area.areaType !== "BUILDING" ? selectedMarker.area.name : "",
                          tags: ["property-map", selectedMarker.area.areaType.toLowerCase()],
                        })}
                      >
                        Create Recommendation
                      </button>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => openPestQuickAdd({
                          propertyId,
                          area: selectedMarker.area.name,
                          source: "Property Walk",
                          priority: "Normal",
                          description: selectedMarker.area.notes || `${selectedMarker.area.areaType} map area follow-up.`,
                        })}
                      >
                        Create Pest Request
                      </button>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => openLeaseQuickAdd({
                          propertyId,
                          building: selectedMarker.area.areaType === "BUILDING" ? selectedMarker.area.name : "",
                          area: selectedMarker.area.areaType !== "BUILDING" ? selectedMarker.area.name : "",
                          source: "Grounds Walk",
                          description: `${selectedMarker.area.areaType} map follow-up.`,
                          locationNotes: selectedMarker.area.notes || selectedMarker.area.name,
                          mapPin: {
                            mapId: selectedMarker.area.mapId,
                            xPercent: selectedMarker.area.xPercent,
                            yPercent: selectedMarker.area.yPercent,
                            sourceRecordType: "PROPERTY_MAP_AREA",
                            sourceRecordId: selectedMarker.area.id,
                            sourceRecordLabel: selectedMarker.area.name,
                          },
                        })}
                      >
                        Create Lease Issue
                      </button>
                    </>
                  ) : null}
                  {selectedMarker?.kind === "pin" ? (
                    <>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => openProjectCreate({
                          propertyId,
                          source: "Map Finding",
                          recordType: "Recommendation",
                          title: selectedMarker.pin.title,
                          description: selectedMarker.pin.description || "",
                          sourceRecordType: "PROPERTY_MAP_PIN",
                          sourceRecordId: selectedMarker.pin.id,
                          sourceRecordLabel: selectedMarker.pin.title,
                          building: selectedMarker.pin.building ?? "",
                          area: selectedMarker.pin.area ?? "",
                          locationNotes: selectedMarker.pin.unitLabel ?? "",
                          tags: ["property-map", selectedMarker.pin.pinType.toLowerCase().replace(/\s+/g, "-")],
                        })}
                      >
                        Create Recommendation
                      </button>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => openPestQuickAdd({
                          propertyId,
                          area: selectedMarker.pin.area ?? selectedMarker.pin.building ?? selectedMarker.pin.title,
                          source: "Property Walk",
                          priority: selectedMarker.pin.isEmergency ? "High" : "Normal",
                          description: [selectedMarker.pin.title, selectedMarker.pin.description, selectedMarker.pin.unitLabel ? `Unit ${selectedMarker.pin.unitLabel}` : null].filter(Boolean).join("\n\n"),
                        })}
                      >
                        Create Pest Request
                      </button>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => openLeaseQuickAdd({
                          propertyId,
                          building: selectedMarker.pin.building ?? "",
                          area: selectedMarker.pin.area ?? selectedMarker.pin.title,
                          source: "Grounds Walk",
                          description: selectedMarker.pin.title,
                          locationNotes: [selectedMarker.pin.description, selectedMarker.pin.unitLabel ? `Unit ${selectedMarker.pin.unitLabel}` : null].filter(Boolean).join("\n\n"),
                          mapPin: {
                            mapId: selectedMarker.pin.mapId,
                            xPercent: selectedMarker.pin.xPercent,
                            yPercent: selectedMarker.pin.yPercent,
                            sourceRecordType: "PROPERTY_MAP_PIN",
                            sourceRecordId: selectedMarker.pin.id,
                            sourceRecordLabel: selectedMarker.pin.title,
                          },
                        })}
                      >
                        Create Lease Issue
                      </button>
                    </>
                  ) : null}
                  {selectedMarker?.kind === "project" ? (
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => openProjectRecord({ id: selectedMarker.record.id, propertyId })}
                    >
                      Open Project Record
                    </button>
                  ) : null}
                </div>
              ) : null}
              {selectedMarker?.kind === "pin" && canManage ? (
                <div className="pool-entry-actions">
                  <button className="button button-secondary" type="button" onClick={() => setPlacementMode("move-pin")}>Move Pin</button>
                  <button className="button button-secondary" type="button" onClick={() => void pinRemoveMutation.mutateAsync(selectedMarker.pin.id)}>Archive Pin</button>
                </div>
              ) : null}
              {selectedMarker?.kind === "pin" ? (
                <div className="pool-card" style={{ padding: 12 }}>
                  <div className="drawer-section-title">
                    <h3>Pin Files</h3>
                    {canManage ? (
                      <label className="button button-secondary pool-upload-button">
                        Upload Photo/PDF
                        <input
                          type="file"
                          hidden
                          accept="image/*,.pdf"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void pinAttachmentUploadMutation.mutateAsync({ pinId: selectedMarker.pin.id, file });
                            event.currentTarget.value = "";
                          }}
                        />
                      </label>
                    ) : null}
                  </div>
                  {selectedMarker.pin.attachments.length ? (
                    <div className="pool-attachment-list">
                      {selectedMarker.pin.attachments.map((attachment) => (
                        <span key={attachment.id} style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                          <a href={propertyMapPinAttachmentDownloadUrl(attachment.id)} target="_blank" rel="noreferrer">
                            {attachment.originalName}
                          </a>
                          {attachment.caption ? <em className="muted">{attachment.caption}</em> : null}
                          {canManage ? <button className="link-button" type="button" onClick={() => void pinAttachmentDeleteMutation.mutateAsync(attachment.id)}>Remove</button> : null}
                        </span>
                      ))}
                    </div>
                  ) : <p className="muted">No files attached to this pin yet.</p>}
                </div>
              ) : null}
              {selectedMarker?.kind === "area" && canManage ? (
                <div className="pool-entry-actions">
                  <button className="button button-secondary" type="button" onClick={() => void onRemoveArea(selectedMarker.area.id)}>Archive Area</button>
                </div>
              ) : null}
            </div>
          ) : <p className="muted">Select a unit, area, shared pin, or project marker to inspect it.</p>}

          <div className="map-summary-grid">
            <article>
              <strong>{customPins.length}</strong>
              <span>Shared pins</span>
            </article>
            <article>
              <strong>{projectRecords.length}</strong>
              <span>Project pins</span>
            </article>
            <article>
              <strong>{mapLocations.length}</strong>
              <span>Mapped units</span>
            </article>
            <article>
              <strong>{unmappedUnits.length}</strong>
              <span>Unmapped units</span>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}
