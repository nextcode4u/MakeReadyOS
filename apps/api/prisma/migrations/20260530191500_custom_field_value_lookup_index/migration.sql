-- Improve server-side filtering by custom field without scanning every board item.
CREATE INDEX IF NOT EXISTS "CustomFieldValue_customFieldId_idx" ON "CustomFieldValue"("customFieldId");
