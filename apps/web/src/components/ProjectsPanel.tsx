import { DragEvent, FormEvent, MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  convertProjectRecommendation,
  createProjectCategory,
  createProjectComment,
  createProjectRecord,
  createProjectTask,
  getProjectCategories,
  getProjectMapRecords,
  getProjectRecord,
  getProjectRecords,
  getProjectsOverview,
  getPropertyMaps,
  propertyMapFileUrl,
  projectAttachmentDownloadUrl,
  projectPrintableRecordReportUrl,
  projectsExportCsvUrl,
  projectsExportExcelUrl,
  projectsPdfReportUrl,
  projectsPrintableReportUrl,
  updateProjectAttachment,
  updateProjectCategory,
  updateProjectRecord,
  updateProjectTask,
  uploadProjectAttachment,
  isApiError,
  type ProjectAttachmentType,
  type ProjectCategory,
  type ProjectExecutionType,
  type ProjectPriority,
  type ProjectRecord,
  type ProjectRecordType,
  type ProjectSource,
  type ProjectTask,
  type ProjectTaskStatus,
  type Property,
  type PropertyMap,
  type ProjectHistoryEntry,
  type UserRole,
} from "../lib/api";
import {
  enqueueProjectAttachmentUpload,
  enqueueProjectCapture,
  listQueuedProjectCaptures,
  type QueuedProjectCaptureSummary,
} from "../lib/projectsOfflineQueue";
import { syncOfflineJobs } from "../lib/offlineSync";
import { StatusState } from "./StatusState";
import { SearchSelect, type SearchSelectOption } from "./SearchSelect";
import type { OpenProjectCreateRequest, OpenProjectRecordRequest } from "../lib/projectNavigation";
import { PropertyWikiWorkflowPanel } from "./PropertyWikiWorkflowPanel";
import { isTouchMobileViewport } from "../lib/responsive";

type Props = {
  properties: Property[];
  users: Array<{ id: string; fullName: string; role: UserRole }>;
  userRole: UserRole;
  language?: string;
  selectedPropertyId?: string;
  openRecordRequest?: (OpenProjectRecordRequest & { nonce: number }) | null;
  openCreateRequest?: (OpenProjectCreateRequest & { nonce: number }) | null;
};

type Tab = "dashboard" | "projects" | "recommendations" | "map" | "bids" | "archive" | "reports";
type StagedCaptureFile = { id: string; file: File; previewUrl: string };
type PropertyWalkSummary = { count: number; highPriority: number; needsBid: number };
type CategoryDraft = { name: string; color: string; sortOrder: string; propertyScoped: boolean };
type CaptureOutcome =
  | { mode: "saved"; record: ProjectRecord }
  | { mode: "queued"; title: string; fileCount: number; reason: "offline" | "retry" }
  | { mode: "saved-with-pending-uploads"; record: ProjectRecord; fileCount: number };

const projectSources: ProjectSource[] = ["Quick Capture", "Inspection", "Preventive Maintenance", "Pool Log", "Manager Walk", "Property Walk", "Resident Feedback", "Vendor Recommendation", "Regional Request", "Ownership Request", "Property Wiki", "Map Finding", "Other"];
const attachmentTypes: Array<{ value: ProjectAttachmentType; label: string }> = [
  { value: "BEFORE", label: "Before" },
  { value: "PROGRESS", label: "Progress" },
  { value: "AFTER", label: "After" },
  { value: "GENERAL", label: "General" },
  { value: "BID", label: "Bid / Quote" },
  { value: "LOCATION", label: "Location Photo" },
];
const budgetYearOptions = ["2026", "2027", "2028", "2029", "Future"];
const projectAllowedAttachmentExtensions = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".heic", ".heif", ".bmp", ".tif", ".tiff", ".pdf", ".doc", ".docx", ".xls", ".xlsx"]);
const projectAllowedAttachmentTypes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif", "image/heic", "image/heif", "image/bmp", "image/tiff", "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]);

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function toneForAging(daysOpen: number | null | undefined) {
  if (daysOpen === null || daysOpen === undefined) return "";
  if (daysOpen > 180) return "risk-critical";
  if (daysOpen > 90) return "risk-high";
  if (daysOpen > 30) return "warning-pill";
  return "";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString();
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function recordDraft(propertyId: string) {
  return {
    propertyId,
    recordType: "Recommendation" as ProjectRecordType,
    title: "",
    description: "",
    source: "Quick Capture" as ProjectSource,
    sourceRecordType: "",
    sourceRecordId: "",
    sourceRecordLabel: "",
    status: "Open",
    priority: "Normal" as ProjectPriority,
    executionType: "Undecided" as ProjectExecutionType,
    categoryId: "",
    building: "",
    area: "",
    locationNotes: "",
    propertyMapId: "",
    pinX: "",
    pinY: "",
    estimatedQuantity: "",
    quantityUnit: "",
    estimatedCost: "",
    actualCost: "",
    totalAmount: "",
    deferredMaintenance: false,
    deferredReason: "",
    targetYear: "",
    deferredNotes: "",
    budgetYear: "",
    companyName: "",
    assignedUserId: "",
    assignedRole: "",
    scheduledDate: "",
    dueDate: "",
    tags: "",
  };
}

function taskDraft() {
  return { title: "", status: "Open" as ProjectTaskStatus, assignedUserId: "", dueDate: "" };
}

function categoryDraft(): CategoryDraft {
  return { name: "", color: "#58a6de", sortOrder: "", propertyScoped: true };
}

function attachmentAccept(type: ProjectAttachmentType) {
  if (type === "BID") return "image/*,.pdf,.doc,.docx,.xls,.xlsx";
  return "image/*";
}

function isImageAttachment(mimeType: string) {
  return mimeType.startsWith("image/");
}

function fileExtension(name: string) {
  const match = name.toLowerCase().match(/\.[^.]+$/);
  return match?.[0] ?? "";
}

function isAllowedProjectAttachment(file: File, attachmentType: ProjectAttachmentType = "GENERAL") {
  if (file.size <= 0) return false;
  if (attachmentType !== "BID" && !file.type.startsWith("image/")) return false;
  return projectAllowedAttachmentTypes.has(file.type) || projectAllowedAttachmentExtensions.has(fileExtension(file.name));
}

async function buildImagePreviewUrl(file: File) {
  if (!isImageAttachment(file.type)) return "";
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const next = new Image();
      next.onload = () => resolve(next);
      next.onerror = () => reject(new Error("preview-load-failed"));
      next.src = sourceUrl;
    });
    const maxDimension = 640;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
    const width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
    const height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return sourceUrl;
    context.drawImage(image, 0, 0, width, height);
    const previewBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.74));
    if (!previewBlob) return sourceUrl;
    URL.revokeObjectURL(sourceUrl);
    return URL.createObjectURL(previewBlob);
  } catch {
    return sourceUrl;
  }
}

function buildAutoProjectTitle(
  draft: ReturnType<typeof recordDraft>,
  categories: ProjectCategory[],
) {
  const categoryName = categories.find((category) => category.id === draft.categoryId)?.name ?? "General";
  const location = [draft.building, draft.area].map((entry) => entry.trim()).filter(Boolean).join(" / ");
  return `${categoryName} ${draft.recordType === "Recommendation" ? "Finding" : "Project"} - ${location || new Date().toLocaleDateString()}`;
}

function hasQuickCaptureContent(draft: ReturnType<typeof recordDraft>, files: StagedCaptureFile[]) {
  return Boolean(draft.title.trim() || draft.description.trim() || files.length);
}

