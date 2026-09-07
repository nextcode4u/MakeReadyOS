import { addDays, startOfDay } from "./planningDates.js";

export function dashboardDateWindow(now = new Date()) {
  const today = startOfDay(now);
  const weekStart = addDays(today, -today.getUTCDay());
  const weekEnd = addDays(weekStart, 7);
  return {
    today,
    nextSeven: addDays(today, 7),
    inCurrentWeek: (date: Date | null) => Boolean(date && date >= weekStart && date < weekEnd),
    inDays: (date: Date | null, days: number) => Boolean(date && date >= today && date < addDays(today, days)),
    isOverdue: (date: Date | null) => Boolean(date && date < today),
  };
}

export function availabilityChangeTitle(status: string | null | undefined) {
  if (["VACANT_READY", "VACANT NOT LEASED READY", "VACANT LEASED READY"].includes(status ?? "")) return "Availability marked ready";
  if (status?.startsWith("NTV")) return "Availability updated notice";
  if (status?.includes("VACANT")) return "Availability updated vacancy";
  return "Availability synced";
}
