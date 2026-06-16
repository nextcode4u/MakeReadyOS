# Extension Contracts

MakeReadyOS currently supports safe JSON-based extension points. It does not execute arbitrary plugin code.

## Supported Today

- API integrations through scoped bearer tokens.
- Operational library packs using `makereadyos.libraryPack` JSON.
- Native MakeReadyOS backup/transfer files using `makereadyos.backup` JSON.
- Webhook endpoint registration plus explicit signed test delivery through `./run-webhooks.sh`.
- Admin-visible webhook health and delivery history for queued, delivered, failed, gave-up, and dry-run attempts.

## Future-Safe Contracts

The following are planned extension surfaces, but they are not runtime plugin execution:

- dashboard widget definitions
- automation templates
- import adapters
- webhook delivery handlers
- packaged operational workflow libraries

## Operational Library Pack Format

Library packs are versioned JSON. The published schema is available at:

- [`docs/schemas/makereadyos-library-pack.schema.json`](schemas/makereadyos-library-pack.schema.json)
- [`examples/operational-library/sample-library-pack.json`](../examples/operational-library/sample-library-pack.json)

```json
{
  "format": "makereadyos.libraryPack",
  "version": 1,
  "packKey": "example-make-ready-pack",
  "name": "Example Pack",
  "description": "Adds safe workflow configuration.",
  "category": "Make Ready",
  "items": {
    "customFields": [],
    "optionSets": [],
    "checklistTemplates": [],
    "automationTemplates": [],
    "scheduleTracks": [],
    "savedViews": [],
    "propertyTemplates": []
  }
}
```

Imported automations are structured JSON only and must remain disabled until explicitly enabled. Packs must not contain JavaScript or executable payloads.

Use `packKey` and each item `key` as stable identifiers. Display names can change, but keys should remain stable so imports stay duplicate-safe.

See `examples/operational-library/sample-library-pack.json`.

## Native Backup Contract

Native transfer files are also versioned JSON. The published schema and minimal example are available at:

- [`docs/schemas/makereadyos-native-backup.schema.json`](schemas/makereadyos-native-backup.schema.json)
- [`examples/native-backup/minimal-backup.json`](../examples/native-backup/minimal-backup.json)

Native backup JSON is for MakeReadyOS-to-MakeReadyOS operational transfer. It is not a disaster-recovery backup because uploaded photo/map/document bytes, credentials, sessions, and audit logs are excluded.

## Webhooks

The current release stores webhook endpoint configuration:

- name
- URL
- event types
- generated secret hash plus encrypted signing secret for future HMAC delivery
- property scope
- enabled/disabled state
- dry-run, queued, delivered, failed, and gave-up delivery attempt history

Delivery is intentionally script-driven. Admins can generate a signed dry-run payload to validate headers and payload shape, or queue a signed test payload for `./run-webhooks.sh`. Core application writes also queue subscribed events for make-ready items, risk-level changes, comments, attachments, checklist completion, vendor assignment changes, Projects records, Pest issues, Preventive Maintenance templates/tasks, Pool Log entries, and Lease Compliance issue lifecycle changes. The runner HMAC-signs payloads, applies a short timeout, retries with bounded backoff, records delivery attempts, optionally disables endpoints after repeated consecutive failures, can reject private/local webhook targets for public deployments, and never blocks the primary user action.

Initial event names:

- `item.created`
- `item.updated`
- `item.assigned`
- `item.risk.changed`
- `comment.created`
- `vendor.assignment.updated`
- `checklist.completed`
- `project.record.created`
- `project.record.updated`
- `project.record.archived`
- `pest.issue.created`
- `pest.issue.updated`
- `pest.issue.archived`
- `pm.template.created`
- `pm.template.updated`
- `pm.task.completed`
- `pm.task.skipped`
- `pool.entry.created`
- `lease.issue.created`
- `lease.issue.updated`
- `lease.issue.resolved`
- `lease.issue.archived`

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
- Use `GET /api/openapi.json` on a running instance for the baseline machine-readable API contract, then check [API.md](API.md) for workflow-specific filter and pagination notes.

## Adding Operational Library Packs

- Start from `examples/operational-library/sample-library-pack.json`.
- Use safe structured automations only.
- Do not include JavaScript.
- Do not include private resident data.
- Keep templates disabled unless a user explicitly enables them after install.
