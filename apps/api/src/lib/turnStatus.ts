export function isFinalWalkStatus(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_") === "FINAL_WALK";
}

export type TurnStages = { makeReadyStatus?: string | null; completionStatus?: string | null; vacancyStatus?: string | null; paintStatus?: string | null; cleaningStatus?: string | null };
const status = (value?: string | null) => String(value ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
// Operational readiness includes imported availability; it is not inspection evidence.
export function isTurnReady(item: TurnStages) {
  if (isFinalWalkStatus(item.makeReadyStatus)) return false;
  return ["VACANT_READY", "VACANT_LEASED_READY", "VACANT_NOT_LEASED_READY"].includes(status(item.vacancyStatus))
    || ["DONE", "YES", "COMPLETE", "COMPLETED"].includes(status(item.completionStatus));
}
export const repairsDone = (item: TurnStages) => status(item.makeReadyStatus) === "DONE" || isFinalWalkStatus(item.makeReadyStatus);
export const turnApproved = (item: TurnStages) => !isFinalWalkStatus(item.makeReadyStatus) && ["YES", "DONE", "COMPLETE", "COMPLETED"].includes(status(item.completionStatus));
export const tradeDone = (value?: string | null) => ["DONE", "COMPLETE", "COMPLETED", "NOT_NEEDED", "N/A"].includes(status(value));
export function awaitingFinalWalk(item: TurnStages) {
  // Retain existing explicit inspection handoffs; new turns use independent stage facts.
  return isFinalWalkStatus(item.makeReadyStatus) || (!isTurnReady(item) && repairsDone(item) && tradeDone(item.paintStatus) && tradeDone(item.cleaningStatus));
}

export function pendingTurnStages(item: TurnStages) {
  if (turnApproved(item) || isFinalWalkStatus(item.makeReadyStatus)) return [];
  return [
    ...(!repairsDone(item) ? ["Technician repairs are not finished. Record Make Ready Done before final walk."] : []),
    ...(!tradeDone(item.paintStatus) ? ["Painting is not finished. Record Done or Not needed before final walk."] : []),
    ...(!tradeDone(item.cleaningStatus) ? ["Cleaning is not finished. Record Done or Not needed before final walk."] : []),
  ];
}
