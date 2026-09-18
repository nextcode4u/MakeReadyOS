export function availabilityReportDate(rows: Array<{ number: string; reportDate?: string | null }>) {
  const dated = rows.filter(row => row.reportDate);
  const invalid = dated.filter(row => {
    const value = row.reportDate!;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return true;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value;
  });
  if (invalid.length) return { date: "", error: `Invalid report dates: ${invalid.map(row => `${row.number}: ${row.reportDate}`).join(", ")}. Use YYYY-MM-DD.` };
  const dates = [...new Set(dated.map(row => row.reportDate!))];
  if (dates.length > 1) return { date: "", error: `Conflicting report dates in file: ${dated.map(row => `${row.number}: ${row.reportDate}`).join(", ")}. Use one report date.` };
  return { date: dates[0] ?? "", error: "" };
}
