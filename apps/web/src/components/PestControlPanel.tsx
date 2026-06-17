import { FormEvent, useEffect, useMemo, useState } from "react";
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
  type UserRole,
} from "../lib/api";
import { enqueuePestCreate, enqueuePestUpload } from "../lib/offlineSync";
import type { OpenPestQuickAddRequest, OpenPestWorkspaceRequest } from "../lib/pestNavigation";
import { StatusState } from "./StatusState";
import { UnitSearchSelect } from "./UnitSearchSelect";

type Tab = "dashboard" | "active" | "make-ready" | "vendors" | "archive" | "reports";

type Props = {
  properties: Property[];
  units: Unit[];
  users: Array<{ id: string; fullName: string; role: UserRole }>;
  userRole: UserRole;
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

function PestIssueCard({
  issue,
  canEdit,
  vendors,
  assignableUsers,
  onSave,
  onNote,
  onClose,
  onArchive,
  onDismissRecurring,
  onUpload,
  onDeleteAttachment,
}: {
  issue: PestIssue;
  canEdit: boolean;
  vendors: Array<{ id: string; vendorName: string }>;
  assignableUsers: Array<{ id: string; fullName: string; role: UserRole }>;
  onSave: (id: string, input: Partial<Parameters<typeof createPestIssue>[0]>) => void;
  onNote: (id: string, body: string) => void;
  onClose: (id: string, closingNotes: string, followUpDate?: string) => void;
  onArchive: (id: string, notes?: string) => void;
  onDismissRecurring: (id: string, notes: string) => void;
  onUpload: (issueId: string, files: FileList | null) => void;
  onDeleteAttachment: (attachmentId: string) => void;
}) {
  const [note, setNote] = useState("");
  const [closingNotes, setClosingNotes] = useState("");
  const [followUpDate, setFollowUpDate] = useState(issue.followUpDate ? issue.followUpDate.slice(0, 10) : "");
  const label = issue.unit?.number || issue.makeReadyItem?.unitNumber || issue.area || "Area not set";
  const overdueFollowUp = issue.status === "Needs Follow Up" && issue.followUpDate && new Date(issue.followUpDate) < new Date(`${today()}T00:00:00`);
  return (
    <article className={`pool-card ${overdueFollowUp ? "pm-task-card" : ""}`} data-testid={`pest-issue-${issue.id}`}>
      <div className="drawer-section-title">
        <h3>{label} / {issue.pestType}{issue.additionalPestType ? ` + ${issue.additionalPestType}` : ""}</h3>
        <span className={`status-pill ${overdueFollowUp ? "risk-critical" : issue.status === "Needs Follow Up" ? "risk-high" : ""}`}>{issue.status}</span>
      </div>
      <div className="pool-reading-stack">
        <span>{issue.property.code}</span>
        <span>{issue.priority}</span>
        <span>Requested {formatDate(issue.requestDate)}</span>
        <span>{issue.vendor?.vendorName ?? "No vendor"}</span>
        {issue.treatmentDate ? <span>Treated {formatDate(issue.treatmentDate)}</span> : null}
        {issue.followUpDate ? <span>Follow Up {formatDate(issue.followUpDate)}</span> : null}
        {issue.makeReadyItem ? <span>Make Ready linked</span> : null}
      </div>
      {issue.description ? <p>{issue.description}</p> : null}
      {(issue.recurringConcern || issue.managerReviewRequired) ? (
        <div className="risk-banner" style={{ marginBottom: 12 }}>
          <strong>{issue.managerReviewRequired ? "Manager review required" : "Recurring pest concern"}</strong>
          <span>{issue.unit?.number ?? issue.area ?? "This location"} has repeated pest activity.</span>
          {canEdit ? <button className="button button-secondary" type="button" onClick={() => onDismissRecurring(issue.id, "Reviewed from Pest Control workspace.")}>Dismiss Flag</button> : null}
        </div>
      ) : null}
      {canEdit ? (
        <div className="pool-grid" style={{ marginBottom: 12 }}>
          <label>Status
            <select value={issue.status} onChange={(event) => onSave(issue.id, { status: event.target.value as PestStatus })}>
              {pestStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          <label>Priority
            <select value={issue.priority} onChange={(event) => onSave(issue.id, { priority: event.target.value as PestPriority })}>
              {pestPriorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
            </select>
          </label>
          <label>Vendor
            <select value={issue.vendorId ?? ""} onChange={(event) => onSave(issue.id, { vendorId: event.target.value || null })}>
              <option value="">Unassigned</option>
              {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.vendorName}</option>)}
            </select>
          </label>
          <label>Assigned user
            <select value={issue.assignedUserId ?? ""} onChange={(event) => onSave(issue.id, { assignedUserId: event.target.value || null })}>
              <option value="">Unassigned</option>
              {assignableUsers.map((user) => <option key={user.id} value={user.id}>{user.fullName} / {user.role}</option>)}
            </select>
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
      ) : <p className="muted">No notes yet.</p>}
      {issue.attachments.length ? (
        <div className="pool-attachment-list" style={{ marginBottom: 12 }}>
          {issue.attachments.map((attachment) => (
            <span key={attachment.id} style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <a href={pestIssueAttachmentDownloadUrl(attachment.id)} target="_blank" rel="noreferrer">{attachment.originalName}</a>
              {attachment.caption ? <em className="muted">{attachment.caption}</em> : null}
              {canEdit ? <button className="link-button" type="button" onClick={() => onDeleteAttachment(attachment.id)}>Remove</button> : null}
            </span>
          ))}
        </div>
      ) : null}
      {canEdit ? (
        <>
          <div className="pool-entry-actions" style={{ marginBottom: 12 }}>
            <label className="button button-secondary pool-upload-button">
              Upload photo/PDF
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
            <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="INT, EXT, privacy lock, resident not home, follow up needed..." />
          </label>
          <div className="pool-entry-actions" style={{ marginBottom: 12 }}>
            <button className="button button-secondary" type="button" onClick={() => { if (note.trim()) { onNote(issue.id, note.trim()); setNote(""); } }}>Add Note</button>
          </div>
          <label>Closing notes
            <textarea value={closingNotes} onChange={(event) => setClosingNotes(event.target.value)} placeholder="No more activity, treated interior, follow up needed..." />
          </label>
          <div className="pool-grid" style={{ marginTop: 12 }}>
            <label>Follow up date
              <input type="date" value={followUpDate} onChange={(event) => setFollowUpDate(event.target.value)} />
            </label>
            <div className="pool-entry-actions" style={{ alignItems: "flex-end" }}>
              <button className="button button-primary" type="button" onClick={() => { if (closingNotes.trim()) { onClose(issue.id, closingNotes.trim(), followUpDate || undefined); setClosingNotes(""); } }}>Quick Close</button>
              <button className="button button-secondary" type="button" onClick={() => onArchive(issue.id, "Archived from Pest Control workspace.")}>Archive</button>
            </div>
          </div>
        </>
      ) : null}
    </article>
  );
}

export function PestControlPanel({ properties, units, users, userRole, selectedPropertyId, openQuickAddRequest, workspaceRequest }: Props) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [propertyId, setPropertyId] = useState(selectedPropertyId || properties[0]?.id || "");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PestStatus | "">("");
  const [linkedMakeReadyItemId, setLinkedMakeReadyItemId] = useState("");
  const [quickAddUnitId, setQuickAddUnitId] = useState("");
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

  const resetQuickAddForm = () => {
    setQuickAddUnitId("");
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
          await enqueuePestUpload(issueId, [{ file }]);
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
  const defaultVendorId = overviewQuery.data?.defaultVendor?.id ?? "";
  const archivedOnly = (archiveQuery.data?.issues ?? []).filter((issue) => issue.isArchived || issue.status === "Archived");

  useEffect(() => {
    if (!selectedPropertyId) return;
    setPropertyId(selectedPropertyId);
  }, [selectedPropertyId]);

  useEffect(() => {
    if (!openQuickAddRequest?.propertyId) return;
    setPropertyId(openQuickAddRequest.propertyId);
    setTab("dashboard");
    setQuickAddUnitId(openQuickAddRequest.unitId ?? "");
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
      await createIssueMutation.mutateAsync(quickIssueInput);
    } catch (error) {
      if (!(isApiError(error) && error.status === 0)) {
        throw error;
      }
      await enqueuePestCreate(quickIssueInput);
    }
    event.currentTarget.reset();
    resetQuickAddForm();
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
    return <StatusState title="Pest Control unavailable" description="This role does not have access to the Pest Control workspace." tone="error" />;
  }
  if (!properties.length) {
    return <StatusState title="No properties available" description="Assign at least one property before using Pest Control." />;
  }

  return (
    <section className="pool-panel module-panel pest-control-panel" data-testid="pest-control-panel">
      <div className="module-heading">
        <div>
          <span className="eyebrow">Pest Control</span>
          <h1>Pest Control</h1>
          <p>Track fast pest requests, vendor treatments, follow ups, make-ready pest needs, and unit history.</p>
        </div>
        <div className="module-actions">
          <select value={propertyId} onChange={(event) => { setPropertyId(event.target.value); setLinkedMakeReadyItemId(""); resetQuickAddForm(); }} aria-label="Pest Control property">
            {properties.map((property) => <option key={property.id} value={property.id}>{property.code} - {property.name}</option>)}
          </select>
        </div>
      </div>

      <div className="module-tabs" aria-label="Pest Control sections">
        {([
          ["dashboard", "Dashboard"],
          ["active", "Active"],
          ["make-ready", "Make Ready"],
          ["vendors", "Vendors"],
          ["archive", "Archive"],
          ["reports", "Reports"],
        ] as Array<[Tab, string]>).map(([key, label]) => (
          <button key={key} type="button" className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {linkedMakeReadyItemId ? (
        <section className="panel-card" style={{ marginBottom: 16 }}>
          <div className="drawer-section-title">
            <h2>Scoped Make Ready Link</h2>
            <button type="button" className="button button-ghost" onClick={() => setLinkedMakeReadyItemId("")}>Clear Scope</button>
          </div>
          <p className="muted">Showing pest requests linked to the selected make-ready item only.</p>
        </section>
      ) : null}

      {canEdit ? (
        <section className="panel-card" style={{ marginBottom: 16 }}>
          <div className="drawer-section-title">
            <h2>Quick Add Pest Request</h2>
          </div>
          <form data-testid="pest-quick-add-form" className="pool-form" onSubmit={(event) => void submitQuickAdd(event)}>
            <div className="form-grid pest-quick-grid">
              <label>Unit
                <UnitSearchSelect
                  name="unitId"
                  units={propertyUnits}
                  value={quickAddUnitId}
                  onChange={setQuickAddUnitId}
                  emptyLabel="Area only"
                  placeholder="Search unit..."
                />
              </label>
              <label>Area
                <input data-testid="pest-quick-add-area" name="area" value={quickAddDraft.area} onChange={(event) => setQuickAddDraft((current) => ({ ...current, area: event.target.value }))} placeholder="Pool Area, Breezeway, Clubhouse..." />
              </label>
              <label>Pest type
                <select name="pestType" value={quickAddDraft.pestType} onChange={(event) => setQuickAddDraft((current) => ({ ...current, pestType: event.target.value as PestType }))}>
                  {pestTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
              <label>Additional pest type
                <input name="additionalPestType" value={quickAddDraft.additionalPestType} onChange={(event) => setQuickAddDraft((current) => ({ ...current, additionalPestType: event.target.value }))} placeholder="Optional second pest" />
              </label>
              <label>Vendor
                <select name="vendorId" value={quickAddDraft.vendorId} onChange={(event) => setQuickAddDraft((current) => ({ ...current, vendorId: event.target.value }))}>
                  <option value="">No vendor</option>
                  {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.vendorName}</option>)}
                </select>
              </label>
              <label>Third-party WO
                <input name="thirdPartyWorkOrderNumber" value={quickAddDraft.thirdPartyWorkOrderNumber} onChange={(event) => setQuickAddDraft((current) => ({ ...current, thirdPartyWorkOrderNumber: event.target.value }))} placeholder="Optional work order #" />
              </label>
              <label>Source
                <select name="source" value={quickAddDraft.source} onChange={(event) => setQuickAddDraft((current) => ({ ...current, source: event.target.value as PestSource }))}>
                  {pestSources.map((source) => <option key={source} value={source}>{source}</option>)}
                </select>
              </label>
              <label>Priority
                <select name="priority" value={quickAddDraft.priority} onChange={(event) => setQuickAddDraft((current) => ({ ...current, priority: event.target.value as PestPriority }))}>
                  {pestPriorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                </select>
              </label>
            </div>
            <label className="pool-textarea-wide">Notes
              <textarea data-testid="pest-quick-add-description" name="description" value={quickAddDraft.description} onChange={(event) => setQuickAddDraft((current) => ({ ...current, description: event.target.value }))} placeholder="INT, EXT, privacy lock, no more activity, resident not home..." />
            </label>
            <div className="pool-entry-actions" style={{ alignItems: "flex-end" }}>
              <button data-testid="pest-quick-add-submit" className="button button-primary" type="submit" disabled={createIssueMutation.isPending}>Quick Add Pest Request</button>
            </div>
          </form>
        </section>
      ) : null}

      {tab === "dashboard" ? (
        overviewQuery.isLoading ? <StatusState title="Loading Pest Control" description="Gathering requests, follow ups, and recent activity." /> : overviewQuery.isError || !overviewQuery.data ? <StatusState title="Pest Control failed to load" description="Refresh the workspace and try again." tone="error" /> : (
          <div className="dashboard-grid">
            <section className="panel-card">
              <h2>Overview</h2>
              <div className="dashboard-kpis pest-dashboard-kpis">
                <div><strong>{overviewQuery.data.summary.openRequests}</strong><span>Open Requests</span></div>
                <div><strong>{overviewQuery.data.summary.scheduled}</strong><span>Scheduled</span></div>
                <div><strong>{overviewQuery.data.summary.needsFollowUp}</strong><span>Needs Follow Up</span></div>
                <div><strong>{overviewQuery.data.summary.overdueFollowUps}</strong><span>Overdue Follow Ups</span></div>
                <div><strong>{overviewQuery.data.summary.makeReadyPending}</strong><span>Make Ready Pending</span></div>
                <div><strong>{overviewQuery.data.summary.recurringUnits}</strong><span>Recurring Units</span></div>
              </div>
            </section>
            <section className="panel-card">
              <h2>Upcoming Follow Ups</h2>
              {overviewQuery.data.upcomingFollowUps.length ? overviewQuery.data.upcomingFollowUps.map((issue) => <p key={issue.id}>{issue.unit?.number ?? issue.area ?? "Area"} / {issue.pestType} / {formatDate(issue.followUpDate)}</p>) : <p className="muted">No follow ups due.</p>}
            </section>
            <section className="panel-card">
              <h2>Recent Requests</h2>
              {overviewQuery.data.recentRequests.length ? overviewQuery.data.recentRequests.slice(0, 8).map((issue) => <p key={issue.id}>{issue.unit?.number ?? issue.area ?? "Area"} / {issue.pestType} / {issue.status}</p>) : <p className="muted">No recent requests.</p>}
            </section>
            <section className="panel-card">
              <h2>Recent Treatments</h2>
              {overviewQuery.data.recentTreatments.length ? overviewQuery.data.recentTreatments.slice(0, 8).map((issue) => <p key={issue.id}>{issue.unit?.number ?? issue.area ?? "Area"} / {issue.pestType} / {formatDate(issue.treatmentDate)}</p>) : <p className="muted">No recent treatments.</p>}
            </section>
          </div>
        )
      ) : null}

      {tab === "active" ? (
        <>
          <section className="panel-card" style={{ marginBottom: 16 }}>
            <div className="pool-grid">
              <label>Search
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Unit, area, pest, note, work order..." />
              </label>
              <label>Status
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as PestStatus | "")}>
                  <option value="">All active statuses</option>
                  {pestStatuses.filter((status) => status !== "Archived").map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>
            </div>
          </section>
          {activeQuery.isLoading ? <StatusState title="Loading active pest requests" description="Pulling current open and follow-up items." /> : activeQuery.isError || !activeQuery.data ? <StatusState title="Active pest requests failed to load" description="Refresh and try again." tone="error" /> : (
            <div className="pool-card-grid">
              {activeQuery.data.issues.filter((issue) => !issue.isArchived).map((issue) => (
                <PestIssueCard
                  key={issue.id}
                  issue={issue}
                  canEdit={canEdit}
                  vendors={vendors}
                  assignableUsers={assignableUsers}
                  onSave={(id, input) => updateIssueMutation.mutate({ id, input })}
                  onNote={(id, body) => addNoteMutation.mutate({ id, body })}
                  onClose={(id, closingNotes, followUpDate) => closeIssueMutation.mutate({ id, closingNotes, followUpDate })}
                  onArchive={(id, notes) => archiveIssueMutation.mutate({ id, notes })}
                  onDismissRecurring={(id, notes) => dismissRecurringMutation.mutate({ id, notes })}
                  onUpload={(issueId, files) => { if (files?.[0]) uploadMutation.mutate({ issueId, file: files[0] }); }}
                  onDeleteAttachment={(attachmentId) => deleteAttachmentMutation.mutate(attachmentId)}
                />
              ))}
              {activeQuery.data.issues.filter((issue) => !issue.isArchived).length === 0 ? <p className="muted">No active pest requests match the current filters.</p> : null}
            </div>
          )}
        </>
      ) : null}

      {tab === "make-ready" ? (
        makeReadyQuery.isLoading ? <StatusState title="Loading make-ready pest view" description="Collecting pest requests linked to active make readies." /> : makeReadyQuery.isError || !makeReadyQuery.data ? <StatusState title="Make-ready pest view failed to load" description="Refresh and try again." tone="error" /> : (
          <div className="pool-card-grid">
            {makeReadyQuery.data.issues.map((issue) => (
              <PestIssueCard
                key={issue.id}
                issue={issue}
                canEdit={canEdit}
                vendors={vendors}
                assignableUsers={assignableUsers}
                onSave={(id, input) => updateIssueMutation.mutate({ id, input })}
                onNote={(id, body) => addNoteMutation.mutate({ id, body })}
                onClose={(id, closingNotes, followUpDate) => closeIssueMutation.mutate({ id, closingNotes, followUpDate })}
                onArchive={(id, notes) => archiveIssueMutation.mutate({ id, notes })}
                onDismissRecurring={(id, notes) => dismissRecurringMutation.mutate({ id, notes })}
                onUpload={(issueId, files) => { if (files?.[0]) uploadMutation.mutate({ issueId, file: files[0] }); }}
                onDeleteAttachment={(attachmentId) => deleteAttachmentMutation.mutate(attachmentId)}
              />
            ))}
            {makeReadyQuery.data.issues.length === 0 ? <p className="muted">No make-ready-linked pest requests are active.</p> : null}
          </div>
        )
      ) : null}

      {tab === "vendors" ? (
        <>
          {canEdit ? (
            <section className="panel-card" style={{ marginBottom: 16 }}>
              <h2>Pest Vendors</h2>
              <form className="pool-grid" onSubmit={(event) => void submitVendor(event)}>
                <label>Vendor name
                  <input name="vendorName" required />
                </label>
                <label>Primary contact
                  <input name="primaryContact" />
                </label>
                <label>Phone
                  <input name="phone" />
                </label>
                <label>Email
                  <input name="email" type="email" />
                </label>
                <label>Emergency phone
                  <input name="emergencyPhone" />
                </label>
                <label>Service day
                  <input name="serviceDay" placeholder="Tuesday" />
                </label>
                <label>Service frequency
                  <input name="serviceFrequency" placeholder="Weekly, monthly..." />
                </label>
                <label className="pool-textarea-wide">Notes
                  <textarea name="notes" />
                </label>
                <label className="checkbox-row"><input name="isDefault" type="checkbox" /> Default vendor for this property</label>
                <div className="pool-entry-actions"><button className="button button-primary" type="submit">Add Vendor</button></div>
              </form>
            </section>
          ) : null}
          {vendorsQuery.isLoading ? <StatusState title="Loading pest vendors" description="Fetching property pest vendors." /> : vendorsQuery.isError || !vendorsQuery.data ? <StatusState title="Pest vendors failed to load" description="Refresh and try again." tone="error" /> : (
            <div className="pool-card-grid">
              {vendorsQuery.data.vendors.map((vendor) => (
                <article key={vendor.id} className="pool-card">
                  <div className="drawer-section-title">
                    <h3>{vendor.vendorName}</h3>
                    <span className="status-pill">{vendor.isDefault ? "Default" : vendor.isActive ? "Active" : "Inactive"}</span>
                  </div>
                  <div className="pool-reading-stack">
                    <span>{vendor.primaryContact || "No contact"}</span>
                    <span>{vendor.phone || "No phone"}</span>
                    <span>{vendor.email || "No email"}</span>
                    <span>{vendor.serviceDay || "No service day"}</span>
                    <span>{vendor.serviceFrequency || "No frequency"}</span>
                  </div>
                  {vendor.notes ? <p>{vendor.notes}</p> : null}
                  {canEdit ? (
                    <div className="pool-entry-actions">
                      <button className="button button-secondary" type="button" onClick={() => vendorUpdateMutation.mutate({ id: vendor.id, input: { isDefault: !vendor.isDefault } })}>{vendor.isDefault ? "Unset Default" : "Make Default"}</button>
                      <button className="button button-secondary" type="button" onClick={() => vendorUpdateMutation.mutate({ id: vendor.id, input: { isActive: !vendor.isActive } })}>{vendor.isActive ? "Deactivate" : "Activate"}</button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </>
      ) : null}

      {tab === "archive" ? (
        archiveQuery.isLoading ? <StatusState title="Loading archived pest history" description="Fetching historical pest requests and treatments." /> : archiveQuery.isError || !archiveQuery.data ? <StatusState title="Pest archive failed to load" description="Refresh and try again." tone="error" /> : (
          <div className="pool-card-grid">
            {archivedOnly.map((issue) => (
              <PestIssueCard
                key={issue.id}
                issue={issue}
                canEdit={false}
                vendors={vendors}
                assignableUsers={assignableUsers}
                onSave={() => undefined}
                onNote={() => undefined}
                onClose={() => undefined}
                onArchive={() => undefined}
                onDismissRecurring={() => undefined}
                onUpload={() => undefined}
                onDeleteAttachment={() => undefined}
              />
            ))}
            {archivedOnly.length === 0 ? <p className="muted">No archived pest history matches the current property/filter.</p> : null}
          </div>
        )
      ) : null}

      {tab === "reports" ? (
        <section className="panel-card">
          <h2>Reports</h2>
          <p>Pest Control reports now include CSV, Excel-compatible export, printable HTML, and PDF output for the active property filters.</p>
          <div className="pool-entry-actions">
            <a className="button button-secondary" href={pestExportCsvUrl({ propertyId: propertyId || undefined })} target="_blank" rel="noreferrer">CSV Export</a>
            <a className="button button-secondary" href={pestExportXlsUrl({ propertyId: propertyId || undefined })} target="_blank" rel="noreferrer">Excel Export</a>
            <a className="button button-secondary" href={pestPrintableHtmlReportUrl({ propertyId: propertyId || undefined })} target="_blank" rel="noreferrer">Printable HTML</a>
            <a className="button button-primary" href={pestPrintableReportUrl({ propertyId: propertyId || undefined })} target="_blank" rel="noreferrer">PDF Report</a>
          </div>
        </section>
      ) : null}
    </section>
  );
}
