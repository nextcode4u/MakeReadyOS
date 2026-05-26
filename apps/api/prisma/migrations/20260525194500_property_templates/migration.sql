-- Property / board templates store reusable operational configuration only.
CREATE TABLE "PropertyTemplate" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "notes" TEXT,
  "sourcePropertyId" TEXT,
  "sourcePropertyCode" TEXT,
  "includeConfig" JSONB NOT NULL DEFAULT '{}',
  "manifest" JSONB NOT NULL,
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PropertyTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PropertyTemplate_isArchived_category_name_idx" ON "PropertyTemplate"("isArchived", "category", "name");
CREATE INDEX "PropertyTemplate_sourcePropertyId_idx" ON "PropertyTemplate"("sourcePropertyId");
