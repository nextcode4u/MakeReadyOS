# Paper-to-Digital Turn Workflow Audit

2026-09-08. Tested against an isolated database, not live resident/unit records.

## Readiness Decision

MakeReadyOS can support day-to-day scheduling, repair tracking, photos, parts and inspection handoff. It is **not yet a complete replacement for the signed paper inspection and resident handoff record**. Keep the current inspection/sign-off process until the blocking items below are delivered.

## Blocking Follow-Up

- [ ] P1: Enforce inspection readiness across all mutation paths. The Mark ready action now checks required generic checklist completion and pending materials. In FINAL WALK it also requires a saved, dated report with all 45 checks recorded and no Needs attention findings. Direct status edits, bulk updates, imports and automations still need one consistent gate with explicit legacy/override treatment. Checklist/material writes also need shared transaction coordination with finalization. A scheduled or completed work block is not evidence that individual checks passed.
- [ ] P1: Persist independent technician/reviewer sign-offs by user ID with immutable report revisions. Initial inspector assignment, handoff and Mark ready now exclude the current repair assignee by trimmed, case-insensitive name. This is conservative, not a durable identity/signature guarantee: duplicate names and renamed/reassigned technicians need explicit handling. The report editor saves mutable drafts, not issued reports.
- [ ] P1: Connect technical checks and final-walk findings to the resident report. Generic checklist booleans and report draft answers are separate; neither should silently turn into a signed pass. Failed checks need assigned correction tasks and explicit rechecks.
- [ ] P2: Record actual completion/verification for painting, cleaning and optional flooring, distinct from scheduled dates. Record reasons for not-applicable stages.
- [ ] P2: Expand parts workflow where needed. Needed/Ordered lines block the Mark ready action until received, used or cancelled; On hand does not prove installation. Other status-changing paths are not gated yet. The list does not manage inventory, purchase orders, cost accounting or partial receipts. Separate lines can represent quantities at different stages; cancelled lines retain a visible record.
- [ ] P2: Finish durable offline parts drafts and field validation of photo uploads. Materials currently require an online save, preserve inputs after failed requests, and warn before discarding an edited form. They are not queued offline.

## Technician And Leasing Role Pass

Found and repaired an inspector dead end: detailed report endpoints and editor were admin-only even though leasing could receive and complete final walks. Assigned independent inspectors now open Inspection details / report from Turn details, record answers and resident handoff details, preview and download a one-page **draft** PDF. Property report wording/style remain admin-only; inspector previews use saved settings, not caller-supplied branding overrides. Unassigned staff, the repair assignee, out-of-scope users and API tokens cannot access this workspace. Handoff revokes the former inspector's access. Completed walks are read-only for the last inspector; admin draft editing is still possible, so this is not immutable report issuance.

Draft saves share the final-walk property lock and recheck inspector ownership before writing. This coordinates with handoff and Mark ready; it does not solve all lifecycle/status-edit races. Readiness blockers refresh after saving. Repair checklist progress is not presented as final inspection progress on leasing's My Work card.

Role regression uses separate mobile TECH and LEASING browser sessions with disposable accounts/property/turn: technician My Work, start/end work, scope note, valid PNG evidence, used material, required checklist completion and completion handoff; leasing notification, handoff/access revocation, detailed draft save, preview/PDF, incomplete-inspection rejection and completed inspection. Test results for this pass are recorded after execution. No live resident records are involved.

Role checkpoint: the expanded role walkthrough and Mark ready regression passed in `logs/e2e-20260908-192715.txt`. The mobile login helper initially assumed the desktop heading was visible; it now waits for the mobile property control. The role walkthrough then exposed the misleading repair progress on the inspection card, which was fixed rather than relaxing the assertion. Eleven focused domain/permission tests pass. Mobile inspector preview was visually reviewed.

Full `test.sh` passed in `logs/test-20260908-192955.txt`, including API/web builds, lint, production dependency audits, isolated database/API lifecycle and role checks. The first attempt stopped on an existing Nodemailer security advisory; updated only Nodemailer 9.0.4 to 9.1.1 (manifest and lockfile), after which production audits reported zero vulnerabilities. New report/readiness/material domain tests are now wired into the standard test script. This does not test real SMTP delivery or alter production. Final browser checkpoint follows below.

Final browser checkpoint: all five targeted production-image tests passed in `logs/e2e-20260908-193404.txt`: readiness rejection/recovery, materials retry/conflicts/mobile/restore/redaction, admin real-branding report/one-page overflow enforcement, full mobile technician-to-leasing handoff/inspection/export, and five-stage scheduling. The role test records all 45 answers, completes the walk, verifies inspector writes are then denied, rejects an attempted branding override, and exports a one-page PDF after completion. These exports remain clearly draft-only. Full-suite and diff checks pass; all changes are local and not pushed/deployed.

