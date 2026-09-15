import { useEffect, useRef, useState } from "react";
import { getOnCall, saveOnCall, uploadOnCallMap } from "../lib/api";
import { onCallMapUrl, sharedOnCall, saveSharedOnCall, uploadSharedOnCallMap, type OnCallData, type OnCallState, type OnCallShift } from "../lib/onCall";
import { createMaterialId } from "../lib/materialDraft";
import "./onCall.css";
import { OnCallMap } from "./OnCallMap";
import { OnCallRotationEditor } from "./OnCallRotationEditor";
import { OnCallCalendar } from "./OnCallCalendar";
import { OnCallDateTimeInput } from "./OnCallTimeInput";

const newId = () => String(createMaterialId());
const localInput = (iso: string) => {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const overlap = (shift: OnCallShift, others: OnCallShift[]) => others.some(other => other.id !== shift.id && Date.parse(other.start) < Date.parse(shift.end) && Date.parse(other.end) > Date.parse(shift.start) && other.propertyIds.some(id => shift.propertyIds.includes(id)));

export function OnCallPanel({ external = false, userId = "" }: { external?: boolean; userId?: string }) {
  const [saved, setSaved] = useState<OnCallState | null>(null);
  const [draft, setDraft] = useState<OnCallState | null>(null);
  const [editing, setEditing] = useState(false);
  const [mapsOpen, setMapsOpen] = useState(false);
  const mapsRef = useRef<HTMLDetailsElement>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [newCode, setNewCode] = useState("");
  const [editCode, setEditCode] = useState("");
  const [newEditCode, setNewEditCode] = useState("");
  const [disableEditing, setDisableEditing] = useState(false);
  const [revoke, setRevoke] = useState(false);
  const [filter, setFilter] = useState("");
  const [history, setHistory] = useState(false);
  const [locallyLocked, setLocallyLocked] = useState(false);
  const [now, setNow] = useState(Date.now());
  const generation = useRef(0);
  const current = draft ?? saved;
  const data = current?.data;
  const unlocked = !external || !locallyLocked && Boolean(saved?.unlocked && (saved.expiresAt ?? 0) > now);
  const canEdit = Boolean(saved?.canEdit && (!external || !locallyLocked && (saved.editExpiresAt ?? 0) > now));
  const dirty = Boolean(draft || newCode || revoke || newEditCode || disableEditing);
  const resetCodes = () => { setNewCode(""); setRevoke(false); setNewEditCode(""); setDisableEditing(false); };
  const persist = (version: number) => {
    if (!current) throw new Error("Reload on-call before saving");
    return external ? saveSharedOnCall(version, current.data) : saveOnCall(userId, { version, data: current.data, externalEnabled: current.externalEnabled, ...(newCode ? { accessCode: newCode } : {}), revokeAccess: revoke, ...(newEditCode ? { editCode: newEditCode } : {}), disableEditing });
  };
  const effectiveShifts = saved?.schedule?.shifts ?? data?.shifts ?? [];
  useEffect(() => {
    if (editing && mapsOpen) mapsRef.current?.scrollIntoView({ block: "start" });
  }, [editing, mapsOpen]);
  useEffect(() => {
    const next = effectiveShifts.flatMap(shift => [Date.parse(shift.start), Date.parse(shift.end)]).filter(time => time > now).sort((a, b) => a - b)[0];
    if (!next) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(next - now + 20, 2147483647));
    return () => clearTimeout(timer);
  }, [effectiveShifts, now]);
  async function reload() {
    const request = ++generation.current;
    try {
      const next = await (external ? sharedOnCall("share") : getOnCall(userId));
      if (request !== generation.current) return;
      setSaved(next); setError("");
      if (!next.canEdit) { setDraft(null); setEditing(false); resetCodes(); }
    } catch (cause) {
      if (request !== generation.current) return;
      setError(cause instanceof Error ? cause.message : "Could not refresh on-call");
      setSaved(null);
      if (external) { setDraft(null); setEditing(false); setEditCode(""); }
      if ((cause as { status?: number }).status && [401, 403, 404].includes((cause as { status: number }).status)) { setDraft(null); setEditing(false); setNewCode(""); }
    }
  }
  useEffect(() => {
    void reload();
    const poll = setInterval(() => { setNow(Date.now()); void reload(); }, 60000);
    const focus = () => { setNow(Date.now()); void reload(); };
    window.addEventListener("focus", focus);
    return () => { generation.current++; clearInterval(poll); window.removeEventListener("focus", focus); };
    // The component is remounted on account changes by the app shell.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [external, userId]);
  useEffect(() => {
    if (!external || !saved?.expiresAt) return;
    const timer = setTimeout(() => {
      setNow(Date.now());
      setSaved(null); setDraft(null); setEditing(false); setEditCode("");
      void reload();
    }, Math.max(0, saved.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [external, saved?.expiresAt]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function change(patch: Partial<OnCallData>) {
    if (current) setDraft({ ...current, data: { ...current.data, ...patch } });
    setMessage("");
  }
  const person = (id: string) => data?.people.find(value => value.id === id);
  const date = (value: string) => {
    try { return new Intl.DateTimeFormat("en-US", { timeZone: data?.timeZone, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" }).format(new Date(value)); }
    catch { return new Date(value).toISOString(); }
  };
  const shifts = effectiveShifts.filter(shift => (!filter || shift.propertyIds.includes(filter)) && (history ? Date.parse(shift.end) <= now : Date.parse(shift.end) > now)).sort((a, b) => a.start.localeCompare(b.start));
  const active = effectiveShifts.filter(shift => Date.parse(shift.start) <= now && Date.parse(shift.end) > now && (!filter || shift.propertyIds.includes(filter)));
  const contact = (id: string) => { const member = person(id); return <>{member?.name ?? "Unassigned"}{member?.publicPhone ? <> · <a href={`tel:${member.publicPhone.replace(/[^+\d]/g, "")}`}>{member.publicPhone}</a></> : null}</>; };
  return <section className={`on-call ${external ? "on-call-external" : ""}`} data-testid="on-call-panel">
    <header className="on-call-header"><div><span className="eyebrow">MakeReadyOS / On-call</span><h1>{data?.title ?? "On-call"}</h1><p>{external ? "Shared schedule. Property access instructions require the access code." : "Shared coverage directory, independent of property filters and regular user accounts."}</p></div>
      <div className="on-call-actions">
        {!external && saved?.externalEnabled ? <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(`${location.origin}/on-call/`); setMessage("Share link copied. Send the access code separately."); } catch { setMessage(`Share this link: ${location.origin}/on-call/`); } }}>Copy share link</button> : null}
        {canEdit ? <button type="button" disabled={busy} onClick={() => { if (editing && dirty && !window.confirm("Discard unsaved on-call changes?")) return; setDraft(null); resetCodes(); setEditing(!editing); }}> {editing ? "Close editor" : "Manage on-call"}</button> : null}
        {canEdit ? <button type="button" disabled={busy} onClick={() => { setEditing(true); setMapsOpen(true); mapsRef.current?.scrollIntoView({ block: "start" }); }}>Edit property maps</button> : null}
        {external && canEdit ? <button type="button" disabled={busy} onClick={async () => { if (dirty && !window.confirm("Discard unsaved changes and lock editing?")) return; setLocallyLocked(true); setDraft(null); setSaved(null); setEditing(false); setBusy(true); try { await sharedOnCall("lock"); await reload(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not lock. Close this browser on shared devices."); } finally { setBusy(false); } }}>Lock editing &amp; guides</button> : null}
        <button type="button" disabled={busy} onClick={() => void reload()}>Refresh</button>
      </div>
    </header>
    {error ? <p role="alert">{error}</p> : null}{message ? <p role="status">{message}</p> : null}
    {!current && !error ? <p role="status">Loading on-call...</p> : null}
    {data ? <>
      {external && !canEdit ? <details><summary>Coordinator editing access</summary><form onSubmit={async event => { event.preventDefault(); if (busy) return; setBusy(true); setError(""); try { await sharedOnCall("unlock-edit", editCode); setEditCode(""); setLocallyLocked(false); await reload(); setEditing(true); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not unlock editing"); } finally { setBusy(false); } }}><p>The viewing code cannot make changes. Enter the separate editing code supplied by a manager. Editing expires after one hour and grants access only to On-call.</p><label>Editing access code<input required type="password" autoComplete="off" maxLength={100} value={editCode} onChange={event => setEditCode(event.target.value)}/></label><button type="submit" disabled={busy}>Unlock editing</button></form></details> : null}
      {external && canEdit ? <p>Shared-code editor: changes affect the whole on-call group and are recorded as shared-code edits. Sharing settings and access-code changes require a signed-in manager or admin.</p> : null}
      {editing && canEdit ? <form className="on-call-editor" onSubmit={async event => {
        event.preventDefault(); if (busy || !current) return;
        setBusy(true); setError(""); setMessage(""); generation.current++;
        try { const result = await persist(current.version); generation.current++; setSaved(result); setDraft(null); resetCodes(); setMessage("On-call saved. The viewing code remains read-only."); }
        catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save; your draft is preserved"); }
        finally { setBusy(false); }
      }}>
        <p>Changes affect the shared on-call group for all staff. This does not grant access to other MakeReadyOS modules or import private property wiki records.</p>
        <fieldset disabled={busy}>
          <div className="on-call-fields"><label>Schedule title<input required maxLength={100} value={data.title} onChange={event => change({ title: event.target.value })}/></label><label>Display time zone<input required list="on-call-zones" value={data.timeZone} onChange={event => change({ timeZone: event.target.value })}/><datalist id="on-call-zones">{["America/Chicago", "America/New_York", "America/Denver", "America/Phoenix", "America/Los_Angeles", "UTC"].map(zone => <option key={zone}>{zone}</option>)}</datalist></label></div>
          {!external ? <><label className="on-call-check"><input type="checkbox" checked={current.externalEnabled} onChange={event => setDraft({ ...current, externalEnabled: event.target.checked })}/>Enable external sharing: names, phone numbers, property names and shift notes are public</label>
          <label>{current.hasAccessCode ? "New access code (leave blank to keep current)" : "Set property-guide access code"}<input type="password" autoComplete="new-password" minLength={6} maxLength={100} value={newCode} onChange={event => setNewCode(event.target.value)}/></label>
          <p className="helper-copy">Use at least six characters, preferably a longer passphrase. Share it separately from the link. Guides unlock for eight hours; changing the code or disabling sharing revokes existing access.</p>
          <label className="on-call-check"><input type="checkbox" checked={revoke} onChange={event => setRevoke(event.target.checked)}/>Revoke all external viewing and editing sessions on save</label>
          <label>{current.hasEditCode ? "New editing code (leave blank to keep current)" : "Set separate editing code (optional)"}<input type="password" autoComplete="new-password" minLength={10} maxLength={100} disabled={disableEditing} value={newEditCode} onChange={event => setNewEditCode(event.target.value)}/></label>
          <p className="helper-copy">Use a different passphrase of at least 10 characters. This code permits changes to On-call, including schedules, contacts, guides and maps, but no other modules. Shared-code editors are not individually identified. Editing sessions last one hour. Changing this code revokes existing editors; leave it blank to keep the current setting.</p>
          <label className="on-call-check"><input type="checkbox" checked={disableEditing} onChange={event => { setDisableEditing(event.target.checked); if (event.target.checked) setNewEditCode(""); }}/>Disable external editing and revoke editing sessions on save</label></> : null}
          <details open><summary>People ({data.people.length})</summary><p>External participants do not need accounts. Names and phone numbers below are public when sharing is enabled; use approved on-call contact numbers.</p>
            {data.people.map(member => <div className="on-call-fields" key={member.id}><label>Name<input required maxLength={100} value={member.name} onChange={event => change({ people: data.people.map(row => row.id === member.id ? { ...row, name: event.target.value } : row) })}/></label><label>Public on-call phone<input type="tel" maxLength={40} value={member.publicPhone} onChange={event => change({ people: data.people.map(row => row.id === member.id ? { ...row, publicPhone: event.target.value } : row) })}/></label><button type="button" onClick={() => change({ people: data.people.filter(row => row.id !== member.id) })}>Remove {member.name || "person"}</button></div>)}
            <button type="button" onClick={() => change({ people: [...data.people, { id: newId(), name: "", publicPhone: "" }] })}>Add person</button>
          </details>
          <details><summary>Properties &amp; protected access guides ({data.properties.length})</summary><p>Add each covered property, even if it is not managed in MakeReadyOS. Only the property name is public. Do not put codes in names or public shift notes.</p>
            {data.properties.map(property => <section className="on-call-edit-property" key={property.id}><h3>{property.name || "New property"}</h3><div className="on-call-fields">{([['name','Property name (public)',100],['address','Address',500],['shopLocation','Shop location / access route',1000],['accessCodes','Shop / gate access codes',2000],['instructions','Property access guide / emergency instructions',12000],['mapUrl','Map link (HTTPS)',2000],['guideUrl','Additional guide link (HTTPS)',2000]] as const).map(([key, label, max]) => <label key={key}>{label}{["instructions", "accessCodes", "shopLocation"].includes(key) ? <textarea rows={3} maxLength={max} value={property[key]} onChange={event => change({ properties: data.properties.map(row => row.id === property.id ? { ...row, [key]: event.target.value } : row) })}/> : <input required={key === "name"} type={key.endsWith("Url") ? "url" : "text"} maxLength={max} value={property[key]} onChange={event => change({ properties: data.properties.map(row => row.id === property.id ? { ...row, [key]: event.target.value } : row) })}/>}</label>)}</div><button type="button" onClick={() => { if (window.confirm(`Remove ${property.name || "this property"} and its guide from the draft? Remove associated shifts first.`)) change({ properties: data.properties.filter(row => row.id !== property.id) }); }}>Remove property</button></section>)}
            <p className="helper-copy">Upload property maps and mark the shop and office in the Property maps section below. Map links are optional.</p>
            <button type="button" onClick={() => change({ properties: [...data.properties, { id: newId(), name: "", address: "", shopLocation: "", accessCodes: "", instructions: "", mapUrl: "", guideUrl: "" }] })}>Add on-call property</button>
          </details>
          <details ref={mapsRef} open={mapsOpen} onToggle={event => setMapsOpen(event.currentTarget.open)}><summary>Property maps / mark shop &amp; office ({data.properties.length})</summary>
            <p className="helper-copy">Upload a PDF, PNG or JPEG up to 10 MB for any existing property. Choosing a file saves pending on-call edits first, then uploads the map immediately. Open the map, select Mark shop or Mark office, and tap the location. Save the markers below. External viewers must unlock the property guides; downloaded copies cannot be revoked.</p>
            {!data.properties.length ? <p>Add an on-call property in Properties &amp; protected access guides first.</p> : null}
            {data.properties.map(property => <div className="on-call-edit-property" key={`map-${property.id}`}>
              <h3>{property.name || "New property"}</h3>
              <label>Upload map for {property.name || "new property"}<input type="file" accept="application/pdf,image/png,image/jpeg" onChange={async event => {
                const file = event.target.files?.[0]; event.target.value = "";
                if (!file || busy) return;
                if (file.size > 10 * 1024 * 1024) { setError("Choose a map no larger than 10 MB."); return; }
                setBusy(true); setError(""); setMessage(""); generation.current++;
                let editsSaved = false;
                try {
                  let version = current.version;
                  if (dirty) {
                    const result = await persist(version);
                    version = result.version; editsSaved = true;
                    generation.current++; setSaved(result); setDraft(null); resetCodes();
                  }
                  if (external) await uploadSharedOnCallMap(property.id, version, file); else await uploadOnCallMap(userId, property.id, version, file); generation.current++; await reload(); setMessage("Property map uploaded and saved. Open the map below to mark the shop and office.");
                }
                catch (cause) { setError(`${editsSaved ? "On-call edits were saved, but the map upload failed. " : ""}${cause instanceof Error ? cause.message : "Could not upload map. Your existing map is unchanged."}`); }
                finally { setBusy(false); }
              }}/></label>
              {property.mapFile ? <><div className="on-call-actions"><a href={onCallMapUrl(property.id, external)} target="_blank" rel="noopener noreferrer">Download map: {property.mapFile.name}</a><button type="button" onClick={() => change({ properties: data.properties.map(row => row.id === property.id ? { ...row, mapFile: null, markers: [] } : row) })}>Remove uploaded map for {property.name}</button></div><OnCallMap property={property} external={external} onChange={markers => change({ properties: data.properties.map(row => row.id === property.id ? { ...row, markers } : row) })}/></> : <p>No map uploaded.</p>}
              {property.mapFile && draft ? <button type="submit">Save map markers and pending edits</button> : null}
            </div>)}
            {dirty ? <p>Unsaved edits will be saved before upload. Use Save on-call to apply a map removal without uploading a replacement.</p> : null}
            <p className="helper-copy">Optional linked maps/documents must have their own access controls. Uploaded maps are protected by this module; external links protect only the link, not the destination.</p>
          </details>
          <OnCallRotationEditor data={data} schedule={saved?.schedule} change={change}/>
          <details><summary>Manual shifts ({data.shifts.length})</summary><p>Use these for additional coverage or to override rotation coverage for specific properties. Enter times in your device time zone ({Intl.DateTimeFormat().resolvedOptions().timeZone}). Coverage below is displayed in {data.timeZone}. End time is the handoff to the next shift.</p>
            {data.shifts.map(shift => { const update = (patch: Partial<OnCallShift>) => change({ shifts: data.shifts.map(row => row.id === shift.id ? { ...row, ...patch } : row) }); return <section className="on-call-edit-shift" key={shift.id}>
              <div className="on-call-fields"><label>Primary<select required value={shift.personId} onChange={event => update({ personId: event.target.value })}><option value="">Choose person</option>{data.people.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label><label>Backup<select value={shift.backupId} onChange={event => update({ backupId: event.target.value })}><option value="">No backup</option>{data.people.filter(member => member.id !== shift.personId).map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
                <OnCallDateTimeInput label="Starts" value={localInput(shift.start)} onChange={value => update({ start: new Date(value).toISOString() })}/><OnCallDateTimeInput label="Ends" value={localInput(shift.end)} onChange={value => update({ end: new Date(value).toISOString() })}/></div>
              <fieldset><legend>Covered properties</legend>{data.properties.map(property => <label className="on-call-check" key={property.id}><input type="checkbox" checked={shift.propertyIds.includes(property.id)} onChange={event => update({ propertyIds: event.target.checked ? [...shift.propertyIds, property.id] : shift.propertyIds.filter(id => id !== property.id) })}/>{property.name}</label>)}</fieldset>
              <label>Shift note (public; no codes)<input maxLength={1000} value={shift.notes} onChange={event => update({ notes: event.target.value })}/></label>
              {overlap(shift, data.shifts) ? <p role="status">Overlapping coverage for at least one property. Confirm this is intentional.</p> : null}
              <div className="on-call-actions"><button type="button" onClick={() => { const next = (iso: string) => { const date = new Date(iso); date.setDate(date.getDate() + 7); return date.toISOString(); }; change({ shifts: [...data.shifts, { ...shift, id: newId(), start: next(shift.start), end: next(shift.end) }] }); }}>Copy to next week</button><button type="button" onClick={() => change({ shifts: data.shifts.filter(row => row.id !== shift.id) })}>Remove shift</button></div>
            </section>; })}
            <button type="button" disabled={!data.people.length || !data.properties.length} onClick={() => { const start = new Date(); start.setSeconds(0, 0); const end = new Date(start); end.setDate(end.getDate() + 7); change({ shifts: [...data.shifts, { id: newId(), personId: data.people[0].id, backupId: "", propertyIds: data.properties.map(property => property.id), start: start.toISOString(), end: end.toISOString(), notes: "" }] }); }}>Add shift</button>
          </details>
          <div className="on-call-actions"><button className="button button-primary" type="submit" disabled={!dirty}>{busy ? "Saving..." : "Save on-call"}</button><button type="button" onClick={async () => { if (dirty && !window.confirm("Discard unsaved changes and reload the saved workspace?")) return; setDraft(null); resetCodes(); await reload(); }}>Reload saved workspace</button>{dirty ? <span role="status">Unsaved changes</span> : null}</div>
        </fieldset>
      </form> : <>
        <label className="on-call-filter">Coverage for<select value={filter} onChange={event => setFilter(event.target.value)}><option value="">All on-call properties</option>{data.properties.map(property => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
        <OnCallCalendar data={data} schedule={saved?.schedule} filter={filter}/>
        <section className="on-call-now"><h2>On call now</h2>{active.length ? active.map(shift => <article key={shift.id}><h3>{contact(shift.personId)}</h3><p>{shift.propertyIds.map(id => data.properties.find(property => property.id === id)?.name).join(" · ")}</p><p>Until {date(shift.end)}{shift.backupId ? <> · Backup: {contact(shift.backupId)}</> : null}</p>{active.length > 1 && overlap(shift, active) ? <p>Overlapping coverage. Contact the coordinator if responsibility is unclear.</p> : null}</article>) : <p>No coverage recorded for this time. Contact your on-call coordinator; this is not confirmation that no one is on duty.</p>}</section>
        <details><summary>Coverage list / history ({shifts.length} shifts)</summary>
        <section><div className="on-call-actions"><h2>{history ? "Past coverage" : "Current & upcoming coverage"}</h2><button type="button" onClick={() => setHistory(!history)}>{history ? "Show upcoming" : "Show history"}</button></div><p className="helper-copy">Times shown in {data.timeZone}.</p>{!shifts.length ? <p>No shifts recorded in this view.</p> : <div className="on-call-schedule">{shifts.map(shift => <article key={shift.id}><div><strong>{contact(shift.personId)}</strong><p>{date(shift.start)} → {date(shift.end)}</p></div><div><p>{shift.propertyIds.map(id => data.properties.find(property => property.id === id)?.name).join(" · ")}</p>{shift.backupId ? <p>Backup: {contact(shift.backupId)}</p> : null}{shift.notes ? <p>{shift.notes}</p> : null}</div></article>)}</div>}</section>
        </details>
        <section className="on-call-guides"><h2>Property access guides</h2>{external && !unlocked ? <form onSubmit={async event => { event.preventDefault(); if (busy) return; setBusy(true); setError(""); try { await sharedOnCall("unlock", code); setCode(""); setLocallyLocked(false); await reload(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not unlock guides"); } finally { setBusy(false); } }}><p>Enter the shared access code from your coordinator. This unlocks only the on-call property guides, not the rest of MakeReadyOS.</p><label>Access code<input type="password" autoComplete="off" required maxLength={100} value={code} onChange={event => setCode(event.target.value)}/></label><button className="button button-primary" disabled={busy} type="submit">Unlock property guides</button></form> : <>
          {data.properties.filter(property => (!filter || property.id === filter) && property.mapFile).map(property => <p key={`download-${property.id}`}><a href={onCallMapUrl(property.id, external)} target="_blank" rel="noopener noreferrer">Download {property.name} map: {property.mapFile!.name}</a></p>)}
          {data.properties.filter(property => (!filter || property.id === filter) && property.mapFile).map(property => <OnCallMap key={`${property.id}-${property.mapFile!.id}`} property={property} external={external}/>)}
          {external ? <button disabled={busy} type="button" onClick={async () => { generation.current++; setLocallyLocked(true); setSaved(null); setBusy(true); try { await sharedOnCall("lock"); await reload(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not lock this session. Close this browser on shared devices."); } finally { setBusy(false); } }}>Lock property guides</button> : null}
          {!data.properties.length ? <p>No properties added yet.</p> : data.properties.filter(property => !filter || property.id === filter).map(property => <details key={property.id}><summary>{property.name}</summary><dl><dt>Address</dt><dd>{property.address || "Not provided"}</dd><dt>Shop location / access route</dt><dd>{property.shopLocation || "Not provided"}</dd><dt>Shop / gate access codes</dt><dd>{property.accessCodes || "Not provided"}</dd><dt>Access guide / emergency instructions</dt><dd>{property.instructions || "Not provided"}</dd></dl><div className="on-call-actions">{property.mapUrl ? <a href={property.mapUrl} target="_blank" rel="noopener noreferrer">Open property map</a> : null}{property.guideUrl ? <a href={property.guideUrl} target="_blank" rel="noopener noreferrer">Open additional guide</a> : null}</div></details>)}
        </>}</section>
      </>}
      <footer className="helper-copy">{saved?.updatedAt ? `Last saved ${date(saved.updatedAt)}. ` : "Not configured yet. "} {external ? canEdit ? "Editing access is limited to On-call. Lock editing when finished." : "Viewing is read-only. Changes require the separate coordinator editing code." : "Managers, admins and authorized shared-code coordinators can edit On-call. Property access instructions are shared with all signed-in staff."}</footer>
    </> : null}
  </section>;
}
