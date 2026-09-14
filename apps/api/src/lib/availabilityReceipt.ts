type Receipt = { createdAt: Date; metadata: unknown };
function validDay(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

export function availabilityReceipt(receipt: Receipt | null) {
  if (!receipt) return null;
  const value = receipt.metadata;
  const metadata = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const known = metadata.receiptVersion === 1;
  const coverage = known && metadata.fullReport === true ? "FULL" : known && metadata.fullReport === false ? "PARTIAL" : "UNKNOWN";
  const explicit = known ? validDay(metadata.reportDate) : null;
  const invalidExplicit = known && metadata.reportDate != null && !explicit;
  const sources = known && Array.isArray(metadata.sourceReportDates) ? metadata.sourceReportDates : [];
  const dates = [...new Set(sources.map(validDay))];
  const reportDate = invalidExplicit ? null : explicit ?? (dates.length === 1 ? dates[0] : null);
  return {
    importedAt: receipt.createdAt.toISOString(), coverage, reportDate,
    dateIssue: reportDate ? null : invalidExplicit || dates.includes(null) ? "INVALID" : dates.length > 1 ? "MIXED" : "UNKNOWN",
  };
}
