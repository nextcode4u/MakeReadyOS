import { Prisma } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { allowedPropertyIds, requireManagerOrAdmin } from "../lib/auth.js";
import { writeAuditLog } from "../lib/audit.js";
import { applyBusinessDayOffset } from "../lib/operatingCalendar.js";
import { prisma } from "../lib/prisma.js";
import { turnDefinitions, turnSetupPrefix, turnSetupSchema, turnStages } from "../lib/turnSetup.js";

async function setupContext(request: FastifyRequest, reply: FastifyReply) {
  if (await requireManagerOrAdmin(request, reply)) return null;
  const input = turnSetupSchema.parse(request.body);
  const ids = allowedPropertyIds(request.currentUser!);
  if (ids !== null && !ids.includes(input.propertyId)) {
    reply.code(403).send({ message: "Property access denied" });
    return null;
  }
  const property = await prisma.property.findFirst({ where: { id: input.propertyId, isActive: true }, include: { operatingCalendar: true } });
  if (!property) {
    reply.code(404).send({ message: "Active property not found" });
    return null;
  }
  return { input, property };
}

export async function turnSetupRoutes(app: FastifyInstance) {
  app.post("/automations/turn-setup/pause", async (request, reply) => {
    const context = await setupContext(request, reply);
    if (!context) return;
    const result = await prisma.automationRule.updateMany({ where: { propertyId: context.input.propertyId, templateId: { startsWith: turnSetupPrefix }, isArchived: false }, data: { enabled: false } });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, propertyId: context.input.propertyId, entityType: "PROPERTY", entityId: context.input.propertyId, action: "TURN_SCHEDULING_PAUSED", message: "Paused guided turn scheduling; existing dates preserved" });
    return { paused: result.count };
  });
  app.post("/automations/turn-setup/preview", async (request, reply) => {
    const context = await setupContext(request, reply);
    if (!context) return;
    const { input, property } = context;
    const calendar = { noWeekendScheduling: true, avoidMondayScheduling: property.operatingCalendar?.avoidMondayScheduling ?? false, avoidFridayScheduling: property.operatingCalendar?.avoidFridayScheduling ?? false };
    const items = await prisma.makeReadyItem.findMany({ where: { propertyId: input.propertyId, isArchived: false }, include: { customFieldValues: { include: { customField: true } } }, orderBy: { unitNumber: "asc" } });
    const active = items.filter((item) => !["DONE", "YES", "GOOD", "COMPLETE", "COMPLETED"].includes(String(item.completionStatus ?? "").trim().toUpperCase()));
    const dated = active.filter((item) => item.vacatedDate);
    const rows = dated.map((item) => {
      let offset = 0;
      const dates = turnStages.map((stage, index) => {
        offset += input.days[index];
        const existing = stage.custom ? item.customFieldValues.find((entry) => entry.customField.fieldKey === stage.field)?.value : item[stage.field];
        const date = existing || applyBusinessDayOffset(item.vacatedDate!, index === 0 ? 1 : offset, calendar);
        return { label: stage.label, date: date instanceof Date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` : String(date), preserved: Boolean(existing) };
      });
      return { unitNumber: item.unitNumber, dates };
    });
    const configured = await prisma.automationRule.count({ where: { propertyId: input.propertyId, templateId: { startsWith: turnSetupPrefix }, isArchived: false, enabled: true } });
    return { property: { id: property.id, name: property.name, code: property.code }, calendar, configured, missingVacateDate: active.length - dated.length, total: rows.length, rows: rows.slice(0, 25), changes: rows.reduce((sum, row) => sum + row.dates.filter((date) => !date.preserved).length, 0) };
  });

  app.post("/automations/turn-setup/enable", async (request, reply) => {
    const context = await setupContext(request, reply);
    if (!context) return;
    const { input } = context;
    const rules = await prisma.$transaction(async (tx) => {
      // Shared fields/tracks are global; serialize setup across properties and retries.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(824016)::text`;
      const fieldIds = new Map<string, string>();
      for (const stage of turnStages.filter((entry) => entry.custom)) {
        const field = await tx.customField.upsert({ where: { fieldKey: stage.field }, update: {}, create: { fieldKey: stage.field, label: stage.label, fieldType: "DATE", module: "make-ready" } });
        if (field.fieldType !== "DATE" || field.module !== "make-ready" || field.isArchived || field.deletedAt) throw Object.assign(new Error(`Restore or correct the ${stage.label} custom date field before enabling scheduling`), { statusCode: 409 });
        fieldIds.set(stage.field, field.id);
      }
      await tx.operatingCalendar.upsert({ where: { propertyId: input.propertyId }, create: { propertyId: input.propertyId, noWeekendScheduling: true }, update: { noWeekendScheduling: true } });
      const definitions = turnDefinitions(input.propertyId, input.days, fieldIds);
      const result: Array<{ id: string; name: string }> = [];
      for (const [index, definition] of definitions.entries()) {
        const stage = turnStages[index];
        const sourceField = stage.custom ? `custom:${fieldIds.get(stage.field)}` : stage.field;
        await tx.scheduleTrack.upsert({ where: { sourceField }, create: { sourceField, displayName: stage.label, groupingMode: "PROPERTY", sortOrder: index + 10 }, update: { isEnabled: true, isArchived: false } });
        const templateId = `${turnSetupPrefix}${stage.key}`;
        const existing = await tx.automationRule.findFirst({ where: { propertyId: input.propertyId, templateId, isArchived: false } });
        const data = { ...definition, templateId, conditions: definition.conditions as Prisma.InputJsonValue, actions: definition.actions as Prisma.InputJsonValue };
        const rule = existing ? await tx.automationRule.update({ where: { id: existing.id }, data }) : await tx.automationRule.create({ data });
        result.push({ id: rule.id, name: rule.name });
      }
      return result;
    });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, propertyId: input.propertyId, entityType: "AUTOMATION_RULE", entityId: rules[0].id, action: "TURN_SCHEDULING_ENABLED", message: "Enabled guided weekday turn scheduling", metadata: { days: input.days, ruleIds: rules.map((rule) => rule.id) } });
    return { rules };
  });
}
