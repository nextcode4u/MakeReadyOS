# Performance And Scale

## Current Hardening

MakeReadyOS remains table-first while preparing for larger operating datasets:

- `GET /api/make-ready-items` accepts optional `propertyId`, `boardGroup`/`section`, `boardSection`, `vacancyStatus`, `assignedTech`, `scopeLevel`, `makeReadyStatus`, `riskLevel`, `riskCategory`, `moveInWindow`, high-use operational flags, `updatedSince`, `includeArchived`, `sortBy`, `sortDirection`, `limit`, and `offset` parameters and returns pagination metadata through `x-total-count`, `x-limit`, `x-offset`, `x-has-more`, and `x-next-offset` headers while preserving the legacy array body.
- Explicit property item queries are checked against property permissions before execution.
- Notifications expose bounded page metadata; Activity and automation run history remain paged.
- Item-drawer collaboration bounds comments, attachments, and checklist instances and reports totals.
- Database indexes target high-use property/section/archive, assignment, vacancy/date/update, custom-field value lookup, collaboration, attachment, and checklist-completion access patterns.
- Operational library install history has lightweight pack-key and item provenance indexes; installed operational items continue to use their normal table indexes.
- Client list derivations are memoized where they grow with board size, board text filtering is deferred while typing, and the table/Kanban/Schedule stream now sends coarse structured filters, risk-category filters, and active custom-field filters to the API instead of always filtering the entire active dataset in the browser. Server-side sort parameters and `x-next-offset` back an opt-in browser-local Windowed Loading mode that fetches bounded board slices and grows by fixed pages. The default remains the full dense board stream so existing spreadsheet operations are not changed unexpectedly.
- Custom-field filters validate active field definitions and select options, then narrow through indexed `CustomFieldValue.customFieldId` lookups before final item pagination/counting. Operators that require absence checks still compare against the scoped item set, but positive text/status/date/number/user filters no longer scan every board item first.
- Large secondary workspaces such as Dashboard, Vendors, Maps, Frog Pond, Automations, Admin/Integrations, Activity, My Work, Planning, Setup, Fields, Kanban, Schedule, and the item drawer are lazy-loaded so the initial board shell does not pull every operational surface into the first Vite chunk.
- The production web build also separates React, React Query, and other vendor modules into explicit Vite chunks. This removed the previous oversized main app chunk warning while preserving the table-first startup shell.
- API token calls are protected by a database-backed per-token rate limiter controlled by `API_TOKEN_RATE_LIMIT_MAX` and `API_TOKEN_RATE_LIMIT_WINDOW_MINUTES`, so the cap is shared across API replicas instead of being process-local.
- Historical analytics use a small property/day snapshot table instead of repeatedly scanning all historical turn data for trend charts.
- Workload planning reads are windowed by planned date and indexed by property/user/date so the foundation can scale before a full scheduling engine exists.

## Migration Strategy

The project now includes an initial versioned Prisma migration under `apps/api/prisma/migrations/`. Use `npm --prefix apps/api run db:migrate` when developing schema changes and `npm --prefix apps/api run db:deploy` for deployed environments.

`db:push` remains available only as a fallback for disposable local databases and existing early-development Docker volumes. Production upgrades should use versioned migrations and a PostgreSQL backup before deployment.

## Attachment Safety

Local uploads are stored in `UPLOAD_DIR` inside the API container. Docker deployments should keep `UPLOAD_DIR=/app/uploads`; the host-side storage can stay on Docker's `uploads_data` volume or move to a dedicated host/NAS path through `UPLOADS_HOST_PATH`. Uploads:

- can be capped with `MAX_UPLOAD_MB`, or left uncapped at the MakeReadyOS API layer with `MAX_UPLOAD_MB=0`
- pass through the bundled nginx container without a body-size cap; external reverse proxies may still need explicit large-upload settings
- require authenticated write permission to the item's property
- accept operational image, PDF, text/CSV, Word, and Excel extension/MIME combinations only
- use sanitized display filenames and random stored filenames
- require authenticated, property-scoped download access
- return downloads with MIME sniffing disabled

PostgreSQL dumps preserve attachment metadata, not the local file bytes. Back up the uploads volume separately for complete recovery.

Use:

```bash
./backup-uploads.sh
./restore-uploads.sh backups/makereadyos-uploads-YYYYMMDD-HHMMSS.tgz
./move-uploads.sh /mnt/storage/makereadyos-uploads --dry-run
```

alongside database backups when item photos/documents or property map images matter.

## Load Testing

Normal seed data stays small. Generate disposable records in a running non-production Compose deployment with:

```bash
LARGE_SEED_COUNT=500 LARGE_SEED_PREFIX=LOAD ./seed-large.sh
```

The prefix makes matching item generation idempotent. Generated data includes realistic status/date variation and occasional comments, checklist instances, and custom values when available. Every invocation logs to `logs/seed-large-<timestamp>.txt`.

Set `ENABLE_API_TIMING_LOGS=true` for local API development only when request-duration output is useful. Production Compose operation does not enable diagnostic output.

## Deferred Work

The table does not virtualize rows today. It already avoids rendering hidden columns and memoizes key grouping and selection work. Virtualization is deferred until measurements show it is necessary because grouped add-item rows, sticky identity columns, inline keyboard editing, and batch selection require careful virtual-scroll regression coverage.

Future scale work may add cursor-based continuation for the primary board frontend, generated JSON shadow columns for frequently filtered custom-field types if real datasets require it, incremental drawer-history controls, report aggregation, generated OpenAPI route schemas beyond the current static baseline, real application event queueing for the webhook runner, and measured virtualization without changing stable field keys. If new workspaces add another Vite chunk warning, split shared chart/editor utilities before increasing warning thresholds.

## Deployment Checks

`doctor.sh` is the first pass before deployment or upgrade. It checks required docs/scripts, migration files, helper-script syntax, runtime asset isolation, basic env sanity, log/backup directory writability, and warns when local disk space is low. It does not replace real monitoring; production hosts should still track disk, memory, Docker volume growth, PostgreSQL health, and upload backup completion.
