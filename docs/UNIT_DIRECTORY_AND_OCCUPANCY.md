# Unit Directory And Occupancy

MakeReadyOS separates the permanent unit directory from active make-ready turns.

## Concepts

- Unit Directory: the property inventory. Units can be occupied, vacant ready, vacant leased, NTV, NTV leased, down, model, unknown, active, or archived.
- Make-ready item: an active or archived turnover record for a unit.
- Archive: completed turn history after the resident has moved in. Archive is not the same as deleting a unit from the property inventory.
- Occupancy goal: optional property-level target percentage used by dashboard visibility.

This supports properties that are already operating when MakeReadyOS is introduced. Not every occupied unit needs an active make-ready record.

## Archive Workflow

Each property has its own Archive section. Archiving a make-ready item moves that turn into the selected property's Archive section and keeps the historical record available for review after move-in. The main board toolbar supports four archive modes:

- `Active items`: normal daily operating board with Ready Units, Make Ready, and Down Units.
- `Archive only`: property-scoped completed turn history.
- `Occupied`: read-only imported directory units currently marked `OCCUPIED`.
- `Active + archive`: combined troubleshooting view when comparing active work and old records.

The Setup workspace also includes an Archive / Occupied Units panel. Its list is scoped to the selected property so managers can review archived turns or occupied directory units without mixing records from unrelated properties.

## Availability Statuses

The directory-level occupancy status is intentionally compatible with common availability reports. Production imports should prefer these operational categories:

- `OCCUPIED`
- `VACANT NOT LEASED READY`
- `VACANT NOT LEASED NOT READY`
- `NTV NOT LEASED`
- `NTV LEASED`
- `VACANT LEASED READY`
- `VACANT LEASED NOT READY`
- `DOWN`
- `OCCUPIED`
- `TO PRE-WALK`
- `TO SCOPE`
- `TO FINAL WALK`
- `MODEL`

Older/internal values such as `VACANT_READY`, `VACANT_LEASED`, `VACANT_NOT_LEASED`, `TO WALK`, `NTV`, `NTV_LEASED`, and `UNKNOWN` remain supported as import aliases for backward compatibility, but new blank-slate dropdown labels use the explicit report/workflow categories above.

Availability reports often focus on units that are available, vacant leased, NTV, or NTV leased rather than every occupied unit. MakeReadyOS can hold the full directory while still keeping the make-ready board focused on operational turns.

## Building And Area Support

Units can store optional building, area, and floor values. This allows simple properties with only unit numbers and larger properties with buildings, skipped building numbers, unusual numbering, office gaps, and mixed unit counts per building.

Property Maps reuse the same directory metadata. When building data exists, the map workspace groups units by building/area, shows mapped versus expected unit counts, and can filter the unit picker to one building. This keeps map setup useful for both unit-only properties and properties with irregular building numbering.

## Paste/File Import

The Setup workspace supports lightweight paste or local-file import for unit directories and availability reports. Comma-delimited, semicolon-delimited, and tab-delimited data are supported, including quoted CSV values. An existing property must be selected before import; the preview shows the target property so rows cannot silently land in the wrong property. Existing units are updated by property + unit number. New units are created. The import is merge-style and does not delete units missing from the pasted report.

Use the two import boxes for different jobs:

- Unit Directory CSV: updates permanent property inventory and occupied/vacant directory status. It does not create active make-ready table rows.
- Availability CSV: updates unit availability and creates or updates active make-ready turns for non-occupied operational statuses such as vacant not leased ready, vacant not leased not ready, NTV not leased, NTV leased, vacant leased ready, vacant leased not ready, down, and model.

Occupied mode depends on the permanent unit directory. Availability reports commonly omit fully occupied units, so importing only an availability report will not populate the occupied directory list. Import the full unit directory first when occupancy visibility and occupancy percentage matter.

