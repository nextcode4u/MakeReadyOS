import assert from "node:assert/strict";
import { test } from "node:test";
import { reportDay, resolveReportDay } from "./reportDate.js";

test("report dates stay on the source calendar day, including midnight UTC", () => {
  for (const value of ["2026-09-17", "2026-09-17T00:00:00.000Z", "09/17/2026"]) assert.equal(reportDay(value), "2026-09-17");
  for (const value of ["2026-02-30", "2026-09-99", "junk"]) assert.equal(reportDay(value), null);
});

test("matching file dates are inferred; missing dates need fallback and mixed rows identify units", async () => {
  const { availabilityReportDate } = await import(new URL("../../../web/src/lib/availabilityReportDate.ts", import.meta.url).href);
  const rows = [{ number: "163", reportDate: "2026-09-17" }, { number: "262", reportDate: "2026-09-17" }];
  assert.equal(resolveReportDay(rows), "2026-09-17");
  assert.equal(resolveReportDay(rows, "2026-09-17"), "2026-09-17");
  assert.deepEqual(availabilityReportDate(rows), { date: "2026-09-17", error: "" });
  assert.equal(resolveReportDay([{ number: "163" }], "2026-09-17"), "2026-09-17");
  assert.equal(availabilityReportDate([{ number: "163" }]).date, "");
  const mixed = [rows[0], { number: "262", reportDate: "2026-09-16" }];
  assert.throws(() => resolveReportDay(mixed), /262: 2026-09-16/);
  assert.match(availabilityReportDate(mixed).error, /262: 2026-09-16/);
  assert.throws(() => resolveReportDay(rows, "2026-09-16"), /does not match/);
  assert.match(availabilityReportDate([{ number: "262", reportDate: "2026-02-30" }]).error, /262/);
});
