import { useEffect, useState } from "react";
import { disableAndroidPush, getAndroidPush, saveAndroidPush, testAndroidPush } from "../lib/api";
import { nativePush, nativePushAvailable } from "../lib/nativePush";
import { getVerifiedSession, isCurrentSession } from "../lib/verifiedSession";

export function AndroidPushSettings({ userId, language, onboarding = false }: { userId: string; language: "en" | "es"; onboarding?: boolean }) {
  const es = language === "es";
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [bindingId, setBindingId] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!onboarding) return;
    const recheck = () => setRefresh(n => n + 1);
    window.addEventListener("makereadyos-native-push-refresh", recheck);
    return () => window.removeEventListener("makereadyos-native-push-refresh", recheck);
  }, [onboarding]);
  async function connect(interactive: boolean, cancelled: () => boolean = () => false) {
    const session = getVerifiedSession();
    const current = () => !cancelled() && isCurrentSession(session) && session.userId === userId;
    if (!current()) return;
    const server = await getAndroidPush(userId);
    if (!current()) return;
    const owner = userId + ":" + server.sessionKey;
    const local = await nativePush("status", { owner, language });
    if (!current()) return;
    if (!server.configured) throw new Error(es ? "El servidor aún no tiene configurado Firebase." : "Firebase delivery is not configured on this server yet.");
    if (local.projectId !== server.projectId) throw new Error(es ? "La app y el servidor usan proyectos Firebase diferentes." : "This APK and server use different Firebase projects.");
    if (!interactive && !local.optedIn) { setEnabled(false); return; }
    const prepared = await nativePush("prepare", { owner, interactive, language });
    if (!current()) return;
    if (!prepared.token || !prepared.bindingId || !local.projectId) throw new Error(es ? "Permite notificaciones en los ajustes de Android." : "Allow notifications in Android settings, then try again.");
    const registered = await saveAndroidPush(userId, { token: prepared.token, bindingId: prepared.bindingId, projectId: local.projectId, sessionKey: server.sessionKey });
    if (!current()) return;
    await nativePush("activate", { owner, bindingId: registered.bindingId, expiresAt: registered.expiresAt });
    if (!current()) return;
    setBindingId(registered.bindingId); setEnabled(true);
    if (interactive) setMessage(es ? "Notificaciones activadas." : "Notifications enabled on this device.");
  }
  useEffect(() => {
    if (!nativePushAvailable()) return;
    let cancelled = false;
    setEnabled(false); setBindingId(""); setMessage(""); setBusy(true);
    void connect(false, () => cancelled).catch(error => { if (!cancelled) setMessage(error instanceof Error ? error.message : "Unable to check notifications."); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
    // Refresh is explicit; no repeated permission prompts or reconnect loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, refresh, onboarding]);
  if (onboarding) return null;
  async function action(kind: "enable" | "disable" | "test") {
    setBusy(true); setMessage("");
    try {
      if (kind === "enable") await connect(true);
      if (kind === "disable") {
        await nativePush("clear");
        setEnabled(false);
        await disableAndroidPush(userId, bindingId);
        setMessage(es ? "Notificaciones desactivadas." : "Notifications disabled on this device.");
      }
      if (kind === "test") {
        await testAndroidPush(userId, bindingId);
        setMessage(es ? "Prueba en cola; se respetan preferencias y horas de silencio." : "Test queued. Preferences, quiet hours and Android settings still apply.");
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to update notifications."); }
    finally { setBusy(false); }
  }
  return <section className="notification-pref-block" aria-label={es ? "Notificaciones Android" : "Android notifications"}>
    <strong>{es ? "Notificaciones Android" : "Android notifications"}</strong>
    <small>{es ? "Alertas importantes, sin datos de residentes ni códigos en la pantalla de bloqueo." : "Important alerts only. No resident details or access codes on the lock screen."}</small>
    {!nativePushAvailable() ? <p>{es ? "Instala una versión de la app configurada para Firebase." : "Install a Firebase-configured APK to enable Android notifications."}</p> : <div className="notification-toolbar">
      <button className="button button-secondary" disabled={busy} onClick={() => void action(enabled ? "disable" : "enable")}>{enabled ? (es ? "Desactivar" : "Disable on this device") : (es ? "Activar notificaciones" : "Enable notifications")}</button>
      {enabled && <button className="button button-secondary" disabled={busy} onClick={() => void action("test")}>{es ? "Enviar prueba" : "Send test notification"}</button>}
      <button className="button button-secondary" disabled={busy} onClick={() => setRefresh(n => n + 1)}>{es ? "Comprobar estado" : "Check status"}</button>
    </div>}
    {message && <p role="status">{message}</p>}
  </section>;
}
