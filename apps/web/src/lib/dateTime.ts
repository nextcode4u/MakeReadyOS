import type { UserLanguage } from "./api";
import { localeForLanguage } from "./i18n";

export type ClockMode = "12h" | "24h";

export const clockModeStorageKey = "makereadyos.clockMode";

export function readClockMode(): ClockMode {
  if (typeof window === "undefined") return "12h";
  try {
    return window.localStorage.getItem(clockModeStorageKey) === "24h" ? "24h" : "12h";
  } catch {
    return "12h";
  }
}

function hour12(mode = readClockMode()) {
  return mode === "12h";
}

export function formatDateTime(value: string | Date | null | undefined, mode = readClockMode(), language?: UserLanguage | string) {
  if (!value) return "never";
  return new Intl.DateTimeFormat(localeForLanguage(language), {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: hour12(mode),
  }).format(new Date(value));
}

export function formatTime(value: string | Date | null | undefined, mode = readClockMode(), language?: UserLanguage | string) {
  if (!value) return "";
  return new Intl.DateTimeFormat(localeForLanguage(language), {
    timeStyle: "short",
    hour12: hour12(mode),
  }).format(new Date(value));
}

function parseDateOnly(value: string | Date) {
  if (value instanceof Date) return value;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return new Date(value);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function ordinal(day: number) {
  if (day >= 11 && day <= 13) return `${day}th`;
  const suffix = day % 10 === 1 ? "st" : day % 10 === 2 ? "nd" : day % 10 === 3 ? "rd" : "th";
  return `${day}${suffix}`;
}

export function formatDateDisplay(value: string | Date | null | undefined, now = new Date(), language?: UserLanguage | string) {
  if (!value) return "";
  const date = parseDateOnly(value);
  const locale = localeForLanguage(language);
  if (locale.startsWith("es")) {
    return date.getFullYear() === now.getFullYear()
      ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(date)
      : new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(date);
  }
  const month = new Intl.DateTimeFormat(locale, { month: "short" }).format(date);
  if (date.getFullYear() === now.getFullYear()) {
    return `${month} ${ordinal(date.getDate())}`;
  }
  return `${month} ${ordinal(date.getDate())}, ${date.getFullYear()}`;
}

export function localDateStamp(input = new Date()) {
  const year = input.getFullYear();
  const month = String(input.getMonth() + 1).padStart(2, "0");
  const day = String(input.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayInputValue(input = new Date()) {
  return localDateStamp(input);
}

export function formatDateInput(value: string | Date | null | undefined) {
  if (!value) return "";
  if (value instanceof Date) return localDateStamp(value);
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match ? match[1] : localDateStamp(new Date(value));
}
