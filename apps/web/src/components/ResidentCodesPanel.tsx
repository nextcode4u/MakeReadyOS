import { turnText } from "../lib/turnLocale";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getResidentCodes, isApiError, saveResidentCodes, type ResidentCodes, type FinalReportResult } from "../lib/api";

export function ResidentCodesPanel({ itemId, status, language }: { itemId: string; status: string | null; language: string }) {
  const client = useQueryClient();
  const key = ["resident-codes", itemId, status];
  const query = useQuery({ queryKey: key, queryFn: () => getResidentCodes(itemId), gcTime: 0 });
  const [edit, setEdit] = useState<ResidentCodes | null>(null);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const accessDenied = isApiError(query.error) && [401, 403, 404].includes(query.error.status);
  const current = accessDenied ? null : edit ?? query.data;
  const preparationReadOnly = query.data?.preparationReadOnly ?? query.data?.readOnly;
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
    <h3>{turnText(language, "Technician preparation & resident handoff")}</h3>
    <p className="helper-copy">{turnText(language, "Enter the new code assigned to this resident's unit during the make-ready. Never enter shared gate, staff, or master codes. These are the same fields used by the Final-Walk Report.")}</p>
    {query.isPending ? <p role="status">{turnText(language, "Loading resident codes...")}</p> : null}
    {query.isError ? <p role="alert">{turnText(language, "Could not load resident codes.")} <button type="button" onClick={() => void query.refetch()}>{turnText(language, "Retry")}</button></p> : null}
    {current ? <form onSubmit={async event => {
      event.preventDefault();
      if (!edit || busy || preparationReadOnly) return;
      if (query.data?.readOnly && (Object.keys(edit.value) as Array<keyof ResidentCodes["value"]>).some(field => field !== "technicianResults" && edit.value[field] !== query.data?.value[field])) {
        setError(turnText(language, "Resident handoff details became read-only. Your unsaved entries are preserved; reload saved values before revising preparation checks."));
        return;
      }
      setBusy(true); setError(""); setMessage("");
      try {
        const result = await saveResidentCodes(itemId, { version: edit.version, value: query.data?.readOnly ? { technicianResults: edit.value.technicianResults } : edit.value });
        client.setQueryData(key, result); setEdit(null); setShow(false);
        void client.invalidateQueries({ queryKey: ["final-report"] });
        void client.invalidateQueries({ queryKey: ["final-walk", itemId] });
        void client.invalidateQueries({ queryKey: ["my-work"] });
        void client.invalidateQueries({ queryKey: ["assigned-work"] });
        void client.invalidateQueries({ queryKey: ["planning", "item-drawer", itemId] });
        setMessage(turnText(language, "Preparation and resident details saved. Revised preparation checks require the inspector to reconfirm handoff; unit status is unchanged."));
      } catch (cause) { setError(cause instanceof Error ? cause.message : turnText(language, "Could not save resident codes. Your entries are preserved.")); }
      finally { setBusy(false); }
    }}>
      <fieldset className="turn-material-fields" disabled={busy || preparationReadOnly}>
        {current.technicianFollowUp || current.correctionPending ? <section data-testid="technician-corrections" className={current.correctionPending ? "work-correction-panel" : undefined} style={{ gridColumn: "1 / -1" }}><h4>{current.correctionPending ? turnText(language, "Final-walk corrections needed") : turnText(language, "Previous final-walk feedback")}</h4><p style={{ whiteSpace: "pre-wrap" }}>{current.technicianFollowUp || turnText(language, "Review the final-walk findings with your inspector.")}</p><label>{turnText(language, "Technician resolution")}<textarea disabled={query.data?.readOnly} maxLength={1000} rows={3} value={current.value.technicianResolution} onChange={event => change({ technicianResolution: event.target.value })} /></label><p>{turnText(language, "Record what you corrected and save, then mark your repairs Done to request another final walk. Internal notes do not print on the resident report.")}</p></section> : null}
        <section data-testid="technician-preparation-checks" style={{ gridColumn: "1 / -1" }}><h4>{turnText(language, "8 preparation checks / technician only")}</h4><p>{turnText(language, "One check per area, covering all applicable rooms. Record exceptions, not a second room-by-room checklist.")}</p>
          {current.technicianChecks?.map(check => { const result = current.value.technicianResults?.[check.id] ?? { status: "NOT_CHECKED", note: "" }; return <div key={check.id} className="final-report-check" data-check-status={result.status}><label>{turnText(language, check.label)}<select data-testid={`tech-check-${check.id}`} value={result.status} onChange={event => change({ technicianResults: { ...current.value.technicianResults, [check.id]: { ...result, status: event.target.value as FinalReportResult["status"] } } })}><option value="NOT_CHECKED">{turnText(language, "Not checked")}</option><option value="CHECKED">{turnText(language, "Done")}</option><option value="ATTENTION">{turnText(language, "Needs attention")}</option><option value="NA">{turnText(language, "Not applicable")}</option></select></label>{["ATTENTION", "NA"].includes(result.status) || result.note ? <label>{turnText(language, "Exception / detail")}<input maxLength={100} value={result.note} onChange={event => change({ technicianResults: { ...current.value.technicianResults, [check.id]: { ...result, note: event.target.value } } })} /></label> : null}</div>; })}
        </section>
      </fieldset>
      <div data-testid="resident-code-controls" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <h4>{turnText(language, "Resident door & access codes")}</h4>
        <button type="button" className="button button-secondary" aria-pressed={show} onClick={() => setShow(value => !value)}>{show ? turnText(language, "Hide codes") : turnText(language, "Show codes")}</button>
      </div>
      <fieldset className="turn-material-fields" disabled={busy || query.data?.readOnly}>
        <label>{turnText(language, "New resident door code")}<input autoComplete="new-password" type={show ? "text" : "password"} maxLength={60} value={current.value.residentDoorCode} onChange={event => change({ residentDoorCode: event.target.value })}/></label>
        <label>{turnText(language, "Resident-specific access code (optional)")}<input autoComplete="new-password" type={show ? "text" : "password"} maxLength={60} value={current.value.residentAccessCode} onChange={event => change({ residentAccessCode: event.target.value })}/></label>
        <label style={{ display: "flex", alignItems: "center" }}><input style={{ width: "auto" }} type="checkbox" checked={current.value.includeResidentCodes} onChange={event => change({ includeResidentCodes: event.target.checked })}/>{turnText(language, "Include these resident-only codes on the Final-Walk Report")}</label>
        <label>{turnText(language, "Mailbox number")}<input data-testid="work-mailbox-number" maxLength={40} value={current.value.mailbox ?? ""} onChange={event => change({ mailbox: event.target.value, mailboxSource: "CUSTOM" })}/></label>
        <label>{turnText(language, "Mailbox key count")}<input data-testid="work-mailbox-keys" maxLength={20} value={current.value.mailboxKeys ?? ""} onChange={event => change({ mailboxKeys: event.target.value })}/></label>
        {([['homeKeys', turnText(language, "Home keys made")], ['fobs', turnText(language, "Access fobs prepared")], ['remotes', turnText(language, "Garage remotes prepared")]] as const).map(([key, label]) => <label key={key}>{label}<input inputMode="numeric" maxLength={4} value={current.value[key] ?? ""} onChange={event => change({ [key]: event.target.value })} /></label>)}
        <p>{turnText(language, "Enter quantities (0 for none). These counts populate the final walk, where the inspector confirms the actual items.")}</p>
        <p className="helper-copy">{current.value.mailboxSource === "CUSTOM" ? turnText(language, "Using a mailbox number for this turn only; the property directory is unchanged.") : turnText(language, "Mailbox number comes from the unit directory. Editing it overrides this turn's report only.")} {turnText(language, "Mailbox details appear on the report even when code inclusion is off.")}</p>
        {current.value.mailboxSource === "CUSTOM" ? <button type="button" onClick={() => change({ mailboxSource: "DIRECTORY", mailbox: "" })}>{turnText(language, "Use directory mailbox on save")}</button> : null}
      </fieldset>
      <button className="button button-primary" type="submit" disabled={!edit || busy || preparationReadOnly}>{busy ? turnText(language, "Saving...") : query.data?.readOnly ? turnText(language, "Save preparation checks") : turnText(language, "Save preparation & resident details")}</button>
      <p className="helper-copy">{turnText(language, "Preparation checks can be revised after handoff, including changing Done back to Needs attention or Not checked. Revisions do not automatically reopen the unit; tell the inspector if work needs to be redone.")}</p>
      {query.data?.readOnly ? <p className="helper-copy">{preparationReadOnly ? turnText(language, "Editing requires the assigned technician or management and an active, non-archived turn.") : turnText(language, "Resident codes and handoff details are read-only here after handoff. Preparation checks above remain editable.")}</p> : null}
      {edit ? <p role="status">{turnText(language, "Unsaved changes. Save before closing the unit. Codes are not stored as a browser draft.")}</p> : null}
      {current.updatedAt ? <p className="helper-copy">{turnText(language, "Report last saved:")} {new Date(current.updatedAt).toLocaleString(language === "es" ? "es-US" : "en-US")}</p> : null}
    </form> : null}
    {message ? <p role="status">{message}</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {edit || error ? <button type="button" disabled={busy} onClick={async () => {
      if (edit && !window.confirm(turnText(language, "Discard unsaved codes and reload the saved values?"))) return;
      const result = await query.refetch();
      if (result.isSuccess) { setEdit(null); setError(""); setShow(false); }
    }}>{turnText(language, "Reload saved codes")}</button> : null}
  </section>;
}
