# Property Templates

Property templates let admins and managers save a reusable operational setup from one property and apply it to another property without copying live turnover data.

## Purpose

Use templates when a new property should start with a proven MakeReadyOS setup:

- Board sections such as Ready Units, Make Ready, Down Units, and Archive
- Managed built-in label/option choices
- Custom fields and select/status options
- Property floor-plan definitions when selected
- Schedule tracks
- Shared saved views and dashboard presets
- Checklist templates
- Structured automation rules installed disabled by default

Templates are configuration, not operational history.

## Excluded Data

Templates intentionally do not include:

- Make-ready items or active turns
- Units, residents, applicants, comments, attachments, photos, or unit history
- Audit/activity logs
- Users, sessions, API tokens, passwords, or notification inboxes
- Personal saved views or personal dashboard presets

This keeps templates safe to share between properties and operational library packs.

## Create From Property

`ADMIN` and scoped `MANAGER` users can create a template from an accessible property through the Automation workspace template area or the API.

API routes:

- `POST /api/property-templates/from-property/preview`
- `POST /api/property-templates/from-property`

The preview route returns counts and warnings only. It does not save a template.

## Apply To Property

Templates can be applied in merge mode to an existing property, or to a new property when the user is an `ADMIN`.

API route:

- `POST /api/property-templates/:id/apply`

Supported behavior:

- `dryRun: true` previews created, skipped, conflict, and error counts.
- `mode: "merge"` is the only supported mode.
- Existing matching configuration is skipped rather than overwritten.
- New-property creation from templates is admin-only.
- Automation rules are installed disabled unless `enableAutomations: true` is explicitly sent.

Destructive replace mode is intentionally not implemented.

## Operational Library Integration

Operational library packs may include `propertyTemplates` items using the `makereadyos.propertyTemplate` manifest format. Import stores the template as reusable configuration; applying it remains a separate preview-and-confirm action.

Library import still rejects executable JavaScript and unsupported versions.

## Backup And Transfer

Native MakeReadyOS backup includes property template metadata and manifests. It does not include private live records inside templates.

Import skips templates by name when a destination already has a matching template.

## Remaining Gaps

- Overwrite/replace behavior is intentionally deferred.
- Template sharing permissions are simple: admin/global visibility for all saved templates.
- Template manifests do not yet include per-property notification preference defaults or planning defaults beyond reserved empty sections.

## Onboarding Use

The in-app setup guide points admins/managers to property templates after the first property and unit/floor-plan structure are understood. Templates should accelerate a new property setup, but dry-run preview remains required before applying configuration to an existing property.
