-- CreateTable
CREATE TABLE "ProjectCategory" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT,
    "name" TEXT NOT NULL,
    "color" TEXT DEFAULT '#58a6de',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectRecord" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "recordType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'Normal',
    "executionType" TEXT NOT NULL DEFAULT 'Undecided',
    "categoryId" TEXT,
    "categoryName" TEXT,
    "building" TEXT,
    "area" TEXT,
    "locationNotes" TEXT,
    "propertyMapId" TEXT,
    "pinX" DOUBLE PRECISION,
    "pinY" DOUBLE PRECISION,
    "estimatedQuantity" DOUBLE PRECISION,
    "quantityUnit" TEXT,
    "totalAmount" DOUBLE PRECISION,
    "companyName" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "bidStatus" TEXT DEFAULT 'Not Applicable',
    "bidNotes" TEXT,
    "assignedUserId" TEXT,
    "assignedUserName" TEXT,
    "assignedRole" TEXT,
    "assignedTeam" TEXT,
    "scheduledDate" TIMESTAMP(3),
    "startDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "completedDate" TIMESTAMP(3),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "completedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectAttachment" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "uploadedById" TEXT,
    "uploaderName" TEXT,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "attachmentType" TEXT NOT NULL DEFAULT 'GENERAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectComment" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectTask" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "assignedUserId" TEXT,
    "assignedUserName" TEXT,
    "dueDate" TIMESTAMP(3),
    "completedById" TEXT,
    "completedDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectWikiReference" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectWikiReference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectCategory_propertyId_name_key" ON "ProjectCategory"("propertyId", "name");

-- CreateIndex
CREATE INDEX "ProjectCategory_propertyId_isActive_sortOrder_idx" ON "ProjectCategory"("propertyId", "isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "ProjectRecord_propertyId_recordType_status_idx" ON "ProjectRecord"("propertyId", "recordType", "status");

-- CreateIndex
CREATE INDEX "ProjectRecord_propertyId_isArchived_updatedAt_idx" ON "ProjectRecord"("propertyId", "isArchived", "updatedAt");

-- CreateIndex
CREATE INDEX "ProjectRecord_propertyId_assignedUserId_idx" ON "ProjectRecord"("propertyId", "assignedUserId");

-- CreateIndex
CREATE INDEX "ProjectRecord_propertyId_dueDate_idx" ON "ProjectRecord"("propertyId", "dueDate");

-- CreateIndex
CREATE INDEX "ProjectRecord_propertyMapId_idx" ON "ProjectRecord"("propertyMapId");

-- CreateIndex
CREATE INDEX "ProjectAttachment_recordId_createdAt_idx" ON "ProjectAttachment"("recordId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectAttachment_propertyId_createdAt_idx" ON "ProjectAttachment"("propertyId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectComment_recordId_createdAt_idx" ON "ProjectComment"("recordId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectComment_propertyId_createdAt_idx" ON "ProjectComment"("propertyId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectTask_recordId_status_idx" ON "ProjectTask"("recordId", "status");

-- CreateIndex
CREATE INDEX "ProjectTask_propertyId_dueDate_idx" ON "ProjectTask"("propertyId", "dueDate");

-- CreateIndex
CREATE INDEX "ProjectTask_assignedUserId_dueDate_idx" ON "ProjectTask"("assignedUserId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectWikiReference_recordId_targetType_targetId_key" ON "ProjectWikiReference"("recordId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "ProjectWikiReference_propertyId_createdAt_idx" ON "ProjectWikiReference"("propertyId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProjectCategory" ADD CONSTRAINT "ProjectCategory_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRecord" ADD CONSTRAINT "ProjectRecord_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectRecord" ADD CONSTRAINT "ProjectRecord_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProjectCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectRecord" ADD CONSTRAINT "ProjectRecord_propertyMapId_fkey" FOREIGN KEY ("propertyMapId") REFERENCES "PropertyMap"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectRecord" ADD CONSTRAINT "ProjectRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectRecord" ADD CONSTRAINT "ProjectRecord_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectRecord" ADD CONSTRAINT "ProjectRecord_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAttachment" ADD CONSTRAINT "ProjectAttachment_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "ProjectRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectAttachment" ADD CONSTRAINT "ProjectAttachment_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectAttachment" ADD CONSTRAINT "ProjectAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectComment" ADD CONSTRAINT "ProjectComment_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "ProjectRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectComment" ADD CONSTRAINT "ProjectComment_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectComment" ADD CONSTRAINT "ProjectComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "ProjectRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectWikiReference" ADD CONSTRAINT "ProjectWikiReference_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "ProjectRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectWikiReference" ADD CONSTRAINT "ProjectWikiReference_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectWikiReference" ADD CONSTRAINT "ProjectWikiReference_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
