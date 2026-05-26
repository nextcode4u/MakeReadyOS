import { Prisma, UserRole } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { scopedAllowedPropertyIds } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";

const querySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    actorUserId: z.string().trim().min(1).optional(),
    action: z.string().trim().min(1).max(100).optional(),
    entityType: z.string().trim().min(1).max(100).optional(),
    entityId: z.string().trim().min(1).optional(),
    propertyId: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: "From date must be before or equal to to date",
    path: ["from"],
  });

export async function activityRoutes(app: FastifyInstance) {
  app.get("/activity", async (request, reply) => {
    const user = request.currentUser!;
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.MANAGER) {
      reply.code(403);
      return { message: "Manager or admin access required" };
    }

    const query = querySchema.parse(request.query);
    const propertyIds = scopedAllowedPropertyIds(request);
    if (propertyIds !== null && query.propertyId && !propertyIds.includes(query.propertyId)) {
      reply.code(403);
      return { message: "Property access denied" };
    }

    const scopeWhere: Prisma.AuditLogWhereInput = propertyIds === null
      ? {}
      : { propertyId: { in: propertyIds } };
    const where: Prisma.AuditLogWhereInput = {
      AND: [
        scopeWhere,
        {
          actorUserId: query.actorUserId,
          action: query.action,
          entityType: query.entityType,
          entityId: query.entityId,
          propertyId: query.propertyId,
          createdAt: query.from || query.to
            ? {
                gte: query.from,
                lte: query.to,
              }
            : undefined,
        },
      ],
    };

    const [total, activity, actorOptions, actionOptions, entityOptions, properties] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        include: {
          actorUser: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
          property: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: query.offset,
        take: query.limit,
      }),
      prisma.user.findMany({
        where: {
          auditLogs: {
            some: scopeWhere,
          },
        },
        select: {
          id: true,
          fullName: true,
          email: true,
        },
        orderBy: { fullName: "asc" },
      }),
      prisma.auditLog.findMany({
        where: scopeWhere,
        select: { action: true },
        distinct: ["action"],
        orderBy: { action: "asc" },
      }),
      prisma.auditLog.findMany({
        where: scopeWhere,
        select: { entityType: true },
        distinct: ["entityType"],
        orderBy: { entityType: "asc" },
      }),
      prisma.property.findMany({
        where: propertyIds === null ? undefined : { id: { in: propertyIds } },
        select: {
          id: true,
          name: true,
          code: true,
        },
        orderBy: { code: "asc" },
      }),
    ]);

    const itemIds = Array.from(new Set(activity.map((entry) => entry.entityId).filter((id): id is string => Boolean(id))));
    const items = itemIds.length > 0
      ? await prisma.makeReadyItem.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, unitNumber: true },
        })
      : [];
    const unitByEntityId = new Map(items.map((item) => [item.id, item.unitNumber]));

    return {
      activity: activity.map((entry) => ({
        id: entry.id,
        createdAt: entry.createdAt,
        actor: entry.actorUser,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        description: entry.message,
        property: entry.property,
        unitNumber: entry.entityId ? unitByEntityId.get(entry.entityId) ?? null : null,
      })),
      pagination: {
        total,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + activity.length < total,
      },
      filterOptions: {
        actors: actorOptions,
        actions: actionOptions.map((option) => option.action),
        entityTypes: entityOptions.map((option) => option.entityType),
        properties,
      },
    };
  });
}
