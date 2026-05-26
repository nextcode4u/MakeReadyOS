import { useMemo, useState } from "react";
import type { MakeReadyItem, PlanningResponse, Property, StaffOption, WorkAssignmentBlock } from "../lib/api";
import { displayUnitNumber } from "../lib/board";
import { StatusState } from "./StatusState";

type Props = {
  data?: PlanningResponse;
  properties: Property[];
  items: MakeReadyItem[];
  propertyId: string;
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

export function PlanningPanel({ data, properties, items, propertyId, onPropertyChange, loading, error, canManage, onCreateBlock, onUpdateBlock, onOpenItem }: Props) {
  const [draft, setDraft] = useState({ assignedUserId: "", itemId: "", category: "Make Ready", plannedDate: todayInput(), notes: "" });
  const activeItems = useMemo(() => items.filter((item) => !item.isArchived && (!propertyId || item.propertyId === propertyId)), [items, propertyId]);
  const workByDate = useMemo(() => data?.blocks.reduce<Record<string, WorkAssignmentBlock[]>>((acc, block) => {
    const key = block.plannedDate.slice(0, 10);
    acc[key] ??= [];
    acc[key].push(block);
    return acc;
  }, {}) ?? {}, [data?.blocks]);
  if (loading) return <StatusState title="Loading planning" description="Gathering scheduled work, coverage gaps, and move-in risk." />;
  if (error || !data) return <StatusState title="Planning unavailable" description="Refresh to reload workload planning." tone="error" />;
  return (
    <section className="planning-panel" data-testid="planning-panel">
      <header className="panel-heading">
        <div>
          <h2>Workload Planning</h2>
          <p>Plan who is covering which unit and when. Hours are intentionally not used because emergencies, parts, and vendor timing change the day.</p>
        </div>
        <label>Property
          <select data-testid="planning-property-filter" value={propertyId} onChange={(event) => onPropertyChange(event.target.value)}>
            <option value="">All accessible properties</option>
            {properties.map((property) => <option key={property.id} value={property.id}>{property.code} / {property.name}</option>)}
          </select>
        </label>
      </header>
      <div className="planning-kpis">
        <strong>{data.summary.plannedBlocks}<span>Planned assignments</span></strong>
        <strong>{Object.keys(workByDate).length}<span>Scheduled days</span></strong>
        <strong className={data.summary.unplannedWork ? "warning" : ""}>{data.summary.unplannedWork}<span>Unplanned active turns</span></strong>
        <strong className={data.summary.moveInsNotCovered ? "risk" : ""}>{data.summary.moveInsNotCovered}<span>Move-ins not covered</span></strong>
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
          <label>Staff
            <select data-testid="planning-assigned-user" required value={draft.assignedUserId} onChange={(event) => setDraft((current) => ({ ...current, assignedUserId: event.target.value }))}>
              <option value="">Choose staff</option>
              {data.staff.map((user) => <option key={user.id} value={user.id}>{user.fullName} / {user.role}</option>)}
            </select>
          </label>
          <label>Unit
            <select data-testid="planning-item" required value={draft.itemId} onChange={(event) => setDraft((current) => ({ ...current, itemId: event.target.value }))}>
              <option value="">Choose unit</option>
              {activeItems.map((item) => <option key={item.id} value={item.id}>{displayUnitNumber(item.property.code, item.unitNumber)} / {item.moveInDate ? `Move-in ${item.moveInDate.slice(0, 10)}` : "No move-in"}</option>)}
            </select>
          </label>
          <label>Category
            <select value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}>
              {categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </label>
          <label>Date<input data-testid="planning-date" type="date" value={draft.plannedDate} onChange={(event) => setDraft((current) => ({ ...current, plannedDate: event.target.value }))} /></label>
          <label>Notes<input value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} /></label>
          <button className="button button-primary" data-testid="planning-create-submit" type="submit">Plan work</button>
        </form>
      ) : null}
      <section className="dashboard-chart">
        <h3>Coverage By Date</h3>
        {Object.keys(workByDate).length === 0 ? <p className="empty-copy">No planned in-house work in this window.</p> : Object.entries(workByDate).map(([date, blocks]) => (
          <div key={date} className="planning-row">
            <span><strong>{date}</strong><small>{blocks.length} assignment{blocks.length === 1 ? "" : "s"}</small></span>
            <i style={{ width: `${Math.min(100, blocks.length * 18)}%` }} />
            <b>{Array.from(new Set(blocks.map((block) => block.assignedUser.fullName))).length} staff</b>
          </div>
        ))}
      </section>
      <section className="planning-blocks">
        <h3>Planned Work</h3>
        {data.blocks.length === 0 ? <p className="empty-copy">No work blocks are planned for this date window.</p> : data.blocks.map((block) => (
          <article key={block.id} className="planning-card" data-testid={`planning-block-${block.id}`}>
            <button type="button" onClick={() => onOpenItem(block.itemId)}><strong>{displayUnitNumber(block.property.code, block.item.unitNumber)}</strong></button>
            <span>{block.category} / {block.assignedUser.fullName}</span>
            <span>{block.plannedDate.slice(0, 10)} / {block.status}</span>
            <select value={block.status} onChange={(event) => onUpdateBlock(block.id, { status: event.target.value as WorkAssignmentBlock["status"] })}>
              <option value="PLANNED">Planned</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="DONE">Done</option>
              <option value="CANCELED">Canceled</option>
            </select>
          </article>
        ))}
      </section>
      <section className="planning-blocks">
        <h3>Unscheduled Work Bucket</h3>
        {data.unscheduledItems.length === 0 ? <p className="empty-copy">All active incomplete turns have some planned in-house work.</p> : data.unscheduledItems.slice(0, 24).map((item) => (
          <button className="planning-unscheduled" type="button" key={item.id} onClick={() => onOpenItem(item.id)}>
            <strong>{displayUnitNumber(item.property.code, item.unitNumber)}</strong>
            <span>{item.moveInDate ? `Move-in ${item.moveInDate.slice(0, 10)}` : "Move-in unset"} / {item.riskLevel} risk</span>
          </button>
        ))}
      </section>
    </section>
  );
}
