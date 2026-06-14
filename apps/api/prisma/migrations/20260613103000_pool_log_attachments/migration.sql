CREATE TABLE "PoolLogAttachment" (
  "id" TEXT NOT NULL,
  "entryId" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "uploadedById" TEXT,
  "uploaderName" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "storedName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "category" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PoolLogAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PoolLogAttachment_storedName_key" ON "PoolLogAttachment"("storedName");
CREATE INDEX "PoolLogAttachment_entryId_createdAt_idx" ON "PoolLogAttachment"("entryId", "createdAt");
CREATE INDEX "PoolLogAttachment_propertyId_createdAt_idx" ON "PoolLogAttachment"("propertyId", "createdAt");

ALTER TABLE "PoolLogAttachment" ADD CONSTRAINT "PoolLogAttachment_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "PoolLogEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PoolLogAttachment" ADD CONSTRAINT "PoolLogAttachment_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PoolLogAttachment" ADD CONSTRAINT "PoolLogAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
