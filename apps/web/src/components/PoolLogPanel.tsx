import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createPoolChemical,
  createPoolFacility,
  createPoolLogEntry,
  getPoolEntries,
  poolAttachmentDownloadUrl,
  getPoolOverview,
  poolLogPrintableReportUrl,
  poolLogExportCsvUrl,
  uploadPoolLogAttachment,
  updatePoolChemical,
  updatePoolFacility,
  isApiError,
  type PoolChemical,
  type PoolFacility,
  type PoolLogEntry,
  type Property,
  type UserRole,
} from "../lib/api";
import { enqueuePoolCreate, enqueuePoolUpload } from "../lib/offlineSync";
import { PropertyWikiWorkflowPanel } from "./PropertyWikiWorkflowPanel";
import { StatusState } from "./StatusState";
import { openProjectCreate } from "../lib/projectNavigation";

type PoolTab = "overview" | "daily" | "setup" | "chemicals" | "history";

type Props = {
  properties: Property[];
  userRole: UserRole;
  selectedPropertyId?: string;
  language?: string;
};

const poolTypes: Array<{ value: PoolFacility["type"]; label: string }> = [
  { value: "POOL", label: "Pool" },
  { value: "SPA", label: "Spa" },
  { value: "WADING_POOL", label: "Wading pool" },
  { value: "SPLASH_PAD", label: "Splash pad" },
  { value: "OTHER", label: "Other" },
];

const chemicalCategories: Array<{ value: PoolChemical["category"]; label: string }> = [
  { value: "CHLORINE", label: "Chlorine" },
  { value: "PH_UP", label: "pH Up" },
  { value: "PH_DOWN", label: "pH Down" },
  { value: "ALKALINITY_UP", label: "Alkalinity Up" },
  { value: "STABILIZER", label: "Stabilizer" },
  { value: "CALCIUM_HARDNESS", label: "Calcium Hardness" },
  { value: "OTHER", label: "Other" },
];

const chemicalUnits: PoolChemical["unit"][] = ["POUNDS", "OUNCES", "GALLONS", "QUARTS", "TABLETS"];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function timeNow() {
  return new Date().toTimeString().slice(0, 5);
}

