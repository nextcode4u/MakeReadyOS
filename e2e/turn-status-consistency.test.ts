import assert from "node:assert/strict";
import test from "node:test";
import { isTurnReady, computeDerivedFields } from "../apps/api/src/lib/board.js";
import { pondReady } from "../apps/web/src/lib/frogMood.js";
import { repairStageDisplay } from "../apps/web/src/lib/repairStageDisplay.js";
import { isTurnReady as webReady, tradeDone as webTradeDone, awaitingFinalWalk as webAwaiting, turnStageLabel } from "../apps/web/src/lib/turnStatus.js";
import { tradeDone as apiTradeDone, awaitingFinalWalk as apiAwaiting } from "../apps/api/src/lib/turnStatus.js";

process.env.ADMIN_USERNAME = "status-test";
process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";

test("API and frontend readiness contracts agree across status combinations", () => {
  for (const vacancyStatus of [null, "VACANT_READY", " vacant leased ready ", "vacant-not-leased-ready", "VACANT_NOT_READY", "VACANT_LEASED_NOT_READY", "NTV", "OCCUPIED", "DOWN", "MODEL", "VACANT_CUSTOM_READY"]) {
    for (const completionStatus of [null, "NO", "YES", " done ", "COMPLETE", "completed", "GOOD"]) {
      for (const makeReadyStatus of [null, "LITE", "DONE", "FINAL_WALK", " final walk ", "final-walk"]) {
        const item = { vacancyStatus, completionStatus, makeReadyStatus };
        assert.equal(webReady(item), isTurnReady(item), JSON.stringify(item));
        for (const paintStatus of [null, "DONE", "NOT_NEEDED"]) {
          const stages = { ...item, paintStatus, cleaningStatus: "not-needed" };
          assert.equal(webAwaiting(stages), apiAwaiting(stages), JSON.stringify(stages));
        }
      }
    }
  }
  for (const value of [null, "", "DONE", "complete", "COMPLETED", "NOT NEEDED", "NOT_NEEDED", "not-needed", "N/A", "NOT_DONE", "GOOD"]) {
    assert.equal(webTradeDone(value), apiTradeDone(value), String(value));
  }
});

test("unit drawer distinguishes future and excluded turns without inventing active work", () => {
  assert.equal(turnStageLabel({}), "Repairs pending completion");
  assert.equal(turnStageLabel({ makeReadyStatus: "LITE" }), "Repairs pending completion");
  assert.equal(turnStageLabel({ vacancyStatus: "ntv leased", makeReadyStatus: "DONE" }), "Upcoming turn - awaiting vacancy");
  assert.equal(turnStageLabel({ vacancyStatus: "OCCUPIED", completionStatus: "YES" }), "Occupied unit");
  assert.equal(turnStageLabel({ isArchived: true, completionStatus: "YES" }), "Archived turn");
  assert.match(turnStageLabel({ vacancyStatus: "MODEL" }), /outside the normal turn queue/);
  assert.match(turnStageLabel({ vacancyStatus: "VACANT_READY" }, true), /outside the normal turn queue/);
});

test("unit drawer does not claim a performed inspection from imported or overridden readiness", () => {
  assert.equal(turnStageLabel({ vacancyStatus: "VACANT_LEASED_READY", completionStatus: "NO", makeReadyStatus: "DONE" }), "Unit ready");
  assert.equal(turnStageLabel({ completionStatus: "YES", makeReadyStatus: "DONE" }), "Unit ready");
  assert.equal(turnStageLabel({ makeReadyStatus: "DONE", paintStatus: "NOT_NEEDED", cleaningStatus: "not-needed" }), "Ready for final walk");
  assert.equal(turnStageLabel({ makeReadyStatus: "DONE", paintStatus: "DONE", cleaningStatus: "LITE" }), "Waiting for cleaning");
});

test("board, pond and risk agree on ready imports, overrides and unfinished inspections", async () => {
  const { evaluateItemRisk } = await import("../apps/api/src/lib/risk.js");
  const now = new Date(2026, 8, 13, 12);
  const base = { makeReadyStatus: "DONE", completionStatus: "NO", vacancyStatus: "VACANT_NOT_LEASED_NOT_READY",
    makeReadyDate: new Date(2026, 8, 1), moveInDate: new Date(2026, 8, 14), vacatedDate: new Date(2026, 7, 1), updatedAt: new Date(2026, 7, 1) };
  const cases = [
    { ...base },
    { ...base, vacancyStatus: "VACANT_LEASED_READY" },
    { ...base, vacancyStatus: " vacant-not-leased-ready " },
    { ...base, completionStatus: " completed " },
    { ...base, makeReadyStatus: "FINAL_WALK", completionStatus: "YES", vacancyStatus: "VACANT_READY" },
    { ...base, makeReadyStatus: " final walk ", vacancyStatus: "VACANT_READY" },
  ];
  for (const item of cases) {
    const ready = isTurnReady(item);
    const label = JSON.stringify(item);
    assert.equal(pondReady(item), ready, label);
    assert.equal(computeDerivedFields(item, now).overdue, !ready, label);
    const risk = evaluateItemRisk(item as Parameters<typeof evaluateItemRisk>[0], now);
    assert.equal(risk.riskLevel === "NONE", ready, label);
    if (item.makeReadyStatus === "DONE") assert.equal(repairStageDisplay(item)?.displayName === "Unit ready", ready, label);
  }
});

test("finished or unnecessary trades do not produce incomplete-cleaning or paint warnings", async () => {
  const { evaluateItemRisk } = await import("../apps/api/src/lib/risk.js");
  const now = new Date(2026, 8, 13, 12);
  for (const value of ["DONE", "complete", "COMPLETED", "Not needed", "NOT_NEEDED", "not-needed", "N/A"]) {
    const item = { makeReadyStatus: "DONE", completionStatus: "NO", paintStatus: value, cleaningStatus: value,
      moveInDate: now, makeReadyDate: now, vacatedDate: now, updatedAt: now, assignedTech: "Tech" };
    const risk = evaluateItemRisk(item as Parameters<typeof evaluateItemRisk>[0], now);
    assert.ok(!risk.riskReasons.some(reason => reason.category === "PAINT_RISK" || reason.message.includes("cleaning is incomplete")), value);
    assert.ok(risk.riskReasons.some(reason => reason.category === "MOVE_IN_RISK"), "Final walk is still pending");
  }
});
