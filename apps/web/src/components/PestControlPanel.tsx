import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addPestIssueNote,
  archivePestIssue,
  closePestIssue,
  createPestIssue,
  createPestVendor,
  deletePestIssueAttachment,
  dismissPestRecurringFlag,
  getPestIssues,
  getPestOverview,
  getPestVendors,
  pestExportCsvUrl,
  pestExportXlsUrl,
  pestIssueAttachmentDownloadUrl,
  pestPrintableHtmlReportUrl,
  pestPrintableReportUrl,
  updatePestIssue,
  updatePestVendor,
  uploadPestIssueAttachment,
  isApiError,
  type PestIssue,
  type PestPriority,
  type PestSource,
  type PestStatus,
  type PestType,
  type Property,
  type Unit,
  type UserLanguage,
  type UserRole,
} from "../lib/api";
import { enqueuePestCreate, enqueuePestUpload } from "../lib/offlineSync";
import { t } from "../lib/i18n";
import type { OpenPestQuickAddRequest, OpenPestWorkspaceRequest } from "../lib/pestNavigation";
import { isTouchMobileViewport } from "../lib/responsive";
import { SearchSelect, type SearchSelectOption } from "./SearchSelect";
import { StatusState } from "./StatusState";
import { UnitSearchSelect } from "./UnitSearchSelect";

type Tab = "dashboard" | "active" | "make-ready" | "vendors" | "archive" | "reports";

type Props = {
  properties: Property[];
  units: Unit[];
  users: Array<{ id: string; fullName: string; role: UserRole }>;
  userRole: UserRole;
  language: UserLanguage;
  selectedPropertyId?: string;
  openQuickAddRequest?: (OpenPestQuickAddRequest & { nonce: number }) | null;
  workspaceRequest?: (OpenPestWorkspaceRequest & { nonce: number }) | null;
};

const pestTypes: PestType[] = ["Pest Not Stated", "Roaches", "Ants", "Spiders", "Rats", "Mice", "Rodents", "Fleas", "Bed Bugs", "Wasps", "Bees", "Gnats", "Flies", "Termites", "Other"];
const pestStatuses: PestStatus[] = ["Open", "Scheduled", "Treated", "Needs Follow Up", "Closed", "Cancelled", "Archived"];
const pestPriorities: PestPriority[] = ["Low", "Normal", "High", "Critical"];
const pestSources: PestSource[] = ["Third Party Work Order", "Leasing", "Resident Request", "Maintenance", "Manager", "Inspection", "Preventive Maintenance", "Make Ready", "Property Walk", "Other"];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString() : "-";
}

function normalizePestMatchValue(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function PestMediaStrip({
  files,
  getUrl,
  emptyLabel,
}: {
  files: Array<{ id: string; originalName: string; mimeType: string; caption?: string | null; photoType?: string | null }>;
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
            <span>{file.caption || file.photoType?.split("_").join(" ") || file.originalName}</span>
          </a>
        );
      })}
    </div>
  );
}

