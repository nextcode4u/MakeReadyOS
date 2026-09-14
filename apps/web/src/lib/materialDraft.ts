import type { TurnMaterial, TurnMaterials } from "./api";

export type MaterialEdit = { row: Omit<TurnMaterial, "quantity"> & { quantity: number | string }; snapshot: TurnMaterials };
type DraftEnvelope = { version: 1; userId: string; itemId: string; edit: MaterialEdit };
export const materialDraftKey = (userId: string, itemId: string) => `makereadyos:material-draft:${encodeURIComponent(userId)}:${encodeURIComponent(itemId)}`;

export function createMaterialId(random: Pick<Crypto, "getRandomValues"> & Partial<Pick<Crypto, "randomUUID">> = globalThis.crypto) {
  if (typeof random.randomUUID === "function") return random.randomUUID();
  // randomUUID requires a secure context; random bytes also work on local HTTP.
  const bytes = random.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const rowValid = (value: unknown) => object(value)
  && typeof value.id === "string" && value.id.length <= 80
  && typeof value.name === "string" && value.name.length <= 160
  && (typeof value.quantity === "number" && Number.isFinite(value.quantity) || typeof value.quantity === "string" && value.quantity.length <= 40)
  && typeof value.unit === "string" && value.unit.length <= 24
  && typeof value.notes === "string" && value.notes.length <= 1000
  && ["NEEDED", "NEED_TO_ORDER", "ORDERED", "ON_HAND", "USED", "CANCELLED"].includes(String(value.status));

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

const sameMaterial = (saved: TurnMaterial, draft: MaterialEdit["row"]) => saved.name === draft.name.trim()
  && saved.quantity === Number(draft.quantity) && saved.unit === draft.unit.trim()
  && saved.status === draft.status && saved.notes === draft.notes.trim();

export function reviewMaterialEdit(edit: MaterialEdit, latest: TurnMaterials) {
  if (latest.readOnly) throw new Error("This turn is now read-only. Your draft is preserved.");
  const saved = latest.rows.find(row => row.id === edit.row.id);
  if (saved && sameMaterial(saved, edit.row)) return { latest, alreadySaved: true };
  const original = edit.snapshot.rows.find(row => row.id === edit.row.id);
  if (original ? !saved || !sameMaterial(saved, original) : !!saved) {
    throw new Error("Someone changed this same parts line. Your draft is preserved; review the saved line with your team before retrying. No changes were overwritten.");
  }
  if (!original && latest.rows.length >= 100) throw new Error("The latest list already has 100 lines. Your draft is preserved.");
  return { latest, alreadySaved: false };
}

export function reviewMaterialAdditions(rows: MaterialEdit["row"][], latest: TurnMaterials) {
  if (latest.readOnly) throw new Error("This turn is now read-only. Your unsaved lines are still kept on this device.");
  const entered = rows.filter(row => row.name.trim() || String(row.quantity) !== "1" || row.unit !== "each");
  if (new Set(entered.map(row => row.id)).size !== entered.length) throw new Error("The draft contains duplicate line IDs. Review the draft before saving.");
  const additions: MaterialEdit["row"][] = [];
  let alreadySaved = 0;
  for (const row of entered) {
    const saved = latest.rows.find(candidate => candidate.id === row.id);
    if (!saved) { additions.push(row); continue; }
    if (!sameMaterial(saved, row)) throw new Error(`The saved line "${row.name}" differs from your draft. Your draft is preserved; review that line with your team before retrying.`);
    alreadySaved++;
  }
  if (latest.rows.length + additions.length > 100) throw new Error("The latest list and your additions exceed 100 lines. Your draft is preserved; shorten the list before retrying.");
  return { additions, alreadySaved, latest };
}
