import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { allowedPropertyIds, requireAdmin } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { renderPdfFromHtml } from "../lib/pdf.js";
import { defaultReportSettings, emptyReportDraft, finalWalkReportHtml, reportChecks, reportDraftSchema, reportSections, reportSettingsSchema, resolveReportMailbox, savedReportDraftSchema, savedReportSettingsSchema } from "../lib/finalWalkReport.js";
import { finalWalkCategory } from "../lib/finalWalks.js";
import { isFinalWalkStatus } from "../lib/turnStatus.js";

async function inspectorAccess(request: FastifyRequest, db: typeof prisma | import("@prisma/client").Prisma.TransactionClient, propertyId: string, itemId?: string, editing = false) {
  const user = request.currentUser;
  if (!user || request.authType === "apiToken") throw Object.assign(new Error("A user session is required"), { statusCode: 403 });
  if (user.role === "ADMIN") return;
  if (!itemId || !["MANAGER", "LEASING", "TECH"].includes(user.role)) throw Object.assign(new Error("Only the assigned inspector can access this report"), { statusCode: 403 });
  const item = await db.makeReadyItem.findFirst({ where: { id: itemId, propertyId, isArchived: false } });
  const block = item && await db.workAssignmentBlock.findFirst({ where: { itemId, category: finalWalkCategory, status: { in: ["PLANNED", "IN_PROGRESS", "DONE"] } }, orderBy: { createdAt: "desc" } });
  if (!item || !block || block.assignedUserId !== user.id || item.assignedTech?.trim().toLowerCase() === user.fullName.trim().toLowerCase() || (editing ? !isFinalWalkStatus(item.makeReadyStatus) || block.status === "DONE" : !isFinalWalkStatus(item.makeReadyStatus) && item.makeReadyStatus !== "DONE")) {
    throw Object.assign(new Error("Only the assigned independent inspector can access this report; completed walks are read-only"), { statusCode: 403 });
  }
}

