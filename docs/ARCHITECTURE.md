# Architecture

## Overview

MakeReadyOS is structured as a practical self-hosted monorepo:

- `apps/api`: Fastify API with Prisma ORM
- `apps/web`: React frontend built with Vite
- `PostgreSQL`: primary relational datastore
- `Docker Compose`: default deployment path

The web shell groups navigation into Operations, Visibility, Management, and Admin/Setup workspaces. This is frontend organization only; API role and property checks remain the source of truth.

## Backend

The API is intentionally thin and operational:

- login/logout/current-session endpoints
- admin user-management endpoints
- saved view CRUD endpoints
- signed cookie session auth with database-backed session records
- password hashing using Node's built-in `scrypt`
- role-based and property-scoped authorization checks
- CRUD for make-ready items
- metadata endpoints for labels, properties, units, and views
- calendar feed by board date field
- CSV export
- automation evaluation on item changes
- custom-field definition, option, and make-ready value endpoints
- read-only activity query endpoints over recorded audit events
- structured automation-definition and run-history endpoints
- structured scheduled automation execution through an operator-invoked runner
- SLA/risk evaluation endpoints for scoped summaries, persisted item risk state, and manager/admin risk evaluation
- vendor/contractor directory and vendor assignment endpoints with property-scoped access
- property map metadata, authenticated local map file serving, and unit marker location endpoints with property-scoped access

## Authentication And Authorization

The app uses server-side opaque sessions instead of JWTs.

Reasons:

- immediate revocation by deleting a session row
- no JWT refresh or token expiry coordination in the frontend
- fewer moving parts for a self-hosted internal tool

Hardening currently applied:

- passwords hashed with Node `scrypt`
- signed `HttpOnly` cookie session transport
- configurable cookie name
- `SameSite` cookie policy
- `Secure` cookies in production mode
- per-session CSRF token for state-changing authenticated requests
- trusted-origin allowlist via `CORS_ORIGIN`
- failed-login audit entries
- basic login rate limiting using recent failed attempts from the same client IP
- opportunistic expired-session cleanup during auth flows
- logout-all support for revoking every session owned by the current user

Core auth tables:

- `User`
- `Session`
- `UserPropertyAccess`
- `AuditLog`

Current roles:

- `ADMIN`
- `MANAGER`
- `TECH`
- `LEASING`
- `CLEANER`
- `VIEWER`

Property access is modeled with `UserPropertyAccess` so scoped visibility and editing rules can expand later without redesigning the schema.

Role capabilities are centralized in the API permission matrix instead of scattered role checks. `LEASING` can update leasing-facing fields such as vacancy status, applicant, NTV/vacated/move-in dates, and comments. `CLEANER` can update cleaning execution fields, complete checklists, comment, and upload attachments. `TECH` remains maintenance-execution focused. `VIEWER` stays read-only. The frontend mirrors the same role list for navigation and form affordances, but API checks remain authoritative.

## Onboarding And Deployment Tooling

First-run onboarding is browser-local guidance for `ADMIN` and `MANAGER` users. It opens automatically when no properties exist and can be reopened from the toolbar. It does not create server-side workflow state; it links operators to existing property/unit setup, user admin, property templates, automations, schedule tracks, table views, Dashboard, and Frog Pond.

Deployment safety lives in root scripts rather than an in-app background service. `doctor.sh` checks core files, helper scripts, env sanity, migration presence, disk-space warning thresholds, upload/backup/log directories, and runtime `reference/` isolation. `reset-demo.sh` is explicitly destructive and requires `--yes`; it resets the local Docker database volume while preserving uploads unless `--wipe-uploads` is passed.

## SLA / Risk Engine

Make-ready items store `riskScore`, `riskLevel`, `riskReasons`, and `lastRiskEvaluatedAt`. The evaluator is structured TypeScript logic, not arbitrary JavaScript. It checks move-in timing, overdue make-ready dates, missing critical dates, assigned staff, pest/flooring/paint conditions, checklist completion, stale activity, date conflicts, and long-vacant turns. `GET /api/risk/summary` and `GET /api/risk/items` are property-scoped; `POST /api/risk/evaluate` is limited to `ADMIN` and `MANAGER` and can create deduped in-app `RISK` notifications when an item reaches `HIGH` or `CRITICAL`.

