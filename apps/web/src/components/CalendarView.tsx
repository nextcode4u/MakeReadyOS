import { useMemo, useState } from "react";
import type { LabelDefinition, ScheduleTrack } from "../lib/api";
import { LabelPill } from "./LabelPill";
import { StatusState } from "./StatusState";

export type CalendarEvent = {
  id: string;
  unitNumber: string;
  boardGroup: string;
  propertyCode: string;
  date: string;
  moveInSoon: boolean;
  overdue: boolean;
  trackLabel: string;
  statusField: string;
  statusValue: string | null;
  colorBasis: ScheduleTrack["colorBasis"];
  fixedColor: string | null;
  customColor: string | null;
  customColorLabel: string | null;
  riskLevel?: string;
};

type Layout = "single" | "split" | "grid" | "auto";
type Props = {
  eventsByTrack: Record<string, CalendarEvent[]>;
  labelsByField: Record<string, Record<string, LabelDefinition>>;
  fieldOptions: ScheduleTrack[];
  layout: Layout;
  selectedFields: string[];
  onLayoutChange: (value: Layout) => void;
  onFieldChange: (index: number, value: string) => void;
  onOpenItem: (id: string) => void;
};

function buildMonthGrid(referenceDate: Date) {
  const first = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const start = new Date(first);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return Array.from({ length: 35 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function colorDescription(track?: ScheduleTrack) {
  if (track?.colorBasis === "STATUS") return `${track.displayName} status colors`;
  if (track?.colorBasis === "SCOPE") return "Scope level colors";
  if (track?.colorBasis === "FIXED") return "Fixed track color";
  if (track?.colorBasis === "FIELD") return "Configured field option colors";
  return "Neutral track color";
}

function eventLabel(event: CalendarEvent, labelsByField: Props["labelsByField"]): LabelDefinition | undefined {
  if (event.overdue) return { id: "overdue", fieldKey: "", value: "OVERDUE", color: "#e86a7f", textColor: "#2d0912", sortOrder: 0 };
  if (event.riskLevel === "CRITICAL" || event.riskLevel === "HIGH") return { id: `risk-${event.riskLevel}`, fieldKey: "", value: `${event.riskLevel} RISK`, color: "#e86a7f", textColor: "#2d0912", sortOrder: 0 };
  if (event.moveInSoon) return { id: "soon", fieldKey: "", value: "MOVE-IN SOON", color: "#ffc673", textColor: "#3a1f00", sortOrder: 0 };
  if (event.colorBasis === "FIXED" && event.fixedColor) return { id: "fixed", fieldKey: "", value: event.trackLabel, color: event.fixedColor, textColor: "#ffffff", sortOrder: 0 };
  if (event.colorBasis === "FIELD" && event.customColor) return { id: "field", fieldKey: "", value: event.customColorLabel ?? event.trackLabel, color: event.customColor, textColor: "#ffffff", sortOrder: 0 };
  return event.statusValue ? labelsByField[event.statusField]?.[event.statusValue] : undefined;
}

function CalendarPanel({ track, events, labelsByField, month, onMonthChange, index, options, onTrackChange, onOpenItem }: {
  track?: ScheduleTrack; events: CalendarEvent[]; labelsByField: Props["labelsByField"]; month: Date;
  onMonthChange: (value: Date) => void; index: number; options: ScheduleTrack[]; onTrackChange: (value: string) => void; onOpenItem: (id: string) => void;
}) {
  const grid = useMemo(() => buildMonthGrid(month), [month]);
  const byDay = useMemo(() => events.reduce<Record<string, CalendarEvent[]>>((result, event) => {
    const key = new Date(event.date).toISOString().slice(0, 10);
    result[key] ??= [];
    result[key].push(event);
    return result;
  }, {}), [events]);
  const legendEntries = useMemo(() => {
    const entries = new Map<string, LabelDefinition>();
    events.forEach((event) => {
      const label = eventLabel(event, labelsByField);
      if (label) entries.set(`${label.value}:${label.color}`, label);
    });
    return Array.from(entries.values());
  }, [events, labelsByField]);
  if (!track) return <StatusState title="Select a schedule track" description="Configure an active date track in Setup to populate this calendar." tone="subtle" />;
  return (
    <section className="calendar-panel" data-testid={`calendar-panel-${index}`}>
      <div className="calendar-toolbar">
        <select data-testid={`calendar-panel-track-${index}`} value={track.id} onChange={(event) => onTrackChange(event.target.value)} aria-label={`Schedule track for panel ${index + 1}`}>
          {options.map((option) => <option key={option.id} value={option.id}>{option.displayName}</option>)}
        </select>
        <div className="calendar-nav">
          <button className="tab" onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>Prev</button>
          <strong>{month.toLocaleString("en-US", { month: "long", year: "numeric" })}</strong>
          <button className="tab" onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>Next</button>
        </div>
      </div>
      <div className="calendar-legend" data-testid={`calendar-legend-${index}`}>
        <strong>{track.displayName}</strong>
        <span data-testid={`calendar-color-source-${index}`}>{colorDescription(track)}</span>
        <div className="calendar-legend-items">
          {legendEntries.length ? legendEntries.map((entry) => (
            <span key={`${entry.value}-${entry.color}`}><i className="legend-swatch" style={{ backgroundColor: entry.color }} />{entry.value}</span>
          )) : <span>Events will show configured status and risk colors when scheduled items exist.</span>}
        </div>
      </div>
      <div className="calendar-grid">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <div className="calendar-dow" key={day}>{day}</div>)}
        {grid.map((day) => {
          const key = day.toISOString().slice(0, 10);
          return (
            <div className={day.getMonth() === month.getMonth() ? "calendar-day" : "calendar-day dim"} key={key}>
              <div className="calendar-date">{day.getDate()}</div>
              <div className="calendar-events">
                {(byDay[key] ?? []).map((event) => (
                  <button type="button" className="calendar-event" data-testid={`calendar-event-${event.id}`} onClick={() => onOpenItem(event.id)} key={`${track.id}-${event.id}`} aria-label={`Open details for ${event.propertyCode} ${event.unitNumber}`}>
                    <LabelPill value={event.unitNumber} label={eventLabel(event, labelsByField)} />
                    <small className="calendar-event-context">{event.riskLevel && event.riskLevel !== "NONE" ? `${event.riskLevel} risk` : event.overdue ? "Overdue" : event.moveInSoon ? "Move-in soon" : event.customColorLabel || event.statusValue || event.trackLabel}</small>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {!events.length ? <StatusState title="No scheduled items in this track" description="Try another track or widen the active filters." tone="subtle" /> : null}
    </section>
  );
}

export function CalendarView({ eventsByTrack, labelsByField, fieldOptions, layout, selectedFields, onLayoutChange, onFieldChange, onOpenItem }: Props) {
  const [month, setMonth] = useState(() => new Date("2026-05-01T12:00:00Z"));
  const count = layout === "single" ? 1 : layout === "split" ? 2 : 4;
  return (
    <section className={`calendar-shell calendar-layout-${layout}`} data-testid="calendar-view">
      <div className="schedule-layout-toolbar">
        <strong>Schedule Layout</strong>
        <select data-testid="calendar-layout-select" value={layout} onChange={(event) => onLayoutChange(event.target.value as Layout)}>
          <option value="single">1 calendar</option><option value="split">2 calendar split</option><option value="grid">4 calendar grid</option><option value="auto">Auto responsive</option>
        </select>
      </div>
      <div className="calendar-panels">
        {Array.from({ length: count }, (_, index) => {
          const id = selectedFields[index] ?? fieldOptions[index]?.id ?? fieldOptions[0]?.id;
          const track = fieldOptions.find((option) => option.id === id) ?? fieldOptions[0];
          return <CalendarPanel key={index} index={index} track={track} options={fieldOptions} events={track ? eventsByTrack[track.id] ?? [] : []} labelsByField={labelsByField} month={month} onMonthChange={setMonth} onTrackChange={(value) => onFieldChange(index, value)} onOpenItem={onOpenItem} />;
        })}
      </div>
    </section>
  );
}
