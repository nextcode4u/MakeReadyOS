import { turnBlocker, turnText } from "../lib/turnLocale";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getFinalWalk, handoffFinalWalk, type CurrentUser } from "../lib/api";
import { FinalWalkReportEditor } from "./FinalWalkReportEditor";
import { HelpTip } from "./HelpTip";

type Props = { itemId: string; propertyId: string; propertyName: string; currentUser: CurrentUser; onMarkReady: (id: string) => Promise<void> };

function FinalWalkContent({ itemId, propertyId, propertyName, currentUser, onMarkReady }: Props) {
  const language = currentUser.language;
  const [reportOpen, setReportOpen] = useState(false);
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["final-walk", itemId], queryFn: () => getFinalWalk(itemId), refetchInterval: 15000 });
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showHandoff, setShowHandoff] = useState(false);
  const block = query.isError ? undefined : query.data?.block;
  const manager = ["ADMIN", "MANAGER"].includes(currentUser.role);
  const canHandoff = block && (manager || block.assignedUserId === currentUser.id);
  async function act(handoff: boolean) {
    if (!block) return;
    setBusy(true); setError("");
    try {
      if (handoff) await handoffFinalWalk(itemId, { blockId: block.id, expectedAssigneeId: block.assignedUserId, reason });
      else await onMarkReady(itemId);
      setReason("");
      setShowHandoff(false);
      await client.invalidateQueries();
    } catch (error) { setError(error instanceof Error ? error.message : turnText(language, "Could not update final walk")); }
    finally { setBusy(false); }
  }
  return <div data-testid="final-walk-controls">
    <p className="helper-copy">{turnText(language, "Open the inspection report to record checks or send repair corrections. Approve only after the work passes.")} <HelpTip label={turnText(language, "Help with final-walk approval")}>{turnText(language, "The technician finishes repairs first. The assigned inspector reviews the unit independently. Sending an inspection to a backup is different from returning repair corrections to the technician.")}</HelpTip></p>
    {currentUser.role === "ADMIN" || query.data?.reportAvailable ? <button type="button" className="button button-secondary" onClick={() => setReportOpen(true)}>{turnText(language, "Inspection details / report")}</button> : null}
    {reportOpen ? <FinalWalkReportEditor language={language} propertyId={propertyId} propertyName={propertyName} itemId={itemId} onClose={() => setReportOpen(false)} /> : null}
    {!query.isError && query.data?.blockers?.length ? <div data-testid="turn-readiness-blockers"><strong>{turnText(language, "Before marking ready")}</strong><ul>{query.data.blockers.map((blocker, index) => <li key={index}>{turnBlocker(language, blocker)}</li>)}</ul><button type="button" className="button button-secondary" onClick={() => void query.refetch()}>{turnText(language, "Recheck completion blockers")}</button></div> : null}
    {query.isLoading ? <p>{turnText(language, "Loading final walk assignment...")}</p> : null}
    {query.error ? <p role="alert">{turnText(language, "Could not load final walk assignment.")} <button type="button" onClick={() => void query.refetch()}>{turnText(language, "Retry")}</button></p> : null}
    {!query.isError && query.data?.unitReady ? <p data-testid="final-walk-recorded-ready">{turnText(language, "Unit already recorded ready. Open Inspection details / report above to edit saved inspection details or download a report. Ready status alone does not confirm that a final walk was performed.")}</p> : block ? <><p><strong>{turnText(language, "Final walk:")} {block.assignedUser.fullName}</strong> / {block.plannedDate.slice(0, 10)}</p><p>{query.data?.ready ? turnText(language, "Ready for inspection. This assignment appears in the inspector's My Work; no separate send action is needed.") : turnText(language, "Waiting for repairs, painting and cleaning to finish. Scheduled dates do not complete the turn.")}</p>
      {!manager && block.assignedUserId === currentUser.id && query.data?.ready ? <button type="button" className="button button-primary" disabled={busy || !!query.data?.blockers?.length} onClick={() => void act(false)}>{turnText(language, "Final walk passed / mark ready")}</button> : null}
      {canHandoff ? <div>
        <button type="button" className="button button-secondary" disabled={busy} aria-expanded={showHandoff} onClick={() => setShowHandoff(value => !value)}>{turnText(language, "Cannot do this inspection?")}</button>
        {showHandoff ? <fieldset disabled={busy}><legend>{turnText(language, "Hand off inspection")}</legend><p>{query.data?.next ? language === "es" ? `Siguiente inspector: ${query.data.next.fullName}` : `Next in line: ${query.data.next.fullName}` : turnText(language, "No eligible backup remains. Contact your manager; the walk stays assigned.")}</p>{query.data?.next ? <><label>{turnText(language, "Handoff reason")}<textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} /></label><button type="button" className="button button-secondary" disabled={reason.trim().length < 3} onClick={() => void act(true)}>{turnText(language, "Hand off to next inspector")}</button></> : null}</fieldset> : null}
      </div> : null}
    </> : !query.isLoading && !query.error ? <p>{query.data?.reportAvailable ? turnText(language, "Final walk completed. Your saved inspection draft remains available for review and export; it is not a signed resident report.") : turnText(language, "No named final walk inspector. A manager can configure the inspector order in Automations.")}</p> : null}
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}

export function FinalWalkControls(props: Props) {
  return <FinalWalkContent key={props.itemId} {...props} />;
}
