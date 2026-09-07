# Digital Make-Ready Sheet

Status: reviewed source and requested workflow captured; the complete workflow and proposed resident handoff controls below are not implemented yet. Existing calendar automation and percentage assignment are separate, locally verified foundations, not completed inspections.

## Source And Goal

Reviewed both pages of the user's `(Zaq) Apartment Make Ready Checklist 5.31.26 (1).pdf`, at `D:\Users\DELL\Downloads\MR Sheet\` (available locally under `/mnt/d/Users/DELL/Downloads/MR Sheet/`). Do not introduce a runtime dependency on that workstation path.

Replace the manual sheet with one turn record tied to property, unit, and turnover, rather than making staff maintain separate forms. Page one contains the resident-facing quality assurance checklist and sign-offs. Page two contains internal make-ready, cleaning, trash-out, painting/sheetrock, parts, materials, notes, orders/upgrades, and rework sections.

## The Work Sequence

| Stage | Staff Experience | Completion Evidence |
| --- | --- | --- |
| 1. Initial photos | Capture inside/outside photos directly against this turn, organized by room/location. | Saved evidence or an explicit reviewed exception; pending offline uploads are visible, not reported as delivered. |
| 2. Scope | Record repair tasks, parts/material quantities, trash-out, paint, cleaning, and flooring/carpet needs. | Reviewed scope with owners, required/optional work, blockers, and an estimate of work needed. |
| 3. Make ready | Assigned tech completes repairs and records actual work, parts used, evidence, and technical checks. | Tech sign-off; unresolved tasks remain open. |
| 4. Painting | Painter/vendor work is scheduled and completion is recorded. | Named completion/verification with date, not just a scheduled date. |
| 5. Cleaning | Cleaner/vendor work is scheduled and completion is recorded. | Named completion/verification with date. |
| 6. Carpet/flooring, if needed | Include only when scoped; explicitly mark not needed otherwise. | Completed work or reviewed not-applicable status. Flag any cleaning recheck needed after this work. |
| 7. Independent final walk | A second person, normally leasing, reviews the unit and records findings. | All required checks addressed, deficiencies corrected/rechecked, independent reviewer sign-off, and a saved handoff revision. |

The five-weekday calendar remains the target for repair, painting, cleaning, optional flooring/carpet contingency, and final review. Initial photos and scope prepare that sequence; they should not silently add two extra days to the target. A scheduled day never means work has been completed. Changing scope or discovering blockers must show the impact on the ready target, not invent a successful completion.

## One Turn, Two Views

**Staff workspace:** next action first, stage progress, owner, scheduled and actual dates, room/area tasks, parts, internal notes, photos, vendor work, and rework. Reuse the existing board, attachment gallery, task/checklist infrastructure, and calendar rather than introducing another independent module. Show the property and unit prominently during capture and edits.

**Resident handoff:** a clean print/PDF titled "Your Home Preparation Checklist", with property, unit, review date, recorded checks, applicable/not-applicable results, and named tech/reviewer sign-offs. Generate it from an immutable finalized revision, not the current mutable board fields. Keep the internal parts list, costs, vendor discussions, damage/charge notes, prior-resident details, and access codes out of it. Door/key codes should stay in a separately controlled handoff, even though the old sheet had a door-code blank.

Use factual wording about the recorded preparation and inspection. Do not invent safety certification, guarantee future performance, or claim a test was performed because a status was imported or a scheduled date passed. Record which checks were performed by the tech and which were observed/reviewed by the final walker; a leasing reviewer does not automatically attest to personally performing technical tests.

## Checklist Baseline

Preserve the scope of the supplied sheet, with property-specific applicability and room/fixture instances where needed:

- General: initial documentation and left-behind items; lights; vents; HVAC operation, filter and spare, coils/fans and condensate; water heater; paint identification; windows/doors/locks/weather stripping; patio security; doorstops; closets; floors; walls; unresolved water stains/growth and follow-up; rails; laundry equipment; garage/opener/remotes.
- Kitchen: stove/oven; dishwasher run/drain; microwave/hood light and exhaust; refrigerator cooling/seals; sink/supply lines; disposal; faucets/pressure; cabinets/drawers; appliance interiors.
- Bathrooms: drainage/leaks; surround/caulk/grout; curtain rod; faucets/pressure; under-sink condition; exhaust fans. Do not let one generic "bathroom passed" imply that every bathroom was checked.
- Living areas/bedrooms: ceiling fans; coverings; screens, repeated per applicable room.
- Safety/electrical: recorded outlet/switch testing and condition; detectors/function/service life; panel labeling/security; exterior lights; extinguisher where applicable; pest observations/treatment when required. Preserve technical responsibility and evidence rather than asking leasing to certify unperformed technical work.
- Final inspection: cleanliness/odors; provided internet; carpet; baseboards/frames/corners; trash/cans; rekey; mailbox identification and key/tag readiness; window stickers/tape; valet trash equipment; independent walk; required key copies; garage remotes.
- Sign-off: unit, tech completion date/person, final reviewer date/person. Optional resident-visible mailbox information must be deliberately selected, not copied from unrestricted notes.

