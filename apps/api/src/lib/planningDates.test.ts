import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, dateKey, defaultPlanningWindow, startOfDay } from "./planningDates.js";

test("planning calendar dates stay visible and stable across timezones and DST", () => {
  const originalTimezone = process.env.TZ;
  try {
    for (const timezone of ["UTC", "America/Chicago", "Pacific/Auckland"]) {
      process.env.TZ = timezone;
      const date = new Date("2026-09-06");
      const window = defaultPlanningWindow(new Date("2026-09-06T21:00:00Z"));
      assert.ok(date >= window.from && date < window.to, timezone);
      assert.equal(dateKey(date), "2026-09-06", timezone);
      assert.equal(startOfDay(date).toISOString(), "2026-09-06T00:00:00.000Z", timezone);
      assert.equal(addDays(new Date("2026-03-07"), 7).toISOString(), "2026-03-14T00:00:00.000Z", timezone);
      assert.equal(addDays(new Date("2026-10-31"), 7).toISOString(), "2026-11-07T00:00:00.000Z", timezone);
    }
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});
