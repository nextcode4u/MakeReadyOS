export type Delimiter = "," | "\t" | ";";

export function splitDelimitedLine(line: string, delimiter: Delimiter) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

// Rows are parsed again after continuation merging; preserve embedded delimiters.
export function joinDelimitedLine(cells: string[], delimiter: Delimiter) {
  return cells.map(cell => cell.includes(delimiter) || /["\r\n]/.test(cell)
    ? `"${cell.replace(/"/g, '""')}"` : cell).join(delimiter);
}
