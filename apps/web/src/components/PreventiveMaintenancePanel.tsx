import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  completePreventiveMaintenanceTask,
  createPreventiveMaintenanceTemplate,
  getPreventiveMaintenanceCalendar,
  getPreventiveMaintenanceHistory,
  getPreventiveMaintenanceOverview,
  getPreventiveMaintenanceTasks,
  getPreventiveMaintenanceTemplates,
  preventiveMaintenanceAttachmentDownloadUrl,
  preventiveMaintenanceExportCsvUrl,
  preventiveMaintenanceExportExcelUrl,
  preventiveMaintenancePrintableReportUrl,
  skipPreventiveMaintenanceTask,
  updatePreventiveMaintenanceTemplate,
  uploadPreventiveMaintenanceAttachment,
  isApiError,
  type PreventiveMaintenanceCategory,
  type PreventiveMaintenanceFrequency,
  type PreventiveMaintenancePriority,
  type PreventiveMaintenanceTask,
  type PreventiveMaintenanceTemplate,
  type PreventiveMaintenanceStatus,
  type Property,
  type UserLanguage,
  type UserRole,
} from "../lib/api";
import { enqueuePmComplete, enqueuePmSkip, enqueuePmUpload } from "../lib/offlineSync";
import { t } from "../lib/i18n";
import { PropertyWikiWorkflowPanel } from "./PropertyWikiWorkflowPanel";
import { SearchSelect, type SearchSelectOption } from "./SearchSelect";
import { StatusState } from "./StatusState";
import { openProjectCreate } from "../lib/projectNavigation";

type Props = {
  properties: Property[];
  userRole: UserRole;
  selectedPropertyId?: string;
  language?: UserLanguage;
};

type Tab = "dashboard" | "calendar" | "tasks" | "templates" | "history" | "reports";
type CalendarMode = "daily" | "weekly" | "monthly";
type TaskFocus = "all" | "due-now" | "photo-proof" | "notes-required" | "pass-fail";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(value: Date, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function startOfWeek(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - date.getDay());
  return date;
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString();
}

function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function isDueNow(task: PreventiveMaintenanceTask) {
  return task.status === "DUE" || task.status === "OVERDUE";
}

function assignmentLabel(input: {
  assignedRole: UserRole;
  assignedUserName?: string | null;
}) {
  return input.assignedUserName ? `${input.assignedRole} / ${input.assignedUserName}` : input.assignedRole;
}

function templateDraftState() {
  return {
    name: "",
    category: "General" as PreventiveMaintenanceCategory,
    description: "",
    instructions: "",
    frequency: "Monthly" as PreventiveMaintenanceFrequency,
    customEveryDays: "",
    annualMonth: "",
    annualDay: "",
    assignedRole: "TECH" as UserRole,
    assignedUserId: "",
    photosRequired: false,
    notesRequired: false,
    passFailRequired: false,
    priority: "Normal" as PreventiveMaintenancePriority,
    isActive: true,
  };
}

