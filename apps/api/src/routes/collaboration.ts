import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { basename, extname } from "node:path";
import { pipeline } from "node:stream/promises";
import { Prisma, UserRole } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import yazl from "yazl";
import { z } from "zod";
import { allowedPropertyIds, canCompleteChecklist, canWriteOperations, requireManagerOrAdmin } from "../lib/auth.js";
import { writeAuditLog } from "../lib/audit.js";
import { notifyAssignedStaff } from "../lib/notifications.js";
import { renderPdfFromHtml } from "../lib/pdf.js";
import { prisma } from "../lib/prisma.js";
import { ensureStoredUploadParent, removeStoredUpload, resolveStoredUploadPath, routedStoredName } from "../lib/uploadStorage.js";
import { queueWebhookEvent } from "../lib/webhookQueue.js";

const maxUploadMb = Number(process.env.MAX_UPLOAD_MB ?? 0);
const maxUploadBytes = maxUploadMb > 0 ? maxUploadMb * 1024 * 1024 : null;
export const collaborationQuerySchema = z.object({
  commentLimit: z.coerce.number().int().min(1).max(100).default(50),
  attachmentLimit: z.coerce.number().int().min(1).max(100).default(50),
  checklistLimit: z.coerce.number().int().min(1).max(100).default(30),
});
const allowedAttachmentExtensions = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".heic", ".heif", ".bmp", ".tif", ".tiff", ".pdf", ".txt", ".csv", ".doc", ".docx", ".xls", ".xlsx"]);
const allowedAttachmentTypes = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/avif", "image/heic", "image/heif", "image/bmp", "image/tiff",
  "application/pdf", "text/plain", "text/csv",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
export const itemCommentInputSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  category: z.string().trim().max(40).optional().default("UPDATE"),
});
export const attachmentPatchSchema = z.object({
  note: z.string().trim().max(1000).nullable().optional(),
  inspectionStage: z.enum(["GENERAL", "NTV", "VACATED", "INITIAL_WALK", "SCOPE", "TRASH_OUT", "CLEANING", "PAINT", "FLOORING", "DAMAGE", "FINAL_WALK", "MOVE_IN_READY"]).optional(),
  category: z.string().trim().max(80).nullable().optional(),
  chargeCandidate: z.boolean().optional(),
  chargeNote: z.string().trim().max(1000).nullable().optional(),
  chargePriceSheetItemId: z.string().nullable().optional(),
  chargeQuantity: z.number().min(0).max(10000).nullable().optional(),
  chargeEstimatedCents: z.number().int().min(0).max(100000000).nullable().optional(),
  markupAnnotations: z.array(z.object({
    id: z.string().trim().min(1).max(80),
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
    label: z.string().trim().min(1).max(120),
    note: z.string().trim().max(500).nullable().optional(),
    category: z.string().trim().max(80).nullable().optional(),
    chargeCandidate: z.boolean().optional().default(false),
    chargePriceSheetItemId: z.string().nullable().optional(),
    chargePriceSheetItemName: z.string().trim().max(160).nullable().optional(),
    chargeQuantity: z.number().min(0).max(10000).nullable().optional(),
    chargeEstimatedCents: z.number().int().min(0).max(100000000).nullable().optional(),
  })).max(100).nullable().optional(),
});
export const attachmentArchiveQuerySchema = z.object({
  stage: z.enum(["ALL", "GENERAL", "NTV", "VACATED", "INITIAL_WALK", "SCOPE", "TRASH_OUT", "CLEANING", "PAINT", "FLOORING", "DAMAGE", "FINAL_WALK", "MOVE_IN_READY", "CHARGE_CANDIDATES"]).optional().default("ALL"),
  category: z.string().trim().max(80).optional(),
});
export const chargePriceSheetQuerySchema = z.object({
  propertyId: z.string().optional(),
  includeArchived: z.coerce.boolean().optional().default(false),
});
export const chargePriceSheetCreateSchema = z.object({
  propertyId: z.string(),
  name: z.string().trim().min(1).max(160),
  category: z.string().trim().max(80).nullable().optional(),
  unitLabel: z.string().trim().max(40).nullable().optional(),
  defaultCents: z.number().int().min(0).max(100000000).nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
});
export const chargePriceSheetPatchSchema = chargePriceSheetCreateSchema.omit({ propertyId: true }).partial().extend({
  isActive: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
});
export const chargePriceSheetImportSchema = z.object({
  propertyId: z.string(),
  content: z.string().trim().min(1).max(200000),
  overwriteExisting: z.boolean().optional().default(true),
});
const chargeReportExportQuerySchema = z.object({
  groupBy: z.enum(["category"]).optional(),
});
export const checklistTemplateInputSchema = z.object({
  propertyId: z.string().nullable().optional(),
  name: z.string().trim().min(2).max(120),
  scope: z.string().trim().max(80).nullable().optional(),
  items: z.array(z.object({
    title: z.string().trim().min(1).max(240),
    notes: z.string().trim().max(1000).nullable().optional(),
    required: z.boolean().optional().default(true),
    dueOffsetDays: z.number().int().min(-365).max(365).nullable().optional(),
    tradeCategory: z.string().trim().max(80).nullable().optional(),
  })).min(1).max(100),
});
const workSessionSourceTypeSchema = z.enum([
  "MAKE_READY_ITEM",
  "PROJECT_RECORD",
  "PEST_ISSUE",
  "LEASE_COMPLIANCE_ISSUE",
  "PREVENTIVE_MAINTENANCE_TASK",
]);
const workSessionStartSchema = z.object({
  sourceType: workSessionSourceTypeSchema,
  sourceId: z.string().trim().min(1),
  note: z.string().trim().max(1000).nullable().optional(),
});
const workSessionEndSchema = z.object({
  note: z.string().trim().max(1000).nullable().optional(),
});
const assignedWorkQuerySchema = z.object({
  propertyId: z.string().trim().min(1).optional(),
  userId: z.string().trim().min(1).optional(),
});

async function getScopedItem(request: FastifyRequest, reply: FastifyReply, id: string) {
  const item = await prisma.makeReadyItem.findUnique({
    where: { id },
    include: { property: true },
  });
  if (!item) {
    reply.code(404).send({ message: "Make-ready item not found" });
    return null;
  }
  const scopedProperties = allowedPropertyIds(request.currentUser!);
  if (scopedProperties && !scopedProperties.includes(item.propertyId)) {
    reply.code(403).send({ message: "Property access required" });
    return null;
  }
  return item;
}

function sanitizeFilename(filename: string) {
  return basename(filename).replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 180) || "attachment";
}

function zipSafePath(...parts: string[]) {
  return parts
    .map((part) => sanitizeFilename(part).replace(/^\.+$/, "_"))
    .filter(Boolean)
    .join("/");
}

function uniqueZipPath(path: string, used: Set<string>) {
  if (!used.has(path)) {
    used.add(path);
    return path;
  }
  const extension = extname(path);
  const base = extension ? path.slice(0, -extension.length) : path;
  let index = 2;
  while (used.has(`${base}-${index}${extension}`)) index += 1;
  const next = `${base}-${index}${extension}`;
  used.add(next);
  return next;
}

function durationMinutesBetween(startedAt: Date, endedAt: Date) {
  return Math.max(1, Math.round((endedAt.getTime() - startedAt.getTime()) / 60000));
}

function annotationEstimate(annotation: { chargeEstimatedCents?: number | null; chargeQuantity?: number | null }) {
  return annotation.chargeEstimatedCents ?? 0;
}

