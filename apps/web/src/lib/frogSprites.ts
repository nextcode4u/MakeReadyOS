export type FrogSpriteFrame = { col: number; row: number; action: string };
type Clip = { row: number; startCol: number; frames: number; hold: number; action: string };

export function frogSpriteClips(width: number, pose: string, seed: number): Clip[] {
  const large = width === 512;
  const direction = seed % 8;
  // Full sheets use columns for actions and rows for directions. Accessory sheets
  // pack actions into rows instead; their empty right-hand tiles are not frames.
  const idle = { row: large ? direction : 0, startCol: 0, frames: 4, hold: 1, action: "idle" };
  const croak = { row: large ? direction : 0, startCol: 4, frames: large ? 4 : 2, hold: 1, action: "croak" };
  const jump = { row: large ? direction : 1, startCol: large ? 8 : 0, frames: large ? 4 : 5, hold: 1, action: "jump" };
  const hop = { row: large ? direction : 2, startCol: large ? 12 : 0, frames: large ? 4 : 5, hold: 1, action: "hop" };
  const worried = { row: large ? direction + 8 : 3, startCol: large ? 0 : 1, frames: large ? 5 : 4, hold: 1, action: "worried" };
  if (pose === "sleeping") return [{ ...idle, hold: 3 }, croak];
  if (pose === "worried" || pose === "alert") return [idle, worried, croak, hop];
  return [idle, croak, hop, idle, jump, croak];
}

export function frogSpriteFrame(width: number, pose: string, seed: number, tick: number): FrogSpriteFrame {
  const clips = frogSpriteClips(width, pose, seed);
  const period = clips.reduce((total, clip) => total + clip.frames * clip.hold, 0);
  let position = (tick + seed % period) % period;
  for (const clip of clips) {
    const duration = clip.frames * clip.hold;
    if (position < duration) return { row: clip.row, col: clip.startCol + Math.floor(position / clip.hold), action: clip.action };
    position -= duration;
  }
  return { col: 0, row: 0, action: "idle" };
}
