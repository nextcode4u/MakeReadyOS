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
function guestExpiry(request: FastifyRequest, revision: string): number | null {
  const signed = request.cookies[cookieName];
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
const read = () => prisma.onCallWorkspace.findUnique({ where: { id: workspaceId } });
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
export async function onCallRoutes(app: FastifyInstance) {
  app.get("/on-call/properties/:propertyId/map", async (request, reply) => {
    sessionOnly(request); noStore(reply);
    const row = await read();
    if (!row) return reply.code(404).send({ message: "On-call not configured" });
    return downloadMap(z.object({ propertyId: z.string().uuid() }).parse(request.params).propertyId, row.payload, reply, request.query);
  });
  app.post("/on-call/properties/:propertyId/map", async (request, reply) => {
    sessionOnly(request); noStore(reply);
    if (!["ADMIN", "MANAGER"].includes(request.currentUser!.role)) return reply.code(403).send({ message: "Manager or admin access required" });
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
        if (!row || row.version !== version) throw Object.assign(new Error("On-call changed. Reload and save your changes before uploading the map."), { statusCode: 409 });
        const data = onCallSchema.parse(row.payload);
        const property = data.properties.find(property => property.id === propertyId);
        if (!property) throw Object.assign(new Error("Save this property before uploading its map"), { statusCode: 404 });
        property.mapFile = file;
        property.markers = [];
        await db.onCallWorkspace.update({ where: { id: workspaceId }, data: { payload: data, version: { increment: 1 } } });
        await db.auditLog.create({ data: { actorUserId: request.currentUser!.id, entityType: "ON_CALL", entityId: workspaceId, action: "ON_CALL_MAP_UPLOADED", message: "Uploaded a protected on-call property map", metadata: { propertyId, fileId: file.id } } });
        return { ok: true };
      });
    } catch (error) { await removeStoredUpload(storedName); throw error; }
  });
  app.get("/on-call", async (request, reply) => {
    sessionOnly(request); noStore(reply);
    const row = await read();
    const data = row ? onCallSchema.parse(row.payload) : emptyOnCall();
    return { version: row?.version ?? 0, data, schedule: onCallSchedule(data), externalEnabled: row?.externalEnabled ?? false, hasAccessCode: Boolean(row?.accessHash), canEdit: ["ADMIN", "MANAGER"].includes(request.currentUser!.role), updatedAt: row?.updatedAt ?? null };
  });
  app.put("/on-call", { bodyLimit: 2 * 1024 * 1024 }, async (request, reply) => {
    sessionOnly(request); noStore(reply);
    if (!["ADMIN", "MANAGER"].includes(request.currentUser!.role)) return reply.code(403).send({ message: "Manager or admin access required" });
    const input = z.object({ version: z.number().int().nonnegative(), data: onCallSchema, externalEnabled: z.boolean(), accessCode: z.string().min(6).max(100).optional(), revokeAccess: z.boolean().optional() }).strict().parse(request.body);
    const newHash = input.accessCode ? await hashPassword(input.accessCode) : undefined;
    return prisma.$transaction(async db => {
      await db.$queryRaw`SELECT pg_advisory_xact_lock(824030)::text`;
      const current = await db.onCallWorkspace.findUnique({ where: { id: workspaceId } });
      if ((current?.version ?? 0) !== input.version) throw Object.assign(new Error("On-call changed in another session. Reload before saving; your draft is preserved."), { statusCode: 409 });
      const oldProperties = current ? onCallSchema.parse(current.payload).properties : [];
      for (const property of input.data.properties) {
        if (property.mapFile && JSON.stringify(property.mapFile) !== JSON.stringify(oldProperties.find(old => old.id === property.id)?.mapFile)) throw Object.assign(new Error("Use the map upload control to attach a map to this property"), { statusCode: 400 });
      }
      if (input.externalEnabled && !newHash && !current?.accessHash) throw Object.assign(new Error("Set an access code before enabling external sharing"), { statusCode: 400 });
      const values = { version: input.version + 1, payload: input.data, externalEnabled: input.externalEnabled, accessHash: newHash ?? current?.accessHash ?? null, accessRevision: !current || newHash || input.revokeAccess || current.externalEnabled !== input.externalEnabled ? randomUUID() : current.accessRevision };
      const row = await db.onCallWorkspace.upsert({ where: { id: workspaceId }, create: { id: workspaceId, ...values }, update: values });
      await db.auditLog.create({ data: { actorUserId: request.currentUser!.id, entityType: "ON_CALL", entityId: workspaceId, action: "ON_CALL_UPDATED", message: "Updated the shared on-call workspace", metadata: { version: row.version, externalEnabled: row.externalEnabled, accessRevoked: current?.accessRevision !== row.accessRevision } } });
      return { version: row.version, data: input.data, schedule: onCallSchedule(input.data), externalEnabled: row.externalEnabled, hasAccessCode: Boolean(row.accessHash), canEdit: true, updatedAt: row.updatedAt };
    });
  });
}
export async function publicOnCallRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (_request, reply) => { noStore(reply); });
  app.get("/share/properties/:propertyId/map", async (request, reply) => {
    const row = await read();
    if (!row?.externalEnabled) return reply.code(404).send({ message: "On-call sharing is not enabled" });
    if (!guestExpiry(request, row.accessRevision)) return reply.code(403).send({ message: "Unlock property guides before downloading maps" });
    return downloadMap(z.object({ propertyId: z.string().uuid() }).parse(request.params).propertyId, row.payload, reply, request.query);
  });
  app.get("/share", async (request, reply) => {
    const row = await read();
    if (!row?.externalEnabled) return reply.code(404).send({ message: "On-call sharing is not enabled. Contact your coordinator." });
    const expiresAt = guestExpiry(request, row.accessRevision);
    const unlocked = expiresAt !== null;
    const data = onCallSchema.parse(row.payload);
    const schedule = onCallSchedule(data);
    // Coordination reasons never leave the staff workspace, even after guide unlock.
    const shared = { ...publicOnCall(data), ...(unlocked ? { properties: data.properties } : {}), shifts: schedule.shifts };
    return { data: shared, schedule, unlocked, expiresAt, updatedAt: row.updatedAt };
  });
  app.post("/unlock", async (request, reply) => {
    originOnly(request);
    const input = z.object({ code: z.string().min(1).max(100) }).strict().parse(request.body);
    const row = await read();
    if (!row?.externalEnabled || !row.accessHash) return reply.code(404).send({ message: "On-call sharing is not enabled" });
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
    if (!await verifyPassword(input.code, row.accessHash)) return reply.code(401).send({ message: "Incorrect access code" });
    reply.setCookie(cookieName, JSON.stringify({ revision: row.accessRevision, expiresAt: now + 8 * 60 * 60 * 1000 }), { ...cookieOptions(request), maxAge: 8 * 60 * 60 });
    return { ok: true };
  });
  app.post("/lock", async (request, reply) => {
    originOnly(request);
    reply.clearCookie(cookieName, cookieOptions(request));
    return { ok: true };
  });
}
