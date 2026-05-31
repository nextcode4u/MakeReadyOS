ALTER TABLE "ItemAttachment" ADD COLUMN "inspectionStage" TEXT NOT NULL DEFAULT 'GENERAL';
ALTER TABLE "ItemAttachment" ADD COLUMN "category" TEXT;
ALTER TABLE "ItemAttachment" ADD COLUMN "chargeCandidate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ItemAttachment" ADD COLUMN "chargeNote" TEXT;

CREATE INDEX "ItemAttachment_itemId_inspectionStage_createdAt_idx" ON "ItemAttachment"("itemId", "inspectionStage", "createdAt");
CREATE INDEX "ItemAttachment_propertyId_inspectionStage_createdAt_idx" ON "ItemAttachment"("propertyId", "inspectionStage", "createdAt");