function formNumber(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function formBool(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function isSolidChemicalUnit(unit: PoolChemical["unit"]) {
  return unit === "POUNDS" || unit === "OUNCES";
}

function normalizeSolidChemicalAmount(pounds: number | null, ounces: number | null) {
  const totalOunces = Math.max(0, (pounds ?? 0) * 16 + (ounces ?? 0));
  return totalOunces > 0 ? totalOunces : null;
}

function formatPoolChemicalAmount(amount: number, unit: PoolChemical["unit"]) {
  if (!Number.isFinite(amount)) {
    return `0 ${unit.toLowerCase()}`;
  }
  if (isSolidChemicalUnit(unit)) {
    const totalOunces = Math.round(amount * 100) / 100;
    const wholePounds = Math.floor(totalOunces / 16);
    const remainingOunces = Math.round((totalOunces - wholePounds * 16) * 100) / 100;
    if (wholePounds > 0 && remainingOunces > 0) {
      return `${wholePounds} lb ${remainingOunces % 1 === 0 ? remainingOunces.toFixed(0) : remainingOunces.toFixed(2).replace(/\.?0+$/, "")} oz`;
    }
    if (wholePounds > 0) {
      return `${wholePounds} lb`;
    }
    return `${remainingOunces % 1 === 0 ? remainingOunces.toFixed(0) : remainingOunces.toFixed(2).replace(/\.?0+$/, "")} oz`;
  }
  return `${amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2).replace(/\.?0+$/, "")} ${unit.toLowerCase()}`;
}

function poolTypeLabel(type: PoolFacility["type"], language: string) {
  const english: Record<PoolFacility["type"], string> = {
    POOL: "Pool",
    SPA: "Spa",
    WADING_POOL: "Wading pool",
    SPLASH_PAD: "Splash pad",
    OTHER: "Other",
  };
  const spanish: Record<PoolFacility["type"], string> = {
    POOL: "Piscina",
    SPA: "Spa",
    WADING_POOL: "Piscina infantil",
    SPLASH_PAD: "Área de chorros",
    OTHER: "Otro",
  };
  return (language === "es" ? spanish : english)[type];
}

function PoolEntryRow({ entry, canEdit, onUpload, language = "en" }: { entry: PoolLogEntry; canEdit: boolean; onUpload: (entryId: string, files: FileList | null) => void; language?: string }) {
  const isSpanish = language === "es";
  const evaluation = entry.evaluationJson;
  const needsFollowUp = evaluation?.status === "REVIEW" || entry.safetyChecks.some((check) => check.value === "FAIL");
  return (
    <div className="pool-history-row" data-testid="pool-history-row">
      <div>
        <strong>{entry.facility.name}</strong>
        <span>{entry.property?.code ?? ""} / {new Date(entry.logDate).toLocaleDateString()} {entry.logTime ?? ""}</span>
      </div>
      <div className="pool-reading-stack">
        <span>pH {entry.ph ?? "-"}</span>
        <span>FC {entry.freeChlorine ?? "-"}</span>
        <span>CC {entry.combinedChlorine ?? "-"}</span>
        <span>TA {entry.totalAlkalinity ?? "-"}</span>
        {entry.chemicalAdditions.length ? (
          <span data-testid="pool-chemical-additions-summary">
            {entry.chemicalAdditions.map((addition) => `${addition.chemicalName} ${formatPoolChemicalAmount(addition.amount, addition.unit)}`).join("; ")}
          </span>
        ) : null}
      </div>
      <span className={`status-pill ${evaluation?.status === "REVIEW" ? "risk-high" : ""}`}>{evaluation?.status ?? "Logged"}</span>
      <div className="pool-entry-actions">
        {canEdit ? (
          <button
            type="button"
            className="button button-secondary"
            onClick={() => openProjectCreate({
              propertyId: entry.propertyId,
              source: "Pool Log",
              recordType: "Recommendation",
              title: `${entry.facility.name} follow-up`,
              description: [
                `Pool log follow-up from ${new Date(entry.logDate).toLocaleDateString()}${entry.logTime ? ` ${entry.logTime}` : ""}.`,
                entry.notes ?? "",
              ].filter(Boolean).join("\n\n"),
              sourceRecordType: "POOL_LOG_ENTRY",
              sourceRecordId: entry.id,
              sourceRecordLabel: entry.facility.name,
              building: entry.facility.name,
              area: entry.facility.type.replace(/_/g, " "),
              tags: ["pool-log", needsFollowUp ? "review" : "follow-up"],
            })}
          >
            {isSpanish ? "Crear recomendación" : "Create Recommendation"}
          </button>
        ) : null}
        {entry.attachments?.length ? (
          <div className="pool-attachment-list">
            {entry.attachments.slice(0, 3).map((attachment) => (
              <a key={attachment.id} href={poolAttachmentDownloadUrl(attachment.id)} target="_blank" rel="noreferrer">
                {attachment.originalName}
              </a>
            ))}
            {entry.attachments.length > 3 ? <span>+{entry.attachments.length - 3} {isSpanish ? "más" : "more"}</span> : null}
          </div>
        ) : <span className="muted">{isSpanish ? "Sin fotos/archivos de piscina" : "No pool photos/files"}</span>}
        {canEdit ? (
          <label className="button button-secondary pool-upload-button">
            {isSpanish ? "Subir foto/PDF" : "Upload photo/PDF"}
            <input
              data-testid="pool-attachment-upload"
              type="file"
              accept="image/*,.pdf"
              hidden
              onChange={(event) => {
                onUpload(entry.id, event.target.files);
                event.currentTarget.value = "";
              }}
            />
          </label>
        ) : null}
      </div>
    </div>
  );
}

export function PoolLogPanel({ properties, userRole, selectedPropertyId, language = "en" }: Props) {
  const queryClient = useQueryClient();
  const isSpanish = language === "es";
  const [tab, setTab] = useState<PoolTab>("overview");
  const [propertyId, setPropertyId] = useState(selectedPropertyId || properties[0]?.id || "");
  const canManage = userRole === "ADMIN" || userRole === "MANAGER";
  const canEdit = canManage || userRole === "TECH";

  const overviewQuery = useQuery({
    queryKey: ["pool-overview", propertyId],
    queryFn: () => getPoolOverview(propertyId ? { propertyId } : {}),
  });
  const historyQuery = useQuery({
    queryKey: ["pool-entries", propertyId],
    queryFn: () => getPoolEntries({ propertyId: propertyId || undefined, limit: 60 }),
  });

  const facilities = overviewQuery.data?.facilities ?? [];
  const chemicals = overviewQuery.data?.chemicals ?? [];
  const activeChemicalsById = useMemo(() => new Map(chemicals.map((chemical) => [chemical.id, chemical])), [chemicals]);
  const selectedProperty = properties.find((property) => property.id === propertyId);
  const defaultFacilityId = facilities[0]?.id ?? "";
  const [selectedChemicalId, setSelectedChemicalId] = useState("");
  const selectedChemical = selectedChemicalId ? activeChemicalsById.get(selectedChemicalId) ?? null : null;
  const workflowEntry = historyQuery.data?.entries[0] ?? overviewQuery.data?.recentEntries?.[0] ?? null;
  const workflowFacilityName = workflowEntry?.facility?.name ?? facilities[0]?.name ?? null;

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["pool-overview"] }),
      queryClient.invalidateQueries({ queryKey: ["pool-entries"] }),
    ]);
  };

  const facilityCreateMutation = useMutation({
    mutationFn: createPoolFacility,
    onSuccess: invalidate,
  });
  const facilityUpdateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updatePoolFacility>[1] }) => updatePoolFacility(id, data),
    onSuccess: invalidate,
  });
  const chemicalCreateMutation = useMutation({
    mutationFn: createPoolChemical,
    onSuccess: invalidate,
  });
  const chemicalUpdateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updatePoolChemical>[1] }) => updatePoolChemical(id, data),
    onSuccess: invalidate,
  });
  const entryCreateMutation = useMutation({
    mutationFn: createPoolLogEntry,
    onSuccess: invalidate,
  });
  const attachmentUploadMutation = useMutation({
    mutationFn: async ({ entryId, file }: { entryId: string; file: File }) => {
      try {
        return await uploadPoolLogAttachment(entryId, file);
      } catch (error) {
        if (isApiError(error) && error.status === 0) {
          await enqueuePoolUpload(entryId, propertyId || undefined, [file]);
          return { attachment: null };
        }
        throw error;
      }
    },
    onSuccess: invalidate,
  });

  async function submitFacility(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!propertyId) return;
    const formData = new FormData(event.currentTarget);
    await facilityCreateMutation.mutateAsync({
      propertyId,
      name: String(formData.get("name") ?? "").trim(),
      type: String(formData.get("type") ?? "POOL") as PoolFacility["type"],
      capacityGallons: formNumber(formData, "capacityGallons"),
      surfaceType: String(formData.get("surfaceType") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
    });
    event.currentTarget.reset();
  }

  async function submitChemical(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!propertyId) return;
    const formData = new FormData(event.currentTarget);
    await chemicalCreateMutation.mutateAsync({
      propertyId,
      name: String(formData.get("name") ?? "").trim(),
      category: String(formData.get("category") ?? "CHLORINE") as PoolChemical["category"],
      concentrationPercent: formNumber(formData, "concentrationPercent"),
      unit: String(formData.get("unit") ?? "POUNDS") as PoolChemical["unit"],
      notes: String(formData.get("notes") ?? "").trim() || null,
    });
    event.currentTarget.reset();
  }

  async function submitDailyLog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!propertyId) return;
    const formData = new FormData(event.currentTarget);
    const facilityId = String(formData.get("facilityId") ?? "");
    const chemicalId = String(formData.get("chemicalId") ?? "");
    const chemical = chemicalId ? activeChemicalsById.get(chemicalId) : null;
    const amount = chemical
      ? isSolidChemicalUnit(chemical.unit)
        ? normalizeSolidChemicalAmount(formNumber(formData, "chemicalAmountPounds"), formNumber(formData, "chemicalAmountOunces"))
        : formNumber(formData, "chemicalAmount")
      : null;
    const entryInput = {
      propertyId,
      facilityId,
      logDate: String(formData.get("logDate") ?? today()),
      logTime: String(formData.get("logTime") ?? "") || null,
      ph: formNumber(formData, "ph"),
      freeChlorine: formNumber(formData, "freeChlorine"),
      combinedChlorine: formNumber(formData, "combinedChlorine"),
      totalChlorine: formNumber(formData, "totalChlorine"),
      totalAlkalinity: formNumber(formData, "totalAlkalinity"),
      cyanuricAcid: formNumber(formData, "cyanuricAcid"),
      calciumHardness: formNumber(formData, "calciumHardness"),
      waterTemperature: formNumber(formData, "waterTemperature"),
      vacuumed: formBool(formData, "vacuumed"),
      backwashed: formBool(formData, "backwashed"),
      skimmerCleaned: formBool(formData, "skimmerCleaned"),
      pumpRunning: formBool(formData, "pumpRunning"),
      filterOperating: formBool(formData, "filterOperating"),
      waterClear: formBool(formData, "waterClear"),
      waterCloudy: formBool(formData, "waterCloudy"),
      algaePresent: formBool(formData, "algaePresent"),
      notes: String(formData.get("notes") ?? "").trim() || null,
      safetyChecks: (overviewQuery.data?.safetyItems ?? []).map((label, index) => ({
        label,
        value: String(formData.get(`safety-${index}`) ?? "PASS") as "PASS" | "FAIL" | "NA",
        notes: String(formData.get(`safety-notes-${index}`) ?? "").trim() || null,
        sortOrder: index,
      })),
      chemicalAdditions: chemical && amount ? [{
        chemicalId: chemical.id,
        chemicalName: chemical.name,
        amount,
        unit: isSolidChemicalUnit(chemical.unit) ? "OUNCES" as PoolChemical["unit"] : chemical.unit,
      }] : [],
    };
    try {
      await entryCreateMutation.mutateAsync(entryInput);
    } catch (error) {
      if (!(isApiError(error) && error.status === 0)) {
        throw error;
      }
      await enqueuePoolCreate(entryInput);
    }
    event.currentTarget.reset();
    setSelectedChemicalId("");
  }

  function uploadPoolFiles(entryId: string, files: FileList | null) {
    if (!files?.length) return;
    Array.from(files).forEach((file) => {
      void attachmentUploadMutation.mutateAsync({ entryId, file });
    });
  }

  return (
    <section className="pool-panel module-panel" data-testid="pool-log-panel">
      <div className="module-heading">
        <div>
          <span className="eyebrow">PoolLogOS</span>
          <h1>{isSpanish ? "Registro de piscina" : "Pool Log"}</h1>
          <p>{isSpanish ? "Lecturas diarias de piscina y spa, revisiones de seguridad, químicos agregados y revisión de cumplimiento para cada propiedad." : "Daily pool and spa readings, safety checks, chemical additions, and compliance review for each property."}</p>
        </div>
        <div className="module-actions">
          <select value={propertyId} onChange={(event) => setPropertyId(event.target.value)} aria-label={isSpanish ? "Propiedad del registro de piscina" : "Pool log property"}>
            <option value="">{isSpanish ? "Todas las propiedades accesibles" : "All accessible properties"}</option>
            {properties.map((property) => <option key={property.id} value={property.id}>{property.code} - {property.name}</option>)}
          </select>
          <a className="button secondary" data-testid="pool-report-printable" href={poolLogPrintableReportUrl({ propertyId: propertyId || undefined })} target="_blank" rel="noreferrer">{isSpanish ? "Reporte PDF" : "PDF report"}</a>
          <a className="button secondary" data-testid="pool-export-csv" href={poolLogExportCsvUrl({ propertyId: propertyId || undefined })}>{isSpanish ? "Exportar CSV" : "Export CSV"}</a>
        </div>
      </div>

      <div className="module-tabs">
        {(["overview", "daily", "setup", "chemicals", "history"] as PoolTab[]).map((value) => (
          <button key={value} data-testid={`pool-tab-${value}`} className={tab === value ? "active" : ""} type="button" onClick={() => setTab(value)}>
            {value === "overview" ? (isSpanish ? "Resumen" : "Overview")
              : value === "daily" ? (isSpanish ? "Registro diario" : "Daily log")
                : value === "setup" ? (isSpanish ? "Configuración" : "Setup")
                  : value === "chemicals" ? (isSpanish ? "Químicos" : "Chemicals")
                    : (isSpanish ? "Historial" : "History")}
          </button>
        ))}
      </div>

      {overviewQuery.isLoading ? (
        <StatusState title={isSpanish ? "Cargando registro de piscina" : "Loading pool log"} description={isSpanish ? "Cargando piscinas, químicos y lecturas de hoy." : "Fetching pools, chemicals, and today’s readings."} />
      ) : overviewQuery.isError ? (
        <StatusState title={isSpanish ? "No se pudo cargar el registro de piscina" : "Pool log failed to load"} description={isSpanish ? "Actualice e inténtelo de nuevo." : "Refresh and try again."} tone="error" />
      ) : tab === "overview" ? (
        <>
          <div className="pool-kpi-grid">
            <div className="pool-kpi" data-testid="pool-kpi-active"><strong>{overviewQuery.data?.summary.activeFacilities ?? 0}</strong><span>{isSpanish ? "Piscinas/spas activos" : "Active pools/spas"}</span></div>
            <div className="pool-kpi" data-testid="pool-kpi-logs"><strong>{overviewQuery.data?.summary.logsToday ?? 0}</strong><span>{isSpanish ? "Registros hoy" : "Logs today"}</span></div>
            <div className="pool-kpi warning" data-testid="pool-kpi-missing"><strong>{overviewQuery.data?.summary.missingLogs ?? 0}</strong><span>{isSpanish ? "Faltantes hoy" : "Missing today"}</span></div>
            <div className="pool-kpi danger" data-testid="pool-kpi-safety"><strong>{overviewQuery.data?.summary.safetyFailures ?? 0}</strong><span>{isSpanish ? "Fallos de seguridad" : "Safety failures"}</span></div>
            <div className="pool-kpi warning" data-testid="pool-kpi-chemistry"><strong>{overviewQuery.data?.summary.chemistryIssues ?? 0}</strong><span>{isSpanish ? "Problemas de química" : "Chemistry issues"}</span></div>
          </div>
          <div className="pool-grid">
            <article className="pool-card">
              <h2>{isSpanish ? "Piscinas sin registro hoy" : "Pools not logged today"}</h2>
              {overviewQuery.data?.missingFacilities.length ? overviewQuery.data.missingFacilities.map((facility) => (
                <div className="pool-row" key={facility.id}>
                  <strong>{facility.name}</strong>
                  <span>{facility.property?.code ?? selectedProperty?.code} / {poolTypeLabel(facility.type, language)}</span>
                </div>
              )) : <p className="muted">{isSpanish ? "Todas las piscinas/spas activas ya tienen registro hoy." : "All active pools/spas have a log today."}</p>}
            </article>
            <article className="pool-card">
              <h2>{isSpanish ? "Elementos para revisar" : "Review items"}</h2>
              {overviewQuery.data?.safetyFailures.length ? overviewQuery.data.safetyFailures.map((failure, index) => (
                <div className="pool-row danger" key={`${failure.entryId}-${failure.label}-${index}`}>
                  <strong>{failure.facilityName}</strong>
                  <span>{failure.label}{failure.notes ? ` / ${failure.notes}` : ""}</span>
                </div>
              )) : null}
              {overviewQuery.data?.chemistryIssues.length ? overviewQuery.data.chemistryIssues.slice(0, 8).map((issue, index) => (
                <div className="pool-row warning" key={`${issue.entryId}-${index}`}>
                  <strong>{issue.facilityName}</strong>
                  <span>{typeof issue.issue === "object" && issue.issue && "message" in issue.issue ? String((issue.issue as { message: unknown }).message) : (isSpanish ? "La química necesita revisión" : "Chemistry needs review")}</span>
                </div>
              )) : null}
              {!overviewQuery.data?.safetyFailures.length && !overviewQuery.data?.chemistryIssues.length ? <p className="muted">{isSpanish ? "No hay elementos de seguridad o química para revisar hoy." : "No safety or chemistry review items today."}</p> : null}
            </article>
          </div>
          <PropertyWikiWorkflowPanel
            title={isSpanish ? "Acceso wiki de piscina" : "Pool Wiki Access"}
            module="POOL_LOG"
            propertyId={propertyId}
            recordType={workflowEntry?.id ? "POOL_LOG_ENTRY" : undefined}
            recordId={workflowEntry?.id ?? undefined}
            facilityName={workflowFacilityName}
            building={workflowFacilityName}
            equipmentQuery={workflowFacilityName}
            query="pool equipment procedures vendors emergency"
            canEdit={canEdit}
          />
        </>
      ) : tab === "daily" ? (
        <div className="pool-grid pool-daily-grid">
          <form className="pool-card pool-form" data-testid="pool-daily-form" onSubmit={submitDailyLog}>
            {!facilities.length ? <StatusState title={isSpanish ? "No hay piscinas o spas configurados" : "No pools or spas configured"} description={isSpanish ? "Cree una piscina/spa en Configuración antes de registrar lecturas." : "Create a pool/spa in Setup before logging readings."} /> : null}
            <div className="form-grid">
              <label>{isSpanish ? "Piscina/spa" : "Pool/spa"}
                <select name="facilityId" defaultValue={defaultFacilityId} required>
                  {facilities.map((facility) => <option key={facility.id} value={facility.id}>{facility.name}</option>)}
                </select>
              </label>
              <label>{isSpanish ? "Fecha" : "Date"} <input name="logDate" type="date" defaultValue={today()} required /></label>
              <label>{isSpanish ? "Hora" : "Time"} <input name="logTime" type="time" defaultValue={timeNow()} /></label>
              <label>pH <input name="ph" data-testid="pool-reading-ph" type="number" step="0.01" /></label>
              <label>{isSpanish ? "Cloro libre" : "Free chlorine"} <input name="freeChlorine" data-testid="pool-reading-free-chlorine" type="number" step="0.01" /></label>
              <label>{isSpanish ? "Cloro combinado" : "Combined chlorine"} <input name="combinedChlorine" type="number" step="0.01" /></label>
              <label>{isSpanish ? "Cloro total" : "Total chlorine"} <input name="totalChlorine" type="number" step="0.01" /></label>
              <label>{isSpanish ? "Alcalinidad total" : "Total alkalinity"} <input name="totalAlkalinity" type="number" step="1" /></label>
              <label>CYA <input name="cyanuricAcid" type="number" step="1" /></label>
              <label>{isSpanish ? "Dureza de calcio" : "Calcium hardness"} <input name="calciumHardness" type="number" step="1" /></label>
              <label>{isSpanish ? "Temp. del agua" : "Water temp"} <input name="waterTemperature" type="number" step="1" /></label>
            </div>
            <fieldset className="pool-check-row">
              <legend>{isSpanish ? "Operaciones" : "Operations"}</legend>
              {["vacuumed", "backwashed", "skimmerCleaned", "pumpRunning", "filterOperating", "waterClear", "waterCloudy", "algaePresent"].map((name) => (
                <label key={name} className="check-pill"><input name={name} type="checkbox" /> {name.replace(/([A-Z])/g, " $1")}</label>
              ))}
            </fieldset>
            <fieldset className="pool-safety-grid">
              <legend>{isSpanish ? "Lista de seguridad" : "Safety checklist"}</legend>
              {(overviewQuery.data?.safetyItems ?? []).map((label, index) => (
                <label key={label}>{label}
                <select name={`safety-${index}`} data-testid={`pool-safety-${index}`} defaultValue="PASS">
                    <option value="PASS">{isSpanish ? "Pasa" : "Pass"}</option>
                    <option value="FAIL">{isSpanish ? "Falla" : "Fail"}</option>
                    <option value="NA">N/A</option>
                  </select>
                </label>
              ))}
            </fieldset>
            <div className="form-grid">
              <label>{isSpanish ? "Químico agregado" : "Chemical added"}
                <select
                  name="chemicalId"
                  value={selectedChemicalId}
                  onChange={(event) => setSelectedChemicalId(event.target.value)}
                >
                  <option value="">{isSpanish ? "Sin químico agregado" : "No chemical added"}</option>
                  {chemicals.map((chemical) => <option key={chemical.id} value={chemical.id}>{chemical.name}</option>)}
                </select>
              </label>
              {selectedChemical && isSolidChemicalUnit(selectedChemical.unit) ? (
                <>
                  <label>{isSpanish ? "Libras" : "Pounds"}
                    <input name="chemicalAmountPounds" data-testid="pool-chemical-pounds" type="number" min="0" step="1" placeholder="0" />
                  </label>
                  <label>{isSpanish ? "Onzas" : "Ounces"}
                    <input name="chemicalAmountOunces" data-testid="pool-chemical-ounces" type="number" min="0" step="0.01" placeholder="0" />
                  </label>
                </>
              ) : (
                <label>{isSpanish ? "Cantidad" : "Amount"}
                  <input
                    name="chemicalAmount"
                    data-testid="pool-chemical-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder={selectedChemical ? selectedChemical.unit.toLowerCase() : ""}
                  />
                </label>
              )}
            </div>
            {selectedChemical && isSolidChemicalUnit(selectedChemical.unit) ? <p className="muted">{isSpanish ? "Los químicos sólidos se normalizan en libras y onzas. Ejemplo: ingrese `70` onzas para registrar `4 lb 6 oz`." : "Solid chemicals are normalized as pounds and ounces. Example: enter `70` ounces to record `4 lb 6 oz`."}</p> : null}
            <label>{isSpanish ? "Notas" : "Notes"} <textarea name="notes" placeholder={isSpanish ? "Agua turbia, problema con la puerta, acción química, seguimiento..." : "Cloudy water, gate issue, chemical action, follow-up..."} /></label>
            <button type="submit" data-testid="pool-daily-submit" disabled={!canEdit || !facilities.length || entryCreateMutation.isPending}>{isSpanish ? "Guardar registro diario de piscina" : "Save daily pool log"}</button>
            {!canEdit ? <p className="muted">{isSpanish ? "Su rol puede ver registros de piscina, pero no crear entradas." : "Your role can view pool logs but cannot create entries."}</p> : null}
          </form>
          <PropertyWikiWorkflowPanel
            title={isSpanish ? "Equipo, SOP y procedimientos de emergencia de piscina" : "Pool Equipment, SOPs, and Emergency Procedures"}
            module="POOL_LOG"
            propertyId={propertyId}
            recordType={workflowEntry?.id ? "POOL_LOG_ENTRY" : undefined}
            recordId={workflowEntry?.id ?? undefined}
            facilityName={workflowFacilityName}
            building={workflowFacilityName}
            equipmentQuery={workflowFacilityName}
            query="pool equipment procedures vendors emergency"
            canEdit={canEdit}
          />
        </div>
      ) : tab === "setup" ? (
        <div className="pool-grid">
          <form className="pool-card pool-form" data-testid="pool-facility-form" onSubmit={submitFacility}>
            <h2>{isSpanish ? "Agregar piscina/spa" : "Add pool/spa"}</h2>
            <input name="name" data-testid="pool-facility-name" placeholder={isSpanish ? "Nombre de piscina/spa" : "Pool/spa name"} required disabled={!canManage} />
            <select name="type" disabled={!canManage}>{poolTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select>
            <input name="capacityGallons" type="number" step="1" placeholder={isSpanish ? "Capacidad en galones (opcional)" : "Capacity gallons (optional)"} disabled={!canManage} />
            <input name="surfaceType" placeholder={isSpanish ? "Tipo de superficie (opcional)" : "Surface type (optional)"} disabled={!canManage} />
            <textarea name="notes" placeholder={isSpanish ? "Notas" : "Notes"} disabled={!canManage} />
            <button type="submit" data-testid="pool-facility-submit" disabled={!canManage || facilityCreateMutation.isPending}>{isSpanish ? "Agregar piscina/spa" : "Add pool/spa"}</button>
            <p className="muted">{isSpanish ? "La capacidad es opcional. Las estimaciones de dosificación no están disponibles hasta conocer la capacidad." : "Capacity is optional. Dosage estimates are unavailable until capacity is known."}</p>
          </form>
          <article className="pool-card">
            <h2>{isSpanish ? "Piscinas/spas configurados" : "Configured pools/spas"}</h2>
            {facilities.map((facility) => (
              <div className="pool-row" key={facility.id}>
                <div>
                  <strong>{facility.name}</strong>
                  <span>{poolTypeLabel(facility.type, language)} / {facility.capacityGallons ? `${facility.capacityGallons.toLocaleString()} gal` : (isSpanish ? "capacidad faltante" : "capacity missing")}</span>
                </div>
                {canManage ? <button type="button" onClick={() => facilityUpdateMutation.mutate({ id: facility.id, data: { isActive: false } })}>{isSpanish ? "Archivar" : "Archive"}</button> : null}
              </div>
            ))}
            {!facilities.length ? <p className="muted">{isSpanish ? "No hay piscinas/spas activos configurados." : "No active pools/spas configured."}</p> : null}
          </article>
        </div>
      ) : tab === "chemicals" ? (
        <div className="pool-grid">
          <form className="pool-card pool-form" data-testid="pool-chemical-form" onSubmit={submitChemical}>
            <h2>{isSpanish ? "Agregar químico" : "Add chemical"}</h2>
            <input name="name" data-testid="pool-chemical-name" placeholder={isSpanish ? "Nombre del químico" : "Chemical name"} required disabled={!canManage} />
            <select name="category" disabled={!canManage}>{chemicalCategories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select>
            <select name="unit" disabled={!canManage}>{chemicalUnits.map((unit) => <option key={unit} value={unit}>{unit.replace(/_/g, " ")}</option>)}</select>
            <input name="concentrationPercent" type="number" step="0.01" min="0" max="100" placeholder={isSpanish ? "Concentración % (opcional)" : "Concentration % (optional)"} disabled={!canManage} />
            <textarea name="notes" placeholder={isSpanish ? "Notas" : "Notes"} disabled={!canManage} />
            <button type="submit" data-testid="pool-chemical-submit" disabled={!canManage || chemicalCreateMutation.isPending}>{isSpanish ? "Agregar químico" : "Add chemical"}</button>
            <p className="muted">{isSpanish ? "La concentración es opcional, pero las estimaciones exactas de dosificación la necesitan." : "Concentration is optional, but exact dosage estimates need it."}</p>
          </form>
          <article className="pool-card">
            <h2>{isSpanish ? "Biblioteca de químicos" : "Chemical library"}</h2>
            {chemicals.map((chemical) => (
              <div className="pool-row" key={chemical.id}>
                <div>
                  <strong>{chemical.name}</strong>
                  <span>{chemical.category.replace(/_/g, " ")} / {chemical.concentrationPercent ? `${chemical.concentrationPercent}%` : (isSpanish ? "concentración faltante" : "concentration missing")} / {chemical.unit}</span>
                </div>
                {canManage ? <button type="button" onClick={() => chemicalUpdateMutation.mutate({ id: chemical.id, data: { isActive: false } })}>{isSpanish ? "Archivar" : "Archive"}</button> : null}
              </div>
            ))}
            {!chemicals.length ? <p className="muted">{isSpanish ? "No hay químicos activos configurados." : "No active chemicals configured."}</p> : null}
          </article>
        </div>
      ) : (
        <div className="pool-grid">
          <article className="pool-card">
            <h2>{isSpanish ? "Registros recientes de piscina" : "Recent pool logs"}</h2>
            {historyQuery.isLoading ? <p className="muted">{isSpanish ? "Cargando historial..." : "Loading history..."}</p> : null}
            {historyQuery.data?.entries.length ? historyQuery.data.entries.map((entry) => (
              <PoolEntryRow key={entry.id} entry={entry} canEdit={canEdit} onUpload={uploadPoolFiles} language={language} />
            )) : <p className="muted">{isSpanish ? "No se encontraron registros de piscina." : "No pool log entries found."}</p>}
            <p className="muted">{isSpanish ? "Las fotos/PDF de piscina se almacenan en el volumen de carga configurado. La transferencia JSON nativa conserva los registros del log; respalde las cargas por separado para conservar los bytes de archivo." : "Pool photos/PDFs are stored in the configured upload volume. Native JSON transfer keeps pool log records; back up uploads separately for file bytes."}</p>
          </article>
          <PropertyWikiWorkflowPanel
            title={isSpanish ? "Contenido wiki relacionado de piscina" : "Related Pool Wiki Content"}
            module="POOL_LOG"
            propertyId={propertyId}
            recordType={workflowEntry?.id ? "POOL_LOG_ENTRY" : undefined}
            recordId={workflowEntry?.id ?? undefined}
            facilityName={workflowFacilityName}
            building={workflowFacilityName}
            equipmentQuery={workflowFacilityName}
            query="pool equipment procedures vendors emergency"
            canEdit={canEdit}
          />
        </div>
      )}
    </section>
  );
}
