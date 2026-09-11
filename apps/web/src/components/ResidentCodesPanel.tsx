import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getResidentCodes, saveResidentCodes, type ResidentCodes } from "../lib/api";

export function ResidentCodesPanel({ itemId, status }: { itemId: string; status: string | null }) {
  const client = useQueryClient();
  const key = ["resident-codes", itemId, status];
  const query = useQuery({ queryKey: key, queryFn: () => getResidentCodes(itemId), gcTime: 0 });
  const [edit, setEdit] = useState<ResidentCodes | null>(null);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const current = edit ?? query.data;
  useEffect(() => {
    if (!edit) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [edit]);
  const change = (value: Partial<ResidentCodes["value"]>) => {
    if (current) setEdit({ ...current, value: { ...current.value, ...value } });
    setMessage("");
  };
  return <section className="drawer-section" data-testid="resident-codes-panel">
    <h3>Resident door &amp; access codes</h3>
    <p className="helper-copy">Enter the new code assigned to this resident's unit during the make-ready. Never enter shared gate, staff, or master codes. These are the same fields used by the Final-Walk Report.</p>
    {query.isPending ? <p role="status">Loading resident codes...</p> : null}
    {query.isError ? <p role="alert">Could not load resident codes. <button type="button" onClick={() => void query.refetch()}>Retry</button></p> : null}
    {current ? <form onSubmit={async event => {
      event.preventDefault();
      if (!edit || busy || query.data?.readOnly) return;
      setBusy(true); setError(""); setMessage("");
      try {
        const result = await saveResidentCodes(itemId, { version: edit.version, value: edit.value });
        client.setQueryData(key, result); setEdit(null); setShow(false);
        setMessage(result.value.includeResidentCodes ? "Resident codes saved and logged. They will appear on the Final-Walk Report." : "Resident codes saved and logged. Report inclusion is off.");
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save resident codes. Your entries are preserved."); }
      finally { setBusy(false); }
    }}>
      <fieldset className="turn-material-fields" disabled={busy || query.data?.readOnly}>
        <label>New resident door code<input autoComplete="new-password" type={show ? "text" : "password"} maxLength={60} value={current.value.residentDoorCode} onChange={event => change({ residentDoorCode: event.target.value })}/></label>
        <label>Resident-specific access code (optional)<input autoComplete="new-password" type={show ? "text" : "password"} maxLength={60} value={current.value.residentAccessCode} onChange={event => change({ residentAccessCode: event.target.value })}/></label>
        <label style={{ display: "flex", alignItems: "center" }}><input style={{ width: "auto" }} type="checkbox" checked={current.value.includeResidentCodes} onChange={event => change({ includeResidentCodes: event.target.checked })}/>Include these resident-only codes on the Final-Walk Report</label>
        <button className="button button-primary" type="submit" disabled={!edit}>{busy ? "Saving codes..." : "Save resident codes"}</button>
      </fieldset>
      <button type="button" className="button button-secondary" onClick={() => setShow(value => !value)}>{show ? "Hide codes" : "Show codes"}</button>
      {query.data?.readOnly ? <p className="helper-copy">Read-only here after handoff or archival. During final walk, the inspector or an admin can update the report.</p> : null}
      {edit ? <p role="status">Unsaved changes. Save before closing the unit. Codes are not stored as a browser draft.</p> : null}
      {current.updatedAt ? <p className="helper-copy">Report last saved: {new Date(current.updatedAt).toLocaleString()}</p> : null}
    </form> : null}
    {message ? <p role="status">{message}</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {edit || error ? <button type="button" disabled={busy} onClick={async () => {
      if (edit && !window.confirm("Discard unsaved codes and reload the saved values?")) return;
      const result = await query.refetch();
      if (result.isSuccess) { setEdit(null); setError(""); setShow(false); }
    }}>Reload saved codes</button> : null}
  </section>;
}
