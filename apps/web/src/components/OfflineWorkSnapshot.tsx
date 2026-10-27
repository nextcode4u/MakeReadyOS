import { useEffect, useState } from "react";
import { getCurrentUser, getMyWork, type UserLanguage } from "../lib/api";
import { clearWorkSnapshot, enableWorkSnapshot, openWorkSnapshot, snapshotMetadata, type WorkSnapshot } from "../lib/offlineWorkSnapshot";

export function SaveOfflineWork({ language }: { language: UserLanguage }) {
  const es = language === "es";
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const failed = () => setMessage(es ? "No se actualizó la copia local. La copia anterior puede estar desactualizada." : "The local copy could not be refreshed. The previous copy may be out of date.");
    window.addEventListener("makereadyos:offline-snapshot-failed", failed);
    return () => window.removeEventListener("makereadyos:offline-snapshot-failed", failed);
  }, [es]);
  return <details className="panel" data-testid="offline-work-save">
    <summary>{es ? "Guardar Mi trabajo para leer sin conexión" : "Save My Work for offline reading"}</summary>
    <p>{es ? "Opcional: cifra una copia de las unidades asignadas durante 8 horas. Sin residentes, códigos, notas ni fotos. Solo lectura. Usa una frase distinta de tu contraseña de inicio de sesión (12 caracteres como mínimo)." : "Optional: encrypt assigned-unit summaries for 8 hours. No residents, codes, notes, or photos. Read-only. Use a separate offline passphrase, not your sign-in password (at least 12 characters)."}</p>
    <p className="helper-copy">{es ? "Los cambios de permisos no pueden detectarse sin conexión. No habilites esta función en un dispositivo compartido sin autorización." : "Permission changes cannot be detected while disconnected. Do not enable this on a shared device without approval."}</p>
    <form onSubmit={event => {
      event.preventDefault();
      if (busy) return;
      setBusy(true); setMessage("");
      const secret = phrase; setPhrase("");
      void (async () => {
        try {
          await getCurrentUser();
          const data = await getMyWork();
          await enableWorkSnapshot(data, secret);
          setMessage(es ? "Guardado en este dispositivo. La copia se actualiza al cargar Mi trabajo durante esta sesión." : "Saved on this device. The copy refreshes when My Work loads during this session.");
        } catch { setMessage(es ? "No se pudo guardar. Verifica la conexión, tu sesión y la frase de 12 caracteres." : "Could not save. Check your connection, session, and 12-character passphrase."); }
        finally { setBusy(false); }
      })();
    }}>
      <label>{es ? "Frase para acceso sin conexión" : "Offline passphrase"}<input type="password" minLength={12} maxLength={256} required autoComplete="new-password" value={phrase} onChange={event => setPhrase(event.target.value)} disabled={busy} /></label>
      <button className="button button-secondary" disabled={busy}>{busy ? (es ? "Guardando…" : "Saving…") : (es ? "Guardar copia cifrada" : "Save encrypted copy")}</button>
      <button className="button button-secondary" type="button" disabled={busy} onClick={() => { clearWorkSnapshot(); setMessage(es ? "Copia eliminada. Los cambios pendientes no se modificaron." : "Copy removed. Queued changes were not touched."); }}>{es ? "Eliminar copia" : "Remove copy"}</button>
    </form>
    {message ? <p role="status">{message}</p> : null}
  </details>;
}

export function OfflineWorkReader({ language, onReconnect }: { language: UserLanguage; onReconnect: () => void }) {
  const es = language === "es";
  const [snapshot, setSnapshot] = useState<WorkSnapshot | null>(null);
  const [available, setAvailable] = useState(() => Boolean(snapshotMetadata()));
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const check = () => {
      if (!snapshotMetadata()) { setSnapshot(null); setAvailable(false); }
    };
    const lock = () => { if (document.hidden) { setSnapshot(null); setPhrase(""); } check(); };
    const timer = window.setInterval(check, 1000);
    document.addEventListener("visibilitychange", lock);
    window.addEventListener("online", onReconnect);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", lock); window.removeEventListener("online", onReconnect); };
  }, [onReconnect]);
  if (!available) return <p>{es ? "No hay una copia local vigente. Conéctate e inicia sesión para guardar una." : "No unexpired local copy is available. Connect and sign in to save one."}</p>;
  return <section className="my-work-panel" data-testid="offline-work-reader">
    <h2>{es ? "Mi trabajo · Copia guardada" : "My Work · Saved copy"}</h2>
    {!snapshot ? <form onSubmit={event => {
      event.preventDefault();
      if (busy) return;
      setBusy(true); setError("");
      const secret = phrase; setPhrase("");
      void openWorkSnapshot(secret).then(value => { if (!document.hidden) setSnapshot(value); }).catch(() => {
        setError(es ? "No se pudo abrir. Revisa la frase; la copia puede haber caducado o cambiado." : "Could not unlock. Check the passphrase; the copy may have expired or changed.");
      }).finally(() => setBusy(false));
    }}>
      <label>{es ? "Frase para acceso sin conexión" : "Offline passphrase"}<input type="password" maxLength={256} required autoComplete="off" value={phrase} onChange={event => setPhrase(event.target.value)} disabled={busy} /></label>
      <button className="button button-secondary" disabled={busy}>{es ? "Abrir copia guardada" : "Open saved copy"}</button>
      {error ? <p role="status">{error}</p> : null}
    </form> : <>
      <p role="status">{es ? "Guardado en este dispositivo" : "Saved on this device"}: <time dateTime={new Date(snapshot.savedAt).toISOString()}>{new Date(snapshot.savedAt).toLocaleString(es ? "es" : "en")}</time></p>
      <p>{es ? "Solo lectura; puede estar desactualizado. Caduca" : "Read-only; may be out of date. Expires"}: {new Date(snapshot.expiresAt).toLocaleString(es ? "es" : "en")}. {es ? "No estás autenticado en el servidor." : "You are not signed in to the server."}</p>
      <label>{es ? "Buscar unidad o propiedad" : "Search unit or property"}<input value={search} onChange={event => setSearch(event.target.value)} /></label>
      <div className="my-work-list">{snapshot.rows.filter(row => `${row.unit} ${row.property}`.toLowerCase().includes(search.toLowerCase())).map(row => <article className="my-work-card" key={row.id}>
        <strong>{row.unit}</strong><span>{row.property}</span>
        <dl><dt>{es ? "Estado guardado" : "Saved status"}</dt><dd>{row.status || "—"}</dd>
          <dt>{es ? "Preparación / Pintura / Limpieza" : "Preparation / Painting / Cleaning"}</dt><dd>{[row.preparation, row.paint, row.cleaning].map(value => value || "—").join(" / ")}</dd>
          <dt>{es ? "Fecha de mudanza guardada" : "Saved move-in date"}</dt><dd>{row.moveIn ? row.moveIn.slice(0, 10) : "—"}</dd></dl>
      </article>)}</div>
      <button className="button button-secondary" onClick={() => setSnapshot(null)}>{es ? "Bloquear copia" : "Lock copy"}</button>
    </>}
    <button className="button button-secondary" disabled={busy} onClick={() => { clearWorkSnapshot(); setSnapshot(null); setAvailable(false); }}>{es ? "Eliminar copia local" : "Remove local copy"}</button>
  </section>;
}
