ALTER TABLE "PropertyWikiEntry"
ADD COLUMN "manufacturer" TEXT,
ADD COLUMN "serialNumber" TEXT,
ADD COLUMN "installDate" TIMESTAMP(3),
ADD COLUMN "warrantyExpiresAt" TIMESTAMP(3),
ADD COLUMN "floorPlan" TEXT,
ADD COLUMN "unitType" TEXT,
ADD COLUMN "blindSizes" TEXT,
ADD COLUMN "hvacNotes" TEXT,
ADD COLUMN "waterHeaterNotes" TEXT,
ADD COLUMN "applianceNotes" TEXT,
ADD COLUMN "paintStandards" TEXT,
ADD COLUMN "countertopNotes" TEXT,
ADD COLUMN "cabinetNotes" TEXT,
ADD COLUMN "flooringNotes" TEXT,
ADD COLUMN "contactType" TEXT,
ADD COLUMN "contactTitle" TEXT,
ADD COLUMN "phone" TEXT,
ADD COLUMN "email" TEXT,
ADD COLUMN "isEmergencyContact" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "relatedEntryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "relatedVendorIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "filterSizes" TEXT;

UPDATE "PropertyWikiEntry"
SET
  "relatedEntryIds" = COALESCE("relatedEntryIds", ARRAY[]::TEXT[]),
  "relatedVendorIds" = COALESCE("relatedVendorIds", ARRAY[]::TEXT[]);

ALTER TABLE "PropertyWikiEntry"
ALTER COLUMN "relatedEntryIds" SET NOT NULL,
ALTER COLUMN "relatedVendorIds" SET NOT NULL;

CREATE INDEX "PropertyWikiEntry_propertyId_contactType_isActive_idx"
ON "PropertyWikiEntry"("propertyId", "contactType", "isActive");

CREATE INDEX "PropertyWikiEntry_propertyId_floorPlan_unitType_idx"
ON "PropertyWikiEntry"("propertyId", "floorPlan", "unitType");
