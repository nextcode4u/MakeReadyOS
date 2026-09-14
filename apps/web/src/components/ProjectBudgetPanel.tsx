import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createVendor, getProjectBudget, getVendors, isApiError, projectAttachmentDownloadUrl, projectDocumentsZipUrl, saveProjectCost, saveProjectQuote, uploadProjectAttachment, type ProjectCostLine, type ProjectQuote, type ProjectRecord } from "../lib/api";
import { getVerifiedSession, isCurrentSession } from "../lib/verifiedSession";
import { createMaterialId as createEntryId } from "../lib/materialDraft";

const money = (cents: number | null) => cents === null ? "Not priced" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
function cents(value: string): number | null {
  if (!value.trim()) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) throw Error("Enter a positive dollar amount with no more than two decimal places.");
  const result = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(result) || result > 1000000000) throw Error("Amount must not exceed $10,000,000.");
  return result;
}
const blankQuote = () => ({ id: String(createEntryId()), expectedVersion: 0, scope: "", companyName: "", reference: "", amount: "", status: "Received" as ProjectQuote["status"], dueDate: "", notes: "" });
const blankCost = () => ({ id: String(createEntryId()), expectedVersion: 0, description: "", category: "Materials" as ProjectCostLine["category"], quantity: "1", rate: "", actual: "", isArchived: false });
type ActiveSession = NonNullable<ReturnType<typeof getVerifiedSession>> & { userId: string };

