import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createPoolChemical,
  createPoolFacility,
  createPoolLogEntry,
  deletePoolChemical,
  deletePoolFacility,
  getPoolChemicals,
  getPoolEntries,
  getPoolFacilities,
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
import { enqueuePoolCreate, enqueuePoolUpload, getOfflineSyncEventName, listOfflineSyncJobs, syncOfflineJobs, type OfflineSyncJobSummary } from "../lib/offlineSync";
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

function formatPoolDosageMessage(
  dosage: { chemicalCategory: string; chemicalName?: string; amount?: number; unit?: string; message: string; missing?: string[] },
  language: string,
) {
  if (dosage.amount && dosage.unit) {
    return dosage.chemicalName
      ? `${dosage.chemicalName}: ${formatPoolChemicalAmount(dosage.amount, dosage.unit as PoolChemical["unit"])}`
      : dosage.message;
  }
  if (dosage.missing?.length) {
    return language === "es"
      ? `${dosage.message} Falta: ${dosage.missing.join(", ")}.`
      : `${dosage.message} Missing: ${dosage.missing.join(", ")}.`;
  }
  return dosage.message;
}

function poolChemicalCategoryActionLabel(category: string, language: string) {
  const english: Record<string, string> = {
    CHLORINE: "Add chlorine",
    PH_UP: "Add pH Up",
    PH_DOWN: "Add pH Down",
    ALKALINITY_UP: "Add alkalinity increaser",
    STABILIZER: "Add stabilizer",
    CALCIUM_HARDNESS: "Add calcium hardness increaser",
    OTHER: "Add chemical",
  };
  const spanish: Record<string, string> = {
    CHLORINE: "Agregar cloro",
    PH_UP: "Agregar elevador de pH",
    PH_DOWN: "Agregar reductor de pH",
    ALKALINITY_UP: "Agregar aumentador de alcalinidad",
    STABILIZER: "Agregar estabilizador",
    CALCIUM_HARDNESS: "Agregar aumentador de dureza de calcio",
    OTHER: "Agregar químico",
  };
  return (language === "es" ? spanish : english)[category] ?? (language === "es" ? "Agregar químico" : "Add chemical");
}

