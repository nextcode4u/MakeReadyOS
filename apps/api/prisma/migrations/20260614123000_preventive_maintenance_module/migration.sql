-- CreateTable
CREATE TABLE "PreventiveMaintenanceTemplate" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "frequency" TEXT NOT NULL,
    "customEveryDays" INTEGER,
    "annualMonth" INTEGER,
    "annualDay" INTEGER,
    "assignedRole" TEXT NOT NULL,
    "photosRequired" BOOLEAN NOT NULL DEFAULT false,
    "notesRequired" BOOLEAN NOT NULL DEFAULT false,
    "passFailRequired" BOOLEAN NOT NULL DEFAULT false,
    "priority" TEXT NOT NULL DEFAULT 'Normal',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreventiveMaintenanceTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreventiveMaintenanceTask" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "taskName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "assignedRole" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UPCOMING',
    "priority" TEXT NOT NULL DEFAULT 'Normal',
    "photosRequired" BOOLEAN NOT NULL DEFAULT false,
    "notesRequired" BOOLEAN NOT NULL DEFAULT false,
    "passFailRequired" BOOLEAN NOT NULL DEFAULT false,
    "completionOutcome" TEXT,
    "completionNotes" TEXT,
    "completedById" TEXT,
    "completedByName" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreventiveMaintenanceTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreventiveMaintenanceTaskAttachment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "uploadedById" TEXT,
    "uploaderName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PreventiveMaintenanceTaskAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PreventiveMaintenanceTemplate_propertyId_isArchived_isAct_idx" ON "PreventiveMaintenanceTemplate"("propertyId", "isArchived", "isActive");

-- CreateIndex
CREATE INDEX "PreventiveMaintenanceTemplate_propertyId_category_idx" ON "PreventiveMaintenanceTemplate"("propertyId", "category");

-- CreateIndex
CREATE INDEX "PreventiveMaintenanceTemplate_propertyId_frequency_idx" ON "PreventiveMaintenanceTemplate"("propertyId", "frequency");

-- CreateIndex
CREATE INDEX "PreventiveMaintenanceTask_propertyId_dueDate_status_idx" ON "PreventiveMaintenanceTask"("propertyId", "dueDate", "status");

-- CreateIndex
CREATE INDEX "PreventiveMaintenanceTask_templateId_dueDate_idx" ON "PreventiveMaintenanceTask"("templateId", "dueDate");

-- CreateIndex
CREATE INDEX "PreventiveMaintenanceTask_propertyId_category_dueDate_idx" ON "PreventiveMaintenanceTask"("propertyId", "category", "dueDate");

-- CreateIndex
CREATE INDEX "PreventiveMaintenanceTask_propertyId_assignedRole_dueDate_idx" ON "PreventiveMaintenanceTask"("propertyId", "assignedRole", "dueDate");

-- CreateIndex
CREATE INDEX "PreventiveMaintenanceTask_completedAt_idx" ON "PreventiveMaintenanceTask"("completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PreventiveMaintenanceTaskAttachment_storedName_key" ON "PreventiveMaintenanceTaskAttachment"("storedName");

-- CreateIndex
CREATE INDEX "PreventiveMaintenanceTaskAttachment_taskId_createdAt_idx" ON "PreventiveMaintenanceTaskAttachment"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "PreventiveMaintenanceTaskAttachment_propertyId_createdAt_idx" ON "PreventiveMaintenanceTaskAttachment"("propertyId", "createdAt");

-- AddForeignKey
ALTER TABLE "PreventiveMaintenanceTemplate" ADD CONSTRAINT "PreventiveMaintenanceTemplate_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventiveMaintenanceTemplate" ADD CONSTRAINT "PreventiveMaintenanceTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventiveMaintenanceTemplate" ADD CONSTRAINT "PreventiveMaintenanceTemplate_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventiveMaintenanceTask" ADD CONSTRAINT "PreventiveMaintenanceTask_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventiveMaintenanceTask" ADD CONSTRAINT "PreventiveMaintenanceTask_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PreventiveMaintenanceTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventiveMaintenanceTask" ADD CONSTRAINT "PreventiveMaintenanceTask_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventiveMaintenanceTaskAttachment" ADD CONSTRAINT "PreventiveMaintenanceTaskAttachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "PreventiveMaintenanceTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventiveMaintenanceTaskAttachment" ADD CONSTRAINT "PreventiveMaintenanceTaskAttachment_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventiveMaintenanceTaskAttachment" ADD CONSTRAINT "PreventiveMaintenanceTaskAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