Sparse files are supported. A row may include only unit number, floor plan, and square footage. When updating an existing unit, MakeReadyOS only changes fields that are present in the import row; missing columns do not wipe existing building, area, status, budgeted, or occupancy data. Browser parsing now also ignores obvious blank-unit summary/header noise such as occupancy summaries or floor-plan summary rows and shows those skips in the preview instead of failing the import.

The browser-side parser now also tolerates more real export shapes before the data reaches the API. Combined `building/unit` columns such as `12-3405` or `12 / 3405` are split automatically when no separate unit column exists, broader common header aliases like `reportdt`, `asofdt`, `printdate`, `moveoutdt`, and `applieddt` are recognized, semicolon-separated spreadsheet exports are detected automatically, and imported dates are normalized into `YYYY-MM-DD` form when possible.

When a row contains a floor-plan value, MakeReadyOS treats that value as the report code/type, not necessarily the friendly marketing name. For example, an imported `B1` code may later be renamed in Setup to display as `B1 - Arlington` while the stable code remains `B1` for future imports. Imported bedroom, bathroom, and square-foot values are attached to the managed floor plan and then linked back to the unit. If the managed floor plan already exists, imports fill only missing floor-plan metadata; they do not overwrite manually curated floor-plan values.

Accepted column names include common variants of:

```csv
unit,building,area,floor,floorPlan,beds,baths,sqft,occupancyStatus,budgeted
101,1,North,1,A1,1,1,720,OCCUPIED,yes
102,1,North,1,A1,1,1,720,NTV LEASED,yes
```

Useful aliases include `unit number`, `unit #`, `apartment`, `building number`, `bldg`, `unit type`, `unit plan`, `floor plan code`, `square feet`, `availability status`, `avail status`, `unit status`, `include in occupancy`, `included in occupancy`, and `occupancy eligible`.

Floor-plan imports should use the property report code in the `floorPlan` column. After import, edit the managed floor plan in Setup if the property uses a separate friendly name. Keep the code stable unless the source report changes, because future imports match managed floor plans by code.

The import preview shows target property, row count, expected new units, expected updates, budgeted-unit count, and status counts before writing. After import, Setup shows a last-import receipt with an undo action for units created by that import plus floor-plan create/update counts. Existing-unit updates and managed floor-plan metadata fills are intentionally not automatically rolled back yet because safe rollback requires storing row-level before snapshots. Budgeted units are used for occupancy percentage calculations, which lets properties exclude offices, models, non-revenue units, or other non-budgeted inventory.

## Source Report Patterns

Common property-management exports usually fall into two categories:

- Unit directory exports: permanent property inventory, often with one detail sheet plus summary sheets by floor plan and physical occupancy.
- Availability reports: operational availability snapshots, often grouped by statuses such as vacant ready, vacant not ready, vacant leased, NTV, and NTV leased.

MakeReadyOS treats these as different import jobs. A unit directory updates the permanent unit inventory. An availability report updates operational availability and creates or updates active make-ready turns.

Observed unit-directory exports may include:

- A detail table with `Bldg/Unit`, `Floor plan`, `SQFT`, rent columns, and optional lease/resident columns.
- A floor-plan summary with total units, occupied units, physical occupancy percentage, average square footage, and total square footage.
- A physical occupancy summary grouped by occupied/vacant square footage or unit count.
- Sparse variants that only include unit, floor plan, square footage, and totals.

For privacy, MakeReadyOS import workflows should default to structural/unit data and should not import resident names, lease rent, or personal lease dates unless an admin explicitly maps those fields in a future lease-aware workflow.

Availability reports may include section headers that carry important meaning. The availability importer maps either an explicit `vacancyStatus` column or a source `availabilityStatus`/section value. The production section set is:

- Vacant not leased ready
- Vacant not leased not ready
- Vacant leased ready
- Vacant leased not ready
- NTV not leased
- NTV leased
- Down

Availability rows may include unit, floor plan, square footage, move-out or expected vacate date, days vacant, scheduled make-ready date, scheduled move-in date, preleased/applicant text, application date, notes/comments, hold flags, and amenity lines. Blank-unit heading/amenity noise rows are now filtered during browser parsing and shown in the preview so they do not break the import or get appended into unit notes.

