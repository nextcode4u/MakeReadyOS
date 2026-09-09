export function isFinalWalkStatus(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_") === "FINAL_WALK";
}
