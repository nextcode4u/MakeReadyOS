import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type { BoardSection, LabelDefinition, MakeReadyItem, Property, UserLanguage } from "../lib/api";
import { boardGroupLabel, displayUnitNumber } from "../lib/board";
import { t } from "../lib/i18n";
import { StatusState } from "./StatusState";
import { frogSpriteFrame, type FrogSpriteFrame } from "../lib/frogSprites";
import { PondAudio, type PondSound } from "../lib/pondAudio";
import { approachSnack, pondElapsed, pondGreeting, pondJourney, pondLight, pondPads, pondPersonality, selectPondHunter, type PondSnack } from "../lib/pondLife";

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
  labels: "quiet" | "always";
  atmosphere: "auto" | "day" | "dusk" | "night";
  weather: "auto" | "clear" | "rain";
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
  { id: "brown", name: "Woodland brown", goal: 0, hint: "Starter style", sheet: "brown" },
  { id: "bw", name: "Game Boy B&W", goal: 0, hint: "Starter style", sheet: "bw" },
  { id: "tophat", name: "Dapper pond", goal: 1, hint: "1 ready unit", sheet: "tophat" },
  { id: "cowboy", name: "Rodeo frogs", goal: 3, hint: "3 ready units together", sheet: "cowboy" },
  { id: "blue", name: "Blue lagoon", goal: 5, hint: "5 ready units together", sheet: "blue" },
  { id: "viking", name: "Viking voyagers", goal: 7, hint: "7 ready units together", sheet: "viking" },
  { id: "clown", name: "Pond carnival", goal: 10, hint: "10 ready units together", sheet: "clown" },
  { id: "funnyglasses", name: "Secret shades", goal: 3, hint: "A snack-loving secret...", sheet: "funnyglasses" },
  { id: "pirate", name: "Pirate pond", goal: 6, hint: "Feed the pond 6 times", sheet: "pirate" },
  { id: "purple", name: "Dragonfly dusk", goal: 1, hint: "Befriend the shimmering visitor...", sheet: "purple" },
] as const;
type PondCollection = { readyPeak: number; feeds: number; outfit: string; visitor: boolean; greeted: boolean; outfits: Record<string, string>; discovered: Record<string, string> };
function loadCollection(key: string): PondCollection {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null");
    const count = (n: unknown) => typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.min(10000, Math.floor(n))) : 0;
    const outfits = Object.fromEntries(Object.entries(value?.outfits && typeof value.outfits === "object" ? value.outfits : {}).filter(([, outfit]) => outfit === "natural" || pondRewards.some(reward => reward.id === outfit)));
    const discovered = Object.fromEntries(Object.entries(value?.discovered && typeof value.discovered === "object" ? value.discovered : {}).filter(([, date]) => typeof date === "string" && /^\d{4}-\d{2}-\d{2}T/.test(date) && Number.isFinite(Date.parse(date))));
    return { readyPeak: count(value?.readyPeak), feeds: count(value?.feeds), outfit: pondRewards.some(reward => reward.id === value?.outfit) ? value.outfit : "natural", visitor: value?.visitor === true, greeted: value?.greeted === true, outfits: outfits as Record<string, string>, discovered: discovered as Record<string, string> };
  } catch { return { readyPeak: 0, feeds: 0, outfit: "natural", visitor: false, greeted: false, outfits: {}, discovered: {} }; }
}
function rewardUnlocked(reward: typeof pondRewards[number], collection: PondCollection) {
  if (reward.id === "purple") return collection.visitor;
  return (reward.id === "funnyglasses" || reward.id === "pirate" ? collection.feeds : collection.readyPeak) >= reward.goal;
}
function pondReady(item: MakeReadyItem) {
  const vacancy = (item.vacancyStatus ?? "").toUpperCase().replace(/[ _-]+/g, "_");
  return ["YES", "DONE", "COMPLETE", "COMPLETED"].includes((item.completionStatus ?? "").toUpperCase())
    || (vacancy.startsWith("VACANT_") && vacancy.endsWith("_READY") && !vacancy.endsWith("_NOT_READY"));
}
const pondMinY = 38;
const pondMaxY = 88;
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
  labels: "quiet",
  atmosphere: "auto",
  weather: "auto",
};

