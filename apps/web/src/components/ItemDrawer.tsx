import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { BoardColumnDefinition, BoardSection, CurrentUser, CustomField, FloorPlan, ItemCollaboration, LabelDefinition, MakeReadyItem, StaffOption, UnitHistoryResponse, Vendor, VendorAssignment, WorkAssignmentBlock } from "../lib/api";
import { attachmentDownloadUrl, attachChecklist, createChecklistTemplate, createItemComment, deleteItemAttachment, deleteItemComment, getActivity, getAutomationRuns, getItemCollaboration, getUnitHistory, updateChecklistItem, updateItemAttachment, updateItemComment, uploadItemAttachment } from "../lib/api";
import { boardGroupLabel, configuredBoardColumns } from "../lib/board";
import { LabelPill } from "./LabelPill";
import { StatusState } from "./StatusState";

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
  onBatch,
}: Props) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [commentText, setCommentText] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [vendorDraft, setVendorDraft] = useState({ vendorId: "", trade: "", scheduledDate: "", dueDate: "", notes: "" });
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateItems, setNewTemplateItems] = useState("");
  const columns = useMemo(() => configuredBoardColumns(columnDefinitions), [columnDefinitions]);
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
    queryFn: () => getItemCollaboration(item.id),
  });
  const historyQuery = useQuery<UnitHistoryResponse>({
    queryKey: ["unit-history", item.unitId],
    queryFn: () => getUnitHistory(item.unitId as string),
    enabled: Boolean(item.unitId),
  });
  const canCollaborate = currentUser.role !== "VIEWER";
  const itemVendorAssignments = vendorAssignments.filter((assignment) => assignment.itemId === item.id);
  const itemWorkBlocks = workBlocks.filter((block) => block.itemId === item.id && block.status !== "CANCELED");
  const canManageVendorWork = currentUser.role === "ADMIN" || currentUser.role === "MANAGER";
  const canUpdateVendorWork = canManageVendorWork || currentUser.role === "TECH";
  const refreshCollaboration = async () => {
    await queryClient.invalidateQueries({ queryKey: ["collaboration", item.id] });
    await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    await queryClient.invalidateQueries({ queryKey: ["my-work"] });
  };
  const operation = async (key: string, action: () => Promise<unknown>) => {
    setSaving(key);
    setError("");
    try {
      await action();
      await refreshCollaboration();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Operation failed");
      await refreshCollaboration();
    } finally {
      setSaving(null);
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
    void operation(id, () => updateChecklistItem(id, { completed }));
  };

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const commit = async (key: string, value: unknown) => {
    setSaving(key);
    setError("");
    try {
      await onPatch(item.id, { [key]: value });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Update failed");
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
      setError(nextError instanceof Error ? nextError.message : "Update failed");
    } finally {
      setSaving(null);
    }
  };

  return (
    <>
      <div className="item-drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="item-drawer" data-testid="item-drawer" aria-label={`Details for ${item.unitNumber}`}>
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
          <button type="button" className="drawer-close" data-testid="item-drawer-close" onClick={onClose} aria-label="Close item details">×</button>
        </header>

        {error ? <p className="drawer-error" role="alert">{error}</p> : null}
        <section className="drawer-section risk-drawer-section" data-testid="drawer-risk-section">
          <h3>SLA / Risk</h3>
          {item.riskLevel && item.riskLevel !== "NONE" ? (
            <>
              <p><strong className={`risk-level-badge ${item.riskLevel.toLowerCase()}`}>{item.riskLevel}</strong> Score {item.riskScore}{item.lastRiskEvaluatedAt ? ` / evaluated ${new Date(item.lastRiskEvaluatedAt).toLocaleString()}` : ""}</p>
              <ul className="risk-reason-list">
                {(item.riskReasons ?? []).map((reason, index) => <li key={`${reason.category}-${index}`}><strong>{reason.category.replace(/_/g, " ")}</strong><span>{reason.message}</span></li>)}
              </ul>
            </>
          ) : <p className="drawer-empty">No active SLA risk flags for this item.</p>}
        </section>
        <section className="drawer-section">
          <h3>Turn Details</h3>
          <div className="drawer-fields">
            {columns.filter((column) => column.key !== "unitNumber" && column.key !== "notes").map((column) => {
              const value = item[column.key as keyof MakeReadyItem];
              const editable = column.type !== "readonly" && canEditField(item, column.key);
              const busy = saving === column.key;
              if (column.type === "floorplan") {
                const currentPlan = floorPlans.find((plan) => plan.id === item.unit?.floorPlanId) ?? item.unit?.floorPlanRecord ?? undefined;
                const legacy = Boolean(item.floorPlan && !currentPlan);
                const options = floorPlans.filter((plan) => plan.propertyId === item.propertyId && (plan.isActive || plan.id === currentPlan?.id));
                return (
                  <label className="drawer-field" key={column.key}>
                    <span>{column.label}{legacy ? " / LEGACY" : ""}</span>
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
                      <option value="">{legacy ? `LEGACY: ${item.floorPlan}` : "Select managed floor plan"}</option>
                      {options.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} / {plan.bedrooms ?? "-"} bd / {plan.bathrooms ?? "-"} ba / {plan.squareFeet ?? "-"} sqft</option>)}
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
                      <option value="">Unset</option>
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
                      <option value="">Unassigned</option>
                      {legacy ? <option value={String(value)}>{String(value)} (legacy)</option> : null}
                      {staff.map((person) => <option key={person.id} value={person.fullName}>{person.fullName} - {person.role}</option>)}
                    </select>
                  </label>
                );
              }
              return (
                <label className="drawer-field" key={column.key}>
                  <span>{column.label}{busy ? " / Saving" : ""}</span>
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
          <h3>Custom Fields</h3>
          {customFields.length === 0 ? <p className="drawer-empty">No custom fields configured.</p> : (
            <div className="drawer-fields">
              {customFields.filter((field) => !field.isArchived).map((field) => {
                const value = customValue(item, field.id);
                const busy = saving === field.id;
                if (field.fieldType === "SINGLE_SELECT") return (
                  <label className="drawer-field" key={field.id}>
                    <span>{field.label}</span>
                    <select value={typeof value === "string" ? value : ""} disabled={!canEditCustomFields || busy} onChange={(event) => void commitCustom(field, event.target.value || null)}>
                      <option value="">Unset</option>
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
                      <option value="">Unset</option><option value="true">Yes</option><option value="false">No</option>
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

        <section className="drawer-section" data-testid="drawer-planning-summary">
          <div className="drawer-section-title"><h3>In-House Planning</h3><span className="muted">{itemWorkBlocks.length} block{itemWorkBlocks.length === 1 ? "" : "s"}</span></div>
          {itemWorkBlocks.length === 0 ? <p className="drawer-empty">No in-house work is planned yet. Use the Planning tab to schedule staff coverage.</p> : (
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

        <section className="drawer-section" data-testid="drawer-vendor-assignments">
          <div className="drawer-section-title"><h3>Vendor Work</h3><span className="muted">{itemVendorAssignments.length} assignment{itemVendorAssignments.length === 1 ? "" : "s"}</span></div>
          {itemVendorAssignments.length === 0 ? <p className="drawer-empty">No vendor or contractor work assigned.</p> : (
            <div className="attachment-list">
              {itemVendorAssignments.map((assignment) => (
                <div key={assignment.id} className="attachment-row vendor-assignment-row">
                  <strong>{assignment.vendor.name} / {assignment.trade}</strong>
                  <small>Scheduled {assignment.scheduledDate?.slice(0, 10) ?? "not set"} / Due {assignment.dueDate?.slice(0, 10) ?? "not set"}</small>
                  <select disabled={!canUpdateVendorWork || saving === assignment.id} value={assignment.status} onChange={(event) => void operation(assignment.id, () => onUpdateVendorAssignment(assignment.id, { status: event.target.value as VendorAssignment["status"] }))}>
                    <option value="REQUESTED">Requested</option>
                    <option value="SCHEDULED">Scheduled</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="CANCELED">Canceled</option>
                    <option value="FOLLOW_UP_NEEDED">Follow-Up Needed</option>
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
                <option value="">Assign vendor...</option>
                {vendors.filter((vendor) => vendor.isActive).map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name} / {vendor.trade}</option>)}
              </select>
              <input value={vendorDraft.trade} onChange={(event) => setVendorDraft((current) => ({ ...current, trade: event.target.value }))} placeholder="Trade" />
              <label>Scheduled<input type="date" value={vendorDraft.scheduledDate} onChange={(event) => setVendorDraft((current) => ({ ...current, scheduledDate: event.target.value }))} /></label>
              <label>Due<input type="date" value={vendorDraft.dueDate} onChange={(event) => setVendorDraft((current) => ({ ...current, dueDate: event.target.value }))} /></label>
              <textarea value={vendorDraft.notes} onChange={(event) => setVendorDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Vendor notes" />
              <button className="button button-secondary" data-testid="drawer-vendor-assignment-submit" disabled={!vendorDraft.vendorId || !vendorDraft.trade.trim()}>Add Vendor Work</button>
            </form>
          ) : null}
        </section>

        <section className="drawer-section">
          <h3>Notes &amp; Updates</h3>
          <textarea key={`notes:${item.notes ?? ""}`} data-testid="drawer-notes" defaultValue={item.notes ?? ""} disabled={!canEditField(item, "notes")} placeholder="Operational notes" onBlur={(event) => void commit("notes", event.target.value || null)} />
          {canCollaborate ? (
            <form className="comment-compose" data-testid="comment-compose" onSubmit={(event) => {
              event.preventDefault();
              if (!commentText.trim()) return;
              void operation("comment", async () => {
                if (editingCommentId) await updateItemComment(item.id, editingCommentId, commentText);
                else await createItemComment(item.id, commentText);
                setCommentText("");
                setEditingCommentId(null);
              });
            }}>
              <label><span className="sr-only">Add operational update</span>
                <textarea data-testid="comment-input" value={commentText} onChange={(event) => setCommentText(event.target.value)} placeholder="Add update: work completed, vendor scheduled, issue found..." />
              </label>
              <div>
                {editingCommentId ? <button className="button button-ghost" type="button" onClick={() => { setEditingCommentId(null); setCommentText(""); }}>Cancel edit</button> : null}
                <button className="button button-primary" data-testid="comment-submit" disabled={!commentText.trim() || saving === "comment"}>{editingCommentId ? "Save update" : "Post update"}</button>
              </div>
            </form>
          ) : null}
          {collaborationQuery.isLoading ? <p className="drawer-empty">Loading updates...</p> : !collaborationQuery.data?.comments.length ? <p className="drawer-empty">No updates recorded. Use this space for field notes and handoffs.</p> : (
            <div className="comment-list" data-testid="comment-list">
              {collaborationQuery.data.comments.map((comment) => (
                <article key={comment.id} className="comment-card">
                  <header><strong>{comment.authorName}</strong><time>{new Date(comment.createdAt).toLocaleString()}{comment.editedAt ? " / edited" : ""}</time></header>
                  <p>{comment.body}</p>
                  {canCollaborate && (comment.authorUserId === currentUser.id || canManageItems) ? (
                    <div className="comment-actions">
                      <button type="button" className="button button-ghost" onClick={() => { setEditingCommentId(comment.id); setCommentText(comment.body); }}>Edit</button>
                      <button type="button" className="button button-ghost danger" onClick={() => void operation(`comment-delete-${comment.id}`, () => deleteItemComment(item.id, comment.id))}>Remove</button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="drawer-section" data-testid="drawer-attachments">
          <div className="drawer-section-title"><h3>Photos &amp; Attachments</h3>{canCollaborate ? (
            <label className="button button-secondary file-action">
              Upload
              <input data-testid="attachment-upload" type="file" accept="image/*,.pdf,.doc,.docx,.txt" onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void operation("attachment", () => uploadItemAttachment(item.id, file));
                event.target.value = "";
              }} />
            </label>
          ) : null}</div>
          {!collaborationQuery.data?.attachments.length ? <p className="drawer-empty">No local files uploaded. Phone photo capture is supported.</p> : (
            <div className="attachment-gallery">
              {collaborationQuery.data.attachments.map((attachment) => (
                <article key={attachment.id} className={attachment.mimeType.startsWith("image/") ? "attachment-card image" : "attachment-card"}>
                  {attachment.mimeType.startsWith("image/") ? (
                    <a className="attachment-preview" href={attachmentDownloadUrl(attachment.id)} target="_blank" rel="noreferrer" aria-label={`Open ${attachment.originalName}`}>
                      <img src={attachmentDownloadUrl(attachment.id)} alt={attachment.note || attachment.originalName} loading="lazy" />
                    </a>
                  ) : (
                    <a className="attachment-file" href={attachmentDownloadUrl(attachment.id)} target="_blank" rel="noreferrer">{attachment.originalName}</a>
                  )}
                  <div className="attachment-meta">
                    <strong>{attachment.originalName}</strong>
                    <small>{Math.ceil(attachment.sizeBytes / 1024)} KB / {attachment.uploaderName}</small>
                  </div>
                  <label className="attachment-note">Image/file note
                    <textarea
                      data-testid={`attachment-note-${attachment.id}`}
                      defaultValue={attachment.note ?? ""}
                      disabled={!canCollaborate || (attachment.uploadedById !== currentUser.id && !canManageItems)}
                      placeholder="Damage, cleaning, trash-out, charge notes..."
                      onBlur={(event) => void operation(`attachment-note-${attachment.id}`, () => updateItemAttachment(attachment.id, event.target.value || null))}
                    />
                  </label>
                  {canCollaborate && (attachment.uploadedById === currentUser.id || canManageItems) ? <button className="button button-ghost danger" type="button" onClick={() => void operation(`attachment-delete-${attachment.id}`, () => deleteItemAttachment(attachment.id))}>Remove</button> : null}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="drawer-section" data-testid="drawer-checklists">
          <h3>Checklists</h3>
          {canManageItems ? (
            <div className="checklist-attach">
              <select data-testid="checklist-template-select" value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
                <option value="">Attach template...</option>
                {collaborationQuery.data?.templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
              <button className="button button-secondary" data-testid="checklist-attach" type="button" disabled={!templateId} onClick={() => void operation("attach-checklist", async () => { await attachChecklist(item.id, templateId); setTemplateId(""); })}>Attach</button>
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
          {!collaborationQuery.data?.checklistInstances.length ? <p className="drawer-empty">No checklist attached to this turnover.</p> : null}
          {canManageItems ? (
            <details className="template-quick-create">
              <summary>Create template</summary>
              <input data-testid="checklist-template-name" value={newTemplateName} onChange={(event) => setNewTemplateName(event.target.value)} placeholder="Template name" />
              <textarea data-testid="checklist-template-items" value={newTemplateItems} onChange={(event) => setNewTemplateItems(event.target.value)} placeholder={"One task per line\nFinal clean\nTake finish photos"} />
              <button className="button button-secondary" type="button" disabled={!newTemplateName.trim() || !newTemplateItems.trim()} onClick={() => void operation("new-template", async () => {
                await createChecklistTemplate({ propertyId: item.propertyId, name: newTemplateName, items: newTemplateItems.split("\n").map((title) => title.trim()).filter(Boolean).map((title) => ({ title })) });
                setNewTemplateName("");
                setNewTemplateItems("");
              })}>Create template</button>
            </details>
          ) : null}
        </section>

        <section className="drawer-section" data-testid="unit-history-section">
          <h3>Unit History</h3>
          {!item.unitId ? <p className="drawer-empty">This turnover is not linked to a managed unit yet.</p> : historyQuery.isLoading ? (
            <StatusState title="Loading unit history" description="Building the timeline from existing operational records." tone="subtle" />
          ) : historyQuery.isError ? (
            <p className="drawer-empty">Unit history could not be loaded.</p>
          ) : (
            <>
              <div className="analytics-metrics">
                <span><strong>{historyQuery.data?.turns.length ?? 0}</strong> turns</span>
                <span><strong>{historyQuery.data?.recurringSignals.highRisk ?? 0}</strong> high-risk</span>
                <span><strong>{historyQuery.data?.recurringSignals.vendor ?? 0}</strong> vendor-backed</span>
              </div>
              <div className="turn-history-list">
                {historyQuery.data?.turns.slice(0, 4).map((turn) => (
                  <div className="drawer-timeline-row" key={turn.itemId}>
                    <strong>{turn.current ? "Current turn" : "Previous turn"} / {turn.riskLevel}</strong>
                    <span>Created {new Date(turn.createdAt).toLocaleDateString()} / Duration {turn.turnDuration ?? "-"} days / Checklist {turn.checklistCompletionPercent}%</span>
                  </div>
                ))}
              </div>
              <div className="drawer-timeline unit-history-timeline">
                {historyQuery.data?.events.slice(0, 16).map((entry, index) => (
                  <div key={`${entry.type}-${entry.occurredAt}-${index}`} className="drawer-timeline-row">
                    <strong>{entry.title}</strong>
                    <span>{entry.description} / {new Date(entry.occurredAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {canManageItems ? (
          <section className="drawer-section">
            <h3>Quick Actions</h3>
            <div className="drawer-actions">
              <label>Move section
                <select data-testid="drawer-move-section" value={item.boardGroup} onChange={(event) => void onBatch({ action: "MOVE_GROUP", ids: [item.id], boardGroup: event.target.value })}>
                  {boardGroups.map((group) => <option key={group} value={group}>{boardGroupLabel(group, item.propertyId, boardSections)}</option>)}
                </select>
              </label>
              <button className={item.isArchived ? "button button-secondary" : "button button-danger"} data-testid="drawer-archive-toggle" onClick={() => void onBatch({ action: item.isArchived ? "RESTORE" : "ARCHIVE", ids: [item.id] })}>{item.isArchived ? "Restore Item" : "Archive Item"}</button>
            </div>
          </section>
        ) : null}

        <section className="drawer-section drawer-timeline">
          <h3>Activity</h3>
          {!canViewActivity ? <p className="drawer-empty">Activity is visible to managers and administrators.</p> : activityQuery.isLoading ? (
            <StatusState title="Loading activity" description="Retrieving item changes." tone="subtle" />
          ) : (activityQuery.data?.activity.length ?? 0) === 0 ? <p className="drawer-empty">No recorded item activity.</p> : (
            activityQuery.data?.activity.map((record) => (
              <div key={record.id} className="drawer-timeline-row">
                <strong>{record.description}</strong>
                <span>{record.actor?.fullName ?? "System"} / {new Date(record.createdAt).toLocaleString()}</span>
              </div>
            ))
          )}
          {canViewActivity && (runsQuery.data?.runs.length ?? 0) > 0 ? (
            <>
              <h3>Automation History</h3>
              {runsQuery.data?.runs.map((run) => <div key={run.id} className="drawer-timeline-row"><strong>{run.rule.name}</strong><span>{run.message} / {new Date(run.ranAt).toLocaleString()}</span></div>)}
            </>
          ) : null}
        </section>
      </aside>
    </>
  );
}
