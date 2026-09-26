import assert from "node:assert/strict";
import { test } from "node:test";
import { hasActiveCorrections, moveInCountdown, workCategoryLabel } from "../apps/web/src/lib/workCues.js";
import { myWorkCue } from "../apps/web/src/lib/myWorkCue.js";

test("move-in countdown distinguishes upcoming, today, past and missing dates", () => {
  assert.equal(moveInCountdown(3, "en"), "3 days till move-in");
  assert.equal(moveInCountdown(1, "en"), "1 day till move-in");
  assert.equal(moveInCountdown(0, "en"), "Move-in today");
  assert.equal(moveInCountdown(-1, "en"), "Move-in date was 1 day ago");
  assert.equal(moveInCountdown(-3, "en"), "Move-in date was 3 days ago");
  assert.equal(moveInCountdown(null, "en"), "");
  assert.equal(moveInCountdown(NaN, "en"), "");
  assert.equal(moveInCountdown(3, "es"), "3 dias para la mudanza");
});

test("correction cues apply only to active correction assignments", () => {
  for (const status of ["PLANNED", "IN_PROGRESS", "DONE", "CANCELED"]) {
    assert.equal(hasActiveCorrections([{ category: "FINAL_WALK_CORRECTION", status }]), ["PLANNED", "IN_PROGRESS"].includes(status));
  }
  assert.equal(hasActiveCorrections(), false);
  assert.equal(hasActiveCorrections([{ category: "FINAL_WALK_INSPECTION", status: "PLANNED" }]), false);
  assert.equal(workCategoryLabel("FINAL_WALK_CORRECTION", "en"), "Final-walk corrections");
  assert.equal(workCategoryLabel("FINAL_WALK_CORRECTION", "es"), "Correcciones de inspeccion final");
});

test("My Work badge counts open assignments, not checklist tasks or completed projects", () => {
  const data = {
    stats: { overdue: 1, total: 100, openChecklistTasks: 90 },
    items: [
      { workAssignmentBlocks: [{ category: "FINAL_WALK_CORRECTION", status: "PLANNED" }, { category: "FINAL_WALK_CORRECTION", status: "IN_PROGRESS" }] },
      { workAssignmentBlocks: [{ category: "FINAL_WALK_CORRECTION", status: "DONE" }] },
    ],
    projectItems: ["Open", "Completed", "Cancelled", "Archived", "Denied"].map(status => ({ status })),
    pestItems: [{}], leaseComplianceItems: [{}], pmTasks: [{}],
  } as any;
  assert.deepEqual(myWorkCue(data), { total: 6, overdue: 1, corrections: 1 });
  assert.deepEqual(myWorkCue({ stats: { overdue: 0 }, items: [] } as any), { total: 0, overdue: 0, corrections: 0 });
});
