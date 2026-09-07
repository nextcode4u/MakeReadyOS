import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { enableTurnSetup, pauseTurnSetup, previewTurnSetup, runAutomationNow, type Property, type TurnSetupPreview } from "../lib/api";

const stages = ["Make Ready (Start)", "Painting", "Cleaning", "Flooring / carpet contingency", "Expected Finish"];

export function TurnSchedulingGuide({ properties, onOpenSchedule }: { properties: Property[]; onOpenSchedule: (propertyId: string) => void }) {
  const queryClient = useQueryClient();
  const [propertyId, setPropertyId] = useState(properties.length === 1 ? properties[0].id : "");
  const [days, setDays] = useState([1, 1, 1, 1, 1]);
  const [preview, setPreview] = useState<TurnSetupPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [enabledRules, setEnabledRules] = useState<Array<{ id: string; name: string }> | null>(null);
  const valid = Boolean(propertyId) && days.every((day) => Number.isInteger(day) && day >= 1 && day <= 10);
  const resetReview = () => { setPreview(null); setError(""); setResult(""); setEnabledRules(null); };
  const review = async () => {
    setBusy(true); setError(""); setResult(""); setPreview(null);
    try { setPreview(await previewTurnSetup({ propertyId, days })); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not preview scheduling"); }
    finally { setBusy(false); }
  };
  const enable = async () => {
    setBusy(true); setError(""); setResult("");
    let saved = Boolean(enabledRules);
    try {
      const rules = enabledRules ?? (await enableTurnSetup({ propertyId, days })).rules;
      setEnabledRules(rules); saved = true;
      let actions = 0;
      const problems: string[] = [];
      for (const rule of rules) {
        const { execution } = await runAutomationNow(rule.id);
        actions += execution.actionCount;
        for (const entry of execution.results) problems.push(...entry.errors, ...entry.warnings);
      }
      setResult(`Scheduling is on for ${preview?.property.code}. ${actions} missing calendar dates filled. New eligible turns are checked every 5 minutes while the server is running.`);
      if (problems.length) setError(`Scheduling is enabled, but some items need review: ${problems.slice(0, 5).join("; ")}`);
    } catch (error) {
      setError(`${saved ? "Scheduling was enabled, but filling dates did not finish. Retry safely; existing dates are preserved. " : "Setup did not finish. Retry to check and complete it. "}${error instanceof Error ? error.message : "Request failed"}`);
    } finally {
      await queryClient.invalidateQueries();
      setBusy(false);
    }
  };
  const pause = async () => {
    setBusy(true); setError("");
    try {
      await pauseTurnSetup(propertyId);
      setEnabledRules(null);
      setPreview(current => current ? { ...current, configured: 0 } : null);
      setResult("Automatic scheduling is paused. Existing calendar dates are unchanged.");
      await queryClient.invalidateQueries();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not pause scheduling"); }
    finally { setBusy(false); }
  };
  let cumulative = 0;
  return <section className="turn-setup span-full" data-testid="turn-scheduling-guide">
    <header><p className="eyebrow">Start here</p><h2>Put your turns on the calendar</h2><p>Five working days after vacating. Set up once per property; no rule builder or pack installation needed.</p></header>
    <fieldset disabled={busy}>
      <legend>1. Choose the property and confirm your plan</legend>
      <label>Schedule turns for<select data-testid="turn-setup-property" value={propertyId} onChange={(event) => { setPropertyId(event.target.value); resetReview(); }}><option value="">Choose a property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.code} / {property.name}</option>)}</select></label>
      <p>The first workday is after the recorded <strong>Vacated</strong> date. Weekends are excluded; existing Monday/Friday restrictions are respected.</p>
      <div className="turn-setup-stages">{stages.map((stage, index) => {
        cumulative += Number(days[index]) || 0;
        return <label key={stage}><strong>{stage}</strong><span>{index === 0 ? "Start: working day 1" : `Target: working day ${cumulative || "-"}`}</span><span className="turn-setup-duration"><input aria-label={`${stage} days`} type="number" min="1" max="10" value={Number.isNaN(days[index]) ? "" : days[index]} onChange={(event) => { setDays(days.map((day, i) => i === index ? event.target.valueAsNumber : day)); resetReview(); }} /> day(s)</span></label>;
      })}</div>
      <p><strong>{days.reduce((sum, day) => sum + (Number(day) || 0), 0)} working days total.</strong> Five working days usually fits seven calendar days. Extra closed weekdays extend it.</p>
      <button className="button button-secondary" disabled={!valid || busy} onClick={() => void review()} data-testid="turn-setup-preview">{busy ? "Working..." : "2. Preview my calendar dates"}</button>
    </fieldset>
    {error ? <p role="alert" className="error-text">{error}</p> : null}
    {preview ? <section aria-label="Scheduling preview">
      <h3>3. Enable for {preview.property.code} / {preview.property.name}</h3>
      <p>{preview.changes} missing dates across {preview.total} active, incomplete turns with a vacate date. {preview.missingVacateDate} turn(s) need a Vacated date first.</p>
      {preview.configured ? <p>{preview.configured} guided rules are already on. Applying this plan updates their offsets for missing dates only.</p> : null}
      {(preview.calendar.avoidMondayScheduling || preview.calendar.avoidFridayScheduling) ? <p>This property also excludes {preview.calendar.avoidMondayScheduling ? "Mondays " : ""}{preview.calendar.avoidFridayScheduling ? "Fridays" : ""}.</p> : null}
      <p><strong>Included and enabled:</strong> all five scheduling rules and their calendar tracks. Make Ready (Start) schedules the first repair day; Expected Finish is the separate whole-unit ready target. Painting and cleaning fields are created automatically. Existing finish dates are not copied into start dates. Tracks are shared across properties; dates stay property-scoped.</p>
      <p>Existing dates stay unchanged, even if they conflict with this sequence. Past vacate dates can produce overdue targets. This is a date plan, not a completed-work status, staff/vendor booking, or capacity-checked Planning work block.</p>
      <details><summary>Review proposed dates ({Math.min(preview.total, 25)} of {preview.total} units)</summary><div className="turn-setup-preview-list">{preview.rows.map((row) => <article key={row.unitNumber}><strong>Unit {row.unitNumber}</strong>{row.dates.map((date) => <p key={date.label}>{date.label}: <strong>{date.date}</strong>{date.preserved ? " (keep existing)" : " (new)"}</p>)}</article>)}</div></details>
      <button className="button button-primary" disabled={busy || !valid} onClick={() => void enable()} data-testid="turn-setup-enable">{busy ? "Applying plan..." : enabledRules ? "Retry / fill remaining dates" : "Enable scheduling and fill calendar"}</button>
      {preview.configured || enabledRules ? <button className="button button-secondary" disabled={busy} onClick={() => void pause()}>Pause automatic scheduling</button> : null}
    </section> : null}
    {result ? <div role="status"><p>{result}</p><button className="button button-primary" onClick={() => onOpenSchedule(propertyId)}>Open Schedule calendar</button><p className="muted">Opens this property's five tracks and clears other board filters.</p></div> : null}
  </section>;
}
