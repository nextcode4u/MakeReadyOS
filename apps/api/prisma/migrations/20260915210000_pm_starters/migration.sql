ALTER TABLE "PreventiveMaintenanceTemplate" ADD COLUMN "starterKey" TEXT;
ALTER TABLE "PreventiveMaintenanceTemplate" ADD COLUMN "unitId" TEXT;
ALTER TABLE "PreventiveMaintenanceTemplate" ADD COLUMN "firstDueDate" TIMESTAMP(3);
CREATE UNIQUE INDEX "PreventiveMaintenanceTemplate_propertyId_starterKey_key" ON "PreventiveMaintenanceTemplate"("propertyId", "starterKey");
ALTER TABLE "PreventiveMaintenanceTemplate" ADD CONSTRAINT "PreventiveMaintenanceTemplate_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
