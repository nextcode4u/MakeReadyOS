# Refrigerant

The Refrigerant workspace provides operational refrigerant tracking for multifamily maintenance teams. It supports field entry, accountability, and reporting; it does not certify regulatory compliance or replace cylinder manufacturer instructions.

## Scope

The module tracks:

- Administrator-managed refrigerant types such as `R22`, `R410A`, `R454B`, `R32`, and `R134a`.
- Virgin cylinders, clean recovery cylinders, and dirty recovery cylinders.
- Unit charge entries from virgin or clean recovery cylinders.
- Clean/dirty recovery entries into recovery cylinders.
- Final recovery from empty virgin cylinders before archival.
- Repeated unit additions that may indicate a leak.
- Capacity and recordkeeping warnings.
- CSV, Excel-compatible, printable HTML, and PDF operational exports.

The module does not include QR-code inventory, Bluetooth scales, certification tracking, GPS, vendor compliance, accounting, or external reclaim integrations.

## Permissions

Refrigerant access follows dedicated permission behavior:

- `ADMIN`: view, edit, and administer refrigerant types.
- `MANAGER`: view and edit refrigerant logs and cylinders.
- `TECH`: view and edit refrigerant logs and cylinders.
- `VIEWER`: view-only.
- `LEASING` and `CLEANER`: no refrigerant workspace access.

Managers and admins can dismiss repeated-addition leak flags. Only admins can add or deactivate refrigerant types.

## Workspace Tabs

- `Overview`: summary cards, quick charge, quick recovery, compliance warnings, repeated additions, and recent activity.
- `Tanks`: a combined inventory page for active virgin tanks, active recovery tanks, virgin tanks pending final recovery, and archived tanks.
- `Virgin Tanks`: add/manage virgin cylinders, mark tanks empty, and record final recovery.
- `Clean Recovery`: add/manage clean recovery cylinders and log clean recovery.
- `Dirty Recovery`: add/manage dirty recovery cylinders and log dirty recovery.
- `Unit History`: filtered transaction history by accessible property.
- `Exports`: CSV, Excel-compatible, printable HTML, and PDF downloads for usage, recovery, cylinders, compliance, unit history, and full audit reports.

## Tank Rules

Only one active virgin tank is allowed per refrigerant type by default. Managers/admins can intentionally override that rule when a property has a real operational reason.

Virgin tanks marked empty move to `Empty Pending Recovery`. A virgin tank cannot be safely archived until final recovery is recorded.

Recovery tanks track `TW` (tare/empty cylinder weight) and `WC` (water capacity). `TC` is not a field to use for tare. Current implementation:

```text
net contents = max(0, gross scale weight - recorded tare)
estimated recovery ceiling = (WC when positive, otherwise nominal tank size) x 0.80
recovery headroom = max(0, estimated recovery ceiling - net contents)
```

This is an estimate, not a verified safe fill weight for every refrigerant. The current calculation does not model liquid density, temperature, or cylinder compatibility. Manufacturer guidance calls for refrigerant-specific density at the relevant temperature; use the manufacturer's limit and a scale, not this estimate alone. See [Appion cylinder guidance](https://appiontools.com/blog/fast-recovery-series-cylinders/). A validated replacement is tracked in the reliability queue.

For a known-full virgin cylinder, nominal size is the initial net refrigerant amount. Initial gross weight minus that amount gives estimated tare. A partly used cylinder cannot establish tare from nominal size alone. Virgin `remainingCapacity` means net refrigerant left, not free space; recovery `remainingCapacity` means headroom. Low-virgin warnings use remaining contents.

## Weight Calculations

For charge and final recovery:

```text
amount = start weight - end weight
```

For clean/dirty recovery:

```text
amount = end weight - start weight
```

Negative calculated amounts are rejected or flagged as recordkeeping issues.

## Repeated Additions

Repeated virgin charge entries on the same unit and refrigerant type create leak-review flags:

- `2` additions within `90` days: potential refrigerant leak.
- `3+` additions within `12` months: manager review required.

These flags generate in-app manager/admin notifications with dedupe protection and remain visible until dismissed with notes.

## Compliance Warnings

The overview highlights:

- Empty virgin tanks that still need final recovery.
- Recovery cylinders above 80%, 90%, or 95% of allowed recovery fill.
- Archived virgin tanks without final recovery.
- Missing/invalid/negative weight records.
- Repeated refrigerant additions.

## Exports And Backup

Refrigerant reporting now includes CSV exports for spreadsheet review, Excel-compatible tab exports, printable HTML, and direct PDF output for compliance handoff.

Full audit includes all scoped modern transactions (no 1,000-row ceiling), unit history with property labels, shared cylinder inventory including archived/disposition information, active and dismissed leak flags, and compliance issues. Legacy `RefrigerantLog` entries appear separately and are not added to modern transaction totals. Property filters restrict logs, transactions, and flags; cylinder inventory is shared across properties because cylinders do not have property ownership fields.

CSV includes columns from every report section. Excel-compatible output is quoted tab-separated text, not an XLSX workbook. Spreadsheet formula prefixes are escaped. PDF rendering uses Playwright Core with the installed Chromium executable or `CHROMIUM_PATH`.

Native MakeReadyOS backup/export includes safe refrigerant operational data:

- refrigerant types
- cylinders
- transactions
- repeated-addition flags

Backups do not include secrets, sessions, API tokens, or external compliance credentials.

Uploaded file-byte backup is not applicable here because the Refrigerant module currently stores operational records only and does not include an attachment surface.
