type Assignment = { category: string; status: string };

export function upcomingMoveInWindow(start: string, moveIn: string | null | undefined, language: "en" | "es") {
  const day = (value: string) => {
    const date = value.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NaN;
    const time = Date.parse(`${date}T00:00:00Z`);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date ? time : NaN;
  };
  if (!moveIn) return null;
  // Compare calendar dates, not local timestamps that vary across DST boundaries.
  const days = (day(moveIn) - day(start)) / 86400000;
  if (!Number.isInteger(days)) return null;
  const label = days < 0
    ? language === "es" ? `Alerta: mudanza ${-days} ${days === -1 ? "día" : "días"} antes del inicio` : `Warning: move-in ${-days} ${days === -1 ? "day" : "days"} before start`
    : days === 0
      ? language === "es" ? "0 días entre inicio y mudanza: mismo día" : "0 days between start and move-in: same day"
      : language === "es" ? `${days} ${days === 1 ? "día" : "días"} entre inicio y mudanza` : `${days} ${days === 1 ? "day" : "days"} between start and move-in`;
  return { days, label, warning: days <= 0 };
}

export function turnWorkCategory(blocks?: Assignment[]) {
  if (hasActiveCorrections(blocks)) return "follow-ups";
  if (blocks?.some(block => block.category === "FINAL_WALK_INSPECTION" && ["PLANNED", "IN_PROGRESS"].includes(block.status))) return "inspections";
  return "make-ready";
}

export function moveInCountdown(days: number | null, language: "en" | "es") {
  if (days === null || !Number.isInteger(days)) return "";
  if (days === 0) return language === "es" ? "Mudanza hoy" : "Move-in today";
  if (days < 0) return language === "es"
    ? `Fecha de mudanza hace ${-days} ${days === -1 ? "dia" : "dias"}`
    : `Move-in date was ${-days} ${days === -1 ? "day" : "days"} ago`;
  return language === "es"
    ? `${days} ${days === 1 ? "dia" : "dias"} para la mudanza`
    : `${days} ${days === 1 ? "day" : "days"} till move-in`;
}

export function hasActiveCorrections(blocks?: Assignment[]) {
  return blocks?.some(block => block.category === "FINAL_WALK_CORRECTION" && ["PLANNED", "IN_PROGRESS"].includes(block.status)) ?? false;
}

export function workCategoryLabel(category: string, language: "en" | "es") {
  if (category === "FINAL_WALK_CORRECTION") return language === "es" ? "Correcciones de inspeccion final" : "Final-walk corrections";
  if (category === "FINAL_WALK_INSPECTION") return language === "es" ? "Inspeccion final" : "Final walk inspection";
  return category.replace(/_/g, " ");
}
