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
  type UserLanguage,
} from "../lib/api";
import { t } from "../lib/i18n";
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
  language?: UserLanguage;
};

function SummaryLinks({
  items,
  attachLabel,
  onAttach,
  showAttach,
  showRecommend,
  saving = false,
  language,
}: {
  items: PropertyWikiRecordSummary[];
  attachLabel?: string;
  onAttach?: (targetType: PropertyWikiTargetType, id: string) => void;
  showAttach?: boolean;
  showRecommend?: boolean;
  saving?: boolean;
  language: UserLanguage;
}) {
  if (!items.length) return <p className="muted">{t(language, "wikiWorkflow.noMatches")}</p>;
  return (
    <div className="wiki-workflow-list">
      {items.map((item) => (
        <article key={`${item.targetType}-${item.id}`} className={`property-wiki-record compact${item.isEmergency ? " emergency" : ""}`}>
          <div>
            <strong>{item.title}</strong>
            <span>{item.section.replace(/_/g, " ")}{item.building ? ` / ${item.building}` : ""}</span>
            <p>{item.snippet || t(language, "common.noPreview")}</p>
          </div>
          <div className="pool-entry-actions">
            {showAttach && onAttach ? <button type="button" className="button button-secondary" disabled={saving} onClick={() => onAttach(item.targetType, item.id)}>{attachLabel ?? t(language, "common.attach")}</button> : null}
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
                {t(language, "wikiWorkflow.createRecommendation")}
              </button>
            ) : null}
            <button type="button" className="button button-secondary" onClick={() => openWikiRecord({ targetType: item.targetType, id: item.id, propertyId: item.propertyId })}>{t(language, "common.open")} Wiki</button>
          </div>
        </article>
      ))}
    </div>
  );
}

