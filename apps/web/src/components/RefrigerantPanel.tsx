import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createRefrigerantCharge,
  createRefrigerantCylinder,
  createRefrigerantFinalRecovery,
  createRefrigerantRecovery,
  createRefrigerantType,
  deleteRefrigerantCylinder,
  deleteRefrigerantType,
  dismissRefrigerantLeakFlag,
  getRefrigerantCylinders,
  getRefrigerantHistory,
  getRefrigerantOverview,
  refrigerantExportCsvUrl,
  refrigerantExportExcelUrl,
  refrigerantPrintableHtmlReportUrl,
  refrigerantPrintableReportUrl,
  updateRefrigerantCylinder,
  updateRefrigerantType,
  type Property,
  type RefrigerantCylinder,
  type RefrigerantTransaction,
  type RefrigerantType,
  type RefrigerantTransactionInput,
  type UserLanguage,
  type Unit,
  type UserRole,
} from "../lib/api";
import { t, tWithVars } from "../lib/i18n";
import { UnitSearchSelect } from "./UnitSearchSelect";
import { PropertyWikiWorkflowPanel } from "./PropertyWikiWorkflowPanel";
import { StatusState } from "./StatusState";

type RefrigerantTab = "overview" | "virgin" | "clean" | "dirty" | "history" | "exports";

type Props = {
  properties: Property[];
  units: Unit[];
  userRole: UserRole;
  language: UserLanguage;
};

type RefrigerantWorkflowDraft = {
  propertyId: string;
  unitId: string;
  unitNumber: string;
  building: string;
  equipmentQuery: string;
  query: string;
};

const categoryLabel: Record<RefrigerantCylinder["category"], string> = {
  VIRGIN: "Virgin",
  CLEAN_RECOVERY: "Clean recovery",
  DIRTY_RECOVERY: "Dirty recovery",
};

const commonTankSizes = [
  { label: "10 lb", value: "10" },
  { label: "25 lb", value: "25" },
  { label: "30 lb", value: "30" },
  { label: "50 lb", value: "50" },
  { label: "100 lb", value: "100" },
  { label: "125 lb", value: "125" },
];

function categoryName(language: UserLanguage, category: RefrigerantCylinder["category"]) {
  const labels: Record<RefrigerantCylinder["category"], string> = {
    VIRGIN: t(language, "refrigerant.categoryVirgin"),
    CLEAN_RECOVERY: t(language, "refrigerant.categoryCleanRecovery"),
    DIRTY_RECOVERY: t(language, "refrigerant.categoryDirtyRecovery"),
  };
  return labels[category];
}

function transactionTypeName(language: UserLanguage, type: RefrigerantTransaction["transactionType"]) {
  const labels: Record<RefrigerantTransaction["transactionType"], string> = {
    VIRGIN_CHARGE: t(language, "refrigerant.transactionCharge"),
    CLEAN_RECOVERY: t(language, "refrigerant.transactionCleanRecovery"),
    DIRTY_RECOVERY: t(language, "refrigerant.transactionDirtyRecovery"),
    FINAL_RECOVERY: t(language, "refrigerant.transactionFinalRecovery"),
  };
  return labels[type];
}

