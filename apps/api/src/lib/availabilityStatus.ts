export function isReadyAvailabilityStatus(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toUpperCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  return /\bREADY\b/.test(normalized) && !/\bNOT READY\b/.test(normalized);
}
