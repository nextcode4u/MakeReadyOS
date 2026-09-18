// Report dates are calendar labels, never local-time instants.
export function reportDay(value: string | null | undefined): string | null {
  const input = value?.trim();
  if (!input) return null;
  const iso = input.match(/^(\d{4}-\d{2}-\d{2})(?:$|T)/);
  const slash = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const day = iso?.[1] ?? (slash ? `${slash[3]}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}` : null);
  if (!day) return null;
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day ? day : null;
}

export function resolveReportDay(rows: Array<{ number: string; reportDate?: string | null }>, selected?: string) {
  const dated = rows.filter(row => row.reportDate?.trim());
  const invalid = dated.filter(row => !reportDay(row.reportDate));
  if (invalid.length) throw Object.assign(new Error(`Invalid reportDate for units: ${invalid.map(row => `${row.number} (${row.reportDate})`).join(", ")}. Use YYYY-MM-DD.`), { statusCode: 400 });
  const dates = [...new Set(dated.map(row => reportDay(row.reportDate)!))];
  if (dates.length > 1) throw Object.assign(new Error(`Report dates do not match: ${dated.map(row => `${row.number}: ${reportDay(row.reportDate)}`).join(", ")}. Use one complete report from the same date.`), { statusCode: 400 });
  if (selected && (!reportDay(selected) || dates.length && reportDay(selected) !== dates[0])) throw Object.assign(new Error(`Selected report date ${selected} does not match the file report date ${dates[0] ?? "(missing)"}.`), { statusCode: 400 });
  return dates[0] ?? reportDay(selected) ?? undefined;
}
