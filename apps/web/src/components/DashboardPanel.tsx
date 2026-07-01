import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { type AssignedWorkResponse, type UserLanguage, getAnalyticsSnapshots, getPropertyWikiOverview, type AnalyticsSummaryResponse, type DashboardResponse } from "../lib/api";
import { displayUnitNumber } from "../lib/board";
import { formatDateTime } from "../lib/dateTime";
import { t, tWithVars } from "../lib/i18n";
import { openWikiRecord } from "../lib/wikiNavigation";
import { StatusState } from "./StatusState";

type Props = {
  data?: DashboardResponse;
  analytics?: AnalyticsSummaryResponse;
  loading: boolean;
  analyticsLoading: boolean;
  error: boolean;
  onOpenItem: (id: string) => void;
  onDrillDown: (filter: { type: "kpi" | "vacancy" | "scope" | "tech" | "property" | "risk"; value: string }) => void;
  onOpenPond: () => void;
  layout: "overview" | "focus";
  onLayoutChange: (layout: "overview" | "focus") => void;
  propertyId?: string;
  language: UserLanguage;
  assignedWork?: AssignedWorkResponse;
  showAssignedWork: boolean;
  onOpenAssignedWork: () => void;
};

function kpiLabels(isSpanish: boolean): Record<string, string> {
  return {
    active: isSpanish ? "Rotaciones activas" : "Active Turns",
    vacant: isSpanish ? "Vacantes" : "Vacant",
    vacantLeased: isSpanish ? "Vacante arrendada" : "Vacant Leased",
    ntv: "NTV",
    downUnits: isSpanish ? "Unidades fuera de servicio" : "Down Units",
    readyUnits: isSpanish ? "Unidades listas" : "Ready Units",
    archived: isSpanish ? "Archivadas" : "Archived",
    moveInsThisWeek: isSpanish ? "Mudanzas esta semana" : "Move-Ins This Week",
    moveInsNext7Days: isSpanish ? "Mudanzas / 7 dias" : "Move-Ins / 7 Days",
    moveInsNext14Days: isSpanish ? "Mudanzas / 14 dias" : "Move-Ins / 14 Days",
    overdue: isSpanish ? "Atrasadas" : "Overdue",
    averageDaysVacant: isSpanish ? "Prom. dias vacante" : "Avg Days Vacant",
    missingTech: isSpanish ? "Sin asignar" : "Unassigned",
    missingCriticalDates: isSpanish ? "Faltan fechas" : "Missing Dates",
    pestIssues: isSpanish ? "Problemas de plagas" : "Pest Issues",
    flooringNeeds: isSpanish ? "Piso pendiente" : "Flooring Needed",
    paintNeeds: isSpanish ? "Pintura pendiente" : "Paint Needed",
    moveInRisk: isSpanish ? "Riesgo de mudanza" : "Move-In Risk",
    riskCritical: isSpanish ? "Riesgo critico" : "Critical Risk",
    riskHigh: isSpanish ? "Riesgo alto" : "High Risk",
    agingTurns: isSpanish ? "Rotaciones envejecidas" : "Aging Turns",
    vendorScheduledThisWeek: isSpanish ? "Proveedor esta semana" : "Vendor Work This Week",
    vendorOverdue: isSpanish ? "Proveedor atrasado" : "Vendor Overdue",
    vendorFollowUpNeeded: isSpanish ? "Seguimiento a proveedor" : "Vendor Follow-Up",
    blockedByVendor: isSpanish ? "Bloqueado por proveedor" : "Blocked By Vendor",
    mappedUnits: isSpanish ? "Unidades mapeadas" : "Mapped Units",
    unmappedUnits: isSpanish ? "Unidades sin mapa" : "Unmapped Units",
    highRiskMappedUnits: isSpanish ? "Mapeadas de alto riesgo" : "High-Risk Mapped",
    plannedWorkBlocks: isSpanish ? "Asignaciones planificadas" : "Planned Assignments",
    unplannedMoveIns: isSpanish ? "Mudanzas sin cubrir" : "Move-Ins Not Covered",
    totalUnits: isSpanish ? "Unidades presupuestadas" : "Budgeted Units",
    occupiedUnits: isSpanish ? "Ocupadas fisicamente" : "Physically Occupied",
    occupancyPercent: isSpanish ? "% ocupacion fisica" : "Physical Occupancy %",
    occupancyGoalPercent: isSpanish ? "% meta de ocupacion" : "Occupancy Goal %",
    vacantReadyUnits: isSpanish ? "Stock vacante listo" : "Vacant Ready Stock",
    directoryVacantLeased: isSpanish ? "Directorio vacante arrendado" : "Directory Vacant Leased",
    directoryNtv: isSpanish ? "Directorio NTV" : "Directory NTV",
    directoryNtvLeased: isSpanish ? "Directorio NTV arrendado" : "Directory NTV Leased",
    readyStock: isSpanish ? "Stock listo" : "Ready Stock",
  };
}

