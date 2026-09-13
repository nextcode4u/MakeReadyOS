ALTER TABLE "Notification" ADD COLUMN "pushPending" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Notification" ALTER COLUMN "pushPending" SET DEFAULT true;
CREATE INDEX "Notification_pushPending_createdAt_idx" ON "Notification"("pushPending", "createdAt");
CREATE TABLE "PushSubscription" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sessionId" TEXT NOT NULL REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_sessionId_idx" ON "PushSubscription"("sessionId");
CREATE TABLE "PushDelivery" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "notificationId" TEXT NOT NULL REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "subscriptionId" TEXT NOT NULL REFERENCES "PushSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "eventAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "PushDelivery_notificationId_subscriptionId_eventAt_key" ON "PushDelivery"("notificationId", "subscriptionId", "eventAt");
CREATE INDEX "PushDelivery_status_nextAttemptAt_idx" ON "PushDelivery"("status", "nextAttemptAt");
