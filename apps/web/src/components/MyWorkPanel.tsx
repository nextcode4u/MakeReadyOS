import { useMemo } from "react";
import type { CurrentUser, LabelDefinition, MyWorkResponse, StaffOption } from "../lib/api";
import { displayUnitNumber } from "../lib/board";
import { t, tWithVars } from "../lib/i18n";
import { openLeaseWorkspace } from "../lib/leaseNavigation";
import { openPestWorkspace } from "../lib/pestNavigation";
import { openProjectRecord } from "../lib/projectNavigation";
import { LabelPill } from "./LabelPill";
import { StatusState } from "./StatusState";

type Props = {
  data?: MyWorkResponse;
  loading: boolean;
  error: boolean;
  currentUser: CurrentUser;
  staff: StaffOption[];
  labelsByField: Record<string, Record<string, LabelDefinition>>;
  selectedUserId: string;
  onUserChange: (id: string) => void;
  onOpenItem: (id: string) => void;
  onRetry: () => void;
  onQuickStatusChange: (id: string, value: string | null) => Promise<void>;
};

export function MyWorkPanel({ data, loading, error, currentUser, staff, labelsByField, selectedUserId, onUserChange, onOpenItem, onRetry, onQuickStatusChange }: Props) {
  const language = currentUser.language;
  const workItems = useMemo(() => (data?.items ?? []).map((item) => {
    const tasks = item.checklistInstances.flatMap((checklist) => checklist.items);
    return { item, tasks, done: tasks.filter((task) => task.completed).length };
  }), [data?.items]);
  const projectItems = data?.projectItems ?? [];
  const pestItems = data?.pestItems ?? [];
  const leaseComplianceItems = data?.leaseComplianceItems ?? [];
  if (loading) return <StatusState title={t(language, "myWork.loadingTitle")} description={t(language, "myWork.loadingCopy")} />;
  if (error || !data) return <StatusState title={t(language, "myWork.unavailableTitle")} description={t(language, "myWork.unavailableCopy")} tone="error" action={{ label: t(language, "status.reload"), onClick: onRetry }} />;
  const canSelectStaff = currentUser.role === "ADMIN" || currentUser.role === "MANAGER";
  const canQuickUpdate = ["ADMIN", "MANAGER", "TECH", "CLEANER"].includes(currentUser.role);
  const makeReadyOptions = Object.values(labelsByField.makeReadyStatus ?? {}).filter((label) => !label.isArchived);

  const openPestItem = (item: NonNullable<MyWorkResponse["pestItems"]>[number]) => {
    const search = item.unit?.number ?? item.area ?? item.pestType ?? "";
    const tab = item.status === "Archived"
      ? "archive"
      : item.makeReadyItemId
        ? "make-ready"
        : "active";
    openPestWorkspace({
      propertyId: item.propertyId,
      tab,
      makeReadyItemId: item.makeReadyItemId ?? undefined,
      search,
    });
  };

  const openLeaseItem = (item: NonNullable<MyWorkResponse["leaseComplianceItems"]>[number]) => {
    const search = item.unit?.number ?? item.area ?? item.building ?? item.issueTypeName ?? "";
    const tab = item.isArchived || item.status === "Archived"
      ? "archive"
      : item.status === "Resolved"
        ? "resolved"
        : item.status === "Violation Needed" || item.noticeStage === "Violation Needed"
          ? "violation"
          : item.noticeStage !== "None" || item.status === "Resident Notified" || item.status === "Notice Sent"
            ? "needs-notice"
            : "active";
    openLeaseWorkspace({
      propertyId: item.propertyId,
      tab,
      search,
    });
  };

  return (
    <section className="my-work-panel" data-testid="my-work-panel">
      <header className="panel-heading my-work-heading">
        <div><h2>{t(language, "myWork.title")}</h2><p>{tWithVars(language, "myWork.copy", { name: data.target.fullName })}</p></div>
        {canSelectStaff ? (
          <label>{t(language, "myWork.viewStaff")}
            <select data-testid="my-work-staff" value={selectedUserId} onChange={(event) => onUserChange(event.target.value)}>
              <option value="">{t(language, "myWork.myAssignments")}</option>
              {staff.map((member) => <option key={member.id} value={member.id}>{member.fullName} / {member.role}</option>)}
            </select>
          </label>
        ) : null}
      </header>
      <div className="my-work-stats">
        <strong>{data.stats.total}<span>{t(language, "myWork.assigned")}</span></strong>
        <strong className={data.stats.overdue ? "risk" : ""}>{data.stats.overdue}<span>{t(language, "myWork.overdue")}</span></strong>
        <strong>{data.stats.dueSoon}<span>{t(language, "myWork.dueSoon")}</span></strong>
        <strong>{data.stats.openChecklistTasks}<span>{t(language, "myWork.openTasks")}</span></strong>
      </div>
      {data.items.length === 0 && projectItems.length === 0 && pestItems.length === 0 && leaseComplianceItems.length === 0 ? <p className="empty-copy">{t(language, "myWork.empty")}</p> : (
        <div className="my-work-list">
          {workItems.map(({ item, tasks, done }) => {
            return (
              <article key={item.id} className={item.overdue ? "my-work-card overdue" : "my-work-card"} data-testid={`my-work-item-${item.id}`}>
                <div>
                  <strong>{displayUnitNumber(item.property.code, item.unitNumber)}</strong>
                  <span>{item.property.name} / {item.boardGroup.replace(/_/g, " ")}</span>
                </div>
                <div className="my-work-tags">
                  {item.overdue ? <b>{t(language, "myWork.overdue").toUpperCase()}</b> : null}
                  {item.moveInSoon ? <b className="warning">{t(language, "myWork.moveInSoon")}</b> : null}
                  {item.riskLevel && item.riskLevel !== "NONE" ? <b className={item.riskLevel === "CRITICAL" || item.riskLevel === "HIGH" ? "risk" : "warning"}>{item.riskLevel} {t(language, "myWork.riskSuffix")}</b> : null}
                  <span>{item.makeReadyStatus ?? t(language, "myWork.statusUnset")}</span>
                  {item.workAssignmentBlocks?.[0] ? <span>{tWithVars(language, "myWork.planned", { date: item.workAssignmentBlocks[0].plannedDate.slice(0, 10), category: item.workAssignmentBlocks[0].category })}</span> : null}
                </div>
                <div className="my-work-progress">
                  <span>{tWithVars(language, "myWork.checklist", { done: done.toString(), total: tasks.length.toString() })}</span>
                  <progress value={done} max={tasks.length || 1} />
                </div>
                <div className="my-work-actions">
                  <button className="button button-primary" type="button" onClick={() => onOpenItem(item.id)}>{t(language, "myWork.openWorkItem")}</button>
                  {canQuickUpdate ? (
                    <label className="my-work-quick-status">
                      <span>{t(language, "myWork.quickStatus")}</span>
                      <select
                        data-testid={`my-work-status-${item.id}`}
                        value={item.makeReadyStatus ?? ""}
                        onChange={(event) => void onQuickStatusChange(item.id, event.target.value || null)}
                        aria-label={`${t(language, "myWork.quickStatus")} ${item.unitNumber}`}
                      >
                        <option value="">{t(language, "myWork.unset")}</option>
                        {makeReadyOptions.map((option) => <option key={option.id} value={option.value}>{option.value}</option>)}
                      </select>
                    </label>
                  ) : (
                    <LabelPill value={item.makeReadyStatus} label={item.makeReadyStatus ? labelsByField.makeReadyStatus?.[item.makeReadyStatus] : undefined} muted />
                  )}
                </div>
              </article>
            );
          })}
          {projectItems.map((item) => {
            const overdue = Boolean(item.dueDate && new Date(item.dueDate) < new Date() && !["Completed", "Cancelled", "Archived", "Denied"].includes(item.status));
            const openTasks = item.tasks.filter((task) => task.status !== "Completed" && task.status !== "Skipped");
            const done = item.tasks.length - openTasks.length;
            return (
              <article key={`project-${item.id}`} className={overdue ? "my-work-card overdue" : "my-work-card"} data-testid={`my-work-project-${item.id}`}>
                <div>
                  <strong>{t(language, "myWork.projectPrefix")}: {item.title}</strong>
                  <span>{item.property.name} / {t(language, "myWork.projectPrefix")} / {item.recordType} / {item.categoryName ?? t(language, "myWork.projectCategoryFallback")}</span>
                </div>
                <div className="my-work-tags">
                  {overdue ? <b>{t(language, "myWork.overdue").toUpperCase()}</b> : null}
                  {item.priority === "Critical" || item.priority === "High" ? <b className={item.priority === "Critical" ? "risk" : "warning"}>{item.priority}</b> : null}
                  <span>{item.status}</span>
                  <span>{item.source ?? "Other"}</span>
                  <span>{item.executionType}</span>
                  {item.scheduledDate ? <span>{tWithVars(language, "myWork.scheduled", { date: item.scheduledDate.slice(0, 10) })}</span> : null}
                </div>
                <div className="my-work-progress">
                  <span>{tWithVars(language, "myWork.projectTasks", { done: done.toString(), total: item.tasks.length.toString() })}</span>
                  <progress value={done} max={item.tasks.length || 1} />
                </div>
                <div className="my-work-actions">
                  <button className="button button-primary" type="button" onClick={() => openProjectRecord({ id: item.id, propertyId: item.propertyId })}>{t(language, "myWork.openProject")}</button>
                  <span className="muted">{item.dueDate ? tWithVars(language, "myWork.due", { date: item.dueDate.slice(0, 10) }) : item.locationNotes || t(language, "myWork.noDueDate")}</span>
                </div>
              </article>
            );
          })}
          {pestItems.map((item) => {
            const overdue = Boolean(item.followUpDate && new Date(item.followUpDate) < new Date() && item.status === "Needs Follow Up");
            return (
              <article key={`pest-${item.id}`} className={overdue ? "my-work-card overdue" : "my-work-card"} data-testid={`my-work-pest-${item.id}`}>
                <div>
                  <strong>{t(language, "myWork.pestPrefix")}: {item.unit?.number ?? item.area ?? t(language, "myWork.areaFallback")}</strong>
                  <span>{item.property.name} / Pest Control / {item.pestType}</span>
                </div>
                <div className="my-work-tags">
                  {overdue ? <b>{t(language, "myWork.overdue").toUpperCase()}</b> : null}
                  {item.managerReviewRequired ? <b className="risk">{t(language, "myWork.managerReview")}</b> : null}
                  {item.recurringConcern ? <b className="warning">{t(language, "myWork.recurring")}</b> : null}
                  <span>{item.status}</span>
                  <span>{item.priority}</span>
                  {item.followUpDate ? <span>{tWithVars(language, "myWork.followUpDate", { date: item.followUpDate.slice(0, 10) })}</span> : null}
                  {item.treatmentDate ? <span>{tWithVars(language, "myWork.treatmentDate", { date: item.treatmentDate.slice(0, 10) })}</span> : null}
                </div>
                <div className="my-work-progress">
                  <span>{item.vendor?.vendorName ?? item.source}</span>
                  <progress value={item.status === "Closed" ? 1 : item.status === "Treated" ? 0.8 : item.status === "Scheduled" ? 0.5 : 0.2} max={1} />
                </div>
                <div className="my-work-actions">
                  <button className="button button-primary" type="button" onClick={() => openPestItem(item)}>{t(language, "myWork.openPest")}</button>
                  <span className="muted">{item.description || item.followUpNotes || t(language, "myWork.noExtraNotes")}</span>
                </div>
              </article>
            );
          })}
          {leaseComplianceItems.map((item) => {
            const overdue = item.status === "Violation Needed" || (item.noticeStage === "3rd Notice" && !item.violationNeededDate);
            return (
              <article key={`lease-${item.id}`} className={overdue ? "my-work-card overdue" : "my-work-card"} data-testid={`my-work-lease-${item.id}`}>
                <div>
                  <strong>{t(language, "myWork.leasePrefix")}: {item.unit?.number ?? item.area ?? item.building ?? t(language, "myWork.areaFallback")}</strong>
                  <span>{item.property.name} / Lease Compliance / {item.issueTypeName}</span>
                </div>
                <div className="my-work-tags">
                  {overdue ? <b>{t(language, "myWork.overdue").toUpperCase()}</b> : null}
                  {item.managerReviewRequired ? <b className="risk">{t(language, "myWork.managerReview")}</b> : null}
                  {item.recurringConcern ? <b className="warning">{t(language, "myWork.recurring")}</b> : null}
                  <span>{item.status}</span>
                  <span>{item.noticeStage}</span>
                  <span>{item.priority}</span>
                </div>
                <div className="my-work-progress">
                  <span>{tWithVars(language, "myWork.persistedCount", { count: item.persistenceCount.toString() })}</span>
                  <progress value={item.status === "Resolved" ? 1 : item.noticeStage === "Violation Needed" ? 0.9 : item.noticeStage === "3rd Notice" ? 0.75 : item.noticeStage === "2nd Notice" ? 0.55 : item.noticeStage === "1st Notice" ? 0.35 : 0.15} max={1} />
                </div>
                <div className="my-work-actions">
                  <button className="button button-primary" type="button" onClick={() => openLeaseItem(item)}>{t(language, "myWork.openLease")}</button>
                  <span className="muted">{item.description || item.locationNotes || t(language, "myWork.noExtraNotes")}</span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
