# Shared On-Call Workspace

## Access Model

- Signed-in staff of every role can open the On-call module without a shared code. Managers and admins can manage it. API tokens cannot access its internal endpoints.
- This is one shared, instance-wide on-call group, independent of ordinary property memberships. People are contact records, not accounts. Covered properties are independent directory entries, not grants to other MakeReadyOS property records.
- `/on-call/` is a separate read-only page, without the main application navigation or login. External sharing starts disabled.
- When sharing is enabled, the schedule title/time zone, contact names/approved phone numbers, property names, shift times, backup assignments and shift notes are public. The editor labels these fields accordingly. Never put codes or private instructions in public fields.
- Addresses, shop locations, access codes, instructions and map/document links require the shared access code externally. Public API serialization explicitly excludes them before unlock. No private Wiki or Map records are copied automatically.
- Set a code of at least six characters before enabling sharing; prefer a longer passphrase. Copy share link copies only the URL. Share the code separately. Managers cannot retrieve the saved code; they can replace it.
- A separate signed, HttpOnly, SameSite-strict cookie grants eight hours of guide access and is scoped to `/api/on-call`. It never creates a regular application session. HTTPS deployments mark it Secure. Code rotation, sharing changes and Revoke all external guide sessions change a random access revision, invalidating earlier guest cookies.
- Unlock requires a trusted Origin. Persistent attempt buckets limit each IP to ten attempts per fifteen-minute window and the instance to 200. These limits count successful attempts too. They supplement, rather than replace, a strong shared passphrase and appropriate perimeter rate limiting.
- API responses are no-store and the service worker never caches on-call requests. The external page polls for updates/revocation, hides guides after session expiry, and clears displayed data when refresh fails. Previously viewed or copied information cannot be recalled; change actual property codes when necessary.

## Scheduling And Guides

Add contacts, then covered properties, then shifts. A shift selects a primary, an optional different backup and one or more properties. Dates are stored as UTC instants. Editors enter times in their device time zone; the schedule displays the configured IANA time zone. Copy to next week preserves device-local wall-clock times, including its daylight-saving rules; review copied times if the device and schedule zones differ.

The viewer shows current coverage, upcoming shifts, history and a property filter. End time is exclusive, allowing exact handoffs. Overlaps are allowed but flagged; absence of a recorded shift is explicitly a coverage gap, not proof that nobody is on duty. Contacts/properties referenced by saved shifts cannot be deleted without updating those shifts.

Guides support text instructions, shop/access codes, and HTTPS map/document links. This release does not upload or host map/PDF files. Linked destinations need their own access controls; the module protects the link, not the destination. Links are not fetched by the server or embedded in the page and open with no referrer.

All edits are saved together with optimistic version checking. Errors preserve the draft; Reload saved workspace and closing a dirty editor require confirmation. Drafts and codes are intentionally not persisted in browser storage. Staff lose editing controls if their role changes.

## Backups And Limits

Database dumps include the workspace and access settings. Native JSON backups include directory/schedule content, including sensitive guides, but not the access-code hash or guest sessions. Protect those backup files. Native merge restore creates a missing workspace with sharing disabled and no code; an existing workspace is preserved rather than overwritten. Configure a new code and deliberately enable sharing after native restore.

Limits: 200 contacts, 100 properties, 2,000 shifts and a 2 MB save request. No automatic rotation engine, calendar subscription, notifications, external editing or per-guest identity is claimed. Shared-code users are not individually identifiable, and individual guest revocation is not supported.

## Follow-Up

- [ ] Guided multi-person rotation generation with a preview, holiday/swap exceptions and daylight-saving tests in the schedule's own time zone.
- [ ] Protected map/PDF uploads with dedicated authorization on preview/download, storage quotas and paired backup coverage.
- [ ] Optional schedule-only calendar subscription/export that never includes protected guides or an unlock credential.
- [ ] Named external guest access and individual revocation if shared-code accountability becomes insufficient.
- [ ] Optional shift reminders and acknowledgement without exposing private guides on lock screens.
- [ ] Spanish translations and more granular per-record editing once real multi-coordinator usage warrants it.

## Verification

2026-09-14: API/web production-image builds and web lint passed. Ten targeted schema/service-worker tests passed, including protected-field omission, invalid references/dates/links and exclusion from offline caching. The isolated production-image browser test passed in `logs/e2e-20260914-204306.txt` (`/tmp/mros-on-call-e2e-final.log`). It covers five independent properties, external contacts, failed-save draft preservation, version conflicts, public/private serialization, native backup content and merge preview, guest denial on regular APIs, wrong-code handling, rotation/revocation, locking, persistent attempt limits, sharing disable, all five non-admin roles, and mobile overflow. Mobile/desktop screenshots were captured and the mobile layout reviewed during the test passes.

The initial passes caught and corrected a PostgreSQL advisory-lock result cast and an empty-JSON Lock request. Full fresh-workspace native restore, eight-hour wall-clock expiry, cross-tab revocation timing and large-directory load remain separate test work; the full server database/upload backup path is unchanged. No production records or sharing settings were changed.
