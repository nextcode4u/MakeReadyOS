import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { dailyActivityReportCsvUrl, getActivity, getDailyActivityReport, isApiError } from "../lib/api";
import { formatDateTime } from "../lib/dateTime";
import { StatusState } from "./StatusState";

type Props = {
  onSessionExpired: () => void;
  language?: string;
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

function reportCategoryLabel(value: string, isSpanish: boolean) {
  const labels: Record<string, string> = {
    totalChanges: isSpanish ? "Cambios totales" : "Total changes",
    markedReady: isSpanish ? "Marcado listo" : "Marked ready",
    availability: isSpanish ? "Importaciones de disponibilidad" : "Availability imports",
    archived: isSpanish ? "Archivado" : "Archived",
    restored: isSpanish ? "Restaurado" : "Restored",
    created: isSpanish ? "Creado" : "Created",
    updated: isSpanish ? "Actualizado" : "Updated",
    exception: isSpanish ? "Necesita revision" : "Needs review",
  };
  return labels[value] ?? titleCase(value);
}

export function ActivityPanel({ onSessionExpired, language = "en" }: Props) {
  const isSpanish = language === "es";
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
          <p className="eyebrow">{isSpanish ? "Auditoria de operaciones" : "Operations Audit"}</p>
          <h2>{isSpanish ? "Actividad" : "Activity"}</h2>
          <p className="subtitle">{isSpanish ? "Historial de solo lectura para eventos de seguridad, cambios en el tablero, configuracion y transferencias." : "Read-only history for security events, board changes, configuration, and transfers."}</p>
        </div>
        <button type="button" className="button button-secondary" onClick={() => void activityQuery.refetch()}>
          {isSpanish ? "Actualizar" : "Refresh"}
        </button>
      </header>

      <section className="activity-filters" aria-label={isSpanish ? "Filtros de actividad" : "Activity filters"}>
        <label>
          {isSpanish ? "Desde" : "From"}
          <input data-testid="activity-filter-from" type="date" value={from} onChange={(event) => updateFilter(setFrom, event.target.value)} />
        </label>
        <label>
          {isSpanish ? "Hasta" : "To"}
          <input data-testid="activity-filter-to" type="date" value={to} onChange={(event) => updateFilter(setTo, event.target.value)} />
        </label>
        <label>
          {isSpanish ? "Actor" : "Actor"}
          <select data-testid="activity-filter-actor" value={actorUserId} onChange={(event) => updateFilter(setActorUserId, event.target.value)}>
            <option value="">{isSpanish ? "Todos los actores" : "All actors"}</option>
            {activityQuery.data?.filterOptions.actors.map((actor) => (
              <option key={actor.id} value={actor.id}>{actor.fullName}</option>
            ))}
          </select>
        </label>
        <label>
          {isSpanish ? "Accion" : "Action"}
          <select data-testid="activity-filter-action" value={action} onChange={(event) => updateFilter(setAction, event.target.value)}>
            <option value="">{isSpanish ? "Todas las acciones" : "All actions"}</option>
            {activityQuery.data?.filterOptions.actions.map((entry) => (
              <option key={entry} value={entry}>{titleCase(entry)}</option>
            ))}
          </select>
        </label>
        <label>
          {isSpanish ? "Entidad" : "Entity"}
          <select data-testid="activity-filter-entity" value={entityType} onChange={(event) => updateFilter(setEntityType, event.target.value)}>
            <option value="">{isSpanish ? "Todos los tipos" : "All types"}</option>
            {activityQuery.data?.filterOptions.entityTypes.map((entry) => (
              <option key={entry} value={entry}>{titleCase(entry)}</option>
            ))}
          </select>
        </label>
        <label>
          {isSpanish ? "Propiedad" : "Property"}
          <select data-testid="activity-filter-property" value={propertyId} onChange={(event) => updateFilter(setPropertyId, event.target.value)}>
            <option value="">{isSpanish ? "Todas las propiedades" : "All properties"}</option>
            {activityQuery.data?.filterOptions.properties.map((property) => (
              <option key={property.id} value={property.id}>{property.code} - {property.name}</option>
            ))}
          </select>
        </label>
        <button type="button" className="button button-secondary activity-clear" onClick={clearFilters}>{isSpanish ? "Limpiar filtros" : "Clear filters"}</button>
      </section>

      <section className="daily-report-panel" aria-label={isSpanish ? "Reporte diario del gerente" : "Daily manager report"} data-testid="daily-manager-report">
        <div className="daily-report-heading">
          <div>
            <p className="eyebrow">{isSpanish ? "Reporte diario del gerente" : "Daily Manager Report"}</p>
            <h3>{isSpanish ? "Actividad de cambios, listos, importados y excepciones" : "Changed, ready, imported, and exception activity"}</h3>
            <p className="subtitle">{isSpanish ? "Usa este resumen diario para actualizar sistemas externos de propiedad sin revisar toda la auditoria." : "Use this daily summary to update external property systems without combing through the full audit trail."}</p>
          </div>
          <div className="daily-report-controls">
            <label>
              {isSpanish ? "Fecha del reporte" : "Report date"}
              <input
                data-testid="daily-report-date"
                type="date"
                value={reportDate}
                onChange={(event) => setReportDate(event.target.value)}
              />
            </label>
            <label>
              {isSpanish ? "Propiedad" : "Property"}
              <select
                data-testid="daily-report-property"
                value={reportPropertyId}
                onChange={(event) => setReportPropertyId(event.target.value)}
              >
                <option value="">{isSpanish ? "Todas las propiedades" : "All properties"}</option>
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
              {isSpanish ? "Exportar CSV" : "Export CSV"}
            </a>
          </div>
        </div>

        {reportQuery.isLoading ? (
          <StatusState title={isSpanish ? "Cargando reporte diario" : "Loading daily report"} description={isSpanish ? "Construyendo el resumen del gerente para el dia seleccionado." : "Building the manager summary for the selected day."} />
        ) : reportQuery.isError ? (
          <StatusState
            title={isSpanish ? "No se pudo cargar el reporte diario" : "Daily report failed to load"}
            description={reportQuery.error instanceof Error ? reportQuery.error.message : (isSpanish ? "Actualiza e intenta de nuevo." : "Refresh and try again.")}
            tone="error"
            action={{ label: isSpanish ? "Reintentar" : "Retry", onClick: () => void reportQuery.refetch() }}
          />
        ) : reportQuery.data ? (
          <>
            <div className="daily-report-summary">
              {(["totalChanges", "markedReady", "availability", "archived", "created", "updated", "exception"] as const).map((key) => (
                <div key={key} className={`daily-report-stat daily-report-stat-${key}`}>
                  <strong>{reportQuery.data.summary[key]}</strong>
                  <span>{reportCategoryLabel(key, isSpanish)}</span>
                </div>
              ))}
            </div>
            {reportQuery.data.records.length === 0 ? (
              <div className="daily-report-empty">
                {isSpanish ? "No hay actividad reportable para este dia y alcance de propiedad." : "No reportable activity for this day and property scope."}
              </div>
            ) : (
              <div className="daily-report-list">
                {reportQuery.data.records.slice(0, 12).map((record) => (
                  <article key={record.id} className={`daily-report-row daily-report-row-${record.category}`}>
                    <div>
                      <span className="daily-report-chip">{reportCategoryLabel(record.category, isSpanish)}</span>
                      <strong>{record.property ? `${record.property.code}${record.unitNumber ? ` / ${record.unitNumber}` : ""}` : record.unitNumber ?? (isSpanish ? "Sistema" : "System")}</strong>
                      <span>{formatDateTime(record.at)}</span>
                    </div>
                    <p>{record.description}</p>
                    <small>{record.externalActionHint}</small>
                  </article>
                ))}
                {reportQuery.data.records.length > 12 ? (
                  <p className="daily-report-more">
                    {isSpanish ? `Mostrando los primeros 12 de ${reportQuery.data.records.length}. Exporta CSV para el reporte completo del gerente.` : `Showing first 12 of ${reportQuery.data.records.length}. Export CSV for the full manager report.`}
                  </p>
                ) : null}
              </div>
            )}
          </>
        ) : null}
      </section>

      {activityQuery.isLoading ? (
        <StatusState title={isSpanish ? "Cargando actividad" : "Loading activity"} description={isSpanish ? "Obteniendo los eventos de auditoria mas recientes disponibles para tu rol." : "Fetching the latest audit events available to your role."} />
      ) : activityQuery.isError ? (
        <StatusState
          title={isSpanish ? "No se pudo cargar la actividad" : "Activity failed to load"}
          description={activityQuery.error instanceof Error ? activityQuery.error.message : (isSpanish ? "Actualiza e intenta de nuevo." : "Refresh and try again.")}
          tone="error"
          action={{ label: isSpanish ? "Reintentar" : "Retry", onClick: () => void activityQuery.refetch() }}
        />
      ) : !activityData ? (
        <StatusState title={isSpanish ? "Actividad no disponible" : "Activity unavailable"} description={isSpanish ? "No se devolvio respuesta de actividad. Actualiza e intenta de nuevo." : "No activity response was returned. Refresh and try again."} tone="error" />
      ) : activityData.activity.length === 0 ? (
        <StatusState title={isSpanish ? "No hay actividad coincidente" : "No matching activity"} description={isSpanish ? "Ningun evento de auditoria coincide con los filtros seleccionados o con tu acceso de propiedad." : "No audit events match the selected filters or your property access."} tone="subtle" />
      ) : (
        <>
          <div className="activity-table-wrap">
            <table className="activity-table" data-testid="activity-table">
              <thead>
                <tr>
                  <th>{isSpanish ? "Fecha y hora" : "Timestamp"}</th>
                  <th>{isSpanish ? "Actor" : "Actor"}</th>
                  <th>{isSpanish ? "Accion" : "Action"}</th>
                  <th>{isSpanish ? "Entidad" : "Entity"}</th>
                  <th>{isSpanish ? "Descripcion" : "Description"}</th>
                  <th>{isSpanish ? "Propiedad / Unidad" : "Property / Unit"}</th>
                </tr>
              </thead>
              <tbody>
                {activityData.activity.map((entry) => (
                  <tr key={entry.id} data-testid="activity-row">
                    <td className="activity-time">{formatDateTime(entry.createdAt)}</td>
                    <td>{entry.actor?.fullName ?? (isSpanish ? "Sistema / desconocido" : "System / unknown")}</td>
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
              {isSpanish
                ? `Mostrando ${activityData.pagination.offset + 1}-${Math.min(activityData.pagination.offset + activityData.activity.length, activityData.pagination.total)} de ${activityData.pagination.total}`
                : `Showing ${activityData.pagination.offset + 1}-${Math.min(activityData.pagination.offset + activityData.activity.length, activityData.pagination.total)} of ${activityData.pagination.total}`}
            </span>
            <div>
              <button
                type="button"
                className="button button-secondary"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - limit))}
              >
                {isSpanish ? "Anterior" : "Previous"}
              </button>
              <button
                type="button"
                className="button button-secondary"
                disabled={!activityData.pagination.hasMore}
                onClick={() => setOffset(offset + limit)}
              >
                {isSpanish ? "Siguiente" : "Next"}
              </button>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}
