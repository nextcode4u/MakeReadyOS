import type { NotificationResponse, UserLanguage } from "../lib/api";
import { formatDateTime } from "../lib/dateTime";
import { t, tWithVars } from "../lib/i18n";

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
  language: UserLanguage;
};

const categoryLabels: Record<string, { en: string; es: string }> = {
  ASSIGNMENT: { en: "Assigned to me", es: "Asignado a mí" },
  SCHEDULE: { en: "Due soon", es: "Próximo a vencer" },
  MOVE_IN_SOON: { en: "Move-in approaching", es: "Move-in próximo" },
  OVERDUE: { en: "Overdue work", es: "Trabajo vencido" },
  AUTOMATION: { en: "Automation warnings", es: "Alertas de automatización" },
  ITEM_LIFECYCLE: { en: "Item archived/restored", es: "Elemento archivado/restaurado" },
  BATCH_CHANGE: { en: "Section and batch changes", es: "Cambios de sección y lote" },
  STATUS_CHANGE: { en: "Status changes", es: "Cambios de estado" },
  COMMENT: { en: "Comments", es: "Comentarios" },
  CHECKLIST: { en: "Checklist completion", es: "Checklist completado" },
};

export function NotificationDrawer({ open, data, loading, onClose, onRead, onReadAll, onDismiss, onOpenItem, onPreferenceChange, language }: Props) {
  const isSpanish = language === "es";
  if (!open) return null;
  return (
    <>
      <div className="notification-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="notification-drawer" data-testid="notification-drawer" aria-label={t(language, "notifications.title")}>
        <header>
          <div><h2>{t(language, "notifications.title")}</h2><span>{tWithVars(language, "notifications.unreadCount", { count: String(data?.unreadCount ?? 0) })}</span></div>
          <button className="button button-ghost" onClick={onClose} aria-label={t(language, "notifications.closeAria")}>{t(language, "wiki.close")}</button>
        </header>
        <div className="notification-toolbar">
          <button data-testid="notifications-read-all" className="button button-secondary" disabled={!data?.unreadCount} onClick={() => void onReadAll()}>{t(language, "notifications.markAllRead")}</button>
        </div>
        {loading ? <p className="empty-copy">{t(language, "notifications.loading")}</p> : !data?.notifications.length ? <p className="empty-copy">{t(language, "notifications.empty")}</p> : (
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
                  <span className="notification-category">{categoryLabels[notification.category]?.[isSpanish ? "es" : "en"] ?? notification.category.replace(/_/g, " ")}</span>
                  <strong>{notification.title}</strong>
                  <p>{notification.message}</p>
                  <small>{formatDateTime(notification.createdAt)}</small>
                </button>
                <button type="button" className="notification-dismiss" data-testid={`notification-dismiss-${notification.id}`} onClick={() => void onDismiss(notification.id)} aria-label={`${t(language, "notifications.dismiss")} ${notification.title}`}>×</button>
              </article>
            ))}
          </div>
        )}
        <details className="notification-preferences" data-testid="notification-preferences">
          <summary>{t(language, "notifications.preferences")}</summary>
          {(data?.categories ?? []).map((category) => (
            <label key={category}>
              <input
                type="checkbox"
                checked={data?.preferences.find((preference) => preference.category === category)?.enabled !== false}
                onChange={(event) => void onPreferenceChange(category, event.target.checked)}
              />
              {categoryLabels[category]?.[isSpanish ? "es" : "en"] ?? category.replace(/_/g, " ").toLowerCase()}
            </label>
          ))}
          <small>{t(language, "notifications.preferencesHelp")}</small>
        </details>
      </aside>
    </>
  );
}
