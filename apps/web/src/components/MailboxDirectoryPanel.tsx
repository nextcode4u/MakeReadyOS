import { useRef, useState } from "react";
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
  const [copyMessage, setCopyMessage] = useState("");
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const property = query.data?.property;
  const conversionPrompt = `Convert the mailbox directory I provide into CSV for MakeReadyOS.

TARGET PROPERTY: ${property ? `${property.code} / ${property.name}` : "Select a property in Setup > Units first"}

Rules:
- Include ONLY units belonging to this target property. If the property is unclear or multiple properties cannot be separated reliably, ask me to clarify before producing CSV.
- Output exactly two columns, with this header: unit,mailbox
- Output plain CSV only, without Markdown fences, commentary, extra columns or totals.
- Treat unit and mailbox numbers as TEXT. Preserve leading zeros, letters, hyphens, building identifiers and meaningful punctuation. Do not turn 001 into 1 or invent property prefixes.
- Copy the unit identifier exactly as used in the existing MakeReadyOS unit directory. If the source identifier cannot be matched reliably, ask me to clarify; do not guess.
- Do not assume mailbox numbers match unit numbers. Only output an assignment explicitly supported by the source.
- Exclude blank/unknown mailbox assignments. If a unit has conflicting assignments, ask for clarification rather than choosing one. Include each unit at most once.
- Use proper CSV quoting for values containing commas or quotation marks; double embedded quotation marks.
- Exclude resident names, email addresses, phone numbers, door/access/gate codes, staff/master codes and unrelated personal information.
- If reading a screenshot, scanned PDF or handwritten sheet, do not guess unclear characters. Ask me to confirm them first.

I will review the CSV and the property-specific import preview before applying it. Do not claim to have imported anything.

SOURCE DIRECTORY:
[I will paste the directory below or attach its file/image.]`;
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
      <details className="unit-import-help" data-testid="mailbox-import-ai-help"><summary>Conversion prompt / convert a spreadsheet, PDF or image</summary>
        <p>Copy this prompt into your conversion tool, then provide the source directory. Remove unrelated resident details and access codes before sharing it. Review the converted CSV before importing.</p>
        <button type="button" className="button button-secondary" onClick={async () => {
          try { await navigator.clipboard.writeText(conversionPrompt); setCopyMessage("Conversion prompt copied."); }
          catch { promptRef.current?.focus(); promptRef.current?.select(); setCopyMessage("Clipboard is unavailable. The prompt is selected; copy it manually."); }
        }}>Copy conversion prompt</button>
        {copyMessage ? <p role="status">{copyMessage}</p> : null}
        <label>Mailbox conversion prompt<textarea ref={promptRef} data-testid="mailbox-conversion-prompt" readOnly rows={10} value={conversionPrompt}/></label>
      </details>
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
