import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getFinalWalk, handoffFinalWalk, type CurrentUser } from "../lib/api";

export function FinalWalkControls({ itemId, currentUser, onMarkReady }: { itemId: string; currentUser: CurrentUser; onMarkReady: (id: string) => Promise<void> }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["final-walk", itemId], queryFn: () => getFinalWalk(itemId) });
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
      await client.invalidateQueries();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not update final walk"); }
    finally { setBusy(false); }
  }
  return <div data-testid="final-walk-controls">
    {query.isLoading ? <p>Loading final walk assignment...</p> : null}
    {query.error ? <p role="alert">Could not load final walk assignment. <button type="button" onClick={() => void query.refetch()}>Retry</button></p> : null}
    {block ? <><p><strong>Final walk: {block.assignedUser.fullName}</strong> / {block.plannedDate.slice(0, 10)}</p><p>{query.data?.ready ? "Ready for inspection" : "Scheduled; waiting for the turn to be marked complete."}</p>
      {canHandoff ? <fieldset disabled={busy}><legend>Cannot do this inspection?</legend><p>{query.data?.next ? `Next in line: ${query.data.next.fullName}` : "No eligible backup remains. Contact your manager; the walk stays assigned."}</p><label>Handoff reason<textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} /></label><button type="button" className="button button-secondary" disabled={!query.data?.next || reason.trim().length < 3} onClick={() => void act(true)}>Hand off to next inspector</button></fieldset> : null}
      {!manager && block.assignedUserId === currentUser.id && query.data?.ready ? <button type="button" className="button button-primary" disabled={busy} onClick={() => void act(false)}>Final walk passed / mark ready</button> : null}
    </> : !query.isLoading && !query.error ? <p>No named final walk inspector. A manager can configure the inspector order in Automations.</p> : null}
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}
