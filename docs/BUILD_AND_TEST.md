# Build And Test

## Root Scripts

The project keeps root-level scripts for predictable operation across environments:

- `./install-toolchain.sh`
- `./build.sh`
- `./test.sh`
- `./e2e.sh`
- `./backup-db.sh`
- `./backup-uploads.sh`
- `./prune-backups.sh [--dry-run] [--days DAYS]`
- `./restore-db.sh <backup-file>`
- `./restore-uploads.sh <backup-archive>`
- `./move-uploads.sh <absolute-host-path> [--dry-run]`
- `./route-existing-uploads.sh [--apply] [--property-id PROPERTY_ID]`
- `./run-automations.sh`
- `./run-analytics-snapshot.sh`
- `./run-webhooks.sh`
- `./reset-demo.sh [--dry-run] [--yes] [--wipe-uploads] [--with-demo]`
- `./seed-large.sh` for opt-in non-production synthetic workload generation

API integration examples live under `examples/api/`. They expect `MAKEREADYOS_URL` and a scoped `MAKEREADYOS_TOKEN` created from `Admin -> Integrations`. A running instance also exposes an OpenAPI 3.1 contract at `GET /api/openapi.json`; `./test.sh` verifies the contract is parseable, includes expected auth/integration paths, contains generated request schemas from route validators, and documents exact response schemas for common integration targets such as options, floor plans, schedules, automation run history, operational library installs, API tokens, and webhooks.

## Logs

Every build, test, E2E, database backup, upload backup, backup-prune, database restore, upload restore, scheduled automation, analytics snapshot, webhook delivery, and synthetic large-seed invocation writes a timestamped text log to `logs/`.

Examples:

- `logs/build-20260523-210000.txt`
- `logs/test-20260523-210500.txt`
- `logs/backup-db-20260523-220000.txt`
- `logs/backup-uploads-20260523-220000.txt`
- `logs/prune-backups-20260523-220001.txt`
- `logs/restore-db-20260523-221000.txt`
- `logs/restore-uploads-20260523-221000.txt`
- `logs/route-existing-uploads-20260523-221200.txt`
- `logs/automations-run-20260523-221500.txt`
- `logs/analytics-snapshot-20260523-221700.txt`
- `logs/webhooks-run-20260523-221800.txt`
- `logs/reset-demo-20260523-221900.txt`
- `logs/seed-large-20260523-222000.txt`

These logs are ignored by git to avoid repository noise.

## Typical Flow

```bash
./install-toolchain.sh
./build.sh
./test.sh
./e2e.sh
./run-automations.sh
./run-analytics-snapshot.sh
./run-webhooks.sh
```

The web build uses route/workspace-level lazy loading plus explicit React, React Query, and vendor chunks. If Vite reports a future chunk-size warning, inspect whether a new workspace should be lazy-loaded or whether shared chart/editor code should be split before raising the warning threshold.

For database disaster-recovery operations, see [DISASTER_RECOVERY.md](DISASTER_RECOVERY.md). `backup-db.sh` creates an ignored custom-format dump in `backups/`; `backup-uploads.sh` creates a timestamped archive of the Docker upload volume or configured host upload path used for attachments and property maps; `move-uploads.sh` copies existing upload bytes to a new host/NAS path before switching `UPLOADS_HOST_PATH`; `route-existing-uploads.sh` dry-runs or applies root-level file moves into configured property upload subfolders; Admin storage tests also verify per-property new-upload routing metadata; `prune-backups.sh` safely previews or removes expired local dumps; restore scripts require an input path and explicit interactive confirmation. Scheduler setup is documented in [SCHEDULED_BACKUPS.md](SCHEDULED_BACKUPS.md).

## Prisma Migrations

Versioned migrations live under `apps/api/prisma/migrations/`.

Use:

```bash
npm --prefix apps/api run db:migrate
```

when developing schema changes locally, and:

```bash
npm --prefix apps/api run db:deploy
```

for deployed environments. `db:push` remains available only as an early-development fallback for disposable or pre-migration local volumes.

## CI

GitHub Actions runs the same verification path on every push and pull request using Node 20 and a clean checkout.

The CI workflow installs dependencies and runs:

