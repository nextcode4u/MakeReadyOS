export const pondWildlife = [
  { id: "strider", name: "Water strider", hint: "Skates across the water.", start: 0, end: 180 },
  { id: "butterfly", name: "Garden butterfly", hint: "Visits flowers in daylight.", start: 40, end: 220 },
  { id: "fireflies", name: "Firefly chorus", hint: "A familiar shape after dusk.", start: 80, end: 260 },
  { id: "snail", name: "Taking my time", hint: "A snail explores the bank.", start: 160, end: 350 },
  { id: "turtle", name: "Sunbathing turtle", hint: "A patient visitor on the bank.", start: 300, end: 480 },
  { id: "duck", name: "Passing duck", hint: "Paddles through, never in a hurry.", start: 490, end: 650 },
  { id: "axolotl", name: "Shy axolotl", hint: "Pink gills beneath the water.", start: 690, end: 880 },
] as const;
export type WildlifeId = typeof pondWildlife[number]["id"];
export const pondSecrets = [
  { theme: "pond-01", name: "Moon wish", action: "Make a moon wish", icon: "moon" },
  { theme: "pond-02", name: "Lotus bloom", action: "Open the lotus", icon: "flower" },
  { theme: "pond-03", name: "Lantern keeper", action: "Light the little lantern", icon: "lantern" },
  { theme: "pond-04", name: "Someone is home", action: "Knock on the cottage door", icon: "home" },
  { theme: "pond-05", name: "Mushroom umbrella", action: "Tap the mushroom", icon: "mushroom" },
  { theme: "pond-06", name: "Dungeon treasure", action: "Open the treasure chest", icon: "crate" },
  { theme: "pond-07", name: "Crystal melody", action: "Play low, high, middle", icon: "crystal" },
  { theme: "pond-08", name: "Disco splash", action: "Start a little dance party", icon: "disco" },
  { theme: "pond-09", name: "Sunset radio", action: "Tune the sunset radio", icon: "radio" },
  { theme: "pond-10", name: "Friendly haunting", action: "Say hello to the glowing eyes", icon: "ghost" },
  { theme: "pond-11", name: "Fireside story", action: "Open the storybook", icon: "book" },
  { theme: "pond-12", name: "Little barista", action: "Warm the coffee mug", icon: "mug" },
  { theme: "pond-13", name: "Mystery delivery", action: "Unpack the mystery crate", icon: "crate" },
  { theme: "pond-14", name: "Village gathering", action: "Ring the village bell", icon: "bell" },
  { theme: "pond-15", name: "Sunflower gardener", action: "Water the seed", icon: "flower" },
] as const;
export const pondAntics = [
  { id: "miss", name: "The one that got away" },
  { id: "sharing", name: "A snack for everyone" },
  { id: "chorus", name: "Ribbit round" },
  { id: "buddies", name: "Nap buddies" },
  { id: "celebration", name: "Ready, set, hop!" },
] as const;
export function wildlifeVisible(id: WildlifeId, tick: number, light: string) {
  const entry = pondWildlife.find(entry => entry.id === id)!;
  return tick % 900 >= entry.start && tick % 900 < entry.end
    && (id !== "butterfly" || light === "day") && (id !== "fireflies" || light !== "day");
}
export function localPondDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function gardenWaterings(discovered: Record<string, string>) {
  return Object.keys(discovered).filter(key => /^garden-\d{4}-\d{2}-\d{2}$/.test(key)).length;
}
export function pondSeason(month: number) {
  return month >= 2 && month <= 4 ? "spring" : month >= 5 && month <= 7 ? "summer" : month >= 8 && month <= 10 ? "autumn" : "winter";
}
