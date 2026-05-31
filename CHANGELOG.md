# Changelog

MakeReadyOS uses GitHub Releases for published release notes. This file captures the high-level release stream for source checkouts.

## Unreleased

- No unreleased changes yet.

## v0.1.0-rc2 - 2026-05-31

- Continued stabilization of the self-hosted MakeReadyOS release candidate.
- Added release-process documentation, pull request checklist, and repository housekeeping notes.
- Added production hardening around versioned migrations, upload storage/backups, webhook delivery, OpenAPI/schema docs, operating calendars, photo inspections, unit directory/occupancy guidance, and release validation.
- Validated release checks across doctor, build, API smoke tests, browser E2E, scheduled automations, analytics snapshots, database backup, upload backup, dependency audits, and GitHub Actions CI.

## v0.1.0-rc1

Initial public release-candidate target.

Highlights:

- Dense table-first make-ready board with managed labels, custom fields, floor plans, saved views, Kanban, Schedule, Dashboard, and item drawer.
- Authentication, roles, property scoping, audit/activity logs, notifications, API tokens, and integration contracts.
- Comments, local attachments/photos, inspection gallery, checklists, My Work, vendors, planning, property maps, Frog Pond, risk engine, automations, operational library, and property templates.
- Docker Compose deployment with PostgreSQL, backup/restore scripts, upload-volume tooling, diagnostics, CI, E2E workflow, and open-source documentation.
