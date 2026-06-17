# MakeReadyOS Project Reference

## Project Identity

- Project name: `MakeReadyOS`
- Expanded origin name: `PIMP` = `Property Information Maintenance Pro`
- Purpose: self-hosted property maintenance and make-ready management web app inspired by dense, software-defined spreadsheet operations used by the team

## Current MVP Scope

- Node 20 runtime
- Docker Compose deployment
- PostgreSQL database
- Fastify 5 + Prisma API
- React + Vite frontend
- Server-side cookie session auth
- Responsive dark make-ready board UI
- Inline editing for table cells
- Kanban workflow view with grouped columns and drag/drop updates
- Calendar scheduling view
- Saved personal/shared views for table, Kanban, and calendar states
- Configurable make-ready custom fields with inline table values
- Custom fields support archive, restore, and a 7-day trash retention flow before permanent deletion is available.
- Polished frontend feedback layer with toasts, modals, and stronger empty/loading/error states
- Mobile browsers can install MakeReadyOS as a Progressive Web App. The manifest and service worker live in committed `assets/`, the in-app prompt appears only on mobile-capable browsers, and API/uploads remain network-only to avoid stale operational data.
- Pool Log is now a first-class side-rail module for daily pool/spa readings, safety checks, chemical additions, printable reports, scoped pool photos/PDFs, and in-app review reminders for missing/out-of-range logs.
- Playwright browser E2E coverage for core login, board workflow, saved view, and admin lifecycle flows
- Read-only Activity workspace for auditing application operations
- Property map/unit directory foundation for local map uploads, building/area markers, unit marker placement, visual status/risk navigation, mapped/unmapped setup tracking, building/area/floor metadata, and directory occupancy states
- Seed/demo data modeled after screenshot workflows
- Structured Automation workspace with validated rule definitions and run history
- Scheduled/date-driven automation runner with safe manual execution and cooldown dedupe
- Typed custom-field conditions for automation preview, manual execution, and scheduled checks
- Operational automation template library with safe disabled-by-default installation, including starter schedule/risk templates for weekend guards, Monday/Friday guards, vendor lead-time reminders, scope-day planning, date-sequence review, daily load review, in-house/vendor routing review, cleaner-assignment review, balanced tech-assignment review, and ready-unit stock expectations.
- Versioned Operational Library packs for installing safe fields, options, checklists, views, schedule tracks, and disabled automations
- Core `Setup` workspace for property/unit maintenance, occupancy goals, merge-style unit-directory import, and make-ready item creation
- Property operating-calendar configuration for no-weekend rules, optional Monday/Friday avoidance, maintenance operating hours, vendor lead days, daily scheduled-unit limits, and scope/work-day preferences
- Structured automation date offsets can populate a built-in date from another date while respecting property operating calendars; date-changing templates install disabled and should be previewed before enabling.
- Managed built-in label options and property-owned floor plans with legacy unit-text compatibility
- Group `+ Add item` rows and protected checked-row batch actions
- Safe archive/restore lifecycle for make-ready records, with archived turns hidden from normal board views
- Saved-view sidebar removed from the primary board layout; a narrow left module rail now reserves space for MakeReadyOS plus active RefrigerantLogOS and PoolLogOS modules, with future PestLogOS and PropertyWikiOS surfaces still planned.
- Right-side operational item inspector opened from table/Kanban with existing audited field, lifecycle, activity, and automation paths
- Browser-local Default/Dark/Light themes plus independent Dyslexia and Eye-Strain modes
- User language preferences support English and Spanish in the sign-in flow, core app shell, dashboard shell, connection/offline status messaging, and admin user workflow, with per-user storage and a self-service toolbar selector. Broader module-by-module workflow translation remains an active hardening track.
- AMOLED-black Dark theme, reinforced warm Light contrast, and OFL-licensed OpenDyslexic assets served from tracked `assets/fonts/opendyslexic/`
- Table-first header menus/popovers for display-label rename/reset, column visibility/order/sort, managed option lifecycle editing, and managed floor-plan lifecycle editing
- Item-drawer updates, local attachment uploads, checklist templates/instances, seeded make-ready QA front/internal paper workflow templates, `My Work` quick status updates, weak-connection retry messaging, and Ctrl/Cmd+K quick search
- Inspection gallery charge-candidate workflow includes property-scoped price-sheet estimate items, per-photo estimate metadata, and evidence ZIPs; this remains operational documentation, not accounting.
- In-app notification preferences and saved dashboard presets
- Bounded collaboration/inbox payloads, attachment validation, indexed operational queries, and optional synthetic load seeding
- Grouped workspace navigation plus a browser-local setup guide for first-run property, unit, staff, template, automation, schedule, and dashboard onboarding
- Deployment hardening docs and helpers now include `docs/DEPLOYMENT.md`, `docs/ONBOARDING.md`, expanded `doctor.sh`, and `reset-demo.sh`
- Release housekeeping includes GitHub CI/E2E workflows, issue templates, pull request template, 0BSD license, `SECURITY.md`, `SUPPORT.md`, `CHANGELOG.md`, and `docs/RELEASE_PROCESS.md`.
- Admin Integrations includes webhook delivery-health visibility, signed dry-run payloads, queued test payloads, delivery-attempt history, and the explicit `run-webhooks.sh` delivery path. Current webhook events cover item create/update/assignment/archive/restore, risk changes, comments, attachment create/delete, checklist completion, and vendor assignment updates.
- `GET /api/openapi.json` now exposes an expanded OpenAPI 3.1 contract covering operations setup, custom fields, saved views, planning, notifications, analytics, property templates, backup transfer, and webhook delivery history in addition to the core board/integration paths. Request/query component schemas are generated from exported Zod route validators where available, major response envelopes are documented as reusable schemas, and common long-tail integration routes now have exact serializers for options, floor plans, schedule tracks, automation history, operational-library installs, API tokens, and webhooks.

