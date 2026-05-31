# API Spec Plan

MakeReadyOS has handwritten API documentation in `docs/API.md` and an expanded OpenAPI 3.1 contract served by the API at `/api/openapi.json`. The contract now combines a conservative handwritten path surface with generated component schemas from shared Zod route validators and reusable response-envelope schemas for major public surfaces, keeping the public integration surface predictable while reducing request-schema drift.

File-exchange contracts are documented separately as repository JSON Schemas:

- `docs/schemas/makereadyos-library-pack.schema.json`
- `docs/schemas/makereadyos-native-backup.schema.json`

## Current Contract Boundary

Stable public integration surfaces are JSON over HTTP with either:

- browser cookie sessions plus CSRF for the web UI
- `Authorization: Bearer <token>` for scoped API/service tokens

Public integration routes should keep:

- stable path names
- JSON request/response bodies
- documented pagination on growing collections
- documented error responses using `{ "message": "..." }`
- scoped authorization checks before data access

## Current OpenAPI Scope

The current baseline covers:

- `GET /health`
- auth/session routes
- `GET /api/meta`
- operations setup paths for properties, units, board sections, floor plans, built-in options, schedule tracks, operating calendars, and column labels
- custom fields and saved views
- make-ready item list/create/update/archive/restore/batch basics
- item comments, collaboration bundles, charge/evidence price-sheet items, checklist templates, and attachment metadata/download/archive routes
- dashboard and analytics summaries
- risk summary/items
- planning summaries, capacities, and work blocks
- vendor directory and assignments
- property maps, property map areas, and unit locations
- activity and notifications
- property templates and template dry-run/apply routes
- automation rules, previews, run history, templates, and operational library packs
- native backup export/import
- admin users, assignable properties, storage configuration metadata, and API token management metadata for admins
- webhook registration, signed test payloads, and delivery history for admins
- generated request/query schemas for core route validators, including make-ready items, operations setup, custom fields, saved views, comments/attachments, automations, API tokens/webhooks, vendors, maps, property templates, planning, risk policies, admin user management, and operational library packs
- reusable response-envelope schemas for major documented paths, including auth sessions, metadata, operations setup, make-ready items, comments/attachments, dashboard/analytics/risk, planning, vendors, maps, activity, notifications, property templates, backup transfer, and integrations
- exact route-specific serializers for common integration targets: board options, floor plans, schedule tracks, operating calendars, checklist templates/instances, charge/evidence price-sheet items, calendar events, planning summaries/capacities, automation rules/templates/run history, operational library pack summaries/install summaries, API tokens, webhook endpoints, and webhook delivery attempts
- native backup request/response envelope schemas for OpenAPI consumers, with deeper file-exchange detail in `docs/schemas/makereadyos-native-backup.schema.json`

The path list intentionally avoids pretending every route is fully schema-complete. It should be expanded whenever an external integration depends on a route not yet represented.

## Implementation Plan

1. Keep `/api/openapi.json` parseable and covered by smoke tests.
2. Continue moving ad hoc validators into exported shared schemas before adding new public routes.
3. Gradually replace any remaining static operation stubs with response schemas when an external integration needs the route.
4. Keep file-exchange JSON Schemas in sync with import validators and sample files.
5. Add examples that reference the spec for pagination and auth behavior.
6. Consider publishing the OpenAPI JSON with GitHub releases after the contract stabilizes.

Do not block operational feature work on full OpenAPI generation, but do not introduce new public integration routes without documenting auth, scopes, pagination, and error behavior.
