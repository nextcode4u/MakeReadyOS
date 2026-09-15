CREATE TABLE "UnitAccessCode" (
  "unitId" TEXT PRIMARY KEY REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "doorCode" TEXT NOT NULL DEFAULT '',
  "accessCode" TEXT NOT NULL DEFAULT '',
  "keyCode" TEXT NOT NULL DEFAULT '',
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Preserve the latest recorded resident codes without copying shared/master codes.
INSERT INTO "UnitAccessCode" ("unitId", "doorCode", "accessCode", "updatedAt")
SELECT DISTINCT ON (u.id) u.id, COALESCE(d.payload->'value'->>'residentDoorCode', ''),
  COALESCE(d.payload->'value'->>'residentAccessCode', ''), i."updatedAt"
FROM "Unit" u JOIN "MakeReadyItem" i ON i."propertyId" = u."propertyId"
  AND (i."unitId" = u.id OR (i."unitId" IS NULL AND i."unitNumber" = u.number))
JOIN "FinalWalkReportDraft" d ON d."itemId" = i.id
ORDER BY u.id, COALESCE(d.payload->>'updatedAt', '') DESC, i."updatedAt" DESC, i.id;
