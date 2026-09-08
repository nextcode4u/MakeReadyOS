import { applyBusinessDayOffset, type OperatingCalendarPolicy } from "./operatingCalendar.js";
import { isSchedulableTurn } from "./turnSetup.js";

type ProjectionItem = {
  isArchived: boolean;
  vacancyStatus: string | null;
  completionStatus: string | null;
  moveOutDate: Date | null;
  vacatedDate: Date | null;
};

// Planning only: never write estimated dates into the actual turn or assign work.
export function isPlannableTurn(item: ProjectionItem) {
  if (item.isArchived) return false;
  const status = (item.vacancyStatus ?? "").trim().toUpperCase().replace(/[_-]/g, " ");
  const notice = ["NTV", "NTV LEASED", "NTV NOT LEASED"].includes(status);
  return (notice || isSchedulableTurn({ ...item, vacancyStatus: status })) && !["DONE", "YES", "GOOD", "COMPLETE", "COMPLETED"].includes((item.completionStatus ?? "").trim().toUpperCase());
}

export function plannedTurnStart(item: ProjectionItem, saved: unknown, calendar?: OperatingCalendarPolicy | null) {
  if (!isPlannableTurn(item)) return null;
  if (typeof saved === "string" && saved && Number.isFinite(Date.parse(saved))) return { date: saved, projected: false };
  const date = projectedTurnStart(item, calendar);
  return date ? { date, projected: true } : null;
}

export function projectedTurnStart(item: ProjectionItem, calendar?: OperatingCalendarPolicy | null) {
  if (!isPlannableTurn(item)) return null;
  const status = (item.vacancyStatus ?? "").trim().toUpperCase().replace(/[_-]/g, " ");
  const notice = ["NTV", "NTV LEASED", "NTV NOT LEASED"].includes(status);
  // A notice for the next vacancy must not reuse an old turn's actual vacate date.
  const source = notice ? item.moveOutDate : item.vacatedDate ?? item.moveOutDate;
  if (!source || !Number.isFinite(source.getTime())) return null;
  return applyBusinessDayOffset(source, 1, {
    noWeekendScheduling: true,
    avoidMondayScheduling: calendar?.avoidMondayScheduling ?? false,
    avoidFridayScheduling: calendar?.avoidFridayScheduling ?? false,
  }).toISOString();
}
