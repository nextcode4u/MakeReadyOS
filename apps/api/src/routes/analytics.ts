import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireManagerOrAdmin, scopedAllowedPropertyIds } from "../lib/auth.js";
import { analyticsSummary, completionDateForItem, runAnalyticsSnapshot } from "../lib/analytics.js";
import { prisma } from "../lib/prisma.js";

export const analyticsPropertyQuerySchema = z.object({ propertyId: z.string().optional() });
export const analyticsSnapshotQuerySchema = z.object({
  propertyId: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(365).default(60),
  offset: z.coerce.number().int().min(0).default(0),
});

function allowedPropertyWhere(accessible: string[] | null, propertyId?: string) {
  return propertyId ?? (accessible === null ? undefined : { in: accessible });
}

function event(type: string, occurredAt: Date, title: string, description: string, source: string, metadata: Record<string, unknown> = {}) {
  return { type, occurredAt, title, description, source, metadata };
}

function turnDuration(item: { createdAt: Date; vacatedDate?: Date | null; updatedAt: Date; archivedAt?: Date | null; moveInDate?: Date | null; completionStatus?: string | null; makeReadyStatus?: string | null; cleaningStatus?: string | null }) {
  const completedAt = completionDateForItem(item);
  const start = item.vacatedDate ?? item.createdAt;
  if (!completedAt) return null;
  return Math.max(0, Math.ceil((completedAt.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
}

export async function analyticsRoutes(app: FastifyInstance) {
  app.get("/analytics/summary", async (request, reply) => {
    const query = analyticsPropertyQuerySchema.parse(request.query);
    const accessible = scopedAllowedPropertyIds(request);
    if (query.propertyId && accessible !== null && !accessible.includes(query.propertyId)) {
      reply.code(403);
      return { message: "Property access denied" };
    }
    return analyticsSummary(allowedPropertyWhere(accessible, query.propertyId));
  });

  app.get("/analytics/snapshots", async (request, reply) => {
    const query = analyticsSnapshotQuerySchema.parse(request.query);
    const accessible = scopedAllowedPropertyIds(request);
    if (query.propertyId && accessible !== null && !accessible.includes(query.propertyId)) {
      reply.code(403);
      return { message: "Property access denied" };
    }
    const where = {
      propertyId: allowedPropertyWhere(accessible, query.propertyId),
      date: {
        gte: query.from,
        lte: query.to,
      },
    };
    const [snapshots, total] = await Promise.all([
      prisma.propertyDailyMetricSnapshot.findMany({
        where,
        include: { property: true },
        orderBy: [{ date: "desc" }, { propertyId: "asc" }],
        take: query.limit,
        skip: query.offset,
      }),
      prisma.propertyDailyMetricSnapshot.count({ where }),
    ]);
    return { snapshots, pagination: { total, limit: query.limit, offset: query.offset, hasMore: query.offset + snapshots.length < total } };
  });

  app.post("/analytics/snapshot/run", { preHandler: requireManagerOrAdmin }, async (request, reply) => {
    const query = analyticsPropertyQuerySchema.parse(request.query);
    const accessible = scopedAllowedPropertyIds(request);
    if (query.propertyId && accessible !== null && !accessible.includes(query.propertyId)) {
      reply.code(403);
      return { message: "Property access denied" };
    }
    const propertyIds = query.propertyId ? [query.propertyId] : accessible ?? undefined;
    return runAnalyticsSnapshot(propertyIds ?? undefined);
  });

  app.get("/units/:id/history", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const accessible = scopedAllowedPropertyIds(request);
    const unit = await prisma.unit.findUnique({
      where: { id: params.id },
      include: { property: true, floorPlanRecord: true },
    });
    if (!unit) {
      reply.code(404);
      return { message: "Unit not found" };
    }
    if (accessible !== null && !accessible.includes(unit.propertyId)) {
      reply.code(403);
      return { message: "Property access denied" };
    }

    const items = await prisma.makeReadyItem.findMany({
      where: { OR: [{ unitId: unit.id }, { propertyId: unit.propertyId, unitNumber: unit.number }] },
      include: {
        property: true,
        comments: { where: { isDeleted: false }, orderBy: { createdAt: "desc" } },
        attachments: { orderBy: { createdAt: "desc" } },
        checklistInstances: { include: { items: { include: { completedBy: true } } } },
        vendorAssignments: { include: { vendor: true } },
        automationRuns: { orderBy: { ranAt: "desc" }, take: 20, include: { rule: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    const itemIds = items.map((item) => item.id);
    const audit = await prisma.auditLog.findMany({
      where: {
        propertyId: unit.propertyId,
        OR: [
          { entityType: "UNIT", entityId: unit.id },
          { entityType: "MAKE_READY_ITEM", entityId: { in: itemIds } },
        ],
      },
      include: { actorUser: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const events = [
      event("UNIT_CREATED", unit.createdAt, "Unit created", `${unit.property.code} ${unit.number} entered the directory.`, "unit", { unitId: unit.id }),
      ...items.flatMap((item) => [
        event("TURN_CREATED", item.createdAt, "Make-ready item created", `${item.property.code} ${item.unitNumber} turn was created.`, "makeReadyItem", { itemId: item.id }),
        ...(item.isArchived && item.archivedAt ? [event("ARCHIVED", item.archivedAt, "Turn archived", `${item.unitNumber} moved out of active workflow.`, "makeReadyItem", { itemId: item.id })] : []),
        ...(item.moveOutDate ? [event("MOVE_OUT_DATE", item.moveOutDate, "Move-out / NTV date", `${item.unitNumber} has a notice/move-out date.`, "makeReadyItem", { itemId: item.id })] : []),
        ...(item.vacatedDate ? [event("VACATED", item.vacatedDate, "Vacated", `${item.unitNumber} vacated/possession date reached.`, "makeReadyItem", { itemId: item.id })] : []),
        ...(item.makeReadyDate ? [event("MAKE_READY_DATE", item.makeReadyDate, "Make-ready scheduled", `${item.unitNumber} make-ready work scheduled.`, "makeReadyItem", { itemId: item.id })] : []),
        ...(item.moveInDate ? [event("MOVE_IN_DATE", item.moveInDate, "Move-in scheduled", `${item.unitNumber} move-in scheduled.`, "makeReadyItem", { itemId: item.id })] : []),
        ...(item.riskLevel !== "NONE" ? [event("RISK_LEVEL", item.lastRiskEvaluatedAt ?? item.updatedAt, `${item.riskLevel} risk`, `${item.unitNumber} risk score ${item.riskScore}.`, "risk", { itemId: item.id, riskLevel: item.riskLevel, riskScore: item.riskScore, riskReasons: item.riskReasons })] : []),
        ...item.comments.map((comment) => event("COMMENT", comment.createdAt, "Comment/update", comment.body, "comment", { itemId: item.id, commentId: comment.id, authorName: comment.authorName })),
        ...item.attachments.map((attachment) => event("ATTACHMENT", attachment.createdAt, "Attachment uploaded", attachment.originalName, "attachment", { itemId: item.id, attachmentId: attachment.id })),
        ...item.vendorAssignments.map((assignment) => event("VENDOR_ASSIGNMENT", assignment.updatedAt, `Vendor ${assignment.status.toLowerCase().replace(/_/g, " ")}`, `${assignment.vendor.name} / ${assignment.trade}`, "vendor", { itemId: item.id, vendorAssignmentId: assignment.id })),
        ...item.checklistInstances.flatMap((instance) => instance.items.filter((task) => task.completed && task.completedAt).map((task) => event("CHECKLIST_COMPLETED", task.completedAt!, "Checklist task completed", `${instance.name}: ${task.title}`, "checklist", { itemId: item.id, taskId: task.id, completedBy: task.completedBy?.fullName ?? null }))),
        ...item.automationRuns.map((run) => event("AUTOMATION_RUN", run.ranAt, "Automation run", `${run.rule.name}: ${run.message}`, "automation", { itemId: item.id, ruleId: run.ruleId })),
      ]),
      ...audit.map((entry) => event(entry.action, entry.createdAt, entry.action.replace(/_/g, " "), entry.message, "audit", { auditId: entry.id, actor: entry.actorUser?.fullName ?? null, entityType: entry.entityType, entityId: entry.entityId })),
    ].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

    const turns = items.map((item) => {
      const checklistTasks = item.checklistInstances.flatMap((instance) => instance.items);
      return {
        itemId: item.id,
        current: !item.isArchived,
        createdAt: item.createdAt,
        vacatedDate: item.vacatedDate,
        makeReadyDate: item.makeReadyDate,
        moveInDate: item.moveInDate,
        completedAt: completionDateForItem(item),
        daysVacant: item.daysVacant,
        turnDuration: turnDuration(item),
        riskLevel: item.riskLevel,
        assignedTech: item.assignedTech,
        vendorWorkCount: item.vendorAssignments.length,
        checklistCompletionPercent: checklistTasks.length ? Math.round(checklistTasks.filter((task) => task.completed).length / checklistTasks.length * 100) : 0,
      };
    });
    const recurringSignals = {
      pest: items.filter((item) => item.pestStatus && !["NONE", "TREATED"].includes(item.pestStatus)).length,
      flooring: items.filter((item) => item.floorsStatus && item.floorsStatus !== "GOOD").length,
      paint: items.filter((item) => item.paintStatus && item.paintStatus !== "GOOD").length,
      vendor: items.filter((item) => item.vendorAssignments.length > 0).length,
      highRisk: items.filter((item) => ["HIGH", "CRITICAL"].includes(item.riskLevel)).length,
    };
    return { unit, turns, recurringSignals, events: events.slice(0, 250) };
  });
}
