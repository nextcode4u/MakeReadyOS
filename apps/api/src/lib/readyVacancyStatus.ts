export function readyVacancyStatus(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toUpperCase().replaceAll("_", " ");
  if (["VACANT LEASED", "VACANT LEASED READY", "VACANT LEASED NOT READY"].includes(normalized)) {
    return "VACANT LEASED READY";
  }
  if (["VACANT", "VACANT READY", "VACANT NOT LEASED", "VACANT NOT LEASED READY", "VACANT NOT LEASED NOT READY"].includes(normalized)) {
    return "VACANT NOT LEASED READY";
  }
  // Completing work is not evidence of a move-out, lease, or changed occupancy.
  return value ?? null;
}
