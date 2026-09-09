import assert from "node:assert/strict";
import { test } from "node:test";
import { calendarDayDifference, computeDerivedFields, withLiveTurnFields } from "./board.js";

const now = new Date(2026, 8, 8, 12);
const dates = { makeReadyDate: new Date(2026, 8, 1), moveInDate: new Date(2026, 8, 9), vacatedDate: new Date(2026, 7, 1) };

test("live read fields refresh stale flags without inventing an automation or edit timestamp", () => {
  const stamp = new Date(2026, 7, 1);
  const stored = { ...dates, overdue: false, daysVacant: 999, updatedAt: stamp, lastAutomationAt: stamp };
  const live = withLiveTurnFields(stored, now);
  assert.equal(live.overdue, true);
  assert.equal(live.daysVacant, 38);
  assert.equal(live.updatedAt, stamp);
  assert.equal(live.lastAutomationAt, stamp);
  assert.equal(stored.overdue, false);
  assert.equal(stored.daysVacant, 999);
});

test("turn dates count civil days across spring and fall timezone transitions", () => {
  const originalTimezone = process.env.TZ;
  try {
    for (const timezone of ["UTC", "America/Chicago", "Pacific/Auckland"]) {
      process.env.TZ = timezone;
      for (const [month, day] of [[2, 9], [10, 2], [8, 28], [3, 6]]) {
        const today = new Date(2026, month, day, 12);
        const yesterday = new Date(2026, month, day - 1);
        const tomorrow = new Date(2026, month, day + 1);
        const label = `${timezone} ${month + 1}/${day}`;
        assert.equal(calendarDayDifference(yesterday, today), 1, label);
        assert.equal(calendarDayDifference(today, yesterday), -1, label);
        const live = computeDerivedFields({ makeReadyDate: yesterday, vacatedDate: yesterday, moveInDate: tomorrow }, today);
        assert.equal(live.daysVacant, 1, label);
        assert.equal(live.daysUntilMoveIn, 1, label);
        assert.equal(live.overdue, true, label);
        assert.equal(live.moveInSoon, true, label);
        assert.equal(computeDerivedFields({ makeReadyDate: today }, today).overdue, false, label);
      }
    }
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});

test("ready vacancy statuses clear overdue and unfinished move-in warnings", () => {
  for (const vacancyStatus of ["VACANT_READY", "VACANT_LEASED_READY", "VACANT_NOT_LEASED_READY", " vacant leased ready ", "vacant-not-leased-ready"]) {
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
  assert.equal(computeDerivedFields({ ...dates, makeReadyStatus: "FINAL WALK", vacancyStatus: "VACANT_READY" }, now).overdue, true);
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
