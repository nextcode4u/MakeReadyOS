-- CreateTable
CREATE TABLE "PropertyDailyMetricSnapshot" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "activeTurns" INTEGER NOT NULL DEFAULT 0,
    "vacant" INTEGER NOT NULL DEFAULT 0,
    "ntv" INTEGER NOT NULL DEFAULT 0,
    "ready" INTEGER NOT NULL DEFAULT 0,
    "down" INTEGER NOT NULL DEFAULT 0,
    "overdue" INTEGER NOT NULL DEFAULT 0,
    "highRisk" INTEGER NOT NULL DEFAULT 0,
    "averageDaysVacant" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "moveInsNext7Days" INTEGER NOT NULL DEFAULT 0,
    "completedTurnsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyDailyMetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PropertyDailyMetricSnapshot_propertyId_date_key" ON "PropertyDailyMetricSnapshot"("propertyId", "date");

-- CreateIndex
CREATE INDEX "PropertyDailyMetricSnapshot_date_idx" ON "PropertyDailyMetricSnapshot"("date");

-- CreateIndex
CREATE INDEX "PropertyDailyMetricSnapshot_propertyId_date_idx" ON "PropertyDailyMetricSnapshot"("propertyId", "date");

-- AddForeignKey
ALTER TABLE "PropertyDailyMetricSnapshot" ADD CONSTRAINT "PropertyDailyMetricSnapshot_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
