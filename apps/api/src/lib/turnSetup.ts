import { z } from "zod";
import { automationRuleInputSchema } from "./automationDefinition.js";

export const turnSetupPrefix = "guided-turn:";
export const turnStages = [
  { key: "maintenance", label: "Make Ready (Start)", field: "turnMaintenanceDate", custom: true },
  { key: "painting", label: "Painting", field: "turnPaintingDate", custom: true },
  { key: "cleaning", label: "Cleaning", field: "turnCleaningDate", custom: true },
  { key: "flooring", label: "Flooring / carpet contingency", field: "flooringDate", custom: false },
  { key: "ready", label: "Expected Finish", field: "makeReadyDate", custom: false },
] as const;
export const turnSetupSchema = z.object({
  propertyId: z.string().min(1),
  days: z.array(z.number().int().min(1).max(10)).length(5).default([1, 1, 1, 1, 1]),
});

export function turnDefinitions(propertyId: string, days: number[], fieldIds: Map<string, string>) {
  let offset = 0;
  return turnStages.map((stage, index) => {
    offset += days[index];
    const fieldId = fieldIds.get(stage.field);
    if (stage.custom && !fieldId) throw new Error(`Missing date field for ${stage.label}`);
    return automationRuleInputSchema.parse({
      name: `${index + 1}. Turn schedule - ${stage.label}`,
      description: "Guided weekday turn plan. Fills missing dates only; never marks work complete or books staff/vendors.",
      propertyId, enabled: true, triggerType: "SCHEDULED_CHECK",
      conditions: { all: [
        { field: "vacatedDate", operator: "notEmpty" },
        stage.custom ? { customFieldId: fieldId, operator: "dateMissing" } : { field: stage.field, operator: "dateMissing" },
        ...["DONE", "YES", "GOOD", "COMPLETE", "COMPLETED"].map((value) => ({ field: "completionStatus", operator: "notEquals", value })),
      ] },
      actions: [stage.custom
        ? { type: "setCustomDateFromField", fieldId, sourceField: "vacatedDate", offsetDays: index === 0 ? 1 : offset, respectOperatingCalendar: true }
        : { type: "setDateFromField", targetField: stage.field, sourceField: "vacatedDate", offsetDays: offset, respectOperatingCalendar: true }],
    });
  });
}