function PestIssueCard({
  issue,
  canEdit,
  vendors,
  assignableUsers,
  language,
  onSave,
  onNote,
  onClose,
  onArchive,
  onDismissRecurring,
  onUpload,
  onDeleteAttachment,
  compact = false,
}: {
  issue: PestIssue;
  canEdit: boolean;
  vendors: Array<{ id: string; vendorName: string }>;
  assignableUsers: Array<{ id: string; fullName: string; role: UserRole }>;
  language: UserLanguage;
  onSave: (id: string, input: Partial<Parameters<typeof createPestIssue>[0]>) => void;
  onNote: (id: string, body: string) => void;
  onClose: (id: string, closingNotes: string, followUpDate?: string) => void;
  onArchive: (id: string, notes?: string) => void;
  onDismissRecurring: (id: string, notes: string) => void;
  onUpload: (issueId: string, files: FileList | null) => void;
  onDeleteAttachment: (attachmentId: string) => void;
  compact?: boolean;
}) {
  const [note, setNote] = useState("");
  const [closingNotes, setClosingNotes] = useState("");
  const [followUpDate, setFollowUpDate] = useState(issue.followUpDate ? issue.followUpDate.slice(0, 10) : "");
  const [expanded, setExpanded] = useState(!compact);
  const label = issue.unit?.number || issue.makeReadyItem?.unitNumber || issue.area || t(language, "pest.areaNotSet");
  const overdueFollowUp = issue.status === "Needs Follow Up" && issue.followUpDate && new Date(issue.followUpDate) < new Date(`${today()}T00:00:00`);
  const vendorOptions = useMemo<SearchSelectOption[]>(() => vendors.map((vendor) => ({
    value: vendor.id,
    label: vendor.vendorName,
    keywords: [vendor.vendorName],
  })), [vendors]);
  const assignableUserOptions = useMemo<SearchSelectOption[]>(() => assignableUsers.map((user) => ({
    value: user.id,
    label: `${user.fullName} / ${user.role}`,
    keywords: [user.fullName, user.role],
  })), [assignableUsers]);
  useEffect(() => {
    setExpanded(!compact);
  }, [compact]);
  return (
    <article className={`pool-card ${overdueFollowUp ? "pm-task-card" : ""}`} data-testid={`pest-issue-${issue.id}`}>
      <button type="button" className="compact-issue-summary" onClick={() => compact ? setExpanded((current) => !current) : undefined}>
        <div className="compact-issue-summary-main">
          <strong>{label} / {issue.pestType}{issue.additionalPestType ? ` + ${issue.additionalPestType}` : ""}</strong>
          <span className="pool-reading-stack compact-issue-meta">
            <span>{issue.property.code}</span>
            <span>{issue.priority}</span>
            <span>{t(language, "pest.requested")} {formatDate(issue.requestDate)}</span>
            {issue.followUpDate ? <span>{t(language, "pest.followUp")} {formatDate(issue.followUpDate)}</span> : null}
          </span>
        </div>
        <div className="compact-issue-summary-side">
          {issue.attachments[0]?.mimeType.startsWith("image/") ? (
            <img className="compact-issue-thumb" src={pestIssueAttachmentDownloadUrl(issue.attachments[0].id)} alt={issue.attachments[0].originalName} loading="lazy" />
          ) : null}
          <span className={`status-pill ${overdueFollowUp ? "risk-critical" : issue.status === "Needs Follow Up" ? "risk-high" : ""}`}>{issue.status}</span>
        </div>
      </button>
      {expanded ? (
        <>
      {issue.description ? <p>{issue.description}</p> : null}
      {(issue.recurringConcern || issue.managerReviewRequired) ? (
        <div className="risk-banner" style={{ marginBottom: 12 }}>
          <strong>{issue.managerReviewRequired ? t(language, "pest.managerReviewRequired") : t(language, "pest.recurringConcern")}</strong>
          <span>{issue.unit?.number ?? issue.area ?? t(language, "pest.thisLocation")} {t(language, "pest.recurringActivityCopy")}</span>
          {canEdit ? <button className="button button-secondary" type="button" onClick={() => onDismissRecurring(issue.id, "Reviewed from Pest Control workspace.")}>{t(language, "pest.dismissFlag")}</button> : null}
        </div>
      ) : null}
      {canEdit ? (
        <div className="pool-grid" style={{ marginBottom: 12 }}>
          <label>{t(language, "admin.status")}
            <select value={issue.status} onChange={(event) => onSave(issue.id, { status: event.target.value as PestStatus })}>
              {pestStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          <label>{t(language, "pest.priority")}
            <select value={issue.priority} onChange={(event) => onSave(issue.id, { priority: event.target.value as PestPriority })}>
              {pestPriorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
            </select>
          </label>
          <label>{t(language, "pest.vendor")}
            <SearchSelect
              options={vendorOptions}
              value={issue.vendorId ?? ""}
              onChange={(vendorId) => onSave(issue.id, { vendorId: vendorId || null })}
              placeholder={t(language, "pest.searchVendor")}
              emptyLabel={t(language, "pest.unassigned")}
              noMatchesLabel={t(language, "pest.noMatchingVendors")}
              clearLabel={t(language, "pest.clearVendor")}
            />
          </label>
          <label>{t(language, "pest.assignedUser")}
            <SearchSelect
              options={assignableUserOptions}
              value={issue.assignedUserId ?? ""}
              onChange={(assignedUserId) => onSave(issue.id, { assignedUserId: assignedUserId || null })}
              placeholder={t(language, "pest.searchUser")}
              emptyLabel={t(language, "pest.unassigned")}
              noMatchesLabel={t(language, "pest.noMatchingUsers")}
              clearLabel={t(language, "pest.clearAssignedUser")}
            />
          </label>
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
      ) : <p className="muted">{t(language, "pest.noNotesYet")}</p>}
      <PestMediaStrip
        files={issue.attachments}
        getUrl={pestIssueAttachmentDownloadUrl}
        emptyLabel={t(language, "pest.noPriorPhoto")}
      />
      {issue.attachments.length ? (
        <div className="pool-attachment-list" style={{ marginBottom: 12 }}>
          {issue.attachments.map((attachment) => (
            <span key={attachment.id} style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <a href={pestIssueAttachmentDownloadUrl(attachment.id)} target="_blank" rel="noreferrer">{attachment.originalName}</a>
              {attachment.caption ? <em className="muted">{attachment.caption}</em> : null}
              {canEdit ? <button className="link-button" type="button" onClick={() => onDeleteAttachment(attachment.id)}>{t(language, "common.remove")}</button> : null}
            </span>
          ))}
        </div>
      ) : null}
      {canEdit ? (
        <>
          <div className="pool-entry-actions" style={{ marginBottom: 12 }}>
            <label className="button button-secondary pool-upload-button">
              {t(language, "pest.uploadPhotoPdf")}
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
          <label>{t(language, "pest.quickNote")}
            <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={t(language, "pest.quickNotePlaceholder")} />
          </label>
          <div className="pool-entry-actions" style={{ marginBottom: 12 }}>
            <button className="button button-secondary" type="button" onClick={() => { if (note.trim()) { onNote(issue.id, note.trim()); setNote(""); } }}>{t(language, "pest.addNote")}</button>
          </div>
          <label>{t(language, "pest.closingNotes")}
            <textarea value={closingNotes} onChange={(event) => setClosingNotes(event.target.value)} placeholder={t(language, "pest.closingNotesPlaceholder")} />
          </label>
          <div className="pool-grid" style={{ marginTop: 12 }}>
            <label>{t(language, "pest.followUpDate")}
              <input type="date" value={followUpDate} onChange={(event) => setFollowUpDate(event.target.value)} />
            </label>
            <div className="pool-entry-actions" style={{ alignItems: "flex-end" }}>
              <button className="button button-primary" type="button" onClick={() => { if (closingNotes.trim()) { onClose(issue.id, closingNotes.trim(), followUpDate || undefined); setClosingNotes(""); } }}>{t(language, "pest.quickClose")}</button>
              <button className="button button-secondary" type="button" onClick={() => onArchive(issue.id, "Archived from Pest Control workspace.")}>{t(language, "common.archive")}</button>
            </div>
          </div>
        </>
      ) : null}
        </>
      ) : null}
    </article>
  );
}

export function PestControlPanel({ properties, units, users, userRole, language, selectedPropertyId, openQuickAddRequest, workspaceRequest }: Props) {
  const queryClient = useQueryClient();
  const [isMobileLayout, setIsMobileLayout] = useState(() => isTouchMobileViewport());
  const [tab, setTab] = useState<Tab>("dashboard");
  const [propertyId, setPropertyId] = useState(selectedPropertyId || properties[0]?.id || "");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PestStatus | "">("");
  const [linkedMakeReadyItemId, setLinkedMakeReadyItemId] = useState("");
  const [quickAddUnitId, setQuickAddUnitId] = useState("");
  const [quickAddPhotos, setQuickAddPhotos] = useState<File[]>([]);
  const captureInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [quickAddDraft, setQuickAddDraft] = useState({
    area: "",
    pestType: "Pest Not Stated" as PestType,
    additionalPestType: "",
    vendorId: "",
    thirdPartyWorkOrderNumber: "",
    source: "Leasing" as PestSource,
    priority: "Normal" as PestPriority,
    description: "",
  });
  const canEdit = ["ADMIN", "MANAGER", "TECH", "LEASING"].includes(userRole);
  const canView = ["ADMIN", "MANAGER", "TECH", "LEASING", "CLEANER", "VIEWER"].includes(userRole);

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

  const resetQuickAddForm = () => {
    setQuickAddUnitId("");
    setQuickAddPhotos([]);
    setQuickAddDraft({
      area: "",
      pestType: "Pest Not Stated",
      additionalPestType: "",
      vendorId: "",
      thirdPartyWorkOrderNumber: "",
      source: "Leasing",
      priority: "Normal",
      description: "",
    });
  };

  const overviewQuery = useQuery({
    queryKey: ["pest", "overview", propertyId],
    queryFn: () => getPestOverview(propertyId || undefined),
    enabled: Boolean(propertyId),
  });
  const activeQuery = useQuery({
    queryKey: ["pest", "active", propertyId, statusFilter, search, linkedMakeReadyItemId],
    queryFn: () => getPestIssues({
      propertyId: propertyId || undefined,
      makeReadyItemId: linkedMakeReadyItemId || undefined,
      status: statusFilter || undefined,
      q: search || undefined,
      limit: 200,
    }),
    enabled: Boolean(propertyId),
  });
  const makeReadyQuery = useQuery({
    queryKey: ["pest", "make-ready", propertyId, linkedMakeReadyItemId],
    queryFn: () => getPestIssues({
      propertyId: propertyId || undefined,
      makeReadyOnly: true,
      makeReadyItemId: linkedMakeReadyItemId || undefined,
      includeArchived: false,
      limit: 200,
    }),
    enabled: Boolean(propertyId),
  });
  const archiveQuery = useQuery({
    queryKey: ["pest", "archive", propertyId, search, linkedMakeReadyItemId],
    queryFn: () => getPestIssues({
      propertyId: propertyId || undefined,
      makeReadyItemId: linkedMakeReadyItemId || undefined,
      includeArchived: true,
      q: search || undefined,
      limit: 200,
    }),
    enabled: Boolean(propertyId),
  });
  const vendorsQuery = useQuery({
    queryKey: ["pest", "vendors", propertyId],
    queryFn: () => getPestVendors(propertyId || undefined),
    enabled: Boolean(propertyId),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["pest"] });
    await queryClient.invalidateQueries({ queryKey: ["my-work"] });
  };

  const createIssueMutation = useMutation({ mutationFn: createPestIssue, onSuccess: invalidate });
  const updateIssueMutation = useMutation({ mutationFn: ({ id, input }: { id: string; input: Partial<Parameters<typeof createPestIssue>[0]> }) => updatePestIssue(id, input), onSuccess: invalidate });
  const addNoteMutation = useMutation({ mutationFn: ({ id, body }: { id: string; body: string }) => addPestIssueNote(id, body), onSuccess: invalidate });
  const closeIssueMutation = useMutation({ mutationFn: ({ id, closingNotes, followUpDate }: { id: string; closingNotes: string; followUpDate?: string }) => closePestIssue(id, { closingNotes, followUpDate }), onSuccess: invalidate });
  const archiveIssueMutation = useMutation({ mutationFn: ({ id, notes }: { id: string; notes?: string }) => archivePestIssue(id, notes), onSuccess: invalidate });
  const dismissRecurringMutation = useMutation({ mutationFn: ({ id, notes }: { id: string; notes: string }) => dismissPestRecurringFlag(id, notes), onSuccess: invalidate });
  const vendorCreateMutation = useMutation({ mutationFn: createPestVendor, onSuccess: invalidate });
  const vendorUpdateMutation = useMutation({ mutationFn: ({ id, input }: { id: string; input: Partial<Parameters<typeof createPestVendor>[0]> }) => updatePestVendor(id, input), onSuccess: invalidate });
  const uploadMutation = useMutation({
    mutationFn: async ({ issueId, file }: { issueId: string; file: File }) => {
      try {
        return await uploadPestIssueAttachment(issueId, file);
      } catch (error) {
        if (isApiError(error) && error.status === 0) {
          await enqueuePestUpload(issueId, propertyId || undefined, [{ file }]);
          return { attachment: null };
        }
        throw error;
      }
    },
    onSuccess: invalidate,
  });
  const deleteAttachmentMutation = useMutation({ mutationFn: deletePestIssueAttachment, onSuccess: invalidate });

  const assignableUsers = useMemo(() => users.filter((user) => user.role !== "CLEANER"), [users]);
  const propertyUnits = useMemo(() => units.filter((unit) => unit.propertyId === propertyId), [propertyId, units]);
  const vendors = vendorsQuery.data?.vendors ?? overviewQuery.data?.vendors ?? [];
  const vendorOptions = useMemo<SearchSelectOption[]>(() => vendors.map((vendor) => ({
    value: vendor.id,
    label: vendor.vendorName,
    keywords: [vendor.vendorName, vendor.primaryContact ?? "", vendor.phone ?? "", vendor.email ?? ""].filter(Boolean),
  })), [vendors]);
  const defaultVendorId = overviewQuery.data?.defaultVendor?.id ?? "";
  const archivedOnly = (archiveQuery.data?.issues ?? []).filter((issue) => issue.isArchived || issue.status === "Archived");
  const selectedQuickAddUnit = useMemo(
    () => propertyUnits.find((unit) => unit.id === quickAddUnitId) ?? null,
    [propertyUnits, quickAddUnitId]
  );
  const matchingQuickAddIssues = useMemo(() => {
    const normalizedArea = normalizePestMatchValue(quickAddDraft.area);
    const normalizedPestType = normalizePestMatchValue(quickAddDraft.pestType);
    return (activeQuery.data?.issues ?? [])
      .filter((issue) => {
        if (issue.isArchived) return false;
        if (quickAddUnitId && issue.unitId === quickAddUnitId) return true;
        if (!quickAddUnitId && normalizedArea && normalizePestMatchValue(issue.area) === normalizedArea) return true;
        return false;
      })
      .sort((left, right) => {
        const leftTypeMatch = normalizedPestType && normalizePestMatchValue(left.pestType) === normalizedPestType ? 1 : 0;
        const rightTypeMatch = normalizedPestType && normalizePestMatchValue(right.pestType) === normalizedPestType ? 1 : 0;
        if (leftTypeMatch !== rightTypeMatch) return rightTypeMatch - leftTypeMatch;
        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      });
  }, [activeQuery.data?.issues, quickAddDraft.area, quickAddDraft.pestType, quickAddUnitId]);
  const latestMatchingQuickAddIssue = matchingQuickAddIssues[0] ?? null;

  useEffect(() => {
    if (!selectedPropertyId) return;
    setPropertyId(selectedPropertyId);
  }, [selectedPropertyId]);

  useEffect(() => {
    if (!openQuickAddRequest?.propertyId) return;
    setPropertyId(openQuickAddRequest.propertyId);
    setTab("dashboard");
    setQuickAddUnitId(openQuickAddRequest.unitId ?? "");
    setQuickAddPhotos([]);
    setQuickAddDraft({
      area: openQuickAddRequest.area ?? "",
      pestType: (openQuickAddRequest.pestType as PestType | undefined) ?? "Pest Not Stated",
      additionalPestType: openQuickAddRequest.additionalPestType ?? "",
      vendorId: "",
      thirdPartyWorkOrderNumber: "",
      source: (openQuickAddRequest.source as PestSource | undefined) ?? "Property Walk",
      priority: (openQuickAddRequest.priority as PestPriority | undefined) ?? "Normal",
      description: openQuickAddRequest.description ?? "",
    });
    setLinkedMakeReadyItemId(openQuickAddRequest.makeReadyItemId ?? "");
  }, [openQuickAddRequest]);

  useEffect(() => {
    if (!workspaceRequest?.propertyId) return;
    setPropertyId(workspaceRequest.propertyId);
    setTab(workspaceRequest.tab ?? "active");
    setLinkedMakeReadyItemId(workspaceRequest.makeReadyItemId ?? "");
    setSearch(workspaceRequest.search ?? "");
    if (workspaceRequest.tab !== "active") setStatusFilter("");
  }, [workspaceRequest]);

  async function submitQuickAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const linkedMakeReadyId = (openQuickAddRequest?.makeReadyItemId ?? linkedMakeReadyItemId) || null;
    const quickIssueInput = {
      propertyId,
      unitId: quickAddUnitId || null,
      makeReadyItemId: linkedMakeReadyId,
      area: quickAddDraft.area.trim() || null,
      pestType: quickAddDraft.pestType,
      additionalPestType: quickAddDraft.additionalPestType.trim() || null,
      description: quickAddDraft.description.trim() || null,
      vendorId: quickAddDraft.vendorId || defaultVendorId || null,
      thirdPartyWorkOrderNumber: quickAddDraft.thirdPartyWorkOrderNumber.trim() || null,
      source: quickAddDraft.source,
      priority: quickAddDraft.priority,
      requestDate: today(),
    };
    try {
      const created = await createIssueMutation.mutateAsync(quickIssueInput);
      for (const file of quickAddPhotos) {
        await uploadMutation.mutateAsync({ issueId: created.issue.id, file });
      }
    } catch (error) {
      if (!(isApiError(error) && error.status === 0)) {
        throw error;
      }
      await enqueuePestCreate(quickIssueInput, quickAddPhotos.map((file) => ({ file })));
    }
    event.currentTarget.reset();
    resetQuickAddForm();
    if (captureInputRef.current) captureInputRef.current.value = "";
    if (uploadInputRef.current) uploadInputRef.current.value = "";
  }

  async function addToExistingIssue(issue: PestIssue) {
    const note = quickAddDraft.description.trim() || `Confirmed additional ${quickAddDraft.pestType.toLowerCase()} activity from quick add.`;
    await addNoteMutation.mutateAsync({ id: issue.id, body: note });
    for (const file of quickAddPhotos) {
      await uploadMutation.mutateAsync({ issueId: issue.id, file });
    }
    if (issue.status === "Closed" || issue.status === "Cancelled") {
      await updateIssueMutation.mutateAsync({ id: issue.id, input: { status: "Open" } });
    }
    resetQuickAddForm();
    if (captureInputRef.current) captureInputRef.current.value = "";
    if (uploadInputRef.current) uploadInputRef.current.value = "";
  }

  async function submitVendor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await vendorCreateMutation.mutateAsync({
      propertyId,
      vendorName: String(form.get("vendorName") ?? "").trim(),
      primaryContact: String(form.get("primaryContact") ?? "").trim() || null,
      phone: String(form.get("phone") ?? "").trim() || null,
      email: String(form.get("email") ?? "").trim() || null,
      emergencyPhone: String(form.get("emergencyPhone") ?? "").trim() || null,
      serviceDay: String(form.get("serviceDay") ?? "").trim() || null,
      serviceFrequency: String(form.get("serviceFrequency") ?? "").trim() || null,
      notes: String(form.get("notes") ?? "").trim() || null,
      isDefault: form.get("isDefault") === "on",
    });
    event.currentTarget.reset();
  }

  if (!canView) {
    return <StatusState title={t(language, "pest.unavailableTitle")} description={t(language, "pest.unavailableCopy")} tone="error" />;
  }
  if (!properties.length) {
    return <StatusState title={t(language, "pest.noPropertiesTitle")} description={t(language, "pest.noPropertiesCopy")} />;
  }

  return (
    <section className="pool-panel module-panel pest-control-panel" data-testid="pest-control-panel">
      <div className="module-heading">
        <div>
          <span className="eyebrow">{t(language, "pest.title")}</span>
          <h1>{t(language, "pest.title")}</h1>
          <p>{t(language, "pest.copy")}</p>
        </div>
        <div className="module-actions">
          <select value={propertyId} onChange={(event) => { setPropertyId(event.target.value); setLinkedMakeReadyItemId(""); resetQuickAddForm(); }} aria-label={t(language, "pest.propertyAria")}>
            {properties.map((property) => <option key={property.id} value={property.id}>{property.code} - {property.name}</option>)}
          </select>
        </div>
      </div>

      <div className="module-tabs" aria-label={t(language, "pest.sectionsAria")}>
        {([
          ["dashboard", t(language, "nav.dashboard")],
          ["active", t(language, "pest.active")],
          ["make-ready", "Make Ready"],
          ["vendors", t(language, "nav.vendors")],
          ["archive", t(language, "common.archive")],
          ["reports", t(language, "pest.reports")],
        ] as Array<[Tab, string]>).map(([key, label]) => (
          <button key={key} type="button" className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {linkedMakeReadyItemId ? (
        <section className="panel-card" style={{ marginBottom: 16 }}>
          <div className="drawer-section-title">
            <h2>{t(language, "pest.scopedLinkTitle")}</h2>
            <button type="button" className="button button-ghost" onClick={() => setLinkedMakeReadyItemId("")}>{t(language, "pest.clearScope")}</button>
          </div>
          <p className="muted">{t(language, "pest.scopedLinkCopy")}</p>
        </section>
      ) : null}

      {canEdit ? (
        <section className="panel-card" style={{ marginBottom: 16 }}>
          <div className="drawer-section-title">
            <h2>{t(language, "pest.quickAddTitle")}</h2>
          </div>
          <form data-testid="pest-quick-add-form" className="pool-form" onSubmit={(event) => void submitQuickAdd(event)}>
            <div className="pool-entry-actions" style={{ marginBottom: 12, flexWrap: "wrap" }}>
              <button className="button button-secondary" type="button" onClick={() => captureInputRef.current?.click()}>{t(language, "pest.snapPicture")}</button>
              <button className="button button-secondary" type="button" onClick={() => uploadInputRef.current?.click()}>{t(language, "pest.uploadPhotoPdf")}</button>
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
                  <span className="muted">{t(language, "pest.filesSelected").replace("{count}", String(quickAddPhotos.length))}</span>
                  <button className="button button-ghost" type="button" onClick={() => setQuickAddPhotos([])}>{t(language, "pest.clearFiles")}</button>
                </>
              ) : <span className="muted">{t(language, "pest.snapOrDescribe")}</span>}
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
            {latestMatchingQuickAddIssue ? (
              <section className="lease-repeat-card" data-testid="pest-repeat-card">
                <div className="lease-repeat-card-media">
                  {latestMatchingQuickAddIssue.attachments[0] ? (
                    <a href={pestIssueAttachmentDownloadUrl(latestMatchingQuickAddIssue.attachments[0].id)} target="_blank" rel="noreferrer">
                      {latestMatchingQuickAddIssue.attachments[0].mimeType.startsWith("image/") ? (
                        <img
                          src={pestIssueAttachmentDownloadUrl(latestMatchingQuickAddIssue.attachments[0].id)}
                          alt={`${latestMatchingQuickAddIssue.pestType} evidence`}
                        />
                      ) : (
                        <div className="lease-repeat-card-placeholder">PDF</div>
                      )}
                    </a>
                  ) : (
                    <div className="lease-repeat-card-placeholder">{t(language, "pest.noPriorPhoto")}</div>
                  )}
                </div>
                <div className="lease-repeat-card-body">
                  <span className="eyebrow">{t(language, "pest.existingIssueFound")}</span>
                  <h3>{selectedQuickAddUnit?.number ?? latestMatchingQuickAddIssue.area ?? t(language, "pest.areaLabel")} / {latestMatchingQuickAddIssue.pestType}</h3>
                  <p>
                    {t(language, "pest.lastReported")} {formatDate(latestMatchingQuickAddIssue.createdAt)}
                    {latestMatchingQuickAddIssue.description ? ` / ${latestMatchingQuickAddIssue.description}` : ""}
                  </p>
                  <div className="pool-reading-stack">
                    <span>{latestMatchingQuickAddIssue.status}</span>
                    {latestMatchingQuickAddIssue.followUpDate ? <span>{t(language, "pest.followUp")} {formatDate(latestMatchingQuickAddIssue.followUpDate)}</span> : null}
                    {latestMatchingQuickAddIssue.vendor?.vendorName ? <span>{latestMatchingQuickAddIssue.vendor.vendorName}</span> : null}
                    {matchingQuickAddIssues.length > 1 ? <span>{t(language, "pest.relatedIssues").replace("{count}", String(matchingQuickAddIssues.length))}</span> : null}
                  </div>
                  <div className="pool-entry-actions lease-repeat-card-actions">
                    <button
                      className="button button-primary"
                      type="button"
                      disabled={addNoteMutation.isPending || updateIssueMutation.isPending}
                      onClick={() => void addToExistingIssue(latestMatchingQuickAddIssue)}
                    >
                      {t(language, "pest.addToExisting")}
                    </button>
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => setQuickAddDraft((current) => ({
                        ...current,
                        area: latestMatchingQuickAddIssue.area ?? current.area,
                        pestType: latestMatchingQuickAddIssue.pestType,
                        additionalPestType: latestMatchingQuickAddIssue.additionalPestType ?? "",
                        vendorId: latestMatchingQuickAddIssue.vendorId ?? current.vendorId,
                        source: latestMatchingQuickAddIssue.source,
                        priority: latestMatchingQuickAddIssue.priority,
                      }))}
                    >
                      {t(language, "pest.createNewRequest")}
                    </button>
                  </div>
                </div>
              </section>
            ) : null}
            <div className="form-grid pest-quick-grid">
              <label>{t(language, "pest.unit")}
                <UnitSearchSelect
                  name="unitId"
                  units={propertyUnits}
                  value={quickAddUnitId}
                  onChange={setQuickAddUnitId}
                  emptyLabel={t(language, "pest.areaOnly")}
                  placeholder={t(language, "pest.searchUnit")}
                />
              </label>
              <label>{t(language, "pest.area")}
                <input data-testid="pest-quick-add-area" name="area" value={quickAddDraft.area} onChange={(event) => setQuickAddDraft((current) => ({ ...current, area: event.target.value }))} placeholder={t(language, "pest.areaPlaceholder")} />
              </label>
              <label>{t(language, "pest.pestType")}
                <select name="pestType" value={quickAddDraft.pestType} onChange={(event) => setQuickAddDraft((current) => ({ ...current, pestType: event.target.value as PestType }))}>
                  {pestTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
              <label>{t(language, "pest.additionalPestType")}
                <input name="additionalPestType" value={quickAddDraft.additionalPestType} onChange={(event) => setQuickAddDraft((current) => ({ ...current, additionalPestType: event.target.value }))} placeholder={t(language, "pest.additionalPestPlaceholder")} />
              </label>
              <label>{t(language, "pest.vendor")}
                <SearchSelect
                  options={vendorOptions}
                  value={quickAddDraft.vendorId}
                  onChange={(vendorId) => setQuickAddDraft((current) => ({ ...current, vendorId }))}
                  placeholder={t(language, "pest.searchVendor")}
                  emptyLabel={t(language, "pest.noVendor")}
                  noMatchesLabel={t(language, "pest.noMatchingVendors")}
                  clearLabel={t(language, "pest.clearVendor")}
                />
              </label>
              <label>{t(language, "pest.thirdPartyWo")}
                <input name="thirdPartyWorkOrderNumber" value={quickAddDraft.thirdPartyWorkOrderNumber} onChange={(event) => setQuickAddDraft((current) => ({ ...current, thirdPartyWorkOrderNumber: event.target.value }))} placeholder={t(language, "pest.thirdPartyWoPlaceholder")} />
              </label>
              <label>{t(language, "pest.source")}
                <select name="source" value={quickAddDraft.source} onChange={(event) => setQuickAddDraft((current) => ({ ...current, source: event.target.value as PestSource }))}>
                  {pestSources.map((source) => <option key={source} value={source}>{source}</option>)}
                </select>
              </label>
              <label>{t(language, "pest.priority")}
                <select name="priority" value={quickAddDraft.priority} onChange={(event) => setQuickAddDraft((current) => ({ ...current, priority: event.target.value as PestPriority }))}>
                  {pestPriorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                </select>
              </label>
            </div>
            <label className="pool-textarea-wide">{t(language, "pest.notes")}
              <textarea data-testid="pest-quick-add-description" name="description" value={quickAddDraft.description} onChange={(event) => setQuickAddDraft((current) => ({ ...current, description: event.target.value }))} placeholder={t(language, "pest.notesPlaceholder")} />
            </label>
            <div className="pool-entry-actions" style={{ alignItems: "flex-end" }}>
              <button data-testid="pest-quick-add-submit" className="button button-primary" type="submit" disabled={createIssueMutation.isPending}>{t(language, "pest.quickAddSubmit")}</button>
            </div>
          </form>
        </section>
      ) : null}

      {tab === "dashboard" ? (
        overviewQuery.isLoading ? <StatusState title={t(language, "pest.loadingTitle")} description={t(language, "pest.loadingCopy")} /> : overviewQuery.isError || !overviewQuery.data ? <StatusState title={t(language, "pest.failedTitle")} description={t(language, "pest.failedCopy")} tone="error" /> : (
          <div className="dashboard-grid">
            <section className="panel-card">
              <h2>{t(language, "dashboard.overview")}</h2>
              <div className="dashboard-kpis pest-dashboard-kpis">
                <div><strong>{overviewQuery.data.summary.openRequests}</strong><span>{t(language, "pest.openRequests")}</span></div>
                <div><strong>{overviewQuery.data.summary.scheduled}</strong><span>{t(language, "pest.scheduled")}</span></div>
                <div><strong>{overviewQuery.data.summary.needsFollowUp}</strong><span>{t(language, "pest.needsFollowUp")}</span></div>
                <div><strong>{overviewQuery.data.summary.overdueFollowUps}</strong><span>{t(language, "pest.overdueFollowUps")}</span></div>
                <div><strong>{overviewQuery.data.summary.makeReadyPending}</strong><span>{t(language, "pest.makeReadyPending")}</span></div>
                <div><strong>{overviewQuery.data.summary.recurringUnits}</strong><span>{t(language, "pest.recurringUnits")}</span></div>
              </div>
            </section>
            <section className="panel-card">
              <h2>{t(language, "pest.upcomingFollowUps")}</h2>
              {overviewQuery.data.upcomingFollowUps.length ? overviewQuery.data.upcomingFollowUps.map((issue) => <p key={issue.id}>{issue.unit?.number ?? issue.area ?? t(language, "pest.areaLabel")} / {issue.pestType} / {formatDate(issue.followUpDate)}</p>) : <p className="muted">{t(language, "pest.noFollowUpsDue")}</p>}
            </section>
            <section className="panel-card">
              <h2>{t(language, "pest.recentRequests")}</h2>
              {overviewQuery.data.recentRequests.length ? overviewQuery.data.recentRequests.slice(0, 8).map((issue) => <p key={issue.id}>{issue.unit?.number ?? issue.area ?? t(language, "pest.areaLabel")} / {issue.pestType} / {issue.status}</p>) : <p className="muted">{t(language, "pest.noRecentRequests")}</p>}
            </section>
            <section className="panel-card">
              <h2>{t(language, "pest.recentTreatments")}</h2>
              {overviewQuery.data.recentTreatments.length ? overviewQuery.data.recentTreatments.slice(0, 8).map((issue) => <p key={issue.id}>{issue.unit?.number ?? issue.area ?? t(language, "pest.areaLabel")} / {issue.pestType} / {formatDate(issue.treatmentDate)}</p>) : <p className="muted">{t(language, "pest.noRecentTreatments")}</p>}
            </section>
          </div>
        )
      ) : null}

      {tab === "active" ? (
        <>
          <section className="panel-card" style={{ marginBottom: 16 }}>
            <div className="pool-grid">
              <label>{t(language, "nav.search")}
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t(language, "pest.searchPlaceholder")} />
              </label>
              <label>{t(language, "admin.status")}
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as PestStatus | "")}>
                  <option value="">{t(language, "pest.allActiveStatuses")}</option>
                  {pestStatuses.filter((status) => status !== "Archived").map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>
            </div>
          </section>
          {activeQuery.isLoading ? <StatusState title={t(language, "pest.loadingActiveTitle")} description={t(language, "pest.loadingActiveCopy")} /> : activeQuery.isError || !activeQuery.data ? <StatusState title={t(language, "pest.activeFailedTitle")} description={t(language, "pest.refreshTryAgain")} tone="error" /> : (
            <div className="pool-card-grid">
              {activeQuery.data.issues.filter((issue) => !issue.isArchived).map((issue) => (
                <PestIssueCard
                  key={issue.id}
                  issue={issue}
                  canEdit={canEdit}
                  vendors={vendors}
                  assignableUsers={assignableUsers}
                  language={language}
                  onSave={(id, input) => updateIssueMutation.mutate({ id, input })}
                  onNote={(id, body) => addNoteMutation.mutate({ id, body })}
                  onClose={(id, closingNotes, followUpDate) => closeIssueMutation.mutate({ id, closingNotes, followUpDate })}
                  onArchive={(id, notes) => archiveIssueMutation.mutate({ id, notes })}
                  onDismissRecurring={(id, notes) => dismissRecurringMutation.mutate({ id, notes })}
                  onUpload={(issueId, files) => { if (files?.[0]) uploadMutation.mutate({ issueId, file: files[0] }); }}
                  onDeleteAttachment={(attachmentId) => deleteAttachmentMutation.mutate(attachmentId)}
                  compact={isMobileLayout}
                />
              ))}
              {activeQuery.data.issues.filter((issue) => !issue.isArchived).length === 0 ? <p className="muted">{t(language, "pest.noActiveMatches")}</p> : null}
            </div>
          )}
        </>
      ) : null}

      {tab === "make-ready" ? (
        makeReadyQuery.isLoading ? <StatusState title={t(language, "pest.loadingMakeReadyTitle")} description={t(language, "pest.loadingMakeReadyCopy")} /> : makeReadyQuery.isError || !makeReadyQuery.data ? <StatusState title={t(language, "pest.makeReadyFailedTitle")} description={t(language, "pest.refreshTryAgain")} tone="error" /> : (
          <div className="pool-card-grid">
            {makeReadyQuery.data.issues.map((issue) => (
              <PestIssueCard
                key={issue.id}
                issue={issue}
                canEdit={canEdit}
                vendors={vendors}
                assignableUsers={assignableUsers}
                language={language}
                onSave={(id, input) => updateIssueMutation.mutate({ id, input })}
                onNote={(id, body) => addNoteMutation.mutate({ id, body })}
                onClose={(id, closingNotes, followUpDate) => closeIssueMutation.mutate({ id, closingNotes, followUpDate })}
                onArchive={(id, notes) => archiveIssueMutation.mutate({ id, notes })}
                onDismissRecurring={(id, notes) => dismissRecurringMutation.mutate({ id, notes })}
                onUpload={(issueId, files) => { if (files?.[0]) uploadMutation.mutate({ issueId, file: files[0] }); }}
                onDeleteAttachment={(attachmentId) => deleteAttachmentMutation.mutate(attachmentId)}
                compact={isMobileLayout}
              />
            ))}
            {makeReadyQuery.data.issues.length === 0 ? <p className="muted">{t(language, "pest.noMakeReadyMatches")}</p> : null}
          </div>
        )
      ) : null}

      {tab === "vendors" ? (
        <>
          {canEdit ? (
            <section className="panel-card" style={{ marginBottom: 16 }}>
              <h2>{t(language, "pest.vendorsTitle")}</h2>
              <form className="pool-grid" onSubmit={(event) => void submitVendor(event)}>
                <label>{t(language, "pest.vendorName")}
                  <input name="vendorName" required />
                </label>
                <label>{t(language, "pest.primaryContact")}
                  <input name="primaryContact" />
                </label>
                <label>{t(language, "wiki.phone")}
                  <input name="phone" />
                </label>
                <label>Email
                  <input name="email" type="email" />
                </label>
                <label>{t(language, "wiki.emergencyPhone")}
                  <input name="emergencyPhone" />
                </label>
                <label>{t(language, "pest.serviceDay")}
                  <input name="serviceDay" placeholder={t(language, "pest.serviceDayPlaceholder")} />
                </label>
                <label>{t(language, "pest.serviceFrequency")}
                  <input name="serviceFrequency" placeholder={t(language, "pest.serviceFrequencyPlaceholder")} />
                </label>
                <label className="pool-textarea-wide">{t(language, "pest.notes")}
                  <textarea name="notes" />
                </label>
                <label className="checkbox-row"><input name="isDefault" type="checkbox" /> {t(language, "pest.defaultVendorForProperty")}</label>
                <div className="pool-entry-actions"><button className="button button-primary" type="submit">{t(language, "pest.addVendor")}</button></div>
              </form>
            </section>
          ) : null}
          {vendorsQuery.isLoading ? <StatusState title={t(language, "pest.loadingVendorsTitle")} description={t(language, "pest.loadingVendorsCopy")} /> : vendorsQuery.isError || !vendorsQuery.data ? <StatusState title={t(language, "pest.vendorsFailedTitle")} description={t(language, "pest.refreshTryAgain")} tone="error" /> : (
            <div className="pool-card-grid">
              {vendorsQuery.data.vendors.map((vendor) => (
                <article key={vendor.id} className="pool-card">
                  <div className="drawer-section-title">
                    <h3>{vendor.vendorName}</h3>
                    <span className="status-pill">{vendor.isDefault ? t(language, "pest.defaultStatus") : vendor.isActive ? t(language, "admin.active") : t(language, "admin.inactive")}</span>
                  </div>
                  <div className="pool-reading-stack">
                    <span>{vendor.primaryContact || t(language, "pest.noContact")}</span>
                    <span>{vendor.phone || t(language, "pest.noPhone")}</span>
                    <span>{vendor.email || t(language, "pest.noEmail")}</span>
                    <span>{vendor.serviceDay || t(language, "pest.noServiceDay")}</span>
                    <span>{vendor.serviceFrequency || t(language, "pest.noFrequency")}</span>
                  </div>
                  {vendor.notes ? <p>{vendor.notes}</p> : null}
                  {canEdit ? (
                    <div className="pool-entry-actions">
                      <button className="button button-secondary" type="button" onClick={() => vendorUpdateMutation.mutate({ id: vendor.id, input: { isDefault: !vendor.isDefault } })}>{vendor.isDefault ? t(language, "pest.unsetDefault") : t(language, "pest.makeDefault")}</button>
                      <button className="button button-secondary" type="button" onClick={() => vendorUpdateMutation.mutate({ id: vendor.id, input: { isActive: !vendor.isActive } })}>{vendor.isActive ? t(language, "pest.deactivate") : t(language, "pest.activate")}</button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </>
      ) : null}

      {tab === "archive" ? (
        archiveQuery.isLoading ? <StatusState title={t(language, "pest.loadingArchiveTitle")} description={t(language, "pest.loadingArchiveCopy")} /> : archiveQuery.isError || !archiveQuery.data ? <StatusState title={t(language, "pest.archiveFailedTitle")} description={t(language, "pest.refreshTryAgain")} tone="error" /> : (
          <div className="pool-card-grid">
            {archivedOnly.map((issue) => (
              <PestIssueCard
                key={issue.id}
                issue={issue}
                canEdit={false}
                vendors={vendors}
                assignableUsers={assignableUsers}
                language={language}
                onSave={() => undefined}
                onNote={() => undefined}
                onClose={() => undefined}
                onArchive={() => undefined}
                onDismissRecurring={() => undefined}
                onUpload={() => undefined}
                onDeleteAttachment={() => undefined}
                compact={isMobileLayout}
              />
            ))}
            {archivedOnly.length === 0 ? <p className="muted">{t(language, "pest.noArchiveMatches")}</p> : null}
          </div>
        )
      ) : null}

      {tab === "reports" ? (
        <section className="panel-card">
          <h2>{t(language, "pest.reports")}</h2>
          <p>{t(language, "pest.reportsCopy")}</p>
          <div className="pool-entry-actions">
            <a className="button button-secondary" href={pestExportCsvUrl({ propertyId: propertyId || undefined })} target="_blank" rel="noreferrer">{t(language, "pest.exportCsv")}</a>
            <a className="button button-secondary" href={pestExportXlsUrl({ propertyId: propertyId || undefined })} target="_blank" rel="noreferrer">{t(language, "pest.exportExcel")}</a>
            <a className="button button-secondary" href={pestPrintableHtmlReportUrl({ propertyId: propertyId || undefined })} target="_blank" rel="noreferrer">{t(language, "pest.printableHtml")}</a>
            <a className="button button-primary" href={pestPrintableReportUrl({ propertyId: propertyId || undefined })} target="_blank" rel="noreferrer">{t(language, "pest.pdfReport")}</a>
          </div>
        </section>
      ) : null}
    </section>
  );
}
