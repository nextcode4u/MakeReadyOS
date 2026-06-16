-- CreateTable
CREATE TABLE "LeaseComplianceIssueType" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT DEFAULT '#58a6de',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaseComplianceIssueType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaseComplianceSettings" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "defaultPriority" TEXT NOT NULL DEFAULT 'Normal',
    "watchDays" INTEGER NOT NULL DEFAULT 3,
    "warningDays" INTEGER NOT NULL DEFAULT 7,
    "criticalDays" INTEGER NOT NULL DEFAULT 14,
    "firstNoticeLabel" TEXT NOT NULL DEFAULT '1st Notice Sent',
    "secondNoticeLabel" TEXT NOT NULL DEFAULT '2nd Notice Sent',
    "thirdNoticeLabel" TEXT NOT NULL DEFAULT '3rd Notice Sent',
    "archiveResolvedAfterDays" INTEGER,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaseComplianceSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaseComplianceIssue" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "unitId" TEXT,
    "issueTypeId" TEXT,
    "propertyMapId" TEXT,
    "building" TEXT,
    "area" TEXT,
    "issueTypeName" TEXT NOT NULL,
    "additionalIssueType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "noticeStage" TEXT NOT NULL DEFAULT 'None',
    "priority" TEXT NOT NULL DEFAULT 'Normal',
    "source" TEXT NOT NULL DEFAULT 'Property Walk',
    "description" TEXT,
    "locationNotes" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "assignedUserId" TEXT,
    "assignedUserName" TEXT,
    "lastPersistenceCheckDate" TIMESTAMP(3),
    "daysOpenOverride" INTEGER,
    "persistenceCount" INTEGER NOT NULL DEFAULT 0,
    "residentNotifiedDate" TIMESTAMP(3),
    "notice1Date" TIMESTAMP(3),
    "notice2Date" TIMESTAMP(3),
    "notice3Date" TIMESTAMP(3),
    "violationNeededDate" TIMESTAMP(3),
    "recurringConcern" BOOLEAN NOT NULL DEFAULT false,
    "managerReviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "recurringDismissedAt" TIMESTAMP(3),
    "recurringDismissalNotes" TEXT,
    "resolvedDate" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolutionNotes" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archiveDate" TIMESTAMP(3),
    "archivedById" TEXT,
    "archiveNotes" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaseComplianceIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaseComplianceIssueNote" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaseComplianceIssueNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaseComplianceIssuePhoto" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "uploadedById" TEXT,
    "uploaderName" TEXT NOT NULL,
    "photoCategory" TEXT NOT NULL DEFAULT 'GENERAL',
    "caption" TEXT,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaseComplianceIssuePhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaseComplianceNoticeAction" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "actedById" TEXT,
    "actedByName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "noticeStage" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaseComplianceNoticeAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaseCompliancePersistenceCheck" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "checkedById" TEXT,
    "checkedByName" TEXT NOT NULL,
    "stillPersists" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaseCompliancePersistenceCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeaseComplianceIssueType_propertyId_isActive_sortOrder_idx" ON "LeaseComplianceIssueType"("propertyId", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "LeaseComplianceIssueType_propertyId_name_key" ON "LeaseComplianceIssueType"("propertyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "LeaseComplianceSettings_propertyId_key" ON "LeaseComplianceSettings"("propertyId");

-- CreateIndex
CREATE INDEX "LeaseComplianceIssue_propertyId_isArchived_status_createdAt_idx" ON "LeaseComplianceIssue"("propertyId", "isArchived", "status", "createdAt");

-- CreateIndex
CREATE INDEX "LeaseComplianceIssue_propertyId_unitId_createdAt_idx" ON "LeaseComplianceIssue"("propertyId", "unitId", "createdAt");

-- CreateIndex
CREATE INDEX "LeaseComplianceIssue_propertyId_noticeStage_createdAt_idx" ON "LeaseComplianceIssue"("propertyId", "noticeStage", "createdAt");

