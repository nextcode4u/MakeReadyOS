import { createHmac, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authConfig, deriveRequestOrigin, validateTrustedOrigin } from "../lib/config.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { emptyOnCall, onCallMapSchema, onCallSchema, publicOnCall } from "../lib/onCall.js";
import { ensureStoredUploadParent, removeStoredUpload, resolveStoredUploadPath } from "../lib/uploadStorage.js";
import { onCallSchedule } from "../lib/onCallRotation.js";
import { mapPdfPreview } from "../lib/onCallMapPreview.js";

const mapPath = (id: string) => `on-call-maps/${z.string().uuid().parse(id)}`;
function guestExpiry(request: FastifyRequest, revision: string, name = cookieName): number | null {
  const signed = request.cookies[name];
  if (!signed) return null;
  const result = request.unsignCookie(signed);
  if (!result.valid || !result.value) return null;
  try {
    const ticket = z.object({ revision: z.string().uuid(), expiresAt: z.number() }).parse(JSON.parse(result.value));
    return ticket.revision === revision && ticket.expiresAt > Date.now() ? ticket.expiresAt : null;
  } catch { return null; }
}
async function downloadMap(propertyId: string, payload: unknown, reply: FastifyReply, query: unknown) {
  const options = z.object({ preview: z.literal("1").optional(), page: z.coerce.number().int().min(1).max(50).default(1), file: z.string().uuid().optional() }).parse(query);
  const file = onCallSchema.parse(payload).properties.find(property => property.id === propertyId)?.mapFile;
  if (!file) return reply.code(404).send({ message: "No uploaded map for this property" });
  if (options.preview && options.file && options.file !== file.id) return reply.code(409).send({ message: "The map was replaced. Refresh before viewing or placing markers." });
  let buffer: Buffer;
  try { buffer = await readFile(resolveStoredUploadPath(mapPath(file.id))); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return reply.code(404).send({ message: "Map file unavailable. Ask your coordinator to upload it again or restore the uploads backup." });
    throw error;
  }
  if (options.preview) {
    if (file.mime === "application/pdf") buffer = await mapPdfPreview(resolveStoredUploadPath(mapPath(file.id)), options.page);
    return reply.header("X-Content-Type-Options", "nosniff").header("Content-Security-Policy", "sandbox").type(file.mime === "application/pdf" ? "image/png" : file.mime).send(buffer);
  }
  return reply.header("X-Content-Type-Options", "nosniff").header("Content-Security-Policy", "sandbox")
    .header("Content-Disposition", `attachment; filename="property-map"; filename*=UTF-8''${encodeURIComponent(file.name).replace(/['()*]/g, character => `%${character.charCodeAt(0).toString(16)}`)}`)
    .type(file.mime).send(buffer);
}

