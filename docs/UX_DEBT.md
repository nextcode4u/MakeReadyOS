# UX Debt

This list tracks approved usability work and remaining opportunities.

## UI-Only Workflow Audit - 2026-10-27

Use this queue for realistic user journeys, separately from API/integration tests.
Only disposable demo data may be changed. Starting the test server and its baseline
demo seed is infrastructure setup; all scenario actions must use the UI. No direct
API/database writes, forced clicks, injected application state, or mocked successes.
Verify saved results by reopening the screen, not by querying the database.
Desktop and mobile browser runs do not replace physical Android/iOS testing.

Run `bash e2e.sh user- --project=user-desktop --project=user-mobile`
under the supported Node version. Traces, screenshots, and videos are local test
artifacts; never publish production screenshots or resident details.

### Module TODO

- [ ] My Work: preparation saves, parts/task notes, work completion and reopening.
- [ ] Final walk: assign through UI, inspection blockers, photo corrections, technician resolution, reinspection and resident PDF.
- [ ] Turn board: mobile groups, filters, occupied/NTV units, ready/archive transitions.
- [ ] Projects: simple dog-station entry, product link/total, edit, browse and archive.
- [ ] Pest Control and Lease Compliance: create, follow up, resolve/archive and copy/export.
- [ ] Pool Log and Preventive Maintenance: due work, readings/checks, completion and history.
- [ ] Keys & Access: unit search, imports, keytags, mailbox warning and code privacy.
- [ ] Schedule, Assigned Work and On-call: assignment, reschedule, export and guarded removal.
- [ ] Imports/setup: unit directory then availability, preview warnings and corrections.
- [ ] Wiki, Maps, Vendors and Refrigerant: find information, create/edit and export.
- [ ] Alerts and settings: preferences, clearing, permission boundaries and language.
- [ ] Cross-cutting: keyboard navigation, Spanish, small screens, unsaved navigation, slow/offline recovery and double taps.

### Finding Rules

Give each confirmed issue an ID, severity, role, viewport, exact UI steps,
expected/actual result, and evidence. Track **open**, **fixed locally**, and
**UI-retested** separately. Do not check off a whole module after one happy path.
Keep findings here so there is one queue rather than competing TODO documents.

### Current Pass

- UI-retested 2026-10-28: final-walk resident PDF controls now include an explicit
  move-in handoff for authorized staff. Printing does not change occupancy. The
  action requires a saved, Ready turn with an applicant or move-in recorded and
  confirmation that the resident actually moved in. Desktop/mobile click-through
  tests covered disabled-before-Ready, PDF download, cancellation, offline failure
  and retry, archiving the completed turn, and finding the unit in Occupied units.
  These are browser tests, not physical-device coverage.

- UI-retested 2026-10-27: directory then availability import, directory re-import
  preserving current NTV status/date, extended vacate date and retained turn notes;
  duplicate directory/availability file uploads now show skipped-row explanations.
  Scoped manager creation, technician/leasing navigation restrictions, technician
  parts-request delivery to manager/admin, need-to-know preferences, offline quiet
  hours/reconnect/reload and cancel/confirm clearing were exercised through the UI.
  This is targeted role-boundary coverage, not an exhaustive authorization audit.
  Full-report reconciliation, stale/conflicting report review, other file formats,
  every alert category and physical-device push delivery remain separate checks.

- Combined verification checkpoint, 2026-10-27: all twenty-eight UI-only desktop/mobile
  scenarios passed together, plus lint and 36 service-worker/offline-queue tests.
  This supersedes the earlier per-pass combined-run limitations below, but does
  not close untested scenarios or establish physical-device coverage.

- UI-retested 2026-10-27: manager assigns a demo turn in All details, technician
  signs in, saves eight preparation checks, key counts and a resident door code,
  closes/reloads/reopens the unit and verifies the saved values. Both desktop
  and mobile browser scenarios passed; no direct API requests or database writes
  are used by the scenario. Baseline demo records are seeded at server startup.
- UI-retested 2026-10-27: simple Projects dog-station idea with a product link and
  estimated total, edit total, reload and reopen. Desktop and mobile passed without
  supplying quantities, photos, vendor registration or a schedule.
