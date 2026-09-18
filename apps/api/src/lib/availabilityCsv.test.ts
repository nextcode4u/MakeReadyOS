import assert from "node:assert/strict";
import { test } from "node:test";

test("availability continuation serialization preserves applicant commas and report-date columns", async () => {
  const { splitDelimitedLine, joinDelimitedLine } = await import(new URL("../../../web/src/lib/delimitedRows.ts", import.meta.url).href);
  const row = '011,B1,1186,NTV Leased,NTV LEASED,2026-10-30,,-43,2026-11-09,2026-11-10,"Smith, Jaiah Dartanyon",2026-09-17,2026-09-09,,,';
  const cells = splitDelimitedLine(row, ",");
  const reread = splitDelimitedLine(joinDelimitedLine(cells, ","), ",");
  assert.deepEqual(reread, cells);
  assert.equal(reread.length, 16);
  assert.equal(reread[10], "Smith, Jaiah Dartanyon");
  assert.equal(reread[11], "2026-09-17");
  assert.equal(reread[12], "2026-09-09");
  for (const delimiter of [",", ";", "\t"]) {
    const values = ["011", `Name${delimiter} Other`, 'Name "Nickname"', "2026-09-17", "", ""];
    assert.deepEqual(splitDelimitedLine(joinDelimitedLine(values, delimiter), delimiter), values);
  }
  cells[10] += " Another Applicant";
  assert.equal(splitDelimitedLine(joinDelimitedLine(cells, ","), ",")[11], "2026-09-17");
});
