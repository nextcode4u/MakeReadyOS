import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { allowedPropertyIds, requireAdmin } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { renderPdfFromHtml } from "../lib/pdf.js";
import { defaultReportSettings, emptyReportDraft, finalWalkReportHtml, reportChecks, technicianChecks, reportDraftSchema, reportSections, reportSettingsSchema, residentReportBlockers, resolveReportMailbox, savedReportDraftSchema, savedReportSettingsSchema } from "../lib/finalWalkReport.js";
import { createNotification } from "../lib/notifications.js";
import { syncTurnCodes } from "../lib/unitAccessCodes.js";
import { finalWalkCategory } from "../lib/finalWalks.js";
import { awaitingFinalWalk, isTurnReady, turnApproved, type TurnStages } from "../lib/turnStatus.js";

async function inspectorAccess(request: FastifyRequest, db: typeof prisma | import("@prisma/client").Prisma.TransactionClient, propertyId: string, itemId?: string, editing = false) {
  const user = request.currentUser;
  if (!user || request.authType === "apiToken") throw Object.assign(new Error("A user session is required"), { statusCode: 403 });
  if (user.role === "ADMIN") return;
  if (!itemId || !["MANAGER", "LEASING", "TECH"].includes(user.role)) throw Object.assign(new Error("Only the assigned inspector can access this report"), { statusCode: 403 });
  const item = await db.makeReadyItem.findFirst({ where: { id: itemId, propertyId, isArchived: false } });
  if (item && isTurnReady(item) && ["MANAGER", "LEASING"].includes(user.role)) return;
  const block = item && await db.workAssignmentBlock.findFirst({ where: { itemId, category: finalWalkCategory, status: { in: ["PLANNED", "IN_PROGRESS", "DONE"] } }, orderBy: { createdAt: "desc" } });
  if (!item || !block || block.assignedUserId !== user.id || item.assignedTech?.trim().toLowerCase() === user.fullName.trim().toLowerCase() || (!awaitingFinalWalk(item) && !isTurnReady(item)) || (editing && !isTurnReady(item) && block.status === "DONE")) {
    throw Object.assign(new Error("Report access requires the assigned independent inspector, or leasing/management access to a ready unit"), { statusCode: 403 });
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
async function initialReportDraft(item: { propertyId: string; unitId: string | null; unitNumber: string } | null) {
  if (!item) return emptyReportDraft();
  const unit = await prisma.unit.findFirst({ where: { propertyId: item.propertyId, ...(item.unitId ? { id: item.unitId } : { number: item.unitNumber }) }, include: { accessCodes: true } });
  return { ...emptyReportDraft(), residentDoorCode: unit?.accessCodes?.doorCode ?? "", residentAccessCode: unit?.accessCodes?.accessCode ?? "" };
}
export async function finalWalkReportRoutes(app: FastifyInstance) {
  const residentCodesSchema = reportDraftSchema.pick({ residentDoorCode: true, residentAccessCode: true, includeResidentCodes: true, mailbox: true, mailboxSource: true, mailboxKeys: true, homeKeys: true, fobs: true, remotes: true, technicianResults: true, technicianResolution: true }).strip();
  async function codeContext(request: FastifyRequest, db: typeof prisma | import("@prisma/client").Prisma.TransactionClient) {
    const user = request.currentUser;
    if (!user || request.authType === "apiToken" || !["ADMIN", "MANAGER", "TECH"].includes(user.role)) throw Object.assign(new Error("Maintenance staff access required"), { statusCode: 403 });
    const { itemId } = z.object({ itemId: z.string().min(1) }).parse(request.params);
    const item = await db.makeReadyItem.findUnique({ where: { id: itemId }, include: { finalWalkReportDraft: true, property: { select: { isActive: true } } } });
    if (!item) throw Object.assign(new Error("Turn not found"), { statusCode: 404 });
    const ids = allowedPropertyIds(user);
    if (ids !== null && !ids.includes(item.propertyId)) throw Object.assign(new Error("Property access denied"), { statusCode: 403 });
    return item;
  }
  const codesReadOnly = (item: TurnStages & { isArchived: boolean; property: { isActive: boolean } }, role: string) => item.isArchived || !item.property.isActive || role !== "ADMIN" && (awaitingFinalWalk(item) || turnApproved(item));
  app.get("/make-ready-items/:itemId/resident-codes", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const item = await codeContext(request, prisma);
    const parsed = savedReportDraftSchema.safeParse(item.finalWalkReportDraft?.payload);
    if (item.finalWalkReportDraft && !parsed.success) throw Object.assign(new Error("Saved report could not be read. Ask an admin to review it before editing codes."), { statusCode: 409 });
    const mailbox = await directoryMailbox(item);
    const preparationReadOnly = item.isArchived || !item.property.isActive || request.currentUser!.role === "TECH" && item.assignedTech?.trim().toLowerCase() !== request.currentUser!.fullName.trim().toLowerCase();
    return { version: parsed.success ? parsed.data.version : 0, value: residentCodesSchema.parse(resolveReportMailbox(parsed.success ? parsed.data.value : await initialReportDraft(item), mailbox)), technicianChecks, technicianFollowUp: parsed.success ? parsed.data.value.technicianFollowUp : "", correctionPending: parsed.success && parsed.data.value.correctionPending, updatedAt: parsed.success ? parsed.data.updatedAt : null, preparationReadOnly, readOnly: preparationReadOnly || codesReadOnly(item, request.currentUser!.role) };
  });
  app.put("/make-ready-items/:itemId/resident-codes", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const initial = await codeContext(request, prisma);
    const input = z.object({ version: z.number().int().nonnegative(), value: residentCodesSchema.partial().strict() }).strict().parse(request.body);
    return prisma.$transaction(async db => {
      await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${initial.propertyId}), 824018)::text`;
      await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${initial.id}), 824020)::text`;
      const item = await codeContext(request, db);
      if (request.currentUser!.role === "TECH" && item.assignedTech?.trim().toLowerCase() !== request.currentUser!.fullName.trim().toLowerCase()) throw Object.assign(new Error("Only the assigned technician or a manager can update preparation"), { statusCode: 403 });
      if (item.isArchived || !item.property.isActive) throw Object.assign(new Error("Archived turns and inactive properties are read-only."), { statusCode: 409 });
      if (codesReadOnly(item, request.currentUser!.role) && Object.keys(input.value).some(key => key !== "technicianResults")) throw Object.assign(new Error("Preparation checks can still be revised. During final walk or after approval, an inspector or admin must update resident handoff details."), { statusCode: 409 });
      const current = savedReportDraftSchema.safeParse(item.finalWalkReportDraft?.payload);
      if (item.finalWalkReportDraft && !current.success || (current.success ? current.data.version : 0) !== input.version) throw Object.assign(new Error("Report or codes changed in another session. Reload saved codes before saving."), { statusCode: 409 });
      const previous = current.success ? current.data.value : await initialReportDraft(item);
      const changedHandoff = ["homeKeys", "mailboxKeys", "fobs", "remotes", "mailbox", "residentDoorCode", "residentAccessCode"].some(key => key in input.value && input.value[key as keyof typeof input.value] !== previous[key as keyof typeof previous]);
      const changedPreparation = input.value.technicianResults !== undefined && JSON.stringify(input.value.technicianResults) !== JSON.stringify(previous.technicianResults);
      const resolved = previous.correctionPending && Boolean(input.value.technicianResolution?.trim());
      const draft = { version: input.version + 1, updatedAt: new Date().toISOString(), value: { ...previous, ...input.value, ...(changedHandoff || changedPreparation ? { handoffConfirmed: false } : {}), ...(resolved ? { correctionPending: false } : {}) } };
      await db.finalWalkReportDraft.upsert({ where: { itemId: item.id }, create: { itemId: item.id, payload: draft }, update: { payload: draft } });
      await syncTurnCodes(db, item, input.value);
      if (resolved) await db.workAssignmentBlock.updateMany({ where: { itemId: item.id, category: "FINAL_WALK_CORRECTION", status: { in: ["PLANNED", "IN_PROGRESS"] } }, data: { status: "DONE" } });
      await db.auditLog.create({ data: { actorUserId: request.currentUser!.id, propertyId: item.propertyId, entityType: "MAKE_READY_ITEM", entityId: item.id, action: "RESIDENT_CODES_UPDATED", message: "Updated resident handoff codes, mailbox details and report inclusion. Code values are hidden from activity history.", metadata: { version: draft.version, includeResidentCodes: input.value.includeResidentCodes } } });
      return { version: draft.version, value: residentCodesSchema.parse(resolveReportMailbox(draft.value, await directoryMailbox(item))), technicianChecks, technicianFollowUp: draft.value.technicianFollowUp, correctionPending: draft.value.correctionPending, updatedAt: draft.updatedAt, preparationReadOnly: false, readOnly: codesReadOnly(item, request.currentUser!.role) };
    });
  });
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
      canEditDraft: request.currentUser!.role === "ADMIN" || Boolean(item && (awaitingFinalWalk(item) || isTurnReady(item))),
      property: { id: property.id, name: property.name, code: property.code },
      settings: settings.success ? settings.data : { version: 0, value: defaultReportSettings },
      draft: draft.success ? { ...draft.data, value: resolveReportMailbox(draft.data.value, mailbox) } : { version: 0, value: resolveReportMailbox(await initialReportDraft(item), mailbox), updatedAt: null },
      sections: reportSections.map(section => ({ id: section.id, title: section.title })), checks: reportChecks, technicianChecks,
      items: await prisma.makeReadyItem.findMany({ where: { propertyId: property.id, isArchived: false, ...(request.currentUser!.role === "ADMIN" ? {} : { id: itemId }) }, select: { id: true, unitNumber: true, boardGroup: true }, orderBy: { unitNumber: "asc" } }),
      item: item ? { id: item.id, unitNumber: item.unitNumber, unitReady: isTurnReady(item), directoryMailbox: mailbox, technician: item.assignedTech, reviewer: reviewer?.assignedUser.fullName ?? null, checklists: item.checklistInstances } : null,
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
      const previous = current.success ? current.data.value : await initialReportDraft(item);
      if (input.value.handoffConfirmed && [input.value.homeKeys, input.value.mailboxKeys, input.value.fobs, input.value.remotes].some(count => !/^\d{1,4}$/.test(count))) throw Object.assign(new Error("Record each key/fob/remote count (use 0 for none) before confirming handoff"), { statusCode: 400 });
      const draft = { version: input.version + 1, value: { ...input.value, technicianResults: previous.technicianResults, technicianResolution: previous.technicianResolution, correctionPending: previous.correctionPending }, updatedAt: new Date().toISOString() };
      await db.finalWalkReportDraft.upsert({ where: { itemId: item.id }, create: { itemId: item.id, payload: draft }, update: { payload: draft } });
      await syncTurnCodes(db, item, input.value);
      await db.auditLog.create({ data: { actorUserId: request.currentUser!.id, propertyId: property.id, entityType: "MAKE_READY_ITEM", entityId: item.id, action: "FINAL_WALK_REPORT_DRAFT_SAVED", message: "Saved inspection draft; no sign-off or ready-status change", metadata: { version: draft.version } } });
      return draft;
    });
  });
  app.post("/final-walk-reports/:propertyId/items/:itemId/return-to-tech", async (request, reply) => {
    const { itemId } = z.object({ itemId: z.string().min(1) }).parse(request.params);
    const property = await context(request, reply, itemId); if (!property) return;
    const input = z.object({ version: z.number().int().positive() }).strict().parse(request.body);
    return prisma.$transaction(async db => {
      await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${property.id}), 824018)::text`;
      await inspectorAccess(request, db, property.id, itemId, true);
      await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${itemId}), 824020)::text`;
      const item = await db.makeReadyItem.findUniqueOrThrow({ where: { id: itemId }, include: { finalWalkReportDraft: true } });
      if (item.isArchived || !awaitingFinalWalk(item) || turnApproved(item)) throw Object.assign(new Error("Only a pending final walk can be returned to the technician"), { statusCode: 409 });
      const current = savedReportDraftSchema.parse(item.finalWalkReportDraft?.payload);
      if (current.version !== input.version) throw Object.assign(new Error("Report changed. Reload before returning work."), { statusCode: 409 });
      const findings = reportChecks.filter(check => current.value.results[check.id]?.status === "ATTENTION").map(check => `${check.label}: ${current.value.results[check.id].note}`);
      const note = [current.value.technicianFollowUp, ...findings].filter(Boolean).join("\n").slice(0, 1000);
      if (note.trim().length < 3) throw Object.assign(new Error("Record a deficiency or technician follow-up first"), { statusCode: 400 });
      const staff = await db.user.findMany({ where: { isActive: true, fullName: { equals: item.assignedTech ?? "", mode: "insensitive" }, OR: [{ role: "ADMIN" }, { propertyAccess: { some: { propertyId: property.id } } }] }, select: { id: true } });
      if (staff.length !== 1) throw Object.assign(new Error("Assign one active technician with property access before returning work"), { statusCode: 409 });
      const draft = { version: current.version + 1, updatedAt: new Date().toISOString(), value: { ...current.value, technicianFollowUp: note, technicianResolution: "", correctionPending: true, handoffConfirmed: false } };
      await db.finalWalkReportDraft.update({ where: { itemId }, data: { payload: draft } });
      const workSection = await db.boardSection.findFirst({ where: { propertyId: property.id, sectionType: "MAKE_READY", isActive: true } });
      const vacancy = (item.vacancyStatus ?? "").trim().toUpperCase().replaceAll("_", " ");
      const vacancyStatus = vacancy === "VACANT LEASED READY" ? "VACANT LEASED NOT READY" : ["VACANT READY", "VACANT NOT LEASED READY"].includes(vacancy) ? "VACANT NOT LEASED NOT READY" : item.vacancyStatus;
      await db.makeReadyItem.update({ where: { id: itemId }, data: { makeReadyStatus: "IN PROGRESS", completionStatus: "NO", vacancyStatus, ...(workSection ? { boardGroup: workSection.key } : {}) } });
      await db.workAssignmentBlock.updateMany({ where: { itemId, category: finalWalkCategory, status: { in: ["PLANNED", "IN_PROGRESS"] } }, data: { status: "CANCELED" } });
      await db.workAssignmentBlock.create({ data: { itemId, propertyId: property.id, assignedUserId: staff[0].id, category: "FINAL_WALK_CORRECTION", plannedDate: new Date(), estimatedHours: .5, notes: "Final-walk corrections. See internal follow-up in Work; recheck required." } });
      await createNotification({ userId: staff[0].id, propertyId: property.id, itemId, category: "ASSIGNMENT", title: "Final walk returned for corrections", message: `${item.unitNumber}: Open My Work to review and resolve the inspector's findings.`, dedupeKey: `final-walk-correction:${itemId}:${draft.version}` }, db);
      await db.auditLog.create({ data: { actorUserId: request.currentUser!.id, propertyId: property.id, entityType: "MAKE_READY_ITEM", entityId: itemId, action: "FINAL_WALK_RETURNED_TO_TECH", message: "Returned inspection to assigned technician for corrections; painting and cleaning statuses retained", metadata: { version: draft.version, assignedUserId: staff[0].id } } });
      return { returned: true };
    });
  });
  app.post("/final-walk-reports/:propertyId/items/:itemId/resident-pdf", async (request, reply) => {
    const { itemId } = z.object({ itemId: z.string().min(1) }).parse(request.params);
    const property = await context(request, reply, itemId); if (!property) return;
    const input = z.object({ version: z.number().int().positive() }).strict().parse(request.body);
    const item = await findItem(property.id, itemId);
    if (!isTurnReady(item)) throw Object.assign(new Error("Mark the unit ready before downloading its resident report."), { statusCode: 409 });
    const saved = savedReportDraftSchema.safeParse(item.finalWalkReportDraft?.payload);
    if (!saved.success || saved.data.version !== input.version) throw Object.assign(new Error("Save or reload the inspection before downloading its resident report."), { statusCode: 409 });
    const blockers = residentReportBlockers(saved.data.value);
    if (blockers.length) throw Object.assign(new Error(`Resident report needs completed inspection records: ${blockers.join("; ")}`), { statusCode: 409 });
    const settings = savedReportSettingsSchema.safeParse(property.branding?.finalWalkReportSettings);
    const html = finalWalkReportHtml({ propertyName: property.name, propertyCode: property.code, propertyLogo: property.branding?.logo ?? null, companyName: property.branding?.managementCompany?.name ?? null, companyLogo: property.branding?.managementCompany?.logo ?? null, unitNumber: item.unitNumber, technician: item.assignedTech, reviewer: null }, settings.success ? settings.data.value : defaultReportSettings, resolveReportMailbox(saved.data.value, await directoryMailbox(item)), { exportedBy: request.currentUser!.fullName, exportedAt: new Date().toISOString(), revision: saved.data.version });
    const pdf = await renderPdfFromHtml(html, { singlePage: true });
    // Rendering can take seconds. Do not return an obsolete report if the turn changed meanwhile.
    const latest = await findItem(property.id, itemId);
    const latestDraft = savedReportDraftSchema.safeParse(latest.finalWalkReportDraft?.payload);
    if (!isTurnReady(latest) || !latestDraft.success || latestDraft.data.version !== input.version) throw Object.assign(new Error("The turn changed while generating the report. Reload and try again."), { statusCode: 409 });
    await inspectorAccess(request, prisma, property.id, itemId);
    await prisma.auditLog.create({ data: { actorUserId: request.currentUser!.id, propertyId: property.id, entityType: "MAKE_READY_ITEM", entityId: itemId, action: "FINAL_WALK_RESIDENT_REPORT_EXPORTED", message: "Exported resident inspection summary from saved records; no status change or electronic signature", metadata: { version: input.version } } });
    return { pdfBase64: pdf.toString("base64") };
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
