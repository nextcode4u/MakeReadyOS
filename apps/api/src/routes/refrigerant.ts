import { stringify } from "csv-stringify/sync";
import { UserRole } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { scopedAllowedPropertyIds } from "../lib/auth.js";
import { writeAuditLog } from "../lib/audit.js";
import { createNotification } from "../lib/notifications.js";
import { renderPdfFromHtml } from "../lib/pdf.js";
import { prisma } from "../lib/prisma.js";
import { ALL_ACCESSIBLE_PROPERTIES_SCOPE_LABEL, propertyScopeLabel } from "../lib/reportScope.js";

const cylinderCategories = ["VIRGIN", "CLEAN_RECOVERY", "DIRTY_RECOVERY"] as const;
const cylinderStatuses = ["ACTIVE", "EMPTY_PENDING_RECOVERY", "ARCHIVED"] as const;
const transactionTypes = ["VIRGIN_CHARGE", "CLEAN_RECOVERY", "DIRTY_RECOVERY", "FINAL_RECOVERY"] as const;
const numericReading = z.union([z.number(), z.string().trim().min(1)]);
const weightReading = numericReading.pipe(z.coerce.number().finite().min(0).max(10000));

export const refrigerantTypeSchema = z.object({
  name: z.string().trim().min(2).max(40),
  notes: z.string().trim().max(1000).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const refrigerantCylinderSchema = z.object({
  identifier: z.string().trim().min(1).max(120),
  refrigerantTypeId: z.string(),
  category: z.enum(cylinderCategories),
  tankSize: numericReading.pipe(z.coerce.number().finite().positive().max(10000)),
  currentWeight: weightReading,
  tareWeight: weightReading.nullable().optional(),
  waterCapacity: weightReading.nullable().optional(),
  status: z.enum(cylinderStatuses).optional().default("ACTIVE"),
  notes: z.string().trim().max(2000).nullable().optional(),
  dispositionNotes: z.string().trim().max(2000).nullable().optional(),
  overrideActiveVirgin: z.boolean().optional().default(false),
});

export const refrigerantCylinderPatchSchema = refrigerantCylinderSchema.partial().extend({
  finalRecoveryCompleted: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: "Provide cylinder fields to update" });

export const refrigerantTransactionSchema = z.object({
  propertyId: z.string().optional(),
  unitId: z.string().optional(),
  unitNumber: z.string().trim().max(80).optional(),
  refrigerantTypeId: z.string(),
  sourceCylinderId: z.string().optional(),
  recoveryCylinderId: z.string().optional(),
  startWeight: weightReading,
  endWeight: weightReading,
  occurredAt: z.coerce.date().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const refrigerantHistoryQuerySchema = z.object({
  propertyId: z.string().optional(),
  unitId: z.string().optional(),
  unitNumber: z.string().optional(),
  refrigerantTypeId: z.string().optional(),
  transactionType: z.enum(transactionTypes).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export const refrigerantLeakFlagDismissSchema = z.object({
  notes: z.string().trim().min(1).max(1000),
});

function accessFor(role: UserRole) {
  if (role === UserRole.ADMIN) return { view: true, edit: true, admin: true };
  if (role === UserRole.MANAGER || role === UserRole.TECH) return { view: true, edit: true, admin: false };
  if (role === UserRole.VIEWER) return { view: true, edit: false, admin: false };
  return { view: false, edit: false, admin: false };
}

function requireRefrigerantAccess(request: FastifyRequest, reply: FastifyReply, level: "view" | "edit" | "admin") {
  const access = accessFor(request.currentUser!.role);
  if (!access[level]) {
    reply.code(level === "view" ? 403 : 403).send({ message: "Refrigerant access required" });
    return false;
  }
  return true;
}

function scopedPropertyWhere(request: FastifyRequest, propertyId?: string) {
  const allowed = scopedAllowedPropertyIds(request);
  if (propertyId && allowed !== null && !allowed.includes(propertyId)) return { denied: true as const, where: undefined };
  return { denied: false as const, where: propertyId ?? (allowed === null ? undefined : { in: allowed }) };
}

async function assertPropertyScope(request: FastifyRequest, reply: FastifyReply, propertyId?: string | null) {
  if (!propertyId) return true;
  const allowed = scopedAllowedPropertyIds(request);
  if (allowed !== null && !allowed.includes(propertyId)) {
    reply.code(403).send({ message: "Property access denied" });
    return false;
  }
  return true;
}

function fillPercent(tankSize: number, currentWeight: number) {
  if (!tankSize) return 0;
  return Math.max(0, Math.round((currentWeight / tankSize) * 100));
}

function cylinderContentsWeight(input: { currentWeight: number; tareWeight?: number | null }) {
  if (typeof input.tareWeight === "number" && input.tareWeight > 0) {
    return Math.max(0, Number((input.currentWeight - input.tareWeight).toFixed(2)));
  }
  return input.currentWeight;
}

function safeCapacityWeight(input: { category: string; tankSize: number; waterCapacity?: number | null }) {
  if (input.category === "VIRGIN") return input.tankSize;
  const effectiveCapacity = typeof input.waterCapacity === "number" && input.waterCapacity > 0
    ? input.waterCapacity
    : input.tankSize;
  return effectiveCapacity * 0.8;
}

function cylinderMetrics<T extends { category: string; tankSize: number; currentWeight: number; tareWeight?: number | null; waterCapacity?: number | null }>(cylinder: T) {
  const safeCapacity = safeCapacityWeight(cylinder);
  const trackedWeight = cylinderContentsWeight(cylinder);
  return {
    safeCapacity,
    fillPercent: fillPercent(safeCapacity, trackedWeight),
    remainingCapacity: cylinder.category === "VIRGIN"
      ? Math.max(0, trackedWeight)
      : Math.max(0, Number((safeCapacity - trackedWeight).toFixed(2))),
  };
}

function inferredVirginTareWeight(input: { category: string; tankSize: number; currentWeight: number; tareWeight?: number | null }) {
  if (input.category !== "VIRGIN") {
    return input.tareWeight ?? null;
  }
  if (typeof input.tareWeight === "number" && input.tareWeight >= 0) {
    return input.tareWeight;
  }
  if (input.currentWeight >= input.tankSize) {
    return Number((input.currentWeight - input.tankSize).toFixed(2));
  }
  return null;
}

function weightAmount(type: (typeof transactionTypes)[number], startWeight: number, endWeight: number) {
  if (type === "CLEAN_RECOVERY" || type === "DIRTY_RECOVERY") return endWeight - startWeight;
  return startWeight - endWeight;
}

function leakLevel(count90: number, count365: number) {
  if (count365 >= 3) return "MANAGER_REVIEW_REQUIRED";
  if (count90 >= 2) return "POTENTIAL_REFRIGERANT_LEAK";
  return null;
}

function htmlEscape(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

type RefrigerantReportKind = "usage" | "recovery" | "cylinders" | "compliance" | "unitHistory" | "fullAudit";

type RefrigerantReportSection = {
  key: string;
  title: string;
  rows: Array<Record<string, unknown>>;
};

function titleCase(input: string) {
  return input
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function sanitizeFilename(filename: string) {
  return filename
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function formatReportValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return String(value);
}

async function refrigerantReportScopeLabel(propertyIds: string[] | null) {
  if (propertyIds === null) return ALL_ACCESSIBLE_PROPERTIES_SCOPE_LABEL;
  if (propertyIds.length === 1) {
    const property = await prisma.property.findUnique({
      where: { id: propertyIds[0] },
      select: { code: true, name: true },
    });
    return propertyScopeLabel(property);
  }
  return `${propertyIds.length} selected properties`;
}

function buildReportDocument(report: RefrigerantReportKind, sections: RefrigerantReportSection[], rowCount: number, scopeLabel: string) {
  const reportTitle = `Refrigerant ${titleCase(report)} Report`;
  const generatedAt = new Date().toLocaleString();
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${htmlEscape(reportTitle)}</title>
  <style>
    @page { size: Letter landscape; margin: 0.35in; }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; margin: 0; color: #111827; }
    h1 { margin: 0 0 0.3rem; font-size: 1.35rem; }
    .report-meta { margin: 0 0 0.95rem; color: #4b5563; font-size: 0.82rem; }
    .report-section { margin: 0 0 1rem; page-break-inside: avoid; }
    .report-section h2 { margin: 0 0 0.35rem; font-size: 0.98rem; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 8.6px; }
    th, td {
      border: 1px solid #d1d5db;
      padding: 4px 5px;
      text-align: left;
      vertical-align: top;
      word-break: break-word;
      overflow-wrap: anywhere;
    }
    th { background: #f3f4f6; font-weight: 700; }
    tbody tr:nth-child(even) td { background: #fafafa; }
    .empty-state {
      border: 1px dashed #d1d5db;
      border-radius: 0.45rem;
      padding: 0.7rem 0.8rem;
      color: #6b7280;
      font-size: 0.82rem;
    }
  </style>
</head>
<body>
  <h1>${htmlEscape(reportTitle)}</h1>
  <p class="report-meta">${htmlEscape(scopeLabel)} | Generated ${htmlEscape(generatedAt)} | ${htmlEscape(rowCount)} row(s) across ${htmlEscape(sections.length)} section(s)</p>
  ${sections.map((section) => {
    const headers = Array.from(new Set(section.rows.flatMap((row) => Object.keys(row))));
    return `<section class="report-section">
      <h2>${htmlEscape(section.title)}</h2>
      ${section.rows.length
        ? `<table>
            <thead>
              <tr>${headers.map((header) => `<th>${htmlEscape(titleCase(header))}</th>`).join("")}</tr>
            </thead>
            <tbody>
              ${section.rows.map((row) => `<tr>${headers.map((header) => `<td>${htmlEscape(formatReportValue(row[header]))}</td>`).join("")}</tr>`).join("")}
            </tbody>
          </table>`
        : `<div class="empty-state">No rows in this section.</div>`}
    </section>`;
  }).join("")}
</body>
</html>`;
}

async function refrigerantReportSections(report: RefrigerantReportKind, propertyIds: string[] | null) {
  const resolvePropertyLabels = async (ids: Array<string | null | undefined>) => {
    const uniqueIds = Array.from(new Set(ids.filter((value): value is string => typeof value === "string" && value.trim().length > 0)));
    if (!uniqueIds.length) return new Map<string, string>();
    const properties = await prisma.property.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, code: true, name: true },
    });
    return new Map(properties.map((property) => [property.id, propertyScopeLabel(property)]));
  };
  const tankRow = (tank: {
    identifier: string;
    category: string;
    status: string;
    tankSize: number;
    currentWeight: number;
    tareWeight: number | null;
    waterCapacity: number | null;
    finalRecoveryCompleted: boolean;
    notes: string | null;
    dispositionNotes?: string | null;
    archivedAt?: Date | null;
    refrigerantType: { name: string };
    }) => ({
    rowType: "CYLINDER",
    identifier: tank.identifier,
    type: tank.refrigerantType.name,
    category: tank.category,
    status: tank.status,
    tankSize: tank.tankSize,
    currentWeight: tank.currentWeight,
    safeCapacity: cylinderMetrics(tank).safeCapacity,
    fillPercent: cylinderMetrics(tank).fillPercent,
    remainingCapacity: cylinderMetrics(tank).remainingCapacity,
    tareWeight: tank.tareWeight,
    waterCapacity: tank.waterCapacity,
    finalRecoveryCompleted: tank.finalRecoveryCompleted,
    notes: tank.notes ?? "",
    dispositionNotes: tank.dispositionNotes ?? "",
    archivedAt: tank.archivedAt?.toISOString() ?? "",
  });
  const transactionRow = (entry: {
    occurredAt: Date;
    propertyId: string | null;
    transactionType: string;
    unitNumber: string | null;
    refrigerantType: { name: string };
    sourceCylinder: { identifier: string } | null;
    recoveryCylinder: { identifier: string } | null;
    startWeight: number;
    endWeight: number;
    amount: number;
    createdByName: string | null;
    notes: string | null;
  }, propertyLabels: Map<string, string>) => ({
    rowType: "TRANSACTION",
    date: entry.occurredAt.toISOString(),
    property: entry.propertyId ? (propertyLabels.get(entry.propertyId) ?? entry.propertyId) : "",
    transactionType: entry.transactionType,
    unitNumber: entry.unitNumber ?? "",
    refrigerantType: entry.refrigerantType.name,
    sourceCylinder: entry.sourceCylinder?.identifier ?? "",
    recoveryCylinder: entry.recoveryCylinder?.identifier ?? "",
    startWeight: entry.startWeight,
    endWeight: entry.endWeight,
    amount: entry.amount,
    user: entry.createdByName ?? "",
    notes: entry.notes ?? "",
  });
  const complianceRow = (issue: { severity: string; type: string; message: string }) => ({
    rowType: "COMPLIANCE_ISSUE",
    severity: issue.severity,
    type: issue.type,
    message: issue.message,
  });

  if (report === "cylinders") {
    const tanks = await prisma.refrigerantCylinder.findMany({
      include: { refrigerantType: true },
      orderBy: [{ status: "asc" }, { category: "asc" }, { identifier: "asc" }],
    });
    return [{ key: "cylinders", title: "Cylinder Inventory", rows: tanks.map(tankRow) }];
  }

  if (report === "compliance") {
    const result = await complianceIssues(propertyIds, true);
    return [
      { key: "issues", title: "Compliance Issues", rows: result.issues.map(complianceRow) },
      {
        key: "leak-flags",
        title: "Repeated Addition Flags",
        rows: result.leakFlags.map((flag) => ({
          rowType: "LEAK_FLAG",
          unitNumber: flag.unitNumber,
          refrigerantType: flag.refrigerantType?.name ?? "",
          status: flag.status,
          level: flag.level,
          reason: flag.reason,
          lastDetectedAt: flag.lastDetectedAt.toISOString(),
        })),
      },
    ];
  }

  if (report === "fullAudit") {
    const result = await complianceIssues(propertyIds, true, true);
    const legacyLogs = await prisma.refrigerantLog.findMany({
      where: { propertyId: propertyIds === null ? undefined : { in: propertyIds } },
      orderBy: { loggedAt: "desc" },
    });
    const propertyLabels = await resolvePropertyLabels([...result.transactions, ...legacyLogs, ...result.leakFlags].map((entry) => entry.propertyId));
    const scopeLabel = await refrigerantReportScopeLabel(propertyIds);
    const activeVirginCount = result.cylinders.filter((tank) => tank.category === "VIRGIN" && tank.status === "ACTIVE").length;
    const activeRecoveryCount = result.cylinders.filter((tank) => tank.category !== "VIRGIN" && tank.status === "ACTIVE").length;
    const chargeTransactions = result.transactions.filter((entry) => entry.transactionType === "VIRGIN_CHARGE");
    const recoveryTransactions = result.transactions.filter((entry) => entry.transactionType !== "VIRGIN_CHARGE");
    return [
      {
        key: "summary",
        title: "Audit Summary",
        rows: [{
          rowType: "SUMMARY",
          accessibleProperties: scopeLabel,
          inventoryScope: "Shared cylinder inventory across properties",
          totalCylinders: result.cylinders.length,
          activeVirginTanks: activeVirginCount,
          activeRecoveryTanks: activeRecoveryCount,
          totalTransactions: result.transactions.length,
          legacyRecords: legacyLogs.length,
          chargeTransactions: chargeTransactions.length,
          recoveryTransactions: recoveryTransactions.length,
          activeLeakFlags: result.leakFlags.filter((flag) => flag.status === "ACTIVE").length,
          totalLeakFlags: result.leakFlags.length,
          complianceIssues: result.issues.length,
        }],
      },
      { key: "cylinders", title: "Cylinder Inventory", rows: result.cylinders.map(tankRow) },
      { key: "transactions", title: "All Refrigerant Transactions", rows: result.transactions.map((entry) => transactionRow(entry, propertyLabels)) },
      {
        key: "legacy-logs",
        title: "Legacy Refrigerant Logs (Separate From Transaction Totals)",
        rows: legacyLogs.map((entry) => ({
          rowType: "LEGACY_LOG",
          property: propertyLabels.get(entry.propertyId) ?? entry.propertyId,
          unitNumber: entry.systemUnit,
          date: entry.loggedAt.toISOString(),
          refrigerantType: entry.refrigerantType,
          cylinderSerialNumber: entry.cylinderSerialNumber ?? "",
          startingWeight: entry.startingWeight,
          amountAdded: entry.amountAdded,
          amountRecovered: entry.amountRecovered,
          currentBalance: entry.currentBalance,
          user: entry.tech ?? "",
          notes: entry.notes ?? "",
        })),
      },
      {
        key: "unit-history",
        title: "Unit Transaction History",
        rows: result.transactions
          .filter((entry) => entry.unitNumber)
          .map((entry) => ({
            rowType: "UNIT_HISTORY",
            unitNumber: entry.unitNumber ?? "",
            property: entry.propertyId ? (propertyLabels.get(entry.propertyId) ?? entry.propertyId) : "",
            date: entry.occurredAt.toISOString(),
            transactionType: entry.transactionType,
            refrigerantType: entry.refrigerantType.name,
            amount: entry.amount,
            sourceCylinder: entry.sourceCylinder?.identifier ?? "",
            recoveryCylinder: entry.recoveryCylinder?.identifier ?? "",
            user: entry.createdByName ?? "",
            notes: entry.notes ?? "",
          })),
      },
      {
        key: "leak-flags",
        title: "Repeated Addition Flags",
        rows: result.leakFlags.map((flag) => ({
          rowType: "LEAK_FLAG",
          unitNumber: flag.unitNumber,
          property: flag.propertyId ? (propertyLabels.get(flag.propertyId) ?? flag.propertyId) : "",
          refrigerantType: flag.refrigerantType?.name ?? "",
          level: flag.level,
          status: flag.status,
          reason: flag.reason,
          lastDetectedAt: flag.lastDetectedAt.toISOString(),
          dismissedAt: flag.dismissedAt?.toISOString() ?? "",
          dismissalNotes: flag.dismissalNotes ?? "",
        })),
      },
      { key: "compliance", title: "Compliance Issues", rows: result.issues.map(complianceRow) },
    ];
  }

  const includeRecoveryInventory = report === "recovery";
  const txWhere = {
    propertyId: propertyIds === null ? undefined : { in: propertyIds },
    transactionType: report === "usage" ? "VIRGIN_CHARGE" : report === "recovery" ? { in: ["CLEAN_RECOVERY", "DIRTY_RECOVERY", "FINAL_RECOVERY"] } : undefined,
  };
  const [transactions, recoveryTanks] = await Promise.all([
    prisma.refrigerantTransaction.findMany({
      where: txWhere,
      include: { refrigerantType: true, sourceCylinder: true, recoveryCylinder: true },
      orderBy: { occurredAt: "desc" },
    }),
    includeRecoveryInventory
      ? prisma.refrigerantCylinder.findMany({
          where: { category: { in: ["CLEAN_RECOVERY", "DIRTY_RECOVERY"] } },
          include: { refrigerantType: true },
          orderBy: [{ category: "asc" }, { identifier: "asc" }],
        })
      : Promise.resolve([]),
  ]);

  if (report === "recovery") {
    const propertyLabels = await resolvePropertyLabels(transactions.map((entry) => entry.propertyId));
    return [
      { key: "recovery-tanks", title: "Recovery Tank Inventory", rows: recoveryTanks.map(tankRow) },
      { key: "recovery-transactions", title: "Recovery Transactions", rows: transactions.map((entry) => transactionRow(entry, propertyLabels)) },
    ];
  }

  if (report === "unitHistory") {
    const propertyLabels = await resolvePropertyLabels(transactions.map((entry) => entry.propertyId));
    return [{
      key: "unit-history",
      title: "Unit Refrigerant History",
      rows: transactions
        .filter((entry) => entry.unitNumber)
        .map((entry) => ({
          rowType: "UNIT_HISTORY",
          unitNumber: entry.unitNumber ?? "",
          property: entry.propertyId ? (propertyLabels.get(entry.propertyId) ?? entry.propertyId) : "",
          date: entry.occurredAt.toISOString(),
          transactionType: entry.transactionType,
          refrigerantType: entry.refrigerantType.name,
          amount: entry.amount,
          sourceCylinder: entry.sourceCylinder?.identifier ?? "",
          recoveryCylinder: entry.recoveryCylinder?.identifier ?? "",
          user: entry.createdByName ?? "",
          notes: entry.notes ?? "",
        })),
    }];
  }

  const propertyLabels = await resolvePropertyLabels(transactions.map((entry) => entry.propertyId));
  return [{ key: "usage", title: "Refrigerant Usage Transactions", rows: transactions.map((entry) => transactionRow(entry, propertyLabels)) }];
}

async function refrigerantExportRows(report: RefrigerantReportKind, propertyIds: string[] | null) {
  const sections = await refrigerantReportSections(report, propertyIds);
  return sections.flatMap((section) => section.rows.map((row) => ({ section: section.title, ...row })));
}

async function evaluateLeakFlag(input: {
  propertyId?: string | null;
  unitId?: string | null;
  unitNumber?: string | null;
  refrigerantTypeId: string;
}) {
  if (!input.unitNumber && !input.unitId) return null;
  const now = new Date();
  const since90 = new Date(now);
  since90.setDate(since90.getDate() - 90);
  const since365 = new Date(now);
  since365.setDate(since365.getDate() - 365);
  const baseWhere = {
    transactionType: "VIRGIN_CHARGE",
    refrigerantTypeId: input.refrigerantTypeId,
    propertyId: input.propertyId ?? undefined,
    OR: [
      input.unitId ? { unitId: input.unitId } : undefined,
      input.unitNumber ? { unitNumber: input.unitNumber } : undefined,
    ].filter(Boolean) as Array<{ unitId?: string; unitNumber?: string }>,
  };
  const [count90, count365] = await Promise.all([
    prisma.refrigerantTransaction.count({ where: { ...baseWhere, occurredAt: { gte: since90 } } }),
    prisma.refrigerantTransaction.count({ where: { ...baseWhere, occurredAt: { gte: since365 } } }),
  ]);
  const level = leakLevel(count90, count365);
  if (!level) return null;
  const reason = level === "MANAGER_REVIEW_REQUIRED"
    ? `${count365} refrigerant additions in 12 months. Manager review required.`
    : `${count90} refrigerant additions in 90 days. Potential refrigerant leak.`;
  const existing = await prisma.refrigerantLeakFlag.findFirst({
    where: {
      propertyId: input.propertyId ?? null,
      unitId: input.unitId ?? null,
      unitNumber: input.unitNumber ?? "",
      refrigerantTypeId: input.refrigerantTypeId,
      status: "ACTIVE",
    },
  });
  const flag = existing
    ? await prisma.refrigerantLeakFlag.update({ where: { id: existing.id }, data: { level, reason, lastDetectedAt: now } })
    : await prisma.refrigerantLeakFlag.create({
        data: {
          propertyId: input.propertyId ?? null,
          unitId: input.unitId ?? null,
          unitNumber: input.unitNumber ?? "",
          refrigerantTypeId: input.refrigerantTypeId,
          level,
          reason,
        },
      });
  const managers = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { role: "ADMIN" },
        input.propertyId ? { propertyAccess: { some: { propertyId: input.propertyId, role: "MANAGER" } } } : { role: "MANAGER" },
      ],
    },
    select: { id: true },
  });
  await Promise.all(managers.map((manager) => createNotification({
    userId: manager.id,
    propertyId: input.propertyId ?? null,
    category: "AUTOMATION_WARNING",
    title: "Refrigerant leak review",
    message: `${input.unitNumber ?? "Unit"}: ${reason}`,
    dedupeKey: `refrigerant-leak:${flag.id}:${manager.id}:${level}`,
  })));
  return flag;
}

async function complianceIssues(propertyIds: string[] | null, completeHistory = false, includeDismissedFlags = false) {
  const [cylinders, transactions, leakFlags] = await Promise.all([
    prisma.refrigerantCylinder.findMany({ include: { refrigerantType: true } }),
    prisma.refrigerantTransaction.findMany({
      where: { propertyId: propertyIds === null ? undefined : { in: propertyIds } },
      include: { refrigerantType: true, sourceCylinder: true, recoveryCylinder: true },
      orderBy: { occurredAt: "desc" },
      take: completeHistory ? undefined : 1000,
    }),
    prisma.refrigerantLeakFlag.findMany({
      where: { status: includeDismissedFlags ? undefined : "ACTIVE", propertyId: propertyIds === null ? undefined : { in: propertyIds } },
      include: { refrigerantType: true },
      orderBy: { lastDetectedAt: "desc" },
    }),
  ]);
  const issues = [
    ...cylinders
      .filter((tank) => tank.category === "VIRGIN" && tank.status === "EMPTY_PENDING_RECOVERY" && !tank.finalRecoveryCompleted)
      .map((tank) => ({ severity: "HIGH", type: "VIRGIN_EMPTY_NOT_RECOVERED", message: `${tank.identifier} is empty pending final recovery.`, cylinderId: tank.id })),
    ...cylinders
      .filter((tank) => tank.category === "VIRGIN" && tank.status === "ACTIVE" && cylinderMetrics(tank).remainingCapacity <= Math.max(5, tank.tankSize * 0.2))
      .map((tank) => ({
        severity: cylinderMetrics(tank).remainingCapacity <= 2 ? "HIGH" : "MEDIUM",
        type: "VIRGIN_TANK_LOW",
        message: `${tank.identifier} is low with ${cylinderMetrics(tank).remainingCapacity.toFixed(2)} lb remaining out of ${tank.tankSize.toFixed(2)} lb.`,
        cylinderId: tank.id,
      })),
    ...cylinders
      .filter((tank) => tank.category !== "VIRGIN" && tank.status !== "ARCHIVED" && cylinderMetrics(tank).fillPercent >= 80)
      .map((tank) => ({
        severity: cylinderMetrics(tank).fillPercent >= 95 ? "CRITICAL" : cylinderMetrics(tank).fillPercent >= 90 ? "HIGH" : "MEDIUM",
        type: "RECOVERY_TANK_CAPACITY",
        message: `${tank.identifier} is ${cylinderMetrics(tank).fillPercent}% of its allowed recovery fill (${cylinderMetrics(tank).safeCapacity.toFixed(2)} lb max).`,
        cylinderId: tank.id,
      })),
    ...cylinders
      .filter((tank) => tank.category === "VIRGIN" && tank.status === "ARCHIVED" && !tank.finalRecoveryCompleted)
      .map((tank) => ({ severity: "CRITICAL", type: "ARCHIVED_WITHOUT_FINAL_RECOVERY", message: `${tank.identifier} is archived without final recovery.`, cylinderId: tank.id })),
    ...transactions
      .filter((entry) => !Number.isFinite(entry.startWeight) || !Number.isFinite(entry.endWeight) || entry.amount < 0)
      .map((entry) => ({ severity: "HIGH", type: "WEIGHT_ERROR", message: `${entry.transactionType} on ${entry.unitNumber ?? "unknown unit"} has invalid weights.`, transactionId: entry.id })),
    ...leakFlags.filter((flag) => flag.status === "ACTIVE").map((flag) => ({ severity: flag.level === "MANAGER_REVIEW_REQUIRED" ? "HIGH" : "MEDIUM", type: "REPEATED_ADDITIONS", message: `${flag.unitNumber}: ${flag.reason}`, leakFlagId: flag.id })),
  ];
  return { issues, cylinders, transactions, leakFlags };
}

export async function refrigerantRoutes(app: FastifyInstance) {
  app.get("/refrigerant/overview", async (request, reply) => {
    if (!requireRefrigerantAccess(request, reply, "view")) return;
    const propertyIds = scopedAllowedPropertyIds(request);
    const [{ issues, leakFlags }, types, cylinders, recent] = await Promise.all([
      complianceIssues(propertyIds),
      prisma.refrigerantType.findMany({ orderBy: { name: "asc" } }),
      prisma.refrigerantCylinder.findMany({ include: { refrigerantType: true }, orderBy: [{ category: "asc" }, { identifier: "asc" }] }),
      prisma.refrigerantTransaction.findMany({
        where: { propertyId: propertyIds === null ? undefined : { in: propertyIds } },
        include: { refrigerantType: true, sourceCylinder: true, recoveryCylinder: true },
        orderBy: { occurredAt: "desc" },
        take: 12,
      }),
    ]);
    const activeVirginByType = cylinders
      .filter((tank) => tank.category === "VIRGIN" && tank.status === "ACTIVE")
      .reduce<Record<string, number>>((acc, tank) => {
        acc[tank.refrigerantType.name] = (acc[tank.refrigerantType.name] ?? 0) + 1;
        return acc;
      }, {});
    const recoveryNearCapacity = cylinders
      .filter((tank) => tank.category !== "VIRGIN" && tank.status !== "ARCHIVED" && cylinderMetrics(tank).fillPercent >= 80)
      .map((tank) => ({ ...tank, ...cylinderMetrics(tank) }));
    return {
      permissions: accessFor(request.currentUser!.role),
      types,
      summary: {
        activeVirginByType,
        recoveryNearCapacity: recoveryNearCapacity.length,
        repeatedAdditionFlags: leakFlags.length,
        complianceIssues: issues.length,
        recentActivity: recent.length,
      },
      recoveryNearCapacity,
      leakFlags,
      complianceIssues: issues.slice(0, 20),
      recent,
    };
  });

  app.get("/refrigerant/types", async (request, reply) => {
    if (!requireRefrigerantAccess(request, reply, "view")) return;
    return { types: await prisma.refrigerantType.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }] }) };
  });

  app.post("/refrigerant/types", async (request, reply) => {
    if (!requireRefrigerantAccess(request, reply, "admin")) return;
    const input = refrigerantTypeSchema.parse(request.body);
    const type = await prisma.refrigerantType.create({ data: { name: input.name, notes: input.notes ?? null, createdById: request.currentUser!.id, updatedById: request.currentUser!.id } });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, entityType: "REFRIGERANT_TYPE", entityId: type.id, action: "REFRIGERANT_TYPE_CREATED", message: `Created refrigerant type ${type.name}` });
    reply.code(201);
    return { type };
  });

  app.patch("/refrigerant/types/:id", async (request, reply) => {
    if (!requireRefrigerantAccess(request, reply, "admin")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = refrigerantTypeSchema.partial().parse(request.body);
    const type = await prisma.refrigerantType.update({ where: { id }, data: { name: input.name, notes: input.notes, isActive: input.isActive, updatedById: request.currentUser!.id } });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, entityType: "REFRIGERANT_TYPE", entityId: type.id, action: "REFRIGERANT_TYPE_UPDATED", message: `Updated refrigerant type ${type.name}` });
    return { type };
  });

  app.delete("/refrigerant/types/:id", async (request, reply) => {
    if (!requireRefrigerantAccess(request, reply, "admin")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.refrigerantType.findUnique({
      where: { id },
      include: {
        cylinders: { select: { id: true }, take: 1 },
        transactions: { select: { id: true }, take: 1 },
        leakFlags: { select: { id: true }, take: 1 },
      },
    });
    if (!existing) return reply.code(404).send({ message: "Refrigerant type not found" });
    if (existing.isActive) {
      return reply.code(409).send({ message: "Deactivate the refrigerant type before permanently deleting it" });
    }
    if (existing.cylinders.length || existing.transactions.length || existing.leakFlags.length) {
      return reply.code(409).send({ message: "Cannot permanently delete a refrigerant type that is already referenced by cylinders, history, or leak flags" });
    }
    await prisma.refrigerantType.delete({ where: { id } });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, entityType: "REFRIGERANT_TYPE", entityId: existing.id, action: "REFRIGERANT_TYPE_DELETED", message: `Deleted refrigerant type ${existing.name}` });
    return { ok: true };
  });

  app.get("/refrigerant/cylinders", async (request, reply) => {
    if (!requireRefrigerantAccess(request, reply, "view")) return;
    const query = z.object({
      category: z.enum(cylinderCategories).optional(),
      status: z.enum(cylinderStatuses).optional(),
      includeArchived: z.enum(["true", "false"]).optional().transform((value) => value === "true"),
    }).parse(request.query);
    const cylinders = await prisma.refrigerantCylinder.findMany({
      where: {
        category: query.category,
        status: query.status ?? (query.includeArchived ? undefined : { not: "ARCHIVED" }),
      },
      include: { refrigerantType: true },
      orderBy: [{ category: "asc" }, { status: "asc" }, { identifier: "asc" }],
    });
    return { cylinders: cylinders.map((tank) => ({ ...tank, ...cylinderMetrics(tank) })) };
  });

  app.post("/refrigerant/cylinders", async (request, reply) => {
    if (!requireRefrigerantAccess(request, reply, "edit")) return;
    const input = refrigerantCylinderSchema.parse(request.body);
    if (input.category === "VIRGIN" && input.status === "ACTIVE" && input.overrideActiveVirgin && request.currentUser!.role !== "ADMIN" && request.currentUser!.role !== "MANAGER") {
      return reply.code(403).send({ message: "Only managers and admins can override the one-active-virgin-tank rule." });
    }
    if (input.category === "VIRGIN" && input.status === "ACTIVE" && !input.overrideActiveVirgin) {
      const existing = await prisma.refrigerantCylinder.findFirst({ where: { refrigerantTypeId: input.refrigerantTypeId, category: "VIRGIN", status: "ACTIVE" } });
      if (existing) return reply.code(409).send({ message: "An active virgin tank already exists for this refrigerant type. Manager/admin can override by confirming overrideActiveVirgin." });
    }
    const cylinder = await prisma.refrigerantCylinder.create({
      data: {
        identifier: input.identifier,
        refrigerantTypeId: input.refrigerantTypeId,
        category: input.category,
        tankSize: input.tankSize,
        currentWeight: input.currentWeight,
        tareWeight: inferredVirginTareWeight(input),
        waterCapacity: input.waterCapacity ?? null,
        status: input.status,
        notes: input.notes ?? null,
        dispositionNotes: input.dispositionNotes ?? null,
        createdById: request.currentUser!.id,
        updatedById: request.currentUser!.id,
      },
      include: { refrigerantType: true },
    });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, entityType: "REFRIGERANT_CYLINDER", entityId: cylinder.id, action: "REFRIGERANT_CYLINDER_CREATED", message: `Created ${cylinder.category.toLowerCase().replace("_", " ")} cylinder ${cylinder.identifier}` });
    reply.code(201);
    return { cylinder: { ...cylinder, ...cylinderMetrics(cylinder) } };
  });

  app.patch("/refrigerant/cylinders/:id", async (request, reply) => {
    if (!requireRefrigerantAccess(request, reply, "edit")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = refrigerantCylinderPatchSchema.parse(request.body);
    const existing = await prisma.refrigerantCylinder.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ message: "Cylinder not found" });
    if (input.status === "ARCHIVED" && existing.category === "VIRGIN" && !existing.finalRecoveryCompleted && !input.finalRecoveryCompleted) {
      return reply.code(400).send({ message: "Virgin tank cannot be archived until final recovery is completed." });
    }
    const archivedAt = input.status === "ARCHIVED" && existing.status !== "ARCHIVED" ? new Date() : input.status && input.status !== "ARCHIVED" ? null : undefined;
    const nextCategory = input.category ?? existing.category;
    const nextTankSize = input.tankSize ?? existing.tankSize;
    const nextCurrentWeight = input.currentWeight ?? existing.currentWeight;
    const cylinder = await prisma.refrigerantCylinder.update({
      where: { id },
      data: {
        identifier: input.identifier,
        refrigerantTypeId: input.refrigerantTypeId,
        category: input.category,
        tankSize: input.tankSize,
        currentWeight: input.currentWeight,
        tareWeight: input.tareWeight !== undefined
          ? inferredVirginTareWeight({
            category: nextCategory,
            tankSize: nextTankSize,
            currentWeight: nextCurrentWeight,
            tareWeight: input.tareWeight,
          })
          : existing.tareWeight ?? inferredVirginTareWeight({
            category: nextCategory,
            tankSize: nextTankSize,
            currentWeight: nextCurrentWeight,
            tareWeight: null,
          }),
        waterCapacity: input.waterCapacity,
        status: input.status,
        notes: input.notes,
        dispositionNotes: input.dispositionNotes,
        finalRecoveryCompleted: input.finalRecoveryCompleted,
        archivedAt,
        updatedById: request.currentUser!.id,
      },
      include: { refrigerantType: true },
    });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, entityType: "REFRIGERANT_CYLINDER", entityId: cylinder.id, action: "REFRIGERANT_CYLINDER_UPDATED", message: `Updated cylinder ${cylinder.identifier}` });
    return { cylinder: { ...cylinder, ...cylinderMetrics(cylinder) } };
  });

  app.delete("/refrigerant/cylinders/:id", async (request, reply) => {
    if (!requireRefrigerantAccess(request, reply, "edit")) return;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.refrigerantCylinder.findUnique({
      where: { id },
      include: {
        sourceTransactions: { select: { id: true }, take: 1 },
        recoveryTransactions: { select: { id: true }, take: 1 },
      },
    });
    if (!existing) return reply.code(404).send({ message: "Cylinder not found" });
    if (existing.status !== "ARCHIVED") {
      return reply.code(409).send({ message: "Archive the cylinder before permanently deleting it" });
    }
    if (existing.sourceTransactions.length || existing.recoveryTransactions.length) {
      return reply.code(409).send({ message: "Cannot permanently delete a cylinder that is already referenced by refrigerant history" });
    }
    await prisma.refrigerantCylinder.delete({ where: { id } });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, entityType: "REFRIGERANT_CYLINDER", entityId: existing.id, action: "REFRIGERANT_CYLINDER_DELETED", message: `Deleted cylinder ${existing.identifier}` });
    return { ok: true };
  });

  async function createTransaction(request: FastifyRequest, reply: FastifyReply, transactionType: (typeof transactionTypes)[number]) {
    if (!requireRefrigerantAccess(request, reply, "edit")) return;
    const input = refrigerantTransactionSchema.parse(request.body);
    if (!(await assertPropertyScope(request, reply, input.propertyId))) return;
    if (input.unitId) {
      const unit = await prisma.unit.findUnique({ where: { id: input.unitId }, select: { propertyId: true, number: true } });
      if (!unit) return reply.code(404).send({ message: "Unit not found." });
      if (!(await assertPropertyScope(request, reply, unit.propertyId))) return;
      if (input.propertyId && input.propertyId !== unit.propertyId) {
        return reply.code(400).send({ message: "Selected unit does not belong to the selected property." });
      }
      input.propertyId = unit.propertyId;
      input.unitNumber = unit.number;
    }
    if (input.propertyId && !(await prisma.property.findUnique({ where: { id: input.propertyId }, select: { id: true } }))) {
      return reply.code(404).send({ message: "Property not found." });
    }
    const isRecovery = transactionType === "CLEAN_RECOVERY" || transactionType === "DIRTY_RECOVERY";
    if (isRecovery && input.sourceCylinderId) {
      return reply.code(400).send({ message: "Recovery readings must identify only the receiving recovery tank." });
    }
    if (transactionType === "VIRGIN_CHARGE" && input.recoveryCylinderId) {
      return reply.code(400).send({ message: "Charge readings must identify only the source tank." });
    }
    if (input.sourceCylinderId && input.sourceCylinderId === input.recoveryCylinderId) {
      return reply.code(400).send({ message: "Source and recovery tanks must be different." });
    }
    const amount = weightAmount(transactionType, input.startWeight, input.endWeight);
    if (amount < 0) {
      return reply.code(400).send({ message: isRecovery ? "Recovery end weight must be greater than or equal to start weight." : "Charge/final recovery end weight must be less than or equal to start weight." });
    }
    if ((transactionType === "VIRGIN_CHARGE" || transactionType === "FINAL_RECOVERY") && !input.sourceCylinderId) {
      return reply.code(400).send({ message: transactionType === "VIRGIN_CHARGE" ? "Select a source tank." : "Select a source virgin tank." });
    }
    if ((transactionType === "CLEAN_RECOVERY" || transactionType === "DIRTY_RECOVERY" || transactionType === "FINAL_RECOVERY") && !input.recoveryCylinderId) {
      return reply.code(400).send({ message: "Select a recovery tank." });
    }
    if (input.sourceCylinderId) {
      const source = await prisma.refrigerantCylinder.findUnique({ where: { id: input.sourceCylinderId } });
      if (!source) {
        return reply.code(404).send({ message: "Source tank not found." });
      }
      if (transactionType === "VIRGIN_CHARGE") {
        if (source.status !== "ACTIVE") {
          return reply.code(400).send({ message: "Source tank must be active." });
        }
        if (source.category !== "VIRGIN" && source.category !== "CLEAN_RECOVERY") {
          return reply.code(400).send({ message: "Only virgin or clean recovery tanks can be used as charge sources." });
        }
        if (source.refrigerantTypeId !== input.refrigerantTypeId) {
          return reply.code(400).send({ message: "Source tank refrigerant type must match the selected charge type." });
        }
      }
      if (transactionType === "FINAL_RECOVERY" && source.category !== "VIRGIN") {
        return reply.code(400).send({ message: "Final recovery source must be a virgin tank." });
      }
      if (transactionType === "FINAL_RECOVERY" && (source.status === "ARCHIVED" || source.finalRecoveryCompleted)) {
        return reply.code(400).send({ message: "This tank is archived or its final recovery has already been recorded." });
      }
      if (transactionType === "FINAL_RECOVERY" && source.refrigerantTypeId !== input.refrigerantTypeId) {
        return reply.code(400).send({ message: "Source tank refrigerant type must match the final recovery type." });
      }
    }
    if (input.recoveryCylinderId && (transactionType === "CLEAN_RECOVERY" || transactionType === "DIRTY_RECOVERY" || transactionType === "FINAL_RECOVERY")) {
      const recovery = await prisma.refrigerantCylinder.findUnique({ where: { id: input.recoveryCylinderId } });
      if (!recovery) {
        return reply.code(404).send({ message: "Recovery tank not found." });
      }
      if (recovery.status !== "ACTIVE" || !["CLEAN_RECOVERY", "DIRTY_RECOVERY"].includes(recovery.category)) {
        return reply.code(400).send({ message: "Select an active recovery tank, not a virgin or archived tank." });
      }
      if (isRecovery && recovery.category !== transactionType) {
        return reply.code(400).send({ message: "Recovery tank category must match clean or dirty recovery." });
      }
      if (recovery.category === "CLEAN_RECOVERY" && recovery.refrigerantTypeId !== input.refrigerantTypeId) {
        return reply.code(400).send({ message: "Clean recovery tank refrigerant type must match the selected type." });
      }
      const projectedWeight = transactionType === "FINAL_RECOVERY"
        ? recovery.currentWeight + amount
        : input.endWeight;
      const safeCapacity = safeCapacityWeight(recovery);
      const projectedLoad = recovery.category === "VIRGIN"
        ? projectedWeight
        : cylinderContentsWeight({ currentWeight: projectedWeight, tareWeight: recovery.tareWeight });
      if (projectedLoad > safeCapacity) {
        return reply.code(400).send({ message: `Recovery tank would exceed the 80% usable fill limit (${safeCapacity.toFixed(2)} lb max).` });
      }
    }
    const transaction = await prisma.$transaction(async (tx) => {
      if (input.sourceCylinderId) {
        await tx.refrigerantCylinder.update({
          where: { id: input.sourceCylinderId },
          data: transactionType === "FINAL_RECOVERY"
            ? { currentWeight: input.endWeight, status: "EMPTY_PENDING_RECOVERY", finalRecoveryCompleted: true }
            : { currentWeight: input.endWeight },
        });
      }
      if (input.recoveryCylinderId && (transactionType === "CLEAN_RECOVERY" || transactionType === "DIRTY_RECOVERY")) {
        await tx.refrigerantCylinder.update({ where: { id: input.recoveryCylinderId }, data: { currentWeight: input.endWeight } });
      }
      if (input.recoveryCylinderId && transactionType === "FINAL_RECOVERY") {
        const recovery = await tx.refrigerantCylinder.findUnique({ where: { id: input.recoveryCylinderId } });
        if (recovery) await tx.refrigerantCylinder.update({ where: { id: input.recoveryCylinderId }, data: { currentWeight: recovery.currentWeight + amount } });
      }
      return tx.refrigerantTransaction.create({
        data: {
          transactionType,
          propertyId: input.propertyId ?? null,
          unitId: input.unitId ?? null,
          unitNumber: input.unitNumber ?? null,
          refrigerantTypeId: input.refrigerantTypeId,
          sourceCylinderId: input.sourceCylinderId ?? null,
          recoveryCylinderId: input.recoveryCylinderId ?? null,
          occurredAt: input.occurredAt ?? new Date(),
          startWeight: input.startWeight,
          endWeight: input.endWeight,
          amount,
          notes: input.notes ?? null,
          createdById: request.currentUser!.id,
          createdByName: request.currentUser!.fullName,
        },
        include: { refrigerantType: true, sourceCylinder: true, recoveryCylinder: true },
      });
    });
    if (transactionType === "VIRGIN_CHARGE") {
      await evaluateLeakFlag({ propertyId: input.propertyId, unitId: input.unitId, unitNumber: input.unitNumber, refrigerantTypeId: input.refrigerantTypeId });
    }
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, propertyId: input.propertyId ?? null, entityType: "REFRIGERANT_TRANSACTION", entityId: transaction.id, action: `REFRIGERANT_${transactionType}`, message: `Logged ${amount.toFixed(2)} lb ${transaction.refrigerantType.name} ${transactionType.toLowerCase().replace(/_/g, " ")}` });
    reply.code(201);
    return { transaction };
  }

  app.post("/refrigerant/transactions/charge", async (request, reply) => createTransaction(request, reply, "VIRGIN_CHARGE"));
  app.post("/refrigerant/transactions/recovery", async (request, reply) => {
    const body = refrigerantTransactionSchema.extend({ recoveryType: z.enum(["CLEAN", "DIRTY"]).default("CLEAN") }).parse(request.body);
    request.body = body satisfies z.infer<typeof refrigerantTransactionSchema>;
    return createTransaction(request, reply, body.recoveryType === "DIRTY" ? "DIRTY_RECOVERY" : "CLEAN_RECOVERY");
  });
  app.post("/refrigerant/transactions/final-recovery", async (request, reply) => createTransaction(request, reply, "FINAL_RECOVERY"));

  app.get("/refrigerant/history", async (request, reply) => {
    if (!requireRefrigerantAccess(request, reply, "view")) return;
    const query = refrigerantHistoryQuerySchema.parse(request.query);
    const scope = scopedPropertyWhere(request, query.propertyId);
    if (scope.denied) return reply.code(403).send({ message: "Property access denied" });
    const where = {
      propertyId: scope.where,
      unitId: query.unitId,
      unitNumber: query.unitNumber ? { equals: query.unitNumber, mode: "insensitive" as const } : undefined,
      refrigerantTypeId: query.refrigerantTypeId,
      transactionType: query.transactionType,
      occurredAt: query.from || query.to ? { gte: query.from, lte: query.to } : undefined,
    };
    const [total, transactions] = await Promise.all([
      prisma.refrigerantTransaction.count({ where }),
      prisma.refrigerantTransaction.findMany({
        where,
        include: { refrigerantType: true, sourceCylinder: true, recoveryCylinder: true },
        orderBy: { occurredAt: "desc" },
        take: query.limit,
        skip: query.offset,
      }),
    ]);
    return { transactions, pagination: { total, limit: query.limit, offset: query.offset, hasMore: query.offset + transactions.length < total } };
  });

  app.get("/refrigerant/compliance", async (request, reply) => {
    if (!requireRefrigerantAccess(request, reply, "view")) return;
    const propertyIds = scopedAllowedPropertyIds(request);
    const result = await complianceIssues(propertyIds);
    return { issues: result.issues, leakFlags: result.leakFlags };
  });

  app.post("/refrigerant/leak-flags/:id/dismiss", async (request, reply) => {
    if (!requireRefrigerantAccess(request, reply, "edit")) return;
    if (request.currentUser!.role !== "ADMIN" && request.currentUser!.role !== "MANAGER") return reply.code(403).send({ message: "Manager or admin access required" });
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = refrigerantLeakFlagDismissSchema.parse(request.body);
    const flag = await prisma.refrigerantLeakFlag.findUnique({ where: { id } });
    if (!flag) return reply.code(404).send({ message: "Leak flag not found" });
    if (!(await assertPropertyScope(request, reply, flag.propertyId))) return;
    const updated = await prisma.refrigerantLeakFlag.update({ where: { id }, data: { status: "DISMISSED", dismissedAt: new Date(), dismissedById: request.currentUser!.id, dismissalNotes: body.notes } });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, propertyId: updated.propertyId, entityType: "REFRIGERANT_LEAK_FLAG", entityId: id, action: "REFRIGERANT_LEAK_FLAG_DISMISSED", message: `Dismissed refrigerant leak flag for ${updated.unitNumber}`, metadata: { notes: body.notes } });
    return { flag: updated };
  });

  app.get("/refrigerant/export.csv", async (request, reply) => {
    if (!requireRefrigerantAccess(request, reply, "view")) return;
    const query = z.object({
      report: z.enum(["usage", "recovery", "cylinders", "compliance", "unitHistory", "fullAudit"]).default("usage"),
      propertyId: z.string().optional(),
    }).parse(request.query);
    const scope = scopedPropertyWhere(request, query.propertyId);
    if (scope.denied) return reply.code(403).send({ message: "Property access denied" });
    const propertyIds = query.propertyId ? [query.propertyId] : scopedAllowedPropertyIds(request);
    const scopeLabel = await refrigerantReportScopeLabel(propertyIds);
    const rows = await refrigerantExportRows(query.report, propertyIds);
    const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
    const csv = stringify(rows, { header: true, columns, escape_formulas: true });
    reply.header("content-type", "text/csv; charset=utf-8");
    reply.header("content-disposition", `attachment; filename="${sanitizeFilename(`makereadyos-${scopeLabel}-refrigerant-${query.report}.csv`)}"`);
    return csv;
  });

  app.get("/refrigerant/export.xls", async (request, reply) => {
    if (!requireRefrigerantAccess(request, reply, "view")) return;
    const query = z.object({
      report: z.enum(["usage", "recovery", "cylinders", "compliance", "unitHistory", "fullAudit"]).default("usage"),
      propertyId: z.string().optional(),
    }).parse(request.query);
    const scope = scopedPropertyWhere(request, query.propertyId);
    if (scope.denied) return reply.code(403).send({ message: "Property access denied" });
    const propertyIds = query.propertyId ? [query.propertyId] : scopedAllowedPropertyIds(request);
    const scopeLabel = await refrigerantReportScopeLabel(propertyIds);
    const rows = await refrigerantExportRows(query.report, propertyIds);
    const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
    const lines = stringify(rows, { header: true, columns: headers, delimiter: "\t", escape_formulas: true });
    reply.header("content-type", "application/vnd.ms-excel; charset=utf-8");
    reply.header("content-disposition", `attachment; filename="${sanitizeFilename(`makereadyos-${scopeLabel}-refrigerant-${query.report}.xls`)}"`);
    return lines;
  });

  app.get("/refrigerant/report.html", async (request, reply) => {
    if (!requireRefrigerantAccess(request, reply, "view")) return;
    const query = z.object({
      report: z.enum(["usage", "recovery", "cylinders", "compliance", "unitHistory", "fullAudit"]).default("usage"),
      propertyId: z.string().optional(),
    }).parse(request.query);
    const scope = scopedPropertyWhere(request, query.propertyId);
    if (scope.denied) return reply.code(403).send({ message: "Property access denied" });
    const propertyIds = query.propertyId ? [query.propertyId] : scopedAllowedPropertyIds(request);
    const sections = await refrigerantReportSections(query.report, propertyIds);
    const scopeLabel = await refrigerantReportScopeLabel(propertyIds);
    const rowCount = sections.reduce((sum, section) => sum + section.rows.length, 0);
    const html = buildReportDocument(query.report, sections, rowCount, scopeLabel);
    reply.header("content-type", "text/html; charset=utf-8");
    return reply.send(html);
  });

  app.get("/refrigerant/report.pdf", async (request, reply) => {
    if (!requireRefrigerantAccess(request, reply, "view")) return;
    const query = z.object({
      report: z.enum(["usage", "recovery", "cylinders", "compliance", "unitHistory", "fullAudit"]).default("usage"),
      propertyId: z.string().optional(),
    }).parse(request.query);
    const scope = scopedPropertyWhere(request, query.propertyId);
    if (scope.denied) return reply.code(403).send({ message: "Property access denied" });
    const propertyIds = query.propertyId ? [query.propertyId] : scopedAllowedPropertyIds(request);
    const sections = await refrigerantReportSections(query.report, propertyIds);
    const scopeLabel = await refrigerantReportScopeLabel(propertyIds);
    const rowCount = sections.reduce((sum, section) => sum + section.rows.length, 0);
    const html = buildReportDocument(query.report, sections, rowCount, scopeLabel);
    const pdf = await renderPdfFromHtml(html);
    reply.header("content-type", "application/pdf");
    reply.header("content-disposition", `inline; filename="${sanitizeFilename(`makereadyos-${scopeLabel}-refrigerant-${query.report}.pdf`)}"`);
    return reply.send(pdf);
  });
}
