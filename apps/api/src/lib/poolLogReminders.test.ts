import assert from "node:assert/strict";
import test from "node:test";

test("pool reminders follow property hours and local dates and skip facilities already logged", async t => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "pool-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  const { poolReminderDate, notifyMissingPoolLogs } = await import("./poolLogReminders.js");
  const { prisma } = await import("./prisma.js");
  const calendar = {
    timezone: "America/Chicago", noWeekendScheduling: true,
    avoidMondayScheduling: false, avoidFridayScheduling: false,
    maintenanceStartMinute: 480, maintenanceEndMinute: 1020,
  };
  for (const stamp of ["2026-09-26T15:00:00Z", "2026-09-27T15:00:00Z", "2026-09-28T12:59:00Z", "2026-09-28T22:00:00Z"]) {
    assert.equal(poolReminderDate(new Date(stamp), calendar), null, stamp);
  }
  assert.equal(poolReminderDate(new Date("2026-09-28T13:00:00Z"), calendar), "2026-09-28");
  assert.equal(poolReminderDate(new Date("2026-09-28T21:59:00Z"), calendar), "2026-09-28");
  assert.equal(poolReminderDate(new Date("2026-12-07T13:59:00Z"), calendar), null, "winter offset");
  assert.equal(poolReminderDate(new Date("2026-12-07T14:00:00Z"), calendar), "2026-12-07");
  assert.equal(poolReminderDate(new Date("2026-09-26T15:00:00Z"), { ...calendar, noWeekendScheduling: false }), "2026-09-26");
  assert.equal(poolReminderDate(new Date("2026-09-28T15:00:00Z"), { ...calendar, avoidMondayScheduling: true }), null);
  assert.equal(poolReminderDate(new Date("2026-09-25T15:00:00Z"), { ...calendar, avoidFridayScheduling: true }), null);
  assert.equal(poolReminderDate(new Date("2026-09-28T13:00:00Z"), { ...calendar, maintenanceStartMinute: 540 }), null);
  assert.equal(poolReminderDate(new Date("2026-09-26T15:00:00Z"), null), null, "default weekend policy");
  assert.equal(poolReminderDate(new Date("2026-09-28T13:00:00Z"), null), "2026-09-28");
  assert.equal(poolReminderDate(new Date("2026-09-28T13:00:00Z"), { ...calendar, timezone: "invalid" }), null);
  assert.equal(poolReminderDate(new Date("2026-09-27T23:00:00Z"), { ...calendar, timezone: "Asia/Tokyo" }), "2026-09-28", "local Monday while UTC is Sunday");

  const stub = (delegate: any, key: string, fn: (...args: any[]) => unknown) => {
    const original = delegate[key]; delegate[key] = fn;
    t.after(() => { delegate[key] = original; });
  };
  let activeCalendar = calendar;
  const queries: any[] = [];
  const notifications: any[] = [];
  stub(prisma.operatingCalendar, "findUnique", async () => activeCalendar);
  stub(prisma.poolLogEntry, "findMany", async query => { queries.push(query); return [{ facilityId: "logged" }]; });
  stub(prisma.user, "findMany", async () => [{ id: "manager" }]);
  stub(prisma.userNotificationSettings, "findUnique", async () => null);
  stub(prisma.notificationPreference, "findMany", async () => []);
  stub(prisma.notification, "upsert", async query => { notifications.push(query.create); return query.create; });
  const input = { propertyId: "demo", facilities: [{ id: "logged", name: "Recorded pool" }, { id: "missing", name: "Demo spa" }] };
  await notifyMissingPoolLogs(input, new Date("2026-09-26T15:00:00Z"));
  await notifyMissingPoolLogs(input, new Date("2026-09-28T22:00:00Z"));
  assert.equal(queries.length, 0);
  assert.equal(notifications.length, 0);
  activeCalendar = { ...calendar, timezone: "Asia/Tokyo" };
  await notifyMissingPoolLogs(input, new Date("2026-09-27T23:00:00Z"));
  assert.equal(queries[0].where.propertyId, "demo");
  assert.equal(queries[0].where.logDate.gte.toISOString(), "2026-09-28T00:00:00.000Z");
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].dedupeKey, "pool-missing-log:missing:2026-09-28");
});
