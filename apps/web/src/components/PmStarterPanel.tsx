import { useId, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { applyPmStarter, getPmStarters, previewPmInspections, type PmInspectionDate, type PreventiveMaintenanceFrequency } from "../lib/api";
import { todayInputValue } from "../lib/dateTime";
import "./PmStarterPanel.css";

export function PmStarterPanel({ propertyId, propertyName, onApplied }: { propertyId: string; propertyName: string; onApplied: () => Promise<void> }) {
  const [expanded, setExpanded] = useState(true);
  const formId = useId();
  const catalog = useQuery({ queryKey: ["pm", "starters", propertyId], queryFn: () => getPmStarters(propertyId) });
  const [key, setKey] = useState("lighting");
  const [frequency, setFrequency] = useState<PreventiveMaintenanceFrequency>("Weekly");
  const [from, setFrom] = useState(todayInputValue());
  const [to, setTo] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(Math.floor(d.getMonth() / 3) * 3 + 3).padStart(2, "0")}-${new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3 + 3, 0).getDate()}`; });
  const [weekdays, setWeekdays] = useState([1, 2, 3, 4, 5]);
  const [interval, setInterval] = useState(30);
  const [plan, setPlan] = useState<PmInspectionDate[]>([]);
  const [message, setMessage] = useState("");
  const starter = catalog.data?.starters.find(s => s.key === key);
  const unitMode = key === "unit-inspection";
  const active = catalog.data?.installed.filter(s => (s.starterKey === key || s.starterKey.startsWith(`${key}:`)) && s.isActive && !s.isArchived).length ?? 0;
  const preview = useMutation({ mutationFn: () => previewPmInspections({ propertyId, from, to, weekdays }), onSuccess: result => { setPlan(result.plan); setMessage(""); } });
  const apply = useMutation({ mutationFn: (enabled: boolean) => applyPmStarter({ propertyId, key, enabled, frequency, firstDueDate: from, ...(frequency === "Custom" ? { customEveryDays: interval } : {}), ...(unitMode ? { unitDates: plan.map(({ unitId, dueDate }) => ({ unitId, dueDate })) } : {}) }), onSuccess: async (_, enabled) => { setMessage(enabled ? "Schedule saved. See Tasks and Calendar for the next inspections." : "Future recurrence paused. Existing tasks and history are retained."); await onApplied(); } });
  const busy = preview.isPending || apply.isPending;
  return <section className="pm-quick-start" data-testid="pm-starters" aria-label="Preventive maintenance quick start">
    <div className="pm-quick-start-heading">
      <div>
        <span className="eyebrow">Start here</span>
        <h2>Quick Start</h2>
        <p>Set up inspection logs and recurring maintenance for <strong>{propertyName}</strong>.</p>
        <p className="pm-quick-start-examples">Lighting, property walks, sprinklers, unit inspections, warranties and more.</p>
      </div>
      <button type="button" className={expanded ? "secondary" : ""} aria-expanded={expanded} aria-controls={formId} onClick={() => setExpanded(!expanded)}>{expanded ? "Hide setup" : "Open Quick Start"}</button>
    </div>
    <div id={formId} hidden={!expanded} className="pm-quick-start-form">
    <p className="pm-quick-start-steps">1. Choose a log &nbsp; / &nbsp; 2. Set dates and frequency &nbsp; / &nbsp; 3. Enable schedule</p>
    <h3>Set up maintenance for {propertyName}</h3>
    <p>Choose a starting point, set its frequency and first date, then enable it. Edit instructions, assignments and evidence requirements in Templates.</p>
    {catalog.isLoading ? <p>Loading starter library...</p> : null}
    <fieldset disabled={busy || !catalog.data} style={{ border: 0, padding: 0, minWidth: 0 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 12 }}>
        <label>Inspection / log<select value={key} onChange={e => { setKey(e.target.value); setFrequency(catalog.data!.starters.find(s => s.key === e.target.value)!.frequency); setPlan([]); setMessage(""); }}>
          {catalog.data?.starters.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}
        </select></label>
        <label>Repeat<select value={frequency} onChange={e => setFrequency(e.target.value as PreventiveMaintenanceFrequency)}>
          {(["Daily", "Weekly", "Biweekly", "Monthly", "Quarterly", "Semi-Annual", "Annual", "Custom"] as const).map(f => <option key={f} value={f}>{f === "Biweekly" ? "Every 2 weeks" : f === "Semi-Annual" ? "Every 6 months" : f === "Annual" ? "Every year" : f}</option>)}
        </select></label>
        {frequency === "Custom" ? <label>Every N days<input type="number" min={1} max={365} value={interval} onChange={e => setInterval(Number(e.target.value))} /></label> : null}
        <label>{unitMode ? "Inspection window starts" : "First due date"}<input type="date" value={from} onChange={e => { setFrom(e.target.value); setPlan([]); }} /></label>
        {unitMode ? <label>Inspection window ends<input type="date" value={to} onChange={e => { setTo(e.target.value); setPlan([]); }} /></label> : null}
      </div>
      <p>{starter?.instructions}</p>
      <p>{active} active schedule(s). Reapplying updates existing open due dates, not completed history. Pausing stops future recurrence but keeps open tasks.</p>
      {unitMode ? <>
        <p>Use all {catalog.data?.units.length ?? 0} active units in this property's directory. Dates are spread across the window by building and unit. Review entry notices and staffing before applying. Future cycles repeat from each scheduled date; new directory units require another preview.</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, n) => <label key={day}><input type="checkbox" checked={weekdays.includes(n)} onChange={e => { setWeekdays(e.target.checked ? [...weekdays, n] : weekdays.filter(d => d !== n)); setPlan([]); }} /> {day}</label>)}</div>
        <button type="button" onClick={() => preview.mutate()} disabled={!from || !to || !weekdays.length}>Preview unit dates</button>
        {plan.length ? <div style={{ maxHeight: 360, overflow: "auto", marginBlock: 12 }}>
          <table style={{ width: "100%" }}><caption>{plan.length} units scheduled; adjust any date before applying</caption><thead><tr><th>Unit</th><th>Building</th><th>Inspection date</th></tr></thead><tbody>{plan.map((row, index) => <tr key={row.unitId}><td>{row.number}</td><td>{row.building || "-"}</td><td><input aria-label={`Inspection date for unit ${row.number}`} type="date" value={row.dueDate} onChange={e => setPlan(plan.map((p, i) => i === index ? { ...p, dueDate: e.target.value } : p))} /></td></tr>)}</tbody></table>
        </div> : null}
      </> : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        <button type="button" disabled={!from || (unitMode && (!plan.length || plan.some(p => !p.dueDate)))} onClick={() => apply.mutate(true)}>{active ? "Apply updated schedule" : "Enable schedule"} for {propertyName}</button>
        {active ? <button type="button" className="secondary" onClick={() => apply.mutate(false)}>Pause recurrence</button> : null}
      </div>
    </fieldset>
    {catalog.error || preview.error || apply.error ? <p role="alert">{(catalog.error || preview.error || apply.error)?.message}</p> : null}
    {message ? <p role="status">{message}</p> : null}
    </div>
  </section>;
}
