import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getTurnAssignment, runTurnAssignment, saveTurnAssignment, type Property, type TurnAssignmentSettings, type TurnAssignmentShare } from "../lib/api";

function AssignmentEditor({ property, settings }: { property: Property; settings: TurnAssignmentSettings }) {
  const queryClient = useQueryClient();
  const [shares, setShares] = useState<TurnAssignmentShare[]>(settings.shares);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const total = shares.reduce((sum, share) => sum + (Number(share.percent) || 0), 0);
  const valid = shares.length > 0 && total === 100 && shares.every(share => Number.isInteger(share.percent) && share.percent > 0 && settings.staff.some(user => user.id === share.userId));
  async function save(enabled: boolean) {
    setBusy(true); setError(""); setMessage("");
    let saved = false;
    try {
      await saveTurnAssignment(property.id, enabled ? shares : settings.shares, enabled);
      saved = true;
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
    <p>Use a percentage for each person; the property must total 100%. These are shares of new automatic assignments over time, not a daily workload cap. Manual assignments stay unchanged and do not count toward the split.</p>
    <p className="muted">Turn off any older auto-assignment rules for this property so they do not assign turns before this split runs.</p>
    {settings.warning ? <p role="alert">{settings.warning}</p> : null}
    <fieldset disabled={busy}><legend>Who handles this property's turns?</legend>
      <div className="turn-setup-stages">{shares.map((share, index) => <div key={share.userId}>
        <label>{settings.staff.find(user => user.id === share.userId)?.fullName ?? "Unavailable user (remove to resume)"}<span className="turn-setup-duration"><input aria-label={`Share for ${settings.staff.find(user => user.id === share.userId)?.fullName ?? share.userId}`} type="number" min="1" max="100" step="1" value={Number.isNaN(share.percent) ? "" : share.percent} onChange={event => setShares(shares.map((entry, i) => i === index ? { ...entry, percent: event.target.valueAsNumber } : entry))} /> %</span></label>
        <button className="button button-secondary" onClick={() => setShares(shares.filter((_, i) => i !== index))}>Remove</button>
      </div>)}</div>
      <label>Add person<select value="" onChange={event => { if (event.target.value) setShares([...shares, { userId: event.target.value, percent: Math.max(1, 100 - total) }]); }}><option value="">Choose eligible staff</option>{settings.staff.filter(user => !shares.some(share => share.userId === user.id)).map(user => <option key={user.id} value={user.id}>{user.fullName}</option>)}</select></label>
      <p><strong>Total: {total}%</strong>{total !== 100 ? " (must be 100%)" : ""}</p>
      <p>Only vacant, not-ready turns with a recorded Vacated date on or before today are assigned. Ready, completed, archived, unknown-status and notice-to-vacate units are skipped. Changing percentages starts a new balancing cycle; saving the same split or restarting the server keeps your place.</p>
      <button className="button button-primary" disabled={!valid || busy} onClick={() => void save(true)}>{busy ? "Working..." : "Enable split and assign eligible turns"}</button>
      {settings.enabled ? <button className="button button-secondary" onClick={() => void save(false)}>Pause automatic assignment</button> : null}
    </fieldset>
    {error ? <p role="alert" className="error-text">{error}</p> : null}
    {message ? <p role="status">{message}</p> : null}
  </div>;
}

export function TurnAssignmentGuide({ properties }: { properties: Property[] }) {
  const [propertyId, setPropertyId] = useState(properties.length === 1 ? properties[0].id : "");
  const query = useQuery({ queryKey: ["turn-assignment", propertyId], queryFn: () => getTurnAssignment(propertyId), enabled: Boolean(propertyId) });
  const property = properties.find(property => property.id === propertyId);
  return <section className="turn-setup span-full" data-testid="turn-assignment-guide">
    <h2>Automatically split turns between your team</h2>
    <p>Configure each property separately. Example: VAB sends 100% to you; TA sends 25% to you and 75% to its tech. Staff must have access to the selected property.</p>
    <label>Assign turns for<select value={propertyId} onChange={event => setPropertyId(event.target.value)}><option value="">Choose a property</option>{properties.map(property => <option key={property.id} value={property.id}>{property.code} / {property.name}</option>)}</select></label>
    {query.isLoading ? <p>Loading assignment settings...</p> : null}
    {query.error ? <p role="alert">{query.error instanceof Error ? query.error.message : "Could not load settings"}</p> : null}
    {property && query.data ? <AssignmentEditor key={propertyId} property={property} settings={query.data} /> : null}
  </section>;
}
