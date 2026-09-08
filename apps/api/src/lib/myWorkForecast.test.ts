import assert from "node:assert/strict";
import test from "node:test";
process.env.ADMIN_USERNAME = "forecast-test";
process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
const { forecastRotation } = await import("./myWorkForecast.js");

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