Vendor assignments also feed risk evaluation. Open follow-up work, overdue vendor due dates, and open vendor work near move-in create `VENDOR_RISK` reasons.

Admin-only routes currently cover:

- `GET /api/admin/users`
- `POST /api/admin/users`
- `PATCH /api/admin/users/:id`
- `POST /api/admin/users/:id/reset-password`
- `DELETE /api/admin/users/:id`
- `GET /api/admin/properties`
- `PUT /api/admin/users/:id/property-access`
- `GET /api/admin/export`
- `POST /api/admin/import`

Activity route:

- `GET /api/activity`

`ADMIN` users can query all audit events. `MANAGER` users can query only events bearing a `propertyId` in their assigned property access; unscoped authentication, account-administration, and transfer events remain admin-only. `TECH`, `LEASING`, `CLEANER`, and `VIEWER` are denied access in the current UI and API boundary. Filters support dates, actor, action, entity type, and property, with limit/offset pagination.

Core operations routes:

- `GET|POST /api/operations/properties`
- `PATCH /api/operations/properties/:id`
- `POST /api/operations/properties/:id/archive|restore`
- `DELETE /api/operations/properties/:id`
- `GET|POST /api/operations/units`
- `PATCH /api/operations/units/:id`
- `POST /api/operations/units/:id/archive|restore`
- `DELETE /api/operations/units/:id`
- `POST /api/make-ready-items/:id/archive|restore`

Vendor routes:

- `GET|POST /api/vendors`
- `PATCH /api/vendors/:id`
- `POST /api/vendors/:id/archive|restore`
- `GET|POST /api/vendor-assignments`
- `PATCH /api/vendor-assignments/:id`
- `POST /api/vendor-assignments/:id/complete|cancel`

`ADMIN` and `MANAGER` manage vendors and assignments within scope. `TECH` can view and update vendor assignment execution status where permitted. Vendor assignment actions produce audit events and in-app `VENDOR` notifications.

Property map routes:

- `GET|POST /api/property-maps`
- `PATCH /api/property-maps/:id`
- `POST /api/property-maps/:id/archive|restore`
- `POST /api/property-maps/:id/upload`
- `GET /api/property-maps/:id/file`
- `GET|PUT /api/unit-map-locations`
- `PATCH|DELETE /api/unit-map-locations/:id`

Map files are stored in the same local upload area as operational attachments and served only through authenticated, property-scoped API responses. `ADMIN` and scoped `MANAGER` users manage map records and marker locations; other scoped roles can view maps.

Automation routes:

- `GET /api/automations`
- `POST /api/automations`
- `PATCH /api/automations/:id`
- `PATCH /api/automations/:id/enabled`
- `DELETE /api/automations/:id`
- `GET /api/automations/runs`
- `POST /api/automations/preview`
- `POST /api/automations/:id/run`
- `GET /api/automations/templates`
- `POST /api/automations/templates/:templateId/install`
- `GET /api/operational-library/packs`
- `POST /api/operational-library/preview`
- `POST /api/operational-library/install`

`ADMIN` can manage global and property-scoped definitions. `MANAGER` can list global definitions for visibility and manage definitions scoped to assigned properties; their run history is limited to accessible properties. `TECH`, `LEASING`, `CLEANER`, and `VIEWER` are denied rule-management access.

Preview accepts either a persisted rule identifier or a validated unsaved rule draft, with an optional property filter and item limit. It evaluates current item state and stored custom-field values in memory and returns matching units plus proposed actions. It does not update board records, custom-field values, automation definitions, or `AutomationRun`; only the explicit `AUTOMATION_PREVIEW_RUN` audit event is recorded. Managers can preview assigned-property-scoped rules/items only.

Manual execution accepts enabled `SCHEDULED_CHECK` rules only. Admins can run any scheduled rule; managers can run rules scoped to assigned properties. The root `run-automations.sh` script invokes the same evaluator for all enabled scheduled rules from the deployed API container, making cron/systemd scheduling possible without an always-running job worker.

Template definitions are application-owned, fixed structured inputs rather than stored executable content. Listing resolves setup dependencies against active custom fields and reports installed rules through nullable `AutomationRule.templateId` provenance. Installation enforces the same global/property permissions as ordinary rules, validates references, creates a normal editable `AutomationRule`, records `AUTOMATION_TEMPLATE_INSTALLED`, and defaults `enabled` to `false` unless explicitly submitted as enabled. A missing dependency returns setup requirements without creating data.

