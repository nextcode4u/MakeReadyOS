import assert from "node:assert/strict";
import { test } from "node:test";
import { computeDerivedFields } from "./board.js";

const now = new Date(2026, 8, 8, 12);
const dates = { makeReadyDate: new Date(2026, 8, 1), moveInDate: new Date(2026, 8, 9), vacatedDate: new Date(2026, 7, 1) };

test("ready vacancy statuses clear overdue and unfinished move-in warnings", () => {
  for (const vacancyStatus of ["VACANT_LEASED_READY", "VACANT_NOT_LEASED_READY", " vacant leased ready ", "vacant-not-leased-ready"]) {
    const result = computeDerivedFields({ ...dates, vacancyStatus, completionStatus: null, overdue: true, moveInSoon: true }, now);
    assert.equal(result.overdue, false);
    assert.equal(result.moveInSoon, false);
    assert.equal(result.daysVacant, 38);
    assert.equal(result.daysUntilMoveIn, 1);
  }
});

test("completed turns do not require a second ready indicator", () => {
  for (const completionStatus of ["YES", "DONE", "COMPLETE", "completed"]) {
    const result = computeDerivedFields({ ...dates, completionStatus }, now);
    assert.equal(result.overdue, false);
    assert.equal(result.moveInSoon, false);
  }
});

test("pending final walks retain overdue and move-in warnings despite repair completion", () => {
  for (const makeReadyStatus of ["FINAL WALK", "final-walk", "FINAL_WALK"]) {
    const result = computeDerivedFields({ ...dates, makeReadyStatus, completionStatus: "YES", vacancyStatus: "VACANT LEASED READY" }, now);
    assert.equal(result.overdue, true);
    assert.equal(result.moveInSoon, true);
  }
  const inspected = computeDerivedFields({ ...dates, makeReadyStatus: "DONE", completionStatus: "YES", vacancyStatus: "VACANT LEASED READY" }, now);
  assert.equal(inspected.overdue, false);
  assert.equal(inspected.moveInSoon, false);
});

test("not-ready and reopened turns still receive overdue warnings", () => {
  for (const vacancyStatus of [null, "VACANT_LEASED_NOT_READY", "VACANT_NOT_LEASED_NOT_READY"]) {
    const result = computeDerivedFields({ ...dates, vacancyStatus, completionStatus: "NO" }, now);
    assert.equal(result.overdue, true);
    assert.equal(result.moveInSoon, true);
  }
  assert.equal(computeDerivedFields({ makeReadyDate: new Date(2026, 8, 8) }, now).overdue, false);
  assert.equal(computeDerivedFields({}, now).overdue, false);
});
