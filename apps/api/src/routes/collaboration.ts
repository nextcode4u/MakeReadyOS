import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { UserRole } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { allowedPropertyIds, canCompleteChecklist, canWriteOperations, requireManagerOrAdmin } from "../lib/auth.js";
import { writeAuditLog } from "../lib/audit.js";
import { notifyAssignedStaff } from "../lib/notifications.js";
import { prisma } from "../lib/prisma.js";

const uploadDir = resolve(process.env.UPLOAD_DIR || "uploads");
const maxUploadBytes = Number(process.env.MAX_UPLOAD_MB || 15) * 1024 * 1024;
const collaborationQuerySchema = z.object({
  commentLimit: z.coerce.number().int().min(1).max(100).default(50),
  attachmentLimit: z.coerce.number().int().min(1).max(100).default(50),
  checklistLimit: z.coerce.number().int().min(1).max(100).default(30),
});
const allowedAttachmentExtensions = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".pdf", ".txt", ".csv", ".doc", ".docx", ".xls", ".xlsx"]);
const allowedAttachmentTypes = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/heic", "image/heif",
  "application/pdf", "text/plain", "text/csv",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const commentSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  category: z.string().trim().max(40).optional().default("UPDATE"),
});
const attachmentPatchSchema = z.object({
  note: z.string().trim().max(1000).nullable(),
});
const templateSchema = z.object({
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

async function removeStoredAttachment(path: string) {
  try {
    await unlink(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
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

  app.post("/make-ready-items/:id/comments", async (request, reply) => {
    if (!canWriteOperations(request.currentUser!)) return reply.code(403).send({ message: "This role cannot add updates" });
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const item = await getScopedItem(request, reply, id);
    if (!item) return;
    const input = commentSchema.parse(request.body);
    const user = request.currentUser!;
    const comment = await prisma.itemComment.create({
      data: { itemId: id, propertyId: item.propertyId, authorUserId: user.id, authorName: user.fullName, body: input.body, category: input.category },
    });
    await writeAuditLog({ request, actorUserId: user.id, propertyId: item.propertyId, entityType: "ITEM_COMMENT", entityId: comment.id, action: "ITEM_COMMENT_CREATED", message: `Added update to ${item.unitNumber}` });
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
    const input = commentSchema.pick({ body: true }).parse(request.body);
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
      return reply.code(415).send({ message: "Unsupported attachment type. Upload an image, PDF, text/CSV, Word, or Excel file." });
    }
    const storedName = `${randomUUID()}${extension}`;
    await mkdir(uploadDir, { recursive: true });
    const path = join(uploadDir, storedName);
    await pipeline(file.file, (await import("node:fs")).createWriteStream(path));
    if (file.file.truncated) {
      await unlink(path).catch(() => undefined);
      return reply.code(413).send({ message: `Attachment exceeds ${Math.floor(maxUploadBytes / 1024 / 1024)} MB limit` });
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
    return reply.send(createReadStream(join(uploadDir, attachment.storedName)));
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
    const updated = await prisma.itemAttachment.update({ where: { id }, data: { note: input.note?.trim() || null } });
    await writeAuditLog({ request, actorUserId: user.id, propertyId: attachment.propertyId, entityType: "ITEM_ATTACHMENT", entityId: id, action: "ITEM_ATTACHMENT_NOTE_UPDATED", message: `Updated photo note for ${attachment.originalName} on ${item.unitNumber}` });
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
    await removeStoredAttachment(join(uploadDir, attachment.storedName));
    await prisma.itemAttachment.delete({ where: { id } });
    await writeAuditLog({ request, actorUserId: user.id, propertyId: attachment.propertyId, entityType: "ITEM_ATTACHMENT", entityId: id, action: "ITEM_ATTACHMENT_DELETED", message: `Removed ${attachment.originalName} from ${item.unitNumber}` });
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
    const input = templateSchema.parse(request.body);
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
    return {
      target: { id: target.id, fullName: target.fullName },
      stats: {
        total: items.length,
        overdue: items.filter((entry) => entry.overdue).length,
        dueSoon: items.filter((entry) => entry.moveInSoon).length,
        openChecklistTasks: items.flatMap((entry) => entry.checklistInstances.flatMap((instance) => instance.items)).filter((entry) => !entry.completed).length,
      },
      items,
    };
  });
}