- UI-retested 2026-10-27: manager configures the inspector and assigns the unit;
  technician completes preparation; inspector uploads a photo and returns work;
  technician opens the image and saves the resolution; inspector rechecks, marks
  ready and downloads the resident PDF. Desktop and mobile browser runs passed.
- Test-data limitation: the seeded technician initially has no assignments. The
  test now assigns work through the manager UI rather than mutating the backend.
- UI-retested 2026-10-27: Pest Control creation, offline note/closing retention,
  reconnect/save, follow-up, copied active list and closed/archive reopening;
  Lease Compliance creation, offline note/resolution retention, reconnect/save,
  resolved view and archived history. Desktop and mobile passed. The combined
  UI-only suite passed all ten scenarios; no production data was changed.
- UI-retested 2026-10-27: Pool facility creation, saved readings/notes, failed-check
  visibility, date-only display and offline-save/reconnect; PM template creation,
  missing-notes feedback, offline completion, reconnect and reopened history.
  All fourteen combined desktop/mobile scenarios passed. Pool history screenshots
  were reviewed after the stacked-row adjustment. Build, lint, 24 offline-queue
  tests and 12 service-worker tests passed. Physical-device checks remain open.
- UI-retested 2026-10-27: Keys & Access lookup by unit and imported keytag, mailbox
  confirmation cancel/accept, offline code-save error with retained input, leading
  zeros, keytag-only import preserving existing door codes, reload verification,
  explicit hide/reveal and property-switch clearing. Both new desktop/mobile
  scenarios passed. No production data or direct API/database mutations were used.
  This adds two scenarios to the prior fourteen; the combined sixteen were not
  rerun in this pass. Permissions, concurrent edits, file/export flows, resident
  PDF exclusion, timeout/background privacy and physical devices remain open.
- UI-retested 2026-10-27: assign a turn to Demo Tech, filter Assigned Work, edit
  Expected Finish through the calendar, export PNG and verify the changed date
  after reload/reselecting the track. Desktop/mobile downloads passed PNG signature
  checks; the mobile export was visually inspected for the track and event date.
- UI-retested 2026-10-27: add an on-call person, fail a save offline without losing
  the draft, reconnect/save, cancel typed-name removal, confirm removal, Undo and
  save/reload. Desktop/mobile passed, with external sharing left disabled.
  Four new scenarios passed; the full twenty-scenario suite was not rerun here.
  Manual shifts, rotations, assigned-person removal, simultaneous editors, work
  sessions and external-sharing permissions still need UI-only coverage.

### UI-001: Mobile My Work First-Action Density

- Status: **fixed locally; English desktop/mobile UI-retested**. Priority: P3 usability; not a data-loss or save failure.
- Role/viewport: technician, Pixel 5 mobile browser.
- Steps: sign in with an assigned turn; open My Work at the top of the screen.
- Expected: identify the next unit and its primary action with minimal scrolling.
- Observed: the shell, description, four summary metrics and two section headings
  take substantial vertical space before the first work action. The temporary
  sign-in toast also overlays part of the first card.
- Evidence: `user-my-work.spec.ts` mobile `my-work` screenshot and retained trace
  from the 2026-10-27 pass. Artifacts remain local in the Playwright report.
- Acceptance: compact the mobile summary/heading area without hiding follow-up
  categories or counts; verify normal and correction cards, long labels, empty
  lists, toast dismissal and English/Spanish on narrow screens.
- Change: compact count/label rows and mobile heading spacing; removed the
  redundant Confirmed assignments heading. Follow-up sections remain distinct.
  Sign-in toast behavior is unchanged and remains a separate polish opportunity.
  Spanish, long labels, empty lists and physical-device checks remain open.

### UI-002: Successful Private Responses Trigger False Network Failures

- Status: **fixed locally and UI-retested**. Priority: P1 workflow reliability.
- Role/viewport: technician, desktop browser with the real service worker enabled.
- Steps: finish preparation; inspector sends photo corrections; technician reloads
  My Work, opens corrections and chooses Review corrections.
- Expected: saved instructions and photos load without retries.
- Observed: resident preparation alternated between loading and retry/error states
  despite successful server responses. The retained browser trace captured it.
