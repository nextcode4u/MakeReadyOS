import { getPestIssues, type PestIssue, type UserLanguage } from "./api";

export function pestRequestPrintHtml(issues: PestIssue[], language: UserLanguage) {
  const es = language === "es";
  const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
  // Share exactly the vendor-safe fields used by Copy, never internal notes or reporter details.
  const [title, ...requests] = formatPestRequestList(issues, language).split("\n");
  return `<!doctype html><html lang="${es ? "es" : "en"}"><head><meta charset="utf-8"><title>${escape(title)}</title>
<style>
@page { size: auto; margin: 15mm; }
body { font-family: sans-serif; color: #111; margin: 24px; }
h1 { font-size: 21px; } p { font-size: 12px; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th, td { border: 1px solid #888; padding: 10px; text-align: left; vertical-align: top; }
th { background: #eee; } tr { break-inside: avoid; } thead { display: table-header-group; }
td:last-child { width: 32%; min-width: 100px; height: 48px; }
button { padding: 8px 16px; } @media print { button { display: none; } body { margin: 0; } }
</style></head><body><button onclick="window.print()">${es ? "Imprimir / Guardar PDF" : "Print / Save PDF"}</button>
<h1>${escape(title)}</h1><p>${es ? "Lista filtrada para el proveedor. Fecha de servicio:" : "Filtered vendor handoff. Service date:"} ____________________</p>
<table><thead><tr><th>${es ? "Solicitud / Unidad / Detalles" : "Request / Unit / Details"}</th><th>${es ? "Tratamiento / Notas del proveedor" : "Treatment / Vendor notes"}</th></tr></thead><tbody>
${requests.filter(Boolean).map(request => `<tr><td>${escape(request)}</td><td></td></tr>`).join("")}
</tbody></table></body></html>`;
}

export async function loadActivePestRequests(filters: Parameters<typeof getPestIssues>[0]) {
  const issues: PestIssue[] = [];
  let offset = 0;
  while (true) {
    const page = await getPestIssues({ ...filters, activeOnly: true, includeArchived: false, offset, limit: 200 });
    issues.push(...page.issues);
    if (!page.pagination.hasMore) break;
    if (!page.issues.length) throw new Error("The request list changed. Refresh and try again.");
    offset += page.issues.length;
  }
  return { issues: [...new Map(issues.map(issue => [issue.id, issue])).values()] };
}

export function formatPestRequestList(issues: PestIssue[], language: UserLanguage) {
  const clean = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim() ?? "";
  const active = issues.filter(issue => !issue.isArchived && !["Closed", "Cancelled", "Archived"].includes(issue.status));
  const lines = active.map(issue => [
    `${clean(issue.property.code)} / ${clean(issue.unit?.number || issue.makeReadyItem?.unitNumber || issue.area)}`,
    [issue.pestType, issue.additionalPestType].filter(Boolean).map(clean).join(" + "),
    clean(issue.status),
    issue.priority !== "Normal" ? clean(issue.priority) : "",
    issue.followUpDate ? `${language === "es" ? "Seguimiento" : "Follow-up"}: ${issue.followUpDate.slice(0, 10)}` : "",
    clean(issue.description),
  ].filter(Boolean).join(" | "));
  return `${language === "es" ? "Solicitudes activas de plagas" : "Active pest requests"} (${active.length})\n${lines.join("\n")}`;
}