## Source Layout

- `apps/api`: backend API, Prisma schema, seed logic
- `apps/web`: frontend app
- `reference/project`: durable project context for future chats or machine changes
- `references/workflows`: curated, commit-safe notes derived from local legacy board references
- `docs`: open-source and end-user documentation
- `logs`: local build/test run outputs generated by root scripts
- `backups`: ignored local PostgreSQL dump output from disaster-recovery operations
- `.github/workflows`: CI automation

## Domain Model Notes

- Primary module is the make-ready board for apartment/unit turnover tracking
- Board groups inferred from screenshots:
  - `READY_UNITS_TA`
  - `MAKE_READY_BOARD_TA`
  - `DOWN_AND_MODELS`
  - `READY_UNITS_VAB`
  - `MAKE_READY_BOARD_VAB`
  - `ARCHIVE_TA`
  - `ARCHIVE_VAB`
- Current schema also includes:
  - active Pool Log models for facilities, chemicals, entries, safety checks, chemical additions, and pool log attachment metadata
  - legacy pool chemical log compatibility
  - pest tracking
  - property wiki notes
  - legacy refrigerant log compatibility next to the active refrigerant module
- Collaboration models now include item comments/attachments plus checklist templates and checklist execution instances.

## UI Direction

- Maintenance-focused operations board alternative
- Dense but readable grid
- Dark mode first
- Strong status color pills
- Fast inline editing
- Real board workflow via Kanban, not table-only operations
- Mobile-friendly browser usage
- Production-quality operator feel matters before adding more modules
- Avoid generic “task app” styling

## Current Workflow Layer

- Table view for dense grouped editing
- Kanban view grouped by:
  - `Make Ready Status`
  - `Vacancy Status`
  - `Scope Level` where legacy/high-level scope data is still useful
  - `Assigned Tech`
  - `Property`
- The default table should not show both `scopeLevel` and `makeReadyStatus`; keep `makeReadyStatus` visible as `Make Ready Status` because it includes workflow values such as `FINAL WALK`, while `scopeLevel` remains compatibility/filter data.
- Schedule view for `NTV / Notice to Vacate`, `Vacated`, core work dates, and active custom date tracks
- Saved views support:
  - personal views for non-viewers
  - shared views for `MANAGER` and `ADMIN`
  - seeded defaults for common daily board slices

## Custom Field Foundation

- `CustomField`, `CustomFieldOption`, and `CustomFieldValue` model configurable make-ready columns and values
- Supported types: text, long text, number, date, single-select/status, multi-select, boolean, and user/assignee storage
- `MANAGER` and `ADMIN` manage field definitions and edit custom values in this initial boundary
- Fields and select options are archiveable to retain historical meaning
- The local legacy spreadsheet export is reference material for a later mapping/import pass; no importer exists yet

## Curated Workflow References

- Raw screenshots, workbook exports, theme resources, and legacy scripts remain local/ignored under `reference/`
- `reference/` is never a production/runtime dependency; approved assets must be copied into a committed application asset path before use
- The redistributed OpenDyslexic font family and `OFL.txt` license are committed in `assets/fonts/opendyslexic/`; the source copy under `reference/fonts/` remains ignored
- Publicly useful workflow interpretation lives in `references/workflows/`
- Read `MAKE_READY_WORKFLOW.md` and `COLUMN_MEANINGS.md` before changing the turnover lifecycle or board field model
- Read `AUTOMATION_NOTES.md` before expanding the rules engine
- Read `DATA_IMPORT_NOTES.md` before designing spreadsheet mapping or import

