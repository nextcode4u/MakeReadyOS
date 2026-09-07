import assert from "node:assert/strict";
import { test } from "node:test";
import { availabilityChangeTitle, dashboardDateWindow } from "./dashboardDates.js";

test("dashboard calendar windows include today and count overdue work from earlier this week", () => {
  for (const timezone of ["UTC", "America/Chicago", "Pacific/Auckland"]) {
    const previous = process.env.TZ;
    process.env.TZ = timezone;
    try {
      const dates = dashboardDateWindow(new Date("2026-09-09T18:00:00Z"));
      assert.equal(dates.today.toISOString(), "2026-09-09T00:00:00.000Z");
      assert.equal(dates.nextSeven.toISOString(), "2026-09-16T00:00:00.000Z");
      assert.equal(dates.isOverdue(new Date("2026-09-08T00:00:00Z")), true);
      assert.equal(dates.isOverdue(dates.today), false);
      assert.equal(dates.isOverdue(null), false);
      assert.equal(dates.inDays(dates.today, 7), true);
      assert.equal(dates.inDays(new Date("2026-09-08T23:59:59Z"), 7), false);
      assert.equal(dates.inDays(new Date("2026-09-15T00:00:00Z"), 7), true);
      assert.equal(dates.inDays(dates.nextSeven, 7), false);
      assert.equal(dates.inCurrentWeek(new Date("2026-09-06T00:00:00Z")), true);
      assert.equal(dates.inCurrentWeek(new Date("2026-09-13T00:00:00Z")), false);
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  }
});

test("availability activity never labels NOT READY or notices as marked ready", () => {
  for (const status of ["VACANT NOT LEASED NOT READY", "VACANT LEASED NOT READY"]) {
    assert.equal(availabilityChangeTitle(status), "Availability updated vacancy");
  }
  for (const status of ["NTV", "NTV NOT LEASED", "NTV LEASED", "NTV_LEASED"]) {
    assert.equal(availabilityChangeTitle(status), "Availability updated notice");
  }
  assert.equal(availabilityChangeTitle("VACANT LEASED READY"), "Availability marked ready");
  assert.equal(availabilityChangeTitle(null), "Availability synced");
});
