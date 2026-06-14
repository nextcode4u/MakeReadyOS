CREATE TABLE "RefrigerantType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefrigerantType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RefrigerantCylinder" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "refrigerantTypeId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tankSize" DOUBLE PRECISION NOT NULL,
    "currentWeight" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "dispositionNotes" TEXT,
    "finalRecoveryCompleted" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefrigerantCylinder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RefrigerantTransaction" (
    "id" TEXT NOT NULL,
    "transactionType" TEXT NOT NULL,
    "propertyId" TEXT,
    "unitId" TEXT,
    "unitNumber" TEXT,
    "refrigerantTypeId" TEXT NOT NULL,
    "sourceCylinderId" TEXT,
    "recoveryCylinderId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startWeight" DOUBLE PRECISION NOT NULL,
    "endWeight" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefrigerantTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RefrigerantLeakFlag" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT,
    "unitId" TEXT,
    "unitNumber" TEXT NOT NULL,
    "refrigerantTypeId" TEXT,
    "level" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT NOT NULL,
    "firstDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dismissedAt" TIMESTAMP(3),
    "dismissedById" TEXT,
    "dismissalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefrigerantLeakFlag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RefrigerantType_name_key" ON "RefrigerantType"("name");
CREATE INDEX "RefrigerantType_isActive_name_idx" ON "RefrigerantType"("isActive", "name");

CREATE UNIQUE INDEX "RefrigerantCylinder_identifier_key" ON "RefrigerantCylinder"("identifier");
CREATE INDEX "RefrigerantCylinder_category_status_idx" ON "RefrigerantCylinder"("category", "status");
CREATE INDEX "RefrigerantCylinder_refrigerantTypeId_category_status_idx" ON "RefrigerantCylinder"("refrigerantTypeId", "category", "status");
CREATE INDEX "RefrigerantCylinder_archivedAt_idx" ON "RefrigerantCylinder"("archivedAt");

CREATE INDEX "RefrigerantTransaction_propertyId_unitId_occurredAt_idx" ON "RefrigerantTransaction"("propertyId", "unitId", "occurredAt");
CREATE INDEX "RefrigerantTransaction_propertyId_unitNumber_occurredAt_idx" ON "RefrigerantTransaction"("propertyId", "unitNumber", "occurredAt");
CREATE INDEX "RefrigerantTransaction_refrigerantTypeId_occurredAt_idx" ON "RefrigerantTransaction"("refrigerantTypeId", "occurredAt");
CREATE INDEX "RefrigerantTransaction_sourceCylinderId_occurredAt_idx" ON "RefrigerantTransaction"("sourceCylinderId", "occurredAt");
CREATE INDEX "RefrigerantTransaction_recoveryCylinderId_occurredAt_idx" ON "RefrigerantTransaction"("recoveryCylinderId", "occurredAt");
CREATE INDEX "RefrigerantTransaction_transactionType_occurredAt_idx" ON "RefrigerantTransaction"("transactionType", "occurredAt");

CREATE INDEX "RefrigerantLeakFlag_propertyId_unitNumber_status_idx" ON "RefrigerantLeakFlag"("propertyId", "unitNumber", "status");
CREATE INDEX "RefrigerantLeakFlag_unitId_status_idx" ON "RefrigerantLeakFlag"("unitId", "status");
CREATE INDEX "RefrigerantLeakFlag_level_status_idx" ON "RefrigerantLeakFlag"("level", "status");

ALTER TABLE "RefrigerantCylinder" ADD CONSTRAINT "RefrigerantCylinder_refrigerantTypeId_fkey" FOREIGN KEY ("refrigerantTypeId") REFERENCES "RefrigerantType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RefrigerantTransaction" ADD CONSTRAINT "RefrigerantTransaction_refrigerantTypeId_fkey" FOREIGN KEY ("refrigerantTypeId") REFERENCES "RefrigerantType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RefrigerantTransaction" ADD CONSTRAINT "RefrigerantTransaction_sourceCylinderId_fkey" FOREIGN KEY ("sourceCylinderId") REFERENCES "RefrigerantCylinder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RefrigerantTransaction" ADD CONSTRAINT "RefrigerantTransaction_recoveryCylinderId_fkey" FOREIGN KEY ("recoveryCylinderId") REFERENCES "RefrigerantCylinder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RefrigerantLeakFlag" ADD CONSTRAINT "RefrigerantLeakFlag_refrigerantTypeId_fkey" FOREIGN KEY ("refrigerantTypeId") REFERENCES "RefrigerantType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
