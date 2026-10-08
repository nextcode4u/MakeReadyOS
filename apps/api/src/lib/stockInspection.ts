export function isStockInspection(item: { vacancyStatus?: string | null; applicant?: string | null; moveInDate?: Date | string | null }) {
  const vacancy = String(item.vacancyStatus ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  return ["VACANT_NOT_LEASED_READY", "VACANT_NOT_LEASED_NOT_READY"].includes(vacancy)
    && !item.applicant?.trim() && !item.moveInDate;
}

export const moveInFolderCheck = "handoff-v2-2";
