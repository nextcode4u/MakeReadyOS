import assert from "node:assert/strict";
import test from "node:test";

test("least-loaded diagnostics exclude operationally ready assignments without hiding pending inspections", async t => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "assignment-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  const { prisma } = await import("./prisma.js");
  const { applyAutomationRules } = await import("./automationAssignments.js");
  const stub = (delegate: any, name: string, fn: (...args: any[]) => unknown) => {
    const original = delegate[name]; delegate[name] = fn;
    t.after(() => { delegate[name] = original; });
  };
  stub(prisma.user, "findMany", async () => [
    { id: "a", fullName: "Tech A", role: "TECH" }, { id: "b", fullName: "Tech B", role: "TECH" },
  ]);
  const assignments = [
    { assignedTech: "Tech A", completionStatus: "NO", makeReadyStatus: "DONE", vacancyStatus: "VACANT_LEASED_READY" },
    { assignedTech: "Tech A", completionStatus: "completed", makeReadyStatus: "DONE", vacancyStatus: "VACANT_NOT_LEASED_NOT_READY" },
    { assignedTech: "Tech A", completionStatus: "NO", makeReadyStatus: "DONE", vacancyStatus: " vacant-not-leased-ready " },
    { assignedTech: "Tech B", completionStatus: "YES", makeReadyStatus: "FINAL_WALK", vacancyStatus: "VACANT_READY" },
  ];
  stub(prisma.makeReadyItem, "findMany", async args => {
    assert.equal(args.where.propertyId, "property");
    assert.equal(args.where.isArchived, false);
    // Model the old SQL predicate when present, including its final-walk omission.
    return args.where.OR ? assignments.filter(row => !["YES", "DONE"].includes(row.completionStatus)) : assignments;
  });
  stub(prisma.workAssignmentBlock, "findMany", async () => []);
  const result = await applyAutomationRules({ id: "new", propertyId: "property", unitNumber: "101" }, [{
    id: "rule", name: "Balance", enabled: true, conditions: { all: [] }, actions: [{
      type: "assignLeastLoadedStaff", eligibleRoles: ["TECH"], onlyWhenUnassigned: true,
      targetDateField: "makeReadyDate", lookAheadDays: 7, includePlannedWork: false,
    }],
  }]);
  const candidates = result.actionSummaries.get("rule")?.[0].diagnostics?.assignment?.candidates;
  assert.equal(candidates?.find(row => row.userId === "a")?.activeCount, 0);
  assert.equal(candidates?.find(row => row.userId === "b")?.activeCount, 1);
  assert.equal(result.next.assignedTech, "Tech A");
});