async function context(request: FastifyRequest, reply: FastifyReply, itemId?: string) {
  if (!request.currentUser) { reply.code(403).send({ message: "A user session is required" }); return null; }
  const { propertyId } = z.object({ propertyId: z.string().min(1) }).parse(request.params);
  const ids = allowedPropertyIds(request.currentUser!);
  if (ids !== null && !ids.includes(propertyId)) { reply.code(403).send({ message: "Property access denied" }); return null; }
  await inspectorAccess(request, prisma, propertyId, itemId);
  const property = await prisma.property.findFirst({ where: { id: propertyId, isActive: true }, include: { branding: { include: { managementCompany: true } } } });
  if (!property) { reply.code(404).send({ message: "Active property not found" }); return null; }
  reply.header("Cache-Control", "no-store");
  return property;
}
const itemInclude = { finalWalkReportDraft: true, checklistInstances: { include: { items: { orderBy: { sortOrder: "asc" as const }, select: { id: true, title: true, completed: true, completedAt: true } } } } };
async function findItem(propertyId: string, id: string) {
  const item = await prisma.makeReadyItem.findFirst({ where: { id, propertyId, isArchived: false }, include: itemInclude });
  if (!item) throw Object.assign(new Error("Active turn not found in this property"), { statusCode: 404 });
  return item;
}
async function directoryMailbox(item: { propertyId: string; unitId: string | null; unitNumber: string } | null) {
  if (!item) return null;
  const unit = await prisma.unit.findFirst({ where: { propertyId: item.propertyId, ...(item.unitId ? { id: item.unitId } : { number: item.unitNumber }) }, select: { mailboxNumber: true } });
  return unit?.mailboxNumber ?? null;
}
export async function finalWalkReportRoutes(app: FastifyInstance) {
  app.get("/final-walk-reports/:propertyId", async (request, reply) => {
    const { itemId } = z.object({ itemId: z.string().min(1).optional() }).parse(request.query);
    const property = await context(request, reply, itemId); if (!property) return;
    const item = itemId ? await findItem(property.id, itemId) : null;
    const settings = savedReportSettingsSchema.safeParse(property.branding?.finalWalkReportSettings);
    const draft = savedReportDraftSchema.safeParse(item?.finalWalkReportDraft?.payload);
    const mailbox = await directoryMailbox(item);
    const reviewer = item ? await prisma.workAssignmentBlock.findFirst({ where: { itemId: item.id, category: finalWalkCategory }, orderBy: { createdAt: "desc" }, select: { assignedUser: { select: { fullName: true } } } }) : null;
    return {
      canEditSettings: request.currentUser!.role === "ADMIN",
      canEditDraft: request.currentUser!.role === "ADMIN" || isFinalWalkStatus(item?.makeReadyStatus),
      property: { id: property.id, name: property.name, code: property.code },
      settings: settings.success ? settings.data : { version: 0, value: defaultReportSettings },
      draft: draft.success ? { ...draft.data, value: resolveReportMailbox(draft.data.value, mailbox) } : { version: 0, value: resolveReportMailbox(emptyReportDraft(), mailbox), updatedAt: null },
      sections: reportSections.map(section => ({ id: section.id, title: section.title })), checks: reportChecks,
      items: await prisma.makeReadyItem.findMany({ where: { propertyId: property.id, isArchived: false, ...(request.currentUser!.role === "ADMIN" ? {} : { id: itemId }) }, select: { id: true, unitNumber: true, boardGroup: true }, orderBy: { unitNumber: "asc" } }),
      item: item ? { id: item.id, unitNumber: item.unitNumber, directoryMailbox: mailbox, technician: item.assignedTech, reviewer: reviewer?.assignedUser.fullName ?? null, checklists: item.checklistInstances } : null,
    };
  });
  app.put("/final-walk-reports/:propertyId/settings", async (request, reply) => {
    await requireAdmin(request, reply); if (reply.sent) return;
    const property = await context(request, reply); if (!property) return;
    const input = z.object({ version: z.number().int().min(0), value: reportSettingsSchema }).strict().parse(request.body);
    return prisma.$transaction(async db => {
      await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${property.id}), 824019)::text`;
      const current = await db.propertyBranding.findUnique({ where: { propertyId: property.id } });
      const parsed = savedReportSettingsSchema.safeParse(current?.finalWalkReportSettings);
      if ((parsed.success ? parsed.data.version : 0) !== input.version) throw Object.assign(new Error("Report settings changed in another session. Reload before saving."), { statusCode: 409 });
      const settings = { version: input.version + 1, value: input.value };
      await db.propertyBranding.upsert({ where: { propertyId: property.id }, create: { propertyId: property.id, finalWalkReportSettings: settings }, update: { finalWalkReportSettings: settings } });
      await db.auditLog.create({ data: { actorUserId: request.currentUser!.id, propertyId: property.id, entityType: "PROPERTY", entityId: property.id, action: "FINAL_WALK_REPORT_SETTINGS_UPDATED", message: "Updated final-walk draft report wording and style", metadata: { version: settings.version } } });
      return settings;
    });
  });
  app.put("/final-walk-reports/:propertyId/items/:itemId", async (request, reply) => {
    const { itemId } = z.object({ itemId: z.string().min(1) }).parse(request.params);
    const property = await context(request, reply, itemId); if (!property) return;
    const input = z.object({ version: z.number().int().min(0), value: reportDraftSchema }).strict().parse(request.body);
    return prisma.$transaction(async db => {
      await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${property.id}), 824018)::text`;
      await inspectorAccess(request, db, property.id, itemId, true);
      await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${itemId}), 824020)::text`;
      const item = await db.makeReadyItem.findFirst({ where: { id: itemId, propertyId: property.id, isArchived: false }, include: { finalWalkReportDraft: true } });
      if (!item) throw Object.assign(new Error("Active turn not found in this property"), { statusCode: 404 });
      const current = savedReportDraftSchema.safeParse(item.finalWalkReportDraft?.payload);
      if ((current.success ? current.data.version : 0) !== input.version) throw Object.assign(new Error("Inspection draft changed in another session. Reload before saving."), { statusCode: 409 });
      const draft = { version: input.version + 1, value: input.value, updatedAt: new Date().toISOString() };
      await db.finalWalkReportDraft.upsert({ where: { itemId: item.id }, create: { itemId: item.id, payload: draft }, update: { payload: draft } });
      await db.auditLog.create({ data: { actorUserId: request.currentUser!.id, propertyId: property.id, entityType: "MAKE_READY_ITEM", entityId: item.id, action: "FINAL_WALK_REPORT_DRAFT_SAVED", message: "Saved inspection draft; no sign-off or ready-status change", metadata: { version: draft.version } } });
      return draft;
    });
  });
  app.post("/final-walk-reports/:propertyId/preview", async (request, reply) => {
    const requestedItem = z.object({ itemId: z.string().optional() }).safeParse(request.body);
    const property = await context(request, reply, requestedItem.success ? requestedItem.data.itemId : undefined); if (!property) return;
    const input = z.object({ itemId: z.string().min(1).optional(), settings: reportSettingsSchema, draft: reportDraftSchema, format: z.enum(["html", "pdf"]) }).strict().parse(request.body);
    if (request.currentUser!.role !== "ADMIN") {
      const saved = savedReportSettingsSchema.safeParse(property.branding?.finalWalkReportSettings);
      input.settings = saved.success ? saved.data.value : defaultReportSettings;
    }
    const item = input.itemId ? await findItem(property.id, input.itemId) : null;
    const reviewer = item ? await prisma.workAssignmentBlock.findFirst({ where: { itemId: item.id, category: finalWalkCategory }, orderBy: { createdAt: "desc" }, select: { assignedUser: { select: { fullName: true } } } }) : null;
    const html = finalWalkReportHtml({ propertyName: property.name, propertyCode: property.code, propertyLogo: property.branding?.logo ?? null, companyName: property.branding?.managementCompany?.name ?? null, companyLogo: property.branding?.managementCompany?.logo ?? null, unitNumber: item?.unitNumber ?? null, technician: item?.assignedTech ?? null, reviewer: reviewer?.assignedUser.fullName ?? null }, input.settings, item ? resolveReportMailbox(input.draft, await directoryMailbox(item)) : emptyReportDraft());
    if (input.format === "html") return { html };
    return { pdfBase64: (await renderPdfFromHtml(html, { singlePage: true })).toString("base64") };
  });
}
