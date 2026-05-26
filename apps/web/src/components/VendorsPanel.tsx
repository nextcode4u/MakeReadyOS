import { useMemo, useState } from "react";
import type { MakeReadyItem, Property, Vendor, VendorAssignment } from "../lib/api";

const vendorStatuses: VendorAssignment["status"][] = ["REQUESTED", "SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELED", "FOLLOW_UP_NEEDED"];

function statusLabel(value: string) {
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

type Props = {
  vendors: Vendor[];
  assignments: VendorAssignment[];
  properties: Property[];
  items: MakeReadyItem[];
  canManage: boolean;
  loading?: boolean;
  error?: string | null;
  onCreateVendor: (input: { name: string; trade: string; phone?: string | null; email?: string | null; notes?: string | null; isPreferred?: boolean; propertyIds?: string[] }) => Promise<void>;
  onArchiveVendor: (id: string, restore?: boolean) => Promise<void>;
  onCreateAssignment: (input: { vendorId: string; itemId: string; trade: string; status?: VendorAssignment["status"]; scheduledDate?: string | null; dueDate?: string | null; notes?: string | null }) => Promise<void>;
  onUpdateAssignment: (id: string, input: { status?: VendorAssignment["status"]; notes?: string | null; scheduledDate?: string | null; dueDate?: string | null }) => Promise<void>;
};

export function VendorsPanel({
  vendors,
  assignments,
  properties,
  items,
  canManage,
  loading = false,
  error = null,
  onCreateVendor,
  onArchiveVendor,
  onCreateAssignment,
  onUpdateAssignment,
}: Props) {
  const [query, setQuery] = useState("");
  const [tradeFilter, setTradeFilter] = useState("");
  const [vendorDraft, setVendorDraft] = useState({ name: "", trade: "Flooring", phone: "", email: "", notes: "", isPreferred: true, propertyIds: [] as string[] });
  const [assignmentDraft, setAssignmentDraft] = useState({ vendorId: "", itemId: "", trade: "Flooring", scheduledDate: "", dueDate: "", notes: "" });

  const trades = useMemo(() => Array.from(new Set(vendors.map((vendor) => vendor.trade))).sort(), [vendors]);
  const filteredVendors = vendors.filter((vendor) => {
    const matchesQuery = !query || `${vendor.name} ${vendor.trade} ${vendor.email ?? ""}`.toLowerCase().includes(query.toLowerCase());
    const matchesTrade = !tradeFilter || vendor.trade === tradeFilter;
    return matchesQuery && matchesTrade;
  });
  const itemOptions = items.filter((item) => !item.isArchived).slice(0, 200);

  return (
    <section className="panel vendors-panel" data-testid="vendors-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Vendor System</p>
          <h2>Vendors & Contractor Work</h2>
          <p className="muted">Directory, assignment tracking, scheduled vendor work, and make-ready risk visibility.</p>
        </div>
      </div>

      {loading && <div className="state-card">Loading vendors...</div>}
      {error && <div className="state-card error">{error}</div>}

      <div className="toolbar compact-toolbar">
        <input data-testid="vendor-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search vendors..." />
        <select data-testid="vendor-trade-filter" value={tradeFilter} onChange={(event) => setTradeFilter(event.target.value)}>
          <option value="">All trades</option>
          {trades.map((trade) => <option key={trade} value={trade}>{trade}</option>)}
        </select>
      </div>

      {canManage && (
        <div className="operations-grid two">
          <form className="operations-card" data-testid="vendor-create-form" onSubmit={async (event) => {
            event.preventDefault();
            await onCreateVendor({
              name: vendorDraft.name,
              trade: vendorDraft.trade,
              phone: vendorDraft.phone || null,
              email: vendorDraft.email || null,
              notes: vendorDraft.notes || null,
              isPreferred: vendorDraft.isPreferred,
              propertyIds: vendorDraft.propertyIds,
            });
            setVendorDraft((current) => ({ ...current, name: "", phone: "", email: "", notes: "" }));
          }}>
            <h3>Quick Add Vendor</h3>
            <input data-testid="vendor-create-name" value={vendorDraft.name} onChange={(event) => setVendorDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Company name" required />
            <input data-testid="vendor-create-trade" value={vendorDraft.trade} onChange={(event) => setVendorDraft((current) => ({ ...current, trade: event.target.value }))} placeholder="Trade/category" required />
            <input value={vendorDraft.phone} onChange={(event) => setVendorDraft((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone" />
            <input value={vendorDraft.email} onChange={(event) => setVendorDraft((current) => ({ ...current, email: event.target.value }))} placeholder="Email" />
            <textarea value={vendorDraft.notes} onChange={(event) => setVendorDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes" />
            <div className="checkbox-row wrap">
              {properties.map((property) => (
                <label key={property.id}><input type="checkbox" checked={vendorDraft.propertyIds.includes(property.id)} onChange={(event) => setVendorDraft((current) => ({ ...current, propertyIds: event.target.checked ? [...current.propertyIds, property.id] : current.propertyIds.filter((id) => id !== property.id) }))} />{property.code}</label>
              ))}
            </div>
            <label className="checkbox-row"><input type="checkbox" checked={vendorDraft.isPreferred} onChange={(event) => setVendorDraft((current) => ({ ...current, isPreferred: event.target.checked }))} /> Preferred vendor</label>
            <button data-testid="vendor-create-submit" className="button button-primary" disabled={!vendorDraft.name.trim() || !vendorDraft.trade.trim()}>Create Vendor</button>
          </form>

          <form className="operations-card" data-testid="vendor-assignment-create-form" onSubmit={async (event) => {
            event.preventDefault();
            await onCreateAssignment({
              vendorId: assignmentDraft.vendorId,
              itemId: assignmentDraft.itemId,
              trade: assignmentDraft.trade,
              status: "SCHEDULED",
              scheduledDate: assignmentDraft.scheduledDate || null,
              dueDate: assignmentDraft.dueDate || null,
              notes: assignmentDraft.notes || null,
            });
            setAssignmentDraft((current) => ({ ...current, scheduledDate: "", dueDate: "", notes: "" }));
          }}>
            <h3>Assign Vendor Work</h3>
            <select data-testid="vendor-assignment-vendor" value={assignmentDraft.vendorId} onChange={(event) => {
              const vendor = vendors.find((entry) => entry.id === event.target.value);
              setAssignmentDraft((current) => ({ ...current, vendorId: event.target.value, trade: vendor?.trade ?? current.trade }));
            }} required>
              <option value="">Select vendor</option>
              {vendors.filter((vendor) => vendor.isActive).map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name} - {vendor.trade}</option>)}
            </select>
            <select data-testid="vendor-assignment-item" value={assignmentDraft.itemId} onChange={(event) => setAssignmentDraft((current) => ({ ...current, itemId: event.target.value }))} required>
              <option value="">Select unit</option>
              {itemOptions.map((item) => <option key={item.id} value={item.id}>{item.property.code} {item.unitNumber}</option>)}
            </select>
            <input value={assignmentDraft.trade} onChange={(event) => setAssignmentDraft((current) => ({ ...current, trade: event.target.value }))} placeholder="Trade" required />
            <label>Scheduled<input type="date" value={assignmentDraft.scheduledDate} onChange={(event) => setAssignmentDraft((current) => ({ ...current, scheduledDate: event.target.value }))} /></label>
            <label>Due<input type="date" value={assignmentDraft.dueDate} onChange={(event) => setAssignmentDraft((current) => ({ ...current, dueDate: event.target.value }))} /></label>
            <textarea value={assignmentDraft.notes} onChange={(event) => setAssignmentDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Work notes" />
            <button data-testid="vendor-assignment-create-submit" className="button button-primary" disabled={!assignmentDraft.vendorId || !assignmentDraft.itemId}>Create Assignment</button>
          </form>
        </div>
      )}

      <div className="operations-grid two">
        <div className="operations-card">
          <h3>Vendor Directory</h3>
          {filteredVendors.length === 0 ? <p className="muted">No vendors match the current filters.</p> : filteredVendors.map((vendor) => (
            <article key={vendor.id} className={`vendor-row ${vendor.isActive ? "" : "is-archived"}`}>
              <div>
                <strong>{vendor.name}</strong>
                <small>{vendor.trade}{vendor.isPreferred ? " / Preferred" : ""}</small>
                <small>{vendor.serviceAreas.length ? vendor.serviceAreas.map((area) => area.property.code).join(", ") : "All properties"}</small>
              </div>
              <div className="row-actions">
                {vendor.phone && <a href={`tel:${vendor.phone}`}>{vendor.phone}</a>}
                {canManage && <button className="button button-secondary" data-testid={`vendor-${vendor.isActive ? "archive" : "restore"}-${vendor.id}`} onClick={() => void onArchiveVendor(vendor.id, !vendor.isActive)}>{vendor.isActive ? "Archive" : "Restore"}</button>}
              </div>
            </article>
          ))}
        </div>

        <div className="operations-card">
          <h3>Open Vendor Assignments</h3>
          {assignments.length === 0 ? <p className="muted">No open vendor assignments.</p> : assignments.map((assignment) => (
            <article key={assignment.id} className="vendor-row" data-testid={`vendor-assignment-${assignment.id}`}>
              <div>
                <strong>{assignment.property.code} {assignment.item.unitNumber}</strong>
                <small>{assignment.vendor.name} / {assignment.trade}</small>
                <small>Scheduled {assignment.scheduledDate?.slice(0, 10) ?? "not set"} / Due {assignment.dueDate?.slice(0, 10) ?? "not set"}</small>
              </div>
              <select value={assignment.status} onChange={(event) => void onUpdateAssignment(assignment.id, { status: event.target.value as VendorAssignment["status"] })}>
                {vendorStatuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
              </select>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
