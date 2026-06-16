ALTER TABLE "PropertyMap"
  ADD COLUMN "mapType" TEXT NOT NULL DEFAULT 'Custom',
  ADD COLUMN "description" TEXT,
  ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "PropertyMapPin" (
  "id" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "mapId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "pinType" TEXT NOT NULL,
  "xPercent" DOUBLE PRECISION NOT NULL,
  "yPercent" DOUBLE PRECISION NOT NULL,
  "building" TEXT,
  "unitLabel" TEXT,
  "area" TEXT,
  "description" TEXT,
  "linkedRecordType" TEXT,
  "linkedRecordId" TEXT,
  "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "isEmergency" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PropertyMapPin_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PropertyMap_propertyId_mapType_isArchived_idx" ON "PropertyMap"("propertyId", "mapType", "isArchived");
CREATE INDEX "PropertyMapPin_propertyId_mapId_isArchived_pinType_idx" ON "PropertyMapPin"("propertyId", "mapId", "isArchived", "pinType");
CREATE INDEX "PropertyMapPin_propertyId_linkedRecordType_linkedRecordId_idx" ON "PropertyMapPin"("propertyId", "linkedRecordType", "linkedRecordId");
CREATE INDEX "PropertyMapPin_propertyId_building_idx" ON "PropertyMapPin"("propertyId", "building");
CREATE INDEX "PropertyMapPin_propertyId_unitLabel_idx" ON "PropertyMapPin"("propertyId", "unitLabel");
CREATE INDEX "PropertyMapPin_propertyId_area_idx" ON "PropertyMapPin"("propertyId", "area");

ALTER TABLE "PropertyMapPin"
  ADD CONSTRAINT "PropertyMapPin_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PropertyMapPin"
  ADD CONSTRAINT "PropertyMapPin_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "PropertyMap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PropertyMapPin"
  ADD CONSTRAINT "PropertyMapPin_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PropertyMapPin"
  ADD CONSTRAINT "PropertyMapPin_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
