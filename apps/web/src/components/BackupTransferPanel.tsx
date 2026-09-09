import { useRef, useState, type ChangeEvent } from "react";
import { exportNativeBackup, importNativeBackup, type BackupImportSummary, type UserLanguage } from "../lib/api";
import { localDateStamp } from "../lib/dateTime";

type Props = {
  onImported: () => Promise<void>;
  language: UserLanguage;
};

function sectionLabel(key: string, isSpanish: boolean) {
  const labels: Record<string, { en: string; es: string }> = {
    properties: { en: "Properties", es: "Propiedades" },
    units: { en: "Units", es: "Unidades" },
    makeReadyItems: { en: "Make-Ready Items", es: "Elementos de make-ready" },
    customFields: { en: "Custom Fields", es: "Campos personalizados" },
    customFieldOptions: { en: "Field Options", es: "Opciones de campo" },
    customFieldValues: { en: "Field Values", es: "Valores de campo" },
    savedViews: { en: "Saved Views", es: "Vistas guardadas" },
    automationRules: { en: "Automation Rules", es: "Reglas de automatización" },
    checklistTemplates: { en: "Checklists", es: "Listas de verificación" },
    notes: { en: "Notes", es: "Notas" },
  };
  return labels[key]?.[isSpanish ? "es" : "en"] ?? key;
}