```bash
npm --prefix apps/api audit --omit=dev
npm --prefix apps/web audit --omit=dev
./build.sh
./test.sh
```

If the workflow fails, `logs/` is uploaded as a build artifact.

Full browser E2E is intentionally kept in a separate manual workflow at `.github/workflows/e2e.yml` so the default CI lane stays quick. Run it from the GitHub Actions UI before a release candidate or locally with:

```bash
./e2e.sh
```

`./e2e.sh` installs the Playwright Chromium browser runtime by default. On a fresh Linux machine that still needs OS-level browser dependencies, run `PLAYWRIGHT_INSTALL_DEPS=1 ./e2e.sh`.
The manual GitHub Actions E2E workflow sets `PLAYWRIGHT_INSTALL_DEPS=1` because hosted runners start clean.

## Auth Smoke Checks

`test.sh` now does more than compile verification when Docker is available.

It will:

1. verify `backup-db.sh`, `backup-uploads.sh`, `move-uploads.sh`, `route-existing-uploads.sh`, `prune-backups.sh`, `restore-db.sh`, `restore-uploads.sh`, `run-automations.sh`, `run-analytics-snapshot.sh`, and `seed-large.sh` exist, are executable, and parse cleanly
2. verify restore helpers refuse missing backup paths, prune dry-run/unsafe-path protections work, and `reset-demo.sh` refuses destructive reset without `--yes`
3. validate `docker compose config`
4. start the Compose stack
5. verify `/health`
6. verify unauthenticated access is blocked for protected routes
7. verify a bad login attempt is rejected
8. log in with the seeded admin credentials from `.env` or `.env.example`
9. verify authenticated access to session and board routes
10. verify admin access to `/api/admin/users`, assignment properties, and operations property/unit routes
11. verify property, floor-plan, and unit create/update/archive/restore, managed unit/floor-plan linkage, linked-property delete refusal, and make-ready create/archive/restore hiding behavior
12. verify admin property-template creation, duplicate-safe dry-run apply, native backup export shape including template metadata, invalid import rejection, dry-run summary, and unit-directory import behavior, including sparse unit import updates that do not erase existing metadata
13. verify the admin can query/filter Activity, retrieve the native export audit event, and use the daily manager report endpoints for date/property-scoped operational summaries
14. verify admin automation listing, template catalog/setup requirements/disabled installation, scheduling guard operators, structured rule creation, preview/no-mutation behavior, custom-field condition validation/preview/manual/scheduled execution, invalid condition rejection, scheduled runner cooldown behavior, enable/disable, and run history access
15. create and update a test user and assign property access
16. verify last-admin protection blocks self-demotion
17. verify admin saved-view, built-in option lifecycle, operating-calendar configuration and business-day date offsets, property risk-policy threshold configuration, batch-item lifecycle, item-query limit/filter/sort behavior including server-side structured/risk-category/custom-field filters, indexed custom-field value narrowing, bounded pagination headers, and invalid query rejection, SLA/risk evaluation/summary/items, analytics summary/snapshot/unit-history behavior, workload-planning assignment/coverage behavior, notification/collaboration limits, attachment type rejection, Pool Log setup/entry/report/photo/notification behavior, property-map metadata/upload/location behavior, and custom-field workflows
18. verify logout invalidates the active session
19. log in as the generated manager and verify scoped operations/Activity/Automation access and out-of-property unit/item-query rejection
20. log in with the seeded demo tech user
21. create `LEASING` and `CLEANER` users, verify their allowed field updates, and verify privileged library/management routes stay blocked
22. verify viewer/tech access to operations and other privileged routes is blocked
23. verify tech saved-view restrictions, custom-field restrictions, and operational-library denial
24. verify logout-all invalidates all sessions for the current user
25. tear the stack down

The smoke suite also verifies the integrations foundation: admin token creation, one-time token response behavior, bearer token access, insufficient-scope denial, property-scoped token denial outside scope, token revocation, webhook registration, expanded webhook event metadata including Lease Compliance lifecycle events, signed dry-run webhook payload generation, webhook health summaries, queued webhook delivery processing through `run-webhooks.sh`, and webhook delivery-attempt history.

