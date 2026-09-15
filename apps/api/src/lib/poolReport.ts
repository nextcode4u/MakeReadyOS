import type { Prisma } from "@prisma/client";

export type PoolReportEntry = Prisma.PoolLogEntryGetPayload<{ include: { property: true; facility: true; safetyChecks: true; chemicalAdditions: true; attachments: true } }>;
const escape = (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
export const poolReadingFields = [
  ["ph", "pH", ""],
  ["freeChlorine", "Free chlorine", "ppm"],
  ["combinedChlorine", "Combined chlorine", "ppm"],
  ["totalChlorine", "Total chlorine", "ppm"],
  ["totalAlkalinity", "Total alkalinity", "ppm"],
  ["cyanuricAcid", "Cyanuric acid (stabilizer)", "ppm"],
  ["calciumHardness", "Calcium hardness", "ppm"],
  ["waterTemperature", "Water temperature", "as recorded"],
] as const;
export const poolObservationFields = [
  ["vacuumed", "Vacuumed"], ["backwashed", "Backwashed"], ["skimmerCleaned", "Skimmer cleaned"],
  ["pumpRunning", "Pump running"], ["filterOperating", "Filter operating"],
  ["waterClear", "Water clear"], ["waterCloudy", "Water cloudy"], ["algaePresent", "Algae present"],
] as const;

export function renderPoolReport(entries: PoolReportEntry[], scope: string, formatAmount: (amount: number, unit: string) => string, options: { from?: string; to?: string; printable?: boolean; generatedAt?: Date } = {}) {
  const sections = entries.map((entry, index) => {
    const evaluation = entry.evaluationJson as { status?: string; issues?: Array<{ message?: string }> } | null;
    const missing = poolReadingFields.filter(([key]) => entry[key] == null).length;
    const status = evaluation?.status || "Not evaluated";
    return `<article class="entry">
      <header><p class="eyebrow">POOL / SPA OPERATING LOG &middot; ENTRY ${index + 1} OF ${entries.length}</p><h2>${escape(entry.property.code)} &mdash; ${escape(entry.facility.name)}</h2>
      <p>${escape(entry.property.name)} &middot; ${escape(entry.facility.type.replaceAll("_", " "))}</p>
      <p><strong>${escape(entry.logDate.toISOString().slice(0, 10))} ${escape(entry.logTime || "Time not recorded")}</strong> &middot; Technician: ${escape(entry.technicianName || "Not recorded")}</p></header>
      <div class="status"><strong>Recorded assessment: ${escape(status)}</strong> &middot; ${8 - missing}/8 readings recorded</div>
      <h3>Water chemistry</h3><div class="readings">${poolReadingFields.map(([key, label, unit]) => `<div class="reading"><span>${label}</span><strong>${entry[key] == null ? '<em>Not recorded</em>' : `${escape(entry[key])}${unit ? ` <small>${unit}</small>` : ""}`}</strong></div>`).join("")}</div>
      <p class="helper">Concentrations are in ppm; pH is unitless. Temperature is shown as entered because the log does not store a temperature unit. Missing readings are not zero or a passing result.</p>
      <h3>Recorded chemistry / review findings</h3>${evaluation?.issues?.length ? `<ul>${evaluation.issues.map(issue => `<li>${escape(issue.message || "Finding without a recorded description")}</li>`).join("")}</ul>` : `<p>${evaluation ? "No findings recorded in the saved assessment." : "No assessment recorded."}</p>`}
      <h3>Chemicals added</h3>${entry.chemicalAdditions.length ? `<table><thead><tr><th>Product</th><th class="amount">Amount</th><th>Notes</th></tr></thead><tbody>${entry.chemicalAdditions.map(addition => `<tr><td>${escape(addition.chemicalName)}</td><td>${escape(formatAmount(addition.amount, addition.unit))}</td><td>${escape(addition.notes || "None recorded")}</td></tr>`).join("")}</tbody></table>` : "<p>No chemical additions recorded.</p>"}
      <h3>Safety checks</h3>${entry.safetyChecks.length ? `<table><thead><tr><th>Check</th><th class="amount">Result</th><th>Notes</th></tr></thead><tbody>${[...entry.safetyChecks].sort((a, b) => a.sortOrder - b.sortOrder).map(check => `<tr><td>${escape(check.label)}</td><td>${escape(check.value.replaceAll("_", " "))}</td><td>${escape(check.notes || "None recorded")}</td></tr>`).join("")}</tbody></table>` : "<p>No safety checks recorded.</p>"}
      <h3>Maintenance and water observations</h3><div class="observations">${poolObservationFields.map(([key, label]) => `<p><strong>${label}:</strong> ${entry[key] ? "Yes" : "Not marked"}</p>`).join("")}</div>
      <p class="helper">Unchecked observations are shown as Not marked; older logs do not distinguish a negative observation from one that was omitted.</p>
      <h3>Technician notes</h3><p class="notes">${escape(entry.notes || "No notes recorded.")}</p>
      <h3>Attachments (${entry.attachments.length})</h3>${entry.attachments.length ? `<ul>${entry.attachments.map(file => `<li>${escape(file.originalName)}${file.notes ? ` &mdash; ${escape(file.notes)}` : ""}</li>`).join("")}</ul><p class="helper">Files are listed, not embedded. Download originals from the pool log.</p>` : "<p>No attachments recorded.</p>"}
      <p class="helper">Record ID: ${escape(entry.id)} &middot; Last updated: ${escape(entry.updatedAt.toISOString())}</p>
    </article>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>MakeReadyOS Pool Log Report</title><style>
    *{box-sizing:border-box}body{font:11px/1.4 Arial,sans-serif;color:#18232e;margin:0}h1{font-size:21px;margin:0}h2{font-size:18px;margin:0}h3{font-size:12px;border-bottom:1px solid #a9bdca;padding-bottom:3px;margin:13px 0 5px;break-after:avoid}p{margin:4px 0}header{break-inside:avoid}header p{overflow-wrap:anywhere}.eyebrow{font-size:9px;letter-spacing:1px;color:#405d71}.report-header{border-bottom:3px solid #266278;padding-bottom:10px;margin-bottom:14px}.status{background:#edf3f5;padding:6px;margin:9px 0}.entry+.entry{break-before:page}.readings{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:1px solid #b9c8d1;break-inside:avoid}.reading{padding:7px;border:1px solid #e0e7eb}.reading span{display:block;font-size:10px}.reading strong{display:block;font-size:17px;margin-top:3px}.reading small{font-size:10px;font-weight:normal}.reading em{font-size:12px;font-style:normal;color:#596570}.helper{font-size:9px;color:#50616f}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #c4cfd6;padding:5px;text-align:left;vertical-align:top;overflow-wrap:anywhere;white-space:pre-wrap}th{background:#eef3f6}.amount{width:23%}thead{display:table-header-group}tr{break-inside:avoid}.observations{display:grid;grid-template-columns:1fr 1fr;gap:0 15px}.notes,li{white-space:pre-wrap;overflow-wrap:anywhere}ul{padding-left:17px;margin:5px 0}.notes{orphans:3;widows:3}button{margin-bottom:12px}@media screen{body{max-width:850px;margin:20px auto;padding:20px}.entry{margin-bottom:25px}}@media print{button{display:none}}@media screen and (max-width:600px){.readings{grid-template-columns:repeat(2,minmax(0,1fr))}}
    </style></head><body>${options.printable ? '<button onclick="window.print()">Print / Save PDF</button>' : ""}<div class="report-header"><h1>Pool &amp; Spa Log Report</h1><p>${escape(scope)}</p><p>Period: ${escape(options.from || "Beginning of records")} to ${escape(options.to || "Latest record")} &middot; ${entries.length} entries</p><p class="helper">Generated ${(options.generatedAt ?? new Date()).toISOString()} &middot; Saved observations, not a certification of current water safety.</p></div>${sections || "<p>No pool logs found for the selected scope and period.</p>"}</body></html>`;
}
