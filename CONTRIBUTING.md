# Contributing

## Scope

MakeReadyOS is an open-source property maintenance operations app. Contributions should prioritize:

- reliable self-hosting
- operational clarity for maintenance teams
- pragmatic data modeling
- straightforward deployment and upgrade paths

## Before You Change Code

1. Read `README.md`
2. Read `reference/project/PROJECT_REFERENCE.md`
3. Read `docs/ARCHITECTURE.md`
4. Run `./build.sh`
5. Run `./test.sh`

## Expectations

- Keep changes focused
- Update docs when behavior changes
- Prefer maintainable TypeScript
- Do not bloat the project reference file with chat transcripts or raw working notes
- If setup or deployment changes, update `README.md` and `docs/BUILD_AND_TEST.md`
- Preserve stable internal field keys; display labels can change, bindings cannot
- Never make `reference/` a runtime dependency; copy approved assets into committed `assets/` paths first
- Do not introduce arbitrary JavaScript execution for automations, imports, or plugins
- Keep dense table workflows working when adding alternate views
- Preserve role enforcement, property scoping, audit logs, backups, and existing saved views

## Adding Features Safely

1. Identify the domain and existing route/component pattern before adding new structure.
2. Add backend validation with `zod` and centralized permission helpers where possible.
3. Add audit logs for important operational changes.
4. Update native backup/transfer boundaries if a new persistent domain is added.
5. Add or update smoke tests in `test.sh` and browser coverage in `e2e/` when user flows change.
6. Update relevant docs and `reference/project/PROJECT_REFERENCE.md` with concise context.

## Adding API Routes

- Put route handlers under `apps/api/src/routes/`.
- Register routes in `apps/api/src/server.ts`.
- Require authentication through the existing API hook chain.
- Use existing role helpers instead of scattering raw role checks.
- Apply property scope consistently.
- Return stable JSON errors with a `message` field.
- Add API token scope handling if the route should be externally accessible.

## Adding UI Tabs

- Add the panel component under `apps/web/src/components/`.
- Keep the desktop table-first workflow intact.
- Add loading, empty, and error states.
- Add `data-testid` attributes for important controls.
- Verify mobile behavior and theme/readability modes.

## Operational Library Packs

- Use the documented `makereadyos.libraryPack` JSON format.
- Keep imported automations disabled until explicitly enabled.
- Reject executable code and unsupported versions.
- Prefer duplicate-safe installs and dry-run previews.

## Testing

Run before handing off:

```bash
./doctor.sh
./build.sh
./test.sh
./e2e.sh
./run-automations.sh
npm --prefix apps/api audit --omit=dev
npm --prefix apps/web audit --omit=dev
```

## Pull Request Notes

Include:

- what changed
- why it changed
- how it was tested
- any follow-up work still needed

## Documentation

If you add a user-facing feature, update the relevant file in `docs/`.

For stabilization context, review:

- `docs/ARCHITECTURE_INVENTORY.md`
- `docs/FEATURE_STATUS.md`
- `docs/UX_DEBT.md`
- `docs/TECH_DEBT.md`
- `docs/RELEASE_CHECKLIST.md`
