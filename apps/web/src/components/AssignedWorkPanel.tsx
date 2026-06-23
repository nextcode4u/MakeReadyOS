import { useMemo } from "react";
import type { AssignedWorkEntry, AssignedWorkResponse, CurrentUser } from "../lib/api";
import { t, tWithVars } from "../lib/i18n";
import { StatusState } from "./StatusState";

type Props = {
  data?: AssignedWorkResponse;
  loading: boolean;
  error: boolean;
  currentUser: CurrentUser;
  selectedUserId: string;
  onUserChange: (id: string) => void;
  onOpenEntry: (entry: AssignedWorkEntry) => void;
  onRetry: () => void;
  onStartWork: (entry: AssignedWorkEntry) => Promise<void>;
  onEndWork: (sessionId: string) => Promise<void>;
};

function startedLabel(value: string) {
  return new Date(value).toLocaleString();
}

function durationLabel(startedAt: string) {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(startedAt).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

export function AssignedWorkPanel({ data, loading, error, currentUser, selectedUserId, onUserChange, onOpenEntry, onRetry, onStartWork, onEndWork }: Props) {
  const language = currentUser.language;
  const canSelectStaff = currentUser.role === "ADMIN" || currentUser.role === "MANAGER" || currentUser.role === "LEASING";
  const canManageSessions = currentUser.role === "ADMIN" || currentUser.role === "MANAGER";

  const groups = useMemo(() => {
    const entries = data?.entries ?? [];
    const grouped = new Map<string, { key: string; userId: string | null; assignedUserName: string; role: string | null; entries: AssignedWorkEntry[] }>();
    for (const entry of entries) {
      const key = entry.userId ?? entry.assignedUserName;
      const current = grouped.get(key);
      if (current) {
        current.entries.push(entry);
      } else {
        grouped.set(key, {
          key,
          userId: entry.userId,
          assignedUserName: entry.assignedUserName,
          role: entry.role,
          entries: [entry],
        });
      }
    }
    return Array.from(grouped.values()).sort((left, right) => {
      const leftActive = left.entries.some((entry) => Boolean(entry.activeSession));
      const rightActive = right.entries.some((entry) => Boolean(entry.activeSession));
      if (leftActive !== rightActive) return leftActive ? -1 : 1;
      return left.assignedUserName.localeCompare(right.assignedUserName);
    });
  }, [data?.entries]);

  if (loading) return <StatusState title={language === "es" ? "Cargando trabajo asignado" : "Loading assigned work"} description={language === "es" ? "Reuniendo asignaciones activas y sesiones en curso." : "Gathering assigned work and active sessions."} />;
  if (error || !data) return <StatusState title={language === "es" ? "Trabajo asignado no disponible" : "Assigned work unavailable"} description={language === "es" ? "Revise la conexión y vuelva a intentarlo." : "Check the connection and retry."} tone="error" action={{ label: t(language, "status.reload"), onClick: onRetry }} />;

  return (
    <section className="my-work-panel" data-testid="assigned-work-panel">
      <header className="panel-heading my-work-heading">
        <div>
          <h2>{language === "es" ? "Trabajo asignado" : "Assigned Work"}</h2>
          <p>{language === "es" ? "Vea quién tiene trabajo asignado y quién está trabajando ahora mismo." : "See who has assigned work and who is actively working right now."}</p>
        </div>
        {canSelectStaff ? (
          <label>
            {language === "es" ? "Ver usuario" : "View user"}
            <select data-testid="assigned-work-staff" value={selectedUserId} onChange={(event) => onUserChange(event.target.value)}>
              <option value="">{language === "es" ? "Todo el personal" : "All staff"}</option>
              {data.staff.map((member) => <option key={member.id} value={member.id}>{member.fullName} / {member.role}</option>)}
            </select>
          </label>
        ) : null}
      </header>
      <div className="my-work-stats">
        <strong>{data.summary.totalAssignments}<span>{language === "es" ? "Asignaciones" : "Assignments"}</span></strong>
        <strong>{data.summary.activeSessions}<span>{language === "es" ? "En trabajo" : "Active now"}</span></strong>
        <strong className={data.summary.overdueAssignments ? "risk" : ""}>{data.summary.overdueAssignments}<span>{language === "es" ? "Atrasadas" : "Overdue"}</span></strong>
        <strong>{data.summary.assignedUsers}<span>{language === "es" ? "Usuarios" : "Users"}</span></strong>
      </div>
      {groups.length === 0 ? <p className="empty-copy">{language === "es" ? "No hay trabajo asignado en este filtro." : "No assigned work matches this filter."}</p> : (
        <div className="assigned-work-groups">
          {groups.map((group) => (
            <section key={group.key} className="assigned-work-group">
              <div className="assigned-work-group-header">
                <div>
                  <h3>{group.assignedUserName}</h3>
                  <p>{group.role ?? (language === "es" ? "Asignación heredada" : "Legacy assignment")}</p>
                </div>
                <span className="muted">{tWithVars(language, "myWork.assignedCount", { count: group.entries.length.toString() })}</span>
              </div>
              <div className="my-work-list">
                {group.entries.map((entry) => {
                  const activeSession = entry.activeSession;
                  const canStart = !!entry.userId && entry.userId === currentUser.id;
                  const canEnd = !!activeSession && (activeSession.userId === currentUser.id || canManageSessions);
                  return (
                    <article key={`${entry.sourceType}-${entry.sourceId}-${group.key}`} className={entry.overdue ? "my-work-card overdue" : "my-work-card"}>
                      <div>
                        <strong>{entry.title}</strong>
                        <span>{entry.property.name} / {entry.subtitle}</span>
                      </div>
                      <div className="my-work-tags">
                        {entry.overdue ? <b>{t(language, "myWork.overdue").toUpperCase()}</b> : null}
                        {entry.priority ? <span>{entry.priority}</span> : null}
                        <span>{entry.status}</span>
                        {entry.dueDate ? <span>{language === "es" ? "Vence" : "Due"} {entry.dueDate.slice(0, 10)}</span> : null}
                        {entry.scheduledDate ? <span>{language === "es" ? "Programado" : "Scheduled"} {entry.scheduledDate.slice(0, 10)}</span> : null}
                        {activeSession ? <b className="warning">{language === "es" ? "Trabajando ahora" : "Working now"}</b> : null}
                      </div>
                      <div className="my-work-progress">
                        {activeSession ? (
                          <span>{language === "es" ? "Iniciado" : "Started"} {startedLabel(activeSession.startedAt)} / {durationLabel(activeSession.startedAt)}</span>
                        ) : (
                          <span>{language === "es" ? "Sin sesión activa" : "No active work session"}</span>
                        )}
                        <progress value={activeSession ? 1 : 0} max={1} />
                      </div>
                      <div className="my-work-actions">
                        <button className="button button-primary" type="button" onClick={() => onOpenEntry(entry)}>{language === "es" ? "Abrir" : "Open"}</button>
                        {canStart && !activeSession ? <button className="button button-secondary" type="button" onClick={() => void onStartWork(entry)}>{language === "es" ? "Iniciar trabajo" : "Start Work"}</button> : null}
                        {canEnd && activeSession ? <button className="button button-secondary" type="button" onClick={() => void onEndWork(activeSession.id)}>{language === "es" ? "Finalizar trabajo" : "End Work"}</button> : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
