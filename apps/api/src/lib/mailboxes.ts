import { createHash } from "node:crypto";
import { z } from "zod";

export const mailboxImportSchema = z.object({
  mode: z.enum(["DIRECTORY", "UNIT_NUMBER"]),
  text: z.string().max(200000).default(""),
  overwrite: z.boolean().default(false),
  skipInvalid: z.boolean().default(false),
  token: z.string().optional(),
}).strict();
type UnitMailbox = { id: string; number: string; mailboxNumber: string | null };

export function parseMailboxDirectory(text: string) {
  const delimiter = text.split(/\r?\n/, 1)[0].includes("\t") ? "\t" : ",";
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && char === delimiter) { row.push(cell.trim()); cell = ""; }
    else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  if (quoted) throw new Error("The directory has an unfinished quoted cell.");
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
  const header = (rows.shift() ?? []).map(value => value.replace(/^\uFEFF/, "").toLowerCase().replace(/[\s_-]/g, ""));
  const unitIndex = header.findIndex(value => ["unit", "unitnumber", "apartment"].includes(value));
  const mailboxIndex = header.findIndex(value => ["mailbox", "mailboxnumber", "mailboxno"].includes(value));
  if (unitIndex < 0 || mailboxIndex < 0 || header.length !== 2) throw new Error("Use exactly two columns: unit,mailbox. Do not include access codes.");
  if (!rows.length || rows.length > 5000) throw new Error("Provide between 1 and 5,000 directory rows.");
  return rows.map((values, index) => {
    if (values.length !== 2) throw new Error(`Row ${index + 2}: expected two columns.`);
    return { number: values[unitIndex], mailbox: values[mailboxIndex] };
  });
}

export function mailboxPlan(propertyId: string, units: UnitMailbox[], input: z.infer<typeof mailboxImportSchema>) {
  const rows = input.mode === "UNIT_NUMBER" ? units.map(unit => ({ number: unit.number, mailbox: unit.number })) : parseMailboxDirectory(input.text);
  // Normalize numeric identifiers as strings, preserving long numbers and alphanumeric units.
  const matchKey = (number: string) => input.mode === "DIRECTORY" && /^\d+$/.test(number)
    ? number.replace(/^0+(?=\d)/, "") : number.toUpperCase();
  const errors: string[] = [];
  const counts = new Map<string, number>();
  for (const row of rows) { const key = matchKey(row.number); counts.set(key, (counts.get(key) ?? 0) + 1); }
  const changes: { id: string; number: string; before: string | null; after: string; action: "UPDATE" | "KEEP" | "UNCHANGED" | "SKIP" }[] = [];
  for (const [index, row] of rows.entries()) {
    const key = matchKey(row.number);
    // Exclude every duplicate row, rather than silently importing the first assignment.
    if (!key || counts.get(key)! > 1) { errors.push(`Row ${index + 2}: missing or duplicate unit ${row.number}.`); continue; }
    const matches = units.filter(unit => matchKey(unit.number) === key);
    if (matches.length !== 1) { errors.push(`Row ${index + 2}: unit ${row.number} is unknown or ambiguous in this property. Import its unit directory first.`); continue; }
    if (row.mailbox.length > 40 || /[\r\n\x00-\x1f]/.test(row.mailbox)) { errors.push(`Row ${index + 2}: mailbox must be at most 40 characters on one line.`); continue; }
    const unit = matches[0];
    changes.push({ id: unit.id, number: unit.number, before: unit.mailboxNumber, after: row.mailbox, action: !row.mailbox ? "SKIP" : unit.mailboxNumber === row.mailbox ? "UNCHANGED" : unit.mailboxNumber && !input.overwrite ? "KEEP" : "UPDATE" });
  }
  const token = createHash("sha256").update(JSON.stringify({ propertyId, changes, errors })).digest("hex");
  return { token, changes, errors };
}
