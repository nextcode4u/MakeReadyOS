import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getFinalReport, previewFinalReport, saveFinalReportDraft, saveFinalReportSettings, type FinalReportData, type FinalReportDraft, type FinalReportResult, type FinalReportSettings } from "../lib/api";
import { Modal } from "./Modal";
import "./finalWalkReportEditor.css";

export function FinalWalkReportEditor({ propertyId, propertyName, itemId, onClose }: { propertyId: string; propertyName: string; itemId?: string; onClose: () => void }) {
  const query = useQuery({ queryKey: ["final-report", propertyId, itemId], queryFn: () => getFinalReport(propertyId, itemId), staleTime: 0, gcTime: 0, refetchOnWindowFocus: false });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  return <Modal open title={`Final-walk report / ${propertyName}`} testId="final-report-editor" onClose={() => { if (!busy && (!dirty || window.confirm("Discard unsaved report changes?"))) onClose(); }}>
    {query.isPending || query.isFetching ? <p>Loading report settings...</p> : query.isError ? <p role="alert">Could not load report settings. <button type="button" onClick={() => void query.refetch()}>Retry</button></p> : <ReportEditor initial={query.data} onDirty={setDirty} onBusy={setBusy} />}
  </Modal>;
}

function ReportEditor({ initial, onDirty, onBusy }: { initial: FinalReportData; onDirty: (dirty: boolean) => void; onBusy: (busy: boolean) => void }) {
  const client = useQueryClient();
  const [savedSettings, setSavedSettings] = useState(initial.settings);
  const [settings, setSettings] = useState(initial.settings.value);
  const [savedDraft, setSavedDraft] = useState(initial.draft);
  const [draft, setDraft] = useState(initial.draft.value);
  const [item, setItem] = useState(initial.item);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [html, setHtml] = useState("");
  const [scale, setScale] = useState(1);
  const previewRef = useRef<HTMLDivElement>(null);
  const settingsDirty = JSON.stringify(settings) !== JSON.stringify(savedSettings.value);
  const draftDirty = JSON.stringify(draft) !== JSON.stringify(savedDraft.value);
  useEffect(() => { onDirty(settingsDirty || draftDirty); }, [settingsDirty, draftDirty, onDirty]);
  useEffect(() => { onBusy(busy); }, [busy, onBusy]);
  useEffect(() => { setHtml(""); }, [settings, draft, item?.id]);
  useEffect(() => { if (html) previewRef.current?.scrollIntoView({ block: "nearest" }); }, [html]);
  useEffect(() => {
    const element = previewRef.current; if (!element) return;
    const observer = new ResizeObserver(() => setScale(Math.min(1, element.clientWidth / 739)));
    observer.observe(element); return () => observer.disconnect();
  }, []);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(""); setMessage("");
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message : "Report request failed"); }
    finally { setBusy(false); }
  };
  const updateSettings = (patch: Partial<FinalReportSettings>) => setSettings(current => ({ ...current, ...patch }));
  const updateDraft = (patch: Partial<FinalReportDraft>) => setDraft(current => ({ ...current, ...patch }));
  const result = (id: string) => draft.results[id] ?? { status: "NOT_CHECKED" as const, note: "" };
  const updateResult = (id: string, patch: Partial<FinalReportResult>) => setDraft(current => ({ ...current, results: { ...current.results, [id]: { ...(current.results[id] ?? { status: "NOT_CHECKED", note: "" }), ...patch } } }));
  const validateDraft = () => {
    const missing = initial.checks.find(check => ["ATTENTION", "NA"].includes(result(check.id).status) && !result(check.id).note.trim());
    if (missing) throw new Error(`Add a reason for: ${missing.label}`);
  };
  const preview = (format: "html" | "pdf") => void run(async () => {
    if (item) validateDraft();
    const response = await previewFinalReport(initial.property.id, { itemId: item?.id, settings, draft, format });
    if (response.html) { setHtml(response.html); setMessage("Preview uses current form values and saved property/company logos. Unsaved edits are not saved by previewing."); }
    if (response.pdfBase64) {
      const bytes = Uint8Array.from(atob(response.pdfBase64), char => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const link = document.createElement("a"); link.href = url; link.download = `final-walk-DRAFT-${initial.property.code.replace(/[^a-z0-9-]/gi,"_")}-${(item?.unitNumber ?? "branding").replace(/[^a-z0-9-]/gi,"_")}.pdf`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      setMessage("One-page draft PDF downloaded. It is not a finalized inspection record.");
    }
  });
  return <div className="final-report-workspace">
    <div className="final-report-notice"><strong>{initial.canEditSettings ? "Admin draft workspace" : "Assigned inspector draft workspace"}</strong><p>Record inspection details for this turn. Saving never marks a unit ready or signs an inspection. All previews and PDFs are labeled Draft / Not for resident issue.</p></div>
    {error ? <p role="alert">{error}</p> : null}{message ? <p role="status">{message}</p> : null}
    <fieldset disabled={busy} className="final-report-form">
      <label>Property<input readOnly value={`${initial.property.code} / ${initial.property.name}`} /></label>
      <label>Turn to inspect<select disabled={!initial.canEditSettings} data-testid="final-report-unit" value={item?.id ?? ""} onChange={event => {
        const id = event.target.value;
        if (draftDirty && !window.confirm("Discard unsaved inspection changes before selecting another turn?")) return;
        void run(async () => { const data = await getFinalReport(initial.property.id, id || undefined); setItem(data.item); setSavedDraft(data.draft); setDraft(data.draft.value); });
      }}><option value="">Branding preview only (no inspection)</option>{initial.items.map(turn => <option key={turn.id} value={turn.id}>{turn.unitNumber} / {turn.boardGroup}</option>)}</select></label>
      {initial.canEditSettings ? <details open><summary>Report wording & style / this property</summary>
        <label>Report title<input data-testid="final-report-title" value={settings.title} maxLength={80} onChange={event => updateSettings({ title: event.target.value })} /></label>
        <label>Introduction<textarea value={settings.introduction} maxLength={240} rows={2} onChange={event => updateSettings({ introduction: event.target.value })} /></label>
        <label>Resident footer<textarea value={settings.footer} maxLength={240} rows={3} onChange={event => updateSettings({ footer: event.target.value })} /></label>
        <label>Accent color<input type="color" value={settings.accent} onChange={event => updateSettings({ accent: event.target.value })} /></label>
        <button type="button" className="button button-primary" disabled={!settingsDirty} onClick={() => void run(async () => { const saved = await saveFinalReportSettings(initial.property.id, { version: savedSettings.version, value: settings }); setSavedSettings(saved); setSettings(saved.value); setMessage("Report settings saved for this property."); })}>Save report settings</button>
      </details> : <p>Report wording, style and logos use the property's saved admin settings.</p>}
      {item ? <>
        <fieldset className="final-report-form" disabled={!initial.canEditDraft}><legend>Inspection details</legend>
        <p className="helper-copy">Assigned tech: {item.technician || "Unassigned"}. Assigned final reviewer: {item.reviewer || "Unassigned"}. These names are not signatures.</p>
        <label>Inspection date<input data-testid="final-report-date" type="date" value={draft.inspectionDate} onChange={event => updateDraft({ inspectionDate: event.target.value })} /></label>
        <details><summary>Existing turn checklist records (reference only)</summary><p>Existing completion flags are shown for reference, not automatically copied as verified inspection results.</p>{item.checklists.length ? item.checklists.map(list => <section key={list.id}><h4>{list.name}</h4><ul>{list.items.map(check => <li key={check.id}>{check.title}: {check.completed ? "Recorded complete" : "Not complete"}{check.completedAt ? ` / ${check.completedAt.slice(0,10)}` : ""}</li>)}</ul></section>) : <p>No checklist records on this turn.</p>}</details>
        <p className="helper-copy">Each grouped check covers all applicable bedrooms or bathrooms. Add a reason for Needs attention or Not applicable. Do not record technical tests you cannot verify.</p>
        {initial.sections.map(section => <details key={section.id}><summary>{section.title}<small>{initial.checks.filter(check => check.section === section.id && result(check.id).status !== "NOT_CHECKED").length} / {initial.checks.filter(check => check.section === section.id).length} recorded</small></summary>
          {initial.checks.filter(check => check.section === section.id).map(check => <div key={check.id} className="final-report-check">
            <label>{check.label}<select data-testid={`final-report-result-${check.id}`} value={result(check.id).status} onChange={event => updateResult(check.id, { status: event.target.value as FinalReportResult["status"] })}><option value="NOT_CHECKED">Not checked</option><option value="CHECKED">Checked</option><option value="ATTENTION">Needs attention</option><option value="NA">Not applicable</option></select></label>
            <label>Reason / detail{["ATTENTION", "NA"].includes(result(check.id).status) ? " (required)" : ""}<input maxLength={100} value={result(check.id).note} data-testid={`final-report-note-${check.id}`} onChange={event => updateResult(check.id, { note: event.target.value })} /></label>
          </div>)}
        </details>)}
        <details open><summary>Mailbox & resident handoff details</summary>
          <label>Mailbox source<select value={draft.mailboxSource ?? "CUSTOM"} onChange={event => updateDraft({ mailboxSource: event.target.value as "DIRECTORY" | "CUSTOM", ...(event.target.value === "DIRECTORY" ? { mailbox: item.directoryMailbox ?? "" } : {}) })}><option value="DIRECTORY">Unit mailbox directory (automatic)</option><option value="CUSTOM">Override for this report only</option></select></label>
          <label>Mailbox number<input data-testid="report-mailbox" maxLength={40} value={draft.mailbox} readOnly={draft.mailboxSource === "DIRECTORY"} onChange={event => updateDraft({ mailbox: event.target.value })}/></label>
          <p>{draft.mailboxSource === "DIRECTORY" ? "Uses the latest saved unit mailbox when previewing or printing. Manage assignments in Turn Details or Setup > Units > Mailbox directory." : "This override does not change the unit directory."}</p>
          {([['homeKeys','Home key count',20],['mailboxKeys','Mailbox key count',20],['fobs','Access fob count',20],['remotes','Garage remote count',20],['parking','Parking / garage assignment',60]] as const).map(([key,label,maxLength]) => <label key={key}>{label}<input maxLength={maxLength} value={draft[key]} onChange={event => updateDraft({ [key]: event.target.value })}/></label>)}
          <p>Codes must be unique to this resident/turn. Never enter shared gate, staff, vendor or master codes. New turns start with no codes; protected backups contain saved codes.</p>
          <label>Resident-only door code<input data-testid="report-door-code" type="password" autoComplete="new-password" maxLength={60} value={draft.residentDoorCode} onChange={event => updateDraft({ residentDoorCode: event.target.value })}/></label>
          <label>Resident-only access code<input type="password" autoComplete="new-password" maxLength={60} value={draft.residentAccessCode} onChange={event => updateDraft({ residentAccessCode: event.target.value })}/></label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input style={{ width: "auto" }} type="checkbox" checked={draft.includeResidentCodes} onChange={event => updateDraft({ includeResidentCodes: event.target.checked })}/>I confirm these are resident-specific codes; include them on this report</label>
        </details>
        <label>Resident-facing follow-up<textarea rows={3} maxLength={400} value={draft.followUp} onChange={event => updateDraft({ followUp: event.target.value })}/></label>
        <button type="button" className="button button-primary" data-testid="final-report-save-draft" disabled={!draftDirty} onClick={() => void run(async () => { validateDraft(); const saved = await saveFinalReportDraft(initial.property.id, item.id, { version: savedDraft.version, value: draft }); setSavedDraft(saved); setDraft(saved.value); void client.invalidateQueries({ queryKey: ["final-walk", item.id] }); setMessage("Inspection draft saved. Unit status and sign-offs were not changed."); })}>Save inspection draft</button>
        <small>{savedDraft.updatedAt ? `Saved ${new Date(savedDraft.updatedAt).toLocaleString()} / revision ${savedDraft.version}` : "No saved inspection draft yet."}</small>
        </fieldset>
      </> : <p>Choose a turn to enter inspection details. Branding-only previews start with every check unrecorded.</p>}
      <div className="final-report-actions"><button type="button" className="button button-primary" data-testid="final-report-preview" onClick={() => preview("html")}>Preview report</button><button type="button" className="button" data-testid="final-report-pdf" onClick={() => preview("pdf")}>Download draft PDF</button><button type="button" className="button" onClick={() => { if ((settingsDirty || draftDirty) && !window.confirm("Discard unsaved changes and reload saved report data?")) return; void run(async () => { const data = await getFinalReport(initial.property.id, item?.id); setSettings(data.settings.value); setSavedSettings(data.settings); setDraft(data.draft.value); setSavedDraft(data.draft); setItem(data.item); setMessage("Saved report data reloaded."); }); }}>Reload saved data</button></div>
      <small>{settingsDirty || draftDirty ? "Unsaved changes. Preview includes them; Save persists them." : "No unsaved changes."} If a draft exceeds one page, PDF download asks you to shorten wording rather than hiding details.</small>
    </fieldset>
    <section className="final-report-preview" ref={previewRef} aria-label="Report preview">
      <h3>Letter-page preview</h3><p>Uses the selected property's saved branding. Save logo changes in Branding before reopening this editor.</p>
      {html ? <div className="final-report-paper" style={{ height: 974 * scale }}><iframe title="Final-walk draft preview" sandbox="" srcDoc={html} style={{ width: 739, height: 974, transform: `scale(${scale})` }}/></div> : <p>Click Preview report to see the current draft. Changing a field clears the old preview.</p>}
    </section>
  </div>;
}
