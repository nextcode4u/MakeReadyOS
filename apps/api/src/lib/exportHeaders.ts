export function customExportHeaders(fields: { id: string; label: string }[], builtInHeaders: string[]) {
  const reserved = new Set(builtInHeaders);
  const counts = new Map<string, number>();
  for (const field of fields) counts.set(field.label, (counts.get(field.label) ?? 0) + 1);
  const used = new Set([...reserved, ...fields.map(field => field.label)]);
  const headers = new Map<string, string>();
  for (const field of [...fields].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!reserved.has(field.label) && counts.get(field.label) === 1) {
      headers.set(field.id, field.label);
      continue;
    }
    const base = `${field.label} [custom:${field.id}]`;
    let header = base;
    let suffix = 2;
    while (used.has(header)) header = `${base} (${suffix++})`;
    used.add(header);
    headers.set(field.id, header);
  }
  return headers;
}
