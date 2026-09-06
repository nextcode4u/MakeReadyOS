function errorDetail(value: unknown): string {
  if (value instanceof Error) return value.stack || value.message;
  if (typeof value === "string") return value;
  try { return JSON.stringify(value, null, 2) || "Unknown error"; }
  catch { return "Error details unavailable"; }
}

// This notice lives outside the React root so reporting an action error cannot erase drafts.
export function showAppError(error: unknown, fatal = false) {
  document.getElementById("app-error-notice")?.remove();
  const es = document.documentElement.lang.startsWith("es");
  const notice = document.createElement("section");
  notice.id = "app-error-notice";
  notice.setAttribute("role", "alert");
  notice.style.cssText = "position:fixed;bottom:16px;right:16px;z-index:2000;box-sizing:border-box;width:min(480px,calc(100vw - 32px));max-height:70dvh;overflow:auto;padding:18px;border:1px solid var(--border,#58708e);border-radius:12px;background:var(--panel-strong,#0f1a2b);color:var(--text,#f3f6fb);box-shadow:0 8px 32px #0005;";
  const title = document.createElement("strong");
  title.textContent = fatal ? (es ? "No se pudo mostrar la aplicacion" : "The app could not render") : (es ? "Una accion no se pudo completar" : "An action could not be completed");
  const message = document.createElement("p");
  message.textContent = fatal
    ? (es ? "Recarga para volver a abrir la aplicacion. Los cambios sin guardar pueden perderse." : "Reload to reopen the app. Unsaved changes may be lost.")
    : (es ? "Comprueba si la accion se guardo antes de reintentar. No se ha recargado tu espacio de trabajo." : "Check whether the action saved before retrying. Your workspace has not been reloaded.");
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = es ? "Detalles del error" : "Error details";
  const pre = document.createElement("pre");
  pre.style.cssText = "white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;";
  pre.textContent = errorDetail(error);
  details.append(summary, pre);
  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;";
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "button button-secondary";
  dismiss.textContent = es ? "Cerrar" : "Dismiss";
  dismiss.onclick = () => notice.remove();
  const reload = document.createElement("button");
  reload.type = "button";
  reload.className = "button button-secondary";
  reload.textContent = es ? "Recargar" : "Reload app";
  reload.onclick = () => {
    if (window.confirm(es ? "Los cambios sin guardar pueden perderse. Recargar?" : "Unsaved changes may be lost. Reload the app?")) window.location.reload();
  };
  actions.append(dismiss, reload);
  notice.append(title, message, details, actions);
  document.body.append(notice);
}

export function installAppErrorHandlers() {
  const onError = (event: ErrorEvent) => showAppError(event.error || event.message);
  const onRejection = (event: PromiseRejectionEvent) => showAppError(event.reason);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
