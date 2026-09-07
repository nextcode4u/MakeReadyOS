import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getFinalWalkSettings, saveFinalWalkSettings, type FinalWalkSettings, type Property } from "../lib/api";

function InspectorEditor({ propertyId, settings }: { propertyId: string; settings: FinalWalkSettings }) {
  const client = useQueryClient();
  const [inspectors, setInspectors] = useState(settings.inspectors);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function save(enabled: boolean) {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await saveFinalWalkSettings(propertyId, { enabled, inspectors });
      setMessage(enabled ? `Inspector order saved. ${result.assigned} final walks assigned. Inspectors see work only when the turn is ready for inspection.` : "Automatic assignment paused. Existing inspections stay assigned.");
      await client.invalidateQueries();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save inspectors"); }
    finally { setBusy(false); }
  }
  return <div><p><strong>{settings.enabled ? "Enabled" : "Not enabled"}</strong>. Choose a primary inspector, then backups in handoff order. The repair tech assignment is not changed.</p>
    <fieldset disabled={busy}><legend>Final walk inspector order</legend>
      <ol>{inspectors.map((id, index) => <li key={id} className="final-walk-person"><span>{settings.staff.find(user => user.id === id)?.fullName ?? "Unavailable user"}{index === 0 ? " (primary)" : " (backup)"}</span><button type="button" className="button button-secondary" disabled={index === 0} aria-label={`Move inspector ${index + 1} up`} onClick={() => { const next = [...inspectors]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setInspectors(next); }}>Move up</button><button type="button" className="button button-secondary" aria-label={`Remove inspector ${index + 1}`} onClick={() => setInspectors(inspectors.filter(entry => entry !== id))}>Remove</button></li>)}</ol>
      <label>Add inspector<select value="" onChange={event => { if (event.target.value) setInspectors([...inspectors, event.target.value]); }}><option value="">Choose staff with property access</option>{settings.staff.filter(user => !inspectors.includes(user.id)).map(user => <option key={user.id} value={user.id}>{user.fullName} / {user.role}</option>)}</select></label>
      <p>Final walks are assigned, shown in My Work, and notified only when the turn enters Final Walk. Future scheduled dates do not create inspection assignments.</p>
      <p>Put the manager last if they should be the final backup. Each new inspection keeps its own copy of this order; editing settings does not reshuffle existing inspections. Handoffs skip inactive staff and people who lost property access.</p>
      <button type="button" className="button button-primary" disabled={!inspectors.length || inspectors.some(id => !settings.staff.some(user => user.id === id))} onClick={() => void save(true)}>Save and assign final walks</button>
      {settings.enabled ? <button type="button" className="button button-secondary" onClick={() => void save(false)}>Pause new assignments</button> : null}
    </fieldset>{error ? <p role="alert">{error}</p> : null}{message ? <p role="status">{message}</p> : null}</div>;
}
export function FinalWalkGuide({ properties }: { properties: Property[] }) {
  const [propertyId, setPropertyId] = useState(properties.length === 1 ? properties[0].id : "");
  const query = useQuery({ queryKey: ["final-walk-settings", propertyId], queryFn: () => getFinalWalkSettings(propertyId), enabled: Boolean(propertyId) });
  return <section className="turn-setup span-full" data-testid="final-walk-guide"><h2>Who does the final walk?</h2><p>Give final inspections their own owner and a clear backup, with assignments in My Work and in-app notifications when the unit is ready.</p><label>Final walks for<select value={propertyId} onChange={event => setPropertyId(event.target.value)}><option value="">Choose a property</option>{properties.map(property => <option key={property.id} value={property.id}>{property.code} / {property.name}</option>)}</select></label>
    {query.isLoading ? <p>Loading inspectors...</p> : null}{query.error ? <p role="alert">Could not load inspectors. <button type="button" onClick={() => void query.refetch()}>Retry</button></p> : null}
    {query.data ? <InspectorEditor key={propertyId} propertyId={propertyId} settings={query.data} /> : null}
  </section>;
}
