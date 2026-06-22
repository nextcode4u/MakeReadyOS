import { useMemo, useState } from "react";
import type { MakeReadyItem, Property, Vendor, VendorAssignment } from "../lib/api";
import { displayUnitNumber } from "../lib/board";
import { UnitSearchSelect } from "./UnitSearchSelect";

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
  language?: string;
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
  language = "en",
  loading = false,
  error = null,
  onCreateVendor,
  onArchiveVendor,
  onCreateAssignment,
  onUpdateAssignment,
}: Props) {
  const isSpanish = language === "es";
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
  const unitOptions = useMemo(() => itemOptions.map((item) => ({
    id: item.id,
    number: displayUnitNumber(item.property.code, item.unitNumber),
    floorPlan: item.floorPlan,
    floorPlanId: item.unit?.floorPlanId ?? null,
    propertyId: item.propertyId,
    property: item.property,
    squareFeet: item.unit?.squareFeet ?? null,
    occupancyStatus: item.unit?.occupancyStatus ?? "UNKNOWN",
    building: item.unit?.building ?? null,
    area: item.unit?.area ?? null,
    floor: item.unit?.floor ?? null,
    isBudgeted: item.unit?.isBudgeted ?? false,
    isActive: true,
  })), [itemOptions]);

  return (
    <section className="panel vendors-panel" data-testid="vendors-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{isSpanish ? "Sistema de proveedores" : "Vendor System"}</p>
          <h2>{isSpanish ? "Proveedores y trabajo de contratistas" : "Vendors & Contractor Work"}</h2>
          <p className="muted">{isSpanish ? "Directorio, seguimiento de asignaciones, trabajo programado de proveedores y visibilidad del riesgo de make ready." : "Directory, assignment tracking, scheduled vendor work, and make-ready risk visibility."}</p>
        </div>
      </div>

      {loading && <div className="state-card">{isSpanish ? "Cargando proveedores..." : "Loading vendors..."}</div>}
      {error && <div className="state-card error">{error}</div>}

      <div className="toolbar compact-toolbar">
        <input data-testid="vendor-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isSpanish ? "Buscar proveedores..." : "Search vendors..."} />
        <select data-testid="vendor-trade-filter" value={tradeFilter} onChange={(event) => setTradeFilter(event.target.value)}>
          <option value="">{isSpanish ? "Todos los oficios" : "All trades"}</option>
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
            <h3>{isSpanish ? "Agregar proveedor rapido" : "Quick Add Vendor"}</h3>
            <input data-testid="vendor-create-name" value={vendorDraft.name} onChange={(event) => setVendorDraft((current) => ({ ...current, name: event.target.value }))} placeholder={isSpanish ? "Nombre de la empresa" : "Company name"} required />
            <input data-testid="vendor-create-trade" value={vendorDraft.trade} onChange={(event) => setVendorDraft((current) => ({ ...current, trade: event.target.value }))} placeholder={isSpanish ? "Oficio/categoria" : "Trade/category"} required />
            <input value={vendorDraft.phone} onChange={(event) => setVendorDraft((current) => ({ ...current, phone: event.target.value }))} placeholder={isSpanish ? "Telefono" : "Phone"} />
            <input value={vendorDraft.email} onChange={(event) => setVendorDraft((current) => ({ ...current, email: event.target.value }))} placeholder="Email" />
            <textarea value={vendorDraft.notes} onChange={(event) => setVendorDraft((current) => ({ ...current, notes: event.target.value }))} placeholder={isSpanish ? "Notas" : "Notes"} />
            <div className="checkbox-row wrap">
              {properties.map((property) => (
                <label key={property.id}><input type="checkbox" checked={vendorDraft.propertyIds.includes(property.id)} onChange={(event) => setVendorDraft((current) => ({ ...current, propertyIds: event.target.checked ? [...current.propertyIds, property.id] : current.propertyIds.filter((id) => id !== property.id) }))} />{property.code}</label>
              ))}
            </div>
            <label className="checkbox-row"><input type="checkbox" checked={vendorDraft.isPreferred} onChange={(event) => setVendorDraft((current) => ({ ...current, isPreferred: event.target.checked }))} /> {isSpanish ? "Proveedor preferido" : "Preferred vendor"}</label>
            <button data-testid="vendor-create-submit" className="button button-primary" disabled={!vendorDraft.name.trim() || !vendorDraft.trade.trim()}>{isSpanish ? "Crear proveedor" : "Create Vendor"}</button>
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
            <h3>{isSpanish ? "Asignar trabajo al proveedor" : "Assign Vendor Work"}</h3>
            <select data-testid="vendor-assignment-vendor" value={assignmentDraft.vendorId} onChange={(event) => {
              const vendor = vendors.find((entry) => entry.id === event.target.value);
              setAssignmentDraft((current) => ({ ...current, vendorId: event.target.value, trade: vendor?.trade ?? current.trade }));
            }} required>
              <option value="">{isSpanish ? "Selecciona proveedor" : "Select vendor"}</option>
              {vendors.filter((vendor) => vendor.isActive).map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name} - {vendor.trade}</option>)}
            </select>
            <UnitSearchSelect
              units={unitOptions}
              value={assignmentDraft.itemId}
              onChange={(value) => setAssignmentDraft((current) => ({ ...current, itemId: value }))}
              placeholder={isSpanish ? "Buscar unidad..." : "Search unit..."}
              emptyLabel={isSpanish ? "Ninguna unidad seleccionada" : "No unit selected"}
            />
            <input value={assignmentDraft.trade} onChange={(event) => setAssignmentDraft((current) => ({ ...current, trade: event.target.value }))} placeholder={isSpanish ? "Oficio" : "Trade"} required />
            <label>{isSpanish ? "Programado" : "Scheduled"}<input type="date" value={assignmentDraft.scheduledDate} onChange={(event) => setAssignmentDraft((current) => ({ ...current, scheduledDate: event.target.value }))} /></label>
            <label>{isSpanish ? "Vence" : "Due"}<input type="date" value={assignmentDraft.dueDate} onChange={(event) => setAssignmentDraft((current) => ({ ...current, dueDate: event.target.value }))} /></label>
            <textarea value={assignmentDraft.notes} onChange={(event) => setAssignmentDraft((current) => ({ ...current, notes: event.target.value }))} placeholder={isSpanish ? "Notas de trabajo" : "Work notes"} />
            <button data-testid="vendor-assignment-create-submit" className="button button-primary" disabled={!assignmentDraft.vendorId || !assignmentDraft.itemId}>{isSpanish ? "Crear asignacion" : "Create Assignment"}</button>
          </form>
        </div>
      )}

      <div className="operations-grid two">
        <div className="operations-card">
          <h3>{isSpanish ? "Directorio de proveedores" : "Vendor Directory"}</h3>
          {filteredVendors.length === 0 ? <p className="muted">{isSpanish ? "Ningun proveedor coincide con los filtros actuales." : "No vendors match the current filters."}</p> : filteredVendors.map((vendor) => (
            <article key={vendor.id} className={`vendor-row ${vendor.isActive ? "" : "is-archived"}`}>
              <div>
                <strong>{vendor.name}</strong>
                <small>{vendor.trade}{vendor.isPreferred ? (isSpanish ? " / Preferido" : " / Preferred") : ""}</small>
                <small>{vendor.serviceAreas.length ? vendor.serviceAreas.map((area) => area.property.code).join(", ") : (isSpanish ? "Todas las propiedades" : "All properties")}</small>
              </div>
              <div className="row-actions">
                {vendor.phone && <a href={`tel:${vendor.phone}`}>{vendor.phone}</a>}
                {canManage && <button className="button button-secondary" data-testid={`vendor-${vendor.isActive ? "archive" : "restore"}-${vendor.id}`} onClick={() => void onArchiveVendor(vendor.id, !vendor.isActive)}>{vendor.isActive ? (isSpanish ? "Archivar" : "Archive") : (isSpanish ? "Restaurar" : "Restore")}</button>}
              </div>
            </article>
          ))}
        </div>

        <div className="operations-card">
          <h3>{isSpanish ? "Asignaciones abiertas de proveedores" : "Open Vendor Assignments"}</h3>
          {assignments.length === 0 ? <p className="muted">{isSpanish ? "No hay asignaciones abiertas de proveedores." : "No open vendor assignments."}</p> : assignments.map((assignment) => (
            <article key={assignment.id} className="vendor-row" data-testid={`vendor-assignment-${assignment.id}`}>
              <div>
                <strong>{assignment.property.code} {assignment.item.unitNumber}</strong>
                <small>{assignment.vendor.name} / {assignment.trade}</small>
                <small>{isSpanish ? "Programado" : "Scheduled"} {assignment.scheduledDate?.slice(0, 10) ?? (isSpanish ? "sin fecha" : "not set")} / {isSpanish ? "Vence" : "Due"} {assignment.dueDate?.slice(0, 10) ?? (isSpanish ? "sin fecha" : "not set")}</small>
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