function calendarRange(mode: CalendarMode, anchor: string) {
  const base = new Date(`${anchor}T00:00:00`);
  if (mode === "daily") {
    return { from: anchor, to: anchor };
  }
  if (mode === "weekly") {
    const from = startOfWeek(base);
    return { from: from.toISOString().slice(0, 10), to: addDays(from, 6).toISOString().slice(0, 10) };
  }
  const from = new Date(base.getFullYear(), base.getMonth(), 1);
  const to = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function TaskCard({
  task,
  canEdit,
  language,
  onComplete,
  onSkip,
  onUpload,
}: {
  task: PreventiveMaintenanceTask;
  canEdit: boolean;
  language: UserLanguage;
  onComplete: (task: PreventiveMaintenanceTask, outcome: "PASS" | "FAIL" | "COMPLETE", notes: string) => void;
  onSkip: (task: PreventiveMaintenanceTask, notes: string) => void;
  onUpload: (taskId: string, files: FileList | null) => void;
}) {
  const isSpanish = language === "es";
  const [notes, setNotes] = useState("");
  return (
    <article className="pool-card pm-task-card">
      <div className="drawer-section-title">
        <h3>{task.taskName}</h3>
        <span className={`status-pill ${task.status === "OVERDUE" ? "risk-critical" : task.status === "DUE" ? "risk-high" : ""}`}>{task.status}</span>
      </div>
      <div className="pool-reading-stack">
        <span>{task.property.code}</span>
        <span>{task.category}</span>
        <span>{t(language, "pm.due")} {formatDate(task.dueDate)}</span>
        <span>{assignmentLabel(task)}</span>
        <span>{task.priority}</span>
      </div>
      {task.description ? <p>{task.description}</p> : null}
      {task.instructions ? <p className="muted">{task.instructions}</p> : null}
      <PropertyWikiWorkflowPanel
        title={t(language, "pm.relatedWikiInfo")}
        module="PREVENTIVE_MAINTENANCE"
        propertyId={task.propertyId}
        recordType="PM_TASK"
        recordId={task.id}
        equipmentQuery={task.taskName}
        query={`${task.category} ${task.template.name}`}
        canEdit={canEdit}
      />
      {task.attachments.length ? (
        <div className="pool-attachment-list">
          {task.attachments.map((attachment) => (
            <a key={attachment.id} href={preventiveMaintenanceAttachmentDownloadUrl(attachment.id)} target="_blank" rel="noreferrer">
              {attachment.originalName}
            </a>
          ))}
        </div>
      ) : null}
      {canEdit ? (
        <>
          <label>{t(language, "pm.completionNotes")}
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={t(language, "pm.quickNotesPlaceholder")} />
          </label>
          <div className="pool-entry-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => openProjectCreate({
                propertyId: task.propertyId,
                source: "Preventive Maintenance",
                recordType: "Recommendation",
                title: task.taskName,
                description: [task.description, task.instructions].filter(Boolean).join("\n\n"),
                sourceRecordType: "PM_TASK",
                sourceRecordId: task.id,
                sourceRecordLabel: task.taskName,
                area: task.category,
                tags: ["preventive-maintenance", task.category.toLowerCase()],
              })}
            >
              {t(language, "pm.createRecommendation")}
            </button>
            <label className="button button-secondary pool-upload-button">
              {t(language, "pm.uploadPhotoPdf")}
              <input
                type="file"
                hidden
                accept="image/*,.pdf"
                onChange={(event) => {
                  onUpload(task.id, event.target.files);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            {task.passFailRequired ? (
              <>
                <button type="button" className="button button-primary" onClick={() => onComplete(task, "PASS", notes)}>{t(language, "pm.pass")}</button>
                <button type="button" className="button button-secondary" onClick={() => onComplete(task, "FAIL", notes)}>{t(language, "pm.fail")}</button>
              </>
            ) : <button type="button" className="button button-primary" onClick={() => onComplete(task, "COMPLETE", notes)}>{t(language, "common.complete")}</button>}
            <button type="button" className="button button-secondary" onClick={() => onSkip(task, notes)}>{t(language, "common.skip")}</button>
          </div>
        </>
      ) : null}
      {!canEdit ? <p className="muted">{t(language, "pm.viewOnlyTasks")}</p> : null}
    </article>
  );
}

