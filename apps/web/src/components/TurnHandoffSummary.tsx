import { turnText } from "../lib/turnLocale";
import { useQuery } from "@tanstack/react-query";
import { getFinalWalk, type MakeReadyItem } from "../lib/api";
import { awaitingFinalWalk, isTurnReady, normalizeTurnStatus } from "../lib/turnStatus";

export function TurnHandoffSummary({ item, onOpenFinal, language }: { item: MakeReadyItem; onOpenFinal: () => void; language: string }) {
  const inspection = awaitingFinalWalk(item);
  const ready = isTurnReady(item);
  const query = useQuery({ queryKey: ["final-walk", item.id], queryFn: () => getFinalWalk(item.id), refetchInterval: 15000, enabled: inspection && !item.isArchived });
  if (item.isArchived || ready) return null;
  if (!inspection) return normalizeTurnStatus(item.makeReadyStatus) === "DONE" ? <p className="turn-handoff-summary">{turnText(language, "Repairs are finished. Painting and cleaning still need to be Done or Not needed before the final-walk handoff.")}</p> : null;
  return <div className="turn-handoff-summary" data-testid="turn-handoff-summary">
    {query.isPending ? <p role="status">{turnText(language, "Checking final-walk assignment...")}</p> : query.isError ? <p role="alert">{turnText(language, "Final-walk assignment could not be verified.")} <button type="button" onClick={() => void query.refetch()}>{turnText(language, "Retry assignment")}</button></p> : <>
      <p><strong>{query.data?.block ? language === "es" ? `Siguiente: ${query.data.block.assignedUser.fullName} - inspección final` : `Next: ${query.data.block.assignedUser.fullName} - final walk` : turnText(language, "Final walk needs an inspector")}</strong></p>
      <p>{query.data?.block ? query.data.ready ? turnText(language, "The inspection is assigned in My Work. No separate send action is needed.") : turnText(language, "An inspector is assigned, but the latest readiness check is still waiting for trade completion.") : turnText(language, "Ask a manager to check the final-walk inspector order in Automations. Do not assume the inspection has been assigned.")}</p>
      {query.data?.blockers?.length ? <p>{language === "es" ? `Pendientes para aprobar: ${query.data.blockers.length}. Revísalos antes de la aprobación final.` : `${query.data.blockers.length} readiness ${query.data.blockers.length === 1 ? "blocker remains" : "blockers remain"}. Review them before final approval.`}</p> : null}
    </>}
    <button type="button" className="button button-secondary" onClick={onOpenFinal}>{turnText(language, "Open final walk & blockers")}</button>
  </div>;
}
