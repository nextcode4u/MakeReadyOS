ALTER TABLE "PropertyWikiAsset"
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "PropertyWikiAsset_propertyId_kind_isActive_createdAt_idx"
ON "PropertyWikiAsset"("propertyId", "kind", "isActive", "createdAt");
