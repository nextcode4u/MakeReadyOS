import assert from "node:assert/strict";
import test from "node:test";
import { getTurnReadiness, readinessBlockers } from "./turnReadiness.js";
import { emptyReportDraft, reportChecks } from "./finalWalkReport.js";
const base = { isArchived: false, propertyActive: true, assignedTech: "Tech", reviewerName: "Reviewer", materials: [], tasks: [] };
test("inspection history cannot be erased by changing the current status label", async () => {
  const item = { isArchived: false, assignedTech: "Tech", materials: [], property: { isActive: true }, checklistInstances: [], finalWalkReportDraft: null, workAssignmentBlocks: [] };
  for (const patch of [
    { makeReadyStatus: "FINAL WALK" }, { makeReadyStatus: "final_walk" }, { makeReadyStatus: " final-walk " },
    { makeReadyStatus: "LITE", workAssignmentBlocks: [{ id: "old-inspection" }] },
    { makeReadyStatus: "LITE", finalWalkReportDraft: { payload: null } },
  ]) {
    const db = { makeReadyItem: { findUniqueOrThrow: async () => ({ ...item, ...patch }) } } as any;
    assert.match((await getTurnReadiness(db, "turn", "Reviewer")).join(";"), /Save the detailed final-walk/);
  }
  const legacy = { makeReadyItem: { findUniqueOrThrow: async () => ({ ...item, makeReadyStatus: "LITE" }) } } as any;
  assert.deepEqual(await getTurnReadiness(legacy, "turn", "Reviewer"), []);
});
test("readiness separates required tasks, pending parts, independent review and archived turns", () => {
  assert.deepEqual(readinessBlockers(base), []);
  assert.equal(readinessBlockers({ ...base, tasks: [{ title: "Required repair", required: true, completed: false }, { title: "Optional", required: false, completed: false }] }).length, 1);
  assert.equal(readinessBlockers({ ...base, reviewerName: " tech " }).length, 1);
  assert.equal(readinessBlockers({ ...base, isArchived: true }).length, 1);
  assert.equal(readinessBlockers({ ...base, propertyActive: false }).length, 1);
  assert.equal(readinessBlockers({ ...base, materials: {} }).length, 1);
  const row = { id: "00000000-0000-4000-8000-000000000001", name: "Filter", quantity: 1, unit: "each", notes: "" };
  for (const status of ["NEEDED", "ORDERED"]) assert.equal(readinessBlockers({ ...base, materials: [{ ...row, status }] }).length, 1);
  for (const status of ["ON_HAND", "USED", "CANCELLED"]) assert.equal(readinessBlockers({ ...base, materials: [{ ...row, status }] }).length, 0);
});

test("final walk requires a dated complete inspection with no unresolved findings", () => {
  const input = { ...base, inspectionRequired: true };
  assert.equal(readinessBlockers(input).length, 1);
  const inspection = { version: 1, updatedAt: new Date().toISOString(), value: emptyReportDraft() };
  assert.equal(readinessBlockers({ ...input, inspection }).length, 2);
  inspection.value.inspectionDate = "2026-09-08";
  for (const check of reportChecks) inspection.value.results[check.id] = { status: "CHECKED", note: "" };
  assert.deepEqual(readinessBlockers({ ...input, inspection }), []);
  inspection.value.results["general-1"] = { status: "ATTENTION", note: "Repair needed" };
  assert.equal(readinessBlockers({ ...input, inspection }).length, 1);
  inspection.value.results["general-1"] = { status: "NA", note: "Not installed" };
  assert.deepEqual(readinessBlockers({ ...input, inspection }), []);
});