function Breakdown({ title, data, type, onDrillDown }: { title: string; data: Record<string, number>; type: "tech" | "property"; onDrillDown: Props["onDrillDown"] }) {
  const largest = Math.max(...Object.values(data), 1);
  const total = Math.max(Object.values(data).reduce((sum, value) => sum + value, 0), 1);
  return (
    <section className="dashboard-chart">
      <h3>{title}</h3>
      {Object.entries(data).map(([label, count]) => (
        <button className="dashboard-bar dashboard-row-action" data-testid={`dashboard-${type}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} key={label} onClick={() => onDrillDown({ type, value: label })}>
          <span>{label}</span>
          <i style={{ width: `${(count / largest) * 100}%` }} />
          <strong>{count} <small>{Math.round((count / total) * 100)}%</small></strong>
        </button>
      ))}
    </section>
  );
}

const chartColors = ["var(--accent)", "var(--success)", "var(--warning)", "var(--danger)", "#a477e8", "#30a8b4"];
function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function csvCell(value: string | number | null | undefined) {
  const text = value == null ? "" : String(value);
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, "\"\"")}"`;
}

const analyticsWindowOptions = [7, 30, 90, 180] as const;
const analyticsMetricOptions = ["overdue", "highRisk", "activeTurns", "averageDaysVacant", "completedTurnsCount"] as const;
type AnalyticsComparisonMetric = typeof analyticsMetricOptions[number];

function addDays(input: Date, days: number) {
  const date = new Date(input);
  date.setDate(date.getDate() + days);
  return date;
}

function metricLabel(metric: AnalyticsComparisonMetric, isSpanish: boolean) {
  switch (metric) {
    case "overdue":
      return isSpanish ? "Atrasadas" : "Overdue";
    case "highRisk":
      return isSpanish ? "Alto riesgo" : "High risk";
    case "activeTurns":
      return isSpanish ? "Rotaciones activas" : "Active turns";
    case "averageDaysVacant":
      return isSpanish ? "Prom. dias vacante" : "Avg vacant days";
    case "completedTurnsCount":
      return isSpanish ? "Completadas" : "Completed turns";
    default:
      return metric;
  }
}

function formatMetricValue(metric: AnalyticsComparisonMetric, value: number, isSpanish: boolean) {
  if (metric === "averageDaysVacant") return value.toFixed(1);
  if (metric === "completedTurnsCount") return `${Math.round(value)}${isSpanish ? " rot." : ""}`;
  return String(Math.round(value));
}

function formatMetricDelta(metric: AnalyticsComparisonMetric, value: number, isSpanish: boolean) {
  const formatted = metric === "averageDaysVacant" ? Math.abs(value).toFixed(1) : String(Math.abs(Math.round(value)));
  const sign = value > 0 ? "+" : value < 0 ? "-" : "±";
  if (value === 0) return `${sign}0`;
  if (metric === "completedTurnsCount") return `${sign}${formatted}${isSpanish ? " rot." : ""}`;
  return `${sign}${formatted}`;
}

function recurringSignalSummary(entry: AnalyticsSummaryResponse["recurringProblemUnits"][number], isSpanish: boolean) {
  const labels = [
    entry.signals.highRiskTurns ? `${entry.signals.highRiskTurns} ${isSpanish ? "alto riesgo" : "high risk"}` : null,
    entry.signals.pestTurns ? `${entry.signals.pestTurns} ${isSpanish ? "plagas" : "pest"}` : null,
    entry.signals.flooringTurns ? `${entry.signals.flooringTurns} ${isSpanish ? "pisos" : "flooring"}` : null,
    entry.signals.paintTurns ? `${entry.signals.paintTurns} ${isSpanish ? "pintura" : "paint"}` : null,
    entry.signals.vendorTurns ? `${entry.signals.vendorTurns} ${isSpanish ? "proveedor" : "vendor"}` : null,
  ].filter(Boolean);
  return labels.slice(0, 3).join(" • ");
}

function ThroughputSection({ data, isSpanish, onDrillDown }: { data: AnalyticsSummaryResponse; isSpanish: boolean; onDrillDown: Props["onDrillDown"] }) {
  if (!data.technicianThroughput.length && !data.vendorThroughput.length) return null;
  return (
    <div className="analytics-throughput">
      <div className="drawer-section-title">
        <h4>{isSpanish ? "Rendimiento operativo" : "Operational Throughput"}</h4>
        <span className="muted">{isSpanish ? "Tecnicos y proveedores con mayor actividad" : "Top technician and vendor activity"}</span>
      </div>
      <div className="analytics-throughput-grid">
        <section className="analytics-throughput-panel">
          <div className="drawer-section-title">
            <h5>{isSpanish ? "Tecnicos" : "Technicians"}</h5>
            <span className="muted">{isSpanish ? "Rotaciones cerradas y carga actual" : "Closed turns and current load"}</span>
          </div>
          <div className="analytics-throughput-table">
            <div className="analytics-throughput-row analytics-throughput-head">
              <span>{isSpanish ? "Tecnico" : "Tech"}</span>
              <span>{isSpanish ? "Cierres" : "Closed"}</span>
              <span>{isSpanish ? "Activas" : "Active"}</span>
              <span>{isSpanish ? "Prom. dias" : "Avg days"}</span>
            </div>
            {data.technicianThroughput.slice(0, 8).map((entry) => (
              <button key={entry.name} type="button" className="analytics-throughput-row analytics-throughput-action" onClick={() => onDrillDown({ type: "tech", value: entry.name })}>
                <strong>{entry.name}</strong>
                <span>{entry.completedTurns}</span>
                <span>{entry.activeCount}{entry.overdueCount ? ` / ${entry.overdueCount}${isSpanish ? " atr." : " od"}` : ""}</span>
                <span>{entry.averageTurnDuration != null ? `${entry.averageTurnDuration}${isSpanish ? " d" : "d"}` : "—"}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="analytics-throughput-panel">
          <div className="drawer-section-title">
            <h5>{isSpanish ? "Proveedores" : "Vendors"}</h5>
            <span className="muted">{isSpanish ? "Asignaciones completadas y abiertas" : "Completed and open assignments"}</span>
          </div>
          <div className="analytics-throughput-table">
            <div className="analytics-throughput-row analytics-throughput-head">
              <span>{isSpanish ? "Proveedor" : "Vendor"}</span>
              <span>{isSpanish ? "Complet." : "Done"}</span>
              <span>{isSpanish ? "Abiertas" : "Open"}</span>
              <span>{isSpanish ? "Prom. dias" : "Avg days"}</span>
            </div>
            {data.vendorThroughput.slice(0, 8).map((entry) => (
              <div key={entry.vendorId} className="analytics-throughput-row">
                <strong>{entry.vendorName}<small>{entry.trade}</small></strong>
                <span>{entry.completedAssignments}</span>
                <span>{entry.activeAssignments}{entry.overdueAssignments ? ` / ${entry.overdueAssignments}${isSpanish ? " atr." : " od"}` : ""}</span>
                <span>{entry.averageCompletionDays != null ? `${entry.averageCompletionDays}${isSpanish ? " d" : "d"}` : "—"}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function SlaMissSection({ data, isSpanish, onDrillDown }: { data: AnalyticsSummaryResponse; isSpanish: boolean; onDrillDown: Props["onDrillDown"] }) {
  if (!data.slaMissByScope.length) return null;
  return (
    <div className="analytics-throughput">
      <div className="drawer-section-title">
        <h4>{isSpanish ? "Incumplimientos por alcance" : "SLA Misses By Scope"}</h4>
        <span className="muted">{isSpanish ? "Donde mas se atrasan los cierres" : "Where ready dates miss most often"}</span>
      </div>
      <div className="analytics-throughput-table">
        <div className="analytics-throughput-row analytics-throughput-head">
          <span>{isSpanish ? "Alcance" : "Scope"}</span>
          <span>{isSpanish ? "Misses" : "Misses"}</span>
          <span>{isSpanish ? "Prom. tarde" : "Avg late"}</span>
          <span>{isSpanish ? "Peor" : "Worst"}</span>
        </div>
        {data.slaMissByScope.map((entry) => (
          <button key={entry.scopeLevel} type="button" className="analytics-throughput-row analytics-throughput-action" onClick={() => onDrillDown({ type: "scope", value: entry.scopeLevel })}>
            <strong>{entry.scopeLevel}</strong>
            <span>{entry.missCount}</span>
            <span>{entry.averageLateDays}{isSpanish ? " d" : "d"}</span>
            <span>{entry.worstLateDays}{isSpanish ? " d" : "d"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Donut({ title, data, type, onDrillDown }: { title: string; data: Record<string, number>; type: "vacancy" | "scope" | "risk"; onDrillDown: Props["onDrillDown"] }) {
  const entries = Object.entries(data).filter(([, count]) => count > 0);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  let offset = 0;
  const stops = entries.map(([, count], index) => {
    const start = offset;
    offset += total ? (count / total) * 100 : 0;
    return `${chartColors[index % chartColors.length]} ${start}% ${offset}%`;
  });
  return (
    <section className="dashboard-chart dashboard-donut-card" data-testid={`dashboard-donut-${title.toLowerCase().replace(/\s/g, "-")}`}>
      <h3>{title}</h3>
      <div className="dashboard-donut-layout">
        <div className="dashboard-donut" style={{ background: total ? `conic-gradient(${stops.join(",")})` : "var(--panel-soft)" }}><strong>{total}</strong></div>
        <div className="dashboard-legend">
          {entries.map(([label, count], index) => <button type="button" data-testid={`dashboard-${type}-${slugify(label)}`} key={label} onClick={() => onDrillDown({ type, value: label })}><i style={{ background: chartColors[index % chartColors.length] }} />{label} <strong>{count} / {Math.round((count / total) * 100)}%</strong></button>)}
        </div>
      </div>
    </section>
  );
}

function sessionDurationLabel(startedAt: string) {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(startedAt).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function RatioStrip({ data, language }: { data: DashboardResponse; language: UserLanguage }) {
  const isSpanish = language === "es";
  const total = Math.max(data.kpis.active ?? 0, 1);
  const values = [
    [isSpanish ? "Listo" : "Ready", data.kpis.readyUnits ?? 0, "var(--success)"],
    [isSpanish ? "Atrasado" : "Overdue", data.kpis.overdue ?? 0, "var(--danger)"],
    [isSpanish ? "Riesgo de mudanza" : "Move-In Risk", data.kpis.moveInRisk ?? 0, "var(--warning)"],
    [isSpanish ? "Sin asignar" : "Unassigned", data.kpis.missingTech ?? 0, "var(--accent)"],
  ] as const;
  return (
    <section className="dashboard-ratio" data-testid="dashboard-readiness-ratios">
      <h3>{isSpanish ? "Ratios de estado" : "Readiness Ratios"}</h3>
      <div className="ratio-track">{values.map(([label, count, color]) => <i key={label} title={`${label}: ${count}`} style={{ width: `${(count / total) * 100}%`, background: color }} />)}</div>
      <div className="dashboard-legend">{values.map(([label, count, color]) => <span key={label}><i style={{ background: color }} />{label} <strong>{Math.round((count / total) * 100)}%</strong></span>)}</div>
    </section>
  );
}

function AnalyticsPanel({ data, loading, propertyId, language, onDrillDown, onOpenItem }: { data?: AnalyticsSummaryResponse; loading: boolean; propertyId?: string; language: UserLanguage; onDrillDown: Props["onDrillDown"]; onOpenItem: Props["onOpenItem"] }) {
  const isSpanish = language === "es";
  const [comparisonWindowDays, setComparisonWindowDays] = useState<typeof analyticsWindowOptions[number]>(30);
  const [comparisonMetric, setComparisonMetric] = useState<AnalyticsComparisonMetric>("overdue");
  const snapshotsQuery = useQuery({
    queryKey: ["analytics", "snapshots", propertyId ?? "__all__"],
    queryFn: () => getAnalyticsSnapshots({ propertyId, limit: 180 }),
  });
  if (loading) return <section className="dashboard-chart" data-testid="analytics-panel"><h3>{isSpanish ? "Analitica historica" : "Historical Analytics"}</h3><p className="muted">{isSpanish ? "Cargando analitica basada en snapshots..." : "Loading snapshot-backed analytics..."}</p></section>;
  if (!data) return <section className="dashboard-chart" data-testid="analytics-panel"><h3>{isSpanish ? "Analitica historica" : "Historical Analytics"}</h3><p className="muted">{isSpanish ? "La analitica no esta disponible para este alcance." : "Analytics are unavailable for this scope."}</p></section>;
  const trendTotal = Math.max(...data.trends.map((entry) => entry.highRisk + entry.overdue), 1);
  const propertyRows = Object.entries(data.propertyComparison)
    .map(([code, values]) => ({ code, ...values }))
    .sort((left, right) => right.active - left.active || right.highRisk - left.highRisk || left.code.localeCompare(right.code));
  const snapshots = snapshotsQuery.data?.snapshots ?? [];
  const comparisonSummary = useMemo(() => {
    if (!snapshots.length) return null;
    const cutoff = addDays(new Date(), -(comparisonWindowDays - 1));
    const filtered = snapshots
      .filter((snapshot) => new Date(snapshot.date) >= cutoff)
      .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());
    if (!filtered.length) return null;
    const grouped = new Map<string, typeof filtered>();
    for (const snapshot of filtered) {
      grouped.set(snapshot.property.code, [...(grouped.get(snapshot.property.code) ?? []), snapshot]);
    }
    const metricRows = Array.from(grouped.entries()).flatMap(([code, history]) => {
      const start = history[0];
      const latest = history[history.length - 1];
      const startValue = start[comparisonMetric];
      const latestValue = latest[comparisonMetric];
      if (typeof startValue !== "number" || typeof latestValue !== "number") return [];
      const delta = latestValue - startValue;
      return [{
        code,
        propertyId: latest.propertyId,
        propertyName: latest.property.name,
        startDate: start.date,
        latestDate: latest.date,
        startValue,
        latestValue,
        delta,
      }];
    });
    const aggregateForDate = (date: string) => {
      const onDate = filtered.filter((snapshot) => snapshot.date === date);
      if (!onDate.length) return 0;
      if (comparisonMetric === "averageDaysVacant") {
        const activeTotal = onDate.reduce((sum, snapshot) => sum + snapshot.activeTurns, 0);
        if (!activeTotal) return 0;
        return onDate.reduce((sum, snapshot) => sum + (snapshot.averageDaysVacant * snapshot.activeTurns), 0) / activeTotal;
      }
      return onDate.reduce((sum, snapshot) => sum + snapshot[comparisonMetric], 0);
    };
    const startDate = filtered[0].date;
    const latestDate = filtered[filtered.length - 1].date;
    const portfolioStartValue = aggregateForDate(startDate);
    const portfolioLatestValue = aggregateForDate(latestDate);
    const sortedByDelta = [...metricRows].sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta) || right.delta - left.delta || left.code.localeCompare(right.code));
    const largestIncrease = [...metricRows].sort((left, right) => right.delta - left.delta || left.code.localeCompare(right.code))[0] ?? null;
    const largestDecrease = [...metricRows].sort((left, right) => left.delta - right.delta || left.code.localeCompare(right.code))[0] ?? null;
    return {
      startDate,
      latestDate,
      rows: sortedByDelta,
      portfolioStartValue,
      portfolioLatestValue,
      portfolioDelta: portfolioLatestValue - portfolioStartValue,
      largestIncrease,
      largestDecrease,
    };
  }, [comparisonMetric, comparisonWindowDays, snapshots]);
  const snapshotCsv = [
    ["date", "property", "active_turns", "vacant", "ntv", "ready", "down", "overdue", "high_risk", "avg_days_vacant", "move_ins_next_7_days", "completed_turns"],
    ...snapshots.map((snapshot) => [
      snapshot.date,
      snapshot.property.code,
      snapshot.activeTurns,
      snapshot.vacant,
      snapshot.ntv,
      snapshot.ready,
      snapshot.down,
      snapshot.overdue,
      snapshot.highRisk,
      snapshot.averageDaysVacant,
      snapshot.moveInsNext7Days,
      snapshot.completedTurnsCount,
    ]),
  ].map((row) => row.map((value) => csvCell(value)).join(",")).join("\n");
  const summaryJson = {
    exportedAt: new Date().toISOString(),
    propertyId: propertyId ?? null,
    summary: data,
    snapshots,
  };
  return (
    <section className="dashboard-chart analytics-panel" data-testid="analytics-panel">
      <div className="drawer-section-title">
        <div>
          <h3>{isSpanish ? "Analitica historica" : "Historical Analytics"}</h3>
          <p className="muted">{isSpanish ? "Datos al" : "Data as of"} {formatDateTime(data.generatedAt)}</p>
        </div>
        <div className="analytics-export-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={() => downloadBlob(`makereadyos-analytics-${propertyId ? "property" : "portfolio"}-snapshots.csv`, new Blob([snapshotCsv], { type: "text/csv;charset=utf-8" }))}
            disabled={!snapshots.length}
          >
            {isSpanish ? "Exportar CSV" : "Export CSV"}
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => downloadBlob(`makereadyos-analytics-${propertyId ? "property" : "portfolio"}-summary.json`, new Blob([JSON.stringify(summaryJson, null, 2)], { type: "application/json" }))}
          >
            {isSpanish ? "Exportar JSON" : "Export JSON"}
          </button>
        </div>
      </div>
      <div className="analytics-metrics">
        <span><strong>{data.metrics.averageTurnDuration}</strong> {isSpanish ? "Prom. dias de rotacion" : "Avg turn days"}</span>
        <span><strong>{data.metrics.completedThisWeek}</strong> {isSpanish ? "Completadas esta semana" : "Completed this week"}</span>
        <span><strong>{data.metrics.completedThisMonth}</strong> {isSpanish ? "Completadas este mes" : "Completed this month"}</span>
        <span><strong>{data.metrics.slaMisses}</strong> {isSpanish ? "Incumplimientos de fecha lista" : "Ready-date misses"}</span>
        <span><strong>{data.metrics.staleRiskItems}</strong> {isSpanish ? "Riesgos estancados" : "Stale risk items"}</span>
      </div>
      {comparisonSummary ? (
        <div className="analytics-comparison-wrap">
          <div className="drawer-section-title">
            <div>
              <h4>{isSpanish ? "Comparacion historica" : "Historical Comparison"}</h4>
              <span className="muted">
                {metricLabel(comparisonMetric, isSpanish)} / {comparisonSummary.startDate} {"->"} {comparisonSummary.latestDate}
              </span>
            </div>
            <div className="analytics-comparison-controls">
              <label>
                <span>{isSpanish ? "Ventana" : "Window"}</span>
                <select value={comparisonWindowDays} onChange={(event) => setComparisonWindowDays(Number(event.target.value) as typeof analyticsWindowOptions[number])}>
                  {analyticsWindowOptions.map((days) => (
                    <option key={days} value={days}>{days} {isSpanish ? "dias" : "days"}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>{isSpanish ? "Metrica" : "Metric"}</span>
                <select value={comparisonMetric} onChange={(event) => setComparisonMetric(event.target.value as AnalyticsComparisonMetric)}>
                  {analyticsMetricOptions.map((metric) => (
                    <option key={metric} value={metric}>{metricLabel(metric, isSpanish)}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <div className="analytics-comparison-metrics">
            <span>
              <strong>{formatMetricValue(comparisonMetric, comparisonSummary.portfolioLatestValue, isSpanish)}</strong>
              {isSpanish ? "Portafolio actual" : "Current portfolio"}
              <small>{formatMetricDelta(comparisonMetric, comparisonSummary.portfolioDelta, isSpanish)}</small>
            </span>
            <span>
              <strong>{formatMetricValue(comparisonMetric, comparisonSummary.portfolioStartValue, isSpanish)}</strong>
              {isSpanish ? "Portafolio al inicio" : "Portfolio at start"}
              <small>{comparisonSummary.startDate}</small>
            </span>
            <span>
              <strong>{comparisonSummary.largestIncrease ? comparisonSummary.largestIncrease.code : "—"}</strong>
              {isSpanish ? "Mayor aumento" : "Largest increase"}
              <small>{comparisonSummary.largestIncrease ? formatMetricDelta(comparisonMetric, comparisonSummary.largestIncrease.delta, isSpanish) : "—"}</small>
            </span>
            <span>
              <strong>{comparisonSummary.largestDecrease ? comparisonSummary.largestDecrease.code : "—"}</strong>
              {isSpanish ? "Mayor baja" : "Largest decrease"}
              <small>{comparisonSummary.largestDecrease ? formatMetricDelta(comparisonMetric, comparisonSummary.largestDecrease.delta, isSpanish) : "—"}</small>
            </span>
          </div>
          <div className="analytics-property-table analytics-comparison-table">
            <div className="analytics-property-table-row analytics-property-table-head">
              <span>{isSpanish ? "Propiedad" : "Property"}</span>
              <span>{isSpanish ? "Inicial" : "Start"}</span>
              <span>{isSpanish ? "Actual" : "Current"}</span>
              <span>{isSpanish ? "Cambio" : "Delta"}</span>
              <span>{isSpanish ? "Fechas" : "Dates"}</span>
            </div>
            {comparisonSummary.rows.slice(0, 10).map((row) => (
              <button key={`${row.code}-${row.startDate}-${row.latestDate}`} type="button" className="analytics-property-table-row analytics-property-table-action" onClick={() => onDrillDown({ type: "property", value: row.code })}>
                <strong>{row.code}</strong>
                <span>{formatMetricValue(comparisonMetric, row.startValue, isSpanish)}</span>
                <span>{formatMetricValue(comparisonMetric, row.latestValue, isSpanish)}</span>
                <span>{formatMetricDelta(comparisonMetric, row.delta, isSpanish)}</span>
                <span>{row.startDate} {"->"} {row.latestDate}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {propertyRows.length ? (
        <div className="analytics-property-table-wrap">
          <div className="drawer-section-title">
            <h4>{isSpanish ? "Comparacion por propiedad" : "Property Comparison"}</h4>
            <span className="muted">{isSpanish ? `${propertyRows.length} propiedades` : `${propertyRows.length} properties`}</span>
          </div>
          <div className="analytics-property-table">
            <div className="analytics-property-table-row analytics-property-table-head">
              <span>{isSpanish ? "Propiedad" : "Property"}</span>
              <span>{isSpanish ? "Activas" : "Active"}</span>
              <span>{isSpanish ? "Atrasadas" : "Overdue"}</span>
              <span>{isSpanish ? "Alto riesgo" : "High risk"}</span>
              <span>{isSpanish ? "Prom. dias vacante" : "Avg vacant days"}</span>
            </div>
            {propertyRows.slice(0, 8).map((row) => (
              <button key={row.code} type="button" className="analytics-property-table-row analytics-property-table-action" onClick={() => onDrillDown({ type: "property", value: row.code })}>
                <strong>{row.code}</strong>
                <span>{row.active}</span>
                <span>{row.overdue}</span>
                <span>{row.highRisk}</span>
                <span>{row.averageDaysVacant}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {data.trends.length ? (
        <div className="analytics-trend" aria-label={isSpanish ? "Tendencia de atrasados y alto riesgo" : "Overdue and high-risk trend"}>
          {data.trends.slice(-14).map((entry) => (
            <i key={`${entry.property.id}-${entry.date}`} title={isSpanish ? `${entry.property.code}: atrasados ${entry.overdue}, alto riesgo ${entry.highRisk}` : `${entry.property.code}: overdue ${entry.overdue}, high risk ${entry.highRisk}`} style={{ height: `${Math.max(8, ((entry.overdue + entry.highRisk) / trendTotal) * 100)}%` }} />
          ))}
        </div>
      ) : <p className="muted">{isSpanish ? "Todavia no hay snapshots diarios. Ejecute el script de snapshots de analitica para iniciar el historial de tendencias." : "No daily snapshots yet. Run the analytics snapshot script to start trend history."}</p>}
      {data.recurringProblemUnits.length ? (
        <div className="analytics-hotspots">
          <div className="drawer-section-title">
            <h4>{isSpanish ? "Unidades recurrentes" : "Recurring Hotspots"}</h4>
            <span className="muted">{isSpanish ? "Abrir turno actual o filtrar por propiedad" : "Open current turn or drill by property"}</span>
          </div>
          <div className="analytics-hotspot-grid">
            {data.recurringProblemUnits.slice(0, 6).map((entry) => (
              <article key={`${entry.property.id}-${entry.unitNumber}`} className="analytics-hotspot-card">
                <button
                  type="button"
                  className="analytics-hotspot-card__main"
                  onClick={() => entry.currentItemId ? onOpenItem(entry.currentItemId) : onDrillDown({ type: "property", value: entry.property.code })}
                >
                  <div className="analytics-hotspot-card__header">
                    <strong>{displayUnitNumber(entry.property.code, entry.unitNumber)}</strong>
                    <span>{isSpanish ? `${entry.score} senales` : `${entry.score} signals`}</span>
                  </div>
                  <div className="analytics-hotspot-card__meta">
                    <span>{isSpanish ? `${entry.turnCount} rotaciones` : `${entry.turnCount} turns`}</span>
                    <span>{isSpanish ? `${entry.activeTurnCount} activas` : `${entry.activeTurnCount} active`}</span>
                    <span>{isSpanish ? `${entry.averageChecklistCompletionPercent}% checklist` : `${entry.averageChecklistCompletionPercent}% checklist`}</span>
                    <span>{entry.averageTurnDuration != null ? (isSpanish ? `Prom ${entry.averageTurnDuration} d` : `Avg ${entry.averageTurnDuration}d`) : (isSpanish ? "Sin cierre" : "No close yet")}</span>
                  </div>
                  <p className="analytics-hotspot-card__signals">{recurringSignalSummary(entry, isSpanish) || (isSpanish ? "Sin detalle de senal" : "No signal detail")}</p>
                  <div className="analytics-hotspot-card__foot">
                    <small>{isSpanish ? "Ultima actividad" : "Last activity"} {formatDateTime(entry.lastActivityAt)}</small>
                    {entry.latestCompletedAt ? <small>{isSpanish ? "Ultimo cierre" : "Last closed"} {formatDateTime(entry.latestCompletedAt)}</small> : null}
                  </div>
                </button>
                <div className="analytics-hotspot-card__actions">
                  <button type="button" className="button button-secondary" onClick={() => onDrillDown({ type: "property", value: entry.property.code })}>
                    {isSpanish ? "Ver propiedad" : "View property"}
                  </button>
                  {entry.currentItemId ? (
                    <button type="button" className="button button-secondary" onClick={() => onOpenItem(entry.currentItemId!)}>
                      {isSpanish ? "Abrir turno" : "Open turn"}
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}
      <SlaMissSection data={data} isSpanish={isSpanish} onDrillDown={onDrillDown} />
      <ThroughputSection data={data} isSpanish={isSpanish} onDrillDown={onDrillDown} />
      {Object.keys(data.riskByCategory ?? {}).length ? (
        <div className="analytics-risk-categories" aria-label={isSpanish ? "Conteos por categoria de riesgo" : "Risk category counts"}>
          {Object.entries(data.riskByCategory).slice(0, 6).map(([category, count]) => (
            <span key={category}><strong>{category.replace(/_/g, " ")}</strong>{count}</span>
          ))}
        </div>
      ) : null}
      {data.recentCompletedTurns.length ? (
        <div className="analytics-recent-turns">
          <div className="drawer-section-title">
            <h4>{isSpanish ? "Rotaciones completadas recientes" : "Recent Completed Turns"}</h4>
            <span className="muted">{isSpanish ? "Abrir para revisar" : "Open to review"}</span>
          </div>
          <div className="attention-list compact">
            {data.recentCompletedTurns.slice(0, 6).map((entry) => (
              <button key={entry.itemId} type="button" className="dashboard-row-action" onClick={() => onOpenItem(entry.itemId)}>
                <strong>{displayUnitNumber(entry.property.code, entry.unitNumber)}</strong>
                <span>
                  {isSpanish ? "Completada" : "Completed"} {formatDateTime(entry.completedAt)}
                  {entry.turnDuration != null ? ` / ${entry.turnDuration}${isSpanish ? " d" : "d"}` : ""}
                  {entry.assignedTech ? ` / ${entry.assignedTech}` : ""}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function DashboardWikiWidget({ propertyId, language }: { propertyId?: string; language: UserLanguage }) {
  const isSpanish = language === "es";
  const overviewQuery = useQuery({
    queryKey: ["property-wiki", "overview", propertyId],
    queryFn: () => getPropertyWikiOverview(propertyId),
    enabled: Boolean(propertyId),
  });

  if (!propertyId) {
    return (
      <section className="dashboard-chart dashboard-wiki-widget">
        <h3>{isSpanish ? "Wiki de propiedad" : "Property Wiki"}</h3>
        <p className="muted">{isSpanish ? "Seleccione una propiedad para fijar widgets de emergencia y conocimiento en este panel." : "Select a property to pin emergency and knowledge widgets to this dashboard."}</p>
      </section>
    );
  }

  return (
    <section className="dashboard-chart dashboard-wiki-widget" data-testid="dashboard-wiki-widget">
      <div className="drawer-section-title">
        <h3>{isSpanish ? "Wiki de propiedad" : "Property Wiki"}</h3>
        <button type="button" className="button button-secondary" onClick={() => openWikiRecord({ targetType: "ENTRY", id: overviewQuery.data?.pinnedCriticalInformation[0]?.id ?? overviewQuery.data?.emergencyContacts[0]?.id ?? "", propertyId })} disabled={!overviewQuery.data?.pinnedCriticalInformation[0] && !overviewQuery.data?.emergencyContacts[0]}>
          {isSpanish ? "Abrir wiki" : "Open Wiki"}
        </button>
      </div>
      <div className="dashboard-wiki-actions">
        {(overviewQuery.data?.emergencyContacts ?? []).slice(0, 2).map((entry) => (
          <button key={entry.id} type="button" className="dashboard-row-action" onClick={() => openWikiRecord({ targetType: "ENTRY", id: entry.id, propertyId })}>
            <strong>{entry.title}</strong>
            <span>{entry.phone || entry.email || (isSpanish ? "Contacto de emergencia" : "Emergency contact")}</span>
          </button>
        ))}
        {(overviewQuery.data?.pinnedCriticalInformation ?? []).slice(0, 3).map((entry) => (
          <button key={entry.id} type="button" className="dashboard-row-action" onClick={() => openWikiRecord({ targetType: "ENTRY", id: entry.id, propertyId })}>
            <strong>{entry.title}</strong>
            <span>{entry.section.replace(/_/g, " ")}{entry.building ? ` / ${entry.building}` : ""}</span>
          </button>
        ))}
        {(overviewQuery.data?.recentlyUpdated ?? []).slice(0, 2).map((entry) => (
          <button key={entry.id} type="button" className="dashboard-row-action" onClick={() => openWikiRecord({ targetType: "ENTRY", id: entry.id, propertyId })}>
            <strong>{entry.title}</strong>
            <span>{isSpanish ? "Actualizado" : "Updated"} {formatDateTime(entry.updatedAt)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function openMapsView(propertyId?: string) {
  window.dispatchEvent(new CustomEvent("makereadyos:set-active-view", { detail: { view: "maps", propertyId } }));
}

function DashboardMapsWidget({ data, propertyId, language }: { data?: DashboardResponse["propertyMaps"]; propertyId?: string; language: UserLanguage }) {
  const isSpanish = language === "es";
  if (!propertyId) {
    return (
      <section className="dashboard-chart dashboard-maps-widget">
        <h3>{isSpanish ? "Mapas de propiedad" : "Property Maps"}</h3>
        <p className="muted">{isSpanish ? "Seleccione una propiedad para mostrar mapas predeterminados, pines criticos y faltantes de configuracion." : "Select a property to surface default maps, critical pins, and setup gaps."}</p>
      </section>
    );
  }
  if (!data) {
    return (
      <section className="dashboard-chart dashboard-maps-widget">
        <h3>{isSpanish ? "Mapas de propiedad" : "Property Maps"}</h3>
        <p className="muted">{isSpanish ? "La visibilidad de mapas no esta disponible para esta propiedad." : "Map visibility is unavailable for this property."}</p>
      </section>
    );
  }
  return (
    <section className="dashboard-chart dashboard-maps-widget" data-testid="dashboard-maps-widget">
      <div className="drawer-section-title">
        <h3>{isSpanish ? "Mapas de propiedad" : "Property Maps"}</h3>
        <button type="button" className="button button-secondary" onClick={() => openMapsView(propertyId)}>
          {isSpanish ? "Abrir mapas" : "Open Maps"}
        </button>
      </div>
      <div className="dashboard-map-metrics">
        <span><strong>{data.totalMaps}</strong> {isSpanish ? "mapas" : "maps"}</span>
        <span><strong>{data.totalPins}</strong> {isSpanish ? "pines" : "pins"}</span>
        <span><strong>{data.emergencyPins}</strong> {isSpanish ? "emergencia" : "emergency"}</span>
        <span><strong>{data.unmappedUnits}</strong> {isSpanish ? "unidades sin mapa" : "unmapped units"}</span>
      </div>
      <div className="dashboard-wiki-actions">
        <button type="button" className="dashboard-row-action" onClick={() => openMapsView(propertyId)}>
          <strong>{data.defaultMapName ?? (isSpanish ? "Sin mapa predeterminado" : "No default map")}</strong>
          <span>{data.activeMaps} {isSpanish ? `mapa${data.activeMaps === 1 ? "" : "s"} activo${data.activeMaps === 1 ? "" : "s"}` : `active map${data.activeMaps === 1 ? "" : "s"}`} / {data.utilityPins} {isSpanish ? `pin${data.utilityPins === 1 ? "" : "es"} de utilidad` : `utility-style pin${data.utilityPins === 1 ? "" : "s"}`}</span>
        </button>
        {(data.recentPins ?? []).map((pin) => (
          <button key={pin.id} type="button" className="dashboard-row-action" onClick={() => openMapsView(propertyId)}>
            <strong>{pin.title}{pin.isEmergency ? (isSpanish ? " / Emergencia" : " / Emergency") : ""}</strong>
            <span>{[pin.pinType, pin.mapName, pin.building, pin.unitLabel, pin.area].filter(Boolean).join(" / ")}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function DashboardPanel({ data, analytics, loading, analyticsLoading, error, onOpenItem, onDrillDown, onOpenPond, layout, onLayoutChange, propertyId, language, assignedWork, showAssignedWork, onOpenAssignedWork }: Props) {
  const isSpanish = language === "es";
  const labels = kpiLabels(isSpanish);
  if (loading) return <StatusState title={t(language, "dashboard.loading")} description={t(language, "dashboard.loadingCopy")} />;
  if (error || !data) return <StatusState title={t(language, "dashboard.unavailable")} description={t(language, "dashboard.unavailableCopy")} tone="error" />;
  const needsAttention = data.needsAttention ?? [];
  const recentStatusChanges = data.recentStatusChanges ?? [];
  const activeSessions = assignedWork?.activeSessions ?? [];
  return (
    <section className={`dashboard-shell dashboard-layout-${layout}`} data-testid="dashboard-panel">
      <header className="panel-heading">
        <div>
          <h2>{t(language, "dashboard.title")}</h2>
          <p>{tWithVars(language, "dashboard.asOfNow", { timestamp: formatDateTime(new Date(), undefined, language) })}</p>
        </div>
        <label className="dashboard-layout-select">{t(language, "dashboard.layout")}
          <select data-testid="dashboard-layout" value={layout} onChange={(event) => onLayoutChange(event.target.value as "overview" | "focus")}>
            <option value="overview">{t(language, "dashboard.layoutOverview")}</option>
            <option value="focus">{t(language, "dashboard.layoutFocus")}</option>
          </select>
        </label>
      </header>
      <div className="dashboard-kpis">
        {Object.entries(labels).map(([key, label]) => (
          <button type="button" className={["overdue", "moveInRisk", "missingCriticalDates"].includes(key) && data.kpis[key] > 0 ? "dashboard-kpi alert" : "dashboard-kpi"} key={key} data-testid={`kpi-${key}`} onClick={() => onDrillDown({ type: "kpi", value: key })}>
            <strong>{data.kpis[key] ?? 0}</strong><span>{label}</span>
          </button>
        ))}
      </div>
      <div className="dashboard-grid">
        <Donut title={isSpanish ? "Pipeline de vacancia" : "Vacancy Pipeline"} data={data.vacancyBreakdown} type="vacancy" onDrillDown={onDrillDown} />
        <Donut title={isSpanish ? "Distribucion de alcance" : "Scope Distribution"} data={data.scopeBreakdown} type="scope" onDrillDown={onDrillDown} />
        <Donut title={isSpanish ? "Niveles de riesgo" : "Risk Levels"} data={data.riskByLevel} type="risk" onDrillDown={onDrillDown} />
        <Breakdown title={isSpanish ? "Carga asignada" : "Assigned Workload"} data={data.techWorkload} type="tech" onDrillDown={onDrillDown} />
        <Breakdown title={isSpanish ? "Comparacion por propiedad" : "Property Comparison"} data={data.propertyComparison} type="property" onDrillDown={onDrillDown} />
        {Object.keys(data.downUnitsByArea ?? {}).length ? <Breakdown title={isSpanish ? "Unidades fuera de servicio por area" : "Down Units By Area"} data={data.downUnitsByArea} type="property" onDrillDown={onDrillDown} /> : null}
        {showAssignedWork ? (
          <section className="dashboard-chart dashboard-assigned-work-card" data-testid="dashboard-assigned-work-card">
            <div className="drawer-section-title">
              <h3>{isSpanish ? "Trabajo asignado" : "Assigned Work"}</h3>
              <button type="button" className="button button-secondary" onClick={onOpenAssignedWork}>
                {isSpanish ? "Abrir" : "Open"}
              </button>
            </div>
            <div className="analytics-metrics">
              <span><strong>{assignedWork?.summary.totalAssignments ?? 0}</strong> {isSpanish ? "asignaciones" : "assignments"}</span>
              <span><strong>{assignedWork?.summary.activeSessions ?? 0}</strong> {isSpanish ? "trabajando ahora" : "working now"}</span>
              <span><strong>{assignedWork?.summary.overdueAssignments ?? 0}</strong> {isSpanish ? "atrasadas" : "overdue"}</span>
              <span><strong>{assignedWork?.summary.assignedUsers ?? 0}</strong> {isSpanish ? "usuarios" : "users"}</span>
            </div>
            {activeSessions.length ? (
              <div className="attention-list compact">
                {activeSessions.slice(0, 4).map((session) => (
                  <button type="button" key={session.id} onClick={onOpenAssignedWork}>
                    <strong>{session.user.fullName}</strong>
                    <em className="risk-level-badge low">{sessionDurationLabel(session.startedAt)}</em>
                    <span>{session.title} / {session.property.code}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted">{isSpanish ? "Nadie tiene una sesión activa ahora mismo." : "No one has an active work session right now."}</p>
            )}
          </section>
        ) : null}
        <AnalyticsPanel data={analytics} loading={analyticsLoading} propertyId={propertyId} language={language} onDrillDown={onDrillDown} onOpenItem={onOpenItem} />
        <DashboardMapsWidget data={data.propertyMaps} propertyId={propertyId} language={language} />
        <DashboardWikiWidget propertyId={propertyId} language={language} />
      </div>
      <RatioStrip data={data} language={language} />
      <section className="dashboard-frog-preview" data-testid="dashboard-frog-preview">
        <div>
          <h3>{isSpanish ? "Vista previa de Frog Pond" : "Frog Pond Preview"}</h3>
          <p>{isSpanish ? "Abra una capa visual ligera para patrones de riesgo, vacancia, seccion y carga de trabajo. La tabla sigue siendo la fuente principal." : "Open a low-stakes visual layer for risk, vacancy, section, and workload patterns. The table remains the source of truth."}</p>
        </div>
        <div className="frog-preview-counts" aria-label={isSpanish ? "Conteos de vista previa de Frog Pond" : "Frog Pond preview counts"}>
          <span><strong>{data.kpis.riskHigh ?? 0}</strong> {isSpanish ? "ranas de alto riesgo" : "high-risk frogs"}</span>
          <span><strong>{data.kpis.readyUnits ?? 0}</strong> {isSpanish ? "ranas listas descansando" : "sleeping ready frogs"}</span>
          <span><strong>{data.kpis.ntv ?? 0}</strong> {isSpanish ? "renacuajos NTV" : "NTV tadpoles"}</span>
        </div>
        <button type="button" className="button button-primary" data-testid="dashboard-open-pond" onClick={onOpenPond}>{isSpanish ? "Abrir Frog Pond" : "Open Frog Pond"}</button>
      </section>
      <section className="attention-panel" data-testid="needs-attention-panel">
        <h3>{t(language, "dashboard.needsAttention")}</h3>
        {needsAttention.length === 0 ? <p className="empty-copy">{t(language, "dashboard.needsAttentionEmpty")}</p> : (
          <div className="attention-list">
            {needsAttention.map((item) => (
              <button type="button" key={item.itemId} onClick={() => onOpenItem(item.itemId)}>
                <strong>{displayUnitNumber(item.property.code, item.unitNumber)}</strong>
                {item.riskLevel ? <em className={`risk-level-badge ${item.riskLevel.toLowerCase()}`}>{item.riskLevel} / {item.riskScore}</em> : null}
                <span>{item.reasons.join(" / ")}</span>
              </button>
            ))}
          </div>
        )}
      </section>
      <section className="attention-panel" data-testid="recent-status-changes-panel">
        <h3>{t(language, "dashboard.recentStatusChanges")}</h3>
        <p className="muted">{t(language, "dashboard.recentStatusChangesCopy")}</p>
        {recentStatusChanges.length === 0 ? <p className="empty-copy">{t(language, "dashboard.recentStatusChangesEmpty")}</p> : (
          <div className="attention-list">
            {recentStatusChanges.map((entry) => (
              <button type="button" key={entry.key} onClick={() => onOpenItem(entry.itemId)}>
                <strong>{displayUnitNumber(entry.property.code, entry.unitNumber)}</strong>
                <em className={`risk-level-badge ${entry.source === "availability" ? "medium" : "low"}`}>{entry.title}</em>
                <span>{entry.detail} / {formatDateTime(entry.changedAt, undefined, language)}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
