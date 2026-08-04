CREATE TABLE "PropertyMapPinAttachment" (
  "id" TEXT NOT NULL,
  "pinId" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "uploadedById" TEXT,
  "uploaderName" TEXT NOT NULL,
  "caption" TEXT,
  "originalName" TEXT NOT NULL,
  "storedName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PropertyMapPinAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PropertyMapPinAttachment_storedName_key" ON "PropertyMapPinAttachment"("storedName");
CREATE INDEX "PropertyMapPinAttachment_pinId_createdAt_idx" ON "PropertyMapPinAttachment"("pinId", "createdAt");
CREATE INDEX "PropertyMapPinAttachment_propertyId_createdAt_idx" ON "PropertyMapPinAttachment"("propertyId", "createdAt");

ALTER TABLE "PropertyMapPinAttachment"
  ADD CONSTRAINT "PropertyMapPinAttachment_pinId_fkey"
  FOREIGN KEY ("pinId") REFERENCES "PropertyMapPin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PropertyMapPinAttachment"
  ADD CONSTRAINT "PropertyMapPinAttachment_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PropertyMapPinAttachment"
  ADD CONSTRAINT "PropertyMapPinAttachment_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