const workspaceId = "shared";
const cookieName = "mros_on_call";
const editCookieName = "mros_on_call_edit";
function editorExpiry(request: FastifyRequest, row: { externalEnabled: boolean; editHash: string | null; editRevision: string }) {
  return row.externalEnabled && row.editHash ? guestExpiry(request, row.editRevision, editCookieName) : null;
}
const read = () => prisma.onCallWorkspace.findUnique({ where: { id: workspaceId } });
function sharedState(request: FastifyRequest, row: NonNullable<Awaited<ReturnType<typeof read>>>) {
  const editExpiresAt = editorExpiry(request, row);
  const expiresAt = editExpiresAt ?? guestExpiry(request, row.accessRevision);
  const data = onCallSchema.parse(row.payload);
  const schedule = onCallSchedule(data);
  return { data: editExpiresAt ? data : { ...publicOnCall(data), ...(expiresAt ? { properties: data.properties } : {}), shifts: schedule.shifts }, schedule, unlocked: expiresAt !== null, expiresAt, canEdit: Boolean(editExpiresAt), editExpiresAt, version: editExpiresAt ? row.version : undefined, updatedAt: row.updatedAt };
}
function noStore(reply: FastifyReply) {
  reply.header("Cache-Control", "no-store, private").header("X-Robots-Tag", "noindex, nofollow").header("Referrer-Policy", "no-referrer");
}
function sessionOnly(request: FastifyRequest) {
  if (!request.currentUser || request.authType !== "session") throw Object.assign(new Error("A staff session is required"), { statusCode: 403 });
}
function originOnly(request: FastifyRequest) {
  const origin = deriveRequestOrigin({ host: request.headers.host, protocol: request.protocol });
  if (!request.headers.origin || !validateTrustedOrigin(request.headers.origin, origin)) throw Object.assign(new Error("Origin not allowed"), { statusCode: 403 });
}
function cookieOptions(request: FastifyRequest) {
  return { path: "/api/on-call", httpOnly: true, sameSite: "strict" as const, secure: authConfig.secureCookies || request.protocol === "https", signed: true };
}
async function mapRoutes(app: FastifyInstance, external = false) {
  const path = `${external ? "/share" : "/on-call"}/properties/:propertyId/map`;
  app.get(path, async (request, reply) => {
    if (!external) sessionOnly(request);
    noStore(reply);
    const row = await read();
    if (!row || external && !row.externalEnabled) return reply.code(404).send({ message: "On-call not configured" });
    if (external && !editorExpiry(request, row) && !guestExpiry(request, row.accessRevision)) return reply.code(403).send({ message: "Unlock property guides before downloading maps" });
    return downloadMap(z.object({ propertyId: z.string().uuid() }).parse(request.params).propertyId, row.payload, reply, request.query);
  });
  app.post(path, async (request, reply) => {
    noStore(reply);
    if (external) {
      originOnly(request);
      const row = await read();
      if (!row || !editorExpiry(request, row)) return reply.code(403).send({ message: "Unlock on-call editing before uploading maps" });
    } else {
      sessionOnly(request);
      if (!["ADMIN", "MANAGER"].includes(request.currentUser!.role)) return reply.code(403).send({ message: "Manager or admin access required" });
    }
    const { propertyId } = z.object({ propertyId: z.string().uuid() }).parse(request.params);
    const { version } = z.object({ version: z.coerce.number().int().nonnegative() }).parse(request.query);
    const upload = await request.file({ limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 } });
    if (!upload) return reply.code(400).send({ message: "Choose a PDF, PNG or JPEG map (up to 10 MB)" });
    const buffer = await upload.toBuffer();
    const mime = buffer.subarray(0, 5).toString() === "%PDF-" ? "application/pdf" : buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "image/png" : buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255 ? "image/jpeg" : null;
    if (upload.file.truncated || !mime || mime !== upload.mimetype) return reply.code(400).send({ message: "Upload a valid PDF, PNG or JPEG map, up to 10 MB" });
    const extension = mime === "application/pdf" ? ".pdf" : mime === "image/png" ? ".png" : ".jpg";
    const baseName = upload.filename.replace(/^.*[/\\]/, "").replace(/[\x00-\x1f\x7f]/g, "").replace(/\.[^.]*$/, "").trim().slice(0, 175) || "property-map";
    const file = onCallMapSchema.parse({ id: randomUUID(), name: baseName + extension, mime, size: buffer.length });
    const storedName = mapPath(file.id);
    await ensureStoredUploadParent(storedName);
    await writeFile(resolveStoredUploadPath(storedName), buffer, { flag: "wx" });
    try {
      return await prisma.$transaction(async db => {
        await db.$queryRaw`SELECT pg_advisory_xact_lock(824030)::text`;
        const row = await db.onCallWorkspace.findUnique({ where: { id: workspaceId } });
        if (external && (!row || !editorExpiry(request, row))) throw Object.assign(new Error("Editing access expired or was revoked"), { statusCode: 403 });
        if (!row || row.version !== version) throw Object.assign(new Error("On-call changed. Reload and save your changes before uploading the map."), { statusCode: 409 });
        const data = onCallSchema.parse(row.payload);
        const property = data.properties.find(property => property.id === propertyId);
        if (!property) throw Object.assign(new Error("Save this property before uploading its map"), { statusCode: 404 });
        property.mapFile = file;
        property.markers = [];
        await db.onCallWorkspace.update({ where: { id: workspaceId }, data: { payload: data, version: { increment: 1 } } });
        await db.auditLog.create({ data: { actorUserId: external ? null : request.currentUser!.id, entityType: "ON_CALL", entityId: workspaceId, action: "ON_CALL_MAP_UPLOADED", message: external ? "Shared-code editor uploaded an on-call map" : "Uploaded a protected on-call property map", metadata: { propertyId, fileId: file.id, sharedCodeEditor: external } } });
        return { ok: true };
      });
    } catch (error) { await removeStoredUpload(storedName); throw error; }
  });
}
export async function onCallRoutes(app: FastifyInstance) {
  await mapRoutes(app);
  app.get("/on-call", async (request, reply) => {
    sessionOnly(request); noStore(reply);
    const row = await read();
    const data = row ? onCallSchema.parse(row.payload) : emptyOnCall();
    return { version: row?.version ?? 0, data, schedule: onCallSchedule(data), externalEnabled: row?.externalEnabled ?? false, hasAccessCode: Boolean(row?.accessHash), hasEditCode: Boolean(row?.editHash), canEdit: ["ADMIN", "MANAGER"].includes(request.currentUser!.role), updatedAt: row?.updatedAt ?? null };
  });
  app.put("/on-call", { bodyLimit: 2 * 1024 * 1024 }, async (request, reply) => {
    sessionOnly(request); noStore(reply);
    if (!["ADMIN", "MANAGER"].includes(request.currentUser!.role)) return reply.code(403).send({ message: "Manager or admin access required" });
    const input = z.object({ version: z.number().int().nonnegative(), data: onCallSchema, externalEnabled: z.boolean(), accessCode: z.string().min(6).max(100).optional(), revokeAccess: z.boolean().optional(), editCode: z.string().min(10).max(100).optional(), disableEditing: z.boolean().optional() }).strict().parse(request.body);
    const newHash = input.accessCode ? await hashPassword(input.accessCode) : undefined;
    const editHash = input.editCode ? await hashPassword(input.editCode) : undefined;
    return prisma.$transaction(async db => {
      await db.$queryRaw`SELECT pg_advisory_xact_lock(824030)::text`;
      const current = await db.onCallWorkspace.findUnique({ where: { id: workspaceId } });
      if ((current?.version ?? 0) !== input.version) throw Object.assign(new Error("On-call changed in another session. Reload before saving; your draft is preserved."), { statusCode: 409 });
      if (input.editCode && (input.editCode === input.accessCode || !input.accessCode && current?.accessHash && await verifyPassword(input.editCode, current.accessHash)) || input.accessCode && !input.editCode && !input.disableEditing && current?.editHash && await verifyPassword(input.accessCode, current.editHash)) throw Object.assign(new Error("Viewing and editing codes must be different"), { statusCode: 400 });
      const oldProperties = current ? onCallSchema.parse(current.payload).properties : [];
      for (const property of input.data.properties) {
        if (property.mapFile && JSON.stringify(property.mapFile) !== JSON.stringify(oldProperties.find(old => old.id === property.id)?.mapFile)) throw Object.assign(new Error("Use the map upload control to attach a map to this property"), { statusCode: 400 });
      }
      if (input.externalEnabled && !newHash && !current?.accessHash) throw Object.assign(new Error("Set an access code before enabling external sharing"), { statusCode: 400 });
      const values = { version: input.version + 1, payload: input.data, externalEnabled: input.externalEnabled, accessHash: newHash ?? current?.accessHash ?? null, accessRevision: !current || newHash || input.revokeAccess || current.externalEnabled !== input.externalEnabled ? randomUUID() : current.accessRevision, editHash: input.disableEditing ? null : editHash ?? current?.editHash ?? null, editRevision: !current || editHash || input.disableEditing || input.revokeAccess || current.externalEnabled !== input.externalEnabled ? randomUUID() : current.editRevision };
      const row = await db.onCallWorkspace.upsert({ where: { id: workspaceId }, create: { id: workspaceId, ...values }, update: values });
      await db.auditLog.create({ data: { actorUserId: request.currentUser!.id, entityType: "ON_CALL", entityId: workspaceId, action: "ON_CALL_UPDATED", message: "Updated the shared on-call workspace", metadata: { version: row.version, externalEnabled: row.externalEnabled, accessRevoked: current?.accessRevision !== row.accessRevision, editingEnabled: Boolean(row.editHash), editingRevoked: current?.editRevision !== row.editRevision } } });
      return { version: row.version, data: input.data, schedule: onCallSchedule(input.data), externalEnabled: row.externalEnabled, hasAccessCode: Boolean(row.accessHash), hasEditCode: Boolean(row.editHash), canEdit: true, updatedAt: row.updatedAt };
    });
  });
}
export async function publicOnCallRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (_request, reply) => { noStore(reply); });
  await mapRoutes(app, true);
  app.get("/share", async (request, reply) => {
    const row = await read();
    if (!row?.externalEnabled) return reply.code(404).send({ message: "On-call sharing is not enabled. Contact your coordinator." });
    return sharedState(request, row);
  });
  app.put("/share", { bodyLimit: 2 * 1024 * 1024 }, async (request, reply) => {
    originOnly(request);
    const initial = await read();
    if (!initial || !editorExpiry(request, initial)) return reply.code(403).send({ message: "Unlock on-call editing to make changes" });
    const input = z.object({ version: z.number().int().nonnegative(), data: onCallSchema }).strict().parse(request.body);
    return prisma.$transaction(async db => {
      await db.$queryRaw`SELECT pg_advisory_xact_lock(824030)::text`;
      const current = await db.onCallWorkspace.findUnique({ where: { id: workspaceId } });
      if (!current || !editorExpiry(request, current)) throw Object.assign(new Error("Editing access expired or was revoked"), { statusCode: 403 });
      if (current.version !== input.version) throw Object.assign(new Error("On-call changed. Reload before saving; your draft is preserved."), { statusCode: 409 });
      const previous = onCallSchema.parse(current.payload);
      for (const property of input.data.properties) {
        if (property.mapFile && JSON.stringify(property.mapFile) !== JSON.stringify(previous.properties.find(old => old.id === property.id)?.mapFile)) throw Object.assign(new Error("Use the map upload control to attach a map"), { statusCode: 400 });
      }
      const row = await db.onCallWorkspace.update({ where: { id: workspaceId }, data: { payload: input.data, version: { increment: 1 } } });
      await db.auditLog.create({ data: { actorUserId: null, entityType: "ON_CALL", entityId: workspaceId, action: "ON_CALL_UPDATED", message: "Shared-code editor updated the on-call workspace", metadata: { version: row.version, sharedCodeEditor: true } } });
      return sharedState(request, row);
    });
  });
  for (const edit of [false, true]) app.post(edit ? "/unlock-edit" : "/unlock", async (request, reply) => {
    originOnly(request);
    const input = z.object({ code: z.string().min(1).max(100) }).strict().parse(request.body);
    const row = await read();
    if (!row?.externalEnabled) return reply.code(404).send({ message: "On-call sharing is not enabled" });
    const now = Date.now();
    const bucket = Math.floor(now / (15 * 60 * 1000));
    const ip = createHmac("sha256", authConfig.sessionCookieSecret).update(request.ip).digest("hex");
    const expiresAt = new Date((bucket + 2) * 15 * 60 * 1000);
    const limited = await prisma.$transaction(async db => {
      await db.onCallAccessAttempt.deleteMany({ where: { expiresAt: { lt: new Date(now) } } });
      const global = await db.onCallAccessAttempt.upsert({ where: { id: `global-${bucket}` }, create: { id: `global-${bucket}`, expiresAt }, update: { count: { increment: 1 } } });
      if (global.count > 200) return true;
      const local = await db.onCallAccessAttempt.upsert({ where: { id: `${ip}-${bucket}` }, create: { id: `${ip}-${bucket}`, expiresAt }, update: { count: { increment: 1 } } });
      return local.count > 10;
    });
    if (limited) return reply.header("Retry-After", String(Math.ceil(((bucket + 1) * 15 * 60 * 1000 - now) / 1000))).code(429).send({ message: "Too many attempts. Try again after 15 minutes or contact your coordinator." });
    const hash = edit ? row.editHash : row.accessHash;
    if (!hash || !await verifyPassword(input.code, hash)) return reply.code(401).send({ message: "Incorrect access code or access is disabled" });
    const seconds = edit ? 60 * 60 : 8 * 60 * 60;
    reply.setCookie(edit ? editCookieName : cookieName, JSON.stringify({ revision: edit ? row.editRevision : row.accessRevision, expiresAt: now + seconds * 1000 }), { ...cookieOptions(request), maxAge: seconds });
    return { ok: true };
  });
  app.post("/lock", async (request, reply) => {
    originOnly(request);
    reply.clearCookie(cookieName, cookieOptions(request));
    reply.clearCookie(editCookieName, cookieOptions(request));
    return { ok: true };
  });
}
