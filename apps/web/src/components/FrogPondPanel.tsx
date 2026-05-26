import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type { BoardSection, LabelDefinition, MakeReadyItem, Property } from "../lib/api";
import { boardGroupLabel, displayUnitNumber } from "../lib/board";
import { StatusState } from "./StatusState";

type MetricSource = "active" | "risk" | "techWorkload" | "vacant" | "moveInsWeek";
type GroupSource = "property" | "boardSection" | "riskLevel" | "assignedTech";
type ColorSource = "riskLevel" | "vacancyStatus" | "makeReadyStatus" | "property";
type PondTheme = string;
type DensityMode = "comfortable" | "dense";

export type FrogPondConfig = {
  metricSource: MetricSource;
  groupBy: GroupSource;
  colorBy: ColorSource;
  poseBy: "riskLevel" | "vacancyStatus" | "makeReadyStatus";
  maxFrogs: number;
  animated: boolean;
  density: DensityMode;
  propertyId: string;
  theme: PondTheme;
};

type Props = {
  items: MakeReadyItem[];
  properties: Property[];
  boardSections: BoardSection[];
  labelsByField: Record<string, Record<string, LabelDefinition>>;
  selectedPropertyId: string;
  loading: boolean;
  error: boolean;
  onOpenItem: (id: string) => void;
  onPropertyChange: (id: string) => void;
  onGroupDrillDown: (filter: { type: GroupSource; value: string }) => void;
};

const storageKey = "makereadyos.frogPond.config";
const presetsKey = "makereadyos.frogPond.presets";
const positionsKey = "makereadyos.frogPond.positions";
const pondMinY = 34;
const pondMaxY = 92;
const pondMinX = 4;
const pondMaxX = 96;

const defaultConfig: FrogPondConfig = {
  metricSource: "active",
  groupBy: "property",
  colorBy: "riskLevel",
  poseBy: "riskLevel",
  maxFrogs: 36,
  animated: true,
  density: "comfortable",
  propertyId: "",
  theme: "pond-05",
};

const pondThemes = [
  { key: "pond-03", label: "Pond 3", url: "/frogs/ponds/pond-03.png" },
  { key: "pond-04", label: "Pond 4", url: "/frogs/ponds/pond-04.png" },
  { key: "pond-05", label: "Pond 5", url: "/frogs/ponds/pond-05.png" },
  { key: "pond-06", label: "Pond 6", url: "/frogs/ponds/pond-06.png" },
  { key: "pond-07", label: "Pond 7", url: "/frogs/ponds/pond-07.png" },
  { key: "pond-08", label: "Pond 8", url: "/frogs/ponds/pond-08.png" },
  { key: "pond-09", label: "Pond 9", url: "/frogs/ponds/pond-09.png" },
  { key: "pond-10", label: "Pond 10", url: "/frogs/ponds/pond-10.png" },
  { key: "pond-11", label: "Pond 11", url: "/frogs/ponds/pond-11.png" },
  { key: "pond-12", label: "Pond 12", url: "/frogs/ponds/pond-12.png" },
  { key: "pond-13", label: "Pond 13", url: "/frogs/ponds/pond-13.png" },
  { key: "pond-14", label: "Pond 14", url: "/frogs/ponds/pond-14.png" },
  { key: "pond-15", label: "Pond 15", url: "/frogs/ponds/pond-15.png" },
];

type SpriteSheet = { url: string; width: number; height: number; achievement?: string };

const frogSheets: Record<string, SpriteSheet> = {
  green: { url: "/frogs/sprites/frog-green.png", width: 512, height: 512 },
  blue: { url: "/frogs/sprites/frog-blue.png", width: 512, height: 512 },
  purple: { url: "/frogs/sprites/frog-purple.png", width: 512, height: 512 },
  brown: { url: "/frogs/sprites/frog-brown.png", width: 512, height: 512 },
  tan: { url: "/frogs/sprites/frog-tan.png", width: 256, height: 128 },
  tophat: { url: "/frogs/sprites/frog-tophat.png", width: 256, height: 128, achievement: "Ready-stock goal" },
  cowboy: { url: "/frogs/sprites/frog-cowboy.png", width: 256, height: 128, achievement: "Fast-turn streak" },
  pirate: { url: "/frogs/sprites/frog-pirate.png", width: 256, height: 128, achievement: "Recovered unit" },
  viking: { url: "/frogs/sprites/frog-viking.png", width: 256, height: 128, achievement: "Major scope cleared" },
  clown: { url: "/frogs/sprites/frog-clown.png", width: 256, height: 128, achievement: "Team fun unlock" },
  funnyglasses: { url: "/frogs/sprites/frog-funnyglasses.png", width: 256, height: 128, achievement: "Inspection streak" },
};

