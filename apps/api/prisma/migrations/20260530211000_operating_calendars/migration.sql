-- Property-scoped operating calendars store schedule guardrails used by
-- planning, automation review, and future business-day date population.
CREATE TABLE "OperatingCalendar" (
  "id" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT 'Default Operating Calendar',
  "timezone" TEXT NOT NULL DEFAULT 'America/Chicago',
  "noWeekendScheduling" BOOLEAN NOT NULL DEFAULT true,
  "avoidMondayScheduling" BOOLEAN NOT NULL DEFAULT false,
  "avoidFridayScheduling" BOOLEAN NOT NULL DEFAULT false,
  "maintenanceStartMinute" INTEGER NOT NULL DEFAULT 480,
  "maintenanceEndMinute" INTEGER NOT NULL DEFAULT 1020,
  "vendorLeadDays" INTEGER NOT NULL DEFAULT 3,
  "dailyScheduledUnitLimit" INTEGER,
  "scopeDay" INTEGER,
  "workStartDay" INTEGER,
  "autoPopulateEnabled" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OperatingCalendar_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OperatingCalendar_propertyId_key" ON "OperatingCalendar"("propertyId");
CREATE INDEX "OperatingCalendar_propertyId_noWeekendScheduling_idx" ON "OperatingCalendar"("propertyId", "noWeekendScheduling");

ALTER TABLE "OperatingCalendar" ADD CONSTRAINT "OperatingCalendar_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
