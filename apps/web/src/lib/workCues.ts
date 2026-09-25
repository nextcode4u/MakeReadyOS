type Assignment = { category: string; status: string };

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
