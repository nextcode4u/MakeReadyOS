type Section = { propertyId: string; key: string; sectionType: string };
type Item = { propertyId: string; boardGroup: string; vacancyStatus?: string | null };

export function pondEligible(item: Item, sections: Section[]) {
  return !["DOWN", "MODEL"].includes(String(item.vacancyStatus ?? "").trim().toUpperCase())
    && !sections.some(section => section.propertyId === item.propertyId && section.key === item.boardGroup && section.sectionType === "DOWN");
}
