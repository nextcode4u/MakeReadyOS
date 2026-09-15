import { useState } from "react";
import type { OnCallData, OnCallSchedule } from "../lib/onCall";
function dayKey(time: number, zone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(time);
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)!.value).join("-");
}
export function OnCallCalendar({ data, schedule, filter }: { data: OnCallData; schedule?: OnCallSchedule; filter: string }) {
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState("");
  const today = dayKey(Date.now(), data.timeZone);
  const month = new Date(`${today.slice(0, 7)}-01T12:00:00Z`); month.setUTCMonth(month.getUTCMonth() + offset);
  const first = new Date(month); first.setUTCDate(1 - month.getUTCDay());
  const shifts = (schedule?.shifts ?? data.shifts).filter(shift => !filter || shift.propertyIds.includes(filter)).map(shift => ({ shift, first: dayKey(Date.parse(shift.start), data.timeZone), last: dayKey(Date.parse(shift.end) - 1, data.timeZone) }));
  const dayShifts = (key: string) => shifts.filter(row => row.first <= key && row.last >= key).map(row => row.shift);
  const stamp = (value: string) => new Intl.DateTimeFormat("en-US", { timeZone: data.timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" }).format(new Date(value));
  return <section aria-label="On-call calendar"><div className="on-call-actions"><h2>Coverage calendar</h2><button type="button" disabled={offset <= -11} onClick={() => setOffset(offset - 1)}>Previous month</button><strong>{new Intl.DateTimeFormat(undefined, { timeZone: "UTC", month: "long", year: "numeric" }).format(month)}</strong><button type="button" disabled={offset >= 11} onClick={() => setOffset(offset + 1)}>Next month</button><button type="button" onClick={() => { setOffset(0); setSelected(today); }}>Today</button></div>
    <p className="helper-copy">{data.timeZone}. Select a day for handoff times. Both people appear on handoff days. The calendar projects the next 12 months automatically.</p>
    <div className="on-call-calendar-scroll"><div className="on-call-calendar-grid">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => <strong key={day}>{day}</strong>)}{Array.from({ length: 42 }, (_, index) => {
      const date = new Date(first); date.setUTCDate(first.getUTCDate() + index); const key = date.toISOString().slice(0, 10); const rows = dayShifts(key);
      return <button type="button" key={key} aria-label={`Coverage ${key}`} aria-pressed={selected === key} className={`${key === today ? "today" : ""} ${date.getUTCMonth() !== month.getUTCMonth() ? "outside" : ""}`} onClick={() => setSelected(key)}><span>{date.getUTCDate()}</span>{[...new Set(rows.map(shift => data.people.find(person => person.id === shift.personId)?.name ?? "Unassigned"))].map(name => <small key={name}>{name}</small>)}</button>;
    })}</div></div>
    {selected ? <div aria-live="polite"><h3>Coverage for {selected}</h3>{dayShifts(selected).length ? dayShifts(selected).map(shift => <p key={shift.id}><strong>{data.people.find(person => person.id === shift.personId)?.name}</strong>: {stamp(shift.start)} to {stamp(shift.end)}. {shift.propertyIds.map(id => data.properties.find(property => property.id === id)?.name).join(", ")}{shift.notes ? ` / ${shift.notes}` : ""}</p>) : <p>No coverage recorded.</p>}</div> : null}
  </section>;
}
