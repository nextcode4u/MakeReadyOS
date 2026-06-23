import { useEffect, useMemo, useState } from "react";
import type { FloorPlan, MakeReadyItem, Property, SavedView, StaffOption, UserLanguage } from "../lib/api";
import { displayUnitNumber } from "../lib/board";

export type CommandPaletteView =
  | "dashboard"
  | "table"
  | "mywork"
  | "planning"
  | "activity"
  | "kanban"
  | "calendar"
  | "maps"
  | "pond"
  | "vendors"
  | "automations"
  | "operations"
  | "fields"
  | "admin"
  | "refrigerant"
  | "pool"
  | "pest"
  | "lease"
  | "pm"
  | "projects"
  | "wiki";

export type CommandPaletteWorkspaceAction = {
  id: string;
  label: string;
  description: string;
  view: CommandPaletteView;
};

export type CommandPaletteWorkspaceGroup = {
  id: string;
  label: string;
  actions: CommandPaletteWorkspaceAction[];
};

function floorPlanLabel(plan: Pick<FloorPlan, "code" | "name">) {
  return plan.name && plan.name !== plan.code ? `${plan.code} - ${plan.name}` : plan.code;
}

type Props = {
  open: boolean;
  language: UserLanguage;
  items: MakeReadyItem[];
  properties: Property[];
  views: SavedView[];
  staff: StaffOption[];
  floorPlans: FloorPlan[];
  workspaceGroups: CommandPaletteWorkspaceGroup[];
  onClose: () => void;
  onOpenItem: (id: string) => void;
  onNavigate: (view: CommandPaletteView) => void;
  onOpenNotifications: () => void;
  onOpenOnboarding: () => void;
  onApplyBasicMode: () => void;
  onOpenShortcutHelp: () => void;
  onLoadView: (view: SavedView) => void;
};

function searchableText(value: string | null | undefined) {
  return (value ?? "").toLowerCase();
}

