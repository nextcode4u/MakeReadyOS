import type { Unit } from "./api";

export function normalizeOccupancy(value: string): Unit["occupancyStatus"] {
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (["OCCUPIED", "OCC"].includes(normalized)) return "OCCUPIED";
  if (["VACANT_NOT_LEASED_READY", "VNL_READY", "VACANT_READY", "READY", "VR", "VACANT_MAKE_READY", "VACANT_AVAILABLE"].includes(normalized)) return "VACANT NOT LEASED READY";
  if (["VACANT_NOT_LEASED_NOT_READY", "VNL_NOT_READY", "VACANT_NOT_READY", "VACANT_NOT_LEASED", "VNL", "VACANT", "AVAILABLE"].includes(normalized)) return "VACANT NOT LEASED NOT READY";
  if (["NTV_NOT_LEASED", "NTV", "NOTICE", "NOTICE_TO_VACATE", "ON_NOTICE"].includes(normalized)) return "NTV NOT LEASED";
  if (["NTV_LEASED", "NOTICE_LEASED", "ON_NOTICE_LEASED"].includes(normalized)) return "NTV LEASED";
  if (["VACANT_LEASED_READY", "VL_READY"].includes(normalized)) return "VACANT LEASED READY";
  if (["VACANT_LEASED_NOT_READY", "VACANT_LEASED", "LEASED_VACANT", "VL"].includes(normalized)) return "VACANT LEASED NOT READY";
  if (["TO_PRE_WALK", "TO_PREWALK", "PRE_WALK", "PREWALK", "TO_WALK", "WALK"].includes(normalized)) return "TO PRE-WALK";
  if (["TO_SCOPE", "SCOPE"].includes(normalized)) return "TO SCOPE";
  if (["TO_FINAL_WALK", "FINAL_WALK", "FINALWALK", "QC", "FINAL_QC"].includes(normalized)) return "TO FINAL WALK";
  if (["DOWN", "DOWN_UNIT", "UNAVAILABLE"].includes(normalized)) return "DOWN";
  if (["MODEL", "MODEL_UNIT"].includes(normalized)) return "MODEL";
  return "UNKNOWN";
}

export function isReadyLikeOccupancy(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toUpperCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  return /\bREADY\b/.test(normalized) && !/\bNOT READY\b/.test(normalized);
}

export function isPhysicallyOccupiedStatus(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toUpperCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  return ["OCCUPIED", "NTV", "NTV NOT LEASED", "NTV LEASED"].includes(normalized);
}
