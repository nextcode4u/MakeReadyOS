import type { LabelDefinition } from "./api";
import { isTurnReady, normalizeTurnStatus as normalized, tradeDone } from "./turnStatus";

type Turn = {
  makeReadyStatus?: string | null;
  completionStatus?: string | null;
  vacancyStatus?: string | null;
  paintStatus?: string | null;
  cleaningStatus?: string | null;
};

// DONE belongs to the technician's repair stage, not the entire turn.
export function repairStageDisplay(item: Turn, spanish = false): LabelDefinition | undefined {
  if (normalized(item.makeReadyStatus) !== "DONE") return undefined;
  // Availability imports can certify readiness without historical trade check-offs.
  const approved = isTurnReady(item);
  const pending = [
    !tradeDone(item.paintStatus) ? (spanish ? "pintura" : "painting") : null,
    !tradeDone(item.cleaningStatus) ? (spanish ? "limpieza" : "cleaning") : null,
  ].filter(Boolean).join(" / ");
  const displayName = approved
    ? (spanish ? "Unidad lista" : "Unit ready")
    : pending
      ? (spanish ? `Reparaciones listas; falta ${pending}` : `Repairs done; awaiting ${pending}`)
      : (spanish ? "Reparaciones listas; falta inspeccion final" : "Repairs done; awaiting final walk");
  return { id: "repair-stage", fieldKey: "makeReadyStatus", value: item.makeReadyStatus!, displayName,
    color: approved ? "#46d39c" : "#ffc673", textColor: approved ? "#06291c" : "#3a1f00", sortOrder: 0 };
}
