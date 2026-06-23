import { useMemo, useState } from "react";
import type { MakeReadyItem, PlanningResponse, Property, StaffOption, WorkAssignmentBlock } from "../lib/api";
import { displayUnitNumber } from "../lib/board";
import { StatusState } from "./StatusState";
import { UnitSearchSelect } from "./UnitSearchSelect";

type Props = {
  data?: PlanningResponse;
  properties: Property[];
  items: MakeReadyItem[];
  propertyId: string;
  language?: string;
  onPropertyChange: (value: string) => void;
  loading: boolean;
  error: boolean;
  canManage: boolean;
  onCreateBlock: (input: { assignedUserId: string; itemId: string; category: string; plannedDate: string; estimatedHours: number; notes?: string | null }) => Promise<void>;
  onUpdateBlock: (id: string, input: Partial<{ status: WorkAssignmentBlock["status"]; plannedDate: string; notes: string | null }>) => Promise<void>;
  onOpenItem: (id: string) => void;
};

const categories = ["Make Ready", "Cleaning", "Paint", "Flooring", "Pest", "Maintenance", "QC"];

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

export function PlanningPanel({ data, properties, items, propertyId, language = "en", onPropertyChange, loading, error, canManage, onCreateBlock, onUpdateBlock, onOpenItem }: Props) {
  const isSpanish = language === "es";
  const [draft, setDraft] = useState({ assignedUserId: "", itemId: "", category: "Make Ready", plannedDate: todayInput(), notes: "" });
  const activeItems = useMemo(() => items.filter((item) => !item.isArchived && (!propertyId || item.propertyId === propertyId)), [items, propertyId]);
  const unitOptions = useMemo(() => activeItems.map((item) => ({
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
  })), [activeItems]);
  const workByDate = useMemo(() => data?.blocks.reduce<Record<string, WorkAssignmentBlock[]>>((acc, block) => {
    const key = block.plannedDate.slice(0, 10);
    acc[key] ??= [];
    acc[key].push(block);
    return acc;
  }, {}) ?? {}, [data?.blocks]);
  const activeBlocks = useMemo(() => data?.blocks.filter((block) => block.status === "PLANNED" || block.status === "IN_PROGRESS") ?? [], [data?.blocks]);
  const closedBlocks = useMemo(() => data?.blocks.filter((block) => block.status === "DONE" || block.status === "CANCELED") ?? [], [data?.blocks]);
  if (loading) return <StatusState title={isSpanish ? "Cargando planificacion" : "Loading planning"} description={isSpanish ? "Reuniendo trabajo programado, brechas de cobertura y riesgo de move-in." : "Gathering scheduled work, coverage gaps, and move-in risk."} />;
  if (error || !data) return <StatusState title={isSpanish ? "Planificacion no disponible" : "Planning unavailable"} description={isSpanish ? "Actualiza para volver a cargar la planificacion de carga de trabajo." : "Refresh to reload workload planning."} tone="error" />;
  return (
    <section className="planning-panel" data-testid="planning-panel">
      <header className="panel-heading">
        <div>
          <h2>{isSpanish ? "Planificacion de carga de trabajo" : "Workload Planning"}</h2>
          <p>{isSpanish ? "Planifica quien cubre cada unidad y cuando. Intencionalmente no se usan horas porque emergencias, piezas y tiempos de proveedores cambian el dia." : "Plan who is covering which unit and when. Hours are intentionally not used because emergencies, parts, and vendor timing change the day."}</p>
        </div>
        <label>{isSpanish ? "Propiedad" : "Property"}
          <select data-testid="planning-property-filter" value={propertyId} onChange={(event) => onPropertyChange(event.target.value)}>
            <option value="">{isSpanish ? "Todas las propiedades accesibles" : "All accessible properties"}</option>
            {properties.map((property) => <option key={property.id} value={property.id}>{property.code} / {property.name}</option>)}
          </select>
        </label>
      </header>
      <div className="planning-kpis">
        <strong>{data.summary.plannedBlocks}<span>{isSpanish ? "Asignaciones planeadas" : "Planned assignments"}</span></strong>
        <strong>{Object.keys(workByDate).length}<span>{isSpanish ? "Dias programados" : "Scheduled days"}</span></strong>
        <strong className={data.summary.unplannedWork ? "warning" : ""}>{data.summary.unplannedWork}<span>{isSpanish ? "Turns activos sin plan" : "Unplanned active turns"}</span></strong>
        <strong className={data.summary.moveInsNotCovered ? "risk" : ""}>{data.summary.moveInsNotCovered}<span>{isSpanish ? "Move-ins sin cubrir" : "Move-ins not covered"}</span></strong>
      </div>
      {canManage ? (
        <form className="planning-create" data-testid="planning-create-form" onSubmit={async (event) => {
          event.preventDefault();
          await onCreateBlock({
            assignedUserId: draft.assignedUserId,
            itemId: draft.itemId,
            category: draft.category,
            plannedDate: draft.plannedDate,
            estimatedHours: 1,
            notes: draft.notes || null,
          });
          setDraft((current) => ({ ...current, itemId: "", notes: "" }));
        }}>
          <label>{isSpanish ? "Personal" : "Staff"}
            <select data-testid="planning-assigned-user" required value={draft.assignedUserId} onChange={(event) => setDraft((current) => ({ ...current, assignedUserId: event.target.value }))}>
              <option value="">{isSpanish ? "Elegir personal" : "Choose staff"}</option>
              {data.staff.map((user) => <option key={user.id} value={user.id}>{user.fullName} / {user.role}</option>)}
            </select>
          </label>
          <label>{isSpanish ? "Unidad" : "Unit"}
            <UnitSearchSelect
              units={unitOptions}
              value={draft.itemId}
              onChange={(value) => setDraft((current) => ({ ...current, itemId: value }))}
              placeholder={isSpanish ? "Buscar unidad..." : "Search unit..."}
              emptyLabel={isSpanish ? "Ninguna unidad seleccionada" : "No unit selected"}
            />
          </label>
          <label>{isSpanish ? "Categoria" : "Category"}
            <select value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}>
              {categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </label>
          <label>{isSpanish ? "Fecha" : "Date"}<input data-testid="planning-date" type="date" value={draft.plannedDate} onChange={(event) => setDraft((current) => ({ ...current, plannedDate: event.target.value }))} /></label>
          <label>{isSpanish ? "Notas" : "Notes"}<input value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} /></label>
          <button className="button button-primary" data-testid="planning-create-submit" type="submit">{isSpanish ? "Planificar trabajo" : "Plan work"}</button>
        </form>
      ) : null}
      <section className="dashboard-chart">
        <h3>{isSpanish ? "Cobertura por fecha" : "Coverage By Date"}</h3>
        {Object.keys(workByDate).length === 0 ? <p className="empty-copy">{isSpanish ? "No hay trabajo interno planificado en esta ventana." : "No planned in-house work in this window."}</p> : Object.entries(workByDate).map(([date, blocks]) => (
          <div key={date} className="planning-row">
            <span><strong>{date}</strong><small>{blocks.length} {isSpanish ? `asignacion${blocks.length === 1 ? "" : "es"}` : `assignment${blocks.length === 1 ? "" : "s"}`}</small></span>
            <i style={{ width: `${Math.min(100, blocks.length * 18)}%` }} />
            <b>{Array.from(new Set(blocks.map((block) => block.assignedUser.fullName))).length} {isSpanish ? "personal" : "staff"}</b>
          </div>
        ))}
      </section>
      <section className="planning-blocks">
        <h3>{isSpanish ? "Trabajo planificado" : "Planned Work"}</h3>
        {data.blocks.length === 0 ? <p className="empty-copy">{isSpanish ? "No hay bloques de trabajo planificados para esta ventana de fechas." : "No work blocks are planned for this date window."}</p> : (
          <>
            <div className="section-header">
              <strong>{isSpanish ? "Bloques activos" : "Active blocks"}</strong>
              <span className="muted">{activeBlocks.length}</span>
            </div>
            {activeBlocks.length === 0 ? <p className="empty-copy">{isSpanish ? "No hay bloques activos en esta ventana." : "No active work blocks in this window."}</p> : activeBlocks.map((block) => (
              <article key={block.id} className="planning-card" data-testid={`planning-block-${block.id}`}>
                <button type="button" onClick={() => onOpenItem(block.itemId)}><strong>{displayUnitNumber(block.property.code, block.item.unitNumber)}</strong></button>
                <span>{block.category} / {block.assignedUser.fullName}</span>
                <span>{block.plannedDate.slice(0, 10)} / {block.status}</span>
                <select value={block.status} onChange={(event) => onUpdateBlock(block.id, { status: event.target.value as WorkAssignmentBlock["status"] })}>
                  <option value="PLANNED">{isSpanish ? "Planificado" : "Planned"}</option>
                  <option value="IN_PROGRESS">{isSpanish ? "En progreso" : "In progress"}</option>
                  <option value="DONE">{isSpanish ? "Hecho" : "Done"}</option>
                  <option value="CANCELED">{isSpanish ? "Cancelado" : "Canceled"}</option>
                </select>
              </article>
            ))}
            {closedBlocks.length > 0 ? (
              <div className="stack gap-sm" style={{ marginTop: 16 }}>
                <div className="section-header">
                  <strong>{isSpanish ? "Bloques cerrados" : "Closed blocks"}</strong>
                  <span className="muted">{closedBlocks.length}</span>
                </div>
                {closedBlocks.map((block) => (
                  <article key={block.id} className="planning-card" data-testid={`planning-block-${block.id}`}>
                    <button type="button" onClick={() => onOpenItem(block.itemId)}><strong>{displayUnitNumber(block.property.code, block.item.unitNumber)}</strong></button>
                    <span>{block.category} / {block.assignedUser.fullName}</span>
                    <span>{block.plannedDate.slice(0, 10)} / {block.status}</span>
                    <select value={block.status} onChange={(event) => onUpdateBlock(block.id, { status: event.target.value as WorkAssignmentBlock["status"] })}>
                      <option value="PLANNED">{isSpanish ? "Planificado" : "Planned"}</option>
                      <option value="IN_PROGRESS">{isSpanish ? "En progreso" : "In progress"}</option>
                      <option value="DONE">{isSpanish ? "Hecho" : "Done"}</option>
                      <option value="CANCELED">{isSpanish ? "Cancelado" : "Canceled"}</option>
                    </select>
                  </article>
                ))}
              </div>
            ) : null}
          </>
        )}
      </section>
      <section className="planning-blocks">
        <h3>{isSpanish ? "Bandeja de trabajo no programado" : "Unscheduled Work Bucket"}</h3>
        {data.unscheduledItems.length === 0 ? <p className="empty-copy">{isSpanish ? "Todos los turns activos incompletos tienen trabajo interno planificado." : "All active incomplete turns have some planned in-house work."}</p> : data.unscheduledItems.slice(0, 24).map((item) => (
          <button className="planning-unscheduled" type="button" key={item.id} onClick={() => onOpenItem(item.id)}>
            <strong>{displayUnitNumber(item.property.code, item.unitNumber)}</strong>
            <span>{item.moveInDate ? `${isSpanish ? "Move-in" : "Move-in"} ${item.moveInDate.slice(0, 10)}` : (isSpanish ? "Move-in sin definir" : "Move-in unset")} / {item.riskLevel} {isSpanish ? "riesgo" : "risk"}</span>
          </button>
        ))}
      </section>
    </section>
  );
}
