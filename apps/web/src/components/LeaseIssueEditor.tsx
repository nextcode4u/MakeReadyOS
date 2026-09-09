import { useEffect, useRef, useState, type FormEvent } from "react";
import { updateLeaseComplianceIssue, type LeaseComplianceIssue, type Unit, type UserLanguage, type UserRole } from "../lib/api";
import { encodeLeaseEditDraft, leaseEditDraftKey, leaseEditFields, parseLeaseEditDraft, type LeaseEditDraft, type LeaseEditValues } from "../lib/leaseEditDraft";
import { getVerifiedSession, isCurrentSession } from "../lib/verifiedSession";
import { t } from "../lib/i18n";
import { SearchSelect } from "./SearchSelect";
import { UnitSearchSelect } from "./UnitSearchSelect";

export function LeaseIssueEditor({ issue, userId, units, users, language, onRefresh }: {
  issue: LeaseComplianceIssue;
  userId: string;
  units: Unit[];
  users: Array<{ id: string; fullName: string; role: UserRole }>;
  language: UserLanguage;
  onRefresh: () => Promise<void>;
}) {
  const key = leaseEditDraftKey(userId, issue.propertyId, issue.id);
  const [recovery, setRecovery] = useState(() => {
    try { return parseLeaseEditDraft(localStorage.getItem(key), userId, issue.propertyId, issue.id); } catch { return null; }
  });
  const [draft, setDraft] = useState<LeaseEditDraft | null>(null);
  const [saved, setSaved] = useState<LeaseComplianceIssue | null>(null);
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const current = saved && Date.parse(saved.updatedAt) > Date.parse(issue.updatedAt) ? saved : issue;
  const values = { ...current, ...draft?.values };
  const changed = Boolean(draft && draft.baseUpdatedAt !== current.updatedAt);
  const text = (en: string, es: string) => language === "es" ? es : en;
  const labels: Record<typeof leaseEditFields[number], string> = {
    unitId: t(language, "lease.unit"), building: t(language, "lease.building"), area: t(language, "lease.area"), status: t(language, "admin.status"),
    priority: t(language, "lease.priority"), assignedUserId: t(language, "lease.assignedUser"), noticeStage: t(language, "lease.noticeStage"),
  };
  const storeDraft = (next: LeaseEditDraft) => {
    setDraft(next); setNotice("");
    try { localStorage.setItem(key, encodeLeaseEditDraft(userId, issue.propertyId, issue.id, next)); setStorageError(""); }
    catch { setStorageError(text("This browser could not store your draft. Keep this screen open until you save online.", "No se pudo guardar el borrador en este navegador. Mantenga esta pantalla abierta hasta guardar en linea.")); }
  };
  const removeDraft = () => {
    setDraft(null); setRecovery(null);
    try { localStorage.removeItem(key); setStorageError(""); }
    catch { setStorageError(text("Could not remove the device draft. It may reappear after reload; do not submit it twice.", "No se pudo eliminar el borrador local. Puede reaparecer al recargar; no lo envie dos veces.")); }
  };
  const edit = (patch: LeaseEditValues) => {
    if (pending.current) return;
    storeDraft({ baseUpdatedAt: draft?.baseUpdatedAt ?? current.updatedAt, values: { ...draft?.values, ...patch } });
    setError("");
  };
  useEffect(() => {
    if (!storageError && !busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [storageError, busy]);
  const refresh = async () => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try { await onRefresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not refresh the issue."); }
    finally { pending.current = false; setBusy(false); }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft || changed || pending.current) return;
    const session = getVerifiedSession();
    if (session.userId !== userId) { setError(text("Sign in to the original account before saving this draft.", "Inicie sesion en la cuenta original antes de guardar.")); return; }
    pending.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const result = await updateLeaseComplianceIssue(issue.id, { ...draft.values, expectedUpdatedAt: draft.baseUpdatedAt }, { expectedUserId: userId });
      if (!isCurrentSession(session)) return;
      setSaved(result.issue); removeDraft();
      setNotice(text("Changes saved.", "Cambios guardados."));
      try { await onRefresh(); }
      catch { setNotice(text("Changes saved. Refresh failed; use Refresh latest without submitting again.", "Cambios guardados. No se pudo actualizar; use Actualizar sin volver a enviar.")); }
    } catch (reason) {
      if (isCurrentSession(session)) setError(reason instanceof Error ? reason.message : text("Could not save. Your draft is kept.", "No se pudo guardar. Se conserva el borrador."));
    } finally { pending.current = false; setBusy(false); }
  };
  const showValue = (field: typeof leaseEditFields[number], value: unknown) => {
    if (!value) return text("Not set", "Sin asignar");
    if (field === "unitId") return units.find(unit => unit.id === value)?.number ?? String(value);
    if (field === "assignedUserId") return users.find(user => user.id === value)?.fullName ?? String(value);
    return String(value);
  };
  return <section data-testid={`lease-editor-${issue.id}`}>
    {recovery ? <div role="status">
      <p>{text("An unsaved draft is stored on this device for your account. It has not been sent to the team.", "Hay un borrador local de su cuenta. No se ha enviado al equipo.")}</p>
      <button type="button" onClick={() => { setDraft(recovery); setRecovery(null); }}>{text("Resume draft", "Continuar borrador")}</button>
      <button type="button" onClick={removeDraft}>{text("Discard draft", "Descartar borrador")}</button>
    </div> : null}
    <form onSubmit={event => void save(event)}>
      <fieldset disabled={busy || Boolean(recovery)} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <div className="lease-issue-edit-grid">
          <label>{labels.unitId}<UnitSearchSelect units={units} value={values.unitId ?? ""} onChange={unitId => {
            const selected = units.find(unit => unit.id === unitId);
            edit({ unitId: unitId || null, ...(unitId ? { building: selected?.building ?? values.building } : {}) });
          }} language={language} placeholder={t(language, "lease.searchUnit")} emptyLabel={t(language, "lease.areaExteriorOnly")} /></label>
          <label>{labels.building}<input value={values.building ?? ""} maxLength={120} onChange={event => edit({ building: event.target.value || null })} placeholder={t(language, "lease.buildingPlaceholder")} /></label>
          <label>{labels.area}<input value={values.area ?? ""} maxLength={160} onChange={event => edit({ area: event.target.value || null })} placeholder={t(language, "lease.areaPlaceholder")} /></label>
          <label>{labels.status}<select value={values.status} onChange={event => edit({ status: event.target.value as LeaseComplianceIssue["status"] })}>{["Open", "Resident Notified", "Notice Sent", "Violation Needed", "Resolved", "Archived"].map(value => <option key={value}>{value}</option>)}</select></label>
          <label>{labels.priority}<select value={values.priority} onChange={event => edit({ priority: event.target.value as LeaseComplianceIssue["priority"] })}>{["Low", "Normal", "High", "Critical"].map(value => <option key={value}>{value}</option>)}</select></label>
          <label>{labels.assignedUserId}<SearchSelect options={users.map(user => ({ value: user.id, label: `${user.fullName} / ${user.role}` }))} value={values.assignedUserId ?? ""} onChange={assignedUserId => edit({ assignedUserId: assignedUserId || null })} placeholder={t(language, "pm.searchUser")} emptyLabel={t(language, "lease.unassigned")} /></label>
          <label>{labels.noticeStage}<select value={values.noticeStage} onChange={event => edit({ noticeStage: event.target.value as LeaseComplianceIssue["noticeStage"] })}>{["None", "Resident Notified", "1st Notice", "2nd Notice", "3rd Notice", "Violation Needed"].map(value => <option key={value}>{value}</option>)}</select></label>
        </div>
        {draft ? <p role="status">{text("Unsaved changes. Choose Save changes to update the team record.", "Cambios sin guardar. Seleccione Guardar cambios para actualizar el registro.")}</p> : null}
        {changed && draft ? <div role="alert">
          <p>{text("This issue changed. Review the latest saved values against your draft before choosing what to keep.", "La incidencia cambio. Compare los valores actuales con su borrador antes de continuar.")}</p>
          {leaseEditFields.filter(field => field in draft.values).map(field => <p key={field}><strong>{labels[field]}</strong>: {text("Saved", "Guardado")}: {showValue(field, current[field])} / {text("Your draft", "Su borrador")}: {showValue(field, draft.values[field])}</p>)}
          <button type="button" onClick={() => { if (window.confirm(text("Use your draft values over the latest saved values shown above?", "Usar su borrador sobre los valores guardados mostrados arriba?"))) storeDraft({ ...draft, baseUpdatedAt: current.updatedAt }); }}>{text("Keep my edits over latest values", "Conservar mis cambios sobre los actuales")}</button>
        </div> : null}
        <div className="lease-issue-actions">
          <button type="submit" className="button button-primary" disabled={!draft || changed}>{busy ? text("Saving...", "Guardando...") : text("Save changes", "Guardar cambios")}</button>
          <button type="button" className="button button-secondary" disabled={!draft} onClick={() => { removeDraft(); setError(""); setNotice(""); }}>{text("Discard changes", "Descartar cambios")}</button>
          <button type="button" className="button button-secondary" onClick={() => void refresh()}>{text("Refresh latest", "Actualizar")}</button>
        </div>
      </fieldset>
    </form>
    {error ? <p role="alert">{error}</p> : null}
    {storageError ? <p role="alert">{storageError}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
  </section>;
}
