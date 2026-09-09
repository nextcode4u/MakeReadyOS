import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getFinalWalk, handoffFinalWalk, type CurrentUser } from "../lib/api";
import { FinalWalkReportEditor } from "./FinalWalkReportEditor";

type Props = { itemId: string; propertyId: string; propertyName: string; currentUser: CurrentUser; onMarkReady: (id: string) => Promise<void> };

function FinalWalkContent({ itemId, propertyId, propertyName, currentUser, onMarkReady }: Props) {
  const [reportOpen, setReportOpen] = useState(false);
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["final-walk", itemId], queryFn: () => getFinalWalk(itemId), refetchInterval: 15000 });
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showHandoff, setShowHandoff] = useState(false);
  const block = query.data?.block;
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
    } catch (error) { setError(error instanceof Error ? error.message : "Could not update final walk"); }
    finally { setBusy(false); }
  }
  return <div data-testid="final-walk-controls">
    {currentUser.role === "ADMIN" || query.data?.reportAvailable ? <button type="button" className="button button-secondary" onClick={() => setReportOpen(true)}>Inspection details / report</button> : null}
    {reportOpen ? <FinalWalkReportEditor propertyId={propertyId} propertyName={propertyName} itemId={itemId} onClose={() => setReportOpen(false)} /> : null}
    {query.data?.blockers?.length ? <div data-testid="turn-readiness-blockers"><strong>Before marking ready</strong><ul>{query.data.blockers.map((blocker, index) => <li key={index}>{blocker}</li>)}</ul><button type="button" className="button button-secondary" onClick={() => void query.refetch()}>Recheck completion blockers</button></div> : null}
    {query.isLoading ? <p>Loading final walk assignment...</p> : null}
    {query.error ? <p role="alert">Could not load final walk assignment. <button type="button" onClick={() => void query.refetch()}>Retry</button></p> : null}
    {block ? <><p><strong>Final walk: {block.assignedUser.fullName}</strong> / {block.plannedDate.slice(0, 10)}</p><p>{query.data?.ready ? "Ready for inspection" : "Scheduled; waiting for the turn to be marked complete."}</p>
      {!manager && block.assignedUserId === currentUser.id && query.data?.ready ? <button type="button" className="button button-primary" disabled={busy || !!query.data?.blockers?.length} onClick={() => void act(false)}>Final walk passed / mark ready</button> : null}
      {canHandoff ? <div>
        <button type="button" className="button button-secondary" disabled={busy} aria-expanded={showHandoff} onClick={() => setShowHandoff(value => !value)}>Cannot do this inspection?</button>
        {showHandoff ? <fieldset disabled={busy}><legend>Hand off inspection</legend><p>{query.data?.next ? `Next in line: ${query.data.next.fullName}` : "No eligible backup remains. Contact your manager; the walk stays assigned."}</p>{query.data?.next ? <><label>Handoff reason<textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} /></label><button type="button" className="button button-secondary" disabled={reason.trim().length < 3} onClick={() => void act(true)}>Hand off to next inspector</button></> : null}</fieldset> : null}
      </div> : null}
    </> : !query.isLoading && !query.error ? <p>{query.data?.reportAvailable ? "Final walk completed. Your saved inspection draft remains available for review and export; it is not a signed resident report." : "No named final walk inspector. A manager can configure the inspector order in Automations."}</p> : null}
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}

export function FinalWalkControls(props: Props) {
  return <FinalWalkContent key={props.itemId} {...props} />;
}
