CREATE TABLE "PondTurnCompletion" (
    "itemId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PondTurnCompletion_pkey" PRIMARY KEY ("itemId")
);

CREATE INDEX "PondTurnCompletion_propertyId_completedAt_idx" ON "PondTurnCompletion"("propertyId", "completedAt");
ALTER TABLE "PondTurnCompletion" ADD CONSTRAINT "PondTurnCompletion_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
