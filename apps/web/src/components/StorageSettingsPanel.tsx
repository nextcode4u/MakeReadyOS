import { useEffect, useMemo, useState } from "react";
import { getStorageSettings, updatePropertyStorageRouting, validateStoragePath, type StorageSettingsResponse, type StorageValidationResponse } from "../lib/api";
import { StatusState } from "./StatusState";

function formatBytes(value: number | null) {
  if (value === null) return "Unavailable";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let next = value;
  let index = 0;
  while (next >= 1024 && index < units.length - 1) {
    next /= 1024;
    index += 1;
  }
  return `${next.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function StorageSettingsPanel() {
  const [settings, setSettings] = useState<StorageSettingsResponse["storage"] | null>(null);
  const [targetPath, setTargetPath] = useState("");
  const [validation, setValidation] = useState<StorageValidationResponse | null>(null);
  const [propertyRoutingEdits, setPropertyRoutingEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    setBusy(true);
    getStorageSettings()
      .then((result) => {
        if (!mounted) return;
        setSettings(result.storage);
        setPropertyRoutingEdits(Object.fromEntries(result.storage.propertyRouting.map((property) => [property.id, property.uploadSubdir || property.suggestedSubdir])));
        if (result.storage.hostPath.startsWith("/")) {
          setTargetPath(result.storage.hostPath);
        }
      })
      .catch((nextError) => {
        if (!mounted) return;
        setError(nextError instanceof Error ? nextError.message : "Storage settings failed to load.");
      })
      .finally(() => {
        if (mounted) setBusy(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const usagePercent = useMemo(() => {
    if (!settings?.current.totalBytes || settings.current.totalBytes <= 0 || settings.current.freeBytes === null) return null;
    return Math.max(0, Math.min(100, Math.round(((settings.current.totalBytes - settings.current.freeBytes) / settings.current.totalBytes) * 100)));
  }, [settings]);

  const runValidation = async () => {
    setError("");
    setValidation(null);
    setBusy(true);
    try {
      const result = await validateStoragePath(targetPath);
      setValidation(result);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Path validation failed.");
    } finally {
      setBusy(false);
    }
  };

  const savePropertyRouting = async (propertyId: string, mode: "DEFAULT" | "PROPERTY_SUBDIR") => {
    setError("");
    setBusy(true);
    try {
      const result = await updatePropertyStorageRouting({
        propertyId,
        uploadStorageMode: mode,
        uploadSubdir: mode === "PROPERTY_SUBDIR" ? propertyRoutingEdits[propertyId] : null,
      });
      setSettings((current) => current ? {
        ...current,
        propertyRouting: current.propertyRouting.map((property) => property.id === result.property.id ? result.property : property),
      } : current);
      setPropertyRoutingEdits((current) => ({ ...current, [result.property.id]: result.property.uploadSubdir || result.property.suggestedSubdir }));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Property routing update failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="admin-section storage-settings" data-testid="storage-settings-panel">
      <div className="admin-section-head">
        <div>
          <p className="eyebrow">Storage</p>
          <h3>Uploads / NAS Storage</h3>
        </div>
        <span className="subtitle">Photos, attachments, and property-map files live outside PostgreSQL.</span>
      </div>

      {error ? <div className="admin-message error" data-testid="storage-settings-error">{error}</div> : null}

      {settings ? (
        <>
          <div className="storage-status-grid">
            <div>
              <span>Runtime mode</span>
              <strong data-testid="storage-mode">{settings.mode === "HOST_PATH" ? "Host/NAS path" : "Docker volume"}</strong>
            </div>
            <div>
              <span>Container path</span>
              <strong>{settings.uploadDir}</strong>
            </div>
            <div>
              <span>Configured host source</span>
              <strong data-testid="storage-host-path">{settings.hostPath}</strong>
            </div>
            <div>
              <span>Per-file API limit</span>
              <strong data-testid="storage-upload-limit">{settings.uploadLimitLabel}</strong>
            </div>
            <div>
              <span>Bundled web proxy limit</span>
              <strong>{settings.bundledProxyLimit}</strong>
            </div>
            <div>
              <span>Current path writable</span>
              <strong className={settings.current.writable ? "storage-ok" : "storage-bad"}>{settings.current.writable ? "Writable" : "Needs attention"}</strong>
            </div>
            <div>
              <span>Free space</span>
              <strong>{formatBytes(settings.current.freeBytes)}</strong>
            </div>
          </div>

          {usagePercent !== null ? (
            <div className="storage-meter" aria-label={`Upload storage ${usagePercent}% used`}>
              <span style={{ width: `${usagePercent}%` }} />
            </div>
          ) : null}

          {settings.current.error ? <div className="admin-message warning">{settings.current.error}</div> : null}

          <div className="admin-message warning">
            The app can validate and guide storage changes here. Docker still needs the final host/NAS path mounted and the stack restarted before the new path is active. If large photo uploads fail, check any external reverse proxy and available storage space first.
          </div>

          <div className="storage-path-form">
            <label>
              Proposed host/NAS path
              <input
                data-testid="storage-target-path"
                value={targetPath}
                onChange={(event) => {
                  setTargetPath(event.target.value);
                  setValidation(null);
                }}
                placeholder="/mnt/storage/makereadyos-uploads"
              />
            </label>
            <button type="button" className="button button-secondary" data-testid="storage-validate-button" disabled={busy || !targetPath.trim()} onClick={runValidation}>
              Validate Path
            </button>
          </div>

          {validation ? (
            <div className={`storage-validation ${validation.safe ? "safe" : "unsafe"}`} data-testid="storage-validation-result">
              <h4>{validation.safe ? "Path looks safe to use" : "Path needs correction"}</h4>
              <p>Normalized path: <strong>{validation.normalizedPath}</strong></p>
              {validation.errors.length ? (
                <ul>
                  {validation.errors.map((entry) => <li key={entry}>{entry}</li>)}
                </ul>
              ) : null}
              {validation.warnings.length ? (
                <ul>
                  {validation.warnings.map((entry) => <li key={entry}>{entry}</li>)}
                </ul>
              ) : null}
              {validation.commands ? (
                <div className="storage-command-list">
                  <label>1. Back up first<textarea readOnly value={validation.commands.backup} /></label>
                  <label>2. Dry run move<textarea readOnly value={validation.commands.dryRun} /></label>
                  <label>3. Move uploads<textarea readOnly value={validation.commands.move} /></label>
                  <label>4. Update `.env`<textarea readOnly value={validation.commands.env} /></label>
                  <label>5. Restart<textarea readOnly value={validation.commands.restart} /></label>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="storage-routing-panel" data-testid="storage-property-routing">
            <div>
              <h4>Property upload folders</h4>
              <p className="subtitle">Route new photos, attachments, and map files into property subfolders inside the active upload volume. This works with Docker volumes and host/NAS-mounted paths; existing files stay where they are.</p>
            </div>
            <div className="storage-routing-list">
              {settings.propertyRouting.map((property) => (
                <div key={property.id} className="storage-routing-row" data-testid={`storage-routing-${property.code}`}>
                  <div>
                    <strong>{property.code}</strong>
                    <span>{property.name}</span>
                    <small>{property.effectiveSubdir ? `New uploads route to /${property.effectiveSubdir}` : "New uploads use the shared upload root"}</small>
                  </div>
                  <select
                    value={property.uploadStorageMode}
                    aria-label={`Upload routing mode for ${property.code}`}
                    onChange={(event) => void savePropertyRouting(property.id, event.target.value as "DEFAULT" | "PROPERTY_SUBDIR")}
                    disabled={busy}
                  >
                    <option value="DEFAULT">Shared root</option>
                    <option value="PROPERTY_SUBDIR">Property folder</option>
                  </select>
                  <input
                    value={propertyRoutingEdits[property.id] ?? property.suggestedSubdir}
                    onChange={(event) => setPropertyRoutingEdits((current) => ({ ...current, [property.id]: event.target.value }))}
                    placeholder={property.suggestedSubdir}
                    aria-label={`Upload folder for ${property.code}`}
                    disabled={busy || property.uploadStorageMode !== "PROPERTY_SUBDIR"}
                  />
                  <button
                    type="button"
                    className="button button-secondary"
                    data-testid={`storage-routing-save-${property.code}`}
                    disabled={busy || property.uploadStorageMode !== "PROPERTY_SUBDIR"}
                    onClick={() => void savePropertyRouting(property.id, "PROPERTY_SUBDIR")}
                  >
                    Save
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : busy ? (
        <StatusState title="Loading storage settings" description="Checking the active upload path and runtime limits." tone="subtle" />
      ) : (
        <StatusState title="Storage settings unavailable" description="Reload this panel after the API is reachable." tone="error" />
      )}
    </section>
  );
}
