import assert from "node:assert/strict";
import test from "node:test";
process.env.ADMIN_USERNAME = "projection-test";
process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
const { projectedTurnStart } = await import("./turnStartProjection.js");

const item = { isArchived: false, vacancyStatus: "NTV LEASED", completionStatus: "NO", moveOutDate: new Date(2026, 8, 11), vacatedDate: null };
const day = (value: string | null) => value ? new Date(value).getDate() : null;

test("upcoming notice starts use expected vacate and skip weekends without assignment", () => {
  assert.equal(day(projectedTurnStart(item)), 14);
  assert.equal(day(projectedTurnStart({ ...item, vacatedDate: new Date(2020, 0, 1) })), 14);
  assert.equal(day(projectedTurnStart({ ...item, moveOutDate: new Date(2026, 8, 15) })), 16);
  assert.equal(day(projectedTurnStart(item, { noWeekendScheduling: false, avoidMondayScheduling: true, avoidFridayScheduling: false })), 15);
  assert.equal(day(projectedTurnStart({ ...item, vacancyStatus: "NTV_NOT_LEASED" })), 14);
});

test("actual vacancy supersedes expected vacancy; ineligible and undated units stay off projections", () => {
  assert.equal(day(projectedTurnStart({ ...item, vacancyStatus: "VACANT NOT LEASED NOT READY", vacatedDate: new Date(2026, 8, 16) })), 17);
  for (const vacancyStatus of ["OCCUPIED", "VACANT LEASED READY", "VACANT NOT LEASED READY", "UNKNOWN", null]) {
    assert.equal(projectedTurnStart({ ...item, vacancyStatus }), null);
  }
  assert.equal(projectedTurnStart({ ...item, isArchived: true }), null);
  assert.equal(projectedTurnStart({ ...item, completionStatus: "DONE" }), null);
  assert.equal(projectedTurnStart({ ...item, moveOutDate: null }), null);
});
