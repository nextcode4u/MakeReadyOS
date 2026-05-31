# Technical Debt

## Database Migration Strategy

The project now has an initial versioned Prisma migration and package scripts for `db:migrate` and `db:deploy`.

Remaining work: stop relying on the Docker `db push` fallback once existing early-development volumes have been migrated or reset, and require backup-before-migrate discipline for release upgrades.

## Vite Bundle Growth

Heavy operational workspaces, Kanban, Schedule, Fields, Setup, and the item drawer are lazy-loaded from the main app shell. The web build also separates React, React Query, and vendor code into explicit chunks, which removed the previous Vite main chunk-size warning.

Remaining work: inspect production bundle composition after more growth and split shared chart/editor utilities if Vite warnings return.

## Client-Side Filtering Limits

Structured filters are rich. High-use board filters, risk-category filters, active custom-field filters, and deterministic sort parameters now flow to `GET /api/make-ready-items`; custom-field predicates use indexed value lookup before item pagination. Some compound derived filters and full incremental board paging still run client-side after fetching the active board stream.

Next step: move remaining compound derived filters and the frontend board stream itself to cursor/windowed loading when the table can preserve sticky groups, keyboard editing, and batch selection with partial pages. If very large custom-field datasets expose slow JSON comparisons, add generated typed shadow columns for high-use custom field values rather than changing stable field keys.

## Server-Side Pagination

Activity, notifications, comments, attachments, automation history, and item APIs expose limits. The main board still needs a stronger cursor/windowing strategy for very large portfolios.

## Table Virtualization Deferred

Virtualization is not implemented because sticky utility columns, group rows, inline editing, and add-item rows make it risky.

Next step: prototype virtualization behind a feature flag with keyboard/editing tests.

## Local Upload Volume

Attachments and property maps are stored locally. PostgreSQL backup alone does not preserve those files.

Upload backup and restore helpers exist for the Docker upload volume.

Remaining work: document optional off-host rsync/restic examples for larger deployments.

## Webhook Event Queue Depth

Webhook endpoints can be registered, signed dry-run/queued test payloads can be recorded, subscribed item/comment/checklist/vendor/risk events are queued, and `./run-webhooks.sh` can deliver queued attempts with HMAC signatures, timeout, retry/backoff, optional endpoint auto-disable, and optional private/local URL blocking for public deployments. Remaining gaps are deeper endpoint health UI and broader event coverage as modules expand. See `docs/WEBHOOK_DELIVERY_PLAN.md`.

## OpenAPI Generation Depth

A lightweight static OpenAPI baseline is served at `/api/openapi.json` and covered by smoke tests. Remaining work is to deepen it with generated request/response schemas from route validation rather than maintaining broad static operation stubs by hand. See `docs/API_SPEC_PLAN.md`.

## API Token Rate Limiting

API token scopes are enforced and token requests now have a basic in-memory per-token limiter.

Remaining work: move rate limits to Redis/PostgreSQL or a trusted reverse proxy for multi-replica deployments.

## Offline Sync Missing

The app is self-host friendly but not offline-capable. Mobile field use in weak-signal areas needs a dedicated sync design.

## Importer Boundaries

Native MakeReadyOS transfer is implemented. Legacy spreadsheet import remains intentionally deferred and should require careful private-data handling.

## Test Runtime

The smoke/E2E suite is broad and can take time. CI should keep fast checks mandatory and heavier browser flows manual or scheduled unless optimized.