## Frontend Polish Notes

- Toast notifications now cover auth, board edits, saved views, and admin actions
- Browser-native confirms have been replaced with in-app confirmation dialogs
- Session-expiry handling now redirects users back to sign-in more cleanly
- Table, Kanban, saved-view, and admin states now have stronger loading, empty, and failure feedback
- Dense operations toolbar places navigation, filters, search, export, compact mode, and logout in one low-height working bar
- Compact Mode is persisted in browser local storage and reduces desktop table, Kanban, and saved-view spacing without affecting shared board data
- Saved-view sidebar collapse is local-browser state; its collapsed UI is icon-only, and mobile defaults to that rail so operational content remains usable
- Administrators own property creation/archive, while managers maintain assigned property details, units, and turnover records only within their access scope
- The main table uses a shared scroll viewport with sticky headers and a sticky unit column for dense review
- Table groups expose fast `+ Add item` using inferred section/property context and unit-number entry; managers/admins can select rows for auditable bulk lifecycle, section movement, active-staff assignment, and safe status updates
- Table tools expose `+ Add field`, setup access, and manager/admin-only in-cell option creation while retaining protected API enforcement
- Local Dyslexia Mode uses committed OpenDyslexic assets with readable spacing while preserving Compact Mode density; Eye-Strain remains an independent softened-surface preference layered over the selected theme rather than replacing it
- Built-in/custom board labels remain keyed by stable internal fields; managers/admins can rename/reset display labels from table headers without changing automations or data bindings, while selected-option renames migrate matching stored values for parity
- Saved table views persist draggable ordered built-in and custom column keys while retaining the required unit identity column and reset/keyboard alternatives
- Calendar tracks are configurable manager/admin-managed bindings to built-in or active custom date fields, with enable/archive state, order, label, grouping, visibility, risk cues, and status/scope/selected-field/fixed/neutral color basis

## Browser Test Notes

- Browser E2E uses Playwright from the repo root
- `./e2e.sh` starts a clean Docker Compose stack, waits for readiness, runs Playwright, and writes a timestamped log
- A separate manual GitHub Actions workflow now exists for E2E so default CI remains lightweight
- Core browser coverage now includes compact/theme/accessibility persistence, right-side inspector entry, logout click, Kanban drag/drop, saved view create/delete, header drag ordering, admin user lifecycle actions, custom field editing, table option creation, fast group entry/batch movement, staff assignment selection, and NTV/custom-date scheduling with calendar legend
- Presentation QA coverage includes column label mutation, ordered saved-column rendering, configured/archiveable custom schedule tracks, AMOLED theme token selection, bundled OpenDyslexic selection, local 12-hour/24-hour clock preference, and runtime source isolation from ignored `reference/` assets
- Saved table views now persist visible built-in/custom columns, expose compact role-focused presets, and always retain the unit identity column
- Admin-only MakeReadyOS native JSON backup/transfer supports versioned export plus dry-run/non-destructive merge import, including managed floor plans/unit mappings, built-in board options, refrigerant records, and Pool Log setup/log records; users, secrets, sessions, audit history, and uploaded file bytes are excluded
- `./backup-db.sh` and confirmation-gated `./restore-db.sh` provide Docker Compose PostgreSQL disaster recovery; database dumps include database-backed auth/audit records and remain ignored under `backups/`
- `./prune-backups.sh` provides guarded local dump retention with dry-run support; `backup-db.sh` invokes it after successful dumps when `BACKUP_RETENTION_DAYS` is configured
- Example systemd scheduling units are in `deploy/examples/`; deployment procedure is documented in `docs/SCHEDULED_BACKUPS.md`
- `./run-automations.sh` evaluates enabled structured scheduled rules through Docker Compose, logs each run, and can be scheduled with the supplied automation timer examples. It also performs fixed lifecycle maintenance: when an active turn is `NTV NOT LEASED` or `NTV LEASED` and its `NTV / Expected Vacate` date arrives, it moves the item once to `TO PRE-WALK`, records `NTV_PREWALK_TRIGGERED`, and notifies admins plus property-scoped managers and leasing users.
- Operational Library packs use `makereadyos.libraryPack` version `1`, are data-only, reject executable JavaScript, track install provenance, and install automations disabled by default.
- Local upload bytes live in the Docker `uploads_data` volume; native transfer includes comments/checklists but excludes file bytes and user inbox preferences.
- `./seed-large.sh` creates opt-in synthetic records in non-production and logs each run; scale boundaries and virtualization rationale live in `docs/PERFORMANCE_AND_SCALE.md`.
- Property map metadata, building/area markers, and unit marker coordinates are included in native backup, but uploaded map image/PDF bytes remain in local upload storage; see `docs/PROPERTY_MAPS.md`.