- Cause: every `Cache-Control: no-store` response cleared the entire API cache and
  advanced the cache epoch, causing parallel successful responses to be discarded.
- Change: remove only that request's previous cached entry. Authentication failures
  and identity changes still invalidate all operational caches. Storage deletion
  failures retain the conservative full-cache fallback.
- Verification: 12 focused service-worker tests pass, including concurrent private
  responses, deletion failure, offline privacy, logout and account changes. The
  full UI handoff passed on desktop and mobile with service workers enabled.
  This does not establish the cause of every historical
  connection warning or prove real-device Android behavior.

### UI-003: Issue Notes Clear Before Save Confirmation

- Status: **fixed locally; desktop/mobile UI-retested**. Priority: P2 draft loss.
- Role/viewport: admin, desktop and Pixel 5 browser.
- Steps: create a Pest Control request, expand it, type a quick note, go offline
  and press Add Note. Expected: retain the text and explain the failed save.
- Observed: the input cleared before server confirmation on both viewports.
  Source inspection found the same pattern in Lease Compliance actions.
- Change: await confirmation before clearing quick notes, closing/follow-up notes,
  and resolution notes. Show inline saving/error feedback and guard repeat taps.
- Evidence: `user-requests.spec.ts` and local Playwright traces. Scenarios cover
  offline note/closing retention, reconnect/save, pest follow-up and copied list,
  closing into archive, and lease resolution/archive with reopening.
- Limits: drafts remain in the open component, not a durable offline queue.
  Reload/navigation persistence, uncertain server acknowledgments, attachments,
  notice actions, physical devices and Spanish UI testing remain open.

### UI-004: Saved Lease Resolution Explanation Is Invisible

- Status: **fixed locally; desktop/mobile UI-retested**. Priority: P2 history visibility.
- Role/viewport: admin, desktop browser.
- Steps: resolve an issue with an explanation, switch to Resolved, expand it.
- Expected: see the saved explanation. Observed: status/date appeared, but the
  resolution text was not rendered despite being stored separately from notes.
- Change: display saved resolution notes in the expanded card, including archive,
  preserving line breaks and wrapping long text.
- Evidence: `user-requests.spec.ts` failed reopening assertion and component/API
  inspection; local browser traces retained.

### UI-005: Pool History Hides Operator Context and Shifts Dates

- Status: **fixed locally; desktop/mobile UI-retested**. Priority: P2 history accuracy.
- Role/viewport: admin, desktop and Pixel 5 browser.
- Steps: create a facility, record readings, a failed safety check and a note;
  open History. Expected: see the recorded note, failed check and entered date.
- Observed: the note was absent; the row showed a generic review prompt without
  identifying the failed check. Date-only UTC parsing displayed the prior day
  in the tested American time zone.
- Change: display notes and failed checks, use the shared date-only formatter in
  history and recommendation descriptions. No chemistry thresholds were changed.
- Visual follow-up: stack pool history content rather than squeezing notes and
  failed checks into the generic two-column row layout.
- Evidence: `user-maintenance.spec.ts` and local Playwright traces.

### UI-006: PM Completion Blockers Have No Visible Feedback

- Status: **fixed locally; desktop/mobile UI-retested**. Priority: P2 workflow clarity.
- Role/viewport: admin, desktop and Pixel 5 browser.
- Steps: create a notes-required template; open Tasks; press Complete without
  notes. Expected: actionable feedback beside the task. Observed: no visible error.
- Change: explain required notes/photos before submission, show other save errors
  inline, retain notes, and disable repeated completion/skip taps while saving.
  Existing server validation and offline queue behavior are retained.
- Evidence: `user-maintenance.spec.ts` missing-alert assertion and retained traces.

### UI-007: Pool and PM Offline Saves Pause Before Durable Queuing

- Status: **fixed locally; desktop/mobile UI-retested**. Priority: P1 offline reliability.
- Role/viewport: admin, desktop and Pixel 5 browser.
- Steps: fill a pool log or valid PM completion, disconnect the browser, press
  Save/Complete. Expected: a confirmed persistent pending-sync record.
- Observed: mutations paused in memory before the network-failure fallback could
  enqueue the work. Pool Save stayed disabled; PM remained on Saving task.
