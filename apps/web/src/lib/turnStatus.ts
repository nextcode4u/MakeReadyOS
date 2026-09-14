export type TurnStatus = {
  makeReadyStatus?: string | null;
  completionStatus?: string | null;
  vacancyStatus?: string | null;
  paintStatus?: string | null;
  cleaningStatus?: string | null;
  isArchived?: boolean;
};

export const normalizeTurnStatus = (value?: string | null) => String(value ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");

// Kept in agreement with the API contract by turn-status-consistency.test.ts.
export function isTurnReady(item: TurnStatus) {
  if (normalizeTurnStatus(item.makeReadyStatus) === "FINAL_WALK") return false;
  return ["YES", "DONE", "COMPLETE", "COMPLETED"].includes(normalizeTurnStatus(item.completionStatus))
    || ["VACANT_READY", "VACANT_LEASED_READY", "VACANT_NOT_LEASED_READY"].includes(normalizeTurnStatus(item.vacancyStatus));
}

export const tradeDone = (value?: string | null) => ["DONE", "COMPLETE", "COMPLETED", "NOT_NEEDED", "N/A"].includes(normalizeTurnStatus(value));

export function awaitingFinalWalk(item: TurnStatus) {
  return normalizeTurnStatus(item.makeReadyStatus) === "FINAL_WALK"
    || (!isTurnReady(item) && normalizeTurnStatus(item.makeReadyStatus) === "DONE" && tradeDone(item.paintStatus) && tradeDone(item.cleaningStatus));
}

export function turnStageLabel(item: TurnStatus, downSection = false) {
  const vacancy = normalizeTurnStatus(item.vacancyStatus);
  if (item.isArchived) return "Archived turn";
  if (downSection || ["DOWN", "MODEL"].includes(vacancy)) return "Down / model unit - outside the normal turn queue";
  if (vacancy === "OCCUPIED") return "Occupied unit";
  if (["NTV", "NTV_LEASED", "NTV_NOT_LEASED"].includes(vacancy)) return "Upcoming turn - awaiting vacancy";
  if (isTurnReady(item)) return "Unit ready";
  if (awaitingFinalWalk(item)) return "Ready for final walk";
  if (normalizeTurnStatus(item.makeReadyStatus) !== "DONE") return "Repairs pending completion";
  return tradeDone(item.paintStatus) ? "Waiting for cleaning" : "Waiting for painting";
}
