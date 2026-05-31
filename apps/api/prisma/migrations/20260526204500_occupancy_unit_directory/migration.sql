ALTER TABLE "Property" ADD COLUMN "occupancyGoalPercent" DOUBLE PRECISION;

ALTER TABLE "Unit" ADD COLUMN "occupancyStatus" TEXT NOT NULL DEFAULT 'OCCUPIED';
ALTER TABLE "Unit" ADD COLUMN "building" TEXT;
ALTER TABLE "Unit" ADD COLUMN "area" TEXT;
ALTER TABLE "Unit" ADD COLUMN "floor" TEXT;
ALTER TABLE "Unit" ADD COLUMN "isBudgeted" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "Unit_propertyId_occupancyStatus_idx" ON "Unit"("propertyId", "occupancyStatus");
CREATE INDEX "Unit_propertyId_building_idx" ON "Unit"("propertyId", "building");
