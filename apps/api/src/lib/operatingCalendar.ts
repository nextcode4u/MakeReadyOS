import type { OperatingCalendar } from "@prisma/client";

export type OperatingCalendarPolicy = Pick<
  OperatingCalendar,
  "noWeekendScheduling" | "avoidMondayScheduling" | "avoidFridayScheduling"
>;

export const dateOffsetFields = ["moveOutDate", "vacatedDate", "makeReadyDate", "flooringDate", "moveInDate"] as const;
export type DateOffsetField = (typeof dateOffsetFields)[number];

export function isDateOffsetField(value: string): value is DateOffsetField {
  return (dateOffsetFields as readonly string[]).includes(value);
}

function startOfCalendarDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isAllowedOperatingDay(date: Date, calendar?: OperatingCalendarPolicy | null) {
  const day = date.getDay();
  if (calendar?.noWeekendScheduling && (day === 0 || day === 6)) return false;
  if (calendar?.avoidMondayScheduling && day === 1) return false;
  if (calendar?.avoidFridayScheduling && day === 5) return false;
  return true;
}

function moveOneDay(date: Date, direction: 1 | -1) {
  const next = startOfCalendarDay(date);
  next.setDate(next.getDate() + direction);
  return next;
}

export function applyBusinessDayOffset(source: Date, offsetDays: number, calendar?: OperatingCalendarPolicy | null) {
  if (!Number.isInteger(offsetDays) || offsetDays < -60 || offsetDays > 60) {
    throw new Error("Business-day offsets must be whole days between -60 and 60");
  }

  const direction: 1 | -1 = offsetDays < 0 ? -1 : 1;
  let current = startOfCalendarDay(source);
  let remaining = Math.abs(offsetDays);
  let guard = 0;

  if (remaining === 0) {
    while (!isAllowedOperatingDay(current, calendar)) {
      current = moveOneDay(current, 1);
      guard += 1;
      if (guard > 370) throw new Error("No allowed operating day could be found");
    }
    return current;
  }

  while (remaining > 0) {
    current = moveOneDay(current, direction);
    guard += 1;
    if (guard > 370) throw new Error("No allowed operating day could be found");
    if (isAllowedOperatingDay(current, calendar)) remaining -= 1;
  }

  return current;
}