function numberValue(value: FormDataEntryValue | null) {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

function dateLabel(value: string | null | undefined, language: UserLanguage) {
  if (!value) return t(language, "refrigerant.none");
  return new Date(value).toLocaleString();
}

function CylinderStatusPill({ cylinder, language }: { cylinder: RefrigerantCylinder; language: UserLanguage }) {
  const fill = cylinder.fillPercent ?? Math.round((cylinder.currentWeight / cylinder.tankSize) * 100);
  const warn = cylinder.category !== "VIRGIN" && fill >= 80;
  return <span className={`status-pill ${warn ? "risk-critical" : ""}`}>{cylinder.status.replace(/_/g, " ")}{cylinder.category !== "VIRGIN" ? ` / ${fill}%` : ""}</span>;
}

function TankSizeField({ language }: { language: UserLanguage }) {
  const [sizeMode, setSizeMode] = useState(commonTankSizes[2]?.value ?? "30");
  const isCustom = sizeMode === "custom";
  return (
    <label>{t(language, "refrigerant.tankSize")}
      <div className="split-field">
        <select value={sizeMode} onChange={(event) => setSizeMode(event.target.value)} aria-label={t(language, "refrigerant.tankSizePreset")}>
          {commonTankSizes.map((size) => <option key={size.value} value={size.value}>{size.label}</option>)}
          <option value="custom">{t(language, "refrigerant.custom")}</option>
        </select>
        <input
          key={isCustom ? "custom" : sizeMode}
          name="tankSize"
          type="number"
          step="0.01"
          min="0.01"
          required
          defaultValue={isCustom ? "" : sizeMode}
          readOnly={!isCustom}
          placeholder={isCustom ? t(language, "refrigerant.enterLb") : undefined}
          aria-label={t(language, "refrigerant.tankSizeInPounds")}
        />
      </div>
    </label>
  );
}

export function RefrigerantPanel({ properties, units, userRole, language }: Props) {
  const [tab, setTab] = useState<RefrigerantTab>("overview");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("");
  const [formResetVersion, setFormResetVersion] = useState(0);
  const canEdit = userRole === "ADMIN" || userRole === "MANAGER" || userRole === "TECH";
  const canAdmin = userRole === "ADMIN";
  const queryClient = useQueryClient();

  const overviewQuery = useQuery({ queryKey: ["refrigerant", "overview"], queryFn: getRefrigerantOverview });
  const cylindersQuery = useQuery({ queryKey: ["refrigerant", "cylinders"], queryFn: () => getRefrigerantCylinders({ includeArchived: true }) });
  const historyQuery = useQuery({ queryKey: ["refrigerant", "history", propertyFilter], queryFn: () => getRefrigerantHistory({ propertyId: propertyFilter || undefined, limit: 150 }) });

  const types = overviewQuery.data?.types ?? [];
  const cylinders = cylindersQuery.data?.cylinders ?? [];
  const activeTypes = types.filter((type) => type.isActive);
  const virginTanks = cylinders.filter((cylinder) => cylinder.category === "VIRGIN");
  const activeVirginTanks = virginTanks.filter((cylinder) => cylinder.status === "ACTIVE");
  const cleanRecoveryTanks = cylinders.filter((cylinder) => cylinder.category === "CLEAN_RECOVERY");
  const dirtyRecoveryTanks = cylinders.filter((cylinder) => cylinder.category === "DIRTY_RECOVERY");

  const unitsByProperty = useMemo(() => {
    return propertyFilter ? units.filter((unit) => unit.propertyId === propertyFilter) : units;
  }, [propertyFilter, units]);
  const workflowTransaction = historyQuery.data?.transactions[0] ?? overviewQuery.data?.recent[0] ?? null;
  const workflowPropertyId = propertyFilter || workflowTransaction?.propertyId || "";
  const recentUnitTransactions = useMemo(() => {
    const byUnit = new Map<string, RefrigerantTransaction>();
    for (const entry of [...(historyQuery.data?.transactions ?? []), ...(overviewQuery.data?.recent ?? [])]) {
      if (!entry.unitId || byUnit.has(entry.unitId)) continue;
      byUnit.set(entry.unitId, entry);
    }
    return byUnit;
  }, [historyQuery.data?.transactions, overviewQuery.data?.recent]);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["refrigerant"] }),
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      queryClient.invalidateQueries({ queryKey: ["activity"] }),
    ]);
  };

  const runMutation = useMutation({
    mutationFn: async (task: () => Promise<unknown>) => task(),
    onSuccess: async () => {
      setMessage(t(language, "refrigerant.saved"));
      setError("");
      setFormResetVersion((current) => current + 1);
      await invalidate();
    },
    onError: (err) => {
      setMessage("");
      setError(err instanceof Error ? err.message : t(language, "refrigerant.actionFailed"));
    },
  });

  const deleteTypeMutation = useMutation({
    mutationFn: deleteRefrigerantType,
    onSuccess: async () => {
      setMessage(language === "es" ? "Tipo eliminado." : "Type deleted.");
      setError("");
      await invalidate();
    },
    onError: (err) => {
      setMessage("");
      setError(err instanceof Error ? err.message : t(language, "refrigerant.actionFailed"));
    },
  });

  const deleteCylinderMutation = useMutation({
    mutationFn: deleteRefrigerantCylinder,
    onSuccess: async () => {
      setMessage(language === "es" ? "Cilindro eliminado." : "Cylinder deleted.");
      setError("");
      await invalidate();
    },
    onError: (err) => {
      setMessage("");
      setError(err instanceof Error ? err.message : t(language, "refrigerant.actionFailed"));
    },
  });

  const submitType = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    if (!name) return;
    runMutation.mutate(() => createRefrigerantType({ name, notes: String(data.get("notes") ?? "").trim() || null }));
    event.currentTarget.reset();
  };

  const submitCylinder = (event: FormEvent<HTMLFormElement>, category: RefrigerantCylinder["category"]) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    runMutation.mutate(() => createRefrigerantCylinder({
      identifier: String(data.get("identifier") ?? "").trim(),
      refrigerantTypeId: String(data.get("refrigerantTypeId") ?? ""),
      category,
      tankSize: numberValue(data.get("tankSize")),
      currentWeight: numberValue(data.get("currentWeight")),
      notes: String(data.get("notes") ?? "").trim() || null,
      overrideActiveVirgin: data.get("overrideActiveVirgin") === "on",
    }));
    event.currentTarget.reset();
  };

  const transactionPayload = (form: HTMLFormElement): RefrigerantTransactionInput => {
    const data = new FormData(form);
    const unitId = String(data.get("unitId") ?? "");
    const unit = units.find((entry) => entry.id === unitId);
    const sourceCylinderId = String(data.get("sourceCylinderId") ?? "");
    const recoveryCylinderId = String(data.get("recoveryCylinderId") ?? "");
    const source = cylinders.find((entry) => entry.id === sourceCylinderId);
    const recovery = cylinders.find((entry) => entry.id === recoveryCylinderId);
    return {
      propertyId: String(data.get("propertyId") ?? "") || unit?.propertyId,
      unitId: unitId || undefined,
      unitNumber: unit?.number || String(data.get("unitNumber") ?? "").trim() || undefined,
      refrigerantTypeId: String(data.get("refrigerantTypeId") ?? "") || source?.refrigerantTypeId || recovery?.refrigerantTypeId || "",
      sourceCylinderId: sourceCylinderId || undefined,
      recoveryCylinderId: recoveryCylinderId || undefined,
      startWeight: numberValue(data.get("startWeight")),
      endWeight: numberValue(data.get("endWeight")),
      notes: String(data.get("notes") ?? "").trim() || null,
    };
  };

  const submitCharge = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    runMutation.mutate(() => createRefrigerantCharge(transactionPayload(event.currentTarget)));
    event.currentTarget.reset();
  };

  const submitRecovery = (event: FormEvent<HTMLFormElement>, recoveryType: "CLEAN" | "DIRTY") => {
    event.preventDefault();
    runMutation.mutate(() => createRefrigerantRecovery({ ...transactionPayload(event.currentTarget), recoveryType }));
    event.currentTarget.reset();
  };

  const submitFinalRecovery = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    runMutation.mutate(() => createRefrigerantFinalRecovery(transactionPayload(event.currentTarget)));
    event.currentTarget.reset();
  };

  if (overviewQuery.isLoading || cylindersQuery.isLoading) {
    return <StatusState title={t(language, "refrigerant.loading")} description={t(language, "refrigerant.loadingCopy")} />;
  }

  if (overviewQuery.isError || cylindersQuery.isError) {
    return <StatusState title={t(language, "refrigerant.failed")} description={t(language, "refrigerant.failedCopy")} tone="error" />;
  }

  return (
    <section className="refrigerant-panel" data-testid="refrigerant-panel">
      <header className="module-heading">
        <span className="eyebrow">{t(language, "refrigerant.eyebrow")}</span>
        <h1>{t(language, "refrigerant.title")}</h1>
        <p>{t(language, "refrigerant.copy")}</p>
      </header>

      <nav className="subtab-row" aria-label={t(language, "refrigerant.sections")}>
        {[
          ["overview", t(language, "refrigerant.tabOverview")],
          ["virgin", t(language, "refrigerant.tabVirgin")],
          ["clean", t(language, "refrigerant.tabClean")],
          ["dirty", t(language, "refrigerant.tabDirty")],
          ["history", t(language, "refrigerant.tabHistory")],
          ["exports", t(language, "refrigerant.tabExports")],
        ].map(([key, label]) => (
          <button key={key} type="button" data-testid={`refrigerant-tab-${key}`} className={tab === key ? "active" : ""} onClick={() => setTab(key as RefrigerantTab)}>{label}</button>
        ))}
      </nav>

      {message ? <div className="banner banner-success">{message}</div> : null}
      {error ? <div className="banner banner-error">{error}</div> : null}

      {tab === "overview" ? (
        <>
          <div className="metric-grid" data-testid="refrigerant-overview-metrics">
            <div className="metric-card"><strong>{Object.values(overviewQuery.data?.summary.activeVirginByType ?? {}).reduce((sum, value) => sum + value, 0)}</strong><span>{t(language, "refrigerant.metricActiveVirgin")}</span></div>
            <div className="metric-card"><strong>{overviewQuery.data?.summary.recoveryNearCapacity ?? 0}</strong><span>{t(language, "refrigerant.metricRecoveryNearCapacity")}</span></div>
            <div className="metric-card"><strong>{overviewQuery.data?.summary.repeatedAdditionFlags ?? 0}</strong><span>{t(language, "refrigerant.metricRepeatedFlags")}</span></div>
            <div className="metric-card"><strong>{overviewQuery.data?.summary.complianceIssues ?? 0}</strong><span>{t(language, "refrigerant.metricComplianceIssues")}</span></div>
          </div>
          {canEdit ? (
            <div className="refrigerant-quick-grid">
              <QuickChargeForm
                title={t(language, "refrigerant.quickCharge")}
                properties={properties}
                units={units}
                tanks={activeVirginTanks}
                recentUnitTransactions={recentUnitTransactions}
                language={language}
                onSubmit={submitCharge}
                canEdit={canEdit}
                loading={runMutation.isPending}
                resetVersion={formResetVersion}
              />
              <QuickRecoveryForm
                title={t(language, "refrigerant.quickRecovery")}
                properties={properties}
                units={units}
                tanks={cleanRecoveryTanks.filter((tank) => tank.status === "ACTIVE")}
                types={activeTypes}
                recoveryType="CLEAN"
                recentUnitTransactions={recentUnitTransactions}
                language={language}
                onSubmit={(event) => submitRecovery(event, "CLEAN")}
                canEdit={canEdit}
                loading={runMutation.isPending}
                resetVersion={formResetVersion}
              />
            </div>
          ) : null}
          <section className="refrigerant-card">
            <h2>{t(language, "refrigerant.complianceIssues")}</h2>
            {(overviewQuery.data?.complianceIssues ?? []).length ? overviewQuery.data!.complianceIssues.map((issue) => (
              <div className="refrigerant-row" key={`${issue.type}-${issue.message}`}>
                <strong>{issue.severity}</strong>
                <span>{issue.message}</span>
              </div>
            )) : <p className="muted">{t(language, "refrigerant.noComplianceWarnings")}</p>}
          </section>
          <section className="refrigerant-card">
            <h2>{t(language, "refrigerant.repeatedAdditions")}</h2>
            {(overviewQuery.data?.leakFlags ?? []).length ? overviewQuery.data!.leakFlags.map((flag) => (
              <div className="refrigerant-row" key={flag.id}>
                <strong>{flag.unitNumber}</strong>
                <span>{flag.reason}</span>
                {userRole === "ADMIN" || userRole === "MANAGER" ? <button type="button" className="button button-secondary" onClick={() => runMutation.mutate(() => dismissRefrigerantLeakFlag(flag.id, "Reviewed from Refrigerant overview."))}>{t(language, "refrigerant.dismiss")}</button> : null}
              </div>
            )) : <p className="muted">{t(language, "refrigerant.noLeakFlags")}</p>}
          </section>
          <RefrigerantTypesCard
            language={language}
            canAdmin={canAdmin}
            types={types}
            onCreate={submitType}
            onToggle={(id, isActive) => runMutation.mutate(() => updateRefrigerantType(id, { isActive }))}
            onDelete={(id) => deleteTypeMutation.mutate(id)}
            loading={runMutation.isPending}
          />
          <HistoryList language={language} transactions={overviewQuery.data?.recent ?? []} />
        </>
      ) : tab === "virgin" ? (
        <TankWorkspace
          title={t(language, "refrigerant.tabVirgin")}
          language={language}
          canEdit={canEdit}
          canAdmin={canAdmin}
          category="VIRGIN"
          types={activeTypes}
          tanks={virginTanks}
          onCreate={submitCylinder}
          onUpdate={(id, input) => runMutation.mutate(() => updateRefrigerantCylinder(id, input))}
          onDelete={(id) => deleteCylinderMutation.mutate(id)}
          onFinalRecovery={submitFinalRecovery}
          recoveryTanks={[...cleanRecoveryTanks, ...dirtyRecoveryTanks].filter((tank) => tank.status === "ACTIVE")}
          loading={runMutation.isPending}
        />
      ) : tab === "clean" ? (
        <TankWorkspace
          title={t(language, "refrigerant.tabClean")}
          language={language}
          canEdit={canEdit}
          canAdmin={canAdmin}
          category="CLEAN_RECOVERY"
          types={activeTypes}
          tanks={cleanRecoveryTanks}
          properties={properties}
          units={units}
          onCreate={submitCylinder}
          onUpdate={(id, input) => runMutation.mutate(() => updateRefrigerantCylinder(id, input))}
          onDelete={(id) => deleteCylinderMutation.mutate(id)}
          onRecovery={(event) => submitRecovery(event, "CLEAN")}
          loading={runMutation.isPending}
          resetVersion={formResetVersion}
        />
      ) : tab === "dirty" ? (
        <TankWorkspace
          title={t(language, "refrigerant.tabDirty")}
          language={language}
          canEdit={canEdit}
          canAdmin={canAdmin}
          category="DIRTY_RECOVERY"
          types={activeTypes}
          tanks={dirtyRecoveryTanks}
          properties={properties}
          units={units}
          onCreate={submitCylinder}
          onUpdate={(id, input) => runMutation.mutate(() => updateRefrigerantCylinder(id, input))}
          onDelete={(id) => deleteCylinderMutation.mutate(id)}
          onRecovery={(event) => submitRecovery(event, "DIRTY")}
          loading={runMutation.isPending}
          resetVersion={formResetVersion}
        />
      ) : tab === "history" ? (
        <>
          <div className="toolbar-card">
            <label>{t(language, "refrigerant.property")}
              <select value={propertyFilter} onChange={(event) => setPropertyFilter(event.target.value)}>
                <option value="">{t(language, "refrigerant.allAccessibleProperties")}</option>
                {properties.map((property) => <option key={property.id} value={property.id}>{property.code} / {property.name}</option>)}
              </select>
            </label>
          </div>
          {workflowPropertyId ? (
            <PropertyWikiWorkflowPanel
              title={t(language, "refrigerant.unitContext")}
              module="REFRIGERANT"
              propertyId={workflowPropertyId}
              recordType={workflowTransaction?.id ? "REFRIGERANT_TRANSACTION" : undefined}
              recordId={workflowTransaction?.id ?? undefined}
              unitNumber={workflowTransaction?.unitNumber}
              equipmentQuery={workflowTransaction?.unitNumber}
              query={workflowTransaction?.notes}
              canEdit={canEdit}
            />
          ) : null}
          <HistoryList language={language} transactions={historyQuery.data?.transactions ?? []} />
        </>
      ) : (
        <section className="refrigerant-card">
          <h2>{t(language, "refrigerant.exports")}</h2>
          <p className="muted">{t(language, "refrigerant.exportsCopy")}</p>
          <div className="export-grid">
            {[
              ["usage", t(language, "refrigerant.reportUsage")],
              ["recovery", t(language, "refrigerant.reportRecovery")],
              ["cylinders", t(language, "refrigerant.reportCylinders")],
              ["compliance", t(language, "refrigerant.reportCompliance")],
              ["unitHistory", t(language, "refrigerant.reportUnitHistory")],
              ["fullAudit", t(language, "refrigerant.reportFullAudit")],
            ].map(([report, label]) => (
              <div key={report} className="refrigerant-export-row">
                <strong>{label}</strong>
                <div className="pool-entry-actions">
                  <a className="button button-secondary" href={refrigerantExportCsvUrl(report as never)}>{t(language, "nav.csv")}</a>
                  <a className="button button-secondary" href={refrigerantExportExcelUrl(report as never)}>{t(language, "nav.excel")}</a>
                  <a className="button button-secondary" href={refrigerantPrintableHtmlReportUrl(report as never)} target="_blank" rel="noreferrer">{t(language, "refrigerant.printable")}</a>
                  <a className="button button-primary" href={refrigerantPrintableReportUrl(report as never)} target="_blank" rel="noreferrer">{t(language, "nav.pdf")}</a>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

function RefrigerantTypesCard({ language, canAdmin, types, onCreate, onToggle, onDelete, loading }: {
  language: UserLanguage;
  canAdmin: boolean;
  types: RefrigerantType[];
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  onToggle: (id: string, isActive: boolean) => void;
  onDelete: (id: string) => void;
  loading: boolean;
}) {
  const activeTypes = types.filter((type) => type.isActive);
  const inactiveTypes = types.filter((type) => !type.isActive);
  return (
    <section className="refrigerant-card">
      <div className="section-title-row">
        <div>
          <h2>{t(language, "refrigerant.typesTitle")}</h2>
          <p className="muted">{t(language, "refrigerant.typesCopy")}</p>
        </div>
      </div>
      {canAdmin ? (
        <form className="compact-form inline-form" onSubmit={onCreate}>
          <input name="name" placeholder={language === "es" ? "R454B, R32 o R410A..." : "R454B, R32, R410A..."} required />
          <input name="notes" placeholder={t(language, "refrigerant.optionalNote")} />
          <button type="submit" className="button button-primary" disabled={loading}>{t(language, "refrigerant.addType")}</button>
        </form>
      ) : null}
      <div className="refrigerant-type-list">
        {activeTypes.map((type) => (
          <div className="refrigerant-row" key={type.id}>
            <strong>{type.name}</strong>
            <span>{type.notes || t(language, "refrigerant.noNotes")}</span>
            <span className={`status-pill ${type.isActive ? "" : "muted-pill"}`}>{type.isActive ? t(language, "refrigerant.active") : t(language, "refrigerant.inactive")}</span>
            {canAdmin ? (
              <button type="button" className="button button-secondary" onClick={() => onToggle(type.id, !type.isActive)} disabled={loading}>
                {type.isActive ? t(language, "refrigerant.deactivate") : t(language, "refrigerant.reactivate")}
              </button>
            ) : null}
          </div>
        ))}
        {!activeTypes.length ? <p className="muted">{language === "es" ? "No hay tipos activos configurados." : "No active refrigerant types configured."}</p> : null}
        {inactiveTypes.length ? (
          <div className="pool-archived-list" data-testid="refrigerant-type-inactive-list">
            <h3>{language === "es" ? "Tipos inactivos" : "Inactive types"}</h3>
            <p className="muted">{language === "es" ? "Los tipos inactivos se ocultan de nuevas capturas, pero siguen visibles para historial y pueden reactivarse aquí." : "Inactive types stay out of new capture flows, but remain visible for history and can be reactivated here."}</p>
            {inactiveTypes.map((type) => (
              <div className="refrigerant-row" key={type.id}>
                <strong>{type.name}</strong>
                <span>{type.notes || t(language, "refrigerant.noNotes")}</span>
                <span className="status-pill muted-pill">{t(language, "refrigerant.inactive")}</span>
                {canAdmin ? (
                  <div className="button-cluster">
                    <button type="button" className="button button-secondary" onClick={() => onToggle(type.id, true)} disabled={loading}>
                      {t(language, "refrigerant.reactivate")}
                    </button>
                    <button
                      type="button"
                      className="button button-danger"
                      onClick={() => {
                        const confirmed = window.confirm(
                          language === "es"
                            ? `Eliminar permanentemente ${type.name}? Solo los tipos inactivos sin cilindros ni historial pueden borrarse.`
                            : `Permanently delete ${type.name}? Only inactive types without cylinders or history can be deleted.`
                        );
                        if (!confirmed) return;
                        onDelete(type.id);
                      }}
                      disabled={loading}
                    >
                      {language === "es" ? "Eliminar permanente" : "Delete Permanently"}
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function UnitSelect({
  language,
  properties,
  units,
  selectedPropertyId,
  selectedUnitId,
  onPropertyChange,
  onUnitChange,
}: {
  language: UserLanguage;
  properties: Property[];
  units: Unit[];
  selectedPropertyId: string;
  selectedUnitId: string;
  onPropertyChange: (propertyId: string) => void;
  onUnitChange: (unitId: string) => void;
}) {
  const scopedUnits = selectedPropertyId ? units.filter((unit) => unit.propertyId === selectedPropertyId) : units;
  return (
    <>
      <label>{t(language, "refrigerant.property")}
        <select
          name="propertyId"
          value={selectedPropertyId}
          onChange={(event) => {
            onPropertyChange(event.target.value);
            onUnitChange("");
          }}
        >
          <option value="">{t(language, "refrigerant.noPropertyShopWork")}</option>
          {properties.map((property) => <option key={property.id} value={property.id}>{property.code} / {property.name}</option>)}
        </select>
      </label>
      <label>{t(language, "refrigerant.unit")}
        <UnitSearchSelect
          name="unitId"
          units={scopedUnits}
          value={selectedUnitId}
          onChange={onUnitChange}
          emptyLabel={t(language, "refrigerant.noUnitSelected")}
          placeholder={t(language, "refrigerant.searchUnit")}
        />
      </label>
    </>
  );
}

function QuickChargeForm({ title, properties, units, tanks, recentUnitTransactions, language, onSubmit, canEdit, loading, resetVersion }: {
  title: string;
  properties: Property[];
  units: Unit[];
  tanks: RefrigerantCylinder[];
  recentUnitTransactions: Map<string, RefrigerantTransaction>;
  language: UserLanguage;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  canEdit: boolean;
  loading: boolean;
  resetVersion: number;
}) {
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [selectedSourceCylinderId, setSelectedSourceCylinderId] = useState("");
  const [notes, setNotes] = useState("");
  useEffect(() => {
    setSelectedPropertyId("");
    setSelectedUnitId("");
    setSelectedSourceCylinderId("");
    setNotes("");
  }, [resetVersion]);
  const selectedUnit = units.find((unit) => unit.id === selectedUnitId) ?? null;
  const selectedTank = tanks.find((tank) => tank.id === selectedSourceCylinderId) ?? null;
  const recentUnitTransaction = selectedUnitId ? recentUnitTransactions.get(selectedUnitId) ?? null : null;
  const workflowDraft: RefrigerantWorkflowDraft | null = (selectedPropertyId || selectedUnit?.propertyId)
    ? {
      propertyId: selectedPropertyId || selectedUnit?.propertyId || "",
      unitId: selectedUnitId,
      unitNumber: selectedUnit?.number ?? "",
      building: selectedUnit?.building ?? "",
      equipmentQuery: [selectedUnit?.number, selectedTank?.refrigerantType.name].filter(Boolean).join(" / "),
      query: notes,
    }
    : null;
  return (
    <form className="refrigerant-card compact-form" onSubmit={onSubmit}>
      <h2>{title}</h2>
      <UnitSelect
        language={language}
        properties={properties}
        units={units}
        selectedPropertyId={selectedPropertyId}
        selectedUnitId={selectedUnitId}
        onPropertyChange={setSelectedPropertyId}
        onUnitChange={setSelectedUnitId}
      />
      {recentUnitTransaction ? (
        <div className="refrigerant-context-banner">
          <strong>{t(language, "refrigerant.lastUnitContext")}</strong>
          <span>{transactionTypeName(language, recentUnitTransaction.transactionType)} / {recentUnitTransaction.refrigerantType.name} / {dateLabel(recentUnitTransaction.occurredAt, language)}</span>
          {recentUnitTransaction.sourceCylinder && tanks.some((tank) => tank.id === recentUnitTransaction.sourceCylinder?.id) ? (
            <button type="button" className="button button-secondary" onClick={() => setSelectedSourceCylinderId(recentUnitTransaction.sourceCylinder?.id ?? "")}>
              {t(language, "refrigerant.useLastUnitContext")}
            </button>
          ) : null}
        </div>
      ) : null}
      <label>{t(language, "refrigerant.virginTank")}
        <select name="sourceCylinderId" value={selectedSourceCylinderId} onChange={(event) => setSelectedSourceCylinderId(event.target.value)} required>
          <option value="">{t(language, "refrigerant.selectActiveTank")}</option>
          {tanks.map((tank) => <option key={tank.id} value={tank.id}>{tank.identifier} / {tank.refrigerantType.name} / {tank.currentWeight} lb</option>)}
        </select>
      </label>
      <div className="form-grid-two">
        <label>{t(language, "refrigerant.startWeight")} <input name="startWeight" type="number" step="0.01" required /></label>
        <label>{t(language, "refrigerant.endWeight")} <input name="endWeight" type="number" step="0.01" required /></label>
      </div>
      <label>{t(language, "refrigerant.notes")} <input name="notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={t(language, "refrigerant.chargeNotesPlaceholder")} /></label>
      {workflowDraft?.propertyId ? (
        <PropertyWikiWorkflowPanel
          title={t(language, "refrigerant.liveEquipmentContext")}
          module="REFRIGERANT"
          propertyId={workflowDraft.propertyId}
          unitNumber={workflowDraft.unitNumber || undefined}
          building={workflowDraft.building || undefined}
          equipmentQuery={workflowDraft.equipmentQuery || undefined}
          query={workflowDraft.query || undefined}
          canEdit={canEdit}
        />
      ) : null}
      <button type="submit" className="button button-primary" disabled={loading || tanks.length === 0}>{t(language, "refrigerant.logCharge")}</button>
    </form>
  );
}

function QuickRecoveryForm({ title, properties, units, tanks, types, recoveryType, recentUnitTransactions, language, onSubmit, canEdit, loading, resetVersion }: {
  title: string;
  properties: Property[];
  units: Unit[];
  tanks: RefrigerantCylinder[];
  types: Array<{ id: string; name: string }>;
  recoveryType: "CLEAN" | "DIRTY";
  recentUnitTransactions: Map<string, RefrigerantTransaction>;
  language: UserLanguage;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  canEdit: boolean;
  loading: boolean;
  resetVersion: number;
}) {
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [selectedRefrigerantTypeId, setSelectedRefrigerantTypeId] = useState("");
  const [selectedRecoveryCylinderId, setSelectedRecoveryCylinderId] = useState("");
  const [notes, setNotes] = useState("");
  useEffect(() => {
    setSelectedPropertyId("");
    setSelectedUnitId("");
    setSelectedRefrigerantTypeId("");
    setSelectedRecoveryCylinderId("");
    setNotes("");
  }, [resetVersion]);
  const selectedUnit = units.find((unit) => unit.id === selectedUnitId) ?? null;
  const selectedType = types.find((type) => type.id === selectedRefrigerantTypeId) ?? null;
  const selectedTank = tanks.find((tank) => tank.id === selectedRecoveryCylinderId) ?? null;
  const recentUnitTransaction = selectedUnitId ? recentUnitTransactions.get(selectedUnitId) ?? null : null;
  const workflowDraft: RefrigerantWorkflowDraft | null = (selectedPropertyId || selectedUnit?.propertyId)
    ? {
      propertyId: selectedPropertyId || selectedUnit?.propertyId || "",
      unitId: selectedUnitId,
      unitNumber: selectedUnit?.number ?? "",
      building: selectedUnit?.building ?? "",
      equipmentQuery: [selectedUnit?.number, selectedType?.name ?? selectedTank?.refrigerantType.name].filter(Boolean).join(" / "),
      query: notes,
    }
    : null;
  return (
    <form className="refrigerant-card compact-form" onSubmit={onSubmit}>
      <h2>{title}</h2>
      <UnitSelect
        language={language}
        properties={properties}
        units={units}
        selectedPropertyId={selectedPropertyId}
        selectedUnitId={selectedUnitId}
        onPropertyChange={setSelectedPropertyId}
        onUnitChange={setSelectedUnitId}
      />
      {recentUnitTransaction ? (
        <div className="refrigerant-context-banner">
          <strong>{t(language, "refrigerant.lastUnitContext")}</strong>
          <span>{transactionTypeName(language, recentUnitTransaction.transactionType)} / {recentUnitTransaction.refrigerantType.name} / {dateLabel(recentUnitTransaction.occurredAt, language)}</span>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              setSelectedRefrigerantTypeId(recentUnitTransaction.refrigerantTypeId);
              if (recentUnitTransaction.recoveryCylinder && tanks.some((tank) => tank.id === recentUnitTransaction.recoveryCylinder?.id)) {
                setSelectedRecoveryCylinderId(recentUnitTransaction.recoveryCylinder.id);
              }
            }}
          >
            {t(language, "refrigerant.useLastUnitContext")}
          </button>
        </div>
      ) : null}
      <label>{t(language, "refrigerant.refrigerantType")}
        <select name="refrigerantTypeId" value={selectedRefrigerantTypeId} onChange={(event) => setSelectedRefrigerantTypeId(event.target.value)} required>
          <option value="">{t(language, "refrigerant.selectType")}</option>
          {types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
        </select>
      </label>
      <label>{recoveryType === "DIRTY" ? t(language, "refrigerant.dirtyRecoveryTank") : t(language, "refrigerant.cleanRecoveryTank")}
        <select name="recoveryCylinderId" value={selectedRecoveryCylinderId} onChange={(event) => setSelectedRecoveryCylinderId(event.target.value)} required>
          <option value="">{t(language, "refrigerant.selectRecoveryTank")}</option>
          {tanks.map((tank) => <option key={tank.id} value={tank.id}>{tank.identifier} / {tank.refrigerantType.name} / {tank.currentWeight} lb</option>)}
        </select>
      </label>
      <div className="form-grid-two">
        <label>{t(language, "refrigerant.startWeight")} <input name="startWeight" type="number" step="0.01" required /></label>
        <label>{t(language, "refrigerant.endWeight")} <input name="endWeight" type="number" step="0.01" required /></label>
      </div>
      <label>{t(language, "refrigerant.notes")} <input name="notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={t(language, "refrigerant.recoveryNotesPlaceholder")} /></label>
      {workflowDraft?.propertyId ? (
        <PropertyWikiWorkflowPanel
          title={t(language, "refrigerant.liveEquipmentContext")}
          module="REFRIGERANT"
          propertyId={workflowDraft.propertyId}
          unitNumber={workflowDraft.unitNumber || undefined}
          building={workflowDraft.building || undefined}
          equipmentQuery={workflowDraft.equipmentQuery || undefined}
          query={workflowDraft.query || undefined}
          canEdit={canEdit}
        />
      ) : null}
      <button type="submit" className="button button-primary" disabled={loading || tanks.length === 0}>{t(language, "refrigerant.logRecovery")}</button>
    </form>
  );
}

function TankWorkspace({ title, language, canEdit, canAdmin, category, types, tanks, properties = [], units = [], recoveryTanks = [], onCreate, onUpdate, onDelete, onRecovery, onFinalRecovery, loading, resetVersion = 0 }: {
  title: string;
  language: UserLanguage;
  canEdit: boolean;
  canAdmin: boolean;
  category: RefrigerantCylinder["category"];
  types: Array<{ id: string; name: string }>;
  tanks: RefrigerantCylinder[];
  properties?: Property[];
  units?: Unit[];
  recoveryTanks?: RefrigerantCylinder[];
  onCreate: (event: FormEvent<HTMLFormElement>, category: RefrigerantCylinder["category"]) => void;
  onUpdate: (id: string, input: Partial<{ status: RefrigerantCylinder["status"]; dispositionNotes: string | null; finalRecoveryCompleted: boolean }>) => void;
  onDelete: (id: string) => void;
  onRecovery?: (event: FormEvent<HTMLFormElement>) => void;
  onFinalRecovery?: (event: FormEvent<HTMLFormElement>) => void;
  loading: boolean;
  resetVersion?: number;
}) {
  const activeTanks = tanks.filter((tank) => tank.status !== "ARCHIVED");
  const archivedTanks = tanks.filter((tank) => tank.status === "ARCHIVED");
  return (
    <>
      {canEdit ? (
        <form className="refrigerant-card compact-form" onSubmit={(event) => onCreate(event, category)}>
          <h2>{tWithVars(language, "refrigerant.addTankTitle", { category: categoryName(language, category) })}</h2>
          <div className="form-grid-four">
            <label>{t(language, "refrigerant.identifier")} <input name="identifier" required placeholder={t(language, "refrigerant.identifierPlaceholder")} /></label>
            <label>{t(language, "refrigerant.type")}
              <select name="refrigerantTypeId" required>
                <option value="">{t(language, "refrigerant.selectType")}</option>
                {types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
              </select>
            </label>
            <TankSizeField language={language} />
            <label>{t(language, "refrigerant.currentWeight")} <input name="currentWeight" type="number" step="0.01" required /></label>
          </div>
          <label>{t(language, "refrigerant.notes")} <input name="notes" /></label>
          {category === "VIRGIN" && canAdmin ? <label className="toggle-row"><input name="overrideActiveVirgin" type="checkbox" />{t(language, "refrigerant.allowAnotherActiveVirgin")}</label> : null}
          <button type="submit" className="button button-primary" disabled={loading}>{t(language, "refrigerant.addTank")}</button>
        </form>
      ) : null}

      {onRecovery ? (
        <QuickRecoveryForm title={tWithVars(language, "refrigerant.logCategoryRecovery", { category: categoryName(language, category) })} properties={properties} units={units} tanks={tanks.filter((tank) => tank.status === "ACTIVE")} types={types} recoveryType={category === "DIRTY_RECOVERY" ? "DIRTY" : "CLEAN"} recentUnitTransactions={new Map()} language={language} onSubmit={onRecovery} canEdit={canEdit} loading={loading} resetVersion={resetVersion} />
      ) : null}

      {onFinalRecovery ? (
        <form className="refrigerant-card compact-form" onSubmit={onFinalRecovery}>
          <h2>{t(language, "refrigerant.finalRecoveryTitle")}</h2>
          <div className="form-grid-four">
            <label>{t(language, "refrigerant.emptyVirginTank")}
              <select name="sourceCylinderId" required>
                <option value="">{t(language, "refrigerant.selectTank")}</option>
                {tanks.filter((tank) => tank.status !== "ARCHIVED").map((tank) => <option key={tank.id} value={tank.id}>{tank.identifier} / {tank.refrigerantType.name}</option>)}
              </select>
            </label>
            <label>{t(language, "refrigerant.recoveryTank")}
              <select name="recoveryCylinderId" required>
                <option value="">{t(language, "refrigerant.selectRecoveryTank")}</option>
                {recoveryTanks.map((tank) => <option key={tank.id} value={tank.id}>{tank.identifier} / {tank.refrigerantType.name}</option>)}
              </select>
            </label>
            <label>{t(language, "refrigerant.startWeight")} <input name="startWeight" type="number" step="0.01" required /></label>
            <label>{t(language, "refrigerant.endWeight")} <input name="endWeight" type="number" step="0.01" required /></label>
          </div>
          <label>{t(language, "refrigerant.notes")} <input name="notes" /></label>
          <button type="submit" className="button button-primary" disabled={loading}>{t(language, "refrigerant.completeFinalRecovery")}</button>
        </form>
      ) : null}

      <section className="refrigerant-card">
        <h2>{title}</h2>
        {activeTanks.length ? activeTanks.map((tank) => (
          <div className="refrigerant-tank-row" key={tank.id}>
            <div>
              <strong>{tank.identifier}</strong>
              <span>{tank.refrigerantType.name} / {tank.currentWeight} lb of {tank.tankSize} lb</span>
            </div>
            <CylinderStatusPill cylinder={tank} language={language} />
            {canEdit ? (
              <div className="button-cluster">
                {tank.category === "VIRGIN" && tank.status === "ACTIVE" ? <button type="button" className="button button-secondary" onClick={() => onUpdate(tank.id, { status: "EMPTY_PENDING_RECOVERY" })}>{t(language, "refrigerant.markEmpty")}</button> : null}
                <button type="button" className="button button-secondary" onClick={() => onUpdate(tank.id, { status: "ARCHIVED", dispositionNotes: tank.category === "VIRGIN" ? tank.dispositionNotes : "Archived from tank workspace." })}>{t(language, "refrigerant.archive")}</button>
              </div>
            ) : null}
          </div>
        )) : <p className="muted">{tWithVars(language, "refrigerant.noCategoryConfigured", { category: title.toLowerCase() })}</p>}
        {archivedTanks.length ? (
          <div className="pool-archived-list" data-testid={`refrigerant-${category.toLowerCase()}-archive-list`}>
            <h3>{language === "es" ? "Cilindros archivados" : "Archived cylinders"}</h3>
            <p className="muted">
              {language === "es"
                ? "Los cilindros archivados se retiran de las capturas activas, pero siguen visibles para historial y pueden restaurarse aquí."
                : "Archived cylinders stay out of active capture flows, but remain visible for history and can be restored here."}
            </p>
            {archivedTanks.map((tank) => (
              <div className="refrigerant-tank-row" key={tank.id}>
                <div>
                  <strong>{tank.identifier}</strong>
                  <span>{tank.refrigerantType.name} / {tank.currentWeight} lb of {tank.tankSize} lb</span>
                </div>
                <CylinderStatusPill cylinder={tank} language={language} />
                {canEdit ? (
                  <div className="button-cluster">
                    <button type="button" className="button button-secondary" onClick={() => onUpdate(tank.id, { status: "ACTIVE" })}>{t(language, "refrigerant.restore")}</button>
                    <button
                      type="button"
                      className="button button-danger"
                      onClick={() => {
                        const confirmed = window.confirm(
                          language === "es"
                            ? `Eliminar permanentemente ${tank.identifier}? Solo los cilindros archivados sin historial pueden borrarse.`
                            : `Permanently delete ${tank.identifier}? Only archived cylinders without transaction history can be deleted.`
                        );
                        if (!confirmed) return;
                        onDelete(tank.id);
                      }}
                    >
                      {language === "es" ? "Eliminar permanente" : "Delete Permanently"}
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </>
  );
}

function HistoryList({ language, transactions }: { language: UserLanguage; transactions: Array<{ id: string; occurredAt: string; transactionType: string; unitNumber: string | null; refrigerantType: { name: string }; amount: number; sourceCylinder: { identifier: string } | null; recoveryCylinder: { identifier: string } | null; createdByName: string | null; notes: string | null }> }) {
  return (
    <section className="refrigerant-card">
      <h2>{t(language, "refrigerant.historyTitle")}</h2>
      {transactions.length ? transactions.map((entry) => (
        <div className="refrigerant-history-row" key={entry.id}>
          <strong>{entry.unitNumber ?? t(language, "refrigerant.noUnit")} / {entry.refrigerantType.name}</strong>
          <span>{transactionTypeName(language, entry.transactionType as RefrigerantTransaction["transactionType"])} / {entry.amount.toFixed(2)} lb / {dateLabel(entry.occurredAt, language)}</span>
          <small>{entry.sourceCylinder?.identifier ?? entry.recoveryCylinder?.identifier ?? t(language, "refrigerant.noTank")} / {entry.createdByName ?? t(language, "refrigerant.unknownUser")}{entry.notes ? ` / ${entry.notes}` : ""}</small>
        </div>
      )) : <p className="muted">{t(language, "refrigerant.noActivity")}</p>}
    </section>
  );
}
