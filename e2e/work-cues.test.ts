import assert from "node:assert/strict";
import { test } from "node:test";
import { hasActiveCorrections, workCategoryLabel } from "../apps/web/src/lib/workCues.js";

test("correction cues apply only to active correction assignments", () => {
  for (const status of ["PLANNED", "IN_PROGRESS", "DONE", "CANCELED"]) {
    assert.equal(hasActiveCorrections([{ category: "FINAL_WALK_CORRECTION", status }]), ["PLANNED", "IN_PROGRESS"].includes(status));
  }
  assert.equal(hasActiveCorrections(), false);
  assert.equal(hasActiveCorrections([{ category: "FINAL_WALK_INSPECTION", status: "PLANNED" }]), false);
  assert.equal(workCategoryLabel("FINAL_WALK_CORRECTION", "en"), "Final-walk corrections");
  assert.equal(workCategoryLabel("FINAL_WALK_CORRECTION", "es"), "Correcciones de inspeccion final");
});
