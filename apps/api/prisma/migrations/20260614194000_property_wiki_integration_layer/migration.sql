-- CreateTable
CREATE TABLE "PropertyWikiReference" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "recordType" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropertyWikiReference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PropertyWikiReference_recordType_recordId_targetType_targetI_key" ON "PropertyWikiReference"("recordType", "recordId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "PropertyWikiReference_propertyId_recordType_recordId_createdA_idx" ON "PropertyWikiReference"("propertyId", "recordType", "recordId", "createdAt");

-- CreateIndex
CREATE INDEX "PropertyWikiReference_targetType_targetId_idx" ON "PropertyWikiReference"("targetType", "targetId");

-- AddForeignKey
ALTER TABLE "PropertyWikiReference" ADD CONSTRAINT "PropertyWikiReference_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyWikiReference" ADD CONSTRAINT "PropertyWikiReference_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
