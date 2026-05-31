import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { notificationCategories } from "../lib/notifications.js";
import { prisma } from "../lib/prisma.js";

export const notificationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0),
  unreadOnly: z.enum(["true", "false"]).optional().transform((value) => value === "true"),
});

export async function notificationRoutes(app: FastifyInstance) {
  app.get("/notifications", async (request) => {
    const query = notificationQuerySchema.parse(request.query);
    const userId = request.currentUser!.id;
    const where = { userId, isRead: query.unreadOnly ? false : undefined };
    const [notifications, total, unreadCount, preferences] = await Promise.all([
      prisma.notification.findMany({
        where,
        include: { property: true, item: { select: { id: true, unitNumber: true } } },
        orderBy: { createdAt: "desc" },
        skip: query.offset,
        take: query.limit,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId, isRead: false } }),
      prisma.notificationPreference.findMany({ where: { userId } }),
    ]);
    return {
      notifications,
      unreadCount,
      preferences,
      categories: notificationCategories,
      pagination: { total, limit: query.limit, offset: query.offset, hasMore: query.offset + notifications.length < total },
    };
  });

  app.post("/notifications/:id/read", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const notification = await prisma.notification.findFirst({ where: { id, userId: request.currentUser!.id } });
    if (!notification) {
      reply.code(404);
      return { message: "Notification not found" };
    }
    await prisma.notification.update({ where: { id }, data: { isRead: true, readAt: new Date() } });
    return { ok: true };
  });

  app.post("/notifications/read-all", async (request) => {
    const result = await prisma.notification.updateMany({
      where: { userId: request.currentUser!.id, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { ok: true, count: result.count };
  });

  app.delete("/notifications/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const notification = await prisma.notification.findFirst({ where: { id, userId: request.currentUser!.id } });
    if (!notification) {
      reply.code(404);
      return { message: "Notification not found" };
    }
    await prisma.notification.delete({ where: { id } });
    return { ok: true };
  });

  app.patch("/notifications/preferences/:category", async (request, reply) => {
    const { category } = z.object({ category: z.enum(notificationCategories) }).parse(request.params);
    const { enabled } = z.object({ enabled: z.boolean() }).parse(request.body);
    const preference = await prisma.notificationPreference.upsert({
      where: { userId_category: { userId: request.currentUser!.id, category } },
      create: { userId: request.currentUser!.id, category, enabled },
      update: { enabled },
    });
    reply.code(200);
    return { preference };
  });
}