Property templates may adapt wording and applicability. Store a versioned snapshot when a turn starts so editing the template does not rewrite previously signed checklists. Seasonal HVAC settings from the source sheet must not become an unexplained global fixed-temperature rule.

## Completion And Rework Rules

- Every check starts Not checked. Support Pass, Needs attention, and Not applicable, with a reason for exclusions; never silently convert an unchecked boolean into a pass or N/A.
- Required unresolved checks and open rework block finalization. A failed final check creates an actionable task attached to the original turn, assigned to the responsible person/trade, and requires an explicit recheck after correction.
- Keep tech and final-reviewer identities as stable user IDs. The normal final reviewer is leasing, but a different authorized manager/admin may review. The person signing the final walk must not be the tech signing repair completion; do not infer independence from role or display name alone.
- Add property-scoped final-walk permission for leasing without giving leasing broad maintenance/admin privileges. Preserve scope checks on every checklist, evidence, finalization, and PDF endpoint.
- Finalization is transactional and repeat-safe. It records both sign-offs and the checklist version, then makes a completed resident report available. Unfinished exports must be unmistakably Draft / Not finalized, never a completed welcome checklist.
- New material work or changed signed answers requires reopening and a new review revision. Preserve earlier issued revisions for history and label superseded reports; do not rewrite an old signed PDF silently.
- Gate ready-status transitions consistently across the drawer, table, bulk actions, automations, and API, rather than protecting only one button. Imports and legacy ready inventory need explicit unverified/legacy handling, not fabricated signatures or silent removal of existing ready status.
- Offline capture/checklist drafts should be durable and retryable without blocking the next entry. Final approval requires server acknowledgment and resolved required evidence uploads; an offline pending request is not a completed sign-off.

## Current Gaps Confirmed In Code

- The drawer already has inspection-stage attachment tags and generic checklists. These can support the workflow but do not currently constitute a signed, versioned final inspection.
- Generic checklist answers are completion booleans, not Pass / Needs attention / N/A with review/rework semantics.
- The current mark-ready endpoint is manager/admin-only and does not validate a final inspection. Its audit/notification wording previously asserted that the final walk passed; wording is corrected to report only that the unit was marked ready. Existing history is not rewritten.
- The calendar pack creates dates, not completed stage records or independent sign-offs. Percentage assignment sets the turn's tech, not its final reviewer.
- There is no source-backed, finalized resident checklist report in this workflow yet.

## Implementation Milestones

- [ ] Turn workflow foundation: versioned source-based checklist templates, stages, scope/tasks/parts, stable participant IDs, scheduled versus actual progress, and a guided mobile drawer.
- [ ] Initial capture and scope: connect inside/outside/room photos and durable offline uploads, make required/optional work clear, and reuse existing assignment/calendar facilities.
- [ ] Trade completion and rework: tech sign-off, paint/cleaning/flooring completion, optional stage exclusions, blockers, next-person handoff alerts, and final-review assignment.
- [ ] Independent final walk: leasing permission, explicit results, failed-check task creation, recheck, transactional versioned sign-off, and consistent server-side ready gates.
- [ ] Resident handoff: finalized printable/PDF checklist, separate draft/internal output, page-width/page-break testing, escaped content, excluded internal/access data, and revision history.
- [ ] Release verification: two-property permissions, multi-room checks, optional equipment, same-person refusal, revoked access, concurrent sign-off/retry, offline reloads, unresolved evidence, bypass attempts on all ready paths, legacy imports, native/PostgreSQL backup coverage, and resident-report redaction.

Do not declare this milestone delivered just because the generic checklist can be printed or the board status says Ready.

## Immediate Correction Verified

The truthful mark-ready wording and English/Spanish button-label correction passed production builds, lint, and full API/PDF integration (`logs/test-20260906-224613.txt`). The added real-database regression verifies that marking four units ready records the status change without claiming an unrecorded final inspection. No inspection gates or leasing sign-off permissions are added by this wording-only correction. Not pushed or deployed.
