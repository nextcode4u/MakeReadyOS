CREATE TABLE "WorkSession" (
  "id" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "durationMinutes" INTEGER,
  "startNote" TEXT,
  "endNote" TEXT,
  "startedById" TEXT,
  "endedById" TEXT,
  "makeReadyItemId" TEXT,
  "leaseComplianceIssueId" TEXT,
  "projectRecordId" TEXT,
  "preventiveMaintenanceTaskId" TEXT,
  "pestIssueId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkSession_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WorkSession"
  ADD CONSTRAINT "WorkSession_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkSession"
  ADD CONSTRAINT "WorkSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkSession"
  ADD CONSTRAINT "WorkSession_makeReadyItemId_fkey" FOREIGN KEY ("makeReadyItemId") REFERENCES "MakeReadyItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkSession"
  ADD CONSTRAINT "WorkSession_leaseComplianceIssueId_fkey" FOREIGN KEY ("leaseComplianceIssueId") REFERENCES "LeaseComplianceIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkSession"
  ADD CONSTRAINT "WorkSession_projectRecordId_fkey" FOREIGN KEY ("projectRecordId") REFERENCES "ProjectRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkSession"
  ADD CONSTRAINT "WorkSession_preventiveMaintenanceTaskId_fkey" FOREIGN KEY ("preventiveMaintenanceTaskId") REFERENCES "PreventiveMaintenanceTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkSession"
  ADD CONSTRAINT "WorkSession_pestIssueId_fkey" FOREIGN KEY ("pestIssueId") REFERENCES "PestIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "WorkSession_userId_status_startedAt_idx" ON "WorkSession"("userId", "status", "startedAt");
CREATE INDEX "WorkSession_propertyId_status_startedAt_idx" ON "WorkSession"("propertyId", "status", "startedAt");
CREATE INDEX "WorkSession_makeReadyItemId_status_idx" ON "WorkSession"("makeReadyItemId", "status");
CREATE INDEX "WorkSession_leaseComplianceIssueId_status_idx" ON "WorkSession"("leaseComplianceIssueId", "status");
CREATE INDEX "WorkSession_projectRecordId_status_idx" ON "WorkSession"("projectRecordId", "status");
CREATE INDEX "WorkSession_preventiveMaintenanceTaskId_status_idx" ON "WorkSession"("preventiveMaintenanceTaskId", "status");
CREATE INDEX "WorkSession_pestIssueId_status_idx" ON "WorkSession"("pestIssueId", "status");
