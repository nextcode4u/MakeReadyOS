import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type { BoardSection, LabelDefinition, MakeReadyItem, Property, UserLanguage } from "../lib/api";
import { boardGroupLabel, displayUnitNumber } from "../lib/board";
import { t } from "../lib/i18n";
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
  viewerId: string;
  items: MakeReadyItem[];
  properties: Property[];
  boardSections: BoardSection[];
  labelsByField: Record<string, Record<string, LabelDefinition>>;
  language: UserLanguage;
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
const pondRewards = [
  { id: "tophat", name: "Dapper pond", goal: 1, hint: "1 ready unit", sheet: "tophat" },
  { id: "blue", name: "Blue lagoon", goal: 5, hint: "5 ready units together", sheet: "blue" },
  { id: "clown", name: "Pond carnival", goal: 10, hint: "10 ready units together", sheet: "clown" },
  { id: "funnyglasses", name: "Secret shades", goal: 3, hint: "A snack-loving secret...", sheet: "funnyglasses" },
] as const;
type PondCollection = { readyPeak: number; feeds: number; outfit: string };
function loadCollection(key: string): PondCollection {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null");
    const count = (n: unknown) => typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.min(10000, Math.floor(n))) : 0;
    return { readyPeak: count(value?.readyPeak), feeds: count(value?.feeds), outfit: pondRewards.some(reward => reward.id === value?.outfit) ? value.outfit : "natural" };
  } catch { return { readyPeak: 0, feeds: 0, outfit: "natural" }; }
}
function rewardUnlocked(reward: typeof pondRewards[number], collection: PondCollection) {
  return (reward.id === "funnyglasses" ? collection.feeds : collection.readyPeak) >= reward.goal;
}
function pondReady(item: MakeReadyItem) {
  const vacancy = (item.vacancyStatus ?? "").toUpperCase().replace(/[ _-]+/g, "_");
  return ["YES", "DONE", "COMPLETE", "COMPLETED"].includes((item.completionStatus ?? "").toUpperCase())
    || (vacancy.startsWith("VACANT_") && vacancy.endsWith("_READY") && !vacancy.endsWith("_NOT_READY"));
}
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
  tophat: { url: "/frogs/sprites/frog-tophat.png", width: 256, height: 128, achievement: "Ready for move-in" },
  cowboy: { url: "/frogs/sprites/frog-cowboy.png", width: 256, height: 128, achievement: "Assigned tech" },
  pirate: { url: "/frogs/sprites/frog-pirate.png", width: 256, height: 128, achievement: "Critical risk" },
  viking: { url: "/frogs/sprites/frog-viking.png", width: 256, height: 128, achievement: "Major scope" },
  clown: { url: "/frogs/sprites/frog-clown.png", width: 256, height: 128, achievement: "Full / partial scope" },
  funnyglasses: { url: "/frogs/sprites/frog-funnyglasses.png", width: 256, height: 128, achievement: "Move-in this week" },
};

const tadpoleSprites = ["/frogs/tadpoles/tadpole-1.png", "/frogs/tadpoles/tadpole-2.png", "/frogs/tadpoles/tadpole-3.png", "/frogs/tadpoles/tadpole-4.png", "/frogs/tadpoles/tadpole-5.png", "/frogs/tadpoles/tadpole-6.png"];

type PondPosition = { x: number; y: number };
type DragState = { id: string; pointerId: number; moved: boolean; startX: number; startY: number };
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
  achievementLabel: string | null;
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
  if (pondReady(item)) return "celebrating";
  if (item.vacancyStatus?.startsWith("NTV")) return "tadpole";
  return "working";
}

