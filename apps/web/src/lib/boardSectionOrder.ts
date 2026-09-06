import type { BoardSection, Property } from "./api";

const sectionTypeOrder = { READY: 0, MAKE_READY: 1, DOWN: 2, ARCHIVE: 3 };

// Keep equivalent workflow stages together across all properties.
export function orderBoardSections<T extends Pick<BoardSection, "key" | "propertyId" | "sectionType" | "sortOrder">>(
  sections: readonly T[],
  properties: readonly Pick<Property, "id" | "code">[],
): T[] {
  const propertyCodes = new Map(properties.map((property) => [property.id, property.code]));
  return [...sections].sort((left, right) =>
    sectionTypeOrder[left.sectionType] - sectionTypeOrder[right.sectionType]
    || (propertyCodes.get(left.propertyId) ?? left.propertyId).localeCompare(propertyCodes.get(right.propertyId) ?? right.propertyId)
    || left.sortOrder - right.sortOrder
    || left.key.localeCompare(right.key),
  );
}
