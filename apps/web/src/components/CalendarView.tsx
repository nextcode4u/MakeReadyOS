import { useMemo, useState } from "react";
import type { LabelDefinition, ScheduleTrack, UserLanguage } from "../lib/api";
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
  language: UserLanguage;
  selectedFields: string[];
  onLayoutChange: (value: Layout) => void;
  onFieldChange: (index: number, value: string) => void;
  onOpenItem: (id: string) => void;
};

function buildMonthGrid(referenceDate: Date) {
  const first = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const start = new Date(first);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function colorDescription(track: ScheduleTrack | undefined, isSpanish: boolean) {
  if (track?.colorBasis === "STATUS") return isSpanish ? `Colores de estado de ${track.displayName}` : `${track.displayName} status colors`;
  if (track?.colorBasis === "SCOPE") return isSpanish ? "Colores por nivel de alcance" : "Scope level colors";
  if (track?.colorBasis === "FIXED") return isSpanish ? "Color fijo de la pista" : "Fixed track color";
  if (track?.colorBasis === "FIELD") return isSpanish ? "Colores configurados de opciones del campo" : "Configured field option colors";
  return isSpanish ? "Color neutral de la pista" : "Neutral track color";
}

function eventLabel(event: CalendarEvent, labelsByField: Props["labelsByField"]): LabelDefinition | undefined {
  if (event.overdue) return { id: "overdue", fieldKey: "", value: "OVERDUE", color: "#e86a7f", textColor: "#2d0912", sortOrder: 0 };
  if (event.riskLevel === "CRITICAL" || event.riskLevel === "HIGH") return { id: `risk-${event.riskLevel}`, fieldKey: "", value: `${event.riskLevel} RISK`, color: "#e86a7f", textColor: "#2d0912", sortOrder: 0 };
  if (event.moveInSoon) return { id: "soon", fieldKey: "", value: "MOVE-IN SOON", color: "#ffc673", textColor: "#3a1f00", sortOrder: 0 };
  if (event.colorBasis === "FIXED" && event.fixedColor) return { id: "fixed", fieldKey: "", value: event.trackLabel, color: event.fixedColor, textColor: "#ffffff", sortOrder: 0 };
  if (event.colorBasis === "FIELD" && event.customColor) return { id: "field", fieldKey: "", value: event.customColorLabel ?? event.trackLabel, color: event.customColor, textColor: "#ffffff", sortOrder: 0 };
  return event.statusValue ? labelsByField[event.statusField]?.[event.statusValue] : undefined;
}

function trackGuidance(track: ScheduleTrack, events: CalendarEvent[], isSpanish: boolean) {
  const weekendCount = events.filter((event) => {
    const day = new Date(event.date).getDay();
    return day === 0 || day === 6;
  }).length;
  const highRiskCount = events.filter((event) => event.riskLevel === "HIGH" || event.riskLevel === "CRITICAL").length;
  const crowdedDays = Object.values(events.reduce<Record<string, number>>((result, event) => {
    result[event.date] = (result[event.date] ?? 0) + 1;
    return result;
  }, {})).filter((count) => count >= 3).length;
  const riskCues = [
    track.overdueEnabled ? (isSpanish ? "atrasado" : "overdue") : null,
    track.moveInSoonEnabled ? (isSpanish ? "mudanza proxima" : "move-in soon") : null,
  ].filter(Boolean).join(isSpanish ? " y " : " and ") || (isSpanish ? "revision manual" : "manual review");
  const warnings = [
    weekendCount ? (isSpanish ? `${weekendCount} elemento${weekendCount === 1 ? "" : "s"} de fin de semana` : `${weekendCount} weekend item${weekendCount === 1 ? "" : "s"}`) : null,
    crowdedDays ? (isSpanish ? `${crowdedDays} dia${crowdedDays === 1 ? "" : "s"} cargado${crowdedDays === 1 ? "" : "s"} con 3+ elementos` : `${crowdedDays} crowded day${crowdedDays === 1 ? "" : "s"} with 3+ items`) : null,
    highRiskCount ? (isSpanish ? `${highRiskCount} elemento${highRiskCount === 1 ? "" : "s"} de alto riesgo` : `${highRiskCount} high-risk item${highRiskCount === 1 ? "" : "s"}`) : null,
  ].filter(Boolean);

  return {
    riskCues,
    warnings,
  };
}

function dayConflictBadges(day: Date, events: CalendarEvent[], isSpanish: boolean) {
  if (!events.length) return [];
  const dayOfWeek = day.getDay();
  return [
    dayOfWeek === 0 || dayOfWeek === 6 ? (isSpanish ? "Fin de semana" : "Weekend") : null,
    dayOfWeek === 1 || dayOfWeek === 5 ? (isSpanish ? "Lun/Vie" : "Mon/Fri") : null,
    events.length >= 3 ? (isSpanish ? `${events.length} programados` : `${events.length} scheduled`) : null,
    events.some((event) => event.riskLevel === "HIGH" || event.riskLevel === "CRITICAL") ? (isSpanish ? "Alto riesgo" : "High risk") : null,
    events.some((event) => event.overdue) ? (isSpanish ? "Atrasado" : "Overdue") : null,
  ].filter(Boolean) as string[];
}

function CalendarPanel({ track, events, labelsByField, month, onMonthChange, index, options, onTrackChange, onOpenItem, language }: {
  track?: ScheduleTrack; events: CalendarEvent[]; labelsByField: Props["labelsByField"]; month: Date;
  onMonthChange: (value: Date) => void; index: number; options: ScheduleTrack[]; onTrackChange: (value: string) => void; onOpenItem: (id: string) => void; language: UserLanguage;
}) {
  const isSpanish = language === "es";
  const grid = useMemo(() => buildMonthGrid(month), [month]);
  const todayKey = dateKey(new Date());
  const byDay = useMemo(() => events.reduce<Record<string, CalendarEvent[]>>((result, event) => {
    const key = dateKey(new Date(event.date));
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
  const guidance = useMemo(() => track ? trackGuidance(track, events, isSpanish) : null, [track, events, isSpanish]);
  if (!track) return <StatusState title={isSpanish ? "Seleccione una pista de programacion" : "Select a schedule track"} description={isSpanish ? "Configure una pista de fecha activa en Configuracion para llenar este calendario." : "Configure an active date track in Setup to populate this calendar."} tone="subtle" />;
  return (
    <section className="calendar-panel" data-testid={`calendar-panel-${index}`}>
      <div className="calendar-toolbar">
        <select data-testid={`calendar-panel-track-${index}`} value={track.id} onChange={(event) => onTrackChange(event.target.value)} aria-label={isSpanish ? `Pista de programacion para panel ${index + 1}` : `Schedule track for panel ${index + 1}`}>
          {options.map((option) => <option key={option.id} value={option.id}>{option.displayName}</option>)}
        </select>
        <div className="calendar-nav">
          <button className="tab" onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>{isSpanish ? "Anterior" : "Prev"}</button>
          <strong>{month.toLocaleString(isSpanish ? "es-ES" : "en-US", { month: "long", year: "numeric" })}</strong>
          <button className="tab" onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>{isSpanish ? "Siguiente" : "Next"}</button>
        </div>
      </div>
      <div className="calendar-legend" data-testid={`calendar-legend-${index}`}>
        <strong>{track.displayName}</strong>
        <span data-testid={`calendar-color-source-${index}`}>{colorDescription(track, isSpanish)}</span>
        <div className="calendar-legend-items">
          {legendEntries.length ? legendEntries.map((entry) => (
            <span key={`${entry.value}-${entry.color}`}><i className="legend-swatch" style={{ backgroundColor: entry.color }} />{entry.value}</span>
          )) : <span>{isSpanish ? "Los eventos mostraran los colores configurados de estado y riesgo cuando existan elementos programados." : "Events will show configured status and risk colors when scheduled items exist."}</span>}
        </div>
        {guidance ? (
          <div className={guidance.warnings.length ? "calendar-track-guidance warning" : "calendar-track-guidance"} data-testid={`calendar-track-guidance-${index}`}>
            <span><strong>{isSpanish ? "Indicadores de riesgo:" : "Risk cues:"}</strong> {guidance.riskCues}</span>
            <span><strong>{isSpanish ? "Compatibilidad:" : "Compatibility:"}</strong> {guidance.warnings.length ? guidance.warnings.join(" / ") : (isSpanish ? "No hay conflictos de fin de semana, dias saturados ni alto riesgo en el mes filtrado actual." : "No weekend, crowded-day, or high-risk conflicts in the current filtered month.")}</span>
          </div>
        ) : null}
      </div>
      <div className="calendar-grid">
        {(isSpanish ? ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]).map((day) => <div className="calendar-dow" key={day}>{day}</div>)}
        {grid.map((day) => {
          const key = dateKey(day);
          const isOutsideMonth = day.getMonth() !== month.getMonth();
          const isPast = key < todayKey;
          const isToday = key === todayKey;
          const dayEvents = byDay[key] ?? [];
          const classes = [
            "calendar-day",
            isOutsideMonth ? "dim" : "",
            isPast ? "past" : "",
            isToday ? "today" : "",
            dayEvents.length ? "has-events" : "",
          ].filter(Boolean).join(" ");
          const dayState = isToday ? (isSpanish ? "Hoy" : "Today") : isPast ? (isSpanish ? "Dia pasado" : "Past day") : (isSpanish ? "Proximo dia" : "Upcoming day");
          const conflictBadges = dayConflictBadges(day, dayEvents, isSpanish);
          return (
            <div
              className={classes}
              key={key}
              data-testid={isToday ? "calendar-today" : isPast ? "calendar-past-day" : undefined}
              aria-label={`${dayState}, ${day.toLocaleDateString(isSpanish ? "es-ES" : "en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}`}
            >
              <div className="calendar-date">{isToday ? <span>{isSpanish ? "Hoy" : "Today"}</span> : null}{day.getDate()}</div>
              {conflictBadges.length ? (
                <div className="calendar-day-conflicts" data-testid={`calendar-day-conflicts-${key}`} aria-label={isSpanish ? `Advertencias de programacion para ${key}: ${conflictBadges.join(", ")}` : `Schedule warnings for ${key}: ${conflictBadges.join(", ")}`}>
                  {conflictBadges.map((badge) => <span key={badge}>{badge}</span>)}
                </div>
              ) : null}
              <div className="calendar-events">
                {dayEvents.map((event) => (
                  <button type="button" className="calendar-event" data-testid={`calendar-event-${event.id}`} onClick={() => onOpenItem(event.id)} key={`${track.id}-${event.id}`} aria-label={isSpanish ? `Abrir detalles para ${event.propertyCode} ${event.unitNumber}` : `Open details for ${event.propertyCode} ${event.unitNumber}`}>
                    <LabelPill value={event.unitNumber} label={eventLabel(event, labelsByField)} />
                    <small className="calendar-event-context">{event.riskLevel && event.riskLevel !== "NONE" ? (isSpanish ? `Riesgo ${event.riskLevel}` : `${event.riskLevel} risk`) : event.overdue ? (isSpanish ? "Atrasado" : "Overdue") : event.moveInSoon ? (isSpanish ? "Mudanza proxima" : "Move-in soon") : event.customColorLabel || event.statusValue || event.trackLabel}</small>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {!events.length ? <StatusState title={isSpanish ? "No hay elementos programados en esta pista" : "No scheduled items in this track"} description={isSpanish ? "Pruebe otra pista o amplie los filtros activos." : "Try another track or widen the active filters."} tone="subtle" /> : null}
    </section>
  );
}

export function CalendarView({ eventsByTrack, labelsByField, fieldOptions, layout, language, selectedFields, onLayoutChange, onFieldChange, onOpenItem }: Props) {
  const isSpanish = language === "es";
  const [month, setMonth] = useState(() => new Date("2026-05-01T12:00:00Z"));
  const count = layout === "single" ? 1 : layout === "split" ? 2 : 4;
  return (
    <section className={`calendar-shell calendar-layout-${layout}`} data-testid="calendar-view">
      <div className="schedule-layout-toolbar">
        <strong>{isSpanish ? "Diseno de calendario" : "Schedule Layout"}</strong>
        <select data-testid="calendar-layout-select" value={layout} onChange={(event) => onLayoutChange(event.target.value as Layout)}>
          <option value="single">{isSpanish ? "1 calendario" : "1 calendar"}</option><option value="split">{isSpanish ? "2 calendarios divididos" : "2 calendar split"}</option><option value="grid">{isSpanish ? "Cuadricula de 4 calendarios" : "4 calendar grid"}</option><option value="auto">{isSpanish ? "Auto adaptable" : "Auto responsive"}</option>
        </select>
      </div>
      <div className="calendar-panels">
        {Array.from({ length: count }, (_, index) => {
          const id = selectedFields[index] ?? fieldOptions[index]?.id ?? fieldOptions[0]?.id;
          const track = fieldOptions.find((option) => option.id === id) ?? fieldOptions[0];
          return <CalendarPanel key={index} index={index} track={track} options={fieldOptions} events={track ? eventsByTrack[track.id] ?? [] : []} labelsByField={labelsByField} month={month} onMonthChange={setMonth} onTrackChange={(value) => onFieldChange(index, value)} onOpenItem={onOpenItem} language={language} />;
        })}
      </div>
    </section>
  );
}