The smoke run also invokes a three-record synthetic large seed and verifies that dashboard and bounded item responses continue to load. For larger non-production checks:

```bash
LARGE_SEED_COUNT=500 LARGE_SEED_PREFIX=LOAD ./seed-large.sh
```

The script requires a running Compose API service and writes `logs/seed-large-<timestamp>.txt`.

This means the following auth settings must be present for realistic local runs:

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `DEMO_TECH_EMAIL`
- `DEMO_TECH_PASSWORD`
- optional `DEMO_LEASING_EMAIL`/`DEMO_LEASING_PASSWORD`
- optional `DEMO_CLEANER_EMAIL`/`DEMO_CLEANER_PASSWORD`
- `SESSION_COOKIE_SECRET`
- `CORS_ORIGIN`

## Kanban And Saved View Notes

The current test coverage is split between API smoke checks in `test.sh` and browser workflow coverage in `e2e.sh`.

Current saved-view smoke coverage checks:

- admin can list saved views
- admin can create a shared saved view with persisted visible table columns
- tech can list saved views
- tech cannot create a shared saved view

Core management smoke coverage checks:

- admin can create, update, archive, and restore a property and unit
- admin can create, edit, and archive a managed floor plan and link a unit to it
- managed floor-plan assignment carries beds, baths, and square footage from the property plan
- admin can create, edit, and archive a standard board option; unsafe deletion is rejected
- destructive property deletion is rejected when linked inventory exists
- admin can create, archive, and restore a make-ready item and archived items are hidden by default
- admin can archive and restore selected turns through the protected batch endpoint
- manager unit access remains limited to assigned properties
- tech and viewer cannot access property/unit management routes

Custom-field smoke coverage checks:

- admin can list, create, update, reorder, and archive a field definition
- admin can write a custom value to a seeded make-ready item
- tech is blocked from managing definitions or writing custom values

Automation smoke coverage checks:

- admin can list rules, create a structured property-scoped rule, preview stored/draft rules without board mutation, disable it, and query recent run history
- admin can create a scheduled-check rule, run it from `run-automations.sh`, observe matching seeded work, and verify the second run suppresses duplicate activity notes during cooldown
- admin can evaluate active custom status/date fields in preview, manual Run Now, and `run-automations.sh`; incompatible custom operators are rejected
- admin can list seven bundled templates, receive explicit missing-field setup requirements, and install a disabled rule with template provenance
- admin can list, preview, install, and re-install a versioned Operational Library pack; duplicates are skipped and imported automations remain disabled
- admin can create a property template from an existing property and dry-run apply it to an existing property
- manager can install an available template only within assigned property scope; tech and viewer installation attempts are blocked
- `TECH`, `LEASING`, `CLEANER`, and `VIEWER` are blocked from operational-library and property-template management
- invalid draft preview definitions are rejected with a validation response
- manager can list visible rules, preview, and manually run only assigned-property-scoped scheduled work
- tech and viewer users are blocked from automation management and manual execution routes; tech preview denial is exercised directly

Risk smoke coverage checks:

- dashboard responses include risk KPIs and risk breakdowns
- admin/manager can read and update property risk-policy thresholds
- admin/manager can run scoped `POST /api/risk/evaluate`
- risk summary and risk item APIs respect scoped property filters
- native JSON backup includes persisted risk score/level/reasons
- tech users are blocked from manual risk evaluation while retaining normal dashboard/My Work visibility

## Browser E2E Notes

`e2e.sh` runs Playwright against the Dockerized app and currently verifies:

