import { useEffect, useMemo, useState } from "react";
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
  UserLanguage,
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
  restorePropertyMapPin,
  deletePropertyMapPin,
  deletePropertyMapPinAttachment,
  updatePropertyMapPin,
  uploadPropertyMapPinAttachment,
} from "../lib/api";
import { displayUnitNumber } from "../lib/board";
import { openLeaseQuickAdd } from "../lib/leaseNavigation";
import { openPestQuickAdd } from "../lib/pestNavigation";
import { openProjectCreate, openProjectRecord } from "../lib/projectNavigation";
import { ConfirmDialog } from "./ConfirmDialog";
import { UnitSearchSelect } from "./UnitSearchSelect";

type ColorSource = "riskLevel" | "vacancyStatus" | "boardSection" | "assignedTech" | "makeReadyStatus";
type MarkerKind = "unit" | "area" | "pin" | "project";
type PlacementMode = "none" | "unit" | "area" | "pin" | "move-pin";
type BulkPlacementPreviewRow = {
  rowNumber: number;
  unitNumber: string;
  unitId: string;
  xPercent: number;
  yPercent: number;
  building: string;
  area: string;
  floor: string;
};
type BulkAreaPreviewRow = {
  rowNumber: number;
  name: string;
  areaType: string;
  xPercent: number;
  yPercent: number;
  color: string;
  expectedUnitCount: number | null;
  notes: string;
};

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
  language?: UserLanguage;
  loading?: boolean;
  error?: string | null;
  onPropertyChange: (propertyId: string) => void;
  onCreateMap: (input: { propertyId: string; name: string; notes?: string | null; width?: number | null; height?: number | null }) => Promise<PropertyMap>;
  onArchiveMap: (id: string, restore?: boolean) => Promise<void>;
  onDeleteMap: (id: string) => Promise<void>;
  onUploadMap: (id: string, file: File) => Promise<PropertyMap>;
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
  onRestoreLocation: (id: string) => Promise<void>;
  onDeleteLocation: (id: string) => Promise<void>;
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
  onRestoreArea: (id: string) => Promise<void>;
  onDeleteArea: (id: string) => Promise<void>;
  onOpenItem: (itemId: string) => void;
};

type SelectedMarker =
  | { kind: "unit"; location: UnitMapLocation }
  | { kind: "area"; area: PropertyMapArea }
  | { kind: "pin"; pin: PropertyMapPin }
  | { kind: "project"; record: ProjectRecord };
type DeleteArchivedTarget =
  | { kind: "pin"; id: string; name: string }
  | { kind: "area"; id: string; name: string }
  | { kind: "location"; id: string; name: string };

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

