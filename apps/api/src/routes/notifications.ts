import type { FastifyInstance } from "fastify";
import { UserRole } from "@prisma/client";
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
    const accessiblePropertyIds = request.currentUser!.role === UserRole.ADMIN
      ? undefined
      : request.currentUser!.propertyAccess.map((access) => access.propertyId);
    const where = { userId, isRead: query.unreadOnly ? false : undefined };
    const [notifications, total, unreadCount, preferences, settings, properties] = await Promise.all([
      prisma.notification.findMany({
        where,
        include: { property: true, item: { select: { id: true, unitNumber: true } } },
        orderBy: { createdAt: "desc" },
        skip: query.offset,
        take: query.limit,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId, isRead: false } }),
      prisma.notificationPreference.findMany({ where: { userId }, orderBy: [{ propertyId: "asc" }, { category: "asc" }] }),
      prisma.userNotificationSettings.findUnique({ where: { userId } }),
      prisma.property.findMany({
        where: accessiblePropertyIds ? { id: { in: accessiblePropertyIds }, isActive: true } : { isActive: true },
        select: { id: true, code: true, name: true },
        orderBy: [{ code: "asc" }],
      }),
    ]);
    return {
      notifications,
      unreadCount,
      preferences,
      settings: settings ?? { quietHoursEnabled: false, quietHoursStartMinute: 1320, quietHoursEndMinute: 420 },
      properties,
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
    const { enabled, propertyId } = z.object({
      enabled: z.boolean(),
      propertyId: z.string().cuid().nullable().optional(),
    }).parse(request.body);
    if (propertyId) {
      const allowed = request.currentUser!.role === UserRole.ADMIN
        || request.currentUser!.propertyAccess.some((access) => access.propertyId === propertyId);
      if (!allowed) {
        reply.code(403);
        return { message: "Property not allowed" };
      }
    }
    const scopeKey = propertyId ? `PROPERTY:${propertyId}` : "GLOBAL";
    const preference = await prisma.notificationPreference.upsert({
      where: { userId_category_scopeKey: { userId: request.currentUser!.id, category, scopeKey } },
      create: { userId: request.currentUser!.id, category, scopeKey, propertyId: propertyId ?? null, enabled },
      update: { enabled, propertyId: propertyId ?? null },
    });
    reply.code(200);
    return { preference };
  });

  app.patch("/notifications/settings", async (request, reply) => {
    const payload = z.object({
      quietHoursEnabled: z.boolean(),
      quietHoursStartMinute: z.number().int().min(0).max(1439),
      quietHoursEndMinute: z.number().int().min(0).max(1439),
    }).parse(request.body);
    const settings = await prisma.userNotificationSettings.upsert({
      where: { userId: request.currentUser!.id },
      create: {
        userId: request.currentUser!.id,
        quietHoursEnabled: payload.quietHoursEnabled,
        quietHoursStartMinute: payload.quietHoursStartMinute,
        quietHoursEndMinute: payload.quietHoursEndMinute,
      },
      update: {
        quietHoursEnabled: payload.quietHoursEnabled,
        quietHoursStartMinute: payload.quietHoursStartMinute,
        quietHoursEndMinute: payload.quietHoursEndMinute,
      },
    });
    reply.code(200);
    return { settings };
  });
}