## Key Label Vocabulary

- Vacancy-style labels: `VACANT NOT LEASED READY`, `VACANT NOT LEASED NOT READY`, `NTV NOT LEASED`, `NTV LEASED`, `VACANT LEASED READY`, `VACANT LEASED NOT READY`, `DOWN`, `OCCUPIED`, `TO PRE-WALK`, `TO SCOPE`, `TO FINAL WALK`, `MODEL`
- Progress labels: `GOOD`, `DONE`, `YES`, `NO`, `NONE`
- Scope labels: `EASY`, `LITE`, `MEDIUM`, `MAJOR`
- Paint/repair labels: `FULL PAINT`, `TOUCH UP`, `NEEDS PAINT`, `NEED REPLACEMENT`, `SMALL REPAIRS`, `MEDIUM REPAIRS`, `MAJOR REPAIRS`, `TEXTURE ONLY`
- Pest labels: `ROACHES`, `ANTS`, `BED BUGS`, `FLEAS`, `TREATED`
- Flooring/inventory labels: `CLEAN CARPETS`, `REPAIR CARPET`, `REPLACE CARPET`, `HAVE`, `STOCK`, `APPLICABLE`, `NOT APPLICABLE`

## Implemented Automation Patterns

- Recalculate `daysVacant`
- Flag overdue make-ready items
- Flag move-ins within 3 days when work is incomplete
- Raise priority for `MAJOR` scope items
- Mark pest treatment focus for serious pest statuses
- Append note when carpet replacement lacks a flooring date

## Automation Builder Foundation

- `Automations` is visible to `ADMIN` and `MANAGER`; `TECH`, `LEASING`, `CLEANER`, and `VIEWER` are blocked.
- Rules now support description, enabled/archive state, event triggers plus `SCHEDULED_CHECK`, structured conditions/actions, optional property scope, and recent run history.
- `ADMIN` may manage global or scoped rules; `MANAGER` may inspect global rules and manage assigned-property rules only.
- Definition edits, toggles, and archive actions create audit events.
- Stored rules and unsaved drafts can be previewed in-app; preview is non-mutating for board/custom-field/run data and creates an `AUTOMATION_PREVIEW_RUN` audit record.
- Scheduled rules support relative-date checks, can be run by an admin or assigned-property manager, and record checked/matched/action metrics.
- Active custom text/status/boolean/date/multi-select fields can be used as rule conditions with type-compatible operators and active-option validation.
- Bundled templates cover overdue, move-in risk, missing schedule dates, schedule review, pest follow-up, flooring scheduling, cleaner-assignment review, balanced tech-assignment review, and major scope priority; installed rules retain `templateId` provenance and remain ordinary editable rules.
- Template installation defaults to disabled and reports missing custom-field requirements, including the `Pest Follow-Up Date` requirement for the pest follow-up template.
- Activity-note actions from scheduled rules are deduplicated per rule/item during `AUTOMATION_NOTE_COOLDOWN_HOURS` to avoid recurring log spam.
- Rules never execute arbitrary JavaScript. Local legacy board automation files remain documentation/reference material only.

## Authentication Notes

- Auth uses server-side opaque sessions stored in the database
- Browser auth state is carried with a signed `HttpOnly` cookie
- Passwords are hashed with Node `scrypt`
- Session cookie name is configurable with `SESSION_COOKIE_NAME`
- State-changing authenticated requests require a per-session CSRF token
- Login attempts are audit-logged and basic rate limiting is enforced
- Expired sessions are cleaned up opportunistically during auth flows
- Roles currently enforced:
  - `ADMIN`
  - `MANAGER`
  - `TECH`
  - `LEASING`
  - `CLEANER`
  - `VIEWER`
- Property-scoped access is modeled with `UserPropertyAccess`
- Default admin is seeded from `ADMIN_EMAIL` and `ADMIN_PASSWORD`
- A demo tech user can be seeded from `DEMO_TECH_EMAIL` and `DEMO_TECH_PASSWORD`
- Optional demo leasing and cleaner users can be seeded from `DEMO_LEASING_*` and `DEMO_CLEANER_*`
- Admins can now manage users and property access from an in-app admin section
- Last-admin protections prevent removing or self-demoting the final active `ADMIN`
- Admin UX now includes user filtering, reactivation, confirmations for risky actions, and self-lockout safeguards
- Activity is available to `ADMIN` globally and to `MANAGER` only for property-linked events in assigned properties; `TECH`, `LEASING`, `CLEANER`, and `VIEWER` remain blocked
- Activity includes a daily manager report with date/property filters, categorized ready/import/archive/update/exception counts, action hints for external property-system reconciliation, and CSV export
- Native JSON export/import activity is recorded in the audit log; database backup/restore script execution is documented through timestamped `logs/` files instead

