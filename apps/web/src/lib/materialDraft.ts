import type { TurnMaterial, TurnMaterials } from "./api";

export type MaterialEdit = { row: Omit<TurnMaterial, "quantity"> & { quantity: number | string }; snapshot: TurnMaterials };
type DraftEnvelope = { version: 1; userId: string; itemId: string; edit: MaterialEdit };
export const materialDraftKey = (userId: string, itemId: string) => `makereadyos:material-draft:${encodeURIComponent(userId)}:${encodeURIComponent(itemId)}`;

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const rowValid = (value: unknown) => object(value)
  && typeof value.id === "string" && value.id.length <= 80
  && typeof value.name === "string" && value.name.length <= 160
  && (typeof value.quantity === "number" && Number.isFinite(value.quantity) || typeof value.quantity === "string" && value.quantity.length <= 40)
  && typeof value.unit === "string" && value.unit.length <= 24
  && typeof value.notes === "string" && value.notes.length <= 1000
  && ["NEEDED", "ORDERED", "ON_HAND", "USED", "CANCELLED"].includes(String(value.status));

export function parseMaterialDraft(raw: string | null, userId: string, itemId: string): MaterialEdit | null {
  if (!raw || raw.length > 250000) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!object(value) || value.version !== 1 || value.userId !== userId || value.itemId !== itemId || !object(value.edit)) return null;
    const { row, snapshot } = value.edit;
    if (!rowValid(row) || !object(snapshot) || !Number.isSafeInteger(snapshot.version) || Number(snapshot.version) < 0
      || typeof snapshot.readOnly !== "boolean" || !Array.isArray(snapshot.rows) || snapshot.rows.length > 100 || !snapshot.rows.every(rowValid)) return null;
    return value.edit as MaterialEdit;
  } catch { return null; }
}

export function encodeMaterialDraft(userId: string, itemId: string, edit: MaterialEdit) {
  return JSON.stringify({ version: 1, userId, itemId, edit } satisfies DraftEnvelope);
}
