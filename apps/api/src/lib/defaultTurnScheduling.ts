import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { turnDefinitions, turnSetupPrefix, turnSetupSchema, turnStages } from "./turnSetup.js";

export async function ensureDefaultTurnScheduling(tx: Prisma.TransactionClient, propertyId: string) {
  // Same lock as the manual guide: startup, property creation and retries cannot duplicate packs.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(824016)::text`;
  const existing = await tx.automationRule.findFirst({ where: { propertyId, templateId: { startsWith: turnSetupPrefix } } });
  // Disabled, archived and partial packs are intentional configuration, not missing defaults.
  if (existing) return false;
  const calendar = await tx.operatingCalendar.findUnique({ where: { propertyId } });
  const storedDays = turnSetupSchema.shape.days.safeParse(calendar?.turnStageDays ?? []);
  const days = storedDays.success ? storedDays.data : [1, 1, 1, 1, 1];
  const fields = new Map<string, string>();
  for (const stage of turnStages.filter(entry => entry.custom)) {
    const field = await tx.customField.upsert({ where: { fieldKey: stage.field }, update: {}, create: { fieldKey: stage.field, label: stage.label, fieldType: "DATE", module: "make-ready" } });
    if (field.fieldType !== "DATE" || field.module !== "make-ready" || field.isArchived || field.deletedAt) throw Object.assign(new Error(`Restore or correct the ${stage.label} date field before scheduling`), { statusCode: 409 });
    fields.set(stage.field, field.id);
  }
  await tx.operatingCalendar.upsert({ where: { propertyId }, create: { propertyId, noWeekendScheduling: true, turnStageDays: days }, update: { noWeekendScheduling: true, turnStageDays: days } });
  for (const [index, definition] of turnDefinitions(propertyId, days, fields).entries()) {
    const stage = turnStages[index];
    const sourceField = stage.custom ? `custom:${fields.get(stage.field)}` : stage.field;
    await tx.scheduleTrack.upsert({ where: { sourceField }, create: { sourceField, displayName: stage.label, groupingMode: "PROPERTY", sortOrder: index + 10 }, update: {} });
    await tx.automationRule.create({ data: { ...definition, templateId: `${turnSetupPrefix}${stage.key}`, conditions: definition.conditions as Prisma.InputJsonValue, actions: definition.actions as Prisma.InputJsonValue } });
  }
  return true;
}

export async function ensureAllDefaultTurnSchedules() {
  const properties = await prisma.property.findMany({ where: { isActive: true, automationRules: { none: { templateId: { startsWith: turnSetupPrefix } } } }, select: { id: true } });
  for (const property of properties) {
    try {
      await prisma.$transaction(tx => ensureDefaultTurnScheduling(tx, property.id));
    } catch (error) {
      // One conflicting legacy field must not prevent other properties or the API from starting.
      console.error("Default turn schedule needs review", property.id, error instanceof Error ? error.message : "Unknown error");
    }
  }
}
