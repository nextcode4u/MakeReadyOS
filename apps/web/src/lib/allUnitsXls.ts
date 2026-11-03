import { read, utils, SSF } from "xlsx";
import { joinDelimitedLine } from "./delimitedRows";

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 20000;
const headers = ["bldgunit", "floorPlan", "sqft", "currentResidentName", "currentResidentMoveInDate", "currentResidentLeaseStartDate", "currentResidentLeaseEndDate"];
const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
const key = (value: unknown) => clean(value).toLowerCase().replace(/[^a-z0-9]/g, "");

export function normalizeAllUnitsDate(value: unknown, date1904 = false): string {
  if (!clean(value) || /^(?:-|n\/a)$/i.test(clean(value))) return "";
  let year: number, month: number, day: number;
  if (typeof value === "number") {
    const parsed = SSF.parse_date_code(value, { date1904 });
    if (!parsed) throw new Error("Invalid date in All Units report.");
    ({ y: year, m: month, d: day } = parsed);
  } else {
    const text = clean(value);
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
    if (iso) [, year, month, day] = iso.map(Number);
    else if (us) [, month, day, year] = us.map(Number);
    else throw new Error("Invalid date in All Units report. Use MM/DD/YYYY or YYYY-MM-DD.");
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || year > 9999 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("Invalid calendar date in All Units report.");
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Crystal Reports uses different cell anchors for labels and their data. */
export function convertAllUnitsXlsToCsv(data: ArrayBuffer): string {
  if (data.byteLength > MAX_BYTES) throw new Error("All Units XLS must be 10 MB or smaller.");
  const signature = new Uint8Array(data, 0, Math.min(8, data.byteLength));
  if (![0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((byte, i) => signature[i] === byte)) {
    throw new Error("Choose a binary Crystal Reports All Units .xls export.");
  }
  let workbook;
  try {
    workbook = read(data, { type: "array", cellFormula: false, cellHTML: false, cellDates: false, sheetRows: MAX_ROWS + 1 });
  } catch {
    throw new Error("Could not read All Units XLS. Export the report again and retry.");
  }
  const output: string[][] = [];
  const seen = new Set<string>();
  let recognized = false;
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const range = utils.decode_range(sheet["!fullref"] ?? sheet["!ref"] ?? "A1");
    if (range.e.r >= MAX_ROWS || range.e.c > 255) throw new Error("All Units report exceeds supported dimensions.");
    const rows = utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" });
    if (!rows.some(row => row.some(cell => key(cell) === "allunits"))) continue;
    let inUnits = false;
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (key(row[0]) === "bldgunit") {
        const expected: Array<[number, string]> = [[3, "floorplan"], [12, "sqft"], [43, "name"], [61, "movein"], [66, "leasestart"], [72, "leaseend"]];
        if (!expected.every(([col, label]) => key(row[col]) === label)) throw new Error("Unsupported All Units column layout. Use the Crystal Reports All Units export.");
        recognized = inUnits = true;
        continue;
      }
      if (!inUnits) continue;
      const unit = clean(sheet[utils.encode_cell({ r, c: 0 })]?.w ?? row[0]);
      if (/total for property\s*:/i.test(unit) || key(unit) === "floorplan") {
        inUnits = false;
        continue;
      }
      if (!unit || /\btotal for\s*:/i.test(unit)) continue;
      if (!/^[a-z0-9][a-z0-9 /_-]*$/i.test(unit)) throw new Error(`Unrecognized unit row ${r + 1} in All Units report.`);
      const plan = clean(row[5]);
      const sqftText = clean(row[14]);
      const sqft = Number(sqftText.replace(/,/g, ""));
      if (sqftText && (!Number.isFinite(sqft) || sqft < 0)) throw new Error(`Invalid square footage on All Units row ${r + 1}.`);
      if (seen.has(unit.toUpperCase())) throw new Error("Duplicate unit in All Units report. Import one property's report at a time.");
      seen.add(unit.toUpperCase());
      const resident = clean(row[43]);
      const placeholder = /^(?:vacant|unoccupied|model|down|n\/a|-)$/i.test(resident);
      const dates = placeholder ? ["", "", ""] : [60, 66, 72].map(col => normalizeAllUnitsDate(row[col], Boolean(workbook.Workbook?.WBProps?.date1904)));
      // Status and financial fields are intentionally excluded. This is directory data, not availability evidence.
      output.push([unit, plan, sqftText ? String(sqft) : "", placeholder ? "" : resident, ...dates]);
      if (output.length > 1500) throw new Error("Import at most 1500 units at a time.");
    }
  }
  if (!recognized || !output.length) throw new Error("No unit rows found in a supported Crystal Reports All Units report.");
  return [headers, ...output].map(row => joinDelimitedLine(row, ",")).join("\n");
}

export async function readAllUnitsXls(file: File): Promise<string> {
  if (file.size > MAX_BYTES) throw new Error("All Units XLS must be 10 MB or smaller.");
  return convertAllUnitsXlsToCsv(await file.arrayBuffer());
}