## Initial Walk And Evidence Export

Local follow-up: Turn details > Photos & attachments now has a dedicated **Initial walk photos** upload for technicians (admin/manager backup), plus **Download initial walk ZIP** and **Download complete turn ZIP**. The capture action stores INITIAL_WALK atomically with the upload; queued offline uploads retain that stage after retry/reload. General/later uploads stay separate. The normal workflow is initial condition/inside/outside/possible charge photos before starting repairs. This guidance does not yet enforce a signed initial-walk completion prerequisite on every Start Work path.

ZIP export includes all matching stored attachments without a gallery-page limit, including comment attachments. Original bytes and existing camera metadata are unchanged. UTC server-upload timestamps appear in filenames and manifest.json, explicitly NOT represented as camera capture time; delayed/offline upload times can differ from when a photo was taken. The manifest records property, turn, uploader, stage, notes, charge flags/estimates/annotations and SHA-256 checksums. Physical storage paths are excluded. Duplicate names remain distinct and long filenames retain their extensions. Missing stored files fail the export instead of silently omitting evidence. Downloads are no-store and retain property scope restrictions.

Leasing/managers can download ZIPs and separate charge CSV/printable reports. These are review/supporting documents for manual upload or shared-drive backup, not automatic Yardi/RealPage charge imports or proof that a charge is authorized. Markup remains in the manifest, not burned into original photos. Nothing posts charges to an external system.

Verification: the extended technician/leasing/manager browser walkthrough and existing attachment/gallery/checklist browser regression both passed in `logs/e2e-20260908-194038.txt`. ZIPs were actually downloaded/unpacked and checked for counts, stage separation, timestamps, uploader, charge notes, duplicate names, PNG bytes and matching hashes. Fourteen offline-queue tests passed, including interrupted initial-walk upload/resume without duplicating confirmed files. A separate API regression passed for 55 attachments, comment-file inclusion, duplicate/long names, missing files, wrong property, and leasing rejection on the dedicated initial-capture endpoint. No live records changed; not pushed/deployed.

## Parts And Materials

Added **Turn details > Parts & materials**, before completion/final walk. Records item name, positive quantity, free-text unit of measure, Needed/Ordered/On hand/Used/Cancelled status, and internal supplier/order notes. Staff update one line at a time; Cancelled preserves a visible row instead of deleting it.

Lists belong to a turn, not permanently to a unit. Admin/manager/tech/cleaner sessions may edit within their accessible properties. Other property-authorized users may read; API tokens cannot use the dedicated endpoint. Archived turns/properties are read-only. Optimistic version checks reject stale writes; failure leaves the edit form intact. Database backups and native export/import preserve the list; legacy backups default to an empty list. Existing-item native imports retain their existing merge/skip behavior.

Parts, supplier references and notes are internal and excluded from the resident Final-Walk Report. General privileged native backups intentionally contain them.

## Verification Scope

Automated checks cover material validation, role/property/archive access, save retry, concurrent edit rejection, mobile editing, native restore and resident-report exclusion. Existing workflow browser tests cover five-stage schedule generation, inspector notification/handoff, photo attachment/checklist actions and one-page branded draft reports. These demonstrate the implemented behavior, not the missing inspection guarantees above. Results are recorded after execution.

Results: two material schema/permission tests passed; API/web production builds and lint passed. All five workflow browser tests passed in `logs/e2e-20260908-180755.txt`. The initial run exposed a material-selector test issue and a stale calendar-copy expectation in the inspector test; both checks were corrected. Visual review then caught inline mobile form labels; stacked-field layout and a geometry assertion were added. Final materials/mobile/restore regression passed in `logs/e2e-20260908-180946.txt`, and its screenshot was reviewed. No production records were changed. Changes and migration are local, not deployed.

Follow-up: six workflow browser tests passed in `logs/e2e-20260908-184944.txt`, including rejection of incomplete required tasks, pending parts, self-review and archived turns; successful Mark ready after resolving blockers; and preservation of archive state on rejected requests. API/web production images built successfully. Turn details now shows completion blockers with refresh, and inspectors cannot click Mark ready while blockers are present. Manager/admin actions are guarded server-side. Existing scheduling, materials/restore, photos/checklists, notification/handoff and branded one-page report regressions remain passing. This is a Mark ready safety improvement, not global inspection finalization. Still local, not deployed.
