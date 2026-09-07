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
export function projectedTurnStart(item: ProjectionItem, calendar?: OperatingCalendarPolicy | null) {
  if (item.isArchived) return null;
  const status = (item.vacancyStatus ?? "").trim().toUpperCase().replace(/[_-]/g, " ");
  const notice = ["NTV", "NTV LEASED", "NTV NOT LEASED"].includes(status);
  if (!notice && !isSchedulableTurn({ ...item, vacancyStatus: status })) return null;
  if (["DONE", "YES", "GOOD", "COMPLETE", "COMPLETED"].includes((item.completionStatus ?? "").trim().toUpperCase())) return null;
  // A notice for the next vacancy must not reuse an old turn's actual vacate date.
  const source = notice ? item.moveOutDate : item.vacatedDate ?? item.moveOutDate;
  if (!source || !Number.isFinite(source.getTime())) return null;
  return applyBusinessDayOffset(source, 1, {
    noWeekendScheduling: true,
    avoidMondayScheduling: calendar?.avoidMondayScheduling ?? false,
    avoidFridayScheduling: calendar?.avoidFridayScheduling ?? false,
  }).toISOString();
}
