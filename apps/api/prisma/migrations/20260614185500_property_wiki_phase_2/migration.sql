ALTER TABLE "PropertyWikiEntry"
ADD COLUMN "building" TEXT,
ADD COLUMN "issueStatus" TEXT,
ADD COLUMN "isEmergency" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "PropertyWikiAsset"
ADD COLUMN "building" TEXT,
ADD COLUMN "isEmergency" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "PropertyWikiEntry_propertyId_building_idx"
ON "PropertyWikiEntry"("propertyId", "building");

CREATE INDEX "PropertyWikiAsset_propertyId_building_idx"
ON "PropertyWikiAsset"("propertyId", "building");

CREATE TABLE "PropertyWikiFavorite" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PropertyWikiFavorite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PropertyWikiFavorite_userId_targetType_targetId_key"
ON "PropertyWikiFavorite"("userId", "targetType", "targetId");

CREATE INDEX "PropertyWikiFavorite_propertyId_userId_createdAt_idx"
ON "PropertyWikiFavorite"("propertyId", "userId", "createdAt");

ALTER TABLE "PropertyWikiFavorite"
ADD CONSTRAINT "PropertyWikiFavorite_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PropertyWikiFavorite"
ADD CONSTRAINT "PropertyWikiFavorite_propertyId_fkey"
FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PropertyWikiRecentView" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PropertyWikiRecentView_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PropertyWikiRecentView_userId_targetType_targetId_key"
ON "PropertyWikiRecentView"("userId", "targetType", "targetId");

CREATE INDEX "PropertyWikiRecentView_propertyId_userId_viewedAt_idx"
ON "PropertyWikiRecentView"("propertyId", "userId", "viewedAt");

ALTER TABLE "PropertyWikiRecentView"
ADD CONSTRAINT "PropertyWikiRecentView_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PropertyWikiRecentView"
ADD CONSTRAINT "PropertyWikiRecentView_propertyId_fkey"
FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
