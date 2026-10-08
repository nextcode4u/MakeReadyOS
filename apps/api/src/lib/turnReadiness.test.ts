import assert from "node:assert/strict";
import test from "node:test";
import { getTurnReadiness, readinessBlockers } from "./turnReadiness.js";
import { emptyReportDraft, reportChecks, technicianChecks } from "./finalWalkReport.js";
import { isStockInspection, moveInFolderCheck } from "./stockInspection.js";
const base = { isArchived: false, propertyActive: true, assignedTech: "Tech", reviewerName: "Reviewer", materials: [], tasks: [] };
test("stock readiness defers resident handoff without fabricating completed checks", () => {
  const item = { vacancyStatus: "VACANT NOT LEASED NOT READY", applicant: null, moveInDate: null };
  assert.equal(isStockInspection(item), true);
  for (const patch of [{ applicant: "Demo Resident" }, { moveInDate: "2026-10-15" }, { vacancyStatus: "VACANT LEASED NOT READY" }, { vacancyStatus: "UNKNOWN" }]) assert.equal(isStockInspection({ ...item, ...patch }), false);
  const value = emptyReportDraft();
  value.inspectionDate = "2026-10-07";
  for (const check of technicianChecks) value.technicianResults[check.id] = { status: "CHECKED", note: "" };
  for (const check of reportChecks.filter(check => check.id !== moveInFolderCheck)) value.results[check.id] = { status: "CHECKED", note: "" };
  const input = { ...base, inspectionRequired: true, inspection: { version: 1, updatedAt: new Date().toISOString(), value } };
  assert.deepEqual(readinessBlockers({ ...input, stockInspection: true }), []);
  assert.equal(readinessBlockers({ ...input, stockInspection: false }).length, 2);
  assert.equal(value.handoffConfirmed, false);
  assert.equal(value.results[moveInFolderCheck], undefined);
  value.results[moveInFolderCheck] = { status: "ATTENTION", note: "Resolve an existing finding" };
  assert.match(readinessBlockers({ ...input, stockInspection: true }).join(";"), /need attention/);
});
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
  const unfinished = { makeReadyItem: { findUniqueOrThrow: async () => ({ ...item, makeReadyStatus: "LITE" }) } } as any;
  assert.equal((await getTurnReadiness(unfinished, "turn", "Reviewer")).length, 3);
  const approved = { makeReadyItem: { findUniqueOrThrow: async () => ({ ...item, makeReadyStatus: "DONE", completionStatus: "YES" }) } } as any;
  assert.deepEqual(await getTurnReadiness(approved, "turn", "Reviewer"), []);
});
test("readiness separates required tasks, pending parts, independent review and archived turns", () => {
  assert.deepEqual(readinessBlockers(base), []);
  assert.equal(readinessBlockers({ ...base, tasks: [{ title: "Required repair", required: true, completed: false }, { title: "Optional", required: false, completed: false }] }).length, 1);
  assert.equal(readinessBlockers({ ...base, reviewerName: " tech " }).length, 1);
  assert.equal(readinessBlockers({ ...base, isArchived: true }).length, 1);
  assert.equal(readinessBlockers({ ...base, propertyActive: false }).length, 1);
  assert.equal(readinessBlockers({ ...base, materials: {} }).length, 1);
  const row = { id: "00000000-0000-4000-8000-000000000001", name: "Filter", quantity: 1, unit: "each", notes: "" };
  assert.match(readinessBlockers({ ...base, materials: [{ ...row, status: "ORDERED" }] })[0], /Parts on order: Filter/);
  for (const status of ["NEEDED", "NEED_TO_ORDER", "ON_HAND", "USED", "CANCELLED"]) assert.equal(readinessBlockers({ ...base, materials: [{ ...row, status }] }).length, 0);
  const mixed = readinessBlockers({ ...base, materials: [{ ...row, status: "NEEDED", name: "Shop pickup" }, { ...row, id: "00000000-0000-4000-8000-000000000002", status: "ORDERED", name: "Waiting on delivery" }] });
  assert.equal(mixed.length, 1);
  assert.match(mixed[0], /Waiting on delivery/);
  assert.doesNotMatch(mixed[0], /Shop pickup/);
});

test("final walk requires a dated complete inspection with no unresolved findings", () => {
  const input = { ...base, inspectionRequired: true };
  assert.equal(readinessBlockers(input).length, 1);
  const inspection = { version: 1, updatedAt: new Date().toISOString(), value: emptyReportDraft() };
  assert.equal(readinessBlockers({ ...input, inspection }).length, 4);
  inspection.value.inspectionDate = "2026-09-08";
  for (const check of reportChecks) inspection.value.results[check.id] = { status: "CHECKED", note: "" };
  for (const check of technicianChecks) inspection.value.technicianResults[check.id] = { status: "CHECKED", note: "" };
  inspection.value.handoffConfirmed = true;
  assert.deepEqual(readinessBlockers({ ...input, inspection }), []);
  inspection.value.results["presentation-v2-1"] = { status: "ATTENTION", note: "Repair needed" };
  assert.equal(readinessBlockers({ ...input, inspection }).length, 1);
  inspection.value.results["presentation-v2-1"] = { status: "NA", note: "Not installed" };
  assert.deepEqual(readinessBlockers({ ...input, inspection }), []);
  inspection.value.correctionPending = true;
  assert.match(readinessBlockers({ ...input, inspection }).join(";"), /corrections are still outstanding/);
});
