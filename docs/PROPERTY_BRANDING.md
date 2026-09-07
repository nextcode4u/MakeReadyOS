# Property And Management Branding

## Implemented Foundation

Each property explicitly selects its management company. There is no default company or automatic assignment. Company records are reusable across properties, with an optional shared company logo. Properties have their own independent optional logo. Names and logos are not legal ownership or authorization records.

In Board Setup, select a property and open its Branding section. Admins can add/select companies, edit a shared company's name/logo, and save a property's company selection/logo. Shared-company edits explicitly apply to all linked properties. Property assignment and property-logo changes require Save property branding. Staff can read branding only for accessible properties; only admins can edit it.

PNG/JPEG/WebP uploads are normalized in the browser to bounded PNG thumbnails. The API accepts only bounded PNG data with checked dimensions, not SVG or external image URLs. Logo bytes are stored in PostgreSQL, not an external host or upload volume. Both PostgreSQL backup and native JSON export include them. Native import accepts older backups without branding, remaps company/property references, and reports conflicts rather than replacing existing branding silently.

API routes: GET/POST `/api/management-companies`, PATCH `/api/management-companies/:id`, GET/PUT `/api/property-branding/:propertyId`. These use the existing authenticated session, CSRF and property-scope middleware. Company GET returns only companies attached to accessible properties unless the caller is an admin.

Migration: `20260907140000_property_branding`. No existing company assignments or logos are invented.

## Remaining Integrations

- [ ] Reusable read-only property identity component for property-specific headers, wiki, inspection screens and resident documents; do not add large logos to dense board rows or the mobile top bar.
- [ ] Use the selected property's identity on resident reports and property-specific exports. A finalized inspection must snapshot the name/logo bytes with its revision so later company edits cannot rewrite issued documents.
- [ ] Invitation and notification branding: handle multiple properties/companies explicitly; use neutral MakeReadyOS branding when there is no unambiguous company. Do not pick the first company arbitrarily.
- [ ] Company contact details and property office/maintenance contacts: distinguish management-company contacts from the on-site contacts already in Property Wiki.
- [ ] Explicit branding support in property templates, with preview/conflict handling; copying a template must not silently assign a management company.
- [ ] Company lifecycle, safe merging and stale-edit conflict handling. No destructive company deletion endpoint is currently provided.
- [ ] Spanish labels for the new branding editor and end-to-end API-token scope coverage.

The final-walk HTML/PDF under `docs/previews` is a fictional layout proposal, not a live report generator. It now has separate property/company identities, detailed technician checks and final presentation review. It must not be issued as an actual inspection record.

## Verification

2026-09-07 local checkpoint: full API/integration/build/lint gate passed (`logs/test-20260907-085124.txt`). Focused logo validation and admin/property permission tests passed. Browser workflow passed (`logs/e2e-20260907-085005.txt`): company creation/selection, both logo uploads, no inheritance on another property, native branding export/import, and phone-width containment. The revised report PDF is two Letter pages; both printed pages were visually inspected. Earlier full test execution reached completion but exited on a shell read error after the running script was edited; the clean rerun above is authoritative.

2026-09-07 production checkpoint: release `ea18c25` pushed and deployed to `mr-os.com`. Database backup `makereadyos-db-20260907-085714.dump` and upload backup `makereadyos-uploads-20260907-085715.tgz` verified before deployment; previous API/web images retained as `rollback-a7a32b5`. Branding migration applied successfully and both services passed health checks. Public login, dialog focus, final-walk guide, pool mobile containment, company API, per-property branding controls and actual pond movement passed read-only browser smoke checks. TA and VAB retain five enabled guided stages each. No production company or logo was assigned during verification. The sample final-walk document is not a live report generator; View As remains a TODO.
