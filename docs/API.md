# MakeReadyOS API

MakeReadyOS exposes a JSON API for self-hosted integrations. Browser users authenticate with HttpOnly cookie sessions. External integrations should use scoped API tokens.

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
- `GET /api/make-ready-items?propertyId=&includeArchived=&limit=&offset=`
- `POST /api/make-ready-items`
- `PATCH /api/make-ready-items/:id`
- `POST /api/make-ready-items/:id/comments`
- `GET /api/dashboard`
- `GET /api/activity?limit=&offset=`
- `GET /api/vendors`
- `GET /api/property-maps`

Admin-only token management remains session-only:

- `GET /api/admin/integrations`
- `POST /api/admin/integrations/api-tokens`
- `POST /api/admin/integrations/api-tokens/:id/revoke`

## Pagination

Endpoints that can grow large use `limit` and `offset` where implemented. Keep integrations conservative and avoid polling large unbounded datasets.

`GET /api/make-ready-items` currently preserves its legacy array response body and exposes pagination metadata as response headers:

- `x-total-count`
- `x-limit`
- `x-offset`
- `x-has-more`

Other newer collection endpoints may return a `pagination` object in the JSON body.

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
- Webhook delivery is scaffolded in the database/UI but not dispatched yet.
- OpenAPI generation is planned in [API_SPEC_PLAN.md](API_SPEC_PLAN.md); webhook delivery requirements are documented in [WEBHOOK_DELIVERY_PLAN.md](WEBHOOK_DELIVERY_PLAN.md).
