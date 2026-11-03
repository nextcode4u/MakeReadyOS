import assert from "node:assert/strict";
import test from "node:test";
import { convertAllUnitsXlsToCsv, normalizeAllUnitsDate } from "../apps/web/src/lib/allUnitsXls.ts";
import { allUnitsXlsFixture } from "./all-units-xls-fixture.ts";

const parse = (records: Parameters<typeof allUnitsXlsFixture>[0], date1904 = false) => {
  const buffer = allUnitsXlsFixture(records, date1904);
  return convertAllUnitsXlsToCsv(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
};

test("Crystal offsets preserve IDs and resident dates while excluding totals and occupancy", () => {
  const csv = parse([{ unit: "001", plan: "A1", sqft: 720, resident: "Example, Resident", moveIn: "01/15/2024", start: "02/01/2026", end: "01/31/2027" }]);
  assert.match(csv, /001,A1,720,"Example, Resident",2024-01-15,2026-02-01,2027-01-31/);
  assert.equal(csv.split("\n").length, 2);
  assert.doesNotMatch(csv, /occupancy|total|\brent\b|deposit/i);
});
test("missing optional values and alphabetic unit IDs remain importable", () => {
  const csv = parse([{ unit: "DEMO", resident: "Demo Resident" }]);
  assert.match(csv, /DEMO,,,Demo Resident,,,/);
});
test("blank dates and placeholder residents never clear existing data", () => {
  const csv = parse([{ unit: "101", resident: "VACANT", start: "01/01/2026" }, { unit: "102", resident: "MODEL" }]);
  assert.match(csv, /101,,,,,,/);
  assert.doesNotMatch(csv, /VACANT|MODEL|2026-01-01/);
});
test("dates are strictly validated and support Excel serials and 1904 dates", () => {
  assert.equal(normalizeAllUnitsDate(45292), "2024-01-01");
  assert.equal(normalizeAllUnitsDate(0, true), "1904-01-01");
  assert.match(parse([{ unit: "101", start: 0 }], true), /1904-01-01/);
  assert.throws(() => normalizeAllUnitsDate("02/30/2026"), /Invalid calendar date/);
  assert.throws(() => normalizeAllUnitsDate("not a date"), /Invalid date/);
  assert.throws(() => normalizeAllUnitsDate(60), /Invalid calendar date/);
});
test("reject duplicates, oversized imports, and non-XLS input", () => {
  assert.throws(() => parse([{ unit: "101" }, { unit: "101" }]), /Duplicate unit/);
  assert.throws(() => parse(Array.from({ length: 1501 }, (_, i) => ({ unit: String(i) }))), /1500/);
  assert.throws(() => convertAllUnitsXlsToCsv(new ArrayBuffer(10 * 1024 * 1024 + 1)), /10 MB/);
  assert.throws(() => convertAllUnitsXlsToCsv(new ArrayBuffer(8)), /binary Crystal/);
});
