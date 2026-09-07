import assert from "node:assert/strict";
import { test } from "node:test";

test("assignment notification recipients are property-scoped and unambiguous", async (t) => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  const { prisma } = await import("./prisma.js");
  const { assignedStaffUserId } = await import("./notifications.js");
  const original = prisma.user.findMany;
  let matches: any[] = [];
  let queries = 0;
  prisma.user.findMany = (async (query: any) => {
    queries++;
    assert.equal(query.where.fullName, "Same Name");
    assert.equal(query.where.isActive, true);
    assert.deepEqual(query.where.OR, [{ role: "ADMIN" }, { propertyAccess: { some: { propertyId: "property-a" } } }]);
    assert.deepEqual(query.select, { id: true });
    assert.equal(query.take, 2);
    return matches;
  }) as any;
  t.after(() => { prisma.user.findMany = original; });
  assert.equal(await assignedStaffUserId(null, "property-a"), null);
  assert.equal(queries, 0);
  assert.equal(await assignedStaffUserId("Same Name", "property-a"), null);
  matches = [{ id: "eligible" }];
  assert.equal(await assignedStaffUserId("Same Name", "property-a"), "eligible");
  matches.push({ id: "also-eligible" });
  assert.equal(await assignedStaffUserId("Same Name", "property-a"), null);
});