export function PreventiveMaintenancePanel({ properties, userRole, selectedPropertyId, language = "en" }: Props) {
  const isSpanish = language === "es";
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [propertyId, setPropertyId] = useState(selectedPropertyId || properties[0]?.id || "");
  const [calendarMode, setCalendarMode] = useState<CalendarMode>("monthly");
  const [calendarAnchor, setCalendarAnchor] = useState(today());
  const [taskStatus, setTaskStatus] = useState<PreventiveMaintenanceStatus | "">("");
  const [taskCategory, setTaskCategory] = useState<PreventiveMaintenanceCategory | "">("");
  const [taskPriority, setTaskPriority] = useState<PreventiveMaintenancePriority | "">("");
  const [taskQuery, setTaskQuery] = useState("");
  const [taskFocus, setTaskFocus] = useState<TaskFocus>("all");
  const [historyQuery, setHistoryQuery] = useState("");
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateDraft, setTemplateDraft] = useState(templateDraftState);
  const canEdit = userRole === "ADMIN" || userRole === "MANAGER" || userRole === "TECH" || userRole === "CLEANER";
  const canAdmin = userRole === "ADMIN";
  const range = calendarRange(calendarMode, calendarAnchor);

  const overviewQuery = useQuery({
    queryKey: ["pm", "overview", propertyId],
    queryFn: () => getPreventiveMaintenanceOverview(propertyId || undefined),
    enabled: Boolean(propertyId),
  });
  const templatesQuery = useQuery({
    queryKey: ["pm", "templates", propertyId],
    queryFn: () => getPreventiveMaintenanceTemplates({ propertyId: propertyId || undefined }),
    enabled: Boolean(propertyId),
  });
  const tasksQuery = useQuery({
    queryKey: ["pm", "tasks", propertyId, taskStatus, taskCategory, taskPriority, taskQuery],
    queryFn: () => getPreventiveMaintenanceTasks({
      propertyId: propertyId || undefined,
      status: taskStatus || undefined,
      category: taskCategory || undefined,
      priority: taskPriority || undefined,
      q: taskQuery || undefined,
      limit: 200,
    }),
    enabled: Boolean(propertyId),
  });
  const calendarQuery = useQuery({
    queryKey: ["pm", "calendar", propertyId, calendarMode, range.from, range.to],
    queryFn: () => getPreventiveMaintenanceCalendar({ propertyId: propertyId || undefined, from: range.from, to: range.to }),
    enabled: Boolean(propertyId),
  });
  const historyListQuery = useQuery({
    queryKey: ["pm", "history", propertyId, historyQuery],
    queryFn: () => getPreventiveMaintenanceHistory({ propertyId: propertyId || undefined, q: historyQuery || undefined, limit: 200 }),
    enabled: Boolean(propertyId),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["pm"] });
    await queryClient.invalidateQueries({ queryKey: ["property-wiki"] });
    await queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  const saveTemplateMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        propertyId,
        name: templateDraft.name,
        category: templateDraft.category,
        description: templateDraft.description || null,
        instructions: templateDraft.instructions || null,
        frequency: templateDraft.frequency,
        customEveryDays: templateDraft.frequency === "Custom" && templateDraft.customEveryDays ? Number(templateDraft.customEveryDays) : null,
        annualMonth: templateDraft.frequency === "Annual" && templateDraft.annualMonth ? Number(templateDraft.annualMonth) : null,
        annualDay: templateDraft.frequency === "Annual" && templateDraft.annualDay ? Number(templateDraft.annualDay) : null,
        assignedRole: templateDraft.assignedRole,
        assignedUserId: templateDraft.assignedUserId || null,
        photosRequired: templateDraft.photosRequired,
        notesRequired: templateDraft.notesRequired,
        passFailRequired: templateDraft.passFailRequired,
        priority: templateDraft.priority,
        isActive: templateDraft.isActive,
      };
      if (editingTemplateId) return updatePreventiveMaintenanceTemplate(editingTemplateId, payload);
      return createPreventiveMaintenanceTemplate(payload);
    },
    onSuccess: () => {
      setEditingTemplateId(null);
      setTemplateDraft(templateDraftState());
      void invalidate();
    },
  });

  const completeMutation = useMutation({
    mutationFn: async ({ id, outcome, notes }: { id: string; outcome: "PASS" | "FAIL" | "COMPLETE"; notes: string }) => {
      try {
        return await completePreventiveMaintenanceTask(id, { outcome, notes: notes || null });
      } catch (error) {
        if (isApiError(error) && error.status === 0) {
          await enqueuePmComplete(id, { outcome, notes: notes || null });
          return { task: null };
        }
        throw error;
      }
    },
    onSuccess: () => void invalidate(),
  });

  const skipMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      try {
        return await skipPreventiveMaintenanceTask(id, { notes: notes || null });
      } catch (error) {
        if (isApiError(error) && error.status === 0) {
          await enqueuePmSkip(id, { notes: notes || null });
          return { task: null };
        }
        throw error;
      }
    },
    onSuccess: () => void invalidate(),
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ taskId, file }: { taskId: string; file: File }) => {
      try {
        return await uploadPreventiveMaintenanceAttachment(taskId, file);
      } catch (error) {
        if (isApiError(error) && error.status === 0) {
          await enqueuePmUpload(taskId, propertyId || undefined, [file]);
          return { attachment: null };
        }
        throw error;
      }
    },
    onSuccess: () => void invalidate(),
  });

  const categories = overviewQuery.data?.categories ?? [];
  const assignableUsers = overviewQuery.data?.assignableUsers ?? [];
  const assignableUsersForRole = assignableUsers.filter((user) => user.role === templateDraft.assignedRole);
  const assignableUserOptions = useMemo<SearchSelectOption[]>(() => assignableUsersForRole.map((user) => ({
    value: user.id,
    label: `${user.fullName} / ${user.role}`,
    keywords: [user.fullName, user.role],
  })), [assignableUsersForRole]);
  const tasks = tasksQuery.data?.tasks ?? [];
  const historyTasks = historyListQuery.data?.tasks ?? [];
  const templates = templatesQuery.data?.templates ?? [];
  const calendarTasks = calendarQuery.data?.tasks ?? [];

  const taskFocusCounts = useMemo(() => ({
    dueNow: tasks.filter((task) => isDueNow(task)).length,
    photoProof: tasks.filter((task) => task.photosRequired).length,
    notesRequired: tasks.filter((task) => task.notesRequired).length,
    passFail: tasks.filter((task) => task.passFailRequired).length,
  }), [tasks]);

  const focusedTasks = useMemo(() => {
    const filtered = tasks.filter((task) => {
      switch (taskFocus) {
        case "due-now":
          return isDueNow(task);
        case "photo-proof":
          return task.photosRequired;
        case "notes-required":
          return task.notesRequired;
        case "pass-fail":
          return task.passFailRequired;
        default:
          return true;
      }
    });
    return [...filtered].sort((left, right) => {
      const leftRank = left.status === "OVERDUE" ? 0 : left.status === "DUE" ? 1 : 2;
      const rightRank = right.status === "OVERDUE" ? 0 : right.status === "DUE" ? 1 : 2;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return left.dueDate.localeCompare(right.dueDate);
    });
  }, [taskFocus, tasks]);

  const calendarGroups = useMemo(() => {
    return calendarTasks.reduce<Record<string, PreventiveMaintenanceTask[]>>((acc, task) => {
      const key = task.dueDate.slice(0, 10);
      acc[key] = [...(acc[key] ?? []), task];
      return acc;
    }, {});
  }, [calendarTasks]);

  if (!propertyId) {
    return <StatusState title={t(language, "pm.noPropertiesTitle")} description={t(language, "pm.noPropertiesCopy")} />;
  }

  if (overviewQuery.isLoading) {
    return <StatusState title={t(language, "pm.loadingTitle")} description={t(language, "pm.loadingCopy")} />;
  }

  if (overviewQuery.isError) {
    return <StatusState title={t(language, "pm.failedTitle")} description={t(language, "pm.failedCopy")} tone="error" />;
  }

  return (
    <section className="pool-panel module-panel" data-testid="preventive-maintenance-panel">
      <div className="module-heading">
        <div>
          <span className="eyebrow">{t(language, "pm.title")}</span>
          <h1>{t(language, "pm.title")}</h1>
          <p>{t(language, "pm.copy")}</p>
        </div>
        <div className="module-actions">
          <select value={propertyId} onChange={(event) => setPropertyId(event.target.value)} aria-label={t(language, "pm.property")}>
            {properties.map((property) => <option key={property.id} value={property.id}>{property.code} - {property.name}</option>)}
          </select>
          <a className="button secondary" href={preventiveMaintenancePrintableReportUrl({ propertyId })} target="_blank" rel="noreferrer">{t(language, "pm.pdfReport")}</a>
          <a className="button secondary" href={preventiveMaintenanceExportCsvUrl({ propertyId })}>{t(language, "nav.csv")}</a>
          <a className="button secondary" href={preventiveMaintenanceExportExcelUrl({ propertyId })}>{t(language, "nav.excel")}</a>
        </div>
      </div>

      <div className="module-tabs">
        {(["dashboard", "calendar", "tasks", "templates", "history", "reports"] as Tab[]).map((value) => (
          <button key={value} className={tab === value ? "active" : ""} type="button" onClick={() => setTab(value)}>
            {{
              dashboard: t(language, "nav.dashboard"),
              calendar: t(language, "pm.calendar"),
              tasks: t(language, "pm.tasks"),
              templates: t(language, "pm.templates"),
              history: t(language, "pm.history"),
              reports: t(language, "pm.reports"),
            }[value]}
          </button>
        ))}
      </div>

      {tab === "dashboard" ? (
        <>
          <div className="pool-kpi-grid">
            <div className="pool-kpi"><strong>{overviewQuery.data?.summary.dueToday ?? 0}</strong><span>{t(language, "pm.dueToday")}</span></div>
            <div className="pool-kpi"><strong>{overviewQuery.data?.summary.dueThisWeek ?? 0}</strong><span>{t(language, "pm.dueThisWeek")}</span></div>
            <div className="pool-kpi danger"><strong>{overviewQuery.data?.summary.overdue ?? 0}</strong><span>{t(language, "savedViews.overdue")}</span></div>
            <div className="pool-kpi"><strong>{overviewQuery.data?.summary.completedThisMonth ?? 0}</strong><span>{t(language, "pm.completedThisMonth")}</span></div>
            <div className="pool-kpi"><strong>{overviewQuery.data?.summary.completionRate ?? 0}%</strong><span>{t(language, "pm.completionRate")}</span></div>
          </div>
          <div className="pool-grid">
            <article className="pool-card">
              <div className="drawer-section-title"><h2>{t(language, "pm.upcomingTasks")}</h2><button type="button" className="button button-secondary" onClick={() => { setTaskFocus("due-now"); setTab("tasks"); }}>{t(language, "pm.completeTask")}</button></div>
              {(overviewQuery.data?.upcomingTasks ?? []).length ? overviewQuery.data!.upcomingTasks.map((task) => (
                <div className="pool-row" key={task.id}>
                  <div><strong>{task.taskName}</strong><span>{task.category} / {t(language, "pm.due")} {formatDate(task.dueDate)}</span></div>
                  <span className={`status-pill ${task.status === "DUE" ? "risk-high" : ""}`}>{task.status}</span>
                </div>
              )) : <p className="muted">{t(language, "pm.noUpcomingTasks")}</p>}
            </article>
            <article className="pool-card">
              <div className="drawer-section-title"><h2>{t(language, "pm.overdueTasks")}</h2><button type="button" className="button button-secondary" onClick={() => { setTaskStatus("OVERDUE"); setTab("tasks"); }}>{t(language, "pm.viewTasks")}</button></div>
              {(overviewQuery.data?.overdueTasks ?? []).length ? overviewQuery.data!.overdueTasks.map((task) => (
                <div className="pool-row danger" key={task.id}>
                  <div><strong>{task.taskName}</strong><span>{task.category} / {t(language, "pm.due")} {formatDate(task.dueDate)}</span></div>
                  <span>{assignmentLabel(task)}</span>
                </div>
              )) : <p className="muted">{t(language, "pm.noOverdueTasks")}</p>}
            </article>
            <article className="pool-card">
              <div className="drawer-section-title"><h2>{t(language, "pm.recentCompletions")}</h2><button type="button" className="button button-secondary" onClick={() => setTab("history")}>{t(language, "pm.history")}</button></div>
              {(overviewQuery.data?.recentCompletions ?? []).length ? overviewQuery.data!.recentCompletions.map((task) => (
                <div className="pool-row" key={task.id}>
                  <div><strong>{task.taskName}</strong><span>{task.completedByName ?? t(language, "pm.unknown")} / {formatDateTime(task.completedAt)}</span></div>
                  <span>{task.completionOutcome ?? task.status}</span>
                </div>
              )) : <p className="muted">{t(language, "pm.noRecentCompletions")}</p>}
            </article>
          </div>
        </>
      ) : null}

      {tab === "calendar" ? (
        <div className="pool-card">
          <div className="drawer-section-title">
            <h2>{t(language, "pm.calendar")}</h2>
            <div className="pool-entry-actions">
              <select value={calendarMode} onChange={(event) => setCalendarMode(event.target.value as CalendarMode)}>
                <option value="daily">{t(language, "pm.daily")}</option>
                <option value="weekly">{t(language, "pm.weekly")}</option>
                <option value="monthly">{t(language, "pm.monthly")}</option>
              </select>
              <input type="date" value={calendarAnchor} onChange={(event) => setCalendarAnchor(event.target.value)} />
            </div>
          </div>
          <div className="pm-calendar-list">
            {Object.entries(calendarGroups).length ? Object.entries(calendarGroups).map(([date, items]) => (
              <div key={date} className="pm-calendar-day">
                <strong>{formatDate(date)}</strong>
                {items.map((task) => (
                  <div key={task.id} className="pool-row">
                    <div><strong>{task.taskName}</strong><span>{task.category} / {assignmentLabel(task)}</span></div>
                    <span className={`status-pill ${task.status === "OVERDUE" ? "risk-critical" : task.status === "DUE" ? "risk-high" : ""}`}>{task.status}</span>
                  </div>
                ))}
              </div>
            )) : <p className="muted">{t(language, "pm.noTasksInRange")}</p>}
          </div>
        </div>
      ) : null}

      {tab === "tasks" ? (
        <>
          <div className="toolbar-card">
            <div className="pm-quick-filter-header">
              <div>
                <strong>{t(language, "pm.fieldQueue")}</strong>
                <span>{t(language, "pm.fieldQueueCopy")}</span>
              </div>
              <span className="status-pill status-muted">{focusedTasks.length} {t(language, "pm.shown")}</span>
            </div>
            <div className="pm-quick-filters" data-testid="pm-quick-filters">
              <button type="button" className={taskFocus === "all" ? "active" : ""} onClick={() => setTaskFocus("all")}>{t(language, "pm.allTasks")}</button>
              <button type="button" className={taskFocus === "due-now" ? "active" : ""} onClick={() => setTaskFocus("due-now")}>{t(language, "pm.dueNow")} ({taskFocusCounts.dueNow})</button>
              <button type="button" className={taskFocus === "photo-proof" ? "active" : ""} onClick={() => setTaskFocus("photo-proof")}>{t(language, "pm.needsPhoto")} ({taskFocusCounts.photoProof})</button>
              <button type="button" className={taskFocus === "notes-required" ? "active" : ""} onClick={() => setTaskFocus("notes-required")}>{t(language, "pm.needsNotes")} ({taskFocusCounts.notesRequired})</button>
              <button type="button" className={taskFocus === "pass-fail" ? "active" : ""} onClick={() => setTaskFocus("pass-fail")}>{t(language, "pm.passFail")} ({taskFocusCounts.passFail})</button>
            </div>
            <div className="form-grid">
              <label>{t(language, "admin.status")}
                <select value={taskStatus} onChange={(event) => setTaskStatus(event.target.value as PreventiveMaintenanceStatus | "")}>
                  <option value="">{t(language, "pm.all")}</option>
                  {["UPCOMING", "DUE", "COMPLETED", "OVERDUE", "SKIPPED"].map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>
              <label>{t(language, "drawer.category")}
                <select value={taskCategory} onChange={(event) => setTaskCategory(event.target.value as PreventiveMaintenanceCategory | "")}>
                  <option value="">{t(language, "pm.all")}</option>
                  {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </label>
              <label>{t(language, "lease.priority")}
                <select value={taskPriority} onChange={(event) => setTaskPriority(event.target.value as PreventiveMaintenancePriority | "")}>
                  <option value="">{t(language, "pm.all")}</option>
                  {["Low", "Normal", "High", "Critical"].map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                </select>
              </label>
              <label>{t(language, "nav.search")}
                <input value={taskQuery} onChange={(event) => setTaskQuery(event.target.value)} placeholder={t(language, "pm.searchPlaceholder")} />
              </label>
            </div>
          </div>
          <div className="pm-task-grid">
            {focusedTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                canEdit={canEdit && !["COMPLETED", "SKIPPED"].includes(task.status)}
                language={language}
                onComplete={(currentTask, outcome, notes) => completeMutation.mutate({ id: currentTask.id, outcome, notes })}
                onSkip={(currentTask, notes) => skipMutation.mutate({ id: currentTask.id, notes })}
                onUpload={(taskId, files) => {
                  if (!files?.length) return;
                  Array.from(files).forEach((file) => uploadMutation.mutate({ taskId, file }));
                }}
              />
            ))}
            {!focusedTasks.length ? <StatusState title={t(language, "pm.noTasksFoundTitle")} description={t(language, "pm.noTasksFoundCopy")} /> : null}
          </div>
        </>
      ) : null}

      {tab === "templates" ? (
        <div className="pool-grid">
          <form data-testid="pm-template-form" className="pool-card pool-form" onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            saveTemplateMutation.mutate();
          }}>
            <h2>{editingTemplateId ? t(language, "pm.editTemplate") : t(language, "pm.createTemplate")}</h2>
            <div className="form-grid">
              <label>{t(language, "pm.templateName")}<input data-testid="pm-template-name" required value={templateDraft.name} onChange={(event) => setTemplateDraft((current) => ({ ...current, name: event.target.value }))} /></label>
              <label>{t(language, "drawer.category")}
                <select value={templateDraft.category} onChange={(event) => setTemplateDraft((current) => ({ ...current, category: event.target.value as PreventiveMaintenanceCategory }))}>
                  {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </label>
              <label>{t(language, "pm.frequency")}
                <select value={templateDraft.frequency} onChange={(event) => setTemplateDraft((current) => ({ ...current, frequency: event.target.value as PreventiveMaintenanceFrequency }))}>
                  {(overviewQuery.data?.frequencies ?? []).map((frequency) => <option key={frequency} value={frequency}>{frequency}</option>)}
                </select>
              </label>
              <label>{t(language, "pm.assignedRole")}
                <select value={templateDraft.assignedRole} onChange={(event) => setTemplateDraft((current) => ({ ...current, assignedRole: event.target.value as UserRole, assignedUserId: "" }))}>
                  {(overviewQuery.data?.assignedRoles ?? []).map((role) => <option key={role} value={role}>{role}</option>)}
                </select>
              </label>
              <label>{t(language, "lease.assignedUser")}
                <SearchSelect
                  options={assignableUserOptions}
                  value={templateDraft.assignedUserId}
                  onChange={(assignedUserId) => setTemplateDraft((current) => ({ ...current, assignedUserId }))}
                  placeholder={t(language, "pm.searchUser")}
                  emptyLabel={t(language, "lease.unassigned")}
                  noMatchesLabel={t(language, "pm.noMatchingUsers")}
                  clearLabel={t(language, "pm.clearAssignedUser")}
                />
              </label>
              <label>{t(language, "lease.priority")}
                <select value={templateDraft.priority} onChange={(event) => setTemplateDraft((current) => ({ ...current, priority: event.target.value as PreventiveMaintenancePriority }))}>
                  {(overviewQuery.data?.priorities ?? []).map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                </select>
              </label>
              {templateDraft.frequency === "Custom" ? <label>{t(language, "pm.everyXDays")}<input type="number" min="1" value={templateDraft.customEveryDays} onChange={(event) => setTemplateDraft((current) => ({ ...current, customEveryDays: event.target.value }))} /></label> : null}
              {templateDraft.frequency === "Annual" ? <label>{t(language, "pm.month")}<input type="number" min="1" max="12" value={templateDraft.annualMonth} onChange={(event) => setTemplateDraft((current) => ({ ...current, annualMonth: event.target.value }))} /></label> : null}
              {templateDraft.frequency === "Annual" ? <label>{t(language, "pm.day")}<input type="number" min="1" max="31" value={templateDraft.annualDay} onChange={(event) => setTemplateDraft((current) => ({ ...current, annualDay: event.target.value }))} /></label> : null}
            </div>
            <label>{t(language, "pm.description")}<textarea value={templateDraft.description} onChange={(event) => setTemplateDraft((current) => ({ ...current, description: event.target.value }))} /></label>
            <label>{t(language, "pm.instructions")}<textarea value={templateDraft.instructions} onChange={(event) => setTemplateDraft((current) => ({ ...current, instructions: event.target.value }))} /></label>
            <label className="checkbox-row"><input type="checkbox" checked={templateDraft.photosRequired} onChange={(event) => setTemplateDraft((current) => ({ ...current, photosRequired: event.target.checked }))} /> {t(language, "pm.photosRequired")}</label>
            <label className="checkbox-row"><input type="checkbox" checked={templateDraft.notesRequired} onChange={(event) => setTemplateDraft((current) => ({ ...current, notesRequired: event.target.checked }))} /> {t(language, "pm.notesRequired")}</label>
            <label className="checkbox-row"><input type="checkbox" checked={templateDraft.passFailRequired} onChange={(event) => setTemplateDraft((current) => ({ ...current, passFailRequired: event.target.checked }))} /> {t(language, "pm.passFailRequired")}</label>
            <label className="checkbox-row"><input type="checkbox" checked={templateDraft.isActive} onChange={(event) => setTemplateDraft((current) => ({ ...current, isActive: event.target.checked }))} /> {t(language, "admin.active")}</label>
            <div className="pool-entry-actions">
              <button data-testid="pm-template-submit" type="submit" className="button button-primary" disabled={!canEdit}>{editingTemplateId ? t(language, "pm.saveTemplate") : t(language, "pm.createTemplate")}</button>
              {editingTemplateId ? <button type="button" className="button button-secondary" onClick={() => { setEditingTemplateId(null); setTemplateDraft(templateDraftState()); }}>{t(language, "common.cancel")}</button> : null}
            </div>
            {!canEdit ? <p className="muted">{t(language, "pm.viewOnlyTemplates")}</p> : null}
            {editingTemplateId ? (
              <PropertyWikiWorkflowPanel
                title={t(language, "pm.templateWikiReferences")}
                module="PREVENTIVE_MAINTENANCE"
                propertyId={propertyId}
                recordType="PM_TEMPLATE"
                recordId={editingTemplateId}
                equipmentQuery={templateDraft.name}
                query={`${templateDraft.category} ${templateDraft.description}`}
                canEdit={canEdit}
              />
            ) : null}
          </form>
          <article className="pool-card">
            <h2>{t(language, "pm.templates")}</h2>
            {templates.map((template) => (
              <div key={template.id} className="pool-row">
                <div>
                  <strong>{template.name}</strong>
                  <span>{template.category} / {template.frequency} / {assignmentLabel(template)}{template.tasks?.[0] ? ` / ${t(language, "pm.latest")} ${template.tasks[0].status} ${formatDate(template.tasks[0].dueDate)}` : ""}</span>
                </div>
                <div className="pool-entry-actions">
                  <button type="button" className="button button-secondary" onClick={() => {
                    setEditingTemplateId(template.id);
                    setTemplateDraft({
                      name: template.name,
                      category: template.category,
                      description: template.description ?? "",
                      instructions: template.instructions ?? "",
                      frequency: template.frequency,
                      customEveryDays: template.customEveryDays ? String(template.customEveryDays) : "",
                      annualMonth: template.annualMonth ? String(template.annualMonth) : "",
                      annualDay: template.annualDay ? String(template.annualDay) : "",
                      assignedRole: template.assignedRole,
                      assignedUserId: template.assignedUserId ?? "",
                      photosRequired: template.photosRequired,
                      notesRequired: template.notesRequired,
                      passFailRequired: template.passFailRequired,
                      priority: template.priority,
                      isActive: template.isActive,
                    });
                  }}>{t(language, "drawer.edit")}</button>
                  {canAdmin ? <button type="button" className="button button-secondary" onClick={() => updatePreventiveMaintenanceTemplate(template.id, { isArchived: !template.isArchived, isActive: template.isArchived ? false : template.isActive }).then(() => invalidate())}>{template.isArchived ? t(language, "pm.archived") : t(language, "common.archive")}</button> : null}
                </div>
              </div>
            ))}
            {!templates.length ? <p className="muted">{t(language, "pm.noTemplatesYet")}</p> : null}
          </article>
        </div>
      ) : null}

      {tab === "history" ? (
        <article className="pool-card">
          <div className="drawer-section-title">
            <h2>{t(language, "pm.history")}</h2>
            <input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder={t(language, "pm.searchCompletedTasks")} />
          </div>
          {historyTasks.length ? historyTasks.map((task) => (
            <div key={task.id} className="pool-history-row">
              <div>
                <strong>{task.taskName}</strong>
                <span>{task.property.code} / {task.category} / {task.completedByName ?? t(language, "pm.unknown")} / {formatDateTime(task.completedAt)}</span>
                {task.completionNotes ? <small>{task.completionNotes}</small> : null}
              </div>
              <div className="pool-entry-actions">
                <span className="status-pill">{task.completionOutcome ?? task.status}</span>
                {task.attachments.length ? <span>{task.attachments.length} {task.attachments.length === 1 ? t(language, "pm.fileSingular") : t(language, "pm.filePlural")}</span> : null}
              </div>
            </div>
          )) : <p className="muted">{t(language, "pm.noHistoryFound")}</p>}
        </article>
      ) : null}

      {tab === "reports" ? (
        <div className="pool-grid">
          <article className="pool-card">
            <h2>{t(language, "pm.exports")}</h2>
            <div className="export-grid">
              <a className="button button-secondary" href={preventiveMaintenancePrintableReportUrl({ propertyId })} target="_blank" rel="noreferrer">{t(language, "pm.completionPdfReport")}</a>
              <a className="button button-secondary" href={preventiveMaintenanceExportCsvUrl({ propertyId })}>{t(language, "pm.complianceCsv")}</a>
              <a className="button button-secondary" href={preventiveMaintenanceExportExcelUrl({ propertyId })}>{t(language, "pm.overdueHistoryExcel")}</a>
            </div>
            <p className="muted">{t(language, "pm.exportsCopy")}</p>
          </article>
          <article className="pool-card">
            <h2>{t(language, "pm.complianceSnapshot")}</h2>
            <div className="analytics-metrics">
              <span><strong>{overviewQuery.data?.compliance.green ?? 0}</strong> {t(language, "pm.green")}</span>
              <span><strong>{overviewQuery.data?.compliance.yellow ?? 0}</strong> {t(language, "pm.yellow")}</span>
              <span><strong>{overviewQuery.data?.compliance.red ?? 0}</strong> {t(language, "pm.red")}</span>
            </div>
            <p className="muted">{t(language, "pm.complianceCopy")}</p>
          </article>
        </div>
      ) : null}
    </section>
  );
}
