import type { ProjectRecord, Prisma } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { stat } from "node:fs/promises";
import { PassThrough } from "node:stream";
import yazl from "yazl";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { writeAuditLog } from "../lib/audit.js";
import { projectBudgetSummary, projectCostInput, projectQuoteInput } from "../lib/projectBudget.js";
import { resolveStoredUploadPath } from "../lib/uploadStorage.js";

type Access = {
  requireProjectsAccess: (request: FastifyRequest, reply: FastifyReply, level: "view" | "edit" | "admin") => boolean;
  assertPropertyAccess: (request: FastifyRequest, propertyId: string) => Promise<void>;
  canEditProjectRecord: (request: FastifyRequest, record: ProjectRecord) => Promise<boolean>;
};
const failure = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });
const safeName = (name: string) => name.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 150) || "document";

export async function projectCommercialRoutes(app: FastifyInstance, access: Access) {
  async function recordFor(request: FastifyRequest, reply: FastifyReply, edit = false) {
    if (!access.requireProjectsAccess(request, reply, edit ? "edit" : "view")) return null;
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const record = await prisma.projectRecord.findUnique({ where: { id } });
    if (!record) throw failure(404, "Project not found");
    await access.assertPropertyAccess(request, record.propertyId);
    if (edit && !(await access.canEditProjectRecord(request, record))) throw failure(403, "Project edit access denied");
    if (edit && record.isArchived) throw failure(409, "Restore the project before changing costs or quotes");
    reply.header("Cache-Control", "no-store");
    return record;
  }

  app.get("/projects/records/:id/budget", async (request, reply) => {
    const record = await recordFor(request, reply);
    if (!record) return;
    const [quotes, costLines] = await Promise.all([
      prisma.projectQuote.findMany({ where: { recordId: record.id }, include: { attachments: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
      prisma.projectCostLine.findMany({ where: { recordId: record.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    ]);
    return { quotes, costLines, summary: projectBudgetSummary(quotes, costLines) };
  });

  for (const kind of ["quotes", "cost-lines"] as const) {
    app.put(`/projects/records/:id/${kind}/:entryId`, async (request, reply) => {
      const record = await recordFor(request, reply, true);
      if (!record) return;
      const { entryId } = z.object({ entryId: z.string().uuid() }).parse(request.params);
      const parsed = kind === "quotes" ? projectQuoteInput.parse(request.body) : projectCostInput.parse(request.body);
      const { expectedVersion, ...data } = parsed;
      return prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT "id" FROM "ProjectRecord" WHERE "id" = ${record.id} FOR UPDATE`;
        const current = await tx.projectRecord.findUniqueOrThrow({ where: { id: record.id } });
        if (current.isArchived || !(await access.canEditProjectRecord(request, current))) throw failure(409, "Project changed; reload before saving");
        const existing = kind === "quotes" ? await tx.projectQuote.findUnique({ where: { id: entryId } }) : await tx.projectCostLine.findUnique({ where: { id: entryId } });
        if (existing && existing.recordId !== record.id) throw failure(409, "Entry belongs to another project");
        const unchanged = existing && Object.entries(data).every(([key, value]) => JSON.stringify(existing[key as keyof typeof existing]) === JSON.stringify(value));
        // The same client-generated ID makes a retried successful save safe.
        if (unchanged) return { entry: existing, alreadySaved: true };
        if ((existing?.version ?? 0) !== expectedVersion) throw failure(409, "Someone changed this entry. Reload it before saving; your draft has not been applied.");
        const count = kind === "quotes" ? await tx.projectQuote.count({ where: { recordId: record.id } }) : await tx.projectCostLine.count({ where: { recordId: record.id } });
        if (!existing && count >= 500) throw failure(409, "This project has reached the 500-entry limit");
        const entry = kind === "quotes"
          ? existing ? await tx.projectQuote.update({ where: { id: entryId }, data: { ...data as Prisma.ProjectQuoteUpdateInput, version: { increment: 1 } } }) : await tx.projectQuote.create({ data: { ...data as Prisma.ProjectQuoteUncheckedCreateInput, id: entryId, recordId: record.id } })
          : existing ? await tx.projectCostLine.update({ where: { id: entryId }, data: { ...data as Prisma.ProjectCostLineUpdateInput, version: { increment: 1 } } }) : await tx.projectCostLine.create({ data: { ...data as Prisma.ProjectCostLineUncheckedCreateInput, id: entryId, recordId: record.id } });
        await writeAuditLog({ request, actorUserId: request.currentUser!.id, propertyId: record.propertyId, entityType: "PROJECT_RECORD", entityId: record.id,
          action: kind === "quotes" ? "PROJECT_QUOTE_SAVED" : "PROJECT_COST_SAVED", message: `${existing ? "Updated" : "Added"} ${kind === "quotes" ? "quote" : "in-house cost"} on ${record.title}`, metadata: { entryId, before: existing, after: entry } }, tx);
        return { entry, alreadySaved: false };
      });
    });
  }

  app.get("/projects/records/:id/documents.zip", async (request, reply) => {
    const record = await recordFor(request, reply);
    if (!record) return;
    const files = await prisma.projectAttachment.findMany({ where: { recordId: record.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 1001 });
    if (files.length > 1000) throw failure(413, "This project exceeds the 1,000-file ZIP limit. Download files individually.");
    let size = 0;
    for (const file of files) {
      try { size += (await stat(resolveStoredUploadPath(file.storedName))).size; }
      catch { throw failure(409, "A project file is missing from storage. No incomplete archive was generated."); }
    }
    if (size > 500 * 1024 * 1024) throw failure(413, "This project exceeds the 500 MB ZIP limit. Download files individually.");
    const zip = new yazl.ZipFile();
    const output = new PassThrough();
    zip.on("error", error => output.destroy(error));
    zip.outputStream.on("error", error => output.destroy(error));
    zip.outputStream.pipe(output);
    const manifest = files.map(file => ({ id: file.id, name: file.originalName, quoteId: file.quoteId, type: file.attachmentType, caption: file.caption, uploadedAt: file.createdAt, uploader: file.uploaderName,
      path: `${file.attachmentType}/${file.id}-${safeName(file.originalName)}` }));
    files.forEach((file, index) => zip.addFile(resolveStoredUploadPath(file.storedName), manifest[index].path));
    zip.addBuffer(Buffer.from(JSON.stringify({ projectId: record.id, title: record.title, propertyId: record.propertyId, exportedAt: new Date(), files: manifest }, null, 2)), "manifest.json");
    zip.end();
    reply.header("Content-Type", "application/zip");
    reply.header("Content-Disposition", `attachment; filename="${safeName(record.title)}-documents.zip"`);
    return reply.send(output);
  });
}
