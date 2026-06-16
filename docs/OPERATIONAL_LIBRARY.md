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

The current JSON Schema and example pack live at:

- [`docs/schemas/makereadyos-library-pack.schema.json`](schemas/makereadyos-library-pack.schema.json)
- [`examples/operational-library/sample-library-pack.json`](../examples/operational-library/sample-library-pack.json)

## APIs

- `GET /api/operational-library/packs`: list bundled packs and install state.
- `POST /api/operational-library/preview`: validate a bundled or uploaded pack and return a dry-run summary.
- `POST /api/operational-library/install`: install supported pack items with duplicate-safe behavior.

`ADMIN` and `MANAGER` can preview/install packs. `TECH`, `LEASING`, `CLEANER`, and `VIEWER` are denied.

The Automation workspace exposes bundled packs plus a JSON import box for paste/import workflows. Operators should use Preview Imported JSON before Install Imported JSON to inspect created/skipped/conflict counts.

The bundled starter pack includes data-only scheduling and readiness helpers such as weekend schedule review, Monday/Friday schedule review, vendor lead-time reminders, daily load review notes, scope-day planning, date-sequence review, in-house/vendor routing review, cleaner-assignment review, balanced tech-assignment review, upcoming make-ready workload review, and ready-unit stock expectations. These helpers install as disabled structured rules so each property can adjust wording, scope, and enablement before use.

Date sequencing is intentionally conservative. Current templates can warn that paint, cleaning, final walk, and vendor dates need review around operating-day rules, but they do not automatically rewrite dates. Property operating calendars now store no-weekend, Monday/Friday avoidance, operating-hours, vendor lead-time, daily-limit, scope-day, and work-start preferences. A future business-day offset action can safely support patterns such as make-ready on day 0, paint on day 1, cleaning on day 2, and final walk on day 3 while respecting those property rules.

Assignment templates are still conservative by default, but the automation engine now includes a scheduled `assignLeastLoadedStaff` action for properties that want controlled auto-assignment. The action is property-scoped, only considers active eligible users, can filter to specific roles or user IDs, can include planned work in the balancing score, can enforce a planned-day cap, uses deterministic tie-breaking, and is visible in dry-run preview before it mutates `assignedTech`. The bundled starter rules remain review-first until field validation confirms which scenarios should safely auto-assign out of the box.

The bundled library now also includes disabled opt-in auto-assignment starters for balanced tech assignment and cleaner assignment. These do not replace the advisory review-note starters; they sit beside them so operators can choose between review-first and automation-first rollout per property.

Browser smoke coverage now verifies that the balanced tech auto-assignment starter remains disabled by default, previews cleanly, and installs as an editable structured rule without forcing enablement during install.

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

See `docs/EXTENSIONS.md`, `docs/schemas/makereadyos-library-pack.schema.json`, and `examples/operational-library/sample-library-pack.json` for the current contract.