const pondThemes = [
  { key: "pond-01", label: "Pond 1 - Moonlit woodland", url: "/frogs/ponds/pond-01.png?v=pixel-20260907" },
  { key: "pond-02", label: "Pond 2 - Lotus garden", url: "/frogs/ponds/pond-02.png?v=pixel-20260907" },
  { key: "pond-03", label: "Pond 3", url: "/frogs/ponds/pond-03.png" },
  { key: "pond-04", label: "Pond 4", url: "/frogs/ponds/pond-04.png" },
  { key: "pond-05", label: "Pond 5", url: "/frogs/ponds/pond-05.png" },
  { key: "pond-06", label: "Pond 6", url: "/frogs/ponds/pond-06.png" },
  { key: "pond-07", label: "Pond 7", url: "/frogs/ponds/pond-07.png" },
  { key: "pond-08", label: "Pond 8", url: "/frogs/ponds/pond-08.png" },
  { key: "pond-09", label: "Pond 9", url: "/frogs/ponds/pond-09.png" },
  { key: "pond-10", label: "Pond 10", url: "/frogs/ponds/pond-10.png" },
  { key: "pond-11", label: "Pond 11 - Cozy frog home", url: "/frogs/ponds/pond-11.png?v=pixel-20260907" },
  { key: "pond-12", label: "Pond 12 - Coffee shop", url: "/frogs/ponds/pond-12.png?v=pixel-20260907" },
  { key: "pond-13", label: "Pond 13 - Frog warehouse", url: "/frogs/ponds/pond-13.png?v=pixel-20260907" },
  { key: "pond-14", label: "Pond 14 - Cozy frog village", url: "/frogs/ponds/pond-14.png?v=pixel-20260907" },
  { key: "pond-15", label: "Pond 15 - Frog farm", url: "/frogs/ponds/pond-15.png?v=pixel-20260907" },
];

type SpriteSheet = { url: string; width: number; height: number; achievement?: string };

