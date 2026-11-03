import { createRequire } from "node:module";
import { resolve } from "node:path";

const { utils, write } = createRequire(resolve("apps/web/package.json"))("xlsx");

// Fictional public-demo records only. Never use private report data as fixtures.
export function allUnitsXlsFixture(records: Array<{ unit: string; resident?: string; moveIn?: string | number; start?: string | number; end?: string | number; plan?: string; sqft?: number }>, date1904 = false): Buffer {
  const header: unknown[] = [];
  for (const [col, text] of [[0, "Bldg/Unit"], [3, "Floorplan"], [12, "SQFT"], [43, "Name"], [61, "Move-In"], [66, "Lease\nStart"], [72, "Lease\nEnd"]] as const) header[col] = text;
  const rows: unknown[][] = [["ALL UNITS"], header];
  for (const record of records) {
    const row: unknown[] = [];
    for (const [col, value] of [[0, record.unit], [5, record.plan], [14, record.sqft], [43, record.resident], [60, record.moveIn], [66, record.start], [72, record.end]] as const) row[col] = value ?? "";
    rows.push(row, []);
  }
  rows.push([`${records.length} total for property:`], ["Floorplan"], ["Summary"]);
  const workbook = utils.book_new();
  workbook.Workbook = { WBProps: { date1904 } };
  utils.book_append_sheet(workbook, utils.aoa_to_sheet(rows), "All Units");
  return write(workbook, { type: "buffer", bookType: "biff8" });
}