const tadpoleSprites = ["/frogs/tadpoles/tadpole-1.png", "/frogs/tadpoles/tadpole-2.png", "/frogs/tadpoles/tadpole-3.png", "/frogs/tadpoles/tadpole-4.png", "/frogs/tadpoles/tadpole-5.png", "/frogs/tadpoles/tadpole-6.png"];

type PondPosition = { x: number; y: number };
type DragState = { id: string; pointerId: number; moved: boolean };
type FrogFrame = { col: number; row: number };
type FrogRun = { row: number; startCol: number; frames: number };
type Fly = { id: number; startTick: number; top: number; duration: number; delay: number; reverse: boolean; loopSize: number; loopSpeed: number; drift: number };
type FrogRender = {
  item: MakeReadyItem;
  index: number;
  group: string;
  colorLabel: string;
  color: string;
  pose: string;
  sheet: SpriteSheet;
  frame: FrogFrame;
  tadpoleUrl: string;
  x: number;
  y: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function stableNumber(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function isThisWeek(value: string | null) {
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return date >= start && date < end;
}

function itemMatchesMetric(item: MakeReadyItem, metric: MetricSource) {
  if (metric === "risk") return item.riskLevel === "HIGH" || item.riskLevel === "CRITICAL";
  if (metric === "techWorkload") return Boolean(item.assignedTech?.trim());
  if (metric === "vacant") return item.vacancyStatus?.startsWith("VACANT") || item.vacancyStatus?.startsWith("NTV");
  if (metric === "moveInsWeek") return isThisWeek(item.moveInDate);
  return !item.isArchived;
}

function groupValue(item: MakeReadyItem, groupBy: GroupSource, sections: BoardSection[]) {
  if (groupBy === "property") return item.property.code;
  if (groupBy === "boardSection") return boardGroupLabel(item.boardGroup, item.propertyId, sections);
  if (groupBy === "riskLevel") return item.riskLevel && item.riskLevel !== "NONE" ? item.riskLevel : "No active risk";
  return item.assignedTech?.trim() || "Unassigned";
}

function colorValue(item: MakeReadyItem, colorBy: ColorSource) {
  if (colorBy === "property") return item.property.code;
  if (colorBy === "riskLevel") return item.riskLevel || "NONE";
  return String(item[colorBy] ?? "Unset");
}

function colorForValue(value: string, source: ColorSource, labelsByField: Props["labelsByField"], index: number) {
  if (source === "riskLevel") {
    const riskColors: Record<string, string> = {
      CRITICAL: "#ef476f",
      HIGH: "#f97316",
      MEDIUM: "#fbbf24",
      LOW: "#38bdf8",
      NONE: "#43d18f",
      "No active risk": "#43d18f",
    };
    return riskColors[value] ?? "#43d18f";
  }
  if (source === "property") {
    const palette = ["#43d18f", "#38bdf8", "#fbbf24", "#a78bfa", "#fb7185", "#2dd4bf"];
    return palette[index % palette.length];
  }
  return labelsByField[source]?.[value]?.color ?? "#43d18f";
}

function poseForItem(item: MakeReadyItem, poseBy: FrogPondConfig["poseBy"]) {
  const value = poseBy === "riskLevel" ? item.riskLevel : String(item[poseBy] ?? "");
  if (item.riskLevel === "CRITICAL" || value.includes("BUG") || value.includes("ROACH")) return "worried";
  if (item.riskLevel === "HIGH" || item.overdue) return "alert";
  if (item.makeReadyStatus === "DONE" || item.completionStatus === "YES") return "sleeping";
  if (item.vacancyStatus?.startsWith("NTV")) return "tadpole";
  return "working";
}

function sheetForItem(item: MakeReadyItem) {
  if (item.riskLevel === "CRITICAL") return frogSheets.purple;
  if (item.riskLevel === "HIGH") return frogSheets.brown;
  if (item.makeReadyStatus === "DONE" || item.completionStatus === "YES") return frogSheets.blue;
  if (item.scopeLevel === "MAJOR") return frogSheets.tan;
  return frogSheets.green;
}

function validRunsForSheet(sheet: SpriteSheet, pose: string): FrogRun[] {
  const columns = Math.max(1, Math.floor(sheet.width / 32));
  const rows = Math.max(1, Math.floor(sheet.height / 32));
  if (columns >= 16 && rows >= 16) {
    const topRows = Array.from({ length: 8 }, (_, row) => row);
    const lowerRows = Array.from({ length: 8 }, (_, row) => row + 8);
    if (pose === "worried") return lowerRows.map((row) => ({ row, startCol: 0, frames: 4 }));
    if (pose === "alert") {
      return [
        ...topRows.flatMap((row) => [8, 12].map((startCol) => ({ row, startCol, frames: 4 }))),
        ...lowerRows.map((row) => ({ row, startCol: 0, frames: 4 })),
      ];
    }
    if (pose === "sleeping") return topRows.map((row) => ({ row, startCol: 0, frames: 4 }));
    return topRows.flatMap((row) => [0, 4, 8, 12].map((startCol) => ({ row, startCol, frames: 4 })));
  }

  // Smaller achievement/accessory sheets have transparent right-side tiles.
  const compactRuns: FrogRun[] = [
    { row: 0, startCol: 0, frames: 4 },
    { row: 1, startCol: 0, frames: 4 },
    { row: 2, startCol: 0, frames: 4 },
    { row: 3, startCol: 1, frames: 4 },
  ].filter((run) => run.row < rows && run.startCol + run.frames <= columns);
  return compactRuns.length ? compactRuns : [{ row: 0, startCol: 0, frames: Math.min(4, columns) }];
}

function spriteFrameForItem(item: MakeReadyItem, pose: string, index: number, tick: number, sheet: SpriteSheet): FrogFrame {
  const seed = stableNumber(`${item.id}:${item.unitNumber}:${index}`);
  const runs = validRunsForSheet(sheet, pose);
  const run = runs[(seed + Math.floor(tick / 18)) % runs.length] ?? runs[0];
  const frameInRun = (Math.floor(tick / (pose === "sleeping" ? 2 : 1)) + index) % run.frames;
  return { col: run.startCol + frameInRun, row: run.row };
}

function frogPosition(index: number, groupIndex: number, totalGroups: number, density: DensityMode) {
  const columns = density === "dense" ? 9 : 7;
  const row = Math.floor(index / columns);
  const column = index % columns;
  const bandTop = 38 + ((groupIndex % Math.max(totalGroups, 1)) * (34 / Math.max(totalGroups, 1)));
  return {
    x: clamp(10 + column * (80 / columns) + ((row % 2) * 3), pondMinX, pondMaxX),
    y: clamp(bandTop + row * (density === "dense" ? 6 : 8), pondMinY, pondMaxY),
  };
}

function motionOffset(index: number, pose: string, tick: number, enabled: boolean) {
  if (!enabled) return { x: 0, y: 0 };
  const seed = index * 7;
  if (pose === "tadpole") {
    const phase = (tick + seed) / 4;
    return {
      x: Math.sin(phase) * 1.8,
      y: Math.sin(phase * 2) * .18,
    };
  }
  const cycle = (tick + seed) % 34;
  if (cycle < 7 && pose !== "sleeping") {
    const progress = cycle / 6;
    const direction = index % 2 === 0 ? 1 : -1;
    return {
      x: direction * progress * 1.1,
      y: -Math.sin(progress * Math.PI) * 1.9,
    };
  }
  return {
    x: 0,
    y: Math.sin((tick + seed) / 6) * .18,
  };
}

function flyPosition(fly: Fly, tick: number) {
  const tickDelta = tick >= fly.startTick ? tick - fly.startTick : tick + 10000 - fly.startTick;
  const elapsed = Math.max(0, (tickDelta * .22) - fly.delay);
  const progress = clamp(elapsed / fly.duration, 0, 1);
  const loopPhase = progress * Math.PI * 2 * fly.loopSpeed + fly.id;
  const travel = fly.reverse ? 108 - progress * 116 : -8 + progress * 116;
  const edgeFade = Math.sin(progress * Math.PI);
  const loopX = Math.cos(loopPhase) * fly.loopSize * edgeFade;
  const loopY = Math.sin(loopPhase) * fly.loopSize * .72 * edgeFade;
  const driftY = Math.sin(progress * Math.PI * 3 + fly.id * .7) * fly.drift * edgeFade;
  return {
    x: travel + loopX,
    y: clamp(fly.top + loopY + driftY, 4, 92),
  };
}

function flyCollidesWithFrog(fly: Fly, frog: FrogRender, tick: number, sceneRect: DOMRect | undefined) {
  const flyPoint = flyPosition(fly, tick);
  if (!sceneRect) {
    return Math.abs(frog.x - flyPoint.x) < .8 && Math.abs(frog.y - flyPoint.y) < 1.4;
  }
  const flyCenterX = flyPoint.x + (16 / sceneRect.width) * 100;
  const flyCenterY = flyPoint.y + (16 / sceneRect.height) * 100;
  const frogSpriteCenterY = frog.y - (12 / sceneRect.height) * 100;
  const hitboxX = (14 / sceneRect.width) * 100;
  const hitboxY = (13 / sceneRect.height) * 100;
  return Math.abs(frog.x - flyCenterX) <= hitboxX && Math.abs(frogSpriteCenterY - flyCenterY) <= hitboxY;
}

function loadConfig(): FrogPondConfig {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) ?? "null") as Partial<FrogPondConfig> | null;
    return { ...defaultConfig, ...(parsed ?? {}) };
  } catch {
    return defaultConfig;
  }
}

