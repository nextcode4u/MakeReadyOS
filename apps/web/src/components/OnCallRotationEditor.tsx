import { useState } from "react";
import { createMaterialId } from "../lib/materialDraft";
import { OnCallDateTimeInput, OnCallTimeInput } from "./OnCallTimeInput";
import type { OnCallData, OnCallSchedule, OnCallRotation, OnCallCoverageChange } from "../lib/onCall";
const local = (iso: string) => { const date = new Date(iso); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
function latestFriday(zone: string) {
  try { new Intl.DateTimeFormat("en", { timeZone: zone }); } catch { return local(new Date().toISOString()).slice(0, 10); }
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const get = (type: string) => parts.find(part => part.type === type)!.value;
  const date = new Date(`${get("year")}-${get("month")}-${get("day")}T12:00:00Z`);
  let days = (date.getUTCDay() - 5 + 7) % 7;
  if (!days && Number(get("hour")) < 17) days = 7;
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function OnCallRotationEditor({ data, schedule, change }: { data: OnCallData; schedule?: OnCallSchedule; change: (patch: Partial<OnCallData>) => void }) {
  const [swapA, setSwapA] = useState(""); const [swapB, setSwapB] = useState("");
  const rotation = data.rotation;
  const changes = data.coverageChanges ?? [];
  const patch = (values: Partial<OnCallRotation>) => { if (rotation) change({ rotation: { ...rotation, ...values } }); };
  const label = (id: string) => data.people.find(person => person.id === id)?.name ?? "Removed person";
  const date = (value: string) => { try { return new Intl.DateTimeFormat("en-US", { timeZone: data.timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(value)); } catch { return value; } };
  const rotationShifts = (schedule?.shifts ?? []).filter(shift => shift.notes === "Weekly rotation");
  const upcoming = rotationShifts.filter(shift => Date.parse(shift.start) > Date.now());
  return <details open><summary>Automatic weekly rotation</summary>
    <p>Choose the handoff day/time and the people in order. Coverage and the on-call calendar roll forward automatically, without a weekly button press.</p>
    {!rotation ? <button type="button" disabled={!data.people.length || !data.properties.length} onClick={() => change({ rotation: { enabled: true, startDate: latestFriday(data.timeZone), weekday: 5, at: "17:00", personIds: data.people.map(person => person.id), propertyIds: data.properties.map(property => property.id) } })}>Set up weekly rotation</button> : <>
      <label className="on-call-check"><input type="checkbox" checked={rotation.enabled} onChange={event => patch({ enabled: event.target.checked })}/>Enable automatic rollover</label>
      <div className="on-call-fields"><label>Start on or after<input type="date" required value={rotation.startDate} onChange={event => patch({ startDate: event.target.value })}/></label><label>Handoff day<select value={rotation.weekday} onChange={event => patch({ weekday: Number(event.target.value) })}>{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label><OnCallTimeInput label={`Handoff time (${data.timeZone})`} value={rotation.at} onChange={at => patch({ at })}/></div>
      <p>The first person starts on the first selected weekday on or after that date. Each person covers one week. Times follow {data.timeZone}, including daylight-saving changes.</p>
      <ol>{rotation.personIds.map((id, index) => <li key={id}><div className="on-call-actions"><strong>{label(id)}</strong><button type="button" disabled={!index} aria-label={`Move ${label(id)} earlier`} onClick={() => { const ids = [...rotation.personIds]; [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]]; patch({ personIds: ids }); }}>Up</button><button type="button" disabled={index === rotation.personIds.length - 1} aria-label={`Move ${label(id)} later`} onClick={() => { const ids = [...rotation.personIds]; [ids[index + 1], ids[index]] = [ids[index], ids[index + 1]]; patch({ personIds: ids }); }}>Down</button><button type="button" onClick={() => patch({ personIds: rotation.personIds.filter(person => person !== id) })}>Remove from rotation</button></div></li>)}</ol>
      <label>Add person to rotation<select value="" onChange={event => { if (event.target.value) patch({ personIds: [...rotation.personIds, event.target.value] }); }}><option value="">Choose person</option>{data.people.filter(person => !rotation.personIds.includes(person.id)).map(person => <option value={person.id} key={person.id}>{person.name}</option>)}</select></label>
      <fieldset><legend>Properties covered by this rotation</legend>{data.properties.map(property => <label key={property.id} className="on-call-check"><input type="checkbox" checked={rotation.propertyIds.includes(property.id)} onChange={event => patch({ propertyIds: event.target.checked ? [...rotation.propertyIds, property.id] : rotation.propertyIds.filter(id => id !== property.id) })}/>{property.name}</label>)}</fieldset>
      <p className="helper-copy">Save on-call to update the calendar. Manual shifts below take priority for their properties. Changing the rotation recalculates its projections; use a coverage change for a one-off absence rather than rearranging the regular order.</p>
      <h3>Swaps &amp; emergency coverage</h3><p>Changes cover all rotation properties for the specified period, then the regular rotation resumes. Reasons are staff-only, not published externally.</p>
      {changes.map(entry => {
        const update = (patch: Partial<OnCallCoverageChange>) => change({ coverageChanges: changes.map(row => row.id === entry.id ? { ...row, ...patch } : row) });
        return <div className="on-call-edit-shift" key={entry.id}><div className="on-call-fields"><label>Covering person<select required value={entry.personId} onChange={event => update({ personId: event.target.value })}>{data.people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><OnCallDateTimeInput label="Coverage begins (device time)" value={local(entry.start)} onChange={value => update({ start: new Date(value).toISOString() })}/><OnCallDateTimeInput label="Coverage ends (device time)" value={local(entry.end)} onChange={value => update({ end: new Date(value).toISOString() })}/><label>Private coordination note<input maxLength={500} value={entry.reason} onChange={event => update({ reason: event.target.value })}/></label></div><button type="button" onClick={() => change({ coverageChanges: changes.filter(row => row.id !== entry.id) })}>Cancel coverage change</button></div>;
      })}
      <p className="helper-copy">Exception inputs use your device zone: {Intl.DateTimeFormat().resolvedOptions().timeZone}. Overlapping exceptions are rejected; edit or cancel the existing change first.</p>
      <button type="button" disabled={!data.people.length || !rotation.enabled} onClick={() => { const start = new Date().toISOString(); const end = rotationShifts.find(shift => shift.start <= start && shift.end > start)?.end ?? new Date(Date.now() + 86400000).toISOString(); change({ coverageChanges: [...changes, { id: String(createMaterialId()), personId: data.people[0].id, start, end, reason: "" }] }); }}>Add coverage change / cover now</button>
      <div className="on-call-fields"><label>Swap first rotation shift<select value={swapA} onChange={event => setSwapA(event.target.value)}><option value="">Choose saved shift</option>{upcoming.map(shift => <option key={shift.id} value={shift.id}>{label(shift.personId)}: {date(shift.start)} to {date(shift.end)}</option>)}</select></label><label>With rotation shift<select value={swapB} onChange={event => setSwapB(event.target.value)}><option value="">Choose saved shift</option>{upcoming.filter(shift => shift.id !== swapA).map(shift => <option key={shift.id} value={shift.id}>{label(shift.personId)}: {date(shift.start)} to {date(shift.end)}</option>)}</select></label></div>
      <button type="button" disabled={!swapA || !swapB || swapA === swapB} onClick={() => { const a = upcoming.find(shift => shift.id === swapA); const b = upcoming.find(shift => shift.id === swapB); if (!a || !b) return; change({ coverageChanges: [...changes, { id: String(createMaterialId()), start: a.start, end: a.end, personId: b.personId, reason: "Shift swap" }, { id: String(createMaterialId()), start: b.start, end: b.end, personId: a.personId, reason: "Shift swap" }] }); setSwapA(""); setSwapB(""); }}>Prepare swap (save to apply)</button>
    </>}
  </details>;
}
