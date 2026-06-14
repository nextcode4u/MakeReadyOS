ALTER TABLE "PreventiveMaintenanceTemplate"
ADD COLUMN "assignedUserId" TEXT,
ADD COLUMN "assignedUserName" TEXT;

ALTER TABLE "PreventiveMaintenanceTask"
ADD COLUMN "assignedUserId" TEXT,
ADD COLUMN "assignedUserName" TEXT;

CREATE INDEX "PreventiveMaintenanceTemplate_propertyId_assignedRole_assignedUserId_idx"
ON "PreventiveMaintenanceTemplate"("propertyId", "assignedRole", "assignedUserId");

CREATE INDEX "PreventiveMaintenanceTask_propertyId_assignedUserId_dueDate_idx"
ON "PreventiveMaintenanceTask"("propertyId", "assignedUserId", "dueDate");