-- CreateIndex
CREATE INDEX "LeaseComplianceIssue_propertyId_priority_createdAt_idx" ON "LeaseComplianceIssue"("propertyId", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "LeaseComplianceIssue_propertyId_assignedUserId_isArchived_s_idx" ON "LeaseComplianceIssue"("propertyId", "assignedUserId", "isArchived", "status");

-- CreateIndex
CREATE INDEX "LeaseComplianceIssue_propertyMapId_idx" ON "LeaseComplianceIssue"("propertyMapId");

-- CreateIndex
CREATE INDEX "LeaseComplianceIssueNote_issueId_createdAt_idx" ON "LeaseComplianceIssueNote"("issueId", "createdAt");

-- CreateIndex
CREATE INDEX "LeaseComplianceIssueNote_propertyId_createdAt_idx" ON "LeaseComplianceIssueNote"("propertyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LeaseComplianceIssuePhoto_storedName_key" ON "LeaseComplianceIssuePhoto"("storedName");

-- CreateIndex
CREATE INDEX "LeaseComplianceIssuePhoto_issueId_createdAt_idx" ON "LeaseComplianceIssuePhoto"("issueId", "createdAt");

-- CreateIndex
CREATE INDEX "LeaseComplianceIssuePhoto_propertyId_createdAt_idx" ON "LeaseComplianceIssuePhoto"("propertyId", "createdAt");

-- CreateIndex
CREATE INDEX "LeaseComplianceNoticeAction_issueId_createdAt_idx" ON "LeaseComplianceNoticeAction"("issueId", "createdAt");

-- CreateIndex
CREATE INDEX "LeaseComplianceNoticeAction_propertyId_createdAt_idx" ON "LeaseComplianceNoticeAction"("propertyId", "createdAt");

-- CreateIndex
CREATE INDEX "LeaseCompliancePersistenceCheck_issueId_createdAt_idx" ON "LeaseCompliancePersistenceCheck"("issueId", "createdAt");

-- CreateIndex
CREATE INDEX "LeaseCompliancePersistenceCheck_propertyId_createdAt_idx" ON "LeaseCompliancePersistenceCheck"("propertyId", "createdAt");

-- AddForeignKey
ALTER TABLE "LeaseComplianceIssueType" ADD CONSTRAINT "LeaseComplianceIssueType_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseComplianceIssueType" ADD CONSTRAINT "LeaseComplianceIssueType_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseComplianceIssueType" ADD CONSTRAINT "LeaseComplianceIssueType_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseComplianceSettings" ADD CONSTRAINT "LeaseComplianceSettings_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseComplianceSettings" ADD CONSTRAINT "LeaseComplianceSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseComplianceIssue" ADD CONSTRAINT "LeaseComplianceIssue_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseComplianceIssue" ADD CONSTRAINT "LeaseComplianceIssue_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseComplianceIssue" ADD CONSTRAINT "LeaseComplianceIssue_issueTypeId_fkey" FOREIGN KEY ("issueTypeId") REFERENCES "LeaseComplianceIssueType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseComplianceIssue" ADD CONSTRAINT "LeaseComplianceIssue_propertyMapId_fkey" FOREIGN KEY ("propertyMapId") REFERENCES "PropertyMap"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseComplianceIssue" ADD CONSTRAINT "LeaseComplianceIssue_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseComplianceIssue" ADD CONSTRAINT "LeaseComplianceIssue_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseComplianceIssue" ADD CONSTRAINT "LeaseComplianceIssue_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseComplianceIssue" ADD CONSTRAINT "LeaseComplianceIssue_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseComplianceIssue" ADD CONSTRAINT "LeaseComplianceIssue_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseComplianceIssueNote" ADD CONSTRAINT "LeaseComplianceIssueNote_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "LeaseComplianceIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseComplianceIssueNote" ADD CONSTRAINT "LeaseComplianceIssueNote_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseComplianceIssueNote" ADD CONSTRAINT "LeaseComplianceIssueNote_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseComplianceIssuePhoto" ADD CONSTRAINT "LeaseComplianceIssuePhoto_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "LeaseComplianceIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseComplianceIssuePhoto" ADD CONSTRAINT "LeaseComplianceIssuePhoto_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseComplianceIssuePhoto" ADD CONSTRAINT "LeaseComplianceIssuePhoto_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseComplianceNoticeAction" ADD CONSTRAINT "LeaseComplianceNoticeAction_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "LeaseComplianceIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseComplianceNoticeAction" ADD CONSTRAINT "LeaseComplianceNoticeAction_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseComplianceNoticeAction" ADD CONSTRAINT "LeaseComplianceNoticeAction_actedById_fkey" FOREIGN KEY ("actedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseCompliancePersistenceCheck" ADD CONSTRAINT "LeaseCompliancePersistenceCheck_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "LeaseComplianceIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseCompliancePersistenceCheck" ADD CONSTRAINT "LeaseCompliancePersistenceCheck_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseCompliancePersistenceCheck" ADD CONSTRAINT "LeaseCompliancePersistenceCheck_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

