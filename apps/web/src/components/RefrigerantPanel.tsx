import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createRefrigerantCharge,
  createRefrigerantCylinder,
  createRefrigerantFinalRecovery,
  createRefrigerantRecovery,
  createRefrigerantType,
  dismissRefrigerantLeakFlag,
  getRefrigerantCylinders,
  getRefrigerantHistory,
  getRefrigerantOverview,
  refrigerantExportCsvUrl,
  updateRefrigerantCylinder,
  updateRefrigerantType,
  type Property,
  type RefrigerantCylinder,
  type RefrigerantType,
  type RefrigerantTransactionInput,
  type Unit,
  type UserRole,
} from "../lib/api";
import { PropertyWikiWorkflowPanel } from "./PropertyWikiWorkflowPanel";
import { StatusState } from "./StatusState";

type RefrigerantTab = "overview" | "virgin" | "clean" | "dirty" | "history" | "exports";

type Props = {
  properties: Property[];
  units: Unit[];
  userRole: UserRole;
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

function numberValue(value: FormDataEntryValue | null) {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function CylinderStatusPill({ cylinder }: { cylinder: RefrigerantCylinder }) {
  const fill = cylinder.fillPercent ?? Math.round((cylinder.currentWeight / cylinder.tankSize) * 100);
  const warn = cylinder.category !== "VIRGIN" && fill >= 80;
  return <span className={`status-pill ${warn ? "risk-critical" : ""}`}>{cylinder.status.replace(/_/g, " ")}{cylinder.category !== "VIRGIN" ? ` / ${fill}%` : ""}</span>;
}

function TankSizeField() {
  const [sizeMode, setSizeMode] = useState(commonTankSizes[2]?.value ?? "30");
  const isCustom = sizeMode === "custom";
  return (
    <label>Tank size
      <div className="split-field">
        <select value={sizeMode} onChange={(event) => setSizeMode(event.target.value)} aria-label="Tank size preset">
          {commonTankSizes.map((size) => <option key={size.value} value={size.value}>{size.label}</option>)}
          <option value="custom">Custom</option>
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
          placeholder={isCustom ? "Enter lb" : undefined}
          aria-label="Tank size in pounds"
        />
      </div>
    </label>
  );
}

export function RefrigerantPanel({ properties, units, userRole }: Props) {
  const [tab, setTab] = useState<RefrigerantTab>("overview");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("");
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
      setMessage("Refrigerant record saved.");
      setError("");
      await invalidate();
    },
    onError: (err) => {
      setMessage("");
      setError(err instanceof Error ? err.message : "Refrigerant action failed.");
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
    return <StatusState title="Loading refrigerant logs" description="Preparing tanks, recovery warnings, and recent activity." />;
  }

  if (overviewQuery.isError || cylindersQuery.isError) {
    return <StatusState title="Refrigerant module failed to load" description="Refresh the workspace and try again." tone="error" />;
  }

  return (
    <section className="refrigerant-panel" data-testid="refrigerant-panel">
      <header className="module-heading">
        <span className="eyebrow">EPA 608 support</span>
        <h1>Refrigerant</h1>
        <p>Log refrigerant added or recovered, track tank balances, and review unit refrigerant history.</p>
      </header>

      <nav className="subtab-row" aria-label="Refrigerant sections">
        {[
          ["overview", "Overview"],
          ["virgin", "Virgin Tanks"],
          ["clean", "Clean Recovery"],
          ["dirty", "Dirty Recovery"],
          ["history", "Unit History"],
          ["exports", "Exports"],
        ].map(([key, label]) => (
          <button key={key} type="button" data-testid={`refrigerant-tab-${key}`} className={tab === key ? "active" : ""} onClick={() => setTab(key as RefrigerantTab)}>{label}</button>
        ))}
      </nav>

      {message ? <div className="banner banner-success">{message}</div> : null}
      {error ? <div className="banner banner-error">{error}</div> : null}

      {tab === "overview" ? (
        <>
          <div className="metric-grid" data-testid="refrigerant-overview-metrics">
            <div className="metric-card"><strong>{Object.values(overviewQuery.data?.summary.activeVirginByType ?? {}).reduce((sum, value) => sum + value, 0)}</strong><span>Active virgin tanks</span></div>
            <div className="metric-card"><strong>{overviewQuery.data?.summary.recoveryNearCapacity ?? 0}</strong><span>Recovery tanks near capacity</span></div>
            <div className="metric-card"><strong>{overviewQuery.data?.summary.repeatedAdditionFlags ?? 0}</strong><span>Repeated addition flags</span></div>
            <div className="metric-card"><strong>{overviewQuery.data?.summary.complianceIssues ?? 0}</strong><span>Compliance issues</span></div>
          </div>
          {canEdit ? (
            <div className="refrigerant-quick-grid">
              <QuickChargeForm
                title="Quick Charge"
                properties={properties}
                units={units}
                tanks={activeVirginTanks}
                onSubmit={submitCharge}
                loading={runMutation.isPending}
              />
              <QuickRecoveryForm
                title="Quick Recovery"
                properties={properties}
                units={units}
                tanks={cleanRecoveryTanks.filter((tank) => tank.status === "ACTIVE")}
                types={activeTypes}
                recoveryType="CLEAN"
                onSubmit={(event) => submitRecovery(event, "CLEAN")}
                loading={runMutation.isPending}
              />
            </div>
          ) : null}
          {workflowPropertyId ? (
            <PropertyWikiWorkflowPanel
              title="Equipment, SOPs, and HVAC Notes"
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
          <section className="refrigerant-card">
            <h2>Compliance Issues</h2>
            {(overviewQuery.data?.complianceIssues ?? []).length ? overviewQuery.data!.complianceIssues.map((issue) => (
              <div className="refrigerant-row" key={`${issue.type}-${issue.message}`}>
                <strong>{issue.severity}</strong>
                <span>{issue.message}</span>
              </div>
            )) : <p className="muted">No refrigerant compliance warnings detected.</p>}
          </section>
          <section className="refrigerant-card">
            <h2>Repeated Additions</h2>
            {(overviewQuery.data?.leakFlags ?? []).length ? overviewQuery.data!.leakFlags.map((flag) => (
              <div className="refrigerant-row" key={flag.id}>
                <strong>{flag.unitNumber}</strong>
                <span>{flag.reason}</span>
                {userRole === "ADMIN" || userRole === "MANAGER" ? <button type="button" className="button button-secondary" onClick={() => runMutation.mutate(() => dismissRefrigerantLeakFlag(flag.id, "Reviewed from Refrigerant overview."))}>Dismiss</button> : null}
              </div>
            )) : <p className="muted">No repeated-addition leak flags.</p>}
          </section>
          <RefrigerantTypesCard
            canAdmin={canAdmin}
            types={types}
            onCreate={submitType}
            onToggle={(id, isActive) => runMutation.mutate(() => updateRefrigerantType(id, { isActive }))}
            loading={runMutation.isPending}
          />
          <HistoryList transactions={overviewQuery.data?.recent ?? []} />
        </>
      ) : tab === "virgin" ? (
        <TankWorkspace
          title="Virgin Tanks"
          canEdit={canEdit}
          canAdmin={canAdmin}
          category="VIRGIN"
          types={activeTypes}
          tanks={virginTanks}
          onCreate={submitCylinder}
          onUpdate={(id, input) => runMutation.mutate(() => updateRefrigerantCylinder(id, input))}
          onFinalRecovery={submitFinalRecovery}
          recoveryTanks={[...cleanRecoveryTanks, ...dirtyRecoveryTanks].filter((tank) => tank.status === "ACTIVE")}
          loading={runMutation.isPending}
        />
      ) : tab === "clean" ? (
        <TankWorkspace
          title="Clean Recovery"
          canEdit={canEdit}
          canAdmin={canAdmin}
          category="CLEAN_RECOVERY"
          types={activeTypes}
          tanks={cleanRecoveryTanks}
          properties={properties}
          units={units}
          onCreate={submitCylinder}
          onUpdate={(id, input) => runMutation.mutate(() => updateRefrigerantCylinder(id, input))}
          onRecovery={(event) => submitRecovery(event, "CLEAN")}
          loading={runMutation.isPending}
        />
      ) : tab === "dirty" ? (
        <TankWorkspace
          title="Dirty Recovery"
          canEdit={canEdit}
          canAdmin={canAdmin}
          category="DIRTY_RECOVERY"
          types={activeTypes}
          tanks={dirtyRecoveryTanks}
          properties={properties}
          units={units}
          onCreate={submitCylinder}
          onUpdate={(id, input) => runMutation.mutate(() => updateRefrigerantCylinder(id, input))}
          onRecovery={(event) => submitRecovery(event, "DIRTY")}
          loading={runMutation.isPending}
        />
      ) : tab === "history" ? (
        <>
          <div className="toolbar-card">
            <label>Property
              <select value={propertyFilter} onChange={(event) => setPropertyFilter(event.target.value)}>
                <option value="">All accessible properties</option>
                {properties.map((property) => <option key={property.id} value={property.id}>{property.code} / {property.name}</option>)}
              </select>
            </label>
          </div>
          {workflowPropertyId ? (
            <PropertyWikiWorkflowPanel
              title="Unit Refrigerant Context"
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
          <HistoryList transactions={historyQuery.data?.transactions ?? []} />
        </>
      ) : (
        <section className="refrigerant-card">
          <h2>Exports</h2>
          <p className="muted">CSV exports are available now and can be opened in spreadsheet tools. PDF and native Excel exports are planned for the reporting layer.</p>
          <div className="export-grid">
            {[
              ["usage", "Usage Report"],
              ["recovery", "Recovery Report"],
              ["cylinders", "Cylinder Status Report"],
              ["compliance", "Compliance Report"],
              ["unitHistory", "Unit History Report"],
              ["fullAudit", "Full Audit Export"],
            ].map(([report, label]) => <a key={report} className="button button-secondary" href={refrigerantExportCsvUrl(report as never)}>{label} CSV</a>)}
          </div>
        </section>
      )}
    </section>
  );
}

function RefrigerantTypesCard({ canAdmin, types, onCreate, onToggle, loading }: {
  canAdmin: boolean;
  types: RefrigerantType[];
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  onToggle: (id: string, isActive: boolean) => void;
  loading: boolean;
}) {
  return (
    <section className="refrigerant-card">
      <div className="section-title-row">
        <div>
          <h2>Refrigerant Types</h2>
          <p className="muted">Admin-managed list used by tanks, charge logs, recovery logs, and exports.</p>
        </div>
      </div>
      {canAdmin ? (
        <form className="compact-form inline-form" onSubmit={onCreate}>
          <input name="name" placeholder="R454B, R32, R410A..." required />
          <input name="notes" placeholder="Optional note" />
          <button type="submit" className="button button-primary" disabled={loading}>Add type</button>
        </form>
      ) : null}
      <div className="refrigerant-type-list">
        {types.map((type) => (
          <div className="refrigerant-row" key={type.id}>
            <strong>{type.name}</strong>
            <span>{type.notes || "No notes"}</span>
            <span className={`status-pill ${type.isActive ? "" : "muted-pill"}`}>{type.isActive ? "Active" : "Inactive"}</span>
            {canAdmin ? (
              <button type="button" className="button button-secondary" onClick={() => onToggle(type.id, !type.isActive)} disabled={loading}>
                {type.isActive ? "Deactivate" : "Reactivate"}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function UnitSelect({ properties, units }: { properties: Property[]; units: Unit[] }) {
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const scopedUnits = selectedPropertyId ? units.filter((unit) => unit.propertyId === selectedPropertyId) : units;
  return (
    <>
      <label>Property
        <select name="propertyId" value={selectedPropertyId} onChange={(event) => setSelectedPropertyId(event.target.value)}>
          <option value="">No property / shop work</option>
          {properties.map((property) => <option key={property.id} value={property.id}>{property.code} / {property.name}</option>)}
        </select>
      </label>
      <label>Unit
        <select name="unitId">
          <option value="">No unit selected</option>
          {scopedUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.number} / {unit.floorPlan ?? "No floor plan"}</option>)}
        </select>
      </label>
    </>
  );
}

function QuickChargeForm({ title, properties, units, tanks, onSubmit, loading }: {
  title: string;
  properties: Property[];
  units: Unit[];
  tanks: RefrigerantCylinder[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  loading: boolean;
}) {
  return (
    <form className="refrigerant-card compact-form" onSubmit={onSubmit}>
      <h2>{title}</h2>
      <UnitSelect properties={properties} units={units} />
      <label>Virgin tank
        <select name="sourceCylinderId" required>
          <option value="">Select active tank</option>
          {tanks.map((tank) => <option key={tank.id} value={tank.id}>{tank.identifier} / {tank.refrigerantType.name} / {tank.currentWeight} lb</option>)}
        </select>
      </label>
      <div className="form-grid-two">
        <label>Start weight <input name="startWeight" type="number" step="0.01" required /></label>
        <label>End weight <input name="endWeight" type="number" step="0.01" required /></label>
      </div>
      <label>Notes <input name="notes" placeholder="Work order, leak context, system notes..." /></label>
      <button type="submit" className="button button-primary" disabled={loading || tanks.length === 0}>Log charge</button>
    </form>
  );
}

function QuickRecoveryForm({ title, properties, units, tanks, types, recoveryType, onSubmit, loading }: {
  title: string;
  properties: Property[];
  units: Unit[];
  tanks: RefrigerantCylinder[];
  types: Array<{ id: string; name: string }>;
  recoveryType: "CLEAN" | "DIRTY";
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  loading: boolean;
}) {
  return (
    <form className="refrigerant-card compact-form" onSubmit={onSubmit}>
      <h2>{title}</h2>
      <UnitSelect properties={properties} units={units} />
      <label>Refrigerant type
        <select name="refrigerantTypeId" required>
          <option value="">Select type</option>
          {types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
        </select>
      </label>
      <label>{recoveryType === "DIRTY" ? "Dirty" : "Clean"} recovery tank
        <select name="recoveryCylinderId" required>
          <option value="">Select recovery tank</option>
          {tanks.map((tank) => <option key={tank.id} value={tank.id}>{tank.identifier} / {tank.refrigerantType.name} / {tank.currentWeight} lb</option>)}
        </select>
      </label>
      <div className="form-grid-two">
        <label>Start weight <input name="startWeight" type="number" step="0.01" required /></label>
        <label>End weight <input name="endWeight" type="number" step="0.01" required /></label>
      </div>
      <label>Notes <input name="notes" placeholder="Recovered from unit, reclaim note, disposition..." /></label>
      <button type="submit" className="button button-primary" disabled={loading || tanks.length === 0}>Log recovery</button>
    </form>
  );
}

function TankWorkspace({ title, canEdit, canAdmin, category, types, tanks, properties = [], units = [], recoveryTanks = [], onCreate, onUpdate, onRecovery, onFinalRecovery, loading }: {
  title: string;
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
  onRecovery?: (event: FormEvent<HTMLFormElement>) => void;
  onFinalRecovery?: (event: FormEvent<HTMLFormElement>) => void;
  loading: boolean;
}) {
  return (
    <>
      {canEdit ? (
        <form className="refrigerant-card compact-form" onSubmit={(event) => onCreate(event, category)}>
          <h2>Add {categoryLabel[category]} Tank</h2>
          <div className="form-grid-four">
            <label>Identifier <input name="identifier" required placeholder="Cylinder serial / shop label" /></label>
            <label>Type
              <select name="refrigerantTypeId" required>
                <option value="">Select type</option>
                {types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
              </select>
            </label>
            <TankSizeField />
            <label>Current weight <input name="currentWeight" type="number" step="0.01" required /></label>
          </div>
          <label>Notes <input name="notes" /></label>
          {category === "VIRGIN" && canAdmin ? <label className="toggle-row"><input name="overrideActiveVirgin" type="checkbox" />Allow another active virgin tank for this type</label> : null}
          <button type="submit" className="button button-primary" disabled={loading}>Add tank</button>
        </form>
      ) : null}

      {onRecovery ? (
        <QuickRecoveryForm title={`Log ${categoryLabel[category]} Recovery`} properties={properties} units={units} tanks={tanks.filter((tank) => tank.status === "ACTIVE")} types={types} recoveryType={category === "DIRTY_RECOVERY" ? "DIRTY" : "CLEAN"} onSubmit={onRecovery} loading={loading} />
      ) : null}

      {onFinalRecovery ? (
        <form className="refrigerant-card compact-form" onSubmit={onFinalRecovery}>
          <h2>Final Recovery From Empty Virgin Tank</h2>
          <div className="form-grid-four">
            <label>Empty virgin tank
              <select name="sourceCylinderId" required>
                <option value="">Select tank</option>
                {tanks.filter((tank) => tank.status !== "ARCHIVED").map((tank) => <option key={tank.id} value={tank.id}>{tank.identifier} / {tank.refrigerantType.name}</option>)}
              </select>
            </label>
            <label>Recovery tank
              <select name="recoveryCylinderId" required>
                <option value="">Select recovery tank</option>
                {recoveryTanks.map((tank) => <option key={tank.id} value={tank.id}>{tank.identifier} / {tank.refrigerantType.name}</option>)}
              </select>
            </label>
            <label>Start weight <input name="startWeight" type="number" step="0.01" required /></label>
            <label>End weight <input name="endWeight" type="number" step="0.01" required /></label>
          </div>
          <label>Notes <input name="notes" /></label>
          <button type="submit" className="button button-primary" disabled={loading}>Complete final recovery</button>
        </form>
      ) : null}

      <section className="refrigerant-card">
        <h2>{title}</h2>
        {tanks.length ? tanks.map((tank) => (
          <div className="refrigerant-tank-row" key={tank.id}>
            <div>
              <strong>{tank.identifier}</strong>
              <span>{tank.refrigerantType.name} / {tank.currentWeight} lb of {tank.tankSize} lb</span>
            </div>
            <CylinderStatusPill cylinder={tank} />
            {canEdit ? (
              <div className="button-cluster">
                {tank.category === "VIRGIN" && tank.status === "ACTIVE" ? <button type="button" className="button button-secondary" onClick={() => onUpdate(tank.id, { status: "EMPTY_PENDING_RECOVERY" })}>Mark empty</button> : null}
                {tank.status !== "ARCHIVED" ? <button type="button" className="button button-secondary" onClick={() => onUpdate(tank.id, { status: "ARCHIVED", dispositionNotes: tank.category === "VIRGIN" ? tank.dispositionNotes : "Archived from tank workspace." })}>Archive</button> : null}
                {tank.status === "ARCHIVED" ? <button type="button" className="button button-secondary" onClick={() => onUpdate(tank.id, { status: "ACTIVE" })}>Restore</button> : null}
              </div>
            ) : null}
          </div>
        )) : <p className="muted">No {title.toLowerCase()} configured yet.</p>}
      </section>
    </>
  );
}

function HistoryList({ transactions }: { transactions: Array<{ id: string; occurredAt: string; transactionType: string; unitNumber: string | null; refrigerantType: { name: string }; amount: number; sourceCylinder: { identifier: string } | null; recoveryCylinder: { identifier: string } | null; createdByName: string | null; notes: string | null }> }) {
  return (
    <section className="refrigerant-card">
      <h2>Recent Refrigerant Activity</h2>
      {transactions.length ? transactions.map((entry) => (
        <div className="refrigerant-history-row" key={entry.id}>
          <strong>{entry.unitNumber ?? "No unit"} / {entry.refrigerantType.name}</strong>
          <span>{entry.transactionType.replace(/_/g, " ")} / {entry.amount.toFixed(2)} lb / {dateLabel(entry.occurredAt)}</span>
          <small>{entry.sourceCylinder?.identifier ?? entry.recoveryCylinder?.identifier ?? "No tank"} / {entry.createdByName ?? "Unknown user"}{entry.notes ? ` / ${entry.notes}` : ""}</small>
        </div>
      )) : <p className="muted">No refrigerant activity logged yet.</p>}
    </section>
  );
}
