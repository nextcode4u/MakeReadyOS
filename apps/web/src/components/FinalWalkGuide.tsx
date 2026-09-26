import { turnText } from "../lib/turnLocale";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getFinalWalkSettings, saveFinalWalkSettings, type FinalWalkSettings, type Property } from "../lib/api";

function InspectorEditor({ propertyId, settings, onDraftChange, language }: { propertyId: string; settings: FinalWalkSettings; onDraftChange: (state: { dirty: boolean; busy: boolean }) => void; language: string }) {
  const client = useQueryClient();
  const [inspectors, setInspectors] = useState(settings.inspectors);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [savedInspectors, setSavedInspectors] = useState(settings.inspectors);
  const dirty = JSON.stringify(inspectors) !== JSON.stringify(savedInspectors);
  useEffect(() => { onDraftChange({ dirty, busy }); }, [dirty, busy, onDraftChange]);
  async function save(enabled: boolean) {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await saveFinalWalkSettings(propertyId, { enabled, inspectors });
      setSavedInspectors(inspectors);
      setMessage(enabled ? (language === "es" ? `Orden guardado. Inspecciones finales asignadas: ${result.assigned}. Los inspectores ven el trabajo solo cuando está listo para inspección.` : `Inspector order saved. ${result.assigned} final walks assigned. Inspectors see work only when the turn is ready for inspection.`) : turnText(language, "Automatic assignment paused. Existing inspections stay assigned."));
      await client.invalidateQueries();
    } catch (error) { setError(error instanceof Error ? error.message : turnText(language, "Could not save inspectors")); }
    finally { setBusy(false); }
  }
  return <div><p><strong>{settings.enabled ? turnText(language, "Enabled") : turnText(language, "Not enabled")}</strong>{turnText(language, ". Choose a primary inspector, then backups. The repair technician cannot approve their own work.")}</p>
    <fieldset disabled={busy}><legend>{turnText(language, "Final walk inspector order")}</legend>
      <ol>{inspectors.map((id, index) => <li key={id} className="final-walk-person"><span>{settings.staff.find(user => user.id === id)?.fullName ?? turnText(language, "Unavailable user")}{index === 0 ? turnText(language, " (primary)") : turnText(language, " (backup)")}</span><button type="button" className="button button-secondary" disabled={index === 0} aria-label={language === "es" ? `Subir inspector ${index + 1}` : `Move inspector ${index + 1} up`} onClick={() => { const next = [...inspectors]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setInspectors(next); }}>{turnText(language, "Move up")}</button><button type="button" className="button button-secondary" aria-label={language === "es" ? `Quitar inspector ${index + 1}` : `Remove inspector ${index + 1}`} onClick={() => setInspectors(inspectors.filter(entry => entry !== id))}>{turnText(language, "Remove")}</button></li>)}</ol>
      <label>{turnText(language, "Add inspector")}<select value="" onChange={event => { if (event.target.value) setInspectors([...inspectors, event.target.value]); }}><option value="">{turnText(language, "Choose staff with property access")}</option>{settings.staff.filter(user => !inspectors.includes(user.id)).map(user => <option key={user.id} value={user.id}>{user.fullName} / {user.role}</option>)}</select></label>
      <p>{turnText(language, "Saving assigns eligible Final Walk turns now. Existing inspections keep their assigned order; repair assignments stay unchanged.")}</p>
      <details><summary>{turnText(language, "How timing and backups work")}</summary><p>{turnText(language, "Inspectors receive an in-app notification and a My Work assignment only when a turn enters Final Walk, not from a future scheduled date.")}</p><p>{turnText(language, "Put the manager last if they should be the final backup. Handoffs skip inactive staff, people without property access, and the repair technician. Pausing stops new assignments; existing inspections stay assigned.")}</p></details>
      <button type="button" className="button button-primary" disabled={!inspectors.length || inspectors.some(id => !settings.staff.some(user => user.id === id))} onClick={() => void save(true)}>{turnText(language, "Save and assign final walks")}</button>
      {settings.enabled ? <button type="button" className="button button-secondary" onClick={() => void save(false)}>{turnText(language, "Pause new assignments")}</button> : null}
    </fieldset>{error ? <p role="alert">{error}</p> : null}{message ? <p role="status">{message}</p> : null}</div>;
}
export function FinalWalkGuide({ properties, language }: { properties: Property[]; language: string }) {
  const [propertyId, setPropertyId] = useState(properties.length === 1 ? properties[0].id : "");
  const [draft, setDraft] = useState({ dirty: false, busy: false });
  useEffect(() => {
    if (!draft.dirty && !draft.busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft.dirty, draft.busy]);
  const query = useQuery({ queryKey: ["final-walk-settings", propertyId], queryFn: () => getFinalWalkSettings(propertyId), enabled: Boolean(propertyId) });
  return <section className="turn-setup span-full" data-testid="final-walk-guide"><h2>{turnText(language, "Who does the final walk?")}</h2><p>{turnText(language, "Choose an independent inspector and backups per property. They see work only when the turn is ready for inspection.")}</p><label>{turnText(language, "Final walks for")}<select value={propertyId} disabled={draft.busy} onChange={event => {
    if (draft.dirty && !window.confirm(turnText(language, "Discard the unsaved inspector order and switch properties?"))) return;
    setDraft({ dirty: false, busy: false });
    setPropertyId(event.target.value);
  }}><option value="">{turnText(language, "Choose a property")}</option>{properties.map(property => <option key={property.id} value={property.id}>{property.code} / {property.name}</option>)}</select></label>
    {draft.dirty ? <p role="status">{turnText(language, "Unsaved inspector order. Save before leaving this setup.")}</p> : null}
    {query.isLoading ? <p>{turnText(language, "Loading inspectors...")}</p> : null}{query.error ? <p role="alert">{turnText(language, "Could not load inspectors.")} <button type="button" onClick={() => void query.refetch()}>{turnText(language, "Retry")}</button></p> : null}
    {query.data ? <InspectorEditor language={language} key={propertyId} propertyId={propertyId} settings={query.data} onDraftChange={setDraft} /> : null}
  </section>;
}