## Important Context For Future Chats

- Legacy screenshots are reference material only; the app is being built as a self-hosted, software-defined spreadsheet operations system
- The root README is setup-oriented; `docs/` should remain the durable source for architecture, product scope, and contributor-facing explanations
- GitHub Actions CI now verifies clean-checkout installs, API/web production audits, build, and test on pushes and pull requests
- Public-release docs now include `SECURITY.md`, `SUPPORT.md`, issue templates, screenshots in `docs/screenshots/`, and a README section clarifying what MakeReadyOS is and is not
- Native JSON transfer is for controlled instance migration; full database recovery procedure is documented in `docs/DISASTER_RECOVERY.md`
- Linux scheduled database backup setup and retention behavior are documented in `docs/SCHEDULED_BACKUPS.md`
- If continuing on a different machine, read:
  1. `README.md`
  2. `reference/project/PROJECT_REFERENCE.md`
  3. `references/workflows/MAKE_READY_WORKFLOW.md`
  4. `references/workflows/COLUMN_MEANINGS.md`
  5. `docs/ARCHITECTURE.md`
  6. `docs/ROADMAP.md`
## Current Visibility And Board Metadata

- Dashboard tab provides permission-scoped KPIs, workload summaries, and a Needs Attention path into the item inspector.
- SLA/risk foundation persists item `riskScore`, `riskLevel`, structured `riskReasons`, and `lastRiskEvaluatedAt`; dashboard, table, Kanban, Schedule, My Work, and the item drawer now use those risk indicators.
- `PropertyRiskPolicy` stores property-level threshold configuration for move-in windows, stale work, aging turns, vendor timing, checklist timing, and planned coverage. Risk policy APIs are `/api/risk/policies` and manager/admin-only `PUT /api/risk/policies/:propertyId`; stable risk categories and field keys are unchanged.
- Risk APIs are `/api/risk/summary`, `/api/risk/items`, and manager/admin-only `/api/risk/evaluate`; high/critical risk notification creation uses dedupe keys.
- Dashboard presentation adds theme-safe vacancy/scope donuts, readiness/workload percentages, freshness text, and precise structured table drilldowns with removable filter chips while keeping the board as the primary workflow.
- Saved-view filter JSON now preserves vacancy, assignee, section, make-ready status, move-in window, risk/attention, archive-state, and typed active custom-field predicates; legacy filter payloads still load, archived custom definitions are not newly applied, and Table/Kanban/Schedule share the same filtered records.
- Alerts is a user-scoped in-app notification inbox for assignment, comments, checklist activity, status/scheduling, lifecycle, section-move, batch-change, and scheduled automation-warning events with read/dismiss and category preference handling; no external delivery is included.
- Item drawers now host operational comments, local multi-photo/document uploads, staged inspection metadata, per-image notes, non-destructive image markup pins, charge-candidate flags, charge/recovery notes, and checklist completion. A dedicated inspection gallery keeps large unit walks readable instead of rendering every photo inline in the drawer; cards open an in-app preview first, with markup pins, explicit per-file downloads plus all/filter/category/charge-candidate ZIP exports for evidence packets. The gallery also has a needs-classification filter and evidence panel that flags charge candidates missing notes. `MAX_UPLOAD_MB=0` disables MakeReadyOS' app-level per-file cap; practical limits still come from browser memory, storage, network, and any external reverse proxy. `My Work` gives staff a compact assigned-turn queue, checklist progress surface, and quick make-ready status control. The app detects offline/API-unreachable states and shows a retry banner; it does not yet queue offline edits.
- The make-ready QA paper workflow is documented in `docs/MAKE_READY_QA_CHECKLIST.md`; the ignored source PDF remains under `reference/make ready/` and is not a runtime dependency. Seeded templates split resident-facing final QA sign-off from internal scope/follow-up notes, with blue painter's tape as the in-unit scope marker system.
- Make-ready reads support scoped optional property/section/date/limit filters; growing drawer/inbox/history surfaces are bounded and out-of-scope explicit manager item requests are rejected.
- Dashboard saved views can store dashboard scope/filter state and an overview or attention-focus layout; Ctrl/Cmd+K provides fast navigation and record search.
- Property-owned board section metadata supplies renameable Ready Units, Make Ready, Down Units, and Archive presentation over stable group keys.
- Completion is now a two-step workflow: setting `Completed` to `YES` moves the make-ready status to `FINAL WALK` and notifies admins/property managers; manager/admin final-walk signoff uses the drawer's Mark Ready action to move the turn into the property's Ready Units section.
- Floor-plan table/drawer editing now selects property-owned managed plans and synchronizes linked unit metadata; legacy text is retained and labelled for migration.
- Kanban metadata settings and single/two/four/auto Schedule layout choices are kept as saved-view-safe configuration.
- Schedule legends derive from actual event colors and schedule events open the shared item inspector.
- Vendor foundation adds `Vendor`, `VendorContact`, `VendorServiceArea`, and `VendorAssignment`; API/UI support a Vendors workspace, item-drawer vendor assignments, schedule tracks for vendor scheduled/due dates, vendor dashboard KPIs, `VENDOR_RISK`, `VENDOR` notifications, and native backup transfer for vendor records.
- Property map foundation adds `PropertyMap`, `PropertyMapArea`, and `UnitMapLocation`; API/UI support scoped map upload/view, building/area marker placement, unit marker placement/drag adjustment/removal, marker color legends by risk/status/section/tech/make-ready state, map dashboard KPIs, and native backup transfer for metadata/locations only.
- Map QOL derives building/area groups from unit-directory and saved marker metadata; Maps can show building labels, mapped/expected unit counts, and building-filtered unit placement without adding a rigid building table yet.
- Frog Pond foundation adds a playful data visualization over scoped make-ready items. Runtime pond backgrounds, frog sprite sheets, tadpole sprites, decorative fly sheet, accessory/hat sheets, and licenses are copied to committed `assets/frogs/`; the ignored `reference/resources/Frogs` source is never served at runtime. Numbered pond backgrounds are selectable and stretch to fill the scene frame, frog sheets are cropped to animated 32x32 horizontal frame runs with compatible row variation, frogs gently hop and jump away from the cursor once, tadpoles cycle image frames and swim away from the cursor once, decorative flies occasionally loop through the pond without representing data and disappear if they pass over a frog marker, operators can drag markers to preferred local positions, markers are constrained to the lower pond area, group summaries drive drilldowns, and clicking a frog opens the shared item drawer. Config/presets/marker positions are browser-local for now, so native backup does not include them.
- Recent table UX notes: property-prefixed section labels are required because each property owns Ready Units, Make Ready, Down Units, and Archive sections; Archive is for completed turnover records after move-in while Ready Units remains the ready-to-lease stock area. Table-side filters now supplement Dashboard drilldowns, and the top board toolbar has explicit active/archive/all archive modes instead of an ambiguous archive toggle.
- Vendor compliance expiration is intentionally excluded from dashboard scope because dedicated vendor compliance systems such as NetVendor own that workflow.
- Browser regression coverage includes a display-mode pass across Default, AMOLED, Light, Eye-Strain, and Dyslexia on the core workspaces so broad theme/layout overflow regressions are caught before manual review.