function sheetForItem(item: MakeReadyItem): { sheet: SpriteSheet; achievementLabel: string | null } {
  if (item.makeReadyStatus === "DONE" || item.completionStatus === "YES") {
    return { sheet: frogSheets.tophat, achievementLabel: frogSheets.tophat.achievement ?? null };
  }
  if (item.scopeLevel === "MAJOR") {
    return { sheet: frogSheets.viking, achievementLabel: frogSheets.viking.achievement ?? null };
  }
  if (item.riskLevel === "CRITICAL") {
    return { sheet: frogSheets.pirate, achievementLabel: frogSheets.pirate.achievement ?? null };
  }
  if (isThisWeek(item.moveInDate)) {
    return { sheet: frogSheets.funnyglasses, achievementLabel: frogSheets.funnyglasses.achievement ?? null };
  }
  if (item.assignedTech?.trim()) {
    return { sheet: frogSheets.cowboy, achievementLabel: frogSheets.cowboy.achievement ?? null };
  }
  if (item.riskLevel === "HIGH") {
    return { sheet: frogSheets.brown, achievementLabel: null };
  }
  if (item.vacancyStatus?.startsWith("NTV")) {
    return { sheet: frogSheets.tan, achievementLabel: null };
  }
  if (item.scopeLevel === "FULL" || item.scopeLevel === "PARTIAL") {
    return { sheet: frogSheets.clown, achievementLabel: frogSheets.clown.achievement ?? null };
  }
  return { sheet: frogSheets.green, achievementLabel: null };
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
  const run = runs[seed % runs.length] ?? runs[0];
  const frameInRun = (Math.floor(tick / (pose === "sleeping" ? 2 : 1)) + index) % run.frames;
  return { col: run.startCol + frameInRun, row: run.row };
}

