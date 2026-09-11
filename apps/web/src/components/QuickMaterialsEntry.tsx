import { useEffect, useRef, useState } from "react";
import { type TurnMaterials, saveTurnMaterials } from "../lib/api";
import { createMaterialId, materialDraftKey, parseMaterialDraft, type MaterialEdit } from "../lib/materialDraft";

type Row = MaterialEdit["row"];
type Batch = { rows: Row[]; snapshot: TurnMaterials };
const blankRow = (): Row => ({ id: createMaterialId(), name: "", quantity: 1, unit: "each", status: "NEEDED", notes: "" });

export function QuickMaterialsEntry({ itemId, userId, materials, disabled, onPending, onSaved }: {
  itemId: string; userId: string; materials: TurnMaterials; disabled: boolean;
  onPending: (pending: boolean) => void; onSaved: (result: TurnMaterials) => void;
}) {
  const storageKey = `${materialDraftKey(userId, itemId)}:batch`;
  const [batch, setBatch] = useState<Batch>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      const value = raw && raw.length <= 500000 ? JSON.parse(raw) : null;
      if (value?.version === 1 && value.userId === userId && value.itemId === itemId && Array.isArray(value.rows) && value.rows.length > 0 && value.rows.length <= 100) {
        const parsed = value.rows.map((row: unknown) => parseMaterialDraft(JSON.stringify({ version: 1, userId, itemId, edit: { row, snapshot: value.snapshot } }), userId, itemId)) as (MaterialEdit | null)[];
        if (parsed.every(entry => entry !== null)) return { rows: parsed.map(entry => entry.row), snapshot: parsed[0].snapshot };
      }
    } catch { /* An unavailable device draft must not prevent online entry. */ }
    return { rows: [blankRow()], snapshot: materials };
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState("");
  const [saved, setSaved] = useState(false);
  const names = useRef<(HTMLInputElement | null)[]>([]);
  const pending = batch.rows.some(row => row.name !== "" || String(row.quantity) !== "1" || row.unit !== "each");
  useEffect(() => { onPending(pending); }, [pending, onPending]);
  useEffect(() => {
    if (!pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);
  const store = (next: Batch) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ version: 1, userId, itemId, ...next }));
      setStorageError("");
    } catch { setStorageError("Could not store this draft on your device. Keep this screen open until you save the list."); }
  };
  const clear = () => {
    try { localStorage.removeItem(storageKey); setStorageError(""); }
    catch { setStorageError("Could not clear this device draft. Do not submit it again after reloading."); }
  };
  const update = (index: number, patch: Partial<Row>) => {
    const rows = batch.rows.map((row, position) => position === index ? { ...row, ...patch } : row);
    const snapshot = pending ? batch.snapshot : materials;
    if (rows[rows.length - 1]?.name.trim() && rows.length + snapshot.rows.length < 100) rows.push(blankRow());
    const next = { rows, snapshot };
    setBatch(next); store(next); setSaved(false);
  };
  return <form data-testid="quick-materials" onSubmit={async event => {
    event.preventDefault();
    if (busy || disabled || !pending) return;
    const entered = batch.rows.filter(row => row.name.trim() || String(row.quantity) !== "1" || row.unit !== "each");
    if (entered.some(row => !row.name.trim() || !row.unit.trim() || !Number.isFinite(Number(row.quantity)) || Number(row.quantity) <= 0 || Number(row.quantity) > 100000)) {
      setError("Each entered line needs a part name, a positive quantity, and a unit of measure."); return;
    }
    setBusy(true); setError("");
    try {
      const result = await saveTurnMaterials(itemId, {
        version: batch.snapshot.version,
        rows: [...batch.snapshot.rows, ...entered.map(row => ({ ...row, name: row.name.trim(), unit: row.unit.trim(), quantity: Number(row.quantity) }))],
      });
      clear(); setBatch({ rows: [blankRow()], snapshot: result }); setSaved(true); onSaved(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the list. Your entries are preserved."); }
    finally { setBusy(false); }
  }}>
    <p className="helper-copy">Type parts line by line. A blank line appears automatically; press Enter for the next part or Tab to change its quantity and unit. Save once when finished. New parts start as Needed for shop pickup and do not block completion. Use Edit on a saved part to mark it On order when waiting on an order.</p>
    <fieldset className="turn-material-fields" disabled={busy || disabled}>
      {batch.rows.map((row, index) => <div className="material-entry-row" key={row.id}>
        <label>Part {index + 1}<input ref={element => { names.current[index] = element; }} aria-label={`Part ${index + 1}`} maxLength={160} value={row.name} placeholder="e.g. Air filter" onChange={event => update(index, { name: event.target.value })} onKeyDown={event => {
          if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
          event.preventDefault();
          if (row.name.trim()) names.current[index + 1]?.focus();
        }}/></label>
        <label>Quantity<input aria-label={`Quantity ${index + 1}`} type="number" min="0.001" max="100000" step="any" value={row.quantity} onChange={event => update(index, { quantity: event.target.value })} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); if (row.name.trim()) names.current[index + 1]?.focus(); } }}/></label>
        <label>Unit<input aria-label={`Unit ${index + 1}`} maxLength={24} value={row.unit} placeholder="each, gallons, feet" onChange={event => update(index, { unit: event.target.value })} onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); if (row.name.trim()) names.current[index + 1]?.focus(); } }}/></label>
      </div>)}
      <div className="material-entry-actions">
        <button type="submit" className="button button-primary" disabled={!pending}>{busy ? "Saving parts..." : "Save parts list"}</button>
        <button type="button" disabled={!pending} onClick={() => { if (window.confirm("Discard these unsaved parts?")) { clear(); setBatch({ rows: [blankRow()], snapshot: materials }); setError(""); } }}>Discard unsaved lines</button>
      </div>
    </fieldset>
    {materials.rows.length >= 100 ? <p>Maximum 100 lines per turn. Existing lines can still be edited.</p> : null}
    {pending ? <p role="status">Unsaved lines {storageError ? "are not backed up on this device" : "are kept on this device for your account"}. Save parts list to share with the team.</p> : null}
    {saved ? <p role="status">Parts list saved to the team list.</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {storageError ? <p role="alert">{storageError}</p> : null}
  </form>;
}
