# Vendor / Contractor System

MakeReadyOS includes a lightweight vendor foundation for tracking outside work without adding accounting or external portals.

## What It Tracks

- Vendor company, trade/category, phone, email, notes, preferred status, active/archive state.
- Property service areas for vendors that only serve certain properties.
- Insurance and license expiration dates for basic compliance visibility.
- Vendor assignments linked to a make-ready item and property.
- Assignment trade, scheduled date, due date, status, notes, cost estimate, and invoice/reference text.

Assignment statuses are `REQUESTED`, `SCHEDULED`, `IN_PROGRESS`, `COMPLETED`, `CANCELED`, and `FOLLOW_UP_NEEDED`.

## Access Rules

- `ADMIN` and `MANAGER` can create, update, archive, restore, and assign vendors within their property scope.
- `TECH` can view vendor work and update assignment status where permitted.
- `LEASING`, `CLEANER`, and `VIEWER` do not manage vendor records.
- All API reads and writes respect existing property scoping.

## Board Integration

- The Vendors tab provides a vendor directory and assignment list.
- The item drawer includes a Vendor Work section for assignment status and quick add.
- Vendor scheduled and due dates are available as schedule tracks.
- Dashboard KPIs include vendor work scheduled this week, overdue vendor work, follow-up-needed work, vendor-blocked items, and compliance expirations.
- Risk evaluation includes vendor overdue/follow-up/near-move-in reasons.

## Backup And Recovery

Native MakeReadyOS JSON backup includes vendors and vendor assignments. It does not include secrets, external credentials, accounting data, or uploaded files. PostgreSQL backups remain the disaster-recovery path for full state including local upload metadata.

## Current Limits

- No payments, invoice processing, vendor portal, email, SMS, or external integrations.
- Assignment attachments currently use item-level uploads; direct vendor-assignment attachments are future-safe but not separate yet.
- Compliance tracking is date-based only.
