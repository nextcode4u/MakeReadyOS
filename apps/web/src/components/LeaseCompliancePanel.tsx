import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addLeaseComplianceIssueNote,
  archiveLeaseComplianceIssue,
  createPropertyMapPin,
  createLeaseComplianceIssue,
  createLeaseComplianceIssueType,
  deleteLeaseComplianceIssuePhoto,
  dismissLeaseComplianceRecurringFlag,
  getLeaseComplianceIssueTypes,
  getLeaseComplianceIssues,
  getLeaseComplianceOverview,
  getLeaseComplianceSettings,
  leaseComplianceExportCsvUrl,
  leaseComplianceIssuePhotoDownloadUrl,
  leaseCompliancePrintableHtmlReportUrl,
  leaseCompliancePrintableReportUrl,
  markLeaseComplianceNotice,
  markLeaseComplianceStillPersists,
  resolveLeaseComplianceIssue,
  updateLeaseComplianceIssue,
  updateLeaseComplianceIssueType,
  updateLeaseComplianceSettings,
  uploadLeaseComplianceIssuePhoto,
  isApiError,
  type LeaseComplianceIssue,
  type LeaseComplianceNoticeAction,
  type LeaseComplianceNoticeStage,
  type LeaseCompliancePriority,
  type LeaseComplianceSettings,
  type LeaseComplianceSource,
  type LeaseComplianceStatus,
  type Property,
  type Unit,
  type UserLanguage,
  type UserRole,
} from "../lib/api";
import { enqueueLeaseCreate, enqueueLeaseUpload } from "../lib/offlineSync";
import { t, tWithVars } from "../lib/i18n";
import type { OpenLeaseQuickAddRequest } from "../lib/leaseNavigation";
import { isTouchMobileViewport } from "../lib/responsive";
import { SearchSelect, type SearchSelectOption } from "./SearchSelect";
import { StatusState } from "./StatusState";
import { UnitSearchSelect } from "./UnitSearchSelect";
import { PropertyWikiWorkflowPanel } from "./PropertyWikiWorkflowPanel";

type Tab = "dashboard" | "active" | "grounds" | "needs-notice" | "violation" | "resolved" | "archive" | "reports" | "settings";

type Props = {
  properties: Property[];
  units: Unit[];
  users: Array<{ id: string; fullName: string; role: UserRole }>;
  userRole: UserRole;
  language: UserLanguage;
  selectedPropertyId?: string;
  openQuickAddRequest?: (OpenLeaseQuickAddRequest & { nonce: number }) | null;
};

const noticeActions: Array<{ label: string; value: LeaseComplianceNoticeAction["action"] }> = [
  { label: "Mark Resident Notified", value: "RESIDENT_NOTIFIED" },
  { label: "Mark 1st Notice Sent", value: "NOTICE_1_SENT" },
  { label: "Mark 2nd Notice Sent", value: "NOTICE_2_SENT" },
  { label: "Mark 3rd Notice Sent", value: "NOTICE_3_SENT" },
  { label: "Mark Violation Needed", value: "VIOLATION_NEEDED" },
];

const statuses: LeaseComplianceStatus[] = ["Open", "Resident Notified", "Notice Sent", "Violation Needed", "Resolved", "Archived"];
const noticeStages: LeaseComplianceNoticeStage[] = ["None", "Resident Notified", "1st Notice", "2nd Notice", "3rd Notice", "Violation Needed"];
const priorities: LeaseCompliancePriority[] = ["Low", "Normal", "High", "Critical"];
const sources: LeaseComplianceSource[] = ["Property Walk", "Grounds Walk", "Inspection", "Leasing Follow Up", "Manager Review", "Resident Complaint", "Other"];

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString() : "-";
}

function daysOpen(issue: LeaseComplianceIssue) {
  return Math.max(0, Math.floor((Date.now() - new Date(issue.createdAt).getTime()) / 86400000));
}

