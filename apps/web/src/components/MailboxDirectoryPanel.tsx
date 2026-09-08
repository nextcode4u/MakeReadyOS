import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMailboxDirectory, importMailboxDirectory, type MailboxPlan } from "../lib/api";

export function MailboxDirectoryPanel({ propertyId }: { propertyId: string }) {
  const query = useQuery({ queryKey: ["mailbox-directory", propertyId], queryFn: () => getMailboxDirectory(propertyId) });
  const [mode, setMode] = useState<"DIRECTORY" | "UNIT_NUMBER">("DIRECTORY");
  const [text, setText] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [plan, setPlan] = useState<MailboxPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const property = query.data?.property;
  const update = (change: () => void) => { change(); setPlan(null); setError(""); };
  async function submit(apply: boolean) {
    setBusy(true); setError("");
    try {
      const result = await importMailboxDirectory(propertyId, { mode, text, overwrite, ...(apply && plan ? { token: plan.token } : {}) });
      setPlan(result); if (result.applied) await query.refetch();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not update mailbox directory"); setPlan(null); }
    finally { setBusy(false); }
  }
  return <details data-testid="mailbox-directory-panel" style={{ gridColumn: "1 / -1", minWidth: 0 }}><summary>Mailbox directory / import</summary>
    <p><strong>Target property: {property ? `${property.code} / ${property.name}` : "Loading..."}</strong></p>
    <p>Mailbox assignments belong to the unit and populate final-walk drafts automatically. Imports update existing active units only, never other properties or availability.</p>
    {query.isError ? <p role="alert">Could not load directory. <button type="button" onClick={() => void query.refetch()}>Retry</button></p> : null}
    <fieldset disabled={busy || !property} style={{ minWidth: 0 }}>
      <legend>Import mailbox assignments</legend>
      <label>Numbering<select data-testid="mailbox-import-mode" value={mode} onChange={event => update(() => setMode(event.target.value as typeof mode))}><option value="DIRECTORY">Mailbox numbers differ / import a directory</option><option value="UNIT_NUMBER">Mailbox number matches unit number</option></select></label>
      {mode === "DIRECTORY" ? <><p>Paste CSV or tab-separated columns <code>unit,mailbox</code>. Leading zeros are preserved. Blank mailbox cells are skipped, not cleared.</p><label>Directory file<input type="file" accept=".csv,.tsv,.txt" onChange={event => {
        const file = event.target.files?.[0]; if (!file) return;
        if (file.size > 200000) { setError("Use a file under 200 KB."); return; }
        void file.text().then(value => update(() => setText(value))).catch(() => setError("Could not read file."));
      }}/></label><label>Paste mailbox directory<textarea data-testid="mailbox-import-text" rows={5} maxLength={200000} value={text} placeholder={'unit,mailbox\n101,001\n102,A-12'} onChange={event => update(() => setText(event.target.value))}/></label></> : <p>This explicitly assigns each existing active unit its own unit number as its mailbox number. Preview before applying; nothing is assumed automatically.</p>}
      <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input style={{ width: "auto" }} type="checkbox" checked={overwrite} onChange={event => update(() => setOverwrite(event.target.checked))}/>Replace existing mailbox assignments (otherwise keep them)</label>
      <button type="button" className="button" disabled={mode === "DIRECTORY" && !text.trim()} onClick={() => void submit(false)}>Preview mailbox import</button>
      {plan ? <div><p role="status">{plan.applied ? "Saved" : "Preview"}: {plan.changes.filter(change => change.action === "UPDATE").length} mailbox assignments {plan.applied ? "updated" : "to update"} for {property?.code}.</p>
        {plan.errors.length ? <ul role="alert">{plan.errors.map((error, i) => <li key={i}>{error}</li>)}</ul> : null}
        <div style={{ maxHeight: 300, overflow: "auto" }}><table><thead><tr><th>Unit</th><th>Current mailbox</th><th>Imported mailbox</th><th>Action</th></tr></thead><tbody>{plan.changes.map(change => <tr key={change.id}><td>{change.number}</td><td>{change.before ?? "Not set"}</td><td>{change.after || "Blank"}</td><td>{change.action}</td></tr>)}</tbody></table></div>
        {!plan.applied ? <button type="button" className="button button-primary" disabled={!!plan.errors.length || !plan.changes.some(change => change.action === "UPDATE")} onClick={() => void submit(true)}>Apply mailbox import to {property?.code}</button> : null}
      </div> : null}
    </fieldset>
    {error ? <p role="alert">{error}</p> : null}
    <details><summary>Current unit-to-mailbox directory ({query.data?.units.length ?? 0} units)</summary><div style={{ maxHeight: 300, overflow: "auto" }}><table><thead><tr><th>Unit</th><th>Mailbox</th></tr></thead><tbody>{query.data?.units.map(unit => <tr key={unit.id}><td>{unit.number}</td><td>{unit.mailboxNumber ?? "Not set"}</td></tr>)}</tbody></table></div></details>
  </details>;
}