- app loads to sign-in
- seeded admin can log in
- table view renders
- compact mode persists in the browser across reloads
- theme, Eye-Strain, and OpenDyslexic accessibility preferences persist in the browser across reloads
- Kanban view renders
- table details, Kanban cards, and Schedule events open the item inspector, which closes with Escape
- the old saved-view sidebar is absent from the board layout
- the narrow future-module rail renders MakeReadyOS plus placeholder module icons
- admin tab appears for `ADMIN`
- logout button click returns to sign-in
- Kanban drag/drop persists a card move
- saved view create/apply/delete works in-browser, including draggable visible table column order restoration
- table-header display-label editing/reset preserves stable field bindings, and header hide/move controls update the current saved-view-ready column order
- admin user create/update/deactivate/reactivate works in-browser
- admin can create a property, unit, and make-ready item through the `Setup` workspace
- a group `+ Add item` row infers context, creates a unit/turn from a unit number, and selected rows can be batch moved and archived
- the board can opt into windowed loading, request the first bounded slice from the item API, and return to the full board stream
- assigned-tech edits use the active staff selector and configured schedule tracks render updated option-driven legend/color-source guidance
- the table exposes the field shortcut and can add/edit managed status options or create managed floor plans in place
- custom field create and inline board-value editing works in-browser
- active custom text/status/date fields filter the board through type-aware Advanced Filters, display removable chips, restore from saved views, and persist in Kanban/Schedule
- archived custom fields are omitted from the new-filter selector while retained values remain available for historical data
- a custom date field can be installed as a schedule track through Setup and displayed in Calendar
- a property operating calendar can be saved with weekend, Monday/Friday, vendor lead-time, daily-limit, scope-day, and work-start guardrails
- Dark theme selects an AMOLED-black root surface while the warm high-contrast Light token set, calendar grid contrast, activity table contrast, Eye-Strain, and OFL OpenDyslexic preferences persist
- Refrigerant workspace compiles as a lazy frontend module, API build covers tank/transaction routes, and smoke tests verify the documentation is present; deeper regulatory workflow testing should use a real maintenance scenario before production rollout.
- Preventive Maintenance workspace compiles as a lazy frontend module. API smoke tests cover PM template creation, overview/task/history/calendar fetches, attachment upload/download, task completion, CSV/Excel/printable exports, and Property Wiki reference/context integration. Real-property validation should still confirm recurring frequencies, assignment expectations, and evidence requirements against the site's operating routines.
- Pool Log workspace compiles as a lazy frontend module. API smoke tests cover pool/spa setup, chemical library, daily entries, safety checks, chemistry evaluation, CSV export, printable report output, pool photo/PDF upload/download/delete, and review-needed notifications. Browser E2E covers the Pool Log workspace, setup, daily entry creation, report/export controls, history, and pool photo upload. Field validation should still be checked against each property's local pool/spa procedures before production use.
- Projects workspace now compiles as a lazy frontend module. Current build validation covers shell wiring, module-rail access, My Work deep-linking, overview/list/detail rendering, exports, and attachment/comment/task interaction types. Real-property testing should still validate role behavior, recommendation-to-project conversion, project-task assignment expectations, and whether the lightweight map/bids surfaces are sufficient before widening the workflow.
- Display-mode regression coverage cycles core workspaces through Default, AMOLED, Light, Eye-Strain, and Dyslexia modes and fails if the page shell develops obvious horizontal overflow
- Schedule displays NTV terminology and renders an active custom date-field track
- Schedule legends derive from rendered color logic and support responsive multi-calendar layout; browser coverage also checks Sunday-first ordering and current-day highlighting
- notification records can be read and dismissed by their owning user
- item updates, local attachment upload/removal, checklist attachment/completion, notification preferences, and My Work routes are exercised
- vendor tab, vendor creation, and item-drawer vendor assignment are exercised
- the browser verifies drawer collaboration, multi-file attachment upload, staged inspection-gallery metadata, image markup pins, attachment preview/download affordances, checklist execution, My Work, weak-connection messaging, Ctrl/Cmd+K search, and dashboard layout controls
- admin backup/transfer controls render and invalid native import displays an error
- admin Activity tab renders and filters existing audit events
- admin Automation tab renders the structured builder and recent run history
- admin Automation preview renders its explicit no-changes results notice
- admin can run an enabled scheduled check and see a `MANUAL` execution record
- admin can select a custom date field in the Automation builder and preview a typed scheduled condition
- admin can filter the operational template library, preview a template, and install it disabled by default
- demo `TECH` user does not see the admin tab
- cleared session returns the user to sign-in

The E2E script also:

1. sources `.env` or `.env.example`
2. installs the Playwright Chromium runtime if needed, and installs OS browser dependencies only when `PLAYWRIGHT_INSTALL_DEPS=1`
3. resets and starts Docker Compose
4. waits for API and web readiness
5. runs Playwright tests
6. writes a timestamped log to `logs/`

