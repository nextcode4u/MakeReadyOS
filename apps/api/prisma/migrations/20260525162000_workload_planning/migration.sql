-- Workload planning foundation: capacity scaffold plus planned assignment blocks.
CREATE TABLE "UserCapacity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "defaultDailyHours" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "tradeCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "unavailableDays" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCapacity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkAssignmentBlock" (
    "id" TEXT NOT NULL,
    "assignedUserId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "plannedDate" TIMESTAMP(3) NOT NULL,
    "estimatedHours" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "actualHours" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkAssignmentBlock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserCapacity_userId_key" ON "UserCapacity"("userId");
CREATE INDEX "UserCapacity_defaultDailyHours_idx" ON "UserCapacity"("defaultDailyHours");
CREATE INDEX "WorkAssignmentBlock_propertyId_plannedDate_idx" ON "WorkAssignmentBlock"("propertyId", "plannedDate");
CREATE INDEX "WorkAssignmentBlock_assignedUserId_plannedDate_idx" ON "WorkAssignmentBlock"("assignedUserId", "plannedDate");
CREATE INDEX "WorkAssignmentBlock_itemId_status_idx" ON "WorkAssignmentBlock"("itemId", "status");
CREATE INDEX "WorkAssignmentBlock_status_plannedDate_idx" ON "WorkAssignmentBlock"("status", "plannedDate");

ALTER TABLE "UserCapacity" ADD CONSTRAINT "UserCapacity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkAssignmentBlock" ADD CONSTRAINT "WorkAssignmentBlock_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkAssignmentBlock" ADD CONSTRAINT "WorkAssignmentBlock_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkAssignmentBlock" ADD CONSTRAINT "WorkAssignmentBlock_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "MakeReadyItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