Operational library packs are versioned JSON envelopes (`makereadyos.libraryPack`, version `1`) that can install multiple normal MakeReadyOS records at once: custom fields, built-in option choices, checklist templates, schedule tracks, shared saved views, and disabled automation rules. Packs are previewed/dry-run first, duplicate-safe by stable keys/natural keys, and rejected if executable-code-like keys or JavaScript syntax are present. Installed pack history is tracked in `OperationalLibraryPack` and `OperationalLibraryPackItem`; generated automations use `templateId` provenance in the `pack:<packKey>:<itemKey>` form and are always disabled until reviewed.

## Native Backup Transfer

Admin-only native transfer uses a versioned JSON envelope (`makereadyos.backup`, version `1`). Export contains properties, managed floor plans and unit mappings, managed built-in board options, built-in display-column labels, configured schedule tracks, units, make-ready records, custom fields/options/values, shared saved views, automation rule definitions, checklists, vendor records/assignments, property map metadata, unit marker locations, and property notes. It explicitly excludes users, credential material, sessions, CSRF tokens, audit logs, execution history, environment configuration, and uploaded map/image/PDF bytes. Version-1 imports accept backups created before optional presentation/setup sections existed by defaulting those arrays to empty.

Import supports `dryRun` plus non-destructive `merge` only. Records are recreated with destination IDs and relationship references are mapped through portable property codes, custom field keys, and make-ready item keys. Existing natural-key matches are skipped rather than updated. Full behavior and limitations are documented in `docs/BACKUP_AND_TRANSFER.md`.

Native export and committed import actions are audit logged and visible to admins in Activity. Database backup/restore shell scripts intentionally do not write application audit events because they operate independently for disaster recovery; their timestamped operational logs are stored in `logs/`.

The user-management layer enforces:

- valid email addresses
- strong passwords on create/reset
- prevention of removing or deactivating the last active `ADMIN`
- prevention of self-demotion when you are the last active `ADMIN`

## Frontend

The frontend is optimized for dense operational use:

- grouped board sections based on property workflow state
- inline field editing
- color-coded labels
- quick property filtering and search
- Kanban workflow board with drag-and-drop transitions
- calendar schedule view
- saved personal and shared views across table, Kanban, and calendar modes
- admin-only user-management section for user CRUD, role editing, password reset, and property access
- activity workspace for admin/global and manager/property-scoped audit review
- manager/admin custom-field configuration workspace with inline table values
- manager/admin structured Automation workspace with recent run history
- manager/admin `Setup` workspace for inventory-backed board item creation and lifecycle operations
- built-in label-option and property floor-plan configuration controls
- checked-row batch actions and group-level quick item creation
- local display preference controls for compact density, Default/Dark/Light theme, and reading accessibility mode

## Runtime Assets

`reference/` is ignored local research material, not an application asset source. Application code and containers must not import or serve files from it. The SIL OFL-licensed OpenDyslexic font files and license have been copied into committed `assets/fonts/opendyslexic/`; the selected Frog Pond backgrounds have been copied into committed `assets/frogs/`; and the small future-module rail icons copied from Font Awesome live in committed `assets/icons/fontawesome/`. Vite and the production web container serve tracked asset directories only. Dyslexia mode and Frog Pond use those runtime-safe files, while Eye-Strain remains a separate system-font visual adjustment layered over the selected theme. The Docker build context excludes `reference/`.

## Board Workflow Layer

The make-ready module now has a distinct workflow layer on top of raw CRUD:

- `Table` for dense operations work
- `Kanban` for workflow movement
- `Calendar` for date-driven planning

The calendar selector labels `moveOutDate` as `NTV / Notice to Vacate` and `vacatedDate` as `Vacated`, separating notice timing from actual vacancy without an ambiguous combined label. `ScheduleTrack` stores an operator-configured presentation binding to a built-in field or active `DATE` custom field, along with display name, enabled/archive state, sort order, grouping, visibility filter, risk cue toggles, and status/scope/selected-field/fixed/neutral color basis. A selected-field color source can use managed option metadata or an active custom select field. Events are still built client-side from current board data, while the legend derives from active track configuration and risk states override color with matching text labels.

Kanban grouping currently supports:

- `makeReadyStatus`
- `vacancyStatus`
- `scopeLevel`
- `assignedTech`
- `property`

