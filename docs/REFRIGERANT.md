# Refrigerant

The Refrigerant workspace provides simple EPA 608-friendly refrigerant tracking for multifamily maintenance teams. It is built for fast field entry, accountability, auditability, and exportability without becoming a full asset-management or accounting system.

## Scope

The module tracks:

- Administrator-managed refrigerant types such as `R22`, `R410A`, `R454B`, `R32`, and `R134a`.
- Virgin cylinders, clean recovery cylinders, and dirty recovery cylinders.
- Unit charge entries from virgin cylinders.
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
- `Virgin Tanks`: add/manage virgin cylinders, mark tanks empty, and record final recovery.
- `Clean Recovery`: add/manage clean recovery cylinders and log clean recovery.
- `Dirty Recovery`: add/manage dirty recovery cylinders and log dirty recovery.
- `Unit History`: filtered transaction history by accessible property.
- `Exports`: CSV, Excel-compatible, printable HTML, and PDF downloads for usage, recovery, cylinders, compliance, unit history, and full audit reports.

## Tank Rules

Only one active virgin tank is allowed per refrigerant type by default. Managers/admins can intentionally override that rule when a property has a real operational reason.

Virgin tanks marked empty move to `Empty Pending Recovery`. A virgin tank cannot be safely archived until final recovery is recorded.

Recovery tanks show capacity warnings at 80%, 90%, and 95% based on current weight divided by tank size.

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
- Recovery cylinders above 80%, 90%, or 95%.
- Archived virgin tanks without final recovery.
- Missing/invalid/negative weight records.
- Repeated refrigerant additions.

## Exports And Backup

Refrigerant reporting now includes CSV exports for spreadsheet review, Excel-compatible tab exports, printable HTML, and direct PDF output for compliance handoff.

Native MakeReadyOS backup/export includes safe refrigerant operational data:

- refrigerant types
- cylinders
- transactions
- repeated-addition flags

Backups do not include secrets, sessions, API tokens, or external compliance credentials.

Uploaded file-byte backup is not applicable here because the Refrigerant module currently stores operational records only and does not include an attachment surface.
