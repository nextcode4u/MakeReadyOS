import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  attachPropertyWikiReference,
  deletePropertyWikiReference,
  getPropertyWikiWorkflowContext,
  searchPropertyWiki,
  type PropertyWikiRecordSummary,
  type PropertyWikiTargetType,
  type PropertyWikiWorkflowModule,
  type PropertyWikiWorkflowRecordType,
} from "../lib/api";
import { openWikiRecord } from "../lib/wikiNavigation";
import { openProjectCreate } from "../lib/projectNavigation";

type Props = {
  title: string;
  module: PropertyWikiWorkflowModule;
  propertyId?: string | null;
  recordType?: PropertyWikiWorkflowRecordType;
  recordId?: string | null;
  floorPlan?: string | null;
  unitNumber?: string | null;
  building?: string | null;
  facilityName?: string | null;
  equipmentQuery?: string | null;
  query?: string | null;
  canEdit?: boolean;
};

function SummaryLinks({
  items,
  attachLabel,
  onAttach,
  showAttach,
  showRecommend,
}: {
  items: PropertyWikiRecordSummary[];
  attachLabel?: string;
  onAttach?: (targetType: PropertyWikiTargetType, id: string) => void;
  showAttach?: boolean;
  showRecommend?: boolean;
}) {
  if (!items.length) return <p className="muted">No matching wiki records.</p>;
  return (
    <div className="wiki-workflow-list">
      {items.map((item) => (
        <article key={`${item.targetType}-${item.id}`} className={`property-wiki-record compact${item.isEmergency ? " emergency" : ""}`}>
          <div>
            <strong>{item.title}</strong>
            <span>{item.section.replace(/_/g, " ")}{item.building ? ` / ${item.building}` : ""}</span>
            <p>{item.snippet || "No preview available."}</p>
          </div>
          <div className="pool-entry-actions">
            {showAttach && onAttach ? <button type="button" className="button button-secondary" onClick={() => onAttach(item.targetType, item.id)}>{attachLabel ?? "Attach"}</button> : null}
            {showRecommend ? (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => openProjectCreate({
                  propertyId: item.propertyId,
                  source: "Property Wiki",
                  recordType: "Recommendation",
                  title: item.title,
                  description: item.snippet || "",
                  sourceRecordType: item.targetType,
                  sourceRecordId: item.id,
                  sourceRecordLabel: item.title,
                  building: item.building ?? "",
                  tags: ["property-wiki", item.section.toLowerCase()],
                })}
              >
                Create Recommendation
              </button>
            ) : null}
            <button type="button" className="button button-secondary" onClick={() => openWikiRecord({ targetType: item.targetType, id: item.id, propertyId: item.propertyId })}>Open Wiki</button>
          </div>
        </article>
      ))}
    </div>
  );
}

