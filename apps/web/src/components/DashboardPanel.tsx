import type { AnalyticsSummaryResponse, DashboardResponse } from "../lib/api";
import { displayUnitNumber } from "../lib/board";
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
};

const kpiLabels: Record<string, string> = {
  active: "Active Turns", vacant: "Vacant", vacantLeased: "Vacant Leased", ntv: "NTV",
  downUnits: "Down Units", readyUnits: "Ready Units", archived: "Archived",
  moveInsThisWeek: "Move-Ins This Week", moveInsNext7Days: "Move-Ins / 7 Days", moveInsNext14Days: "Move-Ins / 14 Days",
  overdue: "Overdue", averageDaysVacant: "Avg Days Vacant", missingTech: "Unassigned",
  missingCriticalDates: "Missing Dates", pestIssues: "Pest Issues", flooringNeeds: "Flooring Needed",
  paintNeeds: "Paint Needed", moveInRisk: "Move-In Risk",
  riskCritical: "Critical Risk", riskHigh: "High Risk", agingTurns: "Aging Turns",
  vendorScheduledThisWeek: "Vendor Work This Week", vendorOverdue: "Vendor Overdue",
  vendorFollowUpNeeded: "Vendor Follow-Up", blockedByVendor: "Blocked By Vendor",
  mappedUnits: "Mapped Units", unmappedUnits: "Unmapped Units", highRiskMappedUnits: "High-Risk Mapped",
  plannedWorkBlocks: "Planned Assignments", unplannedMoveIns: "Move-Ins Not Covered",
};

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

function RatioStrip({ data }: { data: DashboardResponse }) {
  const total = Math.max(data.kpis.active ?? 0, 1);
  const values = [
    ["Ready", data.kpis.readyUnits ?? 0, "var(--success)"],
    ["Overdue", data.kpis.overdue ?? 0, "var(--danger)"],
    ["Move-In Risk", data.kpis.moveInRisk ?? 0, "var(--warning)"],
    ["Unassigned", data.kpis.missingTech ?? 0, "var(--accent)"],
  ] as const;
  return (
    <section className="dashboard-ratio" data-testid="dashboard-readiness-ratios">
      <h3>Readiness Ratios</h3>
      <div className="ratio-track">{values.map(([label, count, color]) => <i key={label} title={`${label}: ${count}`} style={{ width: `${(count / total) * 100}%`, background: color }} />)}</div>
      <div className="dashboard-legend">{values.map(([label, count, color]) => <span key={label}><i style={{ background: color }} />{label} <strong>{Math.round((count / total) * 100)}%</strong></span>)}</div>
    </section>
  );
}

function AnalyticsPanel({ data, loading }: { data?: AnalyticsSummaryResponse; loading: boolean }) {
  if (loading) return <section className="dashboard-chart" data-testid="analytics-panel"><h3>Historical Analytics</h3><p className="muted">Loading snapshot-backed analytics...</p></section>;
  if (!data) return <section className="dashboard-chart" data-testid="analytics-panel"><h3>Historical Analytics</h3><p className="muted">Analytics are unavailable for this scope.</p></section>;
  const trendTotal = Math.max(...data.trends.map((entry) => entry.highRisk + entry.overdue), 1);
  return (
    <section className="dashboard-chart analytics-panel" data-testid="analytics-panel">
      <h3>Historical Analytics</h3>
      <p className="muted">Data as of {new Date(data.generatedAt).toLocaleString()}</p>
      <div className="analytics-metrics">
        <span><strong>{data.metrics.averageTurnDuration}</strong> Avg turn days</span>
        <span><strong>{data.metrics.completedThisWeek}</strong> Completed this week</span>
        <span><strong>{data.metrics.completedThisMonth}</strong> Completed this month</span>
      </div>
      {data.trends.length ? (
        <div className="analytics-trend" aria-label="Overdue and high-risk trend">
          {data.trends.slice(-14).map((entry) => (
            <i key={`${entry.property.id}-${entry.date}`} title={`${entry.property.code}: overdue ${entry.overdue}, high risk ${entry.highRisk}`} style={{ height: `${Math.max(8, ((entry.overdue + entry.highRisk) / trendTotal) * 100)}%` }} />
          ))}
        </div>
      ) : <p className="muted">No daily snapshots yet. Run the analytics snapshot script to start trend history.</p>}
      {data.recurringProblemUnits.length ? (
        <div className="attention-list compact">
          {data.recurringProblemUnits.slice(0, 4).map((entry) => <span key={`${entry.property.id}-${entry.unitNumber}`}><strong>{entry.property.code} {entry.unitNumber}</strong> recurring signals: {entry.score}</span>)}
        </div>
      ) : null}
    </section>
  );
}

