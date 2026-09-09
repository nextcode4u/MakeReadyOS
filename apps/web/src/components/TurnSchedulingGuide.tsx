import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { enableTurnSetup, getTurnSetup, pauseTurnSetup, previewTurnSetup, runAutomationNow, type Property, type TurnSetupPreview } from "../lib/api";

const stages = ["Make Ready (Start)", "Painting", "Cleaning", "Flooring / carpet contingency", "Expected Finish"];

export function TurnSchedulingGuide({ properties, onOpenSchedule }: { properties: Property[]; onOpenSchedule: (propertyId: string) => void }) {
  const queryClient = useQueryClient();
  const [propertyId, setPropertyId] = useState(properties.length === 1 ? properties[0].id : "");
  const [days, setDays] = useState([1, 1, 1, 1, 1]);
  const [savedDays, setSavedDays] = useState([1, 1, 1, 1, 1]);
  const [loadedProperty, setLoadedProperty] = useState("");
  const settings = useQuery({ queryKey: ["turn-setup-settings", propertyId], queryFn: () => getTurnSetup(propertyId), enabled: !!propertyId });
  const [preview, setPreview] = useState<TurnSetupPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [enabledRules, setEnabledRules] = useState<Array<{ id: string; name: string }> | null>(null);
  const validDays = days.every((day) => Number.isInteger(day) && day >= 1 && day <= 10);
  const valid = Boolean(propertyId) && loadedProperty === propertyId && validDays;
  const dirty = loadedProperty === propertyId && JSON.stringify(days) !== JSON.stringify(savedDays);
  useEffect(() => {
    if (!settings.data || loadedProperty === propertyId) return;
    const stored = settings.data.days ?? [1, 1, 1, 1, 1];
    setDays(stored); setSavedDays(stored); setLoadedProperty(propertyId);
  }, [settings.data, loadedProperty, propertyId]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy]);
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
      setSavedDays(days);
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
    <header><p className="eyebrow">Automatic baseline</p><h2>Put your turns on the calendar</h2><p>Properties start with a five-working-day plan automatically. Import your units with a Vacated date; eligible turns get missing dates within five minutes while the server is running. No activation or pack installation needed.</p><p>Use this guide only to customize the plan, fill dates now, or pause scheduling. Existing dates and previously paused plans stay unchanged.</p></header>
    <fieldset disabled={busy}>
      <legend>1. Choose the property and review your plan</legend>
      <label>Schedule turns for<select data-testid="turn-setup-property" value={propertyId} onChange={(event) => {
        if (dirty && !window.confirm("Discard the unsaved scheduling durations and switch properties?")) return;
        setPropertyId(event.target.value); setLoadedProperty(""); resetReview();
      }}><option value="">Choose a property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.code} / {property.name}</option>)}</select></label>
      {settings.isLoading ? <p role="status">Loading saved schedule...</p> : null}
      {settings.isError ? <p role="alert">Could not load the saved schedule. <button type="button" onClick={() => void settings.refetch()}>Retry</button></p> : null}
      {settings.data ? <p data-testid="turn-saved-plan">{settings.data.days ? "Saved durations loaded for this property." : settings.data.hasRules ? "Legacy plan: original durations were not recorded. These proposed one-day stages will not replace existing rules until you preview and apply them." : "No saved guided plan. Review the proposed one-day stages before applying."} {settings.data.configured} guided rules enabled. Previously recorded dates stay unchanged.</p> : null}
      {dirty ? <p>Unsaved scheduling durations. Preview and apply to save this plan.</p> : null}
      <p>The first workday is after the recorded <strong>Vacated</strong> date. Weekends are excluded; existing Monday/Friday restrictions are respected.</p>
      <p>Preview before applying. Durations describe the saved guided plan, not manually edited rules or completed work. Paused rules stay paused until you explicitly apply or resume the plan.</p>
      {propertyId && loadedProperty === propertyId ? <div className="turn-setup-stages">{stages.map((stage, index) => {
        const firstDay = cumulative + 1;
        cumulative += Number(days[index]) || 0;
        return <label key={stage}><strong>{stage}</strong><span>{!validDays ? "Enter valid durations" : index === 0 ? "Start: working day 1" : `Finish target: working day ${cumulative}`}</span>{validDays ? <span>Planned work: {firstDay === cumulative ? `day ${firstDay}` : `days ${firstDay}-${cumulative}`}</span> : null}<span className="turn-setup-duration"><input aria-label={`${stage} days`} type="number" min="1" max="10" disabled={!propertyId || loadedProperty !== propertyId} value={Number.isNaN(days[index]) ? "" : days[index]} onChange={(event) => { setDays(days.map((day, i) => i === index ? event.target.valueAsNumber : day)); resetReview(); }} /> day(s)</span></label>;
      })}</div> : null}
      <p><strong>{!propertyId || loadedProperty !== propertyId ? "Choose a property and load its plan first." : validDays ? `${days.reduce((sum, day) => sum + day, 0)} working days total.` : "Enter 1-10 whole working days for each stage."}</strong> Weekends and excluded weekdays extend the calendar span; a longer plan is not a seven-day turn.</p>
      <p>Only Make Ready (Start) is a start-date calendar. Painting, cleaning and flooring use end-of-stage targets; Expected Finish is the whole-unit ready target. These dates do not book vendors or prove work is complete.</p>
      <button className="button button-secondary" disabled={!valid || busy} onClick={() => void review()} data-testid="turn-setup-preview">{busy ? "Working..." : "2. Preview my calendar dates"}</button>
    </fieldset>
    {error ? <p role="alert" className="error-text">{error}</p> : null}
    {preview ? <section aria-label="Scheduling preview">
      <h3>3. Review plan for {preview.property.code} / {preview.property.name}</h3>
      <p>{preview.changes} missing dates across {preview.total} vacant, not-ready turns with a vacate date. {preview.missingVacateDate} turn(s) need a Vacated date first. Ready, occupied, notice-to-vacate and unknown-status units are skipped.</p>
      {preview.configured ? <p>{preview.configured} guided rules are already on. Applying this plan updates their offsets for missing dates only.</p> : null}
      {(preview.calendar.avoidMondayScheduling || preview.calendar.avoidFridayScheduling) ? <p>This property also excludes {preview.calendar.avoidMondayScheduling ? "Mondays " : ""}{preview.calendar.avoidFridayScheduling ? "Fridays" : ""}.</p> : null}
      <p><strong>Included and enabled:</strong> all five scheduling rules and their calendar tracks. Make Ready (Start) schedules the first repair day; Expected Finish is the separate whole-unit ready target. Painting and cleaning fields are created automatically. Existing finish dates are not copied into start dates. Tracks are shared across properties; dates stay property-scoped.</p>
      <p>Existing dates stay unchanged, even if they conflict with this sequence. Past vacate dates can produce overdue targets. This is a date plan, not a completed-work status, staff/vendor booking, or capacity-checked Planning work block.</p>
      <details><summary>Review proposed dates ({Math.min(preview.total, 25)} of {preview.total} units)</summary><div className="turn-setup-preview-list">{preview.rows.map((row) => <article key={row.unitNumber}><strong>Unit {row.unitNumber}</strong>{row.dates.map((date) => <p key={date.label}>{date.label}: <strong>{date.date}</strong>{date.preserved ? " (keep existing)" : " (new)"}</p>)}</article>)}</div></details>
      <button className="button button-primary" disabled={busy || !valid} onClick={() => void enable()} data-testid="turn-setup-enable">{busy ? "Applying plan..." : enabledRules ? "Retry / fill remaining dates" : preview.configured ? "Apply plan and fill calendar" : "Resume scheduling and fill calendar"}</button>
      {preview.configured || enabledRules ? <button className="button button-secondary" disabled={busy} onClick={() => void pause()}>Pause automatic scheduling</button> : null}
    </section> : null}
    {result ? <div role="status"><p>{result}</p><button className="button button-primary" onClick={() => onOpenSchedule(propertyId)}>Open Schedule calendar</button><p className="muted">Opens this property's five tracks and clears other board filters.</p></div> : null}
  </section>;
}
