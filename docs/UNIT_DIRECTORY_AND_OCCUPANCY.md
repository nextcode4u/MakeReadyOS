# Unit Directory And Occupancy

MakeReadyOS separates the permanent unit directory from active make-ready turns.

## Concepts

- Unit Directory: the property inventory. Units can be occupied, vacant ready, vacant leased, NTV, NTV leased, down, model, unknown, active, or archived.
- Make-ready item: an active or archived turnover record for a unit.
- Archive: completed turn history after the resident has moved in. Archive is not the same as deleting a unit from the property inventory.
- Occupancy goal: optional property-level target percentage used by dashboard visibility.

This supports properties that are already operating when MakeReadyOS is introduced. Not every occupied unit needs an active make-ready record.

## Archive Workflow

Each property has its own Archive section. Archiving a make-ready item moves that turn into the selected property's Archive section and keeps the historical record available for review after move-in. The main board toolbar supports three archive modes:

- `Active items`: normal daily operating board with Ready Units, Make Ready, and Down Units.
- `Archive only`: property-scoped completed turn history.
- `Active + archive`: combined troubleshooting view when comparing active work and old records.

The Setup workspace also includes an Archive / Occupied History panel. Its list is scoped to the selected property so managers can review archived turns without mixing records from unrelated properties.

## Availability Statuses

The directory-level occupancy status is intentionally compatible with common availability reports:

- `OCCUPIED`
- `VACANT_READY`
- `VACANT_LEASED`
- `VACANT_NOT_LEASED`
- `NTV`
- `NTV_LEASED`
- `DOWN`
- `MODEL`
- `UNKNOWN`

Availability reports often focus on units that are available, vacant leased, NTV, or NTV leased rather than every occupied unit. MakeReadyOS can hold the full directory while still keeping the make-ready board focused on operational turns.

## Building And Area Support

Units can store optional building, area, and floor values. This allows simple properties with only unit numbers and larger properties with buildings, skipped building numbers, unusual numbering, office gaps, and mixed unit counts per building.

Property Maps reuse the same directory metadata. When building data exists, the map workspace groups units by building/area, shows mapped versus expected unit counts, and can filter the unit picker to one building. This keeps map setup useful for both unit-only properties and properties with irregular building numbering.

## Paste/File Import

The Setup workspace supports lightweight paste or local-file import for unit directories and availability reports. Comma-delimited and tab-delimited data are supported, including quoted CSV values. Existing units are updated by property + unit number. New units are created. The import is merge-style and does not delete units missing from the pasted report.

Sparse files are supported. A row may include only unit number, floor plan, and square footage. When updating an existing unit, MakeReadyOS only changes fields that are present in the import row; missing columns do not wipe existing building, area, status, budgeted, or occupancy data.

Accepted column names include common variants of:

```csv
unit,building,area,floor,floorPlan,beds,baths,sqft,occupancyStatus,budgeted
101,1,North,1,A1,1,1,720,OCCUPIED,yes
102,1,North,1,A1,1,1,720,NTV_LEASED,yes
```

Useful aliases include `unit number`, `apartment`, `building number`, `bldg`, `unit type`, `floor plan code`, `square feet`, `availability status`, `unit status`, `include in occupancy`, and `occupancy eligible`.

The import preview shows row count, expected new units, expected updates, budgeted-unit count, and status counts before writing. Budgeted units are used for occupancy percentage calculations, which lets properties exclude offices, models, non-revenue units, or other non-budgeted inventory.

## Source Report Patterns

Common property-management exports usually fall into two categories:

- Unit directory exports: permanent property inventory, often with one detail sheet plus summary sheets by floor plan and physical occupancy.
- Availability reports: operational availability snapshots, often grouped by statuses such as vacant ready, vacant not ready, vacant leased, NTV, and NTV leased.

MakeReadyOS should treat these as different import jobs. A unit directory updates the permanent unit inventory. An availability report updates operational availability and can optionally create or update active make-ready turns.

Observed unit-directory exports may include:

