import { useEffect, useState } from "react";
import { disableDevicePush, getDevicePush, saveDevicePush, testDevicePush, type DevicePushState } from "../lib/api";

async function registration() {
  const ready = await navigator.serviceWorker.getRegistration();
  if (!ready?.active) throw new Error("Reload MakeReadyOS to activate device notifications.");
  return ready;
}

const pushChanged = "makereadyos-device-push-changed";
const dismissalKey = (userId: string) => `makereadyos.pushPromptDismissed:${userId}`;
function promptDismissed(userId: string) {
  try { return localStorage.getItem(dismissalKey(userId)) === "true"; } catch { return false; }
}

export function DevicePushSettings({ userId, language, onboarding = false }: { userId: string; language: "en" | "es"; onboarding?: boolean }) {
  const es = language === "es";
  const supported = window.isSecureContext && "Notification" in window && "PushManager" in window && "serviceWorker" in navigator;
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const [config, setConfig] = useState<DevicePushState>();
  const [endpoint, setEndpoint] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [reload, setReload] = useState(0);
  const [permission, setPermission] = useState(supported ? Notification.permission : "default");
  const [dismissed, setDismissed] = useState(() => promptDismissed(userId));
  const enabled = Boolean(endpoint && config?.endpoints.includes(endpoint));
  function dismiss() {
    try { localStorage.setItem(dismissalKey(userId), "true"); } catch { /* Keep dismissal for this session if storage is unavailable. */ }
    setDismissed(true);
    window.dispatchEvent(new Event(pushChanged));
  }
  useEffect(() => {
    const refresh = () => { setDismissed(current => current || promptDismissed(userId)); setReload(value => value + 1); };
    window.addEventListener(pushChanged, refresh);
    return () => window.removeEventListener(pushChanged, refresh);
  }, [userId]);
  useEffect(() => {
    let cancelled = false;
    if ((!supported && !(ios && !standalone)) || (onboarding && dismissed)) return;
    setConfig(undefined);
    setMessage("");
    void (async () => {
      const state = await getDevicePush(userId);
      const worker = supported ? await navigator.serviceWorker.getRegistration() : undefined;
      const subscription = await worker?.pushManager.getSubscription();
      if (!cancelled) { setConfig(state); setEndpoint(subscription?.endpoint ?? ""); setPermission(supported ? Notification.permission : "default"); }
    })().catch(error => { if (!cancelled) setMessage(error instanceof Error ? error.message : "Unable to check this device."); });
    return () => { cancelled = true; };
  }, [userId, supported, reload, ios, standalone, onboarding, dismissed]);

  async function enable() {
    setBusy(true); setMessage("");
    try {
      // Keep the permission request directly inside the user's click gesture (iOS).
      const granted = await Notification.requestPermission();
      setPermission(granted);
      if (granted !== "granted") throw new Error(es ? "Permite notificaciones en los ajustes del navegador." : "Allow notifications in your browser settings, then try again.");
      const worker = await registration();
      let subscription = await worker.pushManager.getSubscription();
      if (!subscription) {
        const key = config!.publicKey!;
        const bytes = Uint8Array.from(atob(key.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(key.length / 4) * 4, "=")), char => char.charCodeAt(0));
        subscription = await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
      }
      await saveDevicePush(userId, subscription.toJSON());
      setEndpoint(subscription.endpoint);
      setConfig(state => state ? { ...state, endpoints: [...state.endpoints, subscription!.endpoint] } : state);
      setMessage(es ? "Notificaciones activadas en este dispositivo." : "Notifications enabled on this device.");
      window.dispatchEvent(new Event(pushChanged));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to enable notifications."); }
    finally { setBusy(false); }
  }
  async function action(test: boolean) {
    setBusy(true); setMessage("");
    try {
      if (test) {
        await testDevicePush(userId, endpoint);
        setMessage(es ? "Prueba en cola. Las preferencias y horas de silencio siguen aplicando." : "Test queued. Allow about 15 seconds; category preferences, quiet hours and device settings still apply.");
      } else {
        await disableDevicePush(userId, endpoint);
        setConfig(state => state ? { ...state, endpoints: state.endpoints.filter(value => value !== endpoint) } : state);
        await (await (await registration()).pushManager.getSubscription())?.unsubscribe();
        dismiss();
        setMessage(es ? "Notificaciones desactivadas en este dispositivo." : "Notifications disabled on this device.");
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to update notifications."); }
    finally { setBusy(false); }
  }
  if (onboarding && (dismissed || enabled || permission === "denied" || (!supported && !(ios && !standalone)) || !config?.configured)) return null;
  return <section className={`notification-pref-block${onboarding ? " device-push-onboarding" : ""}`} data-testid={onboarding ? "device-push-onboarding" : "device-push-settings"} aria-label={es ? "Notificaciones del dispositivo" : "Desktop & mobile notifications"}>
    <strong>{onboarding ? (es ? "No te pierdas las alertas de trabajo" : "Don't miss your work alerts") : es ? "Notificaciones del dispositivo" : "Desktop & mobile notifications"}</strong>
    <small>{es ? "Las alertas muestran la propiedad, unidad y tipo de evento, sin notas ni codigos de acceso. Activa cada dispositivo por separado." : "Alerts show the property, unit and event title, but not private notes or access codes. Enable each device separately."}</small>
    {ios && !standalone ? <p>{es ? "En Safari: Compartir → Añadir a pantalla de inicio. Abre la app instalada y activa las notificaciones aquí." : "On iPhone/iPad: open in Safari, Share → Add to Home Screen. Open the installed app and enable notifications here."}</p>
      : !supported ? <p>{es ? "Este navegador necesita HTTPS y soporte de Web Push." : "This browser needs HTTPS and Web Push support. Try a supported browser or the installed app."}</p>
      : !config ? <button className="button button-secondary" disabled={busy} onClick={() => setReload(value => value + 1)}>{message ? (es ? "Reintentar" : "Retry device check") : (es ? "Comprobando..." : "Checking device...")}</button>
      : !config.configured && !enabled ? <p>{es ? "El administrador debe configurar el envio push del servidor." : "An administrator needs to configure push delivery on the server first."}</p>
      : <div className="notification-toolbar">
        <button className={`button ${onboarding ? "button-primary" : "button-secondary"}`} disabled={busy} onClick={() => void (enabled ? action(false) : enable())}>{enabled ? (es ? "Desactivar en este dispositivo" : "Disable on this device") : onboarding ? (es ? "Activar notificaciones" : "Enable notifications") : (es ? "Activar en este dispositivo" : "Enable on this device")}</button>
        {enabled && <button className="button button-secondary" disabled={busy || permission !== "granted" || !config.configured} onClick={() => void action(true)}>{es ? "Enviar prueba" : "Send test notification"}</button>}
        {permission === "denied" && <small>{es ? "Notificaciones bloqueadas en el navegador." : "Notifications are blocked in browser settings."}</small>}
      </div>}
    {message && <p role="status">{message}</p>}
    {onboarding && <div className="notification-toolbar"><button type="button" className="button button-secondary" disabled={busy} onClick={dismiss}>{es ? "Ahora no" : "Not now"}</button><small>{es ? "Puedes activarlas mas tarde en Alertas. Recordaremos tu eleccion en este dispositivo." : "You can enable these later in Alerts. We'll remember your choice on this device."}</small></div>}
  </section>;
}
