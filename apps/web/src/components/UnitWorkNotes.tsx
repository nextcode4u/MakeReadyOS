import { turnText } from "../lib/turnLocale";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getUnitWorkNotes, isApiError, saveUnitWorkNotes, type UnitWorkNotes as Notes } from "../lib/api";

export function UnitWorkNotes({ itemId, canEdit, language }: { itemId: string; canEdit: boolean; language: string }) {
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
    if (saving.current || draft && !window.confirm(turnText(language, "Discard your unsaved work notes and reload the saved notes?"))) return;
    saving.current = true; setBusy(true);
    try {
      const latest = await getUnitWorkNotes(itemId);
      client.setQueryData(key, latest); setDraft(null); setError(""); setMessage(turnText(language, "Saved notes reloaded."));
    } catch { setError(turnText(language, "Could not reload work notes. Your unsaved text is still here.")); }
    finally { saving.current = false; setBusy(false); }
  };
  return <section data-testid="unit-work-notes" className="unit-work-notes">
    <h4>{turnText(language, "Unit-specific work notes")}</h4>
    <p className="helper-copy">{turnText(language, "Unit-specific tasks without quantities, such as replacing damaged cabinet faces. Internal only; not on the resident report.")}</p>
    {query.isPending ? <p role="status">{turnText(language, "Loading work notes...")}</p> : null}
    {query.isError ? <p role="alert">{turnText(language, "Could not load or verify access to work notes.")} <button type="button" disabled={busy} onClick={() => void query.refetch()}>{turnText(language, "Retry")}</button></p> : null}
    {query.data && !denied ? <>
      <label className="drawer-field">{turnText(language, "Unit-specific work notes")}
        <textarea rows={4} maxLength={10000} value={draft?.notes ?? query.data.notes} disabled={busy || readOnly} placeholder={turnText(language, "Multiple cabinet faces need replacing.")} onChange={event => {
          setDraft({ ...(draft ?? query.data!), notes: event.target.value }); setError(""); setMessage("");
        }}/>
      </label>
      {!readOnly ? <div className="material-entry-actions">
        <button type="button" className="button button-primary" disabled={busy || !draft} onClick={async () => {
          if (!draft || saving.current) return;
          saving.current = true; setBusy(true); setError(""); setMessage("");
          try {
            const result = await saveUnitWorkNotes(itemId, { notes: draft.notes, version: draft.version });
            client.setQueryData(key, result); setDraft(null); setMessage(turnText(language, "Work notes saved."));
          } catch (cause) { setError(cause instanceof Error ? cause.message : turnText(language, "Could not save work notes. Your unsaved text is still here.")); }
          finally { saving.current = false; setBusy(false); }
        }}>{busy ? turnText(language, "Saving...") : turnText(language, "Save work notes")}</button>
        <button type="button" disabled={busy} onClick={() => void reload()}>{turnText(language, "Reload saved notes")}</button>
      </div> : <p className="helper-copy">{turnText(language, "Read-only work notes.")}</p>}
      {draft ? <p role="status">{turnText(language, "Unsaved work notes. Keep this page open until saved.")}</p> : null}
    </> : null}
    {error && !denied ? <p role="alert">{error}</p> : null}
    {message && !denied ? <p role="status">{message}</p> : null}
  </section>;
}