function loadPresets(): Array<{ name: string; config: FrogPondConfig }> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(presetsKey) ?? "[]") as Array<{ name: string; config: FrogPondConfig }>;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadPositions(): Record<string, PondPosition> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(positionsKey) ?? "{}") as Record<string, PondPosition>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function FrogPondPanel({ items, properties, boardSections, labelsByField, selectedPropertyId, loading, error, onOpenItem, onPropertyChange, onGroupDrillDown }: Props) {
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  const evadeTimersRef = useRef<Record<string, number>>({});
  const frameTickRef = useRef(0);
  const [config, setConfig] = useState<FrogPondConfig>(() => {
    return { ...loadConfig(), propertyId: selectedPropertyId };
  });
  const [presets, setPresets] = useState(loadPresets);
  const [presetName, setPresetName] = useState("");
  const [positions, setPositions] = useState<Record<string, PondPosition>>(loadPositions);
  const [evaded, setEvaded] = useState<Record<string, PondPosition>>({});
  const [frameTick, setFrameTick] = useState(0);
  const [flies, setFlies] = useState<Fly[]>([]);

  const motionEnabled = config.animated;

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    window.localStorage.setItem(positionsKey, JSON.stringify(positions));
  }, [positions]);

  useEffect(() => {
    if (!motionEnabled) return undefined;
    const timer = window.setInterval(() => setFrameTick((current) => {
      const next = (current + 1) % 10000;
      frameTickRef.current = next;
      return next;
    }), 220);
    return () => window.clearInterval(timer);
  }, [motionEnabled]);

  useEffect(() => {
    if (!motionEnabled) {
      setFlies([]);
      return undefined;
    }
    let nextFlyId = 1;
    const spawnFly = () => {
      const id = nextFlyId;
      nextFlyId += 1;
      const fly: Fly = {
        id,
        startTick: frameTickRef.current,
        top: 6 + Math.random() * 84,
        duration: 9 + Math.random() * 6,
        delay: Math.random() * .35,
        reverse: Math.random() > .5,
        loopSize: 2 + Math.random() * 5,
        loopSpeed: 2 + Math.random() * 3,
        drift: 2 + Math.random() * 7,
      };
      setFlies((current) => [...current.slice(-11), fly]);
      window.setTimeout(() => {
        setFlies((current) => current.filter((entry) => entry.id !== id));
      }, (fly.duration + fly.delay + 1) * 1000);
    };
    const initialTimers = [700, 1600, 2800].map((delay) => window.setTimeout(spawnFly, delay));
    const timer = window.setInterval(spawnFly, 2100);
    return () => {
      initialTimers.forEach((initial) => window.clearTimeout(initial));
      window.clearInterval(timer);
    };
  }, [motionEnabled]);

  useEffect(() => () => {
    Object.values(evadeTimersRef.current).forEach((timer) => window.clearTimeout(timer));
    evadeTimersRef.current = {};
  }, []);

  useEffect(() => {
    setConfig((current) => current.propertyId === selectedPropertyId ? current : { ...current, propertyId: selectedPropertyId });
  }, [selectedPropertyId]);

  const scopedItems = useMemo(() => items
    .filter((item) => (config.propertyId ? item.propertyId === config.propertyId : true))
    .filter((item) => itemMatchesMetric(item, config.metricSource)), [config.metricSource, config.propertyId, items]);

  const grouped = useMemo(() => scopedItems.reduce<Record<string, MakeReadyItem[]>>((acc, item) => {
    const key = groupValue(item, config.groupBy, boardSections);
    acc[key] ??= [];
    acc[key].push(item);
    return acc;
  }, {}), [boardSections, config.groupBy, scopedItems]);

  const visibleItems = scopedItems.slice(0, Math.max(1, config.maxFrogs));
  const hiddenCount = Math.max(0, scopedItems.length - visibleItems.length);
  const groups = Object.keys(grouped).sort();
  const legendValues = Array.from(new Set(visibleItems.map((item) => colorValue(item, config.colorBy))));
  const activePond = pondThemes.find((theme) => theme.key === config.theme) ?? pondThemes[0];
  const renderedFrogs = useMemo<FrogRender[]>(() => visibleItems.map((item, index) => {
    const group = groupValue(item, config.groupBy, boardSections);
    const groupIndex = Math.max(0, groups.indexOf(group));
    const colorLabel = colorValue(item, config.colorBy);
    const color = colorForValue(colorLabel, config.colorBy, labelsByField, legendValues.indexOf(colorLabel));
    const pose = poseForItem(item, config.poseBy);
    const sheet = sheetForItem(item);
    const frame = spriteFrameForItem(item, pose, index, frameTick, sheet);
    const tadpoleUrl = tadpoleSprites[(frameTick + index) % tadpoleSprites.length];
    const basePosition = positions[item.id] ?? frogPosition(index, groupIndex, groups.length, config.density);
    const wander = motionOffset(index, pose, frameTick, motionEnabled && !positions[item.id]);
    const evade = evaded[item.id] ?? { x: 0, y: 0 };
    return {
      item,
      index,
      group,
      colorLabel,
      color,
      pose,
      sheet,
      frame,
      tadpoleUrl,
      x: clamp(basePosition.x + wander.x + evade.x, pondMinX, pondMaxX),
      y: clamp(basePosition.y + wander.y + evade.y, pondMinY, pondMaxY),
    };
  }), [boardSections, config.colorBy, config.density, config.groupBy, config.poseBy, evaded, frameTick, groups, labelsByField, legendValues, motionEnabled, positions, visibleItems]);

  useEffect(() => {
    if (!motionEnabled || flies.length === 0 || renderedFrogs.length === 0) return;
    const sceneRect = sceneRef.current?.getBoundingClientRect();
    setFlies((current) => current.filter((fly) => {
      return !renderedFrogs.some((frog) => flyCollidesWithFrog(fly, frog, frameTick, sceneRect));
    }));
  }, [flies.length, frameTick, motionEnabled, renderedFrogs]);

  const updateConfig = (next: Partial<FrogPondConfig>) => {
    setConfig((current) => ({ ...current, ...next }));
    if (next.propertyId !== undefined) onPropertyChange(next.propertyId);
  };

  const savePreset = () => {
    if (!presetName.trim()) return;
    const next = [...presets.filter((preset) => preset.name !== presetName.trim()), { name: presetName.trim(), config }];
    setPresets(next);
    window.localStorage.setItem(presetsKey, JSON.stringify(next));
    setPresetName("");
  };

  const resetPositions = () => {
    setPositions({});
    setEvaded({});
    window.localStorage.removeItem(positionsKey);
  };

  const positionFromPointer = (event: ReactPointerEvent) => {
    const rect = sceneRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * 100, pondMinX, pondMaxX),
      y: clamp(((event.clientY - rect.top) / rect.height) * 100, pondMinY, pondMaxY),
    };
  };

  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    dragRef.current = { id, pointerId: event.pointerId, moved: false };
    suppressClickRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const next = positionFromPointer(event);
    if (!next) return;
    drag.moved = true;
    suppressClickRef.current = true;
    setPositions((current) => ({ ...current, [drag.id]: next }));
  };

  const endDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    try {
      event.currentTarget.releasePointerCapture(drag.pointerId);
    } catch {
      // Pointer capture can already be released by the browser.
    }
    window.setTimeout(() => {
      if (dragRef.current?.id === drag.id) dragRef.current = null;
    }, 0);
  };

  const evadeOnce = (event: ReactPointerEvent<HTMLButtonElement>, id: string, index: number, pose: string, current: PondPosition) => {
    if (!motionEnabled || evaded[id]) return;
    const pointer = positionFromPointer(event);
    const fallbackDirection = index % 2 === 0 ? 1 : -1;
    const awayX = pointer ? current.x - pointer.x : fallbackDirection;
    const awayY = pointer ? current.y - pointer.y : 1;
    const length = Math.max(.01, Math.hypot(awayX, awayY));
    const horizontal = awayX / length || fallbackDirection;
    const vertical = awayY / length || .2;
    const distance = pose === "tadpole" ? 5.2 : 4.2;
    setEvaded((current) => ({
      ...current,
      [id]: {
        x: horizontal * distance,
        y: pose === "tadpole" ? vertical * 2.2 : -2.6 - (index % 2),
      },
    }));
    if (evadeTimersRef.current[id]) window.clearTimeout(evadeTimersRef.current[id]);
    evadeTimersRef.current[id] = window.setTimeout(() => {
      setEvaded((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      delete evadeTimersRef.current[id];
    }, 5000);
  };

  if (loading) return <StatusState title="Loading Frog Pond" description="Gathering board data for the pond visualization." />;
  if (error) return <StatusState title="Frog Pond unavailable" description="Refresh the board data and try again." tone="error" />;

  return (
    <section className={`frog-pond-shell frog-theme-${config.theme} frog-density-${config.density}${motionEnabled ? " frog-animated" : ""}`} data-testid="frog-pond-panel">
      <header className="panel-heading">
        <div>
          <h2>Frog Pond</h2>
          <p>Whimsical operations view: frogs represent real make-ready records. Use the table for precision edits.</p>
        </div>
        <div className="frog-summary" data-testid="frog-summary">
          <strong>{scopedItems.length}</strong><span>{config.metricSource.replace(/([A-Z])/g, " $1")} frogs</span>
          <strong>{groups.length}</strong><span>groups</span>
          <strong>{hiddenCount}</strong><span>clustered</span>
        </div>
      </header>

      <div className="frog-config" data-testid="frog-config">
        <label>Frogs represent
          <select data-testid="frog-metric-source" value={config.metricSource} onChange={(event) => updateConfig({ metricSource: event.target.value as MetricSource })}>
            <option value="active">Active make-readies</option>
            <option value="risk">High/Critical risk items</option>
            <option value="techWorkload">Assigned tech workload</option>
            <option value="vacant">Vacant / NTV units</option>
            <option value="moveInsWeek">Move-ins this week</option>
          </select>
        </label>
        <label>Group by
          <select data-testid="frog-group-by" value={config.groupBy} onChange={(event) => updateConfig({ groupBy: event.target.value as GroupSource })}>
            <option value="property">Property</option>
            <option value="boardSection">Board section</option>
            <option value="riskLevel">Risk level</option>
            <option value="assignedTech">Assigned tech</option>
          </select>
        </label>
        <label>Color by
          <select data-testid="frog-color-by" value={config.colorBy} onChange={(event) => updateConfig({ colorBy: event.target.value as ColorSource })}>
            <option value="riskLevel">Risk level</option>
            <option value="vacancyStatus">Vacancy status</option>
            <option value="makeReadyStatus">Make-ready status</option>
            <option value="property">Property</option>
          </select>
        </label>
        <label>Property
          <select data-testid="frog-property-filter" value={config.propertyId} onChange={(event) => updateConfig({ propertyId: event.target.value })}>
            <option value="">All accessible properties</option>
            {properties.map((property) => <option key={property.id} value={property.id}>{property.code} · {property.name}</option>)}
          </select>
        </label>
        <label>Max frogs
          <input data-testid="frog-max-visible" type="number" min="6" max="120" value={config.maxFrogs} onChange={(event) => updateConfig({ maxFrogs: Number(event.target.value) || 36 })} />
        </label>
        <label>Theme
          <select data-testid="frog-theme" value={config.theme} onChange={(event) => updateConfig({ theme: event.target.value as PondTheme })}>
            {pondThemes.map((theme) => <option key={theme.key} value={theme.key}>{theme.label}</option>)}
          </select>
        </label>
        <label>Density
          <select data-testid="frog-density" value={config.density} onChange={(event) => updateConfig({ density: event.target.value as DensityMode })}>
            <option value="comfortable">Comfortable</option>
            <option value="dense">Dense</option>
          </select>
        </label>
        <label className="toggle-row"><input data-testid="frog-animation-toggle" type="checkbox" checked={config.animated} onChange={(event) => updateConfig({ animated: event.target.checked })} /> Animation</label>
        <button type="button" className="button button-secondary frog-reset-positions" data-testid="frog-reset-positions" onClick={resetPositions}>Reset frog positions</button>
        <div className="frog-presets">
          <select data-testid="frog-preset-select" value="" onChange={(event) => {
            const preset = presets.find((entry) => entry.name === event.target.value);
            if (preset) updateConfig(preset.config);
          }}>
            <option value="">Load preset</option>
            {presets.map((preset) => <option key={preset.name} value={preset.name}>{preset.name}</option>)}
          </select>
          <input data-testid="frog-preset-name" value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder="Preset name" />
          <button data-testid="frog-save-preset" type="button" className="button button-secondary" onClick={savePreset} disabled={!presetName.trim()}>Save</button>
        </div>
      </div>

      {scopedItems.length === 0 ? (
        <div className="frog-empty" data-testid="frog-empty-state">
          <strong>No frogs in this pond.</strong>
          <span>Try a broader property filter or switch the metric source.</span>
        </div>
      ) : (
        <div ref={sceneRef} className="frog-pond-scene" data-testid="frog-pond-scene" aria-label="Frog Pond operational visualization" style={{ "--pond-image": `url("${activePond.url}")` } as CSSProperties}>
          {renderedFrogs.map(({ item, index, group, colorLabel, color, pose, sheet, frame, tadpoleUrl, x, y }) => {
            return (
              <button
                type="button"
                className={`frog-marker frog-pose-${pose}`}
                key={item.id}
                data-testid={`frog-marker-${item.unitNumber.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  "--frog-color": color,
                  "--frog-sprite": `url("${sheet.url}")`,
                  "--frog-tadpole": `url("${tadpoleUrl}")`,
                  "--sprite-width": `${sheet.width}px`,
                  "--sprite-height": `${sheet.height}px`,
                  "--sprite-col": frame.col,
                  "--sprite-row": frame.row,
                  "--frog-index": index,
                  zIndex: 300 - index,
                } as CSSProperties}
                onClick={() => {
                  if (suppressClickRef.current || dragRef.current?.moved) {
                    suppressClickRef.current = false;
                    return;
                  }
                  onOpenItem(item.id);
                }}
                onPointerDown={(event) => startDrag(event, item.id)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onPointerEnter={(event) => evadeOnce(event, item.id, index, pose, { x, y })}
                title={`${displayUnitNumber(item.property.code, item.unitNumber)} / ${group} / ${colorLabel}`}
              >
                <span className="frog-body" aria-hidden="true"><i /><b /></span>
                <strong>{displayUnitNumber(item.property.code, item.unitNumber)}</strong>
                <em>{pose.replace("-", " ")}</em>
              </button>
            );
          })}
          {flies.map((fly) => (
            <span
              key={fly.id}
              className={`pond-fly${fly.reverse ? " pond-fly-reverse" : ""}`}
              aria-hidden="true"
              style={{
                left: `${flyPosition(fly, frameTick).x}%`,
                top: `${flyPosition(fly, frameTick).y}%`,
              } as CSSProperties}
            />
          ))}
          {hiddenCount > 0 ? <div className="frog-cluster" data-testid="frog-cluster">+{hiddenCount} more frogs clustered by current limit</div> : null}
        </div>
      )}

      <div className="frog-group-summary" data-testid="frog-group-summary">
        <strong>Groups: {config.groupBy.replace(/([A-Z])/g, " $1")}</strong>
        {groups.map((group) => (
          <button key={group} type="button" onClick={() => onGroupDrillDown({ type: config.groupBy, value: group })}>
            {group}<span>{grouped[group].length}</span>
          </button>
        ))}
      </div>

      <div className="frog-legend" data-testid="frog-legend">
        <strong>Legend: {config.colorBy.replace(/([A-Z])/g, " $1")}</strong>
        {legendValues.map((value, index) => <span key={value}><i style={{ background: colorForValue(value, config.colorBy, labelsByField, index) }} />{value}</span>)}
        <small>Sprite frames use 32x32 tiles; hat/accessory sheets are reserved for future goal unlocks.</small>
      </div>
    </section>
  );
}
