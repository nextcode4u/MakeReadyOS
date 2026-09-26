import assert from "node:assert/strict";
import test from "node:test";
import webpush from "web-push";
import { prisma } from "./prisma.js";
import { deliverPushBatch, pushConfiguration, pushPayload, retryPush, validPushEndpoint } from "./push.js";

test("push endpoints reject local, credentialed, and deceptive destinations", () => {
  for (const url of ["https://fcm.googleapis.com/fcm/send/token", "https://updates.push.services.mozilla.com/wpush/v2/token", "https://web.push.apple.com/token", "https://wns2.notify.windows.com/token"]) assert.equal(validPushEndpoint(url), true, url);
  for (const url of ["http://fcm.googleapis.com/token", "https://localhost/token", "https://127.0.0.1/", "https://fcm.googleapis.com.evil.test/", "https://evilnotify.windows.com/", "https://user:pass@web.push.apple.com/", "https://fcm.googleapis.com:4000/", "https://web.push.apple.com/#secret", "not a URL"]) assert.equal(validPushEndpoint(url), false, url);
  assert.equal(retryPush(410, 1), false);
  assert.equal(retryPush(401, 1), false);
  assert.equal(retryPush(429, 4), true);
  assert.equal(retryPush(503, 5), false);
  assert.equal(retryPush(undefined, 1), true);
  const note = { id: "notice", title: "Final walk ready for inspection", itemId: "unit-id", property: { code: "VAB" }, item: { unitNumber: "2907P" }, message: "Private resident note and door code" };
  const payload = JSON.parse(pushPayload(note));
  assert.deepEqual(payload, { title: "MakeReadyOS - VAB 2907P", body: "Final walk ready for inspection. Tap to view details.", tag: "mros-notice", notificationId: "notice", itemId: "unit-id" });
  assert.ok(!JSON.stringify(payload).includes("door code"));
});

test("push worker respects current access, unread state, sessions, quiet hours and retries", async t => {
  const oldEnv = { public: process.env.VAPID_PUBLIC_KEY, private: process.env.VAPID_PRIVATE_KEY, subject: process.env.VAPID_SUBJECT };
  const keys = webpush.generateVAPIDKeys();
  process.env.VAPID_PUBLIC_KEY = keys.publicKey; process.env.VAPID_PRIVATE_KEY = keys.privateKey; process.env.VAPID_SUBJECT = "mailto:test@example.com";
  assert.ok(pushConfiguration());
  const restore: Array<() => void> = [];
  function stub(object: any, key: string, value: any) { const original = object[key]; object[key] = value; restore.push(() => { object[key] = original; }); }
  t.after(() => {
    for (const reset of restore.reverse()) reset();
    for (const [key, value] of Object.entries({ VAPID_PUBLIC_KEY: oldEnv.public, VAPID_PRIVATE_KEY: oldEnv.private, VAPID_SUBJECT: oldEnv.subject })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  });
  const now = new Date();
  const base = () => ({ id: "job", attempts: 1, eventAt: now,
    notification: { id: "notice", userId: "user", propertyId: "property", category: "ASSIGNMENT", createdAt: now, isRead: false },
    subscription: { id: "device", endpoint: "https://fcm.googleapis.com/token", p256dh: "key", auth: "auth", session: { expiresAt: new Date(Date.now() + 60000), user: { id: "user", isActive: true, role: "TECH", propertyAccess: [{ propertyId: "property" }] } } },
  });
  let fresh = base(), preferences: any[] = [], settings: any = null, sent = 0, removed = 0;
  let updates: any[] = [];
  stub(prisma, "$transaction", async (run: any) => run({ $queryRaw: async () => [{ locked: true }], notification: { findMany: async () => [] } }));
  stub(prisma.pushDelivery, "findMany", async () => [{ id: "job", nextAttemptAt: now }]);
  stub(prisma.pushDelivery, "updateMany", async (input: any) => { updates.push(input.data); return { count: 1 }; });
  stub(prisma.pushDelivery, "findUnique", async () => fresh);
  stub(prisma.pushDelivery, "deleteMany", async () => ({ count: 0 }));
  stub(prisma.pushSubscription, "deleteMany", async () => { removed++; return { count: 1 }; });
  stub(prisma.notificationPreference, "findMany", async () => preferences);
  stub(prisma.userNotificationSettings, "findUnique", async () => settings);
  const transport = (async (_device: unknown, payload: string) => { sent++; assert.equal(payload, pushPayload(fresh.notification)); }) as any;
  await deliverPushBatch(transport); assert.equal(sent, 1); assert.equal(updates.at(-1).status, "SENT");
  const skip = async (change: (value: ReturnType<typeof base>) => void) => {
    fresh = base(); change(fresh); updates = []; const before = sent;
    await deliverPushBatch(transport); assert.equal(sent, before); assert.equal(updates.at(-1).status, "SKIPPED");
  };
  await skip(value => { value.notification.isRead = true; });
  await skip(value => { value.subscription.session.user.isActive = false; });
  await skip(value => { value.subscription.session.user.id = "other"; });
  await skip(value => { value.subscription.session.user.propertyAccess = []; });
  await skip(value => { value.subscription.session.expiresAt = new Date(0); });
  await skip(value => { value.notification.createdAt = new Date(now.getTime() + 1); });
  await skip(value => { value.eventAt = value.notification.createdAt = new Date(0); });
  preferences = [{ scopeKey: "GLOBAL", enabled: false }]; await skip(() => {});
  preferences.push({ scopeKey: "PROPERTY:property", enabled: true }); fresh = base(); await deliverPushBatch(transport); assert.equal(sent, 2);
  preferences = [];
  await skip(value => { value.notification.category = "STATUS_CHANGE"; });
  await skip(value => { value.notification.category = "CHECKLIST"; });
  await skip(value => { value.notification.category = "BATCH_CHANGE"; });
  await skip(value => { value.notification.category = "POND_MILESTONE"; });
  const minute = new Date().getHours() * 60 + new Date().getMinutes();
  settings = { quietHoursEnabled: true, quietHoursStartMinute: minute, quietHoursEndMinute: (minute + 2) % 1440 };
  await skip(() => {}); settings = null; fresh = base();
  await deliverPushBatch((async () => { throw { statusCode: 410 }; }) as any); assert.equal(removed, 1);
  updates = []; await deliverPushBatch((async () => { throw { statusCode: 503 }; }) as any); assert.ok(updates.at(-1).nextAttemptAt > now); assert.equal(updates.at(-1).status, undefined);
  fresh.attempts = 5; await deliverPushBatch((async () => { throw { statusCode: 503 }; }) as any); assert.equal(updates.at(-1).status, "FAILED");
});
