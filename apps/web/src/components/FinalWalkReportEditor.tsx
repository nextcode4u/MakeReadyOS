import { turnText } from "../lib/turnLocale";
import { deliverReportPdf } from "../lib/reportPdfDelivery";
import { getVerifiedSession, isCurrentSession } from "../lib/verifiedSession";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { downloadResidentReport, getFinalReport, isApiError, markMakeReadyItemReady, previewFinalReport, returnFinalWalkToTech, saveFinalReportDraft, saveFinalReportSettings, type FinalReportData, type FinalReportDraft, type FinalReportResult, type FinalReportSettings } from "../lib/api";
import { Modal } from "./Modal";
import { CompletionNotice } from "./CompletionNotice";
import "./finalWalkReportEditor.css";
import { todayInputValue } from "../lib/dateTime";
import { FinalReportPreview } from "./FinalReportPreview";
import { FollowUpPhotos } from "./FollowUpPhotos";
import { patchMakeReadyItem, uploadItemAttachment } from "../lib/api";

const datedInspection = (draft: FinalReportDraft, hasItem: boolean, today = todayInputValue()) => hasItem && !draft.inspectionDate ? { ...draft, inspectionDate: today } : draft;

export function FinalWalkReportEditor({ propertyId, propertyName, itemId, onClose, language }: { propertyId: string; propertyName: string; itemId?: string; onClose: () => void; language: string }) {
  const query = useQuery({ queryKey: ["final-report", propertyId, itemId], queryFn: () => getFinalReport(propertyId, itemId), staleTime: 0, gcTime: 0, refetchOnWindowFocus: false });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const accessRejected = isApiError(query.error) && [401, 403, 404].includes(query.error.status);
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  return <Modal open title={`${turnText(language, "Final-walk report")} / ${propertyName}`} testId="final-report-editor" onClose={() => { if (!busy && (!dirty || window.confirm(turnText(language, "Discard unsaved report changes?")))) onClose(); }}>
    {query.isPending ? <p>{turnText(language, "Loading report settings...")}</p> : !query.data || accessRejected ? <p role="alert">{turnText(language, "Could not load report settings.")} <button type="button" onClick={() => void query.refetch()}>{turnText(language, "Retry")}</button></p> : <>
      {query.isError ? <p role="alert" data-testid="report-refresh-warning">{turnText(language, "Saved report data could not refresh. Your current form is preserved; it may differ from the latest saved record.")} <button type="button" disabled={query.isFetching} onClick={() => void query.refetch()}>{turnText(language, "Retry report refresh")}</button></p> : null}
      <ReportEditor key={`${propertyId}:${itemId ?? "settings"}`} language={language} initial={query.data} onDirty={setDirty} onBusy={setBusy} onReturned={() => { setDirty(false); onClose(); }} />
    </>}
  </Modal>;
}

