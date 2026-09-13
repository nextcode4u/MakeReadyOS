import type { LabelDefinition } from "./api";

type Turn = {
  makeReadyStatus?: string | null;
  completionStatus?: string | null;
  vacancyStatus?: string | null;
  paintStatus?: string | null;
  cleaningStatus?: string | null;
};
const normalized = (value?: string | null) => String(value ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
const tradeDone = (value?: string | null) => ["DONE", "COMPLETE", "COMPLETED", "NOT_NEEDED", "N/A"].includes(normalized(value));

// DONE belongs to the technician's repair stage, not the entire turn.
export function repairStageDisplay(item: Turn, spanish = false): LabelDefinition | undefined {
  if (normalized(item.makeReadyStatus) !== "DONE") return undefined;
  // Availability imports can certify readiness without historical trade check-offs.
  const approved = ["YES", "DONE", "COMPLETE", "COMPLETED"].includes(normalized(item.completionStatus))
    || ["VACANT_READY", "VACANT_LEASED_READY", "VACANT_NOT_LEASED_READY"].includes(normalized(item.vacancyStatus));
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
