import { type MouseEvent, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { BoardColumnDefinition, BoardSection, ChargePriceSheetItem, CurrentUser, CustomField, FloorPlan, ItemCollaboration, LabelDefinition, MakeReadyItem, StaffOption, UnitHistoryResponse, Vendor, VendorAssignment, WorkAssignmentBlock } from "../lib/api";
import { attachmentArchiveUrl, attachmentDownloadUrl, attachChecklist, chargeReportCsvUrl, createChargePriceSheetItem, createChecklistTemplate, createItemComment, deleteItemAttachment, deleteItemComment, getActivity, getAutomationRuns, getChargePriceSheetItems, getChargeReport, getItemCollaboration, getPestIssues, getUnitHistory, isApiError, updateChecklistItem, updateItemAttachment, updateItemComment, uploadItemAttachment } from "../lib/api";
import { enqueueMakeReadyAttachmentUpload, enqueueMakeReadyChecklistAttach, enqueueMakeReadyChecklistUpdate, enqueueMakeReadyCommentCreate, enqueueMakeReadyCommentDelete, enqueueMakeReadyCommentUpdate, getOfflineSyncEventName, getOfflineSyncJobs } from "../lib/offlineSync";
import { boardGroupLabel, configuredBoardColumns } from "../lib/board";
import { formatDateTime } from "../lib/dateTime";
import { t, tWithVars } from "../lib/i18n";
import { openPestQuickAdd, openPestWorkspace } from "../lib/pestNavigation";
import { PropertyWikiWorkflowPanel } from "./PropertyWikiWorkflowPanel";
import { LabelPill } from "./LabelPill";
import { Modal } from "./Modal";
import { StatusState } from "./StatusState";

function floorPlanLabel(plan: Pick<FloorPlan, "code" | "name">) {
  return plan.name && plan.name !== plan.code ? `${plan.code} - ${plan.name}` : plan.code;
}

type Props = {
  item: MakeReadyItem;
  currentUser: CurrentUser;
  labelsByField: Record<string, Record<string, LabelDefinition>>;
  customFields: CustomField[];
  columnDefinitions: BoardColumnDefinition[];
  staff: StaffOption[];
  floorPlans: FloorPlan[];
  boardGroups: string[];
  boardSections: BoardSection[];
  vendors: Vendor[];
  vendorAssignments: VendorAssignment[];
  workBlocks: WorkAssignmentBlock[];
  canEditField: (item: MakeReadyItem, key: string) => boolean;
  canEditCustomFields: boolean;
  canManageItems: boolean;
  canViewActivity: boolean;
  onClose: () => void;
  onPatch: (id: string, data: Record<string, unknown>) => Promise<void>;
  onPatchCustomField: (itemId: string, fieldId: string, value: unknown) => Promise<void>;
  onAssignFloorPlan: (item: MakeReadyItem, floorPlanId: string) => Promise<void>;
  onCreateVendorAssignment: (input: { vendorId: string; itemId: string; trade: string; status?: VendorAssignment["status"]; scheduledDate?: string | null; dueDate?: string | null; notes?: string | null }) => Promise<void>;
  onUpdateVendorAssignment: (id: string, input: { status?: VendorAssignment["status"]; notes?: string | null; scheduledDate?: string | null; dueDate?: string | null }) => Promise<void>;
  onMarkReady: (id: string) => Promise<void>;
  onBatch: (input:
    | { action: "ARCHIVE" | "RESTORE"; ids: string[] }
    | { action: "ASSIGN_TECH"; ids: string[]; value: string | null }
    | { action: "MOVE_GROUP"; ids: string[]; boardGroup: string }
  ) => Promise<void>;
};

function dateValue(value: unknown) {
  return typeof value === "string" && value ? new Date(value).toISOString().slice(0, 10) : "";
}

function customValue(item: MakeReadyItem, id: string) {
  return item.customFieldValues.find((value) => value.customFieldId === id)?.value ?? null;
}

function normalized(value: string | null | undefined) {
  return (value ?? "").trim().toUpperCase();
}

function completionBlockers(item: MakeReadyItem) {
  const blockers: string[] = [];
  const requireValue = (value: string | null | undefined, label: string) => {
    if (!normalized(value) || normalized(value) === "-") blockers.push(`${label} is not set.`);
  };
  const requireExact = (value: string | null | undefined, expected: string, label: string) => {
    if (normalized(value) !== expected) blockers.push(`${label} should be ${expected}.`);
  };
  requireValue(item.trashOutStatus, "Trash Out");
  requireExact(item.pestStatus, "NONE", "Pest");
  requireExact(item.cabinetsStatus, "GOOD", "Cabinets");
  requireExact(item.countertopsStatus, "GOOD", "Countertops");
  requireExact(item.appliancesStatus, "GOOD", "Appliances");
  requireExact(item.doorsStatus, "GOOD", "Doors");
  requireExact(item.sheetrockStatus, "GOOD", "Sheetrock");
  requireExact(item.floorsStatus, "GOOD", "Floors");
  requireExact(item.cleaningStatus, "DONE", "Cleaning");
  requireExact(item.keysMadeStatus, "MADE", "Keys Made");
  if (!["GOOD", "MAJOR TOUCH UP", "MED TOUCH UP", "LITE TOUCH UP", "TOUCH UP"].includes(normalized(item.paintStatus))) {
    blockers.push("Paint is not marked ready or touch-up scoped.");
  }
  return blockers;
}

const attachmentStageOptions = [
  { value: "ALL", label: "All photos/files" },
  { value: "NEEDS_CLASSIFICATION", label: "Needs classification" },
  { value: "GENERAL", label: "General" },
  { value: "NTV", label: "NTV / Notice" },
  { value: "VACATED", label: "Vacated" },
  { value: "INITIAL_WALK", label: "Initial Walk" },
  { value: "SCOPE", label: "Scope" },
  { value: "TRASH_OUT", label: "Trash Out" },
  { value: "CLEANING", label: "Cleaning" },
  { value: "PAINT", label: "Paint" },
  { value: "FLOORING", label: "Flooring" },
  { value: "DAMAGE", label: "Damage" },
  { value: "FINAL_WALK", label: "Final Walk" },
  { value: "MOVE_IN_READY", label: "Move-In Ready" },
  { value: "CHARGE_CANDIDATES", label: "Charge candidates" },
];

const attachmentCategoryOptions = ["Damage", "Cleaning", "Trash-out", "Paint", "Flooring", "Appliance", "Keys/locks", "Resident items", "Vendor proof", "Final QC"];
const attachmentAccept = [
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".heic", ".heif", ".bmp", ".tif", ".tiff",
  ".pdf", ".doc", ".docx", ".txt", ".csv", ".xls", ".xlsx",
].join(",");
type DrawerAttachment = ItemCollaboration["attachments"][number];
type AttachmentAnnotation = NonNullable<DrawerAttachment["markupAnnotations"]>[number];

function nextAnnotationId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `pin-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nextOfflineCommentId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? `offline-comment-${crypto.randomUUID()}` : `offline-comment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function dollarsToCents(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : null;
}

function centsToDollars(value: number | null | undefined) {
  return typeof value === "number" ? (value / 100).toFixed(2) : "";
}

function formatCents(value: number | null | undefined) {
  return typeof value === "number" ? `$${(value / 100).toFixed(2)}` : t("en", "drawer.noEstimate");
}

function AttachmentMedia({ attachment, onOpen, language }: { attachment: DrawerAttachment; onOpen: () => void; language: CurrentUser["language"] }) {
  const [failed, setFailed] = useState(false);
  if (attachment.mimeType.startsWith("image/") && !failed) {
    return (
      <button type="button" className="attachment-preview" data-testid="attachment-preview-trigger" onClick={onOpen} aria-label={tWithVars(language, "drawer.previewAttachment", { name: attachment.originalName })}>
        <img src={attachmentDownloadUrl(attachment.id)} alt={attachment.note || attachment.originalName} loading="lazy" onError={() => setFailed(true)} />
      </button>
    );
  }
  return (
    <button type="button" className="attachment-file" data-testid="attachment-preview-trigger" onClick={onOpen} aria-label={tWithVars(language, "drawer.viewAttachmentDetails", { name: attachment.originalName })}>
      <span>{attachment.originalName.split(".").pop()?.toUpperCase() || "FILE"}</span>
      <strong>{attachment.originalName}</strong>
      {failed ? <small>{t(language, "drawer.previewUnavailable")}</small> : null}
    </button>
  );
}

export function ItemDrawer({
  item,
  currentUser,
  labelsByField,
  customFields,
  columnDefinitions,
  staff,
  floorPlans,
  boardGroups,
  boardSections,
  vendors,
  vendorAssignments,
  workBlocks,
  canEditField,
  canEditCustomFields,
  canManageItems,
  canViewActivity,
  onClose,
  onPatch,
  onPatchCustomField,
  onAssignFloorPlan,
  onCreateVendorAssignment,
  onUpdateVendorAssignment,
  onMarkReady,
  onBatch,
}: Props) {
  const queryClient = useQueryClient();
  const language = currentUser.language;
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [commentText, setCommentText] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [attachmentStageFilter, setAttachmentStageFilter] = useState("ALL");
  const [attachmentGalleryOpen, setAttachmentGalleryOpen] = useState(false);
  const [chargeReportOpen, setChargeReportOpen] = useState(false);
  const [previewAttachmentId, setPreviewAttachmentId] = useState<string | null>(null);
  const [attachmentZoom, setAttachmentZoom] = useState(1);
  const [pinModeAttachmentId, setPinModeAttachmentId] = useState<string | null>(null);
  const [newPinLabel, setNewPinLabel] = useState("Damage");
  const [newPinCategory, setNewPinCategory] = useState("Damage");
  const [newPinChargeCandidate, setNewPinChargeCandidate] = useState(true);
  const [newPinPriceSheetItemId, setNewPinPriceSheetItemId] = useState("");
  const [newPinChargeQuantity, setNewPinChargeQuantity] = useState("1");
  const [newPinChargeEstimate, setNewPinChargeEstimate] = useState("");
  const [newChargeItem, setNewChargeItem] = useState({ name: "", category: "", amount: "", unitLabel: "" });
  const [templateId, setTemplateId] = useState("");
  const [vendorDraft, setVendorDraft] = useState({ vendorId: "", trade: "", scheduledDate: "", dueDate: "", notes: "" });
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateItems, setNewTemplateItems] = useState("");
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const columns = useMemo(() => configuredBoardColumns(columnDefinitions), [columnDefinitions]);
  const drawerColumns = useMemo(() => columns.filter((column) => column.key !== "unitNumber" && column.key !== "notes" && column.key !== "completionStatus"), [columns]);
  const readinessBlockers = useMemo(() => completionBlockers(item), [item]);
  const completionOptions = useMemo(() => Object.values(labelsByField.completionStatus ?? {}).filter((option) => !option.isArchived || option.value === item.completionStatus), [item.completionStatus, labelsByField.completionStatus]);
  const activityQuery = useQuery({
    queryKey: ["activity", "item", item.id],
    queryFn: () => getActivity({ entityType: "MAKE_READY_ITEM", entityId: item.id, limit: 12 }),
    enabled: canViewActivity,
  });
  const runsQuery = useQuery({
    queryKey: ["automations", "runs", "item", item.id],
    queryFn: () => getAutomationRuns(undefined, item.id),
    enabled: canViewActivity,
  });
  const collaborationQuery = useQuery({
    queryKey: ["collaboration", item.id],
    queryFn: () => getItemCollaboration(item.id, { attachmentLimit: 100 }),
  });
  const chargePriceSheetQuery = useQuery({
    queryKey: ["charge-price-sheet-items", item.propertyId],
    queryFn: () => getChargePriceSheetItems(item.propertyId),
  });
  const historyQuery = useQuery<UnitHistoryResponse>({
    queryKey: ["unit-history", item.unitId],
    queryFn: () => getUnitHistory(item.unitId as string),
    enabled: Boolean(item.unitId),
  });
  const chargeReportQuery = useQuery({
    queryKey: ["charge-report", item.id],
    queryFn: () => getChargeReport(item.id),
    enabled: chargeReportOpen,
  });
  const linkedPestIssuesQuery = useQuery({
    queryKey: ["pest", "linked-make-ready", item.id],
    queryFn: () => getPestIssues({ propertyId: item.propertyId, makeReadyItemId: item.id, includeArchived: true, limit: 20 }),
    enabled: !item.isArchived,
  });
  const canCollaborate = currentUser.role !== "VIEWER";
  const itemVendorAssignments = vendorAssignments.filter((assignment) => assignment.itemId === item.id);
  const itemWorkBlocks = workBlocks.filter((block) => block.itemId === item.id && block.status !== "CANCELED");
  const attachments = collaborationQuery.data?.attachments ?? [];
  const activeChargePriceSheetItems = (chargePriceSheetQuery.data?.items ?? []).filter((entry) => entry.isActive && !entry.isArchived);
  const needsClassification = attachments.filter((attachment) => (attachment.inspectionStage || "GENERAL") === "GENERAL" && !attachment.category && !attachment.note && !attachment.chargeCandidate);
  const chargeCandidates = attachments.filter((attachment) => attachment.chargeCandidate);
  const chargePinAnnotations = attachments.flatMap((attachment) => (attachment.markupAnnotations ?? [])
    .filter((annotation) => annotation.chargeCandidate)
    .map((annotation) => ({ attachment, annotation })));
  const chargeCandidatesMissingContext = [
    ...chargeCandidates.filter((attachment) => !attachment.chargeNote && !attachment.note),
    ...chargePinAnnotations.filter(({ annotation }) => !annotation.note && !annotation.chargePriceSheetItemId && !annotation.chargeEstimatedCents),
  ];
  const chargeEstimateTotal = chargeCandidates.reduce((total, attachment) => total + (attachment.chargeEstimatedCents ?? 0), 0)
    + chargePinAnnotations.reduce((total, { annotation }) => total + (annotation.chargeEstimatedCents ?? 0), 0);
  const filteredAttachments = attachments.filter((attachment) => {
    if (attachmentStageFilter === "ALL") return true;
    if (attachmentStageFilter === "NEEDS_CLASSIFICATION") return needsClassification.some((entry) => entry.id === attachment.id);
    if (attachmentStageFilter === "CHARGE_CANDIDATES") return attachment.chargeCandidate;
    return (attachment.inspectionStage || "GENERAL") === attachmentStageFilter;
  });
  const imageCount = attachments.filter((attachment) => attachment.mimeType.startsWith("image/")).length;
  const chargeCount = chargeCandidates.length;
  const chargePinCount = chargePinAnnotations.length;
  const recentAttachments = filteredAttachments.slice(0, 6);
  const previewAttachment = previewAttachmentId ? attachments.find((attachment) => attachment.id === previewAttachmentId) ?? null : null;
  const previewImageAttachments = (filteredAttachments.some((attachment) => attachment.id === previewAttachmentId) ? filteredAttachments : attachments).filter((attachment) => attachment.mimeType.startsWith("image/"));
  const previewImageIndex = previewAttachmentId ? previewImageAttachments.findIndex((attachment) => attachment.id === previewAttachmentId) : -1;
  const canCyclePreviewImages = previewImageAttachments.length > 1 && previewImageIndex >= 0;
  const canUpdatePreviewAttachment = Boolean(previewAttachment && canCollaborate && (previewAttachment.uploadedById === currentUser.id || canManageItems));
  const activeStageLabel = attachmentStageOptions.find((stage) => stage.value === attachmentStageFilter)?.label ?? "current filter";
  const attachmentCategories = Array.from(new Set(attachments.map((attachment) => attachment.category?.trim()).filter((category): category is string => Boolean(category)))).sort((a, b) => a.localeCompare(b));
  const markupCategoryOptions = Array.from(new Set([...attachmentCategoryOptions, ...attachmentCategories, newPinCategory.trim()].filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const canManageVendorWork = currentUser.role === "ADMIN" || currentUser.role === "MANAGER" || currentUser.role === "LEASING";
  const canManageChargePriceSheet = currentUser.role === "ADMIN" || currentUser.role === "MANAGER";
  const canUpdateVendorWork = canManageVendorWork || currentUser.role === "TECH";
  const refreshCollaboration = async () => {
    await queryClient.invalidateQueries({ queryKey: ["collaboration", item.id] });
    await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    await queryClient.invalidateQueries({ queryKey: ["my-work"] });
  };
  const refreshPendingSyncCount = async () => {
    const jobs = await getOfflineSyncJobs();
    const count = jobs.filter((job) => {
      const payload = job.payload;
      if ("itemId" in payload && payload.itemId === item.id) {
        return true;
      }
      if (payload.kind === "makeReadyChecklistUpdate") {
        if (payload.itemId === item.id) {
          return true;
        }
        return Boolean(collaborationQuery.data?.checklistInstances.some((instance) => instance.items.some((entry) => entry.id === payload.checklistItemId)));
      }
      return false;
    }).length;
    setPendingSyncCount(count);
  };
  const patchAttachmentMetadata = (attachmentId: string, patch: Parameters<typeof updateItemAttachment>[1]) => {
    queryClient.setQueryData<ItemCollaboration>(["collaboration", item.id], (current) => current ? {
      ...current,
      attachments: current.attachments.map((attachment) => attachment.id === attachmentId ? { ...attachment, ...patch } : attachment),
    } : current);
    void operation(`attachment-${attachmentId}`, () => updateItemAttachment(attachmentId, patch));
  };
  const addChargePriceSheetItem = () => {
    if (!newChargeItem.name.trim()) return;
    void operation("charge-price-sheet-create", async () => {
      const created = await createChargePriceSheetItem({
        propertyId: item.propertyId,
        name: newChargeItem.name.trim(),
        category: newChargeItem.category.trim() || null,
        unitLabel: newChargeItem.unitLabel.trim() || null,
        defaultCents: dollarsToCents(newChargeItem.amount),
      });
      setNewChargeItem({ name: "", category: "", amount: "", unitLabel: "" });
      await queryClient.invalidateQueries({ queryKey: ["charge-price-sheet-items", item.propertyId] });
      await queryClient.invalidateQueries({ queryKey: ["charge-report", item.id] });
      return created;
    });
  };
  const saveAttachmentAnnotations = (attachment: DrawerAttachment, annotations: AttachmentAnnotation[]) => {
    patchAttachmentMetadata(attachment.id, { markupAnnotations: annotations });
    void queryClient.invalidateQueries({ queryKey: ["charge-report", item.id] });
  };
  const updateAttachmentAnnotation = (attachment: DrawerAttachment, annotationId: string, patch: Partial<AttachmentAnnotation>) => {
    saveAttachmentAnnotations(attachment, (attachment.markupAnnotations ?? []).map((annotation) => annotation.id === annotationId ? { ...annotation, ...patch } : annotation));
  };
  const addAttachmentAnnotation = (attachment: DrawerAttachment, event: MouseEvent<HTMLDivElement>) => {
    if (pinModeAttachmentId !== attachment.id || !newPinLabel.trim()) return;
    const selectedPriceSheetItem = activeChargePriceSheetItems.find((entry) => entry.id === newPinPriceSheetItemId) ?? null;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
    const nextAnnotations = [
      ...(attachment.markupAnnotations ?? []),
      {
        id: nextAnnotationId(),
        x: Number(x.toFixed(2)),
        y: Number(y.toFixed(2)),
        label: newPinLabel.trim(),
        category: newPinCategory.trim() || null,
        chargeCandidate: newPinChargeCandidate,
        chargePriceSheetItemId: selectedPriceSheetItem?.id ?? null,
        chargePriceSheetItemName: selectedPriceSheetItem?.name ?? null,
        chargeQuantity: newPinChargeCandidate && selectedPriceSheetItem ? Number(newPinChargeQuantity) || 1 : null,
        chargeEstimatedCents: newPinChargeCandidate ? dollarsToCents(newPinChargeEstimate) ?? selectedPriceSheetItem?.defaultCents ?? null : null,
      },
    ];
    saveAttachmentAnnotations(attachment, nextAnnotations);
    setPinModeAttachmentId(null);
  };
  const removeAttachmentAnnotation = (attachment: DrawerAttachment, annotationId: string) => {
    saveAttachmentAnnotations(attachment, (attachment.markupAnnotations ?? []).filter((annotation) => annotation.id !== annotationId));
  };
  const openPreviewImageAt = (direction: -1 | 1) => {
    if (!canCyclePreviewImages) return;
    const nextIndex = (previewImageIndex + direction + previewImageAttachments.length) % previewImageAttachments.length;
    setPinModeAttachmentId(null);
    setPreviewAttachmentId(previewImageAttachments[nextIndex].id);
  };
  const uploadFiles = (files: FileList | null) => {
    const selected = Array.from(files ?? []);
    if (!selected.length) return;
    void operation("attachments-upload", async () => {
      for (const file of selected) {
        try {
          await uploadItemAttachment(item.id, file);
        } catch (error) {
          if (!(isApiError(error) && error.status === 0)) {
            throw error;
          }
          await enqueueMakeReadyAttachmentUpload(item.id, [file]);
        }
      }
    });
  };
  const operation = async (key: string, action: () => Promise<unknown>) => {
    setSaving(key);
    setError("");
    try {
      await action();
      await refreshCollaboration();
      await queryClient.invalidateQueries({ queryKey: ["charge-report", item.id] });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t(language, "drawer.operationFailed"));
      await refreshCollaboration();
    } finally {
      setSaving(null);
      await refreshPendingSyncCount();
    }
  };
  const toggleChecklistItem = (id: string, completed: boolean) => {
    queryClient.setQueryData<ItemCollaboration>(["collaboration", item.id], (current) => current ? {
      ...current,
      checklistInstances: current.checklistInstances.map((instance) => ({
        ...instance,
        items: instance.items.map((entry) => entry.id === id ? { ...entry, completed } : entry),
      })),
    } : current);
    void operation(id, async () => {
      try {
        await updateChecklistItem(id, { completed });
      } catch (nextError) {
        if (!(isApiError(nextError) && nextError.status === 0)) {
          throw nextError;
        }
        await enqueueMakeReadyChecklistUpdate(item.id, id, { completed });
      }
    });
  };

  useEffect(() => {
    void refreshPendingSyncCount();
    const queueEventName = getOfflineSyncEventName();
    const handleQueueUpdate = () => { void refreshPendingSyncCount(); };
    window.addEventListener(queueEventName, handleQueueUpdate as EventListener);
    return () => window.removeEventListener(queueEventName, handleQueueUpdate as EventListener);
  }, [item.id, collaborationQuery.data]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (previewAttachmentId) {
        setPreviewAttachmentId(null);
        return;
      }
      if (attachmentGalleryOpen) {
        setAttachmentGalleryOpen(false);
        return;
      }
      onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [attachmentGalleryOpen, onClose, previewAttachmentId]);

  useEffect(() => {
    setAttachmentZoom(1);
  }, [previewAttachmentId]);

  const commit = async (key: string, value: unknown) => {
    setSaving(key);
    setError("");
    try {
      await onPatch(item.id, { [key]: value });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t(language, "drawer.updateFailed"));
    } finally {
      setSaving(null);
    }
  };
  const commitCustom = async (field: CustomField, value: unknown) => {
    setSaving(field.id);
    setError("");
    try {
      await onPatchCustomField(item.id, field.id, value);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t(language, "drawer.updateFailed"));
    } finally {
      setSaving(null);
    }
  };

  const renderAttachmentCard = (attachment: DrawerAttachment) => (
    <article key={attachment.id} className={attachment.mimeType.startsWith("image/") ? "attachment-card image" : "attachment-card"} data-testid="attachment-card">
      <div className="attachment-media-wrap">
        <AttachmentMedia attachment={attachment} onOpen={() => setPreviewAttachmentId(attachment.id)} language={language} />
      </div>
      <div className="attachment-card-summary">
        <div className="attachment-meta">
          <strong title={attachment.originalName}>{attachment.originalName}</strong>
          <small>{Math.ceil(attachment.sizeBytes / 1024)} KB / {attachment.uploaderName}</small>
          <small>{attachmentStageOptions.find((stage) => stage.value === (attachment.inspectionStage || "GENERAL"))?.label ?? t(language, "drawer.general")}{attachment.category ? ` / ${attachment.category}` : ""}{attachment.chargeCandidate ? ` / ${t(language, "drawer.chargeCandidate")}` : ""}</small>
          {attachment.chargeCandidate ? <small>{attachment.chargePriceSheetItem?.name ?? t(language, "drawer.noPriceSheetItem")} / {formatCents(attachment.chargeEstimatedCents)}</small> : null}
          {(attachment.markupAnnotations?.length ?? 0) > 0 ? <small>{attachment.markupAnnotations?.length} {t(language, "drawer.pinCount")}</small> : null}
        </div>
        <a className="button button-secondary attachment-download-button" data-testid="attachment-download-button" href={attachmentDownloadUrl(attachment.id)} download={attachment.originalName} aria-label={`${t(language, "drawer.download")} ${attachment.originalName}`}>
          {t(language, "drawer.download")}
        </a>
      </div>
      <details className="attachment-editor">
        <summary data-testid="attachment-editor-toggle">{t(language, "drawer.detailsAndNotes")}</summary>
        <div className="attachment-metadata-grid">
          <label>{t(language, "drawer.inspectionStage")}
            <select
              data-testid="attachment-stage-select"
              value={attachment.inspectionStage || "GENERAL"}
              disabled={!canCollaborate || (attachment.uploadedById !== currentUser.id && !canManageItems)}
              onChange={(event) => patchAttachmentMetadata(attachment.id, { inspectionStage: event.target.value })}
            >
              {attachmentStageOptions.filter((stage) => !["ALL", "NEEDS_CLASSIFICATION", "CHARGE_CANDIDATES"].includes(stage.value)).map((stage) => <option key={stage.value} value={stage.value}>{stage.label}</option>)}
            </select>
          </label>
          <label>{t(language, "drawer.category")}
            <input
              list="attachment-category-options"
              data-testid="attachment-category-input"
              defaultValue={attachment.category ?? ""}
              disabled={!canCollaborate || (attachment.uploadedById !== currentUser.id && !canManageItems)}
              placeholder={t(language, "drawer.damagePlaceholder")}
              onBlur={(event) => patchAttachmentMetadata(attachment.id, { category: event.target.value || null })}
            />
          </label>
          <label className="attachment-charge-toggle">
            <input
              data-testid="attachment-charge-toggle"
              type="checkbox"
              checked={attachment.chargeCandidate}
              disabled={!canCollaborate || (attachment.uploadedById !== currentUser.id && !canManageItems)}
              onChange={(event) => patchAttachmentMetadata(attachment.id, { chargeCandidate: event.target.checked })}
            />
            {t(language, "drawer.chargeCandidate")}
          </label>
          {attachment.chargeCandidate ? (
            <>
              <label>{t(language, "drawer.priceSheet")}
                <select
                  data-testid="attachment-charge-price-select"
                  value={attachment.chargePriceSheetItemId ?? ""}
                  disabled={!canCollaborate || (attachment.uploadedById !== currentUser.id && !canManageItems)}
                  onChange={(event) => {
                    const selected = chargePriceSheetQuery.data?.items.find((entry) => entry.id === event.target.value) ?? null;
                    patchAttachmentMetadata(attachment.id, {
                      chargePriceSheetItemId: selected?.id ?? null,
                      chargeEstimatedCents: selected?.defaultCents ?? attachment.chargeEstimatedCents ?? null,
                      chargeQuantity: selected ? attachment.chargeQuantity ?? 1 : attachment.chargeQuantity,
                    });
                  }}
                >
                  <option value="">{t(language, "drawer.noPriceSheetItem")}</option>
                  {(chargePriceSheetQuery.data?.items ?? []).filter((entry) => entry.isActive && !entry.isArchived).map((entry) => (
                    <option key={entry.id} value={entry.id}>{entry.name}{entry.defaultCents !== null ? ` (${formatCents(entry.defaultCents)})` : ""}</option>
                  ))}
                </select>
              </label>
              <label>{t(language, "drawer.quantity")}
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  data-testid="attachment-charge-quantity"
                  defaultValue={attachment.chargeQuantity ?? ""}
                  disabled={!canCollaborate || (attachment.uploadedById !== currentUser.id && !canManageItems)}
                  onBlur={(event) => patchAttachmentMetadata(attachment.id, { chargeQuantity: event.target.value ? Number(event.target.value) : null })}
                />
              </label>
              <label>{t(language, "drawer.estimate")}
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  data-testid="attachment-charge-estimate"
                  defaultValue={centsToDollars(attachment.chargeEstimatedCents)}
                  disabled={!canCollaborate || (attachment.uploadedById !== currentUser.id && !canManageItems)}
                  onBlur={(event) => patchAttachmentMetadata(attachment.id, { chargeEstimatedCents: event.target.value ? dollarsToCents(event.target.value) : null })}
                />
              </label>
            </>
          ) : null}
        </div>
        <label className="attachment-note">{t(language, "drawer.imageFileNote")}
          <textarea
            data-testid={`attachment-note-${attachment.id}`}
            defaultValue={attachment.note ?? ""}
            disabled={!canCollaborate || (attachment.uploadedById !== currentUser.id && !canManageItems)}
            placeholder={t(language, "drawer.chargeNotesPlaceholder")}
            onBlur={(event) => patchAttachmentMetadata(attachment.id, { note: event.target.value || null })}
          />
        </label>
        <label className="attachment-note">{t(language, "drawer.chargeRecoveryNote")}
          <textarea
            data-testid={`attachment-charge-note-${attachment.id}`}
            defaultValue={attachment.chargeNote ?? ""}
            disabled={!canCollaborate || (attachment.uploadedById !== currentUser.id && !canManageItems)}
            placeholder={t(language, "drawer.chargeContextPlaceholder")}
            onBlur={(event) => patchAttachmentMetadata(attachment.id, { chargeNote: event.target.value || null })}
          />
        </label>
        {canCollaborate && (attachment.uploadedById === currentUser.id || canManageItems) ? <button className="button button-ghost danger" type="button" onClick={() => void operation(`attachment-delete-${attachment.id}`, () => deleteItemAttachment(attachment.id))}>{t(language, "drawer.remove")}</button> : null}
      </details>
    </article>
  );

  return (
    <>
      <div className="item-drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="item-drawer" data-testid="item-drawer" aria-label={tWithVars(language, "drawer.detailsForUnit", { unit: item.unitNumber })}>
        <header className="item-drawer-header">
          <div>
            <span className="drawer-kicker">{item.property.code} / {boardGroupLabel(item.boardGroup, item.propertyId, boardSections)}</span>
            <h2>{item.unitNumber}</h2>
            <div className="drawer-pills">
              <LabelPill value={item.vacancyStatus} label={item.vacancyStatus ? labelsByField.vacancyStatus?.[item.vacancyStatus] : undefined} />
              <LabelPill value={item.makeReadyStatus} label={item.makeReadyStatus ? labelsByField.makeReadyStatus?.[item.makeReadyStatus] : undefined} />
              {item.riskLevel && item.riskLevel !== "NONE" ? <span className={`risk-level-badge ${item.riskLevel.toLowerCase()}`}>{item.riskLevel} risk / {item.riskScore}</span> : null}
            </div>
          </div>
          <button type="button" className="drawer-close" data-testid="item-drawer-close" onClick={onClose} aria-label={t(language, "drawer.closeDetails")}>×</button>
        </header>

        {error ? <p className="drawer-error" role="alert">{error}</p> : null}
        {pendingSyncCount ? <p className="drawer-empty" role="status">{t(language, "drawer.pendingSync").replace("{count}", String(pendingSyncCount))}</p> : null}
        <section className="drawer-section risk-drawer-section" data-testid="drawer-risk-section">
          <h3>{t(language, "drawer.slaRisk")}</h3>
          {item.riskLevel && item.riskLevel !== "NONE" ? (
            <>
              <p><strong className={`risk-level-badge ${item.riskLevel.toLowerCase()}`}>{item.riskLevel}</strong> Score {item.riskScore}{item.lastRiskEvaluatedAt ? ` / ${t(language, "drawer.evaluated")} ${formatDateTime(item.lastRiskEvaluatedAt)}` : ""}</p>
              <ul className="risk-reason-list">
                {(item.riskReasons ?? []).map((reason, index) => <li key={`${reason.category}-${index}`}><strong>{reason.category.replace(/_/g, " ")}</strong><span>{reason.message}</span></li>)}
              </ul>
            </>
          ) : <p className="drawer-empty">{t(language, "drawer.noActiveRiskFlags")}</p>}
        </section>
        <section className="drawer-section">
          <h3>{t(language, "drawer.turnDetails")}</h3>
          <div className="drawer-fields">
            {drawerColumns.map((column) => {
              const value = item[column.key as keyof MakeReadyItem];
              const editable = column.type !== "readonly" && canEditField(item, column.key);
              const busy = saving === column.key;
              if (column.type === "floorplan") {
                const currentPlan = floorPlans.find((plan) => plan.id === item.unit?.floorPlanId) ?? item.unit?.floorPlanRecord ?? undefined;
                const legacy = Boolean(item.floorPlan && !currentPlan);
                const options = floorPlans.filter((plan) => plan.propertyId === item.propertyId && (plan.isActive || plan.id === currentPlan?.id));
                return (
                  <label className="drawer-field" key={column.key}>
                    <span>{column.label}{legacy ? ` / ${t(language, "drawer.legacy")}` : ""}</span>
                    <select
                      data-testid={`drawer-field-${column.key}`}
                      value={currentPlan?.id ?? ""}
                      disabled={!editable || busy || !item.unitId}
                      onChange={async (event) => {
                        if (!event.target.value) return;
                        setSaving(column.key);
                        try {
                          await onAssignFloorPlan(item, event.target.value);
                        } finally {
                          setSaving(null);
                        }
                      }}
                    >
                      <option value="">{legacy ? `${t(language, "drawer.legacy")}: ${item.floorPlan}` : t(language, "drawer.selectManagedFloorPlan")}</option>
                      {options.map((plan) => <option key={plan.id} value={plan.id}>{floorPlanLabel(plan)} / {plan.bedrooms ?? "-"} bd / {plan.bathrooms ?? "-"} ba / {plan.squareFeet ?? "-"} sqft</option>)}
                    </select>
                    {currentPlan?.description ? <small>{currentPlan.description}</small> : null}
                  </label>
                );
              }
              if (column.type === "label") {
                const options = Object.values(labelsByField[column.key] ?? {}).filter((option) => !option.isArchived || option.value === value);
                return (
                  <label className="drawer-field" key={column.key}>
                    <span>{column.label}</span>
                    <select data-testid={`drawer-field-${column.key}`} value={typeof value === "string" ? value : ""} disabled={!editable || busy} onChange={(event) => void commit(column.key, event.target.value || null)}>
                      <option value="">{t(language, "drawer.unset")}</option>
                      {options.map((option) => <option key={option.id} value={option.value}>{option.value}{option.isArchived ? " (archived)" : ""}</option>)}
                    </select>
                  </label>
                );
              }
              if (column.type === "assignee") {
                const legacy = typeof value === "string" && value && !staff.some((person) => person.fullName === value);
                return (
                  <label className="drawer-field" key={column.key}>
                    <span>{column.label}</span>
                    <select data-testid={`drawer-field-${column.key}`} value={typeof value === "string" ? value : ""} disabled={!editable || busy} onChange={(event) => void commit(column.key, event.target.value || null)}>
                      <option value="">{t(language, "drawer.unassigned")}</option>
                      {legacy ? <option value={String(value)}>{String(value)} (legacy)</option> : null}
                      {staff.map((person) => <option key={person.id} value={person.fullName}>{person.fullName} - {person.role}</option>)}
                    </select>
                  </label>
                );
              }
              return (
                <label className="drawer-field" key={column.key}>
                  <span>{column.label}{busy ? ` / ${t(language, "drawer.saving")}` : ""}</span>
                  <input
                    key={`${column.key}:${String(value ?? "")}`}
                    data-testid={`drawer-field-${column.key}`}
                    type={column.type === "date" ? "date" : "text"}
                    defaultValue={column.type === "date" ? dateValue(value) : String(value ?? "")}
                    disabled={!editable || busy}
                    onBlur={(event) => void commit(column.key, event.target.value || null)}
                  />
                </label>
              );
            })}
          </div>
        </section>

        <section className="drawer-section">
          <h3>{t(language, "drawer.customFields")}</h3>
          {customFields.length === 0 ? <p className="drawer-empty">{t(language, "drawer.noCustomFields")}</p> : (
            <div className="drawer-fields">
              {customFields.filter((field) => !field.isArchived).map((field) => {
                const value = customValue(item, field.id);
                const busy = saving === field.id;
                if (field.fieldType === "SINGLE_SELECT") return (
                  <label className="drawer-field" key={field.id}>
                    <span>{field.label}</span>
                    <select value={typeof value === "string" ? value : ""} disabled={!canEditCustomFields || busy} onChange={(event) => void commitCustom(field, event.target.value || null)}>
                      <option value="">{t(language, "drawer.unset")}</option>
                      {field.options.filter((option) => !option.isArchived || option.label === value).map((option) => <option key={option.id} value={option.label}>{option.label}</option>)}
                    </select>
                  </label>
                );
                if (field.fieldType === "MULTI_SELECT") {
                  const selected = Array.isArray(value) ? value.map(String) : [];
                  return (
                    <label className="drawer-field" key={field.id}>
                      <span>{field.label}</span>
                      <select
                        multiple
                        value={selected}
                        disabled={!canEditCustomFields || busy}
                        onChange={(event) => void commitCustom(field, Array.from(event.target.selectedOptions, (option) => option.value))}
                      >
                        {field.options.filter((option) => !option.isArchived || selected.includes(option.label)).map((option) => (
                          <option key={option.id} value={option.label}>{option.label}{option.isArchived ? " (archived)" : ""}</option>
                        ))}
                      </select>
                    </label>
                  );
                }
                if (field.fieldType === "BOOLEAN") return (
                  <label className="drawer-field" key={field.id}>
                    <span>{field.label}</span>
                    <select value={typeof value === "boolean" ? String(value) : ""} disabled={!canEditCustomFields || busy} onChange={(event) => void commitCustom(field, event.target.value === "" ? null : event.target.value === "true")}>
                      <option value="">{t(language, "drawer.unset")}</option><option value="true">{t(language, "drawer.yes")}</option><option value="false">{t(language, "drawer.no")}</option>
                    </select>
                  </label>
                );
                return (
                  <label className="drawer-field" key={field.id}>
                    <span>{field.label}</span>
                    <input key={`${field.id}:${String(value ?? "")}`} type={field.fieldType === "DATE" ? "date" : field.fieldType === "NUMBER" ? "number" : "text"} defaultValue={field.fieldType === "DATE" ? dateValue(value) : String(value ?? "")} disabled={!canEditCustomFields || busy} onBlur={(event) => void commitCustom(field, event.target.value || null)} />
                  </label>
                );
              })}
            </div>
          )}
        </section>

        <section className="drawer-section completion-section" data-testid="drawer-completion-section">
          <h3>{t(language, "drawer.completionFinalWalk")}</h3>
          <p className="drawer-empty">
            {t(language, "drawer.completionHelp")}
          </p>
          {readinessBlockers.length > 0 ? (
            <div className="completion-warning" role="status">
              <strong>{t(language, "drawer.readinessWarnings")}</strong>
              <ul>
                {readinessBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
              </ul>
            </div>
          ) : (
            <div className="completion-ready" role="status">{t(language, "drawer.noReadinessBlockers")}</div>
          )}
          <div className="drawer-fields">
            <label className="drawer-field">
              <span>{t(language, "drawer.completed")}{saving === "completionStatus" ? ` / ${t(language, "drawer.saving")}` : ""}</span>
              <select
                data-testid="drawer-field-completionStatus"
                value={item.completionStatus ?? ""}
                disabled={!canEditField(item, "completionStatus") || saving === "completionStatus"}
                onChange={(event) => void commit("completionStatus", event.target.value || null)}
              >
                <option value="">{t(language, "drawer.unset")}</option>
                {completionOptions.map((option) => <option key={option.id} value={option.value}>{option.value}{option.isArchived ? " (archived)" : ""}</option>)}
              </select>
            </label>
          </div>
          {canManageItems ? (
            <button
              className="button button-primary"
              data-testid="drawer-mark-ready"
              type="button"
              disabled={saving === "markReady"}
              onClick={async () => {
                setSaving("markReady");
                setError("");
                try {
                  await onMarkReady(item.id);
                } catch (nextError) {
                  setError(nextError instanceof Error ? nextError.message : t(language, "drawer.couldNotMarkReady"));
                } finally {
                  setSaving(null);
                }
              }}
            >
              {saving === "markReady" ? t(language, "drawer.markingReady") : t(language, "drawer.managerSignoffMarkReady")}
            </button>
          ) : null}
        </section>

        <section className="drawer-section" data-testid="drawer-planning-summary">
          <div className="drawer-section-title"><h3>{t(language, "drawer.inHousePlanning")}</h3><span className="muted">{t(language, "drawer.blocksCount").replace("{count}", String(itemWorkBlocks.length)).replace("{suffix}", itemWorkBlocks.length === 1 ? "" : "s")}</span></div>
          {itemWorkBlocks.length === 0 ? <p className="drawer-empty">{t(language, "drawer.noInHousePlanning")}</p> : (
            <div className="attachment-list">
              {itemWorkBlocks.map((block) => (
                <div key={block.id} className="attachment-row vendor-assignment-row">
                  <strong>{block.category} / {block.assignedUser.fullName}</strong>
                  <small>{block.plannedDate.slice(0, 10)} / {block.status}</small>
                  {block.notes ? <small>{block.notes}</small> : null}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="drawer-section" data-testid="drawer-wiki-context">
          <PropertyWikiWorkflowPanel
            title={t(language, "drawer.wikiTitle")}
            module="MAKE_READY"
            propertyId={item.propertyId}
            recordType="MAKE_READY_ITEM"
            recordId={item.id}
            floorPlan={item.unit?.floorPlan ?? item.floorPlan}
            unitNumber={item.unit?.number ?? item.unitNumber}
            building={item.unit?.building}
            equipmentQuery={item.itemName}
            query={item.notes}
            canEdit={currentUser.role === "ADMIN" || currentUser.role === "MANAGER" || currentUser.role === "TECH" || currentUser.role === "LEASING"}
          />
        </section>

        <section className="drawer-section" data-testid="drawer-pest-context">
          <div className="drawer-section-title">
            <h3>{t(language, "drawer.pestControl")}</h3>
            <span className="muted">{t(language, "drawer.linkedCount").replace("{count}", String(linkedPestIssuesQuery.data?.issues.length ?? 0))}</span>
          </div>
          <div className="drawer-actions" style={{ marginBottom: 12 }}>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => openPestQuickAdd({
                propertyId: item.propertyId,
                unitId: item.unitId ?? undefined,
                makeReadyItemId: item.id,
                area: item.unit?.area ?? undefined,
                source: "Make Ready",
                priority: item.moveInSoon || item.overdue ? "High" : "Normal",
                description: item.notes ?? undefined,
              })}
            >
              {t(language, "drawer.createPestRequest")}
            </button>
            <button
              type="button"
              className="button button-ghost"
              onClick={() => openPestWorkspace({ propertyId: item.propertyId, tab: "make-ready", makeReadyItemId: item.id })}
            >
              {t(language, "drawer.openLinkedPest")}
            </button>
          </div>
          {linkedPestIssuesQuery.isLoading ? <p className="drawer-empty">{t(language, "drawer.loadingLinkedPest")}</p> : linkedPestIssuesQuery.isError ? (
            <p className="drawer-empty">{t(language, "drawer.linkedPestLoadFailed")}</p>
          ) : !(linkedPestIssuesQuery.data?.issues.length) ? (
            <p className="drawer-empty">{t(language, "drawer.noLinkedPest")}</p>
          ) : (
            <div className="attachment-list">
              {linkedPestIssuesQuery.data?.issues.slice(0, 4).map((issue) => (
                <div key={issue.id} className="attachment-row vendor-assignment-row">
                  <strong>{issue.pestType}{issue.additionalPestType ? ` / ${issue.additionalPestType}` : ""}</strong>
                  <small>{issue.status} / {issue.priority} / {issue.requestDate.slice(0, 10)}</small>
                  <small>{issue.area ?? issue.unit?.number ?? item.unitNumber}{issue.followUpDate ? ` / ${t(language, "drawer.followUpDateShort").replace("{date}", issue.followUpDate.slice(0, 10))}` : ""}</small>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="drawer-section" data-testid="drawer-vendor-assignments">
          <div className="drawer-section-title"><h3>{t(language, "drawer.vendorWork")}</h3><span className="muted">{t(language, "drawer.assignmentCount").replace("{count}", String(itemVendorAssignments.length)).replace("{suffix}", itemVendorAssignments.length === 1 ? "" : "s")}</span></div>
          {itemVendorAssignments.length === 0 ? <p className="drawer-empty">{t(language, "drawer.noVendorWork")}</p> : (
            <div className="attachment-list">
              {itemVendorAssignments.map((assignment) => (
                <div key={assignment.id} className="attachment-row vendor-assignment-row">
                  <strong>{assignment.vendor.name} / {assignment.trade}</strong>
                  <small>{t(language, "drawer.scheduled")} {assignment.scheduledDate?.slice(0, 10) ?? t(language, "drawer.notSet")} / {t(language, "drawer.due")} {assignment.dueDate?.slice(0, 10) ?? t(language, "drawer.notSet")}</small>
                  <select disabled={!canUpdateVendorWork || saving === assignment.id} value={assignment.status} onChange={(event) => void operation(assignment.id, () => onUpdateVendorAssignment(assignment.id, { status: event.target.value as VendorAssignment["status"] }))}>
                    <option value="REQUESTED">{t(language, "drawer.requested")}</option>
                    <option value="SCHEDULED">{t(language, "drawer.scheduled")}</option>
                    <option value="IN_PROGRESS">{t(language, "drawer.inProgress")}</option>
                    <option value="COMPLETED">{t(language, "drawer.completedStatus")}</option>
                    <option value="CANCELED">{t(language, "drawer.canceled")}</option>
                    <option value="FOLLOW_UP_NEEDED">{t(language, "drawer.followUpNeeded")}</option>
                  </select>
                </div>
              ))}
            </div>
          )}
          {canManageVendorWork ? (
            <form className="compact-form" data-testid="drawer-vendor-assignment-form" onSubmit={(event) => {
              event.preventDefault();
              if (!vendorDraft.vendorId || !vendorDraft.trade.trim()) return;
              void operation("vendor-assignment", async () => {
                await onCreateVendorAssignment({
                  vendorId: vendorDraft.vendorId,
                  itemId: item.id,
                  trade: vendorDraft.trade,
                  status: "SCHEDULED",
                  scheduledDate: vendorDraft.scheduledDate || null,
                  dueDate: vendorDraft.dueDate || null,
                  notes: vendorDraft.notes || null,
                });
                setVendorDraft({ vendorId: "", trade: "", scheduledDate: "", dueDate: "", notes: "" });
              });
            }}>
              <select data-testid="drawer-vendor-select" value={vendorDraft.vendorId} onChange={(event) => {
                const vendor = vendors.find((entry) => entry.id === event.target.value);
                setVendorDraft((current) => ({ ...current, vendorId: event.target.value, trade: vendor?.trade ?? current.trade }));
              }}>
                <option value="">{t(language, "drawer.assignVendor")}</option>
                {vendors.filter((vendor) => vendor.isActive).map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name} / {vendor.trade}</option>)}
              </select>
              <input value={vendorDraft.trade} onChange={(event) => setVendorDraft((current) => ({ ...current, trade: event.target.value }))} placeholder={t(language, "drawer.tradePlaceholder")} />
              <label>{t(language, "drawer.scheduled")}<input type="date" value={vendorDraft.scheduledDate} onChange={(event) => setVendorDraft((current) => ({ ...current, scheduledDate: event.target.value }))} /></label>
              <label>{t(language, "drawer.due")}<input type="date" value={vendorDraft.dueDate} onChange={(event) => setVendorDraft((current) => ({ ...current, dueDate: event.target.value }))} /></label>
              <textarea value={vendorDraft.notes} onChange={(event) => setVendorDraft((current) => ({ ...current, notes: event.target.value }))} placeholder={t(language, "drawer.vendorNotesPlaceholder")} />
              <button className="button button-secondary" data-testid="drawer-vendor-assignment-submit" disabled={!vendorDraft.vendorId || !vendorDraft.trade.trim()}>{t(language, "drawer.addVendorWork")}</button>
            </form>
          ) : null}
        </section>

        <section className="drawer-section">
          <h3>{t(language, "drawer.notesUpdates")}</h3>
          <textarea key={`notes:${item.notes ?? ""}`} data-testid="drawer-notes" defaultValue={item.notes ?? ""} disabled={!canEditField(item, "notes")} placeholder={t(language, "drawer.operationalNotes")} onBlur={(event) => void commit("notes", event.target.value || null)} />
          {canCollaborate ? (
            <form className="comment-compose" data-testid="comment-compose" onSubmit={(event) => {
              event.preventDefault();
              if (!commentText.trim()) return;
              void operation("comment", async () => {
                try {
                  if (editingCommentId) await updateItemComment(item.id, editingCommentId, commentText);
                  else await createItemComment(item.id, commentText);
                } catch (nextError) {
                  if (!(isApiError(nextError) && nextError.status === 0)) {
                    throw nextError;
                  }
                  if (editingCommentId) {
                    queryClient.setQueryData<ItemCollaboration>(["collaboration", item.id], (current) => current ? {
                      ...current,
                      comments: current.comments.map((comment) => comment.id === editingCommentId ? { ...comment, body: commentText, editedAt: new Date().toISOString() } : comment),
                    } : current);
                    await enqueueMakeReadyCommentUpdate(item.id, editingCommentId, commentText);
                  } else {
                    queryClient.setQueryData<ItemCollaboration>(["collaboration", item.id], (current) => current ? {
                      ...current,
                      comments: [
                        {
                          id: nextOfflineCommentId(),
                          body: commentText,
                          authorName: currentUser.fullName,
                          authorUserId: currentUser.id,
                          category: "GENERAL",
                          createdAt: new Date().toISOString(),
                          editedAt: null,
                        },
                        ...current.comments,
                      ],
                    } : current);
                    await enqueueMakeReadyCommentCreate(item.id, commentText);
                  }
                }
                setCommentText("");
                setEditingCommentId(null);
              });
            }}>
              <label><span className="sr-only">{t(language, "drawer.addOperationalUpdate")}</span>
                <textarea data-testid="comment-input" value={commentText} onChange={(event) => setCommentText(event.target.value)} placeholder={t(language, "drawer.updatePlaceholder")} />
              </label>
              <div>
                {editingCommentId ? <button className="button button-ghost" type="button" onClick={() => { setEditingCommentId(null); setCommentText(""); }}>{t(language, "drawer.cancelEdit")}</button> : null}
                <button className="button button-primary" data-testid="comment-submit" disabled={!commentText.trim() || saving === "comment"}>{editingCommentId ? t(language, "drawer.saveUpdate") : t(language, "drawer.postUpdate")}</button>
              </div>
            </form>
          ) : null}
          {collaborationQuery.isLoading ? <p className="drawer-empty">{t(language, "drawer.loadingUpdates")}</p> : !collaborationQuery.data?.comments.length ? <p className="drawer-empty">{t(language, "drawer.noUpdates")}</p> : (
            <div className="comment-list" data-testid="comment-list">
              {collaborationQuery.data.comments.map((comment) => (
                <article key={comment.id} className="comment-card">
                  <header><strong>{comment.authorName}</strong><time>{formatDateTime(comment.createdAt)}{comment.editedAt ? ` / ${t(language, "drawer.edited")}` : ""}</time></header>
                  <p>{comment.body}</p>
                  {canCollaborate && !comment.id.startsWith("offline-comment-") && (comment.authorUserId === currentUser.id || canManageItems) ? (
                    <div className="comment-actions">
                      <button type="button" className="button button-ghost" onClick={() => { setEditingCommentId(comment.id); setCommentText(comment.body); }}>{t(language, "drawer.edit")}</button>
                      <button type="button" className="button button-ghost danger" onClick={() => void operation(`comment-delete-${comment.id}`, async () => {
                        queryClient.setQueryData<ItemCollaboration>(["collaboration", item.id], (current) => current ? {
                          ...current,
                          comments: current.comments.filter((entry) => entry.id !== comment.id),
                        } : current);
                        try {
                          await deleteItemComment(item.id, comment.id);
                        } catch (nextError) {
                          if (!(isApiError(nextError) && nextError.status === 0)) {
                            throw nextError;
                          }
                          await enqueueMakeReadyCommentDelete(item.id, comment.id);
                        }
                      })}>{t(language, "drawer.remove")}</button>
                    </div>
                  ) : null}
                  {comment.id.startsWith("offline-comment-") ? <small>{t(language, "drawer.pendingCommentSync")}</small> : null}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="drawer-section" data-testid="drawer-attachments">
          <div className="drawer-section-title"><h3>{t(language, "drawer.photosAttachments")}</h3>{canCollaborate ? (
            <label className="button button-secondary file-action">
              {t(language, "drawer.uploadPhotosFiles")}
              <input data-testid="attachment-upload" type="file" multiple accept={attachmentAccept} onChange={(event) => {
                uploadFiles(event.target.files);
                event.target.value = "";
              }} />
            </label>
          ) : null}</div>
          <div className="attachment-workflow-summary">
            <span><strong>{attachments.length}</strong> {t(language, "drawer.files")}</span>
            <span><strong>{imageCount}</strong> {t(language, "drawer.images")}</span>
            <span><strong>{chargeCount}</strong> {t(language, "drawer.chargeCandidates")}</span>
            <span><strong>{needsClassification.length}</strong> {t(language, "drawer.needClassification")}</span>
            <span>{t(language, "drawer.galleryHelp")}</span>
          </div>
          {attachments.length ? (
            <div className="attachment-stage-filter" data-testid="attachment-stage-filter">
              {attachmentStageOptions.map((stage) => {
                const count = stage.value === "ALL"
                  ? attachments.length
                  : stage.value === "NEEDS_CLASSIFICATION"
                    ? needsClassification.length
                    : stage.value === "CHARGE_CANDIDATES"
                      ? chargeCount
                      : attachments.filter((attachment) => (attachment.inspectionStage || "GENERAL") === stage.value).length;
                return (
                  <button key={stage.value} type="button" className={attachmentStageFilter === stage.value ? "active" : ""} onClick={() => setAttachmentStageFilter(stage.value)}>
                    {stage.label} <span>{count}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
          {!attachments.length ? <p className="drawer-empty">{t(language, "drawer.noLocalFiles")}</p> : filteredAttachments.length === 0 ? <p className="drawer-empty">{t(language, "drawer.noFilesMatchStage")}</p> : (
            <div className="attachment-drawer-preview">
              <div className="attachment-thumb-strip">
                {recentAttachments.map((attachment) => (
                  <button key={attachment.id} type="button" className="attachment-thumb" onClick={() => setAttachmentGalleryOpen(true)} title={attachment.originalName}>
                    {attachment.mimeType.startsWith("image/") ? <img src={attachmentDownloadUrl(attachment.id)} alt="" loading="lazy" /> : <span>{attachment.originalName.split(".").pop()?.toUpperCase() || "FILE"}</span>}
                  </button>
                ))}
              </div>
              <button type="button" className="button button-primary" data-testid="attachment-gallery-open" onClick={() => setAttachmentGalleryOpen(true)}>
                {t(language, "drawer.openInspectionGallery")}
              </button>
              {chargeCount ? (
                <a className="button button-secondary" data-testid="attachment-charge-package-download" href={attachmentArchiveUrl(item.id, { stage: "CHARGE_CANDIDATES" })} download={`${item.unitNumber}-charge-candidates.zip`}>
                  {t(language, "drawer.downloadChargePackage")}
                </a>
              ) : null}
              <p className="drawer-empty">{filteredAttachments.length > recentAttachments.length ? tWithVars(language, "drawer.moreFilesInFilter", { count: filteredAttachments.length - recentAttachments.length }) : ""}{t(language, "drawer.classifyPhotosHelp")}</p>
            </div>
          )}
          <datalist id="attachment-category-options">
            {attachmentCategoryOptions.map((category) => <option key={category} value={category} />)}
          </datalist>
        </section>

        <section className="drawer-section" data-testid="drawer-checklists">
          <h3>{t(language, "drawer.checklists")}</h3>
          {canManageItems ? (
            <div className="checklist-attach">
              <select data-testid="checklist-template-select" value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
                <option value="">{t(language, "drawer.attachTemplate")}</option>
                {collaborationQuery.data?.templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
              <button className="button button-secondary" data-testid="checklist-attach" type="button" disabled={!templateId} onClick={() => void operation("attach-checklist", async () => {
                const selectedTemplate = collaborationQuery.data?.templates.find((template) => template.id === templateId) ?? null;
                try {
                  await attachChecklist(item.id, templateId);
                } catch (nextError) {
                  if (!(isApiError(nextError) && nextError.status === 0)) {
                    throw nextError;
                  }
                  if (selectedTemplate) {
                    queryClient.setQueryData<ItemCollaboration>(["collaboration", item.id], (current) => current ? {
                      ...current,
                      checklistInstances: [
                        ...current.checklistInstances,
                        {
                          id: `offline-checklist-${Date.now()}`,
                          name: `${selectedTemplate.name} (${t(language, "drawer.pendingChecklistSync")})`,
                          items: selectedTemplate.items.map((entry) => ({
                            id: `offline-checklist-item-${entry.id}`,
                            title: entry.label,
                            notes: entry.notes,
                            required: entry.required,
                            completed: false,
                            completedAt: null,
                            completedBy: null,
                          })),
                        },
                      ],
                    } : current);
                  }
                  await enqueueMakeReadyChecklistAttach(item.id, templateId);
                }
                setTemplateId("");
              })}>{t(language, "drawer.attach")}</button>
            </div>
          ) : null}
          {collaborationQuery.data?.checklistInstances.map((instance) => {
            const completed = instance.items.filter((entry) => entry.completed).length;
            const percent = instance.items.length ? Math.round(completed / instance.items.length * 100) : 0;
            return (
              <article className="checklist-instance" key={instance.id}>
                <header><strong>{instance.name}</strong><span>{completed}/{instance.items.length} / {percent}%</span></header>
                <progress value={completed} max={instance.items.length || 1} />
                {instance.items.map((entry) => (
                  <label key={entry.id} className={entry.completed ? "checklist-row done" : "checklist-row"}>
                    <input type="checkbox" data-testid={`checklist-item-${entry.id}`} checked={entry.completed} disabled={!canCollaborate || saving === entry.id} onChange={(event) => toggleChecklistItem(entry.id, event.target.checked)} />
                    <span>{entry.title}{entry.required ? " *" : ""}</span>
                    {entry.completedBy ? <small>{entry.completedBy.fullName}</small> : null}
                  </label>
                ))}
              </article>
            );
          })}
          {!collaborationQuery.data?.checklistInstances.length ? <p className="drawer-empty">{t(language, "drawer.noChecklist")}</p> : null}
          {canManageItems ? (
            <details className="template-quick-create">
              <summary>{language === "es" ? "Crear plantilla" : "Create template"}</summary>
              <input data-testid="checklist-template-name" value={newTemplateName} onChange={(event) => setNewTemplateName(event.target.value)} placeholder={t(language, "drawer.templateNamePlaceholder")} />
              <textarea data-testid="checklist-template-items" value={newTemplateItems} onChange={(event) => setNewTemplateItems(event.target.value)} placeholder={t(language, "drawer.templateItemsPlaceholder")} />
              <button className="button button-secondary" type="button" disabled={!newTemplateName.trim() || !newTemplateItems.trim()} onClick={() => void operation("new-template", async () => {
                await createChecklistTemplate({ propertyId: item.propertyId, name: newTemplateName, items: newTemplateItems.split("\n").map((title) => title.trim()).filter(Boolean).map((title) => ({ title })) });
                setNewTemplateName("");
                setNewTemplateItems("");
              })}>{language === "es" ? "Crear plantilla" : "Create template"}</button>
            </details>
          ) : null}
        </section>

        <section className="drawer-section" data-testid="unit-history-section">
          <h3>{t(language, "drawer.unitHistory")}</h3>
          {!item.unitId ? <p className="drawer-empty">{t(language, "drawer.turnNotLinked")}</p> : historyQuery.isLoading ? (
            <StatusState title={t(language, "drawer.loadingUnitHistory")} description={t(language, "drawer.loadingUnitHistoryCopy")} tone="subtle" />
          ) : historyQuery.isError ? (
            <p className="drawer-empty">{t(language, "drawer.unitHistoryLoadFailed")}</p>
          ) : (
            <>
              <div className="analytics-metrics">
                <span><strong>{historyQuery.data?.turns.length ?? 0}</strong> {t(language, "drawer.turns")}</span>
                <span><strong>{historyQuery.data?.recurringSignals.highRisk ?? 0}</strong> {t(language, "drawer.highRisk")}</span>
                <span><strong>{historyQuery.data?.recurringSignals.vendor ?? 0}</strong> {t(language, "drawer.vendorBacked")}</span>
              </div>
              <div className="turn-history-list">
                {historyQuery.data?.turns.slice(0, 4).map((turn) => (
                  <div className="drawer-timeline-row" key={turn.itemId}>
                    <strong>{turn.current ? t(language, "drawer.currentTurn") : t(language, "drawer.previousTurn")} / {turn.riskLevel}</strong>
                    <span>{t(language, "drawer.created")} {new Date(turn.createdAt).toLocaleDateString()} / {t(language, "drawer.duration")} {turn.turnDuration ?? "-"} {t(language, "drawer.days")} / Checklist {turn.checklistCompletionPercent}%</span>
                  </div>
                ))}
              </div>
              <div className="drawer-timeline unit-history-timeline">
                {historyQuery.data?.events.slice(0, 16).map((entry, index) => (
                  <div key={`${entry.type}-${entry.occurredAt}-${index}`} className="drawer-timeline-row">
                    <strong>{entry.title}</strong>
                    <span>{entry.description} / {formatDateTime(entry.occurredAt)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {canManageItems ? (
          <section className="drawer-section">
            <h3>{t(language, "drawer.quickActions")}</h3>
            <div className="drawer-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => openPestQuickAdd({
                  propertyId: item.propertyId,
                  unitId: item.unitId ?? undefined,
                  makeReadyItemId: item.id,
                  area: item.unit?.area ?? undefined,
                  source: "Make Ready",
                  priority: item.moveInSoon || item.overdue ? "High" : "Normal",
                  description: item.notes ?? undefined,
                })}
              >
                {t(language, "drawer.pestRequest")}
              </button>
              <label>{t(language, "drawer.moveSection")}
                <select data-testid="drawer-move-section" value={item.boardGroup} onChange={(event) => void onBatch({ action: "MOVE_GROUP", ids: [item.id], boardGroup: event.target.value })}>
                  {boardGroups.map((group) => <option key={group} value={group}>{boardGroupLabel(group, item.propertyId, boardSections)}</option>)}
                </select>
              </label>
              <button className={item.isArchived ? "button button-secondary" : "button button-danger"} data-testid="drawer-archive-toggle" onClick={() => void onBatch({ action: item.isArchived ? "RESTORE" : "ARCHIVE", ids: [item.id] })}>{item.isArchived ? t(language, "drawer.restoreItem") : t(language, "drawer.archiveItem")}</button>
            </div>
          </section>
        ) : null}

        <section className="drawer-section drawer-timeline">
          <h3>{t(language, "drawer.activity")}</h3>
          {!canViewActivity ? <p className="drawer-empty">{t(language, "drawer.activityVisibleManagers")}</p> : activityQuery.isLoading ? (
            <StatusState title={t(language, "drawer.loadingActivity")} description={t(language, "drawer.loadingActivityCopy")} tone="subtle" />
          ) : (activityQuery.data?.activity.length ?? 0) === 0 ? <p className="drawer-empty">{t(language, "drawer.noRecordedActivity")}</p> : (
            activityQuery.data?.activity.map((record) => (
              <div key={record.id} className="drawer-timeline-row">
                <strong>{record.description}</strong>
                <span>{record.actor?.fullName ?? t(language, "drawer.system")} / {formatDateTime(record.createdAt)}</span>
              </div>
            ))
          )}
          {canViewActivity && (runsQuery.data?.runs.length ?? 0) > 0 ? (
            <>
              <h3>{t(language, "drawer.automationHistory")}</h3>
              {runsQuery.data?.runs.map((run) => <div key={run.id} className="drawer-timeline-row"><strong>{run.rule.name}</strong><span>{run.message} / {formatDateTime(run.ranAt)}</span></div>)}
            </>
          ) : null}
        </section>
      </aside>
      <Modal open={attachmentGalleryOpen} title={`${item.unitNumber} Inspection Gallery`} onClose={() => setAttachmentGalleryOpen(false)} testId="attachment-gallery-modal">
        <div className="inspection-gallery-toolbar">
          <div className="attachment-workflow-summary">
            <span><strong>{attachments.length}</strong> {t(language, "drawer.files")}</span>
            <span><strong>{imageCount}</strong> {t(language, "drawer.images")}</span>
            <span><strong>{chargeCount}</strong> {t(language, "drawer.chargeCandidates")}</span>
            <span><strong>{needsClassification.length}</strong> {t(language, "drawer.needClassification")}</span>
          </div>
          {canCollaborate ? (
            <label className="button button-secondary file-action">
              {t(language, "drawer.uploadMultiple")}
              <input data-testid="attachment-gallery-upload" type="file" multiple accept={attachmentAccept} onChange={(event) => {
                uploadFiles(event.target.files);
                event.target.value = "";
              }} />
            </label>
          ) : null}
          {filteredAttachments.length && attachmentStageFilter !== "NEEDS_CLASSIFICATION" ? (
            <a
              className="button button-secondary"
              data-testid="attachment-gallery-download-zip"
              href={attachmentArchiveUrl(item.id, { stage: attachmentStageFilter })}
              download={`${item.unitNumber}-${attachmentStageFilter.toLowerCase()}-attachments.zip`}
            >
              {t(language, "drawer.download")} {attachmentStageFilter === "ALL" ? t(language, "drawer.allPhotosFiles") : activeStageLabel} ZIP
            </a>
          ) : null}
        </div>
        <div className="attachment-stage-filter" data-testid="attachment-gallery-stage-filter">
          {attachmentStageOptions.map((stage) => {
            const count = stage.value === "ALL"
              ? attachments.length
              : stage.value === "NEEDS_CLASSIFICATION"
                ? needsClassification.length
                : stage.value === "CHARGE_CANDIDATES"
                  ? chargeCount
                  : attachments.filter((attachment) => (attachment.inspectionStage || "GENERAL") === stage.value).length;
            return (
              <button key={stage.value} type="button" className={attachmentStageFilter === stage.value ? "active" : ""} onClick={() => setAttachmentStageFilter(stage.value)}>
                {stage.label} <span>{count}</span>
              </button>
            );
          })}
        </div>
        <div className="inspection-gallery-help">{t(language, "drawer.galleryHelp")}</div>
        <div className={chargeCandidatesMissingContext.length ? "inspection-evidence-panel warning" : "inspection-evidence-panel"} data-testid="inspection-evidence-panel">
          <div>
            <strong>{t(language, "drawer.evidencePackage")}</strong>
            <span>
              {chargeCount || chargePinCount ? `${chargeCount} ${t(language, "drawer.fileCount")} / ${chargePinCount} ${t(language, "drawer.pinCount")}` : t(language, "drawer.noChargeCandidatesMarked")}
              {chargeCandidatesMissingContext.length ? ` / ${chargeCandidatesMissingContext.length} ${t(language, "drawer.needPricingOrNotes")}` : ""}
              {` / ${t(language, "drawer.estimateTotal")} ${formatCents(chargeEstimateTotal)}`}
            </span>
          </div>
          <div className="inspection-evidence-actions">
            <button type="button" className="button button-secondary" data-testid="charge-report-open" onClick={() => setChargeReportOpen(true)}>
              {t(language, "drawer.openChargeReport")}
            </button>
            <button type="button" className="button button-ghost" onClick={() => setAttachmentStageFilter("CHARGE_CANDIDATES")}>{t(language, "drawer.reviewChargeCandidates")}</button>
            {chargeCount ? (
              <a className="button button-secondary" data-testid="attachment-gallery-charge-zip" href={attachmentArchiveUrl(item.id, { stage: "CHARGE_CANDIDATES" })} download={`${item.unitNumber}-charge-candidates.zip`}>
                {t(language, "drawer.downloadChargeZip")}
              </a>
            ) : null}
          </div>
        </div>
        <div className="inspection-price-sheet-panel" data-testid="inspection-price-sheet-panel">
          <div>
            <strong>{t(language, "drawer.propertyPriceSheet")}</strong>
            <span>{chargePriceSheetQuery.data?.items.length ?? 0} {t(language, "drawer.estimateOptionsForProperty")}</span>
          </div>
          {canManageChargePriceSheet ? (
            <div className="inspection-price-sheet-form">
              <input
                data-testid="charge-price-name"
                placeholder={t(language, "drawer.chargeItemPlaceholder")}
                value={newChargeItem.name}
                onChange={(event) => setNewChargeItem((current) => ({ ...current, name: event.target.value }))}
              />
              <input
                placeholder={t(language, "drawer.categoryPlaceholder")}
                value={newChargeItem.category}
                onChange={(event) => setNewChargeItem((current) => ({ ...current, category: event.target.value }))}
              />
              <input
                placeholder={t(language, "drawer.unitPlaceholder")}
                value={newChargeItem.unitLabel}
                onChange={(event) => setNewChargeItem((current) => ({ ...current, unitLabel: event.target.value }))}
              />
              <input
                data-testid="charge-price-amount"
                type="number"
                min="0"
                step="0.01"
                placeholder={t(language, "drawer.defaultDollarPlaceholder")}
                value={newChargeItem.amount}
                onChange={(event) => setNewChargeItem((current) => ({ ...current, amount: event.target.value }))}
              />
              <button type="button" className="button button-secondary" data-testid="charge-price-create" disabled={!newChargeItem.name.trim()} onClick={addChargePriceSheetItem}>{t(language, "drawer.addPriceItem")}</button>
            </div>
          ) : null}
        </div>
        {attachmentCategories.length ? (
          <div className="inspection-gallery-downloads" data-testid="attachment-category-downloads" aria-label={t(language, "drawer.downloadCategoryZips")}>
            <strong>{t(language, "drawer.categoryZips")}</strong>
            {attachmentCategories.map((category) => (
              <a key={category} className="button button-ghost" href={attachmentArchiveUrl(item.id, { category })} download={`${item.unitNumber}-${category.toLowerCase().replace(/\s+/g, "-")}-attachments.zip`}>
                {category}
              </a>
            ))}
          </div>
        ) : null}
        {!filteredAttachments.length ? (
          <p className="drawer-empty">{t(language, "drawer.noFilesMatchStage")}</p>
        ) : (
          <div className="attachment-gallery inspection-gallery-grid" data-testid="attachment-gallery-grid">
            {filteredAttachments.map(renderAttachmentCard)}
          </div>
        )}
      </Modal>
      <Modal
        open={chargeReportOpen}
        title={tWithVars(language, "drawer.chargeReportTitle", { unit: item.unitNumber })}
        onClose={() => setChargeReportOpen(false)}
        testId="charge-report-modal"
        actions={chargeReportQuery.data?.summary.lineCount ? (
          <>
            <a className="button button-secondary" data-testid="charge-report-csv-download" href={chargeReportCsvUrl(item.id)} download={`${item.unitNumber}-charge-report.csv`}>
              {t(language, "nav.csv")}
            </a>
            <a className="button button-secondary" href={attachmentArchiveUrl(item.id, { stage: "CHARGE_CANDIDATES" })} download={`${item.unitNumber}-charge-candidates.zip`}>
              {t(language, "drawer.downloadChargeZip")}
            </a>
          </>
        ) : null}
      >
        <div className="charge-report-panel" data-testid="charge-report-panel">
          {chargeReportQuery.isLoading ? (
            <p className="drawer-empty">{t(language, "drawer.loadingChargeReport")}</p>
          ) : chargeReportQuery.isError ? (
            <p className="drawer-error">{t(language, "drawer.unableToLoadChargeReport")}</p>
          ) : chargeReportQuery.data ? (
            <>
              <div className="charge-report-summary">
                <span><strong>{chargeReportQuery.data.summary.lineCount}</strong> {t(language, "drawer.lines")}</span>
                <span><strong>{chargeReportQuery.data.summary.fileCount}</strong> {t(language, "drawer.files")}</span>
                <span><strong>{chargeReportQuery.data.summary.pinCount}</strong> {t(language, "drawer.pinCount")}</span>
                <span><strong>{formatCents(chargeReportQuery.data.summary.totalEstimatedCents)}</strong> {t(language, "drawer.totalEstimate")}</span>
                {chargeReportQuery.data.summary.missingContext ? <span className="warning"><strong>{chargeReportQuery.data.summary.missingContext}</strong> {t(language, "drawer.needPricingOrNotes")}</span> : null}
              </div>
              {chargeReportQuery.data.lines.length ? (
                <div className="charge-report-table" role="table" aria-label={t(language, "drawer.chargeEvidenceItems")}>
                  <div className="charge-report-row header" role="row">
                    <span>{t(language, "drawer.type")}</span>
                    <span>{t(language, "drawer.evidence")}</span>
                    <span>{t(language, "drawer.priceSheet")}</span>
                    <span>{t(language, "drawer.quantity")}</span>
                    <span>{t(language, "drawer.estimate")}</span>
                    <span>{t(language, "drawer.notes")}</span>
                  </div>
                  {chargeReportQuery.data.lines.map((line, index) => (
                    <div key={`${line.type}-${line.attachmentId}-${line.pinId ?? index}`} className="charge-report-row" role="row">
                      <span>{line.type === "PIN" ? t(language, "drawer.pin") : t(language, "drawer.file")}</span>
                      <span>
                        <strong>{line.label}</strong>
                        <small>{line.attachmentName}{line.category ? ` / ${line.category}` : ""} / {line.inspectionStage}</small>
                      </span>
                      <span>{line.priceSheetItemName ?? t(language, "drawer.noPriceSheetItem")}</span>
                      <span>{line.quantity ?? "-"}</span>
                      <span>{formatCents(line.estimatedCents)}</span>
                      <span>{line.chargeNote || line.note || t(language, "drawer.noNote")}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="drawer-empty">{t(language, "drawer.noChargeCandidates")}</p>
              )}
              <p className="modal-copy">{t(language, "drawer.chargeReportCopy")}</p>
            </>
          ) : null}
        </div>
      </Modal>
      <Modal
        open={Boolean(previewAttachment)}
        title={previewAttachment?.originalName ?? t(language, "drawer.attachmentPreview")}
        onClose={() => setPreviewAttachmentId(null)}
        testId="attachment-preview-modal"
        actions={previewAttachment ? (
          <a className="button button-primary" data-testid="attachment-preview-download" href={attachmentDownloadUrl(previewAttachment.id)} download={previewAttachment.originalName}>
            {t(language, "drawer.downloadFile")}
          </a>
        ) : null}
      >
        {previewAttachment ? (
          <div className="attachment-lightbox">
            {previewAttachment.mimeType.startsWith("image/") ? (
              <>
                {canUpdatePreviewAttachment ? (
                  <div className="attachment-markup-toolbar" data-testid="attachment-markup-toolbar">
                    <label>{t(language, "drawer.pinLabel")}
                      <input
                        data-testid="attachment-pin-label"
                        value={newPinLabel}
                        maxLength={120}
                        onChange={(event) => setNewPinLabel(event.target.value)}
                      />
                    </label>
                    <label>{t(language, "drawer.category")}
                      <select
                        data-testid="attachment-pin-category"
                        value={newPinCategory}
                        onChange={(event) => setNewPinCategory(event.target.value)}
                      >
                        {markupCategoryOptions.map((category) => (
                          <option key={category} value={category}>{category}</option>
                        ))}
                      </select>
                    </label>
                    <label className="inline-checkbox">
                      <input
                        type="checkbox"
                        checked={newPinChargeCandidate}
                        onChange={(event) => setNewPinChargeCandidate(event.target.checked)}
                      />
                      {t(language, "drawer.chargePin")}
                    </label>
                    {newPinChargeCandidate ? (
                      <>
                        <label>{t(language, "drawer.priceSheet")}
                          <select
                            data-testid="attachment-pin-price-sheet"
                            value={newPinPriceSheetItemId}
                            onChange={(event) => {
                              const selected = activeChargePriceSheetItems.find((entry) => entry.id === event.target.value) ?? null;
                              setNewPinPriceSheetItemId(selected?.id ?? "");
                              setNewPinChargeEstimate(centsToDollars(selected?.defaultCents));
                            }}
                          >
                            <option value="">{t(language, "drawer.noPriceSheetItem")}</option>
                            {activeChargePriceSheetItems.map((entry) => (
                              <option key={entry.id} value={entry.id}>{entry.name}{entry.defaultCents !== null ? ` (${formatCents(entry.defaultCents)})` : ""}</option>
                            ))}
                          </select>
                        </label>
                        <label>{t(language, "drawer.quantity")}
                          <input
                            type="number"
                            min="0"
                            step="0.25"
                            value={newPinChargeQuantity}
                            onChange={(event) => setNewPinChargeQuantity(event.target.value)}
                          />
                        </label>
                        <label>{t(language, "drawer.estimate")}
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={newPinChargeEstimate}
                            onChange={(event) => setNewPinChargeEstimate(event.target.value)}
                          />
                        </label>
                      </>
                    ) : null}
                    <button
                      type="button"
                      className={pinModeAttachmentId === previewAttachment.id ? "button button-primary" : "button button-secondary"}
                      data-testid="attachment-add-pin-mode"
                      onClick={() => setPinModeAttachmentId(pinModeAttachmentId === previewAttachment.id ? null : previewAttachment.id)}
                    >
                      {pinModeAttachmentId === previewAttachment.id ? t(language, "drawer.clickImageToPlacePin") : t(language, "drawer.addMarkupPin")}
                    </button>
                  </div>
                ) : null}
                <div className="attachment-preview-controls" aria-label={t(language, "drawer.photoPreviewControls")}>
                  <button type="button" className="button button-secondary" onClick={() => openPreviewImageAt(-1)} disabled={!canCyclePreviewImages} aria-label={t(language, "drawer.previousPhoto")}>
                    {t(language, "drawer.previous")}
                  </button>
                  <span>{previewImageIndex >= 0 ? `${previewImageIndex + 1} of ${previewImageAttachments.length}` : "1 of 1"}</span>
                  <button type="button" className="button button-secondary" onClick={() => openPreviewImageAt(1)} disabled={!canCyclePreviewImages} aria-label={t(language, "drawer.nextPhoto")}>
                    {t(language, "drawer.next")}
                  </button>
                  <div className="attachment-zoom-controls" aria-label={t(language, "drawer.zoomControls")}>
                    <button type="button" className="button button-secondary" onClick={() => setAttachmentZoom((value) => Math.max(1, Number((value - 0.25).toFixed(2))))} disabled={attachmentZoom <= 1}>
                      Zoom -
                    </button>
                    <span>{Math.round(attachmentZoom * 100)}%</span>
                    <button type="button" className="button button-secondary" onClick={() => setAttachmentZoom((value) => Math.min(3, Number((value + 0.25).toFixed(2))))}>
                      Zoom +
                    </button>
                    <button type="button" className="button button-ghost" onClick={() => setAttachmentZoom(1)}>
                      {t(language, "drawer.reset")}
                    </button>
                  </div>
                </div>
                <div className="attachment-image-scroll">
                  <button type="button" className="attachment-cycle previous" onClick={() => openPreviewImageAt(-1)} disabled={!canCyclePreviewImages} aria-label={t(language, "drawer.previousPhoto")}>
                    ‹
                  </button>
                  <div
                    className={pinModeAttachmentId === previewAttachment.id ? "attachment-image-markup placing" : "attachment-image-markup"}
                    data-testid="attachment-image-markup"
                    onClick={(event) => addAttachmentAnnotation(previewAttachment, event)}
                    style={{ width: `${attachmentZoom * 100}%` }}
                  >
                    <img src={attachmentDownloadUrl(previewAttachment.id)} alt={previewAttachment.note || previewAttachment.originalName} />
                    {(previewAttachment.markupAnnotations ?? []).map((annotation, index) => (
                      <button
                        key={annotation.id}
                        type="button"
                        className={annotation.chargeCandidate ? "attachment-pin charge" : "attachment-pin"}
                        style={{ left: `${annotation.x}%`, top: `${annotation.y}%` }}
                        title={`${annotation.label}${annotation.category ? ` / ${annotation.category}` : ""}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {index + 1}
                      </button>
                    ))}
                  </div>
                  <button type="button" className="attachment-cycle next" onClick={() => openPreviewImageAt(1)} disabled={!canCyclePreviewImages} aria-label={t(language, "drawer.nextPhoto")}>
                    ›
                  </button>
                </div>
                {(previewAttachment.markupAnnotations?.length ?? 0) > 0 ? (
                  <div className="attachment-pin-list" data-testid="attachment-pin-list">
                    {previewAttachment.markupAnnotations?.map((annotation, index) => (
                      <div key={annotation.id} className="attachment-pin-row">
                        <div>
                          <strong>{index + 1}. {annotation.label}</strong>
                          <span>{annotation.category || t(language, "drawer.uncategorized")}{annotation.chargeCandidate ? ` / ${t(language, "drawer.chargeCandidate")}` : ""}</span>
                        </div>
                        {annotation.chargeCandidate ? (
                          <div className="attachment-pin-charge-fields">
                            <label>{t(language, "drawer.priceSheet")}
                              <select
                                value={annotation.chargePriceSheetItemId ?? ""}
                                disabled={!canUpdatePreviewAttachment}
                                onChange={(event) => {
                                  const selected = activeChargePriceSheetItems.find((entry) => entry.id === event.target.value) ?? null;
                                  updateAttachmentAnnotation(previewAttachment, annotation.id, {
                                    chargePriceSheetItemId: selected?.id ?? null,
                                    chargePriceSheetItemName: selected?.name ?? null,
                                    chargeEstimatedCents: selected?.defaultCents ?? annotation.chargeEstimatedCents ?? null,
                                    chargeQuantity: selected ? annotation.chargeQuantity ?? 1 : annotation.chargeQuantity ?? null,
                                  });
                                }}
                              >
                                <option value="">{t(language, "drawer.noPriceSheetItem")}</option>
                                {activeChargePriceSheetItems.map((entry) => (
                                  <option key={entry.id} value={entry.id}>{entry.name}{entry.defaultCents !== null ? ` (${formatCents(entry.defaultCents)})` : ""}</option>
                                ))}
                              </select>
                            </label>
                            <label>{t(language, "drawer.quantity")}
                              <input
                                type="number"
                                min="0"
                                step="0.25"
                                defaultValue={annotation.chargeQuantity ?? ""}
                                disabled={!canUpdatePreviewAttachment}
                                onBlur={(event) => updateAttachmentAnnotation(previewAttachment, annotation.id, { chargeQuantity: event.target.value ? Number(event.target.value) : null })}
                              />
                            </label>
                            <label>{t(language, "drawer.estimate")}
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                defaultValue={centsToDollars(annotation.chargeEstimatedCents)}
                                disabled={!canUpdatePreviewAttachment}
                                onBlur={(event) => updateAttachmentAnnotation(previewAttachment, annotation.id, { chargeEstimatedCents: event.target.value ? dollarsToCents(event.target.value) : null })}
                              />
                            </label>
                            <span>{annotation.chargePriceSheetItemName || t(language, "drawer.unassignedValue")} / {formatCents(annotation.chargeEstimatedCents)}</span>
                          </div>
                        ) : (
                          <span>{annotation.category || t(language, "drawer.uncategorized")}</span>
                        )}
                        {canUpdatePreviewAttachment ? <button type="button" className="button button-ghost danger" onClick={() => removeAttachmentAnnotation(previewAttachment, annotation.id)}>{t(language, "drawer.removePin")}</button> : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="drawer-empty">{t(language, "drawer.noMarkupPins")}</p>
                )}
              </>
            ) : (
              <div className="attachment-lightbox-file">
                <strong>{previewAttachment.originalName}</strong>
                <span>{previewAttachment.mimeType}</span>
                <span>{Math.ceil(previewAttachment.sizeBytes / 1024)} KB</span>
              </div>
            )}
            <div className="attachment-lightbox-meta">
              <span>{attachmentStageOptions.find((stage) => stage.value === (previewAttachment.inspectionStage || "GENERAL"))?.label ?? t(language, "drawer.general")}</span>
              {previewAttachment.category ? <span>{previewAttachment.category}</span> : null}
              {previewAttachment.chargeCandidate ? <span>{t(language, "drawer.chargeCandidate")}</span> : null}
              {previewAttachment.chargeCandidate ? <span>{previewAttachment.chargePriceSheetItem?.name ?? t(language, "drawer.noPriceSheetItem")} / {formatCents(previewAttachment.chargeEstimatedCents)}</span> : null}
            </div>
            {previewAttachment.note ? <p>{previewAttachment.note}</p> : null}
            {previewAttachment.chargeNote ? <p><strong>{t(language, "drawer.chargeRecoveryLabel")}:</strong> {previewAttachment.chargeNote}</p> : null}
          </div>
        ) : null}
      </Modal>
    </>
  );
}
