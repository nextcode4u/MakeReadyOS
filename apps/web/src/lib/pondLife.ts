export type PondPoint = { x: number; y: number };
export type PondSnack = PondPoint & { tick: number; guests: string[] };
const bound = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
export const pondElapsed = (tick: number, start: number) => (tick - start + 10000) % 10000;

// Bounded local journeys preserve each creature's territory without a visible grid.
// Frogs rest between hops; tadpoles follow a curved route with a short pause.
export function pondJourney(base: PondPoint, seed: number, tick: number, tadpole: boolean, width: number, height: number): PondPoint {
  const phase = ((tick + seed % 100) % 100) / 100;
  const leg = phase * 3;
  const hop = bound((leg % 1 - .65) / .35, 0, 1);
  const travel = tadpole ? Math.min(1, phase / .9) : (Math.floor(leg) + hop * hop * (3 - 2 * hop)) / 3;
  const angle = travel * Math.PI * 2;
  const radiusX = Math.min(8, 58 / Math.max(width, 1) * 100);
  const radiusY = Math.min(6, 42 / Math.max(height, 1) * 100);
  return {
    x: bound(base.x + Math.sin(angle) * radiusX, Math.min(32, 64 / Math.max(width, 1) * 100), Math.max(68, 100 - 64 / Math.max(width, 1) * 100)),
    y: bound(base.y + (1 - Math.cos(angle)) * radiusY / 2, 38, 88),
  };
}

export function approachSnack(point: PondPoint, snack: PondSnack | null, id: string, tick: number): PondPoint {
  if (!snack || !snack.guests.includes(id)) return point;
  const age = pondElapsed(tick, snack.tick);
  if (age >= 16) return point;
  const amount = Math.sin(age / 16 * Math.PI) ** 2;
  const index = snack.guests.indexOf(id);
  const angle = index / snack.guests.length * Math.PI * 2;
  return { x: point.x + (snack.x + Math.cos(angle) * 2 - point.x) * amount, y: point.y + (snack.y + Math.sin(angle) * 2 - point.y) * amount };
}

export function pondLight(hour: number): "day" | "dusk" | "night" {
  return hour >= 8 && hour < 17 ? "day" : hour >= 17 && hour < 20 || hour >= 6 && hour < 8 ? "dusk" : "night";
}

export function pondGreeting(tadpole: boolean, feeding: boolean) {
  return tadpole ? (feeding ? "nibble!" : "bloop!") : (feeding ? "nom!" : "ribbit!");
}
