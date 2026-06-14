import { Prisma, UserRole } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
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

const dailyReportQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  propertyId: z.string().trim().min(1).optional(),
  timezoneOffsetMinutes: z.coerce.number().int().min(-840).max(840).default(0),
});

type DailyReportCategory =
  | "markedReady"
  | "availability"
  | "archived"
  | "restored"
  | "created"
  | "updated"
  | "exception";

function reportDayRange(dateValue: string | undefined, timezoneOffsetMinutes: number) {
  const date = dateValue ?? new Date().toISOString().slice(0, 10);
  const [year, month, day] = date.split("-").map(Number);
  const startMs = Date.UTC(year, month - 1, day) + timezoneOffsetMinutes * 60_000;
  const start = new Date(startMs);
  const end = new Date(startMs + 24 * 60 * 60 * 1000);
  return { date, start, end };
}

function normalizeAction(value: string) {
  return value.toUpperCase();
}

function categorizeReportAction(action: string, message: string): DailyReportCategory {
  const normalized = normalizeAction(action);
  const text = `${normalized} ${message.toUpperCase()}`;
  if (text.includes("READY") && (text.includes("MARK") || text.includes("MOVED TO READY"))) return "markedReady";
  if (normalized.includes("AVAILABILITY")) return "availability";
  if (normalized.includes("ARCHIVED")) return "archived";
  if (normalized.includes("RESTORED")) return "restored";
  if (normalized.includes("CREATED")) return "created";
  if (
    text.includes("RISK")
    || text.includes("WARNING")
    || text.includes("OVERDUE")
    || text.includes("MISSING")
    || text.includes("FAILED")
    || text.includes("FINAL WALK")
    || text.includes("PREWALK")
    || text.includes("PRE-WALK")
  ) return "exception";
  return "updated";
}

function externalActionHint(category: DailyReportCategory) {
  switch (category) {
    case "markedReady":
      return "Update external property system: unit is ready / available.";
    case "availability":
      return "Compare imported availability against the local board.";
    case "archived":
      return "Confirm move-in / occupied status externally if applicable.";
    case "restored":
      return "Review restored turn before external updates.";
    case "created":
      return "Review newly active turn and external availability status.";
    case "exception":
      return "Manager review needed before external update.";
    case "updated":
    default:
      return "Review changed board fields for external system updates.";
  }
}

function csvEscape(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

export async function activityRoutes(app: FastifyInstance) {
  async function buildDailyReport(request: FastifyRequest, reply: FastifyReply) {
    const user = request.currentUser!;
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.MANAGER) {
      reply.code(403);
      return { message: "Manager or admin access required" };
    }

    const query = dailyReportQuerySchema.parse(request.query);
    const propertyIds = scopedAllowedPropertyIds(request);
    if (propertyIds !== null && query.propertyId && !propertyIds.includes(query.propertyId)) {
      reply.code(403);
      return { message: "Property access denied" };
    }

    const { date, start, end } = reportDayRange(query.date, query.timezoneOffsetMinutes);
    const scopeWhere: Prisma.AuditLogWhereInput = propertyIds === null ? {} : { propertyId: { in: propertyIds } };
    const where: Prisma.AuditLogWhereInput = {
      AND: [
        scopeWhere,
        {
          propertyId: query.propertyId,
          createdAt: { gte: start, lt: end },
        },
      ],
    };

    const [activity, properties] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          actorUser: { select: { id: true, fullName: true, email: true } },
          property: { select: { id: true, name: true, code: true } },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 500,
      }),
      prisma.property.findMany({
        where: propertyIds === null ? undefined : { id: { in: propertyIds } },
        select: { id: true, name: true, code: true },
        orderBy: { code: "asc" },
      }),
    ]);

    const itemIds = Array.from(new Set(activity.map((entry) => entry.entityId).filter((id): id is string => Boolean(id))));
    const items = itemIds.length > 0
      ? await prisma.makeReadyItem.findMany({
          where: { id: { in: itemIds } },
          select: {
            id: true,
            unitNumber: true,
            applicant: true,
            vacancyStatus: true,
            boardGroup: true,
            riskLevel: true,
            moveOutDate: true,
            vacatedDate: true,
            makeReadyDate: true,
            moveInDate: true,
            isArchived: true,
          },
        })
      : [];
    const itemById = new Map(items.map((item) => [item.id, item]));

    const records = activity.map((entry) => {
      const item = entry.entityId ? itemById.get(entry.entityId) : null;
      const category = categorizeReportAction(entry.action, entry.message);
      return {
        id: entry.id,
        at: entry.createdAt,
        category,
        action: entry.action,
        description: entry.message,
        actor: entry.actorUser ? { id: entry.actorUser.id, fullName: entry.actorUser.fullName, email: entry.actorUser.email } : null,
        property: entry.property,
        itemId: item?.id ?? (entry.entityType === "MAKE_READY_ITEM" ? entry.entityId : null),
        unitNumber: item?.unitNumber ?? null,
        applicant: item?.applicant ?? null,
        vacancyStatus: item?.vacancyStatus ?? null,
        boardGroup: item?.boardGroup ?? null,
        riskLevel: item?.riskLevel ?? null,
        moveOutDate: item?.moveOutDate ?? null,
        vacatedDate: item?.vacatedDate ?? null,
        makeReadyDate: item?.makeReadyDate ?? null,
        moveInDate: item?.moveInDate ?? null,
        isArchived: item?.isArchived ?? null,
        externalActionHint: externalActionHint(category),
      };
    });

    const summary = records.reduce((counts, record) => {
      counts.totalChanges += 1;
      counts[record.category] += 1;
      return counts;
    }, {
      totalChanges: 0,
      markedReady: 0,
      availability: 0,
      archived: 0,
      restored: 0,
      created: 0,
      updated: 0,
      exception: 0,
    } satisfies Record<DailyReportCategory | "totalChanges", number>);

    return {
      date,
      range: { from: start, to: end },
      summary,
      records,
      filterOptions: { properties },
    };
  }

  app.get("/activity/daily-report", async (request, reply) => buildDailyReport(request, reply));

  app.get("/activity/daily-report.csv", async (request, reply) => {
    const report = await buildDailyReport(request, reply);
    if ("message" in report) return report;
    const rows = [
      ["Date", "Time", "Category", "Property", "Unit", "Applicant", "Vacancy", "Section", "Risk", "Action", "Description", "External update hint", "Actor"],
      ...report.records.map((record) => [
        report.date,
        record.at.toISOString(),
        record.category,
        record.property ? `${record.property.code} - ${record.property.name}` : "",
        record.unitNumber ?? "",
        record.applicant ?? "",
        record.vacancyStatus ?? "",
        record.boardGroup ?? "",
        record.riskLevel ?? "",
        record.action,
        record.description,
        record.externalActionHint,
        record.actor?.fullName ?? "System / unknown",
      ]),
    ];
    const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
    reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="makereadyos-daily-report-${report.date}.csv"`);
    return csv;
  });

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
