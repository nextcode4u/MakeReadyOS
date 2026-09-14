import { useQuery } from "@tanstack/react-query";
import { getAvailabilityFreshness } from "../lib/api";

export function AvailabilityFreshness({ propertyId }: { propertyId: string }) {
  const query = useQuery({ queryKey: ["operations", "availability-freshness", propertyId], queryFn: () => getAvailabilityFreshness(propertyId || undefined), staleTime: 60000, refetchInterval: 60000 });
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const rows = (query.data?.properties ?? []).map(property => {
    const receipt = property.latestImport;
    const age = receipt?.reportDate ? Math.floor((today - Date.parse(`${receipt.reportDate}T00:00:00Z`)) / 86400000) : null;
    return { property, receipt, age, needsReview: !receipt || receipt.coverage !== "FULL" || age === null || age < 0 || age > 7 };
  });
  const reviewCount = rows.filter(row => row.needsReview).length;
  return <details className="availability-freshness" data-testid="availability-freshness" style={{ padding: "8px 12px", overflowWrap: "anywhere" }}>
    <summary>Availability freshness{query.isPending ? " / checking..." : query.isError ? " / refresh unavailable" : !rows.length ? " / no active properties" : ` / ${reviewCount} ${reviewCount === 1 ? "property needs" : "properties need"} review`}</summary>
    {query.isError ? <p role="alert">Could not refresh import history. Any dates shown may be out of date. <button type="button" onClick={() => void query.refetch()}>Retry import history</button></p> : null}
    <p>Based on successful import receipts, not manual board edits. A recent upload can contain an older report. Reports over seven days old are flagged for review; this never blocks work.</p>
    {!query.isPending && !query.isError && !rows.length ? <p>No accessible active properties.</p> : null}
    <ul>{rows.map(({ property, receipt, age }) => <li key={property.id} data-testid={`availability-freshness-${property.id}`}>
      <strong>{property.code} / {property.name}: </strong>
      {!receipt ? "No availability import recorded." : <>
        {receipt.coverage === "FULL" ? "Full report" : receipt.coverage === "PARTIAL" ? "Partial import" : "Coverage not recorded"}
        {receipt.reportDate ? ` / report date ${receipt.reportDate}${age !== null && age < 0 ? " (future date; check source)" : age !== null && age > 7 ? " (over seven days old)" : ""}` : ` / ${receipt.dateIssue === "MIXED" ? "mixed report dates" : receipt.dateIssue === "INVALID" ? "invalid report date" : "report date not recorded"}`}
        {` / imported ${new Date(receipt.importedAt).toLocaleString()}.`}
        {receipt.coverage === "PARTIAL" ? " Partial imports do not confirm the remaining units." : null}
      </>}
    </li>)}</ul>
  </details>;
}