## Plugin / API Ecosystem Foundation

MakeReadyOS now has an admin-only Integrations area for scoped API tokens and webhook endpoint registration. API tokens use bearer auth, are stored as hashes, are shown once on creation, support capability scopes plus optional property scope, and cannot access admin-only management endpoints. Public API and extension contracts are documented in `docs/API.md` and `docs/EXTENSIONS.md`; an expanded OpenAPI 3.1 baseline is served at `GET /api/openapi.json`; examples live under `examples/api/`, `examples/operational-library/`, and `examples/native-backup/`. The OpenAPI contract now covers the high-use item surface plus long-tail operations for floor plans, options, schedule tracks, custom fields, saved views, collaboration/photo/checklist flows, planning, map areas, automations/library packs, admin users, and admin storage metadata. Exact serializers now cover common integration responses for operation metadata, checklist/price-sheet metadata, calendar events, automation run history, operational-library install summaries, API tokens, webhook endpoints, and webhook delivery attempts. Repository JSON Schemas now document the `makereadyos.libraryPack` and `makereadyos.backup` file-exchange envelopes. Webhook endpoints store encrypted signing-secret material, support signed dry-run payloads, queue subscribed item/comment/checklist/vendor/risk events, and `./run-webhooks.sh` performs explicit HMAC-signed delivery with timeout, bounded retry/backoff, optional endpoint auto-disable through `WEBHOOK_AUTO_DISABLE_FAILURES`, and optional private/local URL blocking through `WEBHOOK_ALLOW_PRIVATE_URLS=false` plus `WEBHOOK_ALLOWED_HOSTS`.