async function buildChargeReport(request: FastifyRequest, reply: FastifyReply, id: string) {
  const item = await getScopedItem(request, reply, id);
  if (!item) return null;
  const attachments = await prisma.itemAttachment.findMany({
    where: { itemId: id, commentId: null },
    include: { chargePriceSheetItem: true },
    orderBy: { createdAt: "asc" },
  });
  const fileLines = attachments
    .filter((attachment) => attachment.chargeCandidate)
    .map((attachment) => ({
      type: "FILE" as const,
      attachmentId: attachment.id,
      attachmentName: attachment.originalName,
      pinId: null,
      label: attachment.category || attachment.originalName,
      category: attachment.category,
      inspectionStage: attachment.inspectionStage,
      note: attachment.note,
      chargeNote: attachment.chargeNote,
      priceSheetItemId: attachment.chargePriceSheetItemId,
      priceSheetItemName: attachment.chargePriceSheetItem?.name ?? null,
      quantity: attachment.chargeQuantity,
      estimatedCents: attachment.chargeEstimatedCents ?? 0,
    }));
  const pinLines = attachments.flatMap((attachment) => {
    const annotations = Array.isArray(attachment.markupAnnotations) ? attachment.markupAnnotations : [];
    return annotations
      .filter((annotation): annotation is {
        id: string;
        label: string;
        note?: string | null;
        category?: string | null;
        chargeCandidate?: boolean;
        chargePriceSheetItemId?: string | null;
        chargePriceSheetItemName?: string | null;
        chargeQuantity?: number | null;
        chargeEstimatedCents?: number | null;
      } => Boolean(annotation && typeof annotation === "object" && "chargeCandidate" in annotation && annotation.chargeCandidate))
      .map((annotation) => ({
        type: "PIN" as const,
        attachmentId: attachment.id,
        attachmentName: attachment.originalName,
        pinId: annotation.id,
        label: annotation.label,
        category: annotation.category ?? null,
        inspectionStage: attachment.inspectionStage,
        note: annotation.note ?? attachment.note,
        chargeNote: attachment.chargeNote,
        priceSheetItemId: annotation.chargePriceSheetItemId ?? null,
        priceSheetItemName: annotation.chargePriceSheetItemName ?? null,
        quantity: annotation.chargeQuantity ?? null,
        estimatedCents: annotationEstimate(annotation),
      }));
  });
  const lines = [...fileLines, ...pinLines];
  const missingContext = lines.filter((line) => !line.priceSheetItemId && !line.estimatedCents && !line.note && !line.chargeNote).length;
  return {
    item: {
      id: item.id,
      propertyId: item.propertyId,
      propertyCode: item.property.code,
      unitNumber: item.unitNumber,
      boardGroup: item.boardGroup,
    },
    summary: {
      fileCount: fileLines.length,
      pinCount: pinLines.length,
      lineCount: lines.length,
      missingContext,
      totalEstimatedCents: lines.reduce((total, line) => total + line.estimatedCents, 0),
    },
    lines,
  };
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function centsToCsvDollars(cents: number | null | undefined) {
  return typeof cents === "number" ? (cents / 100).toFixed(2) : "";
}

function chargeReportCsv(report: NonNullable<Awaited<ReturnType<typeof buildChargeReport>>>) {
  const headers = [
    "Property",
    "Unit",
    "Type",
    "Attachment",
    "Pin ID",
    "Label",
    "Category",
    "Inspection Stage",
    "Price Sheet Item",
    "Quantity",
    "Estimated Amount",
    "Note",
    "Charge Note",
  ];
  const rows = report.lines.map((line) => [
    report.item.propertyCode,
    report.item.unitNumber,
    line.type,
    line.attachmentName,
    line.pinId,
    line.label,
    line.category,
    line.inspectionStage,
    line.priceSheetItemName,
    line.quantity,
    centsToCsvDollars(line.estimatedCents),
    line.note,
    line.chargeNote,
  ]);
  rows.push([
    report.item.propertyCode,
    report.item.unitNumber,
    "TOTAL",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    centsToCsvDollars(report.summary.totalEstimatedCents),
    `${report.summary.lineCount} line(s)`,
    "Evidence/estimate metadata only; does not create accounting charges.",
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

function groupChargeReportLines(lines: NonNullable<Awaited<ReturnType<typeof buildChargeReport>>>["lines"]) {
  const groups = new Map<string, { label: string; lines: typeof lines; totalEstimatedCents: number }>();
  for (const line of lines) {
    const label = line.category?.trim() || "Uncategorized";
    const key = label.toLowerCase();
    const group = groups.get(key) ?? { label, lines: [], totalEstimatedCents: 0 };
    group.lines.push(line);
    group.totalEstimatedCents += line.estimatedCents;
    groups.set(key, group);
  }
  return [...groups.values()].sort((left, right) => left.label.localeCompare(right.label));
}

function chargeReportCsvGroupedByCategory(report: NonNullable<Awaited<ReturnType<typeof buildChargeReport>>>) {
  const headers = [
    "Property",
    "Unit",
    "Type",
    "Attachment",
    "Pin ID",
    "Label",
    "Category",
    "Inspection Stage",
    "Price Sheet Item",
    "Quantity",
    "Estimated Amount",
    "Note",
    "Charge Note",
  ];
  const rows: unknown[][] = [];
  for (const group of groupChargeReportLines(report.lines)) {
    rows.push([
      report.item.propertyCode,
      report.item.unitNumber,
      "CATEGORY",
      "",
      "",
      group.label,
      group.label,
      "",
      "",
      "",
      centsToCsvDollars(group.totalEstimatedCents),
      `${group.lines.length} line(s)`,
      "",
    ]);
    rows.push(...group.lines.map((line) => [
      report.item.propertyCode,
      report.item.unitNumber,
      line.type,
      line.attachmentName,
      line.pinId,
      line.label,
      line.category,
      line.inspectionStage,
      line.priceSheetItemName,
      line.quantity,
      centsToCsvDollars(line.estimatedCents),
      line.note,
      line.chargeNote,
    ]));
  }
  rows.push([
    report.item.propertyCode,
    report.item.unitNumber,
    "TOTAL",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    centsToCsvDollars(report.summary.totalEstimatedCents),
    `${report.summary.lineCount} line(s)`,
    "Evidence/estimate metadata only; does not create accounting charges.",
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

function parseDelimitedCells(line: string, delimiter: "," | "\t") {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      if (inQuotes && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && char === delimiter) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells.map((cell) => cell.replace(/^\uFEFF/, "").trim());
}

function normalizeImportHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseImportAmountToCents(value: string) {
  const normalized = value.replace(/[$,\s]/g, "");
  if (!normalized) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

type ParsedChargePriceSheetRow = {
  rowNumber: number;
  name: string;
  category: string | null;
  unitLabel: string | null;
  defaultCents: number | null;
  description: string | null;
};

function parseChargePriceSheetImport(content: string) {
  const rawLines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!rawLines.length) {
    return { rows: [] as ParsedChargePriceSheetRow[], errors: ["Paste at least one price-sheet row."] };
  }

  const parsedLines = rawLines.map((line) => {
    const delimiter: "," | "\t" = line.includes("\t") ? "\t" : ",";
    return parseDelimitedCells(line, delimiter);
  });

  const headerAliases = new Map<string, keyof Omit<ParsedChargePriceSheetRow, "rowNumber">>([
    ["name", "name"],
    ["item", "name"],
    ["itemname", "name"],
    ["chargeitem", "name"],
    ["category", "category"],
    ["damagecategory", "category"],
    ["group", "category"],
    ["unit", "unitLabel"],
    ["unitlabel", "unitLabel"],
    ["uom", "unitLabel"],
    ["amount", "defaultCents"],
    ["defaultamount", "defaultCents"],
    ["estimate", "defaultCents"],
    ["defaultestimate", "defaultCents"],
    ["price", "defaultCents"],
    ["defaultprice", "defaultCents"],
    ["description", "description"],
    ["notes", "description"],
    ["note", "description"],
  ]);
  const normalizedHeaders = parsedLines[0].map(normalizeImportHeader);
  const hasHeader = normalizedHeaders.some((header) => headerAliases.has(header));
  const headerMap = new Map<keyof Omit<ParsedChargePriceSheetRow, "rowNumber">, number>();
  if (hasHeader) {
    normalizedHeaders.forEach((header, index) => {
      const key = headerAliases.get(header);
      if (key && !headerMap.has(key)) headerMap.set(key, index);
    });
  }

  const rows: ParsedChargePriceSheetRow[] = [];
  const errors: string[] = [];
  const seenNames = new Set<string>();
  const dataLines = hasHeader ? parsedLines.slice(1) : parsedLines;

  dataLines.forEach((cells, index) => {
    const rowNumber = index + (hasHeader ? 2 : 1);
    const pick = (key: keyof Omit<ParsedChargePriceSheetRow, "rowNumber">, fallbackIndex: number) => {
      const cellIndex = hasHeader ? headerMap.get(key) : fallbackIndex;
      return typeof cellIndex === "number" ? (cells[cellIndex] ?? "").trim() : "";
    };

    const name = pick("name", 0);
    if (!name) {
      errors.push(`Row ${rowNumber}: name is required.`);
      return;
    }
    const dedupeKey = name.toLowerCase();
    if (seenNames.has(dedupeKey)) {
      errors.push(`Row ${rowNumber}: duplicate item name "${name}" in the same import.`);
      return;
    }
    seenNames.add(dedupeKey);

    const amountValue = pick("defaultCents", 3);
    const defaultCents = amountValue ? parseImportAmountToCents(amountValue) : null;
    if (amountValue && defaultCents === null) {
      errors.push(`Row ${rowNumber}: amount "${amountValue}" is not a valid non-negative dollar value.`);
      return;
    }

    rows.push({
      rowNumber,
      name,
      category: pick("category", 1) || null,
      unitLabel: pick("unitLabel", 2) || null,
      defaultCents,
      description: pick("description", 4) || null,
    });
  });

  return { rows, errors };
}

function htmlEscape(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function formatReportDollars(cents: number | null | undefined) {
  return `$${((cents ?? 0) / 100).toFixed(2)}`;
}

function buildChargeReportHtml(report: NonNullable<Awaited<ReturnType<typeof buildChargeReport>>>, options?: { groupByCategory?: boolean }) {
  const grouped = options?.groupByCategory ? groupChargeReportLines(report.lines) : null;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Charge Evidence Summary</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 24px; background: #f8fafc; color: #0f172a; }
    .report { display: grid; gap: 20px; }
    .header h1 { margin: 0 0 6px; font-size: 30px; }
    .header p { margin: 0; color: #475569; }
    .meta, .kpis { display: grid; gap: 12px; }
    .meta { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    .kpis { grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); }
    .card, .kpi { background: #ffffff; border: 1px solid #cbd5e1; border-radius: 16px; padding: 16px; }
    .kpi strong { display: block; font-size: 28px; margin-bottom: 4px; }
    .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; }
    .value { font-size: 16px; margin-top: 4px; }
    .note { color: #475569; font-size: 13px; }
    .warning { color: #9a3412; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; background: #fff; border: 1px solid #cbd5e1; border-radius: 16px; overflow: hidden; }
    th, td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; text-align: left; vertical-align: top; }
    th { background: #e2e8f0; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #334155; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    .muted { color: #475569; }
    .footer { font-size: 12px; color: #64748b; }
    .group { display: grid; gap: 8px; margin-bottom: 16px; }
    .group-header { display: flex; justify-content: space-between; gap: 12px; align-items: center; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 12px; background: #fff; }
    .group-header strong { font-size: 14px; }
  </style>
</head>
<body>
  <div class="report">
    <div class="header">
      <h1>Charge Evidence Summary</h1>
      <p>${htmlEscape(report.item.propertyCode)} • Unit ${htmlEscape(report.item.unitNumber)} • ${htmlEscape(report.item.boardGroup)}</p>
    </div>
    <div class="meta">
      <div class="card">
        <div class="label">Property</div>
        <div class="value">${htmlEscape(report.item.propertyCode)}</div>
      </div>
      <div class="card">
        <div class="label">Unit</div>
        <div class="value">${htmlEscape(report.item.unitNumber)}</div>
      </div>
      <div class="card">
        <div class="label">Section</div>
        <div class="value">${htmlEscape(report.item.boardGroup)}</div>
      </div>
      <div class="card">
        <div class="label">Generated</div>
        <div class="value">${htmlEscape(new Date().toISOString().slice(0, 10))}</div>
      </div>
    </div>
    <div class="kpis">
      <div class="kpi"><strong>${report.summary.lineCount}</strong><span>Line items</span></div>
      <div class="kpi"><strong>${report.summary.fileCount}</strong><span>Charge-candidate files</span></div>
      <div class="kpi"><strong>${report.summary.pinCount}</strong><span>Charge-candidate pins</span></div>
      <div class="kpi"><strong>${formatReportDollars(report.summary.totalEstimatedCents)}</strong><span>Total estimate</span></div>
    </div>
    <div class="card note${report.summary.missingContext ? " warning" : ""}">
      ${report.summary.missingContext
        ? `${report.summary.missingContext} line item(s) still need pricing or notes before handoff.`
        : "All charge-candidate lines include either pricing context, estimate context, or notes."}
    </div>
    <div class="card">
      ${grouped ? grouped.map((group) => `
        <div class="group">
          <div class="group-header">
            <strong>${htmlEscape(group.label)}</strong>
            <span>${group.lines.length} line(s) • ${htmlEscape(formatReportDollars(group.totalEstimatedCents))}</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Evidence</th>
                <th>Stage</th>
                <th>Category</th>
                <th>Price Sheet</th>
                <th>Quantity</th>
                <th>Estimate</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${group.lines.map((line) => `
                <tr>
                  <td>${htmlEscape(line.type === "PIN" ? "Pin" : "File")}</td>
                  <td>
                    <strong>${htmlEscape(line.label)}</strong><br />
                    <span class="muted">${htmlEscape(line.attachmentName)}${line.pinId ? ` • Pin ${htmlEscape(line.pinId)}` : ""}</span>
                  </td>
                  <td>${htmlEscape(line.inspectionStage)}</td>
                  <td>${htmlEscape(line.category ?? "-")}</td>
                  <td>${htmlEscape(line.priceSheetItemName ?? "-")}</td>
                  <td>${htmlEscape(line.quantity ?? "-")}</td>
                  <td>${htmlEscape(formatReportDollars(line.estimatedCents))}</td>
                  <td class="muted">${htmlEscape(line.chargeNote || line.note || "-")}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `).join("") : `
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Evidence</th>
              <th>Stage</th>
              <th>Category</th>
              <th>Price Sheet</th>
              <th>Quantity</th>
              <th>Estimate</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            ${report.lines.length ? report.lines.map((line) => `
              <tr>
                <td>${htmlEscape(line.type === "PIN" ? "Pin" : "File")}</td>
                <td>
                  <strong>${htmlEscape(line.label)}</strong><br />
                  <span class="muted">${htmlEscape(line.attachmentName)}${line.pinId ? ` • Pin ${htmlEscape(line.pinId)}` : ""}</span>
                </td>
                <td>${htmlEscape(line.inspectionStage)}</td>
                <td>${htmlEscape(line.category ?? "-")}</td>
                <td>${htmlEscape(line.priceSheetItemName ?? "-")}</td>
                <td>${htmlEscape(line.quantity ?? "-")}</td>
                <td>${htmlEscape(formatReportDollars(line.estimatedCents))}</td>
                <td class="muted">${htmlEscape(line.chargeNote || line.note || "-")}</td>
              </tr>
            `).join("") : `
              <tr>
                <td colspan="8" class="muted">No charge-candidate evidence has been marked on this turn yet.</td>
              </tr>
            `}
          </tbody>
        </table>
      `}
    </div>
    <div class="footer">Evidence/estimate metadata only. This report does not create resident charges, invoices, or accounting entries.</div>
  </div>
</body>
</html>`;
}

export async function collaborationRoutes(app: FastifyInstance) {
  app.get("/make-ready-items/:id/collaboration", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const query = collaborationQuerySchema.parse(request.query);
    const item = await getScopedItem(request, reply, id);
    if (!item) return;
    const [comments, commentsTotal, attachments, attachmentsTotal, checklistInstances, templates] = await Promise.all([
      prisma.itemComment.findMany({
        where: { itemId: id, isDeleted: false },
        include: { attachments: true },
        orderBy: { createdAt: "desc" },
        take: query.commentLimit,
      }),
      prisma.itemComment.count({ where: { itemId: id, isDeleted: false } }),
      prisma.itemAttachment.findMany({
        where: { itemId: id, commentId: null },
        include: { chargePriceSheetItem: true },
        orderBy: { createdAt: "desc" },
        take: query.attachmentLimit,
      }),
      prisma.itemAttachment.count({ where: { itemId: id, commentId: null } }),
      prisma.checklistInstance.findMany({
        where: { itemId: id },
        include: { items: { include: { completedBy: { select: { fullName: true } } }, orderBy: { sortOrder: "asc" } } },
        orderBy: { createdAt: "asc" },
        take: query.checklistLimit,
      }),
      prisma.checklistTemplate.findMany({
        where: { OR: [{ propertyId: null }, { propertyId: item.propertyId }] },
        include: { items: { orderBy: { sortOrder: "asc" } } },
        orderBy: { name: "asc" },
      }),
    ]);
    return {
      comments,
      attachments,
      checklistInstances,
      templates,
      pagination: {
        comments: { total: commentsTotal, limit: query.commentLimit, hasMore: comments.length < commentsTotal },
        attachments: { total: attachmentsTotal, limit: query.attachmentLimit, hasMore: attachments.length < attachmentsTotal },
      },
    };
  });

  app.get("/make-ready-items/:id/charge-report", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    return buildChargeReport(request, reply, id);
  });

  app.get("/make-ready-items/:id/charge-report.csv", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const query = chargeReportExportQuerySchema.parse(request.query);
    const report = await buildChargeReport(request, reply, id);
    if (!report) return;
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Content-Disposition", `attachment; filename="${sanitizeFilename(`${report.item.propertyCode}-${report.item.unitNumber}-charge-report.csv`)}"`);
    return reply.send(query.groupBy === "category" ? chargeReportCsvGroupedByCategory(report) : chargeReportCsv(report));
  });

  app.get("/make-ready-items/:id/charge-report.html", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const query = chargeReportExportQuerySchema.parse(request.query);
    const report = await buildChargeReport(request, reply, id);
    if (!report) return;
    reply.header("Content-Type", "text/html; charset=utf-8");
    return reply.send(buildChargeReportHtml(report, { groupByCategory: query.groupBy === "category" }));
  });

  app.get("/make-ready-items/:id/charge-report.pdf", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const query = chargeReportExportQuerySchema.parse(request.query);
    const report = await buildChargeReport(request, reply, id);
    if (!report) return;
    const pdf = await renderPdfFromHtml(buildChargeReportHtml(report, { groupByCategory: query.groupBy === "category" }));
    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", `inline; filename="${sanitizeFilename(`${report.item.propertyCode}-${report.item.unitNumber}-charge-report.pdf`)}"`);
    return reply.send(pdf);
  });

  app.post("/make-ready-items/:id/comments", async (request, reply) => {
    if (!canWriteOperations(request.currentUser!)) return reply.code(403).send({ message: "This role cannot add updates" });
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const item = await getScopedItem(request, reply, id);
    if (!item) return;
    const input = itemCommentInputSchema.parse(request.body);
    const user = request.currentUser!;
    const comment = await prisma.itemComment.create({
      data: { itemId: id, propertyId: item.propertyId, authorUserId: user.id, authorName: user.fullName, body: input.body, category: input.category },
    });
    await writeAuditLog({ request, actorUserId: user.id, propertyId: item.propertyId, entityType: "ITEM_COMMENT", entityId: comment.id, action: "ITEM_COMMENT_CREATED", message: `Added update to ${item.unitNumber}` });
    await queueWebhookEvent({
      eventType: "comment.created",
      propertyId: item.propertyId,
      itemId: item.id,
      actorUserId: user.id,
      data: {
        id: comment.id,
        itemId: item.id,
        unitNumber: item.unitNumber,
        category: comment.category,
        authorName: comment.authorName,
      },
    });
    if (item.assignedTech !== user.fullName) {
      await notifyAssignedStaff({
        assignedTech: item.assignedTech,
        propertyId: item.propertyId,
        itemId: item.id,
        category: "COMMENT",
        title: `New update on ${item.unitNumber}`,
        message: `${user.fullName}: ${input.body.slice(0, 120)}`,
      });
    }
    reply.code(201);
    return { comment };
  });

  app.get("/charge-price-sheet-items", async (request, reply) => {
    const query = chargePriceSheetQuerySchema.parse(request.query);
    const scopedProperties = allowedPropertyIds(request.currentUser!);
    if (query.propertyId && scopedProperties && !scopedProperties.includes(query.propertyId)) {
      return reply.code(403).send({ message: "Property access required" });
    }
    const items = await prisma.chargePriceSheetItem.findMany({
      where: {
        ...(query.propertyId ? { propertyId: query.propertyId } : scopedProperties ? { propertyId: { in: scopedProperties } } : {}),
        ...(query.includeArchived ? {} : { isArchived: false }),
      },
      include: { property: { select: { id: true, code: true, name: true } } },
      orderBy: [{ property: { code: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
    });
    return { items };
  });

  app.post("/charge-price-sheet-items", { preHandler: requireManagerOrAdmin }, async (request, reply) => {
    const user = request.currentUser!;
    const input = chargePriceSheetCreateSchema.parse(request.body);
    const scopedProperties = allowedPropertyIds(user);
    if (scopedProperties && !scopedProperties.includes(input.propertyId)) return reply.code(403).send({ message: "Property access required" });
    const item = await prisma.chargePriceSheetItem.create({
      data: {
        propertyId: input.propertyId,
        name: input.name,
        category: input.category?.trim() || null,
        unitLabel: input.unitLabel?.trim() || null,
        defaultCents: input.defaultCents ?? null,
        description: input.description?.trim() || null,
      },
    });
    await writeAuditLog({ request, actorUserId: user.id, propertyId: input.propertyId, entityType: "CHARGE_PRICE_SHEET_ITEM", entityId: item.id, action: "CHARGE_PRICE_SHEET_ITEM_CREATED", message: `Created charge estimate price-sheet item ${item.name}` });
    reply.code(201);
    return { item };
  });

  app.post("/charge-price-sheet-items/import", { preHandler: requireManagerOrAdmin }, async (request, reply) => {
    const user = request.currentUser!;
    const input = chargePriceSheetImportSchema.parse(request.body);
    const scopedProperties = allowedPropertyIds(user);
    if (scopedProperties && !scopedProperties.includes(input.propertyId)) return reply.code(403).send({ message: "Property access required" });

    const parsed = parseChargePriceSheetImport(input.content);
    if (!parsed.rows.length && parsed.errors.length) {
      return reply.code(400).send({ message: parsed.errors[0], errors: parsed.errors });
    }

    const existingItems = await prisma.chargePriceSheetItem.findMany({
      where: { propertyId: input.propertyId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    const existingByName = new Map(existingItems.map((entry) => [entry.name.toLowerCase(), entry]));
    let nextSortOrder = existingItems.reduce((max, entry) => Math.max(max, entry.sortOrder), 0) + 1;

    let created = 0;
    let updated = 0;
    let skipped = 0;
    for (const row of parsed.rows) {
      const existing = existingByName.get(row.name.toLowerCase());
      if (!existing) {
        const createdItem = await prisma.chargePriceSheetItem.create({
          data: {
            propertyId: input.propertyId,
            name: row.name,
            category: row.category,
            unitLabel: row.unitLabel,
            defaultCents: row.defaultCents,
            description: row.description,
            sortOrder: nextSortOrder,
          },
        });
        existingByName.set(createdItem.name.toLowerCase(), createdItem);
        nextSortOrder += 1;
        created += 1;
        continue;
      }
      if (!input.overwriteExisting) {
        skipped += 1;
        continue;
      }
      const nextData = {
        name: row.name,
        category: row.category,
        unitLabel: row.unitLabel,
        defaultCents: row.defaultCents,
        description: row.description,
      };
      const changed =
        existing.name !== nextData.name
        || existing.category !== nextData.category
        || existing.unitLabel !== nextData.unitLabel
        || existing.defaultCents !== nextData.defaultCents
        || existing.description !== nextData.description;
      if (!changed) {
        skipped += 1;
        continue;
      }
      const updatedItem = await prisma.chargePriceSheetItem.update({
        where: { id: existing.id },
        data: nextData,
      });
      existingByName.set(updatedItem.name.toLowerCase(), updatedItem);
      updated += 1;
    }

    await writeAuditLog({
      request,
      actorUserId: user.id,
      propertyId: input.propertyId,
      entityType: "CHARGE_PRICE_SHEET_ITEM",
      entityId: input.propertyId,
      action: "CHARGE_PRICE_SHEET_ITEM_IMPORTED",
      message: `Imported charge estimate price-sheet items (${created} created, ${updated} updated, ${skipped} skipped).`,
    });

    return {
      summary: {
        created,
        updated,
        skipped,
        errors: parsed.errors,
        processed: parsed.rows.length,
      },
    };
  });

  app.patch("/charge-price-sheet-items/:id", { preHandler: requireManagerOrAdmin }, async (request, reply) => {
    const user = request.currentUser!;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = chargePriceSheetPatchSchema.parse(request.body);
    const existing = await prisma.chargePriceSheetItem.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ message: "Price-sheet item not found" });
    const scopedProperties = allowedPropertyIds(user);
    if (scopedProperties && !scopedProperties.includes(existing.propertyId)) return reply.code(403).send({ message: "Property access required" });
    const item = await prisma.chargePriceSheetItem.update({
      where: { id },
      data: {
        ...(Object.prototype.hasOwnProperty.call(input, "name") ? { name: input.name } : {}),
        ...(Object.prototype.hasOwnProperty.call(input, "category") ? { category: input.category?.trim() || null } : {}),
        ...(Object.prototype.hasOwnProperty.call(input, "unitLabel") ? { unitLabel: input.unitLabel?.trim() || null } : {}),
        ...(Object.prototype.hasOwnProperty.call(input, "defaultCents") ? { defaultCents: input.defaultCents ?? null } : {}),
        ...(Object.prototype.hasOwnProperty.call(input, "description") ? { description: input.description?.trim() || null } : {}),
        ...(Object.prototype.hasOwnProperty.call(input, "isActive") ? { isActive: input.isActive } : {}),
        ...(Object.prototype.hasOwnProperty.call(input, "isArchived") ? { isArchived: input.isArchived } : {}),
        ...(Object.prototype.hasOwnProperty.call(input, "sortOrder") ? { sortOrder: input.sortOrder } : {}),
      },
    });
    await writeAuditLog({ request, actorUserId: user.id, propertyId: existing.propertyId, entityType: "CHARGE_PRICE_SHEET_ITEM", entityId: id, action: "CHARGE_PRICE_SHEET_ITEM_UPDATED", message: `Updated charge estimate price-sheet item ${item.name}` });
    return { item };
  });

  app.patch("/make-ready-items/:itemId/comments/:commentId", async (request, reply) => {
    if (!canWriteOperations(request.currentUser!)) return reply.code(403).send({ message: "This role cannot edit updates" });
    const { itemId, commentId } = z.object({ itemId: z.string(), commentId: z.string() }).parse(request.params);
    const item = await getScopedItem(request, reply, itemId);
    if (!item) return;
    const existing = await prisma.itemComment.findFirst({ where: { id: commentId, itemId, isDeleted: false } });
    if (!existing) return reply.code(404).send({ message: "Update not found" });
    const user = request.currentUser!;
    if (existing.authorUserId !== user.id && user.role !== UserRole.ADMIN && user.role !== UserRole.MANAGER) {
      return reply.code(403).send({ message: "Only the author or a manager can edit this update" });
    }
    const input = itemCommentInputSchema.pick({ body: true }).parse(request.body);
    const comment = await prisma.itemComment.update({ where: { id: commentId }, data: { body: input.body, editedAt: new Date() } });
    await writeAuditLog({ request, actorUserId: user.id, propertyId: item.propertyId, entityType: "ITEM_COMMENT", entityId: comment.id, action: "ITEM_COMMENT_UPDATED", message: `Edited update on ${item.unitNumber}` });
    return { comment };
  });

  app.delete("/make-ready-items/:itemId/comments/:commentId", async (request, reply) => {
    if (!canWriteOperations(request.currentUser!)) return reply.code(403).send({ message: "This role cannot remove updates" });
    const { itemId, commentId } = z.object({ itemId: z.string(), commentId: z.string() }).parse(request.params);
    const item = await getScopedItem(request, reply, itemId);
    if (!item) return;
    const existing = await prisma.itemComment.findFirst({ where: { id: commentId, itemId, isDeleted: false } });
    if (!existing) return reply.code(404).send({ message: "Update not found" });
    const user = request.currentUser!;
    if (existing.authorUserId !== user.id && user.role !== UserRole.ADMIN && user.role !== UserRole.MANAGER) {
      return reply.code(403).send({ message: "Only the author or a manager can remove this update" });
    }
    await prisma.itemComment.update({ where: { id: commentId }, data: { isDeleted: true, body: "Update removed", editedAt: new Date() } });
    await writeAuditLog({ request, actorUserId: user.id, propertyId: item.propertyId, entityType: "ITEM_COMMENT", entityId: commentId, action: "ITEM_COMMENT_DELETED", message: `Removed update from ${item.unitNumber}` });
    return { ok: true };
  });

  app.post("/make-ready-items/:id/attachments", async (request, reply) => {
    if (!canWriteOperations(request.currentUser!)) return reply.code(403).send({ message: "This role cannot upload attachments" });
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const item = await getScopedItem(request, reply, id);
    if (!item) return;
    const file = await request.file();
    if (!file) return reply.code(400).send({ message: "Select a file to upload" });
    const safeName = sanitizeFilename(file.filename);
    const extension = extname(safeName).toLowerCase().slice(0, 12);
    if (!allowedAttachmentExtensions.has(extension) || !allowedAttachmentTypes.has(file.mimetype)) {
      file.file.resume();
      return reply.code(415).send({ message: "Unsupported attachment type. Upload JPG, PNG, GIF, WebP, AVIF, HEIC/HEIF, BMP, TIFF, PDF, text/CSV, Word, or Excel files." });
    }
    const storedName = routedStoredName(item.property, `${randomUUID()}${extension}`);
    await ensureStoredUploadParent(storedName);
    const path = resolveStoredUploadPath(storedName);
    await pipeline(file.file, (await import("node:fs")).createWriteStream(path));
    if (file.file.truncated) {
      await unlink(path).catch(() => undefined);
      return reply.code(413).send({
        message: maxUploadBytes
          ? `Attachment exceeds ${Math.floor(maxUploadBytes / 1024 / 1024)} MB limit`
          : "Attachment was truncated by an upstream upload limit. Upload fewer files at once or increase the reverse-proxy/body-size limit.",
      });
    }
    const user = request.currentUser!;
    const attachment = await prisma.itemAttachment.create({
      data: {
        itemId: id,
        propertyId: item.propertyId,
        uploadedById: user.id,
        uploaderName: user.fullName,
        originalName: safeName,
        storedName,
        mimeType: file.mimetype || "application/octet-stream",
        sizeBytes: file.file.bytesRead,
      },
    });
    await writeAuditLog({ request, actorUserId: user.id, propertyId: item.propertyId, entityType: "ITEM_ATTACHMENT", entityId: attachment.id, action: "ITEM_ATTACHMENT_UPLOADED", message: `Uploaded ${safeName} to ${item.unitNumber}` });
    await queueWebhookEvent({
      eventType: "attachment.created",
      propertyId: item.propertyId,
      itemId: item.id,
      actorUserId: user.id,
      data: {
        id: attachment.id,
        itemId: item.id,
        unitNumber: item.unitNumber,
        originalName: attachment.originalName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
      },
    });
    reply.code(201);
    return { attachment };
  });

  app.get("/attachments/:id/download", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const attachment = await prisma.itemAttachment.findUnique({ where: { id } });
    if (!attachment) return reply.code(404).send({ message: "Attachment not found" });
    const scopedProperties = allowedPropertyIds(request.currentUser!);
    if (scopedProperties && !scopedProperties.includes(attachment.propertyId)) return reply.code(403).send({ message: "Property access required" });
    reply.header("Content-Type", attachment.mimeType);
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Content-Disposition", `${attachment.mimeType.startsWith("image/") ? "inline" : "attachment"}; filename="${attachment.originalName.replace(/"/g, "")}"`);
    return reply.send(createReadStream(resolveStoredUploadPath(attachment.storedName)));
  });

  app.get("/make-ready-items/:id/attachments/archive", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const query = attachmentArchiveQuerySchema.parse(request.query);
    const item = await getScopedItem(request, reply, id);
    if (!item) return;
    const where = {
      itemId: id,
      commentId: null,
      ...(query.stage === "ALL" ? {} : query.stage === "CHARGE_CANDIDATES" ? { chargeCandidate: true } : { inspectionStage: query.stage }),
      ...(query.category ? { category: query.category } : {}),
    };
    const attachments = await prisma.itemAttachment.findMany({ where, orderBy: { createdAt: "asc" } });
    if (!attachments.length) return reply.code(404).send({ message: "No attachments match this filter" });
    const zip = new yazl.ZipFile();
    const usedPaths = new Set<string>();
    for (const attachment of attachments) {
      const stage = attachment.inspectionStage || "GENERAL";
      const category = attachment.category || "Uncategorized";
      const zipPath = uniqueZipPath(zipSafePath(stage, category, attachment.originalName), usedPaths);
      zip.addFile(resolveStoredUploadPath(attachment.storedName), zipPath);
    }
    zip.end();
    const scope = query.category || query.stage.toLowerCase().replace(/_/g, "-");
    reply.header("Content-Type", "application/zip");
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Content-Disposition", `attachment; filename="${sanitizeFilename(`${item.unitNumber}-${scope}-attachments.zip`)}"`);
    return reply.send(zip.outputStream);
  });

  app.patch("/attachments/:id", async (request, reply) => {
    if (!canWriteOperations(request.currentUser!)) return reply.code(403).send({ message: "This role cannot update attachments" });
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = attachmentPatchSchema.parse(request.body);
    const attachment = await prisma.itemAttachment.findUnique({ where: { id }, include: { item: true } });
    if (!attachment) return reply.code(404).send({ message: "Attachment not found" });
    const item = await getScopedItem(request, reply, attachment.itemId);
    if (!item) return;
    const user = request.currentUser!;
    if (attachment.uploadedById !== user.id && user.role !== UserRole.ADMIN && user.role !== UserRole.MANAGER) {
      return reply.code(403).send({ message: "Only the uploader or a manager can update this attachment" });
    }
    if (input.chargePriceSheetItemId) {
      const priceSheetItem = await prisma.chargePriceSheetItem.findUnique({ where: { id: input.chargePriceSheetItemId } });
      if (!priceSheetItem || priceSheetItem.propertyId !== attachment.propertyId || priceSheetItem.isArchived) {
        return reply.code(400).send({ message: "Price-sheet item is not available for this attachment property" });
      }
    }
    const annotationPriceSheetIds = Array.from(new Set((input.markupAnnotations ?? [])
      .map((annotation) => annotation.chargePriceSheetItemId)
      .filter((entry): entry is string => Boolean(entry))));
    if (annotationPriceSheetIds.length) {
      const priceSheetItems = await prisma.chargePriceSheetItem.findMany({ where: { id: { in: annotationPriceSheetIds } } });
      const availableIds = new Set(priceSheetItems.filter((entry) => entry.propertyId === attachment.propertyId && !entry.isArchived).map((entry) => entry.id));
      if (annotationPriceSheetIds.some((entry) => !availableIds.has(entry))) {
        return reply.code(400).send({ message: "One or more markup pin price-sheet items are not available for this attachment property" });
      }
    }
    const updated = await prisma.itemAttachment.update({
      where: { id },
      include: { chargePriceSheetItem: true },
      data: {
        ...(Object.prototype.hasOwnProperty.call(input, "note") ? { note: input.note?.trim() || null } : {}),
        ...(input.inspectionStage ? { inspectionStage: input.inspectionStage } : {}),
        ...(Object.prototype.hasOwnProperty.call(input, "category") ? { category: input.category?.trim() || null } : {}),
        ...(Object.prototype.hasOwnProperty.call(input, "chargeCandidate") ? { chargeCandidate: input.chargeCandidate } : {}),
        ...(Object.prototype.hasOwnProperty.call(input, "chargeNote") ? { chargeNote: input.chargeNote?.trim() || null } : {}),
        ...(Object.prototype.hasOwnProperty.call(input, "chargePriceSheetItemId") ? { chargePriceSheetItemId: input.chargePriceSheetItemId || null } : {}),
        ...(Object.prototype.hasOwnProperty.call(input, "chargeQuantity") ? { chargeQuantity: input.chargeQuantity ?? null } : {}),
        ...(Object.prototype.hasOwnProperty.call(input, "chargeEstimatedCents") ? { chargeEstimatedCents: input.chargeEstimatedCents ?? null } : {}),
        ...(Object.prototype.hasOwnProperty.call(input, "markupAnnotations") ? { markupAnnotations: input.markupAnnotations ?? Prisma.JsonNull } : {}),
      },
    });
    await writeAuditLog({ request, actorUserId: user.id, propertyId: attachment.propertyId, entityType: "ITEM_ATTACHMENT", entityId: id, action: "ITEM_ATTACHMENT_METADATA_UPDATED", message: `Updated photo metadata for ${attachment.originalName} on ${item.unitNumber}` });
    return { attachment: updated };
  });

  app.delete("/attachments/:id", async (request, reply) => {
    if (!canWriteOperations(request.currentUser!)) return reply.code(403).send({ message: "This role cannot remove attachments" });
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const attachment = await prisma.itemAttachment.findUnique({ where: { id }, include: { item: true } });
    if (!attachment) return reply.code(404).send({ message: "Attachment not found" });
    const item = await getScopedItem(request, reply, attachment.itemId);
    if (!item) return;
    const user = request.currentUser!;
    if (attachment.uploadedById !== user.id && user.role !== UserRole.ADMIN && user.role !== UserRole.MANAGER) {
      return reply.code(403).send({ message: "Only the uploader or a manager can remove this attachment" });
    }
    await removeStoredUpload(attachment.storedName);
    await prisma.itemAttachment.delete({ where: { id } });
    await writeAuditLog({ request, actorUserId: user.id, propertyId: attachment.propertyId, entityType: "ITEM_ATTACHMENT", entityId: id, action: "ITEM_ATTACHMENT_DELETED", message: `Removed ${attachment.originalName} from ${item.unitNumber}` });
    await queueWebhookEvent({
      eventType: "attachment.deleted",
      propertyId: attachment.propertyId,
      itemId: item.id,
      actorUserId: user.id,
      data: {
        id,
        itemId: item.id,
        unitNumber: item.unitNumber,
        originalName: attachment.originalName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
      },
    });
    return { ok: true };
  });

  app.get("/checklist-templates", async (request) => {
    const scopedProperties = allowedPropertyIds(request.currentUser!);
    const templates = await prisma.checklistTemplate.findMany({
      where: scopedProperties ? { OR: [{ propertyId: null }, { propertyId: { in: scopedProperties } }] } : undefined,
      include: { property: true, items: { orderBy: { sortOrder: "asc" } } },
      orderBy: { name: "asc" },
    });
    return { templates };
  });

  app.post("/checklist-templates", { preHandler: requireManagerOrAdmin }, async (request, reply) => {
    const user = request.currentUser!;
    const input = checklistTemplateInputSchema.parse(request.body);
    const scopedProperties = allowedPropertyIds(user);
    if (input.propertyId && scopedProperties && !scopedProperties.includes(input.propertyId)) return reply.code(403).send({ message: "Property access required" });
    const template = await prisma.checklistTemplate.create({
      data: {
        propertyId: input.propertyId ?? null,
        name: input.name,
        scope: input.scope ?? null,
        items: { create: input.items.map((entry, sortOrder) => ({ label: entry.title, notes: entry.notes ?? null, required: entry.required, dueOffsetDays: entry.dueOffsetDays ?? null, tradeCategory: entry.tradeCategory ?? null, sortOrder })) },
      },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    await writeAuditLog({ request, actorUserId: user.id, propertyId: input.propertyId ?? null, entityType: "CHECKLIST_TEMPLATE", entityId: template.id, action: "CHECKLIST_TEMPLATE_CREATED", message: `Created checklist template ${template.name}` });
    reply.code(201);
    return { template };
  });

  app.post("/make-ready-items/:id/checklists", { preHandler: requireManagerOrAdmin }, async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { templateId } = z.object({ templateId: z.string() }).parse(request.body);
    const item = await getScopedItem(request, reply, id);
    if (!item) return;
    const template = await prisma.checklistTemplate.findUnique({ where: { id: templateId }, include: { items: true } });
    if (!template || (template.propertyId && template.propertyId !== item.propertyId)) return reply.code(400).send({ message: "Checklist template is not available for this property" });
    const instance = await prisma.checklistInstance.create({
      data: {
        itemId: item.id,
        propertyId: item.propertyId,
        templateId: template.id,
        name: template.name,
        items: { create: template.items.map((entry) => ({ title: entry.label, notes: entry.notes, required: entry.required, dueOffsetDays: entry.dueOffsetDays, tradeCategory: entry.tradeCategory, sortOrder: entry.sortOrder })) },
      },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, propertyId: item.propertyId, entityType: "CHECKLIST_INSTANCE", entityId: instance.id, action: "CHECKLIST_ATTACHED", message: `Added ${template.name} checklist to ${item.unitNumber}` });
    reply.code(201);
    return { instance };
  });

  app.patch("/checklist-items/:id", async (request, reply) => {
    if (!canCompleteChecklist(request.currentUser!)) return reply.code(403).send({ message: "This role cannot complete checklist items" });
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = z.object({ completed: z.boolean().optional(), notes: z.string().trim().max(1000).nullable().optional() }).parse(request.body);
    const existing = await prisma.checklistInstanceItem.findUnique({ where: { id }, include: { instance: { include: { item: true } } } });
    if (!existing) return reply.code(404).send({ message: "Checklist item not found" });
    const item = await getScopedItem(request, reply, existing.instance.itemId);
    if (!item) return;
    const completed = input.completed ?? existing.completed;
    const user = request.currentUser!;
    const checklistItem = await prisma.checklistInstanceItem.update({
      where: { id },
      data: { completed, notes: input.notes === undefined ? existing.notes : input.notes, completedAt: completed ? new Date() : null, completedById: completed ? user.id : null },
      include: { completedBy: { select: { fullName: true } } },
    });
    await writeAuditLog({ request, actorUserId: user.id, propertyId: item.propertyId, entityType: "CHECKLIST_ITEM", entityId: id, action: completed ? "CHECKLIST_ITEM_COMPLETED" : "CHECKLIST_ITEM_REOPENED", message: `${completed ? "Completed" : "Reopened"} ${checklistItem.title} on ${item.unitNumber}` });
    if (completed) {
      await queueWebhookEvent({
        eventType: "checklist.completed",
        propertyId: item.propertyId,
        itemId: item.id,
        actorUserId: user.id,
        data: {
          checklistItemId: checklistItem.id,
          title: checklistItem.title,
          itemId: item.id,
          unitNumber: item.unitNumber,
          completedBy: user.fullName,
        },
      });
    }
    return { checklistItem };
  });

  const workSessionInclude = {
    user: { select: { id: true, fullName: true, role: true } },
    property: { select: { id: true, name: true, code: true } },
    makeReadyItem: { select: { id: true, unitNumber: true, boardGroup: true, assignedTech: true, makeReadyStatus: true, moveInDate: true } },
    projectRecord: { select: { id: true, title: true, status: true, recordType: true, assignedUserId: true, assignedUserName: true, dueDate: true } },
    pestIssue: { select: { id: true, pestType: true, status: true, priority: true, unit: { select: { number: true } }, area: true, assignedUserId: true, followUpDate: true, treatmentDate: true } },
    leaseComplianceIssue: { select: { id: true, issueTypeName: true, status: true, noticeStage: true, priority: true, unit: { select: { number: true } }, area: true, building: true, assignedUserId: true } },
    preventiveMaintenanceTask: { select: { id: true, taskName: true, category: true, status: true, priority: true, assignedUserId: true, dueDate: true } },
  } satisfies Prisma.WorkSessionInclude;

  const serializeWorkSession = (session: Prisma.WorkSessionGetPayload<{ include: typeof workSessionInclude }>) => {
    let sourceId = "";
    let title = "";
    let subtitle = "";
    let assignmentStatus = "";
    if (session.makeReadyItem) {
      sourceId = session.makeReadyItem.id;
      title = `${session.property.code} ${session.makeReadyItem.unitNumber}`;
      subtitle = `Make Ready / ${session.makeReadyItem.boardGroup.replace(/_/g, " ")}`;
      assignmentStatus = session.makeReadyItem.makeReadyStatus ?? "";
    } else if (session.projectRecord) {
      sourceId = session.projectRecord.id;
      title = session.projectRecord.title;
      subtitle = `Projects / ${session.projectRecord.recordType}`;
      assignmentStatus = session.projectRecord.status;
    } else if (session.pestIssue) {
      sourceId = session.pestIssue.id;
      title = session.pestIssue.unit?.number ?? session.pestIssue.area ?? session.pestIssue.pestType;
      subtitle = `Pest Control / ${session.pestIssue.pestType}`;
      assignmentStatus = session.pestIssue.status;
    } else if (session.leaseComplianceIssue) {
      sourceId = session.leaseComplianceIssue.id;
      title = session.leaseComplianceIssue.unit?.number ?? session.leaseComplianceIssue.area ?? session.leaseComplianceIssue.building ?? session.leaseComplianceIssue.issueTypeName;
      subtitle = `Lease Compliance / ${session.leaseComplianceIssue.issueTypeName}`;
      assignmentStatus = session.leaseComplianceIssue.status;
    } else if (session.preventiveMaintenanceTask) {
      sourceId = session.preventiveMaintenanceTask.id;
      title = session.preventiveMaintenanceTask.taskName;
      subtitle = `Preventive Maintenance / ${session.preventiveMaintenanceTask.category}`;
      assignmentStatus = session.preventiveMaintenanceTask.status;
    }
    return {
      id: session.id,
      propertyId: session.propertyId,
      property: session.property,
      userId: session.userId,
      user: session.user,
      sourceType: session.sourceType,
      sourceId,
      status: session.status,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      durationMinutes: session.durationMinutes,
      startNote: session.startNote,
      endNote: session.endNote,
      title,
      subtitle,
      assignmentStatus,
    };
  };

  async function endActiveWorkSession(sessionId: string, actorUserId: string, note?: string | null) {
    const active = await prisma.workSession.findUnique({ where: { id: sessionId } });
    if (!active || active.status !== "IN_PROGRESS" || active.endedAt) return null;
    const endedAt = new Date();
    return prisma.workSession.update({
      where: { id: sessionId },
      data: {
        status: "COMPLETED",
        endedAt,
        endedById: actorUserId,
        durationMinutes: durationMinutesBetween(active.startedAt, endedAt),
        endNote: note ?? active.endNote ?? null,
      },
      include: workSessionInclude,
    });
  }

  async function resolveWorkSessionSource(request: FastifyRequest, reply: FastifyReply, sourceType: z.infer<typeof workSessionSourceTypeSchema>, sourceId: string) {
    const user = request.currentUser!;
    const scopedProperties = allowedPropertyIds(user);
    const isManagerRole = user.role === UserRole.ADMIN || user.role === UserRole.MANAGER;
    const deny = () => {
      reply.code(403).send({ message: "Assignment access required" });
      return null;
    };
    if (sourceType === "MAKE_READY_ITEM") {
      const item = await prisma.makeReadyItem.findUnique({ where: { id: sourceId }, include: { property: true, workAssignmentBlocks: { where: { status: { in: ["PLANNED", "IN_PROGRESS"] } } } } });
      if (!item) return reply.code(404).send({ message: "Make-ready item not found" });
      if (scopedProperties && !scopedProperties.includes(item.propertyId)) return reply.code(403).send({ message: "Property access required" });
      if (!isManagerRole && item.assignedTech !== user.fullName && !item.workAssignmentBlocks.some((block) => block.assignedUserId === user.id)) return deny();
      return { propertyId: item.propertyId, entityId: item.id, message: `Started work on ${item.unitNumber}`, data: { makeReadyItemId: item.id } };
    }
    if (sourceType === "PROJECT_RECORD") {
      const record = await prisma.projectRecord.findUnique({ where: { id: sourceId }, include: { property: true, tasks: { select: { assignedUserId: true, status: true } } } });
      if (!record) return reply.code(404).send({ message: "Project record not found" });
      if (scopedProperties && !scopedProperties.includes(record.propertyId)) return reply.code(403).send({ message: "Property access required" });
      if (!isManagerRole && record.assignedUserId !== user.id && !record.tasks.some((task) => task.assignedUserId === user.id && task.status !== "Completed" && task.status !== "Skipped")) return deny();
      return { propertyId: record.propertyId, entityId: record.id, message: `Started work on project ${record.title}`, data: { projectRecordId: record.id } };
    }
    if (sourceType === "PEST_ISSUE") {
      const issue = await prisma.pestIssue.findUnique({ where: { id: sourceId }, include: { property: true } });
      if (!issue) return reply.code(404).send({ message: "Pest issue not found" });
      if (scopedProperties && !scopedProperties.includes(issue.propertyId)) return reply.code(403).send({ message: "Property access required" });
      if (!isManagerRole && issue.assignedUserId !== user.id) return deny();
      return { propertyId: issue.propertyId, entityId: issue.id, message: `Started pest work on ${issue.area ?? issue.pestType}`, data: { pestIssueId: issue.id } };
    }
    if (sourceType === "LEASE_COMPLIANCE_ISSUE") {
      const issue = await prisma.leaseComplianceIssue.findUnique({ where: { id: sourceId }, include: { property: true } });
      if (!issue) return reply.code(404).send({ message: "Lease compliance issue not found" });
      if (scopedProperties && !scopedProperties.includes(issue.propertyId)) return reply.code(403).send({ message: "Property access required" });
      if (!isManagerRole && issue.assignedUserId !== user.id) return deny();
      return { propertyId: issue.propertyId, entityId: issue.id, message: `Started lease compliance work on ${issue.issueTypeName}`, data: { leaseComplianceIssueId: issue.id } };
    }
    const task = await prisma.preventiveMaintenanceTask.findUnique({ where: { id: sourceId }, include: { property: true } });
    if (!task) return reply.code(404).send({ message: "Preventive maintenance task not found" });
    if (scopedProperties && !scopedProperties.includes(task.propertyId)) return reply.code(403).send({ message: "Property access required" });
    if (!isManagerRole && task.assignedUserId !== user.id) return deny();
    return { propertyId: task.propertyId, entityId: task.id, message: `Started PM task ${task.taskName}`, data: { preventiveMaintenanceTaskId: task.id } };
  }

  app.get("/assigned-work", async (request, reply) => {
    const user = request.currentUser!;
    if (user.role === UserRole.VIEWER) {
      return reply.code(403).send({ message: "Assigned work access required" });
    }
    const query = assignedWorkQuerySchema.parse(request.query);
    if (query.userId && query.userId !== user.id && !(user.role === UserRole.ADMIN || user.role === UserRole.MANAGER || user.role === UserRole.LEASING)) {
      return reply.code(403).send({ message: "Only managers, leasing, or admin can review another user's assigned work" });
    }
    const scopedProperties = allowedPropertyIds(user);
    if (query.propertyId && scopedProperties && !scopedProperties.includes(query.propertyId)) {
      return reply.code(403).send({ message: "Property access denied" });
    }
    const propertyWhere = query.propertyId ? { propertyId: query.propertyId } : scopedProperties ? { propertyId: { in: scopedProperties } } : {};
    const activeUsers = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, fullName: true, role: true },
      orderBy: [{ role: "asc" }, { fullName: "asc" }],
    });
    const usersByName = new Map(activeUsers.map((entry) => [entry.fullName, entry]));
    const activeSessionsRaw = await prisma.workSession.findMany({
      where: { status: "IN_PROGRESS", ...(query.userId ? { userId: query.userId } : {}), ...propertyWhere },
      include: workSessionInclude,
      orderBy: [{ startedAt: "asc" }],
    });
    const activeSessions = activeSessionsRaw.map(serializeWorkSession);
    const activeSessionByKey = new Map(activeSessions.map((session) => [`${session.sourceType}:${session.sourceId}:${session.userId}`, session] as const));
    const entries: Array<Record<string, unknown>> = [];
    const addEntry = (entry: {
      userId: string | null;
      assignedUserName: string;
      role: string | null;
      sourceType: string;
      sourceId: string;
      property: { id: string; code: string; name: string };
      title: string;
      subtitle: string;
      status: string;
      priority?: string | null;
      dueDate?: Date | null;
      scheduledDate?: Date | null;
      overdue?: boolean;
    }) => {
      if (query.userId && entry.userId !== query.userId) return;
      entries.push({ ...entry, activeSession: entry.userId ? activeSessionByKey.get(`${entry.sourceType}:${entry.sourceId}:${entry.userId}`) ?? null : null });
    };

    const makeReadyItems = await prisma.makeReadyItem.findMany({
      where: { isArchived: false, ...propertyWhere, OR: [{ assignedTech: { not: null } }, { workAssignmentBlocks: { some: { status: { in: ["PLANNED", "IN_PROGRESS"] } } } }] },
      include: { property: { select: { id: true, code: true, name: true } }, workAssignmentBlocks: { where: { status: { in: ["PLANNED", "IN_PROGRESS"] } }, include: { assignedUser: { select: { id: true, fullName: true, role: true } } }, orderBy: { plannedDate: "asc" } } },
      orderBy: [{ overdue: "desc" }, { moveInDate: "asc" }, { updatedAt: "desc" }],
    });
    for (const item of makeReadyItems) {
      if (item.workAssignmentBlocks.length) {
        for (const block of item.workAssignmentBlocks) {
          addEntry({ userId: block.assignedUser.id, assignedUserName: block.assignedUser.fullName, role: block.assignedUser.role, sourceType: "MAKE_READY_ITEM", sourceId: item.id, property: item.property, title: `${item.property.code} ${item.unitNumber}`, subtitle: `Make Ready / ${item.boardGroup.replace(/_/g, " ")} / ${block.category}`, status: item.makeReadyStatus ?? "Unstarted", scheduledDate: block.plannedDate, dueDate: item.moveInDate, overdue: item.overdue });
        }
      } else if (item.assignedTech?.trim()) {
        const mapped = usersByName.get(item.assignedTech.trim()) ?? null;
        addEntry({ userId: mapped?.id ?? null, assignedUserName: item.assignedTech.trim(), role: mapped?.role ?? null, sourceType: "MAKE_READY_ITEM", sourceId: item.id, property: item.property, title: `${item.property.code} ${item.unitNumber}`, subtitle: `Make Ready / ${item.boardGroup.replace(/_/g, " ")}`, status: item.makeReadyStatus ?? "Unstarted", dueDate: item.moveInDate, overdue: item.overdue });
      }
    }

    const projectRecords = await prisma.projectRecord.findMany({
      where: { isArchived: false, ...propertyWhere, assignedUserName: { not: null }, status: { notIn: ["Completed", "Cancelled", "Archived", "Denied"] } },
      include: { property: { select: { id: true, code: true, name: true } } },
      orderBy: [{ dueDate: "asc" }, { scheduledDate: "asc" }, { updatedAt: "desc" }],
    });
    for (const record of projectRecords) {
      addEntry({ userId: record.assignedUserId ?? null, assignedUserName: record.assignedUserName ?? "Unassigned", role: activeUsers.find((entry) => entry.id === record.assignedUserId)?.role ?? null, sourceType: "PROJECT_RECORD", sourceId: record.id, property: record.property, title: record.title, subtitle: `Projects / ${record.recordType}${record.categoryName ? ` / ${record.categoryName}` : ""}`, status: record.status, priority: record.priority, dueDate: record.dueDate, scheduledDate: record.scheduledDate, overdue: Boolean(record.dueDate && record.dueDate < new Date()) });
    }

    const pmTasks = await prisma.preventiveMaintenanceTask.findMany({
      where: { ...propertyWhere, assignedUserId: { not: null }, status: { notIn: ["COMPLETED", "CANCELLED", "ARCHIVED"] } },
      include: { property: { select: { id: true, code: true, name: true } } },
      orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
    });
    for (const task of pmTasks) {
      addEntry({ userId: task.assignedUserId ?? null, assignedUserName: task.assignedUserName ?? "Unassigned", role: activeUsers.find((entry) => entry.id === task.assignedUserId)?.role ?? null, sourceType: "PREVENTIVE_MAINTENANCE_TASK", sourceId: task.id, property: task.property, title: task.taskName, subtitle: `Preventive Maintenance / ${task.category}`, status: task.status, priority: task.priority, dueDate: task.dueDate, overdue: task.dueDate < new Date() });
    }

    const pestItems = await prisma.pestIssue.findMany({
      where: { isArchived: false, ...propertyWhere, assignedUserId: { not: null }, status: { notIn: ["Closed", "Cancelled", "Archived"] } },
      include: { property: { select: { id: true, code: true, name: true } }, unit: { select: { number: true } }, assignedUser: { select: { id: true, fullName: true, role: true } } },
      orderBy: [{ followUpDate: "asc" }, { requestDate: "desc" }],
    });
    for (const issue of pestItems) {
      addEntry({ userId: issue.assignedUserId ?? null, assignedUserName: issue.assignedUser?.fullName ?? "Unassigned", role: issue.assignedUser?.role ?? null, sourceType: "PEST_ISSUE", sourceId: issue.id, property: issue.property, title: issue.unit?.number ?? issue.area ?? issue.pestType, subtitle: `Pest Control / ${issue.pestType}`, status: issue.status, priority: issue.priority, dueDate: issue.followUpDate, scheduledDate: issue.treatmentDate, overdue: Boolean(issue.followUpDate && issue.followUpDate < new Date() && issue.status === "Needs Follow Up") });
    }

    const leaseItems = await prisma.leaseComplianceIssue.findMany({
      where: { isArchived: false, ...propertyWhere, assignedUserId: { not: null }, status: { notIn: ["Resolved", "Archived"] } },
      include: { property: { select: { id: true, code: true, name: true } }, unit: { select: { number: true } }, assignedUser: { select: { id: true, fullName: true, role: true } } },
      orderBy: [{ updatedAt: "desc" }],
    });
    for (const issue of leaseItems) {
      addEntry({ userId: issue.assignedUserId ?? null, assignedUserName: issue.assignedUser?.fullName ?? issue.assignedUserName ?? "Unassigned", role: issue.assignedUser?.role ?? null, sourceType: "LEASE_COMPLIANCE_ISSUE", sourceId: issue.id, property: issue.property, title: issue.unit?.number ?? issue.area ?? issue.building ?? issue.issueTypeName, subtitle: `Lease Compliance / ${issue.issueTypeName}`, status: issue.status, priority: issue.priority, overdue: issue.status === "Violation Needed" || (issue.noticeStage === "3rd Notice" && !issue.violationNeededDate) });
    }

    return {
      summary: {
        totalAssignments: entries.length,
        activeSessions: activeSessions.length,
        overdueAssignments: entries.filter((entry) => Boolean(entry.overdue)).length,
        assignedUsers: new Set(entries.map((entry) => String(entry.userId ?? entry.assignedUserName))).size,
      },
      activeSessions,
      entries,
      staff: activeUsers,
    };
  });

  app.post("/work-sessions/start", async (request, reply) => {
    const user = request.currentUser!;
    const input = workSessionStartSchema.parse(request.body);
    const source = await resolveWorkSessionSource(request, reply, input.sourceType, input.sourceId);
    if (!source) return reply;
    const existing = await prisma.workSession.findFirst({ where: { userId: user.id, status: "IN_PROGRESS" }, orderBy: { startedAt: "desc" }, include: workSessionInclude });
    if (existing && existing.sourceType === input.sourceType && serializeWorkSession(existing).sourceId === input.sourceId) {
      return serializeWorkSession(existing);
    }
    if (existing) {
      await endActiveWorkSession(existing.id, user.id, existing.endNote ?? "Auto-ended when starting another assignment.");
    }
    const created = await prisma.workSession.create({
      data: {
        propertyId: source.propertyId,
        userId: user.id,
        sourceType: input.sourceType,
        startNote: input.note ?? null,
        startedById: user.id,
        ...source.data,
      },
      include: workSessionInclude,
    });
    await writeAuditLog({ request, actorUserId: user.id, propertyId: source.propertyId, entityType: "WORK_SESSION", entityId: created.id, action: "WORK_SESSION_STARTED", message: source.message });
    return serializeWorkSession(created);
  });

  app.post("/work-sessions/:id/end", async (request, reply) => {
    const user = request.currentUser!;
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const input = workSessionEndSchema.parse(request.body ?? {});
    const session = await prisma.workSession.findUnique({ where: { id }, include: workSessionInclude });
    if (!session) return reply.code(404).send({ message: "Work session not found" });
    const scopedProperties = allowedPropertyIds(user);
    if (scopedProperties && !scopedProperties.includes(session.propertyId)) return reply.code(403).send({ message: "Property access required" });
    if (session.userId !== user.id && !(user.role === UserRole.ADMIN || user.role === UserRole.MANAGER)) {
      return reply.code(403).send({ message: "Only managers or the assigned user can end this session" });
    }
    const ended = await endActiveWorkSession(session.id, user.id, input.note ?? null);
    if (!ended) return serializeWorkSession(session);
    await writeAuditLog({ request, actorUserId: user.id, propertyId: session.propertyId, entityType: "WORK_SESSION", entityId: session.id, action: "WORK_SESSION_ENDED", message: `Ended work session for ${ended.user.fullName}` });
    return serializeWorkSession(ended);
  });

  app.get("/my-work", async (request, reply) => {
    const user = request.currentUser!;
    const { userId } = z.object({ userId: z.string().optional() }).parse(request.query);
    if (userId && userId !== user.id && user.role !== UserRole.ADMIN && user.role !== UserRole.MANAGER) {
      return reply.code(403).send({ message: "Only managers can review another user's work" });
    }
    const target = userId ? await prisma.user.findUnique({ where: { id: userId } }) : user;
    if (!target) return reply.code(404).send({ message: "Staff member not found" });
    const scopedProperties = allowedPropertyIds(user);
    const items = await prisma.makeReadyItem.findMany({
      where: {
        isArchived: false,
        ...(scopedProperties ? { propertyId: { in: scopedProperties } } : {}),
        OR: [
          { assignedTech: target.fullName },
          { workAssignmentBlocks: { some: { assignedUserId: target.id, status: { in: ["PLANNED", "IN_PROGRESS"] } } } },
        ],
      },
      include: {
        property: true,
        checklistInstances: { include: { items: true } },
        workAssignmentBlocks: { where: { assignedUserId: target.id, status: { in: ["PLANNED", "IN_PROGRESS"] } }, orderBy: { plannedDate: "asc" } },
      },
      orderBy: [{ overdue: "desc" }, { moveInDate: "asc" }, { updatedAt: "desc" }],
    });
    const projectItems = await prisma.projectRecord.findMany({
      where: {
        isArchived: false,
        ...(scopedProperties ? { propertyId: { in: scopedProperties } } : {}),
        OR: [
          { assignedUserId: target.id },
          { tasks: { some: { assignedUserId: target.id, status: { in: ["Open", "In Progress"] } } } },
        ],
      },
      include: {
        property: true,
        attachments: true,
        comments: true,
        tasks: { orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }] },
        wikiReferences: true,
      },
      orderBy: [{ dueDate: "asc" }, { scheduledDate: "asc" }, { updatedAt: "desc" }],
    });
    const pestItems = await prisma.pestIssue.findMany({
      where: {
        isArchived: false,
        ...(scopedProperties ? { propertyId: { in: scopedProperties } } : {}),
        assignedUserId: target.id,
        status: { notIn: ["Closed", "Cancelled", "Archived"] },
      },
      include: {
        property: true,
        unit: true,
        vendor: true,
        makeReadyItem: { select: { id: true, unitNumber: true, moveInDate: true } },
        attachments: true,
        notes: { orderBy: { createdAt: "desc" }, take: 3 },
      },
      orderBy: [{ followUpDate: "asc" }, { requestDate: "desc" }, { updatedAt: "desc" }],
    });
    const leaseComplianceItems = await prisma.leaseComplianceIssue.findMany({
      where: {
        isArchived: false,
        ...(scopedProperties ? { propertyId: { in: scopedProperties } } : {}),
        assignedUserId: target.id,
        status: { notIn: ["Resolved", "Archived"] },
      },
      include: {
        property: true,
        unit: true,
        issueType: true,
        propertyMap: { select: { id: true, name: true } },
        assignedUser: { select: { id: true, fullName: true, role: true } },
        createdBy: { select: { id: true, fullName: true } },
        updatedBy: { select: { id: true, fullName: true } },
        resolvedBy: { select: { id: true, fullName: true } },
        archivedBy: { select: { id: true, fullName: true } },
        notes: { orderBy: { createdAt: "desc" }, take: 3 },
        photos: { orderBy: { createdAt: "desc" }, take: 3 },
        noticeActions: { orderBy: { createdAt: "desc" }, take: 3 },
        persistenceChecks: { orderBy: { createdAt: "desc" }, take: 3 },
      },
      orderBy: [{ createdAt: "desc" }, { updatedAt: "desc" }],
    });
    const pmTasks = await prisma.preventiveMaintenanceTask.findMany({
      where: {
        ...(scopedProperties ? { propertyId: { in: scopedProperties } } : {}),
        assignedUserId: target.id,
        status: { notIn: ["COMPLETED", "CANCELLED", "ARCHIVED"] },
      },
      include: {
        property: true,
      },
      orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
    });
    const activeSessionsRaw = await prisma.workSession.findMany({
      where: {
        userId: target.id,
        status: "IN_PROGRESS",
        ...(scopedProperties ? { propertyId: { in: scopedProperties } } : {}),
      },
      include: workSessionInclude,
      orderBy: [{ startedAt: "asc" }],
    });
    const activeSessions = activeSessionsRaw.map(serializeWorkSession);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const soonCutoff = new Date(today);
    soonCutoff.setDate(soonCutoff.getDate() + 7);
    return {
      target: { id: target.id, fullName: target.fullName },
      stats: {
        total: items.length + projectItems.length + pestItems.length + leaseComplianceItems.length + pmTasks.length,
        overdue: items.filter((entry) => entry.overdue).length
          + projectItems.filter((entry) => entry.dueDate && entry.dueDate < today && !["Completed", "Cancelled", "Archived", "Denied"].includes(entry.status)).length
          + pestItems.filter((entry) => entry.followUpDate && entry.followUpDate < today && entry.status === "Needs Follow Up").length
          + leaseComplianceItems.filter((entry) => ["Violation Needed"].includes(entry.status) || (entry.notice3Date && !entry.violationNeededDate)).length
          + pmTasks.filter((entry) => entry.dueDate < today).length,
        dueSoon: items.filter((entry) => entry.moveInSoon).length
          + projectItems.filter((entry) => ((entry.scheduledDate && entry.scheduledDate >= today && entry.scheduledDate <= soonCutoff) || (entry.dueDate && entry.dueDate >= today && entry.dueDate <= soonCutoff))).length
          + pestItems.filter((entry) => ((entry.followUpDate && entry.followUpDate >= today && entry.followUpDate <= soonCutoff) || (entry.treatmentDate && entry.treatmentDate >= today && entry.treatmentDate <= soonCutoff))).length
          + leaseComplianceItems.filter((entry) => entry.noticeStage !== "None" || entry.recurringConcern).length
          + pmTasks.filter((entry) => entry.dueDate >= today && entry.dueDate <= soonCutoff).length,
        openChecklistTasks: items.flatMap((entry) => entry.checklistInstances.flatMap((instance) => instance.items)).filter((entry) => !entry.completed).length,
      },
      items,
      projectItems,
      pestItems,
      leaseComplianceItems,
      pmTasks,
      activeSessions,
    };
  });
}
