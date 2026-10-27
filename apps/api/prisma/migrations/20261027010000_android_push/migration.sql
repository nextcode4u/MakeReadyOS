ALTER TABLE "PushSubscription"
  ADD COLUMN "transport" TEXT NOT NULL DEFAULT 'WEB',
  ADD COLUMN "fcmToken" TEXT,
  ADD COLUMN "fcmProjectId" TEXT,
  ADD COLUMN "bindingId" TEXT;
