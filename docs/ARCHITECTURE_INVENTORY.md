# Architecture Inventory

This inventory captures the current MakeReadyOS architecture so future work can be planned without rediscovering the codebase.

## API Modules And Routes

- `auth.ts`: login/logout, sessions, CSRF, role helpers, API token authentication.
- `admin.ts`: admin user and property access management.
- `makeReady.ts`: make-ready CRUD, batch actions, CSV export, calendar data.
- `operations.ts`: properties, units, floor plans, board sections, label options, column labels, schedule tracks.
- `customFields.ts`: custom field definitions, options, values, ordering, archive lifecycle.
- `savedViews.ts`: personal/shared table, Kanban, calendar, and dashboard views.
- `dashboard.ts`: KPI, risk, vendor, map, and operational summary data.
- `analytics.ts`: unit history timelines, turn summaries, analytics summaries, and daily metric snapshots.
- `notifications.ts`: in-app notifications and category preferences.
- `activity.ts`: audit/activity log filtering and pagination.
- `collaboration.ts`: item comments, local attachments, checklist templates/instances, My Work data.
- `automations.ts`: structured automation rules, templates, previews, manual runs, run history.
- `risk.ts`: SLA/risk summary, item risk listing, and risk evaluation.
- `vendors.ts`: vendor directory and vendor assignment workflows.
- `propertyMaps.ts`: property map metadata/upload and unit map locations.
- `planning.ts`: scoped in-house workload planning, scheduled coverage, move-in coverage gaps, and unscheduled work buckets.
- `operationalLibrary.ts`: versioned operational library pack preview/install.
- `backupTransfer.ts`: native MakeReadyOS JSON backup/export/import.
- `integrations.ts`: API token management and webhook endpoint registration scaffold.
- `meta.ts`: app metadata used by the frontend shell.

## API Libraries

- `auth.ts`: session auth, API token auth, role/field permission helpers.
- `audit.ts`: centralized audit log writer.
- `board.ts`: make-ready derived fields and normalized patch behavior.
- `automationDefinition.ts`: structured condition/action validation.
- `automationTemplates.ts`: bundled safe automation templates.
- `scheduledAutomations.ts`: CLI-friendly scheduled evaluation engine.
- `notifications.ts`: notification creation and dedupe helpers.
- `operationalLibrary.ts`: safe library pack validation/installation helpers.
- `risk.ts`: risk scoring and reason evaluation.
- `analytics.ts`: property/day snapshot rollups, turn-duration metrics, and derived recurring-issue signals.
- `password.ts`, `config.ts`, `prisma.ts`: platform primitives.

## Frontend Major Components

- `App.tsx`: authenticated shell, tab routing, shared state, view selection.
- `BoardTable.tsx`: primary dense table, inline editing, add rows, batch actions, column menus.
- `ItemDrawer.tsx`: full item editor, comments, attachments, checklists, vendors, risk, activity placeholders.
- `KanbanBoard.tsx`: configurable board lanes, drag/drop, card details.
- `CalendarView.tsx`: configurable schedule tracks and multi-calendar layouts.
- `DashboardPanel.tsx`: KPIs, charts, drilldowns, risk/vendor/map/Frog Pond summaries.
- `SavedViewsPanel.tsx`, `FilterBar.tsx`, `ActiveFilterBar.tsx`: saved views and structured filters.
- `AdminPanel.tsx`, `IntegrationsPanel.tsx`, `BackupTransferPanel.tsx`: admin operations.
- `AutomationPanel.tsx`, `ActivityPanel.tsx`, `OperationsPanel.tsx`, `CustomFieldsPanel.tsx`.
- `VendorsPanel.tsx`, `PropertyMapsPanel.tsx`, `FrogPondPanel.tsx`, `MyWorkPanel.tsx`.
- `CommandPalette.tsx`, `NotificationDrawer.tsx`, `ToastViewport.tsx`.
- UI primitives: `Modal.tsx`, `ConfirmDialog.tsx`, `StatusState.tsx`, `LabelPill.tsx`.

## Data Models By Domain

