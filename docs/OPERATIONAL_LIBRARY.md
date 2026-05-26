# Operational Library

Operational Library packs let admins and managers install reusable MakeReadyOS workflow building blocks without importing executable code.

## Pack Format

Version 1 packs use this envelope:

```json
{
  "format": "makereadyos.libraryPack",
  "version": 1,
  "packKey": "make-ready-operations-starter",
  "name": "Make Ready Operations Starter",
  "category": "Make Ready",
  "description": "Reusable operational setup.",
  "setupNotes": [],
  "items": {
    "automationTemplates": [],
    "checklistTemplates": [],
    "customFields": [],
    "optionSets": [],
    "scheduleTracks": [],
    "savedViews": [],
    "propertyTemplates": []
  }
}
```

Packs are data-only. The import API rejects JavaScript-like payloads and unsupported versions.

## APIs

- `GET /api/operational-library/packs`: list bundled packs and install state.
- `POST /api/operational-library/preview`: validate a bundled or uploaded pack and return a dry-run summary.
- `POST /api/operational-library/install`: install supported pack items with duplicate-safe behavior.

`ADMIN` and `MANAGER` can preview/install packs. `TECH`, `LEASING`, `CLEANER`, and `VIEWER` are denied.

The Automation workspace exposes bundled packs plus a JSON import box for paste/import workflows. Operators should use Preview Imported JSON before Install Imported JSON to inspect created/skipped/conflict counts.

## Install Behavior

- Custom fields are skipped when the same stable `fieldKey` already exists.
- Built-in option choices are skipped when the same `fieldKey`/`value` exists.
- Checklist templates are skipped by global name match.
- Schedule tracks are skipped by `sourceField`.
- Shared saved views are skipped by module/name.
- Automation rules are created from structured definitions with `templateId` provenance in the form `pack:<packKey>:<itemKey>`.
- Property templates are stored as reusable `makereadyos.propertyTemplate` manifests and must still be applied separately through their own dry-run/confirm workflow.
- Imported automation rules are always disabled until reviewed and explicitly enabled.
- Starter risk helper templates can add activity notes, but the native SLA/risk engine remains the source for item risk scores and reasons.

Installed pack provenance is tracked in `OperationalLibraryPack` and `OperationalLibraryPackItem`.

## Safety Boundaries

- No arbitrary JavaScript execution.
- No external plugin runtime.
- No destructive replace mode.
- Manager installs remain property-scoped for automation rules when a property scope is required.
- Existing app records are skipped rather than overwritten.

## External Library Packs

Outside contributors can author safe `makereadyos.libraryPack` JSON files. Packs may define custom fields, status options, checklist templates, schedule tracks, saved views, dashboard presets, property templates, and disabled automation templates. Packs must not contain JavaScript or executable code.

Property templates inside a pack are configuration-only. They must not embed residents, live make-ready items, comments, attachments, users, tokens, or history.

See `docs/EXTENSIONS.md` and `examples/operational-library/sample-library-pack.json` for the current contract.
