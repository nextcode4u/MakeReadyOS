# Technical Debt

## Database Migration Strategy

The project now has an initial versioned Prisma migration and package scripts for `db:migrate` and `db:deploy`.

Remaining work: stop relying on the Docker `db push` fallback once existing early-development volumes have been migrated or reset, and require backup-before-migrate discipline for release upgrades.

## Vite Chunk-Size Warning

Heavy operational workspaces are lazy-loaded from the main app shell.

Remaining work: inspect production bundle composition after more growth and split shared chart/editor utilities if Vite warnings return.

## Client-Side Filtering Limits

Structured filters are rich, but many filter operations still run client-side after fetching operational data.

Next step: move high-cardinality filters and pagination deeper into API query support.

## Server-Side Pagination

Activity, notifications, comments, attachments, automation history, and some item APIs have limits. The main board still needs a stronger server-side pagination/windowing strategy for very large portfolios.

## Table Virtualization Deferred

Virtualization is not implemented because sticky utility columns, group rows, inline editing, and add-item rows make it risky.

Next step: prototype virtualization behind a feature flag with keyboard/editing tests.

## Local Upload Volume

Attachments and property maps are stored locally. PostgreSQL backup alone does not preserve those files.

Upload backup and restore helpers exist for the Docker upload volume.

Remaining work: document optional off-host rsync/restic examples for larger deployments.

## Webhook Delivery Worker Missing

Webhook endpoints can be registered, but delivery is scaffolded only. There is no queue, retry, timeout, HMAC signing, or delivery attempt table yet. See `docs/WEBHOOK_DELIVERY_PLAN.md`.

## OpenAPI Generation Missing

API docs are handwritten. Integrators would benefit from generated OpenAPI/JSON schema docs. See `docs/API_SPEC_PLAN.md`.

## API Token Rate Limiting

API token scopes are enforced and token requests now have a basic in-memory per-token limiter.

Remaining work: move rate limits to Redis/PostgreSQL or a trusted reverse proxy for multi-replica deployments.

## Offline Sync Missing

The app is self-host friendly but not offline-capable. Mobile field use in weak-signal areas needs a dedicated sync design.

## Importer Boundaries

Native MakeReadyOS transfer is implemented. monday.com Excel import remains intentionally deferred and should require careful private-data handling.

## Test Runtime

The smoke/E2E suite is broad and can take time. CI should keep fast checks mandatory and heavier browser flows manual or scheduled unless optimized.
