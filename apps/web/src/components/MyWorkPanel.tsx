import { useMemo } from "react";
import type { CurrentUser, MyWorkResponse, StaffOption } from "../lib/api";
import { displayUnitNumber } from "../lib/board";
import { StatusState } from "./StatusState";

type Props = {
  data?: MyWorkResponse;
  loading: boolean;
  error: boolean;
  currentUser: CurrentUser;
  staff: StaffOption[];
  selectedUserId: string;
  onUserChange: (id: string) => void;
  onOpenItem: (id: string) => void;
};

export function MyWorkPanel({ data, loading, error, currentUser, staff, selectedUserId, onUserChange, onOpenItem }: Props) {
  const workItems = useMemo(() => (data?.items ?? []).map((item) => {
    const tasks = item.checklistInstances.flatMap((checklist) => checklist.items);
    return { item, tasks, done: tasks.filter((task) => task.completed).length };
  }), [data?.items]);
  if (loading) return <StatusState title="Loading assigned work" description="Gathering active turns and checklist progress." />;
  if (error || !data) return <StatusState title="My Work unavailable" description="Refresh to retrieve assigned operational work." tone="error" />;
  const canSelectStaff = currentUser.role === "ADMIN" || currentUser.role === "MANAGER";
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
                <button className="button button-primary" type="button" onClick={() => onOpenItem(item.id)}>Open work item</button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
