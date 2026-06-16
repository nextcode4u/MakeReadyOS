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
    const report = await buildChargeReport(request, reply, id);
    if (!report) return;
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Content-Disposition", `attachment; filename="${sanitizeFilename(`${report.item.propertyCode}-${report.item.unitNumber}-charge-report.csv`)}"`);
    return reply.send(chargeReportCsv(report));
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const soonCutoff = new Date(today);
    soonCutoff.setDate(soonCutoff.getDate() + 7);
    return {
      target: { id: target.id, fullName: target.fullName },
      stats: {
        total: items.length + projectItems.length + pestItems.length + leaseComplianceItems.length,
        overdue: items.filter((entry) => entry.overdue).length
          + projectItems.filter((entry) => entry.dueDate && entry.dueDate < today && !["Completed", "Cancelled", "Archived", "Denied"].includes(entry.status)).length
          + pestItems.filter((entry) => entry.followUpDate && entry.followUpDate < today && entry.status === "Needs Follow Up").length
          + leaseComplianceItems.filter((entry) => ["Violation Needed"].includes(entry.status) || (entry.notice3Date && !entry.violationNeededDate)).length,
        dueSoon: items.filter((entry) => entry.moveInSoon).length
          + projectItems.filter((entry) => ((entry.scheduledDate && entry.scheduledDate >= today && entry.scheduledDate <= soonCutoff) || (entry.dueDate && entry.dueDate >= today && entry.dueDate <= soonCutoff))).length
          + pestItems.filter((entry) => ((entry.followUpDate && entry.followUpDate >= today && entry.followUpDate <= soonCutoff) || (entry.treatmentDate && entry.treatmentDate >= today && entry.treatmentDate <= soonCutoff))).length
          + leaseComplianceItems.filter((entry) => entry.noticeStage !== "None" || entry.recurringConcern).length,
        openChecklistTasks: items.flatMap((entry) => entry.checklistInstances.flatMap((instance) => instance.items)).filter((entry) => !entry.completed).length,
      },
      items,
      projectItems,
      pestItems,
      leaseComplianceItems,
    };
  });
}
