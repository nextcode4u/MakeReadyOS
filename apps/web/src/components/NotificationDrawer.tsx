import { useEffect, useMemo, useState } from "react";
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
  onPreferenceChange: (category: string, enabled: boolean, propertyId?: string | null) => Promise<void>;
  onSettingsChange: (input: { quietHoursEnabled: boolean; quietHoursStartMinute: number; quietHoursEndMinute: number }) => Promise<void>;
  language: UserLanguage;
};

const categoryLabels: Record<string, { en: string; es: string }> = {
  ASSIGNMENT: { en: "Assigned to me", es: "Asignado a mí" },
  SCHEDULE: { en: "Due soon", es: "Próximo a vencer" },
  MOVE_IN_SOON: { en: "Move-in approaching", es: "Move-in próximo" },
  OVERDUE: { en: "Overdue work", es: "Trabajo vencido" },
  AUTOMATION_WARNING: { en: "Automation warnings", es: "Alertas de automatización" },
  ITEM_LIFECYCLE: { en: "Item archived/restored", es: "Elemento archivado/restaurado" },
  BATCH_CHANGE: { en: "Section and batch changes", es: "Cambios de sección y lote" },
  STATUS_CHANGE: { en: "Status changes", es: "Cambios de estado" },
  COMMENT: { en: "Comments", es: "Comentarios" },
  CHECKLIST: { en: "Checklist completion", es: "Checklist completado" },
  RISK: { en: "Risk alerts", es: "Alertas de riesgo" },
  VENDOR: { en: "Vendor activity", es: "Actividad de proveedores" },
  PLANNING: { en: "Planning updates", es: "Actualizaciones de planificación" },
  PM: { en: "Preventive maintenance", es: "Mantenimiento preventivo" },
  LEASE_COMPLIANCE: { en: "Lease compliance", es: "Cumplimiento de arrendamiento" },
};

function minutesToInput(minutes: number) {
  const hour = Math.floor(minutes / 60).toString().padStart(2, "0");
  const minute = (minutes % 60).toString().padStart(2, "0");
  return `${hour}:${minute}`;
}

function inputToMinutes(value: string) {
  const [hour, minute] = value.split(":").map((part) => Number(part));
  return (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0);
}

export function NotificationDrawer({ open, data, loading, onClose, onRead, onReadAll, onDismiss, onOpenItem, onPreferenceChange, onSettingsChange, language }: Props) {
  const isSpanish = language === "es";
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(false);
  const [quietStart, setQuietStart] = useState("22:00");
  const [quietEnd, setQuietEnd] = useState("07:00");
  const propertyPreferences = useMemo(
    () => (data?.preferences ?? []).filter((preference) => preference.propertyId === selectedPropertyId),
    [data?.preferences, selectedPropertyId],
  );

  useEffect(() => {
    if (!data?.properties.length) {
      setSelectedPropertyId("");
      return;
    }
    if (!selectedPropertyId || !data.properties.some((property) => property.id === selectedPropertyId)) {
      setSelectedPropertyId(data.properties[0]?.id ?? "");
    }
  }, [data?.properties, selectedPropertyId]);

  useEffect(() => {
    setQuietHoursEnabled(Boolean(data?.settings.quietHoursEnabled));
    setQuietStart(minutesToInput(data?.settings.quietHoursStartMinute ?? 1320));
    setQuietEnd(minutesToInput(data?.settings.quietHoursEndMinute ?? 420));
  }, [data?.settings]);

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
          <div className="notification-pref-block">
            <strong>{isSpanish ? "Categorias globales" : "Global categories"}</strong>
            <small>{isSpanish ? "Controla qué alertas aparecen en cualquier propiedad." : "Control which alerts appear across every property."}</small>
          </div>
          {(data?.categories ?? []).map((category) => (
            <label key={category}>
              <input
                type="checkbox"
                checked={data?.preferences.find((preference) => preference.category === category && preference.propertyId === null)?.enabled !== false}
                onChange={(event) => void onPreferenceChange(category, event.target.checked, null)}
              />
              {categoryLabels[category]?.[isSpanish ? "es" : "en"] ?? category.replace(/_/g, " ").toLowerCase()}
            </label>
          ))}
          {data?.properties.length ? (
            <div className="notification-pref-block">
              <strong>{isSpanish ? "Ajustes por propiedad" : "Per-property overrides"}</strong>
              <select value={selectedPropertyId} onChange={(event) => setSelectedPropertyId(event.target.value)} aria-label={isSpanish ? "Propiedad para preferencias" : "Property for preferences"}>
                {data.properties.map((property) => <option key={property.id} value={property.id}>{property.code} - {property.name}</option>)}
              </select>
              <small>{isSpanish ? "Estas opciones anulan la categoria global solo para la propiedad seleccionada." : "These toggles override the global category only for the selected property."}</small>
              {(data?.categories ?? []).map((category) => (
                <label key={`${selectedPropertyId}-${category}`}>
                  <input
                    type="checkbox"
                    checked={propertyPreferences.find((preference) => preference.category === category)?.enabled ?? data?.preferences.find((preference) => preference.category === category && preference.propertyId === null)?.enabled !== false}
                    onChange={(event) => void onPreferenceChange(category, event.target.checked, selectedPropertyId)}
                  />
                  {categoryLabels[category]?.[isSpanish ? "es" : "en"] ?? category.replace(/_/g, " ").toLowerCase()}
                </label>
              ))}
            </div>
          ) : null}
          <div className="notification-pref-block">
            <strong>{isSpanish ? "Horas de silencio" : "Quiet hours"}</strong>
            <label>
              <input type="checkbox" checked={quietHoursEnabled} onChange={(event) => setQuietHoursEnabled(event.target.checked)} />
              {isSpanish ? "Pausar nuevas alertas durante esta ventana" : "Pause new alerts during this window"}
            </label>
            <div className="notification-quiet-grid">
              <label>{isSpanish ? "Desde" : "Start"}<input type="time" value={quietStart} onChange={(event) => setQuietStart(event.target.value)} /></label>
              <label>{isSpanish ? "Hasta" : "End"}<input type="time" value={quietEnd} onChange={(event) => setQuietEnd(event.target.value)} /></label>
            </div>
            <button type="button" className="button button-secondary" onClick={() => void onSettingsChange({ quietHoursEnabled, quietHoursStartMinute: inputToMinutes(quietStart), quietHoursEndMinute: inputToMinutes(quietEnd) })}>
              {isSpanish ? "Guardar horas de silencio" : "Save quiet hours"}
            </button>
            <small>{isSpanish ? "Las horas de silencio usan la hora local del servidor de esta instalación." : "Quiet hours use this deployment server's local time."}</small>
          </div>
          <small>{t(language, "notifications.preferencesHelp")}</small>
        </details>
      </aside>
    </>
  );
}