- A detail table with `Bldg/Unit`, `Floor plan`, `SQFT`, rent columns, and optional lease/resident columns.
- A floor-plan summary with total units, occupied units, physical occupancy percentage, average square footage, and total square footage.
- A physical occupancy summary grouped by occupied/vacant square footage or unit count.
- Sparse variants that only include unit, floor plan, square footage, and totals.

For privacy, MakeReadyOS import workflows should default to structural/unit data and should not import resident names, lease rent, or personal lease dates unless an admin explicitly maps those fields in a future lease-aware workflow.

Availability reports may include section headers that carry important meaning. A future availability importer should map the section name plus row fields, not just column names. Useful sections include:

- Vacant not leased ready
- Vacant not leased not ready
- Vacant leased ready
- Vacant leased not ready
- NTV not leased
- NTV leased

Availability rows may include unit, floor plan, square footage, move-out or expected vacate date, days vacant, scheduled make-ready date, scheduled move-in date, notes/comments, hold flags, and amenity lines. Amenity lines and hold markers should be reviewed in the import preview instead of blindly appended to unit notes.

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
102,1,North,1,A1,1,1,720,NTV_LEASED,yes
260,26,South,2,B2,2,2,1040,VACANT_READY,yes
Office,,,,,,,0,OCCUPIED,no
```

If using an AI assistant or another conversion tool, give it instructions like:

```text
Convert this unit directory into CSV with these headers:
unit,building,area,floor,floorPlan,beds,baths,sqft,occupancyStatus,budgeted

Keep blank cells blank when data is missing. Do not invent building numbers, floor plans, square footage, or occupancy status. If only unit, floor plan, and square footage are available, output only:
unit,floorPlan,sqft
```

Recommended rules:

- Keep unit numbers exactly as shown by the property.
- Leave unknown values blank instead of guessing.
- Use `budgeted=no` for offices, models, non-revenue units, or units that should not count toward occupancy goals.
- Use `UNKNOWN` for unclear occupancy only when the source explicitly has an unknown state; otherwise leave the status blank and update it later.
- Save as `.csv` or copy the table directly into the paste box.

## Converting An Availability Report To CSV

Availability reports should preserve the source section as a column because the section often defines the operational status:

```csv
section,unit,floorPlan,sqft,expectedVacateDate,daysVacant,makeReadyDate,moveInDate,notes,onHold
Vacant Leased Ready,101,A1,720,,4,2026-05-28,2026-06-01,,no
NTV Leased,102,B2,960,2026-06-15,,2026-06-17,2026-06-20,,no
Vacant Not Leased Not Ready,103,C1,1180,,12,2026-05-31,,,yes
```

If using an AI assistant or another conversion tool, give it instructions like:

```text
Convert this availability report into CSV with these headers:
section,unit,floorPlan,sqft,expectedVacateDate,daysVacant,makeReadyDate,moveInDate,notes,onHold

Use the report section heading as the section value for each row. Do not include resident names. Do not include rent amounts. Keep unknown dates blank. Keep unit numbers exactly as shown.
```

Recommended status mapping:

| Availability Section | Directory Status | Make-ready Implication |
| --- | --- | --- |
| Vacant Not Leased Ready | `VACANT_READY` | Ready stock, usually no active turn required unless verification is needed. |
| Vacant Not Leased Not Ready | `VACANT_NOT_LEASED` | Active make-ready candidate. |
| Vacant Leased Ready | `VACANT_LEASED` | Ready with upcoming move-in. |
| Vacant Leased Not Ready | `VACANT_LEASED` | Active make-ready candidate with move-in pressure. |
| NTV Not Leased | `NTV` | Pipeline item; future vacate/turn expected. |
| NTV Leased | `NTV_LEASED` | Pipeline item with move-in pressure after expected vacate. |

## Dashboard

Dashboard occupancy cards show total units, occupied units, occupancy percentage, configured occupancy goal, vacant ready stock, and availability-report statuses. Ready-stock visibility helps teams understand whether they have units available for immediate move-in.
