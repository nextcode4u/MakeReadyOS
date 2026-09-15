import { createHmac, randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authConfig, deriveRequestOrigin, validateTrustedOrigin } from "../lib/config.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { emptyOnCall, onCallSchema, publicOnCall } from "../lib/onCall.js";

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
  app.get("/on-call", async (request, reply) => {
    sessionOnly(request); noStore(reply);
    const row = await read();
    return { version: row?.version ?? 0, data: row ? onCallSchema.parse(row.payload) : emptyOnCall(), externalEnabled: row?.externalEnabled ?? false, hasAccessCode: Boolean(row?.accessHash), canEdit: ["ADMIN", "MANAGER"].includes(request.currentUser!.role), updatedAt: row?.updatedAt ?? null };
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
      if (input.externalEnabled && !newHash && !current?.accessHash) throw Object.assign(new Error("Set an access code before enabling external sharing"), { statusCode: 400 });
      const values = { version: input.version + 1, payload: input.data, externalEnabled: input.externalEnabled, accessHash: newHash ?? current?.accessHash ?? null, accessRevision: !current || newHash || input.revokeAccess || current.externalEnabled !== input.externalEnabled ? randomUUID() : current.accessRevision };
      const row = await db.onCallWorkspace.upsert({ where: { id: workspaceId }, create: { id: workspaceId, ...values }, update: values });
      await db.auditLog.create({ data: { actorUserId: request.currentUser!.id, entityType: "ON_CALL", entityId: workspaceId, action: "ON_CALL_UPDATED", message: "Updated the shared on-call workspace", metadata: { version: row.version, externalEnabled: row.externalEnabled, accessRevoked: current?.accessRevision !== row.accessRevision } } });
      return { version: row.version, data: input.data, externalEnabled: row.externalEnabled, hasAccessCode: Boolean(row.accessHash), canEdit: true, updatedAt: row.updatedAt };
    });
  });
}
export async function publicOnCallRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (_request, reply) => { noStore(reply); });
  app.get("/share", async (request, reply) => {
    const row = await read();
    if (!row?.externalEnabled) return reply.code(404).send({ message: "On-call sharing is not enabled. Contact your coordinator." });
    let unlocked = false;
    let expiresAt: number | null = null;
    const signed = request.cookies[cookieName];
    if (signed) {
      const result = request.unsignCookie(signed);
      if (result.valid && result.value) {
        const ticket = z.object({ revision: z.string().uuid(), expiresAt: z.number() }).safeParse((() => { try { return JSON.parse(result.value); } catch { return null; } })());
        if (ticket.success && ticket.data.revision === row.accessRevision && ticket.data.expiresAt > Date.now()) { unlocked = true; expiresAt = ticket.data.expiresAt; }
      }
    }
    const data = onCallSchema.parse(row.payload);
    return { data: unlocked ? data : publicOnCall(data), unlocked, expiresAt, updatedAt: row.updatedAt };
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
