CREATE TABLE "PropertyWikiProfile" (
  "id" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "address" TEXT,
  "unitCount" INTEGER,
  "buildingCount" INTEGER,
  "officePhone" TEXT,
  "afterHoursPhone" TEXT,
  "propertyManager" TEXT,
  "maintenanceSupervisor" TEXT,
  "regionalManager" TEXT,
  "generalNotes" TEXT,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PropertyWikiProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PropertyWikiEntry" (
  "id" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "section" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "category" TEXT,
  "locationDescription" TEXT,
  "equipmentModel" TEXT,
  "notes" TEXT,
  "content" TEXT,
  "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "contacts" TEXT,
  "situation" TEXT,
  "poolCapacity" TEXT,
  "spaCapacity" TEXT,
  "pumpModels" TEXT,
  "filterModels" TEXT,
  "heaterModels" TEXT,
  "controllerNotes" TEXT,
  "chemicalTargetNotes" TEXT,
  "isPinned" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PropertyWikiEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PropertyWikiVendor" (
  "id" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "vendorType" TEXT NOT NULL,
  "companyName" TEXT NOT NULL,
  "contactName" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "emergencyPhone" TEXT,
  "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PropertyWikiVendor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PropertyWikiAsset" (
  "id" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "entryId" TEXT,
  "vendorId" TEXT,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "category" TEXT,
  "description" TEXT,
  "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "storedName" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PropertyWikiAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PropertyWikiProfile_propertyId_key" ON "PropertyWikiProfile"("propertyId");
CREATE INDEX "PropertyWikiEntry_propertyId_section_isActive_updatedAt_idx" ON "PropertyWikiEntry"("propertyId", "section", "isActive", "updatedAt");
CREATE INDEX "PropertyWikiEntry_propertyId_category_idx" ON "PropertyWikiEntry"("propertyId", "category");
CREATE INDEX "PropertyWikiVendor_propertyId_vendorType_isActive_idx" ON "PropertyWikiVendor"("propertyId", "vendorType", "isActive");
CREATE INDEX "PropertyWikiVendor_propertyId_companyName_idx" ON "PropertyWikiVendor"("propertyId", "companyName");
CREATE UNIQUE INDEX "PropertyWikiAsset_storedName_key" ON "PropertyWikiAsset"("storedName");
CREATE INDEX "PropertyWikiAsset_propertyId_kind_createdAt_idx" ON "PropertyWikiAsset"("propertyId", "kind", "createdAt");
CREATE INDEX "PropertyWikiAsset_entryId_kind_idx" ON "PropertyWikiAsset"("entryId", "kind");
CREATE INDEX "PropertyWikiAsset_vendorId_kind_idx" ON "PropertyWikiAsset"("vendorId", "kind");

ALTER TABLE "PropertyWikiProfile"
  ADD CONSTRAINT "PropertyWikiProfile_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropertyWikiProfile"
  ADD CONSTRAINT "PropertyWikiProfile_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PropertyWikiProfile"
  ADD CONSTRAINT "PropertyWikiProfile_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PropertyWikiEntry"
  ADD CONSTRAINT "PropertyWikiEntry_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropertyWikiEntry"
  ADD CONSTRAINT "PropertyWikiEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PropertyWikiEntry"
  ADD CONSTRAINT "PropertyWikiEntry_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PropertyWikiVendor"
  ADD CONSTRAINT "PropertyWikiVendor_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropertyWikiVendor"
  ADD CONSTRAINT "PropertyWikiVendor_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PropertyWikiVendor"
  ADD CONSTRAINT "PropertyWikiVendor_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PropertyWikiAsset"
  ADD CONSTRAINT "PropertyWikiAsset_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropertyWikiAsset"
  ADD CONSTRAINT "PropertyWikiAsset_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "PropertyWikiEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropertyWikiAsset"
  ADD CONSTRAINT "PropertyWikiAsset_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "PropertyWikiVendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropertyWikiAsset"
  ADD CONSTRAINT "PropertyWikiAsset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
