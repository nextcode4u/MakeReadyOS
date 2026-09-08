import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createManagementCompany, getManagementCompanies, getPropertyBranding, savePropertyBranding, updateManagementCompany, type ManagementCompany, type PropertyBranding } from "../lib/api";
import { FinalWalkReportEditor } from "./FinalWalkReportEditor";

async function readLogo(file: File) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error("Choose a PNG, JPEG or WebP image under 5 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 384 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare the logo.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL("image/png");
    if (result.length > 200000) throw new Error("This image is too complex for a logo. Try a smaller or simpler image.");
    return result;
  } finally { bitmap.close(); }
}

export function PropertyBrandingPanel({ propertyId, isAdmin }: { propertyId: string; isAdmin: boolean }) {
  const branding = useQuery({ queryKey: ["property-branding", propertyId], queryFn: () => getPropertyBranding(propertyId) });
  const companies = useQuery({ queryKey: ["management-companies"], queryFn: getManagementCompanies });
  if (branding.isPending || companies.isPending) return <p>Loading property branding...</p>;
  if (branding.isError || companies.isError) return <div role="alert">Could not load branding. <button type="button" className="button" onClick={() => { void branding.refetch(); void companies.refetch(); }}>Retry</button></div>;
  return <BrandingEditor key={propertyId} propertyId={propertyId} propertyName={branding.data.property.name} initial={branding.data.property.branding} companies={companies.data.companies} isAdmin={isAdmin} />;
}

function BrandingEditor({ propertyId, propertyName, initial, companies, isAdmin }: { propertyId: string; propertyName: string; initial: PropertyBranding | null; companies: ManagementCompany[]; isAdmin: boolean }) {
  const client = useQueryClient();
  const [companyId, setCompanyId] = useState(initial?.managementCompanyId ?? "");
  const [logo, setLogo] = useState(initial?.logo ?? null);
  const [companyName, setCompanyName] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const company = companies.find(entry => entry.id === companyId);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(""); setMessage("");
    try { await action(); }
    catch (error) { setError(error instanceof Error ? error.message : "Branding could not be saved"); }
    finally { setBusy(false); }
  };
  return <section className="property-branding" data-testid="property-branding">
    <h4>Branding / {propertyName}</h4>
    <p className="helper-copy">Each property selects its own company. Logos are optional. Company branding is shared by every property that selects it.</p>
    <div className="property-branding-preview">
      <div>{logo ? <img src={logo} alt={`${propertyName} logo`} /> : <span>No property logo</span>}<strong>{propertyName}</strong></div>
      <div>{company?.logo ? <img src={company.logo} alt={`${company.name} logo`} /> : null}<span>Managed by</span><strong>{company?.name ?? "No company selected"}</strong></div>
    </div>
    {error ? <p role="alert">{error}</p> : null}
    {message ? <p role="status">{message}</p> : null}
    {isAdmin ? <div className="branding-report-entry"><button type="button" className="button" data-testid="open-final-report-editor" disabled={busy} onClick={() => setReportOpen(true)}>Edit / Preview Final-Walk Report</button><p className="helper-copy">Uses saved property and company logos. Save branding changes before opening.</p></div> : null}
    {reportOpen ? <FinalWalkReportEditor propertyId={propertyId} propertyName={propertyName} onClose={() => setReportOpen(false)} /> : null}
    {!isAdmin ? <p className="helper-copy">An administrator can update company and property branding.</p> : <fieldset disabled={busy}>
      <label>Management company<select data-testid="branding-company" value={companyId} onChange={event => { setCompanyId(event.target.value); setMessage("Company selection changed. Save property branding to apply it."); }}><option value="">No company selected</option>{companies.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
      <label>Property logo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void run(async () => { setLogo(await readLogo(file)); setMessage("Logo preview updated. Save property branding to apply it."); }); }} /></label>
      {logo ? <button type="button" className="button" onClick={() => { setLogo(null); setMessage("Logo removed from preview. Save property branding to apply it."); }}>Remove property logo</button> : null}
      <button type="button" className="button button-primary" onClick={() => void run(async () => { await savePropertyBranding(propertyId, { managementCompanyId: companyId || null, logo }); await client.invalidateQueries({ queryKey: ["property-branding", propertyId] }); setMessage("Property branding saved."); })}>Save property branding</button>
      <details><summary>Add management company</summary>
        <label>Company name<input value={companyName} maxLength={120} onChange={event => setCompanyName(event.target.value)} /></label>
        <button type="button" className="button" disabled={companyName.trim().length < 2} onClick={() => void run(async () => { const result = await createManagementCompany(companyName); await client.invalidateQueries({ queryKey: ["management-companies"] }); setCompanyId(result.company.id); setCompanyName(""); setMessage("Company created. Save property branding to assign it to this property."); })}>Add company</button>
      </details>
      {company ? <details><summary>Edit shared company branding</summary>
        <p>Changes here affect every property using {company.name}, not just this property.</p>
        <form key={`${company.id}:${company.updatedAt}`} onSubmit={event => { event.preventDefault(); const name = String(new FormData(event.currentTarget).get("name") ?? "").trim(); void run(async () => { await updateManagementCompany(company.id, { name }); await client.invalidateQueries({ queryKey: ["management-companies"] }); setMessage("Shared company name saved."); }); }}>
          <label>Company name<input name="name" defaultValue={company.name} maxLength={120} minLength={2} required /></label>
          <button className="button" type="submit">Save company name</button>
        </form>
        <label>Company logo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void run(async () => { await updateManagementCompany(company.id, { logo: await readLogo(file) }); await client.invalidateQueries({ queryKey: ["management-companies"] }); setMessage("Shared company logo saved."); }); }} /></label>
        {company.logo ? <button type="button" className="button" onClick={() => void run(async () => { await updateManagementCompany(company.id, { logo: null }); await client.invalidateQueries({ queryKey: ["management-companies"] }); setMessage("Shared company logo removed."); })}>Remove company logo</button> : null}
      </details> : null}
    </fieldset>}
  </section>;
}
