# Admin Final-Walk Report Editor

Deployed to mr-os.com in application release `b47399a` on 2026-09-07.

## Where To Open It

Admin: Setup > Properties > select a property > Branding > **Edit / Preview Final-Walk Report**. Save property/company logo changes before opening.

Local follow-up (2026-09-08, not deployed): assigned independent inspectors can open **My Work > Inspect or hand off > Inspection details / report** for their own turn. They can save inspection details while in FINAL WALK, and review/export drafts after completion. Handoff revokes the previous inspector's access. Only admins can edit property wording/style or browse all property turns; API tokens cannot use these endpoints. Resident-only code fields are available to the assigned inspector, not all staff on the property. See [role workflow audit](TURN_WORKFLOW_AUDIT.md).

The editor provides:

- Property-specific title, introduction, footer and accent color, with an explicit Save report settings action.
- Branding-only previews without choosing a unit. Both identities use the selected property's actual saved property logo, management company name and company logo. Missing branding remains visibly missing rather than substituting another property.
- A turn selector limited to active, non-archived turns in that property. Inspection drafts are tied to turn IDs, not just reusable unit numbers.
- Eight grouped technician preparation checks in Work, separate from nine final-walk presentation/handoff checks. Leasing checks freshness, cleanliness, visible finishes, comfort at the thermostat setting, resident services, the move-in folder and final review, not coils/drainage or electrical tests. Internet and valet trash remain separate. Only exceptions require notes. All applicable rooms are covered together.
- Existing generic checklist completion records as read-only reference. They are not silently converted into verified inspection results. Assigned tech/reviewer names are shown as assignments, not signatures.
- Inspection date, mailbox number, home/mailbox key counts, fob/remote counts and parking assignment. Technician-entered counts populate the report; the final inspector must confirm the actual quantities (0 for none). Later technician handoff edits invalidate that confirmation.
- Directory-based mailboxes resolve again at preview/PDF time; explicit report-only overrides and nonblank legacy mailbox drafts are preserved. Door/unit codes remain resident-specific. Inspectors may add resident-issued gate and pedestrian codes, never staff/vendor/master codes. Nothing is copied from the property access wiki. Codes are masked and excluded from HTML/PDF unless inclusion is confirmed. New turns do not inherit codes.
- Explicit Save inspection draft, Preview report and Download draft PDF actions. Previews include current unsaved form values; neither preview nor PDF implicitly saves them. Changing fields clears the old preview. Closing or changing turns prompts before discarding unsaved edits, and browser navigation receives a before-unload warning.
- Optimistic revisions and transactional locks reject stale settings/draft saves with 409. Reload saved data explicitly discards local edits after confirmation. There is no last-write-wins replacement of another admin's draft.

## Output And Data Boundaries

This is a **draft workspace**, not an immutable issued-inspection record. PDFs remain labeled DRAFT / NOT FINALIZED / NOT FOR RESIDENT ISSUE. Saving alone does not mark a unit ready. Normal Mark ready requires the separate tech and final checks, an inspection date, confirmed handoff counts and no outstanding findings/corrections. Manager/admin completion overrides remain explicitly separate from inspection evidence.

**Save and send corrections to technician** records internal findings, notifies the assigned active technician, and creates a correction assignment in My Work. It reopens technician repairs but retains painting/cleaning statuses. The technician records a resolution in Work, then marks repairs Done; the previous eligible inspector receives the recheck. The inspector must recheck findings and confirm handoff before approval. Internal request/resolution text and legacy follow-up text do not print on resident reports. The report endpoint cannot overwrite technician preparation evidence.

Legacy check IDs remain readable in saved drafts/backups and old-only report previews; they are not silently relabeled or counted as completion of the new checks. New browser preferences default to compact light mode without replacing existing saved choices.

The report uses two printed columns on Letter paper, bounded logos and escaped text. PDFs are rendered server-side with external resource requests blocked. If actual content exceeds one printable page, download returns 422 rather than clipping notes. Browser preview has its own scrollable page area; the server's measured PDF fit check is authoritative.

Drafts live in the separate `FinalWalkReportDraft` table so ordinary board API responses do not expose their handoff details. Property wording/style is in `PropertyBranding.finalWalkReportSettings`. PostgreSQL and native JSON backups preserve both, with import defaulting missing fields for older backups. Existing matching items/branding are retained under normal merge rules rather than overwritten. Draft edit audit entries record actor/turn/revision without copying handoff text into the audit log.

Migration: `20260907233000_final_walk_report_drafts`.

Endpoints:
- GET `/api/final-walk-reports/:propertyId?itemId=...`
- PUT `/api/final-walk-reports/:propertyId/settings`
- PUT `/api/final-walk-reports/:propertyId/items/:itemId`
- POST `/api/final-walk-reports/:propertyId/items/:itemId/return-to-tech`
- POST `/api/final-walk-reports/:propertyId/preview` (`html` or base64-encoded `pdf` response)

## Still Separate

Verified signed/immutable issued revisions and encrypted/expiring code delivery remain separate work. Saved resident codes are sensitive plaintext within access-controlled drafts and privileged native/database backups, not a secrets vault. New editor copy is English; Spanish localization remains a follow-up alongside the branding editor.

## Verification

Local API/web builds, lint, four domain/permission tests and the isolated Docker browser integration pass. Browser coverage includes actual saved logos, draft reloads, stale-edit conflicts, cross-property rejection, one-page PDF output, long-content rejection, mobile overflow and native backup/restore.

Production migration applied successfully after verified database backup `makereadyos-db-20260907-195137.dump` and uploads backup `makereadyos-uploads-20260907-195138.tgz`. Previous API/web images are tagged `rollback-5f26967`. Live preview loaded both saved TA branding images, downloaded a one-page Letter PDF and passed desktop/mobile overflow checks without saving inspection drafts or settings.
