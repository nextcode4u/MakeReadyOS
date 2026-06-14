import type { FastifyInstance } from "fastify";
import type { RiskLevel, RiskReason } from "../lib/risk.js";
import { z } from "zod";
import { allowedPropertyIds } from "../lib/auth.js";
import { writeAuditLog } from "../lib/audit.js";
import { defaultRiskPolicy, evaluateAndPersistItemRisk, evaluateItemRisk, normalizeRiskPolicy, riskLevels } from "../lib/risk.js";
import { prisma } from "../lib/prisma.js";

export const riskQuerySchema = z.object({
  propertyId: z.string().optional(),
  level: z.enum(riskLevels).optional(),
  category: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const riskEvaluateSchema = z.object({
  propertyId: z.string().optional(),
  itemIds: z.array(z.string()).max(200).optional(),
  notify: z.boolean().optional().default(true),
});

export const riskPolicyPayloadSchema = z.object({
  moveInCriticalDays: z.number().int().min(0).max(30).optional(),
  moveInHighDays: z.number().int().min(0).max(60).optional(),
  moveInMediumDays: z.number().int().min(0).max(90).optional(),
  unassignedHighDays: z.number().int().min(0).max(90).optional(),
  staleActivityDays: z.number().int().min(1).max(90).optional(),
  agingMediumDays: z.number().int().min(1).max(365).optional(),
  agingHighDays: z.number().int().min(1).max(365).optional(),
  vendorNearMoveInDays: z.number().int().min(0).max(90).optional(),
  checklistNearMoveInDays: z.number().int().min(0).max(90).optional(),
  planningNearMoveInDays: z.number().int().min(0).max(90).optional(),
}).refine((value) => {
  const merged = normalizeRiskPolicy(value);
  return merged.moveInCriticalDays <= merged.moveInHighDays
    && merged.moveInHighDays <= merged.moveInMediumDays
    && merged.agingMediumDays <= merged.agingHighDays;
}, { message: "Risk thresholds must increase from critical to medium and medium aging to high aging." });

function assertPropertyScope(user: NonNullable<Parameters<typeof allowedPropertyIds>[0]>, propertyId?: string) {
  const accessible = allowedPropertyIds(user);
  if (propertyId && accessible !== null && !accessible.includes(propertyId)) return { denied: true as const, propertyId: undefined };
  return { denied: false as const, propertyId: propertyId ?? (accessible === null ? undefined : { in: accessible }) };
}

export async function riskRoutes(app: FastifyInstance) {
  app.get("/risk/policies", async (request, reply) => {
    const query = z.object({ propertyId: z.string().optional() }).parse(request.query);
    const scope = assertPropertyScope(request.currentUser!, query.propertyId);
    if (scope.denied) {
      reply.code(403);
      return { message: "Property access denied" };
    }
    const properties = await prisma.property.findMany({
      where: { id: scope.propertyId, isActive: true },
      include: { riskPolicy: true },
      orderBy: { code: "asc" },
    });
    return {
      defaults: defaultRiskPolicy,
      policies: properties.map((property) => ({
        property,
        policy: normalizeRiskPolicy(property.riskPolicy),
        customized: Boolean(property.riskPolicy),
      })),
    };
  });

  app.put("/risk/policies/:propertyId", async (request, reply) => {
    if (request.currentUser!.role !== "ADMIN" && request.currentUser!.role !== "MANAGER") {
      reply.code(403);
      return { message: "Manager or admin access required" };
    }
    const params = z.object({ propertyId: z.string() }).parse(request.params);
    const scope = assertPropertyScope(request.currentUser!, params.propertyId);
    if (scope.denied) {
      reply.code(403);
      return { message: "Property access denied" };
    }
    const payload = riskPolicyPayloadSchema.parse(request.body ?? {});
    const policy = await prisma.propertyRiskPolicy.upsert({
      where: { propertyId: params.propertyId },
      create: { propertyId: params.propertyId, ...normalizeRiskPolicy(payload) },
      update: payload,
    });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: params.propertyId,
      entityType: "RISK_POLICY",
      entityId: policy.id,
      action: "RISK_POLICY_UPDATED",
      message: "Updated property risk policy thresholds",
      metadata: { policy: normalizeRiskPolicy(policy) },
    });
    return { policy: normalizeRiskPolicy(policy) };
  });

  app.get("/risk/summary", async (request, reply) => {
    const query = riskQuerySchema.parse(request.query);
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
    const [policies, sections] = await Promise.all([
      prisma.propertyRiskPolicy.findMany({ where: { propertyId: scope.propertyId } }),
      prisma.boardSection.findMany({ where: { propertyId: scope.propertyId, isActive: true }, select: { propertyId: true, key: true, sectionType: true } }),
    ]);
    const policyByProperty = new Map(policies.map((policy) => [policy.propertyId, policy]));
    const sectionType = new Map(sections.map((section) => [`${section.propertyId}:${section.key}`, section.sectionType]));
    const evaluated = items.map((item) => ({
      item,
      risk: evaluateItemRisk({
        ...item,
        boardSectionType: sectionType.get(`${item.propertyId}:${item.boardGroup}`) ?? null,
      }, new Date(), policyByProperty.get(item.propertyId)),
    }));
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
    const query = riskQuerySchema.parse(request.query);
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
    const propertyIds = [...new Set(items.map((item) => item.propertyId))];
    const [policies, sections] = await Promise.all([
      prisma.propertyRiskPolicy.findMany({ where: { propertyId: { in: propertyIds } } }),
      prisma.boardSection.findMany({ where: { propertyId: { in: propertyIds }, isActive: true }, select: { propertyId: true, key: true, sectionType: true } }),
    ]);
    const policyByProperty = new Map(policies.map((policy) => [policy.propertyId, policy]));
    const sectionType = new Map(sections.map((section) => [`${section.propertyId}:${section.key}`, section.sectionType]));
    const evaluated = items.map((item) => ({
      ...item,
      ...evaluateItemRisk({
        ...item,
        boardSectionType: sectionType.get(`${item.propertyId}:${item.boardGroup}`) ?? null,
      }, new Date(), policyByProperty.get(item.propertyId)),
    }))
      .filter((item) => !query.category || item.riskReasons.some((reason) => reason.category === query.category));
    return { items: evaluated, pagination: { limit: query.limit, offset: query.offset, hasMore: items.length === query.limit } };
  });

  app.post("/risk/evaluate", async (request, reply) => {
    if (request.currentUser!.role !== "ADMIN" && request.currentUser!.role !== "MANAGER") {
      reply.code(403);
      return { message: "Manager or admin access required" };
    }
    const payload = riskEvaluateSchema.parse(request.body ?? {});
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