## Stabilization Documentation

Feature expansion is paused for a stabilization/documentation pass. Current maintainability docs are `docs/ARCHITECTURE_INVENTORY.md`, `docs/FEATURE_STATUS.md`, `docs/UX_DEBT.md`, `docs/TECH_DEBT.md`, `docs/RELEASE_CHECKLIST.md`, and the refreshed `docs/ROADMAP.md`. `doctor.sh` performs lightweight local environment and repository sanity checks before deeper build/test runs.

## Production Hardening Notes

- Prisma now has an initial versioned migration under `apps/api/prisma/migrations/`; use `db:migrate` for development schema changes and `db:deploy` for deployed environments.
- Docker startup attempts migration deploy before falling back to `db push` for early-development volume compatibility.
- Heavy frontend workspaces, Kanban, Schedule, Setup, Fields, and the item drawer are lazy-loaded to reduce the initial Vite bundle pressure while preserving the table-first shell.
- The Vite build splits React, React Query, and vendor modules into explicit chunks; the previous oversized main app chunk warning is currently resolved.
- `GET /api/make-ready-items` supports bounded item queries, server-side coarse structured board filters, risk-category drilldown filters, active custom-field filters, deterministic sort parameters, and pagination metadata headers including `x-next-offset` while keeping the legacy array response. The web board now has an opt-in local Windowed Loading mode that requests bounded slices and grows by fixed pages while the default remains the full dense board stream. Custom-field predicates validate active field/option references and narrow through indexed `CustomFieldValue.customFieldId` lookups before final item pagination.
- `backup-uploads.sh` and `restore-uploads.sh` cover local attachment/photo/property-map bytes; PostgreSQL dumps alone are not complete disaster recovery.
- Upload bytes default to Docker's `uploads_data` volume mounted at `/app/uploads`. Operators can set `UPLOADS_HOST_PATH` to an absolute host/NAS path while keeping `UPLOAD_DIR=/app/uploads`; `move-uploads.sh` copies current upload bytes into the new path and logs the migration.
- Admin storage UI now exposes current upload storage mode/path, current write/free-space status, upload limit mode, bundled proxy behavior, per-property upload subfolder routing, and a host/NAS path validator that generates backup, dry-run, move, `.env`, and restart commands. `route-existing-uploads.sh` can dry-run/apply existing root-level upload moves into configured property subfolders while updating database paths. `MAX_UPLOAD_MB=0` disables MakeReadyOS' app-level per-file cap for high-resolution phone/HDR photos, while external proxies, disk space, and browser memory can still limit uploads. The storage UI remains a safety assistant rather than a silent Docker remount mechanism; activation still requires `UPLOADS_HOST_PATH` and a Compose restart.
- API token requests have a configurable in-memory per-token limiter for single-node deployments.
- OpenAPI remains intentionally conservative for newly added routes until they are integration targets, but request/query component schemas now come from route validators, major response envelopes are documented, and common long-tail operational/admin responses have exact serializers. Future route-specific serializer work and webhook delivery-health polish remain tracked in `docs/API_SPEC_PLAN.md` and `docs/WEBHOOK_DELIVERY_PLAN.md`.

## Analytics And Unit History Foundation

- Unit history is exposed through `GET /api/units/:id/history` and is derived from existing make-ready records, audit/activity, comments, attachments, checklist completion, vendor assignments, lifecycle dates, automation runs, and current risk state.
- Turn history is currently derived from make-ready items linked to a unit; it reports prior/current turns, dates, days vacant, turn duration, risk level, assigned tech, vendor count, and checklist completion percentage without duplicating operational source data.
- `PropertyDailyMetricSnapshot` stores lightweight property/day rollups for trend panels. `./run-analytics-snapshot.sh` upserts those snapshots through Docker Compose and writes timestamped logs under `logs/`.
- Dashboard now has a lightweight analytics panel for average days vacant, average turn duration, completed turns, ready-date misses, stale-risk counts, category counts, trends, and recurring issue signals.
- Native JSON transfer includes property operating calendars and property risk policies but intentionally excludes daily analytics snapshots because they are derived; PostgreSQL disaster-recovery dumps include snapshots. See `docs/ANALYTICS_AND_HISTORY.md`.

## Workload Planning Foundation