function frogPosition(index: number, columns: number, count: number) {
  const row = Math.floor(index / columns);
  const column = index % columns;
  return {
    x: 8 + (column + .5) * (84 / columns),
    y: 40 + (row + .5) * (46 / Math.max(1, Math.ceil(count / columns))),
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

const pondPlaybooks: Array<{
  id: string;
  label: string;
  description: string;
  config: Partial<FrogPondConfig>;
}> = [
  {
    id: "ops-overview",
    label: "Ops Overview",
    description: "Balanced live board view with calm pond spacing.",
    config: { metricSource: "active", groupBy: "property", colorBy: "riskLevel", poseBy: "riskLevel", density: "comfortable", theme: "pond-05", animated: true },
  },
  {
    id: "risk-watch",
    label: "Risk Watch",
    description: "High-risk focus with tighter grouping for supervisors.",
    config: { metricSource: "risk", groupBy: "riskLevel", colorBy: "riskLevel", poseBy: "riskLevel", density: "dense", theme: "pond-14", animated: true },
  },
  {
    id: "tech-loadout",
    label: "Tech Loadout",
    description: "Assigned work grouped by tech for quick coverage checks.",
    config: { metricSource: "techWorkload", groupBy: "assignedTech", colorBy: "property", poseBy: "makeReadyStatus", density: "dense", theme: "pond-08", animated: true },
  },
  {
    id: "move-in-watch",
    label: "Move-In Watch",
    description: "This week's move-ins with clearer readiness cues.",
    config: { metricSource: "moveInsWeek", groupBy: "property", colorBy: "makeReadyStatus", poseBy: "makeReadyStatus", density: "comfortable", theme: "pond-12", animated: false },
  },
];

export function FrogPondPanel({ viewerId, items, properties, boardSections, labelsByField, language, selectedPropertyId, loading, error, onOpenItem, onPropertyChange, onGroupDrillDown }: Props) {
  const isSpanish = language === "es";
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  const frameTickRef = useRef(0);
  const [config, setConfig] = useState<FrogPondConfig>(() => {
    return { ...loadConfig(), propertyId: selectedPropertyId };
  });
  const [presets, setPresets] = useState(loadPresets);
  const [presetName, setPresetName] = useState("");
  const [positions, setPositions] = useState<Record<string, PondPosition>>(loadPositions);
  const [frameTick, setFrameTick] = useState(0);
  const [flies, setFlies] = useState<Fly[]>([]);
  const collectionKey = `makereadyos.frogPond.collection.${viewerId}`;
  const [collection, setCollection] = useState(() => loadCollection(collectionKey));
  const [collectionSaved, setCollectionSaved] = useState(true);
  const [feeding, setFeeding] = useState(false);
  const [greetingId, setGreetingId] = useState<string | null>(null);
  const readyCount = items.filter(item => !item.isArchived && (!selectedPropertyId || item.propertyId === selectedPropertyId) && pondReady(item)).length;
  useEffect(() => {
    if (!loading && !error) setCollection(current => readyCount > current.readyPeak ? { ...current, readyPeak: readyCount } : current);
  }, [readyCount, loading, error]);
  useEffect(() => {
    try { localStorage.setItem(collectionKey, JSON.stringify(collection)); setCollectionSaved(true); }
    catch { setCollectionSaved(false); }
  }, [collectionKey, collection]);
  useEffect(() => {
    if (!feeding) return;
    const timer = window.setTimeout(() => setFeeding(false), 3500);
    return () => window.clearTimeout(timer);
  }, [feeding]);

  const [rearranging, setRearranging] = useState(false);
  const [sceneWidth, setSceneWidth] = useState(960);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  const motionEnabled = config.animated && !reducedMotion && pageVisible && !rearranging;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const motion = () => setReducedMotion(media.matches);
    const visibility = () => setPageVisible(!document.hidden);
    media.addEventListener("change", motion);
    document.addEventListener("visibilitychange", visibility);
    return () => { media.removeEventListener("change", motion); document.removeEventListener("visibilitychange", visibility); };
  }, []);

  useEffect(() => {
    if (!sceneRef.current) return;
    const observer = new ResizeObserver(([entry]) => setSceneWidth(entry.contentRect.width));
    observer.observe(sceneRef.current);
    return () => observer.disconnect();
  }, [loading, error, items, config.propertyId, config.metricSource]);

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
    const expiryTimers = new Set<number>();
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
      setFlies((current) => [...current.slice(-4), fly]);
      const expiry = window.setTimeout(() => {
        setFlies((current) => current.filter((entry) => entry.id !== id));
        expiryTimers.delete(expiry);
      }, (fly.duration + fly.delay + 1) * 1000);
      expiryTimers.add(expiry);
    };
    const initialTimers = [700, 1600, 2800].map((delay) => window.setTimeout(spawnFly, delay));
    const timer = window.setInterval(spawnFly, 2100);
    return () => {
      initialTimers.forEach((initial) => window.clearTimeout(initial));
      expiryTimers.forEach((expiry) => window.clearTimeout(expiry));
      window.clearInterval(timer);
    };
  }, [motionEnabled]);

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

  const columns = Math.max(3, Math.min(config.density === "dense" ? 9 : 7, Math.floor(sceneWidth / 92)));
  const visibleLimit = Math.min(Math.max(1, config.maxFrogs), columns * (sceneWidth < 600 ? 3 : 6));
  const orderedItems = useMemo(() => [...scopedItems].sort((a, b) => groupValue(a, config.groupBy, boardSections).localeCompare(groupValue(b, config.groupBy, boardSections))), [scopedItems, config.groupBy, boardSections]);
  const visibleItems = orderedItems.slice(0, visibleLimit);
  const hiddenCount = Math.max(0, scopedItems.length - visibleItems.length);
  const groups = Object.keys(grouped).sort();
  const legendValues = Array.from(new Set(visibleItems.map((item) => colorValue(item, config.colorBy))));
  const activePond = pondThemes.find((theme) => theme.key === config.theme) ?? pondThemes[0];
  const hiddenGroupSummary = useMemo(() => orderedItems.slice(visibleLimit).reduce<Array<{ group: string; count: number; units: string[] }>>((acc, item) => {
    const group = groupValue(item, config.groupBy, boardSections);
    const existing = acc.find((entry) => entry.group === group);
    if (existing) {
      existing.count += 1;
      if (existing.units.length < 3) existing.units.push(displayUnitNumber(item.property.code, item.unitNumber));
      return acc;
    }
    acc.push({ group, count: 1, units: [displayUnitNumber(item.property.code, item.unitNumber)] });
    return acc;
  }, []).sort((left, right) => right.count - left.count), [boardSections, config.groupBy, visibleLimit, orderedItems]);
  const achievementLegend = useMemo(() => Array.from(new Set(visibleItems.map((item) => sheetForItem(item).achievementLabel).filter((value): value is string => Boolean(value)))), [visibleItems]);
  const renderedFrogs = useMemo<FrogRender[]>(() => visibleItems.map((item, index) => {
    const group = groupValue(item, config.groupBy, boardSections);
    const colorLabel = colorValue(item, config.colorBy);
    const color = colorForValue(colorLabel, config.colorBy, labelsByField, legendValues.indexOf(colorLabel));
    const pose = poseForItem(item, config.poseBy);
    const reward = pondRewards.find(entry => entry.id === collection.outfit && rewardUnlocked(entry, collection));
    const { sheet, achievementLabel } = reward ? { sheet: frogSheets[reward.sheet], achievementLabel: reward.name } : sheetForItem(item);
    const frame = spriteFrameForItem(item, pose, index, frameTick, sheet);
    const tadpoleUrl = tadpoleSprites[(frameTick + index) % tadpoleSprites.length];
    const basePosition = positions[item.id] ?? frogPosition(index, columns, visibleItems.length);
    return {
      item,
      index,
      group,
      colorLabel,
      color,
      pose,
      sheet,
      achievementLabel,
      frame,
      tadpoleUrl,
      x: clamp(basePosition.x, Math.max(pondMinX, 64 / Math.max(sceneWidth, 1) * 100), Math.min(pondMaxX, 100 - 64 / Math.max(sceneWidth, 1) * 100)),
      y: clamp(basePosition.y, pondMinY, pondMaxY),
    };
  }), [boardSections, columns, sceneWidth, collection, config.colorBy, config.density, config.groupBy, config.poseBy, frameTick, groups, labelsByField, legendValues, motionEnabled, positions, visibleItems]);

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

  const applyPlaybook = (playbook: (typeof pondPlaybooks)[number]) => {
    updateConfig(playbook.config);
  };

  const resetPositions = () => {
    setPositions({});
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
    if (!rearranging) return;
    dragRef.current = { id, pointerId: event.pointerId, moved: false, startX: event.clientX, startY: event.clientY };
    suppressClickRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 8) return;
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

  if (loading) return <StatusState title={isSpanish ? "Cargando Frog Pond" : "Loading Frog Pond"} description={isSpanish ? "Reuniendo datos del tablero para la visualizacion del estanque." : "Gathering board data for the pond visualization."} />;
  if (error) return <StatusState title={isSpanish ? "Frog Pond no disponible" : "Frog Pond unavailable"} description={isSpanish ? "Actualice los datos del tablero e intentelo de nuevo." : "Refresh the board data and try again."} tone="error" />;

  return (
    <section className={`frog-pond-shell frog-theme-${config.theme} frog-density-${config.density}${motionEnabled ? " frog-animated" : ""}${rearranging ? " frog-rearranging" : ""}${feeding ? " pond-feeding" : ""}`} data-testid="frog-pond-panel">
      <header className="panel-heading">
        <div>
          <h2>Frog Pond</h2>
          <p>{isSpanish ? "Un pequeno descanso. Salude, de comida y descubra sorpresas." : "A little break between turns. Say hello, toss a snack, discover a surprise."}</p>
        </div>
        <div className="frog-summary" data-testid="frog-summary">
          <strong>{scopedItems.length}</strong><span>{config.metricSource.replace(/([A-Z])/g, " $1")} {isSpanish ? "ranas" : "frogs"}</span>
          <strong>{groups.length}</strong><span>{isSpanish ? "grupos" : "groups"}</span>
          <strong>{visibleItems.length}</strong><span>{isSpanish ? "visibles" : "on the pond"}</span>
        </div>
      </header>

      <div className="frog-scene-tools">
        <span>{isSpanish ? "Su tablero, con un poco de vida." : "A little life in your workday."}</span>
        <button type="button" className="button button-primary" data-testid="pond-feed" disabled={feeding || !scopedItems.length} onClick={() => { setFeeding(true); setCollection(current => ({ ...current, feeds: Math.min(10000, current.feeds + 1) })); }}>{feeding ? (isSpanish ? "Hora de comer!" : "Snack time!") : (isSpanish ? "Dar comida" : "Feed the pond")}</button>
        <button type="button" className="button button-secondary" aria-pressed={!config.animated} onClick={() => updateConfig({ animated: !config.animated })}>{config.animated ? (isSpanish ? "Pausar movimiento" : "Pause motion") : (isSpanish ? "Activar movimiento" : "Resume motion")}</button>
        <button type="button" className="button button-secondary" aria-pressed={rearranging} onClick={() => setRearranging(!rearranging)}>{rearranging ? (isSpanish ? "Terminar" : "Done arranging") : (isSpanish ? "Organizar ranas" : "Arrange frogs")}</button>
        {reducedMotion ? <small>{isSpanish ? "Movimiento reducido del dispositivo activo" : "Device reduced-motion setting is on"}</small> : null}
      </div>
      <details className="frog-settings">
        <summary data-testid="frog-settings-toggle">{isSpanish ? "Ajustes del estanque" : "Pond settings"}<span>{isSpanish ? "Vista, colores y temas" : "View, colors & scenery"}</span></summary>
      <div className="frog-config" data-testid="frog-config">
        <div className="frog-playbooks" data-testid="frog-playbooks">
          {pondPlaybooks.map((playbook) => (
            <button key={playbook.id} type="button" className="frog-playbook" data-testid={`frog-playbook-${playbook.id}`} onClick={() => applyPlaybook(playbook)}>
              <strong>{playbook.label}</strong>
              <span>{playbook.description}</span>
            </button>
          ))}
        </div>
        <label>{isSpanish ? "Las ranas representan" : "Frogs represent"}
          <select data-testid="frog-metric-source" value={config.metricSource} onChange={(event) => updateConfig({ metricSource: event.target.value as MetricSource })}>
            <option value="active">{isSpanish ? "Make-readies activos" : "Active make-readies"}</option>
            <option value="risk">{isSpanish ? "Elementos de riesgo alto/critico" : "High/Critical risk items"}</option>
            <option value="techWorkload">{isSpanish ? "Carga asignada por tecnico" : "Assigned tech workload"}</option>
            <option value="vacant">{isSpanish ? "Unidades vacantes / NTV" : "Vacant / NTV units"}</option>
            <option value="moveInsWeek">{isSpanish ? "Mudanzas esta semana" : "Move-ins this week"}</option>
          </select>
        </label>
        <label>{isSpanish ? "Agrupar por" : "Group by"}
          <select data-testid="frog-group-by" value={config.groupBy} onChange={(event) => updateConfig({ groupBy: event.target.value as GroupSource })}>
            <option value="property">{isSpanish ? "Propiedad" : "Property"}</option>
            <option value="boardSection">{isSpanish ? "Seccion del tablero" : "Board section"}</option>
            <option value="riskLevel">{isSpanish ? "Nivel de riesgo" : "Risk level"}</option>
            <option value="assignedTech">{isSpanish ? "Tecnico asignado" : "Assigned tech"}</option>
          </select>
        </label>
        <label>{isSpanish ? "Color por" : "Color by"}
          <select data-testid="frog-color-by" value={config.colorBy} onChange={(event) => updateConfig({ colorBy: event.target.value as ColorSource })}>
            <option value="riskLevel">{isSpanish ? "Nivel de riesgo" : "Risk level"}</option>
            <option value="vacancyStatus">{isSpanish ? "Estado de vacancia" : "Vacancy status"}</option>
            <option value="makeReadyStatus">{isSpanish ? "Estado de make-ready" : "Make-ready status"}</option>
            <option value="property">{isSpanish ? "Propiedad" : "Property"}</option>
          </select>
        </label>
        <label>{isSpanish ? "Propiedad" : "Property"}
          <select data-testid="frog-property-filter" value={config.propertyId} onChange={(event) => updateConfig({ propertyId: event.target.value })}>
            <option value="">{t(language, "common.allAccessibleProperties")}</option>
            {properties.map((property) => <option key={property.id} value={property.id}>{property.code} · {property.name}</option>)}
          </select>
        </label>
        <label>{isSpanish ? "Maximo de ranas" : "Max frogs"}
          <input data-testid="frog-max-visible" type="number" min="6" max="120" value={config.maxFrogs} onChange={(event) => updateConfig({ maxFrogs: Number(event.target.value) || 36 })} />
        </label>
        <label>{isSpanish ? "Tema" : "Theme"}
          <select data-testid="frog-theme" value={config.theme} onChange={(event) => updateConfig({ theme: event.target.value as PondTheme })}>
            {pondThemes.map((theme) => <option key={theme.key} value={theme.key}>{theme.label}</option>)}
          </select>
        </label>
        <label>{isSpanish ? "Densidad" : "Density"}
          <select data-testid="frog-density" value={config.density} onChange={(event) => updateConfig({ density: event.target.value as DensityMode })}>
            <option value="comfortable">{isSpanish ? "Comoda" : "Comfortable"}</option>
            <option value="dense">{isSpanish ? "Densa" : "Dense"}</option>
          </select>
        </label>
        <label className="toggle-row"><input data-testid="frog-animation-toggle" type="checkbox" checked={config.animated} onChange={(event) => updateConfig({ animated: event.target.checked })} /> {isSpanish ? "Animacion" : "Animation"}</label>
        <button type="button" className="button button-secondary frog-reset-positions" data-testid="frog-reset-positions" onClick={resetPositions}>{isSpanish ? "Restablecer posiciones" : "Reset frog positions"}</button>
        <div className="frog-presets">
          <select data-testid="frog-preset-select" value="" onChange={(event) => {
            const preset = presets.find((entry) => entry.name === event.target.value);
            if (preset) updateConfig(preset.config);
          }}>
            <option value="">{isSpanish ? "Cargar preajuste" : "Load preset"}</option>
            {presets.map((preset) => <option key={preset.name} value={preset.name}>{preset.name}</option>)}
          </select>
          <input data-testid="frog-preset-name" value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder={isSpanish ? "Nombre del preajuste" : "Preset name"} />
          <button data-testid="frog-save-preset" type="button" className="button button-secondary" onClick={savePreset} disabled={!presetName.trim()}>{isSpanish ? "Guardar" : "Save"}</button>
        </div>
      </div>
      </details>

      <details className="frog-settings pond-collection" data-testid="pond-collection">
        <summary>{isSpanish ? "Coleccion del estanque" : "Pond collection"}<span>{pondRewards.filter(reward => rewardUnlocked(reward, collection)).length} / {pondRewards.length} {isSpanish ? "descubiertos" : "discovered"}</span></summary>
        <p className="muted">{isSpanish ? "Las unidades listas visibles desbloquean estilos. La coleccion se guarda para su cuenta en este navegador; no cambia el trabajo." : "Ready units visible on your board unlock outfits. Discoveries stay with your account in this browser, even after the view changes. Playing never changes work records."}</p>
        {!collectionSaved ? <p role="status">{isSpanish ? "No se pudo guardar la coleccion en este navegador." : "This browser could not save your collection. Discoveries will last only for this visit."}</p> : null}
        <div className="pond-rewards">
          <button type="button" className="button" aria-pressed={collection.outfit === "natural"} onClick={() => setCollection(current => ({ ...current, outfit: "natural" }))}>{isSpanish ? "Estilo natural" : "Natural pond"}</button>
          {pondRewards.map(reward => <button type="button" className="button" key={reward.id} data-testid={`pond-reward-${reward.id}`} disabled={!rewardUnlocked(reward, collection)} aria-pressed={collection.outfit === reward.id} onClick={() => setCollection(current => ({ ...current, outfit: reward.id }))}><strong>{reward.name}</strong><small>{rewardUnlocked(reward, collection) ? (isSpanish ? "Desbloqueado" : "Unlocked") : reward.hint}</small></button>)}
        </div>
      </details>
      <div className="pond-greeting" role="status" data-testid="pond-greeting">
        {feeding ? (collection.feeds >= 3 ? "A very cool frog left you some Secret shades. Check your collection!" : "Ribbit! The snack committee approves.") : greetingId && scopedItems.some(item => item.id === greetingId) ? <><span>{isSpanish ? "Ribbit! Su rana lo saluda." : "Ribbit! A tiny wave, just for you."}</span><button type="button" className="button button-secondary" data-testid="pond-open-unit" onClick={() => onOpenItem(greetingId)}>{isSpanish ? "Abrir unidad" : "Open unit"} {scopedItems.find(item => item.id === greetingId)?.unitNumber}</button></> : (isSpanish ? "Toque una rana para saludar." : "Tap a frog to say hello. The pond has a few secrets.")}
      </div>

      {scopedItems.length === 0 ? (
        <div className="frog-empty" data-testid="frog-empty-state">
          <strong>{isSpanish ? "No hay ranas en este estanque." : "No frogs in this pond."}</strong>
          <span>{isSpanish ? "Pruebe un filtro de propiedad mas amplio o cambie la metrica." : "Try a broader property filter or switch the metric source."}</span>
        </div>
      ) : (
        <div ref={sceneRef} className="frog-pond-scene" data-testid="frog-pond-scene" aria-label={isSpanish ? "Visualizacion operativa de Frog Pond" : "Frog Pond operational visualization"} style={{ "--pond-image": `url("${activePond.url}")`, "--pond-height": `${Math.max(460, Math.ceil(visibleItems.length / columns) * 170 + 120)}px` } as CSSProperties}>
          <div className="pond-atmosphere" aria-hidden="true"><div className="pond-water-light" />{Array.from({ length: 7 }, (_, i) => <i key={i} style={{ "--mote": i, left: `${12 + i * 12}%`, top: `${24 + (i % 3) * 15}%` } as CSSProperties} />)}</div>
          <div className="pond-scene-caption" aria-hidden="true">{rearranging ? (isSpanish ? "Arrastre las ranas para organizarlas" : "Drag frogs to arrange your pond") : (isSpanish ? "Toque una rana para saludar" : "Tap a frog to say hello")}</div>
          {feeding ? <div className="pond-snacks" aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ left: `${12 + (i * 17) % 76}%`, top: `${43 + (i * 11) % 39}%`, "--snack": i } as CSSProperties} />)}</div> : null}
          {renderedFrogs.map(({ item, index, group, colorLabel, color, pose, sheet, achievementLabel, frame, tadpoleUrl, x, y }) => {
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
                  "--roam-time": `${12 + stableNumber(item.id) % 11}s`,
                  "--roam-delay": `${-(stableNumber(item.id) % 20)}s`,
                  zIndex: Math.round(y),
                } as CSSProperties}
                onClick={() => {
                  if (suppressClickRef.current || dragRef.current?.moved) {
                    suppressClickRef.current = false;
                    return;
                  }
                  setGreetingId(item.id);
                }}
                onPointerDown={(event) => startDrag(event, item.id)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                title={`${displayUnitNumber(item.property.code, item.unitNumber)} / ${group} / ${colorLabel}${achievementLabel ? ` / ${achievementLabel}` : ""}`}
              >
                <span className="frog-water-ring" aria-hidden="true" />
                <span className="frog-lily-pad" aria-hidden="true" />
                <span className="frog-body" aria-hidden="true"><i /><b /></span>
                {greetingId === item.id || feeding ? <span className="frog-hello" aria-hidden="true">{feeding ? "nom!" : "ribbit!"}</span> : null}
                <strong>{displayUnitNumber(item.property.code, item.unitNumber)}</strong>
                <em><i style={{ background: color }} />{colorLabel}</em>
                {achievementLabel ? <small>{achievementLabel}</small> : null}
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
        </div>
      )}
          {hiddenCount > 0 ? (
            <div className="frog-cluster" data-testid="frog-cluster">
              <strong>+{hiddenCount}</strong>
              <span>{isSpanish ? "unidades adicionales; abra un grupo para verlas" : "more units; open a group to see them"}</span>
              <div className="frog-cluster-list">
                {hiddenGroupSummary.slice(0, 4).map((entry) => (
                  <button key={entry.group} type="button" className="frog-cluster-chip" onClick={() => onGroupDrillDown({ type: config.groupBy, value: entry.group })} title={entry.units.join(", ")}>
                    <span>{entry.group}</span>
                    <strong>{entry.count}</strong>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

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
        {achievementLegend.length && collection.outfit === "natural" ? <small>{isSpanish ? "Accesorios activos:" : "Active accessories:"} {achievementLegend.join(" · ")}</small> : null}
        <small>{isSpanish ? "El estilo natural refleja el trabajo. Los estilos desbloqueados son solo decorativos." : "Natural accessories reflect work status. Collection outfits are just for fun."}</small>
      </div>
    </section>
  );
}