Drag-and-drop updates are treated as ordinary item mutations through the existing API and permission checks. Grouping by property is view-only to avoid accidental reassignment between properties.

## Core Board Management

The `Property` and `Unit` records already carry active-state lifecycle flags. `MakeReadyItem` now adds `isArchived` and `archivedAt`; normal table, Kanban, calendar, and CSV responses hide archived items by default while authorized users can opt into archived turnover records.

Management routes under `/api/operations` provide scoped property and unit listing plus create/update/archive/restore actions. Administrators create and archive properties; managers may edit only assigned properties and manage units within assigned properties. Turn creation and archive/restore use existing make-ready routes and are limited to managers/admins within their accessible properties.

Delete endpoints are defensive rather than normal workflow actions: a property or unit must first be archived and deletion is rejected while linked units or make-ready history exist. All property, unit, and turnover lifecycle changes write audit events.

`FloorPlan` stores reusable property-owned plan configuration. `Unit.floorPlanId` is nullable, while the existing `Unit.floorPlan` string remains valid legacy/snapshot content so units can be migrated gradually. `LabelDefinition` stores the ordered, archiveable choices for standard board status fields; custom-field option choices remain managed through `CustomFieldOption`.

Additional setup endpoints cover `/api/operations/floor-plans` and `/api/operations/options`, including update, reorder, archive, and restore actions. The table calls these same audited routes through inline management popovers; no unprotected client-only configuration path is introduced. Options are archived rather than deleted to protect historic meaning. When a managed built-in or custom selected option is renamed, corresponding stored values are migrated transactionally so board pills, filters, schedule legends, exports, and backups do not diverge from option metadata. `BoardColumnDefinition` updates and resets alter presentation labels only and leave stable internal field keys intact. `POST /api/make-ready-items/batch` accepts bounded item selections and fixed safe actions only, including section movement through existing `boardGroup` values; it enforces property access before mutation and records batch audit events.

The group-level table add row resolves its property from the active filter or current section context. It accepts a unit number as its minimal entry and reuses or creates an active unit before creating the turn. `assignedTech` remains string-backed for imported/history compatibility, while current edits and creates validate names against active staff accounts exposed in authenticated metadata.

## Saved Views

Saved views are persisted in the `SavedView` table and are scoped by:

- `ownerUserId` for personal views
- `isShared` for manager/admin-shared views
- `module` for future cross-module expansion

Stored view state currently includes:

- `viewType`
- `filters`
- `sorts`
- `grouping`
- `visibleColumns`, including built-in field keys and `custom:<field-id>` tokens for active custom columns

Table views provide column presets (`Basic`, `Maintenance`, `Manager`, `Move-In Risk`, and `Full`) plus individual visibility controls. The identity `unitNumber` column is required in the UI and is restored when older or malformed saved view state is applied.

`BoardColumnDefinition` stores display labels for built-in fields separately from stable operational keys. `/api/operations/columns/:fieldKey` permits managers/admins to rename or reset labels and records the corresponding audit event without changing field keys, rule references, or import bindings. Custom-field display labels use the same table-header workflow through the existing custom-field route while retaining `fieldKey`. The ordered `visibleColumns` array on each saved view is used for both built-in and `custom:<id>` fields. Desktop table headers may be dragged horizontally or moved from the compact header menu; the utility selection column and required unit identity remain protected.

`ScheduleTrack` management endpoints under `/api/operations/schedule-tracks` permit managers/admins to create, update, enable/disable, archive/restore, and reorder calendar tracks. A custom date source is accepted only when it points to an active `DATE` custom field; a custom color source is accepted only for active select fields. Enabled non-archived tracks are exposed in `/api/meta` for ordinary board rendering. Existing version-1 native backups remain importable because newly added optional presentation settings default safely.

The right-side item inspector is a frontend composition over existing authorized mutation paths rather than a competing item model. It opens from table item controls and Kanban cards, edits built-in and custom fields, and uses existing batch actions for section/lifecycle updates. Authorized manager/admin requests can scope `/api/activity` and `/api/automations/runs` to the selected item for contextual history; mobile renders the same inspector as a closable overlay.

Current saved-view routes:

- `GET /api/saved-views`
- `POST /api/saved-views`
- `PATCH /api/saved-views/:id`
- `DELETE /api/saved-views/:id`