const frogSheets: Record<string, SpriteSheet> = {
  green: { url: "/frogs/sprites/frog-green.png", width: 512, height: 512 },
  blue: { url: "/frogs/sprites/frog-blue.png", width: 512, height: 512 },
  purple: { url: "/frogs/sprites/frog-purple.png", width: 512, height: 512 },
  brown: { url: "/frogs/sprites/frog-brown.png", width: 512, height: 512 },
  bw: { url: "/frogs/sprites/frog-bw.png", width: 256, height: 128 },
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
type Fly = { id: number; startTick: number; top: number; duration: number; delay: number; reverse: boolean; loopSize: number; loopSpeed: number; drift: number; caught?: { frogId: string; tick: number; from: PondPosition; mouth: PondPosition } };
type FrogRender = {
  item: MakeReadyItem;
  index: number;
  group: string;
  colorLabel: string;
  color: string;
  pose: string;
  sheet: SpriteSheet;
  achievementLabel: string | null;
  frame: FrogSpriteFrame;
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
  // Natural appearance is independent of work status; accessories are opt-in rewards.
  return { sheet: stableNumber(item.id) % 4 === 0 ? frogSheets.brown : frogSheets.green, achievementLabel: null };
}

function spriteFrameForItem(item: MakeReadyItem, pose: string, index: number, tick: number, sheet: SpriteSheet): FrogSpriteFrame {
  const seed = stableNumber(`${item.id}:${item.unitNumber}:${index}`);
  return frogSpriteFrame(sheet.width, pose, seed, tick);
}

function scatterFrogs(items: MakeReadyItem[], width: number, height: number, saved: Record<string, PondPosition>) {
  const placed: PondPosition[] = [];
  const margin = Math.min(32, (width < 600 ? 64 : 104) / width * 100);
  return Object.fromEntries(items.map(item => {
    // Best-candidate sampling leaves swimming room without visible rows or columns.
    // A seeded stream keeps the scene still across sprite-frame renders.
    let seed = stableNumber(item.id) || 1;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    let point = saved[item.id];
    if (!point) {
      let bestDistance = -1;
      for (let attempt = 0; attempt < 120; attempt += 1) {
        const candidate = { x: margin + random() * (100 - margin * 2), y: pondMinY + random() * (pondMaxY - pondMinY) };
        const distance = placed.length ? Math.min(...placed.map(other => Math.hypot((candidate.x - other.x) * width / 100, (candidate.y - other.y) * height / 100))) : 1;
        if (distance > bestDistance) { point = candidate; bestDistance = distance; }
      }
    }
    const bounded = { x: clamp(point!.x, margin, 100 - margin), y: clamp(point!.y, pondMinY, pondMaxY) };
    placed.push(bounded);
    return [item.id, bounded];
  }));
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
  const [food, setFood] = useState<"flies" | "algae">("flies");
  const [pondOnly, setPondOnly] = useState(false);
  const pondOnlyButton = useRef<HTMLButtonElement | null>(null);
  const knownDiscoveries = useRef<Set<string> | null>(null);
  const [snack, setSnack] = useState<PondSnack | null>(null);
  const [held, setHeld] = useState<{ id: string; x: number; y: number } | null>(null);
  const [sound, setSound] = useState(false);
  const audioRef = useRef<PondAudio | null>(null);
  const [volume, setVolume] = useState(.4);
  const [hour, setHour] = useState(() => new Date().getHours());
  const [celebration, setCelebration] = useState(false);
  const readyHistory = useRef<Map<string, boolean> | null>(null);
  const [greetingId, setGreetingId] = useState<string | null>(null);
  const readyCount = items.filter(item => !item.isArchived && (!selectedPropertyId || item.propertyId === selectedPropertyId) && pondReady(item)).length;
  useEffect(() => {
    if (!loading && !error) setCollection(current => readyCount > current.readyPeak ? { ...current, readyPeak: readyCount } : current);
  }, [readyCount, loading, error]);
  useEffect(() => {
    if (loading || error) return;
    const next = new Map(items.filter(item => !item.isArchived).map(item => [item.id, pondReady(item)]));
    if (readyHistory.current && [...next].some(([id, ready]) => ready && readyHistory.current?.get(id) === false)) setCelebration(true);
    readyHistory.current = next;
  }, [items, loading, error]);
  useEffect(() => {
    if (!celebration) return;
    const timer = window.setTimeout(() => setCelebration(false), 4500);
    return () => window.clearTimeout(timer);
  }, [celebration]);
  useEffect(() => {
    const timer = window.setInterval(() => setHour(new Date().getHours()), 60000);
    return () => { window.clearInterval(timer); void audioRef.current?.close().catch(() => {}); audioRef.current = null; };
  }, []);
  useEffect(() => {
    try { localStorage.setItem(collectionKey, JSON.stringify(collection)); setCollectionSaved(true); }
    catch { setCollectionSaved(false); }
  }, [collectionKey, collection]);
  useEffect(() => {
    const keys = new Set([...pondRewards.filter(reward => rewardUnlocked(reward, collection)).map(reward => reward.id), ...(collection.greeted ? ["hello"] : []), ...(collection.visitor ? ["visitor"] : [])]);
    const previous = knownDiscoveries.current;
    knownDiscoveries.current = keys;
    if (!previous) return;
    const added = [...keys].filter(key => !previous.has(key) && !collection.discovered[key]);
    if (added.length) setCollection(current => ({ ...current, discovered: { ...current.discovered, ...Object.fromEntries(added.map(key => [key, new Date().toISOString()])) } }));
  }, [collection]);
  useEffect(() => {
    if (!pondOnly) return;
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setPondOnly(false); pondOnlyButton.current?.focus(); } };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [pondOnly]);

  const [rearranging, setRearranging] = useState(false);
  const [sceneWidth, setSceneWidth] = useState(960);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [allowReducedMotion, setAllowReducedMotion] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  const deviceMotionBlocked = reducedMotion && !allowReducedMotion;
  const motionEnabled = config.animated && !deviceMotionBlocked && pageVisible && !rearranging;
  const light = config.atmosphere === "auto" ? pondLight(hour) : config.atmosphere;
  const raining = config.weather === "rain" || config.weather === "auto" && frameTick % 600 >= 480;
  const visitorVisible = frameTick % 540 >= 270 && frameTick % 540 < 410;

  useEffect(() => {
    if (snack && (pondElapsed(frameTick, snack.tick) >= 16 || !motionEnabled)) { setFeeding(false); setSnack(null); }
  }, [frameTick, snack, motionEnabled]);

  const playSound = (cue: PondSound) => {
    if (!sound || !pageVisible) return;
    try { audioRef.current?.play(cue); } catch { setSound(false); }
  };
  const automaticSound = useEffectEvent((cue: PondSound) => {
    if (motionEnabled) playSound(cue);
  });
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (sound && motionEnabled) void audio.resume(volume).catch(() => setSound(false));
    else void audio.pause().catch(() => setSound(false));
  }, [sound, motionEnabled, volume]);
  useEffect(() => {
    if (celebration) automaticSound("ready");
  }, [celebration]);
  useEffect(() => {
    if (visitorVisible) automaticSound("visitor");
  }, [visitorVisible]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const motion = () => { setReducedMotion(media.matches); setAllowReducedMotion(false); };
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
        setFlies((current) => current.filter((entry) => entry.id !== id || entry.caught));
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
  const sceneHeight = Math.max(560, Math.ceil(visibleItems.length / columns) * 150 + 150);
  const naturalPositions = useMemo(() => scatterFrogs(orderedItems.slice(0, visibleLimit), sceneWidth, sceneHeight, positions), [orderedItems, visibleLimit, sceneWidth, sceneHeight, positions]);
  const hiddenCount = Math.max(0, scopedItems.length - visibleItems.length);
  const groups = Object.keys(grouped).sort();
  const legendValues = Array.from(new Set(visibleItems.map((item) => colorValue(item, config.colorBy))));
  const activePond = pondThemes.find((theme) => theme.key === config.theme) ?? pondThemes.find(theme => theme.key === defaultConfig.theme)!;
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
  const renderedFrogs = useMemo<FrogRender[]>(() => visibleItems.map((item, index) => {
    const group = groupValue(item, config.groupBy, boardSections);
    const colorLabel = colorValue(item, config.colorBy);
    const color = colorForValue(colorLabel, config.colorBy, labelsByField, legendValues.indexOf(colorLabel));
    const naturalPose = poseForItem(item, config.poseBy);
    const temperament = pondPersonality(stableNumber(item.id));
    const sleepy = (frameTick + stableNumber(item.id)) % 240 > (temperament === "sleepy" ? 180 : 224);
    const pose = naturalPose !== "tadpole" && sleepy && greetingId !== item.id && !feeding ? "sleeping" : naturalPose;
    const outfit = collection.outfits[item.id] ?? collection.outfit;
    const reward = pondRewards.find(entry => entry.id === outfit && rewardUnlocked(entry, collection));
    const { sheet, achievementLabel } = reward ? { sheet: frogSheets[reward.sheet], achievementLabel: reward.name } : sheetForItem(item);
    const frame = spriteFrameForItem(item, pose, index, frameTick, sheet);
    const tadpoleUrl = tadpoleSprites[(frameTick + index) % tadpoleSprites.length];
    const basePosition = naturalPositions[item.id];
    const journey = rearranging ? basePosition : approachSnack(pondJourney(basePosition, stableNumber(item.id), frameTick, pose === "tadpole", sceneWidth, sceneHeight), snack, item.id, frameTick);
    const point = !rearranging && held?.id === item.id ? held : journey;
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
      x: clamp(point.x, Math.max(pondMinX, 64 / Math.max(sceneWidth, 1) * 100), Math.min(pondMaxX, 100 - 64 / Math.max(sceneWidth, 1) * 100)),
      y: clamp(point.y, pondMinY, pondMaxY),
    };
  }), [boardSections, columns, sceneWidth, sceneHeight, collection, config.colorBy, config.density, config.groupBy, config.poseBy, frameTick, groups, labelsByField, legendValues, motionEnabled, naturalPositions, visibleItems, snack, held, rearranging, greetingId, feeding]);

  const feedPond = (point?: PondPosition, selectedFood = food) => {
    if (feeding || rearranging || !renderedFrogs.length) return;
    const eligible = renderedFrogs.filter(frog => (frog.pose === "tadpole") === (selectedFood === "algae"));
    if (!eligible.length) return;
    const target = point ?? { x: eligible[0].x, y: eligible[0].y };
    const guests = [...eligible].sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y)).slice(0, 3).map(frog => frog.item.id);
    setSnack({ ...target, tick: frameTick, guests, food: selectedFood });
    setFeeding(true);
    setCollection(current => ({ ...current, feeds: Math.min(10000, current.feeds + 1) }));
    playSound("splash");
  };
  const greetedTadpole = renderedFrogs.some(frog => frog.item.id === greetingId && frog.pose === "tadpole");
  const selectedCreature = renderedFrogs.find(frog => frog.item.id === greetingId);
  const hasFoodGuests = renderedFrogs.some(frog => (frog.pose === "tadpole") === (food === "algae"));
  const discoveryDate = (key: string) => pondRewards.some(reward => reward.id === key && reward.goal === 0)
    ? (isSpanish ? "Disponible desde el inicio" : "Available from the start")
    : collection.discovered[key] ? new Date(collection.discovered[key]).toLocaleDateString(isSpanish ? "es" : "en") : (isSpanish ? "Fecha anterior no registrada" : "Earlier discovery; date not recorded");

  const ambientTick = useRef(0);
  const heardCatches = useRef(new Set<number>());
  useEffect(() => {
    const caught = flies.filter(fly => fly.caught);
    if (caught.some(fly => !heardCatches.current.has(fly.id))) automaticSound("catch");
    heardCatches.current = new Set(caught.map(fly => fly.id));
  }, [flies]);
  useEffect(() => {
    if (pondElapsed(frameTick, ambientTick.current) < 36) return;
    ambientTick.current = frameTick;
    if (!renderedFrogs.length) return;
    const beat = Math.floor(frameTick / 36);
    const awakeAdult = renderedFrogs.some(frog => frog.pose !== "tadpole" && frog.pose !== "sleeping");
    automaticSound(raining && beat % 2 === 0 ? "rain" : awakeAdult && beat % 3 === 0 ? "frog" : "bubble");
  }, [frameTick, renderedFrogs, raining]);

  useEffect(() => {
    if (!motionEnabled || flies.length === 0 || renderedFrogs.length === 0) return;
    const sceneRect = sceneRef.current?.getBoundingClientRect();
    if (!sceneRect?.width || !sceneRect.height) return;
    setFlies(current => {
      const busy = new Set(current.flatMap(fly => fly.caught ? [fly.caught.frogId] : []));
      const mouths = renderedFrogs.map(frog => ({ id: frog.item.id, pose: frog.pose, x: frog.x, y: frog.y - 12 / sceneRect.height * 100 }));
      let changed = false;
      const next = current.flatMap(fly => {
        if (fly.caught) {
          if (pondElapsed(frameTick, fly.caught.tick) >= 5) { changed = true; return []; }
          return [fly];
        }
        const point = flyPosition(fly, frameTick);
        const from = { x: point.x + 16 / sceneRect.width * 100, y: point.y + 16 / sceneRect.height * 100 };
        const hunter = selectPondHunter(from, mouths, sceneRect.width, sceneRect.height, busy);
        if (!hunter) return [fly];
        busy.add(hunter.id);
        changed = true;
        return [{ ...fly, caught: { frogId: hunter.id, tick: frameTick, from, mouth: { x: hunter.x, y: hunter.y } } }];
      });
      // Preserve identity on idle ticks to avoid an effect/render feedback loop.
      return changed ? next : current;
    });
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
    <section className={`frog-pond-shell pond-living${pondOnly ? " pond-only" : ""} pond-labels-${config.labels} pond-light-${light} frog-theme-${config.theme} frog-density-${config.density}${motionEnabled ? " frog-animated" : ""}${allowReducedMotion ? " frog-motion-opt-in" : ""}${rearranging ? " frog-rearranging" : ""}${feeding ? " pond-feeding" : ""}${raining ? " pond-raining" : ""}`} data-testid="frog-pond-panel">
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
        <button ref={pondOnlyButton} type="button" className="button button-secondary" data-testid="pond-only-toggle" aria-pressed={pondOnly} onClick={() => { setPondOnly(!pondOnly); setRearranging(false); }}>{pondOnly ? (isSpanish ? "Salir de vista del estanque" : "Exit pond-only view") : (isSpanish ? "Solo estanque" : "Pond-only view")}</button>
        <span>{isSpanish ? "Su tablero, con un poco de vida." : "A little life in your workday."}</span>
        <label className="pond-food-choice">{isSpanish ? "Comida" : "Food"}<select data-testid="pond-food" value={food} onChange={event => setFood(event.target.value as "flies" | "algae")}><option value="flies">{isSpanish ? "Moscas para ranas" : "Flies for frogs"}</option><option value="algae">{isSpanish ? "Algas para renacuajos" : "Algae for tadpoles"}</option></select></label>
        <button type="button" className="button button-primary" data-testid="pond-feed" disabled={feeding || rearranging || !hasFoodGuests} onClick={() => feedPond()}>{feeding ? (isSpanish ? "Hora de comer!" : "Snack time!") : (isSpanish ? "Dar comida" : "Feed the pond")}</button>
        {!hasFoodGuests ? <small>{isSpanish ? "No hay vecinos visibles para esa comida." : "No visible neighbors eat this food."}</small> : null}
        <button type="button" className="button button-secondary" aria-pressed={sound} onClick={() => {
          if (sound) { setSound(false); return; }
          try {
            audioRef.current ??= new PondAudio();
            // Unlock audio in the user gesture so later pond events can play on mobile.
            void audioRef.current.resume(volume).catch(() => setSound(false));
            setSound(true);
          } catch { setSound(false); }
        }}>{sound ? (isSpanish ? "Sonido: activo" : "Sound: on") : (isSpanish ? "Sonido: apagado" : "Sound: off")}</button>
        {sound ? <label className="pond-food-choice">{isSpanish ? "Volumen" : "Pond volume"}<input type="range" min="0" max="100" step="5" value={Math.round(volume * 100)} onChange={event => setVolume(Number(event.target.value) / 100)} /></label> : null}
        <button type="button" className="button button-secondary" disabled={deviceMotionBlocked || rearranging} aria-pressed={!motionEnabled} onClick={() => updateConfig({ animated: !config.animated })}>{motionEnabled ? (isSpanish ? "Pausar movimiento" : "Pause motion") : (isSpanish ? "Activar movimiento" : "Resume motion")}</button>
        <button type="button" className="button button-secondary" aria-pressed={rearranging} onClick={() => setRearranging(!rearranging)}>{rearranging ? (isSpanish ? "Terminar" : "Done arranging") : (isSpanish ? "Organizar ranas" : "Arrange frogs")}</button>
        <small role="status" data-testid="pond-motion-status">{deviceMotionBlocked
          ? (isSpanish ? "Animaciones pausadas: movimiento reducido del dispositivo activo." : "Animations paused: Device reduced-motion setting is on")
          : rearranging ? (isSpanish ? "Animaciones pausadas mientras organiza las ranas." : "Animations paused while arranging frogs")
          : motionEnabled ? (isSpanish ? "Animaciones activas" : "Animations playing")
          : (isSpanish ? "Animaciones pausadas" : "Animations paused")}</small>
        {deviceMotionBlocked ? <button type="button" className="button button-secondary" onClick={() => { setAllowReducedMotion(true); updateConfig({ animated: true }); }}>{isSpanish ? "Activar animaciones de todos modos" : "Play animations anyway"}</button> : null}
        {reducedMotion && allowReducedMotion ? <button type="button" className="button button-secondary" onClick={() => setAllowReducedMotion(false)}>{isSpanish ? "Respetar movimiento reducido" : "Use device motion preference"}</button> : null}
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
        <label>{isSpanish ? "Etiquetas" : "Unit labels"}<select data-testid="pond-label-mode" value={config.labels} onChange={event => updateConfig({ labels: event.target.value as FrogPondConfig["labels"] })}><option value="quiet">{isSpanish ? "Al tocar o enfocar" : "On hover, tap or focus"}</option><option value="always">{isSpanish ? "Siempre visibles" : "Always visible"}</option></select></label>
        <label>{isSpanish ? "Luz" : "Lighting"}<select data-testid="pond-lighting" value={config.atmosphere} onChange={event => updateConfig({ atmosphere: event.target.value as FrogPondConfig["atmosphere"] })}><option value="auto">{isSpanish ? "Hora local" : "Local time"}</option><option value="day">{isSpanish ? "Dia" : "Day"}</option><option value="dusk">{isSpanish ? "Atardecer" : "Dusk"}</option><option value="night">{isSpanish ? "Noche" : "Night"}</option></select></label>
        <label>{isSpanish ? "Clima decorativo" : "Decorative weather"}<select data-testid="pond-weather" value={config.weather} onChange={event => updateConfig({ weather: event.target.value as FrogPondConfig["weather"] })}><option value="auto">{isSpanish ? "Lluvia ocasional" : "Occasional showers"}</option><option value="clear">{isSpanish ? "Despejado" : "Clear"}</option><option value="rain">{isSpanish ? "Lluvia" : "Rain"}</option></select></label>
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
          <button type="button" className="button" aria-pressed={collection.outfit === "natural" && !Object.keys(collection.outfits).length} onClick={() => setCollection(current => ({ ...current, outfit: "natural", outfits: {} }))}>{isSpanish ? "Estilo natural" : "Natural pond"}</button>
          {pondRewards.map(reward => <button type="button" className="button" key={reward.id} data-testid={`pond-reward-${reward.id}`} disabled={!rewardUnlocked(reward, collection)} aria-pressed={collection.outfit === reward.id} onClick={() => setCollection(current => ({ ...current, outfit: reward.id }))}><span className="pond-outfit-preview" aria-hidden="true" style={{ backgroundImage: `url(${frogSheets[reward.sheet].url})`, backgroundSize: `${frogSheets[reward.sheet].width}px ${frogSheets[reward.sheet].height}px` }} /><strong>{reward.name}</strong><small>{rewardUnlocked(reward, collection) ? discoveryDate(reward.id) : reward.hint}</small></button>)}
        </div>
        <h3>{isSpanish ? "Album de descubrimientos" : "Discovery scrapbook"}</h3>
        <p className="muted">{isSpanish ? "Estilos generales arriba; toque una rana para vestirla individualmente. Estilo natural quita todos los accesorios." : "Choose the pond's default outfit above, or tap a frog to dress it individually. Natural pond removes every outfit override."}</p>
        <ul className="pond-journal">
          <li>{collection.greeted ? `${isSpanish ? "Primer saludo" : "First hello"} / ${discoveryDate("hello")}` : (isSpanish ? "Un vecino espera un saludo..." : "A little neighbor is waiting for a hello...")}</li>
          <li>{collection.feeds >= 3 ? (isSpanish ? "Club de meriendas: descubierto" : "Snack club: discovered") : (isSpanish ? "Vuelva con tres meriendas..." : "Come back with three snacks...")}</li>
          <li>{collection.visitor ? `${isSpanish ? "Libelula visitante" : "Dragonfly visitor"} / ${discoveryDate("visitor")}` : (isSpanish ? "Espere junto al agua; busque alas brillantes..." : "Linger by the water; watch for shimmering wings...")}</li>
        </ul>
      </details>
      <div className="pond-greeting" role="status" data-testid="pond-greeting">
        {feeding ? (collection.feeds >= 3 ? (isSpanish ? "Descubrio Secret shades. Revise su coleccion!" : "Secret shades discovered. Check your collection!") : (isSpanish ? "Los vecinos se acercan a la merienda." : "Nearby neighbors are heading for a snack.")) : greetingId && scopedItems.some(item => item.id === greetingId) ? <><span>{greetedTadpole ? (isSpanish ? "Bloop! El renacuajo hace burbujas." : "Bloop! Your tadpole sends a little bubble.") : (isSpanish ? "Ribbit! Su rana lo saluda." : "Ribbit! A tiny wave, just for you.")}</span><button type="button" className="button button-secondary" data-testid="pond-open-unit" onClick={() => onOpenItem(greetingId)}>{isSpanish ? "Abrir unidad" : "Open unit"} {scopedItems.find(item => item.id === greetingId)?.unitNumber}</button></> : (isSpanish ? "Toque un vecino para saludar, o el agua para dar comida." : "Tap a neighbor to say hello, or tap the water to drop a snack.")}
      </div>

      {selectedCreature ? <section className="pond-creature-actions" data-testid="pond-creature-actions" aria-label={isSpanish ? "Acciones del vecino" : "Creature actions"}>
        <strong>{displayUnitNumber(selectedCreature.item.property.code, selectedCreature.item.unitNumber)}</strong>
        <span data-testid="pond-personality">{({ curious: isSpanish ? "Curioso" : "Curious", sleepy: isSpanish ? "Dormilon" : "Sleepy", shy: isSpanish ? "Timido" : "Shy", energetic: isSpanish ? "Energetico" : "Energetic" })[pondPersonality(stableNumber(selectedCreature.item.id))]}</span>
        <button type="button" className="button button-secondary" disabled={feeding || rearranging} data-testid="pond-feed-selected" onClick={() => feedPond({ x: selectedCreature.x, y: selectedCreature.y }, greetedTadpole ? "algae" : "flies")}>{greetedTadpole ? (isSpanish ? "Dar algas" : "Offer algae") : (isSpanish ? "Dar moscas" : "Offer flies")}</button>
        {!greetedTadpole ? <label>{isSpanish ? "Estilo de esta rana" : "This frog's outfit"}<select data-testid="pond-individual-outfit" value={collection.outfits[selectedCreature.item.id] ?? "inherit"} onChange={event => {
          const value = event.target.value;
          setCollection(current => { const outfits = { ...current.outfits }; if (value === "inherit") delete outfits[selectedCreature.item.id]; else outfits[selectedCreature.item.id] = value; return { ...current, outfits }; });
        }}><option value="inherit">{isSpanish ? "Estilo del estanque" : "Pond default"}</option><option value="natural">{isSpanish ? "Sin accesorios" : "No accessories"}</option>{pondRewards.map(reward => <option key={reward.id} value={reward.id} disabled={!rewardUnlocked(reward, collection)}>{reward.name}{rewardUnlocked(reward, collection) ? "" : ` / ${reward.hint}`}</option>)}</select></label> : <small>{isSpanish ? "Los renacuajos no usan sombreros." : "Tadpoles do not wear hats."}</small>}
        <button type="button" className="button button-secondary" onClick={() => { setGreetingId(null); setHeld(null); }}>{isSpanish ? "Cerrar" : "Dismiss"}</button>
      </section> : null}

      {scopedItems.length === 0 ? (
        <div className="frog-empty" data-testid="frog-empty-state">
          <strong>{isSpanish ? "No hay ranas en este estanque." : "No frogs in this pond."}</strong>
          <span>{isSpanish ? "Pruebe un filtro de propiedad mas amplio o cambie la metrica." : "Try a broader property filter or switch the metric source."}</span>
        </div>
      ) : (
        <div ref={sceneRef} className="frog-pond-scene" data-testid="frog-pond-scene" aria-label={isSpanish ? "Visualizacion operativa de Frog Pond" : "Frog Pond operational visualization"} onClick={event => {
          if ((event.target as HTMLElement).closest("button")) return;
          const rect = event.currentTarget.getBoundingClientRect();
          feedPond({ x: clamp((event.clientX - rect.left) / rect.width * 100, 12, 88), y: clamp((event.clientY - rect.top) / rect.height * 100, pondMinY, pondMaxY - 3) });
        }} style={{ "--pond-image": `url("${activePond.url}")`, "--pond-height": `${sceneHeight}px` } as CSSProperties}>
          <div className="pond-atmosphere" aria-hidden="true"><div className="pond-water-light" />{Array.from({ length: 7 }, (_, i) => <i key={i} style={{ "--mote": i, left: `${12 + i * 12}%`, top: `${24 + (i % 3) * 15}%` } as CSSProperties} />)}</div>
          <div className="pond-light-wash" aria-hidden="true" />
          {renderedFrogs.filter(frog => frog.pose !== "tadpole").flatMap(frog => (rearranging ? [naturalPositions[frog.item.id]] : pondPads(naturalPositions[frog.item.id], sceneWidth, sceneHeight)).map((point, i) => <span key={`${frog.item.id}-${i}`} className="pond-resting-pad" aria-hidden="true" style={{ left: `${point.x}%`, top: `${point.y}%` }} />))}
          {raining ? <div className="pond-rain" aria-hidden="true">{Array.from({ length: 22 }, (_, i) => <i key={i} style={{ left: `${i * 4.5}%`, "--drop": i } as CSSProperties} />)}</div> : null}
          {celebration ? <div className="pond-celebration" role="status" data-testid="pond-celebration">{isSpanish ? "Otra unidad lista! Un chapuzon de celebracion." : "Another home ready! A little celebration splash."}<span aria-hidden="true">{Array.from({ length: 10 }, (_, i) => <i key={i} style={{ "--drop": i } as CSSProperties} />)}</span></div> : null}
          {visitorVisible ? <button type="button" className="pond-visitor" data-testid="pond-visitor" aria-label={isSpanish ? "Descubrir libelula visitante" : "Discover dragonfly visitor"} onClick={() => { setCollection(current => ({ ...current, visitor: true })); playSound("visitor"); }}><svg aria-hidden="true" viewBox="0 0 64 40"><path d="M30 18Q0 0 5 18L29 23M34 18Q64 0 59 18L35 23M30 24Q6 24 13 34L30 27M34 24Q58 24 51 34L34 27" fill="#ade7d6" stroke="#397d78" strokeWidth="2"/><path d="M32 10V38" stroke="#e4b44f" strokeWidth="5"/><circle cx="32" cy="9" r="5" fill="#9bd7a3"/></svg><span>{collection.visitor ? (isSpanish ? "Descubierta!" : "Discovered!") : (isSpanish ? "Una visita..." : "A visitor...")}</span></button> : null}
          <div className="pond-scene-caption" aria-hidden="true">{rearranging ? (isSpanish ? "Arrastre las ranas para organizarlas" : "Drag frogs to arrange your pond") : (isSpanish ? "Toque una rana para saludar" : "Tap a frog to say hello")}</div>
          {snack ? <div className={`pond-snacks pond-food-${snack.food}`} data-testid="pond-snack-target" aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <i key={i} style={{ left: `${snack.x + Math.cos(i) * 2}%`, top: `${snack.y + Math.sin(i) * 2}%`, "--snack": i } as CSSProperties} />)}</div> : null}
          {renderedFrogs.map(({ item, index, group, colorLabel, color, pose, sheet, achievementLabel, frame, tadpoleUrl, x, y }) => {
            const catching = flies.some(fly => fly.caught?.frogId === item.id);
            return (
              <button
                type="button"
                className={`frog-marker frog-pose-${pose}${catching ? " pond-catching" : ""}${snack?.guests.includes(item.id) ? " pond-snack-guest" : ""}${greetingId === item.id ? " pond-selected" : ""}`}
                key={item.id}
                data-testid={`frog-marker-${item.unitNumber.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                aria-label={`${displayUnitNumber(item.property.code, item.unitNumber)} / ${group} / ${colorLabel}`}
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
                  "--roam-time": `${7 + stableNumber(item.id) % 7}s`,
                  "--roam-delay": `${-(stableNumber(item.id) % 20)}s`,
                  zIndex: Math.round(y),
                } as CSSProperties}
                onClick={() => {
                  if (suppressClickRef.current || dragRef.current?.moved) {
                    suppressClickRef.current = false;
                    return;
                  }
                  setGreetingId(item.id);
                  setCollection(current => ({ ...current, greeted: true }));
                  playSound(pose === "tadpole" ? "bubble" : "frog");
                }}
                onPointerEnter={() => setHeld({ id: item.id, x, y })}
                onPointerLeave={event => { if (document.activeElement !== event.currentTarget) setHeld(null); }}
                onFocus={() => setHeld({ id: item.id, x, y })}
                onBlur={() => setHeld(null)}
                onPointerDown={(event) => startDrag(event, item.id)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                title={`${displayUnitNumber(item.property.code, item.unitNumber)} / ${group} / ${colorLabel}${achievementLabel ? ` / ${achievementLabel}` : ""}`}
              >
                <span className="frog-water-ring" aria-hidden="true" />
                <span className="frog-body" data-sprite-action={frame.action} aria-hidden="true"><i /><b /></span>
                {pose !== "tadpole" && snack?.guests.includes(item.id) ? <span className="pond-tongue" aria-hidden="true" /> : null}
                {catching || greetingId === item.id || snack?.guests.includes(item.id) ? <span className="frog-hello" aria-hidden="true">{pondGreeting(pose === "tadpole", catching || Boolean(snack?.guests.includes(item.id)))}</span> : pose === "sleeping" ? <span className="pond-idle-note" aria-hidden="true">zzz</span> : greetingId && held && Math.hypot(x - held.x, y - held.y) < 12 ? <span className="pond-idle-note" aria-hidden="true">{pose === "tadpole" ? "o o" : "..."}</span> : null}
                <strong>{displayUnitNumber(item.property.code, item.unitNumber)}</strong>
                <em><i style={{ background: color }} />{colorLabel}</em>
                {achievementLabel ? <small>{achievementLabel}</small> : null}
              </button>
            );
          })}
          <svg className="pond-catch-tongues" aria-hidden="true" width="100%" height="100%">
            {flies.filter(fly => fly.caught && pondElapsed(frameTick, fly.caught.tick) < 3).map(fly => {
              const catchEvent = fly.caught!;
              const retract = Math.min(1, pondElapsed(frameTick, catchEvent.tick) / 2);
              return <line key={fly.id} x1={`${catchEvent.mouth.x}%`} y1={`${catchEvent.mouth.y}%`} x2={`${catchEvent.from.x + (catchEvent.mouth.x - catchEvent.from.x) * retract}%`} y2={`${catchEvent.from.y + (catchEvent.mouth.y - catchEvent.from.y) * retract}%`} />;
            })}
          </svg>
          {flies.map((fly) => {
            const progress = fly.caught ? Math.min(1, pondElapsed(frameTick, fly.caught.tick) / 2) : 0;
            const rect = sceneRef.current?.getBoundingClientRect();
            const point = fly.caught ? { x: fly.caught.from.x + (fly.caught.mouth.x - fly.caught.from.x) * progress - 16 / (rect?.width || 1) * 100, y: fly.caught.from.y + (fly.caught.mouth.y - fly.caught.from.y) * progress - 16 / (rect?.height || 1) * 100 } : flyPosition(fly, frameTick);
            return (
            <span
              key={fly.id}
              className={`pond-fly${fly.reverse ? " pond-fly-reverse" : ""}`}
              aria-hidden="true"
              style={{
                left: `${point.x}%`,
                top: `${point.y}%`,
                opacity: progress >= 1 ? 0 : 1,
              } as CSSProperties}
            />
          ); })}
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
        <small>{isSpanish ? "Estilo natural: ranas sin accesorios. Elija estilos desbloqueados en la coleccion." : "Natural pond: hat-free frogs. Choose unlocked outfits in the collection."}</small>
      </div>
    </section>
  );
}
