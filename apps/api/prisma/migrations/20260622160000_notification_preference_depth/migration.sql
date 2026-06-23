ALTER TABLE "NotificationPreference"
ADD COLUMN "scopeKey" TEXT NOT NULL DEFAULT 'GLOBAL',
ADD COLUMN "propertyId" TEXT;

CREATE TABLE "UserNotificationSettings" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT false,
  "quietHoursStartMinute" INTEGER NOT NULL DEFAULT 1320,
  "quietHoursEndMinute" INTEGER NOT NULL DEFAULT 420,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserNotificationSettings_pkey" PRIMARY KEY ("id")
);

DROP INDEX "NotificationPreference_userId_category_key";
CREATE UNIQUE INDEX "NotificationPreference_userId_category_scopeKey_key" ON "NotificationPreference"("userId", "category", "scopeKey");
CREATE INDEX "NotificationPreference_userId_propertyId_idx" ON "NotificationPreference"("userId", "propertyId");
CREATE UNIQUE INDEX "UserNotificationSettings_userId_key" ON "UserNotificationSettings"("userId");

ALTER TABLE "NotificationPreference"
ADD CONSTRAINT "NotificationPreference_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserNotificationSettings"
ADD CONSTRAINT "UserNotificationSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