export function CommandPalette({ open, language, items, properties, views, staff, floorPlans, workspaceGroups, onClose, onOpenItem, onNavigate, onOpenNotifications, onOpenOnboarding, onApplyBasicMode, onOpenShortcutHelp, onLoadView }: Props) {
  const isSpanish = language === "es";
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);
  const match = query.trim().toLowerCase();
  const workspaceActions = useMemo(
    () =>
      workspaceGroups.flatMap((group) =>
        group.actions.map((action) => ({
          ...action,
          groupLabel: group.label,
        })),
      ),
    [workspaceGroups],
  );
  const results = useMemo(
    () => ({
      workspaces: workspaceActions
        .filter((action) => `${searchableText(action.label)} ${searchableText(action.description)} ${searchableText(action.groupLabel)}`.includes(match))
        .slice(0, 10),
      items: items.filter((item) => `${item.unitNumber} ${item.property.name} ${item.property.code}`.toLowerCase().includes(match)).slice(0, 6),
      properties: properties.filter((property) => `${property.code} ${property.name}`.toLowerCase().includes(match)).slice(0, 4),
      views: views.filter((view) => view.name.toLowerCase().includes(match)).slice(0, 4),
      people: staff.filter((person) => person.fullName.toLowerCase().includes(match)).slice(0, 4),
      floorPlans: floorPlans.filter((plan) => `${plan.code} ${plan.name}`.toLowerCase().includes(match)).slice(0, 4),
    }),
    [floorPlans, items, match, properties, staff, views, workspaceActions],
  );
  if (!open) return null;
  return (
    <>
      <div className="palette-backdrop" onClick={onClose} aria-hidden="true" />
      <section className="command-palette" data-testid="command-palette" aria-label={isSpanish ? "Busqueda rapida y comandos" : "Quick search and commands"}>
        <input autoFocus data-testid="command-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isSpanish ? "Buscar unidades, vistas, propiedades, personal..." : "Search units, views, properties, staff..."} onKeyDown={(event) => { if (event.key === "Escape") onClose(); }} />
        {!match ? (
          <div className="palette-actions">
            {workspaceGroups.map((group) => (
              <div key={group.id} className="palette-section" data-testid={`command-palette-group-${group.id}`}>
                <strong className="palette-section-label">{group.label}</strong>
                <div className="palette-section-grid">
                  {group.actions.map((action) => (
                    <button
                      key={action.id}
                      data-testid={`command-palette-action-${action.id}`}
                      onClick={() => {
                        onNavigate(action.view);
                        onClose();
                      }}
                    >
                      <strong>{action.label}</strong>
                      <small>{action.description}</small>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="palette-section" data-testid="command-palette-group-shortcuts">
              <strong className="palette-section-label">{isSpanish ? "Atajos" : "Shortcuts"}</strong>
              <div className="palette-section-grid">
                <button data-testid="command-palette-action-notifications" onClick={() => { onOpenNotifications(); onClose(); }}>
                  <strong>{isSpanish ? "Notificaciones" : "Notifications"}</strong>
                  <small>{isSpanish ? "Abrir el panel de alertas no leidas." : "Open the unread alerts drawer."}</small>
                </button>
                <button data-testid="command-palette-action-onboarding" onClick={() => { onOpenOnboarding(); onClose(); }}>
                  <strong>{isSpanish ? "Guia de configuracion" : "Setup Guide"}</strong>
                  <small>{isSpanish ? "Reabrir la lista de inicio inicial." : "Reopen the first-run onboarding checklist."}</small>
                </button>
                <button data-testid="command-palette-action-basic-board" onClick={() => { onApplyBasicMode(); onClose(); }}>
                  <strong>{isSpanish ? "Modo basico del tablero" : "Basic board mode"}</strong>
                  <small>{isSpanish ? "Reducir el tablero a las columnas operativas esenciales." : "Reduce the board to the essential operational columns."}</small>
                </button>
                <button data-testid="command-palette-action-shortcuts" onClick={() => { onOpenShortcutHelp(); onClose(); }}>
                  <strong>{isSpanish ? "Atajos de teclado" : "Keyboard shortcuts"}</strong>
                  <small>{isSpanish ? "Abrir la hoja rapida de atajos del tablero." : "Open the board shortcut cheat sheet."}</small>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="palette-results">
            {results.workspaces.map((action) => (
              <button
                key={action.id}
                data-testid={`command-palette-result-${action.id}`}
                onClick={() => {
                  onNavigate(action.view);
                  onClose();
                }}
              >
                <strong>{action.label}</strong>
                <small>{action.groupLabel} {isSpanish ? "espacio de trabajo" : "workspace"} / {action.description}</small>
              </button>
            ))}
            {results.items.map((item) => <button key={item.id} onClick={() => { onOpenItem(item.id); onClose(); }}><strong>{displayUnitNumber(item.property.code, item.unitNumber)}</strong><small>{isSpanish ? "Unidad" : "Unit"} / {item.property.name}</small></button>)}
            {results.views.map((view) => <button key={view.id} onClick={() => { onLoadView(view); onClose(); }}><strong>{view.name}</strong><small>{isSpanish ? "Vista guardada" : "Saved view"} / {view.viewType}</small></button>)}
            {results.properties.map((property) => <div key={property.id}><strong>{property.code} / {property.name}</strong><small>{isSpanish ? "Propiedad" : "Property"}</small></div>)}
            {results.people.map((person) => <div key={person.id}><strong>{person.fullName}</strong><small>{isSpanish ? "Personal" : "Staff"} / {person.role}</small></div>)}
            {results.floorPlans.map((plan) => <div key={plan.id}><strong>{floorPlanLabel(plan)}</strong><small>{isSpanish ? "Plano" : "Floor plan"}</small></div>)}
            {!Object.values(results).some((entries) => entries.length) ? <p className="empty-copy">{isSpanish ? "No hay registros operativos coincidentes." : "No matching operational records."}</p> : null}
          </div>
        )}
        <footer>{isSpanish ? "Ctrl/Command + K para abrir / Escape para cerrar" : "Ctrl/Command + K to open / Escape to close"}</footer>
      </section>
    </>
  );
}
