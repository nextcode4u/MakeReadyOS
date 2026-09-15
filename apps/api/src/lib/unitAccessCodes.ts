import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { emptyReportDraft, savedReportDraftSchema } from "./finalWalkReport.js";

const code = z.string().max(60).regex(/^[^\x00-\x1f\x7f]*$/);
export const accessCodeValues = z.object({ doorCode: code, accessCode: code, keyCode: code }).strict();
export const unitMatchKey = (value: string) => /^\d+$/.test(value) ? value.replace(/^0+(?=\d)/, "") : value.toUpperCase();

export async function syncUnitCodes(db: Prisma.TransactionClient, unitId: string, value: Partial<z.infer<typeof accessCodeValues>>, skipItemId?: string) {
  const before = await db.unitAccessCode.findUnique({ where: { unitId } });
  if (before && Object.entries(value).every(([key, entry]) => before[key as keyof typeof value] === entry)) return;
  const saved = await db.unitAccessCode.upsert({ where: { unitId }, create: { unitId, ...value }, update: { ...value, version: { increment: 1 } } });
  if (before && before.doorCode === saved.doorCode && before.accessCode === saved.accessCode) return;
  if (!("doorCode" in value || "accessCode" in value)) return;
  const unit = await db.unit.findUniqueOrThrow({ where: { id: unitId } });
  const turns = await db.makeReadyItem.findMany({ where: { propertyId: unit.propertyId, isArchived: false, ...(skipItemId ? { id: { not: skipItemId } } : {}), OR: [{ unitId }, { unitId: null, unitNumber: unit.number }] }, include: { finalWalkReportDraft: true } });
  for (const turn of turns) {
    const parsed = savedReportDraftSchema.safeParse(turn.finalWalkReportDraft?.payload);
    if (turn.finalWalkReportDraft && !parsed.success) throw Object.assign(new Error("An existing report needs admin review before changing its codes"), { statusCode: 409 });
    const previous = parsed.success ? parsed.data.value : emptyReportDraft();
    const payload = { version: (parsed.success ? parsed.data.version : 0) + 1, updatedAt: new Date().toISOString(), value: { ...previous, residentDoorCode: saved.doorCode, residentAccessCode: saved.accessCode, handoffConfirmed: false } };
    await db.finalWalkReportDraft.upsert({ where: { itemId: turn.id }, create: { itemId: turn.id, payload }, update: { payload } });
  }
}

export async function syncTurnCodes(db: Prisma.TransactionClient, item: { id: string; propertyId: string; unitId: string | null; unitNumber: string }, value: { residentDoorCode?: string; residentAccessCode?: string }) {
  if (value.residentDoorCode === undefined && value.residentAccessCode === undefined) return;
  const unit = await db.unit.findFirst({ where: { propertyId: item.propertyId, ...(item.unitId ? { id: item.unitId } : { number: item.unitNumber }) } });
  if (!unit) return;
  await syncUnitCodes(db, unit.id, { ...(value.residentDoorCode !== undefined ? { doorCode: value.residentDoorCode } : {}), ...(value.residentAccessCode !== undefined ? { accessCode: value.residentAccessCode } : {}) }, item.id);
}

export function parseCodeCsv(text: string) {
  const delimiter = text.split(/\r?\n/, 1)[0].includes("\t") ? "\t" : ",";
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && char === delimiter) { row.push(cell); cell = ""; }
    else if (!quoted && /[\r\n]/.test(char)) { if (char === "\r" && text[i + 1] === "\n") i++; row.push(cell); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (quoted) throw new Error("Unfinished quoted CSV cell");
  row.push(cell); if (row.some(Boolean)) rows.push(row);
  const headers = (rows.shift() ?? []).map(v => v.replace(/^\uFEFF/, "").trim().toLowerCase());
  if (headers.join(",") !== "unit,doorcode,accesscode,keycode") throw new Error("Use columns: unit,doorCode,accessCode,keyCode");
  if (!rows.length || rows.length > 5000) throw new Error("Provide 1 to 5,000 rows");
  return rows.map((row, i) => {
    if (row.length !== 4) throw new Error(`Row ${i + 2}: expected four columns`);
    const result = accessCodeValues.safeParse({ doorCode: row[1], accessCode: row[2], keyCode: row[3] });
    if (!result.success || !row[0].trim()) throw new Error(`Row ${i + 2}: invalid unit or code (maximum 60 characters, no control characters)`);
    return { number: row[0].trim(), ...result.data };
  });
}
