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
  type UserRole,
} from "../lib/api";
import { enqueueLeaseCreate, enqueueLeaseUpload } from "../lib/offlineSync";
import type { OpenLeaseQuickAddRequest } from "../lib/leaseNavigation";
import { StatusState } from "./StatusState";
import { UnitSearchSelect } from "./UnitSearchSelect";
import { PropertyWikiWorkflowPanel } from "./PropertyWikiWorkflowPanel";

type Tab = "dashboard" | "active" | "grounds" | "needs-notice" | "violation" | "resolved" | "archive" | "reports" | "settings";

type Props = {
  properties: Property[];
  units: Unit[];
  users: Array<{ id: string; fullName: string; role: UserRole }>;
  userRole: UserRole;
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

function IssueCard({
  issue,
  canEdit,
  canNotice,
  users,
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
  const label = issue.unit?.number ?? issue.area ?? issue.building ?? "Area";
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
        <span>{daysOpen(issue)} days open</span>
        <span>Persisted {issue.persistenceCount}x</span>
        {issue.assignedUserName ? <span>{issue.assignedUserName}</span> : null}
      </div>
      {issue.description ? <p>{issue.description}</p> : null}
      {(issue.recurringConcern || issue.managerReviewRequired) ? (
        <div className="risk-banner" style={{ marginBottom: 12 }}>
          <strong>{issue.managerReviewRequired ? "Manager review required" : "Recurring concern"}</strong>
          <span>{label} has repeated lease-compliance history.</span>
          {canEdit ? <button className="button button-secondary" type="button" onClick={() => onDismissRecurring(issue.id, "Reviewed from Lease Compliance workspace.")}>Dismiss Flag</button> : null}
        </div>
      ) : null}

      <PropertyWikiWorkflowPanel
        title="Property Wiki Context"
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
          <label>Status
            <select value={issue.status} onChange={(event) => onSave(issue.id, { status: event.target.value as LeaseComplianceStatus })}>
              {statuses.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
            </select>
          </label>
          <label>Priority
            <select value={issue.priority} onChange={(event) => onSave(issue.id, { priority: event.target.value as LeaseCompliancePriority })}>
              {priorities.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
            </select>
          </label>
          <label>Assigned user
            <select value={issue.assignedUserId ?? ""} onChange={(event) => onSave(issue.id, { assignedUserId: event.target.value || null })}>
              <option value="">Unassigned</option>
              {users.map((user) => <option key={user.id} value={user.id}>{user.fullName} / {user.role}</option>)}
            </select>
          </label>
          <label>Notice stage
            <select value={issue.noticeStage} onChange={(event) => onSave(issue.id, { noticeStage: event.target.value as LeaseComplianceNoticeStage })}>
              {noticeStages.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
            </select>
          </label>
        </div>
      ) : null}

      <div className="pool-reading-stack" style={{ marginBottom: 12 }}>
        <span>Created {formatDate(issue.createdAt)}</span>
        <span>Last persists {formatDate(issue.lastPersistenceCheckDate)}</span>
        <span>Resolved {formatDate(issue.resolvedDate)}</span>
        <span>Violation {formatDate(issue.violationNeededDate)}</span>
      </div>

      {issue.photos.length ? (
        <div className="pool-attachment-list" style={{ marginBottom: 12 }}>
          {issue.photos.map((photo) => (
            <span key={photo.id} style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <a href={leaseComplianceIssuePhotoDownloadUrl(photo.id)} target="_blank" rel="noreferrer">{photo.originalName}</a>
              <em className="muted">{photo.photoCategory.split("_").join(" ")}</em>
              {canEdit ? <button className="link-button" type="button" onClick={() => onDeletePhoto(photo.id)}>Remove</button> : null}
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
      ) : <p className="muted">No notes yet.</p>}

      {canEdit ? (
        <>
          <div className="pool-entry-actions" style={{ marginBottom: 12 }}>
            <label className="button button-secondary pool-upload-button">
              Upload photo / PDF
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
          <label>Quick note
            <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Patio still cluttered, resident not home, blinds still broken..." />
          </label>
          <div className="pool-entry-actions" style={{ marginBottom: 12 }}>
            <button className="button button-secondary" type="button" onClick={() => { if (note.trim()) { onNote(issue.id, note.trim()); setNote(""); } }}>Add Note</button>
          </div>
          <label>Still persists note
            <textarea value={persistNotes} onChange={(event) => setPersistNotes(event.target.value)} placeholder="Issue still visible during grounds walk..." />
          </label>
          <div className="pool-entry-actions" style={{ marginBottom: 12 }}>
            <button className="button button-secondary" type="button" onClick={() => { onPersist(issue.id, persistNotes.trim() || undefined); setPersistNotes(""); }}>Mark Still Persists</button>
          </div>
          <label>Resolution notes
            <textarea value={resolutionNotes} onChange={(event) => setResolutionNotes(event.target.value)} placeholder="Issue corrected, patio cleared, blinds replaced..." />
          </label>
          <div className="pool-entry-actions" style={{ marginTop: 12 }}>
            <button className="button button-primary" type="button" onClick={() => { if (resolutionNotes.trim()) { onResolve(issue.id, resolutionNotes.trim()); setResolutionNotes(""); } }}>Mark Resolved</button>
            <button className="button button-secondary" type="button" onClick={() => onArchive(issue.id, "Archived from Lease Compliance workspace.")}>Archive</button>
          </div>
        </>
      ) : null}

      {canNotice ? (
        <div className="pool-entry-actions" style={{ marginTop: 12, flexWrap: "wrap" }}>
          {activeNoticeActions.map((entry) => (
            <button key={entry.value} className="button button-secondary" type="button" onClick={() => onNotice(issue.id, entry.value)}>{entry.label}</button>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function LeaseCompliancePanel({ properties, units, users, userRole, selectedPropertyId, openQuickAddRequest }: Props) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [propertyId, setPropertyId] = useState(selectedPropertyId || properties[0]?.id || "");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeaseComplianceStatus | "">("");
  const [noticeStageFilter, setNoticeStageFilter] = useState<LeaseComplianceNoticeStage | "">("");
  const [quickAddUnitId, setQuickAddUnitId] = useState("");
  const [quickAddPhotos, setQuickAddPhotos] = useState<File[]>([]);
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

  const permissions = {
    view: ["ADMIN", "MANAGER", "TECH", "LEASING", "CLEANER", "VIEWER"].includes(userRole),
    edit: ["ADMIN", "MANAGER", "TECH", "LEASING", "CLEANER"].includes(userRole),
    notice: ["ADMIN", "MANAGER", "LEASING"].includes(userRole),
    admin: userRole === "ADMIN",
  };

  const propertyUnits = useMemo(() => units.filter((unit) => unit.propertyId === propertyId), [propertyId, units]);
  const assignableUsers = useMemo(() => users.filter((user) => user.role !== "VIEWER"), [users]);

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
          await enqueueLeaseUpload(issueId, [{ file }]);
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
  const activeIssueTypes = useMemo(() => issueTypes.filter((entry) => entry.isActive), [issueTypes]);
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
    return <StatusState title="Lease Compliance unavailable" description="This role does not have access to the Lease Compliance workspace." tone="error" />;
  }
  if (!properties.length) {
    return <StatusState title="No properties available" description="Assign at least one property before using Lease Compliance." />;
  }

  return (
    <section className="pool-panel module-panel" data-testid="lease-compliance-panel">
      <div className="module-heading">
        <div>
          <span className="eyebrow">Lease Compliance</span>
          <h1>Lease Compliance</h1>
          <p>Track visible resident lease-compliance issues, notice progress, persistence checks, and evidence without leaving the operations workspace.</p>
        </div>
        <div className="module-actions">
          <select value={propertyId} onChange={(event) => setPropertyId(event.target.value)} aria-label="Lease Compliance property">
            {properties.map((property) => <option key={property.id} value={property.id}>{property.code} - {property.name}</option>)}
          </select>
        </div>
      </div>

      <div className="module-tabs" aria-label="Lease Compliance sections">
        {([
          ["dashboard", "Dashboard"],
          ["active", "Active Issues"],
          ["grounds", "Grounds Walk"],
          ["needs-notice", "Needs Notice"],
          ["violation", "Violation Needed"],
          ["resolved", "Resolved"],
          ["archive", "Archive"],
          ["reports", "Reports"],
          ["settings", "Settings"],
        ] as Array<[Tab, string]>).map(([key, label]) => (
          <button key={key} type="button" className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {permissions.edit && (tab === "dashboard" || tab === "grounds" || tab === "active") ? (
        <section className="panel-card" style={{ marginBottom: 16 }}>
          <div className="drawer-section-title">
            <h2>{tab === "grounds" ? "Grounds Walk Capture" : "Quick Capture"}</h2>
          </div>
          <form data-testid="lease-quick-capture-form" className="pool-form" onSubmit={(event) => void submitQuickAdd(event)}>
            <div className="pool-entry-actions" style={{ marginBottom: 12, flexWrap: "wrap" }}>
              <button className="button button-secondary" type="button" onClick={() => captureInputRef.current?.click()}>Snap Picture</button>
              <button className="button button-secondary" type="button" onClick={() => uploadInputRef.current?.click()}>Upload Evidence</button>
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
                  <span className="muted">{quickAddPhotos.length} file{quickAddPhotos.length === 1 ? "" : "s"} selected</span>
                  <button className="button button-ghost" type="button" onClick={() => setQuickAddPhotos([])}>Clear Files</button>
                </>
              ) : <span className="muted">Snap a photo first or type a short description.</span>}
            </div>
            {tab === "grounds" ? (
              <div className="lease-grounds-capture">
                <label className="lease-grounds-toggle">
                  <input
                    type="checkbox"
                    checked={groundsStickyLocation}
                    onChange={(event) => setGroundsStickyLocation(event.target.checked)}
                  />
                  Keep building and area after each saved issue
                </label>
                {lastCreatedIssue ? (
                  <div className="lease-grounds-feedback">
                    <strong>Saved {lastCreatedIssue.label} / {lastCreatedIssue.issueTypeName}</strong>
                    <span>Ready for the next exterior issue.</span>
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
                        Use Same Location
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <p className="muted">Keep Walking leaves your issue type, assignment, and priority in place so you only enter what changed.</p>
                )}
                {activeIssueTypes.length ? (
                  <div className="lease-grounds-section">
                    <span className="eyebrow">Quick Issue Types</span>
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
                    <span className="eyebrow">Recent Walk Locations</span>
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
              <label>Unit
                <UnitSearchSelect
                  name="unitId"
                  units={propertyUnits}
                  value={quickAddUnitId}
                  onChange={setQuickAddUnitId}
                  emptyLabel="Area / exterior only"
                  placeholder="Search unit..."
                />
              </label>
              <label>Building
                <input data-testid="lease-quick-capture-building" value={quickAddDraft.building} onChange={(event) => setQuickAddDraft((current) => ({ ...current, building: event.target.value }))} placeholder="Building 12" />
              </label>
              <label>Area
                <input data-testid="lease-quick-capture-area" value={quickAddDraft.area} onChange={(event) => setQuickAddDraft((current) => ({ ...current, area: event.target.value }))} placeholder="Patio, breezeway, parking..." />
              </label>
              <label>Issue type
                <select data-testid="lease-quick-capture-issue-type" value={quickAddDraft.issueTypeId} onChange={(event) => {
                  const nextId = event.target.value;
                  const selected = issueTypes.find((entry) => entry.id === nextId);
                  setQuickAddDraft((current) => ({ ...current, issueTypeId: nextId, issueTypeName: selected?.name ?? "" }));
                }}>
                  <option value="">Select issue type</option>
                  {issueTypes.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
                </select>
              </label>
              <label>Additional issue type
                <input value={quickAddDraft.additionalIssueType} onChange={(event) => setQuickAddDraft((current) => ({ ...current, additionalIssueType: event.target.value }))} placeholder="Optional detail" />
              </label>
              <label>Priority
                <select value={quickAddDraft.priority} onChange={(event) => setQuickAddDraft((current) => ({ ...current, priority: event.target.value as LeaseCompliancePriority }))}>
                  {priorities.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                </select>
              </label>
              <label>Source
                <select value={quickAddDraft.source} onChange={(event) => setQuickAddDraft((current) => ({ ...current, source: event.target.value as LeaseComplianceSource }))}>
                  {sources.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                </select>
              </label>
              <label>Assigned user
                <select value={quickAddDraft.assignedUserId} onChange={(event) => setQuickAddDraft((current) => ({ ...current, assignedUserId: event.target.value }))}>
                  <option value="">Unassigned</option>
                  {assignableUsers.map((user) => <option key={user.id} value={user.id}>{user.fullName} / {user.role}</option>)}
                </select>
              </label>
            </div>
            <label className="pool-textarea-wide">Short description
              <textarea data-testid="lease-quick-capture-description" ref={descriptionInputRef} value={quickAddDraft.description} onChange={(event) => setQuickAddDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Optional if you already snapped a photo. Example: trash still on patio, grill on balcony, broken blinds visible from exterior..." />
            </label>
            <label className="pool-textarea-wide">Location notes
              <textarea value={quickAddDraft.locationNotes} onChange={(event) => setQuickAddDraft((current) => ({ ...current, locationNotes: event.target.value }))} placeholder="Facing courtyard, second floor, left side of breezeway..." />
            </label>
            <div className="pool-entry-actions">
              <button data-testid="lease-quick-capture-submit" className="button button-primary" type="submit" disabled={createIssueMutation.isPending || uploadMutation.isPending || !canSubmitQuickIssue}>Create Issue</button>
              {tab === "grounds" ? (
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={createIssueMutation.isPending || uploadMutation.isPending || !canSubmitQuickIssue}
                  onClick={() => void createQuickIssue("keep-walking")}
                >
                  Create & Keep Walking
                </button>
              ) : null}
            </div>
          </form>
        </section>
      ) : null}

      {tab === "dashboard" ? (
        overviewQuery.isLoading ? <StatusState title="Loading Lease Compliance" description="Gathering issue counts, notice queues, and recurring concerns." /> : overviewQuery.isError || !overviewQuery.data ? <StatusState title="Lease Compliance failed to load" description="Refresh the workspace and try again." tone="error" /> : (
          <div className="dashboard-grid">
            <section className="panel-card">
              <h2>Overview</h2>
              <div className="dashboard-kpis pest-dashboard-kpis">
                <div><strong>{overviewQuery.data.summary.openIssues}</strong><span>Open Issues</span></div>
                <div><strong>{overviewQuery.data.summary.needsNotice}</strong><span>Needs Notice</span></div>
                <div><strong>{overviewQuery.data.summary.violationNeeded}</strong><span>Violation Needed</span></div>
                <div><strong>{overviewQuery.data.summary.recurringConcerns}</strong><span>Recurring</span></div>
                <div><strong>{overviewQuery.data.summary.managerReviewRequired}</strong><span>Manager Review</span></div>
                <div><strong>{overviewQuery.data.summary.overdueOpen}</strong><span>Aging Watch</span></div>
              </div>
            </section>
            <section className="panel-card">
              <h2>Needs Notice</h2>
              {overviewQuery.data.needsNotice.length ? overviewQuery.data.needsNotice.map((issue) => <p key={issue.id}>{issue.unit?.number ?? issue.area ?? issue.building ?? "Area"} / {issue.issueTypeName} / {issue.noticeStage}</p>) : <p className="muted">Nothing waiting on notice action.</p>}
            </section>
            <section className="panel-card">
              <h2>Violation Needed</h2>
              {overviewQuery.data.violationNeeded.length ? overviewQuery.data.violationNeeded.map((issue) => <p key={issue.id}>{issue.unit?.number ?? issue.area ?? issue.building ?? "Area"} / {issue.issueTypeName}</p>) : <p className="muted">No violation-needed issues right now.</p>}
            </section>
            <section className="panel-card">
              <h2>Recent Issues</h2>
              {overviewQuery.data.recentIssues.length ? overviewQuery.data.recentIssues.map((issue) => <p key={issue.id}>{issue.unit?.number ?? issue.area ?? issue.building ?? "Area"} / {issue.issueTypeName} / {issue.status}</p>) : <p className="muted">No recent issues logged.</p>}
            </section>
          </div>
        )
      ) : null}

      {["active", "grounds", "needs-notice", "violation", "resolved", "archive"].includes(tab) ? (
        <>
          <section className="panel-card" style={{ marginBottom: 16 }}>
            <div className="pool-grid">
              <label>Search
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Unit, building, area, issue type, tags..." />
              </label>
              <label>Status
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as LeaseComplianceStatus | "")}>
                  <option value="">All statuses</option>
                  {statuses.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                </select>
              </label>
              <label>Notice stage
                <select value={noticeStageFilter} onChange={(event) => setNoticeStageFilter(event.target.value as LeaseComplianceNoticeStage | "")}>
                  <option value="">All notice stages</option>
                  {noticeStages.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                </select>
              </label>
            </div>
          </section>
          {issuesQuery.isLoading ? <StatusState title="Loading lease-compliance issues" description="Pulling the current property issue list." /> : issuesQuery.isError || !issuesQuery.data ? <StatusState title="Lease-compliance issues failed to load" description="Refresh and try again." tone="error" /> : (
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
              }).length === 0 ? <p className="muted">No lease-compliance issues match the current filters.</p> : null}
            </div>
          )}
        </>
      ) : null}

      {tab === "reports" ? (
        <section className="panel-card">
          <div className="drawer-section-title">
            <h2>Reports</h2>
          </div>
          <p className="muted">Export the current property issue list for review, notice follow-up, or resident-file support.</p>
          <div className="pool-entry-actions">
            <a className="button button-secondary" href={leaseComplianceExportCsvUrl({ propertyId })} target="_blank" rel="noreferrer">Export CSV</a>
            <a className="button button-secondary" href={leaseCompliancePrintableHtmlReportUrl({ propertyId })} target="_blank" rel="noreferrer">Printable HTML</a>
            <a className="button button-primary" href={leaseCompliancePrintableReportUrl({ propertyId })} target="_blank" rel="noreferrer">Open PDF</a>
          </div>
        </section>
      ) : null}

      {tab === "settings" ? (
        <div className="dashboard-grid">
          <section className="panel-card">
            <div className="drawer-section-title">
              <h2>Issue Types</h2>
            </div>
            {!issueTypes.length ? <p className="muted">Loading issue types...</p> : (
              <div className="activity-feed">
                {issueTypes.map((entry) => (
                  <div key={entry.id} className="activity-entry">
                    <strong>{entry.name}</strong>
                    <span>{entry.color ?? "#58a6de"}</span>
                    {permissions.admin ? (
                      <div className="pool-entry-actions">
                        <button className="button button-secondary" type="button" onClick={() => updateIssueTypeMutation.mutate({ id: entry.id, input: { isActive: !entry.isActive } })}>{entry.isActive ? "Archive" : "Restore"}</button>
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
                  <label>Name
                    <input name="name" placeholder="Broken fence panel" />
                  </label>
                  <label>Color
                    <input name="color" placeholder="#58a6de" />
                  </label>
                </div>
                <div className="pool-entry-actions">
                  <button className="button button-primary" type="submit">Add Issue Type</button>
                </div>
              </form>
            ) : null}
          </section>

          <section className="panel-card">
            <div className="drawer-section-title">
              <h2>Operational Settings</h2>
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
                  <label>Default priority
                    <select name="defaultPriority" defaultValue={settings.defaultPriority}>
                      {priorities.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                    </select>
                  </label>
                  <label>Watch days
                    <input name="watchDays" type="number" min={0} defaultValue={settings.watchDays} />
                  </label>
                  <label>Warning days
                    <input name="warningDays" type="number" min={0} defaultValue={settings.warningDays} />
                  </label>
                  <label>Critical days
                    <input name="criticalDays" type="number" min={0} defaultValue={settings.criticalDays} />
                  </label>
                  <label>1st notice label
                    <input name="firstNoticeLabel" defaultValue={settings.firstNoticeLabel} />
                  </label>
                  <label>2nd notice label
                    <input name="secondNoticeLabel" defaultValue={settings.secondNoticeLabel} />
                  </label>
                  <label>3rd notice label
                    <input name="thirdNoticeLabel" defaultValue={settings.thirdNoticeLabel} />
                  </label>
                  <label>Archive resolved after days
                    <input name="archiveResolvedAfterDays" type="number" min={0} defaultValue={settings.archiveResolvedAfterDays ?? ""} />
                  </label>
                </div>
                {permissions.admin ? (
                  <div className="pool-entry-actions">
                    <button className="button button-primary" type="submit">Save Settings</button>
                  </div>
                ) : null}
              </form>
            ) : <p className="muted">Loading property settings...</p>}
          </section>
        </div>
      ) : null}
    </section>
  );
}
