import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { updateProjectRecord, type ProjectRecord } from "../lib/api";
import { todayInputValue } from "../lib/dateTime";
import { getVerifiedSession, isCurrentSession } from "../lib/verifiedSession";

export function ProjectSchedulePanel({ record, canEdit }: { record: ProjectRecord; canEdit: boolean }) {
  const client = useQueryClient();
  const initial = () => ({ scheduledDate: record.scheduledDate?.slice(0, 10) || "", startDate: record.startDate?.slice(0, 10) || "", dueDate: record.dueDate?.slice(0, 10) || "", expectedUpdatedAt: record.updatedAt });
  const [draft, setDraft] = useState(initial);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const closed = record.isArchived || ["Completed", "Cancelled", "Denied", "Converted To Project"].includes(record.status);
  const overdue = !closed && record.dueDate && record.dueDate.slice(0, 10) < todayInputValue();
  return <section className="projects-detail-card project-schedule" data-testid="project-schedule">
    <h4>Schedule &amp; deadline</h4>
    <p>{overdue ? "Overdue: " : "Project deadline: "}{record.dueDate?.slice(0, 10) || "Not set"}. Quote response/expiry dates are tracked separately below.</p>
    {error ? <p role="alert">{error}</p> : null}{message ? <p role="status">{message}</p> : null}
    {canEdit && !record.isArchived ? <form onSubmit={event => { event.preventDefault(); if (lock.current) return;
      if (draft.dueDate && ((draft.scheduledDate && draft.scheduledDate > draft.dueDate) || (draft.startDate && draft.startDate > draft.dueDate))) { setError("The deadline cannot be before the scheduled or actual start date."); return; }
      const session = getVerifiedSession(); if (!session.userId) return;
      lock.current = true; setBusy(true); setError(""); setMessage("");
      void (async () => {
        try {
          const saved = await updateProjectRecord(record.id, { scheduledDate: draft.scheduledDate || null, startDate: draft.startDate || null, dueDate: draft.dueDate || null, expectedUpdatedAt: draft.expectedUpdatedAt });
          if (!isCurrentSession(session)) return;
          setDraft({ ...draft, expectedUpdatedAt: saved.record.updatedAt }); setMessage("Schedule saved.");
          try { await client.invalidateQueries({ queryKey: ["projects"] }, { throwOnError: true }); await client.invalidateQueries({ queryKey: ["my-work"] }); }
          catch { if (isCurrentSession(session)) setError("Schedule saved, but refresh failed. Reload before trying again."); }
        } catch (err) { if (isCurrentSession(session)) setError(err instanceof Error ? err.message : "Schedule was not saved. Your draft is retained."); }
        finally { lock.current = false; if (isCurrentSession(session)) setBusy(false); }
      })();
    }}><fieldset disabled={busy} className="project-budget-fields">
      <label>Scheduled start<input type="date" value={draft.scheduledDate} onChange={event => setDraft({ ...draft, scheduledDate: event.target.value })} /></label>
      <label>Actual start<input type="date" value={draft.startDate} onChange={event => setDraft({ ...draft, startDate: event.target.value })} /></label>
      <label>Project deadline<input type="date" value={draft.dueDate} onChange={event => setDraft({ ...draft, dueDate: event.target.value })} /></label>
      <button className="button button-primary" type="submit">Save schedule</button>
      {record.updatedAt !== draft.expectedUpdatedAt ? <button type="button" onClick={() => { setDraft(initial()); setError(""); }}>Discard date draft and load latest</button> : null}
    </fieldset></form> : null}
  </section>;
}
