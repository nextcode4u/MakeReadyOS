import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getTurnMaterials, saveTurnMaterials, type TurnMaterial } from "../lib/api";
import { createMaterialId, encodeMaterialDraft, materialDraftKey, parseMaterialDraft, type MaterialEdit } from "../lib/materialDraft";
import { Modal } from "./Modal";

const statuses = { NEEDED: "Needed", ORDERED: "Ordered", ON_HAND: "On hand", USED: "Used", CANCELLED: "Cancelled" };

export function TurnMaterialsPanel({ itemId, title, canEdit, userId }: { itemId: string; title: string; canEdit: boolean; userId: string }) {
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
  const persistDraft = (value: MaterialEdit) => {
    try { localStorage.setItem(storageKey, encodeMaterialDraft(userId, itemId, value)); setDraft(value); setStorageError(""); return true; }
    catch { setStorageError("This browser could not store your draft. Keep this screen open until you can save online."); return false; }
  };
  const removeDraft = () => {
    try { localStorage.removeItem(storageKey); setDraft(null); setStorageError(""); }
    catch { setStorageError("Could not remove this device's draft. It may reappear after reload; do not submit it twice."); }
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
    setDirty(false); setError("");
  };
  const close = () => {
    if (busy || dirty && !window.confirm("Discard unsaved material changes?")) return;
    removeDraft();
    setEdit(null); setDirty(false); setError(""); void query.refetch();
  };
  return <section className="drawer-section" data-testid="turn-materials">
    <h3>Parts &amp; materials</h3>
    <p className="helper-copy">Internal list for this turn only. Not included on the resident Final-Walk Report. Quantities describe each line, not warehouse stock. Needed or ordered parts block the Mark ready action until received, used, or cancelled.</p>
    {draft && !edit && canEdit ? <div role="status" data-testid="material-draft-recovery">
      <p>A material draft is saved on this device for your account. It is not saved to the team list and does not sync automatically.</p>
      <button type="button" disabled={query.data?.readOnly} onClick={() => { setEdit(draft); setDirty(true); setError(""); }}>Resume material draft</button>
      <button type="button" onClick={() => { if (window.confirm("Discard this device's unsaved material draft?")) removeDraft(); }}>Discard material draft</button>
    </div> : null}
    {storageError && !edit ? <p role="alert">{storageError}</p> : null}
    {query.isLoading ? <p role="status">Loading parts list...</p> : null}
    {query.isError ? <p role="alert">Could not load parts list. <button type="button" onClick={() => void query.refetch()}>Retry</button></p> : null}
    {query.data ? <>
      <p>{query.data.rows.filter(row => ["NEEDED", "ORDERED"].includes(row.status)).length} awaiting parts / {query.data.rows.length} total lines</p>
      {!query.data.rows.length ? <p>No parts or materials recorded. Add repair parts, paint, filters, or other supplies here.</p> : <div className="my-work-list">
        {query.data.rows.map(row => <article key={row.id} className="my-work-card" data-testid={`material-${row.id}`}>
          <div><strong style={{ overflowWrap: "anywhere" }}>{row.name}</strong><span>{row.quantity} {row.unit} / {statuses[row.status]}</span></div>
          {row.notes ? <p style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{row.notes}</p> : null}
          {canEdit && !query.data.readOnly ? <button type="button" className="button button-secondary" disabled={!!draft} onClick={() => open(row)}>Edit {row.name}</button> : null}
        </article>)}
      </div>}
      {canEdit && !query.data.readOnly ? <button type="button" className="button button-secondary" disabled={!!draft || query.data.rows.length >= 100} onClick={() => open()}>Add part / material</button> : <p className="helper-copy">Read-only parts list.</p>}
    </> : null}
    <Modal open={!!edit} title={`Parts & materials / ${title}`} onClose={close} testId="turn-material-editor">
      {edit ? <form onChange={event => {
        setDirty(true);
        const data = new FormData(event.currentTarget);
        persistDraft({ ...edit, row: { id: edit.row.id, name: String(data.get("name") ?? ""), quantity: String(data.get("quantity") ?? ""), unit: String(data.get("unit") ?? ""), status: String(data.get("status")) as TurnMaterial["status"], notes: String(data.get("notes") ?? "") } });
      }} onSubmit={async event => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const row: TurnMaterial = { id: edit.row.id, name: String(data.get("name") ?? ""), quantity: Number(data.get("quantity")), unit: String(data.get("unit") ?? ""), status: String(data.get("status")) as TurnMaterial["status"], notes: String(data.get("notes") ?? "") };
        const rows = edit.snapshot.rows.some(existing => existing.id === row.id) ? edit.snapshot.rows.map(existing => existing.id === row.id ? row : existing) : [...edit.snapshot.rows, row];
        setBusy(true); setError("");
        try { const result = await saveTurnMaterials(itemId, { rows, version: edit.snapshot.version }); client.setQueryData(key, result); removeDraft(); setEdit(null); setDirty(false); void client.invalidateQueries({ queryKey: ["final-walk", itemId] }); }
        catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save parts list. Your inputs are preserved."); }
        finally { setBusy(false); }
      }}>
        <fieldset disabled={busy} className="turn-material-fields">
          <label>Part / material<input name="name" required maxLength={160} defaultValue={edit.row.name}/></label>
          <label>Quantity<input name="quantity" type="number" required min="0.001" max="100000" step="any" defaultValue={edit.row.quantity}/></label>
          <label>Unit of measure<input name="unit" required maxLength={24} defaultValue={edit.row.unit} placeholder="each, gallons, feet, boxes"/></label>
          <label>Status<select name="status" defaultValue={edit.row.status}>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Notes / supplier / order reference<textarea name="notes" maxLength={1000} rows={3} defaultValue={edit.row.notes}/></label>
          <p className="helper-copy">Use separate lines for quantities at different stages. Mark cancelled rather than erasing an order.</p>
          <button className="button button-primary" type="submit">{busy ? "Saving..." : "Save material"}</button>
          <button className="button button-secondary" type="button" disabled={!dirty || !draft || !!storageError} onClick={() => { setEdit(null); setDirty(false); setError(""); }}>Keep draft on this device</button>
          <button className="button button-secondary" type="button" onClick={close}>Cancel</button>
          {dirty && draft && !storageError ? <p role="status">Draft stored on this device only. Use Save material while connected to update the team list.</p> : null}
        </fieldset>
        {error ? <p role="alert">{error}</p> : null}
        {storageError ? <p role="alert">{storageError}</p> : null}
      </form> : null}
    </Modal>
  </section>;
}
