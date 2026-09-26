import { useQuery } from "@tanstack/react-query";
import { getPondMilestones, type UserLanguage } from "../lib/api";

export function PondTeamMilestones({ propertyId, viewerId, language }: { propertyId: string; viewerId: string; language: UserLanguage }) {
  const spanish = language === "es";
  const query = useQuery({
    queryKey: ["pond-milestones", viewerId, propertyId],
    queryFn: () => getPondMilestones(propertyId),
    refetchInterval: 60000,
  });
  return <details className="frog-settings pond-team-milestones" data-testid="pond-team-milestones" open={Boolean(propertyId)}>
    <summary>{spanish ? "Logros del equipo" : "Team milestones"}<span>{spanish ? "Compartidos por propiedad" : "Shared by property"}</span></summary>
    <p className="muted">{spanish ? "Cada turno aprobado cuenta una vez para todo el equipo: tecnicos, pintores, limpieza y arrendamiento. Sin clasificaciones ni carreras." : "Each approved turn counts once for the whole team: technicians, painters, cleaners, and leasing. No rankings or races."}</p>
    {query.isPending ? <p role="status">{spanish ? "Cargando logros..." : "Loading milestones..."}</p> : query.isError ? <p role="status">{spanish ? "No se pudieron actualizar los logros." : "Milestones could not be refreshed."} <button type="button" className="button button-secondary" onClick={() => void query.refetch()}>{spanish ? "Reintentar" : "Retry"}</button></p> : <>
      {!query.data.properties.length ? <p>{spanish ? "No hay propiedades activas en esta vista." : "No active properties in this view."}</p> : null}
      {query.data.properties.map(property => {
        const earned = query.data.milestones.filter(entry => entry.goal <= property.completedTurns);
        const latest = earned[earned.length - 1];
        const next = query.data.milestones.find(entry => entry.goal > property.completedTurns);
        return <section key={property.id} className="pond-team-progress" data-testid={`pond-team-${property.id}`} aria-label={property.name}>
          <div><strong>{property.code} / {property.name}</strong><span>{property.completedTurns} {spanish ? (property.completedTurns === 1 ? "turno aprobado" : "turnos aprobados") : (property.completedTurns === 1 ? "approved turn" : "approved turns")}</span></div>
          {latest ? <strong className="pond-team-earned">{spanish ? "Logro obtenido" : "Milestone earned"}: {latest.name}</strong> : <span>{spanish ? "El primer logro llega con el primer turno aprobado." : "Your first milestone starts with one approved turn."}</span>}
          {next ? <><progress value={property.completedTurns} max={next.goal} aria-label={`${property.name}: ${next.name}`} /><small>{spanish ? "Siguiente" : "Next"}: {next.name} / {property.completedTurns} {spanish ? "de" : "of"} {next.goal}</small></> : <small>{spanish ? "Todos los logros obtenidos. Cada nuevo turno sigue contando." : "All milestones earned. Every new approved turn still counts."}</small>}
          <details><summary>{spanish ? "Ver todos los logros" : "View all milestones"}</summary><ul>{query.data.milestones.map(entry => <li key={entry.goal}>{entry.goal <= property.completedTurns ? (spanish ? "Obtenido" : "Earned") : (spanish ? "Proximo" : "Upcoming")} / {entry.goal}: {entry.name}</li>)}</ul></details>
        </section>;
      })}
    </>}
    <small className="muted">{spanish ? "Cuenta nuevas aprobaciones desde que se activo esta funcion, no unidades importadas ni anulaciones administrativas. Reabrir no agrega credito. Los estilos y descubrimientos siguen siendo personales." : "Tracks new approvals since this feature was enabled, not imported ready units or administrative overrides. Reopening never adds credit. Outfits and discoveries remain personal."}</small>
  </details>;
}
