import type { Prisma } from "@prisma/client";
import { turnMaterialsSchema } from "./turnMaterials.js";
import { reportChecks, technicianChecks, savedReportDraftSchema } from "./finalWalkReport.js";
import { repairsDone, pendingTurnStages, turnApproved } from "./turnStatus.js";

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
      const preparation = technicianChecks.filter(check => !["CHECKED", "NA"].includes(inspection.data.value.technicianResults[check.id]?.status ?? ""));
      if (preparation.length) blockers.push(`${preparation.length} technician preparation checks need completion by the technician in Work, not the final-walk inspector.`);
      if (!inspection.data.value.handoffConfirmed) blockers.push("Final-walk inspector must confirm the home/mailbox key, fob and remote counts.");
      if (inspection.data.value.correctionPending) blockers.push("Technician corrections are still outstanding. Record the resolution in Work, then recheck the final walk.");
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
  const inspectionRequired = repairsDone(item) && !turnApproved(item) || Boolean(item.finalWalkReportDraft) || item.workAssignmentBlocks.length > 0;
  const blockers = readinessBlockers({ ...item, propertyActive: item.property.isActive, reviewerName, tasks: item.checklistInstances.flatMap(checklist => checklist.items), inspectionRequired, inspection: item.finalWalkReportDraft?.payload });
  return [...pendingTurnStages(item), ...blockers];
}
