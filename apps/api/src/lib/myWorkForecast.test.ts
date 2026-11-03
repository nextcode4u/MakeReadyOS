import assert from "node:assert/strict";
import test from "node:test";
process.env.ADMIN_USERNAME = "forecast-test";
process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
const { forecastRotation } = await import("./myWorkForecast.js");

test("assigned and tentative upcoming turns expose scheduled move-in dates without inventing dates", async t => {
  const { prisma } = await import("./prisma.js");
  const { myWorkForecast } = await import("./myWorkForecast.js");
  const original = prisma.$transaction;
  const base = { propertyId: "demo", isArchived: false, vacancyStatus: "NTV LEASED", completionStatus: "NO", moveOutDate: new Date("2099-01-05"), vacatedDate: null, customFieldValues: [{ value: "2099-01-06" }], workAssignmentBlocks: [] };
  const tx = {
    property: { findMany: async () => [{ id: "demo", code: "DG", name: "Demo Gardens", operatingCalendar: null, boardSections: [], turnAssignmentPolicy: { enabled: true, shares: [{ userId: "tech", percent: 100 }], credits: {} } }] },
    user: { findMany: async () => [{ id: "tech", fullName: "Demo Tech" }] },
    makeReadyItem: { findMany: async () => [
      { ...base, id: "assigned", unitNumber: "101", assignedTech: "Demo Tech", moveInDate: new Date("2099-01-09") },
      { ...base, id: "tentative", unitNumber: "102", assignedTech: null, moveInDate: new Date("2099-01-10") },
      { ...base, id: "no-date", unitNumber: "103", assignedTech: null, moveInDate: null },
    ] },
  };
  prisma.$transaction = (async (fn: any) => fn(tx)) as any;
  t.after(() => { prisma.$transaction = original; });
  const result = await myWorkForecast({ id: "tech", fullName: "Demo Tech" }, ["demo"]);
  assert.equal(result.turns.find(turn => turn.id === "assigned")?.moveInDate, "2099-01-09T00:00:00.000Z");
  assert.equal(result.turns.find(turn => turn.id === "tentative")?.moveInDate, "2099-01-10T00:00:00.000Z");
  assert.equal(result.turns.find(turn => turn.id === "no-date")?.moveInDate, null);
});

test("forecast rotation preserves credits and balances independent property splits", () => {
  const shares = [{ userId: "manager", percent: 25 }, { userId: "tech", percent: 75 }];
  const candidates = Array.from({ length: 100 }, (_, i) => ({ id: String(i).padStart(3, "0"), vacancyDate: "2099-01-01" })).reverse();
  const credits = { manager: 25, tech: -25 };
  const forecast = forecastRotation(candidates, shares, credits);
  assert.equal(forecast.filter(row => row.userId === "manager").length, 25);
  assert.deepEqual(credits, { manager: 25, tech: -25 });
  assert.deepEqual(forecastRotation(candidates, shares, credits), forecast);
  assert.equal(forecastRotation(candidates, [{ userId: "manager", percent: 100 }], {}).filter(row => row.userId === "manager").length, 100);
  assert.equal(candidates[0].id, "099");
});

test("earlier vacancies consume simulated positions before later upcoming vacancies", () => {
  const shares = [{ userId: "a", percent: 50 }, { userId: "b", percent: 50 }];
  assert.deepEqual(forecastRotation([{ id: "future", vacancyDate: "2099-01-01" }, { id: "backlog", vacancyDate: "2000-01-01" }], shares, {}), [{ id: "backlog", userId: "a" }, { id: "future", userId: "b" }]);
});
