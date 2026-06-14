CREATE TABLE "PoolFacility" (
  "id" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'POOL',
  "capacityGallons" DOUBLE PRECISION,
  "surfaceType" TEXT,
  "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PoolFacility_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PoolChemical" (
  "id" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "concentrationPercent" DOUBLE PRECISION,
  "unit" TEXT NOT NULL,
  "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PoolChemical_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PoolChemistryTarget" (
  "id" TEXT NOT NULL,
  "propertyId" TEXT,
  "facilityType" TEXT NOT NULL,
  "phMin" DOUBLE PRECISION NOT NULL DEFAULT 7.2,
  "phMax" DOUBLE PRECISION NOT NULL DEFAULT 7.8,
  "freeChlorineMin" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "freeChlorineMax" DOUBLE PRECISION NOT NULL DEFAULT 4,
  "combinedChlorineMax" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
  "totalAlkalinityMin" DOUBLE PRECISION NOT NULL DEFAULT 80,
  "totalAlkalinityMax" DOUBLE PRECISION NOT NULL DEFAULT 120,
  "cyaMin" DOUBLE PRECISION NOT NULL DEFAULT 30,
  "cyaMax" DOUBLE PRECISION NOT NULL DEFAULT 50,
  "calciumHardnessMin" DOUBLE PRECISION NOT NULL DEFAULT 200,
  "calciumHardnessMax" DOUBLE PRECISION NOT NULL DEFAULT 400,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PoolChemistryTarget_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PoolLogEntry" (
  "id" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "facilityId" TEXT NOT NULL,
  "technicianId" TEXT,
  "technicianName" TEXT,
  "logDate" TIMESTAMP(3) NOT NULL,
  "logTime" TEXT,
  "ph" DOUBLE PRECISION,
  "freeChlorine" DOUBLE PRECISION,
  "combinedChlorine" DOUBLE PRECISION,
  "totalChlorine" DOUBLE PRECISION,
  "totalAlkalinity" DOUBLE PRECISION,
  "cyanuricAcid" DOUBLE PRECISION,
  "calciumHardness" DOUBLE PRECISION,
  "waterTemperature" DOUBLE PRECISION,
  "vacuumed" BOOLEAN NOT NULL DEFAULT false,
  "backwashed" BOOLEAN NOT NULL DEFAULT false,
  "skimmerCleaned" BOOLEAN NOT NULL DEFAULT false,
  "pumpRunning" BOOLEAN NOT NULL DEFAULT false,
  "filterOperating" BOOLEAN NOT NULL DEFAULT false,
  "waterClear" BOOLEAN NOT NULL DEFAULT false,
  "waterCloudy" BOOLEAN NOT NULL DEFAULT false,
  "algaePresent" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "evaluationJson" JSONB,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PoolLogEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PoolSafetyCheck" (
  "id" TEXT NOT NULL,
  "entryId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "value" TEXT NOT NULL DEFAULT 'PASS',
  "notes" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PoolSafetyCheck_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PoolChemicalAddition" (
  "id" TEXT NOT NULL,
  "entryId" TEXT NOT NULL,
  "chemicalId" TEXT,
  "chemicalName" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "unit" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PoolChemicalAddition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PoolFacility_propertyId_name_key" ON "PoolFacility"("propertyId", "name");
CREATE INDEX "PoolFacility_propertyId_isActive_idx" ON "PoolFacility"("propertyId", "isActive");
CREATE INDEX "PoolFacility_type_idx" ON "PoolFacility"("type");

CREATE UNIQUE INDEX "PoolChemical_propertyId_name_key" ON "PoolChemical"("propertyId", "name");
CREATE INDEX "PoolChemical_propertyId_category_isActive_idx" ON "PoolChemical"("propertyId", "category", "isActive");

CREATE UNIQUE INDEX "PoolChemistryTarget_propertyId_facilityType_key" ON "PoolChemistryTarget"("propertyId", "facilityType");
CREATE INDEX "PoolChemistryTarget_facilityType_idx" ON "PoolChemistryTarget"("facilityType");

CREATE INDEX "PoolLogEntry_propertyId_logDate_idx" ON "PoolLogEntry"("propertyId", "logDate");
CREATE INDEX "PoolLogEntry_facilityId_logDate_idx" ON "PoolLogEntry"("facilityId", "logDate");
CREATE INDEX "PoolLogEntry_technicianId_logDate_idx" ON "PoolLogEntry"("technicianId", "logDate");

CREATE INDEX "PoolSafetyCheck_entryId_value_idx" ON "PoolSafetyCheck"("entryId", "value");

CREATE INDEX "PoolChemicalAddition_entryId_idx" ON "PoolChemicalAddition"("entryId");
CREATE INDEX "PoolChemicalAddition_chemicalId_idx" ON "PoolChemicalAddition"("chemicalId");

ALTER TABLE "PoolFacility" ADD CONSTRAINT "PoolFacility_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PoolChemical" ADD CONSTRAINT "PoolChemical_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PoolChemistryTarget" ADD CONSTRAINT "PoolChemistryTarget_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PoolLogEntry" ADD CONSTRAINT "PoolLogEntry_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PoolLogEntry" ADD CONSTRAINT "PoolLogEntry_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "PoolFacility"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PoolSafetyCheck" ADD CONSTRAINT "PoolSafetyCheck_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "PoolLogEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PoolChemicalAddition" ADD CONSTRAINT "PoolChemicalAddition_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "PoolLogEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PoolChemicalAddition" ADD CONSTRAINT "PoolChemicalAddition_chemicalId_fkey" FOREIGN KEY ("chemicalId") REFERENCES "PoolChemical"("id") ON DELETE SET NULL ON UPDATE CASCADE;