export function PropertyWikiWorkflowPanel({
  title,
  module,
  propertyId,
  recordType,
  recordId,
  floorPlan,
  unitNumber,
  building,
  facilityName,
  equipmentQuery,
  query,
  canEdit = false,
}: Props) {
  const queryClient = useQueryClient();
  const [attachQuery, setAttachQuery] = useState("");
  const [dismissedSuggestions, setDismissedSuggestions] = useState<string[]>([]);
  const [dismissedIssues, setDismissedIssues] = useState<string[]>([]);

  const contextQuery = useQuery({
    queryKey: ["property-wiki", "workflow", module, propertyId, recordType, recordId, floorPlan, unitNumber, building, facilityName, equipmentQuery, query],
    queryFn: () => getPropertyWikiWorkflowContext({
      module,
      propertyId: propertyId || undefined,
      recordType,
      recordId: recordId || undefined,
      floorPlan,
      unitNumber,
      building,
      facilityName,
      equipmentQuery,
      query,
    }),
    enabled: Boolean(propertyId),
  });

  const searchQuery = useQuery({
    queryKey: ["property-wiki", "workflow-search", propertyId, attachQuery],
    queryFn: () => searchPropertyWiki({ propertyId: propertyId || undefined, q: attachQuery }),
    enabled: Boolean(propertyId && attachQuery.trim().length >= 2),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["property-wiki"] });
  };

  const attachMutation = useMutation({
    mutationFn: attachPropertyWikiReference,
    onSuccess: () => {
      setAttachQuery("");
      void invalidate();
    },
  });

  const detachMutation = useMutation({
    mutationFn: deletePropertyWikiReference,
    onSuccess: () => void invalidate(),
  });

  const visibleSuggestions = useMemo(() => {
    return (contextQuery.data?.suggestions ?? []).filter((item) => !dismissedSuggestions.includes(`${item.targetType}:${item.id}`));
  }, [contextQuery.data?.suggestions, dismissedSuggestions]);

  const visibleKnownIssues = useMemo(() => {
    return (contextQuery.data?.knownIssues ?? []).filter((item) => !dismissedIssues.includes(item.id));
  }, [contextQuery.data?.knownIssues, dismissedIssues]);

  if (!propertyId || contextQuery.isLoading || !contextQuery.data) {
    return null;
  }

  const attachable = Boolean(canEdit && recordType && recordId);
  const recommendable = Boolean(canEdit);

  return (
    <section className="pool-card wiki-workflow-panel" data-testid={`wiki-workflow-${module.toLowerCase()}`}>
      <div className="wiki-workflow-header">
        <div>
          <h2>{title}</h2>
          <p className="muted">Property Wiki context surfaced inside this workflow.</p>
        </div>
        {contextQuery.data.emergencyRecords[0] ? (
          <button
            type="button"
            className="button button-primary"
            onClick={() => openWikiRecord({
              targetType: contextQuery.data!.emergencyRecords[0].targetType,
              id: contextQuery.data!.emergencyRecords[0].id,
              propertyId: contextQuery.data!.emergencyRecords[0].propertyId,
            })}
          >
            Emergency Info
          </button>
        ) : null}
      </div>

      {visibleKnownIssues.length ? (
        <div className="wiki-warning-stack">
          {visibleKnownIssues.map((issue) => (
            <div key={issue.id} className="banner banner-warning wiki-warning-banner">
              <div>
                <strong>Known issue: {issue.title}</strong>
                <p>{issue.snippet || "Property-specific issue available in the wiki."}</p>
              </div>
              <div className="pool-entry-actions">
                <button type="button" className="button button-secondary" onClick={() => openWikiRecord({ targetType: issue.targetType, id: issue.id, propertyId: issue.propertyId })}>Open Wiki</button>
                <button type="button" className="button button-secondary" onClick={() => setDismissedIssues((current) => [...current, issue.id])}>Dismiss</button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {contextQuery.data.attached.length ? (
        <div className="wiki-workflow-block">
          <div className="drawer-section-title"><h3>Attached Wiki References</h3></div>
          <div className="wiki-workflow-list">
            {contextQuery.data.attached.map((item) => (
              <article key={item.referenceId} className="property-wiki-record compact">
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.section.replace(/_/g, " ")}{item.building ? ` / ${item.building}` : ""}</span>
                  <p>{item.snippet || "No preview available."}</p>
                </div>
                <div className="pool-entry-actions">
                  <button type="button" className="button button-secondary" onClick={() => openWikiRecord({ targetType: item.targetType, id: item.id, propertyId: item.propertyId })}>Open Wiki</button>
                  {attachable ? <button type="button" className="button button-secondary" onClick={() => detachMutation.mutate(item.referenceId)}>Remove</button> : null}
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {attachable ? (
        <div className="wiki-workflow-block">
          <div className="drawer-section-title"><h3>Attach Wiki Content</h3></div>
          <input
            value={attachQuery}
            onChange={(event) => setAttachQuery(event.target.value)}
            placeholder="Search wiki records to attach..."
          />
          {searchQuery.data?.results?.length ? (
            <SummaryLinks
              items={searchQuery.data.results}
              attachLabel="Attach"
              showAttach
              showRecommend={recommendable}
              onAttach={(targetType, id) => attachMutation.mutate({ recordType: recordType!, recordId: recordId!, targetType, targetId: id })}
            />
          ) : attachQuery.trim().length >= 2 ? <p className="muted">No wiki matches for this search.</p> : null}
        </div>
      ) : null}

      {contextQuery.data.makeReadyStandards.length ? (
        <div className="wiki-workflow-block">
          <div className="drawer-section-title"><h3>Operational Standards</h3></div>
          <SummaryLinks items={contextQuery.data.makeReadyStandards} showRecommend={recommendable} />
        </div>
      ) : null}

      {visibleSuggestions.length ? (
        <div className="wiki-workflow-block">
          <div className="drawer-section-title"><h3>Smart Suggestions</h3></div>
          <div className="wiki-workflow-list">
            {visibleSuggestions.map((item) => (
              <article key={`${item.targetType}-${item.id}`} className="property-wiki-record compact">
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.section.replace(/_/g, " ")}{item.building ? ` / ${item.building}` : ""}</span>
                  <p>{item.snippet || "No preview available."}</p>
                </div>
                <div className="pool-entry-actions">
                  {attachable ? <button type="button" className="button button-secondary" onClick={() => attachMutation.mutate({ recordType: recordType!, recordId: recordId!, targetType: item.targetType, targetId: item.id })}>Attach</button> : null}
                  <button type="button" className="button button-secondary" onClick={() => openWikiRecord({ targetType: item.targetType, id: item.id, propertyId: item.propertyId })}>Open Wiki</button>
                  <button type="button" className="button button-secondary" onClick={() => setDismissedSuggestions((current) => [...current, `${item.targetType}:${item.id}`])}>Dismiss</button>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {contextQuery.data.emergencyRecords.length ? (
        <div className="wiki-workflow-block">
          <div className="drawer-section-title"><h3>Emergency Access</h3></div>
          <SummaryLinks items={contextQuery.data.emergencyRecords} showRecommend={recommendable} />
        </div>
      ) : null}

      <div className="wiki-workflow-related-grid">
        <div className="wiki-workflow-block">
          <div className="drawer-section-title"><h3>Related SOPs</h3></div>
          <SummaryLinks items={contextQuery.data.related.sops} showRecommend={recommendable} />
        </div>
        <div className="wiki-workflow-block">
          <div className="drawer-section-title"><h3>Related Vendors</h3></div>
          <SummaryLinks items={contextQuery.data.related.vendors} showRecommend={recommendable} />
        </div>
        <div className="wiki-workflow-block">
          <div className="drawer-section-title"><h3>Related Equipment</h3></div>
          <SummaryLinks items={contextQuery.data.related.equipment} showRecommend={recommendable} />
        </div>
        <div className="wiki-workflow-block">
          <div className="drawer-section-title"><h3>Related Documents</h3></div>
          <SummaryLinks items={contextQuery.data.related.documents} showRecommend={recommendable} />
        </div>
      </div>
    </section>
  );
}
