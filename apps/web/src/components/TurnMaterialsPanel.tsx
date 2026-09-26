import { turnText } from "../lib/turnLocale";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getTurnMaterials, isApiError, saveTurnMaterials, type TurnMaterial } from "../lib/api";
import { createMaterialId, encodeMaterialDraft, materialDraftKey, parseMaterialDraft, reviewMaterialEdit, type MaterialEdit } from "../lib/materialDraft";
import { Modal } from "./Modal";
import { QuickMaterialsEntry } from "./QuickMaterialsEntry";
import { UnitWorkNotes } from "./UnitWorkNotes";

const statuses = { NEEDED: "Needed", NEED_TO_ORDER: "Need to order", ORDERED: "On order", ON_HAND: "On hand", USED: "Used", CANCELLED: "Cancelled" };

export function TurnMaterialsPanel({ itemId, title, canEdit, userId, language }: { itemId: string; title: string; canEdit: boolean; userId: string; language: string }) {
  const client = useQueryClient();
  const key = ["turn-materials", itemId];
  const query = useQuery({ queryKey: key, queryFn: () => getTurnMaterials(itemId) });
  const storageKey = materialDraftKey(userId, itemId);
  const [draft, setDraft] = useState<MaterialEdit | null>(() => {
    try { return parseMaterialDraft(localStorage.getItem(storageKey), userId, itemId); } catch { return null; }
  });
  const [edit, setEdit] = useState<MaterialEdit | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState("");
  const [quickPending, setQuickPending] = useState(false);
  const statusSaving = useRef(false);
  const [statusError, setStatusError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const [review, setReview] = useState<ReturnType<typeof reviewMaterialEdit> | null>(null);
  const persistDraft = (value: MaterialEdit) => {
    setDraft(value);
    try { localStorage.setItem(storageKey, encodeMaterialDraft(userId, itemId, value)); setStorageError(""); return true; }
    catch { setStorageError(turnText(language, "This browser could not store your draft. Keep this screen open until you can save online.")); return false; }
  };
  const removeDraft = () => {
    try { localStorage.removeItem(storageKey); setDraft(null); setStorageError(""); }
    catch { setStorageError(turnText(language, "Could not remove this device's draft. It may reappear after reload; do not submit it twice.")); }
  };
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const open = (row?: TurnMaterial) => {
    if (!query.data) return;
    setEdit({ row: row ?? { id: createMaterialId(), name: "", quantity: 1, unit: "each", status: "NEEDED", notes: "" }, snapshot: query.data });
    setDirty(false); setError(""); setConflict(false); setReview(null);
  };
  const close = () => {
    if (busy || dirty && !window.confirm(turnText(language, "Discard unsaved material changes?"))) return;
    removeDraft();
    setEdit(null); setDirty(false); setError(""); setConflict(false); setReview(null); void query.refetch();
  };
  const changeStatus = async (row: TurnMaterial, status: TurnMaterial["status"]) => {
    if (statusSaving.current || busy || quickPending || draft || edit || !canEdit || !query.data || query.data.readOnly || query.isError) return;
    statusSaving.current = true;
    setBusy(true); setStatusError(""); setStatusMessage("");
    try {
      const result = await saveTurnMaterials(itemId, { version: query.data.version, rows: query.data.rows.map(existing => existing.id === row.id ? { ...existing, status } : existing) });
      client.setQueryData(key, result);
      setStatusMessage(`${row.name}: ${turnText(language, statuses[status])} ${language === "es" ? "guardado" : "saved"}.`);
      void client.invalidateQueries({ queryKey: ["final-walk", itemId] });
      void client.invalidateQueries({ queryKey: ["my-work"] });
      void client.invalidateQueries({ queryKey: ["make-ready-items"] });
    } catch (cause) {
      setStatusError(isApiError(cause) && cause.status === 409
        ? turnText(language, "The parts list changed. Refresh the list, review it, then try again. Your change was not applied.")
        : turnText(language, "Could not confirm the part status was saved. Refresh the list to check before retrying."));
    } finally { statusSaving.current = false; setBusy(false); }
  };
  return <section className="drawer-section" data-testid="turn-materials">
    <h3>{turnText(language, "Parts & materials")}</h3>
    <UnitWorkNotes key={`${userId}-${itemId}`} itemId={itemId} canEdit={canEdit} language={language}/>
    <p className="helper-copy">{turnText(language, "Shop pickup list. Only parts marked")} <strong>{turnText(language, "On order")}</strong> {turnText(language, "block readiness until received, used, or cancelled.")}</p>
    <details className="workflow-help"><summary>{turnText(language, "How pickup & ordering work")}</summary>
      <p>{turnText(language, "Check Collected after gathering the full quantity. Uncheck to return it to the pickup list. Split partial quantities onto separate lines.")}</p>
      <p>{turnText(language, "Needed is a reminder. Need to order alerts managers and admins according to their notification preferences. On order means purchased and awaiting delivery. Use Status for Used or Cancelled.")}</p>
      <p>{turnText(language, "This internal list is not printed on the resident Final-Walk Report. Ordinary edits do not resend order alerts.")}</p>
    </details>
    {draft && !edit && canEdit ? <div role="status" data-testid="material-draft-recovery">
      <p>{turnText(language, "A material draft is saved on this device for your account. It is not saved to the team list and does not sync automatically.")}</p>
      <button type="button" disabled={query.data?.readOnly} onClick={() => { setEdit(draft); setDirty(true); setError(""); setReview(null); setConflict(false); }}>{turnText(language, "Resume material draft")}</button>
      <button type="button" onClick={() => { if (window.confirm(turnText(language, "Discard this device's unsaved material draft?"))) removeDraft(); }}>{turnText(language, "Discard material draft")}</button>
    </div> : null}
    {storageError && !edit ? <p role="alert">{storageError}</p> : null}
    {query.isLoading ? <p role="status">{turnText(language, "Loading parts list...")}</p> : null}
    {query.isError ? <p role="alert">{turnText(language, "Could not load parts list.")} <button type="button" onClick={() => void query.refetch()}>{turnText(language, "Retry")}</button></p> : null}
    {statusError ? <p role="alert">{statusError} <button type="button" disabled={busy} onClick={() => void query.refetch()}>{turnText(language, "Refresh parts list")}</button></p> : null}
    {statusMessage ? <p role="status">{statusMessage}</p> : null}
    {query.data ? <>
      <p>{query.data.rows.filter(row => row.status === "NEEDED").length} {language === "es" ? "por recoger" : "to gather"} / {query.data.rows.filter(row => row.status === "ORDERED").length} {language === "es" ? "pedidas (impiden aprobar)" : "on order (blocks readiness)"} / {query.data.rows.filter(row => row.status === "NEED_TO_ORDER").length} {language === "es" ? "hay que pedir" : "need to order"} / {query.data.rows.length} {language === "es" ? "líneas en total" : "total lines"}</p>
      {!query.data.rows.length ? <p>{turnText(language, "No parts or materials recorded. Add repair parts, paint, filters, or other supplies here.")}</p> : <div className="my-work-list">
        {query.data.rows.map(row => <article key={row.id} className="my-work-card" data-testid={`material-${row.id}`}>
          <div><strong className={row.status === "ON_HAND" || row.status === "USED" ? "material-collected" : undefined} style={{ overflowWrap: "anywhere" }}>{row.name}</strong><span>{row.quantity} {row.unit} / {turnText(language, statuses[row.status])}</span></div>
          <div className="material-pickup-controls">
            <label><input type="checkbox" aria-label={`${turnText(language, "Collected")} ${row.name}`} checked={row.status === "ON_HAND" || row.status === "USED"} disabled={!canEdit || query.data?.readOnly || busy || !!draft || !!edit || quickPending || query.isError || row.status === "USED" || row.status === "CANCELLED"} onChange={event => void changeStatus(row, event.target.checked ? "ON_HAND" : "NEEDED")}/>{turnText(language, "Collected")}</label>
            {canEdit && !query.data?.readOnly ? <label>{turnText(language, "Status")}<select aria-label={`${turnText(language, "Status")} ${row.name}`} value={row.status} disabled={busy || !!draft || !!edit || quickPending || query.isError} onChange={event => void changeStatus(row, event.target.value as TurnMaterial["status"])}>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{turnText(language, label)}</option>)}</select></label> : null}
          </div>
          {row.notes ? <p style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{row.notes}</p> : null}
          {canEdit && !query.data.readOnly ? <button type="button" className="button button-secondary" disabled={busy || !!draft || quickPending} onClick={() => open(row)}>{turnText(language, "Edit")} {row.name}</button> : null}
        </article>)}
      </div>}
      {canEdit && !query.data.readOnly ? <>
        <QuickMaterialsEntry language={language} itemId={itemId} userId={userId} materials={query.data} disabled={busy || !!draft || !!edit} onPending={setQuickPending} onSaved={result => {
          client.setQueryData(key, result);
          void client.invalidateQueries({ queryKey: ["final-walk", itemId] });
        }}/>
        <p className="helper-copy">{turnText(language, "Need a supplier note or a different starting status?")}</p>
        <button type="button" className="button button-secondary" disabled={busy || !!draft || quickPending || query.data.rows.length >= 100} onClick={() => open()}>{turnText(language, "Add part / material")}</button>
      </> : <p className="helper-copy">{turnText(language, "Read-only parts list.")}</p>}
    </> : null}
    <Modal open={!!edit} title={`${turnText(language, "Parts & materials")} / ${title}`} onClose={close} testId="turn-material-editor">
      {edit ? <form onChange={event => {
        setDirty(true);
        setReview(null);
        const data = new FormData(event.currentTarget);
        persistDraft({ ...edit, row: { id: edit.row.id, name: String(data.get("name") ?? ""), quantity: String(data.get("quantity") ?? ""), unit: String(data.get("unit") ?? ""), status: String(data.get("status")) as TurnMaterial["status"], notes: String(data.get("notes") ?? "") } });
      }} onSubmit={async event => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const row: TurnMaterial = { id: edit.row.id, name: String(data.get("name") ?? ""), quantity: Number(data.get("quantity")), unit: String(data.get("unit") ?? ""), status: String(data.get("status")) as TurnMaterial["status"], notes: String(data.get("notes") ?? "") };
        const rows = edit.snapshot.rows.some(existing => existing.id === row.id) ? edit.snapshot.rows.map(existing => existing.id === row.id ? row : existing) : [...edit.snapshot.rows, row];
        setBusy(true); setError(""); setReview(null); setConflict(false);
        try { const result = await saveTurnMaterials(itemId, { rows, version: edit.snapshot.version }); client.setQueryData(key, result); removeDraft(); setEdit(null); setDirty(false); void client.invalidateQueries({ queryKey: ["final-walk", itemId] }); }
        catch (cause) { setConflict(isApiError(cause) && cause.status === 409); setError(cause instanceof Error ? cause.message : turnText(language, "Could not save parts list. Your inputs are preserved.")); }
        finally { setBusy(false); }
      }}>
        <fieldset disabled={busy} className="turn-material-fields">
          <label>{turnText(language, "Part / material")}<input name="name" required maxLength={160} defaultValue={edit.row.name}/></label>
          <label>{turnText(language, "Quantity")}<input name="quantity" type="number" required min="0.001" max="100000" step="any" defaultValue={edit.row.quantity}/></label>
          <label>{turnText(language, "Unit of measure")}<input name="unit" required maxLength={24} defaultValue={edit.row.unit} placeholder={turnText(language, "each, gallons, feet, boxes")}/></label>
          <label>{turnText(language, "Status")}<select name="status" defaultValue={edit.row.status}>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{turnText(language, label)}</option>)}</select></label>
          <label>{turnText(language, "Notes / supplier / order reference")}<textarea name="notes" maxLength={1000} rows={3} defaultValue={edit.row.notes}/></label>
          <p className="helper-copy">{turnText(language, "Use separate lines for quantities at different stages. Mark cancelled rather than erasing an order.")}</p>
          <button className="button button-primary" type="submit">{busy ? turnText(language, "Saving...") : turnText(language, "Save material")}</button>
          <button className="button button-secondary" type="button" disabled={!dirty || !draft || !!storageError} onClick={() => { setEdit(null); setDirty(false); setError(""); }}>{turnText(language, "Keep draft on this device")}</button>
          <button className="button button-secondary" type="button" onClick={close}>{turnText(language, "Cancel")}</button>
          {dirty && draft && !storageError ? <p role="status">{turnText(language, "Draft stored on this device only. Use Save material while connected to update the team list.")}</p> : null}
        </fieldset>
        {error ? <p role="alert">{error}</p> : null}
        {conflict ? <button type="button" disabled={busy} onClick={async () => {
          setBusy(true); setError(""); setReview(null);
          try {
            const latest = await getTurnMaterials(itemId);
            client.setQueryData(key, latest);
            setReview(reviewMaterialEdit(draft ?? edit, latest));
          } catch (cause) { setError(cause instanceof Error ? cause.message : turnText(language, "Could not review the latest list. Your draft is preserved.")); }
          finally { setBusy(false); }
        }}>{turnText(language, "Review latest parts list")}</button> : null}
        {review ? <div role="status" data-testid="material-edit-review" style={{ overflowWrap: "anywhere" }}>
          <p>{review.alreadySaved ? turnText(language, "This exact line is already saved. No repeat save is needed.") : turnText(language, "This line has not changed on the server. Your edits can be kept with the latest list without overwriting other lines.")}</p>
          <details><summary>{language === "es" ? "Última lista guardada" : "Latest saved list"} ({review.latest.rows.length} {language === "es" ? "líneas" : "lines"})</summary><ul>{review.latest.rows.map(row => <li key={row.id}>{row.name}: {row.quantity} {row.unit} / {turnText(language, statuses[row.status])}{row.notes ? ` / ${row.notes}` : ""}</li>)}</ul></details>
          <button type="button" disabled={busy} onClick={() => {
            if (review.alreadySaved) { removeDraft(); setEdit(null); setDirty(false); }
            else {
              const next = { ...(draft ?? edit), snapshot: review.latest };
              setEdit(next); persistDraft(next); setDirty(true);
            }
            setReview(null); setConflict(false); setError("");
          }}>{review.alreadySaved ? turnText(language, "Use already saved line") : turnText(language, "Keep my edits with latest list")}</button>
          {!review.alreadySaved ? <p>{turnText(language, "This only updates your draft. Select Save material afterward to submit.")}</p> : null}
        </div> : null}
        {storageError ? <p role="alert">{storageError}</p> : null}
      </form> : null}
    </Modal>
  </section>;
}