function summarizePoolCorrection(
  issue: { code?: string; message?: string } | null | undefined,
  dosage: Array<{ chemicalCategory: string; chemicalName?: string; amount?: number; unit?: string; message: string; missing?: string[] }>,
  recommendations: string[],
  language: string,
) {
  const actions: string[] = [];
  dosage.forEach((entry) => {
    const label = poolChemicalCategoryActionLabel(entry.chemicalCategory, language);
    if (!actions.includes(label)) actions.push(label);
  });
  const code = issue?.code ?? "";
  if (code === "PH_LOW" && !actions.includes(language === "es" ? "Agregar elevador de pH" : "Add pH Up")) {
    actions.push(language === "es" ? "Agregar elevador de pH" : "Add pH Up");
  }
  if (code === "PH_HIGH" && !actions.includes(language === "es" ? "Agregar reductor de pH" : "Add pH Down")) {
    actions.push(language === "es" ? "Agregar reductor de pH" : "Add pH Down");
  }
  if (code === "TOTAL_ALKALINITY_HIGH") {
    actions.push(language === "es" ? "Bajar alcalinidad" : "Lower alkalinity");
  }
  if (code === "TOTAL_ALKALINITY_LOW" && !actions.includes(language === "es" ? "Agregar aumentador de alcalinidad" : "Add alkalinity increaser")) {
    actions.push(language === "es" ? "Agregar aumentador de alcalinidad" : "Add alkalinity increaser");
  }
  if (code === "WATER_CLOUDY") {
    actions.push(language === "es" ? "Revisar filtración" : "Check filtration");
  }
  if (code === "ALGAE_PRESENT") {
    actions.push(language === "es" ? "Tratar algas" : "Treat algae");
  }
  if (code === "COMBINED_CHLORINE_HIGH") {
    actions.push(language === "es" ? "Revisar choque/sanitizante" : "Review shock/sanitizer");
  }
  if (!actions.length && recommendations.length) {
    const first = recommendations[0];
    if (/stabilizer/i.test(first)) actions.push(language === "es" ? "Agregar estabilizador" : "Add stabilizer");
    else if (/sanitizer|chlorine/i.test(first)) actions.push(language === "es" ? "Agregar cloro" : "Add chlorine");
    else if (/alkalinity/i.test(first)) actions.push(language === "es" ? "Bajar alcalinidad" : "Lower alkalinity");
    else if (/filtration|circulation/i.test(first)) actions.push(language === "es" ? "Revisar filtración" : "Check filtration");
  }
  return [...new Set(actions)].slice(0, 3);
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

function poolQueueStatusSummary(jobs: OfflineSyncJobSummary[], language: string) {
  const blocked = jobs.filter((job) => job.status === "blocked");
  const retrying = jobs.filter((job) => job.status === "retrying");
  const pending = jobs.filter((job) => job.status === "pending");
  const earliestRetry = retrying.map((job) => job.nextRetryAt).filter((value): value is string => Boolean(value)).sort()[0] ?? null;
  if (blocked.length) {
    return {
      title: language === "es" ? `${blocked.length} registro(s)/archivo(s) requieren revisión` : `${blocked.length} pool log item(s)/upload(s) need review`,
      detail: language === "es"
        ? "Al menos un registro o archivo falló por un error del servidor o validación y no seguirá reintentándose solo."
        : "At least one log or upload hit a server or validation error and will not keep retrying automatically.",
    };
  }
  if (retrying.length) {
    return {
      title: language === "es" ? `${retrying.length} registro(s)/archivo(s) volverán a intentarse` : `${retrying.length} pool log item(s)/upload(s) will retry automatically`,
      detail: language === "es"
        ? `El próximo reintento automático será ${earliestRetry ? new Date(earliestRetry).toLocaleTimeString() : "pronto"}.`
        : `Next automatic retry ${earliestRetry ? `at ${new Date(earliestRetry).toLocaleTimeString()}` : "is due soon"}.`,
    };
  }
  return {
    title: language === "es" ? `${pending.length} registro(s)/archivo(s) pendientes de sincronización` : `${pending.length} pool log item(s)/upload(s) pending sync`,
    detail: language === "es"
      ? "Los registros y archivos guardados sin conexión permanecen en este navegador hasta que el servidor los confirme."
      : "Offline entries and uploads stay in this browser until the server confirms them.",
  };
}

function PoolEntryRow({ entry, canEdit, onUpload, language = "en" }: { entry: PoolLogEntry; canEdit: boolean; onUpload: (entryId: string, files: FileList | null) => void; language?: string }) {
  const isSpanish = language === "es";
  const evaluation = entry.evaluationJson;
  const needsFollowUp = evaluation?.status === "REVIEW" || entry.safetyChecks.some((check) => check.value === "FAIL");
  const recommendationLines = evaluation?.recommendations ?? [];
  const dosageLines = evaluation?.dosage ?? [];
  const actionSummary = summarizePoolCorrection(evaluation?.issues?.[0], dosageLines, recommendationLines, language);
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
      {actionSummary.length ? (
        <div className="pool-reading-stack" style={{ alignItems: "flex-start" }}>
          <span className="muted">
            <strong>{isSpanish ? "Siguiente paso:" : "Next step:"}</strong>{" "}
            {actionSummary.join("; ")}
          </span>
        </div>
      ) : null}
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
                actionSummary.length
                  ? `${isSpanish ? "Siguiente paso" : "Next step"}: ${actionSummary.join("; ")}`
                  : "",
                dosageLines.length
                  ? `${isSpanish ? "Detalle de dosificación" : "Dosage detail"}: ${dosageLines.map((line) => formatPoolDosageMessage(line, language)).join("; ")}`
                  : "",
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
  const facilitiesQuery = useQuery({
    queryKey: ["pool-facilities", propertyId],
    queryFn: () => getPoolFacilities(propertyId ? { propertyId, includeArchived: true } : { includeArchived: true }),
  });
  const chemicalsQuery = useQuery({
    queryKey: ["pool-chemicals", propertyId],
    queryFn: () => getPoolChemicals(propertyId ? { propertyId, includeArchived: true } : { includeArchived: true }),
  });
  const historyQuery = useQuery({
    queryKey: ["pool-entries", propertyId],
    queryFn: () => getPoolEntries({ propertyId: propertyId || undefined, limit: 60 }),
  });

  const facilities = overviewQuery.data?.facilities ?? [];
  const chemicals = overviewQuery.data?.chemicals ?? [];
  const allFacilities = facilitiesQuery.data?.facilities ?? facilities;
  const allChemicals = chemicalsQuery.data?.chemicals ?? chemicals;
  const activeFacilities = useMemo(() => allFacilities.filter((facility) => facility.isActive), [allFacilities]);
  const archivedFacilities = useMemo(() => allFacilities.filter((facility) => !facility.isActive), [allFacilities]);
  const activeChemicals = useMemo(() => allChemicals.filter((chemical) => chemical.isActive), [allChemicals]);
  const archivedChemicals = useMemo(() => allChemicals.filter((chemical) => !chemical.isActive), [allChemicals]);
  const activeChemicalsById = useMemo(() => new Map(activeChemicals.map((chemical) => [chemical.id, chemical])), [activeChemicals]);
  const selectedProperty = properties.find((property) => property.id === propertyId);
  const defaultFacilityId = activeFacilities[0]?.id ?? "";
  const [selectedChemicalId, setSelectedChemicalId] = useState("");
  const [chemicalAmountPounds, setChemicalAmountPounds] = useState("");
  const [chemicalAmountOunces, setChemicalAmountOunces] = useState("");
  const [queuedPoolJobs, setQueuedPoolJobs] = useState<OfflineSyncJobSummary[]>([]);
  const [queueSyncing, setQueueSyncing] = useState(false);
  const selectedChemical = selectedChemicalId ? activeChemicalsById.get(selectedChemicalId) ?? null : null;
  const workflowEntry = historyQuery.data?.entries[0] ?? overviewQuery.data?.recentEntries?.[0] ?? null;
  const workflowFacilityName = workflowEntry?.facility?.name ?? activeFacilities[0]?.name ?? null;
  const solidChemicalTotalOunces = useMemo(() => (
    normalizeSolidChemicalAmount(
      chemicalAmountPounds.trim() ? Number(chemicalAmountPounds) : null,
      chemicalAmountOunces.trim() ? Number(chemicalAmountOunces) : null
    )
  ), [chemicalAmountOunces, chemicalAmountPounds]);
  const solidChemicalEquivalentPounds = solidChemicalTotalOunces ? solidChemicalTotalOunces / 16 : null;

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["pool-overview"] }),
      queryClient.invalidateQueries({ queryKey: ["pool-facilities"] }),
      queryClient.invalidateQueries({ queryKey: ["pool-chemicals"] }),
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
  const facilityDeleteMutation = useMutation({
    mutationFn: deletePoolFacility,
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
  const chemicalDeleteMutation = useMutation({
    mutationFn: deletePoolChemical,
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
    const form = event.currentTarget;
    const formData = new FormData(form);
    await facilityCreateMutation.mutateAsync({
      propertyId,
      name: String(formData.get("name") ?? "").trim(),
      type: String(formData.get("type") ?? "POOL") as PoolFacility["type"],
      capacityGallons: formNumber(formData, "capacityGallons"),
      surfaceType: String(formData.get("surfaceType") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
    });
    form.reset();
  }

  async function submitChemical(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!propertyId) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    await chemicalCreateMutation.mutateAsync({
      propertyId,
      name: String(formData.get("name") ?? "").trim(),
      category: String(formData.get("category") ?? "CHLORINE") as PoolChemical["category"],
      concentrationPercent: formNumber(formData, "concentrationPercent"),
      unit: String(formData.get("unit") ?? "POUNDS") as PoolChemical["unit"],
      notes: String(formData.get("notes") ?? "").trim() || null,
    });
    form.reset();
  }

  async function submitDailyLog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!propertyId) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
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
    form.reset();
    setSelectedChemicalId("");
    setChemicalAmountPounds("");
    setChemicalAmountOunces("");
  }

  function uploadPoolFiles(entryId: string, files: FileList | null) {
    if (!files?.length) return;
    Array.from(files).forEach((file) => {
      void attachmentUploadMutation.mutateAsync({ entryId, file });
    });
  }

  const refreshQueuedPoolJobs = async () => {
    const jobs = await listOfflineSyncJobs();
    setQueuedPoolJobs(jobs.filter((job) => job.module === "pool" && (job.kind === "poolCreate" || job.kind === "poolUpload")));
  };

  const syncQueuedPoolJobs = async () => {
    if (queueSyncing || (typeof navigator !== "undefined" && !navigator.onLine)) return;
    setQueueSyncing(true);
    try {
      await syncOfflineJobs();
      await invalidate();
      await refreshQueuedPoolJobs();
    } finally {
      setQueueSyncing(false);
    }
  };

  useEffect(() => {
    void refreshQueuedPoolJobs();
  }, []);

  useEffect(() => {
    const queueEventName = getOfflineSyncEventName();
    const refresh = () => {
      void refreshQueuedPoolJobs();
    };
    window.addEventListener(queueEventName, refresh as EventListener);
    window.addEventListener("online", refresh);
    return () => {
      window.removeEventListener(queueEventName, refresh as EventListener);
      window.removeEventListener("online", refresh);
    };
  }, []);

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

      {queuedPoolJobs.length ? (
        <div className="pool-card projects-sync-banner" style={{ marginBottom: 12 }}>
          <div className="projects-sync-copy">
            {(() => {
              const summary = poolQueueStatusSummary(queuedPoolJobs, language);
              return (
                <>
                  <strong>{summary.title}</strong>
                  <span className="muted">{summary.detail}</span>
                </>
              );
            })()}
          </div>
          <div className="pool-entry-actions">
            <button className="button button-secondary" type="button" onClick={() => void refreshQueuedPoolJobs()} disabled={queueSyncing}>
              {isSpanish ? "Actualizar cola" : "Refresh Queue"}
            </button>
            <button className="button button-primary" type="button" onClick={() => void syncQueuedPoolJobs()} disabled={queueSyncing || (typeof navigator !== "undefined" && !navigator.onLine)}>
              {queueSyncing ? (isSpanish ? "Sincronizando..." : "Syncing...") : (isSpanish ? "Sincronizar ahora" : "Sync Now")}
            </button>
          </div>
        </div>
      ) : null}

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
                  <span>
                    {summarizePoolCorrection(
                      typeof issue.issue === "object" && issue.issue ? issue.issue as { code?: string; message?: string } : null,
                      issue.dosage ?? [],
                      issue.recommendations ?? [],
                      language,
                    ).join("; ") || (isSpanish ? "Revisar química" : "Review chemistry")}
                  </span>
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
                  onChange={(event) => {
                    setSelectedChemicalId(event.target.value);
                    setChemicalAmountPounds("");
                    setChemicalAmountOunces("");
                  }}
                >
                  <option value="">{isSpanish ? "Sin químico agregado" : "No chemical added"}</option>
                  {chemicals.map((chemical) => <option key={chemical.id} value={chemical.id}>{chemical.name}</option>)}
                </select>
              </label>
              {selectedChemical && isSolidChemicalUnit(selectedChemical.unit) ? (
                <>
                  <label>{isSpanish ? "Libras" : "Pounds"}
                    <input
                      name="chemicalAmountPounds"
                      data-testid="pool-chemical-pounds"
                      type="number"
                      min="0"
                      step="1"
                      placeholder="0"
                      value={chemicalAmountPounds}
                      onChange={(event) => setChemicalAmountPounds(event.target.value)}
                    />
                  </label>
                  <label>{isSpanish ? "Onzas" : "Ounces"}
                    <input
                      name="chemicalAmountOunces"
                      data-testid="pool-chemical-ounces"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0"
                      value={chemicalAmountOunces}
                      onChange={(event) => setChemicalAmountOunces(event.target.value)}
                    />
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
            {selectedChemical && isSolidChemicalUnit(selectedChemical.unit) ? (
              <p className="muted">
                {isSpanish
                  ? "Los químicos sólidos usan campos separados de libras y onzas. Ejemplo: 70 onzas se convierten en 4.4 lb y se guardan como 4 lb 6 oz."
                  : "Solid chemicals use separate pounds and ounces fields. Example: 70 ounces converts to 4.4 lb and is stored as 4 lb 6 oz."}
                {solidChemicalEquivalentPounds
                  ? ` ${isSpanish ? "Equivalente actual" : "Current equivalent"}: ${solidChemicalEquivalentPounds.toFixed(1)} lb (${formatPoolChemicalAmount(solidChemicalTotalOunces ?? 0, "OUNCES")}).`
                  : ""}
              </p>
            ) : null}
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
            {activeFacilities.map((facility) => (
              <div className="pool-row" key={facility.id}>
                <div>
                  <strong>{facility.name}</strong>
                  <span>{poolTypeLabel(facility.type, language)} / {facility.capacityGallons ? `${facility.capacityGallons.toLocaleString()} gal` : (isSpanish ? "capacidad faltante" : "capacity missing")}</span>
                </div>
                {canManage ? <button type="button" onClick={() => facilityUpdateMutation.mutate({ id: facility.id, data: { isActive: false } })}>{isSpanish ? "Archivar" : "Archive"}</button> : null}
              </div>
            ))}
            {!activeFacilities.length ? <p className="muted">{isSpanish ? "No hay piscinas/spas activos configurados." : "No active pools/spas configured."}</p> : null}
            {archivedFacilities.length ? (
              <div className="pool-archived-list" data-testid="pool-facility-archive-list">
                <h3>{isSpanish ? "Piscinas/spas archivados" : "Archived pools/spas"}</h3>
                <p className="muted">{isSpanish ? "Archivar oculta la piscina/spa del trabajo diario sin borrar su historial. Puede restaurarla aquí cuando vuelva a usarse." : "Archive hides the pool/spa from daily work without deleting its history. Restore it here when it returns to service."}</p>
                {archivedFacilities.map((facility) => (
                  <div className="pool-row" key={facility.id}>
                    <div>
                      <strong>{facility.name}</strong>
                      <span>{poolTypeLabel(facility.type, language)} / {facility.capacityGallons ? `${facility.capacityGallons.toLocaleString()} gal` : (isSpanish ? "capacidad faltante" : "capacity missing")} / {isSpanish ? "archivado" : "archived"}</span>
                    </div>
                    {canManage ? (
                      <div className="pool-entry-actions">
                        <button type="button" onClick={() => facilityUpdateMutation.mutate({ id: facility.id, data: { isActive: true } })}>{isSpanish ? "Restaurar" : "Restore"}</button>
                        <button
                          type="button"
                          className="button button-danger"
                          disabled={facilityDeleteMutation.isPending}
                          onClick={() => {
                            const confirmed = window.confirm(
                              isSpanish
                                ? `Eliminar permanentemente ${facility.name}? Solo las piscinas/spas archivados sin historial pueden borrarse.`
                                : `Permanently delete ${facility.name}? Only archived pools/spas without log history can be deleted.`
                            );
                            if (!confirmed) return;
                            facilityDeleteMutation.mutate(facility.id);
                          }}
                        >
                          {isSpanish ? "Eliminar permanente" : "Delete Permanently"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
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
            {activeChemicals.map((chemical) => (
              <div className="pool-row" key={chemical.id}>
                <div>
                  <strong>{chemical.name}</strong>
                  <span>{chemical.category.replace(/_/g, " ")} / {chemical.concentrationPercent ? `${chemical.concentrationPercent}%` : (isSpanish ? "concentración faltante" : "concentration missing")} / {chemical.unit}</span>
                </div>
                {canManage ? <button type="button" onClick={() => chemicalUpdateMutation.mutate({ id: chemical.id, data: { isActive: false } })}>{isSpanish ? "Archivar" : "Archive"}</button> : null}
              </div>
            ))}
            {!activeChemicals.length ? <p className="muted">{isSpanish ? "No hay químicos activos configurados." : "No active chemicals configured."}</p> : null}
            {archivedChemicals.length ? (
              <div className="pool-archived-list" data-testid="pool-chemical-archive-list">
                <h3>{isSpanish ? "Químicos archivados" : "Archived chemicals"}</h3>
                <p className="muted">{isSpanish ? "Archivar retira el químico de nuevas entradas, pero conserva su referencia histórica en registros anteriores. Puede restaurarlo aquí." : "Archive removes the chemical from new entries while preserving its historical meaning on older logs. Restore it here when needed."}</p>
                {archivedChemicals.map((chemical) => (
                  <div className="pool-row" key={chemical.id}>
                    <div>
                      <strong>{chemical.name}</strong>
                      <span>{chemical.category.replace(/_/g, " ")} / {chemical.concentrationPercent ? `${chemical.concentrationPercent}%` : (isSpanish ? "concentración faltante" : "concentration missing")} / {chemical.unit} / {isSpanish ? "archivado" : "archived"}</span>
                    </div>
                    {canManage ? (
                      <div className="pool-entry-actions">
                        <button type="button" onClick={() => chemicalUpdateMutation.mutate({ id: chemical.id, data: { isActive: true } })}>{isSpanish ? "Restaurar" : "Restore"}</button>
                        <button
                          type="button"
                          className="button button-danger"
                          disabled={chemicalDeleteMutation.isPending}
                          onClick={() => {
                            const confirmed = window.confirm(
                              isSpanish
                                ? `Eliminar permanentemente ${chemical.name}? Solo los químicos archivados sin historial pueden borrarse.`
                                : `Permanently delete ${chemical.name}? Only archived chemicals without log history can be deleted.`
                            );
                            if (!confirmed) return;
                            chemicalDeleteMutation.mutate(chemical.id);
                          }}
                        >
                          {isSpanish ? "Eliminar permanente" : "Delete Permanently"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
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
