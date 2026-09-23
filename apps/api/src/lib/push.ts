import webpush from "web-push";
import { prisma } from "./prisma.js";
import { notificationEnabledByDefault } from "./notificationPolicy.js";

export function validPushEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && !url.username && !url.password && !url.hash && (!url.port || url.port === "443")
      && (host === "fcm.googleapis.com" || host === "updates.push.services.mozilla.com" || host === "web.push.apple.com" || host.endsWith(".push.apple.com") || host.endsWith(".notify.windows.com"));
  } catch { return false; }
}

export function pushConfiguration() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return null;
  try { webpush.setVapidDetails(subject, publicKey, privateKey); }
  catch { return null; }
  return { publicKey };
}

export function pushPayload(note: { id: string; title?: string; itemId?: string | null; property?: { code: string } | null; item?: { unitNumber: string } | null }) {
  const context = [note.property?.code, note.item?.unitNumber].filter(Boolean).join(" ");
  // Send event headings and unit identity, never free-form messages, notes or access codes.
  return JSON.stringify({ title: context ? `MakeReadyOS - ${context}`.slice(0, 100) : "MakeReadyOS", body: `${note.title?.slice(0, 160) || "New work alert"}. Tap to view details.`, tag: `mros-${note.id}`, notificationId: note.id, itemId: note.itemId ?? null });
}

export function retryPush(statusCode: number | undefined, attempts: number) {
  return attempts < 5 && (!statusCode || statusCode === 429 || statusCode >= 500);
}

type Transport = typeof webpush.sendNotification;
// Fan-out is committed before delivery. A crashed worker's two-minute lease expires.
export async function deliverPushBatch(send: Transport = webpush.sendNotification) {
  if (!pushConfiguration()) return;
  const now = new Date();
  await prisma.$transaction(async db => {
    const lock = await db.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(824090, 1) AS locked`;
    if (!lock[0]?.locked) return;
    const notifications = await db.notification.findMany({ where: { pushPending: true }, orderBy: { createdAt: "asc" }, take: 100 });
    for (const note of notifications) {
      const devices = !note.isRead && now.getTime() - note.createdAt.getTime() < 86400000
        ? await db.pushSubscription.findMany({ where: { createdAt: { lte: note.createdAt }, session: { userId: note.userId, expiresAt: { gt: now }, user: { isActive: true } } } }) : [];
      if (devices.length) await db.pushDelivery.createMany({ data: devices.map(device => ({ notificationId: note.id, subscriptionId: device.id, eventAt: note.createdAt })), skipDuplicates: true });
      await db.notification.updateMany({ where: { id: note.id, createdAt: note.createdAt }, data: { pushPending: false } });
    }
  }, { timeout: 30000 });

  const jobs = await prisma.pushDelivery.findMany({ where: { status: "PENDING", nextAttemptAt: { lte: new Date() } }, take: 20, orderBy: { nextAttemptAt: "asc" } });
  for (const job of jobs) {
    const lease = new Date(Date.now() + 120000);
    const claim = await prisma.pushDelivery.updateMany({ where: { id: job.id, status: "PENDING", nextAttemptAt: job.nextAttemptAt }, data: { nextAttemptAt: lease, attempts: { increment: 1 } } });
    if (!claim.count) continue;
    const fresh = await prisma.pushDelivery.findUnique({ where: { id: job.id }, include: { notification: { include: { property: { select: { code: true } }, item: { select: { unitNumber: true } } } }, subscription: { include: { session: { include: { user: { include: { propertyAccess: true } } } } } } } });
    if (!fresh) continue;
    if (fresh.attempts > 5) {
      await prisma.pushDelivery.updateMany({ where: { id: job.id, nextAttemptAt: lease }, data: { status: "FAILED" } });
      continue;
    }
    const { notification: note, subscription: device } = fresh;
    const user = device.session.user;
    const preferences = await prisma.notificationPreference.findMany({ where: { userId: user.id, category: note.category } });
    const pref = preferences.find(p => p.scopeKey === `PROPERTY:${note.propertyId}`) ?? preferences.find(p => p.scopeKey === "GLOBAL");
    const settings = await prisma.userNotificationSettings.findUnique({ where: { userId: user.id } });
    const current = new Date();
    const minute = current.getHours() * 60 + current.getMinutes();
    const start = settings?.quietHoursStartMinute ?? 0, end = settings?.quietHoursEndMinute ?? 0;
    const quiet = settings?.quietHoursEnabled && start !== end && (start < end ? minute >= start && minute < end : minute >= start || minute < end);
    const allowed = user.isActive && user.id === note.userId && device.session.expiresAt > current && !note.isRead
      && note.createdAt.getTime() === fresh.eventAt.getTime() && current.getTime() - fresh.eventAt.getTime() < 86400000
      && (!note.propertyId || user.role === "ADMIN" || user.propertyAccess.some(access => access.propertyId === note.propertyId))
      && (pref?.enabled ?? notificationEnabledByDefault(note.category)) && !quiet && validPushEndpoint(device.endpoint);
    if (!allowed) {
      await prisma.pushDelivery.updateMany({ where: { id: job.id, nextAttemptAt: lease }, data: { status: "SKIPPED" } });
      continue;
    }
    try {
      await send({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } }, pushPayload(note), { TTL: 300, timeout: 5000, urgency: "normal" });
      await prisma.pushDelivery.updateMany({ where: { id: job.id, nextAttemptAt: lease }, data: { status: "SENT" } });
    } catch (error) {
      const code = (error as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await prisma.pushSubscription.deleteMany({ where: { id: device.id } });
      else await prisma.pushDelivery.updateMany({ where: { id: job.id, nextAttemptAt: lease }, data: retryPush(code, fresh.attempts)
        ? { nextAttemptAt: new Date(Date.now() + Math.min(3600000, 30000 * 2 ** fresh.attempts)) }
        : { status: "FAILED" } });
    }
  }
  await prisma.pushDelivery.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 7 * 86400000) } } });
}

export function startPushWorker() {
  let running: Promise<void> | undefined;
  const tick = () => {
    if (!running) running = deliverPushBatch().catch(() => console.error("Push delivery cycle failed; pending deliveries will retry.")).finally(() => { running = undefined; });
  };
  const timer = setInterval(tick, 15000);
  timer.unref();
  tick();
  return async () => { clearInterval(timer); await running; };
}