When an availability report has a generic `MoveOut` column, MakeReadyOS routes that date by status: NTV not leased/NTV leased rows use it as `NTV / Expected Vacate`, while already-vacant rows use it as `Vacated`. `Make Ready` maps to the make-ready date. `Date Applied` is preserved as source context in notes because it is an application date, not a move-in date.

## Minimal CSV Format

The safest portable format is a header row plus one row per unit:

```csv
unit,floorPlan,sqft
101,A1,720
102,B2,960
103,C1,1180
```

If your source only provides three columns without headers, MakeReadyOS treats them as:

```text
unit    floorPlan    sqft
```

For example, this tab-delimited text is valid:

```text
101	A1	720
102	B2	960
```

Use a header row whenever possible because it lets MakeReadyOS map incomplete data safely even when columns are reordered.

## Converting A Unit Directory To CSV

Use this structure when converting a spreadsheet, PDF table, or copied report into a MakeReadyOS-ready file:

```csv
unit,building,area,floor,floorPlan,beds,baths,sqft,occupancyStatus,budgeted
101,1,North,1,A1,1,1,720,OCCUPIED,yes
102,1,North,1,A1,1,1,720,NTV LEASED,yes
260,26,South,2,B2,2,2,1040,VACANT NOT LEASED READY,yes
Office,,,,,,,0,OCCUPIED,no
```

The Setup importer includes a “Need to convert Excel/PDF?” helper that opens a copyable prompt for AI-assisted conversion. If using an AI assistant or another conversion tool manually, use instructions like:

```text
You are converting a property unit directory or availability export into a clean CSV for MakeReadyOS.

Return a CSV file if your interface supports file attachments. If not, return only one fenced csv block and no extra explanation.

Required header, exactly:
unit,building,area,floor,floorPlan,beds,baths,sqft,occupancyStatus,budgeted

Rules:
- One row per unit only.
- Do not include totals, summaries, page headers, footers, blank lines, rent, resident names, lease dates, phone numbers, emails, or private notes.
- If the export only has unit, floor plan, and square footage, leave unknown columns blank and set occupancyStatus to UNKNOWN.
- Preserve leading zeroes in unit numbers.
- Use building only when the source clearly has a building/building number. Leave blank for properties with unit numbers only.
- Use occupancyStatus values only from: OCCUPIED, VACANT NOT LEASED READY, VACANT NOT LEASED NOT READY, NTV NOT LEASED, NTV LEASED, VACANT LEASED READY, VACANT LEASED NOT READY, DOWN, TO PRE-WALK, TO SCOPE, TO FINAL WALK, MODEL, UNKNOWN.
- Set budgeted to yes unless the row clearly says the unit should be excluded from occupancy.
- Keep square footage as a whole number with no commas.

Before final output, verify every row has a unit value and the CSV has exactly the required columns.
```

Recommended rules:

- Keep unit numbers exactly as shown by the property.
- Leave unknown values blank instead of guessing.
- Use `budgeted=no` for offices, models, non-revenue units, or units that should not count toward occupancy goals.
- Use `UNKNOWN` for unclear occupancy only when the source explicitly has an unknown state; otherwise leave the status blank and update it later.
- Save as `.csv` or copy the table directly into the paste box.

The in-app directory importer now also ships quick presets for five common starting shapes:

- `Full`: separate unit, building, area, floor, plan, square-footage, occupancy, and budgeted columns
- `Building + unit`: combined `buildingUnit` style exports such as `1-101`
- `Yardi-style`: common exports with `Unit #`, `Building`, `Floor`, `Unit Type`, `Bedrooms`, `Bathrooms`, `Sq Ft`, `Status`, and `Occupancy Eligible`
- `MRI-style`: common exports with `Unit Code`, `Building`, `Plan Code`, `Status`, and `Occupancy Eligible`
- `Minimal`: sparse unit + plan + square-footage style extracts

