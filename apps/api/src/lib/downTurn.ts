type Section = { key: string; sectionType: string };

export function isDownTurn(item: { vacancyStatus?: string | null; boardGroup?: string; property?: { boardSections?: Section[] } }, sections = item.property?.boardSections ?? []) {
  const status = (item.vacancyStatus ?? "").trim().toUpperCase();
  return ["DOWN", "MODEL"].includes(status)
    || item.boardGroup === "DOWN_AND_MODELS"
    || sections.some(section => section.key === item.boardGroup && section.sectionType === "DOWN");
}
