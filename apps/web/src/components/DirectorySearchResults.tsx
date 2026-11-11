import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { getMakeReadyItemPage, type Unit } from "../lib/api";
import { UnitHistoryButton } from "./UnitHistoryButton";

export function DirectorySearchResults({ search, propertyId, units, language, onOpenItem }: { search: string; propertyId: string; units: Unit[]; language: string; onOpenItem: (id: string) => void }) {
  const es = language === "es";
  const [limit, setLimit] = useState(30);
  const query = search.trim().toLowerCase();
  const records = useInfiniteQuery({
    queryKey: ["make-ready-items", "directory-search", propertyId, query],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => getMakeReadyItemPage({ propertyId: propertyId || undefined, q: query, includeArchived: true, limit: 30, offset: pageParam }),
    getNextPageParam: page => page.pagination.hasMore && page.items.length ? page.pagination.nextOffset ?? page.pagination.offset + page.items.length : undefined,
    enabled: Boolean(query),
  });
  const turns = [...new Map((records.data?.pages.flatMap(page => page.items) ?? []).map(item => [item.id, item])).values()];
  const matches = units.filter(unit => (!propertyId || unit.propertyId === propertyId) && [unit.number, unit.currentResidentName, unit.property.code, unit.property.name].filter(Boolean).join(" ").toLowerCase().includes(query));
  return <section className="directory-search-results" aria-label={es ? "Buscar en todos los directorios" : "Search all directories"}>
    <h2>{es ? "Resultados en todos los directorios" : "Results across all directories"}</h2>
    <p>{es ? "Incluye unidades ocupadas y rotaciones archivadas, independientemente de los filtros del tablero. Se conserva la propiedad seleccionada." : "Includes occupied units and archived turns regardless of board filters. Your property selection still applies."}</p>
    {matches.slice(0, limit).map(unit => <div className="turn-row" key={unit.id}>
      <strong>{unit.property.code} {unit.number}</strong>
      <span className="status-chip">{!unit.isActive ? (es ? "Directorio inactivo" : "Inactive directory") : unit.occupancyStatus === "OCCUPIED" ? (es ? "Directorio de ocupadas" : "Occupied directory") : (es ? "Directorio de unidades" : "Unit directory")} / {unit.occupancyStatus}</span>
      <UnitHistoryButton unitId={unit.id} label={`${unit.property.code} ${unit.number}`} language={language} onOpenItem={onOpenItem} />
    </div>)}
    {records.isPending ? <p role="status">{es ? "Buscando rotaciones..." : "Searching turns..."}</p> : records.isError ? <p role="alert">{es ? "No se pudieron buscar las rotaciones." : "Could not search turns."} <button type="button" onClick={() => void records.refetch()}>{es ? "Reintentar" : "Retry"}</button></p> : <>
      {turns.map(item => <div className="turn-row" key={item.id}>
        <strong>{item.property.code} {item.unitNumber}</strong>
        <span className="status-chip">{item.isArchived ? (es ? "Rotación archivada" : "Archived turn") : (es ? "Rotación activa" : "Active turn")} / {item.vacancyStatus}</span>
        <span>{es ? "Entrada" : "Move-in"}: {item.moveInDate?.slice(0, 10) || "-"}</span>
        <button type="button" className="button button-secondary" onClick={() => onOpenItem(item.id)}>{es ? "Abrir rotación e informe" : "Open turn & report"}</button>
      </div>)}
      {!matches.length && !turns.length ? <p>{es ? "Sin resultados en ningún directorio." : "No matches in any directory."}</p> : null}
    </>}
    {matches.length > limit || records.hasNextPage ? <button type="button" className="button button-secondary" disabled={records.isFetching} onClick={() => { setLimit(value => value + 30); if (records.hasNextPage) void records.fetchNextPage(); }}>{es ? "Mostrar más" : "Show more"}</button> : null}
  </section>;
}