- Change: use `networkMode: "always"` only for actions that already have durable
  offline fallbacks: pool log creation/uploads and PM completion/skip/uploads.
  Server errors still fail normally rather than being queued as network failures.
- Evidence: offline portions of `user-maintenance.spec.ts`, both viewports.
- Remaining checks: physical devices, offline attachments, storage failure UX,
  repeated submissions after an action is queued, and ambiguous acknowledgments.
  The basic queue tests do not prove exactly-once delivery for every server action.

### UI-008: Pool Mobile Header Pushes Records Below the Fold

- Status: **open**. Priority: P3 usability.
- Role/viewport: admin, Pixel 5 browser.
- Steps: open Pool Logs, select History. Observed: description, full-width log
  action, property selector, export buttons and tabs consume the first viewport.
- Evidence: `user-maintenance.spec.ts` initial mobile history screenshot.
- Acceptance: compact secondary export actions and introductory text while keeping
  property context and Log readings obvious; verify keyboard access and Spanish.

### UI-009: Mailbox Warning Crowds Mobile Code Lookup

- Status: **open**. Priority: P3 usability.
- Role/viewport: admin, Pixel 5 browser.
- Steps: select a unit in Keys & Access. Observed: the full permanent-assignment
  warning and mailbox-edit controls precede Reveal unit codes, requiring scrolling
  for a frequent lookup action.
- Evidence: `user-keys.spec.ts` mobile `keys-hidden` screenshot, visually reviewed.
- Acceptance: prioritize code lookup and a compact mailbox summary; retain the
  full warning and explicit confirmation when adding/changing/removing assignments.
  Do not weaken code privacy or automatically reveal codes.

### UI-010: Calendar Choices Reset on Reload

- Status: **open**. Priority: P3 usability; not a lost date edit.
- Role/viewport: admin, desktop and Pixel 5 browser.
- Steps: select a single Expected Finish calendar, edit a date, export a picture,
  then reload. Observed: the layout returns to split and the first track returns
  to Make Ready (Start), so the previously visible event is no longer in that pane.
- Evidence: `user-scheduling.spec.ts` first-run traces and reload snapshots.
- Existing behavior: calendar settings are included in saved-view grouping, but
  transient choices are initialized again on reload. The test reselects the track
  before checking date persistence rather than treating this as a lost date.
- Acceptance: clarify save-view behavior or retain account-scoped last-used
  calendar choices, without overriding explicitly selected saved views or keeping
  unavailable tracks after account/property changes.

### UI-011: Quiet-Hour Saves Give No Offline Feedback

- Status: **UI-retested**. Priority: P2 recovery/usability.
- Role/viewport: admin, desktop and Pixel 5 browser.
- Steps: Alerts > Preferences, change Start, disconnect, click Save quiet hours.
- Actual: no inline failure or save state; the mutation could pause until reconnect.
- Fix: explicit offline feedback, retained draft, saving guard and inline result.
  Background notification refreshes no longer replace dirty quiet-hour inputs.
  These settings are not a durable offline queue; reconnect and save explicitly.
- Evidence: `user-admin-workflows.spec.ts`, offline/reconnect/save/reload scenario.

### UI-012: Import Results Hide Duplicate-Row Explanations

- Status: **UI-retested**. Priority: P2 import clarity.
- Role/viewport: admin, desktop and Pixel 5 browser.
- Steps: Availability & Units, upload a directory CSV containing the same unit twice,
  confirm import, inspect the result; repeat with availability.
- Actual: rows are skipped by the importer but its row-specific explanations are
  not rendered. The directory shows a skipped count; availability only shows totals.
- Fix: show returned row warnings for both imports without changing import policy.
- Evidence: `user-admin-workflows.spec.ts`, duplicate-file upload scenario.

### UI-013: One Availability Conflict Blocks Unrelated Unit Updates

- Status: **UI-retested**. Priority: P1 operational workflow.
- Steps: import a report containing a conflicting local turn and other changed/new
  units; choose Keep Local Board Values.
- Actual: the button only dismissed the conflict review. No rows were imported.
- Fix: an explicit keep-local-and-import-rest action preserves the entire conflicting
  unit row, imports other rows, and lists preserved units in the result and audit
  receipt. Explicit overwrite and cancel remain separate choices.
