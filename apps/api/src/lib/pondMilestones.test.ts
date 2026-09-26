import assert from "node:assert/strict";
import { test } from "node:test";
import { pondMilestones, recordPondCompletion } from "./pondMilestones.js";

test("team credit is once per turn, cumulative, milestone-only, and property-scoped", async () => {
  const ledger = new Map<string, string>();
  const notices: any[] = [];
  const muted = new Set<string>();
  let locked = false;
  const db = {
    $queryRaw: async () => { locked = true; },
    pondTurnCompletion: {
      createMany: async ({ data, skipDuplicates }: any) => {
        assert.equal(locked, true); assert.equal(skipDuplicates, true);
        const row = data[0];
        if (ledger.has(row.itemId)) return { count: 0 };
        ledger.set(row.itemId, row.propertyId); return { count: 1 };
      },
      count: async ({ where }: any) => [...ledger.values()].filter(id => id === where.propertyId).length,
    },
    property: { findUniqueOrThrow: async () => ({ name: "Test property" }) },
    user: { findMany: async ({ where }: any) => {
      assert.equal(where.isActive, true);
      assert.deepEqual(where.OR[1].role.in, ["MANAGER", "TECH", "PAINTER", "CLEANER", "LEASING"]);
      assert.equal(where.OR[1].propertyAccess.some.propertyId, "property-a");
      return [{ id: "tech" }, { id: "cleaner" }, { id: "leasing" }];
    } },
    userNotificationSettings: { findUnique: async () => null },
    notificationPreference: { findMany: async ({ where }: any) => muted.has(where.userId) ? [{ scopeKey: "GLOBAL", enabled: false }] : [] },
    notification: { upsert: async ({ create }: any) => { notices.push(create); return create; } },
  } as any;
  for (let index = 1; index <= 100; index++) {
    if (index === 5) muted.add("leasing");
    await recordPondCompletion(db, { id: `turn-${index}`, propertyId: "property-a" });
    const count = notices.length;
    await recordPondCompletion(db, { id: `turn-${index}`, propertyId: "property-a" });
    assert.equal(notices.length, count, "reapproval must not recreate or unread a notice");
  }
  assert.equal(ledger.size, 100);
  assert.equal(notices.length, 3 + (pondMilestones.length - 1) * 2);
  assert.equal(new Set(notices.map(note => `${note.userId}:${note.dedupeKey}`)).size, notices.length);
  assert.ok(notices.every(note => note.category === "POND_MILESTONE" && note.pushPending === false && note.itemId === null));
});
