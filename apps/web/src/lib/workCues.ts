type Assignment = { category: string; status: string };

export function hasActiveCorrections(blocks?: Assignment[]) {
  return blocks?.some(block => block.category === "FINAL_WALK_CORRECTION" && ["PLANNED", "IN_PROGRESS"].includes(block.status)) ?? false;
}

export function workCategoryLabel(category: string, language: "en" | "es") {
  if (category === "FINAL_WALK_CORRECTION") return language === "es" ? "Correcciones de inspeccion final" : "Final-walk corrections";
  if (category === "FINAL_WALK_INSPECTION") return language === "es" ? "Inspeccion final" : "Final walk inspection";
  return category.replace(/_/g, " ");
}