- Safety: recheck conflicts inside the transaction before changing unit or turn
  data. Retain every report row for full-report reconciliation so a preserved unit
  cannot be mistaken for a missing unit and archived.
- Evidence: `user-import-conflicts.spec.ts` covers confirmation cancel/accept,
  retained local status/notes, updated dates and a new unit after reload;
  `availabilityReconciliation.test.ts` covers late conflicts, original report
  membership, audit evidence and explicit override.
- Verification: ten targeted desktop/mobile import, permission and alert scenarios
  passed, plus the three backend reconciliation tests and lint. Full-suite and
  physical-device coverage are not implied by this targeted pass.

## Module Simplification TODO - 2026-10-02

Approved implementation queue. Track local implementation separately from browser
verification, deployment, and feedback from real use. Preserve existing permissions,
history, safety warnings, offline recovery, and advanced workflows.

- [x] Projects: simple title, product/vendor link, and estimated total entry; optional photos and advanced details; compact browsing with costs; edit saved basics; safe links.
- [x] Pool Log: actionable missing-log and review rows; direct daily-log entry, with property-scoped review filtering.
- [x] Vendors: on-demand creation ahead of existing lists, persistent vendor contact labels, save failures preserve the draft.
- [x] Property Wiki: compact category navigation with search and emergency access kept prominent.
- [x] Refrigerant: choose charge/recovery before showing a form; separate type setup from daily entry.
- [x] Lease Compliance: reduce top-level navigation, explain resolved versus archived, collapse optional capture.
- [x] Preventive Maintenance: due-now task landing for field staff and compact export controls.
- [x] Projects browsing: six readable overview metrics, simpler filters, collapsed details with task/file/comment counts; bids and detailed planning remain available.
- [x] Property Maps: map first, explicit expandable configuration.
- [x] On-call: sticky save controls, grouped settings, visible time-zone explanation.
- [x] Pest Control: active requests first; optional new-request form.
- [ ] Shared QA: keyboard/touch navigation, English/Spanish, narrow screens, create/edit persistence, permission and recovery regressions.

Start with Projects. A request such as "Dog stations" should need only a title,
an optional Amazon/vendor link, and an optional estimated total, not a photo,
quote, vendor registration, quantity breakdown, or schedule. Saving an estimate
does not approve spending, place an order, or record actual expenditure.

### Implementation Notes

Checked items mean implemented locally, not deployed or field-validated. The
product link is a nullable field added by a migration. HTTP(S) links without
credentials are accepted; the server never fetches product pages. Links survive
native backup/restore and appear in CSV/Excel exports and individual reports.
Estimated totals remain separate from approved quotes and recorded actual costs.
The simple editor protects against stale writes and preserves failed drafts.

### Automated Verification

Verified locally on 2026-10-02 under Node 24:

- `test.sh` passed, including builds, lint, production dependency audits, isolated regressions, and disposable database/API checks.
- Seven targeted browser tests passed: simple Projects create/edit and backup restoration; compact module navigation; Spanish controls; two On-call safety/sharing workflows; Pest Control copy/archive; and existing project quote, budget, schedule, and export workflows.
- Projects screenshots were inspected at mobile and desktop widths; inputs no longer share an unstructured inline row, and optional detail sections remain collapsed.
- The audit gate identified an existing Fastify advisory. Fastify was patched to 5.12.5; the subsequent production dependency audits passed.

These are targeted automated checks, not a complete accessibility audit or proof
of real-device field acceptance. No production deployment was performed.

### Remaining Follow-Through

- [ ] Deploy only after release authorization, then gather technician/manager feedback on real devices.
- [ ] Complete keyboard, screen-reader, and interrupted-save checks across every module, beyond the targeted automated scenarios.
- [ ] Consolidate remaining Pool Log export/setup navigation and group Wiki categories further if field feedback shows the compact selector is still hard to browse.
- [ ] Finish legacy English-only copy in Projects and On-call; new Projects inputs and compact Wiki/Lease navigation support English and Spanish.
- [ ] Audit older module browser tests for assumptions about always-open forms; keep test changes tied to intended navigation changes.
