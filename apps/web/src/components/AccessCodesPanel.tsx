import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { accessCodeRequest, canViewKeycodes, type UserRole } from "../lib/api";
import "./accessCodes.css";
import { UnitMailboxEditor } from "./UnitMailboxEditor";

type Values = { doorCode: string; accessCode: string; keyCode: string };
type Codes = { version: number; value: Values };
type Directory = { property: { code: string; name: string }; canManage: boolean; units: { id: string; number: string; mailboxNumber: string | null; accessCodes: { updatedAt: string } | null }[] };
type Plan = { token: string; units: string[]; errors: string[]; applied: boolean };

export function AccessCodesPanel({ properties, selectedPropertyId, role, keycodeAccess = false, initialUnit = "" }: { properties: { id: string; code: string; name: string }[]; selectedPropertyId: string; role: UserRole; keycodeAccess?: boolean; initialUnit?: string }) {
  const [chosen, setChosen] = useState(selectedPropertyId);
  const propertyId = properties.some(property => property.id === chosen) ? chosen : "";
  if (!canViewKeycodes({ role, keycodeAccess })) return null;
  return <section className="panel access-codes-panel" data-testid="access-codes-panel"><h2>Keys &amp; Access</h2><p>Look up a unit's mailbox number, current door code, resident access code or key cutting reference. Not a directory for staff/master codes.</p>
    <label>Property for code lookup<select value={propertyId} onChange={event => setChosen(event.target.value)}><option value="">Choose a property</option>{properties.map(property => <option key={property.id} value={property.id}>{property.code} / {property.name}</option>)}</select></label>
    {propertyId ? <DirectoryEditor key={propertyId} propertyId={propertyId} initialUnit={initialUnit} /> : <p>Select a property to view its directory.</p>}
  </section>;
}

