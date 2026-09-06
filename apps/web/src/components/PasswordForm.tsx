import { useState } from "react";
import { createPortal } from "react-dom";
import { passwordAction } from "../lib/api";
import { Modal } from "./Modal";

export function PasswordForm({ mode, token = "", language = "en", onClose }: { mode: "forgot-password" | "reset-password" | "change-password"; token?: string; language?: string; onClose: () => void }) {
  const es = language === "es";
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const forgot = mode === "forgot-password";
  return <form className="login-form" data-testid="password-form" onSubmit={async (event) => {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (!forgot && password !== confirmation) { setError(es ? "Las contrasenas no coinciden." : "Passwords do not match."); return; }
    setBusy(true);
    try {
      await passwordAction(mode, forgot ? { email } : { token, password, currentPassword });
      setPassword(""); setCurrentPassword(""); setConfirmation("");
      setMessage(forgot ? (es ? "Si existe una cuenta activa con ese correo, recibira un enlace. Revise su correo y spam." : "If an active account matches that email, you will receive a link. Check your inbox and spam folder.") : (es ? "Contrasena guardada. Inicie sesion con su nueva contrasena. Se cerraron todas las sesiones." : "Password saved. Sign in with your new password. All existing sessions have been signed out."));
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save password."); }
    finally { setBusy(false); }
  }}>
    {!message ? <>
      {forgot ? <label>{es ? "Correo de la cuenta" : "Account email"}<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254} /></label> : <>
        {mode === "change-password" ? <label>{es ? "Contrasena actual" : "Current password"}<input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required maxLength={1024} /></label> : null}
        <label>{es ? "Nueva contrasena" : "New password"}<input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} maxLength={1024} /></label>
        <label>{es ? "Confirmar contrasena" : "Confirm password"}<input type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} required minLength={8} maxLength={1024} /></label>
        <p className="helper-copy">{es ? "Use al menos 8 caracteres, mayuscula, minuscula, numero y simbolo." : "Use at least 8 characters, including uppercase, lowercase, a number, and a symbol."}</p>
      </>}
      {error ? <p role="alert" className="login-error">{error}</p> : null}
      <button className="button button-primary" disabled={busy}>{busy ? (es ? "Enviando..." : "Submitting...") : forgot ? (es ? "Enviar enlace" : "Send password link") : (es ? "Guardar contrasena" : "Save password")}</button>
    </> : <p role="status" className="login-info">{message}</p>}
    <button type="button" className="button button-secondary" disabled={busy} onClick={() => {
      if (message && !forgot) { window.location.assign(window.location.pathname); return; }
      onClose();
    }}>{message && !forgot ? (es ? "Iniciar sesion" : "Sign in") : (es ? "Volver" : "Back")}</button>
  </form>;
}

export function ChangePasswordButton({ language }: { language: string }) {
  const [open, setOpen] = useState(false);
  const label = language === "es" ? "Cambiar contrasena" : "Change password";
  return <>
    <button type="button" className="button button-secondary" onClick={() => setOpen(true)}>{label}</button>
    {open ? createPortal(<Modal open title={label} onClose={() => setOpen(false)}><PasswordForm mode="change-password" language={language} onClose={() => setOpen(false)} /></Modal>, document.body) : null}
  </>;
}
