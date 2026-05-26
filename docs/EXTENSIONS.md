# Extension Contracts

MakeReadyOS currently supports safe JSON-based extension points. It does not execute arbitrary plugin code.

## Supported Today

- API integrations through scoped bearer tokens.
- Operational library packs using `makereadyos.libraryPack` JSON.
- Native MakeReadyOS backup/transfer files using `makereadyos.backup` JSON.
- Webhook endpoint registration metadata for future signed delivery.

## Future-Safe Contracts

The following are planned extension surfaces, but they are not runtime plugin execution:

- dashboard widget definitions
- automation templates
- import adapters
- webhook delivery handlers
- packaged operational workflow libraries

## Operational Library Pack Format

Library packs are versioned JSON:

```json
{
  "format": "makereadyos.libraryPack",
  "version": 1,
  "name": "Example Pack",
  "description": "Adds safe workflow configuration.",
  "category": "Make Ready",
  "items": {
    "customFields": [],
    "statusOptions": [],
    "checklistTemplates": [],
    "automationTemplates": [],
    "scheduleTracks": [],
    "savedViews": [],
    "dashboardPresets": []
  }
}
```

Imported automations are structured JSON only and must remain disabled until explicitly enabled. Packs must not contain JavaScript or executable payloads.

See `examples/operational-library/sample-library-pack.json`.

## Webhooks

The current release stores webhook endpoint configuration:

- name
- URL
- event types
- generated secret hash
- property scope
- enabled/disabled state

Delivery is intentionally scaffolded for a later queue-backed implementation. When delivery is enabled, payloads should be HMAC-signed, timeout-limited, retried safely, and never block the primary user action.

Initial event names:

- `item.created`
- `item.updated`
- `item.assigned`
- `item.risk.changed`
- `comment.created`
- `vendor.assignment.updated`
- `checklist.completed`

## Runtime Safety

- No arbitrary server-side plugin execution.
- No untrusted JavaScript execution.
- No marketplace behavior yet.
- `reference/` is never a runtime dependency.
- Any runtime asset must live in a committed app asset path such as `assets/` or `apps/web/public/`.

## Adding Extension Surfaces Safely

- Define the JSON contract first and version it.
- Validate all imported data before writing to the database.
- Add dry-run/preview behavior for imports whenever possible.
- Keep stable field keys separate from configurable display labels.
- Preserve existing saved views, automations, native backups, and role permissions.
- Add API token scopes intentionally; do not expose admin-only endpoints to bearer tokens.
- Document included/excluded data, especially secrets and upload bytes.

## Adding API Integrations

- Use scoped API tokens, not browser cookies.
- Request the smallest scope set needed.
- Use property-scoped tokens for property-specific integrations.
- Treat `limit`/`offset` as required for growing datasets.
- Handle JSON error responses with a `message` field.

## Adding Operational Library Packs

- Start from `examples/operational-library/sample-library-pack.json`.
- Use safe structured automations only.
- Do not include JavaScript.
- Do not include private resident data.
- Keep templates disabled unless a user explicitly enables them after install.
