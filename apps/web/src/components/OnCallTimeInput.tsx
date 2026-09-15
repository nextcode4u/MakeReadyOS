export function OnCallTimeInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [hour, minute] = value.split(":").map(Number);
  const update = (h: number, m: number, pm: boolean) => onChange(`${String(h % 12 + (pm ? 12 : 0)).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  return <fieldset className="on-call-time"><legend>{label}</legend><div className="on-call-time-fields">
    <label>Hour<select aria-label={`${label} hour`} value={hour % 12 || 12} onChange={event => update(Number(event.target.value), minute, hour >= 12)}>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></label>
    <label>Minute<select aria-label={`${label} minute`} value={minute} onChange={event => update(hour, Number(event.target.value), hour >= 12)}>{Array.from({ length: 60 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, "0")}</option>)}</select></label>
    <label>AM / PM<select aria-label={`${label} AM or PM`} value={hour >= 12 ? "PM" : "AM"} onChange={event => update(hour, minute, event.target.value === "PM")}><option>AM</option><option>PM</option></select></label>
  </div></fieldset>;
}

export function OnCallDateTimeInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <div><label>{label}<input type="date" required value={value.slice(0, 10)} onChange={event => { if (event.target.value) onChange(`${event.target.value}T${value.slice(11, 16)}`); }}/></label><OnCallTimeInput label={`${label} time`} value={value.slice(11, 16)} onChange={time => onChange(`${value.slice(0, 10)}T${time}`)}/></div>;
}
