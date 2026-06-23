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

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export async function activityRoutes(app: FastifyInstance) {
  async function buildDailyReport(request: FastifyRequest, reply: FastifyReply) {
    const user = request.currentUser!;
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.MANAGER && user.role !== UserRole.LEASING) {
      reply.code(403);
      return { message: "Manager, leasing, or admin access required" };
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
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.MANAGER && user.role !== UserRole.LEASING) {
      reply.code(403);
      return { message: "Manager, leasing, or admin access required" };
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

    const entityIdsByType = activity.reduce<Record<string, string[]>>((acc, entry) => {
      if (!entry.entityId) return acc;
      (acc[entry.entityType] ??= []).push(entry.entityId);
      return acc;
    }, {});
    const uniqueIds = (entityType: string) => Array.from(new Set(entityIdsByType[entityType] ?? []));

    const [
      items,
      projectRecords,
      pestIssues,
      leaseIssues,
      pmTasks,
      pmTemplates,
      poolEntries,
      poolFacilities,
      mapPins,
      mapAreas,
      mapFiles,
      wikiEntries,
      wikiVendors,
      wikiAssets,
      vendors,
      workBlocks,
      boardSections,
      floorPlans,
      scheduleTracks,
      savedViews,
      customFields,
      propertiesAsEntities,
      units,
      automationRules,
      webhookEndpoints,
      apiTokens,
    ] = await Promise.all([
      uniqueIds("MAKE_READY_ITEM").length
        ? prisma.makeReadyItem.findMany({ where: { id: { in: uniqueIds("MAKE_READY_ITEM") } }, select: { id: true, unitNumber: true, boardGroup: true } })
        : Promise.resolve([]),
      uniqueIds("PROJECT_RECORD").length
        ? prisma.projectRecord.findMany({ where: { id: { in: uniqueIds("PROJECT_RECORD") } }, select: { id: true, title: true, recordType: true } })
        : Promise.resolve([]),
      uniqueIds("PEST_ISSUE").length
        ? prisma.pestIssue.findMany({ where: { id: { in: uniqueIds("PEST_ISSUE") } }, select: { id: true, pestType: true, area: true, building: true, unit: { select: { number: true } }, makeReadyItem: { select: { unitNumber: true } } } })
        : Promise.resolve([]),
      uniqueIds("LEASE_COMPLIANCE_ISSUE").length
        ? prisma.leaseComplianceIssue.findMany({ where: { id: { in: uniqueIds("LEASE_COMPLIANCE_ISSUE") } }, select: { id: true, issueTypeName: true, area: true, building: true, unit: { select: { number: true } } } })
        : Promise.resolve([]),
      uniqueIds("PM_TASK").length
        ? prisma.preventiveMaintenanceTask.findMany({ where: { id: { in: uniqueIds("PM_TASK") } }, select: { id: true, taskName: true, category: true } })
        : Promise.resolve([]),
      uniqueIds("PM_TEMPLATE").length
        ? prisma.preventiveMaintenanceTemplate.findMany({ where: { id: { in: uniqueIds("PM_TEMPLATE") } }, select: { id: true, name: true, category: true } })
        : Promise.resolve([]),
      uniqueIds("PoolLogEntry").length
        ? prisma.poolLogEntry.findMany({ where: { id: { in: uniqueIds("PoolLogEntry") } }, select: { id: true, logDate: true, facility: { select: { name: true } } } })
        : Promise.resolve([]),
      uniqueIds("PoolFacility").length
        ? prisma.poolFacility.findMany({ where: { id: { in: uniqueIds("PoolFacility") } }, select: { id: true, name: true, type: true } })
        : Promise.resolve([]),
      uniqueIds("PROPERTY_MAP_PIN").length
        ? prisma.propertyMapPin.findMany({ where: { id: { in: uniqueIds("PROPERTY_MAP_PIN") } }, select: { id: true, title: true, pinType: true } })
        : Promise.resolve([]),
      uniqueIds("PROPERTY_MAP_AREA").length
        ? prisma.propertyMapArea.findMany({ where: { id: { in: uniqueIds("PROPERTY_MAP_AREA") } }, select: { id: true, name: true } })
        : Promise.resolve([]),
      uniqueIds("PROPERTY_MAP").length
        ? prisma.propertyMap.findMany({ where: { id: { in: uniqueIds("PROPERTY_MAP") } }, select: { id: true, name: true } })
        : Promise.resolve([]),
      uniqueIds("PROPERTY_WIKI_ENTRY").length
        ? prisma.propertyWikiEntry.findMany({ where: { id: { in: uniqueIds("PROPERTY_WIKI_ENTRY") } }, select: { id: true, title: true, section: true } })
        : Promise.resolve([]),
      uniqueIds("PROPERTY_WIKI_VENDOR").length
        ? prisma.propertyWikiVendor.findMany({ where: { id: { in: uniqueIds("PROPERTY_WIKI_VENDOR") } }, select: { id: true, companyName: true, vendorType: true } })
        : Promise.resolve([]),
      uniqueIds("PROPERTY_WIKI_ASSET").length
        ? prisma.propertyWikiAsset.findMany({ where: { id: { in: uniqueIds("PROPERTY_WIKI_ASSET") } }, select: { id: true, title: true, kind: true } })
        : Promise.resolve([]),
      uniqueIds("VENDOR").length
        ? prisma.vendor.findMany({ where: { id: { in: uniqueIds("VENDOR") } }, select: { id: true, name: true, trade: true } })
        : Promise.resolve([]),
      uniqueIds("WORK_ASSIGNMENT_BLOCK").length
        ? prisma.workAssignmentBlock.findMany({ where: { id: { in: uniqueIds("WORK_ASSIGNMENT_BLOCK") } }, select: { id: true, category: true, item: { select: { unitNumber: true } } } })
        : Promise.resolve([]),
      uniqueIds("BOARD_SECTION").length
        ? prisma.boardSection.findMany({ where: { id: { in: uniqueIds("BOARD_SECTION") } }, select: { id: true, displayName: true } })
        : Promise.resolve([]),
      uniqueIds("FLOOR_PLAN").length
        ? prisma.floorPlan.findMany({ where: { id: { in: uniqueIds("FLOOR_PLAN") } }, select: { id: true, code: true, name: true } })
        : Promise.resolve([]),
      uniqueIds("SCHEDULE_TRACK").length
        ? prisma.scheduleTrack.findMany({ where: { id: { in: uniqueIds("SCHEDULE_TRACK") } }, select: { id: true, displayName: true } })
        : Promise.resolve([]),
      uniqueIds("SAVED_VIEW").length
        ? prisma.savedView.findMany({ where: { id: { in: uniqueIds("SAVED_VIEW") } }, select: { id: true, name: true } })
        : Promise.resolve([]),
      uniqueIds("CUSTOM_FIELD").length
        ? prisma.customField.findMany({ where: { id: { in: uniqueIds("CUSTOM_FIELD") } }, select: { id: true, label: true } })
        : Promise.resolve([]),
      uniqueIds("PROPERTY").length
        ? prisma.property.findMany({ where: { id: { in: uniqueIds("PROPERTY") } }, select: { id: true, code: true, name: true } })
        : Promise.resolve([]),
      uniqueIds("UNIT").length
        ? prisma.unit.findMany({ where: { id: { in: uniqueIds("UNIT") } }, select: { id: true, number: true } })
        : Promise.resolve([]),
      uniqueIds("AUTOMATION_RULE").length
        ? prisma.automationRule.findMany({ where: { id: { in: uniqueIds("AUTOMATION_RULE") } }, select: { id: true, name: true } })
        : Promise.resolve([]),
      uniqueIds("WEBHOOK_ENDPOINT").length
        ? prisma.webhookEndpoint.findMany({ where: { id: { in: uniqueIds("WEBHOOK_ENDPOINT") } }, select: { id: true, name: true, url: true } })
        : Promise.resolve([]),
      uniqueIds("API_TOKEN").length
        ? prisma.apiToken.findMany({ where: { id: { in: uniqueIds("API_TOKEN") } }, select: { id: true, name: true } })
        : Promise.resolve([]),
    ]);

    const itemById = new Map(items.map((item) => [item.id, item]));
    const projectById = new Map(projectRecords.map((record) => [record.id, record]));
    const pestById = new Map(pestIssues.map((issue) => [issue.id, issue]));
    const leaseById = new Map(leaseIssues.map((issue) => [issue.id, issue]));
    const pmTaskById = new Map(pmTasks.map((task) => [task.id, task]));
    const pmTemplateById = new Map(pmTemplates.map((template) => [template.id, template]));
    const poolEntryById = new Map(poolEntries.map((entry) => [entry.id, entry]));
    const poolFacilityById = new Map(poolFacilities.map((facility) => [facility.id, facility]));
    const mapPinById = new Map(mapPins.map((pin) => [pin.id, pin]));
    const mapAreaById = new Map(mapAreas.map((area) => [area.id, area]));
    const mapById = new Map(mapFiles.map((map) => [map.id, map]));
    const wikiEntryById = new Map(wikiEntries.map((entry) => [entry.id, entry]));
    const wikiVendorById = new Map(wikiVendors.map((vendor) => [vendor.id, vendor]));
    const wikiAssetById = new Map(wikiAssets.map((asset) => [asset.id, asset]));
    const vendorById = new Map(vendors.map((vendor) => [vendor.id, vendor]));
    const workBlockById = new Map(workBlocks.map((block) => [block.id, block]));
    const boardSectionById = new Map(boardSections.map((section) => [section.id, section]));
    const floorPlanById = new Map(floorPlans.map((plan) => [plan.id, plan]));
    const scheduleTrackById = new Map(scheduleTracks.map((track) => [track.id, track]));
    const savedViewById = new Map(savedViews.map((view) => [view.id, view]));
    const customFieldById = new Map(customFields.map((field) => [field.id, field]));
    const propertyEntityById = new Map(propertiesAsEntities.map((property) => [property.id, property]));
    const unitById = new Map(units.map((unit) => [unit.id, unit]));
    const automationRuleById = new Map(automationRules.map((rule) => [rule.id, rule]));
    const webhookEndpointById = new Map(webhookEndpoints.map((endpoint) => [endpoint.id, endpoint]));
    const apiTokenById = new Map(apiTokens.map((token) => [token.id, token]));

    const entityLabelFor = (entry: typeof activity[number]) => {
      if (!entry.entityId) return titleCase(entry.entityType);
      switch (entry.entityType) {
        case "MAKE_READY_ITEM": {
          const item = itemById.get(entry.entityId);
          return item ? `Turn / ${item.unitNumber}${item.boardGroup ? ` / ${titleCase(item.boardGroup)}` : ""}` : "Turn";
        }
        case "PROJECT_RECORD": {
          const record = projectById.get(entry.entityId);
          return record ? `Project / ${record.title}${record.recordType ? ` / ${titleCase(record.recordType)}` : ""}` : "Project";
        }
        case "PEST_ISSUE": {
          const issue = pestById.get(entry.entityId);
          const place = issue?.unit?.number ?? issue?.makeReadyItem?.unitNumber ?? issue?.area ?? issue?.building;
          return issue ? `Pest issue / ${place ? `${place} / ` : ""}${issue.pestType}` : "Pest issue";
        }
        case "LEASE_COMPLIANCE_ISSUE": {
          const issue = leaseById.get(entry.entityId);
          const place = issue?.unit?.number ?? issue?.area ?? issue?.building;
          return issue ? `Lease issue / ${place ? `${place} / ` : ""}${issue.issueTypeName}` : "Lease issue";
        }
        case "PM_TASK": {
          const task = pmTaskById.get(entry.entityId);
          return task ? `PM task / ${task.taskName}${task.category ? ` / ${task.category}` : ""}` : "PM task";
        }
        case "PM_TEMPLATE": {
          const template = pmTemplateById.get(entry.entityId);
          return template ? `PM template / ${template.name}${template.category ? ` / ${template.category}` : ""}` : "PM template";
        }
        case "PoolLogEntry": {
          const poolEntry = poolEntryById.get(entry.entityId);
          return poolEntry ? `Pool log / ${poolEntry.facility.name} / ${poolEntry.logDate.toISOString().slice(0, 10)}` : "Pool log";
        }
        case "PoolFacility": {
          const facility = poolFacilityById.get(entry.entityId);
          return facility ? `Pool facility / ${facility.name}${facility.type ? ` / ${facility.type}` : ""}` : "Pool facility";
        }
        case "PROPERTY_MAP_PIN": {
          const pin = mapPinById.get(entry.entityId);
          return pin ? `Map pin / ${pin.title}${pin.pinType ? ` / ${titleCase(pin.pinType)}` : ""}` : "Map pin";
        }
        case "PROPERTY_MAP_AREA": {
          const area = mapAreaById.get(entry.entityId);
          return area ? `Map area / ${area.name}` : "Map area";
        }
        case "PROPERTY_MAP": {
          const map = mapById.get(entry.entityId);
          return map ? `Property map / ${map.name}` : "Property map";
        }
        case "PROPERTY_WIKI_ENTRY": {
          const wiki = wikiEntryById.get(entry.entityId);
          return wiki ? `Wiki entry / ${wiki.title}${wiki.section ? ` / ${titleCase(wiki.section)}` : ""}` : "Wiki entry";
        }
        case "PROPERTY_WIKI_VENDOR": {
          const vendor = wikiVendorById.get(entry.entityId);
          return vendor ? `Wiki vendor / ${vendor.companyName}${vendor.vendorType ? ` / ${vendor.vendorType}` : ""}` : "Wiki vendor";
        }
        case "PROPERTY_WIKI_ASSET": {
          const asset = wikiAssetById.get(entry.entityId);
          return asset ? `Wiki asset / ${asset.title}${asset.kind ? ` / ${titleCase(asset.kind)}` : ""}` : "Wiki asset";
        }
        case "VENDOR": {
          const vendor = vendorById.get(entry.entityId);
          return vendor ? `Vendor / ${vendor.name}${vendor.trade ? ` / ${vendor.trade}` : ""}` : "Vendor";
        }
        case "WORK_ASSIGNMENT_BLOCK": {
          const block = workBlockById.get(entry.entityId);
          return block ? `Work block / ${block.item.unitNumber} / ${block.category}` : "Work block";
        }
        case "BOARD_SECTION": {
          const section = boardSectionById.get(entry.entityId);
          return section ? `Board section / ${section.displayName}` : "Board section";
        }
        case "FLOOR_PLAN": {
          const plan = floorPlanById.get(entry.entityId);
          return plan ? `Floor plan / ${plan.code}${plan.name && plan.name !== plan.code ? ` / ${plan.name}` : ""}` : "Floor plan";
        }
        case "SCHEDULE_TRACK": {
          const track = scheduleTrackById.get(entry.entityId);
          return track ? `Schedule track / ${track.displayName}` : "Schedule track";
        }
        case "SAVED_VIEW": {
          const view = savedViewById.get(entry.entityId);
          return view ? `Saved view / ${view.name}` : "Saved view";
        }
        case "CUSTOM_FIELD": {
          const field = customFieldById.get(entry.entityId);
          return field ? `Custom field / ${field.label}` : "Custom field";
        }
        case "PROPERTY": {
          const property = propertyEntityById.get(entry.entityId);
          return property ? `Property / ${property.code} - ${property.name}` : "Property";
        }
        case "UNIT": {
          const unit = unitById.get(entry.entityId);
          return unit ? `Unit / ${unit.number}` : "Unit";
        }
        case "AUTOMATION_RULE": {
          const rule = automationRuleById.get(entry.entityId);
          return rule ? `Automation / ${rule.name}` : "Automation";
        }
        case "WEBHOOK_ENDPOINT": {
          const endpoint = webhookEndpointById.get(entry.entityId);
          return endpoint ? `Webhook / ${endpoint.name}` : "Webhook";
        }
        case "API_TOKEN": {
          const token = apiTokenById.get(entry.entityId);
          return token ? `API token / ${token.name}` : "API token";
        }
        default:
          return titleCase(entry.entityType);
      }
    };

    return {
      activity: activity.map((entry) => ({
        id: entry.id,
        createdAt: entry.createdAt,
        actor: entry.actorUser,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        entityLabel: entityLabelFor(entry),
        description: entry.message,
        property: entry.property,
        unitNumber: entry.entityType === "MAKE_READY_ITEM"
          ? itemById.get(entry.entityId ?? "")?.unitNumber ?? null
          : null,
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
