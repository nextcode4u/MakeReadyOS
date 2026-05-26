import { useEffect, useMemo, useState } from "react";
import type { FloorPlan, MakeReadyItem, Property, SavedView, StaffOption } from "../lib/api";
import { displayUnitNumber } from "../lib/board";

type Props = {
  open: boolean;
  items: MakeReadyItem[];
  properties: Property[];
  views: SavedView[];
  staff: StaffOption[];
  floorPlans: FloorPlan[];
  onClose: () => void;
  onOpenItem: (id: string) => void;
  onNavigate: (view: "dashboard" | "table" | "mywork" | "planning" | "activity") => void;
  onOpenNotifications: () => void;
  onOpenOnboarding: () => void;
  onLoadView: (view: SavedView) => void;
};

export function CommandPalette({ open, items, properties, views, staff, floorPlans, onClose, onOpenItem, onNavigate, onOpenNotifications, onOpenOnboarding, onLoadView }: Props) {
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);
  const match = query.trim().toLowerCase();
  const results = useMemo(() => ({
    items: items.filter((item) => `${item.unitNumber} ${item.property.name} ${item.property.code}`.toLowerCase().includes(match)).slice(0, 6),
    properties: properties.filter((property) => `${property.code} ${property.name}`.toLowerCase().includes(match)).slice(0, 4),
    views: views.filter((view) => view.name.toLowerCase().includes(match)).slice(0, 4),
    people: staff.filter((person) => person.fullName.toLowerCase().includes(match)).slice(0, 4),
    floorPlans: floorPlans.filter((plan) => plan.name.toLowerCase().includes(match)).slice(0, 4),
  }), [floorPlans, items, match, properties, staff, views]);
  if (!open) return null;
  return (
    <>
      <div className="palette-backdrop" onClick={onClose} aria-hidden="true" />
      <section className="command-palette" data-testid="command-palette" aria-label="Quick search and commands">
        <input autoFocus data-testid="command-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search units, views, properties, staff..." onKeyDown={(event) => { if (event.key === "Escape") onClose(); }} />
        {!match ? (
          <div className="palette-actions">
            <button onClick={() => { onNavigate("dashboard"); onClose(); }}>Open Dashboard</button>
            <button onClick={() => { onNavigate("table"); onClose(); }}>Open Board</button>
            <button onClick={() => { onNavigate("mywork"); onClose(); }}>Open My Work</button>
            <button onClick={() => { onNavigate("planning"); onClose(); }}>Open Planning</button>
            <button onClick={() => { onOpenNotifications(); onClose(); }}>Open Notifications</button>
            <button onClick={() => { onOpenOnboarding(); onClose(); }}>Open Setup Guide</button>
            <button onClick={() => { onNavigate("activity"); onClose(); }}>Open Activity</button>
          </div>
        ) : (
          <div className="palette-results">
            {results.items.map((item) => <button key={item.id} onClick={() => { onOpenItem(item.id); onClose(); }}><strong>{displayUnitNumber(item.property.code, item.unitNumber)}</strong><small>Unit / {item.property.name}</small></button>)}
            {results.views.map((view) => <button key={view.id} onClick={() => { onLoadView(view); onClose(); }}><strong>{view.name}</strong><small>Saved view / {view.viewType}</small></button>)}
            {results.properties.map((property) => <div key={property.id}><strong>{property.code} / {property.name}</strong><small>Property</small></div>)}
            {results.people.map((person) => <div key={person.id}><strong>{person.fullName}</strong><small>Staff / {person.role}</small></div>)}
            {results.floorPlans.map((plan) => <div key={plan.id}><strong>{plan.name}</strong><small>Floor plan</small></div>)}
            {!Object.values(results).some((entries) => entries.length) ? <p className="empty-copy">No matching operational records.</p> : null}
          </div>
        )}
        <footer>Ctrl/Command + K to open / Escape to close</footer>
      </section>
    </>
  );
}
