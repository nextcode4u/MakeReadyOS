import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getUnitWorkNotes, isApiError, saveUnitWorkNotes, type UnitWorkNotes as Notes } from "../lib/api";

export function UnitWorkNotes({ itemId, canEdit }: { itemId: string; canEdit: boolean }) {
  const client = useQueryClient();
  const key = ["unit-work-notes", itemId];
  const query = useQuery({ queryKey: key, queryFn: () => getUnitWorkNotes(itemId) });
  const [draft, setDraft] = useState<Notes | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const denied = isApiError(query.error) && [401, 403, 404].includes(query.error.status);
  const readOnly = !canEdit || query.data?.readOnly || denied;
  useEffect(() => {
    if (!draft) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft]);
  const reload = async () => {
    if (saving.current || draft && !window.confirm("Discard your unsaved work notes and reload the saved notes?")) return;
    saving.current = true; setBusy(true);
    try {
      const latest = await getUnitWorkNotes(itemId);
      client.setQueryData(key, latest); setDraft(null); setError(""); setMessage("Saved notes reloaded.");
    } catch { setError("Could not reload work notes. Your unsaved text is still here."); }
    finally { saving.current = false; setBusy(false); }
  };
  return <section data-testid="unit-work-notes" className="unit-work-notes">
    <h4>Unit-specific work notes</h4>
    <p className="helper-copy">Unit-specific tasks without quantities, such as replacing damaged cabinet faces. Internal only; not on the resident report.</p>
    {query.isPending ? <p role="status">Loading work notes...</p> : null}
    {query.isError ? <p role="alert">Could not load or verify access to work notes. <button type="button" disabled={busy} onClick={() => void query.refetch()}>Retry</button></p> : null}
    {query.data && !denied ? <>
      <label className="drawer-field">Unit-specific work notes
        <textarea rows={4} maxLength={10000} value={draft?.notes ?? query.data.notes} disabled={busy || readOnly} placeholder="Multiple cabinet faces need replacing." onChange={event => {
          setDraft({ ...(draft ?? query.data!), notes: event.target.value }); setError(""); setMessage("");
        }}/>
      </label>
      {!readOnly ? <div className="material-entry-actions">
        <button type="button" className="button button-primary" disabled={busy || !draft} onClick={async () => {
          if (!draft || saving.current) return;
          saving.current = true; setBusy(true); setError(""); setMessage("");
          try {
            const result = await saveUnitWorkNotes(itemId, { notes: draft.notes, version: draft.version });
            client.setQueryData(key, result); setDraft(null); setMessage("Work notes saved.");
          } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save work notes. Your unsaved text is still here."); }
          finally { saving.current = false; setBusy(false); }
        }}>{busy ? "Saving..." : "Save work notes"}</button>
        <button type="button" disabled={busy} onClick={() => void reload()}>Reload saved notes</button>
      </div> : <p className="helper-copy">Read-only work notes.</p>}
      {draft ? <p role="status">Unsaved work notes. Keep this page open until saved.</p> : null}
    </> : null}
    {error && !denied ? <p role="alert">{error}</p> : null}
    {message && !denied ? <p role="status">{message}</p> : null}
  </section>;
}
