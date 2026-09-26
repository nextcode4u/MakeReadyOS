import type { MyWorkResponse } from "./api";
import { hasActiveCorrections } from "./workCues";

export type MyWorkCue = { total: number; overdue: number; corrections: number };

export function myWorkCue(data: MyWorkResponse): MyWorkCue {
  const projects = (data.projectItems ?? []).filter(item => !["COMPLETED", "CANCELLED", "ARCHIVED", "DENIED"].includes(item.status.toUpperCase()));
  return {
    total: data.items.length + projects.length + (data.pestItems?.length ?? 0) + (data.leaseComplianceItems?.length ?? 0) + (data.pmTasks?.length ?? 0),
    overdue: data.stats.overdue,
    corrections: data.items.filter(item => hasActiveCorrections(item.workAssignmentBlocks)).length,
  };
}
