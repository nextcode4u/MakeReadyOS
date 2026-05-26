-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MANAGER', 'TECH', 'LEASING', 'CLEANER', 'VIEWER');

-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'LONG_TEXT', 'NUMBER', 'DATE', 'SINGLE_SELECT', 'MULTI_SELECT', 'BOOLEAN', 'USER');

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "floorPlanId" TEXT,
    "number" TEXT NOT NULL,
    "floorPlan" TEXT,
    "squareFeet" INTEGER,
    "bedrooms" INTEGER,
    "bathrooms" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FloorPlan" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bedrooms" INTEGER,
    "bathrooms" DOUBLE PRECISION,
    "squareFeet" INTEGER,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FloorPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MakeReadyItem" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "unitId" TEXT,
    "boardGroup" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "unitNumber" TEXT NOT NULL,
    "floorPlan" TEXT,
    "applicant" TEXT,
    "assignedTech" TEXT,
    "scopeLevel" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "vacancyStatus" TEXT,
    "moveOutDate" TIMESTAMP(3),
    "vacatedDate" TIMESTAMP(3),
    "makeReadyDate" TIMESTAMP(3),
    "moveInDate" TIMESTAMP(3),
    "daysVacant" INTEGER NOT NULL DEFAULT 0,
    "daysUntilMoveIn" INTEGER,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "overdue" BOOLEAN NOT NULL DEFAULT false,
    "moveInSoon" BOOLEAN NOT NULL DEFAULT false,
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "riskLevel" TEXT NOT NULL DEFAULT 'NONE',
    "riskReasons" JSONB NOT NULL DEFAULT '[]',
    "lastRiskEvaluatedAt" TIMESTAMP(3),
    "completionStatus" TEXT,
    "sheetrockStatus" TEXT,
    "pestStatus" TEXT,
    "pestTreated" TEXT,
    "trashOutStatus" TEXT,
    "floorsStatus" TEXT,
    "flooringDate" TIMESTAMP(3),
    "makeReadyStatus" TEXT,
    "cleaningStatus" TEXT,
    "keysMadeStatus" TEXT,
    "cabinetsStatus" TEXT,
    "countertopsStatus" TEXT,
    "appliancesStatus" TEXT,
    "paintStatus" TEXT,
    "doorsStatus" TEXT,
    "newDoorCode" TEXT,
    "notes" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "lastAutomationAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MakeReadyItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiToken" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "tokenLastFour" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "scopes" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiTokenPropertyScope" (
    "id" TEXT NOT NULL,
    "apiTokenId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiTokenPropertyScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "secretLastFour" TEXT NOT NULL,
    "eventTypes" TEXT[],
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "lastDeliveryAt" TIMESTAMP(3),
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookPropertyScope" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookPropertyScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trade" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPreferred" BOOLEAN NOT NULL DEFAULT false,
    "insuranceExpiresAt" TIMESTAMP(3),
    "licenseExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorContact" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorServiceArea" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorServiceArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorAssignment" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "trade" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "scheduledDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "costEstimate" DOUBLE PRECISION,
    "invoiceRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyMap" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "originalName" TEXT,
    "storedName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitMapLocation" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "xPercent" DOUBLE PRECISION NOT NULL,
    "yPercent" DOUBLE PRECISION NOT NULL,
    "labelXPercent" DOUBLE PRECISION,
    "labelYPercent" DOUBLE PRECISION,
    "building" TEXT,
    "area" TEXT,
    "floor" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnitMapLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrfToken" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ipAddress" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPropertyAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPropertyAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "action" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "propertyId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabelDefinition" (
    "id" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "textColor" TEXT NOT NULL DEFAULT '#0b1020',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabelDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardColumnDefinition" (
    "fieldKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardColumnDefinition_pkey" PRIMARY KEY ("fieldKey")
);