function ReportEditor({ initial, onDirty, onBusy, onReturned, language }: { initial: FinalReportData; onDirty: (dirty: boolean) => void; onBusy: (busy: boolean) => void; onReturned: () => void; language: string }) {
  const client = useQueryClient();
  const [savedSettings, setSavedSettings] = useState(initial.settings);
  const [pdfPending, setPdfPending] = useState(false);
  const [occupiedResult, setOccupiedResult] = useState<{ archived: boolean } | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideConfirmed, setOverrideConfirmed] = useState(false);
  const [settings, setSettings] = useState(initial.settings.value);
  const [savedDraft, setSavedDraft] = useState(initial.draft);
  const [draft, setDraft] = useState(() => datedInspection(initial.draft.value, Boolean(initial.item), initial.inspectionToday));
  const [item, setItem] = useState(initial.item);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [html, setHtml] = useState("");
  const [showCodes, setShowCodes] = useState(false);
  const [photoProgress, setPhotoProgress] = useState<{ done: number; total: number } | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const actionPending = useRef(false);
  const settingsDirty = JSON.stringify(settings) !== JSON.stringify(savedSettings.value);
  const draftDirty = JSON.stringify(draft) !== JSON.stringify(savedDraft.value);
  const handoffCounts = [["homeKeys", "Home key count"], ["mailboxKeys", "Mailbox key count"], ["fobs", "Access fob count"], ["remotes", "Garage remote count"]] as const;
  const invalidCounts = handoffCounts.filter(([key]) => !/^\d{1,4}$/.test(draft[key].trim()));
  const countsWarning = `${turnText(language, "Enter a whole-number count for each item (0 for none):")} ${invalidCounts.map(([, label]) => turnText(language, label)).join(", ")}`;
  useEffect(() => { onDirty(settingsDirty || draftDirty); }, [settingsDirty, draftDirty, onDirty]);
  useEffect(() => { onBusy(busy); }, [busy, onBusy]);
  useEffect(() => { setHtml(""); }, [settings, draft, item?.id]);
  useEffect(() => { if (html) previewRef.current?.scrollIntoView({ block: "nearest" }); }, [html]);
  const run = async (action: () => Promise<void>) => {
    if (actionPending.current) return;
    actionPending.current = true;
    setBusy(true); setError(""); setMessage("");
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message : turnText(language, "Report request failed")); }
    finally { actionPending.current = false; setBusy(false); }
  };
  const updateSettings = (patch: Partial<FinalReportSettings>) => setSettings(current => ({ ...current, ...patch }));
  const validateSettings = () => {
    if (settings.introduction.length > 20000 || settings.footer.length > 20000) throw new Error(turnText(language, "Introduction and resident footer must each be 20,000 characters or fewer. Your text has not been removed."));
    if ((settings.onboardingLinks ?? []).some(link => {
      try { const url = new URL(link.url.trim()); return !link.label.trim() || url.protocol !== "https:" || Boolean(url.username || url.password); } catch { return true; }
    })) throw new Error(turnText(language, "Each onboarding button needs a name and an HTTPS link without embedded credentials."));
  };
  const saveSettings = () => void run(async () => {
    validateSettings();
    const saved = await saveFinalReportSettings(initial.property.id, { version: savedSettings.version, value: settings });
    setSavedSettings(saved); setSettings(saved.value);
    setMessage(turnText(language, "Report settings saved for this property."));
  });
  const updateDraft = (patch: Partial<FinalReportDraft>) => setDraft(current => ({ ...current, ...patch }));
  const result = (id: string) => draft.results[id] ?? { status: "NOT_CHECKED" as const, note: "" };
  const visibleChecks = initial.checks.filter(check => !item?.stockInspection || check.id !== "handoff-v2-2" || result(check.id).status === "ATTENTION");
  const updateResult = (id: string, patch: Partial<FinalReportResult>) => setDraft(current => ({ ...current, results: { ...current.results, [id]: { ...(current.results[id] ?? { status: "NOT_CHECKED", note: "" }), ...patch } } }));
  const validateDraft = () => {
    if (draft.handoffConfirmed && invalidCounts.length) throw new Error(countsWarning);
    const missing = initial.checks.find(check => ["ATTENTION", "NA"].includes(result(check.id).status) && !result(check.id).note.trim());
    if (missing) throw new Error(`${language === "es" ? "Agrega un motivo para" : "Add a reason for"}: ${turnText(language, missing.label)}`);
  };
  const residentHelp = !item ? "" : turnText(language, item.stockInspection
    ? "The resident copy becomes available when an applicant or move-in is recorded."
    : !item.unitReady ? "Complete the inspection and mark the unit Ready before downloading the resident copy."
    : settingsDirty || draftDirty || !savedDraft.version ? "Save changes before downloading the resident copy." : "");
  const residentPdf = () => void run(async () => {
    if (!item) return;
    setPdfPending(true);
    try {
    const session = getVerifiedSession();
    const response = await downloadResidentReport(initial.property.id, item.id, savedDraft.version);
    if (!isCurrentSession(session)) return;
    const android = import.meta.env.VITE_ANDROID_SHELL === "true";
    await deliverReportPdf(response.pdfBase64, `final-walk-${initial.property.code.replace(/[^a-z0-9-]/gi, "_")}-${item.unitNumber.replace(/[^a-z0-9-]/gi, "_")}-r${savedDraft.version}.pdf`, "resident", android);
    setMessage(android ? (language === "es" ? "PDF del residente preparado. Usa las opciones de Android para guardarlo o compartirlo." : "Resident PDF prepared. Use Android's options to save or share it.") : turnText(language, "Resident report downloaded from saved inspection records. Unit status was not changed."));
    } finally { setPdfPending(false); }
  });
  const preview = (format: "html" | "pdf") => void run(async () => {
    validateSettings();
    if (item) validateDraft();
    const session = getVerifiedSession();
    const response = await previewFinalReport(initial.property.id, { itemId: item?.id, settings, draft, format });
    if (!isCurrentSession(session)) return;
    if (response.html) { setHtml(response.html); setMessage(turnText(language, "Preview uses current form values and saved property/company logos. Unsaved edits are not saved by previewing.")); }
    if (response.pdfBase64) {
      const android = import.meta.env.VITE_ANDROID_SHELL === "true";
      await deliverReportPdf(response.pdfBase64, `final-walk-DRAFT-${initial.property.code.replace(/[^a-z0-9-]/gi,"_")}-${(item?.unitNumber ?? "branding").replace(/[^a-z0-9-]/gi,"_")}.pdf`, "draft", android);
      setMessage(android ? (language === "es" ? "Borrador preparado para Android. No es la copia del residente." : "Draft prepared for Android. It is not the resident copy.") : turnText(language, "Draft PDF downloaded. It is not a finalized inspection record."));
    }
  });
  if (occupiedResult) return <section data-testid="final-report-occupied-result" role="status">
    <h3>{turnText(language, "Unit marked occupied")}</h3>
    <p>{turnText(language, occupiedResult.archived ? "Move-in recorded. The completed turn is archived and the unit is in Occupied units." : "Occupancy updated. The turn is still active; review its remaining work on the board.")}</p>
    <button type="button" className="button" onClick={onReturned}>{turnText(language, "Close")}</button>
  </section>;
  return <div className="final-report-workspace">
    <div className="final-report-notice"><strong>{item?.unitReady ? turnText(language, "Completed unit / inspection report") : turnText(language, "Inspection report workspace")}</strong><p>{turnText(language, "Saving inspection details does not change the unit's Ready status or create an electronic signature. Preview and draft downloads include unsaved edits. Resident PDFs use saved, completed inspection records only.")}</p>{item?.unitReady ? <p>{turnText(language, "You can return here from Table > Ready Units > open unit > Edit / download final-walk report, even after the unit leaves My Work.")}</p> : null}</div>
    {error ? <p role="alert">{error}</p> : null}{message ? <p role="status">{message}</p> : null}
    <fieldset disabled={busy} className="final-report-form">
      <label>{turnText(language, "Property")}<input readOnly value={`${initial.property.code} / ${initial.property.name}`} /></label>
      <label>{turnText(language, "Turn to inspect")}<select disabled={!initial.canEditSettings} data-testid="final-report-unit" value={item?.id ?? ""} onChange={event => {
        const id = event.target.value;
        if (draftDirty && !window.confirm(turnText(language, "Discard unsaved inspection changes before selecting another turn?"))) return;
        void run(async () => { const data = await getFinalReport(initial.property.id, id || undefined); setItem(data.item); setSavedDraft(data.draft); setDraft(datedInspection(data.draft.value, Boolean(data.item), data.inspectionToday)); });
      }}><option value="">{turnText(language, "Branding preview only (no inspection)")}</option>{initial.items.map(turn => <option key={turn.id} value={turn.id}>{turn.unitNumber} / {turn.boardGroup}</option>)}</select></label>
      {initial.canEditSettings ? <details open><summary>{turnText(language, "Report wording & style / this property")}</summary>
        <label>{turnText(language, "Report title")}<input data-testid="final-report-title" value={settings.title} maxLength={80} onChange={event => updateSettings({ title: event.target.value })} /></label>
        <label>{turnText(language, "Introduction")}<textarea value={settings.introduction} rows={6} onChange={event => updateSettings({ introduction: event.target.value })} /></label>
        <label>{turnText(language, "Resident footer")}<textarea value={settings.footer} rows={6} onChange={event => updateSettings({ footer: event.target.value })} /></label>
        <small>{turnText(language, "Markdown supported in both fields: **bold**, *italic*, ## Heading, - bullet, 1. numbered item, and [link](https://example.com). Use Preview report to see formatting. HTML and embedded images are not supported.")}</small>
        <label><input type="checkbox" style={{ width: "auto" }} checked={settings.residentInfoNewPage ?? false} onChange={event => updateSettings({ residentInfoNewPage: event.target.checked })} />{turnText(language, "Start resident information on a separate welcome page")}</label>
        <small>{turnText(language, "Leave unchecked to use the space below the inspection and continue onto another page only when needed. Both layouts use readable text. Saved once for this property; no additional inspection checks.")}</small>
        <small>{turnText(language, "Line breaks are preserved. Each field supports up to 20,000 characters; longer reports continue onto additional pages.")}</small>
        <label>{turnText(language, "Accent color")}<input type="color" value={settings.accent} onChange={event => updateSettings({ accent: event.target.value })} /></label>
        <button type="button" className="button button-primary" disabled={!settingsDirty} onClick={saveSettings}>{turnText(language, "Save report settings")}</button>
      </details> : <p>{turnText(language, "Report wording, style and logos use the property's saved admin settings.")}</p>}
      {item ? <>
        <fieldset className="final-report-form" disabled={!initial.canEditDraft}><legend>{turnText(language, "Inspection details")}</legend>
        {item.stockInspection ? <div data-testid="stock-inspection-notice"><strong>{turnText(language, "Stock-ready inspection / no move-in scheduled")}</strong><p>{turnText(language, "Inspect the unit's condition now. The move-in folder, resident codes and key handoff confirmation are deferred until a resident is assigned. Existing findings still need resolution.")}</p></div> : null}
        <p className="helper-copy">{turnText(language, "Assigned tech:")} {item.technician || turnText(language, "Unassigned")}{turnText(language, ". Assigned final reviewer:")} {item.reviewer || turnText(language, "Unassigned")}{turnText(language, ". These names are not signatures.")}</p>
        <label>{turnText(language, "Inspection date")}<input data-testid="final-report-date" type="date" value={draft.inspectionDate} onChange={event => updateDraft({ inspectionDate: event.target.value })} /></label>
        <small>{turnText(language, "Defaults to today for an undated inspection. Saved dates stay unchanged; adjust the date if needed.")}</small>
        <details><summary>{turnText(language, "Existing turn checklist records (reference only)")}</summary><p>{turnText(language, "Existing completion flags are shown for reference, not automatically copied as verified inspection results.")}</p>{item.checklists.length ? item.checklists.map(list => <section key={list.id}><h4>{list.name}</h4><ul>{list.items.map(check => <li key={check.id}>{check.title}: {check.completed ? turnText(language, "Recorded complete") : turnText(language, "Not complete")}{check.completedAt ? ` / ${check.completedAt.slice(0,10)}` : ""}</li>)}</ul></section>) : <p>{turnText(language, "No checklist records on this turn.")}</p>}</details>
        <p className="helper-copy">{turnText(language, "A short presentation walk: cleanliness, freshness, comfort and resident handoff. Technical preparation belongs to the technician in Work. Only exceptions need a written reason.")}</p>
        <details><summary>{turnText(language, "Technician preparation (read-only reference)")}</summary>{initial.technicianChecks.map(check => <p key={check.id}>{turnText(language, check.label)}: <strong>{turnText(language, ({ NOT_CHECKED: "Not checked", CHECKED: "Done", ATTENTION: "Needs attention", NA: "Not applicable" })[draft.technicianResults[check.id]?.status ?? "NOT_CHECKED"])}</strong>{draft.technicianResults[check.id]?.note ? ` / ${draft.technicianResults[check.id].note}` : ""}</p>)}</details>
        {initial.sections.map(section => <details open key={section.id}><summary>{turnText(language, item.stockInspection && section.id === "handoff-v2" ? "Final condition review" : section.title)}<small>{visibleChecks.filter(check => check.section === section.id && result(check.id).status !== "NOT_CHECKED").length} / {visibleChecks.filter(check => check.section === section.id).length} {turnText(language, "recorded")}</small></summary>
          {visibleChecks.filter(check => check.section === section.id).map(check => <div key={check.id} className="final-report-check" data-check-status={result(check.id).status}>
            <label>{turnText(language, check.label)}<select data-testid={`final-report-result-${check.id}`} value={result(check.id).status} onChange={event => updateResult(check.id, { status: event.target.value as FinalReportResult["status"] })}><option value="NOT_CHECKED">{turnText(language, "Not checked")}</option><option value="CHECKED">{turnText(language, "Checked")}</option><option value="ATTENTION">{turnText(language, "Needs attention")}</option><option value="NA">{turnText(language, "Not applicable")}</option></select></label>
            {["ATTENTION", "NA"].includes(result(check.id).status) || result(check.id).note ? <label>{turnText(language, "Reason / detail")}{["ATTENTION", "NA"].includes(result(check.id).status) ? turnText(language, " (required)") : ""}<input maxLength={100} value={result(check.id).note} data-testid={`final-report-note-${check.id}`} onChange={event => updateResult(check.id, { note: event.target.value })} /></label> : null}
          </div>)}
        </details>)}
        {item.stockInspection ? <section className="final-report-deferred" data-testid="stock-handoff-deferred" aria-label={turnText(language, "Resident handoff / not needed for stock-ready")}>
          <strong>{turnText(language, "Not needed for stock-ready")}</strong>
          <p>{turnText(language, "Move-in folder, resident codes, parking assignment and key/fob/remote handoff.")}</p>
          <small>{turnText(language, "Nothing to fill out or mark N/A here. These fields return when an applicant or move-in is recorded. Previously saved details are kept.")}</small>
        </section> : <details open><summary>{turnText(language, "Mailbox & resident handoff details")}</summary>
          <label>{turnText(language, "Mailbox source")}<select value={draft.mailboxSource ?? "CUSTOM"} onChange={event => updateDraft({ mailboxSource: event.target.value as "DIRECTORY" | "CUSTOM", ...(event.target.value === "DIRECTORY" ? { mailbox: item.directoryMailbox ?? "" } : {}) })}><option value="DIRECTORY">{turnText(language, "Unit mailbox directory (automatic)")}</option><option value="CUSTOM">{turnText(language, "Override for this report only")}</option></select></label>
          <label>{turnText(language, "Mailbox number")}<input data-testid="report-mailbox" maxLength={40} value={draft.mailbox} readOnly={draft.mailboxSource === "DIRECTORY"} onChange={event => updateDraft({ mailbox: event.target.value })}/></label>
          <p>{draft.mailboxSource === "DIRECTORY" ? turnText(language, "Uses the latest saved unit mailbox when previewing or printing. Manage assignments in Turn Details or Setup > Units > Mailbox directory.") : turnText(language, "This override does not change the unit directory.")}</p>
          <p>{turnText(language, "Counts below come from technician preparation. Count the actual items, correct any discrepancy, then confirm. Use 0 for none.")}</p>
          {handoffCounts.map(([key, label]) => <label key={key}>{turnText(language, label)}<input inputMode="numeric" maxLength={4} value={draft[key]} aria-invalid={invalidCounts.some(([field]) => field === key)} aria-describedby={invalidCounts.length ? "final-report-counts-warning" : undefined} onChange={event => updateDraft({ [key]: event.target.value, handoffConfirmed: false })}/></label>)}
          <label>{turnText(language, "Parking / garage assignment")}<input maxLength={60} value={draft.parking} onChange={event => updateDraft({ parking: event.target.value })}/></label>
          {invalidCounts.length ? <p id="final-report-counts-warning" role="status">{countsWarning}</p> : null}
          <label><input type="checkbox" style={{ width: "auto" }} disabled={invalidCounts.length > 0} checked={draft.handoffConfirmed} onChange={event => updateDraft({ handoffConfirmed: event.target.checked })} />{turnText(language, "I counted and confirmed the home/mailbox keys, fobs and remotes for handoff")}</label>
          <p>{turnText(language, "After confirming the counts, click Save inspection draft below. Checking this box alone does not save.")}</p>
          <p>{turnText(language, "Door/unit codes must be resident-specific. Gate/pedestrian codes may be resident-issued community codes. Never enter staff, vendor or master codes. No access codes are copied from the property access wiki.")}</p>
          <button type="button" className="button button-secondary" data-testid="report-code-visibility" aria-pressed={showCodes} onClick={() => setShowCodes(value => !value)}>{turnText(language, showCodes ? "Hide codes" : "Show codes")}</button>
          <label>{turnText(language, "Resident-only door code")}<input data-testid="report-door-code" type={showCodes ? "text" : "password"} autoComplete="new-password" maxLength={60} value={draft.residentDoorCode} onChange={event => updateDraft({ residentDoorCode: event.target.value })}/></label>
          <label>{turnText(language, "Resident-only access code")}<input type={showCodes ? "text" : "password"} autoComplete="new-password" maxLength={60} value={draft.residentAccessCode} onChange={event => updateDraft({ residentAccessCode: event.target.value })}/></label>
          <label>{turnText(language, "Resident gate code")}<input type={showCodes ? "text" : "password"} autoComplete="new-password" maxLength={60} value={draft.gateCode} onChange={event => updateDraft({ gateCode: event.target.value })} /></label>
          <label>{turnText(language, "Resident pedestrian access code")}<input type={showCodes ? "text" : "password"} autoComplete="new-password" maxLength={60} value={draft.pedestrianCode} onChange={event => updateDraft({ pedestrianCode: event.target.value })} /></label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input style={{ width: "auto" }} type="checkbox" checked={draft.includeResidentCodes} onChange={event => updateDraft({ includeResidentCodes: event.target.checked })}/>{turnText(language, "I confirm all codes here may be issued to this resident; include them on this report")}</label>
        </details>}
        <label>{turnText(language, "Internal follow-up for technician")}<textarea rows={3} maxLength={1000} value={draft.technicianFollowUp} onChange={event => updateDraft({ technicianFollowUp: event.target.value })}/></label>
        <FollowUpPhotos key={item.id} ids={draft.technicianPhotoIds ?? []} language={language} onRemove={id => updateDraft({ technicianPhotoIds: (draft.technicianPhotoIds ?? []).filter(photo => photo !== id) })} />
        <label>{language === "es" ? "Agregar fotos del seguimiento (hasta 50)" : "Add follow-up photos (up to 50)"}
          <input type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,image/avif" disabled={busy || (draft.technicianPhotoIds?.length ?? 0) >= 50} onChange={event => {
            const files = Array.from(event.target.files ?? []); event.target.value = "";
            if (!files.length) return;
            void run(async () => {
              const session = getVerifiedSession();
              if (!session.userId) throw new Error(language === "es" ? "Inicia sesión de nuevo." : "Sign in again.");
              const ids = [...(draft.technicianPhotoIds ?? [])];
              if (ids.length + files.length > 50) throw new Error(language === "es" ? "Puedes adjuntar hasta 50 fotos." : "Attach no more than 50 follow-up photos.");
              if (files.some(file => !["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"].includes(file.type))) throw new Error(language === "es" ? "Selecciona fotos JPG, PNG, WebP, GIF o AVIF." : "Choose JPG, PNG, WebP, GIF or AVIF photos.");
              setPhotoProgress({ done: 0, total: files.length });
              try {
                for (const [index, file] of files.entries()) {
                  if (!isCurrentSession(session)) return;
                  const uploaded = await uploadItemAttachment(item.id, file, "FINAL_WALK", { expectedUserId: session.userId }, crypto.randomUUID());
                  if (!isCurrentSession(session)) return;
                  ids.push(uploaded.attachment.id);
                  updateDraft({ technicianPhotoIds: [...ids] });
                  setPhotoProgress({ done: index + 1, total: files.length });
                }
              } finally { setPhotoProgress(null); }
              setMessage(language === "es" ? "Fotos cargadas. Guarda o envía las correcciones para incluirlas." : "Photos uploaded. Save or send corrections to include them in the follow-up.");
            });
          }} />
        </label>
        {photoProgress ? <p role="status">{language === "es" ? "Cargando fotos" : "Uploading photos"}: {photoProgress.done} / {photoProgress.total}</p> : null}
        <small>{language === "es" ? "Se requiere conexión para cargar fotos. Se guardan en la galería interna de la unidad. Quitar una del seguimiento no la elimina de la galería. No aparecen en el PDF del residente." : "Photo uploads require a connection and are saved in the unit's internal gallery. Removing one from the follow-up does not delete it from the gallery. They do not appear on the resident PDF."}</small>
        <p>{turnText(language, "Not printed on the resident report. Send corrections to reopen the technician's work and notify them; painting and cleaning stay unchanged. The final walk must be rechecked afterward.")}</p>
        {draft.technicianResolution ? <p><strong>{turnText(language, "Technician resolution:")}</strong> {draft.technicianResolution}</p> : null}
        <button type="button" disabled={item.unitReady || (!draft.technicianFollowUp.trim() && !initial.checks.some(check => result(check.id).status === "ATTENTION"))} onClick={() => void run(async () => {
          validateDraft();
          const saved = await saveFinalReportDraft(initial.property.id, item.id, { version: savedDraft.version, value: draft });
          setSavedDraft(saved); setDraft(saved.value);
          await returnFinalWalkToTech(initial.property.id, item.id, saved.version);
          await client.invalidateQueries();
          onReturned();
        })}>{turnText(language, "Save and send corrections to technician")}</button>
        <button type="button" className="button button-primary" data-testid="final-report-save-draft" disabled={!draftDirty} onClick={() => void run(async () => { validateDraft(); const saved = await saveFinalReportDraft(initial.property.id, item.id, { version: savedDraft.version, value: draft }); setSavedDraft(saved); setDraft(saved.value); void client.invalidateQueries({ queryKey: ["final-walk", item.id] }); void client.invalidateQueries({ queryKey: ["resident-codes", item.id] }); setMessage(turnText(language, "Inspection draft saved. Unit status and sign-offs were not changed.")); })}>{turnText(language, "Save inspection draft")}</button>
        {error ? <CompletionNotice error message={error} language={language} testId="final-report-save-error" /> : null}
        {draftDirty ? <p>{turnText(language, "Unsaved changes. Preview includes them; Save persists them.")}</p> : null}
        <small>{savedDraft.updatedAt ? `${language === "es" ? "Guardado" : "Saved"} ${new Date(savedDraft.updatedAt).toLocaleString(language === "es" ? "es-US" : "en-US")} / ${language === "es" ? "revisión" : "revision"} ${savedDraft.version}` : turnText(language, "No saved inspection draft yet.")}</small>
        </fieldset>
      </> : <p>{turnText(language, "Choose a turn to enter inspection details. Branding-only previews start with every check unrecorded.")}</p>}
      <div className="final-report-toolbar" data-testid="final-report-onboarding">
        <div className="final-report-actions" data-testid="final-report-toolbar">
          <button type="button" className="button" data-testid="final-report-preview" onClick={() => preview("html")}>{turnText(language, "Preview report")}</button>
          {item ? <span title={residentHelp || turnText(language, "Save changes first. Requires recorded technician and final-walk checks, inspection date, confirmed handoff counts and no unresolved corrections. Missing records are never inferred from Ready status.")}>
            <button type="button" className="button button-primary" data-testid="final-report-resident-pdf" aria-describedby={residentHelp ? "resident-download-help" : undefined} disabled={busy || settingsDirty || draftDirty || !savedDraft.version || !item.unitReady || item.stockInspection} onClick={residentPdf}>{pdfPending ? (language === "es" ? "Preparando PDF..." : "Preparing PDF...") : turnText(language, "Download resident PDF")}</button>
          </span> : null}
          {(savedSettings.value.onboardingLinks ?? []).map((link, index) => <a key={index} className="button" href={link.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" title={turnText(language, "Opens in a new tab")} aria-label={`${link.label} (${turnText(language, "Opens in a new tab")})`}>{link.label}</a>)}
        </div>
        {item && residentHelp ? <CompletionNotice id="resident-download-help" message={residentHelp} language={language} /> : null}
        {pdfPending ? <p role="status">{language === "es" ? "Generando el PDF. Mantén la aplicación abierta; aparecerán las opciones para guardar o compartir." : "Generating the PDF. Keep the app open; save and share options will appear when it is ready."}</p> : message ? <p role="status">{message}</p> : null}
        {error ? <CompletionNotice error message={error} language={language} /> : null}
        {item && initial.canMarkOccupied ? <div className="final-report-move-in" data-testid="final-report-move-in">
          <strong>{turnText(language, "Move-in handoff")}</strong>
          <small>{turnText(language, "You can print the resident PDF ahead of time. Only mark Occupied after the resident has actually moved in; this archives the completed turn.")}</small>
          <button type="button" className="button button-secondary" data-testid="final-report-mark-occupied" disabled={busy || !item.unitReady || item.stockInspection || settingsDirty || draftDirty} onClick={() => {
            if (!window.confirm(`${item.unitNumber}: ${turnText(language, "Has the resident actually moved in? Mark this unit Occupied and archive its completed turn? Printing or preparing the folder alone does not mean the unit is occupied.")}`)) return;
            void run(async () => {
              const updated = await patchMakeReadyItem(item.id, { vacancyStatus: "OCCUPIED" });
              setOccupiedResult({ archived: updated.isArchived });
              void client.invalidateQueries({ predicate: query => query.queryKey[0] !== "final-report" });
            });
          }}>{turnText(language, "Confirm move-in / mark occupied")}</button>
          {!item.unitReady || item.stockInspection || settingsDirty || draftDirty ? <small>{turnText(language, "Save report changes, record an applicant or move-in, and mark the unit Ready before completing move-in handoff.")}</small> : null}
        </div> : null}
      {initial.canEditSettings ? <details className="final-report-link-settings"><summary>{turnText(language, "Onboarding settings")}</summary>
        <p>{turnText(language, "Add staff links for gate access, parking or other move-in tasks. These links are not printed on the resident PDF. Do not include passwords, access codes or private tokens in URLs.")}</p>
        <fieldset disabled={busy} className="final-report-form">
          {(settings.onboardingLinks ?? []).map((link, index) => <div className="final-report-link-row" key={index}>
            <label>{turnText(language, "Button name")}<input maxLength={60} value={link.label} onChange={event => updateSettings({ onboardingLinks: settings.onboardingLinks!.map((entry, i) => i === index ? { ...entry, label: event.target.value } : entry) })} /></label>
            <label>{turnText(language, "HTTPS link")}<input type="url" maxLength={2000} placeholder="https://example.com/onboarding" value={link.url} onChange={event => updateSettings({ onboardingLinks: settings.onboardingLinks!.map((entry, i) => i === index ? { ...entry, url: event.target.value } : entry) })} /></label>
            <button type="button" className="button" aria-label={`${turnText(language, "Remove onboarding button")}: ${link.label || index + 1}`} onClick={() => updateSettings({ onboardingLinks: settings.onboardingLinks!.filter((_, i) => i !== index) })}>{turnText(language, "Remove")}</button>
          </div>)}
          <div className="final-report-actions"><button type="button" className="button" disabled={(settings.onboardingLinks ?? []).length >= 12} onClick={() => updateSettings({ onboardingLinks: [...(settings.onboardingLinks ?? []), { label: "", url: "" }] })}>{turnText(language, "Add onboarding button")}</button><button type="button" className="button button-primary" disabled={!settingsDirty} onClick={saveSettings}>{turnText(language, "Save onboarding buttons")}</button></div>
          <small>{turnText(language, "Up to 12 buttons per property. Saving also saves any report wording changes above.")}</small>
          {settingsDirty ? <p>{turnText(language, "Unsaved changes. Preview includes them; Save persists them.")}</p> : null}
        </fieldset>
      </details> : null}
      </div>
      <details><summary>{turnText(language, "Draft tools / not the resident copy")}</summary><p>{turnText(language, "For internal review only. Use Download resident PDF beside Preview report for the resident copy.")}</p><div className="final-report-actions"><button type="button" className="button" data-testid="final-report-pdf" onClick={() => preview("pdf")}>{turnText(language, "Download draft PDF")}</button><button type="button" className="button" onClick={() => { if ((settingsDirty || draftDirty) && !window.confirm(turnText(language, "Discard unsaved changes and reload saved report data?"))) return; void run(async () => { const data = await getFinalReport(initial.property.id, item?.id); setSettings(data.settings.value); setSavedSettings(data.settings); setDraft(datedInspection(data.draft.value, Boolean(data.item), data.inspectionToday)); setSavedDraft(data.draft); setItem(data.item); setMessage(turnText(language, "Saved report data reloaded.")); }); }}>{turnText(language, "Reload saved data")}</button></div></details>
      <small>{settingsDirty || draftDirty ? turnText(language, "Unsaved changes. Preview includes them; Save persists them.") : turnText(language, "No unsaved changes.")} {turnText(language, "Long reports continue onto additional pages in the PDF. Scroll inside the preview to read all text.")}</small>
    </fieldset>
    <section className="final-report-preview" ref={previewRef} aria-label={turnText(language, "Report preview")}>
      <div className="final-report-preview-content">
      <h3>{turnText(language, "Letter-page preview")}</h3><p>{turnText(language, "Uses the selected property's saved branding. Save logo changes in Branding before reopening this editor.")}</p>
      {html ? <FinalReportPreview key={html} html={html} language={language} /> : <p>{turnText(language, "Click Preview report to see the current draft. Changing a field clears the old preview.")}</p>}
      </div>
    </section>
    {item && initial.canEditDraft ? <section className="final-report-completion" data-ready={item.unitReady} data-testid="final-report-completion">
      <h3>{turnText(language, item.unitReady ? "Unit marked ready" : "Finish this inspection")}</h3>
      {item.unitReady ? <p role="status">{turnText(language, "This unit is recorded Ready. Further report edits do not change its status.")}</p> : <>
        <p>{turnText(language, "Finished the walk? Save your inspection and mark the unit Ready here. Any remaining blockers will be shown below.")}</p>
        <button type="button" className="button button-primary" data-testid="final-report-mark-ready" disabled={busy || settingsDirty} onClick={() => void run(async () => {
          validateDraft();
          if (draftDirty || !savedDraft.value.inspectionDate) {
            const saved = await saveFinalReportDraft(initial.property.id, item.id, { version: savedDraft.version, value: draft });
            setSavedDraft(saved); setDraft(saved.value);
            void client.invalidateQueries({ queryKey: ["final-walk", item.id] });
            void client.invalidateQueries({ queryKey: ["resident-codes", item.id] });
          }
          const completed = await markMakeReadyItemReady(item.id);
          setItem(current => current ? { ...current, unitReady: true } : current);
          setMessage(turnText(language, "Unit marked ready"));
          void client.invalidateQueries({ predicate: query => query.queryKey[0] !== "final-report" });
          if (completed.isArchived) onReturned();
        })}>{turnText(language, busy ? "Saving..." : draftDirty ? "Save inspection & mark ready" : "Mark unit ready")}</button>
        {settingsDirty ? <p>{turnText(language, "Save or reload your report wording changes before marking ready.")}</p> : null}
        {error ? <CompletionNotice error message={error} language={language} testId="final-report-ready-error" /> : null}
        {initial.canOverrideCompletion ? <details className="final-report-move-in" data-testid="final-report-override">
          <summary>{turnText(language, "Manager / admin override: mark Ready")}</summary>
          <p>{turnText(language, "Also assigned as the technician? Normal approval requires an independent inspector. As a manager or admin, you can explicitly override this rule and other completion blockers here.")}</p>
          <p>{turnText(language, "This records Ready status, not an independent inspection. Unfinished checks and report records stay unchanged; pending final-walk assignments are canceled. Your reason and bypassed blockers are recorded in the audit history.")}</p>
          <label>{turnText(language, "Override reason (at least 10 characters)")}<textarea data-testid="final-report-override-reason" value={overrideReason} maxLength={1000} disabled={busy} onChange={event => setOverrideReason(event.target.value)} /></label>
          <label><input type="checkbox" data-testid="final-report-override-confirm" checked={overrideConfirmed} disabled={busy} onChange={event => setOverrideConfirmed(event.target.checked)} />{turnText(language, "I confirm this unit should be Ready despite the outstanding requirements.")}</label>
          {settingsDirty || draftDirty ? <p>{turnText(language, "Save or discard report changes before overriding Ready status. The override does not save the report.")}</p> : null}
          <button type="button" className="button button-secondary" data-testid="final-report-override-submit" disabled={busy || settingsDirty || draftDirty || !overrideConfirmed || overrideReason.trim().length < 10} onClick={() => void run(async () => {
            const completed = await markMakeReadyItemReady(item.id, overrideReason.trim());
            setItem(current => current ? { ...current, unitReady: true } : current);
            setOverrideReason(""); setOverrideConfirmed(false);
            setMessage(turnText(language, "Ready status overridden. Inspection records were not changed."));
            void client.invalidateQueries({ predicate: query => query.queryKey[0] !== "final-report" });
            if (completed.isArchived) onReturned();
          })}>{turnText(language, "Override and mark Ready")}</button>
        </details> : null}
      </>}
    </section> : null}

  </div>;
}
