# Data Import Notes

## Inspection Boundary

The local workbook export was inspected only to identify generic structure. No resident, applicant, unit, access-code, or date row values were copied into this documentation.

## Observed Workbook Structure

- The available workbook contains one worksheet with 128 XML rows.
- Seven header occurrences use the same 27-column make-ready layout.
- The repeated headers indicate multiple grouped sections exported from one board rather than unrelated tables.
- Column categories cover identity, leasing/vacancy, schedule dates, calculated validation, trade work, completion, and access readiness.

## Future Mapping Targets

| Export Category | Likely MakeReadyOS Target |
| --- | --- |
| Property/group context | Property and board-group assignment |
| Unit/name and floor plan | Unit and floor plan records |
| Vacancy and move-in indicators | Core lifecycle status fields |
| Schedule dates | Core date fields |
| Trade/status columns | Existing core fields or mapped custom fields |
| Date fail-safe output | Recomputed automation result, not imported authority |

## Privacy And Safety Requirements

- Treat exports as private local input until a sanitization/import workflow exists.
- Do not include applicant names, access codes, unit-level schedules, or free-text notes in public fixtures or documentation.
- Require a preview/mapping stage before importing records.
- Log imported field mappings and any rejected/unrecognized values.

## Import Work Deferred

This pass documents structure only. A future importer should support:

1. Upload and parse an export locally.
2. Preview sheets, groups, columns, and row counts without committing source files.
3. Map known columns to core fields and unknown columns to custom fields.
4. Validate statuses and dates before writing records.
5. Produce an import report without exposing private values unnecessarily.
