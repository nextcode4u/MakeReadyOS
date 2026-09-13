-- Down/model inventory is outside the active turn-risk population.
UPDATE "MakeReadyItem" AS item
SET "riskScore" = 0,
    "riskLevel" = 'NONE',
    "riskReasons" = '[]'::jsonb,
    "lastRiskEvaluatedAt" = CURRENT_TIMESTAMP
WHERE UPPER(TRIM(COALESCE(item."vacancyStatus", ''))) IN ('DOWN', 'MODEL')
   OR EXISTS (
     SELECT 1 FROM "BoardSection" AS section
     WHERE section."propertyId" = item."propertyId"
       AND section."key" = item."boardGroup"
       AND section."sectionType" = 'DOWN'
   );
