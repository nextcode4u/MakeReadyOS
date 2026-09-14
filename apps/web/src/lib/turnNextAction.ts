import { awaitingFinalWalk, isTurnReady, normalizeTurnStatus, tradeDone, type TurnStatus } from "./turnStatus";

export type TurnNextStep = "repairs" | "painting" | "cleaning" | "inspection";

export function turnNextStep(item: TurnStatus, downSection = false): TurnNextStep | null {
  const vacancy = normalizeTurnStatus(item.vacancyStatus);
  if (item.isArchived || downSection || ["DOWN", "MODEL", "OCCUPIED"].includes(vacancy) || isTurnReady(item)) return null;
  // A future notice is planning information, not permission to inspect an occupied unit.
  if (["NTV", "NTV_LEASED", "NTV_NOT_LEASED"].includes(vacancy)) return null;
  if (awaitingFinalWalk(item)) return "inspection";
  if (normalizeTurnStatus(item.makeReadyStatus) !== "DONE") return "repairs";
  return tradeDone(item.paintStatus) ? "cleaning" : "painting";
}

const stageCategories: Record<TurnNextStep, string[]> = {
  repairs: ["MAKE_READY", "MAINTENANCE", "REPAIRS"],
  painting: ["PAINT", "PAINTING"],
  cleaning: ["CLEAN", "CLEANING"],
  inspection: ["FINAL_WALK_INSPECTION"],
};

// Free-text/custom categories are not guessed; the UI links to the complete work plan.
export function matchesTurnStep(step: TurnNextStep, category: string) {
  return stageCategories[step].includes(normalizeTurnStatus(category));
}