function normalizeLocationValue(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function IssueMediaStrip({
  files,
  getUrl,
  emptyLabel,
}: {
  files: Array<{ id: string; originalName: string; mimeType: string; caption?: string | null; photoCategory?: string | null }>;
  getUrl: (id: string) => string;
  emptyLabel: string;
}) {
  if (!files.length) {
    return <div className="issue-media-empty">{emptyLabel}</div>;
  }
  return (
    <div className="issue-media-strip">
      {files.map((file) => {
        const href = getUrl(file.id);
        const image = file.mimeType.startsWith("image/");
        return (
          <a key={file.id} className="issue-media-chip" href={href} target="_blank" rel="noreferrer">
            {image ? <img src={href} alt={file.originalName} loading="lazy" /> : <span className="issue-media-file-badge">PDF</span>}
            <span>{file.caption || file.photoCategory?.split("_").join(" ") || file.originalName}</span>
          </a>
        );
      })}
    </div>
  );
}

function noticeActionLabel(value: LeaseComplianceNoticeAction["action"], language: UserLanguage) {
  switch (value) {
    case "RESIDENT_NOTIFIED":
      return t(language, "lease.markResidentNotified");
    case "NOTICE_1_SENT":
      return t(language, "lease.markNotice1Sent");
    case "NOTICE_2_SENT":
      return t(language, "lease.markNotice2Sent");
    case "NOTICE_3_SENT":
      return t(language, "lease.markNotice3Sent");
    case "VIOLATION_NEEDED":
      return t(language, "lease.markViolationNeeded");
    default:
      return value;
  }
}

function IssueCard({
  issue,
  canEdit,
  canNotice,
  users,
  language,
  onSave,
  onNote,
  onPersist,
  onNotice,
  onResolve,
  onArchive,
  onDismissRecurring,
  onUpload,
  onDeletePhoto,
}: {
  issue: LeaseComplianceIssue;
  canEdit: boolean;
  canNotice: boolean;
  users: Array<{ id: string; fullName: string; role: UserRole }>;
  language: UserLanguage;
  onSave: (id: string, input: Partial<Parameters<typeof createLeaseComplianceIssue>[0]>) => void;
  onNote: (id: string, body: string) => void;
  onPersist: (id: string, notes?: string) => void;
  onNotice: (id: string, action: LeaseComplianceNoticeAction["action"]) => void;
  onResolve: (id: string, resolutionNotes: string) => void;
  onArchive: (id: string, notes?: string) => void;
  onDismissRecurring: (id: string, notes: string) => void;
  onUpload: (issueId: string, files: FileList | null) => void;
  onDeletePhoto: (photoId: string) => void;
}) {
  const [note, setNote] = useState("");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [persistNotes, setPersistNotes] = useState("");
  const label = issue.unit?.number ?? issue.area ?? issue.building ?? t(language, "lease.area");
  const assignableUserOptions = useMemo<SearchSelectOption[]>(() => users.map((user) => ({
    value: user.id,
    label: `${user.fullName} / ${user.role}`,
    keywords: [user.fullName, user.role],
  })), [users]);
  const activeNoticeActions = noticeActions.filter((entry) => {
    if (issue.noticeStage === "Violation Needed") return false;
    if (entry.value === "RESIDENT_NOTIFIED") return issue.noticeStage === "None";
    if (entry.value === "NOTICE_1_SENT") return ["None", "Resident Notified"].includes(issue.noticeStage);
    if (entry.value === "NOTICE_2_SENT") return ["1st Notice", "Resident Notified", "None"].includes(issue.noticeStage);
    if (entry.value === "NOTICE_3_SENT") return ["2nd Notice", "1st Notice", "Resident Notified", "None"].includes(issue.noticeStage);
    return true;
  });

  return (
    <article className={`pool-card ${issue.managerReviewRequired ? "pm-task-card" : ""}`} data-testid={`lease-issue-${issue.id}`}>
      <div className="drawer-section-title">
        <h3>{label} / {issue.issueTypeName}{issue.additionalIssueType ? ` + ${issue.additionalIssueType}` : ""}</h3>
        <span className={`status-pill ${issue.status === "Violation Needed" ? "risk-critical" : issue.noticeStage !== "None" ? "risk-high" : ""}`}>{issue.status}</span>
      </div>
      <div className="pool-reading-stack">
        <span>{issue.property.code}</span>
        <span>{issue.priority}</span>
        <span>{issue.noticeStage}</span>
        <span>{tWithVars(language, "lease.daysOpen", { count: String(daysOpen(issue)) })}</span>
        <span>{tWithVars(language, "lease.persistedShort", { count: String(issue.persistenceCount) })}</span>
        {issue.assignedUserName ? <span>{issue.assignedUserName}</span> : null}
      </div>
      {issue.description ? <p>{issue.description}</p> : null}
      {(issue.recurringConcern || issue.managerReviewRequired) ? (
        <div className="risk-banner" style={{ marginBottom: 12 }}>
          <strong>{issue.managerReviewRequired ? t(language, "lease.managerReviewRequired") : t(language, "lease.recurringConcern")}</strong>
          <span>{tWithVars(language, "lease.repeatedHistory", { label })}</span>
          {canEdit ? <button className="button button-secondary" type="button" onClick={() => onDismissRecurring(issue.id, "Reviewed from Lease Compliance workspace.")}>{t(language, "lease.dismissFlag")}</button> : null}
        </div>
      ) : null}

      <PropertyWikiWorkflowPanel
        title={t(language, "lease.wikiContext")}
        module="LEASE_COMPLIANCE"
        propertyId={issue.propertyId}
        recordType="LEASE_COMPLIANCE_ISSUE"
        recordId={issue.id}
        unitNumber={issue.unit?.number}
        building={issue.building}
        query={[
          issue.issueTypeName,
          issue.additionalIssueType,
          issue.area,
          issue.description,
          issue.locationNotes,
        ].filter(Boolean).join(" ")}
        canEdit={canEdit}
      />

      {canEdit ? (
        <div className="pool-grid" style={{ marginBottom: 12 }}>
          <label>{t(language, "admin.status")}
            <select value={issue.status} onChange={(event) => onSave(issue.id, { status: event.target.value as LeaseComplianceStatus })}>
              {statuses.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
            </select>
          </label>
          <label>{t(language, "lease.priority")}
            <select value={issue.priority} onChange={(event) => onSave(issue.id, { priority: event.target.value as LeaseCompliancePriority })}>
              {priorities.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
            </select>
          </label>
          <label>{t(language, "lease.assignedUser")}
            <SearchSelect
              options={assignableUserOptions}
              value={issue.assignedUserId ?? ""}
              onChange={(assignedUserId) => onSave(issue.id, { assignedUserId: assignedUserId || null })}
              placeholder={t(language, "pm.searchUser")}
              emptyLabel={t(language, "lease.unassigned")}
              noMatchesLabel={t(language, "pm.noMatchingUsers")}
              clearLabel={t(language, "pm.clearAssignedUser")}
            />
          </label>
          <label>{t(language, "lease.noticeStage")}
            <select value={issue.noticeStage} onChange={(event) => onSave(issue.id, { noticeStage: event.target.value as LeaseComplianceNoticeStage })}>
              {noticeStages.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
            </select>
          </label>
        </div>
      ) : null}

      <div className="pool-reading-stack" style={{ marginBottom: 12 }}>
        <span>{t(language, "lease.created")} {formatDate(issue.createdAt)}</span>
        <span>{t(language, "lease.lastPersists")} {formatDate(issue.lastPersistenceCheckDate)}</span>
        <span>{t(language, "lease.resolved")} {formatDate(issue.resolvedDate)}</span>
        <span>{t(language, "lease.violation")} {formatDate(issue.violationNeededDate)}</span>
      </div>
      <IssueMediaStrip
        files={issue.photos}
        getUrl={leaseComplianceIssuePhotoDownloadUrl}
        emptyLabel={t(language, "lease.noPriorPhoto")}
      />

      {issue.photos.length ? (
        <div className="pool-attachment-list" style={{ marginBottom: 12 }}>
          {issue.photos.map((photo) => (
            <span key={photo.id} style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <a href={leaseComplianceIssuePhotoDownloadUrl(photo.id)} target="_blank" rel="noreferrer">{photo.originalName}</a>
              <em className="muted">{photo.photoCategory.split("_").join(" ")}</em>
              {canEdit ? <button className="link-button" type="button" onClick={() => onDeletePhoto(photo.id)}>{t(language, "common.remove")}</button> : null}
            </span>
          ))}
        </div>
      ) : null}

      {issue.notes.length ? (
        <div className="activity-feed" style={{ marginBottom: 12 }}>
          {issue.notes.slice(0, 4).map((entry) => (
            <div key={entry.id} className="activity-entry">
              <strong>{entry.authorName}</strong>
              <span>{new Date(entry.createdAt).toLocaleString()}</span>
              <p>{entry.body}</p>
            </div>
          ))}
        </div>
      ) : <p className="muted">{t(language, "lease.noNotesYet")}</p>}

      {canEdit ? (
        <>
          <div className="pool-entry-actions" style={{ marginBottom: 12 }}>
            <label className="button button-secondary pool-upload-button">
              {t(language, "lease.uploadPhotoPdf")}
              <input
                type="file"
                hidden
                accept="image/*,.pdf"
                onChange={(event) => {
                  onUpload(issue.id, event.target.files);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          </div>
          <label>{t(language, "lease.quickNote")}
            <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={t(language, "lease.quickNotePlaceholder")} />
          </label>
          <div className="pool-entry-actions" style={{ marginBottom: 12 }}>
            <button className="button button-secondary" type="button" onClick={() => { if (note.trim()) { onNote(issue.id, note.trim()); setNote(""); } }}>{t(language, "lease.addNote")}</button>
          </div>
          <label>{t(language, "lease.stillPersistsNote")}
            <textarea value={persistNotes} onChange={(event) => setPersistNotes(event.target.value)} placeholder={t(language, "lease.stillPersistsPlaceholder")} />
          </label>
          <div className="pool-entry-actions" style={{ marginBottom: 12 }}>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => {
                onPersist(issue.id, persistNotes.trim() || undefined);
                setPersistNotes("");
              }}
            >
              {t(language, "lease.markStillPersists")}
            </button>
          </div>
          <label>{t(language, "lease.resolutionNotes")}
            <textarea value={resolutionNotes} onChange={(event) => setResolutionNotes(event.target.value)} placeholder={t(language, "lease.resolutionNotesPlaceholder")} />
          </label>
          <div className="pool-entry-actions" style={{ marginTop: 12 }}>
            <button
              className="button button-primary"
              type="button"
              onClick={() => {
                if (resolutionNotes.trim()) {
                  onResolve(issue.id, resolutionNotes.trim());
                  setResolutionNotes("");
                }
              }}
            >
              {t(language, "lease.markResolved")}
            </button>
            <button className="button button-secondary" type="button" onClick={() => onArchive(issue.id, "Archived from Lease Compliance workspace.")}>{t(language, "common.archive")}</button>
          </div>
        </>
      ) : null}

      {canNotice ? (
        <div className="pool-entry-actions" style={{ marginTop: 12, flexWrap: "wrap" }}>
          {activeNoticeActions.map((entry) => (
            <button key={entry.value} className="button button-secondary" type="button" onClick={() => onNotice(issue.id, entry.value)}>{noticeActionLabel(entry.value, language)}</button>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function LeaseCompliancePanel({ properties, units, users, userRole, language, selectedPropertyId, openQuickAddRequest }: Props) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [isMobileLayout, setIsMobileLayout] = useState(() => isTouchMobileViewport());
  const [propertyId, setPropertyId] = useState(selectedPropertyId || properties[0]?.id || "");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeaseComplianceStatus | "">("");
  const [noticeStageFilter, setNoticeStageFilter] = useState<LeaseComplianceNoticeStage | "">("");
  const [quickAddUnitId, setQuickAddUnitId] = useState("");
  const [quickAddPhotos, setQuickAddPhotos] = useState<File[]>([]);
  const [showAdvancedQuickCapture, setShowAdvancedQuickCapture] = useState(false);
  const [groundsStickyLocation, setGroundsStickyLocation] = useState(true);
  const [lastCreatedIssue, setLastCreatedIssue] = useState<{
    id: string;
    label: string;
    issueTypeName: string;
    building: string;
    area: string;
  } | null>(null);
  const [quickAddDraft, setQuickAddDraft] = useState({
    building: "",
    area: "",
    issueTypeId: "",
    issueTypeName: "",
    additionalIssueType: "",
    priority: "Normal" as LeaseCompliancePriority,
    source: "Grounds Walk" as LeaseComplianceSource,
    description: "",
    locationNotes: "",
    assignedUserId: "",
  });
  const captureInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const descriptionInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const viewportMedia = window.matchMedia("(max-width: 860px)");
    const coarsePointerMedia = window.matchMedia("(pointer: coarse) and (hover: none)");
    const update = () => setIsMobileLayout(isTouchMobileViewport());
    update();
    if (typeof viewportMedia.addEventListener === "function") {
      viewportMedia.addEventListener("change", update);
      coarsePointerMedia.addEventListener("change", update);
      return () => {
        viewportMedia.removeEventListener("change", update);
        coarsePointerMedia.removeEventListener("change", update);
      };
    }
    viewportMedia.addListener(update);
    coarsePointerMedia.addListener(update);
    return () => {
      viewportMedia.removeListener(update);
      coarsePointerMedia.removeListener(update);
    };
  }, []);

  useEffect(() => {
    setShowAdvancedQuickCapture(!isMobileLayout);
  }, [isMobileLayout]);

  const permissions = {
    view: ["ADMIN", "MANAGER", "TECH", "LEASING", "CLEANER", "VIEWER"].includes(userRole),
    edit: ["ADMIN", "MANAGER", "TECH", "LEASING", "CLEANER"].includes(userRole),
    notice: ["ADMIN", "MANAGER", "LEASING"].includes(userRole),
    admin: userRole === "ADMIN",
  };

  const propertyUnits = useMemo(() => units.filter((unit) => unit.propertyId === propertyId), [propertyId, units]);
  const assignableUsers = useMemo(() => users.filter((user) => user.role !== "VIEWER"), [users]);
  const assignableUserOptions = useMemo<SearchSelectOption[]>(() => assignableUsers.map((user) => ({
    value: user.id,
    label: `${user.fullName} / ${user.role}`,
    keywords: [user.fullName, user.role],
  })), [assignableUsers]);

  useEffect(() => {
    if (selectedPropertyId) setPropertyId(selectedPropertyId);
  }, [selectedPropertyId]);

  useEffect(() => {
    if (!openQuickAddRequest?.propertyId) return;
    setPropertyId(openQuickAddRequest.propertyId);
    setTab("grounds");
    setQuickAddUnitId(openQuickAddRequest.unitId ?? "");
    setQuickAddPhotos([]);
    setQuickAddDraft({
      building: openQuickAddRequest.building ?? "",
      area: openQuickAddRequest.area ?? "",
      issueTypeId: "",
      issueTypeName: openQuickAddRequest.issueTypeName ?? "",
      additionalIssueType: "",
      priority: (openQuickAddRequest.priority as LeaseCompliancePriority | undefined) ?? "Normal",
      source: (openQuickAddRequest.source as LeaseComplianceSource | undefined) ?? "Grounds Walk",
      description: openQuickAddRequest.description ?? "",
      locationNotes: openQuickAddRequest.locationNotes ?? "",
      assignedUserId: "",
    });
    window.setTimeout(() => descriptionInputRef.current?.focus(), 0);
  }, [openQuickAddRequest]);

  const overviewQuery = useQuery({
    queryKey: ["lease-compliance", "overview", propertyId],
    queryFn: () => getLeaseComplianceOverview(propertyId || undefined),
    enabled: Boolean(propertyId) && permissions.view,
  });
  const issueTypesQuery = useQuery({
    queryKey: ["lease-compliance", "issue-types", propertyId],
    queryFn: () => getLeaseComplianceIssueTypes(propertyId),
    enabled: Boolean(propertyId) && permissions.view,
  });
  const settingsQuery = useQuery({
    queryKey: ["lease-compliance", "settings", propertyId],
    queryFn: () => getLeaseComplianceSettings(propertyId),
    enabled: Boolean(propertyId) && permissions.view,
  });
  const issuesQuery = useQuery({
    queryKey: ["lease-compliance", "issues", propertyId, tab, search, statusFilter, noticeStageFilter],
    queryFn: () => getLeaseComplianceIssues({
      propertyId: propertyId || undefined,
      q: search || undefined,
      status: tab === "resolved" ? "Resolved" : tab === "archive" ? "Archived" : statusFilter || undefined,
      noticeStage: tab === "needs-notice" ? (noticeStageFilter || undefined) : tab === "violation" ? "Violation Needed" : noticeStageFilter || undefined,
      includeArchived: tab === "archive",
      limit: 200,
    }),
    enabled: Boolean(propertyId) && permissions.view,
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["lease-compliance"] });
    await queryClient.invalidateQueries({ queryKey: ["my-work"] });
  };

  const createIssueMutation = useMutation({ mutationFn: createLeaseComplianceIssue, onSuccess: invalidate });
  const updateIssueMutation = useMutation({ mutationFn: ({ id, input }: { id: string; input: Partial<Parameters<typeof createLeaseComplianceIssue>[0]> }) => updateLeaseComplianceIssue(id, input), onSuccess: invalidate });
  const addNoteMutation = useMutation({ mutationFn: ({ id, body }: { id: string; body: string }) => addLeaseComplianceIssueNote(id, body), onSuccess: invalidate });
  const persistMutation = useMutation({ mutationFn: ({ id, notes }: { id: string; notes?: string }) => markLeaseComplianceStillPersists(id, notes), onSuccess: invalidate });
  const noticeMutation = useMutation({ mutationFn: ({ id, action }: { id: string; action: LeaseComplianceNoticeAction["action"] }) => markLeaseComplianceNotice(id, { action }), onSuccess: invalidate });
  const resolveMutation = useMutation({ mutationFn: ({ id, resolutionNotes }: { id: string; resolutionNotes: string }) => resolveLeaseComplianceIssue(id, resolutionNotes), onSuccess: invalidate });
  const archiveMutation = useMutation({ mutationFn: ({ id, notes }: { id: string; notes?: string }) => archiveLeaseComplianceIssue(id, notes), onSuccess: invalidate });
  const dismissRecurringMutation = useMutation({ mutationFn: ({ id, notes }: { id: string; notes: string }) => dismissLeaseComplianceRecurringFlag(id, notes), onSuccess: invalidate });
  const uploadMutation = useMutation({
    mutationFn: async ({ issueId, file }: { issueId: string; file: File }) => {
      try {
        return await uploadLeaseComplianceIssuePhoto(issueId, file);
      } catch (error) {
        if (isApiError(error) && error.status === 0) {
          await enqueueLeaseUpload(issueId, propertyId || undefined, [{ file }]);
          return { photo: null };
        }
        throw error;
      }
    },
    onSuccess: invalidate,
  });
  const deletePhotoMutation = useMutation({ mutationFn: deleteLeaseComplianceIssuePhoto, onSuccess: invalidate });
  const createIssueTypeMutation = useMutation({ mutationFn: createLeaseComplianceIssueType, onSuccess: invalidate });
  const updateIssueTypeMutation = useMutation({ mutationFn: ({ id, input }: { id: string; input: Partial<Parameters<typeof createLeaseComplianceIssueType>[0]> }) => updateLeaseComplianceIssueType(id, input), onSuccess: invalidate });
  const updateSettingsMutation = useMutation({ mutationFn: updateLeaseComplianceSettings, onSuccess: invalidate });

  const issueTypes = issueTypesQuery.data?.issueTypes ?? overviewQuery.data?.issueTypes ?? [];
  const settings = settingsQuery.data?.settings ?? overviewQuery.data?.settings ?? null;
  const issues = issuesQuery.data?.issues ?? [];
  const selectedQuickAddUnit = useMemo(
    () => propertyUnits.find((unit) => unit.id === quickAddUnitId) ?? null,
    [propertyUnits, quickAddUnitId]
  );
  const activeIssueTypes = useMemo(() => issueTypes.filter((entry) => entry.isActive), [issueTypes]);
  const matchingQuickIssues = useMemo(() => {
    const normalizedBuilding = normalizeLocationValue(quickAddDraft.building);
    const normalizedArea = normalizeLocationValue(quickAddDraft.area);
    const normalizedIssueType = normalizeLocationValue(quickAddDraft.issueTypeName);
    const exactLocationMatch = (issue: LeaseComplianceIssue) => {
      const buildingMatches = normalizedBuilding && normalizeLocationValue(issue.building) === normalizedBuilding;
      const areaMatches = normalizedArea && normalizeLocationValue(issue.area) === normalizedArea;
      if (normalizedBuilding && normalizedArea) return buildingMatches && areaMatches;
      if (normalizedBuilding) return buildingMatches;
      if (normalizedArea) return areaMatches;
      return false;
    };
    return issues
      .filter((issue) => {
        if (issue.isArchived) return false;
        if (quickAddUnitId && issue.unitId === quickAddUnitId) return true;
        return exactLocationMatch(issue);
      })
      .sort((left, right) => {
        const leftTypeMatch = normalizedIssueType && normalizeLocationValue(left.issueTypeName) === normalizedIssueType ? 1 : 0;
        const rightTypeMatch = normalizedIssueType && normalizeLocationValue(right.issueTypeName) === normalizedIssueType ? 1 : 0;
        if (leftTypeMatch !== rightTypeMatch) return rightTypeMatch - leftTypeMatch;
        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      });
  }, [issues, quickAddUnitId, quickAddDraft.building, quickAddDraft.area, quickAddDraft.issueTypeName]);
  const latestMatchingQuickIssue = matchingQuickIssues[0] ?? null;
  const groundsRecentLocations = useMemo(() => {
    const seen = new Set<string>();
    return issues.flatMap((issue) => {
      const building = issue.building?.trim() ?? "";
      const area = issue.area?.trim() ?? "";
      if (!building && !area) return [];
      const key = `${building}|${area}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{
        key,
        building,
        area,
        label: [building, area].filter(Boolean).join(" / "),
      }];
    }).slice(0, 8);
  }, [issues]);
  const canSubmitQuickIssue = Boolean(quickAddPhotos.length || quickAddDraft.description.trim());

  useEffect(() => {
    const selected = issueTypes.find((entry) => entry.id === quickAddDraft.issueTypeId);
    if (selected && quickAddDraft.issueTypeName !== selected.name) {
      setQuickAddDraft((current) => ({ ...current, issueTypeName: selected.name }));
    }
  }, [issueTypes, quickAddDraft.issueTypeId, quickAddDraft.issueTypeName]);

  useEffect(() => {
    if (tab === "grounds") {
      setQuickAddDraft((current) => ({ ...current, source: "Grounds Walk" }));
    }
  }, [tab]);

  useEffect(() => {
    if (!latestMatchingQuickIssue || !isMobileLayout) return;
    setShowAdvancedQuickCapture(false);
  }, [latestMatchingQuickIssue, isMobileLayout]);

  function applyIssueTemplate(issue: LeaseComplianceIssue) {
    setQuickAddDraft((current) => ({
      ...current,
      building: issue.building ?? current.building,
      area: issue.area ?? current.area,
      issueTypeId: issue.issueTypeId ?? current.issueTypeId,
      issueTypeName: issue.issueTypeName,
      additionalIssueType: issue.additionalIssueType ?? "",
      priority: issue.priority,
      source: issue.source,
      locationNotes: issue.locationNotes ?? "",
      assignedUserId: issue.assignedUserId ?? "",
    }));
  }

  async function markIssueStillApplies(issue: LeaseComplianceIssue) {
    const persistSummary = [
      quickAddDraft.description.trim(),
      quickAddDraft.locationNotes.trim(),
    ].filter(Boolean).join(" / ") || "Confirmed still visible from quick capture.";
    await persistMutation.mutateAsync({ id: issue.id, notes: persistSummary });
    if (quickAddDraft.description.trim()) {
      await addNoteMutation.mutateAsync({ id: issue.id, body: quickAddDraft.description.trim() });
    }
    for (const file of quickAddPhotos) {
      await uploadMutation.mutateAsync({ issueId: issue.id, file });
    }
    setLastCreatedIssue({
      id: issue.id,
      label: issue.unit?.number ?? issue.area ?? issue.building ?? "Area",
      issueTypeName: issue.issueTypeName,
      building: issue.building ?? "",
      area: issue.area ?? "",
    });
    setQuickAddPhotos([]);
    setQuickAddDraft((current) => ({
      ...current,
      building: groundsStickyLocation ? current.building : "",
      area: groundsStickyLocation ? current.area : "",
      description: "",
      locationNotes: "",
    }));
    if (captureInputRef.current) captureInputRef.current.value = "";
    if (uploadInputRef.current) uploadInputRef.current.value = "";
  }

  async function createQuickIssue(mode: "create" | "keep-walking" = "create") {
    const quickIssueInput = {
      propertyId,
      unitId: quickAddUnitId || null,
      issueTypeId: quickAddDraft.issueTypeId || null,
      building: quickAddDraft.building.trim() || null,
      area: quickAddDraft.area.trim() || null,
      issueTypeName: quickAddDraft.issueTypeName,
      additionalIssueType: quickAddDraft.additionalIssueType.trim() || null,
      priority: quickAddDraft.priority,
      source: quickAddDraft.source,
      description: quickAddDraft.description.trim() || null,
      locationNotes: quickAddDraft.locationNotes.trim() || null,
      assignedUserId: quickAddDraft.assignedUserId || null,
    };
    let created;
    try {
      created = await createIssueMutation.mutateAsync(quickIssueInput);
    } catch (error) {
      if (!(isApiError(error) && error.status === 0)) {
        throw error;
      }
      await enqueueLeaseCreate(quickIssueInput, quickAddPhotos.map((file) => ({ file })));
      setQuickAddUnitId("");
      setQuickAddPhotos([]);
      setQuickAddDraft({
        building: "",
        area: "",
        issueTypeId: "",
        issueTypeName: "",
        additionalIssueType: "",
        priority: "Normal",
        source: tab === "grounds" ? "Grounds Walk" : "Grounds Walk",
        description: "",
        locationNotes: "",
        assignedUserId: "",
      });
      if (captureInputRef.current) captureInputRef.current.value = "";
      if (uploadInputRef.current) uploadInputRef.current.value = "";
      return;
    }
    if (openQuickAddRequest?.mapPin && openQuickAddRequest.propertyId === propertyId) {
      void createPropertyMapPin({
        propertyId,
        mapId: openQuickAddRequest.mapPin.mapId,
        title: `${created.issue.unit?.number ?? created.issue.area ?? created.issue.building ?? "Area"} / ${created.issue.issueTypeName}`,
        pinType: "Known Issue",
        xPercent: openQuickAddRequest.mapPin.xPercent,
        yPercent: openQuickAddRequest.mapPin.yPercent,
        building: created.issue.building ?? null,
        unitLabel: created.issue.unit?.number ?? null,
        area: created.issue.area ?? null,
        description: created.issue.description ?? created.issue.locationNotes ?? null,
        linkedRecordType: "LEASE_COMPLIANCE_ISSUE",
        linkedRecordId: created.issue.id,
        tags: ["lease-compliance", "property-map"],
        isEmergency: created.issue.priority === "Critical",
      }).then(() => queryClient.invalidateQueries({ queryKey: ["property-map-pins"] })).catch(() => undefined);
    }
    if (quickAddPhotos.length) {
      for (const file of quickAddPhotos) {
        // Preserve the fast field workflow: create the issue first, then attach selected evidence as initial photos.
        await uploadMutation.mutateAsync({ issueId: created.issue.id, file });
      }
    }
    setLastCreatedIssue({
      id: created.issue.id,
      label: created.issue.unit?.number ?? created.issue.area ?? created.issue.building ?? "Area",
      issueTypeName: created.issue.issueTypeName,
      building: created.issue.building ?? "",
      area: created.issue.area ?? "",
    });
    setQuickAddUnitId("");
    setQuickAddPhotos([]);
    if (mode === "keep-walking") {
      setQuickAddDraft((current) => ({
        ...current,
        building: groundsStickyLocation ? current.building : "",
        area: groundsStickyLocation ? current.area : "",
        additionalIssueType: "",
        description: "",
        locationNotes: "",
      }));
      window.setTimeout(() => descriptionInputRef.current?.focus(), 0);
    } else {
      setQuickAddDraft({
        building: "",
        area: "",
        issueTypeId: "",
        issueTypeName: "",
        additionalIssueType: "",
        priority: "Normal",
        source: tab === "grounds" ? "Grounds Walk" : "Grounds Walk",
        description: "",
        locationNotes: "",
        assignedUserId: "",
      });
    }
    if (captureInputRef.current) captureInputRef.current.value = "";
    if (uploadInputRef.current) uploadInputRef.current.value = "";
  }

  async function submitQuickAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await createQuickIssue("create");
  }

  if (!permissions.view) {
    return <StatusState title={t(language, "lease.unavailableTitle")} description={t(language, "lease.unavailableCopy")} tone="error" />;
  }
  if (!properties.length) {
    return <StatusState title={t(language, "lease.noPropertiesTitle")} description={t(language, "lease.noPropertiesCopy")} />;
  }

  return (
    <section className="pool-panel module-panel" data-testid="lease-compliance-panel">
      <div className="module-heading">
        <div>
          <span className="eyebrow">{t(language, "lease.title")}</span>
          <h1>{t(language, "lease.title")}</h1>
          <p>{t(language, "lease.copy")}</p>
        </div>
        <div className="module-actions">
          <select value={propertyId} onChange={(event) => setPropertyId(event.target.value)} aria-label={t(language, "lease.property")}>
            {properties.map((property) => <option key={property.id} value={property.id}>{property.code} - {property.name}</option>)}
          </select>
        </div>
      </div>

      <div className="module-tabs" aria-label={t(language, "lease.sections")}>
        {([
          ["dashboard", t(language, "nav.dashboard")],
          ["active", t(language, "lease.activeIssues")],
          ["grounds", t(language, "lease.groundsWalk")],
          ["needs-notice", t(language, "lease.needsNotice")],
          ["violation", t(language, "lease.violationNeeded")],
          ["resolved", t(language, "lease.resolvedTab")],
          ["archive", t(language, "savedViews.archive")],
          ["reports", t(language, "pm.reports")],
          ["settings", t(language, "nav.setup")],
        ] as Array<[Tab, string]>).map(([key, label]) => (
          <button key={key} type="button" className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {permissions.edit && (tab === "dashboard" || tab === "grounds" || tab === "active") ? (
        <section className="panel-card" style={{ marginBottom: 16 }}>
          <div className="drawer-section-title">
            <h2>{tab === "grounds" ? t(language, "lease.groundsWalkCapture") : t(language, "lease.quickCapture")}</h2>
          </div>
          <form data-testid="lease-quick-capture-form" className="pool-form" onSubmit={(event) => void submitQuickAdd(event)}>
            <div className="pool-entry-actions" style={{ marginBottom: 12, flexWrap: "wrap" }}>
              <button className="button button-secondary" type="button" onClick={() => captureInputRef.current?.click()}>{t(language, "lease.snapPicture")}</button>
              <button className="button button-secondary" type="button" onClick={() => uploadInputRef.current?.click()}>{t(language, "lease.uploadEvidence")}</button>
              <input
                ref={captureInputRef}
                type="file"
                hidden
                accept="image/*"
                capture="environment"
                multiple
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  if (files.length) setQuickAddPhotos((current) => [...current, ...files]);
                  event.currentTarget.value = "";
                }}
              />
              <input
                ref={uploadInputRef}
                type="file"
                hidden
                accept="image/*,.pdf"
                multiple
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  if (files.length) setQuickAddPhotos((current) => [...current, ...files]);
                  event.currentTarget.value = "";
                }}
              />
              {quickAddPhotos.length ? (
                <>
                  <span className="muted">{t(language, "lease.filesSelected").replace("{count}", String(quickAddPhotos.length))}</span>
                  <button className="button button-ghost" type="button" onClick={() => setQuickAddPhotos([])}>{t(language, "lease.clearFiles")}</button>
                </>
              ) : <span className="muted">{t(language, "lease.snapOrDescribe")}</span>}
            </div>
            {quickAddPhotos.length ? (
              <div className="issue-media-strip selected-media-strip">
                {quickAddPhotos.map((file, index) => {
                  const preview = URL.createObjectURL(file);
                  const image = file.type.startsWith("image/");
                  return (
                    <div key={`${file.name}-${file.lastModified}-${index}`} className="issue-media-chip selected">
                      {image ? <img src={preview} alt={file.name} onLoad={() => URL.revokeObjectURL(preview)} /> : <span className="issue-media-file-badge">PDF</span>}
                      <span>{file.name}</span>
                    </div>
                  );
                })}
              </div>
            ) : null}
            {latestMatchingQuickIssue ? (
              <section className="lease-repeat-card" data-testid="lease-repeat-card">
                <div className="lease-repeat-card-media">
                  {latestMatchingQuickIssue.photos[0] ? (
                    <a href={leaseComplianceIssuePhotoDownloadUrl(latestMatchingQuickIssue.photos[0].id)} target="_blank" rel="noreferrer">
                      <img
                        src={leaseComplianceIssuePhotoDownloadUrl(latestMatchingQuickIssue.photos[0].id)}
                        alt={`${latestMatchingQuickIssue.issueTypeName} evidence`}
                      />
                    </a>
                  ) : (
                    <div className="lease-repeat-card-placeholder">{t(language, "lease.noPriorPhoto")}</div>
                  )}
                </div>
                <div className="lease-repeat-card-body">
                  <span className="eyebrow">{t(language, "lease.existingIssueFound")}</span>
                  <h3>{selectedQuickAddUnit?.number ?? latestMatchingQuickIssue.area ?? latestMatchingQuickIssue.building ?? t(language, "lease.unitFallback")} / {latestMatchingQuickIssue.issueTypeName}</h3>
                  <p>
                    {t(language, "lease.lastReported")} {formatDate(latestMatchingQuickIssue.createdAt)}
                    {latestMatchingQuickIssue.description ? ` / ${latestMatchingQuickIssue.description}` : ""}
                  </p>
                  <div className="pool-reading-stack">
                    <span>{latestMatchingQuickIssue.status}</span>
                    <span>{latestMatchingQuickIssue.noticeStage}</span>
                    <span>{t(language, "lease.persistedCount").replace("{count}", String(latestMatchingQuickIssue.persistenceCount))}</span>
                    {matchingQuickIssues.length > 1 ? <span>{t(language, "lease.relatedIssues").replace("{count}", String(matchingQuickIssues.length))}</span> : null}
                  </div>
                  <div className="pool-entry-actions lease-repeat-card-actions">
                    <button
                      className="button button-primary"
                      type="button"
                      disabled={persistMutation.isPending || addNoteMutation.isPending || uploadMutation.isPending}
                      onClick={() => void markIssueStillApplies(latestMatchingQuickIssue)}
                    >
                      {t(language, "lease.stillApplies")}
                    </button>
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => {
                        applyIssueTemplate(latestMatchingQuickIssue);
                        setShowAdvancedQuickCapture(true);
                        window.setTimeout(() => descriptionInputRef.current?.focus(), 0);
                      }}
                    >
                      {t(language, "lease.reportNewIssue")}
                    </button>
                  </div>
                </div>
              </section>
            ) : null}
            {tab === "grounds" ? (
              <div className="lease-grounds-capture">
                <label className="lease-grounds-toggle">
                  <input
                    type="checkbox"
                    checked={groundsStickyLocation}
                    onChange={(event) => setGroundsStickyLocation(event.target.checked)}
                  />
                  {t(language, "lease.keepBuildingArea")}
                </label>
                {lastCreatedIssue ? (
                  <div className="lease-grounds-feedback">
                    <strong>{t(language, "lease.savedIssue").replace("{label}", lastCreatedIssue.label).replace("{issueType}", lastCreatedIssue.issueTypeName)}</strong>
                    <span>{t(language, "lease.readyNextExterior")}</span>
                    {(lastCreatedIssue.building || lastCreatedIssue.area) ? (
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => setQuickAddDraft((current) => ({
                          ...current,
                          building: lastCreatedIssue.building,
                          area: lastCreatedIssue.area,
                        }))}
                      >
                        {t(language, "lease.useSameLocation")}
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <p className="muted">{t(language, "lease.keepWalkingHelp")}</p>
                )}
                {activeIssueTypes.length ? (
                  <div className="lease-grounds-section">
                    <span className="eyebrow">{t(language, "lease.quickIssueTypes")}</span>
                    <div className="lease-grounds-chip-list">
                      {activeIssueTypes.map((entry) => (
                        <button
                          key={entry.id}
                          className={`button ${quickAddDraft.issueTypeId === entry.id ? "button-primary" : "button-secondary"}`}
                          type="button"
                          onClick={() => setQuickAddDraft((current) => ({
                            ...current,
                            issueTypeId: entry.id,
                            issueTypeName: entry.name,
                          }))}
                        >
                          {entry.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {groundsRecentLocations.length ? (
                  <div className="lease-grounds-section">
                    <span className="eyebrow">{t(language, "lease.recentWalkLocations")}</span>
                    <div className="lease-grounds-chip-list">
                      {groundsRecentLocations.map((location) => (
                        <button
                          key={location.key}
                          className="button button-secondary"
                          type="button"
                          onClick={() => setQuickAddDraft((current) => ({
                            ...current,
                            building: location.building,
                            area: location.area,
                          }))}
                        >
                          {location.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="form-grid pest-quick-grid">
              <label>{t(language, "lease.unit")}
                <UnitSearchSelect
                  name="unitId"
                  units={propertyUnits}
                  value={quickAddUnitId}
                  onChange={(value) => {
                    setQuickAddUnitId(value);
                    if (!value) return;
                    const nextIssue = issues
                      .filter((issue) => issue.unitId === value && !issue.isArchived)
                      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0];
                    if (nextIssue) {
                      applyIssueTemplate(nextIssue);
                      setShowAdvancedQuickCapture(false);
                    }
                  }}
                  emptyLabel={t(language, "lease.areaExteriorOnly")}
                  placeholder={t(language, "lease.searchUnit")}
                />
              </label>
              <label>{t(language, "lease.building")}
                <input data-testid="lease-quick-capture-building" value={quickAddDraft.building} onChange={(event) => setQuickAddDraft((current) => ({ ...current, building: event.target.value }))} placeholder={t(language, "lease.buildingPlaceholder")} />
              </label>
              <label>{t(language, "lease.area")}
                <input data-testid="lease-quick-capture-area" value={quickAddDraft.area} onChange={(event) => setQuickAddDraft((current) => ({ ...current, area: event.target.value }))} placeholder={t(language, "lease.areaPlaceholder")} />
              </label>
              <label>{t(language, "lease.issueType")}
                <select data-testid="lease-quick-capture-issue-type" value={quickAddDraft.issueTypeId} onChange={(event) => {
                  const nextId = event.target.value;
                  const selected = issueTypes.find((entry) => entry.id === nextId);
                  setQuickAddDraft((current) => ({ ...current, issueTypeId: nextId, issueTypeName: selected?.name ?? "" }));
                }}>
                  <option value="">{t(language, "lease.selectIssueType")}</option>
                  {issueTypes.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
                </select>
              </label>
            </div>
            <label className="pool-textarea-wide">{t(language, "lease.shortDescription")}
              <textarea data-testid="lease-quick-capture-description" ref={descriptionInputRef} value={quickAddDraft.description} onChange={(event) => setQuickAddDraft((current) => ({ ...current, description: event.target.value }))} placeholder={t(language, "lease.shortDescriptionPlaceholder")} />
            </label>
            {isMobileLayout ? (
              <button
                className="button button-secondary lease-advanced-toggle"
                type="button"
                onClick={() => setShowAdvancedQuickCapture((current) => !current)}
              >
                {showAdvancedQuickCapture ? t(language, "lease.hideMoreDetails") : t(language, "lease.moreDetails")}
              </button>
            ) : null}
            {showAdvancedQuickCapture ? (
              <>
                <div className="form-grid pest-quick-grid">
                  <label>{t(language, "lease.additionalIssueType")}
                    <input value={quickAddDraft.additionalIssueType} onChange={(event) => setQuickAddDraft((current) => ({ ...current, additionalIssueType: event.target.value }))} placeholder={t(language, "lease.optionalDetail")} />
                  </label>
                  <label>{t(language, "lease.priority")}
                    <select value={quickAddDraft.priority} onChange={(event) => setQuickAddDraft((current) => ({ ...current, priority: event.target.value as LeaseCompliancePriority }))}>
                      {priorities.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                    </select>
                  </label>
                  {tab !== "grounds" ? (
                    <label>{t(language, "lease.source")}
                      <select value={quickAddDraft.source} onChange={(event) => setQuickAddDraft((current) => ({ ...current, source: event.target.value as LeaseComplianceSource }))}>
                        {sources.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                      </select>
                    </label>
                  ) : null}
                  <label>{t(language, "lease.assignedUser")}
                    <SearchSelect
                      options={assignableUserOptions}
                      value={quickAddDraft.assignedUserId}
                      onChange={(assignedUserId) => setQuickAddDraft((current) => ({ ...current, assignedUserId }))}
                      placeholder={t(language, "pm.searchUser")}
                      emptyLabel={t(language, "lease.unassigned")}
                      noMatchesLabel={t(language, "pm.noMatchingUsers")}
                      clearLabel={t(language, "pm.clearAssignedUser")}
                    />
                  </label>
                </div>
                <label className="pool-textarea-wide">{t(language, "lease.locationNotes")}
                  <textarea value={quickAddDraft.locationNotes} onChange={(event) => setQuickAddDraft((current) => ({ ...current, locationNotes: event.target.value }))} placeholder={t(language, "lease.locationNotesPlaceholder")} />
                </label>
              </>
            ) : null}
            <div className="pool-entry-actions">
              <button data-testid="lease-quick-capture-submit" className="button button-primary" type="submit" disabled={createIssueMutation.isPending || uploadMutation.isPending || !canSubmitQuickIssue}>{t(language, "lease.createIssue")}</button>
              {tab === "grounds" ? (
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={createIssueMutation.isPending || uploadMutation.isPending || !canSubmitQuickIssue}
                  onClick={() => void createQuickIssue("keep-walking")}
                >
                  {t(language, "lease.createKeepWalking")}
                </button>
              ) : null}
            </div>
          </form>
        </section>
      ) : null}

      {tab === "dashboard" ? (
        overviewQuery.isLoading ? <StatusState title={t(language, "lease.loadingTitle")} description={t(language, "lease.loadingCopy")} /> : overviewQuery.isError || !overviewQuery.data ? <StatusState title={t(language, "lease.failedTitle")} description={t(language, "lease.failedCopy")} tone="error" /> : (
          <div className="dashboard-grid">
            <section className="panel-card">
              <h2>{t(language, "dashboard.overview")}</h2>
              <div className="dashboard-kpis pest-dashboard-kpis">
                <div><strong>{overviewQuery.data.summary.openIssues}</strong><span>{t(language, "lease.openIssues")}</span></div>
                <div><strong>{overviewQuery.data.summary.needsNotice}</strong><span>{t(language, "lease.needsNotice")}</span></div>
                <div><strong>{overviewQuery.data.summary.violationNeeded}</strong><span>{t(language, "lease.violationNeeded")}</span></div>
                <div><strong>{overviewQuery.data.summary.recurringConcerns}</strong><span>{t(language, "lease.recurring")}</span></div>
                <div><strong>{overviewQuery.data.summary.managerReviewRequired}</strong><span>{t(language, "lease.managerReview")}</span></div>
                <div><strong>{overviewQuery.data.summary.overdueOpen}</strong><span>{t(language, "lease.agingWatch")}</span></div>
              </div>
            </section>
            <section className="panel-card">
              <h2>{t(language, "lease.needsNotice")}</h2>
              {overviewQuery.data.needsNotice.length ? overviewQuery.data.needsNotice.map((issue) => <p key={issue.id}>{issue.unit?.number ?? issue.area ?? issue.building ?? t(language, "lease.area")} / {issue.issueTypeName} / {issue.noticeStage}</p>) : <p className="muted">{t(language, "lease.nothingWaitingNotice")}</p>}
            </section>
            <section className="panel-card">
              <h2>{t(language, "lease.violationNeeded")}</h2>
              {overviewQuery.data.violationNeeded.length ? overviewQuery.data.violationNeeded.map((issue) => <p key={issue.id}>{issue.unit?.number ?? issue.area ?? issue.building ?? t(language, "lease.area")} / {issue.issueTypeName}</p>) : <p className="muted">{t(language, "lease.noViolationNeeded")}</p>}
            </section>
            <section className="panel-card">
              <h2>{t(language, "lease.recentIssues")}</h2>
              {overviewQuery.data.recentIssues.length ? overviewQuery.data.recentIssues.map((issue) => <p key={issue.id}>{issue.unit?.number ?? issue.area ?? issue.building ?? t(language, "lease.area")} / {issue.issueTypeName} / {issue.status}</p>) : <p className="muted">{t(language, "lease.noRecentIssues")}</p>}
            </section>
          </div>
        )
      ) : null}

      {["active", "grounds", "needs-notice", "violation", "resolved", "archive"].includes(tab) ? (
        <>
          <section className="panel-card" style={{ marginBottom: 16 }}>
            <div className="pool-grid">
              <label>{t(language, "nav.search")}
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t(language, "lease.searchPlaceholder")} />
              </label>
              <label>{t(language, "admin.status")}
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as LeaseComplianceStatus | "")}>
                  <option value="">{t(language, "lease.allStatuses")}</option>
                  {statuses.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                </select>
              </label>
              <label>{t(language, "lease.noticeStage")}
                <select value={noticeStageFilter} onChange={(event) => setNoticeStageFilter(event.target.value as LeaseComplianceNoticeStage | "")}>
                  <option value="">{t(language, "lease.allNoticeStages")}</option>
                  {noticeStages.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                </select>
              </label>
            </div>
          </section>
          {issuesQuery.isLoading ? <StatusState title={t(language, "lease.loadingIssuesTitle")} description={t(language, "lease.loadingIssuesCopy")} /> : issuesQuery.isError || !issuesQuery.data ? <StatusState title={t(language, "lease.failedIssuesTitle")} description={t(language, "lease.failedIssuesCopy")} tone="error" /> : (
            <div className="pool-card-grid">
              {issues
                .filter((issue) => {
                  if (tab === "needs-notice") return ["Resident Notified", "Notice Sent"].includes(issue.status) || ["Resident Notified", "1st Notice", "2nd Notice", "3rd Notice"].includes(issue.noticeStage);
                  if (tab === "violation") return issue.status === "Violation Needed" || issue.noticeStage === "Violation Needed";
                  if (tab === "resolved") return issue.status === "Resolved";
                  if (tab === "archive") return issue.isArchived || issue.status === "Archived";
                  if (tab === "active" || tab === "grounds") return !issue.isArchived && issue.status !== "Resolved" && issue.status !== "Archived";
                  return true;
                })
                .map((issue) => (
                  <IssueCard
                    key={issue.id}
                    issue={issue}
                    canEdit={permissions.edit}
                    canNotice={permissions.notice}
                    users={assignableUsers}
                    language={language}
                    onSave={(id, input) => updateIssueMutation.mutate({ id, input })}
                    onNote={(id, body) => addNoteMutation.mutate({ id, body })}
                    onPersist={(id, notes) => persistMutation.mutate({ id, notes })}
                    onNotice={(id, action) => noticeMutation.mutate({ id, action })}
                    onResolve={(id, resolutionNotes) => resolveMutation.mutate({ id, resolutionNotes })}
                    onArchive={(id, notes) => archiveMutation.mutate({ id, notes })}
                    onDismissRecurring={(id, notes) => dismissRecurringMutation.mutate({ id, notes })}
                    onUpload={(issueId, files) => { if (files?.[0]) uploadMutation.mutate({ issueId, file: files[0] }); }}
                    onDeletePhoto={(photoId) => deletePhotoMutation.mutate(photoId)}
                  />
                ))}
              {issues.filter((issue) => {
                if (tab === "needs-notice") return ["Resident Notified", "Notice Sent"].includes(issue.status) || ["Resident Notified", "1st Notice", "2nd Notice", "3rd Notice"].includes(issue.noticeStage);
                if (tab === "violation") return issue.status === "Violation Needed" || issue.noticeStage === "Violation Needed";
                if (tab === "resolved") return issue.status === "Resolved";
                if (tab === "archive") return issue.isArchived || issue.status === "Archived";
                if (tab === "active" || tab === "grounds") return !issue.isArchived && issue.status !== "Resolved" && issue.status !== "Archived";
                return true;
              }).length === 0 ? <p className="muted">{t(language, "lease.noMatchingIssues")}</p> : null}
            </div>
          )}
        </>
      ) : null}

      {tab === "reports" ? (
        <section className="panel-card">
          <div className="drawer-section-title">
            <h2>{t(language, "lease.reports")}</h2>
          </div>
          <p className="muted">{t(language, "lease.reportsCopy")}</p>
          <div className="pool-entry-actions">
            <a className="button button-secondary" href={leaseComplianceExportCsvUrl({ propertyId })} target="_blank" rel="noreferrer">{t(language, "lease.exportCsv")}</a>
            <a className="button button-secondary" href={leaseCompliancePrintableHtmlReportUrl({ propertyId })} target="_blank" rel="noreferrer">{t(language, "lease.printableHtml")}</a>
            <a className="button button-primary" href={leaseCompliancePrintableReportUrl({ propertyId })} target="_blank" rel="noreferrer">{t(language, "lease.openPdf")}</a>
          </div>
        </section>
      ) : null}

      {tab === "settings" ? (
        <div className="dashboard-grid">
          <section className="panel-card">
            <div className="drawer-section-title">
              <h2>{t(language, "lease.issueTypes")}</h2>
            </div>
            {!issueTypes.length ? <p className="muted">{t(language, "lease.loadingIssueTypes")}</p> : (
              <div className="activity-feed">
                {issueTypes.map((entry) => (
                  <div key={entry.id} className="activity-entry">
                    <strong>{entry.name}</strong>
                    <span>{entry.color ?? "#58a6de"}</span>
                    {permissions.admin ? (
                      <div className="pool-entry-actions">
                        <button className="button button-secondary" type="button" onClick={() => updateIssueTypeMutation.mutate({ id: entry.id, input: { isActive: !entry.isActive } })}>{entry.isActive ? t(language, "common.archive") : t(language, "lease.restore")}</button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
            {permissions.admin ? (
              <form className="pool-form" onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void createIssueTypeMutation.mutateAsync({
                  propertyId,
                  name: String(form.get("name") ?? "").trim(),
                  color: String(form.get("color") ?? "").trim() || null,
                }).then(() => event.currentTarget.reset());
              }}>
                <div className="pool-grid">
                  <label>{t(language, "admin.name")}
                    <input name="name" placeholder={t(language, "lease.issueTypeNamePlaceholder")} />
                  </label>
                  <label>{t(language, "lease.color")}
                    <input name="color" placeholder="#58a6de" />
                  </label>
                </div>
                <div className="pool-entry-actions">
                  <button className="button button-primary" type="submit">{t(language, "lease.addIssueType")}</button>
                </div>
              </form>
            ) : null}
          </section>

          <section className="panel-card">
            <div className="drawer-section-title">
              <h2>{t(language, "lease.operationalSettings")}</h2>
            </div>
            {settings ? (
              <form className="pool-form" onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void updateSettingsMutation.mutate({
                  propertyId,
                  defaultPriority: String(form.get("defaultPriority") ?? settings.defaultPriority) as LeaseComplianceSettings["defaultPriority"],
                  watchDays: Number(form.get("watchDays") ?? settings.watchDays),
                  warningDays: Number(form.get("warningDays") ?? settings.warningDays),
                  criticalDays: Number(form.get("criticalDays") ?? settings.criticalDays),
                  firstNoticeLabel: String(form.get("firstNoticeLabel") ?? settings.firstNoticeLabel),
                  secondNoticeLabel: String(form.get("secondNoticeLabel") ?? settings.secondNoticeLabel),
                  thirdNoticeLabel: String(form.get("thirdNoticeLabel") ?? settings.thirdNoticeLabel),
                  archiveResolvedAfterDays: String(form.get("archiveResolvedAfterDays") ?? "").trim() ? Number(form.get("archiveResolvedAfterDays")) : null,
                });
              }}>
                <div className="pool-grid">
                  <label>{t(language, "lease.defaultPriority")}
                    <select name="defaultPriority" defaultValue={settings.defaultPriority}>
                      {priorities.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                    </select>
                  </label>
                  <label>{t(language, "lease.watchDays")}
                    <input name="watchDays" type="number" min={0} defaultValue={settings.watchDays} />
                  </label>
                  <label>{t(language, "lease.warningDays")}
                    <input name="warningDays" type="number" min={0} defaultValue={settings.warningDays} />
                  </label>
                  <label>{t(language, "lease.criticalDays")}
                    <input name="criticalDays" type="number" min={0} defaultValue={settings.criticalDays} />
                  </label>
                  <label>{t(language, "lease.firstNoticeLabel")}
                    <input name="firstNoticeLabel" defaultValue={settings.firstNoticeLabel} />
                  </label>
                  <label>{t(language, "lease.secondNoticeLabel")}
                    <input name="secondNoticeLabel" defaultValue={settings.secondNoticeLabel} />
                  </label>
                  <label>{t(language, "lease.thirdNoticeLabel")}
                    <input name="thirdNoticeLabel" defaultValue={settings.thirdNoticeLabel} />
                  </label>
                  <label>{t(language, "lease.archiveResolvedAfterDays")}
                    <input name="archiveResolvedAfterDays" type="number" min={0} defaultValue={settings.archiveResolvedAfterDays ?? ""} />
                  </label>
                </div>
                {permissions.admin ? (
                  <div className="pool-entry-actions">
                    <button className="button button-primary" type="submit">{t(language, "lease.saveSettings")}</button>
                  </div>
                ) : null}
              </form>
            ) : <p className="muted">{t(language, "lease.loadingPropertySettings")}</p>}
          </section>
        </div>
      ) : null}
    </section>
  );
}
