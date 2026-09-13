import assert from "node:assert/strict";
import test from "node:test";
import { repairStageDisplay } from "../apps/web/src/lib/repairStageDisplay.js";

test("repair completion stays amber until the entire turn is approved", () => {
  const repaired = { makeReadyStatus: "DONE", completionStatus: "NO" };
  const pending = repairStageDisplay(repaired)!;
  assert.equal(pending.displayName, "Repairs done; awaiting painting / cleaning");
  assert.equal(pending.color, "#ffc673");
  assert.equal(repairStageDisplay({ ...repaired, paintStatus: "DONE" })?.displayName, "Repairs done; awaiting cleaning");
  assert.equal(repairStageDisplay({ ...repaired, cleaningStatus: "DONE" })?.displayName, "Repairs done; awaiting painting");
  for (const paintStatus of ["DONE", "NOT NEEDED", "NOT_NEEDED", "N/A"]) {
    const inspection = repairStageDisplay({ ...repaired, paintStatus, cleaningStatus: "DONE" })!;
    assert.equal(inspection.displayName, "Repairs done; awaiting final walk");
    assert.equal(inspection.color, pending.color);
  }
  assert.equal(repairStageDisplay({ ...repaired, completionStatus: "YES" })?.displayName, "Unit ready");
  assert.equal(repairStageDisplay({ ...repaired, completionStatus: "YES" })?.color, "#46d39c");
  assert.equal(repairStageDisplay({ makeReadyStatus: "LITE" }), undefined);
  assert.match(repairStageDisplay(repaired, true)?.displayName ?? "", /falta pintura/);
});

test("availability-ready units remain ready without historical painting or cleaning statuses", () => {
  for (const vacancyStatus of ["VACANT READY", "VACANT_READY", "VACANT LEASED READY", "VACANT_NOT_LEASED_READY", " vacant not leased ready "]) {
    for (const completionStatus of [null, "", "NO"]) {
      const label = repairStageDisplay({ makeReadyStatus: "DONE", vacancyStatus, completionStatus, paintStatus: null, cleaningStatus: null })!;
      assert.equal(label.displayName, "Unit ready");
      assert.equal(label.color, "#46d39c");
    }
  }
  for (const vacancyStatus of ["VACANT NOT READY", "VACANT_LEASED_NOT_READY", "VACANT NOT LEASED NOT READY", "NTV LEASED"]) {
    const label = repairStageDisplay({ makeReadyStatus: "DONE", completionStatus: "NO", vacancyStatus })!;
    assert.equal(label.displayName, "Repairs done; awaiting painting / cleaning");
    assert.equal(label.color, "#ffc673");
  }
});
