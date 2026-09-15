import assert from "node:assert/strict";
import { test } from "node:test";
import { planUnitInspectionDates, pmDate, pmStarters, nextPmStarterDate } from "./pmStarters.js";

test("recurrence stays anchored through month ends and leap years", () => {
  const template = { frequency: "Monthly", firstDueDate: new Date("2028-01-31"), customEveryDays: null };
  const feb = nextPmStarterDate(template, template.firstDueDate);
  assert.equal(feb.toISOString().slice(0, 10), "2028-02-29");
  assert.equal(nextPmStarterDate(template, feb).toISOString().slice(0, 10), "2028-03-31");
  for (const [frequency, date] of [["Daily", "2028-02-01"], ["Weekly", "2028-02-07"], ["Biweekly", "2028-02-14"], ["Quarterly", "2028-04-30"], ["Semi-Annual", "2028-07-31"], ["Annual", "2029-01-31"], ["Custom", "2028-02-03"]]) {
    assert.equal(nextPmStarterDate({ ...template, frequency, customEveryDays: 3 }, template.firstDueDate).toISOString().slice(0, 10), date);
  }
});

test("inspection planner covers each directory unit once on selected days", () => {
  const units = Array.from({ length: 135 }, (_, i) => ({ id: `${i}`, number: `${135 - i}`, building: null }));
  const plan = planUnitInspectionDates(units, "2026-10-01", "2026-12-31", [1, 2, 3, 4, 5]);
  assert.equal(plan.length, 135);
  assert.equal(new Set(plan.map(row => row.unitId)).size, 135);
  assert.equal(plan[0].number, "1");
  assert.equal(plan[0].dueDate, "2026-10-01");
  assert.equal(plan.at(-1)!.dueDate, "2026-12-31");
  for (const row of plan) assert.ok([1, 2, 3, 4, 5].includes(new Date(row.dueDate).getUTCDay()));
});
test("inspection planner validates dates and empty windows", () => {
  assert.equal(pmDate.safeParse("2026-02-30").success, false);
  assert.throws(() => planUnitInspectionDates([], "2026-10-02", "2026-10-01", [1]));
  assert.throws(() => planUnitInspectionDates([], "2026-10-03", "2026-10-04", [1]));
  assert.deepEqual(planUnitInspectionDates([], "2026-10-01", "2026-10-01", [4]), []);
  assert.equal(planUnitInspectionDates([{ id: "one", number: "011", building: null }], "2026-10-01", "2026-12-31", [1])[0].dueDate, "2026-10-05");
});
test("starter keys are stable and unique", () => {
  assert.equal(new Set(pmStarters.map(row => row.key)).size, pmStarters.length);
  assert.ok(pmStarters.some(row => row.key === "unit-inspection" && row.frequency === "Quarterly"));
});