Permission behavior:

- `VIEWER`: can load views only
- `TECH`: can create/update/delete personal views
- `MANAGER` and `ADMIN`: can create shared views
- only the owner or an `ADMIN` can modify an existing saved view

## Custom Fields

The configurable column foundation uses three relational models:

- `CustomField`: module-scoped field identity, type, ordering, and archive state
- `CustomFieldOption`: ordered colored labels for single/multi-select fields
- `CustomFieldValue`: JSON value linked to a `MakeReadyItem` and `CustomField`

Active definitions are exposed in `/api/meta` for board rendering. Their archived select options remain in metadata for historic value presentation but are filtered out of new table selections. Management endpoints under `/api/custom-fields` require `MANAGER` or `ADMIN`; custom value writes use the same role boundary for this initial pass. Existing hardcoded operational fields remain intact while configurable additions are appended to the table. Table toolbar and status-cell shortcuts invoke the same protected configuration APIs; they do not weaken the management boundary.

Supported types are `TEXT`, `LONG_TEXT`, `NUMBER`, `DATE`, `SINGLE_SELECT`, `MULTI_SELECT`, `BOOLEAN`, and `USER`. Core assigned-tech editing now uses the active staff selector; relational assignment for generic `USER` custom fields remains deferred.

The frontend structured-filter predicate evaluates active custom values on the same permission-scoped item payload as built-in board conditions. Operators are constrained by field type: text matching, numeric comparisons, date windows/ranges/overdue, active select-option matching, multi-select containment, boolean state, and staff identity. Saved views persist these operands in their existing JSON filter payload; applying a saved view normalizes references against active field definitions so archived fields are neither newly selectable nor silently enforced.

The API shape intentionally keeps stable `fieldKey` identifiers and archiveable options so a later spreadsheet mapping/import pass can associate monday.com exports without redefining the schema.

## Automation Builder

`AutomationRule` persists a human-readable name and description, optional source `templateId`, enabled/archive lifecycle, trigger type, optional property scope, and validated JSON conditions/actions. `AutomationRun` stores execution source (`EVENT`, `MANUAL`, or `SCHEDULED`), checked/matched/action counts, warnings/errors, and execution timestamps for recent-history visibility. `AutomationCooldown` stores per-rule/item/activity-note application timestamps for scheduled deduplication.

Initial trigger vocabulary:

- make-ready item created
- make-ready item updated
- date field changed
- status field changed
- scheduled check

Initial conditions support equality, inequality, empty/not-empty checks, date before/after comparisons, existing multi-value matching, and scheduled relative-date checks (`before today`, `after today`, `within next X days`, `date missing`). Conditions can target built-in fields or active custom fields; custom text/number/boolean/date/single-select/multi-select types restrict operators and values to compatible choices, including multi-select option containment. Initial rule actions can set an editable board field, set an active custom-field value, or emit an activity note. Existing seed compatibility actions for priority and appended operational notes remain event-only.

The evaluator is deliberately non-executable: rule inputs are schema validated against fixed operators/actions, and no JavaScript source, expression evaluation, or legacy monday.com automation script is run. The same validation boundary is used by preview, event evaluation, manual scheduled execution, and the scheduled runner; archived/missing custom fields, unavailable select options, incompatible operators, and unsupported actions are rejected before evaluation. Scheduled activity-note actions are suppressed during a configurable cooldown window to avoid repeated identical audit noise. The local legacy reference material informs future structured conversion only.

The bundled template catalog initially includes overdue make-ready, move-in within seven days, missing make-ready date, date fail-safe/schedule warning, pest follow-up, flooring-date requirement, and major-scope priority definitions. The pest follow-up template requires an active `Pest Follow-Up Date` custom date field. The date fail-safe template flags incomplete downstream scheduling; it does not claim field-to-field date sequence evaluation, which is not yet a supported structured condition.

## Data Design

The core table is `MakeReadyItem`, linked to:

- `Property`
- `Unit`
- `LabelDefinition`
- `AutomationRule`
- `AutomationRun`
- `AutomationCooldown`
- `CustomFieldValue`

Configurable board metadata is represented by `CustomField` and `CustomFieldOption`.

Future-ready models already exist for refrigerant logs, pool logs, pest issues, and notes. Operational collaboration now uses `ItemComment`, `ItemAttachment`, `ChecklistTemplate`, `ChecklistInstance`, and `ChecklistInstanceItem`; checklist instances snapshot template tasks so execution history remains stable when templates evolve.

