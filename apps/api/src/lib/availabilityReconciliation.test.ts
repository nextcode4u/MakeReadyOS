import assert from "node:assert/strict";
import test from "node:test";
import { availabilityArchivePlan, missingReadyTurns, reconciliationDate } from "./availabilityReconciliation.js";

const date = (value: string) => new Date(`${value}T00:00:00Z`);
const base: Parameters<typeof missingReadyTurns>[0][number] = { id: "turn", unitId: "unit", unitNumber: "011", boardGroup: "ready", vacancyStatus: "VACANT LEASED READY",
  moveInDate: date("2026-09-10"), updatedAt: date("2026-09-11"), isArchived: false, makeReadyStatus: "DONE", completionStatus: "NO",
  unit: { isActive: true, occupancyStatus: "VACANT LEASED READY" } };
const sections = [{ key: "ready", sectionType: "READY" }, { key: "down", sectionType: "DOWN" }, { key: "archive", sectionType: "ARCHIVE" }];
test("missing ready turns require an elapsed move-in and preserve partial, future, down, and ambiguous work", () => {
  const eligible = (item = base, numbers: string[] = []) => missingReadyTurns([item], sections, numbers, "2026-09-13");
  assert.equal(eligible().length, 1);
  for (const number of ["011", "11", " 0011 "]) assert.equal(eligible(base, [number]).length, 0);
  for (const override of [
    { moveInDate: null }, { moveInDate: date("2026-09-13") }, { moveInDate: date("2026-09-14") },
    { updatedAt: date("2026-09-14") }, { isArchived: true }, { unitId: null }, { unit: null },
    { boardGroup: "down" }, { vacancyStatus: "DOWN" }, { makeReadyStatus: "FINAL_WALK" },
    { unit: { ...base.unit!, occupancyStatus: "NTV LEASED" } }, { unit: { ...base.unit!, isActive: false } },
    { boardGroup: "work", vacancyStatus: "VACANT NOT LEASED NOT READY", completionStatus: "NO" },
  ]) assert.equal(eligible({ ...base, ...override }).length, 0, JSON.stringify(override));
  assert.equal(missingReadyTurns([base, { ...base, id: "other" }], sections, [], "2026-09-13").length, 0);
  assert.equal(reconciliationDate("2026-09-13", date("2026-09-13")), "2026-09-13");
  for (const invalid of [undefined, "", "2026-02-30", "2026-09-14"]) assert.throws(() => reconciliationDate(invalid, date("2026-09-13")));
});

test("archive previews are property scoped and invalidated by changes to rows or live candidates", async () => {
  let item = { ...base };
  const db = {
    boardSection: { findMany: async ({ where }: any) => { assert.equal(where.propertyId, "ta"); return sections; } },
    makeReadyItem: { findMany: async ({ where }: any) => { assert.equal(where.propertyId, "ta"); assert.equal(where.isArchived, false); return [item]; } },
  } as any;
  const input = { propertyId: "ta", rows: [{ number: "100" }], reportDate: "2026-09-13" };
  const first = await availabilityArchivePlan(db, input);
  assert.equal(first.candidates.length, 1);
  assert.equal(first.archiveSection?.key, "archive");
  assert.equal((await availabilityArchivePlan(db, { ...input, previewOnly: true } as any)).token, first.token);
  assert.notEqual((await availabilityArchivePlan(db, { ...input, rows: [{ number: "11" }] })).token, first.token);
  item = { ...base, updatedAt: date("2026-09-12") };
  assert.notEqual((await availabilityArchivePlan(db, input)).token, first.token);
  await assert.rejects(() => availabilityArchivePlan(db, { ...input, rows: [{ number: "100", reportDate: "2026-09-12" }] }), /match/);
});