- Planning adds `WorkAssignmentBlock` for in-house scheduled work. Legacy capacity/hour fields still exist for compatibility, but the UI does not use estimated hours because emergencies, parts, and vendor timing make that unreliable.
- `/api/planning` returns scoped planning blocks, unscheduled work, scheduled coverage, and move-ins not covered by in-house work.
- The Planning tab is a form/list foundation, not a drag/drop scheduler. Managers/admins create and replan blocks; assigned staff can update execution status.
- My Work includes active planning blocks, the item drawer shows an In-House Planning summary, Dashboard exposes planned assignment/uncovered move-in KPIs, and risk evaluation includes `PLANNING_RISK`.
- Native transfer excludes planning blocks for now because users are excluded; PostgreSQL backups preserve them. See `docs/WORKLOAD_PLANNING.md`.

## Refrigerant Tracking Foundation

- Refrigerant is now a first-class workspace with Overview, Virgin Tanks, Clean Recovery, Dirty Recovery, Unit History, and Exports tabs.
- The backend uses `RefrigerantType`, `RefrigerantCylinder`, `RefrigerantTransaction`, and `RefrigerantLeakFlag`.
- Default refrigerant types are seeded: R22, R410A, R454B, R32, and R134a.
- Virgin charges calculate `startWeight - endWeight`; recovery events calculate `endWeight - startWeight`.
- Empty virgin cylinders move to `EMPTY_PENDING_RECOVERY` until final recovery is logged, then they can be archived.
- Repeated additions create leak-review flags, and recovery tanks show 80/90/95 percent capacity warnings.
- Native backup/transfer includes refrigerant types, cylinders, transactions, and leak flags. CSV export is available; PDF/Excel reporting remains a later reporting enhancement.

## Property / Board Templates Foundation

- `PropertyTemplate` stores versioned `makereadyos.propertyTemplate` manifests for reusable property setup.
- Admins/managers can preview and create templates from accessible properties; templates can include board sections, option sets, custom fields/options, floor plans, schedule tracks, shared saved views/dashboard presets, checklist templates, and structured automations.
- Applying a template is dry-run/merge-first and duplicate-safe; new-property creation from a template is admin-only, and installed automations stay disabled unless explicitly enabled.
- Templates intentionally exclude live turns, units, resident/private data, comments, attachments, users, tokens, sessions, audit history, and unit history.
- Native backup includes property template manifests, and operational library packs can carry property templates as data-only reusable setup. See `docs/PROPERTY_TEMPLATES.md`.
- Frontend regression polish keeps the dense top toolbar compact by horizontally scrolling crowded workspace/filter controls, adds local section navigation inside the Automation workspace, widens the operational item drawer slightly, raises column-header menu stacking so popovers are not clipped by sticky table cells, and extends browser coverage for map marker links into the shared item drawer.
- Current UI hardening keeps Schedule Sunday-first with visible today/past-day states, makes sticky table utility/identity columns opaque to prevent scroll bleed-through, and uses responsive workload-planning form columns so select controls do not overlap.
- Light-theme QA now reinforces calendar grid lines, table sticky columns, Kanban cards, activity/admin table contrast, status/risk pills, checkbox chips, warning/success/error messages, drawer surfaces, planning forms, and integrations/setup labels so the warm light palette remains readable across operational screens. Eye-Strain and Dyslexia remain density-safe overlays on the selected theme rather than replacement themes.
- Schedule setup now includes manager/admin preset buttons for common NTV, Vacated, Make Ready, Move-In, and Flooring tracks. Presets use existing metadata, stay disabled when the matching source is already configured or unavailable, and do not change stable field keys.
- Calendar panels now show lightweight track guidance derived from rendered events: enabled risk cues, weekend items, crowded days with 3+ events, and high-risk scheduled work. Property operating calendars now persist no-weekend/no-edge-day/daily-limit guardrails, but automatic date movement still requires a future safe business-day offset action.
- Calendar day cells now add explicit badges for weekend, Monday/Friday, crowded-day, high-risk, and overdue schedule conditions so operators can see planning conflicts on the date itself without relying only on color.

## Unit directory and occupancy foundation

Properties can store an occupancy goal percentage. Units can store occupancy status, building, area, floor, and budgeted-unit metadata independently from active make-ready records. Setup supports merge-style paste/file import for comma-delimited or tab-delimited unit directories and availability reports, including common column aliases and preview counts before writing. Sparse imports are supported for files that only include unit, floor plan, and square footage; missing columns are ignored on existing units instead of wiping known metadata. Dashboard surfaces occupancy percentage, goal, total/occupied units, ready stock, and availability-report statuses. Local RealPage unit-directory and availability samples under ignored `reference/` were inspected for structure only: unit directories commonly include detail plus floor-plan/occupancy summary sheets, while availability PDFs are status-section snapshots where section headings drive status mapping. Public docs now capture this structure without copying resident/private row data.
