ALTER TABLE "PropertyBranding" ADD COLUMN "finalWalkReportSettings" JSONB;
CREATE TABLE "FinalWalkReportDraft" (
  "itemId" TEXT PRIMARY KEY REFERENCES "MakeReadyItem"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "payload" JSONB NOT NULL
);