- Identity and access: `User`, `Session`, `UserPropertyAccess`, `ApiToken`, `ApiTokenPropertyScope`.
- Core operations: `Property`, `Unit`, `FloorPlan`, `MakeReadyItem`, `BoardSection`.
- Configuration: `LabelDefinition`, `BoardColumnDefinition`, `ScheduleTrack`, `SavedView`.
- Custom fields: `CustomField`, `CustomFieldOption`, `CustomFieldValue`.
- Collaboration: `ItemComment`, `ItemAttachment`, `ChecklistTemplate`, `ChecklistItem`, `ChecklistInstance`, `ChecklistInstanceItem`.
- Activity and notifications: `AuditLog`, `Notification`, `NotificationPreference`.
- Analytics and history: `PropertyDailyMetricSnapshot` plus derived unit history from audit, comments, attachments, checklists, vendor assignments, lifecycle dates, and risk state.
- Automations: `AutomationRule`, `AutomationRun`, `AutomationCooldown`.
- Operational library: `OperationalLibraryPack`, `OperationalLibraryPackItem`.
- Risk and schedule-adjacent data: persisted risk fields on `MakeReadyItem`.
- Vendors: `Vendor`, `VendorContact`, `VendorServiceArea`, `VendorAssignment`.
- Workload planning: `UserCapacity`, `WorkAssignmentBlock`.
- Property maps: `PropertyMap`, `UnitMapLocation`.
- Extension scaffold: `WebhookEndpoint`, `WebhookPropertyScope`.
- Future/placeholder modules: `RefrigerantLog`, `PoolChemicalLog`, `PestIssue`, `PropertyNote`.

## Background And Root Scripts

- `build.sh`: dependency install, Prisma generation, API/web builds.
- `test.sh`: smoke tests, Docker validation, API route checks, docs/examples checks.
- `e2e.sh`: Docker-backed Playwright browser suite.
- `run-automations.sh`: scheduled automation runner wrapper.
- `run-analytics-snapshot.sh`: daily property metric snapshot runner wrapper.
- `backup-db.sh`, `restore-db.sh`, `prune-backups.sh`: PostgreSQL disaster recovery tooling.
- `backup-uploads.sh`, `restore-uploads.sh`: local upload volume disaster recovery tooling.
- `reset-demo.sh`: destructive local demo database reset helper with required `--yes` confirmation.
- `seed-large.sh`: opt-in synthetic data generator.
- `install-toolchain.sh`: Linux toolchain bootstrap helper.
- `doctor.sh`: local environment, deployment, docs, helper-script, migration, and runtime asset sanity check.

## Volumes And Storage

- PostgreSQL volume: primary application database and source of truth.
- Upload volume: local item attachments/photos and property map files.
- `backups/`: ignored local PostgreSQL dump output.
- `logs/`: ignored timestamped build/test/automation/backup logs.
- Native backup JSON: portable operational transfer, not full disaster recovery.

## Runtime Assets

- `assets/fonts/opendyslexic/`: committed dyslexia font assets and license.
- `assets/frogs/`: committed Frog Pond runtime assets.
- `reference/`: ignored working references only; never a runtime dependency.

## Backup Boundaries

- Native MakeReadyOS export includes operational metadata/configuration and selected domain records.
- Daily analytics snapshots are derived and excluded from native transfer; PostgreSQL dumps include them.
- Native export excludes passwords, token hashes, sessions, CSRF tokens, environment config, and large upload bytes.
- PostgreSQL dump is the full database disaster-recovery path.
- Upload volume backup is required separately for attachments/photos/property map files.

## Extension Points

- Scoped API tokens.
- Webhook endpoint metadata scaffold.
- Operational library packs.
- Native backup/transfer JSON.
- Future dashboard widgets, import adapters, automation templates, and plugin manifests.

## Known Scaling Limits

- Dense table rendering is not virtualized yet.
- Many filters still execute client-side after bounded API payloads.
- Make-ready list supports query params, but deeper server-side filtering/pagination is still future work.
- Webhook delivery has no queue/retry worker.
- Upload storage is local filesystem only.
- Offline sync is not implemented.
- The Vite bundle currently emits a chunk-size warning.
