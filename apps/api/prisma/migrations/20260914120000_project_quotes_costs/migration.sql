CREATE TABLE "ProjectQuote" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "recordId" TEXT NOT NULL REFERENCES "ProjectRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "scope" TEXT NOT NULL,
  "companyName" TEXT NOT NULL,
  "reference" TEXT,
  "amountCents" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'Received',
  "dueDate" TIMESTAMP(3),
  "notes" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "ProjectQuote_recordId_createdAt_idx" ON "ProjectQuote"("recordId", "createdAt");
CREATE TABLE "ProjectCostLine" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "recordId" TEXT NOT NULL REFERENCES "ProjectRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "description" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "unitCostCents" INTEGER NOT NULL,
  "actualCostCents" INTEGER,
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "ProjectCostLine_recordId_createdAt_idx" ON "ProjectCostLine"("recordId", "createdAt");
ALTER TABLE "ProjectAttachment" ADD COLUMN "quoteId" TEXT;
ALTER TABLE "ProjectAttachment" ADD CONSTRAINT "ProjectAttachment_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "ProjectQuote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ProjectAttachment_quoteId_idx" ON "ProjectAttachment"("quoteId");
