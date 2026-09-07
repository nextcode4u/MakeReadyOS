-- Ready turns can retain historical due dates and blank legacy completion fields.
UPDATE "MakeReadyItem"
SET "overdue" = false, "moveInSoon" = false
WHERE ("overdue" = true OR "moveInSoon" = true)
  AND (
    regexp_replace(upper(trim(coalesce("vacancyStatus", ''))), '[[:space:]-]+', '_', 'g')
      IN ('VACANT_LEASED_READY', 'VACANT_NOT_LEASED_READY')
    OR upper(trim(coalesce("completionStatus", ''))) IN ('DONE', 'YES', 'COMPLETE', 'COMPLETED')
  );
