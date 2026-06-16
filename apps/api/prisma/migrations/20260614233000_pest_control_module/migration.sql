ALTER TABLE "PestIssue"
RENAME COLUMN "issueType" TO "pestType";

ALTER TABLE "PestIssue"
RENAME COLUMN "reportedAt" TO "requestDate";

ALTER TABLE "PestIssue"
RENAME COLUMN "location" TO "area";

ALTER TABLE "PestIssue"
RENAME COLUMN "notes" TO "description";

CREATE TABLE "PestVendor" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "primaryContact" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "emergencyPhone" TEXT,
    "serviceDay" TEXT,
    "serviceFrequency" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PestVendor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PestIssueNote" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PestIssueNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PestIssueAttachment" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "uploadedById" TEXT,
    "uploaderName" TEXT NOT NULL,
    "photoType" TEXT NOT NULL DEFAULT 'GENERAL',
    "caption" TEXT,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PestIssueAttachment_pkey" PRIMARY KEY ("id")
);

INSERT INTO "PestVendor" ("id", "propertyId", "vendorName", "createdAt", "updatedAt")
SELECT DISTINCT
  'legacy-pest-vendor-' || substr(md5("propertyId" || ':' || "vendor"), 1, 16),
  "propertyId",
  "vendor",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "PestIssue"
WHERE "vendor" IS NOT NULL AND trim("vendor") <> '';

ALTER TABLE "PestIssue"
ADD COLUMN "unitId" TEXT,
ADD COLUMN "makeReadyItemId" TEXT,
ADD COLUMN "building" TEXT,
ADD COLUMN "additionalPestType" TEXT,
ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'Normal',
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'Third Party Work Order',
ADD COLUMN "vendorId" TEXT,
ADD COLUMN "thirdPartyWorkOrderNumber" TEXT,
ADD COLUMN "reportedBy" TEXT,
ADD COLUMN "assignedUserId" TEXT,
ADD COLUMN "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "followUpNotes" TEXT,
ADD COLUMN "closedNotes" TEXT,
ADD COLUMN "recurringConcern" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "managerReviewRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "recurringDismissedAt" TIMESTAMP(3),
ADD COLUMN "recurringDismissalNotes" TEXT,
ADD COLUMN "createdById" TEXT,
ADD COLUMN "updatedById" TEXT,
ADD COLUMN "closedById" TEXT,
ADD COLUMN "closedAt" TIMESTAMP(3),
ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "archivedById" TEXT,
ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "archiveNotes" TEXT;

UPDATE "PestIssue"
SET "vendorId" = 'legacy-pest-vendor-' || substr(md5("propertyId" || ':' || "vendor"), 1, 16)
WHERE "vendor" IS NOT NULL AND trim("vendor") <> '';

UPDATE "PestIssue"
SET "followUpRequired" = CASE WHEN "followUpDate" IS NOT NULL THEN true ELSE false END;

ALTER TABLE "PestIssue"
DROP COLUMN "vendor";

CREATE UNIQUE INDEX "PestIssueAttachment_storedName_key" ON "PestIssueAttachment"("storedName");
CREATE INDEX "PestIssue_propertyId_isArchived_status_requestDate_idx" ON "PestIssue"("propertyId", "isArchived", "status", "requestDate");
CREATE INDEX "PestIssue_propertyId_unitId_requestDate_idx" ON "PestIssue"("propertyId", "unitId", "requestDate");
CREATE INDEX "PestIssue_propertyId_makeReadyItemId_requestDate_idx" ON "PestIssue"("propertyId", "makeReadyItemId", "requestDate");
CREATE INDEX "PestIssue_propertyId_followUpDate_idx" ON "PestIssue"("propertyId", "followUpDate");
CREATE INDEX "PestIssue_propertyId_vendorId_requestDate_idx" ON "PestIssue"("propertyId", "vendorId", "requestDate");
CREATE INDEX "PestIssue_assignedUserId_isArchived_status_idx" ON "PestIssue"("assignedUserId", "isArchived", "status");
CREATE INDEX "PestVendor_propertyId_isActive_vendorName_idx" ON "PestVendor"("propertyId", "isActive", "vendorName");
CREATE INDEX "PestVendor_propertyId_isDefault_idx" ON "PestVendor"("propertyId", "isDefault");
CREATE INDEX "PestIssueNote_issueId_createdAt_idx" ON "PestIssueNote"("issueId", "createdAt");
CREATE INDEX "PestIssueNote_propertyId_createdAt_idx" ON "PestIssueNote"("propertyId", "createdAt");
CREATE INDEX "PestIssueAttachment_issueId_createdAt_idx" ON "PestIssueAttachment"("issueId", "createdAt");
CREATE INDEX "PestIssueAttachment_propertyId_createdAt_idx" ON "PestIssueAttachment"("propertyId", "createdAt");

ALTER TABLE "PestIssue" ADD CONSTRAINT "PestIssue_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PestIssue" ADD CONSTRAINT "PestIssue_makeReadyItemId_fkey" FOREIGN KEY ("makeReadyItemId") REFERENCES "MakeReadyItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PestIssue" ADD CONSTRAINT "PestIssue_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "PestVendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PestIssue" ADD CONSTRAINT "PestIssue_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PestIssue" ADD CONSTRAINT "PestIssue_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PestIssue" ADD CONSTRAINT "PestIssue_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PestIssue" ADD CONSTRAINT "PestIssue_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PestIssue" ADD CONSTRAINT "PestIssue_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PestVendor" ADD CONSTRAINT "PestVendor_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PestVendor" ADD CONSTRAINT "PestVendor_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PestVendor" ADD CONSTRAINT "PestVendor_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PestIssueNote" ADD CONSTRAINT "PestIssueNote_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "PestIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PestIssueNote" ADD CONSTRAINT "PestIssueNote_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PestIssueNote" ADD CONSTRAINT "PestIssueNote_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PestIssueAttachment" ADD CONSTRAINT "PestIssueAttachment_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "PestIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PestIssueAttachment" ADD CONSTRAINT "PestIssueAttachment_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PestIssueAttachment" ADD CONSTRAINT "PestIssueAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