function detectDelimiter(line: string) {
  const candidates = ["\t", ";", ","];
  let best = ",";
  let bestCount = -1;
  for (const candidate of candidates) {
    const count = line.split(candidate).length;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function csvEscape(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

function formatDate(value: string | null | undefined, language: UserLanguage = "en") {
  if (!value) return language === "es" ? "Sin fecha" : "Not set";
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
  const offsets = new Map<string, { offsetX: number; offsetY: number; overlapCount: number; clusterLead: boolean }>();
  for (const group of groups.values()) {
    group.forEach((entry, index) => {
      const { offsetX, offsetY } = overlapOffset(index, group.length);
      offsets.set(entry.key, { offsetX, offsetY, overlapCount: group.length, clusterLead: index === 0 });
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
  language = "en",
  loading = false,
  error = null,
  onPropertyChange,
  onCreateMap,
  onArchiveMap,
  onDeleteMap,
  onUploadMap,
  onSaveLocation,
  onRemoveLocation,
  onRestoreLocation,
  onDeleteLocation,
  onCreateArea,
  onUpdateArea,
  onRemoveArea,
  onRestoreArea,
  onDeleteArea,
  onOpenItem,
}: Props) {
  const queryClient = useQueryClient();
  const isSpanish = language === "es";
  const [localPropertyId, setLocalPropertyId] = useState(selectedPropertyId || properties[0]?.id || "");
  const [showDeleteMapConfirm, setShowDeleteMapConfirm] = useState(false);
  const [deleteArchivedTarget, setDeleteArchivedTarget] = useState<DeleteArchivedTarget | null>(null);
  const propertyId = selectedPropertyId || localPropertyId;
  const property = properties.find((entry) => entry.id === propertyId);
  const propertyMaps = maps.filter((map) => map.propertyId === propertyId);
  const defaultMap = propertyMaps.find((map) => map.isDefault && !map.isArchived) ?? propertyMaps.find((map) => map.isActive && !map.isArchived) ?? propertyMaps.find((map) => !map.isArchived) ?? propertyMaps[0];
  const [selectedMapId, setSelectedMapId] = useState("");
  const selectedMap = propertyMaps.find((map) => map.id === (selectedMapId || defaultMap?.id)) ?? defaultMap ?? null;
  const activePropertyMaps = useMemo(() => propertyMaps.filter((map) => !map.isArchived), [propertyMaps]);
  const archivedPropertyMaps = useMemo(() => propertyMaps.filter((map) => map.isArchived), [propertyMaps]);
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
  const [unitListScope, setUnitListScope] = useState<"all" | "unmapped" | "mapped">("all");
  const [queueCopyMessage, setQueueCopyMessage] = useState("");
  const [bulkPlacementText, setBulkPlacementText] = useState("");
  const [bulkPlacementMessage, setBulkPlacementMessage] = useState("");
  const [isImportingBulkPlacement, setIsImportingBulkPlacement] = useState(false);
  const [bulkAreaText, setBulkAreaText] = useState("");
  const [bulkAreaMessage, setBulkAreaMessage] = useState("");
  const [isImportingBulkAreas, setIsImportingBulkAreas] = useState(false);

  useEffect(() => {
    if (!propertyMaps.length) {
      if (selectedMapId) setSelectedMapId("");
      if (selectedUnitId) setSelectedUnitId("");
      if (selectedMarker) setSelectedMarker(null);
      if (selectedBuilding) setSelectedBuilding("");
      if (placementMode !== "none") setPlacementMode("none");
      return;
    }

    const fallbackMapId = defaultMap?.id ?? "";
    if (selectedMapId && propertyMaps.some((map) => map.id === selectedMapId)) {
      return;
    }
    if (selectedMapId !== fallbackMapId) {
      setSelectedMapId(fallbackMapId);
    }
  }, [defaultMap?.id, placementMode, propertyMaps, selectedBuilding, selectedMapId, selectedMarker, selectedUnitId]);

  useEffect(() => {
    setSelectedUnitId("");
    setSelectedBuilding("");
    if (placementMode === "unit" || placementMode === "move-pin") {
      setPlacementMode("none");
    }
    setSelectedMarker((current) => {
      if (!current || !selectedMap?.id) return null;
      if (current.kind === "unit") return current.location.mapId === selectedMap.id ? current : null;
      if (current.kind === "area") return current.area.mapId === selectedMap.id ? current : null;
      if (current.kind === "pin") return current.pin.mapId === selectedMap.id ? current : null;
      return current.record.propertyMapId === selectedMap.id ? current : null;
    });
  }, [selectedMap?.id]);

  const propertyUnits = units.filter((unit) => unit.propertyId === propertyId && unit.isActive);
  const itemByUnit = useMemo(() => {
    const result = new Map<string, MakeReadyItem>();
    for (const item of items) {
      if (item.unitId && item.propertyId === propertyId && !item.isArchived && !result.has(item.unitId)) result.set(item.unitId, item);
    }
    return result;
  }, [items, propertyId]);

  const mapLocations = locations.filter((location) => location.mapId === selectedMap?.id && !location.isArchived);
  const archivedMapLocations = locations.filter((location) => location.mapId === selectedMap?.id && location.isArchived);
  const mapAreas = areas.filter((area) => area.mapId === selectedMap?.id && !area.isArchived);
  const archivedMapAreas = areas.filter((area) => area.mapId === selectedMap?.id && area.isArchived);
  const locationByUnit = useMemo(() => new Map(mapLocations.map((location) => [location.unitId, location])), [mapLocations]);
  const unmappedUnits = propertyUnits.filter((unit) => !locationByUnit.has(unit.id));

  const pinsQuery = useQuery({
    queryKey: ["property-map-pins", propertyId, selectedMap?.id],
    queryFn: () => getPropertyMapPins({ propertyId, mapId: selectedMap?.id ?? undefined, includeArchived: true }),
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
  const pinRestoreMutation = useMutation({
    mutationFn: restorePropertyMapPin,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["property-map-pins"] });
    },
  });
  const pinDeleteMutation = useMutation({
    mutationFn: deletePropertyMapPin,
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
  const allCustomPins = pinsQuery.data?.pins ?? [];
  const customPins = allCustomPins.filter((pin) => !pin.isArchived);
  const archivedCustomPins = allCustomPins.filter((pin) => pin.isArchived);

  const buildingSummaries = useMemo(() => {
    const summaries = new Map<string, { key: string; label: string; units: Unit[]; mapped: number; unmapped: number; x: number | null; y: number | null }>();
    for (const area of mapAreas) {
      const label = area.name.trim() || (isSpanish ? "Área sin nombre" : "Unnamed area");
      summaries.set(label.toLowerCase(), { key: label.toLowerCase(), label, units: [], mapped: 0, unmapped: 0, x: area.xPercent, y: area.yPercent });
    }
    for (const unit of propertyUnits) {
      const location = locationByUnit.get(unit.id);
      const label = unit.building?.trim() || location?.building?.trim() || unit.area?.trim() || location?.area?.trim() || (isSpanish ? "Sin edificio" : "No building");
      const key = label.toLowerCase();
      const existing = summaries.get(key) ?? { key, label, units: [], mapped: 0, unmapped: 0, x: null, y: null };
      existing.units.push(unit);
      if (location) {
        existing.mapped += 1;
        existing.x = existing.x === null ? location.xPercent : (existing.x + location.xPercent) / 2;
        existing.y = existing.y === null ? location.yPercent : (existing.y + location.yPercent) / 2;
      } else {
        existing.unmapped += 1;
      }
      summaries.set(key, existing);
    }
    return Array.from(summaries.values()).sort((left, right) => {
      if (left.unmapped !== right.unmapped) return right.unmapped - left.unmapped;
      return left.label.localeCompare(right.label, undefined, { numeric: true });
    });
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

  const beginPlacementForArea = (label: string) => {
    setSelectedBuilding(label.toLowerCase());
    setUnitListScope("unmapped");
    setPlacementMode("unit");
    setSelectedMarker(null);
    setSelectedUnitId("");
  };

  const nextIncompleteBuilding = useMemo(
    () => buildingSummaries.find((summary) => summary.unmapped > 0) ?? null,
    [buildingSummaries],
  );

  const selectPlacementUnit = (unitId: string) => {
    setSelectedUnitId(unitId);
    const existing = locationByUnit.get(unitId);
    const unit = propertyUnits.find((entry) => entry.id === unitId);
    setLocationMeta({
      building: existing?.building ?? unit?.building ?? "",
      area: existing?.area ?? unit?.area ?? "",
      floor: existing?.floor ?? unit?.floor ?? "",
    });
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
      const nextUnit = buildingFilteredUnmappedUnits.find((unit) => unit.id !== selectedUnitId) ?? null;
      if (nextUnit) {
        selectPlacementUnit(nextUnit.id);
      } else {
        setSelectedUnitId("");
      }
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
        title: isSpanish ? `Unidad ${unit.number}` : `Unit ${unit.number}`,
        subtitle: [location.building, location.area, location.floor].filter(Boolean).join(" / ") || (isSpanish ? "Marcador de unidad" : "Unit marker"),
        onSelect: () => setSelectedMarker({ kind: "unit", location }),
      });
    }
    for (const area of mapAreas) {
      if (!markerMatchesSearch([area.name, area.areaType, area.notes], search)) continue;
      results.push({
        id: `area:${area.id}`,
        title: area.name,
        subtitle: isSpanish ? `Area de ${area.areaType.toLowerCase()}` : `${area.areaType} area`,
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

  const selectedAreaPlacement = useMemo(() => {
    if (selectedMarker?.kind !== "area") return null;
    const areaKey = selectedMarker.area.name.toLowerCase();
    const areaUnits = propertyUnits.filter((unit) => {
      const location = locationByUnit.get(unit.id);
      return (unit.building?.trim() || location?.building?.trim() || unit.area?.trim() || location?.area?.trim() || (isSpanish ? "Sin edificio" : "No building")).toLowerCase() === areaKey;
    });
    const unmapped = areaUnits.filter((unit) => !locationByUnit.has(unit.id));
    return {
      total: areaUnits.length,
      mapped: areaUnits.length - unmapped.length,
      unmappedCount: unmapped.length,
      nextUnit: unmapped[0] ?? null,
    };
  }, [isSpanish, locationByUnit, propertyUnits, selectedMarker]);

  const selectedMarkerDetails = (() => {
    if (!selectedMarker) return null;
    if (selectedMarker.kind === "unit") {
      const location = selectedMarker.location;
      const unit = propertyUnits.find((entry) => entry.id === location.unitId) ?? location.unit;
      const item = itemByUnit.get(location.unitId);
      const unitPests = pestIssues.filter((issue) => issue.unitId === location.unitId).slice(0, 4);
      const relatedWiki = wikiEntries.filter((entry) => (entry.building && entry.building === (unit.building ?? location.building)) || entry.floorPlan === unit.floorPlan).slice(0, 4);
      return {
        title: isSpanish ? `Unidad ${unit.number}` : `Unit ${unit.number}`,
        type: isSpanish ? "Unidad" : "Unit",
        description: [location.building ? (isSpanish ? `Edificio ${location.building}` : `Building ${location.building}`) : null, location.area, location.floor].filter(Boolean).join(" / "),
        related: [
          item ? `${isSpanish ? "Make Ready" : "Make Ready"}: ${item.makeReadyStatus ?? item.status}` : null,
          unitPests[0] ? `${isSpanish ? "Plagas" : "Pest"}: ${unitPests[0].pestType} / ${unitPests[0].status}` : null,
          relatedWiki[0] ? `${isSpanish ? "Wiki" : "Wiki"}: ${relatedWiki[0].title}` : null,
        ].filter(Boolean),
      };
    }
    if (selectedMarker.kind === "area") {
      return {
        title: selectedMarker.area.name,
        type: selectedMarker.area.areaType,
        description: selectedMarker.area.notes || (isSpanish ? `${selectedMarker.area.expectedUnitCount ?? 0} unidades esperadas` : `${selectedMarker.area.expectedUnitCount ?? 0} expected units`),
        related: [
          isSpanish
            ? `${selectedAreaPlacement?.total ?? 0} unidades`
            : `${selectedAreaPlacement?.total ?? 0} units`,
          isSpanish
            ? `${selectedAreaPlacement?.mapped ?? 0} mapeadas`
            : `${selectedAreaPlacement?.mapped ?? 0} mapped`,
          isSpanish
            ? `${selectedAreaPlacement?.unmappedCount ?? 0} sin mapear`
            : `${selectedAreaPlacement?.unmappedCount ?? 0} unmapped`,
          selectedAreaPlacement?.nextUnit
            ? (isSpanish
                ? `Siguiente: ${selectedAreaPlacement.nextUnit.number}`
                : `Next: ${selectedAreaPlacement.nextUnit.number}`)
            : (isSpanish ? "Sin unidades pendientes" : "No units waiting"),
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
          pin.isEmergency ? (isSpanish ? "Pin de emergencia" : "Emergency pin") : null,
          pin.attachments.length ? (isSpanish ? `${pin.attachments.length} archivo${pin.attachments.length === 1 ? "" : "s"}` : `${pin.attachments.length} attachment${pin.attachments.length === 1 ? "" : "s"}`) : null,
          pin.tags.length ? `${isSpanish ? "Etiquetas" : "Tags"}: ${pin.tags.join(", ")}` : null,
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
  const visibleOverlapClusterCount = useMemo(
    () => Array.from(markerOffsets.values()).filter((entry) => entry.overlapCount > 1 && entry.clusterLead).length,
    [markerOffsets],
  );
  const visibleOverlapMarkerCount = useMemo(
    () => Array.from(markerOffsets.values()).filter((entry) => entry.overlapCount > 1).length,
    [markerOffsets],
  );

  const buildingFilteredUnits = selectedBuilding
    ? propertyUnits.filter((unit) => {
      const location = locationByUnit.get(unit.id);
      return (unit.building?.trim() || location?.building?.trim() || unit.area?.trim() || location?.area?.trim() || (isSpanish ? "Sin edificio" : "No building")).toLowerCase() === selectedBuilding;
    })
    : propertyUnits;
  const buildingFilteredUnmappedUnits = useMemo(
    () => buildingFilteredUnits.filter((unit) => !locationByUnit.has(unit.id)),
    [buildingFilteredUnits, locationByUnit],
  );
  const buildingFilteredMappedUnits = useMemo(
    () => buildingFilteredUnits.filter((unit) => locationByUnit.has(unit.id)),
    [buildingFilteredUnits, locationByUnit],
  );
  const displayedBuildingUnits = unitListScope === "unmapped"
    ? buildingFilteredUnmappedUnits
    : unitListScope === "mapped"
      ? buildingFilteredMappedUnits
      : buildingFilteredUnits;
  const displayedBuildingUnitReviewText = useMemo(() => {
    const scopeLabel = unitListScope === "unmapped"
      ? (isSpanish ? "Solo sin mapear" : "Unmapped only")
      : unitListScope === "mapped"
        ? (isSpanish ? "Solo mapeadas" : "Mapped only")
        : (isSpanish ? "Todas" : "All");
    const buildingLabel = selectedBuilding
      ? buildingSummaries.find((summary) => summary.key === selectedBuilding)?.label ?? selectedBuilding
      : (isSpanish ? "Todos los edificios" : "All buildings");
    const heading = `${isSpanish ? "Cola de colocación" : "Placement queue"} - ${buildingLabel} - ${scopeLabel}`;
    const lines = displayedBuildingUnits.map((unit) => {
      const location = locationByUnit.get(unit.id);
      const unitBuilding = unit.building?.trim() || location?.building?.trim() || "";
      const unitArea = unit.area?.trim() || location?.area?.trim() || "";
      const unitFloor = unit.floorPlan?.trim() || unit.floorPlanRecord?.name?.trim() || "";
      return [
        displayUnitNumber(property?.code ?? "", unit.number),
        location ? (isSpanish ? "Mapeada" : "Mapped") : (isSpanish ? "Sin mapear" : "Unmapped"),
        unitBuilding ? `${isSpanish ? "Edificio" : "Building"} ${unitBuilding}` : null,
        unitArea ? `${isSpanish ? "Área" : "Area"} ${unitArea}` : null,
        unitFloor ? `${isSpanish ? "Plano" : "Plan"} ${unitFloor}` : null,
      ].filter(Boolean).join(" | ");
    });
    return [heading, ...lines].join("\n");
  }, [buildingSummaries, displayedBuildingUnits, isSpanish, locationByUnit, property?.code, selectedBuilding, unitListScope]);
  const displayedBuildingUnitCsv = useMemo(() => {
    const header = ["unit", "status", "xPercent", "yPercent", "building", "area", "floor", "floorPlan"];
    const rows = displayedBuildingUnits.map((unit) => {
      const location = locationByUnit.get(unit.id);
      return [
        displayUnitNumber(property?.code ?? "", unit.number),
        location ? "Mapped" : "Unmapped",
        location?.xPercent ?? "",
        location?.yPercent ?? "",
        location?.building ?? unit.building ?? "",
        location?.area ?? unit.area ?? "",
        location?.floor ?? unit.floor ?? "",
        unit.floorPlanRecord ? floorPlanLabel(unit.floorPlanRecord) : unit.floorPlan ?? "",
      ].map(csvEscape).join(",");
    });
    return [header.join(","), ...rows].join("\n");
  }, [displayedBuildingUnits, locationByUnit, property?.code]);
  const visibleAreaMarkersCsv = useMemo(() => {
    const header = ["name", "areaType", "xPercent", "yPercent", "color", "expectedUnitCount", "notes"];
    const rows = visibleAreaMarkers.map((area) => [
      area.name,
      area.areaType,
      area.xPercent,
      area.yPercent,
      area.color ?? "",
      area.expectedUnitCount ?? "",
      area.notes ?? "",
    ].map(csvEscape).join(","));
    return [header.join(","), ...rows].join("\n");
  }, [visibleAreaMarkers]);
  const bulkPlacementPreview = useMemo(() => {
    const trimmed = bulkPlacementText.trim();
    if (!trimmed) {
      return { rows: [] as BulkPlacementPreviewRow[], errors: [] as string[] };
    }
    const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) {
      return { rows: [] as BulkPlacementPreviewRow[], errors: [] as string[] };
    }
    const delimiter = detectDelimiter(lines[0]);
    const firstCells = lines[0].split(delimiter).map((value) => value.trim());
    const normalizedHeaders = firstCells.map(normalizeHeader);
    const headerLooksPresent = normalizedHeaders.some((value) => ["unit", "unitnumber", "number", "x", "xpercent", "xcoordinate", "pinx", "y", "ypercent", "ycoordinate", "piny"].includes(value));
    const headerIndex = headerLooksPresent
      ? {
        unit: normalizedHeaders.findIndex((value) => ["unit", "unitnumber", "number"].includes(value)),
        x: normalizedHeaders.findIndex((value) => ["x", "xpercent", "xcoordinate", "pinx"].includes(value)),
        y: normalizedHeaders.findIndex((value) => ["y", "ypercent", "ycoordinate", "piny"].includes(value)),
        building: normalizedHeaders.findIndex((value) => value === "building"),
        area: normalizedHeaders.findIndex((value) => value === "area"),
        floor: normalizedHeaders.findIndex((value) => value === "floor"),
      }
      : { unit: 0, x: 1, y: 2, building: 3, area: 4, floor: 5 };
    const startIndex = headerLooksPresent ? 1 : 0;
    const rows: BulkPlacementPreviewRow[] = [];
    const errors: string[] = [];
    const unitByNormalizedNumber = new Map(
      propertyUnits.map((unit) => [displayUnitNumber("", unit.number).trim().toLowerCase(), unit] as const),
    );
    const unitByPropertyNumber = new Map(propertyUnits.map((unit) => [unit.number.trim().toLowerCase(), unit] as const));
    for (let index = startIndex; index < lines.length; index += 1) {
      const rawCells = lines[index].split(delimiter).map((value) => value.trim());
      const unitNumber = (rawCells[headerIndex.unit] ?? "").trim();
      const xRaw = rawCells[headerIndex.x] ?? "";
      const yRaw = rawCells[headerIndex.y] ?? "";
      if (!unitNumber) {
        errors.push(`${isSpanish ? "Fila" : "Row"} ${index + 1}: ${isSpanish ? "falta la unidad" : "missing unit number"}.`);
        continue;
      }
      const unit = unitByPropertyNumber.get(unitNumber.toLowerCase()) ?? unitByNormalizedNumber.get(unitNumber.toLowerCase());
      if (!unit) {
        errors.push(`${isSpanish ? "Fila" : "Row"} ${index + 1}: ${isSpanish ? "unidad no encontrada" : "unit not found"} (${unitNumber}).`);
        continue;
      }
      const xPercent = Number(xRaw);
      const yPercent = Number(yRaw);
      if (!Number.isFinite(xPercent) || xPercent < 0 || xPercent > 100 || !Number.isFinite(yPercent) || yPercent < 0 || yPercent > 100) {
        errors.push(`${isSpanish ? "Fila" : "Row"} ${index + 1}: ${isSpanish ? "las coordenadas deben estar entre 0 y 100" : "coordinates must be between 0 and 100"} (${unitNumber}).`);
        continue;
      }
      rows.push({
        rowNumber: index + 1,
        unitNumber,
        unitId: unit.id,
        xPercent,
        yPercent,
        building: (headerIndex.building >= 0 ? rawCells[headerIndex.building] : "") ?? "",
        area: (headerIndex.area >= 0 ? rawCells[headerIndex.area] : "") ?? "",
        floor: (headerIndex.floor >= 0 ? rawCells[headerIndex.floor] : "") ?? "",
      });
    }
    return { rows, errors };
  }, [bulkPlacementText, isSpanish, propertyUnits]);
  const bulkAreaPreview = useMemo(() => {
    const trimmed = bulkAreaText.trim();
    if (!trimmed) {
      return { rows: [] as BulkAreaPreviewRow[], errors: [] as string[] };
    }
    const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) {
      return { rows: [] as BulkAreaPreviewRow[], errors: [] as string[] };
    }
    const delimiter = detectDelimiter(lines[0]);
    const firstCells = lines[0].split(delimiter).map((value) => value.trim());
    const normalizedHeaders = firstCells.map(normalizeHeader);
    const headerLooksPresent = normalizedHeaders.some((value) => ["name", "areatype", "x", "xpercent", "y", "ypercent"].includes(value));
    const headerIndex = headerLooksPresent
      ? {
        name: normalizedHeaders.findIndex((value) => value === "name"),
        areaType: normalizedHeaders.findIndex((value) => value === "areatype"),
        x: normalizedHeaders.findIndex((value) => ["x", "xpercent"].includes(value)),
        y: normalizedHeaders.findIndex((value) => ["y", "ypercent"].includes(value)),
        color: normalizedHeaders.findIndex((value) => value === "color"),
        expectedUnitCount: normalizedHeaders.findIndex((value) => ["expectedunitcount", "expectedunits", "unitcount"].includes(value)),
        notes: normalizedHeaders.findIndex((value) => value === "notes"),
      }
      : { name: 0, areaType: 1, x: 2, y: 3, color: 4, expectedUnitCount: 5, notes: 6 };
    const startIndex = headerLooksPresent ? 1 : 0;
    const rows: BulkAreaPreviewRow[] = [];
    const errors: string[] = [];
    for (let index = startIndex; index < lines.length; index += 1) {
      const rawCells = lines[index].split(delimiter).map((value) => value.trim());
      const name = (rawCells[headerIndex.name] ?? "").trim();
      const areaType = ((rawCells[headerIndex.areaType] ?? "BUILDING").trim().toUpperCase() || "BUILDING");
      const xPercent = Number(rawCells[headerIndex.x] ?? "");
      const yPercent = Number(rawCells[headerIndex.y] ?? "");
      const color = (headerIndex.color >= 0 ? rawCells[headerIndex.color] : "") || "#1f8fdb";
      const expectedUnitCountRaw = headerIndex.expectedUnitCount >= 0 ? rawCells[headerIndex.expectedUnitCount] : "";
      const expectedUnitCount = expectedUnitCountRaw ? Number(expectedUnitCountRaw) : null;
      const notes = (headerIndex.notes >= 0 ? rawCells[headerIndex.notes] : "") ?? "";
      if (!name) {
        errors.push(`${isSpanish ? "Fila" : "Row"} ${index + 1}: ${isSpanish ? "falta el nombre del área" : "missing area name"}.`);
        continue;
      }
      if (!["BUILDING", "AREA", "FLOOR", "ZONE"].includes(areaType)) {
        errors.push(`${isSpanish ? "Fila" : "Row"} ${index + 1}: ${isSpanish ? "tipo de área no válido" : "invalid area type"} (${name}).`);
        continue;
      }
      if (!Number.isFinite(xPercent) || xPercent < 0 || xPercent > 100 || !Number.isFinite(yPercent) || yPercent < 0 || yPercent > 100) {
        errors.push(`${isSpanish ? "Fila" : "Row"} ${index + 1}: ${isSpanish ? "las coordenadas deben estar entre 0 y 100" : "coordinates must be between 0 and 100"} (${name}).`);
        continue;
      }
      if (expectedUnitCount !== null && (!Number.isFinite(expectedUnitCount) || expectedUnitCount < 0)) {
        errors.push(`${isSpanish ? "Fila" : "Row"} ${index + 1}: ${isSpanish ? "las unidades esperadas deben ser 0 o más" : "expected units must be 0 or more"} (${name}).`);
        continue;
      }
      rows.push({
        rowNumber: index + 1,
        name,
        areaType,
        xPercent,
        yPercent,
        color,
        expectedUnitCount,
        notes,
      });
    }
    return { rows, errors };
  }, [bulkAreaText, isSpanish]);
  const nextUnmappedPlacementUnit = useMemo(() => {
    if (!buildingFilteredUnmappedUnits.length) return null;
    const currentIndex = buildingFilteredUnmappedUnits.findIndex((unit) => unit.id === selectedUnitId);
    if (currentIndex >= 0 && currentIndex < buildingFilteredUnmappedUnits.length - 1) {
      return buildingFilteredUnmappedUnits[currentIndex + 1];
    }
    return buildingFilteredUnmappedUnits[0] ?? null;
  }, [buildingFilteredUnmappedUnits, selectedUnitId]);

  useEffect(() => {
    if (placementMode !== "unit" || selectedUnitId) return;
    if (!nextUnmappedPlacementUnit) return;
    selectPlacementUnit(nextUnmappedPlacementUnit.id);
  }, [nextUnmappedPlacementUnit, placementMode, selectedUnitId]);

  const copyDisplayedPlacementQueue = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard || !displayedBuildingUnits.length) {
      setQueueCopyMessage(isSpanish ? "No se pudo copiar la cola." : "Could not copy the queue.");
      return;
    }
    try {
      await navigator.clipboard.writeText(displayedBuildingUnitReviewText);
      setQueueCopyMessage(isSpanish ? "Cola copiada." : "Queue copied.");
      window.setTimeout(() => setQueueCopyMessage(""), 2000);
    } catch {
      setQueueCopyMessage(isSpanish ? "No se pudo copiar la cola." : "Could not copy the queue.");
    }
  };

  const importBulkPlacement = async () => {
    if (!selectedMap || !bulkPlacementPreview.rows.length) {
      setBulkPlacementMessage(isSpanish ? "No hay filas válidas para importar." : "No valid rows to import.");
      return;
    }
    setIsImportingBulkPlacement(true);
    setBulkPlacementMessage("");
    try {
      for (const row of bulkPlacementPreview.rows) {
        await onSaveLocation({
          propertyId,
          mapId: selectedMap.id,
          unitId: row.unitId,
          xPercent: row.xPercent,
          yPercent: row.yPercent,
          building: row.building || null,
          area: row.area || null,
          floor: row.floor || null,
        });
      }
      setBulkPlacementMessage(
        isSpanish
          ? `Se importaron ${bulkPlacementPreview.rows.length} ubicaciones de unidad.`
          : `Imported ${bulkPlacementPreview.rows.length} unit locations.`,
      );
      setBulkPlacementText("");
    } catch {
      setBulkPlacementMessage(isSpanish ? "No se pudo importar la colocación masiva." : "Could not import the bulk placement.");
    } finally {
      setIsImportingBulkPlacement(false);
    }
  };

  const exportDisplayedPlacementQueueCsv = () => {
    if (!displayedBuildingUnits.length || typeof document === "undefined") return;
    const blob = new Blob([displayedBuildingUnitCsv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const buildingLabel = selectedBuilding
      ? buildingSummaries.find((summary) => summary.key === selectedBuilding)?.label ?? selectedBuilding
      : "all-buildings";
    const scopeLabel = unitListScope === "unmapped" ? "unmapped" : unitListScope === "mapped" ? "mapped" : "all";
    link.href = url;
    link.download = `${(property?.code ?? "property").toLowerCase()}-${String(buildingLabel).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${scopeLabel}-map-queue.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const exportVisibleAreasCsv = () => {
    if (!visibleAreaMarkers.length || typeof document === "undefined") return;
    const blob = new Blob([visibleAreaMarkersCsv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(property?.code ?? "property").toLowerCase()}-map-areas.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const importBulkAreas = async () => {
    if (!selectedMap || !bulkAreaPreview.rows.length) {
      setBulkAreaMessage(isSpanish ? "No hay filas válidas para importar." : "No valid rows to import.");
      return;
    }
    setIsImportingBulkAreas(true);
    setBulkAreaMessage("");
    try {
      for (const row of bulkAreaPreview.rows) {
        await onCreateArea({
          propertyId,
          mapId: selectedMap.id,
          name: row.name,
          areaType: row.areaType,
          xPercent: row.xPercent,
          yPercent: row.yPercent,
          color: row.color || null,
          expectedUnitCount: row.expectedUnitCount,
          notes: row.notes || null,
        });
      }
      setBulkAreaMessage(
        isSpanish
          ? `Se importaron ${bulkAreaPreview.rows.length} marcadores de área.`
          : `Imported ${bulkAreaPreview.rows.length} area markers.`,
      );
      setBulkAreaText("");
    } catch {
      setBulkAreaMessage(isSpanish ? "No se pudo importar la colocación masiva de áreas." : "Could not import the bulk area placement.");
    } finally {
      setIsImportingBulkAreas(false);
    }
  };

  return (
    <section className="panel property-map-panel" data-testid="property-maps-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{isSpanish ? "Mapas de propiedad" : "Property Maps"}</p>
          <h2>{isSpanish ? "Operaciones visuales de la propiedad" : "Visual Property Operations"}</h2>
          <p className="muted">{isSpanish ? "Mapas, unidades, areas, utilidades de emergencia y registros vinculados en una sola vista operativa." : "Maps, units, areas, emergency utilities, and linked records in one operational view."}</p>
        </div>
      </div>
      {loading && <div className="state-card">{isSpanish ? "Cargando mapas de la propiedad..." : "Loading property maps..."}</div>}
      {error && <div className="state-card error">{error}</div>}

      <div className="toolbar compact-toolbar map-toolbar">
        <label>{isSpanish ? "Propiedad" : "Property"}
          <select data-testid="property-maps-property-select" value={propertyId} onChange={(event) => updateProperty(event.target.value)}>
            {properties.map((entry) => <option key={entry.id} value={entry.id}>{entry.code} - {entry.name}</option>)}
          </select>
        </label>
        <label>{isSpanish ? "Mapa" : "Map"}
          <select data-testid="property-maps-map-select" value={selectedMap?.id ?? ""} onChange={(event) => setSelectedMapId(event.target.value)}>
            <option value="">{isSpanish ? "Ningún mapa seleccionado" : "No map selected"}</option>
            {activePropertyMaps.length ? (
              <optgroup label={isSpanish ? "Mapas activos" : "Active maps"}>
                {activePropertyMaps.map((map) => <option key={map.id} value={map.id}>{map.name}{map.isDefault ? (isSpanish ? " / predeterminado" : " / default") : ""}</option>)}
              </optgroup>
            ) : null}
            {archivedPropertyMaps.length ? (
              <optgroup label={isSpanish ? "Mapas archivados" : "Archived maps"}>
                {archivedPropertyMaps.map((map) => <option key={map.id} value={map.id}>{map.name}</option>)}
              </optgroup>
            ) : null}
          </select>
        </label>
        <label>{isSpanish ? "Buscar" : "Search"}
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={isSpanish ? "Edificio, unidad, pin, proyecto, problema..." : "Building, unit, pin, project, issue..."} />
        </label>
        <label>{isSpanish ? "Colorear por" : "Color by"}
          <select value={colorSource} onChange={(event) => setColorSource(event.target.value as ColorSource)}>
            <option value="riskLevel">{isSpanish ? "Nivel de riesgo" : "Risk Level"}</option>
            <option value="vacancyStatus">{isSpanish ? "Estado de vacancia" : "Vacancy Status"}</option>
            <option value="boardSection">{isSpanish ? "Seccion del tablero" : "Board Section"}</option>
            <option value="assignedTech">{isSpanish ? "Tecnico asignado" : "Assigned Tech"}</option>
            <option value="makeReadyStatus">{isSpanish ? "Estado de make ready" : "Make Ready Status"}</option>
          </select>
        </label>
        <label className="compact-toggle">{isSpanish ? "Modo de emergencia" : "Emergency mode"}
          <input type="checkbox" checked={emergencyOnly} onChange={(event) => setEmergencyOnly(event.target.checked)} />
        </label>
      </div>

      {canManage ? (
        <div className="operations-card map-management-card">
          <h3>{isSpanish ? "Configuración del mapa" : "Map Setup"}</h3>
          {selectedMap ? (
            <div className="admin-message" style={{ marginBottom: 12 }}>
              <strong>{selectedMap.name}</strong>{" "}
              <span className={`status-chip ${selectedMap.isArchived ? "inactive" : "active"}`}>
                {selectedMap.isArchived ? (isSpanish ? "Archivado" : "Archived") : (isSpanish ? "Activo" : "Active")}
              </span>
              {selectedMap.isDefault ? (
                <>
                  {" "}
                  <span className="status-chip active">{isSpanish ? "Predeterminado" : "Default"}</span>
                </>
              ) : null}
              {" "}
              <span className={`status-chip ${selectedMap.mimeType ? "active" : "inactive"}`}>
                {selectedMap.mimeType
                  ? (isSpanish ? "Archivo cargado" : "File uploaded")
                  : (isSpanish ? "Sin archivo" : "No file yet")}
              </span>
              <p className="helper-copy" style={{ marginTop: 8 }}>
                {!selectedMap.mimeType
                  ? (isSpanish
                      ? "Este mapa existe, pero todavía no tiene un PNG, JPG, WebP o PDF cargado. Súbelo aquí para empezar a colocar unidades y pins."
                      : "This map record exists, but it does not have a PNG, JPG, WebP, or PDF uploaded yet. Upload one here to start placing units and pins.")
                  : selectedMap.isArchived
                    ? (isSpanish
                        ? "Este mapa está archivado. Puedes restaurarlo o eliminarlo permanentemente aquí."
                        : "This map is archived. You can restore it or permanently delete it here.")
                    : (isSpanish
                        ? "Para eliminar un mapa permanentemente, archívalo primero. Los mapas archivados aparecen en el selector superior."
                        : "To permanently delete a map, archive it first. Archived maps appear in the selector above.")}
              </p>
            </div>
          ) : null}
          <div className="map-management-grid">
            <form className="inline-form" onSubmit={async (event) => {
              event.preventDefault();
              if (!propertyId || !draftName.trim()) return;
              const createdMap = await onCreateMap({ propertyId, name: draftName.trim() });
              setSelectedMapId(createdMap.id);
              setSelectedMarker(null);
              setDraftName("");
            }}>
              <input data-testid="property-maps-create-name" value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder={isSpanish ? "Nombre del nuevo mapa" : "New map name"} />
              <button data-testid="property-maps-create-submit" className="button button-primary" disabled={!draftName.trim()}>{isSpanish ? "Crear mapa" : "Create Map"}</button>
            </form>
            {selectedMap ? (
              <div className="map-file-actions">
                <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (!file) return;
                  void onUploadMap(selectedMap.id, file).then((updatedMap) => {
                    setSelectedMapId(updatedMap.id);
                  }).finally(() => {
                    event.currentTarget.value = "";
                  });
                }} />
                <button className="button button-secondary" type="button" onClick={() => void onArchiveMap(selectedMap.id, !selectedMap.isArchived)}>
                  {selectedMap.isArchived ? (isSpanish ? "Restaurar mapa" : "Restore Map") : (isSpanish ? "Archivar mapa" : "Archive Map")}
                </button>
                {selectedMap.isArchived ? (
                  <button
                    className="button button-danger"
                    data-testid="property-maps-delete-map"
                    type="button"
                    onClick={() => setShowDeleteMapConfirm(true)}
                  >
                    {isSpanish ? "Eliminar mapa" : "Delete Map"}
                  </button>
                ) : null}
                <a className="button button-secondary" href={propertyMapExportCsvUrl(selectedMap.id)} target="_blank" rel="noreferrer">{isSpanish ? "CSV" : "CSV"}</a>
                <a className="button button-secondary" href={propertyMapExportXlsUrl(selectedMap.id)} target="_blank" rel="noreferrer">{isSpanish ? "Excel" : "Excel"}</a>
                <a className="button button-secondary" href={propertyMapPrintableReportUrl(selectedMap.id)} target="_blank" rel="noreferrer">{isSpanish ? "PDF" : "PDF"}</a>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="map-grid property-map-enhanced-grid">
        <div className="operations-card map-editor-card">
          <div className="map-card-header">
            <div>
              <h3>{selectedMap?.name ?? (isSpanish ? "No hay mapa configurado" : "No map configured")}</h3>
              <p className="muted">{selectedMap ? `${selectedMap.mapType} / ${visibleUnitMarkers.length} ${isSpanish ? "marcadores de unidad" : "unit markers"} / ${visiblePins.length} ${isSpanish ? "pins personalizados" : "custom pins"} / ${visibleProjects.length} ${isSpanish ? "pins de proyecto" : "project pins"}` : (isSpanish ? "Selecciona un mapa de la propiedad para comenzar" : "Select a property map to begin")}</p>
              {visibleOverlapClusterCount ? (
                <p className="helper-copy">
                  {isSpanish
                    ? `${visibleOverlapClusterCount} agrupaciones visibles todavía contienen ${visibleOverlapMarkerCount} marcadores superpuestos.`
                    : `${visibleOverlapClusterCount} visible cluster${visibleOverlapClusterCount === 1 ? "" : "s"} still contain ${visibleOverlapMarkerCount} overlapping markers.`}
                </p>
              ) : null}
            </div>
            <div className="map-legend">
              <button type="button" className="button button-secondary" onClick={() => setZoom((current) => Math.max(0.7, Number((current - 0.1).toFixed(1))))}>-</button>
              <span>{Math.round(zoom * 100)}%</span>
              <button type="button" className="button button-secondary" onClick={() => setZoom((current) => Math.min(2, Number((current + 0.1).toFixed(1))))}>+</button>
              <button type="button" className="button button-secondary" onClick={() => setZoom(1)}>{isSpanish ? "Restablecer" : "Reset"}</button>
            </div>
          </div>
          <div className="map-layer-row">
            {[
              ["units", isSpanish ? "Unidades" : "Units"],
              ["areas", isSpanish ? "Areas" : "Areas"],
              ["pins", "Pins"],
              ["projects", isSpanish ? "Proyectos" : "Projects"],
              ["recommendations", isSpanish ? "Recomendaciones" : "Recommendations"],
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
                  <strong>{selectedMap ? (isSpanish ? "Vista previa del mapa no disponible" : "Map preview unavailable") : (isSpanish ? "Crea o selecciona un mapa" : "Create or select a map")}</strong>
                  <span>
                    {!selectedMap
                      ? (isSpanish ? "Crea un mapa y luego sube un PNG, JPG, WebP o PDF." : "Create a map, then upload a PNG, JPG, WebP, or PDF.")
                      : !selectedMap.mimeType
                        ? (isSpanish ? "Aún no hay archivo cargado para este mapa. Súbelo desde Configuración del mapa." : "No file has been uploaded for this map yet. Upload one from Map Setup.")
                        : selectedMap.mimeType === "application/pdf"
                          ? (isSpanish ? "Los mapas PDF siguen funcionando para colocar pins y exportar, pero se abren por separado en vez de mostrarse aquí." : "PDF maps still work for pin placement and export, but they open separately instead of rendering here.")
                          : (isSpanish ? "Sube un mapa PNG, JPG, WebP o PDF." : "Upload a PNG, JPG, WebP, or PDF map.")}
                  </span>
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
                  title={`${area.name}${(markerOffsets.get(`area:${area.id}`)?.overlapCount ?? 1) > 1 ? ` / ${isSpanish ? `grupo de ${markerOffsets.get(`area:${area.id}`)?.overlapCount} marcadores` : `cluster of ${markerOffsets.get(`area:${area.id}`)?.overlapCount} markers`}` : ""}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedMarker({ kind: "area", area });
                    setSelectedBuilding(area.name.toLowerCase());
                  }}
                >
                  {(markerOffsets.get(`area:${area.id}`)?.overlapCount ?? 1) > 1 && markerOffsets.get(`area:${area.id}`)?.clusterLead ? (
                    <span className="map-overlap-badge">{markerOffsets.get(`area:${area.id}`)?.overlapCount}</span>
                  ) : null}
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
                    title={`${unit.number} / ${markerLabel(colorSource, item, boardSections)}${(markerOffsets.get(`unit:${location.id}`)?.overlapCount ?? 1) > 1 ? ` / ${isSpanish ? `grupo de ${markerOffsets.get(`unit:${location.id}`)?.overlapCount} marcadores` : `cluster of ${markerOffsets.get(`unit:${location.id}`)?.overlapCount} markers`}` : ""}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedMarker({ kind: "unit", location });
                    }}
                  >
                    {(markerOffsets.get(`unit:${location.id}`)?.overlapCount ?? 1) > 1 && markerOffsets.get(`unit:${location.id}`)?.clusterLead ? (
                      <span className="map-overlap-badge">{markerOffsets.get(`unit:${location.id}`)?.overlapCount}</span>
                    ) : null}
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
                  title={`${pin.title}${(markerOffsets.get(`pin:${pin.id}`)?.overlapCount ?? 1) > 1 ? ` / ${isSpanish ? `grupo de ${markerOffsets.get(`pin:${pin.id}`)?.overlapCount} marcadores` : `cluster of ${markerOffsets.get(`pin:${pin.id}`)?.overlapCount} markers`}` : ""}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedMarker({ kind: "pin", pin });
                  }}
                >
                  {(markerOffsets.get(`pin:${pin.id}`)?.overlapCount ?? 1) > 1 && markerOffsets.get(`pin:${pin.id}`)?.clusterLead ? (
                    <span className="map-overlap-badge">{markerOffsets.get(`pin:${pin.id}`)?.overlapCount}</span>
                  ) : null}
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
                  title={`${record.title}${(markerOffsets.get(`project:${record.id}`)?.overlapCount ?? 1) > 1 ? ` / ${isSpanish ? `grupo de ${markerOffsets.get(`project:${record.id}`)?.overlapCount} marcadores` : `cluster of ${markerOffsets.get(`project:${record.id}`)?.overlapCount} markers`}` : ""}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedMarker({ kind: "project", record });
                  }}
                >
                  {(markerOffsets.get(`project:${record.id}`)?.overlapCount ?? 1) > 1 && markerOffsets.get(`project:${record.id}`)?.clusterLead ? (
                    <span className="map-overlap-badge">{markerOffsets.get(`project:${record.id}`)?.overlapCount}</span>
                  ) : null}
                  {record.title}
                </button>
              ))}
            </div>
          </div>
          {selectedMap?.mimeType === "application/pdf" ? <a className="button button-secondary" href={propertyMapFileUrl(selectedMap.id)} target="_blank" rel="noreferrer">{isSpanish ? "Abrir mapa PDF" : "Open PDF Map"}</a> : null}
        </div>

        <div className="operations-card unit-directory-card">
          <h3>{isSpanish ? "Controles del mapa" : "Map Controls"}</h3>
          <div className="pool-entry-actions" style={{ marginBottom: 10 }}>
            <span className="helper-copy">
              {nextIncompleteBuilding
                ? (isSpanish
                    ? `Siguiente área con huecos: ${nextIncompleteBuilding.label} (${nextIncompleteBuilding.unmapped} sin mapear)`
                    : `Next gap area: ${nextIncompleteBuilding.label} (${nextIncompleteBuilding.unmapped} unmapped)`)
                : (isSpanish ? "Todas las áreas/unidades visibles están mapeadas." : "All visible areas/units are mapped.")}
            </span>
            {nextIncompleteBuilding ? (
              <button
                className="button button-secondary"
                type="button"
                onClick={() => beginPlacementForArea(nextIncompleteBuilding.label)}
              >
                {isSpanish ? "Ir al siguiente hueco" : "Go To Next Gap"}
              </button>
            ) : null}
          </div>
          <div className="map-building-summary">
            <button type="button" className={!selectedBuilding ? "selected" : ""} onClick={() => setSelectedBuilding("")}>
              {isSpanish ? "Todos los edificios" : "All buildings"} <strong>{propertyUnits.length}</strong>
            </button>
            {buildingSummaries.map((summary) => (
              <button
                key={summary.key}
                type="button"
                className={`${selectedBuilding === summary.key ? "selected " : ""}${summary.unmapped > 0 ? "incomplete" : "complete"}`}
                onClick={() => setSelectedBuilding(summary.key)}
              >
                {summary.label}
                <strong>{summary.mapped}/{summary.units.length} {isSpanish ? "mapeadas" : "mapped"}</strong>
                <span>{summary.unmapped} {isSpanish ? "sin mapear" : "unmapped"}</span>
              </button>
            ))}
          </div>

          <div className="map-mode-stack">
            <label>{isSpanish ? "Modo de colocacion" : "Placement mode"}
              <select data-testid="property-maps-placement-mode" value={placementMode} onChange={(event) => setPlacementMode(event.target.value as PlacementMode)}>
                <option value="none">{isSpanish ? "Solo explorar" : "Browse only"}</option>
                <option value="unit">{isSpanish ? "Colocar unidad" : "Place unit"}</option>
                <option value="area">{isSpanish ? "Colocar edificio / area" : "Place building / area"}</option>
                <option value="pin">{isSpanish ? "Agregar pin compartido" : "Add shared pin"}</option>
                {selectedMarker?.kind === "pin" ? <option value="move-pin">{isSpanish ? "Mover pin seleccionado" : "Move selected pin"}</option> : null}
              </select>
            </label>
            <label className="compact-toggle">
              {isSpanish ? "Alcance de lista" : "List scope"}
              <select value={unitListScope} onChange={(event) => setUnitListScope(event.target.value as "all" | "unmapped" | "mapped")}>
                <option value="all">{`${isSpanish ? "Todas" : "All"} (${buildingFilteredUnits.length})`}</option>
                <option value="unmapped">{`${isSpanish ? "Solo sin mapear" : "Unmapped only"} (${buildingFilteredUnmappedUnits.length})`}</option>
                <option value="mapped">{`${isSpanish ? "Solo mapeadas" : "Mapped only"} (${buildingFilteredMappedUnits.length})`}</option>
              </select>
            </label>
          </div>
          <div className="pool-entry-actions" style={{ marginBottom: 10 }}>
            <button className="button button-secondary" type="button" onClick={() => void copyDisplayedPlacementQueue()} disabled={!displayedBuildingUnits.length}>
              {isSpanish ? "Copiar cola visible" : "Copy visible queue"}
            </button>
            <button className="button button-secondary" type="button" onClick={exportDisplayedPlacementQueueCsv} disabled={!displayedBuildingUnits.length}>
              {isSpanish ? "Exportar cola CSV" : "Export queue CSV"}
            </button>
            {queueCopyMessage ? <span className="helper-copy">{queueCopyMessage}</span> : null}
          </div>
          {canManage ? (
            <div className="stacked-form" style={{ marginBottom: 12 }}>
              <label>{isSpanish ? "Importación masiva de ubicaciones" : "Bulk placement import"}</label>
              <p className="helper-copy">
                {isSpanish
                  ? "Pega CSV, TSV o texto separado por punto y coma con columnas unit,xPercent,yPercent,building,area,floor. Los encabezados son opcionales."
                  : "Paste CSV, TSV, or semicolon-delimited text with columns unit,xPercent,yPercent,building,area,floor. Headers are optional."}
              </p>
              <textarea
                rows={5}
                value={bulkPlacementText}
                onChange={(event) => setBulkPlacementText(event.target.value)}
                placeholder={"unit,xPercent,yPercent,building,area,floor\n4804,12.5,22.1,Building 4,North Breezeway,1\n4816,18.4,24.2,Building 4,North Breezeway,1"}
              />
              <div className="pool-entry-actions">
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => setBulkPlacementText("unit,xPercent,yPercent,building,area,floor\n4804,12.5,22.1,Building 4,North Breezeway,1\n4816,18.4,24.2,Building 4,North Breezeway,1")}
                >
                  {isSpanish ? "Cargar plantilla" : "Load Template"}
                </button>
                <button className="button button-secondary" type="button" onClick={() => setBulkPlacementText("")} disabled={!bulkPlacementText.trim()}>
                  {isSpanish ? "Limpiar" : "Clear"}
                </button>
                <button className="button button-primary" type="button" onClick={() => void importBulkPlacement()} disabled={!selectedMap || !bulkPlacementPreview.rows.length || isImportingBulkPlacement}>
                  {isImportingBulkPlacement
                    ? (isSpanish ? "Importando..." : "Importing...")
                    : (isSpanish ? "Importar ubicaciones" : "Import Locations")}
                </button>
              </div>
              {bulkPlacementText.trim() ? (
                <div className="admin-message">
                  <strong>{bulkPlacementPreview.rows.length}</strong> {isSpanish ? "filas válidas listas para importar." : "valid rows ready to import."}{" "}
                  <strong>{bulkPlacementPreview.errors.length}</strong> {isSpanish ? "errores encontrados." : "errors found."}
                  {bulkPlacementPreview.rows.length ? (
                    <ul className="compact-list">
                      {bulkPlacementPreview.rows.slice(0, 5).map((row) => (
                        <li key={`${row.rowNumber}:${row.unitId}`}>
                          <strong>{row.unitNumber}</strong>: {row.xPercent.toFixed(1)}%, {row.yPercent.toFixed(1)}%
                          {row.building ? ` / ${isSpanish ? "Edificio" : "Building"} ${row.building}` : ""}
                          {row.area ? ` / ${isSpanish ? "Área" : "Area"} ${row.area}` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {bulkPlacementPreview.errors.length ? (
                    <ul className="compact-list">
                      {bulkPlacementPreview.errors.slice(0, 5).map((errorLine) => <li key={errorLine}>{errorLine}</li>)}
                    </ul>
                  ) : null}
                </div>
              ) : null}
              {bulkPlacementMessage ? <span className="helper-copy">{bulkPlacementMessage}</span> : null}
            </div>
          ) : null}
          {canManage ? (
            <div className="stacked-form" style={{ marginBottom: 12 }}>
              <label>{isSpanish ? "Importación masiva de áreas" : "Bulk area import"}</label>
              <p className="helper-copy">
                {isSpanish
                  ? "Pega CSV, TSV o texto separado por punto y coma con columnas name,areaType,xPercent,yPercent,color,expectedUnitCount,notes."
                  : "Paste CSV, TSV, or semicolon-delimited text with columns name,areaType,xPercent,yPercent,color,expectedUnitCount,notes."}
              </p>
              <textarea
                rows={4}
                value={bulkAreaText}
                onChange={(event) => setBulkAreaText(event.target.value)}
                placeholder={"name,areaType,xPercent,yPercent,color,expectedUnitCount,notes\nBuilding 4,BUILDING,12.5,22.1,#1f8fdb,24,North side building\nPool Area,AREA,61.2,44.5,#45d4ff,0,Pool gate and deck"}
              />
              <div className="pool-entry-actions">
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => setBulkAreaText("name,areaType,xPercent,yPercent,color,expectedUnitCount,notes\nBuilding 4,BUILDING,12.5,22.1,#1f8fdb,24,North side building\nPool Area,AREA,61.2,44.5,#45d4ff,0,Pool gate and deck")}
                >
                  {isSpanish ? "Cargar plantilla" : "Load Template"}
                </button>
                <button className="button button-secondary" type="button" onClick={exportVisibleAreasCsv} disabled={!visibleAreaMarkers.length}>
                  {isSpanish ? "Exportar áreas CSV" : "Export areas CSV"}
                </button>
                <button className="button button-secondary" type="button" onClick={() => setBulkAreaText("")} disabled={!bulkAreaText.trim()}>
                  {isSpanish ? "Limpiar" : "Clear"}
                </button>
                <button className="button button-primary" type="button" onClick={() => void importBulkAreas()} disabled={!selectedMap || !bulkAreaPreview.rows.length || isImportingBulkAreas}>
                  {isImportingBulkAreas ? (isSpanish ? "Importando..." : "Importing...") : (isSpanish ? "Importar áreas" : "Import Areas")}
                </button>
              </div>
              {bulkAreaText.trim() ? (
                <div className="admin-message">
                  <strong>{bulkAreaPreview.rows.length}</strong> {isSpanish ? "filas válidas listas para importar." : "valid rows ready to import."}{" "}
                  <strong>{bulkAreaPreview.errors.length}</strong> {isSpanish ? "errores encontrados." : "errors found."}
                  {bulkAreaPreview.rows.length ? (
                    <ul className="compact-list">
                      {bulkAreaPreview.rows.slice(0, 5).map((row) => (
                        <li key={`${row.rowNumber}:${row.name}`}>
                          <strong>{row.name}</strong>: {row.areaType} / {row.xPercent.toFixed(1)}%, {row.yPercent.toFixed(1)}%
                          {row.expectedUnitCount !== null ? ` / ${row.expectedUnitCount} ${isSpanish ? "esperadas" : "expected"}` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {bulkAreaPreview.errors.length ? (
                    <ul className="compact-list">
                      {bulkAreaPreview.errors.slice(0, 5).map((errorLine) => <li key={errorLine}>{errorLine}</li>)}
                    </ul>
                  ) : null}
                </div>
              ) : null}
              {bulkAreaMessage ? <span className="helper-copy">{bulkAreaMessage}</span> : null}
            </div>
          ) : null}

          {placementMode === "unit" ? (
            <div className="stacked-form">
              <label>{isSpanish ? "Unidad a colocar" : "Unit to place"}</label>
              <UnitSearchSelect
                units={unitListScope === "mapped" ? buildingFilteredMappedUnits : unitListScope === "unmapped" ? buildingFilteredUnmappedUnits : buildingFilteredUnits}
                value={selectedUnitId}
                onChange={(value) => {
                  selectPlacementUnit(value);
                }}
                placeholder={isSpanish ? "Buscar unidad..." : "Search unit..."}
              />
              <div className="pool-entry-actions">
                <span className="helper-copy">
                  {selectedBuilding
                    ? (isSpanish
                        ? `${buildingFilteredUnmappedUnits.length} sin mapear en este edificio/área`
                        : `${buildingFilteredUnmappedUnits.length} unmapped in this building/area`)
                    : (isSpanish
                        ? `${unmappedUnits.length} unidades sin mapear en esta propiedad`
                        : `${unmappedUnits.length} unmapped units in this property`)}
                </span>
                {nextUnmappedPlacementUnit ? (
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => selectPlacementUnit(nextUnmappedPlacementUnit.id)}
                  >
                    {isSpanish ? "Siguiente sin mapear" : "Next Unmapped"}
                  </button>
                ) : null}
              </div>
              <div className="three-column-form">
                <input value={locationMeta.building} onChange={(event) => setLocationMeta((current) => ({ ...current, building: event.target.value }))} placeholder={isSpanish ? "Edificio" : "Building"} />
                <input value={locationMeta.area} onChange={(event) => setLocationMeta((current) => ({ ...current, area: event.target.value }))} placeholder={isSpanish ? "Area" : "Area"} />
                <input value={locationMeta.floor} onChange={(event) => setLocationMeta((current) => ({ ...current, floor: event.target.value }))} placeholder={isSpanish ? "Piso" : "Floor"} />
              </div>
              <p className="muted">{isSpanish ? "Selecciona una unidad y luego toca el mapa para colocarla. Después de guardar, MakeReadyOS prepara automáticamente la siguiente unidad sin mapear." : "Select a unit, then click the map to place it. After each save, MakeReadyOS automatically prepares the next unmapped unit."}</p>
            </div>
          ) : null}

          {placementMode === "area" ? (
            <div className="map-area-editor">
              <div className="map-area-form">
                <input value={areaDraft.name} onChange={(event) => setAreaDraft((current) => ({ ...current, name: event.target.value }))} placeholder={isSpanish ? "Nombre del edificio o area" : "Building or area name"} />
                <select value={areaDraft.areaType} onChange={(event) => setAreaDraft((current) => ({ ...current, areaType: event.target.value }))}>
                  <option value="BUILDING">{isSpanish ? "Edificio" : "Building"}</option>
                  <option value="AREA">{isSpanish ? "Area" : "Area"}</option>
                  <option value="FLOOR">{isSpanish ? "Piso" : "Floor"}</option>
                  <option value="ZONE">{isSpanish ? "Zona" : "Zone"}</option>
                </select>
                <input type="number" min="0" value={areaDraft.expectedUnitCount} onChange={(event) => setAreaDraft((current) => ({ ...current, expectedUnitCount: event.target.value }))} placeholder={isSpanish ? "Unidades esperadas" : "Expected units"} />
                <input type="color" value={areaDraft.color} onChange={(event) => setAreaDraft((current) => ({ ...current, color: event.target.value }))} aria-label={isSpanish ? "Color del marcador de area" : "Area marker color"} />
              </div>
              <p className="muted">{isSpanish ? "Toca el mapa para colocar el marcador del edificio o area." : "Click the map to place the building or area marker."}</p>
            </div>
          ) : null}

          {placementMode === "pin" ? (
            <div className="map-pin-editor">
              <div className="map-pin-form">
                <input value={pinDraft.title} onChange={(event) => setPinDraft((current) => ({ ...current, title: event.target.value }))} placeholder={isSpanish ? "Titulo del pin" : "Pin title"} />
                <select value={pinDraft.pinType} onChange={(event) => setPinDraft((current) => ({ ...current, pinType: event.target.value }))}>
                  {pinTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
                <input value={pinDraft.building} onChange={(event) => setPinDraft((current) => ({ ...current, building: event.target.value }))} placeholder={isSpanish ? "Edificio" : "Building"} />
                <input value={pinDraft.unitLabel} onChange={(event) => setPinDraft((current) => ({ ...current, unitLabel: event.target.value }))} placeholder={isSpanish ? "Unidad" : "Unit"} />
                <input value={pinDraft.area} onChange={(event) => setPinDraft((current) => ({ ...current, area: event.target.value }))} placeholder={isSpanish ? "Area" : "Area"} />
                <textarea value={pinDraft.description} onChange={(event) => setPinDraft((current) => ({ ...current, description: event.target.value }))} placeholder={isSpanish ? "Descripcion" : "Description"} />
                <select value={pinDraft.linkedRecordType} onChange={(event) => setPinDraft((current) => ({ ...current, linkedRecordType: event.target.value, linkedRecordId: "" }))}>
                  <option value="">{isSpanish ? "Sin registro vinculado" : "No linked record"}</option>
                  <option value="PROJECT_RECORD">{isSpanish ? "Proyecto / Recomendacion" : "Project / Recommendation"}</option>
                  <option value="PEST_ISSUE">{isSpanish ? "Control de plagas" : "Pest Control"}</option>
                  <option value="LEASE_COMPLIANCE_ISSUE">{isSpanish ? "Cumplimiento de contrato" : "Lease Compliance"}</option>
                  <option value="PM_TASK">{isSpanish ? "Tarea de MP" : "PM Task"}</option>
                  <option value="WIKI_ENTRY">{isSpanish ? "Entrada wiki" : "Wiki Entry"}</option>
                </select>
                {pinDraft.linkedRecordType ? (
                  <select value={pinDraft.linkedRecordId} onChange={(event) => setPinDraft((current) => ({ ...current, linkedRecordId: event.target.value }))}>
                    <option value="">{isSpanish ? "Selecciona un registro vinculado" : "Choose linked record"}</option>
                    {pinDraft.linkedRecordType === "PROJECT_RECORD" ? linkedRecordOptions.PROJECT_RECORD.map((record) => <option key={record.id} value={record.id}>{record.title}</option>) : null}
                    {pinDraft.linkedRecordType === "PEST_ISSUE" ? linkedRecordOptions.PEST_ISSUE.map((issue) => <option key={issue.id} value={issue.id}>{issue.unit?.number ?? issue.area ?? issue.pestType} / {issue.pestType}</option>) : null}
                    {pinDraft.linkedRecordType === "LEASE_COMPLIANCE_ISSUE" ? linkedRecordOptions.LEASE_COMPLIANCE_ISSUE.map((issue: LeaseComplianceIssue) => <option key={issue.id} value={issue.id}>{issue.unit?.number ?? issue.area ?? issue.issueTypeName} / {issue.issueTypeName}</option>) : null}
                    {pinDraft.linkedRecordType === "PM_TASK" ? linkedRecordOptions.PM_TASK.map((task) => <option key={task.id} value={task.id}>{task.taskName}</option>) : null}
                    {pinDraft.linkedRecordType === "WIKI_ENTRY" ? linkedRecordOptions.WIKI_ENTRY.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>) : null}
                  </select>
                ) : null}
                <input value={pinDraft.tags} onChange={(event) => setPinDraft((current) => ({ ...current, tags: event.target.value }))} placeholder={isSpanish ? "etiqueta1, etiqueta2" : "tag1, tag2"} />
                <label className="compact-toggle">{isSpanish ? "Pin de emergencia" : "Emergency pin"}
                  <input type="checkbox" checked={pinDraft.isEmergency} onChange={(event) => setPinDraft((current) => ({ ...current, isEmergency: event.target.checked }))} />
                </label>
              </div>
              <p className="muted">{isSpanish ? "Toca el mapa para colocar el pin compartido." : "Click the map to place the shared pin."}</p>
            </div>
          ) : null}

          {search.trim() ? (
            <div className="map-search-results">
              {mergedSearchResults.length === 0 ? <p className="muted">{isSpanish ? "No hay resultados en el mapa para esta busqueda." : "No map matches for this search."}</p> : mergedSearchResults.map((result) => (
                <button key={result.id} type="button" className="map-search-result" onClick={result.onSelect}>
                  <strong>{result.title}</strong>
                  <span>{result.subtitle}</span>
                </button>
              ))}
            </div>
          ) : null}

          <div className="unit-directory-list">
            {displayedBuildingUnits.map((unit) => {
              const location = locationByUnit.get(unit.id);
              const item = itemByUnit.get(unit.id);
              return (
                <article key={unit.id} className="unit-directory-row">
                  <button type="button" onClick={() => item && onOpenItem(item.id)} disabled={!item}>
                    <strong>{displayUnitNumber(property?.code ?? "", unit.number)}</strong>
                    <small>{unit.floorPlanRecord ? floorPlanLabel(unit.floorPlanRecord) : unit.floorPlan ?? (isSpanish ? "Sin plano" : "No floor plan")} / {location ? `${location.building ? `Bldg ${location.building}` : ""} ${location.area ?? (isSpanish ? "Mapeado" : "Mapped")}` : (isSpanish ? "Sin mapear" : "Unmapped")}</small>
                  </button>
                  {location && canManage ? <button className="button button-secondary" type="button" onClick={() => void onRemoveLocation(location.id)}>{isSpanish ? "Quitar" : "Remove"}</button> : null}
                </article>
              );
            })}
            {!displayedBuildingUnits.length ? <p className="muted">{unitListScope === "unmapped" ? (isSpanish ? "No hay unidades sin mapear para este filtro." : "No unmapped units match this filter.") : unitListScope === "mapped" ? (isSpanish ? "No hay unidades mapeadas para este filtro." : "No mapped units match this filter.") : (isSpanish ? "No hay unidades que coincidan con el filtro de edificio seleccionado." : "No units match the selected building filter.")}</p> : null}
          </div>
        </div>

        <div className="operations-card map-detail-card">
          <h3>{isSpanish ? "Registro seleccionado" : "Selected Record"}</h3>
          {selectedMarkerDetails ? (
            <div className="map-detail-stack">
              <div>
                <strong>{selectedMarkerDetails.title}</strong>
                <p className="muted">{selectedMarkerDetails.type}</p>
              </div>
              <p>{selectedMarkerDetails.description || (isSpanish ? "Sin descripcion adicional." : "No additional description.")}</p>
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
                        {isSpanish ? "Crear recomendacion" : "Create Recommendation"}
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
                        {isSpanish ? "Crear solicitud de plagas" : "Create Pest Request"}
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
                        {isSpanish ? "Crear problema de contrato" : "Create Lease Issue"}
                      </button>
                    </>
                  ) : null}
                  {selectedMarker?.kind === "area" ? (
                    <>
                      <button
                        className="button button-primary"
                        type="button"
                        disabled={!selectedAreaPlacement?.nextUnit}
                        onClick={() => beginPlacementForArea(selectedMarker.area.name)}
                      >
                        {selectedAreaPlacement?.nextUnit
                          ? (isSpanish ? `Colocar siguiente unidad (${selectedAreaPlacement.nextUnit.number})` : `Place Next Unit (${selectedAreaPlacement.nextUnit.number})`)
                          : (isSpanish ? "Todas las unidades ya están mapeadas" : "All Units Already Mapped")}
                      </button>
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
                        {isSpanish ? "Crear recomendacion" : "Create Recommendation"}
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
                        {isSpanish ? "Crear solicitud de plagas" : "Create Pest Request"}
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
                        {isSpanish ? "Crear problema de contrato" : "Create Lease Issue"}
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
                        {isSpanish ? "Crear recomendacion" : "Create Recommendation"}
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
                        {isSpanish ? "Crear solicitud de plagas" : "Create Pest Request"}
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
                        {isSpanish ? "Crear problema de contrato" : "Create Lease Issue"}
                      </button>
                    </>
                  ) : null}
                  {selectedMarker?.kind === "project" ? (
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => openProjectRecord({ id: selectedMarker.record.id, propertyId })}
                    >
                      {isSpanish ? "Abrir registro del proyecto" : "Open Project Record"}
                    </button>
                  ) : null}
                </div>
              ) : null}
              {selectedMarker?.kind === "pin" && canManage ? (
                <div className="pool-entry-actions">
                  <button className="button button-secondary" type="button" onClick={() => setPlacementMode("move-pin")}>{isSpanish ? "Mover pin" : "Move Pin"}</button>
                  <button className="button button-secondary" type="button" onClick={() => void pinRemoveMutation.mutateAsync(selectedMarker.pin.id)}>{isSpanish ? "Archivar pin" : "Archive Pin"}</button>
                </div>
              ) : null}
              {selectedMarker?.kind === "pin" ? (
                <div className="pool-card" style={{ padding: 12 }}>
                  <div className="drawer-section-title">
                    <h3>{isSpanish ? "Archivos del pin" : "Pin Files"}</h3>
                    {canManage ? (
                      <label className="button button-secondary pool-upload-button">
                        {isSpanish ? "Subir foto/PDF" : "Upload Photo/PDF"}
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
                          {canManage ? <button className="link-button" type="button" onClick={() => void pinAttachmentDeleteMutation.mutateAsync(attachment.id)}>{isSpanish ? "Quitar" : "Remove"}</button> : null}
                        </span>
                      ))}
                    </div>
                  ) : <p className="muted">{isSpanish ? "Todavia no hay archivos adjuntos en este pin." : "No files attached to this pin yet."}</p>}
                </div>
              ) : null}
              {selectedMarker?.kind === "area" && canManage ? (
                <div className="pool-entry-actions">
                  <button className="button button-secondary" type="button" onClick={() => void onRemoveArea(selectedMarker.area.id)}>{isSpanish ? "Archivar área" : "Archive Area"}</button>
                </div>
              ) : null}
            </div>
          ) : <p className="muted">{isSpanish ? "Selecciona una unidad, area, pin compartido o marcador de proyecto para revisarlo." : "Select a unit, area, shared pin, or project marker to inspect it."}</p>}

          <div className="map-summary-grid">
            <article>
              <strong>{customPins.length}</strong>
              <span>{isSpanish ? "Pins compartidos" : "Shared pins"}</span>
            </article>
            <article>
              <strong>{projectRecords.length}</strong>
              <span>{isSpanish ? "Pins de proyecto" : "Project pins"}</span>
            </article>
            <article>
              <strong>{mapLocations.length}</strong>
              <span>{isSpanish ? "Unidades mapeadas" : "Mapped units"}</span>
            </article>
            <article>
              <strong>{unmappedUnits.length}</strong>
              <span>{isSpanish ? "Unidades sin mapear" : "Unmapped units"}</span>
            </article>
          </div>
          {archivedCustomPins.length || archivedMapAreas.length || archivedMapLocations.length ? (
            <div className="pool-archived-list" style={{ marginTop: 16 }}>
              <h3>{isSpanish ? "Archivados en este mapa" : "Archived On This Map"}</h3>
              {archivedCustomPins.length ? (
                <div className="pool-card" style={{ padding: 12 }}>
                  <strong>{isSpanish ? "Pins archivados" : "Archived Pins"}</strong>
                  <div className="pool-attachment-list">
                    {archivedCustomPins.map((pin) => (
                      <span key={`archived-pin-${pin.id}`} style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <strong>{pin.title}</strong>
                        <span className="muted">{pin.pinType}{pin.building ? ` / ${pin.building}` : ""}</span>
                        {canManage ? <button className="button button-secondary" type="button" onClick={() => void pinRestoreMutation.mutateAsync(pin.id)}>{isSpanish ? "Restaurar" : "Restore"}</button> : null}
                        {canManage ? <button className="button button-danger" type="button" onClick={() => setDeleteArchivedTarget({ kind: "pin", id: pin.id, name: pin.title })}>{isSpanish ? "Eliminar" : "Delete"}</button> : null}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {archivedMapAreas.length ? (
                <div className="pool-card" style={{ padding: 12 }}>
                  <strong>{isSpanish ? "Áreas archivadas" : "Archived Areas"}</strong>
                  <div className="pool-attachment-list">
                    {archivedMapAreas.map((area) => (
                      <span key={`archived-area-${area.id}`} style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <strong>{area.name}</strong>
                        <span className="muted">{area.areaType}</span>
                        {canManage ? <button className="button button-secondary" type="button" onClick={() => void onRestoreArea(area.id)}>{isSpanish ? "Restaurar" : "Restore"}</button> : null}
                        {canManage ? <button className="button button-danger" type="button" onClick={() => setDeleteArchivedTarget({ kind: "area", id: area.id, name: area.name })}>{isSpanish ? "Eliminar" : "Delete"}</button> : null}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {archivedMapLocations.length ? (
                <div className="pool-card" style={{ padding: 12 }}>
                  <strong>{isSpanish ? "Ubicaciones archivadas" : "Archived Unit Placements"}</strong>
                  <div className="pool-attachment-list">
                    {archivedMapLocations.map((location) => (
                      <span key={`archived-location-${location.id}`} style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <strong>{displayUnitNumber(location.unit.property.code, location.unit.number)}</strong>
                        <span className="muted">{[location.building, location.area, location.floor].filter(Boolean).join(" / ") || (isSpanish ? "Sin detalle" : "No detail")}</span>
                        {canManage ? <button className="button button-secondary" type="button" onClick={() => void onRestoreLocation(location.id)}>{isSpanish ? "Restaurar" : "Restore"}</button> : null}
                        {canManage ? <button className="button button-danger" type="button" onClick={() => setDeleteArchivedTarget({ kind: "location", id: location.id, name: displayUnitNumber(location.unit.property.code, location.unit.number) })}>{isSpanish ? "Eliminar" : "Delete"}</button> : null}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <ConfirmDialog
        open={showDeleteMapConfirm && Boolean(selectedMap?.isArchived)}
        title={isSpanish ? "Eliminar mapa de propiedad" : "Delete property map"}
        description={
          isSpanish
            ? `Eliminar ${selectedMap?.name ?? "este mapa"} permanentemente? Esto borra el archivo del mapa, los marcadores de unidad, las areas y los pins compartidos de este mapa. Los proyectos y problemas de cumplimiento conservaran su registro, pero sin mapa vinculado.`
            : `Delete ${selectedMap?.name ?? "this map"} permanently? This removes the map file, unit markers, areas, and shared pins for this map. Projects and lease-compliance issues stay intact, but without a linked map.`
        }
        confirmLabel={isSpanish ? "Eliminar mapa" : "Delete map"}
        language={language}
        tone="danger"
        onClose={() => setShowDeleteMapConfirm(false)}
        onConfirm={async () => {
          if (!selectedMap?.isArchived) return;
          await onDeleteMap(selectedMap.id);
          setShowDeleteMapConfirm(false);
          setSelectedMapId("");
          setSelectedMarker(null);
        }}
      />
      <ConfirmDialog
        open={Boolean(deleteArchivedTarget)}
        title={isSpanish ? "Eliminar elemento archivado del mapa" : "Delete archived map item"}
        description={isSpanish
          ? `Eliminar permanentemente ${deleteArchivedTarget?.name ?? "este elemento"}? Esta acción no se puede deshacer.`
          : `Permanently delete ${deleteArchivedTarget?.name ?? "this item"}? This action cannot be undone.`}
        confirmLabel={isSpanish ? "Eliminar" : "Delete"}
        language={language}
        tone="danger"
        onClose={() => setDeleteArchivedTarget(null)}
        onConfirm={async () => {
          if (!deleteArchivedTarget) return;
          if (deleteArchivedTarget.kind === "pin") {
            await pinDeleteMutation.mutateAsync(deleteArchivedTarget.id);
          } else if (deleteArchivedTarget.kind === "area") {
            await onDeleteArea(deleteArchivedTarget.id);
          } else {
            await onDeleteLocation(deleteArchivedTarget.id);
          }
          setDeleteArchivedTarget(null);
        }}
      />
    </section>
  );
}