The script sources `.env` when present and falls back to `.env.example` otherwise.

Runtime font QA is bounded intentionally: OpenDyslexic and its `OFL.txt` license live in tracked `assets/fonts/opendyslexic/`; no browser or container build path may serve `reference/` content.

See [PERFORMANCE_AND_SCALE.md](PERFORMANCE_AND_SCALE.md) for query limits, upload validation, diagnostic flags, and the current table virtualization boundary.

## Scheduled Automation Runner

`./run-automations.sh` loads the local environment file, ensures the deployed API container is running, invokes the compiled structured evaluator, and writes `logs/automations-run-<timestamp>.txt`. It evaluates enabled `SCHEDULED_CHECK` rules only and returns nonzero if rule evaluation reports errors.

Configure note deduplication in `.env`:

```bash
AUTOMATION_NOTE_COOLDOWN_HOURS=24
```

Example hourly systemd units are provided at `deploy/examples/makereadyos-automations.service` and `deploy/examples/makereadyos-automations.timer`. Scheduled execution never evaluates user-provided JavaScript.

## Webhook Delivery Runner

`./run-webhooks.sh` loads the local environment file, ensures the deployed API container is running, invokes the compiled webhook delivery runner, and writes `logs/webhooks-run-<timestamp>.txt`. It processes queued delivery attempts with HMAC signatures, a bounded batch size, HTTP timeout, and retry/backoff. It is intentionally script-driven; MakeReadyOS does not keep a long-running webhook worker inside the web/API process.

Configure delivery behavior in `.env`:

```bash
WEBHOOK_DELIVERY_BATCH_SIZE=25
WEBHOOK_DELIVERY_TIMEOUT_MS=5000
WEBHOOK_DELIVERY_MAX_ATTEMPTS=5
WEBHOOK_AUTO_DISABLE_FAILURES=0
WEBHOOK_ALLOW_PRIVATE_URLS=true
WEBHOOK_ALLOWED_HOSTS=
```

Set `WEBHOOK_ALLOW_PRIVATE_URLS=false` for public deployments that should reject webhook endpoints targeting localhost, private networks, link-local addresses, or DNS names resolving to private addresses. `WEBHOOK_ALLOWED_HOSTS` can list explicit trusted exceptions.

## Notes

- The installer currently targets Debian/Ubuntu-style environments with `apt-get`
- The installer provisions `node`, `npm`, `docker`, and the Compose plugin when missing
- The installer upgrades Node to the supported Node 20 runtime when an older major version is present
- If Node 20+, npm, or Docker are already installed, the installer leaves them in place
- `test.sh` validates `docker compose config` when Docker is available
## Dashboard And Workflow Checks

Smoke coverage verifies scoped Dashboard output, saved-view persistence of built-in and custom-field structured filter tokens, board-section rename metadata, built-in column label reset, notification/read-preference endpoints, collaboration/checklist/file endpoints, staged attachment metadata, attachment markup metadata, filtered attachment ZIP export, upload storage settings/host-path validation, vendor CRUD/assignment lifecycle, Preventive Maintenance templates/tasks/reports/wiki references, Pool Log records/report/photos/notifications, Frog Pond runtime asset presence, and backup inclusion of portable item comments/checklist/vendor records while excluding personal notifications and uploaded bytes. Browser coverage verifies Dashboard KPI/chart drilldowns apply visible structured chips, drawer collaboration/photo-gallery metadata/markup/preview/download affordances/vendor work/checklists, Pool Log setup/daily log/history upload flows, Admin upload/NAS storage validation, My Work quick status and keyboard palette surfaces, weak-connection retry messaging, custom filters, table-side configuration, display-mode overflow checks across core workspaces, theme contrast, Kanban controls, map marker/item-drawer links, Frog Pond rendering/config/item-drawer links, automation/library/property-template surfaces, and multi-calendar schedule layouts.

Upload/storage smoke checks also verify that `.env.example` defaults `MAX_UPLOAD_MB=0` and the bundled nginx configuration does not impose a separate body-size cap. Deployments behind an external reverse proxy still need their proxy upload limits configured separately.