function DirectoryEditor({ propertyId, initialUnit }: { propertyId: string; initialUnit: string }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["access-code-directory", propertyId], queryFn: () => accessCodeRequest<Directory>(propertyId), gcTime: 0 });
  const [search, setSearch] = useState(initialUnit);
  const [selected, setSelected] = useState("");
  const [codes, setCodes] = useState<Codes | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [skipInvalid, setSkipInvalid] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  useEffect(() => {
    if (!codes) return;
    const hide = () => setCodes(null);
    const timer = window.setTimeout(hide, 120000);
    const visibility = () => { if (document.hidden) hide(); };
    document.addEventListener("visibilitychange", visibility);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [codes]);
  const run = async (action: () => Promise<void>) => { setBusy(true); setError(""); setMessage(""); try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Request failed"); } finally { setBusy(false); } };
  const refreshReports = () => { void client.invalidateQueries({ queryKey: ["resident-codes"] }); void client.invalidateQueries({ queryKey: ["final-report"] }); };
  async function importCodes(apply: boolean) {
    const result = await accessCodeRequest<Plan>(propertyId, "/import", "POST", { text, overwrite, skipInvalid, ...(apply && plan ? { token: plan.token } : {}) });
    setPlan(result);
    if (result.applied) { setCodes(null); setText(""); refreshReports(); await query.refetch(); setMessage("Access-code directory updated."); }
  }
  const units = (query.data?.units ?? []).filter(unit => unit.number.toLowerCase().includes(search.toLowerCase()));
  const selectedUnit = query.data?.units.find(unit => unit.id === selected);
  return <div className="access-code-directory">
    <h3>{query.data ? `${query.data.property.code} / ${query.data.property.name}` : "Loading directory..."}</h3>
    <p>Codes stay hidden until you select a unit and reveal them. Reveals and exports are logged without recording code values. Keep downloaded files private.</p>
    {query.isError ? <p role="alert">Could not load directory. <button onClick={() => void query.refetch()}>Retry</button></p> : null}
    <label>Search unit<input disabled={busy} value={search} onChange={event => { setSearch(event.target.value); setSelected(""); setCodes(null); }} /></label>
    <label>Unit for code lookup<select disabled={busy} value={selected} onChange={event => { setSelected(event.target.value); setCodes(null); }}><option value="">Choose a unit ({units.length})</option>{units.map(unit => <option key={unit.id} value={unit.id}>{unit.number}{unit.accessCodes ? " / codes recorded" : " / not recorded"}</option>)}</select></label>
    {selectedUnit && query.data ? <UnitMailboxEditor key={selectedUnit.id} propertyId={propertyId} propertyCode={query.data.property.code} unit={selectedUnit} canManage={query.data.canManage} /> : null}
    <button type="button" disabled={!selected || busy} onClick={() => codes ? setCodes(null) : void run(async () => setCodes(await accessCodeRequest<Codes>(propertyId, `/units/${selected}`)))}>{codes ? "Hide codes" : "Reveal unit codes"}</button>
    {codes ? <fieldset disabled={busy}><legend>Unit {query.data?.units.find(unit => unit.id === selected)?.number}</legend>
      <p>Last code update: {query.data?.units.find(unit => unit.id === selected)?.accessCodes?.updatedAt ? new Date(query.data.units.find(unit => unit.id === selected)!.accessCodes!.updatedAt).toLocaleString() : "Not recorded"}. Confirm older codes before relying on them.</p>
      {([['doorCode', 'Door code'], ['accessCode', 'Resident access code'], ['keyCode', 'Key cutting code / reference']] as const).map(([key, label]) => <label key={key}>{label}<input autoComplete="off" readOnly={!query.data?.canManage} value={codes.value[key]} maxLength={60} onChange={event => setCodes({ ...codes, value: { ...codes.value, [key]: event.target.value } })} /></label>)}
      <p>Hidden automatically after two minutes of inactivity or when leaving this browser tab. Blank means not recorded, not unrestricted access.</p>
      {query.data?.canManage ? <button type="button" onClick={() => void run(async () => { await accessCodeRequest(propertyId, `/units/${selected}`, "PUT", codes); setCodes(null); refreshReports(); await query.refetch(); setMessage("Codes saved. Current turn reports were updated too."); })}>Save unit codes</button> : null}
    </fieldset> : null}
    {query.data?.canManage ? <details><summary>Import / export unit keycodes</summary><p><strong>Target: {query.data.property.code} / {query.data.property.name}</strong></p><p>Import any subset of units. CSV/TSV columns: <code>unit,doorCode,accessCode,keyCode</code>. Blank cells keep existing codes. Numeric unit 11 matches 011 only when unique. Export uses JSON to preserve leading zeros and prevent spreadsheet formulas.</p>
      <fieldset disabled={busy}>
        <label>Code directory file<input type="file" accept=".csv,.tsv,.json,.txt" onChange={event => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 1000000) { setError("File must be under 1 MB"); return; } void run(async () => { setText(await file.text()); setPlan(null); }); }} /></label>
        <label>Paste code directory<textarea rows={4} value={text} onChange={event => { setText(event.target.value); setPlan(null); }} placeholder={'unit,doorCode,accessCode,keyCode\n011,0042#,,A12'} /></label>
        <label><input type="checkbox" checked={overwrite} onChange={event => { setOverwrite(event.target.checked); setPlan(null); }} />Replace existing nonblank codes</label>
        <button type="button" disabled={!text.trim()} onClick={() => void run(() => importCodes(false))}>Preview code import</button>
        {plan && !plan.applied ? <div><p>{plan.units.length} units to update: {plan.units.join(", ") || "None"}</p>{plan.errors.map((error, index) => <p key={index}>{error}</p>)}{plan.errors.length ? <label><input type="checkbox" checked={skipInvalid} onChange={event => setSkipInvalid(event.target.checked)} />Skip invalid rows and import valid units only</label> : null}<button type="button" disabled={!plan.units.length || Boolean(plan.errors.length && !skipInvalid)} onClick={() => void run(() => importCodes(true))}>Apply code import to {query.data.property.code}</button></div> : null}
        <button type="button" onClick={() => { if (!window.confirm(`Download sensitive codes for ${query.data?.property.code}? Store this file securely and do not share it publicly.`)) return; void run(async () => { const data = await accessCodeRequest(propertyId, "/export", "POST", {}); const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "unit-access-codes.json"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }); }}>Export keycodes (sensitive)</button>
      </fieldset>
    </details> : null}
    {message ? <p role="status">{message}</p> : null}{error ? <p role="alert">{error}</p> : null}
  </div>;
}
