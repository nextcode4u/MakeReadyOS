import assert from "node:assert/strict";
import test from "node:test";
import { matchesTurnStep, turnNextStep } from "../apps/web/src/lib/turnNextAction.ts";

test("next step separates repair completion from trades and inspection without reopening ready units", () => {
  assert.equal(turnNextStep({}), "repairs");
  assert.equal(turnNextStep({ makeReadyStatus: "DONE" }), "painting");
  assert.equal(turnNextStep({ makeReadyStatus: "DONE", paintStatus: "not-needed" }), "cleaning");
  assert.equal(turnNextStep({ makeReadyStatus: "DONE", paintStatus: "DONE", cleaningStatus: "DONE" }), "inspection");
  assert.equal(turnNextStep({ makeReadyStatus: "FINAL_WALK", completionStatus: "YES" }), "inspection");
  for (const vacancyStatus of ["DOWN", "MODEL", "OCCUPIED", "NTV LEASED", "VACANT LEASED READY"]) {
    assert.equal(turnNextStep({ vacancyStatus }), null);
  }
  assert.equal(turnNextStep({ isArchived: true }), null);
  assert.equal(turnNextStep({}, true), null);
});

test("stage assignment matching is explicit and does not treat generic QC as final-walk authority", () => {
  assert.equal(matchesTurnStep("painting", " paint "), true);
  assert.equal(matchesTurnStep("repairs", "Make Ready"), true);
  assert.equal(matchesTurnStep("inspection", "FINAL_WALK_INSPECTION"), true);
  assert.equal(matchesTurnStep("inspection", "QC"), false);
  assert.equal(matchesTurnStep("painting", "Custom paint consultation"), false);
});
