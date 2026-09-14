import assert from "node:assert/strict";
import test from "node:test";
import type { MakeReadyItem, Prisma } from "@prisma/client";
import { guardReadyMutation, normalizeRepairCompletion, readyStatusIntent, requestsInspection } from "./turnMutationGuard.js";
import { pendingTurnStages, awaitingFinalWalk } from "./turnStatus.js";

test("trade status spelling variants agree with the board before inspection handoff", () => {
  for (const value of ["Not needed", "NOT_NEEDED", "not-needed", " not   needed ", "N/A", "Done", "COMPLETE", "completed"]) {
    const item = { makeReadyStatus: "DONE", completionStatus: "NO", paintStatus: value, cleaningStatus: value };
    assert.equal(awaitingFinalWalk(item), true, value);
    assert.deepEqual(pendingTurnStages(item), [], value);
    assert.equal(awaitingFinalWalk({ ...item, completionStatus: "YES" }), false, value);
  }
  for (const value of ["NOT_DONE", "NOT NEEDED YET", "", null]) {
    const item = { makeReadyStatus: "DONE", paintStatus: value, cleaningStatus: value };
    assert.equal(awaitingFinalWalk(item), false, String(value));
    assert.equal(pendingTurnStages(item).length, 2, String(value));
  }
});

const current = { id: "turn", unitNumber: "101", propertyId: "property", boardGroup: "WORK", makeReadyStatus: "IN PROGRESS", completionStatus: "NO", vacancyStatus: "VACANT NOT LEASED NOT READY" } as MakeReadyItem;

test("whole-turn approval requires all stages even when repairs are reopened", () => {
  assert.equal(pendingTurnStages(current).length, 3);
  const repaired = { ...current, makeReadyStatus: "DONE" };
  assert.equal(pendingTurnStages(repaired).length, 2);
  assert.equal(awaitingFinalWalk(repaired), false);
  const painted = { ...repaired, paintStatus: "DONE" };
  assert.equal(pendingTurnStages(painted).length, 1);
  const cleaned = { ...painted, cleaningStatus: "DONE" };
  assert.equal(pendingTurnStages(cleaned).length, 0);
  assert.equal(awaitingFinalWalk(cleaned), true);
  assert.equal(pendingTurnStages({ ...cleaned, makeReadyStatus: "LITE" }).length, 1);
  assert.equal(awaitingFinalWalk({ ...cleaned, completionStatus: "YES" }), false);
});

test("editable DONE completes repairs without approving readiness or reopening finalized turns", async () => {
  for (const phase of ["LITE", "FINAL WALK"]) {
    const patch: Record<string, unknown> = { makeReadyStatus: " done " };
    normalizeRepairCompletion({ makeReadyStatus: phase }, patch);
    assert.deepEqual(patch, { makeReadyStatus: "DONE", completionStatus: "NO" });
    await guardReadyMutation({} as Prisma.TransactionClient, current, patch, "Repair technician");
  }
  const finalized = { makeReadyStatus: "DONE", completionStatus: "YES" };
  normalizeRepairCompletion(finalized, finalized);
  assert.deepEqual(finalized, { makeReadyStatus: "DONE", completionStatus: "YES" });
  const explicitReady = { makeReadyStatus: "READY" };
  normalizeRepairCompletion(current, explicitReady);
  assert.equal(readyStatusIntent(current, explicitReady), true);
  const combined = { makeReadyStatus: "DONE", vacancyStatus: "VACANT LEASED READY" };
  normalizeRepairCompletion(current, combined);
  assert.equal(readyStatusIntent(current, combined), true);
  const earlyInspection: Record<string, unknown> = { makeReadyStatus: "FINAL WALK" };
  normalizeRepairCompletion(current, earlyInspection);
  assert.deepEqual(earlyInspection, { makeReadyStatus: "DONE", completionStatus: "NO" });
  assert.equal(requestsInspection(current, earlyInspection), false);
});

test("inspection starts only after repairs, painting and cleaning finish", () => {
  assert.equal(requestsInspection(current, { makeReadyStatus: "DONE" }), false);
  assert.equal(requestsInspection({ ...current, makeReadyStatus: "DONE" }, { paintStatus: "DONE" }), false);
  assert.equal(requestsInspection({ ...current, makeReadyStatus: "DONE", paintStatus: "DONE" }, { cleaningStatus: "DONE" }), true);
  assert.equal(requestsInspection({ ...current, makeReadyStatus: "DONE", paintStatus: "NOT NEEDED" }, { cleaningStatus: "DONE" }), true);
  assert.equal(requestsInspection(current, { notes: "Updated" }), false);
  assert.equal(requestsInspection({ ...current, completionStatus: "YES" }, { completionStatus: "YES" }), false);
  for (const status of ["DONE", "FINAL WALK", "final-walk", "COMPLETE", "READY"]) {
    assert.equal(requestsInspection({ ...current, makeReadyStatus: status }, { completionStatus: "YES" }), false);
  }
});

test("ready intent distinguishes actual ready mutations from repair completion or unrelated edits", () => {
  assert.equal(readyStatusIntent(current, { completionStatus: "YES" }), false);
  assert.equal(readyStatusIntent(current, { notes: "Note" }), false);
  assert.equal(readyStatusIntent(current, { makeReadyStatus: "DONE" }), false);
  for (const status of ["complete", "Ready"]) assert.equal(readyStatusIntent(current, { makeReadyStatus: status }), true);
  assert.equal(readyStatusIntent(current, { vacancyStatus: "VACANT_NOT_LEASED_READY" }), true);
  assert.equal(readyStatusIntent({ ...current, makeReadyStatus: "DONE" }, { makeReadyStatus: "done" }), false);
  assert.equal(readyStatusIntent({ ...current, vacancyStatus: "VACANT NOT LEASED READY" }, { vacancyStatus: "VACANT LEASED READY" }), false);
});

test("inspection history prevents bypassing the final-walk action through status or group edits", async () => {
  for (const evidence of ["phase", "draft", "assignment"]) {
    const db = {
      boardSection: { findFirst: async () => ({ id: "ready" }) },
      finalWalkReportDraft: { findUnique: async () => evidence === "draft" ? { itemId: "turn" } : null },
      workAssignmentBlock: { findFirst: async () => evidence === "assignment" ? { id: "walk" } : null },
    } as unknown as Prisma.TransactionClient;
    for (const patch of [{ makeReadyStatus: "READY" }, { boardGroup: "READY" }]) {
      await assert.rejects(guardReadyMutation(db, { ...current, makeReadyStatus: evidence === "phase" ? "FINAL WALK" : "IN PROGRESS" }, patch, "Reviewer"), { statusCode: 409, message: /Final walk \/ Mark ready/ });
    }
  }
});
