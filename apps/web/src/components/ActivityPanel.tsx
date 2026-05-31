import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getActivity, isApiError } from "../lib/api";
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

export function ActivityPanel({ onSessionExpired }: Props) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [actorUserId, setActorUserId] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [offset, setOffset] = useState(0);
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

  useEffect(() => {
    if (isApiError(activityQuery.error) && activityQuery.error.status === 401) {
      onSessionExpired();
    }
  }, [activityQuery.error, onSessionExpired]);

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
