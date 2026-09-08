import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMailboxDirectory, saveUnitMailbox, type MakeReadyItem } from "../lib/api";
import { FinalWalkReportEditor } from "./FinalWalkReportEditor";

export function TurnReportPanel({ item, isAdmin }: { item: MakeReadyItem; isAdmin: boolean }) {
  const query = useQuery({ queryKey: ["mailbox-directory", item.propertyId], queryFn: () => getMailboxDirectory(item.propertyId) });
  const unit = query.data?.units.find(unit => item.unitId ? unit.id === item.unitId : unit.number === item.unitNumber);
  const [edit, setEdit] = useState<{ value: string; expected: string | null } | null>(null);
  const value = edit?.value ?? null;
  const setValue = (value: string | null) => setEdit(current => value === null ? null : { value, expected: current ? current.expected : unit?.mailboxNumber ?? null });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  return <section data-testid="turn-report-panel"><h3>Final-Walk Report / resident handoff</h3>
    {query.isPending ? <p>Loading unit mailbox...</p> : query.isError ? <p role="alert">Could not load mailbox. <button type="button" onClick={() => void query.refetch()}>Retry</button></p> : unit ? <fieldset disabled={busy}>
      <legend>Unit mailbox / {query.data?.property.code} {unit.number}</legend>
      <label>Mailbox number<input data-testid="turn-mailbox-number" maxLength={40} value={value ?? unit.mailboxNumber ?? ""} onChange={event => setValue(event.target.value)}/></label>
      <button type="button" className="button" onClick={() => setValue(unit.number)}>Same as unit number</button>
      <button type="button" className="button" disabled={value === null || value === (unit.mailboxNumber ?? "")} onClick={async () => {
        setBusy(true); setError(""); setMessage("");
        try { await saveUnitMailbox(item.propertyId, unit.id, { mailboxNumber: value, expected: edit!.expected }); await query.refetch(); setValue(null); setMessage("Unit mailbox saved. Directory-based reports use this assignment."); }
        catch (error) { setError(error instanceof Error ? error.message : "Could not save mailbox"); }
        finally { setBusy(false); }
      }}>Save unit mailbox</button>
    </fieldset> : <p>No active directory unit is linked. Import this unit in Setup first; report-only mailbox overrides remain available.</p>}
    {message ? <p role="status">{message}</p> : null}{error ? <p role="alert">{error} <button type="button" disabled={busy} onClick={async () => { if (window.confirm("Discard your mailbox edit and reload the saved assignment?")) { await query.refetch(); setValue(null); setError(""); } }}>Reload saved mailbox</button></p> : null}
    <p>Mailbox assignments persist with the unit. Inspection results, keys, parking and resident-only codes are saved for this turn in the report editor, not inferred from completion status.</p>
    {isAdmin ? <button type="button" className="button" disabled={value !== null && value !== (unit?.mailboxNumber ?? "")} onClick={() => setOpen(true)}>Edit / Preview this Final-Walk Report</button> : <p>An admin can edit the inspection draft and resident-specific codes.</p>}
    {open ? <FinalWalkReportEditor propertyId={item.propertyId} propertyName={query.data?.property.name ?? item.propertyId} itemId={item.id} onClose={() => setOpen(false)}/> : null}
  </section>;
}
