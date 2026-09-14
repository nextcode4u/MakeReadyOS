import { isTurnReady } from "./turnStatus";

type Turn = { makeReadyStatus?: string | null; completionStatus?: string | null; vacancyStatus?: string | null; moveInDate?: string | null; overdue?: boolean; isArchived?: boolean };
export const pondReady = isTurnReady;

export function frogWarningMood(item: Turn, now = new Date()): "sick" | "scared" | null {
  if (item.isArchived || pondReady(item)) return null;
  // Compare calendar days, not elapsed hours, so DST and date-only values agree.
  const date = item.moveInDate?.slice(0, 10) ?? "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const moveIn = new Date(`${date}T00:00:00Z`);
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const days = (moveIn.getTime() - today) / 86400000;
    if (Number.isFinite(days) && moveIn.toISOString().slice(0, 10) === date && days >= 0 && days <= 3) return "scared";
  }
  return item.overdue ? "sick" : null;
}
