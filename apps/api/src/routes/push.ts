import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ECDH } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { pushConfiguration, validPushEndpoint } from "../lib/push.js";

const endpointSchema = z.string().max(2048).refine(validPushEndpoint, "Unsupported push service");
const subscriptionSchema = z.object({
  endpoint: endpointSchema,
  keys: z.object({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}$/).refine(value => {
      try { const key = Buffer.from(value, "base64url"); return key[0] === 4 && ECDH.convertKey(key, "prime256v1").length === 65; }
      catch { return false; }
    }, "Invalid device encryption key"),
    auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  }),
});

export async function pushRoutes(app: FastifyInstance) {
  await app.register(async scoped => {
    scoped.addHook("preHandler", async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      if (request.authType !== "session" || !request.sessionId) return reply.code(403).send({ message: "Sign in to manage device notifications" });
    });
    scoped.get("/push", async request => ({
      configured: Boolean(pushConfiguration()),
      publicKey: pushConfiguration()?.publicKey ?? null,
      endpoints: (await prisma.pushSubscription.findMany({ where: { sessionId: request.sessionId! }, select: { endpoint: true } })).map(device => device.endpoint),
    }));
    scoped.post("/push", async (request, reply) => {
      if (!pushConfiguration()) return reply.code(503).send({ message: "Device notifications are not configured on this server" });
      const input = subscriptionSchema.parse(request.body);
      const sessionId = request.sessionId!;
      const saved = await prisma.$transaction(async db => {
        // Serialize ownership changes and device limits across simultaneous tabs.
        await db.$executeRaw`SELECT pg_advisory_xact_lock(824090, 2)`;
        const existing = await db.pushSubscription.findUnique({ where: { endpoint: input.endpoint }, include: { session: true } });
        if (existing && existing.session.userId !== request.currentUser!.id) return false;
        if (!existing && await db.pushSubscription.count({ where: { sessionId } }) >= 10) return false;
        await db.pushSubscription.upsert({ where: { endpoint: input.endpoint },
          create: { sessionId, endpoint: input.endpoint, ...input.keys },
          update: { sessionId, ...input.keys },
        });
        return true;
      });
      if (!saved) return reply.code(409).send({ message: "This browser belongs to another signed-in account, or its device limit was reached. Disable notifications in the previous account first." });
      return { ok: true };
    });
    scoped.delete("/push", async request => {
      const { endpoint } = z.object({ endpoint: endpointSchema }).parse(request.body);
      await prisma.pushSubscription.deleteMany({ where: { endpoint, sessionId: request.sessionId! } });
      return { ok: true };
    });
    scoped.post("/push/test", async (request, reply) => {
      if (!pushConfiguration()) return reply.code(503).send({ message: "Device notifications are not configured" });
      const { endpoint } = z.object({ endpoint: endpointSchema }).parse(request.body);
      const result = await prisma.$transaction(async db => {
        await db.$executeRaw`SELECT pg_advisory_xact_lock(824090, 3)`;
        const device = await db.pushSubscription.findFirst({ where: { endpoint, sessionId: request.sessionId! } });
        if (!device) return "missing";
        if (await db.notification.findFirst({ where: { userId: request.currentUser!.id, title: "Device notification test", createdAt: { gt: new Date(Date.now() - 60000) } } })) return "limited";
        const note = await db.notification.create({ data: { userId: request.currentUser!.id, category: "ASSIGNMENT", title: "Device notification test", message: "A test was requested for this device. Category preferences and quiet hours still apply.", pushPending: false } });
        await db.pushDelivery.create({ data: { notificationId: note.id, subscriptionId: device.id, eventAt: note.createdAt } });
        return "queued";
      });
      if (result === "missing") return reply.code(404).send({ message: "Enable notifications on this device first" });
      if (result === "limited") return reply.code(429).send({ message: "Wait one minute before another test" });
      return { ok: true };
    });
  });
}