-- CreateTable
CREATE TABLE "BoardSection" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sectionType" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleTrack" (
    "id" TEXT NOT NULL,
    "sourceField" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "colorBasis" TEXT NOT NULL DEFAULT 'NEUTRAL',
    "colorSourceField" TEXT,
    "fixedColor" TEXT,
    "groupingMode" TEXT NOT NULL DEFAULT 'NONE',
    "visibilityFilter" JSONB,
    "overdueEnabled" BOOLEAN NOT NULL DEFAULT true,
    "moveInSoonEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleTrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedView" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "name" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "viewType" TEXT NOT NULL DEFAULT 'table',
    "filters" JSONB NOT NULL,
    "sorts" JSONB,
    "grouping" JSONB,
    "visibleColumns" JSONB,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "propertyId" TEXT,
    "itemId" TEXT,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "dedupeKey" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRule" (
    "id" TEXT NOT NULL,
    "templateId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "propertyId" TEXT,
    "triggerType" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRun" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "itemId" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "message" TEXT NOT NULL,
    "context" JSONB,
    "runType" TEXT NOT NULL DEFAULT 'EVENT',
    "checkedCount" INTEGER,
    "matchedCount" INTEGER,
    "actionCount" INTEGER,
    "warnings" JSONB,
    "errors" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationCooldown" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "actionKey" TEXT NOT NULL,
    "lastAppliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationCooldown_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalLibraryPack" (
    "id" TEXT NOT NULL,
    "packKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "source" TEXT NOT NULL DEFAULT 'IMPORTED',
    "manifest" JSONB NOT NULL,
    "installedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalLibraryPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalLibraryPackItem" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "targetId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'INSTALLED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalLibraryPackItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomField" (
    "id" TEXT NOT NULL,
    "module" TEXT NOT NULL DEFAULT 'make-ready',
    "fieldKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fieldType" "CustomFieldType" NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomFieldOption" (
    "id" TEXT NOT NULL,
    "customFieldId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomFieldOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomFieldValue" (
    "id" TEXT NOT NULL,
    "customFieldId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefrigerantLog" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "systemUnit" TEXT NOT NULL,
    "refrigerantType" TEXT NOT NULL,
    "cylinderSerialNumber" TEXT,
    "startingWeight" DOUBLE PRECISION,
    "amountAdded" DOUBLE PRECISION,
    "amountRecovered" DOUBLE PRECISION,
    "currentBalance" DOUBLE PRECISION,
    "tech" TEXT,
    "loggedAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefrigerantLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoolChemicalLog" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "poolName" TEXT NOT NULL,
    "loggedAt" TIMESTAMP(3) NOT NULL,
    "freeChlorine" DOUBLE PRECISION,
    "totalChlorine" DOUBLE PRECISION,
    "ph" DOUBLE PRECISION,
    "alkalinity" DOUBLE PRECISION,
    "cya" DOUBLE PRECISION,
    "calciumHardness" DOUBLE PRECISION,
    "temperature" DOUBLE PRECISION,
    "notes" TEXT,
    "correctiveAction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PoolChemicalLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PestIssue" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "issueType" TEXT NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL,
    "treatmentDate" TIMESTAMP(3),
    "followUpDate" TIMESTAMP(3),
    "vendor" TEXT,
    "status" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PestIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyNote" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "noteType" TEXT NOT NULL DEFAULT 'GENERAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistTemplate" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT,
    "name" TEXT NOT NULL,
    "scope" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "dueOffsetDays" INTEGER,
    "tradeCategory" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemComment" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'UPDATE',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemAttachment" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "commentId" TEXT,
    "uploadedById" TEXT,
    "uploaderName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistInstance" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "templateId" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistInstanceItem" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "dueOffsetDays" INTEGER,
    "tradeCategory" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistInstanceItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Property_code_key" ON "Property"("code");

-- CreateIndex
CREATE INDEX "Unit_floorPlanId_idx" ON "Unit"("floorPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_propertyId_number_key" ON "Unit"("propertyId", "number");

-- CreateIndex
CREATE INDEX "FloorPlan_propertyId_isActive_name_idx" ON "FloorPlan"("propertyId", "isActive", "name");

-- CreateIndex
CREATE UNIQUE INDEX "FloorPlan_propertyId_name_key" ON "FloorPlan"("propertyId", "name");

-- CreateIndex
CREATE INDEX "MakeReadyItem_propertyId_boardGroup_idx" ON "MakeReadyItem"("propertyId", "boardGroup");

-- CreateIndex
CREATE INDEX "MakeReadyItem_propertyId_isArchived_boardGroup_idx" ON "MakeReadyItem"("propertyId", "isArchived", "boardGroup");

-- CreateIndex
CREATE INDEX "MakeReadyItem_unitId_idx" ON "MakeReadyItem"("unitId");

-- CreateIndex
CREATE INDEX "MakeReadyItem_propertyId_isArchived_assignedTech_idx" ON "MakeReadyItem"("propertyId", "isArchived", "assignedTech");

-- CreateIndex
CREATE INDEX "MakeReadyItem_propertyId_isArchived_vacancyStatus_idx" ON "MakeReadyItem"("propertyId", "isArchived", "vacancyStatus");

-- CreateIndex
CREATE INDEX "MakeReadyItem_propertyId_isArchived_updatedAt_idx" ON "MakeReadyItem"("propertyId", "isArchived", "updatedAt");

-- CreateIndex
CREATE INDEX "MakeReadyItem_propertyId_isArchived_riskLevel_idx" ON "MakeReadyItem"("propertyId", "isArchived", "riskLevel");

-- CreateIndex
CREATE INDEX "MakeReadyItem_propertyId_isArchived_riskScore_idx" ON "MakeReadyItem"("propertyId", "isArchived", "riskScore");

-- CreateIndex
CREATE INDEX "MakeReadyItem_propertyId_isArchived_moveInDate_idx" ON "MakeReadyItem"("propertyId", "isArchived", "moveInDate");

-- CreateIndex
CREATE INDEX "MakeReadyItem_moveInDate_idx" ON "MakeReadyItem"("moveInDate");

-- CreateIndex
CREATE INDEX "MakeReadyItem_makeReadyDate_idx" ON "MakeReadyItem"("makeReadyDate");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ApiToken_tokenHash_key" ON "ApiToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ApiToken_createdById_isActive_idx" ON "ApiToken"("createdById", "isActive");

-- CreateIndex
CREATE INDEX "ApiToken_tokenPrefix_idx" ON "ApiToken"("tokenPrefix");

-- CreateIndex
CREATE INDEX "ApiTokenPropertyScope_propertyId_idx" ON "ApiTokenPropertyScope"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiTokenPropertyScope_apiTokenId_propertyId_key" ON "ApiTokenPropertyScope"("apiTokenId", "propertyId");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_createdById_isEnabled_idx" ON "WebhookEndpoint"("createdById", "isEnabled");

-- CreateIndex
CREATE INDEX "WebhookPropertyScope_propertyId_idx" ON "WebhookPropertyScope"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookPropertyScope_webhookId_propertyId_key" ON "WebhookPropertyScope"("webhookId", "propertyId");

-- CreateIndex
CREATE INDEX "Vendor_isActive_trade_name_idx" ON "Vendor"("isActive", "trade", "name");

-- CreateIndex
CREATE INDEX "Vendor_isPreferred_trade_idx" ON "Vendor"("isPreferred", "trade");

-- CreateIndex
CREATE INDEX "VendorContact_vendorId_name_idx" ON "VendorContact"("vendorId", "name");

-- CreateIndex
CREATE INDEX "VendorServiceArea_propertyId_idx" ON "VendorServiceArea"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorServiceArea_vendorId_propertyId_key" ON "VendorServiceArea"("vendorId", "propertyId");

-- CreateIndex
CREATE INDEX "VendorAssignment_propertyId_status_dueDate_idx" ON "VendorAssignment"("propertyId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "VendorAssignment_itemId_status_idx" ON "VendorAssignment"("itemId", "status");

-- CreateIndex
CREATE INDEX "VendorAssignment_vendorId_status_idx" ON "VendorAssignment"("vendorId", "status");

-- CreateIndex
CREATE INDEX "VendorAssignment_scheduledDate_idx" ON "VendorAssignment"("scheduledDate");

-- CreateIndex
CREATE INDEX "VendorAssignment_dueDate_idx" ON "VendorAssignment"("dueDate");

-- CreateIndex
CREATE INDEX "PropertyMap_propertyId_isActive_isArchived_idx" ON "PropertyMap"("propertyId", "isActive", "isArchived");

-- CreateIndex
CREATE INDEX "UnitMapLocation_propertyId_isActive_isArchived_idx" ON "UnitMapLocation"("propertyId", "isActive", "isArchived");

-- CreateIndex
CREATE INDEX "UnitMapLocation_unitId_idx" ON "UnitMapLocation"("unitId");

-- CreateIndex
CREATE INDEX "UnitMapLocation_area_idx" ON "UnitMapLocation"("area");

-- CreateIndex
CREATE UNIQUE INDEX "UnitMapLocation_mapId_unitId_key" ON "UnitMapLocation"("mapId", "unitId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserPropertyAccess_userId_propertyId_key" ON "UserPropertyAccess"("userId", "propertyId");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_propertyId_createdAt_idx" ON "AuditLog"("propertyId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_ipAddress_createdAt_idx" ON "AuditLog"("action", "ipAddress", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LabelDefinition_fieldKey_value_key" ON "LabelDefinition"("fieldKey", "value");

-- CreateIndex
CREATE INDEX "BoardSection_propertyId_isActive_sortOrder_idx" ON "BoardSection"("propertyId", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "BoardSection_propertyId_key_key" ON "BoardSection"("propertyId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "BoardSection_propertyId_sectionType_key" ON "BoardSection"("propertyId", "sectionType");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleTrack_sourceField_key" ON "ScheduleTrack"("sourceField");

-- CreateIndex
CREATE INDEX "ScheduleTrack_isArchived_isEnabled_sortOrder_idx" ON "ScheduleTrack"("isArchived", "isEnabled", "sortOrder");

-- CreateIndex
CREATE INDEX "SavedView_module_isShared_createdAt_idx" ON "SavedView"("module", "isShared", "createdAt");

-- CreateIndex
CREATE INDEX "SavedView_ownerUserId_module_createdAt_idx" ON "SavedView"("ownerUserId", "module", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_propertyId_createdAt_idx" ON "Notification"("propertyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_category_key" ON "NotificationPreference"("userId", "category");

-- CreateIndex
CREATE INDEX "AutomationRule_propertyId_enabled_isArchived_idx" ON "AutomationRule"("propertyId", "enabled", "isArchived");

-- CreateIndex
CREATE INDEX "AutomationRule_templateId_propertyId_isArchived_idx" ON "AutomationRule"("templateId", "propertyId", "isArchived");

-- CreateIndex
CREATE INDEX "AutomationRun_ruleId_ranAt_idx" ON "AutomationRun"("ruleId", "ranAt");

-- CreateIndex
CREATE INDEX "AutomationRun_itemId_ranAt_idx" ON "AutomationRun"("itemId", "ranAt");

-- CreateIndex
CREATE INDEX "AutomationCooldown_lastAppliedAt_idx" ON "AutomationCooldown"("lastAppliedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationCooldown_ruleId_itemId_actionKey_key" ON "AutomationCooldown"("ruleId", "itemId", "actionKey");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalLibraryPack_packKey_key" ON "OperationalLibraryPack"("packKey");

-- CreateIndex
CREATE INDEX "OperationalLibraryPack_source_category_name_idx" ON "OperationalLibraryPack"("source", "category", "name");

-- CreateIndex
CREATE INDEX "OperationalLibraryPackItem_itemType_targetId_idx" ON "OperationalLibraryPackItem"("itemType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalLibraryPackItem_packId_itemType_itemKey_key" ON "OperationalLibraryPackItem"("packId", "itemType", "itemKey");

-- CreateIndex
CREATE UNIQUE INDEX "CustomField_fieldKey_key" ON "CustomField"("fieldKey");

-- CreateIndex
CREATE INDEX "CustomField_module_isArchived_sortOrder_idx" ON "CustomField"("module", "isArchived", "sortOrder");

-- CreateIndex
CREATE INDEX "CustomFieldOption_customFieldId_isArchived_sortOrder_idx" ON "CustomFieldOption"("customFieldId", "isArchived", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldOption_customFieldId_label_key" ON "CustomFieldOption"("customFieldId", "label");

-- CreateIndex
CREATE INDEX "CustomFieldValue_itemId_idx" ON "CustomFieldValue"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldValue_customFieldId_itemId_key" ON "CustomFieldValue"("customFieldId", "itemId");

-- CreateIndex
CREATE INDEX "ChecklistTemplate_propertyId_name_idx" ON "ChecklistTemplate"("propertyId", "name");

-- CreateIndex
CREATE INDEX "ItemComment_itemId_createdAt_idx" ON "ItemComment"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "ItemComment_itemId_isDeleted_createdAt_idx" ON "ItemComment"("itemId", "isDeleted", "createdAt");

-- CreateIndex
CREATE INDEX "ItemComment_propertyId_createdAt_idx" ON "ItemComment"("propertyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ItemAttachment_storedName_key" ON "ItemAttachment"("storedName");

-- CreateIndex
CREATE INDEX "ItemAttachment_itemId_createdAt_idx" ON "ItemAttachment"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "ItemAttachment_itemId_commentId_createdAt_idx" ON "ItemAttachment"("itemId", "commentId", "createdAt");

-- CreateIndex
CREATE INDEX "ItemAttachment_propertyId_createdAt_idx" ON "ItemAttachment"("propertyId", "createdAt");

-- CreateIndex
CREATE INDEX "ChecklistInstance_itemId_createdAt_idx" ON "ChecklistInstance"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "ChecklistInstance_propertyId_createdAt_idx" ON "ChecklistInstance"("propertyId", "createdAt");

-- CreateIndex
CREATE INDEX "ChecklistInstanceItem_instanceId_sortOrder_idx" ON "ChecklistInstanceItem"("instanceId", "sortOrder");

-- CreateIndex
CREATE INDEX "ChecklistInstanceItem_instanceId_completed_sortOrder_idx" ON "ChecklistInstanceItem"("instanceId", "completed", "sortOrder");

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_floorPlanId_fkey" FOREIGN KEY ("floorPlanId") REFERENCES "FloorPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorPlan" ADD CONSTRAINT "FloorPlan_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MakeReadyItem" ADD CONSTRAINT "MakeReadyItem_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MakeReadyItem" ADD CONSTRAINT "MakeReadyItem_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiTokenPropertyScope" ADD CONSTRAINT "ApiTokenPropertyScope_apiTokenId_fkey" FOREIGN KEY ("apiTokenId") REFERENCES "ApiToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiTokenPropertyScope" ADD CONSTRAINT "ApiTokenPropertyScope_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookPropertyScope" ADD CONSTRAINT "WebhookPropertyScope_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookPropertyScope" ADD CONSTRAINT "WebhookPropertyScope_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorContact" ADD CONSTRAINT "VendorContact_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorServiceArea" ADD CONSTRAINT "VendorServiceArea_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorServiceArea" ADD CONSTRAINT "VendorServiceArea_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorAssignment" ADD CONSTRAINT "VendorAssignment_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorAssignment" ADD CONSTRAINT "VendorAssignment_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorAssignment" ADD CONSTRAINT "VendorAssignment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "MakeReadyItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyMap" ADD CONSTRAINT "PropertyMap_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitMapLocation" ADD CONSTRAINT "UnitMapLocation_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitMapLocation" ADD CONSTRAINT "UnitMapLocation_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitMapLocation" ADD CONSTRAINT "UnitMapLocation_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "PropertyMap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPropertyAccess" ADD CONSTRAINT "UserPropertyAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPropertyAccess" ADD CONSTRAINT "UserPropertyAccess_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardSection" ADD CONSTRAINT "BoardSection_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "MakeReadyItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "MakeReadyItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationCooldown" ADD CONSTRAINT "AutomationCooldown_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationCooldown" ADD CONSTRAINT "AutomationCooldown_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "MakeReadyItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalLibraryPackItem" ADD CONSTRAINT "OperationalLibraryPackItem_packId_fkey" FOREIGN KEY ("packId") REFERENCES "OperationalLibraryPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFieldOption" ADD CONSTRAINT "CustomFieldOption_customFieldId_fkey" FOREIGN KEY ("customFieldId") REFERENCES "CustomField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_customFieldId_fkey" FOREIGN KEY ("customFieldId") REFERENCES "CustomField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "MakeReadyItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefrigerantLog" ADD CONSTRAINT "RefrigerantLog_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolChemicalLog" ADD CONSTRAINT "PoolChemicalLog_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PestIssue" ADD CONSTRAINT "PestIssue_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyNote" ADD CONSTRAINT "PropertyNote_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistTemplate" ADD CONSTRAINT "ChecklistTemplate_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemComment" ADD CONSTRAINT "ItemComment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "MakeReadyItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemComment" ADD CONSTRAINT "ItemComment_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemComment" ADD CONSTRAINT "ItemComment_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemAttachment" ADD CONSTRAINT "ItemAttachment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "MakeReadyItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemAttachment" ADD CONSTRAINT "ItemAttachment_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemAttachment" ADD CONSTRAINT "ItemAttachment_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "ItemComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemAttachment" ADD CONSTRAINT "ItemAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistInstance" ADD CONSTRAINT "ChecklistInstance_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "MakeReadyItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistInstance" ADD CONSTRAINT "ChecklistInstance_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistInstance" ADD CONSTRAINT "ChecklistInstance_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistInstanceItem" ADD CONSTRAINT "ChecklistInstanceItem_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "ChecklistInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistInstanceItem" ADD CONSTRAINT "ChecklistInstanceItem_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

