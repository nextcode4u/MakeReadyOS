# MakeReadyOS API

MakeReadyOS exposes a JSON API for self-hosted integrations. Browser users authenticate with HttpOnly cookie sessions. External integrations should use scoped API tokens.

## OpenAPI Contract

An OpenAPI 3.1 contract is available from a running instance:

```bash
curl http://localhost:4000/api/openapi.json
```

The contract includes the stable handwritten path surface, generated component schemas for the Zod validators used by the route layer, file-exchange schemas such as `NativeBackup`, and response-envelope schemas for public surfaces. Generated request/query schemas are intentionally named with their route purpose, for example `MakeReadyCreateRequest`, `UnitImportRequest`, `WebhookCreateRequest`, and `OperationalLibraryPack`. Response schemas use names such as `MakeReadyItemResponse`, `VendorAssignmentsResponse`, `AutomationRunsResponse`, `OperationalLibraryInstallSummary`, `WebhookEndpoint`, and `AuthSessionResponse`.

The contract documents the stable integration surface: auth shape, API-token security, core make-ready item endpoints, operations setup, custom fields, saved views, comments/attachments, dashboard/analytics/risk summaries, planning, vendors, maps, activity, notifications, property templates, automation/operational-library routes, backup transfer, admin user/storage metadata, and admin integration registration. It is intentionally conservative; route-specific docs in this file remain the source of operational detail where an endpoint has more filters or workflow-specific behavior than the baseline contract describes.

JSON contracts intended for file exchange are also published in the repository:

- [`docs/schemas/makereadyos-library-pack.schema.json`](schemas/makereadyos-library-pack.schema.json)
- [`docs/schemas/makereadyos-native-backup.schema.json`](schemas/makereadyos-native-backup.schema.json)

## API Token Auth

Admins create tokens in `Admin -> Integrations`. Tokens are shown once, stored only as SHA-256 hashes, and can be revoked without deleting audit history.

Use:

```bash
curl -H "Authorization: Bearer $MAKEREADYOS_TOKEN" \
  http://localhost:4000/api/make-ready-items
```

API token requests do not use CSRF headers. Cookie-session requests still require the normal CSRF protection for writes.

## Scopes

- `read:items`: read make-ready items, metadata, and saved views.
- `write:items`: create/update/archive make-ready items.
- `write:comments`: create item comments and upload item attachments.
- `read:vendors`: read vendors and vendor assignments.
- `write:vendors`: manage vendors and vendor assignments.
- `read:dashboard`: read dashboard summaries.
- `read:activity`: read activity logs allowed by the token/user scope.
- `read:maps`: read property map and unit-location data.
- `read:library`: read operational library data.
- `write:library`: manage operational library imports where allowed.

Tokens can also be scoped to specific properties. Property scope is an additional restriction; it does not bypass normal role/property permissions for the user who created the token.

## Core Endpoints

- `GET /api/meta`
- `GET /api/operations/properties`
- `GET /api/operations/units?propertyId=`
- `GET /api/operations/board-sections?propertyId=`
- `GET /api/operations/options?fieldKey=`
- `GET /api/operations/floor-plans?propertyId=`
- `GET /api/operations/schedule-tracks`
- `GET /api/operations/operating-calendars`
- `GET /api/custom-fields`
- `GET /api/saved-views`
- `GET /api/make-ready-items?propertyId=&boardSection=&vacancyStatus=&assignedTech=&riskCategory=&moveInWindow=&sortBy=&sortDirection=&includeArchived=&limit=&offset=`
- `POST /api/make-ready-items`
- `PATCH /api/make-ready-items/:id`
- `POST /api/make-ready-items/batch`
- `POST /api/make-ready-items/:id/comments`
- `GET /api/make-ready-items/:id/collaboration`
- `GET /api/charge-price-sheet-items?propertyId=`
- `GET /api/checklist-templates`
- `GET /api/my-work`
- `GET /api/dashboard`
- `GET /api/analytics/summary`
- `GET /api/risk/items`
- `GET /api/planning`
- `GET /api/planning/blocks`
- `GET /api/planning/capacities`
- `GET /api/activity?limit=&offset=`
- `GET /api/notifications?limit=&offset=&unreadOnly=`
- `GET /api/vendors`
- `GET /api/property-maps`
- `GET /api/property-map-areas?propertyId=&mapId=`
- `GET /api/unit-map-locations`
- `GET /api/property-templates`
- `GET /api/automations`
- `POST /api/automations/preview`
- `GET /api/operational-library/packs`

Admin-only token management remains session-only:

