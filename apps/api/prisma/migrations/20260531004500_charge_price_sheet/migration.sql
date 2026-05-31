CREATE TABLE "ChargePriceSheetItem" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "unitLabel" TEXT,
    "defaultCents" INTEGER,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChargePriceSheetItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ChargePriceSheetItem" ADD CONSTRAINT "ChargePriceSheetItem_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ItemAttachment" ADD COLUMN "chargePriceSheetItemId" TEXT;
ALTER TABLE "ItemAttachment" ADD COLUMN "chargeQuantity" DOUBLE PRECISION;
ALTER TABLE "ItemAttachment" ADD COLUMN "chargeEstimatedCents" INTEGER;
ALTER TABLE "ItemAttachment" ADD CONSTRAINT "ItemAttachment_chargePriceSheetItemId_fkey" FOREIGN KEY ("chargePriceSheetItemId") REFERENCES "ChargePriceSheetItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ChargePriceSheetItem_propertyId_name_key" ON "ChargePriceSheetItem"("propertyId", "name");
CREATE INDEX "ChargePriceSheetItem_propertyId_isArchived_sortOrder_idx" ON "ChargePriceSheetItem"("propertyId", "isArchived", "sortOrder");
CREATE INDEX "ItemAttachment_propertyId_chargeCandidate_createdAt_idx" ON "ItemAttachment"("propertyId", "chargeCandidate", "createdAt");
CREATE INDEX "ItemAttachment_chargePriceSheetItemId_idx" ON "ItemAttachment"("chargePriceSheetItemId");
