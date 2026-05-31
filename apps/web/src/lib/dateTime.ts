export type ClockMode = "12h" | "24h";

export const clockModeStorageKey = "makereadyos.clockMode";

export function readClockMode(): ClockMode {
  if (typeof window === "undefined") return "12h";
  return window.localStorage.getItem(clockModeStorageKey) === "24h" ? "24h" : "12h";
}

function hour12(mode = readClockMode()) {
  return mode === "12h";
}

export function formatDateTime(value: string | Date | null | undefined, mode = readClockMode()) {
  if (!value) return "never";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: hour12(mode),
  }).format(new Date(value));
}

export function formatTime(value: string | Date | null | undefined, mode = readClockMode()) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, {
    timeStyle: "short",
    hour12: hour12(mode),
  }).format(new Date(value));
}