## Deployment

Primary target is self-hosting through `docker compose up --build`.

Schema changes are now tracked through versioned Prisma migrations under `apps/api/prisma/migrations/`. Development uses `npm --prefix apps/api run db:migrate`; deployed environments use `npm --prefix apps/api run db:deploy`. The API container attempts migration deploy first and falls back to `db push` only for early-development volume compatibility.

Scheduled automation evaluation remains outside the API server lifecycle. A host can invoke `./run-automations.sh` from `deploy/examples/makereadyos-automations.timer` (hourly example) or cron; each invocation produces an operational log under `logs/`. Historical analytics snapshots use the same script-friendly model through `./run-analytics-snapshot.sh`.

Intended environments:

- Raspberry Pi or mini PC
- local VM
- VPS
- Docker-capable cloud host
## Dashboard, Notifications, And Sections

`GET /api/dashboard` computes property-permission-scoped KPIs and attention lists from existing make-ready records and section metadata rather than creating a separate reporting store. The frontend renders theme-safe donuts, percentage bars, a freshness indicator, and KPI/chart drilldown actions. Drilldowns update one typed structured-filter state shared by Table, Kanban, and Schedule: vacancy status, assigned staff, board section/type, property, scope, make-ready status, move-in window, overdue, missing dates, pest/flooring/paint needs, move-in risk, archive state, and operator-selected active custom-field predicates. Filter chips make the applied query visible and removable.

`Notification` provides a user-scoped in-app inbox with read/dismiss state and category preferences. Assignment/status/date/lifecycle/section-move, comment, checklist, and cooldown-approved scheduled automation events may create records; `/api/notifications` never exposes another user's inbox. External and realtime delivery are not implemented.

## Collaboration And Files

Protected `/api/make-ready-items/:id/collaboration` routes resolve through the same property scope as board records. Non-viewers may author item updates, upload local files, and complete checklist tasks; manager/admin roles create templates and attach checklist instances. Comment and checklist mutations write audit records.

Attachment metadata is stored in PostgreSQL and file bytes are written to `UPLOAD_DIR` with a bounded multipart upload limit (`MAX_UPLOAD_MB`). Docker Compose mounts a persistent `uploads_data` volume. Downloads require an authenticated, property-scoped request. Native JSON transfer deliberately exports comments and checklist instances but not local attachment bytes; complete recovery must preserve the upload volume along with the database.

Upload intake additionally restricts filenames and accepted extension/MIME combinations to operational document and image formats. Download responses disable MIME sniffing, and a failed stored-file deletion does not silently remove its database pointer.

`backup-uploads.sh` and `restore-uploads.sh` archive and restore the Compose upload path for attachments/photos/property-map images. PostgreSQL backups preserve metadata only; deployment recovery needs both database and upload archives.

`GET /api/my-work` returns assigned, scoped make-ready items with checklist progress for the signed-in user; managers/admins may query another active staff user. Dashboard presets use the existing saved-view model with `viewType: dashboard` and layout metadata in `grouping`, preserving the stable board/filter contract.

`WorkAssignmentBlock` provides the first workload-planning layer. `/api/planning` returns scoped work blocks, scheduled coverage, move-ins not covered by planning, and an unscheduled work bucket. Admins/managers create and replan blocks; assigned staff can update execution status on their own block. The item drawer and My Work read active planning blocks without replacing the existing assigned-tech field. Legacy hour/capacity fields remain in the schema for compatibility, but current UI avoids hour-based planning because make-ready work is too variable for reliable hour estimates.

`GET /api/units/:id/history` derives unit timelines from existing audit, comment, attachment, checklist, vendor, automation, risk, and make-ready records rather than duplicating every historical event. `PropertyDailyMetricSnapshot` is the first persisted analytics table and stores one upserted property/day rollup for trend reporting. `GET /api/analytics/summary` and `GET /api/analytics/snapshots` expose scoped trend and turn-performance foundations.

Frog Pond is a frontend visualization surface over the same permission-scoped make-ready item stream. Its configuration and simple presets are browser-local in this foundation stage, so no schema migration or native-backup field is required. The scene limits rendered frogs, clusters overflow counts, derives color legends from active item metadata, respects reduced motion, and opens the shared item drawer for item-backed frogs.

