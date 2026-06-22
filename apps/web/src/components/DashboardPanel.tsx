import { useQuery } from "@tanstack/react-query";
import { type UserLanguage, getPropertyWikiOverview, type AnalyticsSummaryResponse, type DashboardResponse } from "../lib/api";
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
    totalUnits: isSpanish ? "Total de unidades" : "Total Units",
    occupiedUnits: isSpanish ? "Unidades ocupadas" : "Occupied Units",
    occupancyPercent: isSpanish ? "% ocupacion" : "Occupancy %",
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

function AnalyticsPanel({ data, loading, language }: { data?: AnalyticsSummaryResponse; loading: boolean; language: UserLanguage }) {
  const isSpanish = language === "es";
  if (loading) return <section className="dashboard-chart" data-testid="analytics-panel"><h3>{isSpanish ? "Analitica historica" : "Historical Analytics"}</h3><p className="muted">{isSpanish ? "Cargando analitica basada en snapshots..." : "Loading snapshot-backed analytics..."}</p></section>;
  if (!data) return <section className="dashboard-chart" data-testid="analytics-panel"><h3>{isSpanish ? "Analitica historica" : "Historical Analytics"}</h3><p className="muted">{isSpanish ? "La analitica no esta disponible para este alcance." : "Analytics are unavailable for this scope."}</p></section>;
  const trendTotal = Math.max(...data.trends.map((entry) => entry.highRisk + entry.overdue), 1);
  return (
    <section className="dashboard-chart analytics-panel" data-testid="analytics-panel">
      <h3>{isSpanish ? "Analitica historica" : "Historical Analytics"}</h3>
      <p className="muted">{isSpanish ? "Datos al" : "Data as of"} {formatDateTime(data.generatedAt)}</p>
      <div className="analytics-metrics">
        <span><strong>{data.metrics.averageTurnDuration}</strong> {isSpanish ? "Prom. dias de rotacion" : "Avg turn days"}</span>
        <span><strong>{data.metrics.completedThisWeek}</strong> {isSpanish ? "Completadas esta semana" : "Completed this week"}</span>
        <span><strong>{data.metrics.completedThisMonth}</strong> {isSpanish ? "Completadas este mes" : "Completed this month"}</span>
        <span><strong>{data.metrics.slaMisses}</strong> {isSpanish ? "Incumplimientos de fecha lista" : "Ready-date misses"}</span>
        <span><strong>{data.metrics.staleRiskItems}</strong> {isSpanish ? "Riesgos estancados" : "Stale risk items"}</span>
      </div>
      {data.trends.length ? (
        <div className="analytics-trend" aria-label={isSpanish ? "Tendencia de atrasados y alto riesgo" : "Overdue and high-risk trend"}>
          {data.trends.slice(-14).map((entry) => (
            <i key={`${entry.property.id}-${entry.date}`} title={isSpanish ? `${entry.property.code}: atrasados ${entry.overdue}, alto riesgo ${entry.highRisk}` : `${entry.property.code}: overdue ${entry.overdue}, high risk ${entry.highRisk}`} style={{ height: `${Math.max(8, ((entry.overdue + entry.highRisk) / trendTotal) * 100)}%` }} />
          ))}
        </div>
      ) : <p className="muted">{isSpanish ? "Todavia no hay snapshots diarios. Ejecute el script de snapshots de analitica para iniciar el historial de tendencias." : "No daily snapshots yet. Run the analytics snapshot script to start trend history."}</p>}
      {data.recurringProblemUnits.length ? (
        <div className="attention-list compact">
          {data.recurringProblemUnits.slice(0, 4).map((entry) => <span key={`${entry.property.id}-${entry.unitNumber}`}><strong>{entry.property.code} {entry.unitNumber}</strong> {isSpanish ? "senales recurrentes" : "recurring signals"}: {entry.score}</span>)}
        </div>
      ) : null}
      {Object.keys(data.riskByCategory ?? {}).length ? (
        <div className="analytics-risk-categories" aria-label={isSpanish ? "Conteos por categoria de riesgo" : "Risk category counts"}>
          {Object.entries(data.riskByCategory).slice(0, 6).map(([category, count]) => (
            <span key={category}><strong>{category.replace(/_/g, " ")}</strong>{count}</span>
          ))}
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

export function DashboardPanel({ data, analytics, loading, analyticsLoading, error, onOpenItem, onDrillDown, onOpenPond, layout, onLayoutChange, propertyId, language }: Props) {
  const isSpanish = language === "es";
  const labels = kpiLabels(isSpanish);
  if (loading) return <StatusState title={t(language, "dashboard.loading")} description={t(language, "dashboard.loadingCopy")} />;
  if (error || !data) return <StatusState title={t(language, "dashboard.unavailable")} description={t(language, "dashboard.unavailableCopy")} tone="error" />;
  const needsAttention = data.needsAttention ?? [];
  const recentStatusChanges = data.recentStatusChanges ?? [];
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
        <AnalyticsPanel data={analytics} loading={analyticsLoading} language={language} />
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
