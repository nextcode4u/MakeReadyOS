type Location = { unitId?: string | null; building?: string | null; area?: string | null };
type IssueLocation = Location & { isArchived: boolean; status: string };

export function leaseIssueMatchesLocation(issue: IssueLocation, location: Location) {
  if (issue.isArchived || issue.status === "Resolved" || issue.status === "Archived") return false;
  if (location.unitId) return issue.unitId === location.unitId;
  if (issue.unitId) return false;
  const normalize = (value?: string | null) => value?.trim().toLowerCase() ?? "";
  const building = normalize(location.building);
  const area = normalize(location.area);
  if (!building && !area) return false;
  return (!building || normalize(issue.building) === building) && (!area || normalize(issue.area) === area);
}