function PropertyWikiWorkflowContent({
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
  language = "en",
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

  const attachable = Boolean(canEdit && recordType && recordId);
  const recommendable = Boolean(canEdit);
  const saving = attachMutation.isPending || detachMutation.isPending;
  const saveError = attachMutation.error || detachMutation.error;
  if (!propertyId) return null;
  if (!contextQuery.data) return <section className="wiki-workflow-status" data-testid={`wiki-workflow-${module.toLowerCase()}`}>
    <strong>{title}</strong>
    {contextQuery.isError ? <p role="alert">{t(language, "wikiWorkflow.loadFailed")} <button type="button" className="button button-secondary" onClick={() => void contextQuery.refetch()}>{t(language, "status.reload")}</button></p> : <p role="status">{t(language, "wikiWorkflow.loading")}</p>}
  </section>;
  const related = [
    { key: "sops", label: "wiki.relatedSops", items: contextQuery.data.related.sops },
    { key: "vendors", label: "wiki.relatedVendors", items: contextQuery.data.related.vendors },
    { key: "equipment", label: "wiki.relatedEquipment", items: contextQuery.data.related.equipment },
    { key: "documents", label: "wiki.relatedDocuments", items: contextQuery.data.related.documents },
  ].filter(group => group.items.length);
  const hasContent = attachable || visibleKnownIssues.length || visibleSuggestions.length || contextQuery.data.attached.length || contextQuery.data.emergencyRecords.length || contextQuery.data.makeReadyStandards.length || related.length;
  if (!hasContent && !contextQuery.isError) return null;

  return (
    <section className="pool-card wiki-workflow-panel" data-testid={`wiki-workflow-${module.toLowerCase()}`}>
      {contextQuery.isError ? <p role="alert">{t(language, "wikiWorkflow.refreshFailed")} <button type="button" className="button button-secondary" onClick={() => void contextQuery.refetch()}>{t(language, "status.reload")}</button></p> : null}
      {saveError ? <p role="alert">{t(language, "wikiWorkflow.saveFailed")} {saveError instanceof Error ? saveError.message : ""}</p> : null}
      {saving ? <p role="status">{t(language, "wikiWorkflow.saving")}</p> : null}
      <div className="wiki-workflow-header">
        <div>
          <h2>{title}</h2>
          <p className="muted">{t(language, "wikiWorkflow.contextSurface")}</p>
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
            {t(language, "wikiWorkflow.emergencyInfo")}
          </button>
        ) : null}
      </div>

      {visibleKnownIssues.length ? (
        <div className="wiki-warning-stack">
          {visibleKnownIssues.map((issue) => (
            <div key={issue.id} className="banner banner-warning wiki-warning-banner">
              <div>
                <strong>{t(language, "wikiWorkflow.knownIssue")} {issue.title}</strong>
                <p>{issue.snippet || t(language, "wikiWorkflow.propertyIssueAvailable")}</p>
              </div>
              <div className="pool-entry-actions">
                <button type="button" className="button button-secondary" onClick={() => openWikiRecord({ targetType: issue.targetType, id: issue.id, propertyId: issue.propertyId })}>{t(language, "common.open")} Wiki</button>
                <button type="button" className="button button-secondary" onClick={() => setDismissedIssues((current) => [...current, issue.id])}>{t(language, "common.dismiss")}</button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {contextQuery.data.attached.length ? (
        <div className="wiki-workflow-block">
          <div className="drawer-section-title"><h3>{t(language, "wikiWorkflow.attachedReferences")}</h3></div>
          <div className="wiki-workflow-list">
            {contextQuery.data.attached.map((item) => (
              <article key={item.referenceId} className="property-wiki-record compact">
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.section.replace(/_/g, " ")}{item.building ? ` / ${item.building}` : ""}</span>
                  <p>{item.snippet || t(language, "common.noPreview")}</p>
                </div>
                <div className="pool-entry-actions">
                  <button type="button" className="button button-secondary" onClick={() => openWikiRecord({ targetType: item.targetType, id: item.id, propertyId: item.propertyId })}>{t(language, "common.open")} Wiki</button>
                  {attachable ? <button type="button" className="button button-secondary" disabled={saving} onClick={() => { attachMutation.reset(); detachMutation.mutate(item.referenceId); }}>{t(language, "common.remove")}</button> : null}
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {attachable ? (
        <div className="wiki-workflow-block">
          <div className="drawer-section-title"><h3>{t(language, "wikiWorkflow.attachContent")}</h3></div>
          <input
            aria-label={t(language, "wikiWorkflow.searchToAttach")}
            disabled={saving}
            value={attachQuery}
            onChange={(event) => setAttachQuery(event.target.value)}
            placeholder={t(language, "wikiWorkflow.searchToAttach")}
          />
          {attachQuery.trim().length >= 2 && searchQuery.isFetching ? <p role="status">{t(language, "wikiWorkflow.searching")}</p> : null}
          {attachQuery.trim().length >= 2 && searchQuery.isError ? <p role="alert">{t(language, "wikiWorkflow.searchFailed")} <button type="button" className="button button-secondary" onClick={() => void searchQuery.refetch()}>{t(language, "status.reload")}</button></p> : null}
          {searchQuery.data?.results?.length && !searchQuery.isError ? (
            <SummaryLinks
              items={searchQuery.data.results}
              attachLabel={t(language, "common.attach")}
              showAttach
              saving={saving}
              showRecommend={recommendable}
              language={language}
              onAttach={(targetType, id) => { detachMutation.reset(); attachMutation.mutate({ recordType: recordType!, recordId: recordId!, targetType, targetId: id }); }}
            />
          ) : attachQuery.trim().length >= 2 && searchQuery.isSuccess && !searchQuery.isFetching ? <p className="muted">{t(language, "wikiWorkflow.noSearchMatches")}</p> : null}
        </div>
      ) : null}

      {contextQuery.data.makeReadyStandards.length ? (
        <div className="wiki-workflow-block">
          <div className="drawer-section-title"><h3>{t(language, "wikiWorkflow.operationalStandards")}</h3></div>
          <SummaryLinks items={contextQuery.data.makeReadyStandards} showRecommend={recommendable} language={language} />
        </div>
      ) : null}

      {visibleSuggestions.length ? (
        <div className="wiki-workflow-block">
          <div className="drawer-section-title"><h3>{t(language, "wikiWorkflow.smartSuggestions")}</h3></div>
          <div className="wiki-workflow-list">
            {visibleSuggestions.map((item) => (
              <article key={`${item.targetType}-${item.id}`} className="property-wiki-record compact">
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.section.replace(/_/g, " ")}{item.building ? ` / ${item.building}` : ""}</span>
                  <p>{item.snippet || t(language, "common.noPreview")}</p>
                </div>
                <div className="pool-entry-actions">
                  {attachable ? <button type="button" className="button button-secondary" disabled={saving} onClick={() => { detachMutation.reset(); attachMutation.mutate({ recordType: recordType!, recordId: recordId!, targetType: item.targetType, targetId: item.id }); }}>{t(language, "common.attach")}</button> : null}
                  <button type="button" className="button button-secondary" onClick={() => openWikiRecord({ targetType: item.targetType, id: item.id, propertyId: item.propertyId })}>{t(language, "common.open")} Wiki</button>
                  <button type="button" className="button button-secondary" onClick={() => setDismissedSuggestions((current) => [...current, `${item.targetType}:${item.id}`])}>{t(language, "common.dismiss")}</button>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {contextQuery.data.emergencyRecords.length ? (
        <div className="wiki-workflow-block">
          <div className="drawer-section-title"><h3>{t(language, "wikiWorkflow.emergencyAccess")}</h3></div>
          <SummaryLinks items={contextQuery.data.emergencyRecords} showRecommend={recommendable} language={language} />
        </div>
      ) : null}

      {related.length ? <div className="wiki-workflow-related-grid">
        {related.map(group => <div className="wiki-workflow-block" key={group.key}>
          <div className="drawer-section-title"><h3>{t(language, group.label)}</h3></div>
          <SummaryLinks items={group.items} showRecommend={recommendable} language={language} />
        </div>)}
      </div> : null}
    </section>
  );
}

export function PropertyWikiWorkflowPanel(props: Props) {
  return <PropertyWikiWorkflowContent key={JSON.stringify([props.module, props.propertyId, props.recordType, props.recordId])} {...props} />;
}
