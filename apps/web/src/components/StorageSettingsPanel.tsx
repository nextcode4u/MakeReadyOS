import { useEffect, useMemo, useState } from "react";
import { getStorageSettings, updatePropertyStorageRouting, validateStoragePath, type StorageSettingsResponse, type StorageValidationResponse, type UserLanguage } from "../lib/api";
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

export function StorageSettingsPanel({ language }: { language: UserLanguage }) {
  const isSpanish = language === "es";
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
        setError(nextError instanceof Error ? nextError.message : isSpanish ? "No se pudieron cargar los ajustes de almacenamiento." : "Storage settings failed to load.");
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
      setError(nextError instanceof Error ? nextError.message : isSpanish ? "La validacion de la ruta fallo." : "Path validation failed.");
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
      setError(nextError instanceof Error ? nextError.message : isSpanish ? "La actualizacion del enrutamiento por propiedad fallo." : "Property routing update failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="admin-section storage-settings" data-testid="storage-settings-panel">
      <div className="admin-section-head">
        <div>
          <p className="eyebrow">{isSpanish ? "Almacenamiento" : "Storage"}</p>
          <h3>{isSpanish ? "Cargas / Almacenamiento NAS" : "Uploads / NAS Storage"}</h3>
        </div>
        <span className="subtitle">{isSpanish ? "Las fotos, adjuntos y archivos de mapas de propiedad viven fuera de PostgreSQL." : "Photos, attachments, and property-map files live outside PostgreSQL."}</span>
      </div>

      {error ? <div className="admin-message error" data-testid="storage-settings-error">{error}</div> : null}

      {settings ? (
        <>
          <div className="storage-status-grid">
            <div>
              <span>{isSpanish ? "Modo de ejecucion" : "Runtime mode"}</span>
              <strong data-testid="storage-mode">{settings.mode === "HOST_PATH" ? (isSpanish ? "Ruta host/NAS" : "Host/NAS path") : "Docker volume"}</strong>
            </div>
            <div>
              <span>{isSpanish ? "Ruta del contenedor" : "Container path"}</span>
              <strong>{settings.uploadDir}</strong>
            </div>
            <div>
              <span>{isSpanish ? "Origen host configurado" : "Configured host source"}</span>
              <strong data-testid="storage-host-path">{settings.hostPath}</strong>
            </div>
            <div>
              <span>{isSpanish ? "Limite API por archivo" : "Per-file API limit"}</span>
              <strong data-testid="storage-upload-limit">{settings.uploadLimitLabel}</strong>
            </div>
            <div>
              <span>{isSpanish ? "Limite del proxy web incluido" : "Bundled web proxy limit"}</span>
              <strong>{settings.bundledProxyLimit}</strong>
            </div>
            <div>
              <span>{isSpanish ? "Ruta actual escribible" : "Current path writable"}</span>
              <strong className={settings.current.writable ? "storage-ok" : "storage-bad"}>{settings.current.writable ? (isSpanish ? "Escribible" : "Writable") : (isSpanish ? "Requiere atencion" : "Needs attention")}</strong>
            </div>
            <div>
              <span>{isSpanish ? "Espacio libre" : "Free space"}</span>
              <strong>{formatBytes(settings.current.freeBytes)}</strong>
            </div>
          </div>

          {usagePercent !== null ? (
            <div className="storage-meter" aria-label={isSpanish ? `Almacenamiento de cargas ${usagePercent}% usado` : `Upload storage ${usagePercent}% used`}>
              <span style={{ width: `${usagePercent}%` }} />
            </div>
          ) : null}

          {settings.current.error ? <div className="admin-message warning">{settings.current.error}</div> : null}

          <div className="admin-message warning">
            {isSpanish ? "La app puede validar y guiar cambios de almacenamiento aqui. Docker todavia necesita montar la ruta final host/NAS y reiniciar el stack antes de que la nueva ruta quede activa. Si fallan cargas grandes de fotos, revise primero cualquier proxy inverso externo y el espacio disponible." : "The app can validate and guide storage changes here. Docker still needs the final host/NAS path mounted and the stack restarted before the new path is active. If large photo uploads fail, check any external reverse proxy and available storage space first."}
          </div>

          <div className="storage-path-form">
            <label>
              {isSpanish ? "Ruta host/NAS propuesta" : "Proposed host/NAS path"}
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
              {isSpanish ? "Validar ruta" : "Validate Path"}
            </button>
          </div>

          {validation ? (
            <div className={`storage-validation ${validation.safe ? "safe" : "unsafe"}`} data-testid="storage-validation-result">
              <h4>{validation.safe ? (isSpanish ? "La ruta parece segura para usar" : "Path looks safe to use") : (isSpanish ? "La ruta necesita correccion" : "Path needs correction")}</h4>
              <p>{isSpanish ? "Ruta normalizada:" : "Normalized path:"} <strong>{validation.normalizedPath}</strong></p>
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
                  <label>{isSpanish ? "1. Haga respaldo primero" : "1. Back up first"}<textarea readOnly value={validation.commands.backup} /></label>
                  <label>{isSpanish ? "2. Prueba en seco del movimiento" : "2. Dry run move"}<textarea readOnly value={validation.commands.dryRun} /></label>
                  <label>{isSpanish ? "3. Mover cargas" : "3. Move uploads"}<textarea readOnly value={validation.commands.move} /></label>
                  <label>{isSpanish ? "4. Actualizar `.env`" : "4. Update `.env`"}<textarea readOnly value={validation.commands.env} /></label>
                  <label>{isSpanish ? "5. Reiniciar" : "5. Restart"}<textarea readOnly value={validation.commands.restart} /></label>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="storage-routing-panel" data-testid="storage-property-routing">
            <div>
              <h4>{isSpanish ? "Carpetas de carga por propiedad" : "Property upload folders"}</h4>
              <p className="subtitle">{isSpanish ? "Dirija nuevas fotos, adjuntos y archivos de mapa a subcarpetas por propiedad dentro del volumen de carga activo. Esto funciona con volumenes Docker y rutas host/NAS montadas; los archivos existentes se quedan donde estan." : "Route new photos, attachments, and map files into property subfolders inside the active upload volume. This works with Docker volumes and host/NAS-mounted paths; existing files stay where they are."}</p>
            </div>
            <div className="storage-routing-list">
              {settings.propertyRouting.map((property) => (
                <div key={property.id} className="storage-routing-row" data-testid={`storage-routing-${property.code}`}>
                  <div>
                    <strong>{property.code}</strong>
                    <span>{property.name}</span>
                    <small>{property.effectiveSubdir ? (isSpanish ? `Las nuevas cargas van a /${property.effectiveSubdir}` : `New uploads route to /${property.effectiveSubdir}`) : (isSpanish ? "Las nuevas cargas usan la raiz compartida" : "New uploads use the shared upload root")}</small>
                  </div>
                  <select
                    value={property.uploadStorageMode}
                    aria-label={isSpanish ? `Modo de enrutamiento de carga para ${property.code}` : `Upload routing mode for ${property.code}`}
                    onChange={(event) => void savePropertyRouting(property.id, event.target.value as "DEFAULT" | "PROPERTY_SUBDIR")}
                    disabled={busy}
                  >
                    <option value="DEFAULT">{isSpanish ? "Raiz compartida" : "Shared root"}</option>
                    <option value="PROPERTY_SUBDIR">{isSpanish ? "Carpeta de propiedad" : "Property folder"}</option>
                  </select>
                  <input
                    value={propertyRoutingEdits[property.id] ?? property.suggestedSubdir}
                    onChange={(event) => setPropertyRoutingEdits((current) => ({ ...current, [property.id]: event.target.value }))}
                    placeholder={property.suggestedSubdir}
                    aria-label={isSpanish ? `Carpeta de carga para ${property.code}` : `Upload folder for ${property.code}`}
                    disabled={busy || property.uploadStorageMode !== "PROPERTY_SUBDIR"}
                  />
                  <button
                    type="button"
                    className="button button-secondary"
                    data-testid={`storage-routing-save-${property.code}`}
                    disabled={busy || property.uploadStorageMode !== "PROPERTY_SUBDIR"}
                    onClick={() => void savePropertyRouting(property.id, "PROPERTY_SUBDIR")}
                  >
                    {isSpanish ? "Guardar" : "Save"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : busy ? (
        <StatusState title={isSpanish ? "Cargando ajustes de almacenamiento" : "Loading storage settings"} description={isSpanish ? "Revisando la ruta activa de cargas y los limites de ejecucion." : "Checking the active upload path and runtime limits."} tone="subtle" />
      ) : (
        <StatusState title={isSpanish ? "Ajustes de almacenamiento no disponibles" : "Storage settings unavailable"} description={isSpanish ? "Recargue este panel cuando la API este disponible." : "Reload this panel after the API is reachable."} tone="error" />
      )}
    </section>
  );
}