export function ProjectBudgetPanel({ record, canEdit, canManageVendors }: { record: ProjectRecord; canEdit: boolean; canManageVendors: boolean }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["projects", "budget", record.id], queryFn: () => getProjectBudget(record.id) });
  const vendors = useQuery({ queryKey: ["vendors", "project-budget", record.propertyId], queryFn: () => getVendors({ propertyId: record.propertyId }), enabled: canEdit });
  const [quote, setQuote] = useState(blankQuote);
  const [cost, setCost] = useState(blankCost);
  const [files, setFiles] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [trade, setTrade] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [outcomes, setOutcomes] = useState<Array<{ name: string; message: string }>>([]);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const writable = canEdit && !record.isArchived;
  const denied = isApiError(query.error) && [401, 403, 404].includes(query.error.status);
  const matchingVendor = vendors.data?.vendors.find(vendor => vendor.name.trim().toLowerCase() === quote.companyName.trim().toLowerCase());
  async function run(action: (session: ActiveSession) => Promise<void>) {
    if (busyRef.current) return;
    const session = getVerifiedSession();
    if (!session?.userId) { setError("Sign in again before saving."); return; }
    busyRef.current = true; setBusy(true); setError(""); setMessage("");
    try { await action(session as ActiveSession); }
    catch (err) { if (isCurrentSession(session)) setError(err instanceof Error ? err.message : "Could not save. Your draft is retained."); }
    finally { busyRef.current = false; if (isCurrentSession(session)) setBusy(false); }
  }
  async function refresh() {
    const results = await Promise.allSettled([client.invalidateQueries({ queryKey: ["projects"] }, { throwOnError: true }), client.invalidateQueries({ queryKey: ["vendors"] }, { throwOnError: true })]);
    if (results.some(result => result.status === "rejected")) setError("Saved, but the screen could not refresh. Retry loading rather than adding the entry again.");
  }
  async function upload(quoteId: string, selected: File[], session: ActiveSession) {
    const results: typeof outcomes = [];
    for (const file of selected) {
      if (!isCurrentSession(session)) break;
      try {
        await uploadProjectAttachment(record.id, file, "BID", undefined, { expectedUserId: session.userId }, quoteId);
        results.push({ name: file.name, message: "Uploaded" });
      } catch (err) {
        const rejected = isApiError(err) && err.status >= 400 && err.status < 500;
        results.push({ name: file.name, message: rejected ? err.message : "Upload unconfirmed. Check the documents before retrying; the server may already have saved it." });
        if (isApiError(err) && [401, 403, 404].includes(err.status)) {
          results.push(...selected.slice(results.length).map(pending => ({ name: pending.name, message: "Not attempted: access is unavailable." })));
          if (isCurrentSession(session)) setOutcomes([...results]);
          break;
        }
      }
      if (isCurrentSession(session)) setOutcomes([...results]);
    }
  }
  if (denied) return <section role="alert">Project budget access is unavailable. <button type="button" onClick={() => void query.refetch()}>Retry budget</button></section>;
  const summary = query.data?.summary;
  return <section className="projects-detail-card project-budget" data-testid="project-budget">
    <div className="drawer-section-title"><h4>Quotes &amp; project costs</h4><a href={projectDocumentsZipUrl(record.id)}>Download all project files (ZIP)</a></div>
    <p>Keep competing bids separate. Mark a quote <strong>Included</strong> only when it belongs in your plan. Separate scopes, phases, or vendors can all be included. This records your plan, not a purchase authorization.</p>
    {query.isPending ? <p role="status">Loading quotes and costs...</p> : null}
    {query.isError ? <p role="alert">Could not refresh costs. Previously loaded figures may be stale. <button type="button" onClick={() => void query.refetch()}>Retry budget</button></p> : null}
    {error ? <p role="alert">{error}</p> : null}{message ? <p role="status">{message}</p> : null}
    {summary ? <div className="pool-reading-grid">
      <div><dt>Included vendor quotes</dt><dd>{money(summary.vendorEstimateCents)}</dd></div>
      <div><dt>In-house estimate</dt><dd>{money(summary.inHouseEstimateCents)}</dd></div>
      <div><dt>Combined plan subtotal</dt><dd>{money(summary.plannedCents)}</dd></div>
      <div><dt>Recorded in-house actuals</dt><dd>{money(summary.recordedInHouseActualCents)}</dd></div>
    </div> : null}
    {summary?.unknownIncludedQuotes ? <p role="status">{summary.unknownIncludedQuotes} included quote(s) are not priced. The subtotal is incomplete.</p> : null}
    {summary?.unrecordedActualLines ? <p>{summary.unrecordedActualLines} cost line(s) have no recorded actual cost yet.</p> : null}
    <p className="muted">The original project estimate/actual fields remain separate and are not added again. Quote amounts should include applicable taxes, fees and delivery; excluded work belongs in its own quote.</p>
    <div className="project-budget-list">
      {query.data?.quotes.map(entry => <article className="projects-detail-card" key={entry.id} data-testid={`project-quote-${entry.id}`}>
        <strong>{entry.scope} / {entry.companyName}</strong><p>{money(entry.amountCents)} / {entry.status}{entry.reference ? ` / ${entry.reference}` : ""}</p>
        <p>Quote response / expiry date: {entry.dueDate?.slice(0, 10) || "Not set"}</p>{entry.notes ? <p>{entry.notes}</p> : null}
        <ul>{entry.attachments.map(file => <li key={file.id}>{file.originalName} <a target="_blank" rel="noreferrer" href={`${projectAttachmentDownloadUrl(file.id)}?inline=true`}>Preview</a> / <a href={projectAttachmentDownloadUrl(file.id)}>Download</a></li>)}</ul>
        {!entry.attachments.length ? <p>No quote documents uploaded yet.</p> : null}
        {writable ? <div className="pool-entry-actions">
          <button type="button" disabled={busy} onClick={() => setQuote({ id: entry.id, expectedVersion: entry.version, scope: entry.scope, companyName: entry.companyName, reference: entry.reference || "", amount: entry.amountCents === null ? "" : String(entry.amountCents / 100), status: entry.status, dueDate: entry.dueDate?.slice(0, 10) || "", notes: entry.notes || "" })}>Edit quote</button>
          <label>Attach more PDFs / files<input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" disabled={busy} onChange={event => { const selected = Array.from(event.target.files || []); event.target.value = ""; void run(async session => { setOutcomes([]); await upload(entry.id, selected, session); if (isCurrentSession(session)) await refresh(); }); }} /></label>
        </div> : null}
      </article>)}
    </div>
    {query.data && !query.data.quotes.length ? <p>No individual quotes yet. Existing bid files remain in Photos &amp; documents below.</p> : null}
    {writable ? <form className="pool-entry-form" data-testid="project-quote-form" onSubmit={event => { event.preventDefault(); void run(async session => {
      const saved = await saveProjectQuote(record.id, quote.id, { expectedVersion: quote.expectedVersion, scope: quote.scope, companyName: quote.companyName, reference: quote.reference || null, amountCents: cents(quote.amount), status: quote.status, dueDate: quote.dueDate || null, notes: quote.notes || null }, { expectedUserId: session.userId });
      if (!isCurrentSession(session)) return;
      setQuote(blankQuote()); setFiles([]); if (fileInput.current) fileInput.current.value = "";
      setMessage("Quote saved. Upload results are listed below."); setOutcomes([]);
      await upload(saved.entry.id, files, session); if (isCurrentSession(session)) await refresh();
    }); }}>
      <h5>{quote.expectedVersion ? "Edit quote" : "Add a quote"}</h5>
      <fieldset disabled={busy}><div className="project-budget-fields">
        <label>Scope / phase<input required maxLength={180} value={quote.scope} placeholder="Roof repair, building A" onChange={event => setQuote({ ...quote, scope: event.target.value })} /></label>
        <label>Vendor / company<input required maxLength={180} list={`project-vendors-${record.id}`} value={quote.companyName} placeholder="Choose or type a new company" onChange={event => setQuote({ ...quote, companyName: event.target.value })} /><datalist id={`project-vendors-${record.id}`}>{vendors.data?.vendors.map(vendor => <option key={vendor.id} value={vendor.name} />)}</datalist></label>
        <label>Quote number<input value={quote.reference} maxLength={120} onChange={event => setQuote({ ...quote, reference: event.target.value })} /></label>
        <label>Quote total ($)<input inputMode="decimal" value={quote.amount} placeholder="Leave blank if not priced" onChange={event => setQuote({ ...quote, amount: event.target.value })} /></label>
        <label>Quote status<select value={quote.status} onChange={event => setQuote({ ...quote, status: event.target.value as ProjectQuote["status"] })}>{["Requested", "Received", "Included", "Declined", "Superseded"].map(status => <option key={status}>{status}</option>)}</select></label>
        <label>Response / expiry date<input type="date" value={quote.dueDate} onChange={event => setQuote({ ...quote, dueDate: event.target.value })} /></label>
      </div>
      <label>Scope notes / exclusions<textarea value={quote.notes} maxLength={2000} onChange={event => setQuote({ ...quote, notes: event.target.value })} /></label>
      <label>PDFs and supporting files (multiple allowed)<input ref={fileInput} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" onChange={event => setFiles(Array.from(event.target.files || []))} /></label>
      <p>New companies are allowed without creating a vendor first.</p>
      {canManageVendors && quote.companyName.trim() && !matchingVendor ? <details><summary>Add this company to Vendors</summary><label>Trade<input value={trade} onChange={event => setTrade(event.target.value)} placeholder="Roofing, painting, electrical..." /></label><button type="button" disabled={!trade.trim() || vendors.isError || vendors.isPending} onClick={() => void run(async session => { await createVendor({ name: quote.companyName.trim(), trade: trade.trim(), propertyIds: [record.propertyId] }); if (isCurrentSession(session)) { setMessage("Vendor added. Your quote draft is unchanged."); await refresh(); } })}>Add vendor to this property</button></details> : null}
      <button className="button button-primary" type="submit">{quote.expectedVersion ? "Save quote changes" : "Save quote & files"}</button>
      {quote.expectedVersion ? <button type="button" onClick={() => { setQuote(blankQuote()); setFiles([]); if (fileInput.current) fileInput.current.value = ""; }}>Cancel editing</button> : null}
      </fieldset>
    </form> : null}
    {outcomes.length ? <ul role="status" data-testid="project-quote-upload-results">{outcomes.map((outcome, index) => <li key={index}>{outcome.name}: {outcome.message}</li>)}</ul> : null}
    <h4>In-house labor &amp; materials</h4><p>Labor uses hours × hourly cost; materials and equipment use quantity × unit cost. Include labor even when your staff does the work. Actual cost is the total for that line, not the unit price.</p>
    {query.data?.costLines.filter(line => !line.isArchived).map(line => <article key={line.id} className="project-cost-line"><strong>{line.description}</strong><span>{line.category}: {line.quantity} × {money(line.unitCostCents)} = {money(Math.round(line.quantity * line.unitCostCents))}</span><span>Actual: {line.actualCostCents === null ? "Not recorded" : money(line.actualCostCents)}</span>{writable ? <button disabled={busy} type="button" onClick={() => setCost({ id: line.id, expectedVersion: line.version, description: line.description, category: line.category, quantity: String(line.quantity), rate: String(line.unitCostCents / 100), actual: line.actualCostCents === null ? "" : String(line.actualCostCents / 100), isArchived: false })}>Edit cost</button> : null}</article>)}
    {writable ? <form className="pool-entry-form" data-testid="project-cost-form" onSubmit={event => { event.preventDefault(); void run(async session => {
      const unitCostCents = cents(cost.rate); if (unitCostCents === null) throw Error("Enter a unit cost; use 0 for no cost.");
      await saveProjectCost(record.id, cost.id, { expectedVersion: cost.expectedVersion, description: cost.description, category: cost.category, quantity: Number(cost.quantity), unitCostCents, actualCostCents: cents(cost.actual), isArchived: cost.isArchived }, { expectedUserId: session.userId });
      if (isCurrentSession(session)) { setCost(blankCost()); setMessage("Cost line saved."); await refresh(); }
    }); }}><fieldset disabled={busy}><div className="project-budget-fields">
      <label>Description<input required maxLength={180} value={cost.description} onChange={event => setCost({ ...cost, description: event.target.value })} /></label>
      <label>Cost type<select value={cost.category} onChange={event => setCost({ ...cost, category: event.target.value as ProjectCostLine["category"] })}>{["Labor", "Materials", "Equipment", "Other"].map(category => <option key={category}>{category}</option>)}</select></label>
      <label>{cost.category === "Labor" ? "Hours" : "Quantity"}<input type="number" required min="0.001" max="100000" step="any" value={cost.quantity} onChange={event => setCost({ ...cost, quantity: event.target.value })} /></label>
      <label>{cost.category === "Labor" ? "Hourly cost ($)" : "Unit cost ($)"}<input required inputMode="decimal" value={cost.rate} onChange={event => setCost({ ...cost, rate: event.target.value })} /></label>
      <label>Actual line total ($)<input inputMode="decimal" value={cost.actual} placeholder="Not recorded yet" onChange={event => setCost({ ...cost, actual: event.target.value })} /></label>
    </div>{cost.expectedVersion ? <label><input type="checkbox" checked={cost.isArchived} onChange={event => setCost({ ...cost, isArchived: event.target.checked })} /> Remove this line from active totals (retain history)</label> : null}<button className="button button-primary" type="submit">{cost.expectedVersion ? "Save cost changes" : "Add cost line"}</button>{cost.expectedVersion ? <button type="button" onClick={() => setCost(blankCost())}>Cancel editing</button> : null}</fieldset></form> : null}
  </section>;
}
