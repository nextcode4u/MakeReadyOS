import assert from "node:assert/strict";
import { test } from "node:test";

test("completion estimates never treat a future timestamp as completed work", async () => {
  const { completionDateForItem } = await import("./analytics.js");
  const now = new Date("2026-09-09T12:00:00Z");
  const future = new Date("2026-10-24T12:00:00Z");
  const past = new Date("2026-09-08T12:00:00Z");
  const base = { updatedAt: past, completionStatus: "YES" };
  for (const candidate of [
    { ...base, moveInDate: future },
    { ...base, archivedAt: future },
    { ...base, updatedAt: future },
    { ...base, moveInDate: new Date(NaN) },
  ]) assert.equal(completionDateForItem(candidate, now), null);
  assert.equal(completionDateForItem({ ...base, moveInDate: now }, now), now);
  assert.equal(completionDateForItem(base, now), past);
  assert.equal(completionDateForItem({ ...base, archivedAt: past, moveInDate: future }, now), past);
  assert.equal(completionDateForItem({ updatedAt: past, completionStatus: "NO" }, now), null);
});

test("future completion estimates are excluded consistently from summary, throughput and new snapshots", async t => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  const { prisma } = await import("./prisma.js");
  const { analyticsSummary, computePropertySnapshot, startOfDay } = await import("./analytics.js");
  const now = new Date("2026-09-09T12:00:00Z");
  const past = new Date("2026-09-08T12:00:00Z");
  const future = new Date("2026-10-24T12:00:00Z");
  const property = { id: "property", code: "TEST", isActive: true };
  const base = {
    id: "future", unitId: "unit", unitNumber: "101", propertyId: property.id, property,
    createdAt: new Date("2026-09-01T12:00:00Z"), updatedAt: past,
    vacatedDate: new Date("2026-09-01T12:00:00Z"), makeReadyDate: now,
    moveInDate: future, completionStatus: "YES", makeReadyStatus: "DONE",
    vacancyStatus: "VACANT LEASED READY", isArchived: false, archivedAt: null,
    assignedTech: "Fixture Tech", riskLevel: "NONE", riskReasons: [], scopeLevel: "STANDARD",
    pestStatus: "ACTIVE", floorsStatus: "GOOD", paintStatus: "GOOD",
    vendorAssignments: [], checklistInstances: [],
  };
  let items = [base];
  const historical = { date: past, property, completedTurnsCount: 17 };
  const stub = (target: any, key: string, value: any) => {
    const original = target[key];
    target[key] = value;
    t.after(() => { target[key] = original; });
  };
  stub(prisma.makeReadyItem, "findMany", async () => items);
  stub(prisma.propertyDailyMetricSnapshot, "findMany", async () => [historical]);
  stub(prisma.boardSection, "findMany", async () => []);

  const summary = await analyticsSummary(property.id, now);
  assert.equal(summary.metrics.completedThisWeek, 0);
  assert.equal(summary.metrics.completedThisMonth, 0);
  assert.equal(summary.metrics.averageTurnDuration, 0);
  assert.equal(summary.metrics.slaMisses, 0);
  assert.deepEqual(summary.slaMissByScope, []);
  assert.deepEqual(summary.recentCompletedTurns, []);
  assert.equal(summary.technicianThroughput[0].completedTurns, 0);
  assert.equal(summary.technicianThroughput[0].averageTurnDuration, null);
  assert.equal(summary.recurringProblemUnits[0].completedTurnCount, 0);
  assert.equal(summary.recurringProblemUnits[0].latestCompletedAt, null);
  assert.equal(summary.recurringProblemUnits[0].averageTurnDuration, null);
  assert.equal(summary.trends[0].completedTurnsCount, 17, "stored historical snapshots are not rewritten");

  items = [base, { ...base, id: "past", moveInDate: past }];
  const mixed = await analyticsSummary(property.id, now);
  assert.equal(mixed.metrics.completedThisWeek, 1);
  assert.equal(mixed.metrics.completedThisMonth, 1);
  assert.equal(mixed.metrics.averageTurnDuration, 7);
  assert.equal(mixed.technicianThroughput[0].completedTurns, 1);
  assert.equal(mixed.recurringProblemUnits[0].completedTurnCount, 1);
  assert.deepEqual(mixed.recentCompletedTurns.map(turn => turn.itemId), ["past"]);

  items = [{ ...base, moveInDate: new Date(now.getTime() + 60_000) }];
  assert.equal((await computePropertySnapshot(property.id, startOfDay(now), now)).completedTurnsCount, 0);
  items = [{ ...base, moveInDate: now }];
  assert.equal((await computePropertySnapshot(property.id, startOfDay(now), now)).completedTurnsCount, 1);
});
