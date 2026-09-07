export type PondPoint = { x: number; y: number };
export type PondSnack = PondPoint & { tick: number; guests: string[]; food?: "flies" | "algae" };
const bound = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
export const pondElapsed = (tick: number, start: number) => (tick - start + 10000) % 10000;
export const pondSnackDuration = (snack: PondSnack) => snack.food === "flies" ? 26 : 16;
export const snackCatchAge = (snack: PondSnack, index: number, tick: number) => pondElapsed(tick, snack.tick) - (9 + index * 3);
export const pondPersonality = (seed: number) => (["curious", "sleepy", "shy", "energetic"] as const)[seed % 4];

export function pondPads(base: PondPoint, width: number, height: number): PondPoint[] {
  return [0, 1, 2].map(index => {
    const angle = index / 3 * Math.PI * 2;
    return { x: bound(base.x + Math.sin(angle) * Math.min(8, 58 / Math.max(width, 1) * 100), Math.min(32, 64 / Math.max(width, 1) * 100), Math.max(68, 100 - 64 / Math.max(width, 1) * 100)), y: bound(base.y + (1 - Math.cos(angle)) * Math.min(6, 42 / Math.max(height, 1) * 100) / 2, 38, 88) };
  });
}

// Bounded local journeys preserve each creature's territory without a visible grid.
// Frogs rest between hops; tadpoles follow a curved route with a short pause.
export function pondJourney(base: PondPoint, seed: number, tick: number, tadpole: boolean, width: number, height: number): PondPoint {
  const temperament = pondPersonality(seed);
  const period = temperament === "energetic" ? 80 : temperament === "sleepy" ? 200 : temperament === "shy" ? 125 : 100;
  const phase = ((tick + seed % period) % period) / period;
  const leg = phase * 3;
  const rest = temperament === "shy" ? .8 : temperament === "curious" ? .5 : .65;
  const hop = bound((leg % 1 - rest) / (1 - rest), 0, 1);
  if (!tadpole) {
    const pads = pondPads(base, width, height);
    const from = pads[Math.floor(leg)]; const to = pads[(Math.floor(leg) + 1) % 3];
    const amount = hop * hop * (3 - 2 * hop);
    return { x: from.x + (to.x - from.x) * amount, y: from.y + (to.y - from.y) * amount };
  }
  const travel = tadpole ? Math.min(1, phase / .9) : (Math.floor(leg) + hop * hop * (3 - 2 * hop)) / 3;
  const angle = travel * Math.PI * 2;
  const radiusX = Math.min(8, 58 / Math.max(width, 1) * 100);
  const radiusY = Math.min(6, 42 / Math.max(height, 1) * 100);
  return {
    x: bound(base.x + Math.sin(angle) * radiusX, Math.min(32, 64 / Math.max(width, 1) * 100), Math.max(68, 100 - 64 / Math.max(width, 1) * 100)),
    y: bound(base.y + (1 - Math.cos(angle)) * radiusY / 2, 38, 88),
  };
}

export function approachSnack(point: PondPoint, snack: PondSnack | null, id: string, tick: number, width = 960, height = 600): PondPoint {
  if (!snack || !snack.guests.includes(id)) return point;
  const age = pondElapsed(tick, snack.tick);
  if (age >= pondSnackDuration(snack)) return point;
  const progress = age < 7 ? age / 7 : age <= 21 ? 1 : (26 - age) / 5;
  const amount = snack.food === "flies" ? progress * progress * (3 - 2 * progress) : Math.sin(age / 16 * Math.PI) ** 2;
  const index = snack.guests.indexOf(id);
  const angle = index / snack.guests.length * Math.PI * 2;
  return { x: point.x + (snack.x + Math.cos(angle) * (snack.food === "flies" ? 32 / width * 100 : 2) - point.x) * amount, y: point.y + (snack.y + Math.sin(angle) * (snack.food === "flies" ? 32 / height * 100 : 2) - point.y) * amount };
}

export function pondLight(hour: number): "day" | "dusk" | "night" {
  return hour >= 8 && hour < 17 ? "day" : hour >= 17 && hour < 20 || hour >= 6 && hour < 8 ? "dusk" : "night";
}

export function pondGreeting(tadpole: boolean, feeding: boolean) {
  return tadpole ? (feeding ? "nibble!" : "bloop!") : (feeding ? "nom!" : "ribbit!");
}

export function selectPondHunter(fly: PondPoint, frogs: Array<PondPoint & { id: string; pose: string }>, width: number, height: number, busy: Set<string>) {
  return frogs.filter(frog => frog.pose !== "tadpole" && frog.pose !== "sleeping" && !busy.has(frog.id))
    .map(frog => ({ frog, distance: Math.hypot((frog.x - fly.x) * width / 100, (frog.y - fly.y) * height / 100) }))
    .filter(entry => entry.distance <= 36)
    .sort((a, b) => a.distance - b.distance)[0]?.frog;
}
