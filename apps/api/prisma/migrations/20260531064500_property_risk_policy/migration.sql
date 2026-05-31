CREATE TABLE "PropertyRiskPolicy" (
  "id" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "moveInCriticalDays" INTEGER NOT NULL DEFAULT 1,
  "moveInHighDays" INTEGER NOT NULL DEFAULT 3,
  "moveInMediumDays" INTEGER NOT NULL DEFAULT 7,
  "unassignedHighDays" INTEGER NOT NULL DEFAULT 7,
  "staleActivityDays" INTEGER NOT NULL DEFAULT 5,
  "agingMediumDays" INTEGER NOT NULL DEFAULT 14,
  "agingHighDays" INTEGER NOT NULL DEFAULT 21,
  "vendorNearMoveInDays" INTEGER NOT NULL DEFAULT 3,
  "checklistNearMoveInDays" INTEGER NOT NULL DEFAULT 7,
  "planningNearMoveInDays" INTEGER NOT NULL DEFAULT 7,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PropertyRiskPolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PropertyRiskPolicy_propertyId_key" ON "PropertyRiskPolicy"("propertyId");
CREATE INDEX "PropertyRiskPolicy_propertyId_idx" ON "PropertyRiskPolicy"("propertyId");

ALTER TABLE "PropertyRiskPolicy"
  ADD CONSTRAINT "PropertyRiskPolicy_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "Property"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
