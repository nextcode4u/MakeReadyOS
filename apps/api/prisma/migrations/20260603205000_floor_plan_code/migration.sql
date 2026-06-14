ALTER TABLE "FloorPlan" ADD COLUMN "code" TEXT;

UPDATE "FloorPlan" SET "code" = "name" WHERE "code" IS NULL;

ALTER TABLE "FloorPlan" ALTER COLUMN "code" SET NOT NULL;

DROP INDEX IF EXISTS "FloorPlan_propertyId_isActive_name_idx";
ALTER TABLE "FloorPlan" DROP CONSTRAINT IF EXISTS "FloorPlan_propertyId_name_key";
DROP INDEX IF EXISTS "FloorPlan_propertyId_name_key";

CREATE UNIQUE INDEX "FloorPlan_propertyId_code_key" ON "FloorPlan"("propertyId", "code");
CREATE INDEX "FloorPlan_propertyId_isActive_code_idx" ON "FloorPlan"("propertyId", "isActive", "code");
CREATE INDEX "FloorPlan_propertyId_name_idx" ON "FloorPlan"("propertyId", "name");