## Converting An Availability Report To CSV

Availability reports should preserve the source section/status as a column because the section often defines the operational status:

```csv
unit,floorPlan,sqft,availabilityStatus,vacancyStatus,moveOutDate,vacatedDate,daysVacant,makeReadyDate,moveInDate,applicant,reportDate,building,area,floor,notes
101,A1,720,Vacant Leased Ready,VACANT LEASED READY,,2026-05-24,12,2026-05-28,2026-06-01,Future Applicant,2026-06-07,,,,
102,B2,960,NTV Leased,NTV LEASED,2026-06-15,,0,2026-06-17,2026-06-20,Future Applicant,2026-06-07,,,,
103,C1,1180,Vacant Not Leased Not Ready,VACANT NOT LEASED NOT READY,,2026-05-18,28,2026-05-31,,,2026-06-07,,,,On hold
```

Use availability import in two different ways:

- Initial availability import: creates or updates units and creates active make-ready turns for non-occupied operational statuses.
- Recurring availability import: compares the new report to existing active turns by property + unit. The preview warns when applicant, status, dates, or days vacant differ. Provided report values update the active turn; omitted report fields do not wipe existing local values.
- Stale-report failsafe: if the incoming report would overwrite newer or more advanced local board values, MakeReadyOS blocks the import and returns the conflicting units for review until an operator explicitly overrides the report.
- Generic move-out routing: when a source export only supplies one move-out style column, MakeReadyOS now routes it into `moveOutDate` for notice/NTV statuses and into `vacatedDate` for already-vacant statuses so the turn timeline stays closer to the real report intent.

Large recurring imports no longer collapse changed-unit review into a partial summary. The browser preview keeps the full changed-unit list and the full blocked-conflict list visible in unit order, and both lists can be copied out in one action for reconciliation with RealPage, Yardi, or supervisor handoff. That same preview path now auto-detects comma, semicolon, or tab separators so spreadsheet exports do not need manual delimiter cleanup first.

The in-app availability importer now also ships quick presets for five common starting shapes:

- `Full`: MakeReadyOS-native availability CSV with all major fields present
- `RealPage-style`: combined `bldgUnit`, `MoveOut`, `Days Vacant`, `Make Ready`, `Scheduled Move-In`, `Preleased Name`, and `Report Date` columns
- `Yardi-style`: common exports with `Unit #`, `Unit Type`, `Avail Status`, `Vacate`, `Days Vacant`, `Ready Dt`, `Future Resident`, `Apply Date`, and `As Of Date`
- `MRI-style`: common exports with `Unit Code`, `Plan Code`, `Status`, `Notice Date`, `Ready Date`, `Future Resident`, and `Snapshot Date`
- `Compact`: small operational exports with only unit, status, move-out, days vacant, and report date

The browser-side parser also recognizes a few more low-risk aliases in this same family now, including `unitcode`, `plancode`, `statusdescription`, `noticegivendate`, `movereadydate`, `unitreadydate`, `snapshotdate`, `rundate`, and `residentname`.

If using an AI assistant or another conversion tool, give it instructions like:

