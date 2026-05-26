import type { FastifyInstance } from "fastify";
import type { RiskLevel, RiskReason } from "../lib/risk.js";
import { z } from "zod";
import { allowedPropertyIds } from "../lib/auth.js";
import { writeAuditLog } from "../lib/audit.js";
import { evaluateAndPersistItemRisk, evaluateItemRisk, riskLevels } from "../lib/risk.js";
import { prisma } from "../lib/prisma.js";

const querySchema = z.object({
  propertyId: z.string().optional(),
  level: z.enum(riskLevels).optional(),
  category: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const evaluateSchema = z.object({
  propertyId: z.string().optional(),
  itemIds: z.array(z.string()).max(200).optional(),
  notify: z.boolean().optional().default(true),
});

function assertPropertyScope(user: NonNullable<Parameters<typeof allowedPropertyIds>[0]>, propertyId?: string) {
  const accessible = allowedPropertyIds(user);
  if (propertyId && accessible !== null && !accessible.includes(propertyId)) return { denied: true as const, propertyId: undefined };
  return { denied: false as const, propertyId: propertyId ?? (accessible === null ? undefined : { in: accessible }) };
}

export async function riskRoutes(app: FastifyInstance) {
  app.get("/risk/summary", async (request, reply) => {
    const query = querySchema.parse(request.query);
    const scope = assertPropertyScope(request.currentUser!, query.propertyId);
    if (scope.denied) {
      reply.code(403);
      return { message: "Property access denied" };
    }

    const items = await prisma.makeReadyItem.findMany({
      where: { propertyId: scope.propertyId, isArchived: false, property: { isActive: true } },
      include: {
        property: true,
        comments: { where: { isDeleted: false }, orderBy: { createdAt: "desc" }, take: 1 },
        checklistInstances: { include: { items: true } },
      },
    });
    const evaluated = items.map((item) => ({ item, risk: evaluateItemRisk(item) }));
    const byLevel = Object.fromEntries(riskLevels.map((level) => [level, evaluated.filter((entry) => entry.risk.riskLevel === level).length]));
    const byCategory = evaluated.reduce<Record<string, number>>((acc, entry) => {
      for (const reason of entry.risk.riskReasons) acc[reason.category] = (acc[reason.category] ?? 0) + 1;
      return acc;
    }, {});
    const byProperty = evaluated.reduce<Record<string, { total: number; highOrCritical: number }>>((acc, entry) => {
      const key = entry.item.property.code;
      acc[key] ??= { total: 0, highOrCritical: 0 };
      acc[key].total += 1;
      if (entry.risk.riskLevel === "HIGH" || entry.risk.riskLevel === "CRITICAL") acc[key].highOrCritical += 1;
      return acc;
    }, {});
    const byAssignedTech = evaluated.reduce<Record<string, { total: number; highOrCritical: number }>>((acc, entry) => {
      const key = entry.item.assignedTech || "Unassigned";
      acc[key] ??= { total: 0, highOrCritical: 0 };
      acc[key].total += 1;
      if (entry.risk.riskLevel === "HIGH" || entry.risk.riskLevel === "CRITICAL") acc[key].highOrCritical += 1;
      return acc;
    }, {});
    const topRiskItems = evaluated
      .filter((entry) => entry.risk.riskLevel !== "NONE")
      .sort((a, b) => b.risk.riskScore - a.risk.riskScore)
      .slice(0, 20)
      .map((entry) => ({
        itemId: entry.item.id,
        unitNumber: entry.item.unitNumber,
        property: entry.item.property,
        riskScore: entry.risk.riskScore,
        riskLevel: entry.risk.riskLevel,
        riskReasons: entry.risk.riskReasons,
      }));

    return {
      totals: {
        evaluated: evaluated.length,
        critical: byLevel.CRITICAL ?? 0,
        high: byLevel.HIGH ?? 0,
        medium: byLevel.MEDIUM ?? 0,
        low: byLevel.LOW ?? 0,
      },
      byLevel,
      byCategory,
      byProperty,
      byAssignedTech,
      topRiskItems,
      trend: { available: false, message: "Risk trend history is not stored yet; current risk is evaluated from live item state." },
    };
  });

  app.get("/risk/items", async (request, reply) => {
    const query = querySchema.parse(request.query);
    const scope = assertPropertyScope(request.currentUser!, query.propertyId);
    if (scope.denied) {
      reply.code(403);
      return { message: "Property access denied" };
    }
    const items = await prisma.makeReadyItem.findMany({
      where: {
        propertyId: scope.propertyId,
        isArchived: false,
        property: { isActive: true },
        riskLevel: query.level,
      },
      include: {
        property: true,
        unit: { include: { floorPlanRecord: true } },
        customFieldValues: true,
        comments: { where: { isDeleted: false }, orderBy: { createdAt: "desc" }, take: 1 },
        checklistInstances: { include: { items: true } },
      },
      orderBy: [{ riskScore: "desc" }, { moveInDate: "asc" }],
      skip: query.offset,
      take: query.limit,
    });
    const evaluated = items.map((item) => ({ ...item, ...evaluateItemRisk(item) }))
      .filter((item) => !query.category || item.riskReasons.some((reason) => reason.category === query.category));
    return { items: evaluated, pagination: { limit: query.limit, offset: query.offset, hasMore: items.length === query.limit } };
  });

  app.post("/risk/evaluate", async (request, reply) => {
    if (request.currentUser!.role !== "ADMIN" && request.currentUser!.role !== "MANAGER") {
      reply.code(403);
      return { message: "Manager or admin access required" };
    }
    const payload = evaluateSchema.parse(request.body ?? {});
    const scope = assertPropertyScope(request.currentUser!, payload.propertyId);
    if (scope.denied) {
      reply.code(403);
      return { message: "Property access denied" };
    }
    const ids = payload.itemIds?.length
      ? payload.itemIds
      : (await prisma.makeReadyItem.findMany({
          where: { propertyId: scope.propertyId, isArchived: false, property: { isActive: true } },
          select: { id: true },
          take: 500,
        })).map((item) => item.id);
    const items = await prisma.makeReadyItem.findMany({ where: { id: { in: ids } }, select: { id: true, propertyId: true } });
    const accessible = allowedPropertyIds(request.currentUser!);
    if (accessible !== null && items.some((item) => !accessible.includes(item.propertyId))) {
      reply.code(403);
      return { message: "Property access denied for one or more items" };
    }
    const results: Array<{ item: { id: string }; riskScore: number; riskLevel: RiskLevel; riskReasons: RiskReason[] }> = [];
    for (const item of items) {
      const result = await evaluateAndPersistItemRisk(item.id, { notify: payload.notify });
      if (result) results.push(result);
    }
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      entityType: "RISK",
      action: "RISK_EVALUATED",
      message: `Evaluated risk for ${results.length} make-ready items`,
      propertyId: payload.propertyId,
      metadata: { itemIds: ids, notify: payload.notify },
    });
    return {
      evaluated: results.length,
      byLevel: Object.fromEntries(riskLevels.map((level) => [level, results.filter((entry) => entry.riskLevel === level).length])),
      items: results.map((entry) => ({
        itemId: entry.item.id,
        riskScore: entry.riskScore,
        riskLevel: entry.riskLevel,
        riskReasons: entry.riskReasons,
      })),
    };
  });
}