export function DashboardPanel({ data, analytics, loading, analyticsLoading, error, onOpenItem, onDrillDown, onOpenPond, layout, onLayoutChange }: Props) {
  if (loading) return <StatusState title="Loading dashboard" description="Calculating operational risk and workload totals." />;
  if (error || !data) return <StatusState title="Dashboard unavailable" description="Refresh to recalculate dashboard summaries." tone="error" />;
  return (
    <section className={`dashboard-shell dashboard-layout-${layout}`} data-testid="dashboard-panel">
      <header className="panel-heading">
        <div><h2>Operations Dashboard</h2><p>Scoped turnover visibility from the active board. Data as of {new Date().toLocaleString()}.</p></div>
        <label className="dashboard-layout-select">Layout
          <select data-testid="dashboard-layout" value={layout} onChange={(event) => onLayoutChange(event.target.value as "overview" | "focus")}>
            <option value="overview">Overview</option>
            <option value="focus">Attention focus</option>
          </select>
        </label>
      </header>
      <div className="dashboard-kpis">
        {Object.entries(kpiLabels).map(([key, label]) => (
          <button type="button" className={["overdue", "moveInRisk", "missingCriticalDates"].includes(key) && data.kpis[key] > 0 ? "dashboard-kpi alert" : "dashboard-kpi"} key={key} data-testid={`kpi-${key}`} onClick={() => onDrillDown({ type: "kpi", value: key })}>
            <strong>{data.kpis[key] ?? 0}</strong><span>{label}</span>
          </button>
        ))}
      </div>
      <div className="dashboard-grid">
        <Donut title="Vacancy Pipeline" data={data.vacancyBreakdown} type="vacancy" onDrillDown={onDrillDown} />
        <Donut title="Scope Distribution" data={data.scopeBreakdown} type="scope" onDrillDown={onDrillDown} />
        <Donut title="Risk Levels" data={data.riskByLevel} type="risk" onDrillDown={onDrillDown} />
        <Breakdown title="Assigned Workload" data={data.techWorkload} type="tech" onDrillDown={onDrillDown} />
        <Breakdown title="Property Comparison" data={data.propertyComparison} type="property" onDrillDown={onDrillDown} />
        {Object.keys(data.downUnitsByArea ?? {}).length ? <Breakdown title="Down Units By Area" data={data.downUnitsByArea} type="property" onDrillDown={onDrillDown} /> : null}
        <AnalyticsPanel data={analytics} loading={analyticsLoading} />
      </div>
      <RatioStrip data={data} />
      <section className="dashboard-frog-preview" data-testid="dashboard-frog-preview">
        <div>
          <h3>Frog Pond Preview</h3>
          <p>Open a low-stakes visual layer for risk, vacancy, section, and workload patterns. The table remains the source of truth.</p>
        </div>
        <div className="frog-preview-counts" aria-label="Frog Pond preview counts">
          <span><strong>{data.kpis.riskHigh ?? 0}</strong> high-risk frogs</span>
          <span><strong>{data.kpis.readyUnits ?? 0}</strong> sleeping ready frogs</span>
          <span><strong>{data.kpis.ntv ?? 0}</strong> NTV tadpoles</span>
        </div>
        <button type="button" className="button button-primary" data-testid="dashboard-open-pond" onClick={onOpenPond}>Open Frog Pond</button>
      </section>
      <section className="attention-panel" data-testid="needs-attention-panel">
        <h3>Needs Attention</h3>
        {data.needsAttention.length === 0 ? <p className="empty-copy">No immediate attention flags in the current property scope.</p> : (
          <div className="attention-list">
            {data.needsAttention.map((item) => (
              <button type="button" key={item.itemId} onClick={() => onOpenItem(item.itemId)}>
                <strong>{displayUnitNumber(item.property.code, item.unitNumber)}</strong>
                {item.riskLevel ? <em className={`risk-level-badge ${item.riskLevel.toLowerCase()}`}>{item.riskLevel} / {item.riskScore}</em> : null}
                <span>{item.reasons.join(" / ")}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
