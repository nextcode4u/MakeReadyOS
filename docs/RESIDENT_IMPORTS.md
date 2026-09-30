# Resident names and initial setup

In Setup, open **Unit directory / import permanent inventory** and import an
all-units report before using ongoing availability reports. Include an explicit
`currentResidentName` or `Resident Name` column. For example:

```csv
unit,occupancyStatus,currentResidentName
101,OCCUPIED,Alex Demo
102,NTV LEASED,Casey Example
```

Managers and administrators can use **Manage > Availability & Units** for the
Availability, Unit Directory, Mailboxes, and Keys & Access sections. The same
tools remain available in **Admin > Setup**, with the same property permissions.

## Direct RealPage Availability XML

In **Availability**, select the correct property and upload the original RealPage
availability `.xml` file. No PDF, Excel, CSV preparation, or AI conversion is
needed. If reports are in a ZIP, extract it first and select one report for the
intended property and date. The app reads the XML into its existing tabular
preview internally; review that preview before confirming the import.

Supported exports contain `LeaseVariance` detail rows and `Settings` report
metadata. Summary rows are excluded. The importer preserves leading-zero unit
numbers, floor plans, square footage, status, scheduled move-in, make-ready and
application dates. Move-out dates belong to notice units; already-vacant units
use them as vacated dates. Current and incoming resident names remain separate;
internal lease/resident IDs are never used as names.

`Settings/Row` PropertyDate supplies the report date, with RunDate as a fallback;
row-level PropertyDate is used when the settings date is absent. Tag matching
handles case and namespace prefixes. UTF-8 and UTF-16 XML uploads are supported.
Malformed XML, unsupported reports/statuses, missing unit/status fields, and
reports without detail rows are rejected rather than silently skipping units.

Only select **Full property report** for a complete, unfiltered snapshot. A ZIP
of historical exports should not be imported as one combined current report.
Original reports are private reference material; repository tests use synthetic
records, not production exports.

## Directory And Resident Updates

After refreshing the directory, import the latest availability report to bring
new units and current turns into sync. Existing availability statuses remain
protected during directory imports.

You can also refresh the all-units report after importing availability. Existing
units keep their current occupancy status, even if the directory report differs.
Only newly created units take their initial status from the directory report.
Resident names, occupant move-in dates, and inventory details can still update;
active turns, incoming applicants, and turn dates are untouched. Use availability
imports for ongoing status updates. The directory preview reflects retained statuses.

Availability imports keep `currentResidentName` separate from `applicant`
(also accepted as `Preleased Name` or `Future Resident`). Generic `Name` and
resident/applicant identifier columns are not guessed. Rename ambiguous headers
only after checking what they represent. XML exports without supported name
fields can still load inventory; use CSV to populate the missing resident names.

- Occupied board rows use the heading **Occupant**, with the occupant's move-in
  date in **Move-In**. Import `currentResidentMoveInDate` (YYYY-MM-DD) to populate
  existing occupants. In the initial directory, `Move In Date` is also accepted.
  On an availability report, a notice unit's scheduled `moveInDate` belongs to
  its future applicant and never replaces the current occupant's date.
- A new turn snapshots the outgoing resident; the drawer and mobile cards show
  outgoing and incoming names separately.
- Empty name cells preserve existing values. A partial availability report does
  not clear residents on omitted units.
- Marking a ready turn occupied, or confirming the existing full-report
  reconciliation preview, transfers its applicant and move-in date to the unit.
  Without a known applicant, the new resident remains unknown rather than
  displaying the previous resident. The outgoing name stays in turn history.
- Initial inventory imports do not create active turns. Use availability imports
  afterward to populate notice/vacancy dates and incoming applicants.

Existing records are not automatically backfilled or reinterpreted. Import a
report containing explicit resident names to populate them. Never put real
resident reports, screenshots, or production data into the public repository.
