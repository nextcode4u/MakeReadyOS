# Technical Debt

## Database Migration Strategy

The project now has an initial versioned Prisma migration and package scripts for `db:migrate` and `db:deploy`.

Remaining work: stop relying on the Docker `db push` fallback once existing early-development volumes have been migrated or reset, and require backup-before-migrate discipline for release upgrades.

Cleanup gate before removing the fallback:

1. Take a fresh PostgreSQL backup and upload backup from the working dev instance.
2. Reset or replace any drifted local/dev Docker volumes that still require `db push`.
3. Verify a clean `prisma migrate dev --create-only` no longer prompts for reset on the maintained development baseline.
4. Run `npm --prefix apps/api run db:deploy` against a fresh restored database and confirm the app boots without `db push`.
5. Remove the container startup fallback only after the restored-path rehearsal passes and release notes explicitly call out migration-only upgrades.

Until that gate is passed, additive schema work should continue using the current `db:deploy || db:push` container path for compatibility, but releases should still be treated as backup-first operations. `./check-migration-hygiene.sh` now gives a non-destructive read on migration-history status, live-db-vs-schema drift, and applied migration-file checksum mismatches for release rehearsal.

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

## Webhook Event Queue Depth

Webhook endpoints can be registered, signed dry-run/queued test payloads can be recorded, subscribed make-ready/project/pest/PM/pool/lease-compliance/comment/checklist/vendor/risk events are queued, and `./run-webhooks.sh` can deliver queued attempts with HMAC signatures, timeout, retry/backoff, optional endpoint auto-disable, optional private/local URL blocking for public deployments, and admin-visible health diagnostics. Remaining gaps are broader event coverage as future modules prove they need public integration hooks and optional trend reporting if operators need more than the current health summaries. See `docs/WEBHOOK_DELIVERY_PLAN.md`.

## OpenAPI Generation Depth

A lightweight static OpenAPI baseline is served at `/api/openapi.json` and covered by smoke tests. Remaining work is to deepen it with generated request/response schemas from route validation rather than maintaining broad static operation stubs by hand. See `docs/API_SPEC_PLAN.md`.

## API Token Rate Limiting

API token scopes are enforced, token requests now use a shared PostgreSQL-backed per-token limiter, and the Integrations UI now shows per-token use counts, last-used request metadata, and the live configured token rate-limit window/cap.

Remaining work: keep internet-facing deployments behind a trusted reverse proxy or edge limiter and add stronger operator-facing diagnostics only if real public traffic justifies them.

## Offline Sync Missing

The app is self-host friendly but not offline-capable. Mobile field use in weak-signal areas needs a dedicated sync design.

## Importer Boundaries

Native MakeReadyOS transfer is implemented. Legacy spreadsheet import remains intentionally deferred and should require careful private-data handling.

## Test Runtime

The smoke/E2E suite is broad and can take time. CI should keep fast checks mandatory and heavier browser flows manual or scheduled unless optimized.
