import type { MyWorkCue } from "../lib/myWorkCue";
import type { UserLanguage } from "../lib/api";

export function myWorkBadgeDescription(cue: MyWorkCue | undefined, unavailable: boolean, language: UserLanguage) {
  if (unavailable) return language === "es" ? "Conteo de trabajo no disponible temporalmente" : "Work count temporarily unavailable";
  if (!cue) return language === "es" ? "Cargando asignaciones" : "Loading assignments";
  return language === "es"
    ? `${cue.total} asignaciones abiertas en todas sus propiedades; ${cue.overdue} vencidas; ${cue.corrections} con correcciones de inspeccion final`
    : `${cue.total} open assignments across your properties; ${cue.overdue} overdue; ${cue.corrections} with final-walk corrections`;
}

export function MyWorkBadge({ cue, unavailable = false }: { cue?: MyWorkCue; unavailable?: boolean }) {
  if (unavailable) return <span className="my-work-count unavailable" aria-hidden="true" data-testid="my-work-count">?</span>;
  if (!cue?.total) return null;
  const attention = cue.overdue > 0 || cue.corrections > 0;
  return <span className={`my-work-count ${attention ? "attention" : "pending"}`} aria-hidden="true" data-testid="my-work-count">
    {attention ? "! " : ""}{cue.total > 99 ? "99+" : cue.total}
  </span>;
}