export function BackupTransferPanel({ onImported, language }: Props) {
  const isSpanish = language === "es";
  const [backup, setBackup] = useState<unknown>(null);
  const [fileName, setFileName] = useState("");
  const [summary, setSummary] = useState<BackupImportSummary | null>(null);
  const [phase, setPhase] = useState<"preview" | "applied" | "blocked" | null>(null);
  const [refreshError, setRefreshError] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const actionPending = useRef(false);
  const hasBlockingIssues = summary
    ? Object.values(summary).some((bucket) => bucket.conflicts > 0 || bucket.errors.length > 0)
    : true;

  const beginAction = () => {
    if (actionPending.current) return false;
    actionPending.current = true;
    setBusy(true);
    return true;
  };
  const endAction = () => { actionPending.current = false; setBusy(false); };

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!beginAction()) return;
    setSummary(null);
    setPhase(null);
    setRefreshError("");
    setBackup(null);
    setFileName("");
    setMessage("");
    setError("");
    const file = event.target.files?.[0];
    if (!file) { endAction(); return; }
    if (!file.name.toLowerCase().endsWith(".json") && file.type !== "application/json") {
      setBackup(null);
      setFileName("");
      setError(isSpanish ? "Seleccione un archivo JSON de respaldo nativo de MakeReadyOS. Aquí no se admiten archivos XLS ni CSV." : "Choose a MakeReadyOS native backup JSON file. XLS and CSV files are not supported here.");
      endAction();
      return;
    }
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      setBackup(parsed);
      setFileName(file.name);
      setMessage(isSpanish ? "Archivo cargado. Ejecute una prueba simulada antes de confirmar la importación." : "File loaded. Run a dry run before confirming an import.");
    } catch {
      setBackup(null);
      setFileName("");
      setError(isSpanish ? "Este archivo no es un JSON válido." : "This file is not valid JSON.");
    } finally { endAction(); }
  };

  const refreshImported = async () => {
    try {
      await onImported();
      setRefreshError("");
    } catch {
      setRefreshError(isSpanish ? "La combinación se aplicó, pero no se pudo actualizar la pantalla. Reintente la actualización; no vuelva a importar." : "Merge applied, but the workspace could not refresh. Retry refresh; do not import again.");
    }
  };

  const retryRefresh = async () => {
    if (!beginAction()) return;
    try { await refreshImported(); } finally { endAction(); }
  };

  const runImport = async (dryRun: boolean) => {
    if (!backup) {
      setError(isSpanish ? "Primero seleccione un archivo JSON de respaldo de MakeReadyOS." : "Choose a MakeReadyOS backup JSON file first.");
      return;
    }
    if (!dryRun && (phase !== "preview" || hasBlockingIssues)) return;
    if (!beginAction()) return;
    setError("");
    setMessage("");
    setRefreshError("");
    try {
      const result = await importNativeBackup(backup, dryRun);
      if (!dryRun && typeof result.applied !== "boolean") throw new Error(isSpanish ? "El servidor no confirmó el resultado. Revise los datos antes de reintentar." : "The server did not confirm the import outcome. Review current data before retrying.");
      setSummary(result.summary);
      setPhase(dryRun ? "preview" : result.applied ? "applied" : "blocked");
      const issues = Object.values(result.summary).some(bucket => bucket.conflicts > 0 || bucket.errors.length > 0);
      setMessage(dryRun
        ? (isSpanish ? "Prueba simulada completa. Revise el resumen antes de importar." : "Dry run complete. Review the summary before importing.")
        : !result.applied
          ? (isSpanish ? "Importación bloqueada. No se cambió ningún registro; revise los errores." : "Import blocked. No records were changed; review the errors.")
          : issues
            ? (isSpanish ? "Combinación aplicada con conflictos. Revise los registros creados y conservados." : "Merge applied with conflicts. Review the created and retained records.")
            : (isSpanish ? "Combinación aplicada. Los registros existentes coincidentes se conservaron." : "Merge applied. Existing matching records were retained."));
      if (result.applied) await refreshImported();
    } catch (nextError) {
      setSummary(null);
      setPhase(null);
      setMessage("");
      setError(nextError instanceof Error ? nextError.message : isSpanish ? "La importación falló." : "Import failed.");
    } finally {
      endAction();
    }
  };

  const downloadExport = async () => {
    if (!beginAction()) return;
    setError("");
    try {
      const data = await exportNativeBackup();
      const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `makereadyos-backup-${localDateStamp()}.json`;
      link.click();
      URL.revokeObjectURL(objectUrl);
      setMessage(isSpanish ? "Respaldo nativo exportado. Guarde el archivo JSON de forma segura." : "Native backup exported. Store the JSON file securely.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : isSpanish ? "La exportación falló." : "Export failed.");
    } finally {
      endAction();
    }
  };

  return (
    <section className="admin-section backup-transfer" data-testid="backup-transfer-panel">
      <div className="admin-section-head">
        <div>
          <p className="eyebrow">{isSpanish ? "Admin" : "Admin"}</p>
          <h3>{isSpanish ? "Respaldo / Transferencia" : "Backup / Transfer"}</h3>
        </div>
        <span className="subtitle">{isSpanish ? "Mueva datos operativos entre instancias de MakeReadyOS." : "Move operational data between MakeReadyOS instances."}</span>
      </div>
      <div className="admin-message warning">
        {isSpanish ? "Solo respaldos JSON nativos. Esto no importa hojas de cálculo heredadas ni exportaciones CSV de reportes." : "Native JSON backups only. This does not import legacy spreadsheet files or reporting CSV exports."}
      </div>
      {message ? <div className={`admin-message ${phase === "blocked" || (summary && hasBlockingIssues) ? "warning" : "success"}`} data-testid="backup-message">{message}</div> : null}
      {error ? <div className="admin-message error" data-testid="backup-error">{error}</div> : null}
      {refreshError ? <div className="admin-message warning" role="alert" data-testid="backup-refresh-error">{refreshError}<button type="button" className="button button-secondary" data-testid="backup-refresh-button" disabled={busy} onClick={retryRefresh}>{isSpanish ? "Reintentar actualización" : "Retry refresh"}</button></div> : null}
      <div className="backup-actions">
        <button type="button" className="button button-secondary" data-testid="backup-export-button" disabled={busy} onClick={downloadExport}>
          {isSpanish ? "Exportar JSON de respaldo" : "Export Backup JSON"}
        </button>
        <label className="backup-file-control">
          {isSpanish ? "Importar archivo JSON" : "Import JSON file"}
          <input data-testid="backup-file-input" type="file" accept=".json,application/json" disabled={busy} onChange={chooseFile} />
        </label>
      </div>
      {fileName ? <p className="subtitle" data-testid="backup-file-name">{isSpanish ? "Seleccionado" : "Selected"}: {fileName}</p> : null}
      <div className="admin-actions">
        <button type="button" className="button button-secondary" data-testid="backup-dry-run-button" disabled={busy || !backup} onClick={() => runImport(true)}>
          {isSpanish ? "Prueba simulada de importación" : "Dry Run Import"}
        </button>
        <button type="button" className="button button-primary" data-testid="backup-confirm-import-button" disabled={busy || !summary || phase !== "preview" || hasBlockingIssues} onClick={() => runImport(false)}>
          {isSpanish ? "Confirmar importación combinada" : "Confirm Merge Import"}
        </button>
      </div>
      {summary ? (
        <div className="backup-summary" data-testid="backup-import-summary">
          <h4>{isSpanish ? "Resumen de importación" : "Import Summary"}</h4>
          {Object.entries(summary).map(([key, bucket]) => (
            <div className="backup-summary-row" key={key}>
              <strong>{sectionLabel(key, isSpanish)}</strong>
              <span>{bucket.created} {phase === "preview" ? (isSpanish ? "por crear" : "would create") : (isSpanish ? "creados" : "created")}</span>
              <span>{bucket.skipped} {isSpanish ? "omitidos" : "skip"}</span>
              <span className={bucket.conflicts ? "summary-alert" : ""}>{bucket.conflicts} {isSpanish ? "conflictos" : "conflicts"}</span>
              {bucket.errors.length ? <small>{bucket.errors.join("; ")}</small> : null}
            </div>
          ))}
          {hasBlockingIssues ? <p className="admin-message warning">{phase === "applied"
            ? (isSpanish ? "La combinación se confirmó. Algunos registros se conservaron o requieren revisión; no vuelva a importar sin revisar el resumen." : "The merge committed. Some records were retained or need review; do not re-import without reviewing the summary.")
            : (isSpanish ? "No se cambió ningún registro. Resuelva los conflictos o errores antes de importar." : "No records were changed. Resolve conflicts or errors before importing.")}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
