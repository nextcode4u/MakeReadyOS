# Onboarding

MakeReadyOS now includes a lightweight setup guide for administrators and managers. It is meant to point new deployments toward the operational order that matters most, without hiding the dense table workflow.

## When It Appears

- The guide opens automatically for admin/manager users when no properties exist.
- It can be reopened from the top toolbar with `Guide`.
- `Skip for now` stores a local browser preference only. It does not change server data.

## Recommended Setup Order

1. Create or review properties and board sections.
2. Add the unit directory and managed floor plans.
3. Create staff users and assign roles/property access.
4. Apply a property template if one fits the site.
5. Preview and enable starter automations.
6. Configure schedule tracks.
7. Save daily table views.
8. Review Dashboard and optional Frog Pond.

## Demo vs Production

New deployments start with baseline configuration only: make-ready board labels, display columns, schedule tracks, and checklist templates are seeded so admins do not have to recreate the standard operating columns by hand. Properties, units, floor plans, turns, staff assignments, and templates are left for the setup guide and import workflows.

Seeded demo data is useful for evaluation. Set `SEED_DEMO_DATA=true` only when you want sample properties, units, and make-ready turns. For a real deployment, keep `SEED_DEMO_DATA=false`, import actual unit directories, create real staff users, and apply property templates intentionally. Do not use demo passwords outside local testing.

## Reopening Later

The guide is intentionally simple. It does not block work and does not enforce completion. Use it as a checklist when onboarding a new property or admin.
