CREATE TABLE "FinalWalkPolicy" (
  "propertyId" TEXT PRIMARY KEY REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "inspectors" TEXT[] NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
ALTER TABLE "WorkAssignmentBlock" ADD COLUMN "inspectorQueue" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "WorkAssignmentBlock" ADD COLUMN "readyNotified" BOOLEAN NOT NULL DEFAULT false;
