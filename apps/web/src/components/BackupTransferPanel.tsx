import { useState, type ChangeEvent } from "react";
import { exportNativeBackup, importNativeBackup, type BackupImportSummary } from "../lib/api";

type Props = {
  onImported: () => Promise<void>;
};

const sectionLabels: Record<string, string> = {
  properties: "Properties",
  units: "Units",
  makeReadyItems: "Make-Ready Items",
  customFields: "Custom Fields",
  customFieldOptions: "Field Options",
  customFieldValues: "Field Values",
  savedViews: "Saved Views",
  automationRules: "Automation Rules",
  checklistTemplates: "Checklists",
  notes: "Notes",
};

export function BackupTransferPanel({ onImported }: Props) {
  const [backup, setBackup] = useState<unknown>(null);
  const [fileName, setFileName] = useState("");
  const [summary, setSummary] = useState<BackupImportSummary | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const hasBlockingIssues = summary
    ? Object.values(summary).some((bucket) => bucket.conflicts > 0 || bucket.errors.length > 0)
    : true;

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    setSummary(null);
    setMessage("");
    setError("");
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".json") && file.type !== "application/json") {
      setBackup(null);
      setFileName("");
      setError("Choose a MakeReadyOS native backup JSON file. XLS and CSV files are not supported here.");
      return;
    }
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      setBackup(parsed);
      setFileName(file.name);
      setMessage("File loaded. Run a dry run before confirming an import.");
    } catch {
      setBackup(null);
      setFileName("");
      setError("This file is not valid JSON.");
    }
  };

  const runImport = async (dryRun: boolean) => {
    if (!backup) {
      setError("Choose a MakeReadyOS backup JSON file first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await importNativeBackup(backup, dryRun);
      setSummary(result.summary);
      setMessage(dryRun ? "Dry run complete. Review the summary before importing." : "Import complete. Existing matching records were not overwritten.");
      if (!dryRun) await onImported();
    } catch (nextError) {
      setSummary(null);
      setMessage("");
      setError(nextError instanceof Error ? nextError.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  const downloadExport = async () => {
    setBusy(true);
    setError("");
    try {
      const data = await exportNativeBackup();
      const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `makereadyos-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(objectUrl);
      setMessage("Native backup exported. Store the JSON file securely.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="admin-section backup-transfer" data-testid="backup-transfer-panel">
      <div className="admin-section-head">
        <div>
          <p className="eyebrow">Admin</p>
          <h3>Backup / Transfer</h3>
        </div>
        <span className="subtitle">Move operational data between MakeReadyOS instances.</span>
      </div>
      <div className="admin-message warning">
        Native JSON backups only. This does not import monday.com Excel files or reporting CSV exports.
      </div>
      {message ? <div className="admin-message success" data-testid="backup-message">{message}</div> : null}
      {error ? <div className="admin-message error" data-testid="backup-error">{error}</div> : null}
      <div className="backup-actions">
        <button type="button" className="button button-secondary" data-testid="backup-export-button" disabled={busy} onClick={downloadExport}>
          Export Backup JSON
        </button>
        <label className="backup-file-control">
          Import JSON file
          <input data-testid="backup-file-input" type="file" accept=".json,application/json" disabled={busy} onChange={chooseFile} />
        </label>
      </div>
      {fileName ? <p className="subtitle" data-testid="backup-file-name">Selected: {fileName}</p> : null}
      <div className="admin-actions">
        <button type="button" className="button button-secondary" data-testid="backup-dry-run-button" disabled={busy || !backup} onClick={() => runImport(true)}>
          Dry Run Import
        </button>
        <button type="button" className="button button-primary" data-testid="backup-confirm-import-button" disabled={busy || !summary || hasBlockingIssues} onClick={() => runImport(false)}>
          Confirm Merge Import
        </button>
      </div>
      {summary ? (
        <div className="backup-summary" data-testid="backup-import-summary">
          <h4>Import Summary</h4>
          {Object.entries(summary).map(([key, bucket]) => (
            <div className="backup-summary-row" key={key}>
              <strong>{sectionLabels[key] ?? key}</strong>
              <span>{bucket.created} create</span>
              <span>{bucket.skipped} skip</span>
              <span className={bucket.conflicts ? "summary-alert" : ""}>{bucket.conflicts} conflicts</span>
              {bucket.errors.length ? <small>{bucket.errors.join("; ")}</small> : null}
            </div>
          ))}
          {hasBlockingIssues ? <p className="admin-message warning">Resolve conflicts or errors before importing. No records have been written.</p> : null}
        </div>
      ) : null}
    </section>
  );
}
