# Lease Compliance

Lease Compliance is a first-class MakeReadyOS workspace for fast property-walk and resident-exterior issue tracking.

## Current Scope

- top-level Lease Compliance workspace in the left module rail
- property-scoped quick capture for unit/building/area issues
- configurable issue types with colors
- simple status and notice-stage workflow
- still-persists tracking with persistence count/history
- resident notified, 1st/2nd/3rd notice, and violation-needed actions
- resolution and archive workflow
- photo/PDF evidence uploads
- CSV, printable HTML, and PDF reporting
- My Work surfacing for assigned lease-compliance issues
- unit-history timeline integration
- property-map linked-record support for future map-first workflows
- Property Wiki workflow context and attachable wiki references on issue records
- Grounds Walk repeat capture with sticky location context, quick issue-type chips, recent-location reuse, and immediate post-save handoff feedback
- native backup/import coverage for issue types, settings, issues, notes, photo metadata, notice/persistence history, and attached wiki references
- in-app notifications to manager/leasing/admin audiences for create, still-persists escalation, and violation-needed events

## Role Behavior

- `ADMIN`: view, edit, notice, settings
- `MANAGER`: view, edit, notice
- `LEASING`: view, edit, notice
- `TECH`: view, edit
- `CLEANER`: view, edit
- `VIEWER`: view

## Operational Views

- `Dashboard`
- `Active Issues`
- `Grounds Walk`
- `Needs Notice`
- `Violation Needed`
- `Resolved`
- `Archive`
- `Reports`
- `Settings`

## Current Gaps

- map placement is future-ready through linked records, but direct drop-a-pin creation from Lease Compliance is not wired yet
- served OpenAPI route coverage is now in place, but future external integrations may still justify deeper route-specific serializers for adjacent analytics/history payloads
