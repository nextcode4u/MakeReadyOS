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
