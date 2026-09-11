import type { Prisma } from "@prisma/client";
import { turnMaterialsSchema } from "./turnMaterials.js";
import { reportChecks, savedReportDraftSchema } from "./finalWalkReport.js";
import { isFinalWalkStatus } from "./turnStatus.js";

export function readinessBlockers(input: { isArchived: boolean; propertyActive: boolean; assignedTech: string | null; reviewerName: string; materials: unknown; tasks: Array<{ title: string; required: boolean; completed: boolean }>; inspectionRequired?: boolean; inspection?: unknown }) {
  const blockers: string[] = [];
  if (input.isArchived || !input.propertyActive) blockers.push("Archived turns or properties cannot be marked ready. Restore them explicitly first.");
  if (input.assignedTech?.trim().toLocaleLowerCase() === input.reviewerName.trim().toLocaleLowerCase()) blockers.push("The assigned repair technician cannot approve their own final walk. Ask an independent inspector or manager.");
  for (const task of input.tasks.filter(task => task.required && !task.completed)) blockers.push(`Required checklist: ${task.title}`);
  const materials = turnMaterialsSchema.safeParse(input.materials);
  if (!materials.success) blockers.push("The parts list needs review before marking ready.");
  else for (const row of materials.data.filter(row => row.status === "ORDERED")) blockers.push(`Parts on order: ${row.name} (${row.quantity} ${row.unit}). Record receipt/use or cancel the order if no longer needed.`);
  if (input.inspectionRequired) {
    const inspection = savedReportDraftSchema.safeParse(input.inspection);
    if (!inspection.success) blockers.push("Save the detailed final-walk inspection report before marking ready.");
    else {
      if (!inspection.data.value.inspectionDate) blockers.push("Record the final-walk inspection date.");
      const unanswered = reportChecks.filter(check => !inspection.data.value.results[check.id] || inspection.data.value.results[check.id].status === "NOT_CHECKED");
      const attention = reportChecks.filter(check => inspection.data.value.results[check.id]?.status === "ATTENTION");
      if (unanswered.length) blockers.push(`${unanswered.length} final-walk checks are not recorded. Inspect each item or record why it is not applicable.`);
      if (attention.length) blockers.push(`${attention.length} final-walk findings need attention. Resolve and recheck them before marking ready.`);
    }
  }
  return blockers;
}

export async function getTurnReadiness(db: Prisma.TransactionClient, id: string, reviewerName: string) {
  const item = await db.makeReadyItem.findUniqueOrThrow({ where: { id }, include: { finalWalkReportDraft: true, workAssignmentBlocks: { where: { category: "FINAL_WALK_INSPECTION" }, select: { id: true }, take: 1 }, property: { select: { isActive: true } }, checklistInstances: { include: { items: { select: { title: true, required: true, completed: true } } } } } });
  const inspectionRequired = isFinalWalkStatus(item.makeReadyStatus) || Boolean(item.finalWalkReportDraft) || item.workAssignmentBlocks.length > 0;
  return readinessBlockers({ ...item, propertyActive: item.property.isActive, reviewerName, tasks: item.checklistInstances.flatMap(checklist => checklist.items), inspectionRequired, inspection: item.finalWalkReportDraft?.payload });
}