- `GET /api/admin/integrations`
- `GET /api/admin/users`
- `GET /api/admin/properties`
- `GET /api/admin/storage`
- `POST /api/admin/integrations/api-tokens`
- `POST /api/admin/integrations/api-tokens/:id/revoke`
- `POST /api/admin/integrations/webhooks`
- `POST /api/admin/integrations/webhooks/:id/test-payload`
- `GET /api/admin/integrations/webhooks/:id/deliveries?limit=&offset=`
- `GET /api/admin/integrations/webhooks/:id/health`

The Admin Integrations UI exposes webhook health, attempt/failure counts, recent delivery attempts, signed dry-run payload creation, and queued test payload creation. Queued attempts are delivered only by `./run-webhooks.sh`.

## Pagination

Endpoints that can grow large use `limit` and `offset` where implemented. Keep integrations conservative and avoid polling large unbounded datasets.

`GET /api/make-ready-items` currently preserves its legacy array response body and exposes pagination metadata as response headers:

- `x-total-count`
- `x-limit`
- `x-offset`
- `x-has-more`
- `x-next-offset`

Other newer collection endpoints may return a `pagination` object in the JSON body.

High-use board filters can be pushed into the item query for integrations that need bounded slices instead of full board exports. Supported filters include property, section/group, board-section type, vacancy, assignee, scope, make-ready status, risk level, risk category, move-in window, updated-since, active custom-field filters, and common operational flags such as overdue, missing dates, pest issues, flooring needed, paint needed, and move-in risk. Item queries also support deterministic bounded sorting through `sortBy` and `sortDirection`; valid sort fields include `boardGroup`, `unitNumber`, `moveInDate`, `makeReadyDate`, `vacatedDate`, `flooringDate`, `daysVacant`, `riskScore`, `riskLevel`, `assignedTech`, `updatedAt`, and `createdAt`. Custom-field filters are passed as a JSON-encoded `customFieldFilters` array using the same operators as saved views; the API validates active field/option references and narrows through custom-field value indexes before returning the paged item array.

## Error Format

Errors return JSON:

```json
{ "message": "Property access denied" }
```

Use HTTP status codes for programmatic handling.

## Examples

Runnable examples live under:

- `examples/api/curl/`
- `examples/api/node/`

Set `MAKEREADYOS_URL` and `MAKEREADYOS_TOKEN` before running them.

## Security Notes

- Tokens are never shown again after creation.
- API token requests are protected by a basic configurable per-token limiter. Tune `API_TOKEN_RATE_LIMIT_MAX` and `API_TOKEN_RATE_LIMIT_WINDOW_MINUTES` for the deployment, and keep an internet-facing instance behind a trusted reverse proxy.
- Token hashes, password hashes, sessions, CSRF tokens, and secrets are not included in native transfer exports.
- Do not create broad write tokens unless an integration genuinely needs them.
- New webhook endpoints store the signing secret encrypted at rest so queued deliveries can be HMAC-signed. Older endpoints without encrypted secrets must be recreated or rotated before delivery can be enabled.
- Admins can create signed dry-run webhook payloads with `/api/admin/integrations/webhooks/:id/test-payload`; pass `{"enqueue": true}` to queue that same test payload for the explicit `./run-webhooks.sh` delivery runner.
- Subscribed application events are queued for item create/update/assignment/archive/restore, risk-level changes, comment creation, attachment create/delete, checklist completion, and vendor assignment changes.
- Webhook health is available through `/api/admin/integrations/webhooks/:id/health` and includes aggregate status counts, event counts, pending work, latest failure metadata, and a coarse `READY`/`PENDING`/`FAILING`/`DISABLED` state.
- Webhook delivery is script-driven, not an always-running worker. `./run-webhooks.sh` processes queued delivery attempts with bounded batch size, HTTP timeout, retry/backoff, delivery history, optional endpoint auto-disable after repeated consecutive failures, and optional private/local URL blocking for public deployments. Tune `WEBHOOK_DELIVERY_BATCH_SIZE`, `WEBHOOK_DELIVERY_TIMEOUT_MS`, `WEBHOOK_DELIVERY_MAX_ATTEMPTS`, `WEBHOOK_AUTO_DISABLE_FAILURES`, `WEBHOOK_ALLOW_PRIVATE_URLS`, and `WEBHOOK_ALLOWED_HOSTS`.
- The current OpenAPI path list is still intentionally conservative, but request/query component schemas are generated from shared route validators where they exist. Common long-tail integration responses now have exact serializers for options, floor plans, schedule tracks, checklist/price-sheet metadata, automation run history, operational library installs, API tokens, webhook endpoints, and webhook delivery attempts. Remaining route-specific serializers are tracked in [API_SPEC_PLAN.md](API_SPEC_PLAN.md); webhook delivery behavior is documented in [WEBHOOK_DELIVERY_PLAN.md](WEBHOOK_DELIVERY_PLAN.md).