`BoardSection` is additive presentation/lifecycle metadata over stable `MakeReadyItem.boardGroup` values. Standard section types are `READY`, `MAKE_READY`, `DOWN`, and `ARCHIVE`; rename operations are audited. Archive actions transition records into the configured Archive key while retaining `isArchived` and `archivedAt` for compatibility.

Kanban and multi-panel schedule choices are serialized in the existing saved-view JSON configuration. Structured filters, including optional `customFieldFilters`, are stored in the existing `SavedView.filters` JSON payload, requiring no schema migration; old filter payloads continue to map to equivalent defaults. Kanban reads built-in/custom metadata while only executing drag updates against existing authorized writable fields. Schedule events open the existing inspector, and legends resolve from the same color-priority logic applied to event pills. This preserves stable field keys and avoids adding hardcoded date columns for presentation layout.

Managed floor plans remain property-owned records attached through `Unit.floorPlanId`; selecting or editing a plan synchronizes unit bedroom, bathroom, and square-foot metadata and denormalized item display text for linked turnover history. Items without a managed plan retain legacy text as explicit migration candidates.

## Performance And Query Boundaries

`GET /api/make-ready-items` supports optional `propertyId`, `boardGroup`/`section`, `updatedSince`, `includeArchived`, `limit`, and `offset` inputs while retaining its array response for existing views. Pagination metadata is exposed through response headers so future board loading can move incrementally without breaking current clients. Explicit property filtering is rejected when it falls outside the signed-in user's allowed property scope.

Notifications, Activity, and automation run history expose bounded paging; collaboration responses bound comments, attachments, and checklist instances and report totals for future incremental presentation. Operational indexes cover property/archive/section, assignee, vacancy/date/update, comments, attachments, and checklist-completion access patterns.

The frontend memoizes material grouped/list derivations, defers board text filtering while input is active, and lazy-loads heavy secondary workspaces such as Dashboard, Vendors, Maps, Frog Pond, Automations, Admin, Activity, and My Work. Table virtualization is deliberately deferred because grouped fast-add rows, sticky identity/utility cells, row selection, and keyboard editing need measured evidence and regression coverage before virtual scrolling is safe. `./seed-large.sh` creates disposable non-production workloads for measuring that threshold. In local development only, `ENABLE_API_TIMING_LOGS=true` enables API duration output.

## API And Extension Foundation

External integrations use `Authorization: Bearer <token>` with admin-created API tokens. The database stores only token hashes plus prefix/last-four metadata for identification. Scope checks run after authentication and before CSRF handling; token requests bypass CSRF because they do not use browser cookies. Property-scoped tokens further restrict the creator's normal property access and do not grant additional permissions.

API-token traffic has a basic in-memory per-token limiter controlled by `API_TOKEN_RATE_LIMIT_MAX` and `API_TOKEN_RATE_LIMIT_WINDOW_MINUTES`. This is sufficient for single-node self-hosted deployments, but multi-node or public deployments should move enforcement to shared infrastructure or a reverse proxy.

Webhook endpoints are modeled and configurable from Admin -> Integrations, but delivery is scaffolded for a later queue-backed implementation. This avoids blocking operational writes on external HTTP calls while preserving the schema and UI contract for signed webhook delivery.

MakeReadyOS extension points are JSON contracts only: operational library packs, native backup files, API integrations, and future dashboard/widget definitions. The app does not execute arbitrary plugin JavaScript.

## Property Templates

`PropertyTemplate` stores reusable property setup as a versioned `makereadyos.propertyTemplate` JSON manifest. The manifest can include board sections, built-in option sets, custom fields/options, optional floor-plan definitions, schedule tracks, shared saved views/dashboard presets, checklist templates, and structured automation rules.

Template routes live under `/api/property-templates`. Managers/admins can preview or create a template from an accessible source property. Applying a template uses merge mode with a dry-run-first summary; matching records are skipped rather than overwritten. Creating a new target property from a template is admin-only, while managers may apply templates only to existing assigned properties. Automation rules installed from property templates default to disabled unless explicitly enabled.

Templates intentionally exclude live make-ready items, units, comments, attachments, users, sessions, tokens, audit history, and unit history so they remain safe operational configuration. Native backup includes template metadata/manifests, and operational library packs may store property templates as data-only pack items.
