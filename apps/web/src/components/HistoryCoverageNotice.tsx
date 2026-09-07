import type { UnitHistoryResponse, UserLanguage } from "../lib/api";

export function HistoryCoverageNotice({ history, shownEvents, language }: { history?: UnitHistoryResponse; shownEvents: number; language: UserLanguage }) {
  if (!history) return null;
  const es = language === "es";
  return <p className="field-help" data-testid="history-coverage-notice">
    {es ? `Vista reciente: ${Math.min(shownEvents, history.events.length)} de ${history.events.length} eventos cargados. No es una auditoria completa.` : `Recent timeline: showing ${Math.min(shownEvents, history.events.length)} of ${history.events.length} loaded events. This is not a full audit.`}
    {" "}
    {es ? "Limites: 250 eventos combinados, 200 eventos de auditoria y 20 ejecuciones de automatizacion por rotacion." : "Limits: 250 combined events, 200 audit events, and 20 automation runs per turn."}
    {history.coverage?.truncated ? (es ? " Hay mas eventos fuera de estos limites." : "More events exist beyond these limits.") : ""}
  </p>;
}
