import { UserRole, type OperatingCalendar } from "@prisma/client";
import { prisma } from "./prisma.js";
import { notifyPropertyRoles } from "./notifications.js";

type Calendar = Pick<OperatingCalendar, "timezone" | "noWeekendScheduling" | "avoidMondayScheduling" | "avoidFridayScheduling" | "maintenanceStartMinute" | "maintenanceEndMinute">;

export function poolReminderDate(now: Date, calendar?: Calendar | null): string | null {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: calendar?.timezone ?? "America/Chicago",
      year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(now);
  } catch {
    // A malformed timezone must not send reminders at an arbitrary server time.
    return null;
  }
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)!.value;
  const day = value("weekday");
  if ((calendar?.noWeekendScheduling ?? true) && (day === "Sat" || day === "Sun")) return null;
  if (calendar?.avoidMondayScheduling && day === "Mon") return null;
  if (calendar?.avoidFridayScheduling && day === "Fri") return null;
  const minute = Number(value("hour")) * 60 + Number(value("minute"));
  if (minute < (calendar?.maintenanceStartMinute ?? 480) || minute >= (calendar?.maintenanceEndMinute ?? 1020)) return null;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export async function notifyMissingPoolLogs(input: {
  propertyId: string;
  facilities: Array<{ id: string; name: string }>;
}, now = new Date()) {
  if (!input.facilities.length) return;
  const calendar = await prisma.operatingCalendar.findUnique({ where: { propertyId: input.propertyId } });
  const dateKey = poolReminderDate(now, calendar);
  if (!dateKey) return;
  // logDate is a calendar date, not the UTC instant at local midnight.
  const entries = await prisma.poolLogEntry.findMany({
    where: {
      propertyId: input.propertyId,
      logDate: { gte: new Date(`${dateKey}T00:00:00.000Z`), lte: new Date(`${dateKey}T23:59:59.999Z`) },
    },
    select: { facilityId: true },
  });
  const logged = new Set(entries.map(entry => entry.facilityId));
  await Promise.all(input.facilities.filter(facility => !logged.has(facility.id)).map(facility => notifyPropertyRoles({
    propertyId: input.propertyId,
    roles: [UserRole.ADMIN, UserRole.MANAGER],
    category: "SCHEDULE",
    title: `Pool log missing: ${facility.name}`,
    message: `${facility.name} has no daily pool/spa log for ${dateKey}.`,
    dedupeKey: `pool-missing-log:${facility.id}:${dateKey}`,
  })));
}
