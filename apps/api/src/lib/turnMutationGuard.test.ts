import assert from "node:assert/strict";
import test from "node:test";
import type { MakeReadyItem, Prisma } from "@prisma/client";
import { guardReadyMutation, readyStatusIntent, requestsInspection } from "./turnMutationGuard.js";

const current = { id: "turn", unitNumber: "101", propertyId: "property", boardGroup: "WORK", makeReadyStatus: "IN PROGRESS", completionStatus: "NO", vacancyStatus: "VACANT NOT LEASED NOT READY" } as MakeReadyItem;

test("only a new repair completion hands an unfinished turn to inspection", () => {
  assert.equal(requestsInspection(current, { completionStatus: " yes " }), true);
  assert.equal(requestsInspection(current, { notes: "Updated" }), false);
  assert.equal(requestsInspection({ ...current, completionStatus: "YES" }, { completionStatus: "YES" }), false);
  for (const status of ["DONE", "FINAL WALK", "final-walk", "COMPLETE", "READY"]) {
    assert.equal(requestsInspection({ ...current, makeReadyStatus: status }, { completionStatus: "YES" }), false);
  }
});

test("ready intent distinguishes actual ready mutations from repair completion or unrelated edits", () => {
  assert.equal(readyStatusIntent(current, { completionStatus: "YES" }), false);
  assert.equal(readyStatusIntent(current, { notes: "Note" }), false);
  for (const status of ["DONE", "complete", "Ready"]) assert.equal(readyStatusIntent(current, { makeReadyStatus: status }), true);
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
    for (const patch of [{ makeReadyStatus: "DONE" }, { boardGroup: "READY" }]) {
      await assert.rejects(guardReadyMutation(db, { ...current, makeReadyStatus: evidence === "phase" ? "FINAL WALK" : "IN PROGRESS" }, patch, "Reviewer"), { statusCode: 409, message: /Final walk \/ Mark ready/ });
    }
  }
});
