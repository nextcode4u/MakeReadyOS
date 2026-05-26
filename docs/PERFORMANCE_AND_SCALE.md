# Performance And Scale

## Current Hardening

MakeReadyOS remains table-first while preparing for larger operating datasets:

- `GET /api/make-ready-items` accepts optional `propertyId`, `boardGroup`/`section`, `updatedSince`, `includeArchived`, `limit`, and `offset` parameters and returns pagination metadata through `x-total-count`, `x-limit`, `x-offset`, and `x-has-more` headers while preserving the legacy array body.
- Explicit property item queries are checked against property permissions before execution.
- Notifications expose bounded page metadata; Activity and automation run history remain paged.
- Item-drawer collaboration bounds comments, attachments, and checklist instances and reports totals.
- Database indexes target high-use property/section/archive, assignment, vacancy/date/update, collaboration, attachment, and checklist-completion lookups.
- Operational library install history has lightweight pack-key and item provenance indexes; installed operational items continue to use their normal table indexes.
- Client list derivations are memoized where they grow with board size, and board text filtering is deferred while typing.
- Large secondary workspaces such as Dashboard, Vendors, Maps, Frog Pond, Automations, Admin/Integrations, Activity, and My Work are lazy-loaded so the initial board shell does not pull every operational surface into the first Vite chunk.
- API token calls are protected by a basic in-memory per-token rate limiter controlled by `API_TOKEN_RATE_LIMIT_MAX` and `API_TOKEN_RATE_LIMIT_WINDOW_MINUTES`.
- Historical analytics use a small property/day snapshot table instead of repeatedly scanning all historical turn data for trend charts.
- Workload planning reads are windowed by planned date and indexed by property/user/date so the foundation can scale before a full scheduling engine exists.

## Migration Strategy

The project now includes an initial versioned Prisma migration under `apps/api/prisma/migrations/`. Use `npm --prefix apps/api run db:migrate` when developing schema changes and `npm --prefix apps/api run db:deploy` for deployed environments.

`db:push` remains available only as a fallback for disposable local databases and existing early-development Docker volumes. Production upgrades should use versioned migrations and a PostgreSQL backup before deployment.

## Attachment Safety

Local uploads are stored in `UPLOAD_DIR` (`uploads_data` in Docker Compose). Uploads:

- are limited by `MAX_UPLOAD_MB`
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

Future scale work may add cursor paging for the primary board frontend, incremental drawer-history controls, report aggregation, generated OpenAPI contracts, queue-backed webhook delivery, and measured virtualization without changing stable field keys.

## Deployment Checks

`doctor.sh` is the first pass before deployment or upgrade. It checks required docs/scripts, migration files, helper-script syntax, runtime asset isolation, basic env sanity, log/backup directory writability, and warns when local disk space is low. It does not replace real monitoring; production hosts should still track disk, memory, Docker volume growth, PostgreSQL health, and upload backup completion.
