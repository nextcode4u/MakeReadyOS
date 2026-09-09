import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getTurnAssignment, runTurnAssignment, saveTurnAssignment, type Property, type TurnAssignmentSettings, type TurnAssignmentShare } from "../lib/api";

function AssignmentEditor({ property, settings, onDraftChange }: { property: Property; settings: TurnAssignmentSettings; onDraftChange: (state: { dirty: boolean; busy: boolean }) => void }) {
  const queryClient = useQueryClient();
  const [shares, setShares] = useState<TurnAssignmentShare[]>(settings.shares);
  const [savedShares, setSavedShares] = useState(settings.shares);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const dirty = JSON.stringify(shares) !== JSON.stringify(savedShares);
  useEffect(() => { onDraftChange({ dirty, busy }); }, [dirty, busy, onDraftChange]);
  const total = shares.reduce((sum, share) => sum + (Number(share.percent) || 0), 0);
  const valid = shares.length > 0 && total === 100 && shares.every(share => Number.isInteger(share.percent) && share.percent > 0 && settings.staff.some(user => user.id === share.userId));
  async function save(enabled: boolean) {
    setBusy(true); setError(""); setMessage("");
    let saved = false;
    try {
      await saveTurnAssignment(property.id, enabled ? shares : settings.shares, enabled);
      saved = true;
      if (enabled) setSavedShares(shares);
      if (enabled) {
        const result = await runTurnAssignment(property.id);
        setMessage(`Automatic assignment is on for ${property.code}. ${result.assigned} turn(s) assigned. New eligible turns are checked every 5 minutes.`);
        if (result.warning) setError(result.warning);
      } else setMessage("Automatic assignment paused. Existing assignments are unchanged.");
    } catch (error) { setError(`${saved ? "Settings saved, but the assignment run did not finish. Retrying is safe. " : ""}${error instanceof Error ? error.message : "Could not save assignment settings"}`); }
    finally { await queryClient.invalidateQueries(); setBusy(false); }
  }
  return <div data-testid="turn-assignment-editor">
    <p><strong>{settings.enabled ? "On" : "Off"} for {property.code} / {property.name}.</strong> {settings.eligible} unassigned, incomplete vacant turns are eligible now.</p>
    <p>Set each person's share. Total must be 100%. Existing manual assignments stay unchanged.</p>
    {settings.warning ? <p role="alert">{settings.warning}</p> : null}
    <fieldset disabled={busy}><legend>Who handles this property's turns?</legend>
      <div className="turn-setup-stages">{shares.map((share, index) => <div key={share.userId}>
        <label>{settings.staff.find(user => user.id === share.userId)?.fullName ?? "Unavailable user (remove to resume)"}<span className="turn-setup-duration"><input aria-label={`Share for ${settings.staff.find(user => user.id === share.userId)?.fullName ?? share.userId}`} type="number" min="1" max="100" step="1" value={Number.isNaN(share.percent) ? "" : share.percent} onChange={event => setShares(shares.map((entry, i) => i === index ? { ...entry, percent: event.target.valueAsNumber } : entry))} /> %</span></label>
        <button className="button button-secondary" onClick={() => setShares(shares.filter((_, i) => i !== index))}>Remove</button>
      </div>)}</div>
      <label>Add person<select value="" onChange={event => { if (event.target.value) setShares([...shares, { userId: event.target.value, percent: Math.max(1, 100 - total) }]); }}><option value="">Choose eligible staff</option>{settings.staff.filter(user => !shares.some(share => share.userId === user.id)).map(user => <option key={user.id} value={user.id}>{user.fullName}</option>)}</select></label>
      <p><strong>Total: {total}%</strong>{total !== 100 ? " (must be 100%)" : ""}</p>
      <p className="muted">Other assignment rules can take turns before this split. Review those rules if you already use assignment automations.</p>
      <details><summary>Which turns are assigned and how the split works</summary><p>Only vacant, not-ready turns with a recorded Vacated date on or before today are assigned. Ready, completed, archived, unknown-status and notice-to-vacate units are skipped.</p><p>Percentages balance new automatic assignments over time, not daily workload. Manual assignments do not count toward the split. Changing percentages starts a new balancing cycle; saving the same split or restarting the server keeps your place.</p><p>For example, one person can receive 100% at a smaller property and 25% at another, with the site's technician receiving the other 75%. Only staff with property access are listed.</p></details>
      <button className="button button-primary" disabled={!valid || busy} onClick={() => void save(true)}>{busy ? "Working..." : "Enable split and assign eligible turns"}</button>
      {settings.enabled ? <button className="button button-secondary" onClick={() => void save(false)}>Pause automatic assignment</button> : null}
    </fieldset>
    {error ? <p role="alert" className="error-text">{error}</p> : null}
    {message ? <p role="status">{message}</p> : null}
  </div>;
}

export function TurnAssignmentGuide({ properties }: { properties: Property[] }) {
  const [propertyId, setPropertyId] = useState(properties.length === 1 ? properties[0].id : "");
  const [draft, setDraft] = useState({ dirty: false, busy: false });
  useEffect(() => {
    if (!draft.dirty && !draft.busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft.dirty, draft.busy]);
  const query = useQuery({ queryKey: ["turn-assignment", propertyId], queryFn: () => getTurnAssignment(propertyId), enabled: Boolean(propertyId) });
  const property = properties.find(property => property.id === propertyId);
  return <section className="turn-setup span-full" data-testid="turn-assignment-guide">
    <h2>Automatically split turns between your team</h2>
    <p>Choose a property, add its staff, and set shares totaling 100%. Enabling assigns eligible turns now; existing manual assignments stay unchanged.</p>
    <label>Assign turns for<select value={propertyId} disabled={draft.busy} onChange={event => {
      if (draft.dirty && !window.confirm("Discard the unsaved assignment shares and switch properties?")) return;
      setDraft({ dirty: false, busy: false });
      setPropertyId(event.target.value);
    }}><option value="">Choose a property</option>{properties.map(property => <option key={property.id} value={property.id}>{property.code} / {property.name}</option>)}</select></label>
    {draft.dirty ? <p role="status">Unsaved assignment shares. Save before leaving this setup.</p> : null}
    {query.isLoading ? <p>Loading assignment settings...</p> : null}
    {query.error ? <p role="alert">{query.error instanceof Error ? query.error.message : "Could not load settings"} <button type="button" onClick={() => void query.refetch()}>Retry</button></p> : null}
    {property && query.data ? <AssignmentEditor key={propertyId} property={property} settings={query.data} onDraftChange={setDraft} /> : null}
  </section>;
}
