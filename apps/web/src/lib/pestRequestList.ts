import { getPestIssues, type PestIssue, type UserLanguage } from "./api";

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
