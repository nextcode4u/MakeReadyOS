ALTER TABLE "CustomField"
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "deleteAfter" TIMESTAMP(3);

CREATE INDEX "CustomField_module_deletedAt_deleteAfter_idx" ON "CustomField"("module", "deletedAt", "deleteAfter");
