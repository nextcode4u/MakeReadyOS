ALTER TABLE "SavedView"
ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "SavedView_module_isArchived_isShared_createdAt_idx"
ON "SavedView"("module", "isArchived", "isShared", "createdAt");

CREATE INDEX "SavedView_ownerUserId_module_isArchived_createdAt_idx"
ON "SavedView"("ownerUserId", "module", "isArchived", "createdAt");

DROP INDEX IF EXISTS "SavedView_module_isShared_createdAt_idx";
DROP INDEX IF EXISTS "SavedView_ownerUserId_module_createdAt_idx";
