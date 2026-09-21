import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { saveUnitMailbox } from "../lib/api";
import { confirmMailboxChange, mailboxWarning } from "../lib/mailboxConfirmation";

export function UnitMailboxEditor({ propertyId, propertyCode, unit, canManage }: {
  propertyId: string; propertyCode: string; unit: { id: string; number: string; mailboxNumber: string | null }; canManage: boolean;
}) {
  const client = useQueryClient();
  const [edit, setEdit] = useState<{ value: string; expected: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function save() {
    if (!edit || busy) return;
    const mailboxNumber = edit.value.trim() || null;
    if (mailboxNumber === edit.expected || !confirmMailboxChange(`${propertyCode} / Unit ${unit.number}`, edit.expected, mailboxNumber)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await saveUnitMailbox(propertyId, unit.id, { mailboxNumber, expected: edit.expected });
      await client.invalidateQueries({ queryKey: ["access-code-directory", propertyId] });
      await client.invalidateQueries({ queryKey: ["mailbox-directory", propertyId] });
      void client.invalidateQueries({ queryKey: ["resident-codes"] });
      void client.invalidateQueries({ queryKey: ["final-report"] });
      setEdit(null); setMessage("Unit mailbox assignment saved.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save mailbox"); }
    finally { setBusy(false); }
  }
  return <fieldset disabled={busy} data-testid="access-mailbox"><legend>Unit {unit.number} / Mailbox</legend>
    <p>Mailbox number: <strong>{unit.mailboxNumber || "Not recorded"}</strong></p>
    <p>{mailboxWarning}</p>
    {canManage && !edit ? <button type="button" onClick={() => { setEdit({ value: unit.mailboxNumber ?? "", expected: unit.mailboxNumber }); setMessage(""); setError(""); }}>{unit.mailboxNumber ? "Change mailbox assignment" : "Add mailbox assignment"}</button> : null}
    {canManage && edit ? <>
      <label>Mailbox number<input maxLength={40} value={edit.value} onChange={event => setEdit({ ...edit, value: event.target.value })} /></label>
      <p>Leave blank only to remove the unit's assignment. Mailbox numbers are not reset between residents.</p>
      <button type="button" disabled={(edit.value.trim() || null) === edit.expected} onClick={() => void save()}>Save mailbox assignment</button>
      <button type="button" onClick={async () => { setEdit(null); setError(""); await client.invalidateQueries({ queryKey: ["access-code-directory", propertyId] }); }}>Cancel / reload mailbox</button>
    </> : null}
    {error ? <p role="alert">{error}</p> : null}
    {message ? <p role="status">{message}</p> : null}
  </fieldset>;
}
