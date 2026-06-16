import { useMemo } from "react";
import type { CurrentUser, LabelDefinition, MyWorkResponse, StaffOption } from "../lib/api";
import { displayUnitNumber } from "../lib/board";
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
  const workItems = useMemo(() => (data?.items ?? []).map((item) => {
    const tasks = item.checklistInstances.flatMap((checklist) => checklist.items);
    return { item, tasks, done: tasks.filter((task) => task.completed).length };
  }), [data?.items]);
  const projectItems = data?.projectItems ?? [];
  const pestItems = data?.pestItems ?? [];
  const leaseComplianceItems = data?.leaseComplianceItems ?? [];
  if (loading) return <StatusState title="Loading assigned work" description="Gathering active turns and checklist progress." />;
  if (error || !data) return <StatusState title="My Work unavailable" description="Check the connection, then retry assigned work." tone="error" action={{ label: "Retry", onClick: onRetry }} />;
  const canSelectStaff = currentUser.role === "ADMIN" || currentUser.role === "MANAGER";
  const canQuickUpdate = ["ADMIN", "MANAGER", "TECH", "CLEANER"].includes(currentUser.role);
  const makeReadyOptions = Object.values(labelsByField.makeReadyStatus ?? {}).filter((label) => !label.isArchived);
  return (
    <section className="my-work-panel" data-testid="my-work-panel">
      <header className="panel-heading my-work-heading">
        <div><h2>My Work</h2><p>Assigned field work, due risk, and checklist progress for {data.target.fullName}.</p></div>
        {canSelectStaff ? (
          <label>View staff
            <select data-testid="my-work-staff" value={selectedUserId} onChange={(event) => onUserChange(event.target.value)}>
              <option value="">My assignments</option>
              {staff.map((member) => <option key={member.id} value={member.id}>{member.fullName} / {member.role}</option>)}
            </select>
          </label>
        ) : null}
      </header>
      <div className="my-work-stats">
        <strong>{data.stats.total}<span>Assigned</span></strong>
        <strong className={data.stats.overdue ? "risk" : ""}>{data.stats.overdue}<span>Overdue</span></strong>
        <strong>{data.stats.dueSoon}<span>Due Soon</span></strong>
        <strong>{data.stats.openChecklistTasks}<span>Open Tasks</span></strong>
      </div>
      {data.items.length === 0 && projectItems.length === 0 && pestItems.length === 0 && leaseComplianceItems.length === 0 ? <p className="empty-copy">No active work is assigned to this staff member.</p> : (
        <div className="my-work-list">
          {workItems.map(({ item, tasks, done }) => {
            return (
              <article key={item.id} className={item.overdue ? "my-work-card overdue" : "my-work-card"} data-testid={`my-work-item-${item.id}`}>
                <div>
                  <strong>{displayUnitNumber(item.property.code, item.unitNumber)}</strong>
                  <span>{item.property.name} / {item.boardGroup.replace(/_/g, " ")}</span>
                </div>
                <div className="my-work-tags">
                  {item.overdue ? <b>OVERDUE</b> : null}
                  {item.moveInSoon ? <b className="warning">MOVE-IN SOON</b> : null}
                  {item.riskLevel && item.riskLevel !== "NONE" ? <b className={item.riskLevel === "CRITICAL" || item.riskLevel === "HIGH" ? "risk" : "warning"}>{item.riskLevel} RISK</b> : null}
                  <span>{item.makeReadyStatus ?? "Status unset"}</span>
                  {item.workAssignmentBlocks?.[0] ? <span>Planned {item.workAssignmentBlocks[0].plannedDate.slice(0, 10)} / {item.workAssignmentBlocks[0].category}</span> : null}
                </div>
                <div className="my-work-progress">
                  <span>Checklist {done}/{tasks.length}</span>
                  <progress value={done} max={tasks.length || 1} />
                </div>
                <div className="my-work-actions">
                  <button className="button button-primary" type="button" onClick={() => onOpenItem(item.id)}>Open work item</button>
                  {canQuickUpdate ? (
                    <label className="my-work-quick-status">
                      <span>Quick status</span>
                      <select
                        data-testid={`my-work-status-${item.id}`}
                        value={item.makeReadyStatus ?? ""}
                        onChange={(event) => void onQuickStatusChange(item.id, event.target.value || null)}
                        aria-label={`Quick make-ready status for ${item.unitNumber}`}
                      >
                        <option value="">Unset</option>
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
                  <strong>Project: {item.title}</strong>
                  <span>{item.property.name} / Project / {item.recordType} / {item.categoryName ?? "Uncategorized"}</span>
                </div>
                <div className="my-work-tags">
                  {overdue ? <b>OVERDUE</b> : null}
                  {item.priority === "Critical" || item.priority === "High" ? <b className={item.priority === "Critical" ? "risk" : "warning"}>{item.priority}</b> : null}
                  <span>{item.status}</span>
                  <span>{item.source ?? "Other"}</span>
                  <span>{item.executionType}</span>
                  {item.scheduledDate ? <span>Scheduled {item.scheduledDate.slice(0, 10)}</span> : null}
                </div>
                <div className="my-work-progress">
                  <span>Project tasks {done}/{item.tasks.length}</span>
                  <progress value={done} max={item.tasks.length || 1} />
                </div>
                <div className="my-work-actions">
                  <button className="button button-primary" type="button" onClick={() => openProjectRecord({ id: item.id, propertyId: item.propertyId })}>Open project</button>
                  <span className="muted">{item.dueDate ? `Due ${item.dueDate.slice(0, 10)}` : item.locationNotes || "No due date"}</span>
                </div>
              </article>
            );
          })}
          {pestItems.map((item) => {
            const overdue = Boolean(item.followUpDate && new Date(item.followUpDate) < new Date() && item.status === "Needs Follow Up");
            return (
              <article key={`pest-${item.id}`} className={overdue ? "my-work-card overdue" : "my-work-card"} data-testid={`my-work-pest-${item.id}`}>
                <div>
                  <strong>Pest: {item.unit?.number ?? item.area ?? "Area"}</strong>
                  <span>{item.property.name} / Pest Control / {item.pestType}</span>
                </div>
                <div className="my-work-tags">
                  {overdue ? <b>OVERDUE</b> : null}
                  {item.managerReviewRequired ? <b className="risk">MANAGER REVIEW</b> : null}
                  {item.recurringConcern ? <b className="warning">RECURRING</b> : null}
                  <span>{item.status}</span>
                  <span>{item.priority}</span>
                  {item.followUpDate ? <span>Follow Up {item.followUpDate.slice(0, 10)}</span> : null}
                  {item.treatmentDate ? <span>Treatment {item.treatmentDate.slice(0, 10)}</span> : null}
                </div>
                <div className="my-work-progress">
                  <span>{item.vendor?.vendorName ?? item.source}</span>
                  <progress value={item.status === "Closed" ? 1 : item.status === "Treated" ? 0.8 : item.status === "Scheduled" ? 0.5 : 0.2} max={1} />
                </div>
                <div className="my-work-actions">
                  <button className="button button-primary" type="button" onClick={() => window.dispatchEvent(new CustomEvent("makereadyos:set-active-view", { detail: { view: "pest", propertyId: item.propertyId } }))}>Open Pest Control</button>
                  <span className="muted">{item.description || item.followUpNotes || "No extra notes"}</span>
                </div>
              </article>
            );
          })}
          {leaseComplianceItems.map((item) => {
            const overdue = item.status === "Violation Needed" || (item.noticeStage === "3rd Notice" && !item.violationNeededDate);
            return (
              <article key={`lease-${item.id}`} className={overdue ? "my-work-card overdue" : "my-work-card"} data-testid={`my-work-lease-${item.id}`}>
                <div>
                  <strong>Lease: {item.unit?.number ?? item.area ?? item.building ?? "Area"}</strong>
                  <span>{item.property.name} / Lease Compliance / {item.issueTypeName}</span>
                </div>
                <div className="my-work-tags">
                  {overdue ? <b>OVERDUE</b> : null}
                  {item.managerReviewRequired ? <b className="risk">MANAGER REVIEW</b> : null}
                  {item.recurringConcern ? <b className="warning">RECURRING</b> : null}
                  <span>{item.status}</span>
                  <span>{item.noticeStage}</span>
                  <span>{item.priority}</span>
                </div>
                <div className="my-work-progress">
                  <span>Persisted {item.persistenceCount}x</span>
                  <progress value={item.status === "Resolved" ? 1 : item.noticeStage === "Violation Needed" ? 0.9 : item.noticeStage === "3rd Notice" ? 0.75 : item.noticeStage === "2nd Notice" ? 0.55 : item.noticeStage === "1st Notice" ? 0.35 : 0.15} max={1} />
                </div>
                <div className="my-work-actions">
                  <button className="button button-primary" type="button" onClick={() => window.dispatchEvent(new CustomEvent("makereadyos:set-active-view", { detail: { view: "lease", propertyId: item.propertyId } }))}>Open Lease Compliance</button>
                  <span className="muted">{item.description || item.locationNotes || "No extra notes"}</span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