```text
You are converting a property availability report into MakeReadyOS availability CSV.

Return a CSV file if your interface supports file attachments. If not, return only one fenced csv block and no extra explanation.

Required header, exactly:
unit,floorPlan,sqft,availabilityStatus,vacancyStatus,moveOutDate,vacatedDate,daysVacant,makeReadyDate,moveInDate,applicant,reportDate,building,area,floor,notes

Rules:
- One row per availability/notice unit only. Do not include fully occupied units unless the report explicitly lists them as NTV, vacant, down, or model.
- Preserve leading zeroes in unit numbers.
- Do not include current resident names, phone numbers, emails, rent amounts, charges, totals, page headers, footers, or private notes.
- Do include applicant/preleased names in applicant when the availability report provides them for a future move-in.
- Use vacancyStatus values only from: VACANT NOT LEASED READY, VACANT NOT LEASED NOT READY, NTV NOT LEASED, NTV LEASED, VACANT LEASED READY, VACANT LEASED NOT READY, DOWN, TO PRE-WALK, TO SCOPE, TO FINAL WALK, MODEL, UNKNOWN.
- Map report sections carefully: Vacant Not Leased Ready -> VACANT NOT LEASED READY; Vacant Not Leased Not Ready -> VACANT NOT LEASED NOT READY; NTV Not Leased -> NTV NOT LEASED; NTV Leased -> NTV LEASED; Vacant Leased Ready -> VACANT LEASED READY; Vacant Leased Not Ready -> VACANT LEASED NOT READY; Down/Unavailable -> DOWN; Model -> MODEL.
- Use moveOutDate for expected notice/vacate dates when the report is an NTV section.
- Use vacatedDate for actual move-out/vacated dates when the report is a vacant section.
- Copy Days Vacant into daysVacant as a whole number when the report provides it.
- Use makeReadyDate only when the report provides a scheduled make-ready date.
- Use moveInDate only when a future move-in date is shown.
- Include the availability report generated/as-of date in reportDate for every row when the source report shows it.
- RealPage-style columns usually mean: report generated/as-of date -> reportDate; MoveOut -> moveOutDate for NTV rows or vacatedDate for already-vacant rows; Days Vacant -> daysVacant; Make Ready -> makeReadyDate; Date Applied -> notes/source context unless it is clearly the application date for the applicant; Scheduled Move-In -> moveInDate; Preleased Name -> applicant.
- Yardi-style columns can also be normalized when they are unambiguous: Unit #/Unit No -> unit; Unit Type/Unit Plan -> floorPlan; Avail Status -> availabilityStatus; Vacate -> moveOutDate for NTV rows or vacatedDate for already-vacant rows; Ready Dt/Market Ready -> makeReadyDate; Future Resident -> applicant; Apply Date -> dateApplied; As Of Date -> reportDate.
- If the source has a grouped Preleased header with columns Lease Rent, Lease Signed, Name, and Comments, use the Name value as applicant.
- If an applicant name wraps onto the next line, join the wrapped line into the same applicant value. Example: "Weger, Kameron" on the unit row plus "Ross" on the next line becomes applicant "Weger, Kameron Ross".
- MakeReadyOS now also collapses orphan continuation rows during browser parsing when a converted CSV/PDF/XLSX export leaves the unit blank and places only the wrapped applicant/preleased name on the next line.
- Do not put applicant names into notes. Applicant/preleased names belong only in the applicant column.
- Keep dates as YYYY-MM-DD if possible. MM/DD/YYYY is also acceptable.
- Leave unknown columns blank.

Before final output, verify every row has unit and vacancyStatus and the CSV has exactly the required columns.
```

Recommended status mapping:

| Availability Section | Directory Status | Make-ready Implication |
| --- | --- | --- |
| Vacant Not Leased Ready | `VACANT NOT LEASED READY` | Ready stock, usually no active turn required unless verification is needed. |
| Vacant Not Leased Not Ready | `VACANT NOT LEASED NOT READY` | Active make-ready candidate. |
| Vacant Leased Ready | `VACANT LEASED READY` | Ready with upcoming move-in. |
| Vacant Leased Not Ready | `VACANT LEASED NOT READY` | Active make-ready candidate with move-in pressure. |
| NTV Not Leased | `NTV NOT LEASED` | Pipeline item; future vacate/turn expected. |
| NTV Leased | `NTV LEASED` | Pipeline item with move-in pressure after expected vacate. |
| Down | `DOWN` | Unavailable/down unit that should live in the property Down Units section. |

## Dashboard

Dashboard occupancy cards show total units, occupied units, occupancy percentage, configured occupancy goal, vacant ready stock, and availability-report statuses. Ready-stock visibility helps teams understand whether they have units available for immediate move-in.
