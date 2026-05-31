-- Property map building/area marker foundation.
CREATE TABLE "PropertyMapArea" (
  "id" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "mapId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "areaType" TEXT NOT NULL DEFAULT 'BUILDING',
  "xPercent" DOUBLE PRECISION NOT NULL,
  "yPercent" DOUBLE PRECISION NOT NULL,
  "widthPercent" DOUBLE PRECISION,
  "heightPercent" DOUBLE PRECISION,
  "color" TEXT,
  "expectedUnitCount" INTEGER,
  "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PropertyMapArea_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PropertyMapArea_mapId_name_key" ON "PropertyMapArea"("mapId", "name");
CREATE INDEX "PropertyMapArea_propertyId_isActive_isArchived_idx" ON "PropertyMapArea"("propertyId", "isActive", "isArchived");
CREATE INDEX "PropertyMapArea_mapId_areaType_idx" ON "PropertyMapArea"("mapId", "areaType");

ALTER TABLE "PropertyMapArea"
  ADD CONSTRAINT "PropertyMapArea_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PropertyMapArea"
  ADD CONSTRAINT "PropertyMapArea_mapId_fkey"
  FOREIGN KEY ("mapId") REFERENCES "PropertyMap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
