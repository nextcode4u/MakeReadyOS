-- GOOD described a completed trade, not overall approval. Preserve all turn approval flags.
UPDATE "MakeReadyItem" SET "paintStatus" = 'DONE'
WHERE upper(trim("paintStatus")) = 'GOOD';
UPDATE "MakeReadyItem" SET "cleaningStatus" = 'DONE'
WHERE upper(trim("cleaningStatus")) = 'GOOD';
UPDATE "LabelDefinition" SET "isArchived" = true, "updatedAt" = CURRENT_TIMESTAMP
WHERE "fieldKey" IN ('paintStatus', 'cleaningStatus') AND upper(trim("value")) = 'GOOD';
