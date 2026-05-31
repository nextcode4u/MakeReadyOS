# Data Import Notes

## Inspection Boundary

The local workbook export was inspected only to identify generic structure. No resident, applicant, unit, access-code, or date row values were copied into this documentation.

## Observed Workbook Structure

- The available workbook contains one worksheet with 128 XML rows.
- Seven header occurrences use the same 27-column make-ready layout.
- The repeated headers indicate multiple grouped sections exported from one board rather than unrelated tables.
- Column categories cover identity, leasing/vacancy, schedule dates, calculated validation, trade work, completion, and access readiness.

## Observed Unit Directory Export Structure

The local unit-directory reference exports were inspected for structure only. Private row values should stay out of public docs, fixtures, and tests.

Common patterns:

- Detail sheets start after report metadata rows and use columns such as `Bldg/Unit`, `Floor plan`, `SQFT`, rent fields, and optional resident/lease fields.
- Sparse detail exports may only contain unit, floor plan, square footage, and an effective/market rent field.
- Summary sheets group floor plans by total units, occupied units, physical occupancy percentage, average square footage, and total square footage.
- Physical occupancy sheets provide property-level occupied/vacant totals.
- Legacy `.xls` and newer `.xlsx` files may both appear, so the safest current operator workflow is conversion to CSV or copy/paste into the import preview.

Import recommendation:

- Default to importing unit inventory, floor plan, square footage, building/area/floor, occupancy status, and budgeted status.
- Do not import resident names, lease rent, or lease dates by default.
- Treat missing columns as unknown, not as a command to erase existing data.
- Keep merge behavior: update matching property + unit rows, create missing units, and never delete units simply because they are absent from a report.

## Observed Availability Report Structure

The local availability report PDFs are text-extractable and consistently use report metadata, grouped availability sections, row data, amenity lines, and footers.

Relevant sections:

- Vacant not leased ready
- Vacant not leased not ready
- Vacant leased ready
- Vacant leased not ready
- NTV not leased
- NTV leased

Useful row fields:

- Building/unit
- Floor plan
- Square footage
- Move-out or expected vacate date
- Days vacant
- Scheduled make-ready date
- Scheduled move-in date
- Comments or operational notes
- Hold markers

Parser cautions:

- Section headings are semantic data and should be preserved as a `section` or availability-status source.
- Amenity lines may wrap across multiple lines and should not be mistaken for new unit rows.
- Some rows may carry prefixes or hold markers that should be normalized or surfaced in preview.
- Availability reports are snapshots, not permanent unit directories; they may omit occupied units that are not operationally relevant.

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
6. Distinguish unit-directory imports from availability-snapshot imports.
7. Offer privacy-safe defaults that exclude resident names, lease rent, and lease dates unless explicitly mapped later.
