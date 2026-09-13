import assert from "node:assert/strict";
import test from "node:test";

test("down sections and down/model statuses have no turn risk; active turns still do", async () => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "risk-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  const { evaluateItemRisk } = await import("./risk.js");
  const now = new Date("2026-09-13T12:00:00Z");
  const item = { vacancyStatus: "VACANT NOT LEASED NOT READY", completionStatus: "NO", makeReadyStatus: "FINAL_WALK",
    makeReadyDate: new Date("2026-08-01"), vacatedDate: new Date("2026-07-01"), moveInDate: now,
    updatedAt: new Date("2026-08-01"), cleaningStatus: null } as any;
  for (const overrides of [{ boardSectionType: "DOWN" }, { vacancyStatus: " down " }, { vacancyStatus: "MODEL" }]) {
    const result = evaluateItemRisk({ ...item, ...overrides }, now);
    assert.equal(result.riskLevel, "NONE");
    assert.equal(result.riskScore, 0);
    assert.deepEqual(result.riskReasons, []);
  }
  assert.equal(evaluateItemRisk({ ...item, boardSectionType: "MAKE_READY" }, now).riskLevel, "CRITICAL");
});
