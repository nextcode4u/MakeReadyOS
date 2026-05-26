import type { NotificationResponse } from "../lib/api";

type Props = {
  open: boolean;
  data?: NotificationResponse;
  loading: boolean;
  onClose: () => void;
  onRead: (id: string) => Promise<void>;
  onReadAll: () => Promise<void>;
  onDismiss: (id: string) => Promise<void>;
  onOpenItem: (id: string) => void;
  onPreferenceChange: (category: string, enabled: boolean) => Promise<void>;
};

const categoryLabels: Record<string, string> = {
  ASSIGNMENT: "Assigned to me",
  SCHEDULE: "Due soon",
  MOVE_IN_SOON: "Move-in approaching",
  OVERDUE: "Overdue work",
  AUTOMATION: "Automation warnings",
  ITEM_LIFECYCLE: "Item archived/restored",
  BATCH_CHANGE: "Section and batch changes",
  STATUS_CHANGE: "Status changes",
  COMMENT: "Comments",
  CHECKLIST: "Checklist completion",
};

export function NotificationDrawer({ open, data, loading, onClose, onRead, onReadAll, onDismiss, onOpenItem, onPreferenceChange }: Props) {
  if (!open) return null;
  return (
    <>
      <div className="notification-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="notification-drawer" data-testid="notification-drawer" aria-label="Notifications">
        <header>
          <div><h2>Notifications</h2><span>{data?.unreadCount ?? 0} unread</span></div>
          <button className="button button-ghost" onClick={onClose} aria-label="Close notifications">Close</button>
        </header>
        <div className="notification-toolbar">
          <button data-testid="notifications-read-all" className="button button-secondary" disabled={!data?.unreadCount} onClick={() => void onReadAll()}>Mark all read</button>
        </div>
        {loading ? <p className="empty-copy">Loading activity...</p> : !data?.notifications.length ? <p className="empty-copy">No notifications yet.</p> : (
          <div className="notification-list">
            {data.notifications.map((notification) => (
              <article
                key={notification.id}
                className={notification.isRead ? "notification-item" : "notification-item unread"}
              >
                <button type="button" className="notification-open" onClick={async () => {
                    if (!notification.isRead) await onRead(notification.id);
                    if (notification.item) onOpenItem(notification.item.id);
                  }}>
                  <span className="notification-category">{notification.category.replace(/_/g, " ")}</span>
                  <strong>{notification.title}</strong>
                  <p>{notification.message}</p>
                  <small>{new Date(notification.createdAt).toLocaleString()}</small>
                </button>
                <button type="button" className="notification-dismiss" data-testid={`notification-dismiss-${notification.id}`} onClick={() => void onDismiss(notification.id)} aria-label={`Dismiss ${notification.title}`}>×</button>
              </article>
            ))}
          </div>
        )}
        <details className="notification-preferences" data-testid="notification-preferences">
          <summary>In-app notification preferences</summary>
          {(data?.categories ?? []).map((category) => (
            <label key={category}>
              <input
                type="checkbox"
                checked={data?.preferences.find((preference) => preference.category === category)?.enabled !== false}
                onChange={(event) => void onPreferenceChange(category, event.target.checked)}
              />
              {categoryLabels[category] ?? category.replace(/_/g, " ").toLowerCase()}
            </label>
          ))}
          <small>Email and push channels are not enabled; these settings control in-app alerts only.</small>
        </details>
      </aside>
    </>
  );
}
