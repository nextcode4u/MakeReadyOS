import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { dailyActivityReportCsvUrl, getActivity, getDailyActivityReport, isApiError } from "../lib/api";
import { formatDateTime } from "../lib/dateTime";
import { StatusState } from "./StatusState";

type Props = {
  onSessionExpired: () => void;
};

function startDateIso(value: string) {
  return value ? new Date(`${value}T00:00:00`).toISOString() : undefined;
}

function endDateIso(value: string) {
  return value ? new Date(`${value}T23:59:59.999`).toISOString() : undefined;
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function todayInputValue() {
  const date = new Date();
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 10);
}

function reportCategoryLabel(value: string) {
  const labels: Record<string, string> = {
    totalChanges: "Total changes",
    markedReady: "Marked ready",
    availability: "Availability imports",
    archived: "Archived",
    restored: "Restored",
    created: "Created",
    updated: "Updated",
    exception: "Needs review",
  };
  return labels[value] ?? titleCase(value);
}

export function ActivityPanel({ onSessionExpired }: Props) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [actorUserId, setActorUserId] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [offset, setOffset] = useState(0);
  const [reportDate, setReportDate] = useState(todayInputValue);
  const [reportPropertyId, setReportPropertyId] = useState("");
  const limit = 25;

  const requestFilters = useMemo(() => ({
    from: startDateIso(from),
    to: endDateIso(to),
    actorUserId,
    action,
    entityType,
    propertyId,
    limit,
    offset,
  }), [action, actorUserId, entityType, from, offset, propertyId, to]);

  const activityQuery = useQuery({
    queryKey: ["activity", requestFilters],
    queryFn: () => getActivity(requestFilters),
  });
  const activityData = activityQuery.data;

  const reportFilters = useMemo(() => ({
    date: reportDate,
    propertyId: reportPropertyId,
  }), [reportDate, reportPropertyId]);

  const reportQuery = useQuery({
    queryKey: ["activity-daily-report", reportFilters],
    queryFn: () => getDailyActivityReport(reportFilters),
  });

  useEffect(() => {
    if (isApiError(activityQuery.error) && activityQuery.error.status === 401) {
      onSessionExpired();
    }
    if (isApiError(reportQuery.error) && reportQuery.error.status === 401) {
      onSessionExpired();
    }
  }, [activityQuery.error, onSessionExpired, reportQuery.error]);

  const updateFilter = (setter: (value: string) => void, value: string) => {
    setter(value);
    setOffset(0);
  };

  const clearFilters = () => {
    setFrom("");
    setTo("");
    setActorUserId("");
    setAction("");
    setEntityType("");
    setPropertyId("");
    setOffset(0);
  };

  return (
    <div className="activity-shell" data-testid="activity-panel">
      <header className="activity-header">
        <div>
          <p className="eyebrow">Operations Audit</p>
          <h2>Activity</h2>
          <p className="subtitle">Read-only history for security events, board changes, configuration, and transfers.</p>
        </div>
        <button type="button" className="button button-secondary" onClick={() => void activityQuery.refetch()}>
          Refresh
        </button>
      </header>

      <section className="activity-filters" aria-label="Activity filters">
        <label>
          From
          <input data-testid="activity-filter-from" type="date" value={from} onChange={(event) => updateFilter(setFrom, event.target.value)} />
        </label>
        <label>
          To
          <input data-testid="activity-filter-to" type="date" value={to} onChange={(event) => updateFilter(setTo, event.target.value)} />
        </label>
        <label>
          Actor
          <select data-testid="activity-filter-actor" value={actorUserId} onChange={(event) => updateFilter(setActorUserId, event.target.value)}>
            <option value="">All actors</option>
            {activityQuery.data?.filterOptions.actors.map((actor) => (
              <option key={actor.id} value={actor.id}>{actor.fullName}</option>
            ))}
          </select>
        </label>
        <label>
          Action
          <select data-testid="activity-filter-action" value={action} onChange={(event) => updateFilter(setAction, event.target.value)}>
            <option value="">All actions</option>
            {activityQuery.data?.filterOptions.actions.map((entry) => (
              <option key={entry} value={entry}>{titleCase(entry)}</option>
            ))}
          </select>
        </label>
        <label>
          Entity
          <select data-testid="activity-filter-entity" value={entityType} onChange={(event) => updateFilter(setEntityType, event.target.value)}>
            <option value="">All types</option>
            {activityQuery.data?.filterOptions.entityTypes.map((entry) => (
              <option key={entry} value={entry}>{titleCase(entry)}</option>
            ))}
          </select>
        </label>
        <label>
          Property
          <select data-testid="activity-filter-property" value={propertyId} onChange={(event) => updateFilter(setPropertyId, event.target.value)}>
            <option value="">All properties</option>
            {activityQuery.data?.filterOptions.properties.map((property) => (
              <option key={property.id} value={property.id}>{property.code} - {property.name}</option>
            ))}
          </select>
        </label>
        <button type="button" className="button button-secondary activity-clear" onClick={clearFilters}>Clear filters</button>
      </section>

      <section className="daily-report-panel" aria-label="Daily manager report" data-testid="daily-manager-report">
        <div className="daily-report-heading">
          <div>
            <p className="eyebrow">Daily Manager Report</p>
            <h3>Changed, ready, imported, and exception activity</h3>
            <p className="subtitle">Use this daily summary to update external property systems without combing through the full audit trail.</p>
          </div>
          <div className="daily-report-controls">
            <label>
              Report date
              <input
                data-testid="daily-report-date"
                type="date"
                value={reportDate}
                onChange={(event) => setReportDate(event.target.value)}
              />
            </label>
            <label>
              Property
              <select
                data-testid="daily-report-property"
                value={reportPropertyId}
                onChange={(event) => setReportPropertyId(event.target.value)}
              >
                <option value="">All properties</option>
                {(reportQuery.data?.filterOptions.properties ?? activityQuery.data?.filterOptions.properties ?? []).map((property) => (
                  <option key={property.id} value={property.id}>{property.code} - {property.name}</option>
                ))}
              </select>
            </label>
            <a
              className="button button-secondary daily-report-export"
              href={dailyActivityReportCsvUrl(reportFilters)}
              data-testid="daily-report-export"
            >
              Export CSV
            </a>
          </div>
        </div>

        {reportQuery.isLoading ? (
          <StatusState title="Loading daily report" description="Building the manager summary for the selected day." />
        ) : reportQuery.isError ? (
          <StatusState
            title="Daily report failed to load"
            description={reportQuery.error instanceof Error ? reportQuery.error.message : "Refresh and try again."}
            tone="error"
            action={{ label: "Retry", onClick: () => void reportQuery.refetch() }}
          />
        ) : reportQuery.data ? (
          <>
            <div className="daily-report-summary">
              {(["totalChanges", "markedReady", "availability", "archived", "created", "updated", "exception"] as const).map((key) => (
                <div key={key} className={`daily-report-stat daily-report-stat-${key}`}>
                  <strong>{reportQuery.data.summary[key]}</strong>
                  <span>{reportCategoryLabel(key)}</span>
                </div>
              ))}
            </div>
            {reportQuery.data.records.length === 0 ? (
              <div className="daily-report-empty">
                No reportable activity for this day and property scope.
              </div>
            ) : (
              <div className="daily-report-list">
                {reportQuery.data.records.slice(0, 12).map((record) => (
                  <article key={record.id} className={`daily-report-row daily-report-row-${record.category}`}>
                    <div>
                      <span className="daily-report-chip">{reportCategoryLabel(record.category)}</span>
                      <strong>{record.property ? `${record.property.code}${record.unitNumber ? ` / ${record.unitNumber}` : ""}` : record.unitNumber ?? "System"}</strong>
                      <span>{formatDateTime(record.at)}</span>
                    </div>
                    <p>{record.description}</p>
                    <small>{record.externalActionHint}</small>
                  </article>
                ))}
                {reportQuery.data.records.length > 12 ? (
                  <p className="daily-report-more">
                    Showing first 12 of {reportQuery.data.records.length}. Export CSV for the full manager report.
                  </p>
                ) : null}
              </div>
            )}
          </>
        ) : null}
      </section>

      {activityQuery.isLoading ? (
        <StatusState title="Loading activity" description="Fetching the latest audit events available to your role." />
      ) : activityQuery.isError ? (
        <StatusState
          title="Activity failed to load"
          description={activityQuery.error instanceof Error ? activityQuery.error.message : "Refresh and try again."}
          tone="error"
          action={{ label: "Retry", onClick: () => void activityQuery.refetch() }}
        />
      ) : !activityData ? (
        <StatusState title="Activity unavailable" description="No activity response was returned. Refresh and try again." tone="error" />
      ) : activityData.activity.length === 0 ? (
        <StatusState title="No matching activity" description="No audit events match the selected filters or your property access." tone="subtle" />
      ) : (
        <>
          <div className="activity-table-wrap">
            <table className="activity-table" data-testid="activity-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Description</th>
                  <th>Property / Unit</th>
                </tr>
              </thead>
              <tbody>
                {activityData.activity.map((entry) => (
                  <tr key={entry.id} data-testid="activity-row">
                    <td className="activity-time">{formatDateTime(entry.createdAt)}</td>
                    <td>{entry.actor?.fullName ?? "System / unknown"}</td>
                    <td><span className="activity-action">{titleCase(entry.action)}</span></td>
                    <td>{titleCase(entry.entityType)}</td>
                    <td>{entry.description}</td>
                    <td>{entry.property ? `${entry.property.code}${entry.unitNumber ? ` / ${entry.unitNumber}` : ""}` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer className="activity-pagination">
            <span>
              Showing {activityData.pagination.offset + 1}-{Math.min(activityData.pagination.offset + activityData.activity.length, activityData.pagination.total)} of {activityData.pagination.total}
            </span>
            <div>
              <button
                type="button"
                className="button button-secondary"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - limit))}
              >
                Previous
              </button>
              <button
                type="button"
                className="button button-secondary"
                disabled={!activityData.pagination.hasMore}
                onClick={() => setOffset(offset + limit)}
              >
                Next
              </button>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}
