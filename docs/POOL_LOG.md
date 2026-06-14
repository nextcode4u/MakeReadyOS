# Pool Log

Pool Log is the first MakeReadyOS water-feature module. It is designed for daily multifamily pool/spa checks without turning the app into a full water-chemistry or compliance suite.

## What It Tracks

- Properties with one or more pools, spas, wading pools, splash pads, or other water features.
- Pool/spa setup: name, type, optional capacity in gallons, surface type, notes, and active/archive state.
- Property-level chemical library: chemical name, category, unit, optional concentration percentage, and notes.
- Daily log entries: date, time, technician, chemistry readings, operational checks, water condition, notes, safety checklist, and chemical additions.
- Pool-specific photos and PDF attachments on daily log entries.
- Generated chemistry review notes for low/high readings, combined chlorine issues, cloudy water, and algae.
- Basic dosage estimate for low free chlorine when both pool/spa capacity and chemical concentration are known.

If capacity or concentration is missing, MakeReadyOS still records the check and explains why exact dosage is unavailable.

## Default Chemistry Targets

The initial foundation includes built-in target ranges:

- Pool pH: 7.2-7.8
- Pool free chlorine: 1-4 ppm
- Spa free chlorine: 3-5 ppm
- Combined chlorine max: 0.2 ppm
- Total alkalinity: 80-120 ppm
- CYA/stabilizer: 30-50 ppm
- Pool calcium hardness: 200-400 ppm
- Spa calcium hardness: 150-250 ppm

Property-specific target overrides are modeled in the database for future UI expansion.

## Safety Checklist

Each daily entry can capture:

- Gate/self-closing latch checked
- Rescue equipment present
- Deck clear of hazards
- Drain covers visible/intact
- Pool/spa signage visible
- Pump/filter area checked

Values are `Pass`, `Fail`, or `N/A`. Failures are highlighted in the Pool Log overview.

## Permissions

- `ADMIN` and `MANAGER`: configure pools/spas and chemicals, create logs, view history, export CSV.
- `TECH`: create daily log entries and view scoped pool data.
- `VIEWER`, `LEASING`, and `CLEANER`: read-only at this foundation stage.

All pool data is property-scoped through the same access model used by the rest of MakeReadyOS.

## Exports And Backups

Pool Log has a CSV export for spreadsheet review and a printable HTML report that can be printed or saved as PDF from the browser.

PostgreSQL disaster-recovery backups include pool log records and pool attachment metadata because they are normal database tables.

Native JSON transfer includes Pool Log setup and operational records: facilities, chemicals, chemistry targets, daily log entries, safety checks, and chemical additions. Uploaded photo/file bytes are still handled by upload-volume backups, not embedded in the JSON transfer file.

Use `./backup-uploads.sh` and `./restore-uploads.sh` with the database backup when Pool Log photos/PDFs matter.

## Notifications

MakeReadyOS creates in-app notifications for manager/admin review when a submitted pool log has out-of-range chemistry or failed safety checks. The Pool Log overview also creates deduped missing-log reminders for active pools/spas that do not have a daily log yet.

Notifications are in-app only. Email, SMS, push, health-department reporting, and external probe integrations are not part of this foundation.

## Current Limits

- No external weather, ORP, pH probe, or health-department integration yet.
- Pool photos/PDFs are stored as local uploads, so native JSON transfer does not carry the file bytes.
- The printable report is browser-print/PDF based rather than a server-side PDF rendering engine.
