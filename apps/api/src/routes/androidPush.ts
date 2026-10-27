import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { fcmConfiguration } from "../lib/fcm.js";

const binding = z.string().uuid();
const schema = z.object({ token: z.string().min(20).max(4096).regex(/^[A-Za-z0-9_:\-]+$/),
  bindingId: binding, projectId: z.string().max(100), sessionKey: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const androidSessionKey = (sessionId: string) => createHash("sha256").update("android-push:" + sessionId).digest("hex");
export const androidEndpoint = (token: string) => "android:" + createHash("sha256").update(token).digest("hex");

export async function androidPushRoutes(app: FastifyInstance, configuration = fcmConfiguration) {
  await app.register(async scoped => {
    scoped.addHook("preHandler", async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      if (request.authType !== "session" || !request.sessionId || !request.currentUser) return reply.code(403).send({ message: "Sign in to manage Android notifications" });
    });
    scoped.get("/push/android", async request => {
      const config = configuration();
      return { configured: Boolean(config), projectId: config?.projectId ?? null,
        sessionKey: androidSessionKey(request.sessionId!),
        bindings: (await prisma.pushSubscription.findMany({ where: { sessionId: request.sessionId!, transport: "ANDROID" }, select: { bindingId: true } })).map(d => d.bindingId) };
    });
    scoped.post("/push/android", async (request, reply) => {
      const config = configuration();
      if (!config) return reply.code(503).send({ message: "Android delivery is not configured on this server" });
      const input = schema.parse(request.body);
      if (input.projectId !== config.projectId || input.sessionKey !== androidSessionKey(request.sessionId!)) return reply.code(409).send({ message: "Device project or sign-in session changed. Recheck notifications." });
      const endpoint = androidEndpoint(input.token);
      const expiresAt = await prisma.$transaction(async db => {
        await db.$executeRaw`SELECT pg_advisory_xact_lock(824090, 2)`;
        const session = await db.session.findUnique({ where: { id: request.sessionId! } });
        if (!session || session.expiresAt <= new Date() || session.userId !== request.currentUser!.id) return null;
        const existing = await db.pushSubscription.findUnique({ where: { endpoint }, include: { session: true } });
        if (existing && existing.session.userId !== session.userId && existing.session.expiresAt > new Date()) return null;
        if (!existing && await db.pushSubscription.count({ where: { sessionId: session.id } }) >= 10) return null;
        // Token rotation retains the device binding but removes the superseded token and jobs.
        await db.pushSubscription.deleteMany({ where: { sessionId: session.id, transport: "ANDROID", bindingId: input.bindingId, endpoint: { not: endpoint } } });
        // Superseded bindings must not inherit pending deliveries for an older account/session.
        if (existing && (existing.bindingId !== input.bindingId || existing.sessionId !== session.id)) await db.pushSubscription.delete({ where: { id: existing.id } });
        const data = { sessionId: session.id, transport: "ANDROID", fcmToken: input.token, fcmProjectId: config.projectId, bindingId: input.bindingId, p256dh: "", auth: "" };
        await db.pushSubscription.upsert({ where: { endpoint }, create: { endpoint, ...data }, update: data });
        return session.expiresAt;
      });
      if (!expiresAt) return reply.code(409).send({ message: "Device belongs to another active account, the session expired, or the device limit was reached" });
      return { ok: true, bindingId: input.bindingId, expiresAt: expiresAt.getTime() };
    });
    scoped.delete("/push/android", async request => {
      const input = z.object({ bindingId: binding }).strict().parse(request.body);
      await prisma.pushSubscription.deleteMany({ where: { transport: "ANDROID", sessionId: request.sessionId!, bindingId: input.bindingId } });
      return { ok: true };
    });
    scoped.post("/push/android/test", async (request, reply) => {
      if (!configuration()) return reply.code(503).send({ message: "Android delivery is not configured" });
      const { bindingId } = z.object({ bindingId: binding }).strict().parse(request.body);
      const result = await prisma.$transaction(async db => {
        await db.$executeRaw`SELECT pg_advisory_xact_lock(824090, 3)`;
        const device = await db.pushSubscription.findFirst({ where: { transport: "ANDROID", sessionId: request.sessionId!, bindingId } });
        if (!device) return "missing";
        if (await db.notification.findFirst({ where: { userId: request.currentUser!.id, title: "Device notification test", createdAt: { gt: new Date(Date.now() - 60000) } } })) return "limited";
        const note = await db.notification.create({ data: { userId: request.currentUser!.id, category: "ASSIGNMENT", title: "Device notification test", message: "Android test requested. Preferences and quiet hours apply.", pushPending: false } });
        await db.pushDelivery.create({ data: { notificationId: note.id, subscriptionId: device.id, eventAt: note.createdAt } });
        return "queued";
      });
      if (result === "missing") return reply.code(404).send({ message: "Enable this device first" });
      if (result === "limited") return reply.code(429).send({ message: "Wait one minute before another test" });
      return { ok: true };
    });
  });
}