function ProjectDetail({
  record,
  canEdit,
  users,
  language = "en",
  onSave,
  onConvert,
  onAddComment,
  onAddTask,
  onUpdateTask,
  onUpload,
  onUpdateAttachment,
  history,
}: {
  record: ProjectRecord;
  canEdit: boolean;
  users: Array<{ id: string; fullName: string; role: UserRole }>;
  language?: string;
  history: ProjectHistoryEntry[];
  onSave: (record: ProjectRecord, patch: Partial<ProjectRecord>) => void;
  onConvert: (id: string) => void;
  onAddComment: (id: string, body: string) => void;
  onAddTask: (id: string, input: { title: string; status?: ProjectTaskStatus; assignedUserId?: string | null; dueDate?: string | null }) => void;
  onUpdateTask: (task: ProjectTask, patch: { status?: ProjectTaskStatus; assignedUserId?: string | null; dueDate?: string | null; completedDate?: string | null }) => void;
  onUpload: (id: string, files: FileList | null, attachmentType: ProjectAttachmentType, caption?: string) => void;
  onUpdateAttachment: (id: string, patch: { attachmentType?: ProjectAttachmentType; caption?: string | null }) => void;
}) {
  const [comment, setComment] = useState("");
  const [task, setTask] = useState(taskDraft);
  const [attachmentType, setAttachmentType] = useState<ProjectAttachmentType>("GENERAL");
  const [attachmentCaption, setAttachmentCaption] = useState("");
  const [bidDraft, setBidDraft] = useState({
    companyName: record.companyName ?? "",
    contactName: record.contactName ?? "",
    contactPhone: record.contactPhone ?? "",
    contactEmail: record.contactEmail ?? "",
    bidStatus: record.bidStatus ?? "Needed",
    bidNotes: record.bidNotes ?? "",
  });
  const [editingAttachmentId, setEditingAttachmentId] = useState<string | null>(null);
  const [editingAttachmentCaption, setEditingAttachmentCaption] = useState("");
  const [editingAttachmentType, setEditingAttachmentType] = useState<ProjectAttachmentType>("GENERAL");
  const isSpanish = language === "es";
  const userOptions = useMemo<SearchSelectOption[]>(() => users.map((user) => ({
    value: user.id,
    label: `${user.fullName} / ${user.role}`,
    keywords: [user.fullName, user.role],
  })), [users]);
  useEffect(() => {
    setBidDraft({
      companyName: record.companyName ?? "",
      contactName: record.contactName ?? "",
      contactPhone: record.contactPhone ?? "",
      contactEmail: record.contactEmail ?? "",
      bidStatus: record.bidStatus ?? "Needed",
      bidNotes: record.bidNotes ?? "",
    });
  }, [record]);
  const groupedAttachments = attachmentTypes.map((type) => ({
    ...type,
    items: record.attachments.filter((attachment) => attachment.attachmentType === type.value),
  })).filter((group) => group.items.length > 0);
  return (
    <section className="pool-card projects-detail-shell">
      <div className="projects-detail-section">
        <div className="drawer-section-title">
          <h3>{record.title}</h3>
          <span className={`status-pill ${record.priority === "Critical" ? "risk-critical" : record.priority === "High" ? "risk-high" : ""}`}>{record.status}</span>
        </div>
        <div className="pool-entry-actions">
          {record.recordType === "Recommendation" && canEdit ? <button className="button button-secondary" type="button" onClick={() => onConvert(record.id)}>{isSpanish ? "Convertir a proyecto" : "Convert To Project"}</button> : null}
          <a className="button button-secondary" href={projectPrintableRecordReportUrl(record.id)} target="_blank" rel="noreferrer">{isSpanish ? "Generar reporte PDF" : "Generate PDF Report"}</a>
        </div>
      </div>

      <div className="pool-reading-grid projects-detail-summary-grid">
        <div><dt>{isSpanish ? "Tipo" : "Type"}</dt><dd>{record.recordType}</dd></div>
        <div><dt>{isSpanish ? "Origen" : "Source"}</dt><dd>{record.source ?? (isSpanish ? "Otro" : "Other")}</dd></div>
        <div><dt>{isSpanish ? "Prioridad" : "Priority"}</dt><dd>{record.priority}</dd></div>
        <div><dt>{isSpanish ? "Ejecución" : "Execution"}</dt><dd>{record.executionType}</dd></div>
        <div><dt>{isSpanish ? "Categoría" : "Category"}</dt><dd>{record.categoryName ?? (isSpanish ? "Sin categoría" : "Uncategorized")}</dd></div>
        <div><dt>{isSpanish ? "Asignado" : "Assigned"}</dt><dd>{record.assignedUserName ?? record.assignedRole ?? (isSpanish ? "Sin asignar" : "Unassigned")}</dd></div>
        <div><dt>{isSpanish ? "Estado de cotización" : "Bid status"}</dt><dd>{record.bidStatus ?? "-"}</dd></div>
        <div><dt>{isSpanish ? "Días abierto" : "Days open"}</dt><dd>{record.daysOpen ?? "-"}</dd></div>
        <div><dt>{isSpanish ? "Año de presupuesto" : "Budget year"}</dt><dd>{record.budgetYear ?? "-"}</dd></div>
        <div><dt>{isSpanish ? "Diferido" : "Deferred"}</dt><dd>{record.deferredMaintenance ? (isSpanish ? "Sí" : "Yes") : (isSpanish ? "No" : "No")}</dd></div>
        <div><dt>{isSpanish ? "Año objetivo" : "Target year"}</dt><dd>{record.targetYear ?? "-"}</dd></div>
        <div><dt>{isSpanish ? "Costo estimado" : "Estimated cost"}</dt><dd>{formatCurrency(record.estimatedCost ?? record.totalAmount)}</dd></div>
        <div><dt>{isSpanish ? "Costo real" : "Actual cost"}</dt><dd>{formatCurrency(record.actualCost)}</dd></div>
        <div><dt>{isSpanish ? "Compañía" : "Company"}</dt><dd>{record.companyName ?? "-"}</dd></div>
        <div><dt>{isSpanish ? "Contacto de cotización" : "Bid contact"}</dt><dd>{record.contactName ?? record.contactEmail ?? record.contactPhone ?? "-"}</dd></div>
        <div><dt>{isSpanish ? "Edificio" : "Building"}</dt><dd>{record.building ?? "-"}</dd></div>
        <div><dt>{isSpanish ? "Área" : "Area"}</dt><dd>{record.area ?? "-"}</dd></div>
        <div><dt>{isSpanish ? "Programado" : "Scheduled"}</dt><dd>{formatDate(record.scheduledDate)}</dd></div>
        <div><dt>{isSpanish ? "Vence" : "Due"}</dt><dd>{formatDate(record.dueDate)}</dd></div>
      </div>
      <div className="projects-detail-notes">
        {record.description ? <p>{record.description}</p> : null}
        {record.locationNotes ? <p className="muted">{record.locationNotes}</p> : null}
        {record.deferredReason ? <p className="muted">{isSpanish ? "Motivo de diferimiento" : "Deferred reason"}: {record.deferredReason}</p> : null}
        {record.deferredNotes ? <p className="muted">{record.deferredNotes}</p> : null}
        {record.bidNotes ? <p className="muted">{isSpanish ? "Notas de cotización" : "Bid notes"}: {record.bidNotes}</p> : null}
        {record.pinX !== null && record.pinY !== null ? <p className="muted">{isSpanish ? "Pin colocado en" : "Pinned at"} {record.pinX.toFixed(1)}%, {record.pinY.toFixed(1)}%</p> : null}
      </div>

      <PropertyWikiWorkflowPanel
        title={isSpanish ? "Contexto de la wiki de la propiedad" : "Property Wiki Context"}
        module="PROJECTS"
        propertyId={record.propertyId}
        recordType="PROJECT_RECORD"
        recordId={record.id}
        building={record.building}
        equipmentQuery={record.title}
        query={[record.description, record.locationNotes, record.categoryName, record.companyName, record.bidNotes].filter(Boolean).join(" ")}
        canEdit={canEdit}
      />

      <div className="projects-detail-workspace">
        <div className="projects-detail-column">
          <section className="projects-detail-card">
            <div className="drawer-section-title">
              <h4>{isSpanish ? "Cotizaciones / Propuestas" : "Bids / Quotes"}</h4>
            </div>
            {canEdit ? (
              <>
                <div className="pool-entry-actions projects-detail-actions">
                  <button className="button button-secondary" type="button" onClick={() => onSave(record, { status: "Needs Bid", bidStatus: "Requested" })}>{isSpanish ? "Solicitar cotización" : "Request Bid"}</button>
                  <button className="button button-secondary" type="button" onClick={() => onSave(record, { status: record.recordType === "Recommendation" ? "Got Bid" : record.status, bidStatus: "Received" })}>{isSpanish ? "Marcar recibida" : "Mark Received"}</button>
                  <button className="button button-secondary" type="button" onClick={() => onSave(record, { bidStatus: "Approved" })}>{isSpanish ? "Aprobar cotización" : "Approve Bid"}</button>
                  <button className="button button-secondary" type="button" onClick={() => onSave(record, { bidStatus: "Denied" })}>{isSpanish ? "Rechazar cotización" : "Deny Bid"}</button>
                </div>
                <form className="pool-entry-form projects-detail-form" onSubmit={(event) => {
                  event.preventDefault();
                  onSave(record, {
                    companyName: bidDraft.companyName.trim() || null,
                    contactName: bidDraft.contactName.trim() || null,
                    contactPhone: bidDraft.contactPhone.trim() || null,
                    contactEmail: bidDraft.contactEmail.trim() || null,
                    bidStatus: bidDraft.bidStatus as ProjectRecord["bidStatus"],
                    bidNotes: bidDraft.bidNotes.trim() || null,
                  });
                }}>
                  <div className="form-grid projects-detail-compact-grid">
                    <label>{isSpanish ? "Proveedor / Compañía" : "Vendor / Company"}<input value={bidDraft.companyName} onChange={(event) => setBidDraft((current) => ({ ...current, companyName: event.target.value }))} /></label>
                    <label>{isSpanish ? "Nombre del contacto" : "Contact name"}<input value={bidDraft.contactName} onChange={(event) => setBidDraft((current) => ({ ...current, contactName: event.target.value }))} /></label>
                    <label>{isSpanish ? "Teléfono del contacto" : "Contact phone"}<input value={bidDraft.contactPhone} onChange={(event) => setBidDraft((current) => ({ ...current, contactPhone: event.target.value }))} /></label>
                    <label>{isSpanish ? "Correo del contacto" : "Contact email"}<input type="email" value={bidDraft.contactEmail} onChange={(event) => setBidDraft((current) => ({ ...current, contactEmail: event.target.value }))} /></label>
                    <label>{isSpanish ? "Estado de cotización" : "Bid status"}
                      <select value={bidDraft.bidStatus} onChange={(event) => setBidDraft((current) => ({ ...current, bidStatus: event.target.value as typeof current.bidStatus }))}>
                        {["Needed", "Requested", "Received", "Approved", "Denied", "Warranty", "Not Applicable"].map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                    </label>
                  </div>
                  <label>{isSpanish ? "Notas de cotización" : "Bid notes"}<textarea value={bidDraft.bidNotes} onChange={(event) => setBidDraft((current) => ({ ...current, bidNotes: event.target.value }))} placeholder={isSpanish ? "Detalles de la cotización, alcance, garantía, exclusiones..." : "Quote details, scope notes, warranty terms, exclusions..."} /></label>
                  <button className="button button-primary" type="submit">{isSpanish ? "Guardar detalles de cotización" : "Save Bid Details"}</button>
                </form>
              </>
            ) : (
              <div className="pool-reading-stack">
                <span>{record.companyName ?? (isSpanish ? "Sin proveedor" : "No vendor set")}</span>
                <span>{record.contactName ?? record.contactEmail ?? record.contactPhone ?? (isSpanish ? "Sin contacto" : "No contact set")}</span>
                <span>{record.bidStatus ?? (isSpanish ? "Sin estado de cotización" : "No bid status")}</span>
              </div>
            )}
          </section>

          <section className="projects-detail-card">
            <h4>{isSpanish ? "Fotos" : "Photos"}</h4>
            <div className="projects-photo-toolbar">
              {canEdit ? (
                <>
                  <select value={record.status} onChange={(event) => onSave(record, { status: event.target.value })}>
                    {[...(record.recordType === "Recommendation" ? ["Open", "Needs Bid", "Got Bid", "Approved", "Denied", "Converted To Project", "Archived"] : ["Planning", "Approved", "Scheduled", "In Progress", "Waiting", "Completed", "Cancelled", "Archived"])].map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                  <select value={attachmentType} onChange={(event) => setAttachmentType(event.target.value as ProjectAttachmentType)}>
                    {attachmentTypes.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
                  </select>
                  <input value={attachmentCaption} onChange={(event) => setAttachmentCaption(event.target.value)} placeholder={isSpanish ? "Pie de foto" : "Photo caption"} />
                  <label className="button button-secondary pool-upload-button">
                    {isSpanish ? "Subir fotos" : "Upload Photos"}
                    <input hidden type="file" multiple capture={attachmentType === "BID" ? undefined : "environment"} accept={attachmentAccept(attachmentType)} onChange={(event) => { onUpload(record.id, event.target.files, attachmentType, attachmentCaption); event.currentTarget.value = ""; setAttachmentCaption(""); }} />
                  </label>
                </>
              ) : null}
            </div>
            {groupedAttachments.length ? groupedAttachments.map((group) => (
              <div key={group.value} className="projects-photo-group">
                <h5>{group.label}</h5>
                <div className="projects-photo-grid">
                  {group.items.map((attachment) => (
                    <article key={attachment.id} className="projects-photo-card">
                      {isImageAttachment(attachment.mimeType) ? <img loading="lazy" decoding="async" src={projectAttachmentDownloadUrl(attachment.id)} alt={attachment.caption ?? attachment.originalName} /> : <div className="projects-photo-file">FILE</div>}
                      <div className="projects-photo-meta">
                        <strong>{attachment.caption ?? attachment.originalName}</strong>
                        <span>{group.label}</span>
                        <span>{attachment.uploaderName ?? (isSpanish ? "Desconocido" : "Unknown")} / {formatDate(attachment.createdAt)}</span>
                        <a href={projectAttachmentDownloadUrl(attachment.id)} target="_blank" rel="noreferrer">{isSpanish ? "Abrir" : "Open"}</a>
                        {canEdit ? (
                          editingAttachmentId === attachment.id ? (
                            <div className="projects-attachment-editor">
                              <select value={editingAttachmentType} onChange={(event) => setEditingAttachmentType(event.target.value as ProjectAttachmentType)}>
                                {attachmentTypes.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
                              </select>
                              <input value={editingAttachmentCaption} onChange={(event) => setEditingAttachmentCaption(event.target.value)} placeholder={isSpanish ? "Pie de foto" : "Caption"} />
                              <div className="pool-entry-actions">
                                <button
                                  className="button button-primary"
                                  type="button"
                                  onClick={() => {
                                    onUpdateAttachment(attachment.id, {
                                      attachmentType: editingAttachmentType,
                                      caption: editingAttachmentCaption.trim() || null,
                                    });
                                    setEditingAttachmentId(null);
                                    setEditingAttachmentCaption("");
                                  }}
                                >
                                  {isSpanish ? "Guardar" : "Save"}
                                </button>
                                <button className="button button-secondary" type="button" onClick={() => setEditingAttachmentId(null)}>{isSpanish ? "Cancelar" : "Cancel"}</button>
                              </div>
                            </div>
                          ) : (
                            <button
                              className="link-button"
                              type="button"
                              onClick={() => {
                                setEditingAttachmentId(attachment.id);
                                setEditingAttachmentCaption(attachment.caption ?? "");
                                setEditingAttachmentType(attachment.attachmentType);
                              }}
                            >
                              {isSpanish ? "Editar detalles" : "Edit details"}
                            </button>
                          )
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )) : <p className="muted">{isSpanish ? "Todavía no hay fotos/archivos del proyecto." : "No project photos/files yet."}</p>}
          </section>
        </div>

        <div className="projects-detail-column">
          <section className="projects-detail-card">
            <h4>{isSpanish ? "Tareas" : "Tasks"}</h4>
            <div className="projects-detail-list">
              {record.tasks.map((entry) => (
                <div key={entry.id} className="projects-detail-list-item">
                  <div className="projects-detail-list-copy">
                    <strong>{entry.title}</strong>
                    <div className="pool-reading-stack">
                      <span>{entry.status}</span>
                      <span>{entry.assignedUserName ?? (isSpanish ? "Sin asignar" : "Unassigned")}</span>
                      <span>{isSpanish ? "Vence" : "Due"} {formatDate(entry.dueDate)}</span>
                    </div>
                  </div>
                  {canEdit ? (
                    <select value={entry.status} onChange={(event) => onUpdateTask(entry, { status: event.target.value as ProjectTaskStatus, completedDate: event.target.value === "Completed" ? new Date().toISOString() : null })}>
                      {["Open", "In Progress", "Completed", "Skipped"].map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  ) : null}
                </div>
              ))}
            </div>
            {canEdit ? (
              <form className="pool-entry-form projects-detail-form" onSubmit={(event) => {
                event.preventDefault();
                onAddTask(record.id, {
                  title: task.title,
                  status: task.status,
                  assignedUserId: task.assignedUserId || null,
                  dueDate: task.dueDate || null,
                });
                setTask(taskDraft());
              }}>
                <div className="form-grid projects-detail-compact-grid">
                  <label>{isSpanish ? "Nueva tarea" : "New task"}<input value={task.title} onChange={(event) => setTask((current) => ({ ...current, title: event.target.value }))} /></label>
                  <label>{isSpanish ? "Usuario asignado" : "Assigned user"}
                    <SearchSelect
                      options={userOptions}
                      value={task.assignedUserId}
                      onChange={(assignedUserId) => setTask((current) => ({ ...current, assignedUserId }))}
                      placeholder={isSpanish ? "Buscar usuario..." : "Search user..."}
                      emptyLabel={isSpanish ? "Sin asignar" : "Unassigned"}
                      noMatchesLabel={isSpanish ? "No hay usuarios coincidentes" : "No matching users"}
                      clearLabel={isSpanish ? "Quitar usuario asignado" : "Clear assigned user"}
                    />
                  </label>
                  <label>{isSpanish ? "Fecha límite" : "Due date"}<input type="date" value={task.dueDate} onChange={(event) => setTask((current) => ({ ...current, dueDate: event.target.value }))} /></label>
                </div>
                <button className="button button-primary" type="submit" disabled={!task.title.trim()}>{isSpanish ? "Agregar tarea" : "Add Task"}</button>
              </form>
            ) : null}
          </section>

          <section className="projects-detail-card">
            <h4>{isSpanish ? "Comentarios" : "Comments"}</h4>
            <div className="projects-detail-list">
              {record.comments.map((entry) => (
                <div key={entry.id} className="projects-detail-list-item projects-detail-history-item">
                  <strong>{entry.authorName ?? (isSpanish ? "Desconocido" : "Unknown")}</strong>
                  <p>{entry.body}</p>
                  <span className="muted">{new Date(entry.createdAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
            {canEdit ? (
              <form className="pool-entry-form projects-detail-form" onSubmit={(event) => {
                event.preventDefault();
                onAddComment(record.id, comment);
                setComment("");
              }}>
                <label>{isSpanish ? "Comentario" : "Comment"}<textarea value={comment} onChange={(event) => setComment(event.target.value)} /></label>
                <button className="button button-primary" type="submit" disabled={!comment.trim()}>{isSpanish ? "Agregar comentario" : "Add Comment"}</button>
              </form>
            ) : null}
          </section>

          <section className="projects-detail-card">
            <h4>{isSpanish ? "Historial del ciclo de vida" : "Lifecycle History"}</h4>
            <div className="projects-detail-list">
              {history.length ? history.map((entry) => (
                <div key={entry.id} className="projects-detail-list-item projects-detail-history-item">
                  <strong>{entry.user}</strong>
                  <p>{entry.action}</p>
                  <span className="muted">{new Date(entry.date).toLocaleString()}</span>
                </div>
              )) : <p className="muted">{isSpanish ? "Todavía no hay historial del ciclo de vida." : "No lifecycle history yet."}</p>}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

export function ProjectsPanel({ properties, users, userRole, language = "en", selectedPropertyId, openRecordRequest, openCreateRequest }: Props) {
  const queryClient = useQueryClient();
  const captureInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const captureMapCanvasRef = useRef<HTMLDivElement | null>(null);
  const mapViewCanvasRef = useRef<HTMLDivElement | null>(null);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [propertyId, setPropertyId] = useState(selectedPropertyId || properties[0]?.id || "");
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [selectedMapId, setSelectedMapId] = useState<string>("");
  const [mapRepositionMode, setMapRepositionMode] = useState(false);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [budgetYearFilter, setBudgetYearFilter] = useState("");
  const [deferredFilter, setDeferredFilter] = useState("");
  const [agingFilter, setAgingFilter] = useState("");
  const [quickCreateMode, setQuickCreateMode] = useState<"recommendation" | "project">("project");
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);
  const [captureFiles, setCaptureFiles] = useState<StagedCaptureFile[]>([]);
  const [propertyWalkActive, setPropertyWalkActive] = useState(false);
  const [propertyWalkSummary, setPropertyWalkSummary] = useState<PropertyWalkSummary | null>(null);
  const [propertyWalkStats, setPropertyWalkStats] = useState<PropertyWalkSummary>({ count: 0, highPriority: 0, needsBid: 0 });
  const [lastCreatedRecord, setLastCreatedRecord] = useState<ProjectRecord | null>(null);
  const [lastCaptureOutcome, setLastCaptureOutcome] = useState<CaptureOutcome | null>(null);
  const [queuedCaptures, setQueuedCaptures] = useState<QueuedProjectCaptureSummary[]>([]);
  const [queueSyncing, setQueueSyncing] = useState(false);
  const [projectUploadNotice, setProjectUploadNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState(() => recordDraft(selectedPropertyId || properties[0]?.id || ""));
  const [categoryForm, setCategoryForm] = useState<CategoryDraft>(categoryDraft);
  const canView = userRole !== "CLEANER";
  const canEdit = userRole === "ADMIN" || userRole === "MANAGER" || userRole === "TECH";
  const canAdmin = userRole === "ADMIN";
  const isSpanish = language === "es";
  const isMobileCaptureViewport = isTouchMobileViewport();

  const openQuickCapture = (options?: { launchCamera?: boolean }) => {
    setQuickCaptureOpen(true);
    setPropertyWalkSummary(null);
    if (options?.launchCamera) {
      window.setTimeout(() => captureInputRef.current?.click(), 40);
    }
  };

  useEffect(() => {
    if (!openRecordRequest?.id) return;
    if (openRecordRequest.propertyId) setPropertyId(openRecordRequest.propertyId);
    setSelectedRecordId(openRecordRequest.id);
    setTab("projects");
  }, [openRecordRequest]);

  useEffect(() => {
    if (!openCreateRequest?.propertyId || !canEdit) return;
    setPropertyId(openCreateRequest.propertyId);
    setSelectedRecordId(null);
    setTab(openCreateRequest.recordType === "Project" ? "projects" : "recommendations");
    setQuickCaptureOpen(true);
    setLastCreatedRecord(null);
    setQuickCreateMode(openCreateRequest.recordType === "Project" ? "project" : "recommendation");
    setShowMoreDetails(Boolean(openCreateRequest.building || openCreateRequest.area || openCreateRequest.locationNotes));
    setDraft(() => ({
      ...recordDraft(openCreateRequest.propertyId),
      propertyId: openCreateRequest.propertyId,
      recordType: openCreateRequest.recordType ?? "Recommendation",
      title: openCreateRequest.title ?? "",
      description: openCreateRequest.description ?? "",
      source: (openCreateRequest.source as ProjectSource | undefined) ?? "Other",
      sourceRecordType: openCreateRequest.sourceRecordType ?? "",
      sourceRecordId: openCreateRequest.sourceRecordId ?? "",
      sourceRecordLabel: openCreateRequest.sourceRecordLabel ?? "",
      building: openCreateRequest.building ?? "",
      area: openCreateRequest.area ?? "",
      locationNotes: openCreateRequest.locationNotes ?? "",
      tags: openCreateRequest.tags?.join(", ") ?? "",
      status: openCreateRequest.recordType === "Project" ? "Planning" : "Open",
    }));
  }, [canEdit, openCreateRequest]);

  useEffect(() => {
    setDraft((current) => ({ ...current, propertyId }));
  }, [propertyId]);

  useEffect(() => {
    setDraft((current) => ({
      ...current,
      recordType: quickCreateMode === "recommendation" ? "Recommendation" : "Project",
      status: quickCreateMode === "recommendation" ? "Open" : "Planning",
    }));
  }, [quickCreateMode]);

  useEffect(() => () => {
    captureFiles.forEach((entry) => entry.previewUrl && URL.revokeObjectURL(entry.previewUrl));
  }, [captureFiles]);

  const refreshOfflineQueue = async () => {
    setQueuedCaptures(await listQueuedProjectCaptures());
  };

  const overviewQuery = useQuery({
    queryKey: ["projects", "overview", propertyId],
    queryFn: () => getProjectsOverview(propertyId || undefined),
    enabled: canView && Boolean(propertyId),
  });
  const categoriesQuery = useQuery({
    queryKey: ["projects", "categories", propertyId],
    queryFn: () => getProjectCategories(propertyId || undefined),
    enabled: canView && Boolean(propertyId),
  });
  const categories = categoriesQuery.data?.categories ?? [];
  const categoryOptions = useMemo(() => {
    const byName = new Map<string, ProjectCategory>();
    for (const category of categories) {
      const key = category.name.trim().toLowerCase();
      const existing = byName.get(key);
      if (!existing || (existing.propertyId === null && category.propertyId !== null)) {
        byName.set(key, category);
      }
    }
    return Array.from(byName.values()).sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
      return left.name.localeCompare(right.name);
    });
  }, [categories]);
  const activeCategoryOptions = useMemo(() => categoryOptions.filter((category) => category.isActive), [categoryOptions]);
  const inactiveCategoryOptions = useMemo(() => categoryOptions.filter((category) => !category.isActive), [categoryOptions]);
  const recordsQuery = useQuery({
    queryKey: ["projects", "records", propertyId, tab, search, sourceFilter, budgetYearFilter, deferredFilter, agingFilter],
    queryFn: () => getProjectRecords({
      propertyId: propertyId || undefined,
      recordType: tab === "recommendations" ? "Recommendation" : tab === "projects" ? "Project" : undefined,
      includeArchived: tab === "archive",
      q: search || undefined,
      source: (sourceFilter || undefined) as ProjectSource | undefined,
      budgetYear: budgetYearFilter || undefined,
      deferredMaintenance: deferredFilter ? deferredFilter === "yes" : undefined,
      agingBucket: (agingFilter || undefined) as "0-30" | "31-90" | "91-180" | "180+" | undefined,
    }),
    enabled: canView && Boolean(propertyId) && tab !== "dashboard" && tab !== "reports",
  });
  const mapQuery = useQuery({
    queryKey: ["projects", "map", propertyId],
    queryFn: () => getProjectMapRecords({ propertyId: propertyId || undefined }),
    enabled: canView && Boolean(propertyId) && tab === "map",
  });
  const mapsQuery = useQuery({
    queryKey: ["property-maps", propertyId],
    queryFn: () => getPropertyMaps({ propertyId: propertyId || undefined }),
    enabled: canView && Boolean(propertyId) && (tab === "map" || quickCaptureOpen),
  });
  const detailQuery = useQuery({
    queryKey: ["projects", "record", selectedRecordId],
    queryFn: () => getProjectRecord(selectedRecordId!),
    enabled: Boolean(selectedRecordId),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["projects"] });
    await queryClient.invalidateQueries({ queryKey: ["my-work"] });
  };

  const resetQuickCapture = (nextPropertyId = propertyId) => {
    setCaptureFiles((current) => {
      current.forEach((entry) => entry.previewUrl && URL.revokeObjectURL(entry.previewUrl));
      return [];
    });
    setDraft(recordDraft(nextPropertyId));
    setQuickCreateMode("recommendation");
    setShowMoreDetails(false);
    setLastCreatedRecord(null);
    setLastCaptureOutcome(null);
    setProjectUploadNotice(null);
  };

  const appendCaptureFiles = async (files: FileList | File[]) => {
    const incoming = Array.from(files);
    if (!incoming.length) return;
    const accepted = incoming.filter((file) => isAllowedProjectAttachment(file, "GENERAL"));
    const rejected = incoming.filter((file) => !isAllowedProjectAttachment(file, "GENERAL"));
    if (rejected.length) {
      setProjectUploadNotice(
        isSpanish
          ? `${rejected.length} archivo${rejected.length === 1 ? "" : "s"} se omitieron porque no son fotos válidas o estaban vacíos.`
          : `${rejected.length} file${rejected.length === 1 ? "" : "s"} were skipped because they were not valid photos or were empty.`,
      );
    } else {
      setProjectUploadNotice(null);
    }
    if (!accepted.length) return;
    const stagedEntries = await Promise.all(accepted.map(async (file, index) => ({
      id: `${file.name}-${file.lastModified}-${Date.now()}-${index}`,
      file,
      previewUrl: await buildImagePreviewUrl(file),
    })));
    setCaptureFiles((current) => [
      ...current,
      ...stagedEntries,
    ]);
  };

  const removeCaptureFile = (id: string) => {
    setCaptureFiles((current) => current.filter((entry) => {
      if (entry.id === id && entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
      return entry.id !== id;
    }));
  };

  const handleCaptureDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    void appendCaptureFiles(event.dataTransfer.files);
  };

  const createMutation = useMutation({
    mutationFn: createProjectRecord,
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ProjectRecord> }) => updateProjectRecord(id, patch),
    onSuccess: invalidate,
  });
  const convertMutation = useMutation({
    mutationFn: convertProjectRecommendation,
    onSuccess: invalidate,
  });
  const commentMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => createProjectComment(id, { body }),
    onSuccess: invalidate,
  });
  const taskCreateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: { title: string; status?: ProjectTaskStatus; assignedUserId?: string | null; dueDate?: string | null } }) => createProjectTask(id, input),
    onSuccess: invalidate,
  });
  const taskUpdateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { status?: ProjectTaskStatus; assignedUserId?: string | null; dueDate?: string | null; completedDate?: string | null } }) => updateProjectTask(id, patch),
    onSuccess: invalidate,
  });
  const categoryCreateMutation = useMutation({
    mutationFn: createProjectCategory,
    onSuccess: invalidate,
  });
  const categoryUpdateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; color?: string | null; isActive?: boolean; sortOrder?: number; propertyId?: string | null } }) => updateProjectCategory(id, patch),
    onSuccess: invalidate,
  });
  const uploadMutation = useMutation({
    mutationFn: ({ id, file, attachmentType, caption }: { id: string; file: File; attachmentType: ProjectAttachmentType; caption?: string }) => uploadProjectAttachment(id, file, attachmentType, caption),
    onSuccess: invalidate,
  });
  const attachmentUpdateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { attachmentType?: ProjectAttachmentType; caption?: string | null } }) => updateProjectAttachment(id, patch),
    onSuccess: invalidate,
  });

  const selectedRecord = detailQuery.data?.record;
  const records = recordsQuery.data?.records ?? [];
  const visibleRecords = useMemo(() => {
    if (tab !== "bids") return records;
    return records.filter((record) =>
      record.status === "Needs Bid"
      || record.status === "Got Bid"
      || (record.bidStatus !== null && record.bidStatus !== "Not Applicable")
      || Boolean(record.companyName)
      || record.attachments.some((attachment) => attachment.attachmentType === "BID"));
  }, [records, tab]);
  const pinnedRecords = mapQuery.data?.records ?? [];
  const filteredPinnedRecords = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return pinnedRecords.filter((record) => {
      if (sourceFilter && (record.source ?? "") !== sourceFilter) return false;
      if (budgetYearFilter && (record.budgetYear ?? "") !== budgetYearFilter) return false;
      if (deferredFilter && record.deferredMaintenance !== (deferredFilter === "yes")) return false;
      if (agingFilter && (record.agingBucket ?? "") !== agingFilter) return false;
      if (!normalizedSearch) return true;
      const haystack = [
        record.title,
        record.description,
        record.source,
        record.status,
        record.priority,
        record.categoryName,
        record.building,
        record.area,
        record.locationNotes,
        record.budgetYear,
        record.deferredReason,
        record.deferredNotes,
        record.companyName,
        record.assignedUserName,
        record.assignedRole,
        ...(record.tags ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [agingFilter, budgetYearFilter, deferredFilter, pinnedRecords, search, sourceFilter]);
  const maps = mapsQuery.data?.maps ?? [];
  const userOptions = useMemo<SearchSelectOption[]>(() => users.map((user) => ({
    value: user.id,
    label: `${user.fullName} / ${user.role}`,
    keywords: [user.fullName, user.role],
  })), [users]);
  const mapsById = useMemo(() => new Map(maps.map((map) => [map.id, map])), [maps]);
  const selectedCaptureMap = maps.find((map) => map.id === draft.propertyMapId) ?? null;
  const captureMapImagePreview = selectedCaptureMap?.mimeType?.startsWith("image/");
  const pinnedMapIds = useMemo(() => Array.from(new Set(filteredPinnedRecords.map((record) => record.propertyMapId).filter(Boolean))) as string[], [filteredPinnedRecords]);
  const selectedProjectsMap = maps.find((map) => map.id === selectedMapId) ?? null;
  const selectedProjectsMapHasImage = selectedProjectsMap?.mimeType?.startsWith("image/");
  const mapCandidateRecords = useMemo(() => visibleRecords.filter((record) => !record.isArchived), [visibleRecords]);
  const selectedMapRecords = useMemo(() => {
    return filteredPinnedRecords
      .filter((record) => record.propertyMapId === selectedMapId)
      .sort((left, right) => {
        if (left.priority !== right.priority) {
          const order = { Critical: 4, High: 3, Normal: 2, Low: 1 };
          return (order[right.priority] ?? 0) - (order[left.priority] ?? 0);
        }
        return left.title.localeCompare(right.title);
      });
  }, [filteredPinnedRecords, selectedMapId]);
  const selectedWorkspaceMapRecord = mapCandidateRecords.find((record) => record.id === selectedRecordId) ?? selectedMapRecords[0] ?? mapCandidateRecords[0] ?? null;
  const selectedMapRecord = selectedWorkspaceMapRecord && selectedWorkspaceMapRecord.propertyMapId === selectedMapId && selectedWorkspaceMapRecord.pinX !== null && selectedWorkspaceMapRecord.pinY !== null
    ? selectedWorkspaceMapRecord
    : null;
  const availableMapRecords = useMemo(() => {
    return mapCandidateRecords
      .filter((record) => record.id !== selectedMapRecord?.id)
      .filter((record) => record.propertyMapId !== selectedMapId || record.pinX === null || record.pinY === null)
      .sort((left, right) => {
        if (left.priority !== right.priority) {
          const order = { Critical: 4, High: 3, Normal: 2, Low: 1 };
          return (order[right.priority] ?? 0) - (order[left.priority] ?? 0);
        }
        return left.title.localeCompare(right.title);
      });
  }, [mapCandidateRecords, selectedMapId, selectedMapRecord?.id]);
  const projectSearchPlaceholder = tab === "bids"
    ? "Vendor, bid notes, contact, budget year, tags"
    : tab === "map"
      ? "Title, building, area, source, tags"
      : "Source, budget year, deferred notes, costs, tags";

  const capturePercentFromPointer = (event: MouseEvent<HTMLDivElement>) => {
    const box = captureMapCanvasRef.current?.getBoundingClientRect();
    if (!box) return null;
    return {
      xPercent: Math.max(0, Math.min(100, ((event.clientX - box.left) / box.width) * 100)),
      yPercent: Math.max(0, Math.min(100, ((event.clientY - box.top) / box.height) * 100)),
    };
  };

  const mapPercentFromPointer = (event: MouseEvent<HTMLDivElement>) => {
    const box = mapViewCanvasRef.current?.getBoundingClientRect();
    if (!box) return null;
    return {
      xPercent: Math.max(0, Math.min(100, ((event.clientX - box.left) / box.width) * 100)),
      yPercent: Math.max(0, Math.min(100, ((event.clientY - box.top) / box.height) * 100)),
    };
  };

  useEffect(() => {
    void refreshOfflineQueue();
  }, []);

  const syncQueuedCaptures = async () => {
    if (queueSyncing || typeof navigator !== "undefined" && !navigator.onLine) {
      return;
    }
    setQueueSyncing(true);
    try {
      await syncOfflineJobs();
      await invalidate();
      await refreshOfflineQueue();
    } finally {
      setQueueSyncing(false);
    }
  };

  useEffect(() => {
    const syncOnOnline = () => {
      void syncQueuedCaptures();
    };
    window.addEventListener("online", syncOnOnline);
    return () => window.removeEventListener("online", syncOnOnline);
  }, [queueSyncing]);

  useEffect(() => {
    if (!queuedCaptures.length || (typeof navigator !== "undefined" && !navigator.onLine)) return;
    void syncQueuedCaptures();
  }, [queuedCaptures.length]);

  useEffect(() => {
    const preferredMapId = selectedMapId && mapsById.has(selectedMapId) ? selectedMapId : "";
    if (preferredMapId) return;
    const defaultMap = maps.find((map) => map.isDefault && pinnedMapIds.includes(map.id))
      ?? maps.find((map) => pinnedMapIds.includes(map.id))
      ?? maps.find((map) => map.isDefault)
      ?? maps[0]
      ?? null;
    setSelectedMapId(defaultMap?.id ?? "");
  }, [selectedMapId, pinnedMapIds.join(","), maps, mapsById]);

  useEffect(() => {
    if (selectedWorkspaceMapRecord && selectedRecordId !== selectedWorkspaceMapRecord.id) {
      setSelectedRecordId(selectedWorkspaceMapRecord.id);
    }
  }, [selectedWorkspaceMapRecord?.id, selectedRecordId]);

  useEffect(() => {
    setMapRepositionMode(false);
  }, [selectedMapId, selectedRecordId]);

  const saveQuickCapture = async () => {
    const generatedTitle = draft.title.trim() || buildAutoProjectTitle(draft, categoryOptions);
    if (!propertyId || !hasQuickCaptureContent(draft, captureFiles)) return;
    const recordInput = {
      propertyId,
      recordType: draft.recordType,
      title: generatedTitle,
      description: draft.description.trim() || null,
      source: draft.source,
      sourceRecordType: draft.sourceRecordType || null,
      sourceRecordId: draft.sourceRecordId || null,
      sourceRecordLabel: draft.sourceRecordLabel || null,
      status: draft.status,
      priority: draft.priority,
      executionType: draft.executionType,
      categoryId: draft.categoryId || null,
      building: draft.building || null,
      area: draft.area || null,
      locationNotes: draft.locationNotes || null,
      propertyMapId: draft.propertyMapId || null,
      pinX: draft.pinX ? Number(draft.pinX) : null,
      pinY: draft.pinY ? Number(draft.pinY) : null,
      estimatedQuantity: draft.estimatedQuantity ? Number(draft.estimatedQuantity) : null,
      quantityUnit: draft.quantityUnit || null,
      estimatedCost: draft.estimatedCost ? Number(draft.estimatedCost) : null,
      actualCost: draft.actualCost ? Number(draft.actualCost) : null,
      totalAmount: draft.totalAmount ? Number(draft.totalAmount) : null,
      deferredMaintenance: draft.deferredMaintenance,
      deferredReason: draft.deferredReason || null,
      targetYear: draft.targetYear ? Number(draft.targetYear) : null,
      deferredNotes: draft.deferredNotes || null,
      budgetYear: draft.budgetYear || null,
      companyName: draft.companyName || null,
      assignedUserId: draft.assignedUserId || null,
      assignedRole: draft.assignedRole ? draft.assignedRole as UserRole : null,
      scheduledDate: draft.scheduledDate || null,
      dueDate: draft.dueDate || null,
      tags: draft.tags.split(",").map((entry) => entry.trim()).filter(Boolean),
    };
    const stagedFiles = captureFiles.map((entry) => entry.file);
    const clearCaptureDraft = () => {
      setCaptureFiles((current) => {
        current.forEach((entry) => entry.previewUrl && URL.revokeObjectURL(entry.previewUrl));
        return [];
      });
      setDraft(recordDraft(propertyId));
      setQuickCreateMode("recommendation");
      setShowMoreDetails(false);
    };
    const registerCapture = () => {
      if (!propertyWalkActive) return;
      setPropertyWalkStats((current) => ({
        count: current.count + 1,
        highPriority: current.highPriority + (draft.priority === "High" || draft.priority === "Critical" ? 1 : 0),
        needsBid: current.needsBid + (draft.status === "Needs Bid" ? 1 : 0),
      }));
    };
    const queueFullCapture = async (reason: "offline" | "retry") => {
      const queued = await enqueueProjectCapture({
        recordInput,
        files: stagedFiles,
        attachmentType: "GENERAL",
      });
      setLastCreatedRecord(null);
      setLastCaptureOutcome({ mode: "queued", title: queued.title, fileCount: queued.fileCount, reason });
      registerCapture();
      clearCaptureDraft();
      await refreshOfflineQueue();
    };

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      await queueFullCapture("offline");
      return;
    }

    let record: ProjectRecord;
    try {
      const result = await createMutation.mutateAsync(recordInput);
      record = result.record;
    } catch (error) {
      if (isApiError(error) && error.status === 0) {
        await queueFullCapture("retry");
        return;
      }
      throw error;
    }

    let nextUploadIndex = 0;
    try {
      for (; nextUploadIndex < captureFiles.length; nextUploadIndex += 1) {
        const staged = captureFiles[nextUploadIndex];
        await uploadMutation.mutateAsync({ id: record.id, file: staged.file, attachmentType: "GENERAL", caption: "" });
      }
      setLastCaptureOutcome({ mode: "saved", record });
    } catch (error) {
      if (isApiError(error) && error.status === 0) {
        const pendingFiles = captureFiles.slice(nextUploadIndex).map((entry) => ({ file: entry.file, attachmentType: "GENERAL" as ProjectAttachmentType, caption: "" }));
        await enqueueProjectAttachmentUpload({
          propertyId: record.propertyId,
          recordId: record.id,
          recordTitle: record.title,
          files: pendingFiles,
        });
        setLastCaptureOutcome({ mode: "saved-with-pending-uploads", record, fileCount: pendingFiles.length });
        await refreshOfflineQueue();
      } else {
        throw error;
      }
    }
    setSelectedRecordId(record.id);
    setLastCreatedRecord(record);
    registerCapture();
    clearCaptureDraft();
  };

  const moveSelectedMapRecord = async (event: MouseEvent<HTMLDivElement>) => {
    if (!mapRepositionMode || !selectedWorkspaceMapRecord || !selectedMapId) return;
    const point = mapPercentFromPointer(event);
    if (!point) return;
    await updateMutation.mutateAsync({
      id: selectedWorkspaceMapRecord.id,
      patch: {
        propertyMapId: selectedMapId,
        pinX: Number(point.xPercent.toFixed(1)),
        pinY: Number(point.yPercent.toFixed(1)),
      },
    });
    setMapRepositionMode(false);
  };

  if (!canView) {
    return <StatusState title="Projects unavailable" description="This role does not have access to the Projects workspace." tone="error" />;
  }
  if (!properties.length) {
    return <StatusState title="No properties available" description="Assign at least one property before using Projects." />;
  }

  return (
    <section className="pool-panel module-panel projects-panel" data-testid="projects-panel">
      <div className="module-heading">
        <div>
          <span className="eyebrow">Projects</span>
          <h1>Projects</h1>
          <p>Track recommendations, approved projects, bids, photos, location notes, and assigned work.</p>
        </div>
        <div className="module-actions">
          {canEdit ? (
            <button
              data-testid="projects-quick-capture-open"
              className="button button-primary"
              type="button"
              onClick={() => openQuickCapture({ launchCamera: isMobileCaptureViewport })}
            >
              {isMobileCaptureViewport ? (isSpanish ? "Tomar foto" : "Take Photo") : "Quick Capture"}
            </button>
          ) : null}
          {canEdit && !propertyWalkActive ? <button className="button button-secondary" type="button" onClick={() => { setPropertyWalkActive(true); setPropertyWalkStats({ count: 0, highPriority: 0, needsBid: 0 }); openQuickCapture({ launchCamera: isMobileCaptureViewport }); }}>{isSpanish ? "Iniciar recorrido" : "Start Property Walk"}</button> : null}
          {canEdit && propertyWalkActive ? <button className="button button-secondary" type="button" onClick={() => { setPropertyWalkActive(false); setPropertyWalkSummary(propertyWalkStats); }}>End Walk</button> : null}
          <label>Property
            <select value={propertyId} onChange={(event) => setPropertyId(event.target.value)}>
              {properties.map((property) => <option key={property.id} value={property.id}>{property.code} - {property.name}</option>)}
            </select>
          </label>
        </div>
      </div>

      {propertyWalkActive ? (
        <div className="pool-card projects-walk-banner">
          <strong>Property Walk Active</strong>
          <span>{propertyWalkStats.count} captured</span>
          <span>{propertyWalkStats.highPriority} high priority</span>
          <span>{propertyWalkStats.needsBid} need bid</span>
        </div>
      ) : null}

      {propertyWalkSummary ? (
        <div className="pool-card projects-walk-banner">
          <strong>Property Walk Summary</strong>
          <span>{propertyWalkSummary.count} Recommendations Created</span>
          <span>{propertyWalkSummary.highPriority} High Priority</span>
          <span>{propertyWalkSummary.needsBid} Need Bid</span>
          <button className="button button-secondary" type="button" onClick={() => setPropertyWalkSummary(null)}>Dismiss</button>
        </div>
      ) : null}

      {queuedCaptures.length ? (
        <div className="pool-card projects-sync-banner">
          <div className="projects-sync-copy">
            <strong>{queuedCaptures.length} offline project {queuedCaptures.length === 1 ? "capture" : "captures"} pending sync</strong>
            <span className="muted">
              {queuedCaptures[0].title}
              {queuedCaptures.length > 1 ? ` and ${queuedCaptures.length - 1} more` : ""}
              {" "}
              are stored in this browser until the API is reachable.
            </span>
          </div>
          <div className="pool-entry-actions">
            <button className="button button-secondary" type="button" onClick={() => void refreshOfflineQueue()} disabled={queueSyncing}>Refresh Queue</button>
            <button className="button button-primary" type="button" onClick={() => void syncQueuedCaptures()} disabled={queueSyncing || (typeof navigator !== "undefined" && !navigator.onLine)}>
              {queueSyncing ? "Syncing..." : "Sync Now"}
            </button>
          </div>
        </div>
      ) : null}

      {projectUploadNotice ? (
        <div className="pool-card">
          <p className="muted" style={{ margin: 0 }}>{projectUploadNotice}</p>
        </div>
      ) : null}

      <div className="module-tabs">
        {(["dashboard", "projects", "recommendations", "map", "bids", "archive", "reports"] as Tab[]).map((entry) => (
          <button key={entry} className={tab === entry ? "active" : undefined} type="button" onClick={() => setTab(entry)}>
            {entry === "bids" ? "Bids / Quotes" : entry === "map" ? "Map View" : entry[0].toUpperCase() + entry.slice(1)}
          </button>
        ))}
      </div>

      {tab === "dashboard" ? (
        overviewQuery.isLoading ? <StatusState title="Loading Projects" description="Gathering dashboard counts and recent project activity." /> : overviewQuery.isError || !overviewQuery.data ? <StatusState title="Projects failed to load" description="Refresh the workspace and try again." tone="error" /> : (
          <div className="pool-kpi-grid">
            {Object.entries(overviewQuery.data.summary).map(([key, value]) => (
              <article key={key} className={`pool-kpi ${key === "deferredMaintenance" || key === "overdue" ? "warning" : key === "actualCompletedCostThisYear" ? "" : ""}`}>
                <strong>{typeof value === "number" && (key.toLowerCase().includes("value") || key.toLowerCase().includes("cost")) ? formatCurrency(value) : value}</strong>
                <span>{key.replace(/([A-Z])/g, " $1")}</span>
              </article>
            ))}
          </div>
        )
      ) : null}

      {tab === "dashboard" && !overviewQuery.isLoading && !overviewQuery.isError && overviewQuery.data ? (
        <div className="pool-grid projects-dashboard-grid">
          <div className="pool-card">
            <h2>High Priority</h2>
            {overviewQuery.data.highPriorityItems.length ? overviewQuery.data.highPriorityItems.slice(0, 5).map((record) => <button key={record.id} className="link-button" type="button" onClick={() => { setSelectedRecordId(record.id); setTab(record.recordType === "Recommendation" ? "recommendations" : "projects"); }}>{record.title}</button>) : <p className="muted">No high-priority items.</p>}
          </div>
          <div className="pool-card">
            <h2>Upcoming Scheduled</h2>
            {overviewQuery.data.upcomingScheduledProjects.length ? overviewQuery.data.upcomingScheduledProjects.slice(0, 5).map((record) => <button key={record.id} className="link-button" type="button" onClick={() => { setSelectedRecordId(record.id); setTab(record.recordType === "Recommendation" ? "recommendations" : "projects"); }}>{record.title}</button>) : <p className="muted">No upcoming scheduled projects.</p>}
          </div>
          <div className="pool-card">
            <h2>Recommendations By Age</h2>
            {overviewQuery.data.recommendationsByAge.map((entry) => <div key={entry.label} className="pool-row"><strong>{entry.label}</strong><span>{entry.value}</span></div>)}
          </div>
          <div className="pool-card">
            <h2>Projects By Budget Year</h2>
            {overviewQuery.data.projectsByBudgetYear.length ? overviewQuery.data.projectsByBudgetYear.map((entry) => <div key={entry.label} className="pool-row"><strong>{entry.label}</strong><span>{entry.value}</span></div>) : <p className="muted">No budget-year assignments yet.</p>}
          </div>
          <div className="pool-card">
            <h2>Projects By Source</h2>
            {overviewQuery.data.projectsBySource.length ? overviewQuery.data.projectsBySource.slice(0, 8).map((entry) => <div key={entry.label} className="pool-row"><strong>{entry.label}</strong><span>{entry.value}</span></div>) : <p className="muted">No source-tagged projects yet.</p>}
          </div>
          <div className="pool-card">
            <h2>Recently Updated</h2>
            {overviewQuery.data.recentActivity.length ? overviewQuery.data.recentActivity.slice(0, 5).map((record) => <button key={record.id} className="link-button" type="button" onClick={() => { setSelectedRecordId(record.id); setTab(record.recordType === "Recommendation" ? "recommendations" : "projects"); }}>{record.title}</button>) : <p className="muted">No recent updates yet.</p>}
          </div>
          <div className="pool-card">
            <h2>Recently Added Photos</h2>
            {overviewQuery.data.recentPhotoActivity.length ? overviewQuery.data.recentPhotoActivity.slice(0, 4).map((record) => <button key={record.id} className="link-button" type="button" onClick={() => { setSelectedRecordId(record.id); setTab(record.recordType === "Recommendation" ? "recommendations" : "projects"); }}>{record.title}</button>) : <p className="muted">No project photos uploaded yet.</p>}
          </div>
        </div>
      ) : null}

      {canEdit && quickCaptureOpen ? (
        <section className="pool-card projects-capture-card">
          <div className="drawer-section-title">
            <div>
              <h2>Quick Capture</h2>
              <p className="muted">Take photos first, add a short note, choose project or recommendation, and save.</p>
            </div>
            <div className="pool-entry-actions">
              <button className="button button-secondary" type="button" onClick={() => setQuickCaptureOpen(false)}>Close</button>
            </div>
          </div>
          {lastCaptureOutcome?.mode === "queued" ? (
            <div className="projects-capture-success">
              <strong>{lastCaptureOutcome.title} queued for sync.</strong>
              <p className="muted">
                {lastCaptureOutcome.fileCount} {isSpanish ? `archivo${lastCaptureOutcome.fileCount === 1 ? "" : "s"}` : `file${lastCaptureOutcome.fileCount === 1 ? "" : "s"}`} {isSpanish ? "guardado localmente porque la app estaba" : "saved locally because the app was"} {lastCaptureOutcome.reason === "offline" ? (isSpanish ? "sin conexión" : "offline") : (isSpanish ? "sin poder comunicarse con la API" : "unable to reach the API")}.
              </p>
              <div className="pool-entry-actions">
                <button className="button button-primary" type="button" onClick={() => resetQuickCapture(propertyId)}>{isSpanish ? "Agregar otro" : "Add Another"}</button>
                <button className="button button-secondary" type="button" onClick={() => { setQuickCaptureOpen(false); setTab("projects"); }}>{isSpanish ? "Ir a proyectos" : "Go To Projects"}</button>
              </div>
            </div>
          ) : lastCreatedRecord ? (
            <div className="projects-capture-success">
              <strong>{lastCreatedRecord.title} {isSpanish ? "guardado." : "saved."}</strong>
              {lastCaptureOutcome?.mode === "saved-with-pending-uploads" ? <p className="muted">{lastCaptureOutcome.fileCount} {isSpanish ? `archivo${lastCaptureOutcome.fileCount === 1 ? "" : "s"} de foto terminará${lastCaptureOutcome.fileCount === 1 ? "" : "n"} de subirse cuando vuelva la conexión.` : `photo file${lastCaptureOutcome.fileCount === 1 ? "" : "s"} will finish uploading after connection returns.`}</p> : null}
              <div className="pool-entry-actions">
                <button className="button button-primary" type="button" onClick={() => { setSelectedRecordId(lastCreatedRecord.id); setTab(lastCreatedRecord.recordType === "Recommendation" ? "recommendations" : "projects"); }}>{isSpanish ? "Ver registro" : "View Record"}</button>
                <button className="button button-secondary" type="button" onClick={() => resetQuickCapture(propertyId)}>{isSpanish ? "Agregar otro" : "Add Another"}</button>
                <button className="button button-secondary" type="button" onClick={() => { setQuickCaptureOpen(false); setTab("projects"); }}>{isSpanish ? "Ir a proyectos" : "Go To Projects"}</button>
              </div>
            </div>
          ) : (
            <form data-testid="projects-quick-capture-form" className="pool-form" onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void saveQuickCapture();
            }}>
              <div className="pool-entry-actions projects-capture-actions-top" style={{ marginBottom: 12, flexWrap: "wrap" }}>
                <button className="button button-primary" type="button" onClick={() => captureInputRef.current?.click()}>{isSpanish ? "Tomar foto" : "Take Photo"}</button>
                <button className="button button-secondary" type="button" onClick={() => uploadInputRef.current?.click()}>{isSpanish ? "Subir archivo" : "Upload File"}</button>
              </div>
              <div className="projects-capture-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={handleCaptureDrop}>
                <input
                  ref={captureInputRef}
                  hidden
                  type="file"
                  multiple
                  accept="image/*"
                  capture="environment"
                  onChange={(event) => {
                    void appendCaptureFiles(event.target.files ?? []);
                    event.currentTarget.value = "";
                  }}
                />
                <input
                  ref={uploadInputRef}
                  hidden
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                  onChange={(event) => {
                    void appendCaptureFiles(event.target.files ?? []);
                    event.currentTarget.value = "";
                  }}
                />
                <strong>{isSpanish ? "Fotos primero" : "Photos first"}</strong>
                <p className="muted">{isSpanish ? "Tome una foto, cargue desde escritorio o arrastre archivos aquí." : "Take a photo, upload from desktop, or drag files here."}</p>
                <div className="pool-entry-actions">
                  <button className="button button-secondary" type="button" onClick={() => captureInputRef.current?.click()}>{isSpanish ? "Agregar más fotos" : "Add More Photos"}</button>
                </div>
              </div>
              {captureFiles.length ? (
                <div className="projects-capture-preview-grid">
                  {captureFiles.map((entry) => (
                    <article key={entry.id} className="projects-capture-preview">
                      {entry.previewUrl ? <img loading="lazy" decoding="async" src={entry.previewUrl} alt={entry.file.name} /> : <div className="projects-photo-file">FILE</div>}
                      <div className="projects-photo-meta">
                        <strong>{entry.file.name}</strong>
                        <span>{Math.round(entry.file.size / 1024)} KB</span>
                        <button className="link-button" type="button" onClick={() => removeCaptureFile(entry.id)}>{isSpanish ? "Quitar" : "Remove"}</button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}
              <div className="form-grid projects-capture-grid">
                <label>{isSpanish ? "Título corto" : "Short title"}<input data-testid="projects-quick-capture-title" value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder={isSpanish ? "Bisagra de portón frontal" : "Front gate hinge"} /></label>
                <label>{isSpanish ? "Recomendación / Proyecto" : "Recommendation / Project"}
                  <select value={draft.recordType} onChange={(event) => {
                    const nextType = event.target.value as ProjectRecordType;
                    setDraft((current) => ({ ...current, recordType: nextType, status: nextType === "Recommendation" ? "Open" : "Planning" }));
                  }}>
                    <option value="Recommendation">{isSpanish ? "Recomendación" : "Recommendation"}</option>
                    <option value="Project">{isSpanish ? "Proyecto" : "Project"}</option>
                  </select>
                </label>
                <label>{isSpanish ? "Propiedad" : "Property"}
                  <select value={propertyId} onChange={(event) => setPropertyId(event.target.value)}>
                    {properties.map((property) => <option key={property.id} value={property.id}>{property.code} - {property.name}</option>)}
                  </select>
                </label>
                <label>{isSpanish ? "Categoría" : "Category"}
                  <select value={draft.categoryId} onChange={(event) => setDraft((current) => ({ ...current, categoryId: event.target.value }))}>
                    <option value="">{isSpanish ? "Sin categoría" : "Uncategorized"}</option>
                    {categoryOptions.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </select>
                </label>
              </div>
              <label>{isSpanish ? "Descripción corta" : "Short description"}<textarea data-testid="projects-quick-capture-description" value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder={isSpanish ? "Concreto suelto en la banqueta del Edificio 4. Riesgo de tropiezo." : "Loose concrete at Building 4 sidewalk. Trip hazard."} /></label>
              <div className="pool-entry-actions">
                <button data-testid="projects-quick-capture-save" className="button button-primary" type="submit" disabled={!hasQuickCaptureContent(draft, captureFiles) || createMutation.isPending || uploadMutation.isPending}>{isSpanish ? "Guardar" : "Save"}</button>
              </div>
              <details open={showMoreDetails} onToggle={(event) => setShowMoreDetails((event.currentTarget as HTMLDetailsElement).open)}>
                <summary>{isSpanish ? "Más detalles" : "More Details"}</summary>
                <div className="form-grid projects-advanced-grid">
                  <label>{isSpanish ? "Prioridad" : "Priority"}<select value={draft.priority} onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value as ProjectPriority }))}>{["Low", "Normal", "High", "Critical"].map((priority) => <option key={priority} value={priority}>{isSpanish ? ({ Low: "Baja", Normal: "Normal", High: "Alta", Critical: "Crítica" } as const)[priority] : priority}</option>)}</select></label>
                  <label>{isSpanish ? "Estado" : "Status"}<input value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))} /></label>
                  <label>{isSpanish ? "Edificio" : "Building"}<input value={draft.building} onChange={(event) => setDraft((current) => ({ ...current, building: event.target.value }))} /></label>
                  <label>{isSpanish ? "Área" : "Area"}<input value={draft.area} onChange={(event) => setDraft((current) => ({ ...current, area: event.target.value }))} /></label>
                  <label>{isSpanish ? "Notas de ubicación" : "Location notes"}<textarea value={draft.locationNotes} onChange={(event) => setDraft((current) => ({ ...current, locationNotes: event.target.value }))} /></label>
                  <label>{isSpanish ? "Mapa" : "Map"}
                    <select value={draft.propertyMapId} onChange={(event) => setDraft((current) => ({ ...current, propertyMapId: event.target.value }))}>
                      <option value="">{isSpanish ? "Sin pin de mapa" : "No map pin"}</option>
                      {maps.map((map) => <option key={map.id} value={map.id}>{map.name}</option>)}
                    </select>
                  </label>
                  {selectedCaptureMap ? (
                    <div className="projects-capture-map-picker">
                      <div className="projects-capture-map-copy">
                        <strong>{isSpanish ? "Colocar pin en el mapa" : "Drop pin on map"}</strong>
                        <span className="muted">{isSpanish ? "Haga clic en el mapa para ubicar este hallazgo. El pin es opcional." : "Click the map to place this finding. Map pin is optional."}</span>
                      </div>
                      <div
                        ref={captureMapCanvasRef}
                        className={`projects-capture-map-canvas ${captureMapImagePreview ? "" : "no-preview"}`}
                        onClick={(event) => {
                          const point = capturePercentFromPointer(event);
                          if (!point) return;
                          setDraft((current) => ({
                            ...current,
                            pinX: point.xPercent.toFixed(1),
                            pinY: point.yPercent.toFixed(1),
                          }));
                        }}
                      >
                        {captureMapImagePreview ? <img src={propertyMapFileUrl(selectedCaptureMap.id)} alt={`${selectedCaptureMap.name} map`} /> : (
                          <div className="map-placeholder">
                            <strong>{isSpanish ? "Vista previa del mapa no disponible" : "Map preview unavailable"}</strong>
                            <span>{selectedCaptureMap.mimeType === "application/pdf" ? (isSpanish ? "Los mapas PDF aún pueden recibir un pin en este lienzo neutro." : "PDF maps can still receive a pin on this neutral canvas.") : (isSpanish ? "Suba un mapa PNG, JPG o WebP para colocar el pin visualmente." : "Upload a PNG, JPG, or WebP map for visual pin placement.")}</span>
                          </div>
                        )}
                        {draft.pinX && draft.pinY ? (
                          <button
                            type="button"
                            className="projects-capture-pin"
                            style={{ left: `${draft.pinX}%`, top: `${draft.pinY}%` }}
                            aria-label={isSpanish ? "Pin de captura" : "Capture pin"}
                            onClick={(event) => event.preventDefault()}
                          />
                        ) : null}
                      </div>
                      <div className="pool-entry-actions">
                        <span className="muted">{draft.pinX && draft.pinY ? (isSpanish ? `Pin colocado en ${draft.pinX}%, ${draft.pinY}%` : `Pinned at ${draft.pinX}%, ${draft.pinY}%`) : (isSpanish ? "Sin pin" : "No pin set")}</span>
                        {draft.pinX && draft.pinY ? <button className="button button-secondary" type="button" onClick={() => setDraft((current) => ({ ...current, pinX: "", pinY: "" }))}>{isSpanish ? "Quitar pin" : "Clear Pin"}</button> : null}
                        {selectedCaptureMap.mimeType === "application/pdf" ? <a className="button button-secondary" href={propertyMapFileUrl(selectedCaptureMap.id)} target="_blank" rel="noreferrer">{isSpanish ? "Abrir mapa PDF" : "Open PDF Map"}</a> : null}
                      </div>
                    </div>
                  ) : null}
                  <label>{isSpanish ? "Ejecución" : "Execution"}<select value={draft.executionType} onChange={(event) => setDraft((current) => ({ ...current, executionType: event.target.value as ProjectExecutionType }))}>{["In-House", "Vendor", "Hybrid", "Undecided"].map((value) => <option key={value} value={value}>{isSpanish ? ({ "In-House": "Interno", Vendor: "Proveedor", Hybrid: "Híbrido", Undecided: "Sin definir" } as const)[value] : value}</option>)}</select></label>
                  <label>{isSpanish ? "Usuario asignado" : "Assigned user"}
                    <SearchSelect
                      options={userOptions}
                      value={draft.assignedUserId}
                      onChange={(assignedUserId) => setDraft((current) => ({ ...current, assignedUserId }))}
                      placeholder={isSpanish ? "Buscar usuario..." : "Search user..."}
                      emptyLabel={isSpanish ? "Sin asignar" : "Unassigned"}
                      noMatchesLabel={isSpanish ? "No hay usuarios coincidentes" : "No matching users"}
                      clearLabel={isSpanish ? "Quitar usuario asignado" : "Clear assigned user"}
                    />
                  </label>
                  <label>{isSpanish ? "Compañía" : "Company"}<input value={draft.companyName} onChange={(event) => setDraft((current) => ({ ...current, companyName: event.target.value }))} /></label>
                  <label>{isSpanish ? "Fecha programada" : "Scheduled date"}<input type="date" value={draft.scheduledDate} onChange={(event) => setDraft((current) => ({ ...current, scheduledDate: event.target.value }))} /></label>
                  <label>{isSpanish ? "Fecha límite" : "Due date"}<input type="date" value={draft.dueDate} onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))} /></label>
                  <label>{isSpanish ? "Año de presupuesto" : "Budget year"}
                    <select value={draft.budgetYear} onChange={(event) => setDraft((current) => ({ ...current, budgetYear: event.target.value }))}>
                      <option value="">{isSpanish ? "Ninguno" : "None"}</option>
                      {budgetYearOptions.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                    </select>
                  </label>
                  <label>{isSpanish ? "Costo estimado" : "Estimated cost"}<input type="number" value={draft.estimatedCost} onChange={(event) => setDraft((current) => ({ ...current, estimatedCost: event.target.value }))} /></label>
                  <label>{isSpanish ? "Etiquetas" : "Tags"}<input value={draft.tags} onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))} placeholder={isSpanish ? "etiquetas, separadas, por comas" : "comma, separated, tags"} /></label>
                  <label className="compact-toggle">{isSpanish ? "Mantenimiento diferido" : "Deferred maintenance"}
                    <input type="checkbox" checked={draft.deferredMaintenance} onChange={(event) => setDraft((current) => ({ ...current, deferredMaintenance: event.target.checked }))} />
                  </label>
                </div>
              </details>
            </form>
          )}
        </section>
      ) : null}
      {tab === "reports" ? (
        <div className="pool-grid projects-report-grid">
          <div className="pool-card">
            <h2>{isSpanish ? "Reportes / Exportaciones" : "Reports / Exports"}</h2>
            <div className="pool-entry-actions">
              <a className="button button-secondary" href={projectsExportCsvUrl({ propertyId })} target="_blank" rel="noreferrer">CSV</a>
              <a className="button button-secondary" href={projectsExportExcelUrl({ propertyId })} target="_blank" rel="noreferrer">Excel</a>
              <a className="button button-secondary" href={projectsPrintableReportUrl({ propertyId })} target="_blank" rel="noreferrer">{isSpanish ? "Imprimible" : "Printable"}</a>
              <a className="button button-primary" href={projectsPdfReportUrl({ propertyId })} target="_blank" rel="noreferrer">PDF</a>
            </div>
          </div>
          {canAdmin ? (
            <div className="pool-card">
              <div className="drawer-section-title">
                <div>
                  <h2>{isSpanish ? "Administración de categorías" : "Category Admin"}</h2>
                  <p className="muted">{isSpanish ? "Administre categorías de proyectos sin salir del espacio de trabajo." : "Manage project categories without leaving the workspace."}</p>
                </div>
              </div>
              <form
                className="pool-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!categoryForm.name.trim()) return;
                  void categoryCreateMutation.mutateAsync({
                    propertyId: categoryForm.propertyScoped ? propertyId || null : null,
                    name: categoryForm.name.trim(),
                    color: categoryForm.color || null,
                    sortOrder: categoryForm.sortOrder ? Number(categoryForm.sortOrder) : 0,
                    isActive: true,
                  }).then(() => setCategoryForm(categoryDraft()));
                }}
              >
                <div className="form-grid projects-category-admin-grid">
                  <label>{isSpanish ? "Nombre" : "Name"}<input value={categoryForm.name} onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))} placeholder={isSpanish ? "Cuarto de calderas" : "Boiler Room"} /></label>
                  <label>{isSpanish ? "Color" : "Color"}<input type="color" value={categoryForm.color} onChange={(event) => setCategoryForm((current) => ({ ...current, color: event.target.value }))} /></label>
                  <label>{isSpanish ? "Orden" : "Sort order"}<input type="number" min="0" max="999" value={categoryForm.sortOrder} onChange={(event) => setCategoryForm((current) => ({ ...current, sortOrder: event.target.value }))} placeholder="0" /></label>
                  <label className="compact-toggle">{isSpanish ? "Específica de la propiedad" : "Property-specific"}
                    <input type="checkbox" checked={categoryForm.propertyScoped} onChange={(event) => setCategoryForm((current) => ({ ...current, propertyScoped: event.target.checked }))} />
                  </label>
                </div>
                <div className="pool-entry-actions">
                  <button className="button button-primary" type="submit" disabled={!categoryForm.name.trim() || categoryCreateMutation.isPending}>{isSpanish ? "Agregar categoría" : "Add Category"}</button>
                </div>
              </form>
              <div className="projects-category-list">
                <div className="stack gap-sm">
                  <div className="section-header">
                    <strong>{isSpanish ? "Categorías activas" : "Active categories"}</strong>
                    <span className="muted">{activeCategoryOptions.length}</span>
                  </div>
                  {activeCategoryOptions.map((category) => (
                    <div key={category.id} className="projects-category-row">
                      <div className="projects-category-summary">
                        <span className="projects-category-swatch" style={{ background: category.color ?? "var(--accent)" }} />
                        <strong>{category.name}</strong>
                        <span className="muted">{category.propertyId ? (isSpanish ? "Específica de la propiedad" : "Property-specific") : (isSpanish ? "Global" : "Global")}</span>
                      </div>
                      <div className="pool-entry-actions">
                        <input
                          type="color"
                          value={category.color ?? "#58a6de"}
                          onChange={(event) => void categoryUpdateMutation.mutateAsync({ id: category.id, patch: { color: event.target.value } })}
                          aria-label={`${category.name} color`}
                        />
                        <button className="button button-secondary" type="button" onClick={() => {
                          const nextName = window.prompt(isSpanish ? "Renombrar categoría" : "Rename category", category.name);
                          if (!nextName || !nextName.trim() || nextName.trim() === category.name) return;
                          void categoryUpdateMutation.mutateAsync({ id: category.id, patch: { name: nextName.trim() } });
                        }}>{isSpanish ? "Renombrar" : "Rename"}</button>
                        <button className="button button-secondary" type="button" onClick={() => void categoryUpdateMutation.mutateAsync({ id: category.id, patch: { isActive: false } })}>
                          {isSpanish ? "Desactivar" : "Deactivate"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {inactiveCategoryOptions.length > 0 ? (
                  <div className="stack gap-sm" style={{ marginTop: 16 }}>
                    <div className="section-header">
                      <strong>{isSpanish ? "Categorías inactivas" : "Inactive categories"}</strong>
                      <span className="muted">{inactiveCategoryOptions.length}</span>
                    </div>
                    {inactiveCategoryOptions.map((category) => (
                      <div key={category.id} className="projects-category-row">
                        <div className="projects-category-summary">
                          <span className="projects-category-swatch" style={{ background: category.color ?? "var(--accent)" }} />
                          <strong>{category.name}</strong>
                          <span className="muted">{category.propertyId ? (isSpanish ? "Específica de la propiedad" : "Property-specific") : (isSpanish ? "Global" : "Global")}</span>
                        </div>
                        <div className="pool-entry-actions">
                          <input
                            type="color"
                            value={category.color ?? "#58a6de"}
                            onChange={(event) => void categoryUpdateMutation.mutateAsync({ id: category.id, patch: { color: event.target.value } })}
                            aria-label={`${category.name} color`}
                          />
                          <button className="button button-secondary" type="button" onClick={() => {
                            const nextName = window.prompt(isSpanish ? "Renombrar categoría" : "Rename category", category.name);
                            if (!nextName || !nextName.trim() || nextName.trim() === category.name) return;
                            void categoryUpdateMutation.mutateAsync({ id: category.id, patch: { name: nextName.trim() } });
                          }}>{isSpanish ? "Renombrar" : "Rename"}</button>
                          <button className="button button-secondary" type="button" onClick={() => void categoryUpdateMutation.mutateAsync({ id: category.id, patch: { isActive: true } })}>
                            {isSpanish ? "Activar" : "Activate"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : tab === "map" ? (
        <>
          <div className="pool-card pool-form" style={{ marginBottom: 16 }}>
            <div className="form-grid">
              <label>Search<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={projectSearchPlaceholder} /></label>
              <label>Source
                <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                  <option value="">All sources</option>
                  {projectSources.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                </select>
              </label>
              <label>Budget year
                <select value={budgetYearFilter} onChange={(event) => setBudgetYearFilter(event.target.value)}>
                  <option value="">All budget years</option>
                  {budgetYearOptions.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                </select>
              </label>
              <label>Deferred
                <select value={deferredFilter} onChange={(event) => setDeferredFilter(event.target.value)}>
                  <option value="">All deferment states</option>
                  <option value="yes">Deferred</option>
                  <option value="no">Not deferred</option>
                </select>
              </label>
              <label>Aging
                <select value={agingFilter} onChange={(event) => setAgingFilter(event.target.value)}>
                  <option value="">All ages</option>
                  <option value="0-30">0-30 Days</option>
                  <option value="31-90">31-90 Days</option>
                  <option value="91-180">91-180 Days</option>
                  <option value="180+">180+ Days</option>
                </select>
              </label>
            </div>
          </div>
          <div className="pool-form projects-map-layout">
          <div className="projects-map-toolbar">
            <div>
              <h2>Map View</h2>
              <p className="muted">Open pinned recommendations and projects in real property map context. Workspace filters narrow the visible pins, and you can still reposition the selected record without leaving the map.</p>
            </div>
            <div className="pool-entry-actions">
              <label>Map
                <select value={selectedMapId} onChange={(event) => setSelectedMapId(event.target.value)}>
                  {pinnedMapIds.map((mapId) => {
                    const map = mapsById.get(mapId);
                    return <option key={mapId} value={mapId}>{map?.name ?? "Property map"}</option>;
                  })}
                </select>
              </label>
              {selectedProjectsMap?.mimeType === "application/pdf" ? <a className="button button-secondary" href={propertyMapFileUrl(selectedProjectsMap.id)} target="_blank" rel="noreferrer">Open PDF Map</a> : null}
            </div>
          </div>
          {!selectedProjectsMap ? <p className="muted">Select a property map to inspect and place project records.</p> : (
            <div className="projects-map-grid">
              <section className="pool-card projects-map-card">
                <div className="projects-map-card-header">
                  <div>
                    <h3>{selectedProjectsMap.name}</h3>
                    <span className="muted">{selectedMapRecords.length} pinned record{selectedMapRecords.length === 1 ? "" : "s"}</span>
                  </div>
                  <div className="pool-entry-actions">
                    {canEdit && selectedWorkspaceMapRecord ? (
                      <>
                        <button className={mapRepositionMode ? "button button-primary" : "button button-secondary"} type="button" onClick={() => setMapRepositionMode((current) => !current)}>
                          {mapRepositionMode
                            ? "Cancel Placement"
                            : selectedMapRecord
                              ? "Reposition Selected Pin"
                              : selectedWorkspaceMapRecord.propertyMapId && selectedWorkspaceMapRecord.pinX !== null && selectedWorkspaceMapRecord.pinY !== null
                                ? "Move Selected To This Map"
                                : "Place Selected On Map"}
                        </button>
                        {selectedMapRecord ? (
                          <button
                            className="button button-secondary"
                            type="button"
                            onClick={() => void updateMutation.mutateAsync({ id: selectedMapRecord.id, patch: { propertyMapId: null, pinX: null, pinY: null } })}
                          >
                            Remove Pin
                          </button>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </div>
                <div
                  ref={mapViewCanvasRef}
                  className={`projects-map-canvas ${selectedProjectsMapHasImage ? "" : "no-preview"}${mapRepositionMode ? " repositioning" : ""}`}
                  onClick={(event) => void moveSelectedMapRecord(event)}
                >
                  {selectedProjectsMapHasImage ? <img src={propertyMapFileUrl(selectedProjectsMap.id)} alt={`${selectedProjectsMap.name} map`} /> : (
                    <div className="map-placeholder">
                      <strong>Map preview unavailable</strong>
                      <span>{selectedProjectsMap.mimeType === "application/pdf" ? "PDF maps can still anchor project pins, but the browser view uses this neutral canvas. Open the PDF for the source sheet." : "Upload a PNG, JPG, or WebP property map for full visual project placement."}</span>
                    </div>
                  )}
                  {selectedMapRecords.map((record) => (
                    <button
                      key={record.id}
                      type="button"
                      className={`projects-map-marker${selectedMapRecord?.id === record.id ? " active" : ""}${record.recordType === "Project" ? " is-project" : " is-recommendation"}`}
                      style={{ left: `${record.pinX ?? 50}%`, top: `${record.pinY ?? 50}%` }}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedRecordId(record.id);
                      }}
                      title={`${record.title} (${record.recordType})`}
                    >
                      <span>{record.recordType === "Project" ? "PRJ" : "REC"}</span>
                    </button>
                  ))}
                </div>
                <div className="projects-map-footer">
                  <span className="muted">
                    {mapRepositionMode && selectedWorkspaceMapRecord
                      ? `Click the map to place "${selectedWorkspaceMapRecord.title}" on ${selectedProjectsMap.name}.`
                      : selectedMapRecord && selectedMapRecord.pinX !== null && selectedMapRecord.pinY !== null
                        ? `Selected pin: ${selectedMapRecord.pinX.toFixed(1)}%, ${selectedMapRecord.pinY.toFixed(1)}%`
                        : selectedWorkspaceMapRecord
                          ? `"${selectedWorkspaceMapRecord.title}" is not pinned on this map yet.`
                          : selectedMapRecords.length
                            ? "Select a pinned record to inspect it here."
                            : "No filtered records are pinned on this map yet."}
                  </span>
                </div>
              </section>
              <aside className="pool-card projects-map-detail">
                {selectedWorkspaceMapRecord ? (
                  <>
                    <div className="drawer-section-title">
                      <div>
                        <h3>{selectedWorkspaceMapRecord.title}</h3>
                        <span className={`status-pill ${selectedWorkspaceMapRecord.priority === "Critical" ? "risk-critical" : selectedWorkspaceMapRecord.priority === "High" ? "risk-high" : ""}`}>{selectedWorkspaceMapRecord.status}</span>
                      </div>
                      <button className="button button-secondary" type="button" onClick={() => setTab(selectedWorkspaceMapRecord.recordType === "Recommendation" ? "recommendations" : "projects")}>Open Record</button>
                    </div>
                    <div className="projects-map-meta">
                      <div><dt>Type</dt><dd>{selectedWorkspaceMapRecord.recordType}</dd></div>
                      <div><dt>Priority</dt><dd>{selectedWorkspaceMapRecord.priority}</dd></div>
                      <div><dt>Category</dt><dd>{selectedWorkspaceMapRecord.categoryName ?? "Uncategorized"}</dd></div>
                      <div><dt>Assigned</dt><dd>{selectedWorkspaceMapRecord.assignedUserName ?? selectedWorkspaceMapRecord.assignedRole ?? "Unassigned"}</dd></div>
                      <div><dt>Building</dt><dd>{selectedWorkspaceMapRecord.building ?? "-"}</dd></div>
                      <div><dt>Area</dt><dd>{selectedWorkspaceMapRecord.area ?? "-"}</dd></div>
                      <div><dt>Map Pin</dt><dd>{selectedMapRecord && selectedMapRecord.pinX !== null && selectedMapRecord.pinY !== null ? `${selectedMapRecord.pinX.toFixed(1)}%, ${selectedMapRecord.pinY.toFixed(1)}%` : "Not pinned on this map"}</dd></div>
                      <div><dt>Updated</dt><dd>{formatDateTime(selectedWorkspaceMapRecord.updatedAt)}</dd></div>
                    </div>
                    {selectedWorkspaceMapRecord.description ? <p>{selectedWorkspaceMapRecord.description}</p> : null}
                    {selectedWorkspaceMapRecord.locationNotes ? <p className="muted">{selectedWorkspaceMapRecord.locationNotes}</p> : null}
                    {selectedWorkspaceMapRecord.attachments.length ? (
                      <div className="projects-map-photo-strip">
                        {selectedWorkspaceMapRecord.attachments.filter((attachment) => isImageAttachment(attachment.mimeType)).slice(0, 3).map((attachment) => (
                          <img key={attachment.id} src={projectAttachmentDownloadUrl(attachment.id)} alt={attachment.caption ?? attachment.originalName} />
                        ))}
                      </div>
                    ) : null}
                    <div className="projects-map-record-list">
                      <h4>Records On This Map</h4>
                      {selectedMapRecords.length ? selectedMapRecords.map((record) => (
                        <button key={record.id} type="button" className={`projects-map-record-row${selectedWorkspaceMapRecord.id === record.id ? " active" : ""}`} onClick={() => setSelectedRecordId(record.id)}>
                          <strong>{record.title}</strong>
                          <span>{record.recordType} / {record.priority} / {record.building ?? record.area ?? "No location label"}</span>
                        </button>
                      )) : <p className="muted">No filtered records are pinned on this map.</p>}
                    </div>
                    <div className="projects-map-record-list">
                      <h4>Available To Place</h4>
                      {availableMapRecords.length ? availableMapRecords.slice(0, 12).map((record) => (
                        <button key={record.id} type="button" className={`projects-map-record-row${selectedWorkspaceMapRecord.id === record.id ? " active" : ""}`} onClick={() => setSelectedRecordId(record.id)}>
                          <strong>{record.title}</strong>
                          <span>{record.recordType} / {record.priority} / {record.propertyMapId && record.pinX !== null && record.pinY !== null ? "Pinned on another map" : "Unpinned"} / {record.building ?? record.area ?? "No location label"}</span>
                        </button>
                      )) : <p className="muted">All filtered records are already pinned on this map.</p>}
                    </div>
                  </>
                ) : (
                  <p className="muted">Select a filtered project or recommendation to inspect it and place it on this map.</p>
                )}
              </aside>
            </div>
          )}
          </div>
        </>
      ) : (
        <div className="pool-card pool-form">
          {tab === "bids" ? (
            <div className="projects-bid-summary">
              <div className="pool-kpi-grid">
                <div className="pool-kpi warning"><strong>{visibleRecords.filter((record) => record.status === "Needs Bid" || record.bidStatus === "Needed" || record.bidStatus === "Requested").length}</strong><span>{isSpanish ? "Solicitudes de cotización abiertas" : "Open bid requests"}</span></div>
                <div className="pool-kpi"><strong>{visibleRecords.filter((record) => record.bidStatus === "Received").length}</strong><span>{isSpanish ? "Cotizaciones recibidas" : "Received quotes"}</span></div>
                <div className="pool-kpi"><strong>{visibleRecords.filter((record) => record.bidStatus === "Approved").length}</strong><span>{isSpanish ? "Cotizaciones aprobadas" : "Approved bids"}</span></div>
                <div className="pool-kpi"><strong>{visibleRecords.filter((record) => record.bidStatus === "Denied").length}</strong><span>{isSpanish ? "Cotizaciones rechazadas" : "Denied bids"}</span></div>
              </div>
            </div>
          ) : null}
          <div className="form-grid">
            <label>{isSpanish ? "Buscar" : "Search"}<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={projectSearchPlaceholder} /></label>
            <label>{isSpanish ? "Origen" : "Source"}
              <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                <option value="">{isSpanish ? "Todos los orígenes" : "All sources"}</option>
                {projectSources.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
              </select>
            </label>
            <label>{isSpanish ? "Año de presupuesto" : "Budget year"}
              <select value={budgetYearFilter} onChange={(event) => setBudgetYearFilter(event.target.value)}>
                <option value="">{isSpanish ? "Todos los años de presupuesto" : "All budget years"}</option>
                {budgetYearOptions.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
              </select>
            </label>
            <label>{isSpanish ? "Diferido" : "Deferred"}
              <select value={deferredFilter} onChange={(event) => setDeferredFilter(event.target.value)}>
                <option value="">{isSpanish ? "Todos los estados de diferimiento" : "All deferment states"}</option>
                <option value="yes">{isSpanish ? "Diferido" : "Deferred"}</option>
                <option value="no">{isSpanish ? "No diferido" : "Not deferred"}</option>
              </select>
            </label>
            <label>{isSpanish ? "Antigüedad" : "Aging"}
              <select value={agingFilter} onChange={(event) => setAgingFilter(event.target.value)}>
                <option value="">{isSpanish ? "Todas las edades" : "All ages"}</option>
                <option value="0-30">0-30 Days</option>
                <option value="31-90">31-90 Days</option>
                <option value="91-180">91-180 Days</option>
                <option value="180+">180+ Days</option>
              </select>
            </label>
          </div>
        </div>
      )}

      {tab !== "dashboard" && tab !== "reports" && tab !== "map" ? (
        <div className="pool-grid projects-work-grid">
          <section className="pool-card">
            <div className="pm-task-list">
              {recordsQuery.isLoading ? <StatusState title={isSpanish ? "Cargando registros" : "Loading records"} description={isSpanish ? "Cargando proyectos y recomendaciones." : "Fetching project and recommendation records."} /> : visibleRecords.map((record) => (
                <button key={record.id} type="button" className="projects-record-card" onClick={() => setSelectedRecordId(record.id)}>
                  <div className="projects-record-thumb">
                    {record.attachments.find((attachment) => isImageAttachment(attachment.mimeType)) ? <img src={projectAttachmentDownloadUrl(record.attachments.find((attachment) => isImageAttachment(attachment.mimeType))!.id)} alt={record.title} /> : <span>{isSpanish ? "Sin foto" : "No photo"}</span>}
                  </div>
                  <div className="projects-record-body">
                    <strong>{record.title}</strong>
                    <div className="pool-reading-stack">
                      <span>{record.property.code}</span>
                      <span>{record.status}</span>
                      <span>{record.priority}</span>
                      <span>{record.categoryName ?? (isSpanish ? "Sin categoría" : "Uncategorized")}</span>
                    </div>
                    <p className="muted">{[record.building, record.area].filter(Boolean).join(" / ") || record.locationNotes || (isSpanish ? "Sin ubicación todavía." : "No location yet.")}</p>
                    <div className="pool-reading-stack">
                      <span>{record.source ?? (isSpanish ? "Otro" : "Other")}</span>
                      <span className={`status-pill ${toneForAging(record.daysOpen)}`}>{record.daysOpen ?? 0} {isSpanish ? "días abiertos" : "days open"}</span>
                      <span>{record.assignedUserName ?? record.companyName ?? record.assignedRole ?? (isSpanish ? "Sin asignar" : "Unassigned")}</span>
                      <span>{record.dueDate ? `${isSpanish ? "Vence" : "Due"} ${formatDate(record.dueDate)}` : record.scheduledDate ? `${isSpanish ? "Programado" : "Scheduled"} ${formatDate(record.scheduledDate)}` : (isSpanish ? "Sin fecha" : "No date")}</span>
                      {tab === "bids" ? <span>{record.bidStatus ?? (isSpanish ? "Sin estado de cotización" : "No bid status")}</span> : null}
                    </div>
                  </div>
                </button>
              ))}
              {!recordsQuery.isLoading && visibleRecords.length === 0 ? <p className="muted">{isSpanish ? "Todavía no hay registros que coincidan con esta vista." : "No records match this bid view yet."}</p> : null}
            </div>
          </section>
          <section className="pool-card">
            {selectedRecord ? (
              <ProjectDetail
                record={selectedRecord}
                history={detailQuery.data?.history ?? []}
                canEdit={canEdit}
                users={users}
                language={language}
                onSave={(record, patch) => void updateMutation.mutateAsync({ id: record.id, patch })}
                onConvert={(id) => void convertMutation.mutateAsync(id)}
                onAddComment={(id, body) => void commentMutation.mutateAsync({ id, body })}
                onAddTask={(id, input) => void taskCreateMutation.mutateAsync({ id, input })}
                onUpdateTask={(task, patch) => void taskUpdateMutation.mutateAsync({ id: task.id, patch })}
                onUpload={(id, files, attachmentType, caption) => {
                  if (!files?.length) return;
                  const accepted = Array.from(files).filter((file) => isAllowedProjectAttachment(file, attachmentType));
                  const rejectedCount = files.length - accepted.length;
                  if (rejectedCount) {
                    setProjectUploadNotice(
                      isSpanish
                        ? `${rejectedCount} archivo${rejectedCount === 1 ? "" : "s"} se omitieron porque no coincidían con el tipo permitido o estaban vacíos.`
                        : `${rejectedCount} file${rejectedCount === 1 ? "" : "s"} were skipped because they did not match the allowed type or were empty.`,
                    );
                  } else {
                    setProjectUploadNotice(null);
                  }
                  accepted.forEach((file) => void uploadMutation.mutateAsync({ id, file, attachmentType, caption }));
                }}
                onUpdateAttachment={(id, patch) => void attachmentUpdateMutation.mutateAsync({ id, patch })}
              />
            ) : <StatusState title={isSpanish ? "Seleccione un registro" : "Select a record"} description={isSpanish ? "Elija un proyecto o recomendación para ver detalles, archivos, comentarios y tareas." : "Choose a project or recommendation to view details, files, comments, and tasks."} />}
          </section>
        </div>
      ) : null}
    </section>
  );
}
