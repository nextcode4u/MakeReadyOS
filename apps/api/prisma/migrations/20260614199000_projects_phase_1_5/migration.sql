ALTER TABLE "ProjectRecord"
  ADD COLUMN "source" TEXT DEFAULT 'Other',
  ADD COLUMN "sourceRecordType" TEXT,
  ADD COLUMN "sourceRecordId" TEXT,
  ADD COLUMN "sourceRecordLabel" TEXT,
  ADD COLUMN "estimatedCost" DOUBLE PRECISION,
  ADD COLUMN "actualCost" DOUBLE PRECISION,
  ADD COLUMN "deferredMaintenance" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deferredReason" TEXT,
  ADD COLUMN "targetYear" INTEGER,
  ADD COLUMN "deferredNotes" TEXT,
  ADD COLUMN "budgetYear" TEXT;

CREATE INDEX "ProjectRecord_propertyId_source_idx" ON "ProjectRecord"("propertyId", "source");
CREATE INDEX "ProjectRecord_propertyId_budgetYear_idx" ON "ProjectRecord"("propertyId", "budgetYear");
CREATE INDEX "ProjectRecord_propertyId_deferredMaintenance_idx" ON "ProjectRecord"("propertyId", "deferredMaintenance");
