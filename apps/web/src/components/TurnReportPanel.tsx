import { turnText } from "../lib/turnLocale";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMailboxDirectory, saveUnitMailbox, type MakeReadyItem } from "../lib/api";
import { FinalWalkReportEditor } from "./FinalWalkReportEditor";
import { confirmMailboxChange, mailboxWarning } from "../lib/mailboxConfirmation";

export function TurnReportPanel({ item, isAdmin, language }: { item: MakeReadyItem; isAdmin: boolean; language: string }) {
  const query = useQuery({ queryKey: ["mailbox-directory", item.propertyId], queryFn: () => getMailboxDirectory(item.propertyId) });
  const unit = query.data?.units.find(unit => item.unitId ? unit.id === item.unitId : unit.number === item.unitNumber);
  const [edit, setEdit] = useState<{ value: string; expected: string | null } | null>(null);
  const value = edit?.value ?? null;
  const setValue = (value: string | null) => setEdit(current => value === null ? null : { value, expected: current ? current.expected : unit?.mailboxNumber ?? null });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  return <section data-testid="turn-report-panel"><h3>{turnText(language, "Final-Walk Report / resident handoff")}</h3>
    {query.isPending ? <p>{turnText(language, "Loading unit mailbox...")}</p> : query.isError ? <p role="alert">{turnText(language, "Could not load mailbox.")} <button type="button" onClick={() => void query.refetch()}>{turnText(language, "Retry")}</button></p> : unit ? <fieldset disabled={busy}>
      <legend>{turnText(language, "Unit mailbox /")} {query.data?.property.code} {unit.number}</legend>
      <p>{turnText(language, mailboxWarning)}</p>
      <label>{turnText(language, "Mailbox number")}<input data-testid="turn-mailbox-number" maxLength={40} value={value ?? unit.mailboxNumber ?? ""} onChange={event => setValue(event.target.value)}/></label>
      <button type="button" className="button" onClick={() => setValue(unit.number)}>{turnText(language, "Same as unit number")}</button>
      <button type="button" className="button" disabled={value === null || value === (unit.mailboxNumber ?? "")} onClick={async () => {
        if (!confirmMailboxChange(`${query.data?.property.code} / ${turnText(language, "Unit")} ${unit.number}`, edit!.expected, value?.trim() || null, language)) return;
        setBusy(true); setError(""); setMessage("");
        try { await saveUnitMailbox(item.propertyId, unit.id, { mailboxNumber: value, expected: edit!.expected }); await query.refetch(); setValue(null); setMessage(turnText(language, "Unit mailbox saved. Directory-based reports use this assignment.")); }
        catch (error) { setError(error instanceof Error ? error.message : turnText(language, "Could not save mailbox")); }
        finally { setBusy(false); }
      }}>{turnText(language, "Save unit mailbox")}</button>
    </fieldset> : <p>{turnText(language, "No active directory unit is linked. Import this unit in Setup first; report-only mailbox overrides remain available.")}</p>}
    {message ? <p role="status">{message}</p> : null}{error ? <p role="alert">{error} <button type="button" disabled={busy} onClick={async () => { if (window.confirm(turnText(language, "Discard your mailbox edit and reload the saved assignment?"))) { await query.refetch(); setValue(null); setError(""); } }}>{turnText(language, "Reload saved mailbox")}</button></p> : null}
    <p>{turnText(language, "Mailbox assignments persist with the unit. Use Resident door & access codes above during repairs; those saved values carry into this turn's report. Inspection results, keys and parking are entered in the report editor, not inferred from completion status.")}</p>
    {isAdmin ? <button type="button" className="button" disabled={value !== null && value !== (unit?.mailboxNumber ?? "")} onClick={() => setOpen(true)}>{turnText(language, "Edit / Preview this Final-Walk Report")}</button> : <p>{turnText(language, "The assigned inspector or an admin can edit the inspection draft.")}</p>}
    {open ? <FinalWalkReportEditor language={language} propertyId={item.propertyId} propertyName={query.data?.property.name ?? item.propertyId} itemId={item.id} onClose={() => setOpen(false)}/> : null}
  </section>;
}
