import { useMemo } from "react";
import type { CurrentUser, LabelDefinition, MyWorkResponse, StaffOption } from "../lib/api";
import { displayUnitNumber } from "../lib/board";
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
      {data.items.length === 0 ? <p className="empty-copy">No active units are assigned to this staff member.</p> : (
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
        </div>
      )}
    </section>
  );
}
